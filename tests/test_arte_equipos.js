/* Prueba del arte de los equipos (js/art.js → Art.item) en un celular de 390x844 con Playwright.
   - Dibuja TODOS los equipos del catálogo: sin errores, SVG válido, nunca vacío.
   - Cada clase de cámara tiene su propio dibujo (acción, bolsillo con gimbal, POV, celular, camcorder, hombro, cine, PTZ,
     estudio, sistema, dron...): se compara el SVG de cada clase.
   - En otras categorías, los productos de distinto tipo tampoco comparten dibujo (lentes, soportes, switchers, micrófonos...).
   - Ningún texto del dibujo lleva marcas (ni las reales ni las parodia del catálogo).
   - Equipos desconocidos: siempre un dibujo sensato.
   - Hojas de contacto por categoría: tests/capturas/arte_<categoria>.png (todos los equipos con su nombre debajo)
     y la tienda real (Bodega → Tienda de equipos → Cámaras): tests/capturas/arte_tienda_camaras.png
   Uso:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=/opt/npm-tools/node_modules node tests/test_arte_equipos.js */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
let fallas = 0, aciertos = 0;
function bien(c, msg) { if (c) { aciertos++; console.log('✅', msg); } else { fallas++; console.error('❌', msg); } }

// Marcas (reales y parodia del catálogo) que nunca pueden aparecer escritas dentro de un dibujo
const MARCAS = ['zony', 'sony', 'kanon', 'canon', 'panasonika', 'panasonic', 'blackmagia', 'blackmagic', 'jvk', 'jvc', 'fantomas', 'phantom', 'marchall', 'marshall',
  'gopra', 'gopro', 'dgi', 'dji', 'osmo', 'manfrotti', 'manfrotto', 'vinter', 'vinten', 'steadikam', 'steadicam', 'estabilio', 'proeme', 'vmax', 'vmix', 'rosco', 'rozz', 'ross', 'glass valley',
  'kayena', 'kayenne', 'trikaster', 'tricaster', 'evx', 'evs', 'kasparcg', 'casparcg', 'vizart', 'vizrt', 'yamaka', 'yamaha', 'mydas', 'midas', 'behringa', 'behringer',
  'kalrek', 'calrec', 'shur', 'shure', 'sennhauser', 'sennheiser', 'roade', 'rode', 'hollyband', 'hollyland', 'clearkom', 'clearcom', 'kilovista', 'kiloview', 'liveyou',
  'liveu', 'netgir', 'netgear', 'terradek', 'teradek', 'apz', 'apc', 'jonda', 'honda', 'pelikano', 'pelican', 'sprinto', 'sprinter', 'atom', 'atem', 'urso', 'ursa', 'fujinox', 'fujinon'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errores.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?fecha=2026-11-10';
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Art && window.Game && window.Game.CATALOG);

  /* ---------- 1. Todos los equipos se dibujan ---------- */
  const res = await page.evaluate((MARCAS) => {
    const G = window.Game, A = window.Art, out = { items: {}, errores: [] };
    const parser = new DOMParser();
    const revisar = (k, svg) => {
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      const raiz = doc.documentElement;
      const ok = raiz && raiz.nodeName === 'svg' && !doc.querySelector('parsererror');
      const formas = ok ? raiz.querySelectorAll('rect,path,circle,ellipse,polygon,line').length : 0;
      const textos = ok ? Array.from(raiz.querySelectorAll('text')).map((t) => t.textContent.toLowerCase()) : [];
      const marca = textos.find((t) => MARCAS.some((m) => new RegExp('(^|[^a-z])' + m + '($|[^a-z])').test(t)));
      return { ok, formas, marca: marca || null, largo: svg.length };
    };
    Object.keys(G.CATALOG).forEach((k) => {
      try {
        const svg = A.item(k, 110);
        // Firma del dibujo sin la rareza ni el nombre (para comparar clases entre sí)
        const firma = A.item(k, 110, { rarity: 'comun', label: 'x' }).replace(/\sdata-sub="[^"]*"/, '');
        out.items[k] = Object.assign(revisar(k, svg), { cat: G.CATALOG[k].cat, subtipo: G.CATALOG[k].subtipo, dib: A.subtipo(k), firma, nombre: G.CATALOG[k].name });
      } catch (e) { out.errores.push(k + ': ' + e.message); }
    });
    // Equipos desconocidos o raros: nunca vacío ni error
    out.raros = [['cosa_rara_xyz'], [''], [null], [undefined], ['zzz', 96, { cat: 'lens' }], ['zzz2', 96, { cat: 'support' }], ['zzz3', 96, { subtipo: 'no_existe' }],
      ['zzz4', 96, { cat: 'cam' }], ['zzz5', 96, { cat: 'vehicle' }], ['zzz6', 96, { cat: 'graphics' }], ['zzz7', 96, { cat: 'wireless' }], ['dron4k'], ['creditos_700'], ['vip30'], ['inicio']]
      .map((args) => { try { const svg = A.item.apply(null, args); return Object.assign(revisar(String(args[0]), svg), { args: JSON.stringify(args) }); } catch (e) { return { ok: false, formas: 0, args: JSON.stringify(args), err: e.message }; } });
    return out;
  }, MARCAS);
  const items = res.items, claves = Object.keys(items);
  bien(!res.errores.length, `Art.item no lanza errores con ${claves.length} equipos` + (res.errores.length ? ': ' + res.errores.join(' | ') : ''));
  const malos = claves.filter((k) => !items[k].ok || items[k].formas < 8);
  bien(!malos.length, 'Todos los dibujos son SVG válidos y no vacíos' + (malos.length ? ': ' + malos.join(', ') : ''));
  const conMarca = claves.filter((k) => items[k].marca);
  bien(!conMarca.length, 'Ningún dibujo lleva marcas escritas' + (conMarca.length ? ': ' + conMarca.map((k) => k + '→' + items[k].marca).join(', ') : ''));
  const raros = res.raros.filter((r) => !r.ok || r.formas < 6);
  bien(!raros.length, 'Equipos desconocidos: siempre un dibujo sensato' + (raros.length ? ': ' + raros.map((r) => r.args + (r.err ? ' ' + r.err : '')).join(', ') : ''));
  const pesado = claves.filter((k) => items[k].largo > 16000);
  bien(!pesado.length, 'Los SVG son livianos (< 16 KB cada uno)' + (pesado.length ? ': ' + pesado.map((k) => k + ' ' + items[k].largo).join(', ') : ''));

  /* ---------- 2. Cada clase de cámara se ve distinta ---------- */
  const firmaDe = (sub) => { const k = claves.find((x) => items[x].subtipo === sub && items[x].cat === 'cam'); return k ? items[k].firma : null; };
  const CLASES = ['accion', 'gimbal_compacta', 'pov', 'celular', 'camcorder_consumo', 'camcorder_pro', 'eng_hombro', 'cine', 'ptz', 'ptz_broadcast', 'estudio_ligera', 'sistema', 'ultra_movimiento', 'dron'];
  const vistas = new Map();
  const choques = [];
  CLASES.forEach((c) => { const f = firmaDe(c); if (!f) { choques.push(c + ' (no está en el catálogo)'); return; } if (vistas.has(f)) choques.push(c + ' = ' + vistas.get(f)); else vistas.set(f, c); });
  bien(!choques.length, `Cámaras: ${CLASES.length} clases con ${vistas.size} dibujos distintos` + (choques.length ? ' — iguales: ' + choques.join(', ') : ''));
  const camDibs = new Set(claves.filter((k) => items[k].cat === 'cam').map((k) => items[k].dib));
  bien(camDibs.size >= 12, `Cámaras: ${camDibs.size} tipos de dibujo (${[...camDibs].join(', ')})`);
  const esperado = { cam_gopra_heroe13: 'action_cam', cam_dgi_osmo_bolsillo_3: 'pocket_gimbal', cam_marchall_cv513_pov: 'pov_cam', cam_celular_gimbal: 'phone_gimbal',
    cam_basic: 'handycam', cam_pro: 'camcorder', cam_blackmagia_urso_broadcast_g3: 'eng', cam_zony_fz6_cine: 'cine', cam_panasonika_aw_uv22: 'ptz', dron_dgi_micro_4_pro: 'drone' };
  const mal = Object.keys(esperado).filter((k) => items[k] && items[k].dib !== esperado[k]);
  bien(!mal.length, 'Cámaras clave con el dibujo correcto' + (mal.length ? ': ' + mal.map((k) => `${k}=${items[k].dib} (esperado ${esperado[k]})`).join(', ') : ''));

  /* ---------- 3. Otras categorías: tipos distintos, dibujos distintos ---------- */
  const PARES = [['lens', 'lente_mft', 'lente_box'], ['lens', 'lente_cine', 'lente_eng'], ['lens', 'lente_eng', 'lente_box'], ['lens', 'adaptador_lente_box', 'lente_box'],
    ['support', 'tripode', 'gimbal'], ['support', 'gimbal', 'steadicam'], ['support', 'tripode', 'dolly'], ['support', 'jib', 'dolly'], ['support', 'tripode_fluido', 'soporte_pesado'],
    ['switcher', 'software', 'mini_hdmi'], ['switcher', 'mini_hdmi', 'sdi_me'], ['switcher', 'sdi', 'grande_me'],
    ['mics', 'dinamico', 'inalambrico'], ['mics', 'corbatero', 'shotgun'], ['mics', 'shotgun', 'diadema_comentarista'], ['mics', 'inalambrico', 'corbatero'],
    ['graphics', 'software', 'cg_ar'], ['monitor', 'multiviewer', 'referencia'], ['encoder', 'encoder_hw', 'bonding'], ['wireless', 'tx_video', 'tx_video'],
    ['power', 'ups', 'generador_portatil'], ['vehicle', 'camioneta', 'ob_chica'], ['vehicle', 'ob_chica', 'ob_grande'],
    ['service', 'camara_aerea_cables', 'riel'], ['service', 'riel', 'grua'], ['cable', 'conversor_fibra', 'cable_fibra_smpte'], ['replay', 'software', 'servidor_broadcast'], ['intercom', 'inalambrico', 'inalambrico_digital']];
  const iguales = [];
  PARES.forEach(([cat, a, b]) => {
    if (a === b) return; // solo para listar la categoría
    const ka = claves.find((k) => items[k].cat === cat && items[k].subtipo === a), kb = claves.find((k) => items[k].cat === cat && items[k].subtipo === b);
    if (ka && kb && items[ka].dib === items[kb].dib) iguales.push(`${cat}: ${a}/${b} → ${items[ka].dib}`);
  });
  bien(!iguales.length, 'Otras categorías: cada tipo de producto con su dibujo' + (iguales.length ? ' — iguales: ' + iguales.join(', ') : ''));
  const fueraDeLugar = claves.filter((k) => items[k].dib === 'case' && items[k].cat !== 'case');
  bien(!fueraDeLugar.length, 'Solo las maletas se dibujan como maleta' + (fueraDeLugar.length ? ': ' + fueraDeLugar.join(', ') : ''));

  /* ---------- 4. Hojas de contacto por categoría ---------- */
  const cats = [...new Set(claves.map((k) => items[k].cat))];
  await page.evaluate(() => {
    document.body.querySelectorAll(':scope > *:not(#art-shared-defs)').forEach((n) => { n.style.display = 'none'; });
    const st = document.createElement('style');
    st.textContent = '#hoja{display:block!important;background:#0b0e14;padding:12px;width:390px;box-sizing:border-box;font-family:"IBM Plex Sans",system-ui,sans-serif}'
      + '#hoja h2{color:#e9edf5;font:700 18px "Barlow Condensed",sans-serif;margin:0 0 10px}#hoja .g{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}'
      + '#hoja .c{background:#151a24;border:1px solid #232a38;border-radius:10px;padding:6px 4px;text-align:center}#hoja .c svg{width:100%;height:auto;max-width:110px}'
      + '#hoja .n{color:#cfd5dd;font-size:9.5px;line-height:1.2;margin-top:2px}#hoja .s{color:#6b7487;font:9px "JetBrains Mono",monospace}';
    document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'hoja'; document.body.appendChild(d);
  });
  for (const cat of cats) {
    await page.evaluate((cat) => {
      const G = window.Game, A = window.Art;
      const ks = Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].cat === cat).sort((a, b) => G.CATALOG[a].price - G.CATALOG[b].price);
      const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      document.getElementById('hoja').innerHTML = `<h2>${esc(cat)} · ${ks.length}</h2><div class="g">${ks.map((k) => `<div class="c">${A.item(k, 110)}<div class="n">${esc(G.CATALOG[k].name)}</div><div class="s">${esc(G.CATALOG[k].subtipo)} → ${esc(A.subtipo(k))}</div></div>`).join('')}</div>`;
    }, cat);
    await page.waitForTimeout(50);
    await page.locator('#hoja').screenshot({ path: path.join(OUT, `arte_${cat}.png`), animations: 'disabled' });
  }
  console.log('Hojas de contacto: ' + cats.map((c) => `tests/capturas/arte_${c}.png`).join(', '));

  /* ---------- 5. La tienda real: Bodega → Tienda de equipos → Cámaras ---------- */
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errores.push('pageerror (tienda): ' + e.message));
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p2.addInitScript(() => { try { localStorage.setItem('envivo_guia_v1', '"hecha"'); } catch (e) { /* nada */ } });
  await p2.goto(url, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => window.__game && window.__game.state);
  for (let k = 0; k < 4; k++) { const b = p2.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-dia"], #overlay.on [data-act="close-story"]'); if (await b.count()) await b.first().click().catch(() => {}); else break; await p2.waitForTimeout(150); }
  await p2.evaluate(() => { const s = window.__game.state; s.rep = 99; s.money = 999999; });
  await p2.click('nav button[data-tab="bodega"]');
  await p2.click('#tab-bodega .subnav [data-k="tienda"]');   // navegación v2: la tienda es una sub-pestaña de la Bodega
  const cat = p2.locator('[data-act="cat"][data-k="cam"]');
  if (await cat.count()) await cat.first().click();
  await p2.waitForTimeout(300);
  const enTienda = await p2.evaluate(() => Array.from(document.querySelectorAll('.gear.shopc .itemart')).map((s) => s.getAttribute('data-sub')));
  bien(enTienda.length >= 19 && new Set(enTienda).size >= 12, `Tienda (Cámaras): ${enTienda.length} tarjetas con ${new Set(enTienda).size} dibujos distintos`);
  const primera = p2.locator('.gear.shopc').first();
  if (await primera.count()) await primera.scrollIntoViewIfNeeded();
  await p2.screenshot({ path: path.join(OUT, 'arte_tienda_camaras.png') });
  await p2.mouse.wheel(0, 900); await p2.waitForTimeout(200);
  await p2.screenshot({ path: path.join(OUT, 'arte_tienda_camaras_2.png') });
  await p2.mouse.wheel(0, 900); await p2.waitForTimeout(200);
  await p2.screenshot({ path: path.join(OUT, 'arte_tienda_camaras_3.png') });

  bien(!errores.length, 'Sin errores de JS en la página' + (errores.length ? ': ' + errores.slice(0, 5).join(' | ') : ''));
  await browser.close();
  console.log(`\n${aciertos} bien, ${fallas} mal`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
