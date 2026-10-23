# Errores del juego (integración)

Reporte de errores de JavaScript de los celulares de los jugadores **sin servicios de terceros**: el juego los manda a
`POST /api/error`, el servidor los agrupa en SQLite y se ven en el Centro de Control > **Errores**.

## Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `js/errores.js` | Escucha `error` y `unhandledrejection`, y expone `window.ReportarError(e, contexto)`. Sin repetidos (mensaje + archivo + línea), máximo 10 por sesión, lotes cada 2 s (y al cerrar la página) con `navigator.sendBeacon` (text/plain; si no hay, `fetch` keepalive con `X-Envivo: 1`). Manda: mensaje, pila (2 KB), archivo, línea, columna, url (solo la ruta + `?origen=android`), versión (la caché activa del service worker `envivo-vNN-shell`, o `window.ENVIVO_VERSION`), idioma (`I18N.idioma`), plataforma (`web` / `android` por `?origen=android` o `sessionStorage.envivo_origen` / `pwa`), memoria y conexión si el navegador las da, últimos 6 toques (solo `data-act` / `data-tab` / `data-accion` / id, nunca textos), contexto y tipo. Quita correos y números largos. Nunca lanza. **Apagado** con `navigator.webdriver` (pruebas) salvo `window.__ENVIVO_ERRORES = true`; `window.__ENVIVO_ERRORES = false` lo apaga siempre; sin http(s) no manda nada. `window.EnVivoErrores = { reportar, enviar, pendientes, estado }`. No tiene textos para el jugador (nada en pantalla, no usa js/lang). |
| `server/src/Errores.php` | Limpieza de datos personales, recortes, huella (mensaje normalizado + archivo + línea), límites (30/hora por IP, 3000/hora en total, 10 por lote, máx. 3 iguales por lote), grupos con total / primera / última vez, resolver / reabrir (con auditoría), alertas, conteos, limpieza de > 30 días. Si un grupo resuelto vuelve a pasar en una versión **más nueva** (orden natural: v17 > v16) que la última vista al resolverlo, se reabre solo; con la misma versión (celulares sin actualizar) no. |
| `server/src/ErroresApi.php` | `POST /api/error` (ver abajo). |
| `server/src/migraciones/errores.sql` | Tablas `errores_grupos` y `errores_cliente` (se aplican solas). La IP no se guarda: solo una huella HMAC de 16 caracteres para contar afectados. |
| `server/bin/errores.php` | Limpieza diaria (`--dias=N`, `--resumen` solo muestra conteos). |
| `server/public/control/lib/errores.php` | Pestaña Errores: KPIs, grupos que más pasaron en 24 h / 7 días (con / sin resueltos), detalle (pila, por versión / plataforma / idioma / navegador, últimas 25 veces con los últimos pasos y el jugador si tenía sesión), **Marcar resuelto** (nota opcional, confirmación, CSRF, auditoría `errores_resolver`) y **Reabrir** (`errores_reabrir`). `cc_errores_alerta()` (línea roja en el Resumen) y `cc_errores_insignia()`. |
| `server/tests/pruebas_errores.php` | 69 pruebas por HTTP: API, privacidad, agrupación, sesión, reapertura por versión, límite por IP, limpieza, panel (CSRF, auditoría, aviso en el Resumen). |
| `tests/test_errores.js` | Playwright + Chromium con el PHP real: el juego lanza un error, una promesa sin atender y un `ReportarError`; llegan por sendBeacon con plataforma android, versión del service worker, sin datos personales; tope de 10; apagado sin la bandera; panel (lista, detalle, marcar resuelto, aviso del Resumen). Capturas `tests/capturas/errores_*.png`. |

## POST /api/error

- **Va antes de la revisión de `X-Envivo`** en `api.php` porque `sendBeacon` no puede mandar cabeceras. En su lugar
  rechaza (403 `cabecera_requerida`) lo que trae `Sec-Fetch-Site: cross-site` o un `Origin` de otro dominio / puerto.
