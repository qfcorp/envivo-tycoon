# Notificaciones push (Web Push): cómo conectarlo

Funciona en Chrome de Android (también dentro de la app de Google Play: es una TWA y `android/twa-manifest.json` ya trae
`"enableNotifications": true`) y en Chrome/Edge/Firefox de escritorio. PHP puro con openssl (sin composer):
cifrado **RFC 8291** (`aes128gcm`) y firma **VAPID RFC 8292** (JWT ES256).

| Archivo | Qué es |
|---|---|
| `server/src/Push.php` | Cifrado, VAPID, suscripciones, cola con reglas, detectores, `Push::encolar()` para cualquier módulo, estadísticas |
| `server/src/PushTextos.php` | Textos de los avisos: 10 plantillas × 10 idiomas × 3 variantes (`{rival}`, `{dias}`) |
| `server/src/PushApi.php` | Rutas `POST /api/push/estado`, `/suscribir`, `/preferencias`, `/baja` (con sesión y `X-Envivo: 1`) |
| `server/src/migraciones/push.sql` | `push_suscripciones`, `push_cola`, `push_envios`, `push_jugador`, `push_marcas`. Se aplica sola (`Db::migrarModulos`) |
| `server/bin/push_claves.php` | Crea las llaves VAPID (`--escribir` las agrega al config; `--revisar` comprueba el par) |
| `server/bin/push_enviar.php` | Cron de cada minuto: detectores + cola (con candado) |
| `server/public/control/lib/push.php` | Pestaña **Notificaciones** del Centro de Control: estadísticas y "Enviar prueba" (CSRF + auditoría `push_prueba`) |
| `js/push.js` | Aviso previo propio, ajustes por categoría, botón "Notificaciones" junto a "Salir", suscripción por aparato. 10 idiomas |
| `sw.js` (bloque al final) | `push` (muestra el aviso), `notificationclick` (abre/enfoca el juego, solo rutas propias), `pushsubscriptionchange` |
| `docs/traducciones/errores_nuevos/push.json` | 5 códigos de error nuevos en 10 idiomas |
| `server/tests/pruebas_push.php`, `server/tests/push_falso.php`, `tests/test_push.js` | Pruebas (ver abajo) |

