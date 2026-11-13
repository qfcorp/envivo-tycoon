/* Prueba de los eventos de todo el servidor y del calendario de adviento (js/eventos_servidor.js, bloque eventos_servidor de js/temporadas.js,
   server/src/EventosServidor.php) con el SERVIDOR REAL (php -S + server/tests/router.php, base temporal) en un celular de 390x844.
   1) Node: textos en js/lang/es.js (evs.*) y en js/datos.js (temporadas nuevas), sin español fuera de los comentarios en
      js/eventos_servidor.js, cargado en index.html y sw.js, las temporadas nuevas de la partida tienen las MISMAS fechas que el
      calendario del servidor (2026 a 2028), la Copa Global Femenina solo en 2027, ofertas especiales de fútbol dentro de la
      partida, imprevistos propios, cada decoración dibujada en js/art.js y ningún nombre real.
   2) Navegador: la edición de Navidad se "adelanta" a hoy desde el ajuste del panel (como la ventana de Black Friday).
      Sin cuenta: tarjeta con "Crea tu cuenta gratis para participar" y la tienda sin botones de compra. Con cuenta: franja
      "tus fichas del día", "Fichas del día (+5)", tienda (botón apagado sin fichas), comprar la decoración exclusiva (se ve en
      la sede), evento jugado → cola → fichas y objetivo común, calendario anual, calendario de adviento (datos de diciembre
      inyectados en la respuesta), sin desplazamiento horizontal y sin errores de JavaScript.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_eventos_servidor.js   (capturas en tests/capturas/eventos_servidor_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const CAP = path.join(__dirname, 'capturas');
fs.mkdirSync(CAP, { recursive: true });
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- 1) Node ---------- */
console.log('Textos y archivos');
global.window = global;
require(path.join(RAIZ, 'js/lang/es.js'));
const ES = global.I18N_LANG.es;
const CLAVES_CAL = ['carnaval', 'san_valentin', 'pascua', 'dia_madre', 'semana_finales', 'copa_femenina', 'halloween', 'final_continental', 'viernes_negro', 'navidad', 'gran_final_nacional', 'fin_anio'];
ok(CLAVES_CAL.every((k) => ES['evs.ev.' + k]), 'js/lang/es.js: nombre de los 12 eventos (evs.ev.*)');
ok(CLAVES_CAL.filter((k) => k !== 'viernes_negro').every((k) => ES['evs.lema.' + k] && /\{meta\}/.test(ES['evs.objetivo.' + k])), 'js/lang/es.js: lema y objetivo común ({meta}) de cada evento con tienda');
const fuente = fs.readFileSync(path.join(RAIZ, 'js/eventos_servidor.js'), 'utf8');
const usadas = Array.from(fuente.matchAll(/T\(ctx, '(evs\.[a-z_.]+)'/g)).map((m) => m[1]).filter((k) => !k.endsWith('.'));
ok(usadas.length > 30 && usadas.every((k) => ES[k]), 'Todas las claves fijas que usa js/eventos_servidor.js están en es.js (' + usadas.filter((k) => !ES[k]).join(', ') + ')');
ok(!/[áéíóúñ¡¿]/i.test(fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'js/eventos_servidor.js no trae textos en español fuera de los comentarios');
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
ok(idx.includes('<script defer src="js/eventos_servidor.js"></script>'), 'index.html carga js/eventos_servidor.js con defer');
ok(sw.includes("'./js/eventos_servidor.js'"), 'sw.js lo guarda');

const D = require(path.join(RAIZ, 'js/datos.js'));
const G = require(path.join(RAIZ, 'js/logic.js'));
global.Game = G; global.Datos = D;
const TP = require(path.join(RAIZ, 'js/temporadas.js'));
global.Temporadas = TP;
const TF = { claves: TP.NUEVAS, NUEVAS: TP.NUEVAS.map((k) => TP.porKey(k)) };
ok(TF.claves.every((k) => ['nombre', 'premio', 'trofeo'].every((x) => D.TEXTOS['temp.' + k + '.' + x])), 'js/datos.js: nombre, premio y trofeo de las 5 temporadas nuevas');
ok(TF.NUEVAS.every((t) => Object.keys(t.eventos).every((e) => D.TEXTOS['ev.' + e] && G.EVENT_TYPES[e])), 'Tipos de evento nuevos registrados con su nombre');
ok(['evs_var', 'evs_lluvia', 'evs_bengalas', 'evs_pantalla', 'evs_mariachi'].every((k) => ['t', 'o0', 'o1', 'r0', 'r1', 'r2'].every((x) => D.TEXTOS['inc.' + k + '.' + x])), 'Imprevistos propios con sus textos (VAR que se cae, aguacero, bengalas, pantalla, mariachi)');
const visibles = JSON.stringify(TF.NUEVAS) + Object.keys(D.TEXTOS).filter((k) => /evs_|temp\.(dia_madre|semana_finales|copa_femenina|final_continental|gran_final_nacional)/.test(k)).map((k) => D.TEXTOS[k]).join(' ')
  + CLAVES_CAL.map((k) => ES['evs.ev.' + k] + ES['evs.lema.' + k]).join(' ');
ok(!/FIFA|Libertadores|LigaPro|Sudamericana|Champions|Mundial|Copa Am[eé]rica|Barcelona|Emelec|Liga de Quito|Independiente del Valle/i.test(visibles), 'Ningún nombre real de torneos, ligas ni clubes');

// Mismas fechas que el servidor
const php = (codigo, env) => execFileSync('php', ['-r', `$_SERVER['REMOTE_ADDR'] = '127.0.0.1'; require ${JSON.stringify(path.join(RAIZ, 'server/src/arranque.php'))}; use EnVivo\\{Ajustes, Db, EventosServidor}; ${codigo}`], { env: env || process.env }).toString();
const TMP0 = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_evs_js0_'));
fs.writeFileSync(path.join(TMP0, 'config.env'), `ENVIVO_DB=${TMP0}/e.sqlite\nENVIVO_ZONA=America/Guayaquil\n`);
const ENV0 = Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(TMP0, 'config.env') });
const srvFechas = JSON.parse(php(`$o = []; foreach ([2026, 2027, 2028] as $y) foreach (['dia_madre', 'semana_finales', 'copa_femenina', 'final_continental', 'gran_final_nacional'] as $k) { $w = EventosServidor::ventanaBase($k, $y); $o[$k . '-' . $y] = $w ? [date('Y-m-d', $w[0]), date('Y-m-d', $w[1])] : null; } echo json_encode($o);`, ENV0));
fs.rmSync(TMP0, { recursive: true, force: true });
const iguales = Object.keys(srvFechas).every((id) => {
  const [k, y] = id.split('-');
  const w = TP.ventana(TP.porKey(k), Number(y));
  const js = w ? [TP.isoDe(w.desde), TP.isoDe(w.hasta)] : null;
  return JSON.stringify(js) === JSON.stringify(srvFechas[id]);
});
ok(iguales, 'Temporadas nuevas de la partida = calendario del servidor (2026–2028) ' + (iguales ? '' : JSON.stringify(srvFechas)));
const ids = (d) => TP.activas(d).map((a) => a.def.key).join(',');
ok(ids('2027-07-01') === 'copa_femenina' && ids('2026-07-01') === '' && ids('2028-07-01') === '', 'Copa Global Femenina solo en 2027');
ok(ids('2026-12-05') === 'navidad,gran_final_nacional' && ids('2026-11-15') === '' && ids('2027-11-15') === 'final_continental', 'Gran Final Nacional desde dic 2026; Final Continental desde 2027');
ok(ids('2026-06-10') === '' && ids('2026-11-10') === '' && ids('2026-12-20') === 'navidad,pase_nino', 'Las fechas que usan las otras pruebas no cambian');
{
  const s = G.newGame(7); s.money = 90000; TP.setFecha('2027-06-30', s);
  ok(s.contracts.some((c) => c.temporada === 'copa_femenina' && c.type === 'evs_copa_fem'), 'Con fecha 30 jun 2027 llega la oferta especial de la Copa Global Femenina');
  const a = G.newGame(9), b = G.newGame(9);
  TP.setFecha('2026-12-06', a); TP.setFecha('2026-12-06', b);
  ok(G.serialize(a) === G.serialize(b), 'Determinista: misma semilla + misma fecha = misma partida');
}
const art = fs.readFileSync(path.join(RAIZ, 'js/art.js'), 'utf8');
const cosm = ['evs_mascaras', 'evs_globos', 'evs_palmas', 'evs_rosas', 'evs_pantalla', 'evs_trofeo_fem', 'evs_murcielagos', 'evs_bufandas', 'evs_reno', 'evs_balon', 'evs_reloj', 'evs_estrella'];
ok(cosm.every((k) => art.includes(`has('${k}')`)), 'js/art.js dibuja las 12 decoraciones de los eventos');
ok(TF.NUEVAS.every((t) => cosm.includes(t.premios.cosmetico)), 'El premio de cada temporada nueva es una decoración que existe');

