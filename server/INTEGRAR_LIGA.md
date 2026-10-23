# Liga Semanal de Productoras: cómo conectarla

Archivos nuevos (no tocan nada de lo que ya existe):

| Archivo | Qué es |
|---|---|
| `server/src/Liga.php` | Toda la lógica: semanas, grupos, encargos, intentos, puntos, banderas, ascensos/descensos, fichas, tienda |
| `server/src/LigaApi.php` | Las rutas `/api/liga...` (api.php las llama con una línea) |
| `server/src/migraciones/liga.sql` | Tablas `liga_*` (`CREATE ... IF NOT EXISTS`; se crean solas con `Liga::preparar()`) |
| `server/bin/liga.php` | Tarea programada (cambio de semana a la hora exacta, encargos vencidos, revalidar) |
| `js/liga.js` | Pantalla: `Liga.render(el, ctx)`, `Liga.progresoLocal(s, tarea)` |
| `server/tests/pruebas_liga.php`, `server/tests/router_liga.php`, `tests/test_liga.js` | Pruebas |

## Reglas

- **Semana:** lunes 00:00 a domingo 23:59:59 (zona `ENVIVO_ZONA`, America/Guayaquil). El cambio de semana es
  perezoso: la primera petición de la semana nueva cierra la anterior y arma los grupos. `bin/liga.php` hace lo mismo a la hora exacta.
- **Ligas:** 0 Barrial · 1 Provincial · 2 Nacional · 3 Internacional · 4 Mundial (`liga_asociaciones`). Toda asociación nueva empieza en la Barrial.
- **Grupos:** al empezar la semana entran las asociaciones con miembros que sumaron puntos en alguna de las 2 semanas
  anteriores (o creadas hace menos de 14 días). Se ordenan por liga y por puntos de la semana pasada, y se cortan en
  grupos consecutivos de ~8, así cada grupo es de liga parecida. Las demás entran cuando un miembro abre la liga: van a
  un grupo de su liga con menos de 10, o a uno nuevo.
- **Tablero:** 12 encargos por asociación, sorteados con una semilla propia de (asociación, semana) y `LIGA_SECRETO`.
  Las ligas altas piden más eventos y eventos más grandes (conciertos, LigaPro, finales) y dan más puntos. Nunca hay más de 2 encargos iguales a la vez.
  Un encargo completado o descartado se reemplaza a los 10 minutos.
- **Miembros:** un encargo a la vez, máximo 9 por semana (el cupo se gasta al tomarlo; abandonar no lo devuelve).
  Cada encargo tiene un tiempo límite (12 h + 6 h por evento, máximo 48 h). Si se vence o el jugador sale de la asociación, el encargo vuelve al tablero con avance 0.
  Solo el **presidente** puede descartar encargos libres.
- **Cómo se cumple un encargo:** solo con **intentos de evento** que entrega el servidor (ver abajo). Cada intento que
  cumple el criterio suma 1 de avance; al llegar a la meta, los puntos del encargo van a la asociación.
- **Cierre:** posiciones por puntos (a igual puntaje gana quien llegó primero). En grupos de 6 o más suben los 2
  primeros (con puntos) y bajan los 2 últimos; en grupos de 3 a 5, uno y uno. Las que terminan con 0 puntos bajan
  siempre (salvo en la Barrial). Mundial no sube y Barrial no baja.
- **Fichas:** cada jugador que completó al menos un encargo para esa asociación recibe las fichas de cada bandera
  alcanzada + las de su puesto (`Liga::banderas($liga)`, `Liga::fichasPosicion($liga, $pos)`). Todo queda anotado en
  `liga_fichas_mov` con una referencia única, así nunca se paga dos veces. También se le avisa por el canal `sistema:<jugador>` del chat.
- **Tienda:** repuestos, dinero del juego, taller, refuerzos (entregas de los tipos que el juego ya aplica) y
  cosméticos (`liga_cosmeticos`, no son entregas). Algunos artículos tienen límite por semana o piden una liga mínima. Nada se puede vender en el mercado.

## Intentos: modo firma ahora, validador después

