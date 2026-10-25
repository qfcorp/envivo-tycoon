#!/usr/bin/env node
/* Lista las claves que están en español y faltan en cada idioma, para hacer la traducción final de una sola vez.
   Español primero (PLAN.md): mientras se desarrolla, los textos nuevos se agregan SOLO en español; el juego muestra el
   español donde falta la traducción. Cuando todo está aprobado, se traduce lo que este listado dice.
   Fuentes:
     - Interfaz:          js/lang/es.js            → js/lang/<código>.js        (sin la sección `logica`)
     - Juego:             TEXTOS de js/datos.js    → js/lang/juego/<código>.js
     - Códigos de error:  docs/traducciones/errores.json y errores_nuevos/*.json ("es" → cada idioma)
     - Soporte:           docs/traducciones/soporte.json ("es" → cada idioma)
   Uso:
     node tools/pendientes_traduccion.js                 lista todo (clave = texto en español)
     node tools/pendientes_traduccion.js --resumen       solo cuántas faltan por idioma
     node tools/pendientes_traduccion.js --idioma=de     un solo idioma
     node tools/pendientes_traduccion.js --json=pendientes.json   guarda { idioma: { fuente: { clave: texto en español } } }
     node tools/pendientes_traduccion.js --estricto      sale con código 1 si falta algo (como TRADUCCION_ESTRICTA=1 en las pruebas) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n) => { const a = args.find((x) => x === '--' + n || x.startsWith('--' + n + '=')); return a === undefined ? undefined : (a.includes('=') ? a.slice(a.indexOf('=') + 1) : true); };
const leer = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const existe = (p) => fs.existsSync(path.join(ROOT, p));
const falta = (v) => v === undefined || v === null || v === '' || (typeof v === 'object' && !Object.values(v).some((x) => typeof x === 'string' && x.trim()));
const textoEs = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? (v.other || v.one || Object.values(v)[0]) : String(v));

// Idiomas: los de js/i18n.js
globalThis.I18N_LANG = {};
globalThis.I18N_JUEGO = {};
const I18N = require(path.join(ROOT, 'js/i18n.js'));
const IDIOMAS = I18N.idiomas.map((l) => l.code).filter((c) => c !== 'es');
const solo = typeof opt('idioma') === 'string' ? opt('idioma') : null;
if (solo && !IDIOMAS.includes(solo)) { console.error(`Idioma desconocido: ${solo} (hay: ${IDIOMAS.join(', ')})`); process.exit(2); }
const codigos = solo ? [solo] : IDIOMAS;

const fuentes = [];   // { nombre, archivo(c), es: {clave: texto}, de: (c) => dict|null }

// Interfaz
for (const c of ['es'].concat(IDIOMAS)) {
  const f = `js/lang/${c}.js`;
  if (existe(f)) { try { require(path.join(ROOT, f)); } catch (e) { console.error(`(no se pudo leer ${f}: ${e.message})`); } }
}
{
  const es = Object.assign({}, globalThis.I18N_LANG.es || {});
  delete es.logica;
  fuentes.push({ nombre: 'Interfaz', archivo: (c) => `js/lang/${c}.js`, es, de: (c) => globalThis.I18N_LANG[c] || null });
}

// Juego
{
  const T = require(path.join(ROOT, 'js/datos.js')).TEXTOS;
  for (const c of IDIOMAS) {
    const f = `js/lang/juego/${c}.js`;
    if (existe(f)) { try { require(path.join(ROOT, f)); } catch (e) { console.error(`(no se pudo leer ${f}: ${e.message})`); } }
  }
  fuentes.push({ nombre: 'Juego', archivo: (c) => `js/lang/juego/${c}.js`, es: T, de: (c) => globalThis.I18N_JUEGO[c] || null });
}

// Códigos de error y soporte (JSON con un objeto por idioma)
function json(nombre, f) {
  if (!existe(f)) return;
  let j;
  try { j = JSON.parse(leer(f)); } catch (e) { console.error(`(${f} no es JSON válido: ${e.message})`); return; }
  if (!j || !j.es) return;
  fuentes.push({ nombre, archivo: () => f, es: j.es, de: (c) => j[c] || null });
}
json('Códigos de error', 'docs/traducciones/errores.json');
if (existe('docs/traducciones/errores_nuevos')) {
  for (const f of fs.readdirSync(path.join(ROOT, 'docs/traducciones/errores_nuevos')).filter((x) => x.endsWith('.json')).sort()) {
    json('Códigos de error (' + f.replace(/\.json$/, '') + ')', 'docs/traducciones/errores_nuevos/' + f);
  }
}
json('Soporte', 'docs/traducciones/soporte.json');

// Comparar
const res = {};   // c → fuente → { clave: texto es }
let total = 0;
for (const c of codigos) {
  res[c] = {};
  for (const fu of fuentes) {
    const d = fu.de(c) || {};
    const faltan = {};
    for (const k of Object.keys(fu.es)) if (!k.startsWith('_') && falta(d[k])) faltan[k] = textoEs(fu.es[k]);
    const n = Object.keys(faltan).length;
    if (n) { res[c][fu.nombre] = faltan; total += n; }
  }
}

// Salida
const nombres = fuentes.map((f) => f.nombre).filter((n, i, a) => a.indexOf(n) === i);
console.log('Pendientes de traducir (español primero; ver PLAN.md)');
for (const n of nombres) {
  const cuentas = codigos.map((c) => `${c} ${Object.keys(res[c][n] || {}).length}`);
  const suma = codigos.reduce((a, c) => a + Object.keys(res[c][n] || {}).length, 0);
  if (suma) console.log(`  ${n.padEnd(34)} ${cuentas.join(' · ')}`);
}
console.log(total ? `Total: ${total} ${total === 1 ? 'clave' : 'claves'} en ${codigos.length} ${codigos.length === 1 ? 'idioma' : 'idiomas'} (revisadas: ${nombres.length} fuentes)`
  : `Nada pendiente: todo está traducido (revisadas: ${nombres.length} fuentes)`);
if (!opt('resumen') && total) {
  for (const c of codigos) {
    for (const n of nombres) {
      const l = res[c][n];
      if (!l) continue;
      const fu = fuentes.find((f) => f.nombre === n);
      console.log(`\n[${c}] ${n} — ${Object.keys(l).length} → ${fu.archivo(c)}`);
      for (const [k, v] of Object.entries(l)) console.log(`  ${k} = ${JSON.stringify(v)}`);
    }
  }
}
if (opt('json')) {
  const f = typeof opt('json') === 'string' ? opt('json') : 'pendientes_traduccion.json';
  fs.writeFileSync(f, JSON.stringify(res, null, 2) + '\n');
  console.log(`\nGuardado en ${f}`);
}
if (opt('estricto') && total) process.exit(1);
