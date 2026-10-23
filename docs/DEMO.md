# Demo de EN VIVO Tycoon (23 oct 2026)

Una página para el demo de esta mañana: qué es el juego hoy, cómo abrirlo en el celular, qué mostrar en 10 minutos
y qué falta para la versión con servidor.

---

## Qué es el juego hoy

Manejas una productora de transmisiones en vivo: empiezas en un garaje con una cámara y terminas transmitiendo la final del campeonato.

- **Historia de 6 capítulos** con personajes: Don Ramiro (tu mentor), Lucía Mena (marcas), Germán Vélez de **MegaVisión**
  (la rival que te pelea contratos) y Don Aurelio (dirigente del estadio).
- **16 tipos de evento**: misa, boda, graduación, rueda de prensa, partido barrial, concierto, LigaPrima, final,
  **velada de boxeo**, lucha libre, funeral, lanzamiento de autos, transmisión con influencers... y **contratos internacionales**.
- **Preparar el evento como en la vida real**: plano de cámaras dibujado según el lugar (ring con 4 lados y cenital,
  estadio con tribuna principal y detrás de cada arco...) y **semáforo de personal** por puesto (verde, amarillo, rojo):
  si vas con menos gente ahorras sueldos, pero los imprevistos pegan más fuerte.
- **14 puestos** de personal con niveles **Junior, Semi-senior, Senior e Internacional**, sueldos, ánimo y ascensos.
- **90 equipos reales con marcas parodia** (vMax, Blackmagia ATOM...) en una **tienda por categorías**: cámaras, lentes,
  switchers, repeticiones, audio, intercom, bonding, drones, energía, vehículos, alquileres. Se gastan y se reparan.
- **En vivo**: escena animada, imprevistos (lluvia, apagón, se cae el internet, gente tapando la cámara...) con 2 o 3
  decisiones cada uno, y **duelos de calidad contra MegaVisión**.
- **Resultado** con estrellas, pago, sueldos y fama, y un **resumen del día**.
- Sonidos, ambiente de público y **7 temas de música**. **10 idiomas**. Se instala como app y funciona sin internet.
- **Con el servidor** (juego.tukanec.com): cuenta y partida en la nube, tienda de créditos con Pago Plux (en pruebas),
  Pase VIP, equipos exclusivos, mercado entre jugadores, chat y asociaciones, **Liga Semanal, Mega Festival, Duelo de
  Productoras y Desafío del Día** (el servidor repite cada jugada para que nadie haga trampa), soporte dentro del juego,
  bot de Discord y tu **Centro de Control** (ventas, jugadores, soporte).

---

## Probarlo en el celular ahora mismo

Abre este enlace: **https://claude.ai/artifact/3Sr6tCaVc7Yg3DyYfpPq47**

- Es el juego completo para jugar **gratis**, pero **sin servidor**: la pestaña **Tienda** y la pestaña **En línea**
  muestran lo que hay y avisan que funcionan en juego.tukanec.com. Eso se activa cuando el juego esté en el VPS.
- La partida se guarda sola en ese navegador. Si cierras en pleno evento, sigue donde quedó.
- Pruébalo **una vez antes del demo** (5 minutos) para tener ya una partida empezada.

---

## Guion de 10 minutos

Dos partes: primero una **partida nueva** (los días 1 a 15, lo que mejor se siente del juego) y después la
**partida preparada del capítulo 4** con `?demo=cap4` (la rival, los duelos y una oferta internacional).

| Minuto | Qué tocar | Qué mostrar |
|---|---|---|
| 0–1 | Abrir el enlace con una **partida nueva** → **Inicio** | La sede (garaje), dinero, fama, capítulo 1 con Don Ramiro y el consejo de qué falta. |
| 1–3 | **Clientes** → la **misa** o la **boda** → **Preparar evento** | El **plano de cámaras** (las tomas extra salen en gris como *opcional*) y el **semáforo de personal**. **¡Salir al aire!**, un imprevisto, **Terminar transmisión**. |
| 3–4 | Pantalla de resultado | Estrellas, pago, sueldos y gastos del día: el número grande es lo que **dejó el evento**; si compraste algo esa mañana, la caja del día sale aparte. |
| 4–5 | **Personal** y **Bodega** | Contratar un sonidista y un camarógrafo, comprar la segunda cámara: así se pasa al capítulo 2 (día 4 a 15). |
| 5 | Cambiar a la **partida del capítulo 4**: abrir el mismo enlace con `?demo=cap4` | Pregunta antes de reemplazar la partida. Sale la presentación del capítulo 4 (Germán Vélez, MegaVisión). |
| 5–7 | **Clientes** → la oferta con la etiqueta **Disputado** → **Preparar** | La calidad que promete MegaVisión contra tu rango esperado. **¡Salir al aire!** y el **duelo** en el resultado. |
| 7–8 | **Clientes** → la **oferta internacional** | País, pago ×2 o ×3, días de viaje y requisitos (realizador con experiencia internacional). |
| 8–9 | **Inicio** → botón **Idioma** | Cambia a **English** o **中文**: nombres, registro y la oferta internacional también cambian. Vuelve a **Español**. |
| 9–10 | **En línea** y **Tienda** | Los 4 modos en línea y los equipos exclusivos. Explica: "esto se activa con el servidor, que ya está listo para instalar". |

