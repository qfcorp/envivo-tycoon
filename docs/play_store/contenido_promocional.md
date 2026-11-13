# Contenido promocional de Google Play: eventos hasta diciembre de 2027

Textos listos para pegar en **Play Console → Crecer → Contenido promocional → Crear contenido promocional**, uno por evento
del calendario del juego (`server/src/EventosServidor.php`). Cada tarjeta sale gratis dentro de Google Play, en la ficha
del juego y en las pestañas de juegos, mientras dura el evento.

## Antes de empezar

- **Cuándo enviarla:** Google pide que el inicio esté a más de 24 horas. Lo seguro es enviarla **entre 14 y 7 días antes**
  del inicio, porque la revisión puede tardar unos días. Abajo cada tarjeta tiene su fecha "Enviar a más tardar".
- **Tipo:** todas van como **Evento por tiempo limitado** (no como "Oferta": Google exige que una oferta sea un descuento
  o valor extra de al menos 10 % y nuestras tiendas de temporada se pagan con fichas que se ganan jugando).
- **Fechas y hora:** pon la zona horaria de Ecuador (GMT−5). Inicio a las 00:00 y fin a las 23:59 de los días indicados.
  Si cambias las fechas de un evento en el **Centro de Control → Eventos**, cambia también la tarjeta.
- **Duración máxima: 4 semanas.** Por eso la Copa Global Femenina (32 días) va en dos tarjetas.
- **Idiomas:** el texto principal va en español; agrega el inglés en "Administrar traducciones". Los demás idiomas muestran
  el inglés.
- **Límites:** lema (tagline) hasta 80 caracteres; para salir en el espacio destacado ("Spotlight") mejor 48 o menos (todos
  los de abajo cumplen). Descripción hasta 500 caracteres (recomendado más de 100).
- **Imagen principal:** 1920 × 1080 (16:9), JPG o PNG de 24 bits, menos de 1 MB. Deja libre de texto e íconos importantes el
  15 % de arriba, el 20 % de abajo y el 10 % de cada lado. Idea para cada una en "Imagen".
- **Reglas que ya cumplen los textos:** sin nombres reales de marcas, ligas, torneos ni clubes; sin precios; sin hablar de la
  tienda web; sin pedir calificaciones; nada al azar. El evento tiene que estar activo en el juego en esas mismas fechas
  (lo está si sigue encendido en el Centro de Control).
- **URL / enlace profundo:** déjalo vacío (abre el juego).

## Resumen

| # | Evento | Fechas (hora de Ecuador) | Enviar a más tardar |
|---|---|---|---|
| 1 | Viernes Negro 2026 | 27 – 30 nov 2026 | 20 nov 2026 |
| 2 | Navidad en Vivo + calendario de adviento 2026 | 1 – 25 dic 2026 | 24 nov 2026 |
| 3 | Gran Final Nacional 2026 | 4 – 13 dic 2026 | 27 nov 2026 |
| 4 | Fin de Año y Pase del Niño | 26 dic 2026 – 6 ene 2027 | 19 dic 2026 |
| 5 | Carnaval en Vivo 2027 | 31 ene – 10 feb 2027 | 24 ene 2027 |
| 6 | San Valentín en Vivo 2027 | 7 – 14 feb 2027 | 31 ene 2027 |
| 7 | Semana Santa en Vivo 2027 | 21 – 28 mar 2027 | 14 mar 2027 |
| 8 | Día de la Madre 2027 | 3 – 9 may 2027 | 26 abr 2027 |
| 9 | Semana de Finales 2027 | 24 may – 6 jun 2027 | 17 may 2027 |
| 10 | Copa Global Femenina (1): fase de grupos | 24 jun – 21 jul 2027 | 17 jun 2027 |
| 11 | Copa Global Femenina (2): semana final | 22 – 25 jul 2027 | 15 jul 2027 |
| 12 | Halloween en Vivo 2027 | 24 – 31 oct 2027 | 17 oct 2027 |
| 13 | Final Continental de Clubes 2027 | 13 – 22 nov 2027 | 6 nov 2027 |
| 14 | Viernes Negro 2027 (solo si hay promoción en el juego) | 26 – 29 nov 2027 | 19 nov 2027 |
| 15 | Navidad en Vivo + calendario de adviento 2027 | 1 – 25 dic 2027 | 24 nov 2027 |
| 16 | Gran Final Nacional 2027 | 4 – 13 dic 2027 | 27 nov 2027 |
| 17 | Fin de Año y Pase del Niño 2027 | 26 dic 2027 – 6 ene 2028 | 19 dic 2027 |

