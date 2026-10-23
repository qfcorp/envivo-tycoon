/* Junta index.html + js/*.js en un solo archivo: dist/envivo-tycoon.html
   (sirve para abrirlo sin internet o publicarlo como página). Uso: node tools/build_single.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of ['js/i18n.js', 'js/lang/es.js', 'js/lang/en.js', 'js/lang/pt-BR.js', 'js/lang/fr.js', 'js/lang/de.js', 'js/lang/it.js', 'js/lang/ru.js', 'js/lang/tr.js', 'js/lang/id.js', 'js/lang/zh-CN.js', 'js/datos.js', 'js/logic.js', 'js/art.js', 'js/plan_evento.js', 'js/sound.js', 'js/api.js', 'js/premium.js', 'js/mercado.js', 'js/chat.js', 'js/ui.js']) {
  const tag = `<script src="${f}"></script>`;
  if (!fs.existsSync(path.join(root, f))) { html = html.replace(tag + '\n', '').replace(tag, ''); continue; }
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  html = html.replace(tag, () => `<script>\n${code}\n</script>`);
}
// La parte de app instalable necesita archivos aparte: no va en la versión de un solo archivo
html = html.replace(/<!-- PWA -->[\s\S]*?<!-- \/PWA -->\s*/, '');
if (/<script src="js\//.test(html)) throw new Error('No se pudo incrustar un script');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'envivo-tycoon.html'), html);
console.log('✅ dist/envivo-tycoon.html creado (' + Math.round(html.length / 1024) + ' KB)');
// Versión para publicar como página en Claude (sin <html>, <head>, <body>)
const art = html.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '').replace(/<\/html>\s*/i, '').replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), art);
console.log('✅ dist/artifact.html creado');
