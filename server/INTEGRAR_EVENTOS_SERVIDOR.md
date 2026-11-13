# Eventos de todo el servidor y calendario de adviento

Ideas 1 y 11 de las propuestas del 13-nov-2026. Rama `eventos-servidor`.

Archivos: `server/src/EventosServidor.php`, `server/src/EventosServidorApi.php`, `server/src/migraciones/eventos_servidor.sql`,
`server/public/control/lib/eventos_servidor.php` (pestaña **Eventos**), `js/eventos_servidor.js` (Inicio), `js/temporadas.js` (bloque `eventos_servidor`:
temporadas nuevas dentro de la partida), `docs/play_store/contenido_promocional.md` (tarjetas de Google Play),
`docs/traducciones/errores_nuevos/eventos_servidor.json`.
Pruebas: `php server/tests/pruebas_eventos_servidor.php` y `NODE_PATH=/opt/npm-tools/node_modules node tests/test_eventos_servidor.js`.

## Qué es

Cada temporada es un **evento de todo el servidor** (fechas en hora de Ecuador, `EventosServidor::CALENDARIO`):

| Evento | Fechas | Desde |
|---|---|---|
| Carnaval en Vivo | Pascua −56 a −46 (2027: 31 ene – 10 feb) | 2027 |
| San Valentín en Vivo | 7 – 14 feb | 2027 |
| Semana Santa en Vivo | Pascua −7 a 0 (2027: 21 – 28 mar) | 2027 |
| Día de la Madre | semana del 2.º domingo de mayo (2027: 3 – 9 may) | 2027 |
| Semana de Finales | 24 may – 6 jun | 2027 |
| Copa Global Femenina | 24 jun – 25 jul | solo 2027 |
| Halloween en Vivo | 24 – 31 oct | 2027 |
| Final Continental de Clubes | 13 – 22 nov | 2027 |
| Viernes Negro (solo calendario) | las fechas de la promo de Black Friday; si no es de ese año, viernes después del 4.º jueves de nov. al lunes | 2026 |
| Navidad en Vivo (+ adviento) | 1 – 25 dic | 2026 |
| Gran Final Nacional | 4 – 13 dic | 2026 |
| Fin de Año y Pase del Niño ("Cuenta regresiva en vivo") | 26 dic – 6 ene | 2026 |

Cada evento (menos el Viernes Negro, que **no duplica** Black Friday: solo aparece en el calendario) trae:

- **Tienda de temporada** (`TIENDA`): se paga con **fichas de evento** que se ganan jugando. Nada pagado, nada al azar, cada
  artículo dice lo que trae y cuántas veces se compra: $2.000 del juego (15 fichas, 6 veces), 3 cables (10, 5), 3 baterías
  (10, 5), reparar todo (25, 2), seguro de evento (20, 3), alquiler de lente box (25, 2), camarógrafo senior de refuerzo
  (35, 2), 10 créditos (60, 2) y la **decoración exclusiva** del evento para la sede (80, 1). Las fichas valen solo en su evento.
- **Objetivo común por servidor** (`HITOS`): barra con lo que juegan todos los del servidor. Mitad = $3.000 + 3 baterías;
  meta = 20 créditos + $5.000 + reparar todo, para **todos** los del servidor (se reclaman hasta 7 días después).
  La meta se calcula una vez por servidor (activos de 7 días × días × 1,2; entre 40 y 100.000) o la fija el panel.
- **Oferta especial**: un producto que ya existe (`oferta`: tarjeta semanal, 700 créditos, pack de obra, Pase Premium,
  Pase VIP, Pase de Copa...). El juego la muestra con el precio de siempre (`ctx.precio`): en la app solo si Google Play lo
  tiene; si no, "Ver en la Tienda".
- **Tabla especial del evento**: las 10 productoras del servidor con más fichas ganadas.

**Fichas**: 5 al día ("Fichas del día"), 2 por evento jugado en la partida (+1 con 4-5⭐; hasta 12 por día) y 3 por intento en
línea validado (Liga, Festival, Copa, Duelos, Desafío, leídos de `pase_xp`; hasta 5 por día). Cada evento jugado suma 1 al
objetivo; cada intento en línea, 2. Validación modesta a propósito (como Misiones): topes por día y UNIQUE por ref.

**Calendario de adviento** (1 – 25 dic, `ADVIENTO`): un regalo fijo por día (dinero, repuestos, fichas de Navidad, créditos:
55 en total, refuerzos, reparar todo y el día 25 la estrella del adviento). Se puede recuperar **solo el de ayer** (el 26
todavía se recupera el 25). Sin evento de Navidad, cada ficha llega como $100 del juego.

**Temporadas nuevas dentro de la partida** (bloque `eventos_servidor` de `js/temporadas.js`, idea 11): Día de la Madre, Semana de Finales, Copa
Global Femenina, Final Continental, Gran Final Nacional, con las mismas fechas del servidor (la prueba lo revisa), clientes
inventados, imprevistos propios (VAR que se cae, aguacero en el estadio, bengalas, pantalla gigante, mariachi), meta y premio
(trofeo + decoración de sede). `js/temporadas.js` acepta `anios: [primero, último]` para la Copa (solo 2027).

## Centro de Control → Eventos

Encender/apagar todos, cada uno y el adviento; cambiar fechas (días completos) y meta de cada edición o "Volver al
calendario"; avance del objetivo común por servidor, fichas ganadas/gastadas y compras; vista previa de una fecha.

**Para probar adelantando la fecha** (como Black Friday): pon el inicio de una edición en hoy (pestaña Eventos), o en las
pruebas `EventosServidor::fijarReloj($t)` / `ENVIVO_PRUEBA_AHORA` con `server/tests/reloj_prueba.php`. En el juego,
`?fecha=AAAA-MM-DD` mueve solo las temporadas de la partida.

## API

`GET /api/eventos_servidor` (sin sesión también) · `POST /api/eventos_servidor/diario {instancia}` · `/jugar {eventos: [{ref, estrellas}]}` ·
`/comprar {instancia, articulo}` · `/meta {instancia, hito}` · `/adviento {dia}`. Los POST piden sesión y `X-Envivo: 1`.
(`/api/eventos` ya es de la analítica.) Entregas: créditos con `Monedero::mover` (motivo `evento_servidor`), decoraciones en
`evs_cosmeticos` (el juego las pone en `s.temporada.cosmeticos`), lo demás como entregas que el juego aplica.

## Cambios en archivos compartidos (ganchos pequeños)

`server/public/api.php` (1 línea), `server/public/control/index.php` (3 líneas) y `lib/base.php` (pestaña), `server/tests/correr.sh`
(suite), `server/tests/reloj_prueba.php` (1 línea), `index.html` y `sw.js` (1 archivo con defer), `js/temporadas.js` (`anios` y las 5 temporadas nuevas),
`js/datos.js` (textos de la lógica), `js/art.js` (12 decoraciones e íconos), `js/lang/es.js` (bloque `evs.*`).

## Falta

- Traducir los textos `evs.*` y los de `js/datos.js` (pasada final). `errores_nuevos/eventos_servidor.json` ya está en los 10 idiomas.
- Crear en Play Console las tarjetas de `docs/play_store/contenido_promocional.md` con su imagen 1920×1080.