Una tarjeta a la vez por evento: Google revisa una por una. Se pueden tener varias activas a la vez (por ejemplo Navidad y
Gran Final Nacional en diciembre).

---

## 1. Viernes Negro 2026

- **Nombre interno:** `viernes-negro-2026`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 27 nov 2026 00:00 – 30 nov 2026 23:59 (GMT−5)
- **Imagen:** la sede de la productora de noche con letreros de "Viernes Negro" y cajas de equipos.
- Nota: mientras dure la promoción de Black Friday del juego (Pase VIP gratis para las primeras cuentas) la tarjeta puede
  decirlo; si la apagas en el Centro de Control, usa la versión "sin VIP" de abajo.

**Español**
- Lema: `Viernes Negro: VIP gratis para los primeros`
- Lema sin VIP: `Viernes Negro en EN VIVO Tycoon`
- Descripción: `Cuatro días de Viernes Negro en tu productora de TV en vivo. Las primeras cuentas que entren reciben el Pase VIP gratis por 30 días: más eventos al día, reparaciones más baratas y un bono diario. Además, revisa las ofertas especiales de la tienda. ¡Entra antes de que se acabe!`

**English**
- Tagline: `Black Friday week: free VIP for early players`
- Tagline without VIP: `Black Friday week in EN VIVO Tycoon`
- Description: `Four days of deals at your live TV production company. The first accounts to join get the VIP Pass free for 30 days: more events per day, cheaper repairs and a daily bonus. Also check the special offers in the store. Jump in before it ends!`

---

## 2. Navidad en Vivo + calendario de adviento 2026

- **Nombre interno:** `navidad-2026`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 1 dic 2026 00:00 – 25 dic 2026 23:59 (GMT−5)
- **Imagen:** la sede con el reno luminoso en el techo, un árbol gigante y nieve; una camarógrafa con gorro navideño.

**Español**
- Lema: `Navidad en Vivo: un regalo cada día hasta el 25`
- Descripción: `Llega la Navidad a todo el servidor. Abre un regalo cada día en el calendario de adviento (si un día no entras, lo recuperas al día siguiente). Transmite árboles gigantes y conciertos navideños, gana fichas y cámbialas en la tienda de temporada por la decoración exclusiva del reno luminoso. Y entre todos, cumplan el objetivo común del servidor para que todos reciban premio.`

**English**
- Tagline: `Christmas Live: a gift every day until the 25th`
- Description: `Christmas comes to the whole server. Open a gift every day in the Advent calendar (miss a day and you can still claim it the next day). Broadcast giant trees and holiday concerts, earn tokens and trade them in the seasonal shop for the exclusive glowing reindeer decoration. Work together on the server goal so everyone gets a reward.`

---

## 3. Gran Final Nacional 2026

- **Nombre interno:** `gran-final-nacional-2026`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 4 dic 2026 00:00 – 13 dic 2026 23:59 (GMT−5)
- **Imagen:** estadio de noche lleno, cámaras en la tribuna y un balón dorado gigante (sin escudos ni colores de clubes reales).

**Español**
- Lema: `Gran Final Nacional: transmite la final del año`
- Descripción: `El campeonato se define y tu productora transmite la final. Cubre el partido de vuelta con 5 cámaras, resuelve imprevistos como un VAR que se cae, un aguacero o las bengalas de la hinchada, y gana fichas para la tienda de temporada: el balón dorado gigante solo está estos días. Suma con todo el servidor para el premio común.`

