# Lanzamiento limitado (soft launch): Ecuador, luego Colombia y Perú

Plan para las primeras 6 a 10 semanas después de que Google apruebe la producción (`docs/PUBLICAR_GOOGLE_PLAY.md`,
paso 15). La idea: **aprender barato** con pocos jugadores reales, arreglar lo que falla y solo después gastar en
países más grandes (México primero, Brasil después). Revisado el 23 oct 2026; fuentes al final.

## 0. En un minuto

1. Salimos en **Ecuador** (cohorte 1) y luego **Colombia + Perú** (cohorte 2). Cada cohorte = **900 a 1.000 instalaciones**.
2. Metas de retención: **D1 ≥ 25 %**, **D7 ≥ 8 %**, **D30 ≥ 3 %**.
3. Instalaciones de 3 fuentes: **influencers con código de regalo personal**, **compartir por WhatsApp** y un poco de
   **anuncios de Google** (campaña de apps).
4. Una actualización **cada semana** (el juego se actualiza en el VPS; la app la recibe sola).
5. Cada lunes se miran los números en el **Centro de Control › Analítica** y en Play Console.
6. Si se cumplen las metas en 2 cohortes seguidas → **México**. Si no → se arregla y se repite.

## 1. Por qué así

- **Ecuador** es casa: conocemos el público, los clubes, los eventos y la gente de producción; QF Producciones tiene
  contactos y redes. Usa dólares (los precios son los mismos que en la web).
- **Colombia y Perú**: mismo idioma, mismo gusto por el fútbol y la producción de eventos, instalaciones baratas.
  Juntos dan un número de jugadores suficiente para medir sin gastar mucho.
- **No Brasil todavía**: necesita ficha, capturas, soporte y comunidad en portugués, y es un mercado aparte. Va
  después de México.
- **México** es el siguiente: el mercado hispano más grande de la región; las instalaciones cuestan más, por eso se
  entra solo cuando el juego ya retiene.

## 2. Metas y qué tan exigentes son

| Métrica | Meta | Referencia del mercado (GameAnalytics, benchmarks 2026, todos los géneros, móvil) |
|---|---|---|
| **D1** (vuelve al día siguiente) | **≥ 25 %** | El 25 % mejor de los juegos llega a algo más de **30 %** |
| **D7** (vuelve al día 7) | **≥ 8 %** | Mediana: un poco menos de **4 %** · 25 % mejor: **6–7 %** |
| **D30** (vuelve al día 30) | **≥ 3 %** | Mediana: **0,7–0,8 %** · 25 % mejor: **1,6–1,8 %** |

👉 D1 25 % es una meta sana. **D7 8 % y D30 3 % están por encima del 25 % mejor del mercado**: son metas de juego
"de los grandes" (los de gestión tipo Kingshot viven de la retención larga). Por eso las reglas de decisión (§9) tienen
un nivel **amarillo** con los números del 25 % mejor: si llegamos ahí, el juego es bueno y se sigue mejorando.

Metas de apoyo (para saber **dónde** se pierde la gente):

| Métrica | Meta | Por qué |
|---|---|---|
| Termina el **primer evento** (guía "toca aquí") | ≥ 80 % de los que abren | Si no, el problema está en los primeros 2 minutos |
| Llega al **capítulo 2** | ≥ 40 % | El gancho de la historia |
| Crea **cuenta** | ≥ 25 % | Sin cuenta no hay nube, tienda ni juego en línea |
| **Paga** al menos una vez (a los 7 días) | ≥ 1,5 % | Conversión normal de un juego gratis bien hecho |
| Compra la **Oferta de bienvenida** ($0,99) entre los que pagan | ≥ 40 % | Es la puerta de entrada |
| Cierres inesperados (Android vitals) | < 1,09 % de usuarios | Límite de "mal comportamiento" de Google: por encima, Play nos muestra menos |
| ANR (la app se congela) | < 0,47 % de usuarios | Mismo motivo |
| Calificación en Play | ≥ 4,3 ⭐ | Afecta cuánta gente instala desde la ficha |
| Reportes del chat sin atender > 24 h | 0 | Requisito de Google para apps con chat |

