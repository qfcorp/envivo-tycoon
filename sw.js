/* Service worker de EN VIVO Tycoon: hace que el juego funcione sin internet.
   - Archivos del juego (app shell): primero desde la caché, si no, de la red.
   - Fuentes de Google: primero de la red (y se guardan); sin internet, desde la caché.
   Al cambiar archivos del juego, sube el número de VERSION para que se actualicen. */
'use strict';

const VERSION = 'envivo-v4';
const SHELL_CACHE = VERSION + '-shell';
const FONT_CACHE = VERSION + '-fonts';

const SHELL = [
  './',
  './index.html',
  './js/logic.js',
  './js/ui.js',
  './js/art.js',
  './js/plan_evento.js', // plan de personal y cámaras (opcional)
  './js/sound.js',      // opcional: si no existe, no rompe la instalación
  './js/pwa.js',
  './js/api.js',
  './js/premium.js',
  './js/mercado.js',
  './js/chat.js',
  './js/i18n.js',
  './js/lang/es.js',
  './js/lang/en.js',
  './js/lang/pt-BR.js',
  './js/lang/fr.js',
  './js/lang/de.js',
  './js/lang/it.js',
  './js/lang/ru.js',
  './js/lang/tr.js',
  './js/lang/id.js',
  './js/lang/zh-CN.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Uno por uno: si falta un archivo opcional, los demás se guardan igual.
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* archivo opcional o sin red: se ignora */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, FONT_CACHE];
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith('envivo-') && !keep.includes(n))
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

async function networkFirstFont(request) {
  const cache = await caches.open(FONT_CACHE);
  try {
    const res = await fetch(request);
    // Las respuestas "opacas" (type 'opaque', status 0) también sirven para fuentes.
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

// Archivos del juego: se muestran al instante desde la caché y, en segundo plano, se baja la
// versión nueva para la próxima vez (así las actualizaciones llegan solas).
async function cacheFirstShell(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  const update = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  });
  if (hit) {
    if (event) event.waitUntil(update.catch(() => {}));
    return hit;
  }
  try {
    return await update;
  } catch (e) {
    // Sin internet y navegando a una página: mostrar el juego.
    if (request.mode === 'navigate') {
      const page = (await cache.match('./index.html')) || (await cache.match('./'));
      if (page) return page;
    }
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (isFont(url)) {
    event.respondWith(networkFirstFont(req));
    return;
  }
  if (url.origin === self.location.origin) {
    // La tienda, los pagos, el panel y las páginas legales SIEMPRE van al servidor (nunca desde la caché):
    // así el saldo de créditos y las compras están siempre al día.
    if (/^\/(api\/|pago\.php|admin\.php|terminos\.html|privacidad\.html)/.test(url.pathname)) return;
    event.respondWith(cacheFirstShell(req, event));
  }
});
