/* Prueba de la traducción de los textos del juego (TEXTOS de js/datos.js → js/lang/juego/<código>.js).
   1) Diccionarios (Node): cada clave de TEXTOS existe en cada idioma, sin textos vacíos ni claves sobrantes,
      con los mismos {marcadores} y solo categorías de plural que el idioma tiene; ningún texto igual al
      español salvo nombres propios / marcas / tecnicismos de una lista corta; las marcas parodia y los
      nombres de personas quedan sin traducir; en zh-CN no hay frases solo en letras latinas (salvo marcas);
      no hay letras de otro alfabeto metidas por error (cirílico fuera de ru, chino fuera de zh-CN).
   2) Motor (Node): I18N.juego rellena {parámetros}, elige plurales, devuelve null en español o sin clave,
      y Game.setTraductor(I18N.juego) rearma nombres de catálogo, eventos, roles y capítulos.
   3) Navegador (Playwright, servidor local): index.html + js/lang/juego/en.js y de.js (carga perezosa con
      I18N.setIdioma; si no llegan, se inyectan), Game.CATALOG y Game.EVENT_TYPES salen traducidos y no hay
      errores; si falla la descarga del idioma, se queda en español.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_traduccion_juego.js */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
let fallas = 0;
const ok = (c, m) => { if (!c) { fallas++; console.log('  ✘ ' + m); } return c; };