**Ojo con el ruido:** con 1.000 instalaciones, un D1 de 25 % puede ser en realidad entre 22,3 % y 27,7 %; un D7 de 8 %,
entre 6,3 % y 9,7 %; un D30 de 3 %, entre 1,9 % y 4,1 % (intervalo de confianza del 95 %). Por eso cada cohorte necesita
**al menos 900 instalaciones** y las decisiones se toman con **2 cohortes**, no con una.

## 3. Calendario

| Semana | Qué pasa | Instalaciones |
|---|---|---|
| −2 a 0 | Prueba cerrada (14 días) y aprobación de producción. Preparar influencers, códigos y mensajes. | — |
| 1 | **Cohorte 1 · Ecuador** sale. Influencers de Ecuador publican (días 1–5). WhatsApp de QF. Google Ads empieza en Ecuador. | ~400 |
| 2 | Primer arreglo grande con lo que se vio (primer evento, dificultad). Segunda ola de influencers. | ~350 |
| 3 | Se completa la cohorte 1. Se apaga Google Ads de Ecuador cuando llega a ~1.000. | ~250 (total ~1.000) |
| 4 | **Cohorte 2 · Colombia + Perú** sale (se agregan los países en Producción si aún no estaban; ver nota). Influencers de Colombia y Perú. | ~500 |
| 5 | Se completa la cohorte 2. Revisión D7 de la cohorte 2. | ~450 (total ~950) |
| 7 | Revisión D30 de la cohorte 1 → primera decisión (§9). | — |
| 8–10 | Revisión D30 de la cohorte 2 → decisión México. Si hay que repetir: cohorte 3 con los arreglos. | (cohorte 3 si toca) |

Nota sobre países: el Paso 16 de `docs/PUBLICAR_GOOGLE_PLAY.md` abre los 3 países desde el día 1 (más simple en Play
Console). Igual se pueden separar las cohortes por **dónde se gasta**: en la semana 1 solo hay influencers y anuncios
en Ecuador; Colombia y Perú reciben su promoción desde la semana 4. Las instalaciones orgánicas que lleguen antes de
Colombia y Perú se cuentan aparte (Centro de Control › Analítica, filtro por país).

## 4. Presupuesto

Costo por instalación (CPI) de referencia en Latinoamérica: **~$0,34–0,50** de promedio
(Linkrunner, 2025–2026); los mercados "tier 3" (Brasil y LATAM) van de **$0,05 a $0,50**, y los juegos de
**simulación** en Android cuestan más que el promedio (**$0,60–2,00** a nivel mundial) (MegaDigital, 2026). Para
EN VIVO usamos un rango de **$0,15 a $0,60** por instalación pagada.

**Por cohorte de 1.000 instalaciones** (suponiendo que ~60 % llega pagado y ~40 % por influencers, WhatsApp y orgánico):

| Escenario | CPI | 600 instalaciones pagadas | Influencers (pagos y regalos) | Total por cohorte |
|---|---|---|---|---|
| Bajo | $0,15 | $90 | $150 | **$240** |
| Medio | $0,35 | $210 | $250 | **$460** |
| Alto | $0,60 | $360 | $400 | **$760** |

**Total de las 2 cohortes:** entre **$480 y $1.520** (escenario medio: **~$920**). Reserva un 20 % extra por si hay que
hacer la cohorte 3. Los montos de influencers son una estimación (micro-influencers locales con pago pequeño + regalo).

Google Ads (campaña de apps, objetivo "Instalaciones"):
- Se crea en **ads.google.com** → Nueva campaña → **Promoción de apps** → Android → `com.tukanec.envivo` →
  objetivo **Instalaciones** → ubicación: **solo Ecuador** (cohorte 1) / **Colombia y Perú** (cohorte 2) → idioma español.
- Google recomienda un **presupuesto diario de al menos 50 veces el CPI objetivo**: con CPI objetivo de $0,30 → **$15
  al día**; eso da ~50 instalaciones al día, unas 2 semanas para las 600 pagadas.