1. `POST /api/liga/intento` → el servidor sortea la **semilla** (`random_int`) y arma el **contrato** según el encargo
   (tipo de evento, transmisión, aire libre, duelo con `rivalQuality`). Guarda también el **equipo** que registra el juego.
   Devuelve el intento con la misma forma que usa `server/validador/intento.js` (`seed, contrato, equipo, contexto, vip`) + `id`, `firma` y `vence` (3 h).
2. El juego juega ese evento (`Intento.crearEstado(Game, intento)`) y manda **solo** `decisiones` + el `resultado` que dice que sacó.
3. `POST /api/liga/completar`. Una semilla = un intento: queda usado aunque falle.
   - `LIGA_VALIDACION=firma` (por defecto, **mientras no esté el validador**): se acepta el resultado del juego si el
     intento lleva la firma HMAC del servidor (`firma`), es de ese jugador, no está vencido y el resultado es coherente
     (estrellas según la calidad, el duelo según `rivalQuality`, un imprevisto por decisión). Estado `firmado`.
     **Ojo:** en este modo, alguien que modifique el juego puede inventar su calidad. Se guardan las decisiones para revisarlo después.
   - `LIGA_VALIDACION=repeticion`: `server/validador` repite la jugada y vale **su** resultado (`validado`). Si el juego
     dijo otra cosa queda `sospechoso` (salvo que sea por otra versión de la lógica). Si la jugada es imposible: `rechazado`.
     Si el validador no responde: `pendiente` (HTTP 202) y `bin/liga.php` lo revalida después.
     El validador se busca así: `Liga::usarValidador($f)` → si no, `EnVivo\Validador::validar()` (si alguien crea esa clase) → si no,
     `Liga::validarConNode()` (servicio HTTP con `VALIDADOR_URL` + `VALIDADOR_CLAVE`, y si no responde, `node server/validador/validador.js`).
   - Cuando llegue el validador: poner `LIGA_VALIDACION=repeticion` y correr una vez `php server/bin/liga.php --revisar-firmados`:
     repite los intentos aceptados en modo firma y marca `sospechoso = 1` los que no coinciden (no quita puntos; eso lo decide una persona).

Criterios de los encargos (iguales en `Liga::cumple` y `Liga.cumple` de `js/liga.js`): `evento` [tipos], `min_estrellas`
(mínimo 1 siempre), `stream`, `outdoor`, `min_diff`, `duelo: 'won'`, `sin_cortes` (con transmisión y ningún imprevisto
`internet, luz, senal, cable, bateria, falla` con resultado negativo), `senior` (alguien del equipo registrado con `tier`
senior/internacional o habilidad 4+).

## 1. api.php (UNA línea)

En `server/public/api.php`, justo **antes** de `match ($ruta) {` (después de la revisión de `X-Envivo` y del método):

```php
    if (\EnVivo\LigaApi::esRuta($ruta)) \EnVivo\LigaApi::responder($ruta, $metodo, requiere_sesion());
```

Eso es todo: `LigaApi` responde y termina (`never`). Los errores salen como `Fallo` y el `catch (Fallo $e)` que ya
tiene api.php los convierte en `{ "ok": false, "error": "...", "codigo": "..." }` con su código HTTP.
(Si se prefiere dentro del `match`: `'/liga', '/liga/tomar', '/liga/abandonar', '/liga/descartar', '/liga/intento', '/liga/completar', '/liga/tienda' => \EnVivo\LigaApi::responder($ruta, $metodo, requiere_sesion()),`)

## 2. Rutas