const CODES = ['en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];

// Textos que son solo marca/modelo (nombres propios): pueden quedar iguales al español en todos los idiomas
const SOLO_MARCA = [
  'item.cam_basic.nombre', 'item.cam_pro.nombre', 'item.cam_panasonika_aw_uv22.nombre', 'item.cam_blackmagia_estudio_4k_g3.nombre',
  'item.cam_cine.nombre', 'item.cam_jvk_gy_hk560.nombre', 'item.cam_zony_fz6_cine.nombre', 'item.cam_blackmagia_urso_broadcast_g3.nombre',
  'item.cam_panasonika_aw_uv170.nombre', 'item.cam_zony_pxv_z760.nombre', 'item.cam_fantomas_vio4k.nombre', 'item.cam_gopra_heroe13.nombre',
  'item.cam_dgi_osmo_bolsillo_3.nombre', 'item.lente_zony_gm_24_75.nombre', 'item.lente_kanon_kx21x8_2.nombre', 'item.lente_kanon_cx25ex7_5.nombre',
  'item.lente_box_kanon_digisupra_88.nombre', 'item.lente_box_fujinox_ux108x.nombre', 'item.lente_box_kanon_uhd_digisupra_125.nombre',
  'item.sw_blackmagia_atom_mini_pro.nombre', 'item.sw_blackmagia_atom_mini_extremo_iso_g3.nombre', 'item.sw_blackmagia_atom_tv_estudio_hd9_iso.nombre',
  'item.rep_trikaster_3jugadas.nombre', 'item.rep_evx_xt_nano.nombre', 'item.gfx_rosco_xpresion_go.nombre', 'item.mon_blackmagia_multivista_16.nombre',
  'item.audio_basic.nombre', 'item.encoder.nombre', 'item.enc_liveyou_solo_pro.nombre', 'item.router4g.nombre', 'item.tx_terradek_rayo_6.nombre',
  'item.ups.nombre',
];
// Tecnicismos que se dicen igual (PTZ, Junior, Senior) y coincidencias reales de cada idioma
const IGUAL_TODOS = ['pos.prensa.abierta_ptz.ideal', 'pos.internacional_host.comcam.ideal', 'nivel.junior', 'nivel.senior',
  // Nombres de países que se escriben igual en varios idiomas
  'pais.argentina', 'pais.chile', 'pais.colombia', 'pais.mexico', 'pais.estados_unidos', 'pais.peru'];
const IGUAL_IDIOMA = {
  en: ['cat.switcher', 'item.sop_gimbal_dgi_rz4_pro.nombre'],
  'pt-BR': ['nivel.internacional', 'cap.0.prog', 'req.box2', 'req.bonding'],
  de: ['cat.intercom'],
  it: ['cap.5.fama'],
};
// En zh-CN, textos sin ningún carácter chino permitidos (marcas y la sigla PTZ)
const ZH_LATIN_OK = SOLO_MARCA.filter((k) => !/^item\.(lente_kanon_kx21x8_2|lente_kanon_cx25ex7_5|lente_box_|enc_liveyou_solo_pro|router4g|ups)\./.test(k))
  .concat(['pos.prensa.abierta_ptz.ideal', 'pos.internacional_host.comcam.ideal']);
// Marcas parodia y personas: si están en el español, tienen que estar igual en la traducción
const PROTEGIDOS = ['MegaVisión', 'LigaPrima', 'Don Ramiro', 'Don Aurelio', 'Lucía Mena', 'Germán Vélez', 'ATOM 2 M/E',
  'Kanon', 'Zony', 'Blackmagia', 'Panasonika', 'JVK', 'Fantomas', 'Marchall', 'GoPra', 'DGI', 'Fujinox', 'Manfrotti', 'Vinter',
  'Steadikam', 'Estabilio', 'Proeme', 'vMax', 'Rozz', 'Glass Valley', 'TriKaster', 'EVX', 'KasparCG', 'Vizart', 'Yamaka', 'Mydas', 'Behringa',
  'Kalrek', 'Shur', 'Sennhauser', 'Roade', 'Hollyband', 'ClearKom', 'Kilovista', 'LiveYou', 'NetGir', 'Terradek', 'APZ', 'Jonda',
  'Kummins', 'Pelikano', 'Sprinto'];

/* ---------- 1) Diccionarios ---------- */
console.log('1) Diccionarios');
const T = require('../js/datos.js').TEXTOS;
globalThis.I18N_LANG = {};
const I18N = require('../js/i18n.js');
require('../js/lang/es.js');
for (const c of CODES) {
  const f = path.join(ROOT, 'js', 'lang', 'juego', c + '.js');
  if (ok(fs.existsSync(f), `falta js/lang/juego/${c}.js`)) require(f);
}
const J = globalThis.I18N_JUEGO || {};
const claves = Object.keys(T);
const marc = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join(',');
const variantes = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v) : []);
const sinMarcadores = (s) => String(s).replace(/\{\w+\}/g, '');
const tieneLetras = (s) => /\p{L}/u.test(sinMarcadores(s));
const CJK = /[㐀-鿿豈-﫿]/;
const CIRILICO = /[Ѐ-ӿ]/;
const totales = {};
for (const c of CODES) {
  const d = J[c];
  if (!ok(d && typeof d === 'object', `${c}: el archivo no registra el diccionario (I18N.registrarJuego / I18N_JUEGO['${c}'])`)) continue;
  const locale = I18N.idiomas.find((l) => l.code === c).locale;
  const cats = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  const iguales = new Set([...SOLO_MARCA, ...IGUAL_TODOS, ...(IGUAL_IDIOMA[c] || [])]);
  let buenas = 0;
  for (const k of claves) {
    const v = d[k];
    const vs = variantes(v);
    if (!ok(vs.length && vs.every((x) => typeof x === 'string' && x.trim()), `${c}: "${k}" falta o está vacío`)) continue;
    let bien = true;
    for (const x of vs) {
      if (!ok(marc(x) === marc(T[k]), `${c}: "${k}" marcadores ${marc(x) || '-'} ≠ ${marc(T[k]) || '-'}`)) bien = false;
      for (const p of PROTEGIDOS) if (T[k].includes(p) && !ok(x.includes(p), `${c}: "${k}" debe mantener "${p}": ${x}`)) bien = false;
      if (c !== 'ru' && !ok(!CIRILICO.test(x), `${c}: "${k}" tiene letras cirílicas: ${x}`)) bien = false;
      if (c !== 'zh-CN' && !ok(!CJK.test(x), `${c}: "${k}" tiene caracteres chinos: ${x}`)) bien = false;
      if (c === 'zh-CN' && /[A-Za-z]/.test(sinMarcadores(x)) && !CJK.test(x) && !ok(ZH_LATIN_OK.includes(k), `zh-CN: "${k}" está solo en letras latinas: ${x}`)) bien = false;
    }
    if (v && typeof v === 'object') {
      if (!ok(typeof v.other === 'string', `${c}: "${k}" es plural y le falta "other"`)) bien = false;
      for (const cat of Object.keys(v)) if (!ok(cats.includes(cat), `${c}: "${k}" usa el plural "${cat}" que ${c} no tiene`)) bien = false;
    }
    if (typeof v === 'string' && v === T[k] && tieneLetras(v) && !ok(iguales.has(k), `${c}: "${k}" quedó igual al español: ${v}`)) bien = false;
    if (bien) buenas++;
  }
  for (const k of Object.keys(d)) ok(k in T, `${c}: clave sobrante "${k}"`);
  totales[c] = buenas;
  console.log(`  ${c}: ${buenas}/${claves.length} claves`);
}
// Las listas de excepciones no deben esconder textos que ya no son marcas
for (const k of [...SOLO_MARCA, ...IGUAL_TODOS, ...Object.values(IGUAL_IDIOMA).flat()]) ok(k in T, `la excepción "${k}" no existe en TEXTOS`);

