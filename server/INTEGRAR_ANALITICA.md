# Analítica propia (integración)

Analítica del juego **sin SDK de terceros**: el juego anota eventos en una cola, los manda en lotes a
`POST /api/eventos`, el servidor los guarda 90 días y un cron arma los resúmenes que muestra el Centro de Control
(pestaña **Analítica**).

## Archivos nuevos

| Archivo | Qué es |
|---|---|
| `js/analitica.js` | Cola de eventos (`window.Analitica`), lotes por `fetch` (con `X-Envivo: 1`) cada 30 s o con 20 eventos, `sendBeacon` al esconder/cerrar la página, sesión y `sesion_fin`, pasos de la guía (lee `Guia.estado()`, sin tocar `js/guia.js`) |
| `server/src/Analitica.php` | `recibir()` (revisión del lote), `agregar()` (resúmenes), `limpiar()` (90 días), lecturas para el panel |
| `server/src/AnaliticaApi.php` | Ruta `/api/eventos` (`esRuta` / `responder`, como `PaseApi`) |
| `server/src/migraciones/analitica.sql` | Tablas `eventos`, `analitica_instalaciones`, `analitica_dia`, `analitica_cohortes`, `analitica_embudo`, `analitica_meta` y el trigger de cuenta borrada (se aplica solo) |
| `server/bin/analitica.php` | Resúmenes (cron). `--dias N` (por defecto 35), `--hoy AAAA-MM-DD` |
| `server/public/control/lib/analitica.php` | Pestaña "Analítica" del Centro de Control |
| `server/tests/pruebas_analitica.php` | Pruebas del servidor (datos sintéticos con resultados calculados a mano, HTTP, panel, Playwright) |
| `tests/test_analitica.js` | Pruebas del juego (cola, lotes, beacon, sin internet, opción "no enviar", ganchos de ui.js) |
| `docs/traducciones/errores_nuevos/analitica.json` | Código nuevo `analitica_invalida` (10 idiomas) para unir a `errores.json` |
| `tests/capturas/analitica_*.png` | Capturas de la pestaña (celular y escritorio, cohortes, embudo) |

## Cambios en archivos compartidos (todos ya puestos en esta rama)

### `server/public/api.php` (1 línea + comentario, ANTES de la revisión de `X-Envivo`)

```php
    if ($ruta === '/plux/3ds') api_plux_3ds();
    // Analítica propia (server/INTEGRAR_ANALITICA.md): /api/eventos va ANTES de X-Envivo (sendBeacon no pone cabeceras; revisa el mismo sitio)
    if (class_exists(\EnVivo\AnaliticaApi::class) && \EnVivo\AnaliticaApi::esRuta($ruta)) \EnVivo\AnaliticaApi::responder($ruta, $metodo, Sesiones::jugadorId());
```

Va antes de la línea de `X-Envivo` porque `navigator.sendBeacon` no puede poner cabeceras propias. `AnaliticaApi`
hace su propia revisión: con `X-Envivo: 1` pasa; sin ella, solo si `Sec-Fetch-Site: same-origin` o el `Origin` es el
del juego (si no: 403 `cabecera_requerida`). La sesión es opcional (`Sesiones::jugadorId()`, puede ser null).

### `index.html` (1 línea, después de googleplay.js)

```html
<script defer src="js/analitica.js"></script>
```

### `sw.js` (1 línea en la lista del caché; **sin** subir `VERSION`, lo hace el coordinador)

```js
  './js/analitica.js',  // analítica propia (opcional)
```

### `js/ui.js` (ganchos; si `js/analitica.js` no está, no pasa nada)

1. Ayuda `AN()` y `anVista()` (antes de `const temaDeEvento`):
   ```js
   const AN = (n, d) => { try { if (window.Analitica) window.Analitica.evento(n, d); else if ((window.__anCola = window.__anCola || []).length < 100) window.__anCola.push([n, d]); } catch (e) { /* sin analítica */ } };
   let anVistaPrev = '';
   function anVista() { ... tienda_abierta / modo_online_abierto { modo } una vez por entrada ... }
   ```
   (`window.__anCola`: lo que se anota antes de que cargue el script diferido; `analitica.js` lo toma al cargar.)