Todas con sesión (401 sin ella). POST con `X-Envivo: 1` (403 sin ella). Respuestas de error con `codigo`.

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /api/liga` | | estado (abajo) |
| `POST /api/liga/tomar` | `{ "tarea_id": 12 }` | `{ ok, liga: estado }` · 409 `ya_tienes` / `ocupada` / `espera` / `limite` / `sin_asociacion`, 404 `no_existe` |
| `POST /api/liga/abandonar` | `{}` | `{ ok, liga }` · 409 `sin_tarea` |
| `POST /api/liga/descartar` | `{ "tarea_id": 12 }` | `{ ok, liga }` · 403 `no_presidente`, 409 `ocupada` |
| `POST /api/liga/intento` | `{ "equipo": { "staff": [{role, skill, morale?, owner?, name?, tier?}], "equip": [{type, condition}] }, "tipo"?: "boda" }` | `{ ok, intento: { id, tarea_id, seed, contrato, equipo, contexto, vip, firma, vence, modo } }` · 409 `sin_tarea`, 400 `equipo` / `tipo`, 429 |
| `POST /api/liga/completar` | `{ "intento_id", "firma", "decisiones": [0, 2], "resultado": { "calidad", "estrellas", "duelo"?, "incidentes": [{clave, q}] } }` | `{ ok, intento: { id, estado, cuenta, calidad, estrellas, motivo }, tarea_completada, puntos, liga }` (202 si quedó `pendiente`) · 403 `firma`, 409 `usado` / `vencido`, 422 `resultado`, 400 `decisiones` |
| `GET /api/liga/tienda` | | `{ ok, fichas, liga, articulos: [{ id, nombre, detalle, icono, fichas, tipo, max_semana, compradas_semana, disponible, alcanza, motivo }], cosmeticos: [ids], historial }` |
| `POST /api/liga/tienda` | `{ "articulo": "cables" }` | `{ ok, fichas, entrega \| null, cosmetico \| null, tienda }` · 402 `sin_fichas`, 409 `no_disponible`, 404 `no_existe` |

`resultado` acepta también `quality` / `stars` / `duel` (lo que devuelve `finishEvent`).

Estado (`GET /api/liga`):

```json
{ "ok": true,
  "semana": { "id": "2026-10-26", "inicio": "2026-10-26T00:00:00-05:00", "fin": "2026-11-01T23:59:59-05:00", "quedan_seg": 300000 },
  "ligas": [ { "indice": 0, "id": "barrial", "nombre": "Liga Barrial", "color": "#c58b5a" }, "..." ],
  "fichas": 135, "validacion": "firma", "max_tareas": 9,
  "liga": { "indice": 1, "id": "provincial", "nombre": "Liga Provincial", "color": "#b8c2d6" },
  "asociacion": { "id": 4, "nombre": "...", "siglas": "PUV", "color": "#ff3b3b", "puntos": 3820, "tareas_completadas": 14, "mi_cargo": "presidente", "puede_descartar": true },
  "banderas": [ { "n": 1, "puntos": 1400, "fichas": 18, "alcanzada": true }, "..." ],
  "tablero": [ { "id": 101, "n": 0, "estado": "disponible|tomada", "plantilla": "bodas", "titulo": "Cubre 3 bodas", "icono": "boda", "meta": 3, "avance": 0,
                 "puntos": 180, "horas": 30, "criterio": {...}, "tipos": ["boda"], "jugador": { "id": 7, "nombre": "..." } | null, "mia": false,
                 "tomada_en": null, "vence": null, "vence_seg": null },
               { "id": 105, "n": 14, "estado": "espera", "aparece_en": "...", "aparece_seg": 512 } ],
  "mi_tarea": { ...como una del tablero..., "intento_abierto": { id, estado, ... } | null } | null,
  "mis_tareas": { "usadas": 4, "max": 9, "completadas": 3, "puntos": 610 },
  "hechas": [ { "id", "titulo", "icono", "puntos", "jugador": {id, nombre}, "completada_en" } ],
  "grupo": { "id": 3, "numero": 3, "liga": {...}, "ranking": [ { "posicion", "asociacion_id", "nombre", "siglas", "color", "servidor", "liga", "puntos", "tareas", "banderas", "mia", "zona": "sube|baja|null" } ] },
  "ultima_semana": { "semana", "posicion", "resultado": "sube|baja|queda", "puntos", "fichas_ganadas", "liga_nueva": {...} } | null }
