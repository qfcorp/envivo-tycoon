# Integrar el Duelo de Productoras y el Desafío Técnico del Día

Dos modos en línea asincrónicos (Fase 6). "El servidor tira los dados": el servidor entrega la semilla, el contrato y el
equipo; el juego juega en vivo y manda **solo sus decisiones**; el validador (`server/validador/`) repite la jugada y **su**
calidad es la que cuenta. Todo con sesión; POST con cabecera `X-Envivo: 1`. Errores como el resto de la API:
`{ "ok": false, "error": "texto", "codigo": "..." }` con código HTTP 4xx/5xx.

## Archivos (todos nuevos)

| Archivo | Qué es |
|---|---|
| `server/src/Duelos.php` | Duelo de Productoras: equipo de duelo, retar, jugar, Elo por temporada, intentos extra, premios de temporada. `Duelos::ruta()` atiende `/api/duelos*`. |
| `server/src/Desafio.php` | Desafío Técnico del Día: modificador por día, maleta, semilla del día, ranking por servidor, premios, Pases de Prensa. `Desafio::ruta()` atiende `/api/desafio*`. |
| `server/src/Repeticion.php` | Puente PHP → Node: `validar()` (servicio HTTP del validador, si no `node validador.js`) y `motor()`. |
| `server/eventos/motor.js` | Node, usa `server/validador/validador.js`: juega el **fantasma** del defensor (IA "prudente") y busca la **semilla del día** que trae lo que pide el modificador. |
| `server/src/migraciones/duelos.sql` | Tablas (se crean solas la primera vez con `Duelos::preparar()`; `IF NOT EXISTS`). |
| `js/duelos.js` | Pantalla de duelos + `window.EnVivoVivo` (motor para jugar un intento en vivo) + entregas tipo `fama`. |
| `js/desafio.js` | Pantalla del Desafío del Día (usa `EnVivoVivo` de `js/duelos.js`). |
| `server/tests/pruebas_duelos_desafio.php` | 122 pruebas del servidor (HTTP real + validador real). |
| `tests/test_duelos_desafio.js` | Prueba en celular 390x844 con `fetch` falso que repite cada jugada en el validador. |

## 1. `server/public/api.php` (2 líneas)

```php
use EnVivo\{..., Desafio, Duelos};
```
Dentro del `try`, **después** de las comprobaciones de `X-Envivo` y de método, y **antes** del `match ($ruta)`:
```php
    if (($r = Duelos::ruta($ruta, $metodo) ?? Desafio::ruta($ruta, $metodo)) !== null) Http::json(200, $r);
```
`ruta()` devuelve `null` si la ruta no es suya, lanza `Fallo` (401 sin sesión, 403 cuenta no activa, 405 método, 4xx reglas)
y lee el cuerpo con `Http::entrada()`. `server/tests/pruebas_duelos_desafio.php` usa exactamente esta línea.

## 2. `GET /api/estado` (en `Cuentas::estado`, rama con sesión)

```php
'duelos' => Duelos::estado($id),     // { rating, liga, restantes, tiene_equipo, defensas_nuevas, en_curso }
'desafio' => Desafio::estado($id),   // { dia, modificador, nombre, icono, restantes, jugado_hoy, pases_prensa }
```
Sin sesión: `'duelos' => null, 'desafio' => null`. Sirve para el punto rojo del menú ("te retaron", "desafío sin jugar").

## 3. El juego (`index.html`, `sw.js`, `js/ui.js`)

- **`js/intento.js` = `server/validador/intento.js`** (el juego arma el evento exactamente como el validador lo repite).
  En el VPS: agregar a `server/deploy/actualizar.sh` → `cp "$APP/server/validador/intento.js" "$APP/js/intento.js"`
  (o un enlace simbólico). Si falta, `js/duelos.js` intenta cargarlo solo desde `js/intento.js` y avisa si no está.
