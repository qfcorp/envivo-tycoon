/* Prueba de las traducciones (docs/traducciones y docs/play_store).
   - soporte.json: los 10 idiomas tienen todas las claves del diccionario ES de js/soporte.js, con los mismos {marcadores}.
   - errores.json: los 10 idiomas tienen todos los códigos, con los mismos {marcadores}; cubre todos los 'codigo' que usa server/src.
   - legal/: 18 páginas (9 idiomas × términos y privacidad) con los marcadores, el aviso de traducción, las mismas secciones
     que la versión en español y sin WhatsApp.
   - play_store/: fichas de los 10 idiomas dentro de los límites de Google Play y la tabla del README con los números reales.
   Uso:  node tests/test_traducciones.js      (sale con código 1 si algo falla) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
const LIMITES = { nombre: 30, breve: 80, completa: 4000, novedades: 500 };
let fallos = 0, pruebas = 0;
const ok = (cond, msg) => { pruebas++; if (!cond) { fallos++; console.log('  ✗ ' + msg); } };
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const largo = (t) => [...t].length;   // caracteres (puntos de código), como cuenta Play Console
const marcadores = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join(',');

function revisarDiccionario(nombre, json, claves) {
  for (const code of IDIOMAS) {
    ok(json[code] && typeof json[code] === 'object', `${nombre}: falta el idioma ${code}`);
    if (!json[code]) continue;
    for (const k of claves) {
      const t = json[code][k];
      // Texto, o plurales { one, few, many, other } como en js/i18n.js (debe tener "other" y solo categorías de ese idioma)
      const variantes = typeof t === 'string' ? [t] : (t && typeof t === 'object' ? Object.values(t) : []);
      ok(variantes.length > 0 && variantes.every((x) => typeof x === 'string' && x.trim() !== ''), `${nombre}: ${code} no tiene "${k}"`);
      if (t && typeof t === 'object') {
        ok(typeof t.other === 'string', `${nombre}: ${code}.${k} es plural y le falta "other"`);
        const cats = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
        for (const c of Object.keys(t)) ok(cats.includes(c), `${nombre}: ${code}.${k} usa la categoría plural "${c}", que ${code} no tiene`);
      }
      const base = typeof json.es[k] === 'string' ? json.es[k] : json.es[k].other;
      for (const v of variantes) ok(marcadores(v) === marcadores(base), `${nombre}: ${code}.${k} marcadores ${marcadores(v)} ≠ ${marcadores(base)}`);
    }
    for (const k of Object.keys(json[code])) ok(claves.includes(k), `${nombre}: ${code} tiene la clave sobrante "${k}"`);
  }
}

// ---------------------------------------------------------------- soporte.json
console.log('soporte.json');
{
  let json = null;
  try { json = JSON.parse(leer('docs/traducciones/soporte.json')); } catch (e) { ok(false, 'soporte.json no es JSON válido: ' + e.message); }
  if (json) {
    // El diccionario ES de js/soporte.js (se lee del archivo sin ejecutarlo: el módulo usa document).
    const src = leer('js/soporte.js');
    const m = src.match(/const ES = (\{[\s\S]*?\n\s*\});/);
    ok(!!m, 'no se encontró "const ES = {...}" en js/soporte.js');
    const ES = m ? Function('"use strict"; return (' + m[1] + ');')() : {};
    const claves = Object.keys(json.es);
    for (const k of Object.keys(ES)) {
      ok(k in json.es, `soporte.json: falta la clave "${k}" de js/soporte.js`);
      ok(json.es[k] === ES[k], `soporte.json: es."${k}" no es igual al de js/soporte.js`);
    }
    for (const k of claves) ok(k.startsWith('soporte.'), `soporte.json: la clave "${k}" no empieza con soporte.`);
    revisarDiccionario('soporte.json', json, claves);
    // Si ya existen los diccionarios del juego (js/lang/*.js), avisar si alguna clave soporte.* falta allí (solo informativo).
    const dirLang = path.join(ROOT, 'js/lang');
    if (fs.existsSync(dirLang)) {
      const antes = globalThis.I18N_LANG;
      globalThis.I18N_LANG = {};   // los archivos se registran en window/globalThis
      for (const f of fs.readdirSync(dirLang).filter((x) => x.endsWith('.js'))) {
        try { Function(leer('js/lang/' + f))(); } catch (e) { console.log(`  (no se pudo leer js/lang/${f}: ${e.message})`); }
      }
      const dicc = globalThis.I18N_LANG;
      globalThis.I18N_LANG = antes;
      const faltan = [];
      for (const [code, d] of Object.entries(dicc)) for (const k of claves) if (!(k in d)) faltan.push(`${code}:${k}`);
      if (faltan.length) console.log(`  (aviso, no es fallo: js/lang aún no tiene ${faltan.length} clave(s) de soporte.json, ej. ${faltan.slice(0, 3).join(', ')})`);
    }
  }
}

// ---------------------------------------------------------------- errores.json
console.log('errores.json');
{
  let json = null;
  try { json = JSON.parse(leer('docs/traducciones/errores.json')); } catch (e) { ok(false, 'errores.json no es JSON válido: ' + e.message); }
  if (json) {
    const claves = Object.keys(json.es);
    revisarDiccionario('errores.json', json, claves);
    ok(json._codigos && typeof json._codigos === 'object', 'errores.json: falta "_codigos" (de dónde sale cada código)');
    if (json._codigos) {
      for (const k of claves) ok(k in json._codigos, `errores.json: "${k}" no está documentado en _codigos`);
      for (const k of Object.keys(json._codigos)) ok(claves.includes(k), `errores.json: _codigos.${k} no tiene texto`);
    }
    // Todos los códigos fijos que usa el servidor hoy:
    //   'codigo' => 'x' (Fallo / respuestas de pago) · Http::error(..., 'x') (4.º argumento) · Http::CODIGOS (por estado HTTP)
    const usados = new Set(), prefijos = new Set();
    const php = [];
    for (const dir of ['server/src', 'server/public']) {
      for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.php')) php.push(leer(dir + '/' + f));
    }
    for (const t of php) {
      for (const m of t.matchAll(/'codigo'\s*=>\s*'([a-z_]+)'/g)) (m[1].endsWith('_') ? prefijos : usados).add(m[1]);
      for (const m of t.matchAll(/Http::error\([^;]*?,\s*'([a-z_]+)'\)/g)) usados.add(m[1]);
      for (const m of t.matchAll(/\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'/g)) if (/codigo|cod\b|Http::error/.test(t.slice(Math.max(0, m.index - 200), m.index + 60))) { usados.add(m[1]); usados.add(m[2]); }
      const cods = t.match(/const CODIGOS = \[([\s\S]*?)\];/);
      if (cods) for (const m of cods[1].matchAll(/=>\s*'([a-z_]+)'/g)) usados.add(m[1]);
    }
    for (const m of php.join('\n').matchAll(/match \(\(int\) \$e->getCode\(\)\) \{([^}]*)\}/g)) for (const x of m[1].matchAll(/'([a-z_]+)'/g)) usados.add(x[1]);
    ok(usados.size > 40, `se esperaban más de 40 códigos en el servidor (hay ${usados.size})`);
    // Códigos de módulos que todavía esperan unirse a errores.json (docs/traducciones/errores_nuevos/<modulo>.json, mismo formato)
    const pendientes = new Set();
    const dirNuevos = path.join(ROOT, 'docs/traducciones/errores_nuevos');
    if (fs.existsSync(dirNuevos)) for (const f of fs.readdirSync(dirNuevos)) if (f.endsWith('.json')) { try { Object.keys(JSON.parse(leer('docs/traducciones/errores_nuevos/' + f)).es || {}).forEach((k) => pendientes.add(k)); } catch (e) { ok(false, 'errores_nuevos/' + f + ' no es JSON válido'); } }
    for (const c of usados) ok(claves.includes(c) || pendientes.has(c), `errores.json: falta el código del servidor "${c}"`);
    // Prefijos dinámicos: falta_<campo> y google_<estado>
    for (const p of prefijos) {
      if (p === 'falta_') ok(claves.includes('falta_dato'), 'errores.json: falta "falta_dato" para el prefijo falta_<campo>');
      else if (p === 'google_') for (const e of ['pendiente', 'rechazado', 'revertido']) ok(claves.includes('google_' + e), `errores.json: falta "google_${e}" (prefijo google_<estado>)`);
      else if (p === 'cuenta_') for (const e of ['suspendido', 'baneado', 'borrado']) ok(claves.includes('cuenta_' + e), `errores.json: falta "cuenta_${e}" (prefijo cuenta_<estado>)`);
      else if (p === 'plan_') for (const e of ['ejecutada', 'cancelada']) ok(claves.includes('plan_' + e), `errores.json: falta "plan_${e}" (prefijo plan_<estado>)`);
      else ok(false, `errores.json: prefijo dinámico nuevo en el servidor: "${p}" (agregar sus textos y este caso a la prueba)`);
    }
    // Los estados de publicación que Mercado::retirar devuelve como código ('codigo' => $p['estado'])
    for (const c of ['vendida', 'vencida', 'retirada', 'congelada', 'quitada']) ok(claves.includes(c), `errores.json: falta el estado de publicación "${c}"`);
    // Los códigos que pide el encargo
    for (const c of ['sesion_requerida', 'sin_creditos', 'limite_intentos', 'credenciales', 'email_existe', 'clave_corta', 'producto_desconocido',
      'ya_comprado', 'plux_no_disponible', 'pago_rechazado', 'mercado_sin_acceso', 'ya_vendido', 'es_tuyo', 'mensaje_bloqueado', 'silenciado']) {
      ok(claves.includes(c), `errores.json: falta el código pedido "${c}"`);
    }
  }
}

// ---------------------------------------------------------------- legal/
console.log('legal/');
{
  for (const doc of ['terminos', 'privacidad']) {
    const es = leer(`server/public/${doc}.html`);
    const h2es = (es.match(/<h2>/g) || []).length;
    const liEs = (es.match(/<li>/g) || []).length;
    for (const code of IDIOMAS.filter((c) => c !== 'es')) {
      const p = `docs/traducciones/legal/${doc}_${code}.html`;
      const existe = fs.existsSync(path.join(ROOT, p));
      ok(existe, `falta ${p}`);
      if (!existe) continue;
      const t = leer(p);
      ok(t.startsWith('<!doctype html>'), `${p}: no empieza con <!doctype html>`);
      ok(t.includes(`<html lang="${code}">`), `${p}: falta <html lang="${code}">`);
      ok(t.includes('id="aviso-traduccion"'), `${p}: falta el aviso visible de traducción`);
      ok(t.includes(`href="/${doc}.html"`), `${p}: el aviso no enlaza la versión en español`);
      for (const mk of ['[RUC]', '[CORREO DE SOPORTE]', '[DIRECCIÓN]', '[FECHA]']) ok(t.includes(mk), `${p}: falta el marcador ${mk}`);
      ok(!/whats\s*app|\[WHATSAPP\]/i.test(t), `${p}: menciona WhatsApp (el soporte es solo en el juego y por correo)`);
      ok((t.match(/<h2>/g) || []).length === h2es, `${p}: tiene ${(t.match(/<h2>/g) || []).length} secciones y el español ${h2es}`);
      ok((t.match(/<li>/g) || []).length === liEs, `${p}: tiene ${(t.match(/<li>/g) || []).length} viñetas y el español ${liEs}`);
      ok(t.includes('QFCORP SOCIEDAD POR ACCIONES SIMPLIFICADA (QF PRODUCCIONES)'), `${p}: falta la razón social exacta`);
      ok(t.includes('Pago Plux'), `${p}: falta Pago Plux`);
      // etiquetas abiertas = cerradas (chequeo simple de HTML)
      for (const tag of ['p', 'h2', 'ul', 'li', 'b', 'a', 'main', 'div']) {
        const a = (t.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length, c = (t.match(new RegExp(`</${tag}>`, 'g')) || []).length;
        ok(a === c, `${p}: <${tag}> abiertas ${a} ≠ cerradas ${c}`);
      }
    }
  }
}

// ---------------------------------------------------------------- play_store/
console.log('play_store/');
const SECCIONES = { nombre: 'Nombre de la app', breve: 'Descripción breve', completa: 'Descripción completa', claves: 'Palabras clave', novedades: 'Novedades (versión 1.0)' };
function ficha(code) {
  const t = leer(`docs/play_store/ficha_${code}.md`);
  const partes = {};
  const re = /^## (.+)$/gm;
  const marcas = [...t.matchAll(re)].map((m) => ({ titulo: m[1].trim(), ini: m.index, fin: m.index + m[0].length }));
  marcas.forEach((m, i) => { partes[m.titulo] = t.slice(m.fin, i + 1 < marcas.length ? marcas[i + 1].ini : t.length).trim(); });
  return partes;
}
const medidas = {};
for (const code of IDIOMAS) {
  const p = `docs/play_store/ficha_${code}.md`;
  if (!fs.existsSync(path.join(ROOT, p))) { ok(false, `falta ${p}`); continue; }
  const f = ficha(code);
  for (const s of Object.values(SECCIONES)) ok(typeof f[s] === 'string' && f[s] !== '', `${p}: falta la sección "## ${s}"`);
  const n = f[SECCIONES.nombre] || '', b = f[SECCIONES.breve] || '', c = f[SECCIONES.completa] || '', v = f[SECCIONES.novedades] || '';
  medidas[code] = { nombre: largo(n), breve: largo(b), completa: largo(c), novedades: largo(v) };
  ok(n === 'EN VIVO Tycoon', `${p}: el nombre debe ser "EN VIVO Tycoon" (es "${n}")`);
  ok(!b.includes('\n'), `${p}: la descripción breve debe ser una sola línea`);
  for (const [k, lim] of Object.entries(LIMITES)) ok(medidas[code][k] <= lim, `${p}: ${k} tiene ${medidas[code][k]} caracteres (máximo ${lim})`);
  const minimo = code === 'zh-CN' ? 700 : 1500;   // el chino usa ~1/3 de caracteres para el mismo texto
  ok(medidas[code].completa >= minimo, `${p}: la descripción completa es muy corta (${medidas[code].completa}, mínimo ${minimo})`);
  const claves = (f[SECCIONES.claves] || '').split('\n').filter((l) => /^\d+\.\s+\S/.test(l));
  ok(claves.length === 5, `${p}: debe tener 5 palabras clave (tiene ${claves.length})`);
  ok(/€|\$|USD/.test(c) === false, `${p}: no pongas precios en la descripción (cambian por país)`);
  // Compras opcionales y sin anuncios deben estar dichos en la descripción (honestidad / políticas de Play)
  const palabrasCompras = { es: 'compras opcionales', en: 'optional in-app purchases', 'pt-BR': 'compras opcionais', fr: 'achats intégrés facultatifs', de: 'optionale In-App-Käufe',
    it: 'acquisti in-app facoltativi', ru: 'необязательные покупки', tr: 'uygulama içi satın alımlar', id: 'pembelian opsional', 'zh-CN': '可选的应用内购买' };
  ok(c.includes(palabrasCompras[code]), `${p}: la descripción debe mencionar las compras opcionales ("${palabrasCompras[code]}")`);
  // Sin marcas reales de equipos o plataformas en la ficha (el juego usa marcas inventadas)
  for (const marca of ['vMix', 'ATEM', 'Blackmagic', 'Sony', 'Canon', 'Panasonic', 'YouTube', 'Facebook', 'TikTok', 'Twitch', 'DJI', 'LiveU', 'LigaPro', 'Kingshot', 'WhatsApp']) {
    ok(!new RegExp('\\b' + marca + '\\b', 'i').test(Object.values(f).join('\n')), `${p}: menciona la marca real "${marca}"`);
  }
}

// La tabla del README tiene que decir los mismos números que las fichas.
{
  const p = 'docs/play_store/README.md';
  if (!fs.existsSync(path.join(ROOT, p))) ok(false, `falta ${p}`);
  else {
    const t = leer(p);
    for (const code of IDIOMAS) {
      const m = medidas[code];
      if (!m) continue;
      const fila = t.split('\n').find((l) => l.startsWith(`| ${code} |`));
      ok(!!fila, `${p}: falta la fila "| ${code} |" en la tabla de límites`);
      if (!fila) continue;
      const nums = fila.split('|').map((x) => x.trim()).filter(Boolean).slice(1).map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
      const esperado = [m.nombre, m.breve, m.completa, m.novedades];
      ok(JSON.stringify(nums.slice(0, 4)) === JSON.stringify(esperado), `${p}: fila ${code} dice ${nums.slice(0, 4)} y las fichas miden ${esperado}`);
    }
  }
}

console.log('\nMedidas (caracteres): idioma · nombre/30 · breve/80 · completa/4000 · novedades/500');
for (const [code, m] of Object.entries(medidas)) console.log(`  | ${code} | ${m.nombre} | ${m.breve} | ${m.completa} | ${m.novedades} |`);
console.log(`\n${pruebas - fallos}/${pruebas} comprobaciones OK`);
if (fallos) { console.log(`✗ ${fallos} fallo(s)`); process.exit(1); }
console.log('✓ Traducciones OK');
