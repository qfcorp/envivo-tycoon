/* Service worker de EN VIVO Tycoon: hace que el juego funcione sin internet.
   - Archivos del juego (app shell): primero desde la caché, si no, de la red.
   - Fuentes de Google: primero de la red (y se guardan); sin internet, desde la caché.
   Al cambiar archivos del juego, sube el número de VERSION para que se actualicen. */
'use strict';

const VERSION = 'envivo-v22';
const SHELL_CACHE = VERSION + '-shell';
const FONT_CACHE = VERSION + '-fonts';

const SHELL = [
  './',
  './index.html',
  './js/datos.js',
  './js/logic.js',
  './js/temporadas.js', // eventos especiales por fecha (Navidad, Fin de año, Halloween...)
  './js/sede.js',       // mejoras de la sede (extensión)
  './js/decoracion.js', // decoración del local (extensión)
  './js/logros.js',     // logros y libro de combos (extensión)
  './js/ui.js',
  './js/art.js',
  './js/plan_evento.js', // plan de personal y cámaras (opcional)
  './js/movilizacion.js', // movilización y flota (taxi, vehículos, escena al salir al aire)
  './js/ayuda.js',      // botones "?" con explicaciones cortas
  './js/sound.js',      // opcional: si no existe, no rompe la instalación
  './js/musica.js',     // música de fondo (opcional)
  './js/soporte.js',    // ayuda y soporte (opcional)
  './js/recuperar.js',  // "¿Olvidaste tu contraseña?" (opcional, server/INTEGRAR_CORREO.md)
  './js/googleplay.js', // compras de Google Play dentro de la app de Android (opcional)
  './js/cuenta.js',     // borrar la cuenta y aceptar términos (Google Play)
  './js/analitica.js',  // analítica propia (opcional)
  './js/pwa.js',
  './js/errores.js',   // reporte de errores del juego (opcional)
  './js/api.js',
  './js/premium.js',
  './js/mercado.js',
  './js/chat.js',
  './js/intento.js',    // eventos en línea (copia de server/validador/intento.js)
  './js/liga.js',       // Liga Semanal
  './js/festival.js',   // Mega Festival
  './js/duelos.js',     // Duelo de Productoras
  './js/desafio.js',    // Desafío del Día
  './js/copas.js',      // Copa de Servidores
  './js/servidores.js', // Tu servidor: salud, mudanza y fusiones
  './js/vip.js',        // nivel VIP 1–10, regalos de asociación y Mecenas
  './js/pase.js',       // Pase de Temporada
  './js/misiones.js',   // Misiones del día y de la semana
  './js/diario.js',     // Premio diario (7 días)
  './js/estrellas.js',  // Personal estrella y Pase de Copa
  './js/impulsos.js',   // Equipo de obra extra, Fondo de crecimiento y Tarjeta semanal
  './js/guia.js',       // guía "toca aquí" del primer evento
  './js/guias.js',      // guías cortas de cada sección (primera vez)
  './js/escena.js',     // franja animada del evento en vivo (opcional)
  './js/visitas.js',    // visitar productoras de otros jugadores
  './js/compartir.js',  // compartir por WhatsApp, calificar y novedades (opcional)
  './js/push.js',       // notificaciones push: aviso previo y ajustes (opcional)
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
  // Textos del juego por idioma (se cargan al elegir el idioma; aquí quedan para jugar sin internet)
  './js/lang/juego/en.js',
  './js/lang/juego/pt-BR.js',
  './js/lang/juego/fr.js',
  './js/lang/juego/de.js',
  './js/lang/juego/it.js',
  './js/lang/juego/ru.js',
  './js/lang/juego/tr.js',
  './js/lang/juego/id.js',
  './js/lang/juego/zh-CN.js',
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
    // La tienda, los pagos, los paneles, el bot y las páginas legales SIEMPRE van al servidor (nunca desde la caché):
    // así el saldo de créditos y las compras están siempre al día (auditoría A-16).
    if (/^\/(api\/|pago\.php|pago-assets\/|admin\.php|control(\/|$)|discord(\/|$)|\.well-known\/|terminos\.html|privacidad\.html)/.test(url.pathname)) return;
    event.respondWith(cacheFirstShell(req, event));
  }
});

/* ---------- Notificaciones push (server/INTEGRAR_PUSH.md, js/push.js) ----------
   El servidor manda {t: título, b: cuerpo, u: ruta del juego, tag: categoría}. Al tocarla se abre (o enfoca) el juego.
   Si el navegador cambia la suscripción, se vuelve a registrar sola con la misma cuenta (la galleta va en el fetch). */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { b: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(String(d.t || 'EN VIVO Tycoon').slice(0, 80), {
    body: String(d.b || '').slice(0, 200), icon: './icons/icon-192.png', tag: String(d.tag || 'envivo'),
    data: { u: typeof d.u === 'string' ? d.u : '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let u = '/';
  try { const x = new URL((event.notification.data && event.notification.data.u) || '/', self.location.origin); if (x.origin === self.location.origin) u = x.href; } catch (e) { /* inicio */ }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      try { await w.focus(); if ('navigate' in w && w.url !== u) await w.navigate(u); } catch (e) { /* ya enfocado */ }
      return;
    }
    await self.clients.openWindow(u);
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const pedir = (ruta, body) => fetch(ruta, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: JSON.stringify(body) }).then((r) => r.json());
    const est = await pedir('/api/push/estado', {});
    if (!est || !est.publica) return;
    const k = est.publica.replace(/-/g, '+').replace(/_/g, '/');
    const key = Uint8Array.from(atob(k + '='.repeat((4 - (k.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await pedir('/api/push/suscribir', { suscripcion: sub.toJSON(), anterior: event.oldSubscription ? event.oldSubscription.endpoint : undefined });
  })().catch(() => {}));
});
