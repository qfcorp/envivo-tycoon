/* Junta index.html + js/*.js en un solo archivo: dist/envivo-tycoon.html
   (sirve para abrirlo sin internet o publicarlo como página). Uso: node tools/build_single.js
   En index.html solo el español va al inicio y varios módulos llevan `defer`; aquí va TODO incrustado
   (los idiomas y los textos del juego de cada idioma, antes de js/i18n.js), así funciona sin pedir archivos. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CODES = ['en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
// Idiomas que index.html carga bajo pedido (js/i18n.js los pide al elegirlos): aquí van TODOS incrustados ANTES de
// js/i18n.js, así la versión de un solo archivo no pide nada (cada diccionario se registra solo en window.I18N_LANG / I18N_JUEGO)
const extras = [];
CODES.forEach((c) => { extras.push(`js/lang/${c}.js`); extras.push(`js/lang/juego/${c}.js`); });
const extraTags = extras.filter((f) => fs.existsSync(path.join(root, f)) && !html.includes(`src="${f}"`)).map((f) => `<script src="${f}"></script>`).join('\n');
if (extraTags) html = html.replace('<script src="js/i18n.js"></script>', () => `${extraTags}\n<script src="js/i18n.js"></script>`);
// Cada <script src="js/..."> (con o sin defer) se reemplaza por su código. Los diferidos van al final, en su orden.
const diferidos = [];
html = html.replace(/<script( defer)? src="(js\/[^"]+)"><\/script>\n?/g, (m, defer, f) => {
  const file = path.join(root, f);
  if (!fs.existsSync(file)) return '';
  const code = `<script>\n${fs.readFileSync(file, 'utf8')}\n</script>\n`;
  if (defer) { diferidos.push(code); return ''; }
  return code;
});
html = html.replace('</body>', () => diferidos.join('') + '</body>');
// La parte de app instalable necesita archivos aparte: no va en la versión de un solo archivo
html = html.replace(/<!-- PWA -->[\s\S]*?<!-- \/PWA -->\s*/, '');
if (/<script[^>]* src="js\//.test(html)) throw new Error('No se pudo incrustar un script');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'envivo-tycoon.html'), html);
console.log('✅ dist/envivo-tycoon.html creado (' + Math.round(html.length / 1024) + ' KB)');
// Versión para publicar como página en Claude (sin <html>, <head>, <body>)
const art = html.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '').replace(/<\/html>\s*/i, '').replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), art);
console.log('✅ dist/artifact.html creado');
// Copia para el demo: arranca una sola vez con la partida preparada del capítulo 4 (ver docs/DEMO.md)
fs.writeFileSync(path.join(root, 'dist', 'artifact_demo.html'), "<script>window.__ENVIVO_DEMO='cap4';window.__ENVIVO_FECHA='2026-12-20';</script>\n" + art.replace('<title>EN VIVO Tycoon</title>', '<title>EN VIVO Tycoon Demo</title>'));
console.log('✅ dist/artifact_demo.html creado');
