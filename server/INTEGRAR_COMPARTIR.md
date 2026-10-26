# Compartir, calificar y novedades (`js/compartir.js`): cómo conectarlo

Tres cosas chicas para crecer, en un solo archivo nuevo (`window.Compartir`, IIFE, CSS propio `<style id="compartir-css">`,
textos en los 10 idiomas, sin dependencias). Este módulo **no toca archivos compartidos**: abajo están las líneas exactas.
`tests/test_compartir.js` las aplica en memoria (si una ya no calza, la prueba falla y lo dice).

| Archivo | Qué es |
|---|---|
| `js/compartir.js` | Calificar en Google Play, compartir por WhatsApp / imagen, novedades (lista `NOVEDADES` al principio del archivo) |
| `tests/test_compartir.js` | Textos + navegador 390x844 con las líneas aplicadas; capturas en `tests/capturas/compartir_*.png` |

## 1. Calificar el juego (cumple la política de Google Play)

- **Cuándo:** después de un evento de **5⭐** recién jugado (no al recargar), ya con **3 eventos o más**, como mucho **una vez
  cada 30 días** y **3 veces en todo el juego**. Nunca durante la guía del primer evento (`Guia.activa()` / `#guia`), nunca en
  eventos en línea (esos usan otra pantalla de resultado y `S.intento`), nunca encima de otra ventana ni en pleno evento: espera
  a que la pantalla quede libre (hasta 90 s; si no, lo deja). Si ya tocó "Opinar en Google Play", no vuelve a salir.
  Estado en `localStorage['envivo_calificar_v1'] = {veces, ultimo, hecho}`.
- **Política (developer.android.com/guide/playcore/in-app-review):** *"Your app shouldn't ask the user any questions before or
  while presenting the rating button or card, including questions about their opinion (such as 'Do you like the app?')"*.
  Por eso **no** se usa "¿Te está gustando EN VIVO Tycoon?" ni se filtra a quién se manda a la tienda (eso sería *review
  gating*). La ventana es neutral y igual para todos: **"Tu opinión nos ayuda"** → **Opinar en Google Play** y **Enviar una
  sugerencia** como dos botones iguales (mismo estilo, mismo tamaño) + "Ahora no". Sin premios por reseñar.
  La guía también dice que un botón no debe lanzar la API de reseñas (por la cuota) sino **llevar a la tienda**: eso hacemos
  (además, en una TWA no hay API nativa de reseñas sin un puente Android).
- **Opinar:** en la app de Android `intent://details?id=com.tukanec.envivo#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=…`
  (abre la app de Play; si no está, la página web); en la web, `https://play.google.com/store/apps/details?id=com.tukanec.envivo` en otra pestaña.
- **Sugerencia:** abre el soporte del juego (`window.Soporte.abrir`) y, con cuenta, va directo al formulario con la categoría
  "Una sugerencia". Sin servidor: aviso "Las sugerencias necesitan internet".

## 2. Compartir

- **Dónde:** en el resultado del evento con **≥4⭐** (bloque verde "¡Presume tu transmisión!") y en **Inicio** (abajo, junto a
  Idioma / Soporte).
- **WhatsApp:** `https://wa.me/?text=<mensaje + enlace>`; en la app de Android, `intent://send?text=…#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=<wa.me>;end`.
- **Enlace:** `https://juego.tukanec.com/?ref=<código>`. El código sale de `Api.estado.ref_codigo` / `codigo_invitacion` /
  `jugador.ref` / `jugador.codigo` si el servidor lo manda; si no, con cuenta, `p` + id del jugador en base 36 (`p1z`); sin
  cuenta, el enlace va sin `?ref`. Al abrir el juego con `?ref=` se guarda la primera vez en
  `localStorage['envivo_ref_origen'] = {code, t}` (`Compartir.refOrigen()`), para que el servidor lo reciba al crear la cuenta
  (**pendiente del servidor**: aceptar `ref` en `/api/registro` y contar invitaciones; hoy no hace nada con él).
- **Imagen (Web Share):** botón "Compartir imagen" solo si existe `navigator.share`. Arma un PNG 1080x1350 en un canvas: "EN VIVO"
  + nombre del juego, la sede (`Art.hq(S)` pasado a imagen), el nombre de la productora, el evento, las estrellas y la calidad
  (en Inicio: día y fama) y "Juega gratis · juego.tukanec.com". Si el navegador comparte archivos
  (`navigator.canShare({files})`) va la imagen; si no, texto + enlace; si tampoco, WhatsApp.

