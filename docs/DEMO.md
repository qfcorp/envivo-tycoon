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

| Minuto | Qué tocar | Qué mostrar |
|---|---|---|
| 0–1 | Abrir el enlace → **Inicio** | La sede (garaje), dinero, fama, capítulo de la historia y el consejo de qué falta. |
| 1–4 | **Clientes** → elige una oferta → **Preparar evento** | Si tu partida tiene 20 de fama o más, elige la **Velada de boxeo**; si es nueva, la **boda** sirve igual. Muestra el **plano de cámaras** (cada posición con la cámara ideal) y el **semáforo de personal** por puesto. Toca **Elegir lo mejor automáticamente** y mira la **Calidad esperada**. |
| 4–6 | **¡Salir al aire!** | La escena **EN VIVO**. Llega un **imprevisto**: lee las opciones en voz alta y elige una; la calidad sube o baja. **Terminar transmisión**. |
| 6–7 | Pantalla de resultado → **Ver detalle** | Estrellas, pago del cliente, sueldos y ganancia. Después, el **Resumen del día**. |
| 7–8 | **Bodega** → baja a la tienda de equipos | La **fila de categorías** (cámaras, lentes, switchers...), marcas parodia y equipos que se gastan. |
| 8–9 | **Personal** | Niveles **Junior a Internacional**, sueldos, ánimo y **Buscar personal para el puesto**. |
| 9–9:30 | **Inicio** → botón **Idioma** | Cambia a **English** o **中文**, muestra una pantalla y vuelve a **Español**. |
| 9:30–10 | **En línea** y **Tienda** | Los 4 modos en línea y los equipos exclusivos. Explica: "esto se activa con el servidor, que ya está listo para instalar". |

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
- **Balance** medido con un bot; falta probar con jugadores reales si el inicio sin contratar personal y el capítulo 4 se sienten justos.
- **Todavía no existen:** Productor del Año, Switcher en Vivo (minijuego), Pase de Temporada, Copas internacionales
  servidor contra servidor, Gran Licitación en coalición, cadenas internacionales y la historia propia de la productora rival.
- **Orden de la casa:** borrar la rama de respaldo `wip-dificultad` de GitHub cuando todo esté en `main`.