/* ---------- 2) Motor ---------- */
console.log('2) Motor (I18N.juego + Game.setTraductor)');
I18N.setIdioma('es');
ok(I18N.juego('ev.boda') === null, 'en español I18N.juego devuelve null (la lógica usa TEXTOS)');
I18N.setIdioma('en');
ok(I18N.juego('ev.boda') === 'Wedding', `en: ev.boda → ${I18N.juego('ev.boda')}`);
ok(I18N.juego('pos.extra', { n: 2 }) === 'Extra camera 2', `en: {n} se rellena (${I18N.juego('pos.extra', { n: 2 })})`);
ok(I18N.juego('log.vencieron', { n: 1 }).startsWith('1 offer ') && I18N.juego('log.vencieron', { n: 3 }).startsWith('3 offers '), 'en: plurales');
ok(I18N.juego('clave.que.no.existe') === null, 'clave inexistente → null');
I18N.setIdioma('ru');
const ru = [1, 3, 5].map((n) => I18N.juego('log.olvido', { n }));
ok(/1 день/.test(ru[0]) && /3 дня/.test(ru[1]) && /5 дней/.test(ru[2]), `ru: plurales (${ru.map((x) => x.slice(0, 14)).join(' | ')})`);
{
  const G = require('../js/logic.js');
  const es = { item: G.CATALOG.cam_cine.name, ev: G.EVENT_TYPES.boda.name, rol: G.ROLES.sonidista.name, cap: G.CHAPTERS[0].title };
  I18N.setIdioma('de');
  G.setTraductor(I18N.juego);
  ok(G.EVENT_TYPES.boda.name === 'Hochzeit', `de: Game.EVENT_TYPES.boda → ${G.EVENT_TYPES.boda.name}`);
  ok(G.ROLES.sonidista.name === J.de['rol.sonidista.nombre'], `de: Game.ROLES.sonidista → ${G.ROLES.sonidista.name}`);
  ok(G.CHAPTERS[0].title === J.de['cap.0.title'], `de: capítulo 1 → ${G.CHAPTERS[0].title}`);
  ok(G.CATALOG.veh_camioneta_carga.name === J.de['item.veh_camioneta_carga.nombre'] && G.CATALOG.veh_camioneta_carga.desc === J.de['item.veh_camioneta_carga.desc'], `de: Game.CATALOG.veh_camioneta_carga → ${G.CATALOG.veh_camioneta_carga.name}`);
  ok(G.CATALOG.cam_cine.name === es.item, 'las marcas solas quedan igual');
  I18N.setIdioma('es');
  G.setTraductor(I18N.juego);
  ok(G.EVENT_TYPES.boda.name === es.ev && G.ROLES.sonidista.name === es.rol && G.CHAPTERS[0].title === es.cap, 'al volver a español, todo vuelve a TEXTOS');
}