- Scripts, después de `js/premium.js` y antes de `js/ui.js`:
  ```html
  <script src="js/intento.js"></script>
  <script src="js/duelos.js"></script>
  <script src="js/desafio.js"></script>
  ```
  y los tres en la lista de `sw.js`.
- En `ui.js` (con sesión), dos botones o pestañas que llamen:
  ```js
  Duelos.render(elemento, ctx);    // ctx como ctxMercado(): { Api, G, A, estado(), toast, ask, openModal, closeModal, snd, sincronizar }
  Desafio.render(elemento, ctx);
  ```
  `sincronizar` debe aplicar las entregas (`aplicarEntregas(); save();`): los dos módulos llaman `Api.refrescar()` y
  `ctx.sincronizar()` después de cada resultado. `Duelos.invalidar()` / `Desafio.invalidar()` al cambiar de cuenta.
- **Entregas tipo `fama`** (premios de duelos y de temporada): `js/duelos.js` envuelve `Premium.aplicarEntregas` y las aplica
  una sola vez (`s.rep += n`, máximo 100). Opcional: que `premium.js` agregue `case 'fama'` y quitar el envoltorio.
- Textos: claves `duelo.*` y `desafio.*` (el español está dentro de cada módulo; con `I18N.T` se traducen). Para los otros
  idiomas, copiar los objetos `ES` de los dos archivos a `js/lang/*.js`.

## 4. Gancho en `js/logic.js` (necesario para "mismos imprevistos")

Con la lógica de realismo, el riesgo de cada rol depende del nivel de la persona y algunos equipos traen imprevistos propios:
con la misma semilla, dos equipos distintos pueden sacar imprevistos distintos. Por eso el servidor ya sortea la lista una vez
(con el equipo del defensor) y la manda a los dos lados en `contrato.imprevistos`. Falta que `startEvent` la use. En
`startEvent`, justo antes de `for (let i = 0; i < nInc && pool.length; i++) {`:

```js
    const fijos = Array.isArray(contract.imprevistos) ? contract.imprevistos.filter((k, i, a) => INCIDENTS[k] && pool.includes(k) && a.indexOf(k) === i) : null;
    if (fijos) fijos.forEach((key) => { const def = INCIDENTS[key]; ev.incidents.push({ key, x: def.setup ? def.setup(s, view) : {}, done: false, result: null }); });
    else
```
(el `for` queda como el `else`). Los contratos normales no traen `imprevistos`: el juego normal no cambia. La prueba del servidor
aplica este gancho a una copia de la lógica y comprueba 21 de 21 duelos con imprevistos idénticos entre equipos muy distintos;
sin el gancho, el duelo funciona igual (misma semilla, mismo contrato, mismo contexto), pero los imprevistos pueden variar.

## 5. Tarea diaria (`server/bin/tareas.php`)

```php
$dV = Duelos::vencer() + Desafio::vencer();
$dP = Duelos::revalidarPendientes() + Desafio::revalidarPendientes();     // si el validador estuvo caído
$dC = Desafio::cerrarPendientes();                                        // premios del ranking del día anterior
Duelos::cerrarTemporada(Duelos::temporada(strtotime(date('Y-m-01') . ' -1 day')));   // premios de la temporada que terminó
```
(Igual se hacen solos al abrir las pantallas; la tarea los adelanta.) Con el validador caído, una jugada queda **pendiente**
(sin castigo) y la tarea la revalida.

## 6. Configuración (`/etc/envivo/config.env`)

`VALIDADOR_URL` y `VALIDADOR_CLAVE` (ver `server/validador/README.md`) y, si Node no está en `/usr/bin/node`, `NODE_BIN=/ruta/a/node`.
`server/eventos/motor.js` siempre corre por consola (unos 60 ms): al retar y al empezar el desafío. Si Node no responde, el
servidor contesta 503 `mantenimiento` y **no gasta** el intento.

---

## API: Duelo de Productoras