/* ---------- 2) Navegador con el servidor real ---------- */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('  (sin Playwright: se salta la parte del navegador)'); process.exit(fallas ? 1 : 0); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_evs_js_'));
fs.mkdirSync(path.join(TMP, 'datos'));
const puerto = 20000 + Math.floor(Math.random() * 20000);
const BASE = 'http://127.0.0.1:' + puerto;
fs.writeFileSync(path.join(TMP, 'config.env'), `ENVIVO_DB=${TMP}/datos/envivo.sqlite\nENVIVO_URL=${BASE}\nENVIVO_ZONA=America/Guayaquil\n`);
const ENV = Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(TMP, 'config.env'), no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost', PHP_CLI_SERVER_WORKERS: '4' });
execFileSync('php', [path.join(RAIZ, 'server/bin/migrar.php')], { env: ENV });
const srv = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=' + path.join(TMP, 'php.log'), '-S', '127.0.0.1:' + puerto, '-t', RAIZ, path.join(RAIZ, 'server/tests/router.php')], { env: ENV, stdio: 'ignore' });
const fin = (c) => { try { srv.kill(); } catch (e) { /* nada */ } try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* nada */ } process.exit(c); };
// "Adelantar la fecha": Navidad 2026 empieza ayer y dura 10 días (lo mismo que cambiarla en el Centro de Control → Eventos)
php(`$h = (new DateTimeImmutable('today', new DateTimeZone('America/Guayaquil')))->getTimestamp(); EventosServidor::guardar(['instancia' => ['id' => 'navidad-2026', 'desde' => $h - 86400, 'hasta' => $h + 10 * 86400 - 1]], 'prueba');`, ENV);