2. `render()`: `anVista();` justo antes de `({ inicio: renderInicio, ... })[tab]();`
3. `case 'go-live'`: `AN('evento_iniciado', { tipo: ty, capitulo: S.chapter, dia: S.day });` después de `const ty = ...`
4. `finish()`: `AN('evento_terminado', { tipo: ty, estrellas: r.stars, capitulo: S.chapter, dia: S.day });` después de `const r = f.result;`
5. `showChapterDone()`: `AN('capitulo_completado', { capitulo: idx });` (una vez por capítulo e instalación)
6. `enviarCuenta()`: `if (reg) AN('cuenta_creada');` después del `await` de registro/entrada
7. `comprar(id)`: `AN('compra_iniciada', { producto: id, canal: enApp() ? 'google_play' : 'web_plux' });` (síncrono: no rompe el "toque reciente" de Google Play)
8. `comprarPlay()` con `r.ok`: `AN('compra_aprobada', { producto: id, canal: 'google_play' });`
9. `conectar()` al volver del pago (`?compra=ok`): `AN('compra_aprobada', { canal: 'web_plux' });` (el producto lo completa `analitica.js` con el último `compra_iniciada`)

`app_abierta` (origen web/android, idioma, versión = número del caché del service worker, `primera`), `sesion_fin`
(`duracion_s` visible acumulada) y `tutorial_paso` (`paso`, `n`; los pasos que duraron menos que la revisión de 400 ms
salen con `inferido: true`; `saltada` si se cerró la guía antes del final) los manda `analitica.js` solo.

### Centro de Control

`server/public/control/index.php`:

```php
require __DIR__ . '/lib/analitica.php';   // pestaña Analítica (server/INTEGRAR_ANALITICA.md)   // debajo del foreach de las lib
        'analitica' => cc_t_analitica(),                                                // en el match de pestañas
            str_starts_with($accion, 'analitica_') => cc_a_analitica($accion, $q),     // en cc_post_accion
```

`server/public/control/lib/base.php` (`CC_PESTANAS`): `'analitica' => 'Analítica',`

No se tocó `control.css` ni `control.js`: la pestaña usa las clases que ya existen (`kpi`, `chip-ok/aviso/mal`,
`barras`, `cc_grafico_linea` / `cc_grafico_barras`), sin `style=` (CSP).

### `server/deploy/instalar.sh` (cron de www-data, en `CRON_JUEGO`)

```
40 0 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/analitica.php >> /var/log/envivo-tareas.log 2>&1
35 1-23 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/analitica.php --dias 2 > /dev/null 2>> /var/log/envivo-tareas.log
```

### `server/tests/correr.sh`

Bloque nuevo **3e** (antes de "4. Navegador") que corre `pruebas_analitica.php` con un puerto libre.

### `tests/test_traducciones.js`

La revisión "falta el código del servidor" también acepta los códigos de `docs/traducciones/errores_nuevos/*.json`
(los que esperan unirse a `errores.json`). Al unir `analitica.json` a `errores.json` este cambio puede quedarse (sirve
para los demás módulos) o quitarse.

## Privacidad

- La instalación es un número al azar de 32 letras guardado en `localStorage` (`envivo_instalacion`). No es la IP ni el
  celular; si se borran los datos del navegador, es otra instalación.
- No se guarda IP ni navegador en `eventos` (las únicas columnas: instalación, sesión, clave, jugador_id, nombre, datos,
  t, día, recibido). El país sale de la cabecera `CF-IPCountry` de Cloudflare (solo las 2 letras, en la instalación).
- `jugador_id` lo pone el servidor con la sesión; el juego nunca lo manda (si lo manda, se ignora).
- Eventos e instalaciones sin uso se borran a los **90 días** (`limpiar()`, en el cron y al azar 1 de cada 500 lotes).
  Los resúmenes (`analitica_dia`, `_cohortes`, `_embudo`) son solo números y se quedan.
