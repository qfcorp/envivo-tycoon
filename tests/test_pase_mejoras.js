/* Prueba de las MEJORAS del Pase de Temporada (js/pase.js, rama pase-mejoras) en un celular simulado (390x844) con Playwright.
   Servidor FALSO (fetch interceptado) con los campos nuevos de GET /api/pase (server/INTEGRAR_PASE.md "Mejoras"): mini,
   al_dia, banco, temporada.visual, misiones[].alt/via/juntos, pistas premium con mini/solo_premium.
   Revisa: candado con el premio premium en la fila gratis, Mini Pase Semanal (comprar, activo, reclamar con él), tema visual,
   alternativa sin conexión de las misiones, ponerse al día, banco de premios (abrir cofres), ícono de sede (aplicarCosmeticos +
   js/art.js), que con premium no salga nada de eso, que no se desborde y que no haya errores de JS. También que todos los
   textos "pasem.*" que usa js/pase.js estén en js/lang/es.js.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_pase_mejoras.js   (capturas en tests/capturas/pasem_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const BASE = 'http://pasem.prueba';
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const html = leer('index.html');
const estilos = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);

let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };
async function captura(page, opts) {
  for (let i = 0; i < 4; i++) { try { await page.screenshot(opts); return; } catch (e) { await new Promise((r) => setTimeout(r, 400 * (i + 1))); } }
  console.log('  (captura omitida: ' + (opts && opts.path) + ')');
}

/* ---------- Textos: lo que usa pase.js está en es.js ---------- */
console.log('Textos (solo español, js/lang/es.js)');
const src = leer('js/pase.js');
const usadas = [...new Set([...src.matchAll(/\btm\('([a-z0-9_]+)'/g)].map((m) => m[1]))];
global.window = undefined;
require(path.join(RAIZ, 'js', 'lang', 'es.js'));
const ES = globalThis.I18N_LANG.es;
const faltan = usadas.filter((k) => !(('pasem.' + k) in ES) && !/^err_/.test(k));
ok(usadas.length > 20 && !faltan.length, `${usadas.length} claves pasem.* usadas, todas en es.js${faltan.length ? ' (faltan: ' + faltan.join(', ') + ')' : ''}`);
ok(['pasem.err_mini_ya_activo', 'pasem.err_banco_vacio'].every((k) => k in ES), 'Errores nuevos con texto propio (mini_ya_activo, banco_vacio)');
const textosEs = Object.keys(ES).filter((k) => /^pasem\./.test(k)).map((k) => String(ES[k])).join(' ');
ok(!/FIFA|Libertadores|LigaPro|Mundial/i.test(textosEs), 'Sin nombres reales de torneos en los textos nuevos');

/* ---------- Ícono de sede: aplicarCosmeticos + js/art.js ---------- */
console.log('Ícono exclusivo de sede (nivel 40 premium)');
const Pase = require(path.join(RAIZ, 'js', 'pase.js'));
require(path.join(RAIZ, 'js', 'art.js'));
const S = {};
const ent = [{ id: 1, tipo: 'cosmetico', item: 'pase_sede_t2_navidad', cantidad: 1 }, { id: 2, tipo: 'cosmetico', item: 'pase_marco_t2', cantidad: 1 }, { id: 3, tipo: 'dinero', item: '-', cantidad: 5 }];
ok(Pase.aplicarCosmeticos(S, ent) === 1 && JSON.stringify(S.temporada.cosmeticos) === '["pase_sede_t2_navidad"]', 'Guarda solo el ícono de sede en s.temporada.cosmeticos');
ok(Pase.aplicarCosmeticos(S, ent) === 0 && S.temporada.cosmeticos.length === 1, 'Aplicarlo otra vez no lo repite');
const cs = globalThis.Art._k.cosmeticosSede(S, 180, 26);
ok(/hq-pase-sede/.test(cs.cielo) && /🎄/.test(cs.cielo), 'La sede dibuja el banderín con el tema (🎄)');
ok(!/hq-pase-sede/.test(globalThis.Art._k.cosmeticosSede({ temporada: { cosmeticos: ['arbol'] } }, 180, 26).cielo), 'Sin el ícono, no sale');
ok(/aplicarCosmeticos\(S, Api\.estado\.entregas\)/.test(leer('js/ui.js')), 'ui.js lo aplica junto con las entregas');
ok(/'pase_semanal'/.test(leer('js/ui.js').match(/const PLAY_EXTRA = \[[^\]]+\]/)[0]), 'ui.js pide a Google Play el precio de pase_semanal');