async function esperarServidor() {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/api/estado'); if (r.ok) return true; } catch (e) { /* todavía no */ } await new Promise((r) => setTimeout(r, 100)); }
  return false;
}
async function cerrarVentanas(p) {
  for (let i = 0; i < 5; i++) {
    const b = p.locator('#overlay.on [data-act="close"], #overlay.on [data-act="close-story"]');
    if (!(await b.count())) return;
    await b.first().click();
    await p.waitForTimeout(150);
  }
}
const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function nuevoContexto(browser) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block' }, MOVIL));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(() => {
    window.__ENVIVO_FECHA = '2026-06-10';   // fecha de la partida (temporadas) fija y sin temporada: solo se ve el evento del servidor
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_lang', 'es');
    } catch (e) { /* nada */ }
  });
  return ctx;
}
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const { verEnInicio } = require('./hub_ayuda');
const tarjeta = (p, id) => p.evaluate((i) => { const h = document.getElementById('hubSheet'); const c = (h && h.querySelector(`[data-evs-card="${i}"]`)) || document.querySelector(`#tab-inicio [data-evs-card="${i}"]`); return c ? c.innerText.replace(/\s+/g, ' ').trim() : null; }, id);

(async () => {
  if (!(await esperarServidor())) { console.error('No arrancó el servidor'); fin(1); }
  const browser = await chromium.launch();
  const errores = [];
  const vigilar = (p) => {
    p.on('pageerror', (e) => errores.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  };
  const abrir = async (ctx, conCuenta) => {
    const p = await ctx.newPage();
    vigilar(p);
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction((c) => window.Api && window.Api.disponible === true && (!c || window.Api.logueado()), conCuenta, { timeout: 15000 });
    await cerrarVentanas(p);
    await p.waitForFunction(() => window.EventosServidor && window.EventosServidor.datos, null, { timeout: 10000 }).catch(() => {});
    await p.evaluate(() => { try { window.__game && window.__game.render && window.__game.render(); } catch (e) { /* nada */ } });
    return p;
  };

  console.log('Sin cuenta (390x844)');
  const c0 = await nuevoContexto(browser);
  const p0 = await abrir(c0, false);
  ok(await verEnInicio(p0, '[data-evs-card="navidad-2026"]', 8000), 'Tarjeta "Navidad en Vivo" en Inicio (pizarra de Misiones)');
  let txt = await tarjeta(p0, 'navidad-2026');
  ok(txt && /Navidad en Vivo/.test(txt) && /Evento del servidor/i.test(txt) && /Crea tu cuenta gratis para participar/.test(txt), 'Dice el nombre, "Evento del servidor" y "Crea tu cuenta gratis para participar" — ' + txt);
  await p0.screenshot({ path: path.join(CAP, 'eventos_servidor_sin_cuenta_390.png') });
  await p0.click('[data-evs-card="navidad-2026"] [data-acc="abrir"]');
  await p0.waitForSelector('#overlay.on [data-evs-art="deco"]', { timeout: 5000 }).catch(() => {});
  ok(await p0.evaluate(() => { const o = document.querySelector('#overlay.on'); return !!o && o.querySelectorAll('[data-evs-art]').length >= 8 && !o.querySelector('[data-acc="comprar"]') && /Reno luminoso/.test(o.innerText); }),
    'La tienda se ve (con la decoración exclusiva) pero sin botones de compra');
  ok(await sinDesborde(p0), 'Sin desplazamiento horizontal');
  await c0.close();

  console.log('Con cuenta');
  const c1 = await nuevoContexto(browser);
  const reg = await c1.request.post(BASE + '/api/registro', { headers: { 'X-Envivo': '1', 'Content-Type': 'application/json' },
    data: { email: `evs.${Date.now()}@prueba.example`, nombre: 'Productora Evs', clave: 'ClaveBuena123', acepta_terminos: true, edad_16: true } });
  const J = (await reg.json()).jugador.id;
  const p1 = await abrir(c1, true);
  await p1.waitForSelector('#tab-inicio [data-evs-card="banner"]', { timeout: 8000 }).catch(() => {});
  ok(/fichas del día te esperan/.test((await tarjeta(p1, 'banner')) || ''), 'Franja arriba de Inicio: "tus 5 fichas del día te esperan"');
  ok(await verEnInicio(p1, '[data-evs-card="navidad-2026"] [data-acc="diario"]', 8000), 'Botón "Fichas del día (+5)"');
  await p1.screenshot({ path: path.join(CAP, 'eventos_servidor_tarjeta_390.png') });
  await p1.click('[data-evs-card="navidad-2026"] [data-acc="diario"]');
  await p1.waitForFunction(() => { const e = window.EventosServidor.datos.eventos.find((x) => x.id === 'navidad-2026'); return e && e.fichas === 5; }, null, { timeout: 8000 }).catch(() => {});
  ok(await p1.evaluate(() => window.EventosServidor.datos.eventos.find((x) => x.id === 'navidad-2026').fichas === 5), 'Fichas del día: 5 fichas');
  ok(!(await p1.$('#tab-inicio [data-evs-card="banner"]')), 'La franja desaparece después de reclamar');
  await verEnInicio(p1, '[data-evs-card="navidad-2026"] [data-acc="abrir"]', 5000);
  await p1.click('[data-evs-card="navidad-2026"] [data-acc="abrir"]');
  await p1.waitForSelector('#overlay.on [data-evs-art="cables"]', { timeout: 5000 }).catch(() => {});
  ok(await p1.evaluate(() => { const b = document.querySelector('#overlay.on [data-evs-art="cables"] [data-acc="comprar"]'); return !!b && b.disabled; }), 'Con 5 fichas el botón de los cables (10) está apagado');
  ok(await p1.evaluate(() => /Objetivo común del servidor/i.test(document.querySelector('#overlay.on').innerText) && /Cómo ganar fichas/i.test(document.querySelector('#overlay.on').innerText)), 'La ventana muestra el objetivo común y cómo ganar fichas');
  await p1.screenshot({ path: path.join(CAP, 'eventos_servidor_tienda_390.png') });
  ok(await sinDesborde(p1), 'Ventana sin desplazamiento horizontal');
  // Más fichas (ajuste de la prueba) y comprar la decoración exclusiva
  php(`Db::q("INSERT INTO evs_fichas (instancia, jugador_id, servidor_id, motivo, ref, fichas, aporte, dia, creado) VALUES ('navidad-2026', ${J}, 1, 'ajuste', 'prueba:js', 200, 0, '2026-11-13', " . time() . ")");`, ENV);
  await p1.evaluate(async () => { window.EventosServidor.invalidar(); await window.EventosServidor.cargar(); });
  await cerrarVentanas(p1);
  await verEnInicio(p1, '[data-evs-card="navidad-2026"] [data-acc="abrir"]', 5000);
  await p1.click('[data-evs-card="navidad-2026"] [data-acc="abrir"]');
  await p1.waitForSelector('#overlay.on [data-evs-art="deco"] [data-acc="comprar"]:not([disabled])', { timeout: 5000 }).catch(() => {});
  await p1.click('#overlay.on [data-evs-art="deco"] [data-acc="comprar"]');
  await p1.waitForFunction(() => window.__game && window.__game.state && window.__game.state.temporada && (window.__game.state.temporada.cosmeticos || []).includes('evs_reno'), null, { timeout: 8000 }).catch(() => {});
  ok(await p1.evaluate(() => (window.__game.state.temporada.cosmeticos || []).includes('evs_reno')), 'Comprar la decoración: queda en la partida (s.temporada.cosmeticos)');
  ok(await p1.evaluate(() => /Ya la tienes/.test((document.querySelector('#overlay.on [data-evs-art="deco"]') || {}).innerText || '')), 'La tienda dice "Ya la tienes"');
  await cerrarVentanas(p1);
  await p1.evaluate(() => { const b = document.querySelector('nav button[data-tab="inicio"]'); if (b) b.click(); if (window.Hub && window.Hub.cerrar) window.Hub.cerrar(); });
  await p1.waitForTimeout(300);
  ok(await p1.evaluate(() => !!document.querySelector('.hq .hq-evs-reno')), 'El reno luminoso se ve en la sede');
  await p1.screenshot({ path: path.join(CAP, 'eventos_servidor_sede_reno_390.png') });
  // Evento jugado → cola → servidor (fichas y objetivo común)
  const antes = await p1.evaluate(() => window.EventosServidor.datos.eventos.find((x) => x.id === 'navidad-2026'));
  await p1.evaluate(async () => { const s = window.__game.state; window.EventosServidor.anotarEvento(s, { stars: 5 }, { id: 99001 }); await window.EventosServidor.enviarCola(); });
  await p1.waitForFunction((f) => { const e = window.EventosServidor.datos.eventos.find((x) => x.id === 'navidad-2026'); return e && e.fichas === f[0] + 3 && e.meta && e.meta.progreso === f[1] + 1; }, [antes.fichas, antes.meta.progreso], { timeout: 8000 }).catch(() => {});
  const despues = await p1.evaluate(() => window.EventosServidor.datos.eventos.find((x) => x.id === 'navidad-2026'));
  ok(despues.fichas === antes.fichas + 3 && despues.meta.progreso === antes.meta.progreso + 1 && (await p1.evaluate(() => window.EventosServidor.cola().length)) === 0,
    `Evento de 5⭐ jugado: +3 fichas y +1 al objetivo común; la cola queda vacía (${antes.fichas}→${despues.fichas}, ${antes.meta.progreso}→${despues.meta.progreso})`);
  // Calendario anual
  await verEnInicio(p1, '[data-evs-card="navidad-2026"] [data-acc="abrir"]', 5000);
  await p1.click('[data-evs-card="navidad-2026"] [data-acc="abrir"]');
  await p1.waitForSelector('#overlay.on [data-acc="calendario"]', { timeout: 5000 }).catch(() => {});
  await p1.click('#overlay.on [data-acc="calendario"]');
  await p1.waitForSelector('#overlay.on [data-evs-cal]', { timeout: 5000 }).catch(() => {});
  ok(await p1.evaluate(() => { const o = document.querySelector('#overlay.on'); return !!o && !!o.querySelector('[data-evs-cal="navidad-2026"]') && !!o.querySelector('[data-evs-cal="fin_anio-2026"]') && /Copa Global Femenina/.test(o.innerText); }), 'Calendario de eventos: Navidad, Fin de Año y la Copa Global Femenina 2027');
  await p1.screenshot({ path: path.join(CAP, 'eventos_servidor_calendario_390.png') });
  await cerrarVentanas(p1);
  await c1.close();

  console.log('Calendario de adviento (datos de diciembre inyectados en la respuesta del servidor)');
  const c2 = await nuevoContexto(browser);
  await c2.request.post(BASE + '/api/registro', { headers: { 'X-Envivo': '1', 'Content-Type': 'application/json' },
    data: { email: `adv.${Date.now()}@prueba.example`, nombre: 'Productora Adviento', clave: 'ClaveBuena123', acepta_terminos: true, edad_16: true } });
  const premios = JSON.parse(php('echo json_encode(array_map(fn($d) => array_map(fn($p) => $p + ["nombre" => EventosServidor::nombrePremio($p)], $d), EventosServidor::ADVIENTO));', ENV));
  const advDe = (tomados) => ({ anio: 2026, hoy: 10, reclamados: tomados.length, dias: Object.keys(premios).map((d) => { d = Number(d); return { dia: d, premios: premios[d], estado: tomados.includes(d) ? 'reclamado' : d === 10 ? 'hoy' : d === 9 ? 'recuperar' : d < 9 ? 'perdido' : 'futuro' }; }) });
  let tomados = [1, 2, 3, 4, 5, 6, 7, 8];
  await c2.route('**/api/eventos_servidor', async (route) => { const r = await route.fetch(); const j = await r.json(); j.adviento = advDe(tomados); await route.fulfill({ response: r, json: j }); });
  await c2.route('**/api/eventos_servidor/adviento', async (route) => { const b = JSON.parse(route.request().postData() || '{}'); tomados = tomados.concat([b.dia]); await route.fulfill({ json: { ok: true, recibido: premios[b.dia].map((p) => p.nombre).join(' · '), recuperado: b.dia === 9, entregas: [], creditos: 0, cosmeticos: [], adviento: advDe(tomados) } }); });
  const p2 = await abrir(c2, true);
  ok(await verEnInicio(p2, '[data-evs-card="adviento"]', 8000), 'Tarjeta "Calendario de adviento"');
  txt = (await tarjeta(p2, 'adviento')) || '';
  ok(/Abrir el regalo del día 10/.test(txt) && /Recuperar el del día 9/.test(txt) && /Reparar todos tus equipos/.test(txt), 'Hoy (día 10: reparar todo) y "Recuperar el del día 9" — ' + txt);
  await p2.screenshot({ path: path.join(CAP, 'eventos_servidor_adviento_390.png') });
  await p2.click('[data-evs-card="adviento"] [data-evs="adv-hoy"]');
  await p2.waitForTimeout(500);
  await verEnInicio(p2, '[data-evs-card="adviento"]', 4000);
  txt = (await tarjeta(p2, 'adviento')) || '';
  ok(/Recuperar el del día 9/.test(txt) && !/Abrir el regalo del día 10/.test(txt), 'Después de abrir el de hoy queda "Recuperar el del día 9"');
  await p2.click('[data-evs-card="adviento"] [data-evs="adv-ver"]');
  await p2.waitForSelector('#overlay.on [data-evs="adviento"]', { timeout: 4000 }).catch(() => {});
  ok(await p2.evaluate(() => document.querySelectorAll('#overlay.on .evs-dia').length === 25 && document.querySelectorAll('#overlay.on .evs-dia.reclamado').length === 9), 'Ventana con los 25 días (9 abiertos)');
  ok(await sinDesborde(p2), 'Adviento sin desplazamiento horizontal');
  await p2.screenshot({ path: path.join(CAP, 'eventos_servidor_adviento_ventana_390.png') });
  await c2.close();

  await browser.close();
  ok(errores.length === 0, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  const log = fs.existsSync(path.join(TMP, 'php.log')) ? fs.readFileSync(path.join(TMP, 'php.log'), 'utf8') : '';
  ok(!/fatal|warning|deprecated|notice/i.test(log), 'Sin errores de PHP' + (log ? ': ' + log.slice(0, 300) : ''));
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  fin(fallas ? 1 : 0);
})().catch((e) => { console.error(e); fin(1); });
