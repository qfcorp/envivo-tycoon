# Escena animada del evento en vivo: cómo conectarla

El dueño dijo que la pantalla del evento en vivo era muy monótona. Ahora, arriba de esa ventana, hay una **franja
animada** de 78 px de alto que se mueve mientras transmites:

- **El lugar del evento**, según el tipo: misa, funeral, boda, graduación, fútbol de barrio, fútbol profesional, final
  (con fuegos artificiales), box, lucha libre, concierto (luces que barren), rueda de prensa (flashes), lanzamiento de
  producto, lanzamiento de autos (brillo que recorre el carro), transmisión en la calle (IRL) e internacional (mesa de
  comentaristas, globo y señal satelital). Los tipos de temporada usan su `escena` (por ejemplo `tmp_procesion` → misa).
- **El público** que se mueve (más tranquilo en misas y funerales, saltando en conciertos y finales).
- **Dos camarógrafos** que panean, cada uno con su luz de tally.
- **El monitor de programa (PGM)** con el "EN VIVO", el reloj corriendo desde que empezó el evento, y cortes entre
  CAM 1 (plano abierto) y CAM 2 (plano cerrado) cada 4,5 s. La luz de tally de cada cámara cambia con el corte.

**Reacciones:**

| Momento | Qué pasa |
|---|---|
| Imprevisto | El borde parpadea en ámbar, aparece "¡Imprevisto!" con el ícono del problema, la cámara 2 se pone roja con un triángulo de alerta. Sin luz: el monitor se va a negro ("SIN SEÑAL"). Internet/señal/falla: ruido en el monitor. Lluvia: gotas. |
| Momento bueno (`epico`) | Borde dorado, "¡Momentazo!", el público levanta los brazos |
| Después de elegir, calidad > 0 | Pulso verde y "¡Bien resuelto!" (se va solo a los 2,4 s), el público celebra |
| Después de elegir, calidad < 0 | Pulso rojo y "Salió mal", el monitor tiembla un instante |
| Calidad = 0 | Sin pulso |

Funciona igual en la partida y en los eventos en línea (liga, festival, copa): usa `c` (el contrato del evento en curso).
Todo es SVG + CSS (solo `transform` y `opacity`, menos un borde de 4 parpadeos). Con `prefers-reduced-motion` queda
quieta: sin animaciones, el reloj no corre, los avisos se ven fijos. Textos en los 10 idiomas dentro de `js/escena.js`
(usa `I18N.idioma`); sin marcas ni ligas reales.

| Archivo | Qué es |
|---|---|
| `js/escena.js` | `window.Escena` (IIFE): `html(contrato, estado)`, `reaccion(el, fase, clave)`, `tipo(contrato)`. Pone su propio CSS (`<style id="escena-css">`). Usa `Art.icon` si está. |
| `tests/test_escena.js` | Prueba en navegador 390x844 con estas mismas líneas aplicadas en memoria. Capturas en `tests/capturas/escena_*.png`. |

## Líneas para el integrador

### 1. `index.html`: después de `<script defer src="js/guia.js"></script>`
```html
<script defer src="js/escena.js"></script>
```
(Con `defer`: la regla de máximo 14 scripts síncronos de `tests/test_browser.js` no cambia. Si la app se recarga en
pleno evento, `ui.js` abre la ventana antes de que cargue `escena.js`; al cargar, `escena.js` pone la franja en esa
ventana por su cuenta, con `window.__game.state.currentEvent`.)

### 2. `sw.js`: en la lista de archivos, después de `'./js/guia.js',       // guía "toca aquí" del primer evento`
```js
  './js/escena.js',     // franja animada del evento en vivo (opcional)
```
(Y subir la versión del caché como siempre.)

### 3. `js/ui.js`: tres cambios en "Evento en vivo"

**a)** Antes de `  function incKey() {` agregar:
```js
  // Franja animada de arriba (js/escena.js, opcional): el lugar, el público, los camarógrafos y el monitor de programa
  const escena = (c, e) => { try { return window.Escena ? window.Escena.html(c, e) : ''; } catch (err) { return ''; } };
```

**b)** En `showIncident()`, reemplazar:
```js
    openModal(`
      ${liveScene(c.type, key)}
```
por:
```js
    openModal(`
      ${escena(c, { fase: bueno ? 'momento' : 'imprevisto', clave: key, nombre: eventName(c.type) })}
      ${liveScene(c.type, key)}
```

**c)** En `choose(i)`, reemplazar:
```js
      ${liveScene(c.type, r.q > 4 ? 'epico'
```
por:
```js
      ${escena(c, { fase: r.q > 0 ? 'bien' : r.q < 0 ? 'mal' : '', clave: key, nombre: eventName(c.type) })}
      ${liveScene(c.type, r.q > 4 ? 'epico'
```
(Solo se agrega la línea `${escena(...)}` antes de la que ya estaba; el resto de la línea de `liveScene` queda igual.)

Sin `js/escena.js`, `escena()` devuelve `''` y la ventana queda como antes.

## API (por si otro módulo la quiere usar)

- `Escena.html(contrato, { fase, clave, nombre })` → html de la franja. `fase`: `'imprevisto' | 'momento' | 'bien' | 'mal' | ''`.
  `clave`: la clave del imprevisto (cambia el ícono y el efecto del monitor). `nombre`: para el `aria-label`.
- `Escena.reaccion(el, fase, clave)` → repite una reacción en una franja ya puesta (`el` puede ser la franja o algo que
  la contenga, por ejemplo `#modal`). Devuelve `true` si encontró la franja.
- `Escena.tipo(contrato | tipo)` → la escena que se dibuja (`'misa'`, `'ligapro'`, `'autos'`…).

## Prueba

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=/opt/npm-tools/node_modules node tests/test_escena.js
```
Revisa: textos completos y cortos en los 10 idiomas, sin marcas; jugar el primer evento tocando los botones (la franja
sale arriba, avisa el imprevisto, la cámara 2 se pone roja, el reloj corre, el corte a CAM 2 cambia monitor y tally,
pulso verde/rojo después de elegir); los 16 tipos de evento (recargando en pleno evento y después de elegir), con la
marca de internacional; sin luz / sin internet / lluvia; `Escena.reaccion`; movimiento reducido (0 animaciones, reloj
fijo); inglés; sin errores de JS ni desplazamiento horizontal.