/* ---------- Servidor falso ---------- */
const R = {
  1: [['dinero', '-', 300], ['materiales', 'cables', 12]], 2: [null, ['acelerador', 'obra', 120]], 3: [['materiales', 'cables', 6], ['materiales', 'placas', 8]],
  4: [null, ['dinero', '-', 800]], 5: [['consumible', 'cable', 3], ['creditos', '-', 40]], 6: [null, ['materiales', 'paneles', 8]],
  7: [['materiales', 'placas', 5], ['acelerador', 'obra', 180]], 8: [null, ['materiales', 'credenciales', 8]], 9: [['dinero', '-', 500], ['consumible', 'battery', 5]],
  10: [null, ['cosmetico', 'marco', 1]], 11: [['materiales', 'paneles', 5], ['materiales', 'planos', 8]], 12: [null, ['creditos', '-', 50]],
  13: [['consumible', 'battery', 3], ['acelerador', 'obra', 480]], 14: [null, ['materiales', 'chips', 3]], 15: [['materiales', 'credenciales', 5], ['dinero', '-', 1500]],
  16: [null, ['materiales', 'placas', 12]], 17: [['dinero', '-', 800], ['consumible', 'cable', 8]], 18: [null, ['creditos', '-', 50]],
  19: [['materiales', 'planos', 5], ['materiales', 'paneles', 12]], 20: [null, ['cosmetico', 'deco', 1]], 21: [['consumible', 'cable', 5], ['materiales', 'credenciales', 12]],
  22: [null, ['acelerador', 'obra', 240]], 23: [['materiales', 'placas', 8], ['dinero', '-', 2000]], 24: [null, ['materiales', 'planos', 12]],
  25: [['dinero', '-', 1200], ['creditos', '-', 60]], 26: [null, ['materiales', 'chips', 4]], 27: [['materiales', 'paneles', 8], ['reparar_todo', '-', 1]],
  28: [null, ['acelerador', 'obra', 960]], 29: [['consumible', 'battery', 5], ['materiales', 'cables', 20]], 30: [null, ['cosmetico', 'titulo', 1]],
  31: [['materiales', 'credenciales', 8], ['materiales', 'placas', 15]], 32: [null, ['creditos', '-', 60]], 33: [['dinero', '-', 1500], ['materiales', 'paneles', 15]],
  34: [null, ['creditos', '-', 70]], 35: [['materiales', 'chips', 2], ['estrella', 'comodin', 5]], 36: [null, ['materiales', 'credenciales', 15]],
  37: [['materiales', 'planos', 8], ['acelerador', 'obra', 1440]], 38: [null, ['creditos', '-', 90]], 39: [['dinero', '-', 2000], ['materiales', 'chips', 6]],
  40: [['cosmetico', 'insignia', 1], ['cosmetico', 'sede', 1]],
};
const SOLO_PREMIUM = (n) => ['creditos', 'cosmetico', 'estrella'].includes(R[n][1][0]);
const AHORA = Date.parse('2026-11-24T10:00:00-05:00');
const FIN = Date.parse('2026-12-14T00:00:00-05:00');
const iso = (ms) => new Date(ms).toISOString();
function rec(n, pista) {
  const r = R[n][pista === 'premium' ? 1 : 0];
  if (!r) return null;
  if (r[0] === 'cosmetico') return { tipo: 'cosmetico', item: 'pase_' + r[1] + '_t2' + (r[1] === 'sede' ? '_navidad' : ''), cantidad: 1, clase: r[1] };
  return { tipo: r[0], item: r[1], cantidad: r[2] };
}
const BANCO = [{ tipo: 'dinero', item: '-', cantidad: 1000, nombre: '$1.000 para tu productora' }, { tipo: 'materiales', item: 'cables', cantidad: 6, nombre: '6 × Cables y conectores' },
  { tipo: 'materiales', item: 'placas', cantidad: 6, nombre: '6 × Placas electrónicas' }, { tipo: 'consumible', item: 'battery', cantidad: 2, nombre: '2 baterías' }];