```

Sin asociación: `{ ok, semana, ligas, fichas, validacion, max_tareas, sin_asociacion: true, asociacion: null }`.

## 3. En el juego

`index.html`, después de `js/chat.js`:

```html
<script src="js/liga.js"></script>
```

(y agregar `js/liga.js` a la lista de archivos de `sw.js` para que funcione sin internet.)

Para jugar el intento hace falta `server/validador/intento.js` en el navegador: copiarlo a `js/intento.js` (o servirlo) y
cargarlo antes de `js/liga.js`. En `js/ui.js`, donde se pinta la pestaña de la comunidad / liga:

```js
window.Liga.render($('liga-cont'), {
  A, estado: () => S, guardar: save, toast, ask,
  // Juega el evento de la liga con la semilla del servidor en un estado APARTE (no toca la partida):
  // mismo modal "en vivo" de siempre, guardando el número de opción de cada imprevisto.
  jugarIntento: (intento) => jugarEventoLiga(intento),   // -> Promise<{ decisiones: [n...], resultado: { quality, stars, duel, incidentes: [{clave, q}] } } | null>
  abrirAsociaciones: () => window.Chat && window.Chat.abrir && window.Chat.abrir('asociacion'),
  alCanjear: () => { Api.refrescar().then(() => { aplicarEntregas(); save(); }); },   // la entrega de la tienda llega por /api/estado
});
```

Esqueleto de `jugarEventoLiga` (usa la lógica de siempre; el `clave` de cada imprevisto sirve para "sin cortes"):

```js
function jugarEventoLiga(intento) {
  const { s, contractId, staffIds, equipIds } = Intento.crearEstado(G, intento);
  G.startEvent(s, contractId, staffIds, equipIds);
  const decisiones = [], incidentes = [];
  // por cada G.currentIncident(s): mostrar el modal, y al elegir la opción i:
  //   const clave = s.currentEvent.incidents[s.currentEvent.step].key;
  //   const r = G.resolveIncident(s, i); decisiones.push(i); incidentes.push({ clave, q: r.q });
  // al final: const f = G.finishEvent(s).result;
  //   resolve({ decisiones, resultado: { quality: f.quality, stars: f.stars, duel: f.duel, incidentes } });
  // si el jugador cierra sin terminar: resolve(null) (el intento se vence solo en 3 h)
}
```

`Liga.progresoLocal(S, tarea)` → `{ servidor, pendientes, por_enviar, jugados, hecho, meta, pct, listo }`: lo que ya contó
el servidor + lo jugado que todavía no se envió (sin internet) y que cumple el criterio. Los resultados sin enviar viven
en `S.liga.pendientes` (se guardan con la partida) y se reintentan con el botón "Enviar" o con `Liga.enviarPendientes()`
(por ejemplo, al volver la conexión). Textos: claves `liga.*` (si `I18N.T` existe se usa; si falta una clave, español).

## 4. Configuración (`/etc/envivo/config.env`, opcional)

```
LIGA_VALIDACION=firma          ; o repeticion cuando el validador esté instalado (server/validador/README.md)
LIGA_SECRETO=                  ; vacío = se genera uno al azar y se guarda en liga_ajustes (firma de intentos y sorteo de encargos)
VALIDADOR_URL=http://127.0.0.1:8790
VALIDADOR_CLAVE=...            ; los mismos del validador
VALIDADOR_NODE=/usr/bin/node   ; opcional
```

## 5. Tarea programada (cron de www-data)

```
1 0 * * 1   php /var/www/envivo/server/bin/liga.php >> /var/log/envivo/liga.log 2>&1
15 * * * *  php /var/www/envivo/server/bin/liga.php >> /var/log/envivo/liga.log 2>&1
```

(O agregar `Liga::tareaProgramada();` a `server/bin/tareas.php`.) No es obligatoria: sin ella todo se hace en la primera visita.

## 6. Pruebas

```bash
php server/tests/pruebas_liga.php     # 125 pruebas (118 si node o js/logic.js no cargan: se salta el validador de verdad con AVISO)
NODE_PATH=/opt/npm-tools/node_modules node tests/test_liga.js   # pantalla en 390x844 con el servidor imitado; capturas tests/capturas/liga*.png
```

Para sumarlas a `server/tests/correr.sh`: `php "$SRV/tests/pruebas_liga.php"; check "pruebas_liga.php sin fallas" 0 "$?"`.
