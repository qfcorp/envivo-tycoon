# Guías cortas de cada sección ("toca aquí"): cómo conectarlas

La primera vez que el jugador abre una sección sale un recorrido de 2 a 4 toques con el **mismo aspecto y las mismas
reglas** que la guía del primer evento (`js/guia.js`): mano que señala, foco, burbuja de Don Ramiro con "1/3",
"Saltar guía ✕" y solo el elemento señalado se puede tocar (tocar fuera no hace nada). Cada recorrido se recuerda
aparte en este celular. No necesita contexto de `js/ui.js`.

| Archivo | Qué es |
|---|---|
| `js/guias.js` | `window.Guias` (IIFE, con `defer`, **después de `js/guia.js`**). Textos en los 10 idiomas, sin dependencias nuevas |
| `js/guia.js` | Solo exporta además `Guia.CSS` y `Guia.MANO` (las reusa `guias.js`; nada más cambia) |
| `tests/test_guias.js` | Prueba en navegador 390x844, 89 comprobaciones; capturas en `tests/capturas/guias_*.png` |

## Recorridos

| id | Cuándo sale | Pasos (elemento señalado → texto es) |
|---|---|---|
| `bodega` | pestaña Bodega | `[data-act="repair"]` → Tus equipos se gastan: repara aquí · `.catrow` → Compra equipos por categoría aquí · `.card.exq` → Edición Exclusiva: equipos únicos y mejores |
| `personal` | pestaña Personal | `[data-act="search-staff"]` → Busca personal nuevo aquí · `[data-act="hire"]` → Contrata: cobra por cada evento |
| `prep` | ventana de preparar evento, **desde el 2.º evento** (`stats.events >= 1`; el 1.º lo lleva `guia.js`) | `.pe-crew .pe-box` → Aquí ves quién va al evento · `.pe-row` → Verde listo, naranja riesgo, rojo falta · `label.pick` del personal → Toca personas para llevarlas o no |
| `flota` | misma ventana, si existe `window.Movilizacion` y sale la tarjeta Llévame | `#movSec .mov-hd` → Así llevas a tu gente y equipos · `.mov-app` → Sin vehículo: pide un auto en Llévame |
| `sede` | Inicio con la fila **Sede abierta** | `.sd-card` → Toca aquí para mejorar tu sede (**este toque llega al juego y abre la ventana**) · `.sd-item` → Mejora cada parte para subir de nivel · `.sd-mats` → Materiales: llegan gratis cada día · `.sd-obra` → Tu equipo de obra construye por días |
| `tienda` | pestaña Tienda (no en "Conectando…" ni en Mercado) | créditos (`.wallet` / `#tv-creditos` / tarjeta sin servidor) · `[data-act="cuenta"][data-modo="registro"]` → Crea tu cuenta gratis y guarda todo · `#tv-exclusivos` (o la vitrina sin servidor) |
| `online` | pestaña En línea (hub) | `.onl-tile` Liga · Duelos · Desafío · Copa, una línea cada uno |

Salvo el primero de `sede`, los pasos son informativos: el hueco lo cubre un botón transparente y tocarlo solo pasa
al siguiente (no compra, no repara, no abre la cuenta). Si un elemento no existe (p. ej. sin servidor no hay botón de
cuenta) ese paso se salta solo.

**Reglas:** nunca encima de otra ventana (se espera escondida; si cambia de pestaña o se cierra su ventana, se termina),
nunca durante un evento (`S.currentEvent`), nunca mientras corre la guía del primer evento (`Guia.activa()`) ni con
la hoja "?" de `js/ayuda.js` abierta. Se rehace sola si la pantalla se vuelve a pintar; si el elemento desaparece
más de 1,2 s salta al siguiente paso; tope de 4 min; ante cualquier error se cierra. Respeta `prefers-reduced-motion`.
Se marca como vista al empezar (`localStorage['envivo_guias_v1_<id>'] = '1'`): no vuelve a salir aunque se corte.

**Inicio → Ayuda:** `guias.js` agrega el botón "↺ Ver guías otra vez" dentro de la fila Ayuda (`.pl[data-pl="ayuda"]
.pl-cuerpo`); borra las marcas de todos los recorridos (no la de la guía del primer evento).

**Pruebas automáticas:** con `navigator.webdriver` NO hace nada (ni el botón), así `tests/test_browser.js` y las demás
siguen igual. Para verla: `window.__ENVIVO_GUIAS = true` (antes de cargar) o `?guias=1`. Tampoco sale en la demo
(`window.__ENVIVO_DEMO` / `?demo=`).

API: `Guias.estado()` → `{ activa, id, paso, i, n, tocar, x, y, visible }` · `Guias.terminar()` · `Guias.olvidar()` ·
`Guias.visto(id)` · `Guias.IDS` · `Guias.PASOS` · `Guias.TEXTOS`.

## Líneas para el integrador

### 1. `index.html` — después de `<script defer src="js/guia.js"></script>` (ya aplicado en esta rama):
```html
<script defer src="js/guias.js"></script>
```
(Con `defer`, en ese orden: necesita `Guia.CSS`. La regla de scripts síncronos de `tests/test_browser.js` no cambia.)

### 2. `js/guia.js` — en `root.Guia = { … }`, después de `KEY,` (ya aplicado en esta rama):
```js
    CSS,    // lo reusa js/guias.js (recorridos de cada sección) con el mismo aspecto
    MANO,
```

### 3. `sw.js` — en `SHELL`, después de `'./js/guia.js',` (NO aplicado: lo hace el integrador para no chocar con `VERSION`):
```js
  './js/guias.js',      // guías cortas de cada sección
```
y subir `VERSION` al siguiente número.

### 4. `js/ui.js` y `tools/build_single.js` — **nada**. `build_single.js` incrusta los `<script defer>` de `index.html`
en su orden, así que `guias.js` entra solo en `dist/`.

## Probar
```
node tests/test_guias.js     # 89 comprobaciones; capturas tests/capturas/guias_*.png
node tests/test_guia.js      # la guía del primer evento sigue igual (41)
```