/* ---------- 3) Navegador ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
function servidor() {
  return new Promise((res) => {
    const srv = http.createServer((req, resp) => {
      const p = decodeURIComponent((req.url || '/').split('?')[0]);
      const f = path.join(ROOT, p === '/' ? 'index.html' : p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.writeHead(404); return resp.end(); }
      resp.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(resp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.log('Playwright no está instalado: se salta la parte del navegador'); return fin(); }
  console.log('3) Navegador');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const enHtml = /js\/lang\/juego\//.test(html.replace(/<!--[\s\S]*?-->/g, ''));
  console.log(`  index.html ${enHtml ? 'incluye' : 'no incluye'} <script> de js/lang/juego/ (${enHtml ? 'carga directa' : 'se cargan al elegir el idioma'})`);
  const srv = await servidor();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const nueva = async () => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, locale: 'es-EC', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push('console: ' + m.text()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    return { ctx, page, errores };
  };

  for (const code of ['en', 'de']) {
    const { ctx, page, errores } = await nueva();
    const pedidos = [];
    page.on('request', (r) => { if (/\/js\/lang\//.test(r.url())) pedidos.push(r.url().replace(base, '')); });
    await page.goto(base + 'index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.Game && window.I18N);
    const r = await page.evaluate(async (code) => {
      const espanol = { cat: {}, ev: {} };
      Object.keys(Game.CATALOG).forEach((k) => { espanol.cat[k] = Game.CATALOG[k].name; });
      Object.keys(Game.EVENT_TYPES).forEach((k) => { espanol.ev[k] = Game.EVENT_TYPES[k].name; });
      I18N.setIdioma(code);
      await I18N.listo;
      // Si el juego en este idioma no llegó por la carga perezosa, se inyecta el archivo
      let inyectado = false;
      if (!(window.I18N_JUEGO && window.I18N_JUEGO[code])) {
        inyectado = true;
        await new Promise((res) => { const s = document.createElement('script'); s.src = 'js/lang/juego/' + code + '.js'; s.onload = s.onerror = res; document.head.appendChild(s); });
      }
      Game.setTraductor(I18N.juego);
      const J = (window.I18N_JUEGO || {})[code] || {};
      const cat = Object.keys(Game.CATALOG).map((k) => ({ k, es: espanol.cat[k], v: Game.CATALOG[k].name, esperado: J['item.' + k + '.nombre'] }));
      const ev = Object.keys(Game.EVENT_TYPES).map((k) => ({ k, es: espanol.ev[k], v: Game.EVENT_TYPES[k].name, esperado: J['ev.' + k] }));
      return { idioma: I18N.idioma, lang: document.documentElement.lang, inyectado, hayJuego: !!Object.keys(J).length, cat, ev };
    }, code);
    ok(r.idioma === code && r.lang === code, `${code}: I18N.idioma=${r.idioma}, <html lang>=${r.lang}`);
    ok(r.hayJuego, `${code}: js/lang/juego/${code}.js registrado en el navegador${r.inyectado ? ' (inyectado por la prueba)' : ''}`);
    if (!enHtml && !r.inyectado) ok(pedidos.some((u) => u.endsWith('lang/juego/' + code + '.js')), `${code}: se pidió js/lang/juego/${code}.js por carga perezosa`);
    const conTexto = r.cat.filter((x) => x.esperado !== undefined);
    const malCat = conTexto.filter((x) => x.v !== (typeof x.esperado === 'string' ? x.esperado : x.v));
    const sinCambio = conTexto.filter((x) => x.v === x.es && !SOLO_MARCA.includes('item.' + x.k + '.nombre') && !(IGUAL_IDIOMA[code] || []).includes('item.' + x.k + '.nombre'));
    ok(conTexto.length >= 90, `${code}: ${conTexto.length} equipos del catálogo tienen texto en TEXTOS`);
    ok(!malCat.length, `${code}: Game.CATALOG con el nombre traducido${malCat.length ? ' — mal: ' + malCat.slice(0, 3).map((x) => x.k + '=' + x.v).join(', ') : ''}`);
    ok(!sinCambio.length, `${code}: ningún equipo quedó en español${sinCambio.length ? ' — ' + sinCambio.slice(0, 3).map((x) => x.v).join(', ') : ''}`);
    const malEv = r.ev.filter((x) => x.v !== x.esperado || x.v === x.es);
    ok(r.ev.length >= 10 && !malEv.length, `${code}: Game.EVENT_TYPES traducidos (${r.ev.length})${malEv.length ? ' — mal: ' + malEv.slice(0, 3).map((x) => x.k + '=' + x.v).join(', ') : ''}`);
    console.log(`  ${code}: catálogo ${conTexto.length - malCat.length}/${conTexto.length}, eventos ${r.ev.length - malEv.length}/${r.ev.length}, p. ej. “${r.ev.find((x) => x.k === 'boda').v}”, “${(r.cat.find((x) => x.k === 'veh_camioneta_carga') || {}).v}”`);
    // Al volver a español vuelve todo a TEXTOS
    const vuelta = await page.evaluate(async () => { I18N.setIdioma('es'); await I18N.listo; Game.setTraductor(I18N.juego); return Game.EVENT_TYPES.boda.name; });
    ok(vuelta === 'Boda', `${code}: al volver a español, “${vuelta}”`);
    ok(!errores.length, `${code}: sin errores de JS${errores.length ? ': ' + errores.join(' | ') : ''}`);
    await ctx.close();
  }

  // Arranque con un idioma guardado: se muestra español y se cambia cuando llegan los diccionarios
  {
    const { ctx, page, errores } = await nueva();
    await page.addInitScript(() => { try { localStorage.setItem('envivo_lang', 'de'); } catch (e) { /* nada */ } });
    await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.I18N && window.Game);
    const r = await page.evaluate(async () => { await I18N.listo; return { idioma: I18N.idioma, boda: Game.EVENT_TYPES.boda.name }; });
    ok(r.idioma === 'de', `arranque con "de" guardado → I18N.idioma=${r.idioma}`);
    ok(r.boda === 'Hochzeit', `arranque con "de": la interfaz enlaza el traductor del juego (Game.EVENT_TYPES.boda=${r.boda})`);
    ok(!errores.length, `arranque con "de": sin errores de JS${errores.length ? ': ' + errores.join(' | ') : ''}`);
    await ctx.close();
  }

  // Si la descarga del idioma falla, se queda en español sin romperse
  {
    const { ctx, page, errores } = await nueva();
    await page.route(/\/js\/lang\/(juego\/)?it\.js$/, (r) => r.abort());
    await page.goto(base + 'index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.I18N && window.Game);
    const r = await page.evaluate(async () => {
      if (window.I18N_LANG && window.I18N_LANG.it) return { saltar: true };
      I18N.setIdioma('it');
      const durante = I18N.idioma;
      await I18N.listo;
      return { durante, despues: I18N.idioma, lang: document.documentElement.lang, juego: I18N.juego('ev.boda') };
    });
    if (r.saltar) console.log('  (it ya venía en la página: se salta la prueba de descarga fallida)');
    else {
      ok(r.durante === 'es', `mientras carga, sigue en español (${r.durante})`);
      ok(r.despues === 'es' && r.lang === 'es' && r.juego === null, `si falla la descarga, se queda en español (${r.despues}, <html lang>=${r.lang})`);
    }
    ok(!errores.length, `descarga fallida: sin errores de JS${errores.length ? ': ' + errores.join(' | ') : ''}`);
    await ctx.close();
  }

  await browser.close();
  srv.close();
  fin();
})().catch((e) => { console.error('❌', e); process.exit(1); });

function fin() {
  if (fallas) { console.error(`\n❌ ${fallas} fallas`); process.exit(1); }
  console.log(`\n✅ Textos del juego OK (${CODES.length} idiomas × ${claves.length} claves: ${CODES.map((c) => c + ' ' + totales[c]).join(', ')})`);
}
