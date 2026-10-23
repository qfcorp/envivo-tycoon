# Guía del primer evento ("toca aquí"): cómo conectarla

Guía tipo "coach marks" solo para una **partida nueva** y solo para el **primer evento**: una mano animada señala
el botón que hay que tocar, con una burbuja de Don Ramiro de una línea. Este módulo **no toca ningún archivo
compartido**: abajo están las líneas exactas para el integrador.

| Archivo | Qué es |
|---|---|
| `js/guia.js` | `window.Guia` (IIFE). Inyecta su propio CSS (`<style id="guia-css">`), textos en los 10 idiomas, sin dependencias |
| `tests/test_guia.js` | Prueba en navegador 390x844 con estas mismas líneas aplicadas en memoria; capturas en `tests/capturas/guia_*.png` |

## Pasos (todos señalan el elemento real, se calculan cada vez desde la pantalla y el estado)

| Paso | Elemento señalado | Texto (es) |
|---|---|---|
| `intro` | `#overlay.on .btn.main[data-act="close"]` (intro del capítulo) | Toca aquí para empezar |
| `clientes` | `nav button[data-tab="clientes"]` (también si el jugador se va a otra pestaña) | Toca aquí para ver tus clientes |
| `evento` | `#tab-clientes [data-act="prep"][data-id=<la oferta más fácil>]` | Elige este evento, es fácil |
| `auto` | `[data-act="auto"]` (solo si "Al aire" está deshabilitado) | Toca para elegir lo mejor |
| `aire` | `[data-act="go-live"]` (la selección sugerida ya viene marcada) | ¡Todo listo! Sal al aire |
| `elegir` | primera `[data-act="choose"]:not([disabled])` (la recomendada) | ¡Imprevisto! Toca esta solución |
| `seguir` / `terminar` | `[data-act="next-inc"]` / `[data-act="finish"]` | Toca para seguir / Termina la transmisión |
| `resultado` | `[data-act="after-result"]` | ¡Primer evento listo! Toca aquí |
| `fin` | (nada: mensaje de 2,8 s que no bloquea) | ¡Bien! Repite esto con más clientes |

Solo el botón señalado se puede tocar (tocar fuera no hace nada). "Saltar guía ✕" siempre visible arriba a la
izquierda. Si el botón no aparece (otra ventana abierta, pantalla rehaciéndose) se esconde la mano y se espera: nunca
se queda pegada. Si algo lanza un error, se cierra sola y queda marcada. Respeta `prefers-reduced-motion`.

**Cuándo arranca:** `localStorage['envivo_guia_v1']` vacío, sin `window.__ENVIVO_DEMO` ni `?demo=`, y la partida con
`day === 1`, `stats.events === 0`, capítulo 0. Con una partida vieja (`stats.events > 0`) no arranca y deja la marca.
Al terminar o saltar: `envivo_guia_v1 = '1'` y no vuelve a salir.

**Pruebas automáticas:** con `navigator.webdriver` (Playwright) NO arranca, así `tests/test_browser.js` y las demás
pruebas siguen igual. Para verla en una prueba: `window.__ENVIVO_GUIA = true` (antes de cargar) o `?guia=1` en la dirección.

## Líneas para el integrador

### 1. `index.html` — después de `<script defer src="js/vip.js"></script>`:
```html
<script defer src="js/guia.js"></script>
```
(Con `defer`: la regla de máximo 13 scripts síncronos de `tests/test_browser.js` no cambia. El CSS lo pone `js/guia.js`.)

### 2. `js/ui.js` — en `arrancar()`, reemplazar:
```js
    else continuar();
    // La red (tienda, cuenta, chat, Google Play) después de la primera pantalla y de los scripts diferidos
```
por:
```js
    else continuar();
    // Guía del primer evento (js/guia.js, con defer): solo en una partida nueva; si aún no cargó, la toma al cargar
    const guiaCtx = { estado: () => S, A, tab: () => tab, idioma: () => (I18 ? I18.idioma : 'es') };
    if (window.Guia) window.Guia.iniciar(guiaCtx); else window.__guiaCtx = guiaCtx;
    // La red (tienda, cuenta, chat, Google Play) después de la primera pantalla y de los scripts diferidos
```
(Va después de `continuar()` para que la intro del capítulo ya esté abierta. No va en la rama de demo, que hace `return` antes.
Como `guia.js` lleva `defer`, normalmente aún no existe: deja el ctx en `window.__guiaCtx` y `guia.js` arranca solo al cargar.
Si el idioma guardado no es español, `arrancar()` corre más tarde y llama directo a `Guia.iniciar`.)

`ctx` (todo opcional; sin ctx usa `window.__game.state`, `window.Art`, `<main section.on>` y `window.I18N.idioma`):
- `estado: () => S` — estado actual (se lee en cada paso; si llega otra partida con eventos, la guía se cierra)
- `A` — `js/art.js` (retrato `A.portrait('ramiro', 42)` en la burbuja)
- `tab: () => tab` — pestaña actual
- `idioma: () => código` — idioma actual (respaldo: español)

API extra: `Guia.terminar()`, `Guia.activa()`, `Guia.estado()` → `{ activa, paso, x, y, visible }`, `Guia.olvidar()` (borra la marca).

### 3. `sw.js` — en `SHELL`, después de `'./js/estrellas.js',`:
```js
  './js/guia.js',       // guía del primer evento ("toca aquí")
```
y subir `VERSION` (p. ej. `'envivo-v9'` → `'envivo-v10'`, o el siguiente número si ya cambió).

### 4. `tools/build_single.js` — **no hace falta cambiar nada**: incrusta todos los `<script [defer] src="js/...">` de
`index.html` (los diferidos al final, en su orden), así que con la línea del paso 1 `js/guia.js` entra solo en
`dist/envivo-tycoon.html` y `dist/artifact.html`. En `dist/artifact_demo.html` no se ve (tiene `window.__ENVIVO_DEMO`).

## Probar
```
node tests/test_guia.js      # 41 comprobaciones; capturas tests/capturas/guia_*.png
```