**English**
- Tagline: `National Grand Final: the match of the year`
- Description: `The championship is decided and your company broadcasts the final. Cover the second leg with 5 cameras, handle surprises like a VAR feed going down, a downpour or flares in the stands, and earn tokens for the seasonal shop: the giant golden ball is only here these days. Team up with the whole server for a shared reward.`

---

## 4. Fin de Año y Pase del Niño

- **Nombre interno:** `fin-anio-2026`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 26 dic 2026 00:00 – 6 ene 2027 23:59 (GMT−5)
- **Imagen:** fuegos artificiales sobre la sede, un reloj de cuenta regresiva en la fachada y monigotes de año viejo.

**Español**
- Lema: `Cuenta regresiva en vivo: despide el año al aire`
- Descripción: `Transmite la cuenta regresiva, la quema de años viejos y el Pase del Niño. Todo el servidor juega el desafío «Cuenta regresiva en vivo»: entre todos llenan la barra y cada productora recibe premio. Gana fichas jugando y llévate el reloj de cuenta regresiva para tu sede, solo hasta el 6 de enero.`

**English**
- Tagline: `Live countdown: ring in the New Year on air`
- Description: `Broadcast the countdown, the burning of the old year effigies and the Christmas parade. The whole server takes on the "Live Countdown" challenge: fill the bar together and every production company gets a reward. Earn tokens by playing and get the countdown clock for your HQ, only until January 6.`

---

## 5. Carnaval en Vivo 2027

- **Nombre interno:** `carnaval-2027`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 31 ene 2027 00:00 – 10 feb 2027 23:59 (GMT−5)
- **Imagen:** corso con comparsas y espuma, máscaras de carnaval en la fachada de la sede, un dron sobre el desfile.

**Español**
- Lema: `Carnaval en Vivo: corsos, espuma y premios`
- Descripción: `Llegó el carnaval a todo el servidor. Transmite corsos y comparsas, cuida tus cámaras de la espuma y gana fichas para la tienda de temporada: las máscaras de carnaval para tu sede solo existen estos días. Junten transmisiones entre todos para cumplir el objetivo común y que cada productora reciba su premio.`

**English**
- Tagline: `Carnival Live: parades, foam and rewards`
- Description: `Carnival takes over the whole server. Broadcast parades and dance troupes, protect your cameras from the foam and earn tokens for the seasonal shop: the carnival masks for your HQ only exist these days. Add up broadcasts together to reach the server goal so every production company gets its reward.`

---

## 6. San Valentín en Vivo 2027

- **Nombre interno:** `san-valentin-2027`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 7 feb 2027 00:00 – 14 feb 2027 23:59 (GMT−5)
- **Imagen:** bodas masivas en un parque, globos de corazón en el techo de la sede, una grúa de cámara sobre la serenata.

**Español**
- Lema: `San Valentín en Vivo: bodas y serenatas al aire`
- Descripción: `Una semana de amor en vivo. Transmite bodas masivas y grandes serenatas, gana fichas en cada evento y cámbialas en la tienda de temporada por los globos de corazón para tu sede. Todo el servidor suma para el objetivo común: al cumplirlo, todos reciben premio.`

**English**
- Tagline: `Valentine's Live: weddings and serenades on air`
- Description: `A week of love, live. Broadcast mass weddings and big serenades, earn tokens at every event and trade them in the seasonal shop for heart balloons for your HQ. The whole server adds up toward the shared goal: reach it and everyone gets a reward.`

---

## 7. Semana Santa en Vivo 2027

- **Nombre interno:** `semana-santa-2027`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 21 mar 2027 00:00 – 28 mar 2027 23:59 (GMT−5)
- **Imagen:** procesión en un centro histórico al atardecer, ramos de palma en la puerta de la sede.

