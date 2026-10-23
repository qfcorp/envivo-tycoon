# ASO, capturas y video de la ficha · EN VIVO Tycoon

ASO = que el juego aparezca cuando alguien busca en Play Store. Aquí van las palabras clave, la revisión de las
fichas, el plan de las **8 capturas**, el gráfico de funciones y el **guion del video de 30 segundos**.
Revisado el 23 oct 2026 contra la guía de recursos gráficos de Google
(https://support.google.com/googleplay/android-developer/answer/9866151).

## 1. Palabras clave (ficha principal en español, es-419)

Play no tiene campo de palabras clave: lee el **nombre**, la **descripción breve** y la **descripción completa**.

| Palabra clave | Dónde está | Veces en la descripción completa |
|---|---|---|
| **productora** | breve ✅ · completa | 6 |
| **transmisión en vivo** (transmitir, transmisiones) | breve ✅ · completa | 3 |
| **tycoon** | nombre ✅ · breve ✅ · completa | 2 |
| **eventos** | breve ✅ · completa | 4 |
| **cámaras** | breve ✅ · completa | 4 |
| secundarias: simulador, gestión, camarógrafo, fútbol, estadio, televisión, streaming | completa | 1–2 cada una |

Descripción breve nueva (75/80): **"Dirige tu productora de eventos: cámaras y transmisión en vivo en un tycoon"** —
lleva las 5 palabras clave, sin emojis, sin "el mejor"/"gratis"/precios y sin punto final (reglas de Google para la breve).

Cambios hechos en las fichas (23 oct 2026), **iguales en los 10 idiomas**:
1. Descripción breve con las palabras clave de cada idioma (en: *production company, cameras, live streaming, tycoon*;
   pt-BR: *produtora, câmeras, transmissão ao vivo*; etc.).
2. La viñeta "Próximamente: eventos en línea…" ya no era verdad: ahora dice que **sí** hay Liga Semanal, Desafío del Día,
   Mega Festival y Duelo de Productoras (con el nombre que usa el juego en cada idioma, sacado de `js/lang/<idioma>.js`).
3. El párrafo de compras ahora cubre las compras nuevas sin nombrar módulos que quizá no estén activos el día 1
   ("ofertas de una sola vez o por logros… pases por tiempo limitado como el Pase VIP de 30 días") y dice que
   **todo muestra su contenido antes de comprar** (no hay cajas sorpresa).
4. Solo en español: "es un **simulador** tycoon de gestión… **cámaras**, personal y transmisiones en vivo" y "estudio
   de **televisión**" (palabras que se buscan mucho en Latinoamérica y no estaban).

`node tests/test_traducciones.js` pasa (límites, sin marcas reales, compras opcionales mencionadas, tabla del README).

### Nombre de la app (decisión pendiente de Dimitry)
- Hoy: **EN VIVO Tycoon** (14/30). Corto y de marca, pero "EN VIVO" es una palabra muy común y la búsqueda
  "en vivo" está llena de apps de TV y fútbol.
- Opción con más ASO (permitida por Google: descriptiva, sin "mejor", sin emojis): **"EN VIVO Tycoon: Productora TV"**
  (28/30). Suma "productora" y "TV" al campo que más pesa.
- Si se elige la opción larga: cambiar `## Nombre de la app` en las 10 fichas y la regla de `tests/test_traducciones.js`
  que exige el nombre exacto (archivo compartido: lo hace el integrador). El nombre del ícono en el celular sigue siendo
  "EN VIVO" (`launcherName`), no cambia.
- Recomendación: lanzar con **EN VIVO Tycoon** y, si a las 2–3 semanas casi todas las instalaciones vienen de
  enlaces directos y no de "Búsqueda en Play" (Play Console › Estadísticas › Adquisición), probar el nombre largo.

### Lo que sí se puede probar con experimentos de Google
Play Console › **Crecer** › **Experimentos de la ficha de Play Store**: hasta 3 variantes de ícono, gráfico de
funciones, capturas, video, descripción breve y completa (no el nombre). Primer experimento sugerido, cuando haya
~1.000 visitas por semana a la ficha: **orden de las capturas** (imprevistos primero vs. plan de cámaras primero).

### Fichas personalizadas por país (opcional)
Play Console › **Fichas personalizadas** › por país: Colombia y Perú pueden tener su propia ficha (por ejemplo,
"partidos de fútbol profesional y conciertos" igual, pero capturas con eventos más comunes allí). No hace falta para
empezar: la ficha es-419 sirve para los 3 países.

## 2. Gráficos que ya existen

| Archivo | Requisito de Google | Estado |
|---|---|---|
| `assets/promo/icon_512.png` | 512×512, PNG 32 bits con alfa, ≤1 MB | ✅ 512×512 RGBA, 24 KB |
| `assets/promo/feature_graphic.png` | 1024×500, JPG o PNG 24 bits **sin** alfa | ✅ 1024×500 RGB, 485 KB, sin marcas ni teléfonos dibujados, sin precios |
| `assets/promo/feature_graphic_en.png` | igual | ✅ (ficha en-US) |
| `assets/promo/screens_es/01…06.png` | 1080×1920 (9:16), PNG 24 bits | ⚠️ formato OK, pero ver §3 |

Texto alternativo del gráfico de funciones (≤140, campo "alt text"): *"Cámara de transmisión y unidad móvil frente a un
estadio de noche, con el logo EN VIVO Tycoon"*. En inglés: *"Broadcast camera and OB van in front of a stadium at
night, with the EN VIVO Tycoon logo"*.

## 3. Plan de las 8 capturas (teléfono, vertical 1080×1920)

Reglas de Google que importan aquí: de 2 a 8 por tipo de dispositivo; para que un **juego** pueda salir destacado,
**mínimo 3 capturas** 9:16 de al menos 1080×1920 que muestren el juego de verdad; el texto encima debe ocupar
**menos del 20 %** de la imagen, sin llamados a la acción ("¡Descarga ya!") y sin barra de notificaciones sucia.
Las **3 primeras** son las que se ven en los resultados de búsqueda: deben contar el juego solas.

| # | Pantalla del juego (captura en crudo) | Título (es) | Subtítulo (es) | Título (en) | Estado |
|---|---|---|---|---|---|
| 1 | Escena en vivo con lluvia en el estadio + las 3 opciones del imprevisto | Resuelve imprevistos **en vivo** | Lluvia, apagones, cables rotos: tú decides cómo salvar la transmisión. | Handle disasters **live on air** | ⚠️ **Regenerar**: hoy dice "Partido de **LigaPro**" (marca real) |
| 2 | **Plan de cámaras** de un partido en estadio (dibujo de la cancha con posiciones: tribuna con lente box, detrás de cada arco, al hombro, dron) | Arma tu **plan de cámaras** | Lente box en tribuna, cámara al hombro, dron: cada posición cuenta. | Plan your **camera positions** | 🆕 Nueva |
| 3 | Personal con avatares y niveles (Junior → Internacional) | Arma tu equipo de **producción** | Camarógrafos, directores, sonidistas y técnicos que suben de nivel contigo. | Build your **production crew** | ✅ Existe (02) |
| 4 | Resultado del evento: 5 estrellas y duelo ganado a MegaVisión | Compite contra **MegaVisión** | Gana los contratos disputados superando la calidad de la productora rival. | Beat **MegaVisión** to the contract | ✅ Existe (03) |
| 5 | Bodega con equipos exclusivos numerados | Equipos de nivel **broadcast** | Dron 4K, grúa telescópica, unidad móvil y más, cada uno con su número de serie. | **Broadcast-grade** gear | ✅ Existe (04) |
| 6 | Inicio con la sede crecida (centro de producción y unidad móvil) | Crece de garaje a **unidad móvil** | Garaje, oficina, estudio de televisión y centro de producción. | From garage to **OB van** | ✅ Existe (05) |
| 7 | Pestaña **En línea**: Liga Semanal con la tabla de asociaciones / Duelo de Productoras | Eventos **en línea** cada semana | Liga Semanal, Desafío del Día, Mega Festival y duelos entre productoras. | **Online events** every week | 🆕 Nueva |
| 8 | Chat de la asociación (con nombres inventados) | Juega con **otras productoras** | Asociaciones de hasta 20 productoras, chat con moderación y mercado de equipos. | Team up with **other companies** | ✅ Existe (06) |

Notas:
- La captura de la **tienda** (`raw/07_tienda.png`) **no** va: Google desaconseja precios en las capturas y los precios
  cambian por país.
- Textos alternativos (≤140) = el subtítulo de cada fila.
- El diseño actual pone el título en ~25 % de la altura. Para cumplir el "menos del 20 %": título en 2 líneas como
  máximo y subtítulo de 1 línea, o bajar un poco la letra en `assets/promo/src/componer.js` (lista `SCREENS`).
- **Cómo regenerar** (lo hace el integrador o quien tenga Playwright): `assets/promo/src/capturar.js` **ya no funciona
  con la pantalla v6** (el 23 oct 2026 se queda esperando un botón desactivado). Hay que actualizar sus selectores, agregar
  las capturas `07_plan_camaras` y `08_en_linea`, y en `componer.js` poner las 8 filas de esta tabla en este orden.
  Luego: `NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/capturar.js` y `… componer.js screens`. Para inglés:
  `GAME_LANG=en RAW_DIR=assets/promo/src/raw_en …` (el juego ya está en 10 idiomas).
- **Plan B si no hay tiempo**: Dimitry toma las capturas en su celular (botón de encendido + bajar volumen) con la
  partida del capítulo 4 (`?demo=cap4`, ver `docs/DEMO.md`), con el modo **No molestar** activado (barra limpia).
  Se pueden subir así, sin títulos: Google acepta capturas sin texto.

## 4. Video de 30 segundos (guion para grabar)

Reglas de Google: un enlace de **YouTube** (no lista ni canal), **público u oculto**, **sin anuncios** (monetización
apagada), **sin restricción de edad**, que se pueda insertar. Solo se reproducen solos los **primeros 30 s**; el juego
debe verse **en los primeros 10 s** y al menos el **80 %** debe ser juego real. Sin barras negras, con subtítulos.

Cómo grabar: 📱 celular con la app instalada → **No molestar** activado → **Grabar pantalla** (en los ajustes rápidos)
con el sonido del juego (no el micrófono). Usa una partida nueva para los planos 1–3 y la partida del capítulo 4
(`?demo=cap4`) para el resto. Grabar cada plano por separado (10–20 s cada uno) y cortar en el editor de video que uses.
Música: la del propio juego (es original). Formato final: vertical 1080×1920, 30 fps, 28–30 s.

| # | Tiempo | Qué se ve (grabación del juego) | Texto en pantalla (es / en) | Sonido |
|---|---|---|---|---|
| 1 | 0:00–0:03 | Escena en vivo: estadio, lluvia empieza, el letrero rojo **EN VIVO** parpadea | **¡Estás EN VIVO!** / *You're LIVE!* | Público + trueno |
| 2 | 0:03–0:07 | Sale el imprevisto "¡Empezó a llover fuerte!" → el dedo toca "Poner los cobertores de lluvia" | **Resuelve imprevistos en segundos** / *Fix disasters in seconds* | Sonido del botón |
| 3 | 0:07–0:10 | Resultado: estrellas subiendo hasta 5 ⭐ y el pago | **Cada decisión cuenta** / *Every call matters* | Sonido de monedas |
| 4 | 0:10–0:13 | Preparar el partido: plan de cámaras dibujado sobre la cancha y semáforo del personal en verde | **Arma tu plan de cámaras** / *Plan your cameras* | Música |
| 5 | 0:13–0:16 | Personal: contratar a un camarógrafo y verlo subir de nivel | **Contrata y entrena a tu equipo** / *Hire and train your crew* | Música |
| 6 | 0:16–0:19 | Duelo contra MegaVisión: barras de calidad y "¡Ganaste el contrato!" | **Vence a la productora rival** / *Beat the rival company* | Fanfarria |
| 7 | 0:19–0:22 | Bodega: equipos exclusivos (dron 4K, grúa, unidad móvil) | **Equipos de verdad, nombres inventados** / *Real-world gear* | Música |
| 8 | 0:22–0:25 | Sede: pasa de garaje → oficina → estudio → centro de producción (4 cortes rápidos) | **Del garaje al estadio** / *From garage to stadium* | Música sube |
| 9 | 0:25–0:28 | Pestaña En línea: Liga Semanal y chat de la asociación | **Compite con otras productoras** / *Compete with other companies* | Música |
| 10 | 0:28–0:30 | Gráfico de funciones / logo EN VIVO Tycoon sobre la escena del estadio | **EN VIVO Tycoon** | Golpe final |

No poner precios, "gratis", "descarga ya", ni marcas reales (revisar que no se vea ningún texto con marcas reales en
pantalla). Subir a YouTube como **oculto** con el título "EN VIVO Tycoon – tráiler" → monetización **apagada** →
copiar el enlace (`https://www.youtube.com/watch?v=…`, sin `&t=`) en Play Console › Ficha principal › **Video**.
Para la ficha en inglés: el mismo video con los textos en inglés (otro enlace).
