# Reporte de rendimiento — EN VIVO Tycoon

Fecha: 23 de octubre de 2026. Mediciones con Playwright + Chrome DevTools en 360×640 (DPR 2), CPU limitada 4x y 6x (celular barato / muy barato) y red "Slow 4G". Versión A = copia de las 06:50 UTC (9 scripts, 334 KB de JS). Versión actual = copia de las 08:40 UTC (30 scripts, 1,4 MB de JS). Margen de ruido ±20 % (máquina compartida).

## 1. Resumen para el CEO

**Se puede jugar, pero no se siente fluido en tres momentos:** la primera carga, "Preparar evento" y la Bodega. Con 5 arreglos pequeños queda fluido.

| | Celular bueno | Celular barato (4x) | Celular muy barato (6x) |
|---|---|---|---|
| Abrir el juego por primera vez (4G lento) | 0,2–0,3 s | **5,1 s** (antes 2,1 s) | **5,3 s** |
| Abrir el juego otra vez (ya instalado) | 0,2 s | 0,3 s | 0,4–0,5 s |
| Tocar una casilla en "Preparar evento" | 0,02 s | 0,1 s | **0,15 s** |
| Abrir la Bodega | 0,02 s | 0,13 s | **0,2 s** |
| Elegir una opción en vivo | 0,01 s | 0,02 s | 0,04 s |
| Lluvia y confeti | 60 cuadros/s | 58–60 | 47–57 (a veces salta) |
| Memoria tras 30 min | 4 MB, sin fugas | 4 MB | — |
| Partida guardada (día 200) | 27 KB | | |

- La primera carga se volvió 2,5 veces más lenta porque el juego descarga los 10 idiomas aunque use uno, más 20 módulos nuevos. Cargar solo el idioma activo ahorra 1,4 s (probado: 5,1 → 3,7 s).
- "Preparar evento" redibuja 1.200–1.700 piezas en cada casilla. Actualizar solo lo que cambia lo baja 40 % (probado).
- Luces que parpadean y lluvia obligan a redibujar 60 veces por segundo. Con 3 líneas de CSS el trabajo baja 75 % (probado).
- No hay fugas de memoria y la partida guardada es pequeña.

## 2. Los 5 arreglos principales

1. **Cargar solo el idioma activo.** Dejar solo `js/lang/es.js` en `index.html`; `I18N.setIdioma` carga el idioma elegido con un `<script>` dinámico antes de avisar a `onChange`. Luego `defer` o carga al abrir la pestaña para música, Google Play, soporte, chat, mercado, festival, liga, duelos y desafío. Medido: 5,15 → 3,79 s a 4x, −134 KB.
2. **"Preparar evento" sin reconstruir todo el modal.** Envolver el bloque de calidad en `#prepCalc`; al marcar una casilla, cambiar solo la clase `.sel` de esa fila y reemplazar solo `#prepCalc`. Medido: −40 % (96 → 58 ms a 6x).
3. **CSS de animaciones SVG.** Borrar la regla duplicada `.fx-rain path{animation…}`; parpadeos a saltos con `animation-timing-function: steps(1,end)` en `.blink, .fx-blink, .tally, .live i`; pausar lo que queda debajo del modal con `body:has(#overlay.on) main *{animation-play-state:paused}`; el apagón debe animar `opacity`, no `fill-opacity`. Medido: lluvia a 6x de 613 a 153 ms de trabajo por segundo.
4. **Bodega más liviana.** `.gear{content-visibility:auto;contain-intrinsic-size:auto 230px}` y memorizar los resultados de `art.js → item()` y `avatar()` (dan siempre lo mismo para los mismos datos). Estimado: 30–50 % menos.
5. **Confeti más liviano.** 28/20 piezas en vez de 70/45, sin `will-change` por pieza, reducido en celulares modestos (`hardwareConcurrency` ≤ 4 o `deviceMemory` ≤ 2); `countUp` cambia el texto solo cuando cambia el número.

**Menores:** `Intl.NumberFormat` guardado en `logic.js → money` (128 veces más rápido); vaciar las pestañas ocultas (2.763 de 3.289 elementos no se ven); mover `Api.iniciar` y `Chat.iniciar` fuera del primer render; fuentes alojadas en el propio servidor; agregar a `sw.js` los 5 scripts que faltan (`intento.js`, `liga.js`, `festival.js`, `duelos.js`, `desafio.js`); reconstruir `dist`.

## 3. Presupuesto (para no volver a empeorar)

| Recurso | Presupuesto | Medido |
|---|---|---|
| JS en la primera carga (gzip) | ≤ 200 KB | 397 KB |
| Scripts síncronos en `index.html` | ≤ 12 | 30 |
| Idiomas cargados al inicio | 1 | 10 |
| Fuentes web | ≤ 60 KB | 92 KB |
| Jugable sin caché (Slow 4G, 4x) | ≤ 3,0 s | 5,15 s |
| Jugable con caché (6x) | ≤ 1,0 s | 0,44 s ✅ |
| Elementos de la pantalla visible | ≤ 1.500 | Bodega 1.344–2.900 |
| Elementos de un modal | ≤ 800 | Preparar 1.240–1.680 |
| Animaciones infinitas por pantalla | ≤ 10 | Bodega 19, Tienda 23 |
| Tiempo por toque a 6x | ≤ 100 ms | Preparar 138–173, Bodega 199 |
| Memoria tras 30 min | ≤ 15 MB | 4,1 MB ✅ |
| Partida guardada | ≤ 50 KB | 27 KB ✅ |
| Caché del service worker | ≤ 2 MB | 1,55 MB ✅ |

## 4. Detalle de mediciones

- **Primera carga, versión actual (normal / 4x / 6x):** jugable 0,24 / 5,15 / 5,27 s; FCP 0,19 / 1,42 / 1,45 s; bloqueo total 1 / 92 / 181 ms; tarea más larga 68 / 142 / 231 ms; ejecución inicial del JS 69 / 234 / 335 ms; 498 KB transferidos. Solo con red lenta (CPU normal): 4,97 s, así que el freno es la red.
- **Peso gzip por archivo (KB):** art.js 39,8 · logic.js 31,2 · ui.js 30,6 · datos.js 30,3 · plan_evento.js 25,1 · 10 idiomas 149,6 (se usa uno, ≈14) · festival 11,5 · liga 11,2 · duelos 10,9 · música 9,9 · desafío 7,4 · sound 6,5 · index.html 8,1.
- **Perfil de CPU a 6x:** `ui.js → openModal` 38 % del JS propio (el `innerHTML`), `renderPrep` 33 %. Bodega a 4x: estilos 38 ms, layout 31 ms, pintura 60 ms, capas 36 ms, JS < 10 ms (el costo está en dibujar).
- **30 minutos de juego a 4x (230 vueltas):** heap 0,97 → 4,1 MB y se estabiliza; 24 tareas de más de 200 ms (máx. 353 ms); los nodos crecen hasta ≈ 6.200 y se estabilizan; 0 nodos sueltos.
- **Partida guardada:** 27 KB al día 200 (el registro pesa 14,5 KB porque guarda `text` y `k`/`p`); serializar ≈ 0,3 ms y guardar 1–4 ms a 6x.

Scripts de medición y datos crudos: carpeta de trabajo de la sesión (`scratchpad/perf/`), no se suben al repositorio.