- Dejar **7 a 14 días** sin tocar la campaña (está "aprendiendo"); cambiar el presupuesto o el objetivo reinicia el aprendizaje.
- Textos para la campaña: usar las frases de la descripción breve y los títulos de las capturas (sin precios ni "el mejor").
- El dinero de Google Ads se paga con tarjeta; la factura la emite Google (consultar al contador).

## 5. Programa de influencers con códigos de regalo personales

Usa el **sistema de códigos de regalo** que está construyendo otro ayudante (cuando llegue, su guía estará en
`server/INTEGRAR_*.md` y en el Centro de Control). Lo que necesita este plan de ese sistema:
- Un **código personal por influencer** (ej. `CAMARA-JUAN`, `GOLAZO-ANA`), con **contenido fijo** (ej. 150 créditos +
  1 camarógrafo senior de refuerzo por 2 eventos) — nada al azar.
- **Un canje por cuenta**, **tope de canjes** por código (ej. 500) y **fecha de vencimiento** (ej. 30 días).
- Un reporte en el Centro de Control: **canjes por código** y, de esos jugadores, D1, D7 y cuántos pagaron.

Quiénes (por país, 5 a 8 por cohorte):

| Tipo | Seguidores | Por qué | Pago sugerido |
|---|---|---|---|
| Creadores de **producción audiovisual / streaming** (camarógrafos, streamers técnicos, realizadores) | 5.000–50.000 | Público exacto: les encanta ver su oficio en un juego | Regalo + $20–60 por video |
| Creadores de **fútbol** local (hinchas, análisis, memes de fútbol) | 10.000–100.000 | Los partidos y la final del estadio son el gancho | $30–80 por video |
| Streamers de **juegos de celular** (TikTok, YouTube, Kick) | 5.000–50.000 | Saben mostrar un juego en 30 s | $20–60 por video o directo |
| Gente de **QF Producciones** y su red (camarógrafos, clubes, ligas barriales) | cualquiera | Confianza y costo cero | Código + reconocimiento en el juego |

Cómo pedírselo (mensaje base):

```
¡Hola [nombre]! Soy Dimitry de QF Producciones (hacemos transmisiones en vivo en Ecuador). Lanzamos
EN VIVO Tycoon, un juego de celular donde manejas tu propia productora: cámaras, imprevistos en vivo,
la final del estadio. ¿Te animas a probarlo y mostrarlo en un video?

Te damos un código personal para tu comunidad: [CÓDIGO] (regala [contenido] a quien lo canjee).
Pago: [monto] por video + [bono] si tu código pasa de 100 canjes.
El juego está en Play Store: https://play.google.com/store/apps/details?id=com.tukanec.envivo&referrer=utm_source%3D[codigo]%26utm_medium%3Dinfluencer
```

Reglas (para cumplir con Google y con las leyes de publicidad):
- El influencer marca su video como **#publicidad** / colaboración pagada.
- **Nunca** pedir ni premiar **reseñas, estrellas o comentarios** en Play Store (está prohibido por Google: puede
  borrar las reseñas o sancionar la app). El código premia **instalar y jugar**, no calificar.
- Los códigos **no se venden**: se regalan. Lo que se vende con dinero dentro de la app va siempre por Google Play.
- Medir cada influencer por **canjes**, **D7 de sus jugadores** y **pagadores**, no por vistas. Al que trae jugadores
  que se quedan, se le vuelve a contratar.

Enlace con seguimiento: el parámetro `referrer=utm_source%3D…` aparece en Play Console › Estadísticas › **Adquisición**
› "Canales con seguimiento (UTM)". La app (TWA) no lee ese parámetro; el seguimiento dentro del juego es por el **código**.

## 6. Compartir por WhatsApp

En Ecuador, Colombia y Perú casi todo se comparte por WhatsApp. Hoy el juego **no tiene** botón para compartir; queda
pedido al integrador en `server/INTEGRAR_PLAYSTORE.md` (§3). Cómo debería funcionar:
- Botón **"Invitar por WhatsApp"** en 3 momentos felices: al sacar **5 ⭐**, al **ganarle un duelo a MegaVisión** y al
  **terminar un capítulo**. (No al abrir el juego: molesta.)
- Abre el menú de compartir del celular (o `https://wa.me/?text=…`) con este texto:

```
¡Estoy manejando mi propia productora en EN VIVO Tycoon! 🎥 Hoy transmití [evento] con [N] estrellas.
Usa mi código [CÓDIGO-DEL-JUGADOR] y empiezas con un regalo:
https://play.google.com/store/apps/details?id=com.tukanec.envivo&referrer=utm_source%3Dwhatsapp
```

- Premio para los dos (quien invita y quien llega) **cuando el invitado llega al capítulo 2** (no al instalar), para
  evitar trampas; máximo 10 invitaciones premiadas por jugador; una por dispositivo/cuenta.
- Además: **Canal de WhatsApp** de EN VIVO Tycoon (o de QF Producciones) para avisar las novedades de cada semana.

## 7. Ritmo semanal de actualizaciones

Lo bueno de la TWA: **los cambios del juego no pasan por la revisión de Google** (se suben al VPS y la app los recibe).
Solo cambios de la "cáscara" (ícono, nombre, versión de Android) necesitan un .aab nuevo.

| Día | Qué |
|---|---|
| **Lunes** | Leer los números (§8) y escribir el resumen de la semana (plantilla abajo). Elegir **1 o 2** cosas para arreglar. |
| **Martes** | Publicar la actualización en el VPS (mañana, para reaccionar si algo falla). Probar en un celular con la app de Play. |
| **Miércoles** | Aviso de novedades: dentro del juego, Discord, canal de WhatsApp, historias de Instagram/TikTok de QF. |
| **Jueves** | Contenido: un clip de 15–30 s del juego (los planos del guion de `docs/play_store/ASO_Y_CAPTURAS.md` sirven). |
| **Viernes–domingo** | Eventos en línea del fin de semana (Liga Semanal cierra, Desafío del Día). Moderar chat y soporte a diario. |

Cada 2 semanas: **una novedad que se note** (un evento nuevo, un imprevisto nuevo, una oferta de temporada) para que
los que se fueron tengan motivo para volver.

Plantilla del resumen del lunes (copiar en un documento o en el chat):

```
Semana [N] · Cohorte [1/2] · [fechas]
Instalaciones: [ ] (EC [ ] · CO [ ] · PE [ ])   Gasto: $[ ]   CPI real: $[ ]
D1: [ ] %   D7: [ ] %   D30: [ ] %   (meta 25 / 8 / 3)
Termina primer evento: [ ] %   Llega a capítulo 2: [ ] %   Crea cuenta: [ ] %
Pagadores: [ ] % · Ingresos: $[ ] · ARPDAU: $[ ]
Cierres (vitals): [ ] %   Calificación: [ ] ⭐   Reportes de chat: [ ] (pendientes: [ ])
Mejor influencer: [código] ([ ] canjes, D7 [ ] %)
Lo que más se quejaron: [ ]
Lo que arreglamos esta semana: [ ]
```

## 8. Qué medir (Centro de Control › Analítica, y Play Console)

La pestaña **Analítica** del Centro de Control la está construyendo otro ayudante. Para este plan necesita mostrar,
**por cohorte (semana de instalación) y por país**:

| Métrica | Cómo se calcula | Para qué |
|---|---|---|
| Instalaciones / jugadores nuevos | Primer arranque con `origen=android` (o web), por país | Tamaño de la cohorte |
| **D1, D7, D30** | % de la cohorte que abrió el juego el día 1, 7 y 30 después del primero | Las metas |
| Embudo de inicio | % que termina cada paso de la guía y el **primer evento** | Dónde se pierden los nuevos |
| Embudo de la historia | % que llega a los capítulos 2, 3, 4… | Si la historia engancha |
| Sesiones por día y minutos por sesión | Promedio por jugador activo | Ritmo de juego |
| Cuentas creadas | % de la cohorte | Puerta a la tienda y al juego en línea |
| **Conversión a pago** | % de la cohorte con al menos una compra (día 1, 7, 30) | Monetización |
| ARPDAU y ARPPU | Ingresos ÷ jugadores activos del día; ingresos ÷ pagadores | Cuánto vale un jugador |
| Ingresos por producto | Bienvenida, inicio, créditos, VIP, tarjeta, pases… | Qué se vende y qué no |
| **Canjes por código de regalo** | Canjes y D7 / pagadores de esos jugadores, por código | Pagar a los influencers que funcionan |
| Invitaciones por WhatsApp | Enviadas y convertidas (invitado llegó al capítulo 2) | Si el compartir funciona |
| Errores del juego | Errores por 1.000 sesiones, los 10 más comunes | Qué arreglar el martes |
| Chat y soporte | Mensajes, reportes, tiempo de respuesta, casos abiertos | Salud de la comunidad |