**Reglas.** 5 duelos gratis por día (+1 con VIP) y hasta 5 extra a 20 créditos. Máximo 3 retos por día a la misma productora.
Un duelo abierto a la vez; hay 20 minutos para jugarlo (si no, **pierde** el retador: no se puede abandonar un duelo que va
mal). Una semilla, un intento: al recibir las decisiones el duelo se cierra (mandarlas otra vez devuelve el mismo resultado).
Puntaje tipo Elo por temporada (mes): retador K=32, defensor K=16, mínimo 100; al empezar una temporada se parte de la mitad
de la distancia a 1000. Ligas: Bronce < 1100 ≤ Plata < 1250 ≤ Oro < 1400 ≤ Platino < 1600 ≤ Diamante. Fama: ganar da
(dificultad − 1) = 1/2/3, defender con éxito 1 (máximo 10 por día por duelos). Fin de temporada (top 10 del servidor con 3+
duelos): 1º $5.000 + 5 fama, 2º $3.000 + 4, 3º $2.000 + 3, 4º–10º $1.000 + 2.

**Lo que es igual para los dos lados:** semilla (`random_int`), contrato (tablero del día del servidor), contexto
(fama 30, $1.000, 1 cable, 1 batería), ánimo 80, kit básico de duelo (4 cámaras profesionales, laptop con vMax, consola de
8 canales, micrófonos, encoder, router 4G, UPS, cobertores; estado 85 %) y la cantidad de cámaras (la del contrato:
primero las exclusivas, después las del kit). Lo que cambia: el personal registrado y los equipos del inventario del servidor.

### `GET /api/duelos`
```json
{ "ok": true,
  "temporada": { "id": "2026-10", "nombre": "Temporada Octubre 2026", "termina": "ISO" },
  "rating": { "rating": 1084, "liga": "Bronce", "mejor": 1100, "ganados": 7, "perdidos": 4, "empates": 0,
              "defensas_ganadas": 3, "defensas_perdidas": 2, "racha": 2, "puesto": 4 },
  "cupos": { "gratis": 5, "usados": 1, "extra": 0, "extra_max": 5, "precio_extra": 20, "restantes": 4, "vip": false },
  "equipo": { "personal": [...], "inventario": [...], "resumen": {...}, "poder": 230, "actualizado": "ISO" } | null,
  "kit": [ { "item": "cam_pro", "cantidad": 4, "nombre": "Cámara profesional", "estado": 85 }, ... ],
  "inventario_elegible": [ { "id": 77, "item": "dron4k", "serie": 7, "nombre": "Dron 4K", "vip": false } ],
  "tope_habilidad": 4,
  "contratos": [ { "nivel": "facil"|"medio"|"dificil", "contrato": { "type", "client", "cams", "diff", "audio", "stream", "outdoor", "pay" }, "fama_premio": 1 } ],
  "rivales": [ { "id", "nombre", "fama", "vip", "siglas", "color", "rating", "liga", "poder", "equipo": {resumen}, "retos_hoy" } ],
  "abierto": { ...duelo, "intento": {...} } | null,   // para retomar un duelo en curso
  "historial": [ duelo, ... ],                        // últimos 15 (como retador y como defensor)
  "defensas_nuevas": 1,                               // se marcan como vistas al leer
  "ranking": [ { "puesto", "jugador_id", "nombre", "rating", "liga", "ganados", "perdidos", "yo" } ],
  "reglas": { "minutos": 20, "max_par_dia": 3, "fama_tope_dia": 10, "politica": "prudente" } }
```
`duelo` = `{ id, rol: retador|defensor, estado, nivel, rival: {id, nombre}, contrato, ganador, gane, empate, calidad_mia,
calidad_rival, estrellas_mia, estrellas_rival, cambio, fama, motivo: null|vencido|jugada_imposible|resultado_no_coincide,
creado, vence, cerrado }`. La calidad del fantasma solo se ve cuando el duelo está cerrado.