**Español**
- Lema: `Semana Santa en Vivo: procesiones al aire`
- Descripción: `Transmite las procesiones y celebraciones de Semana Santa con todo el servidor. Cuida el sonido, la multitud y las tomas con dron, gana fichas y cámbialas en la tienda de temporada por los ramos de palma para tu sede. Entre todos cumplan el objetivo común para el premio de todas las productoras.`

**English**
- Tagline: `Holy Week Live: processions on air`
- Description: `Broadcast Holy Week processions and celebrations with the whole server. Handle the sound, the crowds and the drone shots, earn tokens and trade them in the seasonal shop for palm decorations for your HQ. Reach the server goal together for a reward for every production company.`

---

## 8. Día de la Madre 2027

- **Nombre interno:** `dia-madre-2027`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 3 may 2027 00:00 – 9 may 2027 23:59 (GMT−5)
- **Imagen:** serenata con mariachi en una plaza, un jardín de rosas en la entrada de la sede.

**Español**
- Lema: `Día de la Madre: serenatas en vivo para mamá`
- Descripción: `Esta semana tu productora transmite serenatas y homenajes para todas las mamás. Resuelve imprevistos como un mariachi sin micrófonos, gana fichas y llévate el jardín de rosas para tu sede, solo hasta el domingo. Todo el servidor suma para el objetivo común y al cumplirlo todos reciben premio.`

**English**
- Tagline: `Mother's Day: live serenades for mom`
- Description: `This week your company broadcasts serenades and tributes for every mom. Solve surprises like a mariachi band with no microphones, earn tokens and get the rose garden for your HQ, only until Sunday. The whole server adds up toward the shared goal, and when it's reached everyone gets a reward.`

---

## 9. Semana de Finales 2027

- **Nombre interno:** `semana-finales-2027`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 24 may 2027 00:00 – 6 jun 2027 23:59 (GMT−5)
- **Imagen:** fan fest en una plaza con pantalla gigante, la sede con su propia pantalla en la terraza.

**Español**
- Lema: `Semana de Finales: el fútbol en pantalla gigante`
- Descripción: `Dos semanas de grandes finales. Transmite fan fests con pantalla gigante y partidos decisivos, que no se te apague la pantalla en el penal, y gana fichas para la tienda de temporada: la pantalla gigante para la terraza de tu sede solo está estos días. Suma con todo el servidor para el premio común.`

**English**
- Tagline: `Finals Week: football on the big screen`
- Description: `Two weeks of big finals. Broadcast fan fests with giant screens and deciding matches, don't let the screen go dark during the penalty, and earn tokens for the seasonal shop: the big screen for your HQ terrace is only here these days. Team up with the whole server for a shared reward.`

---

## 10. Copa Global Femenina (1): fase de grupos

- **Nombre interno:** `copa-global-femenina-2027-1`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 24 jun 2027 00:00 – 21 jul 2027 23:59 (GMT−5)
- **Imagen:** jugadoras en un estadio lleno (uniformes inventados), cámaras en la tribuna, una copa dorada.

**Español**
- Lema: `Copa Global Femenina: un mes de fútbol en vivo`
- Descripción: `Empieza la Copa Global Femenina y tu productora transmite los partidos. Arma tu plan de 4 cámaras, resuelve el VAR que se cae o un aguacero en el estadio y gana fichas en cada transmisión. La copa dorada para tu sede solo está en la tienda de este evento. Todo el servidor suma para el objetivo común.`

**English**
- Tagline: `Global Women's Cup: a month of live football`
- Description: `The Global Women's Cup kicks off and your company broadcasts the matches. Build your 4-camera plan, handle a VAR feed going down or a downpour at the stadium, and earn tokens at every broadcast. The golden cup for your HQ is only in this event's shop. The whole server adds up toward the shared goal.`

## 11. Copa Global Femenina (2): semana final

- **Nombre interno:** `copa-global-femenina-2027-2`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 22 jul 2027 00:00 – 25 jul 2027 23:59 (GMT−5)
- **Imagen:** la misma copa dorada con confeti y el estadio iluminado.