const BANCO_P = BANCO.concat([{ tipo: 'materiales', item: 'paneles', cantidad: 6, nombre: '6 × Paneles LED' }, { tipo: 'materiales', item: 'chips', cantidad: 1, nombre: '1 × Chips de video 4K' }]);
function estado(s) {
  const pistas = { gratis: [], premium: [] }, por = { gratis: 0, premium: 0, premium_esperando: 0 };
  const mini = s.mini ? Array.from({ length: Math.max(0, Math.min(s.nivel, s.miniDesde + 8) - s.miniDesde) }, (_, i) => s.miniDesde + 1 + i) : [];
  ['gratis', 'premium'].forEach((p) => {
    for (let n = 1; n <= 40; n++) {
      const r = rec(n, p);
      if (!r) continue;
      const porMini = p === 'premium' && !s.premium && mini.includes(n) && !SOLO_PREMIUM(n);
      const k = p + ':' + n;
      const estadoN = s.reclamados.has(k) ? 'reclamado' : n > s.nivel ? 'bloqueado' : p === 'premium' && !s.premium && !porMini ? 'requiere_premium' : 'disponible';
      if (estadoN === 'disponible') por[p]++;
      if (estadoN === 'requiere_premium') por.premium_esperando++;
      const c = { nivel: n, recompensa: r, estado: estadoN };
      if (porMini && estadoN !== 'reclamado') c.mini = true;
      if (p === 'premium' && SOLO_PREMIUM(n)) c.solo_premium = true;
      pistas[p].push(c);
    }
  });
  const banco = { activo: s.nivel >= 40, cada: 2000, max: 10, abiertos: s.cofres, ganados: s.ganados, por_abrir: Math.max(0, s.ganados - s.cofres), xp_extra: s.ganados * 2000 + 300,
    xp_siguiente: 1700, contenido: BANCO, contenido_premium: BANCO_P, premium: s.premium };
  if (banco.por_abrir) { por.banco = banco.por_abrir; }
  por.total = por.gratis + por.premium + (por.banco || 0);
  const alt = (n, a, xp, via) => ({ n, avance: a, xp, hecha: !!via });
  return {
    ok: true, ahora: iso(AHORA), creditos_tope: 420, gracia_dias: 3,
    productos: { pase_premium: { id: 'pase_premium', precio: 4.99, activo: true, plus: false, niveles: 0 }, pase_premium_plus: { id: 'pase_premium_plus', precio: 9.99, activo: true, plus: true, niveles: 10 },
      pase_semanal: { id: 'pase_semanal', precio: 1.49, activo: true, plus: false, niveles: 0, mini: true, max_niveles: 8 } },
    temporada: { numero: 2, tema: 'navidad', icono: '🎄', nombre: 'Temporada 2 · Luces de Navidad', nombre_tema: 'Luces de Navidad', inicio: iso(Date.parse('2026-11-16T00:00:00-05:00')), fin: iso(FIN),
      quedan_seg: Math.round((FIN - AHORA) / 1000), visual: { colores: ['#2fbf71', '#e8453c'], adornos: '❄️🎁⭐' } },
    nivel: s.nivel, niveles: 40, xp: s.nivel * 400 + 120, xp_nivel: s.nivel >= 40 ? 400 : 120, xp_por_nivel: 400, premium: s.premium, plus: false, pistas, por_reclamar: por, creditos_dados: 0, banco,
    saltos: { usados: 0, max: 10, precio: 150, max_ahora: Math.max(0, Math.min(10, 40 - s.nivel)) }, xp_hoy: 120, xp_tope_dia: s.alDia === 'activo' ? 1400 : 700, xp_fuentes: {},
    misiones: {
      diarias: [{ id: 'd_eventos', texto: 'Juega 3 eventos en línea', n: 3, avance: 1, xp: 150, hecha: false, via: null, alt: alt(2, 1, 75), juntos: false },
        { id: 'd_juntos', texto: 'Juega 3 veces con otros: duelos, liga o tu asociación', n: 3, avance: 0, xp: 120, hecha: false, via: null, alt: alt(2, 1, 60), juntos: true },
        { id: 'd_asoc', texto: 'Dona 1 vez a la investigación de tu asociación', n: 1, avance: 0, xp: 100, hecha: true, via: 'sin_conexion', alt: alt(2, 2, 50, true), juntos: true }],
      diarias_fin: iso(Date.parse('2026-11-25T00:00:00-05:00')),
      semanales: [{ id: 's_eventos', texto: 'Juega 15 eventos en línea', n: 15, avance: 4, xp: 600, hecha: false, via: null, alt: alt(6, 2, 300), juntos: false }],
      semanales_fin: iso(Date.parse('2026-11-30T00:00:00-05:00')), alt: { dia: { n: 2, pct: 50 }, semana: { n: 6, pct: 50 } },
    },
    al_dia: { estado: s.alDia, activo: s.alDia === 'activo' || s.alDia === 'disponible', factor: 2, desde_dia: 8, dias: 3, hasta: s.alDia === 'activo' ? iso(AHORA + 50 * 3600e3) : null },
    mini: { producto: 'pase_semanal', max_niveles: 8, excluye: ['creditos', 'cosmetico', 'estrella'], semana: 2, semana_fin: iso(Date.parse('2026-11-30T00:00:00-05:00')), quedan_seg: 5 * 86400 + 14 * 3600,
      activo: !!s.mini && !s.premium, nivel_desde: s.mini ? s.miniDesde : null, nivel_hasta: s.mini ? s.miniDesde + 8 : null, puede_comprar: !s.premium && !s.mini, niveles: s.premium ? [] : mini.filter((n) => !SOLO_PREMIUM(n)) },
    anterior: null,
  };
}
const nuevo = () => ({ nivel: 9, premium: false, mini: false, miniDesde: 0, reclamados: new Set(), cofres: 0, ganados: 0, alDia: 'activo' });