### `POST /api/duelos/equipo` `{ personal: [{ rol, habilidad, nivel?, dueno? }], inventario: [ids] }`
- `rol`: claves de `js/datos.js` (`camarografo`, `director`, `sonidista`, `tecnico_transmision`, `productor`, `cablero`, …);
  las viejas `cam`/`dir`/`audio`/`stream` se aceptan y se guardan con la nueva. `habilidad` 1–5. `nivel`: `junior`,
  `semi_senior`, `senior` (fama 18+), `internacional` (fama 45+). Exactamente un `dueno`. Máximo 12 personas.
- Tope de habilidad = mín(5, 2 + fama ÷ 15) con la **fama pública del servidor**; lo de más solo con personal comprado
  (entregas tipo `personal`, una persona por entrega).
- `inventario`: ids del inventario del servidor, del jugador y en la bodega (máx. 12). Al jugar se vuelve a revisar: lo
  vendido o publicado ya no va; lo VIP va siempre (con o sin Pase VIP).
- → `{ ok, equipo }`. 409 `duelo_abierto` si hay un duelo en curso.

### `POST /api/duelos/retar` `{ rival_id, nivel: "facil"|"medio"|"dificil" }`
→ `{ ok, duelo, intento: { seed, contrato, equipo: { staff, equip }, contexto, vip, duelo_id }, cupos, rival }`.
Errores: 400 `rival`/`nivel`, 404 (otro servidor), 409 `sin_equipo`, `rival_sin_equipo`, `par`, `duelo_abierto`, `sin_cupos`,
429, 503 `mantenimiento`. El juego juega `intento` con `EnVivoVivo` (= `Intento.crearEstado` + `startEvent` / `resolveIncident` /
`finishEvent`).

### `POST /api/duelos/jugar` `{ duelo_id, decisiones: [n, ...], resultado?: { quality, stars } }`
→ `{ ok, duelo, detalle: { retador: [{n, clave, eleccion, q}], defensor: [{clave, eleccion, q}], motivo }, rating, cupos }`
o `{ ok, pendiente: true, mensaje, duelo }` si el validador no respondió. 410 `vencido` (cuenta como derrota).
Calidad inventada → vale la del validador y el duelo queda `sospechoso = 1`. Decisiones imposibles → pierde el retador
(`jugada_imposible`, sospechoso).

### `POST /api/duelos/extra` → `{ ok, creditos, cupos }` (20 créditos; 402 `sin_creditos`; 409 `extra_max`).
### `GET /api/duelos/ranking` → `{ ok, temporada, ranking (top 20), mi_puesto, mi_rating }`.

## API: Desafío Técnico del Día

| Día | Modificador | Evento | Lo que garantiza el servidor | Fama del cliente | Cámaras | Presupuesto |
|---|---|---|---|---|---|---|
| lunes | Lluvia garantizada | Partido barrial (dif. 2, aire libre) | imprevisto `lluvia` | 20 | 6 | 26 |
| martes | Una sola cámara | Lanzamiento (pide 3 cámaras, dif. 3) | máximo 1 cámara | 30 | **1** | 26 |
| miércoles | Internet inestable | Graduación (dif. 2) | `internet` | 25 | 6 | 24 |
| jueves | Cliente exigente | Lanzamiento (dif. 3) | `logo` (cambio a última hora) | **90** | 6 | 30 |
| viernes | Apagón | Concierto bajo techo (dif. 4) | `luz` | 40 | 6 | 32 |
| sábado | Final de campeonato | Final (5 cámaras, dif. 5) | — | 65 | 6 | 46 |
| domingo | Todo junto | Concierto al aire libre (dif. 4) | `lluvia` + `internet` + `luz` | **90** | **2** | 40 |