En **Play Console** (Estadísticas y Calidad):
- **Ficha: tasa de conversión** (visitantes de la ficha que instalan). Play Console la compara con la mediana de
  juegos parecidos ("grupo de pares"); si estamos por debajo, cambiar capturas o descripción breve (experimentos de la ficha).
- **Adquisición por fuente**: Búsqueda en Play, Explorar, enlaces (UTM), Google Ads.
- **Android vitals**: cierres y ANR (límites en §2).
- **Calificaciones y reseñas**: responder **todas** las reseñas de 1 a 3 ⭐ en menos de 48 h.

## 9. Reglas de decisión: ¿pasamos a México?

Se mide al terminar el **D30 de la cohorte 2** (semana 8–10), mirando las 2 cohortes.

| Semáforo | Condición (las 2 cohortes) | Qué se hace |
|---|---|---|
| 🟢 **Verde** | D1 ≥ 25 %, D7 ≥ 8 %, D30 ≥ 3 %, pagadores a 7 días ≥ 1,5 %, cierres < 1,09 %, calificación ≥ 4,3 | **Abrir México**: agregar el país, ficha es-419 (sirve), precios en MXN, presupuesto 3 a 5 veces el de una cohorte, influencers mexicanos |
| 🟡 **Amarillo** | D1 ≥ 25 %, D7 ≥ 5 %, D30 ≥ 1,5 % (nivel del 25 % mejor del mercado) y cierres < 1,09 % | Se puede abrir México **con presupuesto chico** (como una cohorte más) mientras se mejora la retención larga; o repetir una cohorte en Colombia/Perú con los arreglos |
| 🔴 **Rojo** | D1 < 20 %, o D7 < 4 %, o cierres ≥ 1,09 %, o calificación < 4,0 | **No gastar más en anuncios.** Arreglar el inicio (primeros 10 minutos), la dificultad o los errores. Nueva cohorte de 900–1.000 cuando esté listo |

Además, para gastar de verdad en México hace falta que **lo que deja un jugador** alcance para pagar lo que cuesta
traerlo: ingresos por instalación a 30 días × 2 (aproximación del valor a 90 días) **≥ CPI esperado en México**
(planificar con ~$0,50–1,00). Si no se cumple, México se hace solo con influencers y orgánico.

Después de México, en este orden: Argentina y Chile (español), luego **Brasil** con ficha, capturas y soporte en
portugués (la ficha `ficha_pt-BR.md` ya existe) y precios en BRL.

## Fuentes

- Benchmarks de retención móvil 2026 (GameAnalytics: D1 top 25 % > 30 %, D7 mediana < 4 % y top 6–7 %, D30 mediana
  0,7–0,8 % y top 1,6–1,8 %): https://gamedevreports.substack.com/p/gameanalytics-mobile-and-pc-game
- CPI promedio en Latinoamérica ~$0,34–0,50 (2025–2026): https://linkrunner.io/cost-per-install-benchmark
- CPI por región y género 2026 (tier 3 Brasil/LATAM $0,05–0,50; simulación Android $0,60–2,00): https://megadigital.ai/en/blog/cpi-mobile-game-guide/
- Rango general de CPI en Latinoamérica ($0,50–2,00, todas las categorías): https://mapendo.co/blog/cost-per-install-by-country-2025
- Campañas de apps de Google Ads (presupuesto ≥ 50 × CPI objetivo, 7–14 días de aprendizaje): https://support.google.com/adwords/answer/6167156
- Requisitos de prueba y acceso a producción: https://support.google.com/googleplay/android-developer/answer/14151465
- Android vitals (límites de cierres 1,09 % y ANR 0,47 %): https://developer.android.com/topic/performance/vitals
