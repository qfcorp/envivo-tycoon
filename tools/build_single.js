/* Junta index.html + js/*.js en un solo archivo: dist/envivo-tycoon.html
   (sirve para abrirlo sin internet o publicarlo como página). Uso: node tools/build_single.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of ['js/logic.js', 'js/ui.js']) {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${code}\n</script>`);
}
if (/<script src="js\//.test(html)) throw new Error('No se pudo incrustar un script');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'envivo-tycoon.html'), html);
console.log('✅ dist/envivo-tycoon.html creado (' + Math.round(html.length / 1024) + ' KB)');