async function pagina(browser, ajustar) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|status of (402|403|409|410|503)/.test(m.text())) errores.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const srv = { s: nuevo(), pedidos: [] };
  if (ajustar) ajustar(srv.s);
  await page.route(BASE + '/**', async (r) => {
    const u = new URL(r.request().url());
    const m = r.request().method();
    const json = (o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${estilos}</head>
      <body><main class="gut" style="padding-top:12px"><div id="ini"></div></main><div class="toast" id="toast"></div>
      <script src="/js/lang/es.js"></script><script src="/js/pase.js"></script></body></html>` });
    if (u.pathname.startsWith('/js/')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: leer(u.pathname.slice(1)) });
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : undefined;
    srv.pedidos.push({ m, ruta: u.pathname, body });
    const s = srv.s;
    if (u.pathname === '/api/pase' && m === 'GET') return json(estado(s));
    if (u.pathname === '/api/pase/reclamar' && m === 'POST') {
      const e = estado(s);
      const c = e.pistas[body.pista].find((x) => x.nivel === body.nivel);
      if (!c || c.estado !== 'disponible') return json({ ok: false, error: 'No.', codigo: 'premium_requerido' }, 403);
      s.reclamados.add(body.pista + ':' + body.nivel);
      return json({ ok: true, reclamado: { temporada: 2, nivel: body.nivel, pista: body.pista, recompensa: c.recompensa, creditos: 0 }, entregas: [], creditos: 0, pase: estado(s) });
    }
    if (u.pathname === '/api/pase/banco' && m === 'POST') {
      const n = s.ganados - s.cofres;
      if (n <= 0) return json({ ok: false, error: 'Todavía no ganas otro cofre: sigue jugando.', codigo: 'banco_vacio' }, 409);
      const cofres = Array.from({ length: n }, (_, i) => ({ temporada: 2, n: s.cofres + i + 1, premium: s.premium, contenido: s.premium ? BANCO_P : BANCO }));
      s.cofres = s.ganados;
      return json({ ok: true, cofres, entregas: [], creditos: 0, pase: estado(s) });
    }
    return json({ ok: false, error: 'No encontrado.', codigo: 'no_encontrado' }, 404);
  });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__toasts = []; window.__compras = [];
    window.Api = { disponible: true, logueado: () => true, estado: { creditos: 1000 } };
    const ini = document.getElementById('ini');
    const mod = () => (window.EnVivoInicio || []).find((x) => x.id === 'pase');
    window.__ctx = {
      M: (n) => '$' + Number(n).toLocaleString('es-EC'),
      toast: (t) => { window.__toasts.push(t); },
      render: () => { ini.innerHTML = mod().tarjeta(window.__ctx); },
      onComprar: (id) => { window.__compras.push(id); }, alReclamar: () => {}, snd: { play: () => {} },
    };
    // Lo mismo que hace ui.js con los botones data-ext / data-acc
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-ext][data-acc]'); if (b) { const m = mod(); if (m && b.dataset.ext === 'pase') m.clic(window.__ctx, b.dataset.acc, b); } });
    window.__ctx.render();
  });
  return { page, ctx, srv, errores };
}
async function sinDesborde(page, tag) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const fuera = [...document.querySelectorAll('body *')].filter((n) => !n.ownerSVGElement && !n.closest('.pase-scroll') && !n.closest('script,style'))
      .filter((n) => { const b = n.getBoundingClientRect(); return b.width && (b.right > w + 1 || b.left < -1); }).map((n) => n.tagName + '.' + String(n.className)).slice(0, 3);
    return { doc: document.documentElement.scrollWidth - w, fuera };
  });
  ok(r.doc <= 1 && !r.fuera.length, `${tag}: la página no se desborda de lado${r.fuera.length ? ' (' + r.fuera.join(' | ') + ')' : ''}`);
}

(async () => {
  const outDir = path.join(__dirname, 'capturas');
  fs.mkdirSync(outDir, { recursive: true });
  const cap = (n) => path.join(outDir, 'pasem_' + n + '.png');
  const browser = await chromium.launch();
  const { page, srv, errores } = await pagina(browser);
  await page.waitForSelector('[data-pase="tarjeta"] h2');
  await page.click('[data-pase="tarjeta"] [data-acc="abrir"]');
  await page.waitForSelector('#pase-ov [data-pase="premios"]');

  console.log('Fila gratis: el premio premium de cada nivel con candado');
  ok(await page.locator('#pase-ov .pase-celda.tz').count() === 19, 'Los 19 niveles sin premio gratis muestran el premio premium con candado');
  ok(await page.locator('#pase-ov .pase-celda.g .lk').count() === 21, 'Los 21 premios gratis llevan el sello 🔒 con el ícono del premio premium');
  ok(await page.locator('#pase-ov .pase-celda.g').count() === 21 && await page.locator('#pase-ov .pase-celda.p').count() === 40, 'Las pistas siguen igual (21 gratis, 40 premium)');
  await page.click('.pase-celda.tz[data-nivel="2"]');
  const det = await page.locator('[data-pase="detalle"]').textContent();
  ok(/Nv 2 · Premium/.test(det) && /Acelerador|Aceleradores/.test(det) && /Mini Pase|Pase Premium/.test(det), 'Tocar el candado muestra el premio premium y cómo conseguirlo (' + det.trim().slice(0, 80) + '…)');
  await page.click('.pase-celda.g[data-nivel="11"]');
  ok(/Con el Premium: .*8 × Planos/.test(await page.locator('[data-pase="detalle"]').textContent()), 'Tocar un premio gratis también dice qué trae el premium de ese nivel');
  ok(!srv.pedidos.some((p) => p.ruta === '/api/pase/reclamar'), '…sin llamar al servidor');

  console.log('Tema visual de la temporada');
  const tema = await page.evaluate(() => { const h = document.querySelector('.pase-hoja'); return { c1: h.style.getPropertyValue('--pc1'), tema: h.dataset.tema, ad: (document.querySelector('.pase-cab .adornos') || {}).textContent }; });
  ok(tema.c1 === '#2fbf71' && tema.tema === 'navidad' && tema.ad === '❄️🎁⭐', 'Colores y adornos de Navidad en la cabecera');
  ok(/ícono exclusivo de sede/.test(await page.locator('[data-pase="premios"]').textContent()), 'Avisa del ícono exclusivo de sede del nivel 40');
  await page.locator('.pase-cuerpo').evaluate((e) => { e.scrollTop = 0; });
  await captura(page, { path: cap('gratis') });

  console.log('Ponerse al día');
  ok(/Ponerse al día: ganas el doble de XP por jugar durante 2 d 2 h más/.test(await page.locator('[data-pase="al_dia"]').textContent()), 'Aviso de doble XP con el tiempo que queda');

  console.log('Mini Pase Semanal');
  const mini = await page.locator('[data-pase="mini"]').textContent();
  ok(/Mini Pase Semanal/.test(mini) && /hasta 8 niveles/.test(mini) && /No da créditos, cosméticos ni personal estrella/.test(mini), 'Explica qué da y qué no');
  ok(/Mini Pase semanal · \$1,49/.test(mini), 'Botón con precio $1,49');
  await page.click('[data-pase-comprar="pase_semanal"]');
  ok((await page.evaluate(() => window.__compras))[0] === 'pase_semanal', 'Compra por ctx.onComprar("pase_semanal")');
  srv.s.mini = true; srv.s.miniDesde = 9; srv.s.nivel = 14;
  await page.evaluate(() => window.Pase.recargar());
  await page.waitForSelector('.pase-celda.p .mn');
  ok(/Mini Pase activo: premios premium de los niveles 10 a 17/.test(await page.locator('[data-pase="mini"]').textContent()), 'Mini activo: niveles 10 a 17 y hasta cuándo');
  ok(await page.locator('[data-pase-comprar="pase_semanal"]').count() === 0, 'Ya no se ofrece otro Mini esta semana');
  ok(await page.locator('.pase-celda.p.disponible .mn').count() === 3, 'Premium 11, 13, 14 con la marca "Mini" (10 y 12 son solo premium)');
  ok(await page.locator('.pase-celda.p.requiere_premium[data-nivel="12"]').count() === 1, 'El 12 (créditos) sigue con candado');
  await page.click('.pase-celda.p.requiere_premium[data-nivel="12"]');
  ok(/Solo con el Pase Premium/.test(await page.locator('[data-pase="detalle"]').textContent()), '…y dice que es solo del premium completo');
  await page.click('.pase-celda.p.disponible[data-nivel="11"]');
  await page.waitForFunction(() => window.__toasts.length > 0);
  const pr = srv.pedidos.filter((p) => p.ruta === '/api/pase/reclamar').pop();
  ok(!!pr && pr.body.pista === 'premium' && pr.body.nivel === 11, 'Reclama el premium 11 con el Mini (POST reclamar pista premium)');
  await sinDesborde(page, 'mini');
  await page.locator('[data-pase="mini"]').scrollIntoViewIfNeeded();
  await captura(page, { path: cap('mini') });

  console.log('Misiones: con otros y alternativa sin conexión');
  const mis = await page.locator('[data-pase="misiones"]').textContent();
  ok(/o sin conexión: reclama 2 misiones del juego \(1\/2\) · \+75 XP/.test(mis), 'Cada misión dice su alternativa sin conexión con avance y XP');
  ok(/Hecha sin conexión \(\+50 XP\)/.test(mis), 'Misión hecha sin conexión, con aviso de que en línea recibe lo que falta');
  ok(await page.locator('[data-mision="d_juntos"] .jt').count() === 1 && await page.locator('[data-mision="d_eventos"] .jt').count() === 0, 'Marca "Con otros" en las de duelos, liga y asociación');
  ok(/Sin conexión también cuenta/.test(mis), 'Explicación de la alternativa');
  await page.locator('[data-pase="misiones"]').scrollIntoViewIfNeeded();
  await sinDesborde(page, 'misiones');
  await captura(page, { path: cap('misiones') });
  await page.keyboard.press('Escape');

  console.log('Banco de premios (después del nivel 40) y premium');
  const p2 = await pagina(browser, (s) => { s.nivel = 40; s.premium = true; s.ganados = 2; s.cofres = 0; s.alDia = 'no'; for (let n = 1; n <= 40; n++) { s.reclamados.add('gratis:' + n); s.reclamados.add('premium:' + n); } });
  await p2.page.waitForSelector('[data-pase="tarjeta"] h2');
  await p2.page.click('[data-pase="tarjeta"] [data-acc="abrir"]');
  await p2.page.waitForSelector('#pase-ov [data-pase="banco"]');
  const b = await p2.page.locator('[data-pase="banco"]').textContent();
  ok(/Banco de premios/.test(b) && /cada 2.000 XP/.test(b) && /\$1.000 para tu productora/.test(b) && /2 baterías/.test(b) && /6 × Paneles LED/.test(b), 'Muestra exactamente lo que trae cada cofre (y lo extra del premium)');
  ok(/Cofres: 2 de 10 · faltan 1.700 XP para el siguiente/.test(b), 'Progreso del banco');
  ok(await p2.page.locator('#pase-ov .pase-celda.tz').count() === 0 && await p2.page.locator('#pase-ov .lk').count() === 0, 'Con premium no hay candados en la fila gratis');
  ok(await p2.page.locator('[data-pase="mini"]').count() === 0 && await p2.page.locator('[data-pase="al_dia"]').count() === 0, 'Con premium no sale el Mini; sin llegar tarde no sale "ponerse al día"');
  await p2.page.locator('[data-pase="banco"]').scrollIntoViewIfNeeded();
  await captura(p2.page, { path: cap('banco') });
  await p2.page.click('[data-pase-acc="banco"]');
  await p2.page.waitForFunction(() => window.__toasts.length > 0);
  ok(p2.srv.pedidos.some((p) => p.ruta === '/api/pase/banco' && p.m === 'POST' && p.body.temporada === 2), 'POST /api/pase/banco {temporada: 2}');
  ok(/Abriste 2 cofre/.test(await p2.page.evaluate(() => window.__toasts[0])), 'Mensaje "¡Abriste 2 cofre(s)!"');
  ok(await p2.page.locator('[data-pase-acc="banco"]').count() === 0, 'Ya no queda cofre por abrir');
  await sinDesborde(p2.page, 'banco');
  ok(!errores.length && !p2.errores.length, 'Sin errores de JS' + (errores.concat(p2.errores).length ? ': ' + errores.concat(p2.errores).slice(0, 3).join(' | ') : ''));

  await browser.close();
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