### Partida preparada del capítulo 4 (`?demo=cap4`)

- Se abre agregando `?demo=cap4` a la dirección del juego, por ejemplo `https://juego.tukanec.com/?demo=cap4`
  o `index.html?demo=cap4` / `dist/envivo-tycoon.html?demo=cap4` en la computadora.
- **Si ya hay una partida guardada, pregunta antes** ("Partida de demostración: ¿seguro?", con el día de tu partida).
  Si cancelas, tu partida queda igual. Si aceptas, se reemplaza (no se puede recuperar).
- La partida **no está hecha a mano**: la lógica del juego juega sola con una semilla fija (compra, contrata y cubre
  eventos con las reglas normales) hasta llegar al capítulo 4, y luego agrega con sus propias funciones un contrato
  **disputado por MegaVisión** y una **oferta internacional**. Siempre sale igual: día 54, unos $9.500, fama 71,
  10 personas, 18 equipos, un **duelo** en una graduación (MegaVisión promete 52; tu equipo espera ~71) y una
  **velada de boxeo para StreamRing USA** (Estados Unidos). La oferta internacional pide un realizador con experiencia
  internacional: sirve para mostrar los requisitos, no para jugarla.
- El parámetro se quita de la dirección al cargar: recargar no vuelve a preguntar.
- El enlace de claude.ai puede no pasarle `?demo=cap4` al juego; para la segunda parte del demo usa el archivo
  `dist/envivo-tycoon.html?demo=cap4` o el juego en el VPS.

**Si preguntan por la plata:** la tienda vende créditos, Pase VIP y paquetes; Plux está en modo de pruebas hasta que
certifique el dominio. En la app de Google Play se cobra con Google.

---

## Lo que falta: servidor y tus tareas (en orden)

| # | Qué | Guía | Tiempo aproximado |
|---|---|---|---|
| 1 | **Subir el juego al VPS** (Cloudflare, instalador, configuración, Plux en pruebas, validador con Node 22, comprobación) y proteger GitHub | [DESPLIEGUE.md](DESPLIEGUE.md), pasos 1 a 5, 8 y 9 | 50 min |
| 2 | **Centro de Control con código del celular (2FA)** y, si tienes IP fija, lista de IPs | [DESPLIEGUE.md](DESPLIEGUE.md), paso 6 | 10 min |
| 3 | **Respaldos y alertas** a Telegram (qfserver) y sumar el juego al restic de las 2:00 | [DESPLIEGUE.md](DESPLIEGUE.md), paso 7 · [OPERACION.md](OPERACION.md) | 20 min |
| 4 | **Correo de soporte y páginas legales** (RUC, correo, dirección; luego revisión del abogado, también de los nombres parodia) | [DESPLIEGUE.md](DESPLIEGUE.md), "Antes de cobrar" 1 y 2 | 30 min tuyos + lo que tarde el abogado |
| 5 | **Certificación de Pago Plux** para juego.tukanec.com, y pasar a producción | [DESPLIEGUE.md](DESPLIEGUE.md), "Antes de cobrar" 3 | 15 min para pedirla + lo que tarde Plux |
| 6 | **Discord**: armar el servidor oficial y conectar el bot al juego | [DISCORD.md](DISCORD.md) y luego [DISCORD_BOT.md](DISCORD_BOT.md) | 40 min + 30 min |
| 7 | **Google Play**: generar la app en qfone, subirla y la prueba cerrada | [ANDROID_GOOGLE_PLAY.md](ANDROID_GOOGLE_PLAY.md) | 2 a 3 horas + 14 días de prueba con 12 personas |

---

## Limitaciones conocidas y próximos pasos

- **El enlace del demo no tiene servidor:** sin tienda, sin modos en línea y sin partida en la nube hasta que el juego esté en el VPS.
- **Una partida nueva empieza chica** (misas y bodas): el boxeo y los eventos grandes se desbloquean con fama.
- **Pagos en modo de pruebas** hasta la certificación de Plux. La app de Android todavía no está en Google Play.
- **Páginas legales** con espacios en blanco (RUC, correo, dirección) y sin revisión de abogado.
- **Francés y ruso** mezclan el trato formal y el informal (menús con "vous/вы", historia con "tu/ты"): hay que unificarlo.
- **Balance** ajustado después del QA4 (capítulo 3 sin muro, quiebra con aviso y días de gracia, trabajar mal ya no rinde): medido con un bot y una simulación de jugador; falta confirmarlo con jugadores reales.
- **Todavía no existen:** Productor del Año, Switcher en Vivo (minijuego), Pase de Temporada, Copas internacionales
  servidor contra servidor, Gran Licitación en coalición, cadenas internacionales y la historia propia de la productora rival.
- **Orden de la casa:** borrar la rama de respaldo `wip-dificultad` de GitHub cuando todo esté en `main`.