**Español**
- Lema: `Copa Global Femenina: ¡últimos días!`
- Descripción: `Últimos días de la Copa Global Femenina. Transmite los partidos decisivos, usa tus fichas en la tienda de temporada antes de que termine (la copa dorada para tu sede no vuelve) y reclama el premio del objetivo común si tu servidor lo cumplió.`

**English**
- Tagline: `Global Women's Cup: final days!`
- Description: `Final days of the Global Women's Cup. Broadcast the deciding matches, spend your tokens in the seasonal shop before it ends (the golden cup for your HQ won't come back) and claim the shared goal reward if your server reached it.`

---

## 12. Halloween en Vivo 2027

- **Nombre interno:** `halloween-2027`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 24 oct 2027 00:00 – 31 oct 2027 23:59 (GMT−5)
- **Imagen:** festival del terror con niebla y calabazas, murciélagos de papel en el techo de la sede.

**Español**
- Lema: `Halloween en Vivo: niebla, sustos y calabazas`
- Descripción: `Una semana de terror en vivo para todo el servidor. Transmite festivales con máquinas de niebla y escenarios tenebrosos, gana fichas y cámbialas en la tienda de temporada por los murciélagos de papel para tu sede. Entre todos cumplan el objetivo común para que cada productora reciba su premio.`

**English**
- Tagline: `Halloween Live: fog, scares and pumpkins`
- Description: `A week of live horror for the whole server. Broadcast festivals with fog machines and spooky stages, earn tokens and trade them in the seasonal shop for paper bats for your HQ. Reach the server goal together so every production company gets its reward.`

---

## 13. Final Continental de Clubes 2027

- **Nombre interno:** `final-continental-2027`
- **Tipo:** Evento por tiempo limitado
- **Fechas:** 13 nov 2027 00:00 – 22 nov 2027 23:59 (GMT−5)
- **Imagen:** final en un estadio con bengalas y bufandas de hinchada (colores inventados), dron sobre la cancha.

**Español**
- Lema: `Final Continental: la final de clubes en vivo`
- Descripción: `La final de clubes más grande del continente llega a tu productora. Transmite con 5 cámaras y dron, controla el humo de las bengalas y el VAR que se cae, gana fichas y llévate las bufandas de hinchada para tu sede, solo en esta tienda de temporada. Suma con todo el servidor para el premio común.`

**English**
- Tagline: `Continental Final: the club final, live`
- Description: `The biggest club final on the continent comes to your company. Broadcast with 5 cameras and a drone, deal with flare smoke and a VAR feed going down, earn tokens and get supporter scarves for your HQ, only in this seasonal shop. Team up with the whole server for a shared reward.`

---

## 14. Viernes Negro 2027 (solo si hay promoción en el juego)

- **Nombre interno:** `viernes-negro-2027`
- **Tipo:** Evento por tiempo limitado (u Oferta, si ese año hay un descuento real de 10 % o más)
- **Fechas:** 26 nov 2027 00:00 – 29 nov 2027 23:59 (GMT−5)
- Usa los textos de la tarjeta 1 que correspondan a la promoción de ese año (con o sin VIP gratis).

---

## 15. Navidad en Vivo + calendario de adviento 2027

- **Nombre interno:** `navidad-2027`
- **Fechas:** 1 dic 2027 00:00 – 25 dic 2027 23:59 (GMT−5)
- Los mismos textos de la tarjeta 2.

## 16. Gran Final Nacional 2027

- **Nombre interno:** `gran-final-nacional-2027`
- **Fechas:** 4 dic 2027 00:00 – 13 dic 2027 23:59 (GMT−5)
- Los mismos textos de la tarjeta 3.

## 17. Fin de Año y Pase del Niño 2027

- **Nombre interno:** `fin-anio-2027`
- **Fechas:** 26 dic 2027 00:00 – 6 ene 2028 23:59 (GMT−5)
- Los mismos textos de la tarjeta 4.