- Sin sesión obligatoria; si hay sesión se guarda `jugador_id`.
- Cuerpo JSON (Content-Type indiferente, máx. 32 KB): `{"errores": [{mensaje, pila, archivo, linea, columna, url, version, idioma, plataforma, memoria, conexion, ultimo_paso, contexto, tipo}]}` (o un error suelto).
- Respuestas: `200 {ok, guardados, descartados}` · `400 datos_invalidos` · `405` · `413` · `429 limite_intentos` (pasó 30/hora por IP o 3000/hora en total).
- No hay códigos de error nuevos (usa `cabecera_requerida`, `datos_invalidos`, `limite_intentos`, que ya están en `docs/traducciones/errores.json`).

## Ediciones en archivos compartidos (todas de una línea, ancladas)

`index.html` (dentro del bloque `<!-- PWA -->`, antes de `js/pwa.js`, así `tools/build_single.js` no lo mete en `dist/`, donde no hay servidor):

```html
<!-- Errores del juego (server/INTEGRAR_ERRORES.md): async y antes que todo el código; dentro de PWA porque necesita el servidor (no va en dist/) -->
<script async src="js/errores.js"></script>
```

Es `async` (no bloquea) para no pasar el límite de 14 scripts síncronos de `tests/test_browser.js`; como es el primer
script del `<head>` y pesa ~11 KB, en la práctica corre antes que el resto.

`sw.js` (lista SHELL, sin subir VERSION): `'./js/errores.js',   // reporte de errores del juego (opcional)` después de `'./js/pwa.js',`.

`server/public/api.php` (después de la línea de `/plux/3ds`):

```php
    // Errores del juego (server/INTEGRAR_ERRORES.md): /api/error va ANTES de X-Envivo (sendBeacon no manda cabeceras; revisa el origen él mismo)
    if (class_exists(\EnVivo\ErroresApi::class) && \EnVivo\ErroresApi::esRuta($ruta)) \EnVivo\ErroresApi::responder($ruta, $metodo);
```

`server/public/control/index.php`:

```php
foreach ([..., 'servidores', 'errores'] as $f) require __DIR__ . '/lib/' . $f . '.php';
        'errores' => cc_t_errores(),                                          // en el match de pestañas
            str_starts_with($accion, 'errores_') => cc_a_errores($accion, $q),   // en cc_post_accion
```

`server/public/control/lib/base.php`:

```php
    'errores' => 'Errores',                                                          // en CC_PESTANAS
        if (function_exists('cc_errores_insignia')) $o['errores'] = cc_errores_insignia();   // en cc_insignias
```

`server/public/control/lib/resumen.php` (después del párrafo de introducción del Resumen):

```php
    if (function_exists('cc_errores_alerta')) $h .= cc_errores_alerta();   // errores nuevos del juego (lib/errores.php)
```

## Para el coordinador

- **Cron** (en `server/deploy/instalar.sh`, dentro de `CRON_JUEGO`; no se editó):

  ```
  40 4 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/errores.php >> /var/log/envivo-tareas.log 2>&1
  ```

- **correr.sh**: agregar `errores` al bucle de la sección 3c (`for suite in discord festival ... demo_datos errores; do`).
  No se editó para no chocar con las otras ramas.
- **Opcional, configuración**: `ERRORES_ALERTA=5` en `/etc/envivo/config.env` (cuántas veces tiene que pasar un error
  NUEVO, visto por primera vez en las últimas 24 h, para avisar en el Resumen; 5 por defecto).
- **Opcional, nginx** (`deploy/ops/nginx-envivo-limites.conf`): `/api/error` ya tiene límite propio en PHP; si se quiere
  uno en nginx, una línea `"~^POST:/api/error/?$" $binary_remote_addr;` en el mapa de la zona del chat.
- `window.ReportarError(e, 'modulo.accion')` se puede usar desde cualquier módulo en un `catch` (si `js/errores.js` no
  cargó, comprobar antes: `window.ReportarError && window.ReportarError(e, '...')`).

## Auditoría

| Acción | Cuándo |
|---|---|
| `errores_resolver` | grupo marcado resuelto (con la versión más nueva vista y la nota) |
| `errores_reabrir` | grupo reabierto a mano |
| `control_csrf_rechazado` | POST sin CSRF válido o desde otro sitio (de `index.php`) |