Misma semilla base para todos (`desafio_dias`); se usa la primera variante con la que el evento trae lo que pide el día
**con la elección del jugador** (dos jugadores que eligen lo mismo juegan exactamente el mismo evento). La maleta (igual para
todos, `Desafio::PERSONAL` y `Desafio::EQUIPOS`): 16 personas de 9 roles y 4 niveles con costo, 16 equipos (una cámara
gastada gratis que puede fallar). 1 intento por día (+1 con VIP), 30 minutos para terminarlo.

Premios por terminar (una vez por día, primer intento válido): 1–2⭐ 1 cable + $150 · 3⭐ 2 cables, 1 batería, $300, 1 pase ·
4⭐ 3 cables, 2 baterías, $500, 2 pases · 5⭐ 4 cables, 2 baterías, $800, 3 pases. Ranking del servidor al cerrar el día (con
3+ jugadores): 1º $3.000 + 5 pases + 3 baterías, 2º $2.000 + 4 + 2, 3º $1.500 + 3 + 2, 4º–10º $600 + 2 + 1. Repuestos y
dinero llegan como entregas (`consumible`, `dinero`); los Pases de Prensa son un saldo del servidor.

### `GET /api/desafio`
`{ ok, dia, modificador: { clave, nombre, detalle, icono, dia_semana, requeridos }, contrato, contexto: { fama }, maleta:
{ personal: [{ id, nombre, rol, rol_nombre, habilidad, costo, nivel, fijo }], equipos: [{ id, type, nombre, cat, estado, costo }],
presupuesto, max_camaras }, intentos: { usados, max, restantes }, abierto, mi_mejor, ranking (top 20, con yo), participantes,
premios, pases_prensa, cierra, ayer, semana: [7 días], minutos }`

### `POST /api/desafio/empezar` `{ personal: ["p1", ...], equipos: ["e2", ...] }`
→ `{ ok, intento: { seed, contrato, equipo, contexto, vip: false, intento_id }, intento_id, vence, intentos }`.
Errores: 400 `seleccion` / `presupuesto` / `camaras`, 409 `en_curso` / `sin_intentos`, 429, 503 `mantenimiento`.

### `POST /api/desafio/terminar` `{ intento_id, decisiones, resultado? }`
→ `{ ok, resultado: { estado: valido|invalido, calidad, estrellas, motivo, incidentes, partes }, premio, puesto, ranking,
intentos, pases_prensa }` o `{ ok, pendiente: true }`. 410 `vencido`.

### `GET /api/desafio/ranking?dia=YYYY-MM-DD` → `{ ok, dia, ranking (top 50), participantes, mi_puesto }`.

## Pases de Prensa (para el Mega Festival)
`Desafio::pases($j)`, `Desafio::sumarPases($j, $n, $motivo, $ref)`, `Desafio::gastarPases($j, $n, $motivo, $ref)` (402
`sin_pases`). Tablas `pases_prensa` (saldo ≥ 0) y `pases_prensa_libro` (la suma del libro = el saldo).

## Panel (Centro de Control), sugerido
- Duelos sospechosos: `SELECT * FROM duelos WHERE sospechoso = 1 ORDER BY id DESC` (guardan `validacion_json`).
- Desafíos sospechosos: `SELECT * FROM desafio_intentos WHERE sospechoso = 1`.
- Avisos `duelo_fantasma` / `desafio_semilla` en `avisos` si `motor.js` falla con la lógica.

## Pruebas
```bash
php server/tests/pruebas_duelos_desafio.php                                        # 122 pruebas del servidor
NODE_PATH=/opt/npm-tools/node_modules node tests/test_duelos_desafio.js            # celular 390x844 + capturas
```
Para `correr.sh`: agregar `php "$SRV/tests/pruebas_duelos_desafio.php"` (arranca su propio `php -S`, validador y base temporal;
puertos `P_APP=8391`, `P_VAL=8392` cambiables por variable). Si `js/logic.js` no carga en ese momento, la prueba del servidor
usa la versión de `git HEAD` y lo avisa.