## 3. Novedades ("Lo nuevo en EN VIVO")

- Lista `NOVEDADES` al principio de `js/compartir.js` (la más nueva primero, `{ id, fecha, items: [{ ico, t: {es, en, …} }] }`).
  Sembrada con lo de hoy (PLAN.md, bitácora 2026-10-23): guía "toca aquí", botones "?", aviso de cuenta, Inicio plegable y nombre
  de la productora, decoración, movilización y flota, escena en vivo y vida en el local, Edición Exclusiva, Liga para nuevos.
- **Sale sola una vez por novedad nueva** (`localStorage['envivo_novedades_visto'] = id`), 1,2 s después de cargar y solo con la
  pantalla libre (sin ventana, sin guía, sin evento en curso; espera hasta 60 s). A una **partida nueva** no se le muestra (la
  marca como vista). Siempre se puede ver desde **Inicio → Ayuda → Novedades** (con un punto rojo si hay algo sin ver).
- **Para publicar una novedad:** agregar un objeto al principio de `NOVEDADES` con un `id` nuevo y los 10 idiomas
  (`tests/test_compartir.js` revisa que la primera los tenga todos).

## Pruebas automáticas

Con `navigator.webdriver` (Playwright) **no sale nada solo** (ni calificar ni novedades), así las demás pruebas no cambian.
Para verlo en una prueba: `window.__ENVIVO_COMPARTIR = true` antes de cargar. `window.__ENVIVO_AHORA` (ms) cambia la hora para
la regla de 30 días. `window.__compartirUltimo` guarda el último enlace que se abrió (`{url, intent}`).

---

## Líneas para el integrador

### 1. `index.html` — después de `<script defer src="js/googleplay.js"></script>`:
```html
<script defer src="js/compartir.js"></script>
```
(Con `defer`: no cambia la regla de scripts síncronos de `tests/test_browser.js`.)

### 2. `sw.js` — en la lista de archivos, después de `'./js/escena.js',` (y subir `VERSION`):
```js
  './js/compartir.js',  // compartir por WhatsApp, calificar y novedades (opcional)
```

### 3. `js/ui.js` — `showResult()`: el bloque de compartir antes del botón Continuar. Reemplazar:
```js
      <p class="small muted">${T('res.desgaste')}</p>
      <button class="btn main" data-act="after-result">${T('comun.continuar')}</button>`);
```
por:
```js
      <p class="small muted">${T('res.desgaste')}</p>
      ${window.Compartir ? window.Compartir.resultado(r, fresh, ctxInicio()) : ''}
      <button class="btn main" data-act="after-result">${T('comun.continuar')}</button>`);
```

### 4. `js/ui.js` — `case 'after-result'`: **el gancho después de cerrar el resultado**. Reemplazar:
```js
        else { lsSet(RES_KEY, null); closeModal(); mus.go('menu'); render(); continuar(); }
        break;
```
por:
```js
        else { lsSet(RES_KEY, null); closeModal(); mus.go('menu'); render(); continuar(); }
        if (window.Compartir) window.Compartir.trasResultado(ctxInicio());   // calificar tras un 5⭐ (espera a que la pantalla esté libre)
        break;
```

### 5. `js/ui.js` — `datosHub()` (hoja "Más" de la sede de Inicio): los botones de compartir. Reemplazar:
```js
      ${soporteBtn()}
      <button class="btn" data-act="new-game" style="margin-bottom:20px">
```
por:
```js
      ${soporteBtn()}
      ${window.Compartir ? window.Compartir.inicio(ctxInicio()) : ''}
      <button class="btn" data-act="new-game" style="margin-bottom:20px">
```

### 6. `js/ui.js` — `datosHub()`, tarjeta de ayuda (oficina de la Historia en la sede): el botón "Novedades". Reemplazar:
```js
m: M(-bankruptAt()) })}</div>`;
```
por:
```js
m: M(-bankruptAt()) })}${window.Compartir ? window.Compartir.ayuda() : ''}</div>`;
```

Los clics no necesitan cambios: los botones llevan `data-ext="compartir" data-acc="…"` y `js/compartir.js` se registra en
`window.EnVivoInicio` con `tarjeta` vacía (sin fila en Inicio) solo para recibirlos. "Ahora no" y cerrar las novedades usan el
`data-act="close"` de siempre.
