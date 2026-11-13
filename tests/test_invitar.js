/* Prueba de "Invita a tu equipo" y "Productores Aliados" en el juego (js/invitar.js + ganchos en js/chat.js y js/visitas.js,
   server/src/Invitaciones.php y Aliados.php) con el SERVIDOR REAL (php -S + server/tests/router.php, base temporal) en un
   celular de 390x844. Revisa: textos en js/lang/es.js, tarjeta de Inicio con "Invitar por WhatsApp" y "Mis invitados", el
   enlace ?ref=, el registro de un amigo que abrió el enlace (campo "Código de creador", nota del pack de bienvenida, pack y
   creador en el servidor), la ventana "Mis invitados" con las etapas del amigo cuando avanza, el botón "Invitar" de la
   pestaña Asociación del chat, la insignia "Productor Aliado" y el letrero dorado en la vitrina, el código de creador en
   "Canjear código", sin desplazamiento horizontal y sin errores de JavaScript.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/test_invitar.js     (capturas en tests/capturas/invitar_*.png) */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const CAP = path.join(__dirname, 'capturas');
fs.mkdirSync(CAP, { recursive: true });
let fallas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fallas++; };

/* ---------- Textos ---------- */
console.log('Textos');
global.window = global;
require(path.join(RAIZ, 'js/lang/es.js'));
const ES = global.I18N_LANG.es;
const fuente = fs.readFileSync(path.join(RAIZ, 'js/invitar.js'), 'utf8');
const usadas = [...new Set([...fuente.matchAll(/T\('(inv\.[a-z0-9_.]+)'/g)].map((m) => m[1]))];
const faltan = usadas.filter((k) => !ES[k] && !/\.$/.test(k));
ok(usadas.length > 30 && !faltan.length, 'js/lang/es.js tiene las ' + usadas.length + ' claves inv.* que usa js/invitar.js' + (faltan.length ? ' (faltan ' + faltan.join(', ') + ')' : ''));
ok(['inv.etapa.capitulo2', 'inv.etapa.dias3', 'inv.etapa.asociacion', 'inv.dist.letrero_dorado', 'inv.dist.productor_aliado'].every((k) => ES[k]), 'Textos de etapas y distintivos');
ok(!/[áéíóúñ¡¿]/i.test(fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'js/invitar.js no trae textos en español fuera de los comentarios (van en es.js)');
const marcas = Object.keys(ES).filter((k) => k.startsWith('inv.')).map((k) => JSON.stringify(ES[k])).join(' ');
ok(!/tiktok|youtube|twitch|kick|google play|play store/i.test(marcas), 'Los textos inv.* no nombran marcas ni la tienda');
ok(!/calific|reseña|estrellas en/i.test(marcas.replace('Nunca damos premios por calificar el juego', '')), 'Ningún premio por calificar o reseñar (solo la regla que lo prohíbe)');
const idx = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
ok(idx.includes('src="js/invitar.js"') && sw.includes("'./js/invitar.js'") && idx.indexOf('src="js/invitar.js"') > idx.indexOf('src="js/cuenta.js"'), 'Cargado en index.html (después de cuenta.js) y guardado por sw.js');

/* ---------- Servidor real con base temporal ---------- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo_inv_js_'));
fs.mkdirSync(path.join(TMP, 'datos'));
const puerto = 20000 + Math.floor(Math.random() * 20000);
const BASE = 'http://127.0.0.1:' + puerto;
fs.writeFileSync(path.join(TMP, 'config.env'), `ENVIVO_DB=${TMP}/datos/envivo.sqlite\nENVIVO_URL=${BASE}\nENVIVO_ZONA=America/Guayaquil\n`);
const ENV = Object.assign({}, process.env, { ENVIVO_CONFIG: path.join(TMP, 'config.env'), no_proxy: '127.0.0.1,localhost', NO_PROXY: '127.0.0.1,localhost', PHP_CLI_SERVER_WORKERS: '4' });
execFileSync('php', [path.join(RAIZ, 'server/bin/migrar.php')], { env: ENV });
const srv = spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'error_log=' + path.join(TMP, 'php.log'), '-S', '127.0.0.1:' + puerto, '-t', RAIZ, path.join(RAIZ, 'server/tests/router.php')], { env: ENV, stdio: 'ignore' });
const php = (codigo) => execFileSync('php', ['-r', `$_SERVER['REMOTE_ADDR'] = '127.0.0.1'; require ${JSON.stringify(path.join(RAIZ, 'server/src/arranque.php'))}; use EnVivo\\{Ajustes, Aliados, Db, Invitaciones}; ${codigo}`], { env: ENV }).toString();
const fin = (c) => { try { srv.kill(); } catch (e) { /* nada */ } try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* nada */ } process.exit(c); };

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
    window.__ENVIVO_FECHA = '2026-11-13';
    window.__compartirNoNavegar = true;   // WhatsApp: no sale del juego (se anota en window.__invitarUltimo)
    try {
      if (localStorage.getItem('__prueba_init')) return;
      localStorage.setItem('__prueba_init', '1');
      localStorage.setItem('envivo_guia_v1', '"hecha"');
      localStorage.setItem('envivo_lang', 'es');
    } catch (e) { /* nada */ }
  });
  return ctx;
}
let nCuenta = 0;
async function registrar(ctx, nombre) {
  nCuenta++;
  const r = await ctx.request.post(BASE + '/api/registro', { headers: { 'X-Envivo': '1', 'Content-Type': 'application/json' },
    data: { email: `inv${nCuenta}.${Date.now()}@prueba.example`, nombre: nombre || 'Productora ' + nCuenta, clave: 'ClaveBuena123', acepta_terminos: true, edad_16: true } });
  return (await r.json()).jugador.id;
}
const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
// La tarjeta va en la Sala de la productora (js/hub.js): se abre tocando ese lugar si todavía no se ve
async function abrirSala(p) {
  await p.waitForFunction(() => window.Invitar && window.Invitar.datos, null, { timeout: 10000 }).catch(() => {});
  if (await p.$('#tab-inicio [data-inv="tarjeta"]')) return;
  await p.click('#tab-inicio [data-hub="sala"]').catch(() => {});
  await p.waitForSelector('#tab-inicio [data-inv="tarjeta"]', { timeout: 8000 }).catch(() => {});
}
const texto = (p, sel) => p.evaluate((s) => { const c = document.querySelector(s); return c ? c.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);

(async () => {
  if (!(await esperarServidor())) { console.error('No arrancó el servidor'); fin(1); }
  const browser = await chromium.launch();
  const errores = [];
  const vigilar = (p) => {
    p.on('pageerror', (e) => errores.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  };
  const abrir = async (ctx, conCuenta, url) => {
    const p = await ctx.newPage();
    vigilar(p);
    await p.goto(BASE + (url || '/'), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction((c) => window.Api && window.Api.disponible === true && (!c || window.Api.logueado()), conCuenta, { timeout: 15000 });
    await cerrarVentanas(p);
    return p;
  };

  // Un creador con su cuenta en el juego
  const cJuan = await nuevoContexto(browser);
  const JUAN = await registrar(cJuan, 'Juan Creador');
  php(`Aliados::guardar(['codigo' => 'PRODUCTOR-PRUEBA', 'nombre' => 'Canal de Prueba', 'nivel' => 2, 'cuenta' => '${JUAN}', 'activo' => true], null, 'prueba');`);

  console.log('Quien invita: tarjeta de Inicio y "Mis invitados"');
  const cA = await nuevoContexto(browser);
  const A = await registrar(cA, 'Ana Anfitriona');
  const codigoA = 'p' + A.toString(36);
  const pA = await abrir(cA, true);
  await abrirSala(pA);
  let txt = await texto(pA, '#tab-inicio [data-inv="tarjeta"]');
  ok(!!txt && txt.includes('Invita a tu equipo') && txt.includes('Invitar por WhatsApp') && txt.includes('Mis invitados (0)'), 'Tarjeta "Invita a tu equipo" con WhatsApp y "Mis invitados (0)" — ' + txt);
  ok(!!txt && /Próxima meta: 1 amigo activo/.test(txt), 'Muestra la próxima meta (1 amigo activo)');
  ok(await sinDesborde(pA), 'Sin desplazamiento horizontal');
  await pA.screenshot({ path: path.join(CAP, 'invitar_tarjeta_390.png') });
  await pA.click('#tab-inicio [data-inv="tarjeta"] [data-acc="wa"]');
  const ult = await pA.evaluate(() => window.__invitarUltimo);
  ok(!!ult && /^https:\/\/wa\.me\/\?text=/.test(ult.url) && decodeURIComponent(ult.url).includes('/?ref=' + codigoA), 'WhatsApp con el enlace ?ref=' + codigoA);
  await pA.click('#tab-inicio [data-inv="abrir-lista"]');
  await pA.waitForSelector('#overlay.on .inv-modal [data-inv="enlace"]', { timeout: 8000 }).catch(() => {});
  txt = await texto(pA, '#overlay.on .inv-modal');
  ok(!!txt && txt.includes('/?ref=' + codigoA), 'La ventana muestra tu enlace');
  ok(!!txt && /Tu amigo recibe al crear su cuenta/.test(txt) && /cables/i.test(txt) && /baterías/i.test(txt) && /\$1[.,]000/.test(txt), 'Qué gana tu amigo: cables, baterías y dinero del juego — ' + (txt || '').slice(0, 300));
  ok(!!txt && /Llega al capítulo 2/.test(txt) && /Juega 3 días distintos/.test(txt) && /Entra a una asociación/.test(txt), 'Qué ganas tú: las 3 etapas');
  ok(!!txt && /10 amigos activos/.test(txt) && /Letrero dorado/.test(txt), 'Metas 1/3/5/10 con el letrero dorado');
  ok(!!txt && /Nunca damos premios por calificar/.test(txt), 'Regla: nada de premios por calificar');
  ok(await sinDesborde(pA), 'Ventana sin desplazamiento horizontal');
  await pA.screenshot({ path: path.join(CAP, 'invitar_lista_vacia_390.png') });
  await cerrarVentanas(pA);

  console.log('El amigo abre el enlace y crea su cuenta');
  const cB = await nuevoContexto(browser);
  const pB = await abrir(cB, false, '/?ref=' + codigoA);
  ok(await pB.evaluate((c) => { try { return JSON.parse(localStorage.getItem('envivo_ref_origen')).code === c; } catch (e) { return false; } }, codigoA), 'js/compartir.js guardó el ?ref=');
  await pB.evaluate(() => { const b = document.createElement('button'); b.id = 'prueba-registro'; b.dataset.act = 'cuenta'; b.dataset.modo = 'registro'; b.textContent = 'x'; document.body.appendChild(b); });
  await pB.click('#prueba-registro');
  await pB.waitForSelector('#formCuenta #inv-creador', { timeout: 8000 }).catch(() => {});
  ok(!!(await pB.$('#formCuenta #inv-creador')), 'El registro tiene el campo "Código de creador (opcional)"');
  ok(!!(await pB.$('#formCuenta [data-inv="nota-invitado"]')), 'Y la nota "Te invitó un amigo: … pack de bienvenida"');
  await pB.fill('#cu-nombre', 'Beto Amigo');
  await pB.fill('#cu-email', `beto.${Date.now()}@prueba.example`);
  await pB.fill('#cu-clave', 'ClaveBuena123');
  await pB.evaluate(() => { for (const id of ['cu-terminos', 'cu-edad']) { const c = document.getElementById(id); if (c && !c.checked) c.click(); } });
  await pB.fill('#inv-creador', 'productor-prueba');
  await pB.screenshot({ path: path.join(CAP, 'invitar_registro_390.png') });
  await pB.click('#cu-btn');
  await pB.waitForFunction(() => window.Api.logueado(), null, { timeout: 10000 }).catch(() => {});
  const B = await pB.evaluate(() => window.Api.estado.jugador && window.Api.estado.jugador.id);
  ok(B > 0, 'Cuenta creada desde el formulario');
  const inv = JSON.parse(php(`echo json_encode(Db::fila('SELECT invitador_id, estado, bienvenida, instalacion FROM invitaciones WHERE invitado_id = ${Number(B) || 0}'));`) || 'null');
  ok(!!inv && Number(inv.invitador_id) === A && inv.estado === 'ok' && Number(inv.bienvenida) === 1 && /^[a-f0-9]{32}$/.test(inv.instalacion || ''), 'En el servidor: invitado por Ana, cuenta, con pack y la instalación del aparato');
  ok(php(`echo (int) Db::valor("SELECT COUNT(*) FROM buzon WHERE jugador_id = ${Number(B) || 0} AND ref IN ('invitar:bienvenida', 'aliado:uso')");`) === '2', 'Pack de bienvenida y regalo del creador en su buzón');
  ok(php(`echo Db::valor('SELECT a.codigo_ver FROM aliados_usos u JOIN aliados a ON a.id = u.aliado_id WHERE u.jugador_id = ${Number(B) || 0}');`) === 'PRODUCTOR-PRUEBA', 'Queda asociado al creador PRODUCTOR-PRUEBA');
  await cerrarVentanas(pB);
  await pB.evaluate(() => { window.Invitar.invalidar(); });
  await pB.click('nav button[data-tab="inicio"]');
  await abrirSala(pB);
  await pB.click('#tab-inicio [data-inv="abrir-lista"]');
  await pB.waitForSelector('#overlay.on .inv-modal [data-inv="creador"]', { timeout: 8000 }).catch(() => {});
  txt = await texto(pB, '#overlay.on .inv-modal');
  ok(!!txt && /Llegaste invitado por Ana/.test(txt) && /Apoyas a Canal de Prueba/.test(txt), 'El amigo ve quién lo invitó y el creador que apoya');
  await cerrarVentanas(pB);

  console.log('El amigo avanza: premios para quien invitó');
  await cB.close();   // el amigo deja de jugar en este aparato: su partida de la nube pasa al capítulo 2
  php(`Db::q('INSERT OR IGNORE INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?)', [${B}, json_encode(['chapter' => 0, 'day' => 1]), time()]);
       Db::q("UPDATE partidas SET datos = json_set(datos, '$.chapter', 1) WHERE jugador_id = ?", [${B}]);
       for ($i = 0; $i < 3; $i++) Db::q('INSERT OR IGNORE INTO actividad (jugador_id, dia) VALUES (?, ?)', [${B}, date('Y-m-d', time() - $i * 86400)]);`);
  await pA.evaluate(() => { window.Invitar.invalidar(); });
  await pA.click('nav button[data-tab="inicio"]');
  await pA.waitForFunction(() => window.Invitar.datos && window.Invitar.datos.activos === 1, null, { timeout: 10000 }).catch(() => {});
  await pA.waitForTimeout(300);
  await abrirSala(pA);
  txt = await texto(pA, '#tab-inicio [data-inv="tarjeta"]');
  ok(!!txt && txt.includes('1 amigo activo') && txt.includes('Mis invitados (1)'), 'Tarjeta: 1 amigo activo y "Mis invitados (1)" — ' + txt);
  ok(php(`echo (int) Db::valor("SELECT COUNT(*) FROM buzon WHERE jugador_id = ${A} AND ref LIKE 'invitar:%'");`) === '3', 'Ana recibió 3 premios en el buzón (capítulo 2, 3 días y la meta de 1 amigo)');
  await pA.click('#tab-inicio [data-inv="abrir-lista"]');
  await pA.waitForSelector('#overlay.on .inv-modal [data-inv="amigo"]', { timeout: 8000 }).catch(() => {});
  txt = await texto(pA, '#overlay.on .inv-modal [data-inv="amigo"]');
  ok(!!txt && /Beto/.test(txt) && /✓ Llega al capítulo 2/.test(txt) && /✓ Juega 3 días distintos \(3\/3\)/.test(txt) && !/✓ Entra a una asociación/.test(txt), 'El amigo con sus etapas: capítulo 2 ✓, 3 días ✓, asociación todavía no — ' + txt);
  ok(await pA.evaluate(() => !!document.querySelector('#overlay.on [data-inv="meta-1"].ok')), 'La meta de 1 amigo activo sale lograda');
  await pA.screenshot({ path: path.join(CAP, 'invitar_lista_amigo_390.png') });
  await cerrarVentanas(pA);

  console.log('Pestaña Asociación del chat: botón "Invitar"');
  php(`Db::q("INSERT INTO asociaciones (servidor_id, nombre, nombre_clave, siglas, color, creado) VALUES (1, 'Equipo Ana', 'equipo ana', 'EQA', '#22aaff', ?)", [time()]); $id = Db::ultimoId();
       Db::q("INSERT INTO asociacion_miembros (asociacion_id, jugador_id, cargo, desde) VALUES (?, ?, 'presidente', ?)", [$id, ${A}, time()]);
       Db::q("INSERT INTO asociacion_miembros (asociacion_id, jugador_id, cargo, desde) VALUES (?, ?, 'socio', ?)", [$id, ${B}, time()]);`);
  await pA.evaluate(async () => { await window.Api.refrescar(); window.Invitar.invalidar(); await window.Invitar.cargar(); });
  await pA.evaluate(() => { const b = document.getElementById('chat-btn'); if (b) { b.hidden = false; b.click(); } });
  await pA.waitForTimeout(200);
  await pA.evaluate(() => { const t = document.querySelector('[data-chat-tab="asociacion"]'); if (t) t.click(); });
  await pA.waitForSelector('#inv-asoc:not([hidden]) [data-inv="asoc-invitar"]', { timeout: 8000 }).catch(() => {});
  txt = await texto(pA, '#inv-asoc');
  ok(!!txt && /Tu asociación necesita 3 productoras más/.test(txt) && /Invitar/.test(txt), 'Asociación de 2: "Tu asociación necesita 3 productoras más" + Invitar — ' + txt);
  await pA.click('#inv-asoc [data-inv="asoc-invitar"]');
  const ult2 = await pA.evaluate(() => window.__invitarUltimo);
  ok(!!ult2 && decodeURIComponent(ult2.url).includes('[EQA]') && decodeURIComponent(ult2.url).includes('?ref=' + codigoA), 'Invitar desde la asociación: WhatsApp con las siglas y tu enlace');
  ok(await sinDesborde(pA), 'Sin desplazamiento horizontal');
  await pA.screenshot({ path: path.join(CAP, 'invitar_asociacion_390.png') });
  await pA.evaluate(() => { const t = document.querySelector('[data-chat-tab="servidor"]'); if (t) t.click(); });
  ok(await pA.evaluate(() => { const e = document.getElementById('inv-asoc'); return !e || e.hidden; }), 'En la pestaña Servidor no se ve');
  await pA.evaluate(() => { const b = document.querySelector('[data-chat="cerrar"]'); if (b) b.click(); });
  ok(php(`Invitaciones::evaluar(${A});`) === '' && php(`echo (int) Db::valor("SELECT COUNT(*) FROM buzon WHERE jugador_id = ${A} AND ref = 'invitar:etapa:${B}:asociacion'");`) === '1', 'Beto en una asociación: premio de esa etapa para Ana');

  console.log('Vitrina: insignia "Productor Aliado" y letrero dorado');
  php(`Db::q("INSERT OR IGNORE INTO distintivos (jugador_id, clave, creado) VALUES (?, 'letrero_dorado', ?)", [${A}, time()]); Db::q('DELETE FROM visitas_vitrinas');`);
  await pA.evaluate((id) => window.Visitas.abrir(id), JUAN);
  await pA.waitForSelector('[data-inv="dist-aliado"]', { timeout: 8000 }).catch(() => {});
  ok(!!(await pA.$('[data-inv="dist-aliado"]')), 'La vitrina del creador muestra "Productor Aliado"');
  await pA.screenshot({ path: path.join(CAP, 'invitar_vitrina_aliado_390.png') });
  await pA.evaluate(() => window.Visitas.cerrar());
  await pA.evaluate((id) => window.Visitas.abrir(id), A);
  await pA.waitForSelector('[data-inv="letrero-sede"]', { timeout: 8000 }).catch(() => {});
  ok(!!(await pA.$('[data-inv="letrero-sede"]')) && !!(await pA.$('[data-inv="dist-letrero"]')), 'Con 10 amigos activos: letrero dorado sobre la sede y en las etiquetas');
  ok(await sinDesborde(pA), 'Sin desplazamiento horizontal');
  await pA.screenshot({ path: path.join(CAP, 'invitar_vitrina_letrero_390.png') });
  await pA.evaluate(() => window.Visitas.cerrar());

  console.log('El creador en su cuenta y el código en "Canjear código"');
  const pJ = await abrir(cJuan, true);
  await abrirSala(pJ);
  await pJ.waitForSelector('#tab-inicio [data-inv="aliado"]', { timeout: 10000 }).catch(() => {});
  txt = await texto(pJ, '#tab-inicio [data-inv="aliado"]');
  ok(!!txt && /PRODUCTOR-PRUEBA/.test(txt) && /· 1 jugador$/.test(txt), 'El creador ve su código y cuántos lo usaron — ' + txt);
  ok(php(`echo (int) Db::valor("SELECT COUNT(*) FROM buzon WHERE jugador_id = ${JUAN} AND ref LIKE 'aliado:creditos:%'");`) === '1', 'Sus créditos del mes llegaron al buzón');
  const cF = await nuevoContexto(browser);
  const F = await registrar(cF, 'Fan Codigo');
  const pF = await abrir(cF, true);
  await pF.waitForFunction(() => { const b = document.getElementById('buzonBtn'); return b && !b.hidden; }, null, { timeout: 8000 }).catch(() => {});
  await pF.click('#buzonBtn');
  await pF.waitForSelector('#bz-codigo', { timeout: 5000 }).catch(() => {});
  if (await pF.$('#bz-codigo')) {
    await pF.fill('#bz-codigo', 'Productor-Prueba');
    await pF.click('#bz-canjear-btn');
    await pF.waitForTimeout(1200);
  }
  ok(php(`echo Db::valor('SELECT canal FROM aliados_usos WHERE jugador_id = ${F}');`) === 'codigo', '"Canjear código" con PRODUCTOR-PRUEBA lo asocia al creador (canal codigo)');
  ok(await pF.evaluate(() => /Regalo de Canal de Prueba|Canal de Prueba/.test(document.body.innerText)), 'Se abre el mensaje del regalo en el buzón');

  ok(errores.length === 0, 'Sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  const log = (() => { try { return fs.readFileSync(path.join(TMP, 'php.log'), 'utf8'); } catch (e) { return ''; } })();
  ok(!/fatal|warning|deprecated|notice/i.test(log), 'Sin errores de PHP' + (log ? ': ' + log.slice(0, 300) : ''));
  await browser.close();
  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo bien');
  fin(fallas ? 1 : 0);
})().catch((e) => { console.error(e); fin(1); });