## Reglas de envío (Push.php)
- Máximo `PUSH_MAX_DIA` (3 por defecto, 1–5) por jugador y día de Guayaquil. **Ofertas**: 1 al día, nunca el último cupo, apagadas por defecto.
- Silencio **22:00–08:00 America/Guayaquil** (`ENVIVO_ZONA`): el aviso se pospone a las 08:00–08:15 (no se pierde, salvo que venza).
- Nunca el mismo texto dos veces seguidas en un aparato (las plantillas eligen otra variante; un texto propio repetido se descarta).
- Recordatorio de inactividad solo desde 3 días sin jugar (escalones 3, 7, 14, 28 días, entre 10:00 y 20:00); **nada** a quien lleva 30+ días sin jugar.
- 404/410 del servicio de push = suscripción muerta: se borra. 429/5xx/sin red: se reintenta (2, 4, 8, 16 min; 5 intentos).
- Vencimiento por defecto 24 h (buzón 48 h). Cuenta borrada: se borran sus aparatos.
- Seguridad: solo se envía a servicios de push conocidos (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`,
  `*.push.apple.com`…; https, puerto 443): un jugador no puede hacer que el servidor llame a otra dirección (SSRF).
  `notificationclick` solo abre rutas del propio juego. El endpoint viaja por POST (no queda en los registros de nginx).

## Categorías (interruptores del jugador, por aparato)
`obra` (obra/sede terminada) · `copa` (empieza la Copa / la batalla de tu servidor) · `premio` (premio diario listo; también
manda sobre los recordatorios) · `buzon` (mensaje en el buzón) · `duelo` (resultados de liga y duelos; `liga` la usa) · `ofertas` (apagada).

## Detectores (corren en el cron; cada uno solo si su tabla existe; uno roto no frena a los demás)
| Aviso | De dónde sale |
|---|---|
| Obra terminada | `sede_obras.fin` pasó hace < 6 h y no se aceleró con créditos (`creditos = 0`) |
| Empieza la Copa / la batalla | cambio de `copas.fase` (preparación / batalla), a los jugadores de los servidores de `copa_servidores`. Al instalar no avisa fases viejas |
| Duelo | `duelos` cerrado (no `vencido`) en las últimas 6 h → al **defensor** (ganado / perdido / empate, con el alias del retador) |
| Buzón | respuesta de soporte sin leer (`soporte_mensajes.autor = 'soporte'`) |
| Premio diario | tarjeta mensual activa y sin reclamar hoy (desde las 9:00) |
| Recordatorio | 3/7/14/28 días sin jugar (última actividad = entrada, partida guardada o juego abierto en un aparato suscrito) |

**Para otros módulos** (premio diario de otro módulo, liga semanal, buzón nuevo, ofertas…), una línea que nunca lanza:
```php
\EnVivo\Push::encolar($jugadorId, 'premio', 'Tu cofre diario está listo', 'Entra a reclamarlo.', '/?ir=tienda', ['enviar_desde' => $mañana9]);
// o con textos en 10 idiomas de PushTextos (se eligen al enviar en el idioma de cada aparato):
\EnVivo\Push::encolarPlantilla($jugadorId, 'buzon', 'buzon', [], '/?ir=buzon', 'buzon:mimodulo:' . $mensajeId);
```
(`clave` en `$op` evita duplicados; si el jugador no tiene aparatos suscritos devuelve `null` y no guarda nada.)

## Cambios en archivos compartidos (YA hechos en esta rama; si hay conflicto, rehacerlos así)
1. **`server/public/api.php`** — junto a las otras líneas de módulos (antes de "Salud de servidores"):
   ```php
   if (class_exists(\EnVivo\PushApi::class) && \EnVivo\PushApi::esRuta($ruta)) \EnVivo\PushApi::responder($ruta, $metodo, requiere_sesion());
   ```
2. **`index.html`** — al final, después de `js/googleplay.js`: `<script defer src="js/push.js"></script>`
3. **`sw.js`** — en `SHELL`: `'./js/push.js',` y, al final del archivo, el bloque "Notificaciones push" (3 `addEventListener`:
   `push`, `notificationclick`, `pushsubscriptionchange`). Subir `VERSION` al integrar (lo hace el coordinador una vez).
4. **Centro de Control** — `server/public/control/lib/base.php`: `'push' => 'Notificaciones',` en `CC_PESTANAS`;
   `server/public/control/index.php`: `'push'` en la lista de `require`, `'push' => cc_t_push(),` en el `match ($t)` y
   `str_starts_with($accion, 'push_') => cc_a_push($accion, $q),` en `cc_post_accion()`.

## Pendiente para el integrador (archivos compartidos que NO toqué)
- **`docs/traducciones/errores.json`**: copiar los 5 códigos de `docs/traducciones/errores_nuevos/push.json`.
- **`server/deploy/instalar.sh`** — en `CRON_JUEGO`:
  `* * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/push_enviar.php >> /var/log/envivo-push.log 2>&1`
  (y `/var/log/envivo-push.log` en `server/deploy/ops/envivo.logrotate`).
- **`server/config.env.ejemplo`**:
  ```
  ; Notificaciones push (server/INTEGRAR_PUSH.md): sudo php server/bin/push_claves.php --escribir. La PRIVADA es secreta.
  PUSH_VAPID_PUBLICA=
  PUSH_VAPID_PRIVADA=
  PUSH_VAPID_SUJETO=mailto:soporte@tukanec.com
  ; Máximo de avisos por jugador al día (1–5, por defecto 3)
  PUSH_MAX_DIA=3
  ```
  (`PUSH_HOSTS_EXTRA` existe solo para las pruebas: **nunca** ponerlo en producción.)
- **`server/tests/correr.sh`** — agregar `push` a la lista de suites de "3c. Módulos" y `tests/test_push.js` a los de navegador.
- **`dist/`** (versión de un solo archivo): reconstruir para que incluya `js/push.js` si se usa.
- Opcional: `Cuentas::borrar()` puede agregar `'push_suscripciones'` a su lista (hoy el cron ya borra los aparatos de una cuenta borrada).

## Pasos del dueño (una vez, en el VPS)
1. `cd /ruta/del/juego && sudo php server/bin/push_claves.php --escribir && sudo systemctl reload php8.3-fpm`
   (comprobar: `sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php server/bin/push_claves.php --revisar`). **No** volver a
   generarlas: si cambian, los aparatos dejan de recibir hasta que el juego se vuelva a abrir (se re-suscribe solo).
2. Cron (si no se agregó a `instalar.sh`): `sudo crontab -u www-data -e` y la línea de arriba.
3. Centro de Control › Notificaciones › "Enviar prueba" con tu correo, después de activar las notificaciones en tu celular
   (Tienda › Tu cuenta › Notificaciones).
4. App de Android: nada que cambiar (`enableNotifications: true`). En Android 13+ el sistema pide su propio permiso la primera vez.

## Pruebas
- `php server/tests/pruebas_push.php` — **151 correctas**: vector de RFC 8291 §5 byte por byte (ecdh, PRK_key, IKM, PRK, CEK,
  NONCE y el mensaje completo), ida y vuelta, GCM rechaza cambios; JWT ES256 verificado con openssl **y con node**; DER↔r||s;
  endpoints permitidos; textos (10 idiomas × 3 variantes); suscripción por cuenta/aparato; todas las reglas de la cola con reloj
  congelado; los 6 detectores; HTTP de verdad (`/api/push/*`, curl a un servicio de push falso que guarda lo recibido y se
  descifra, 410 real borra), `bin/push_enviar.php`, `bin/push_claves.php` y la pestaña del Centro de Control.
- `NODE_PATH=/opt/npm-tools/node_modules node tests/test_push.js` — **35 correctas**, servidor PHP real + Chromium 390×844 con
  `Notification`/`PushManager` falsos pero llaves P-256 reales de WebCrypto: el servidor cifra y **la página descifra con
  WebCrypto (HKDF + AES-GCM)**, una implementación independiente. Nunca pregunta al abrir; pregunta al crear la cuenta y tras
  el primer evento de 5 estrellas (`Game.finishEvent` real); "Ahora no" = 7 días, máximo 3 veces; ajustes; permiso bloqueado;
  salir da de baja. Capturas: `tests/capturas/push_*.png`.
- Lo único que no se puede probar sin internet es un servicio de push real (FCM): el cifrado sigue el vector del RFC y el JWT
  se verifica con dos implementaciones, así que debería funcionar a la primera; la prueba del Centro de Control lo confirma en vivo.