- Cuenta borrada (`jugadores.estado = 'borrado'`): un trigger quita el `jugador_id` de sus eventos e instalaciones.
- Opción del jugador: `Analitica.desactivar()` (o `?analitica=no` en la dirección) guarda `envivo_analitica_no = '1'`
  y no se anota ni se manda nada. Todavía no hay botón en Ajustes: si se quiere, un interruptor que llame a
  `Analitica.desactivar()` / `activar()` y lea `Analitica.activo()`.
- Apagar todo desde el servidor: `ENVIVO_ANALITICA=0` en `/etc/envivo/config.env` (responde `{ok:true, apagada:true}` y
  el juego vacía su cola).
- **Pendiente (legal)**: agregar a `privacidad.html` (y `docs/traducciones/legal`) un párrafo, por ejemplo:
  "Estadísticas de uso: el juego guarda un número al azar de tu navegador y qué pantallas y eventos usas (sin tu IP)
  para mejorar el juego. Se borran a los 90 días. Puedes apagarlas."

## Límites

32 KB por lote, 50 eventos por lote, 12 campos por evento (texto de hasta 80, números, sí/no; nada de objetos), 1 KB
de datos por evento, nombres de la lista o `m_<algo>` para los módulos, hora del celular corregida (más de 5 min en el
futuro o más de 7 días atrás → la del servidor), 40 lotes por instalación y 600 por conexión cada 10 minutos (429).
Un reintento con la misma clave no se cuenta dos veces (índice único instalación + clave): por eso lo que se manda por
`sendBeacon` se queda guardado y se vuelve a mandar al abrir el juego otra vez.

## Definiciones (resúmenes)

Segmento = plataforma (`web` / `android`) y país de la **primera vez** que se vio la instalación; `*` = todos,
`--` = desconocido. Todo se calcula para los 4 cortes (total, por plataforma, por país, plataforma + país).

| Número | Definición |
|---|---|
| DAU / WAU / MAU | Instalaciones distintas con algún evento ese día / en los últimos 7 / 30 días |
| Instalaciones nuevas | Instalaciones cuyo primer evento fue ese día |
| Cuentas nuevas | `jugadores.creado` ese día (sin las borradas); segmento de su primera instalación, o `--` |
| Retención D1/D7/D30 | De la cohorte (instalaciones nuevas del día, o cuentas creadas ese día), cuántas tuvieron eventos exactamente 1/7/30 días después. NULL mientras ese día no termina. Metas del panel: 25 % / 8 % / 3 % (verde ≥ meta, ámbar ≥ la mitad, rojo menos) |
| Embudo | Por cohorte de instalación: llegaron a cada paso de la guía, primer evento terminado, primer evento en ≤ 10 min |
| Primer evento en 10 min | Instalaciones nuevas con `evento_terminado` en los primeros 600 s desde su primer evento |
| Pagadores / compras / ingresos | Tabla `compras` con `estado = 'pagado'` y `pagado_en` ese día (`total`, con IVA; las revertidas no cuentan). Segmento de la instalación del jugador; sin instalación: plataforma por el canal |
| Conversión | pagadores / DAU · ARPDAU = ingresos / DAU · ARPPU = ingresos / pagadores |
| Sesión media | De cada sesión, su `sesion_fin` más largo (tope 4 h); promedio de las sesiones medidas del día |

El cron rehace los últimos 35 días cada noche (las cohortes ganan su D30) y hoy + ayer cada hora. En el panel,
"Recalcular ahora" (POST con CSRF, auditoría `analitica_recalcular`) rehace 35 días.

## Pruebas

- `php server/tests/pruebas_analitica.php` (85 casos; también en `correr.sh` 3e).
- `node tests/test_analitica.js` (34 casos; Playwright).
- Las demás pruebas del juego no ven la analítica: con `navigator.webdriver` está apagada salvo `window.__ENVIVO_ANALITICA = true`.
