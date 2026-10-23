# Integrar las Misiones del día y de la semana

Módulo: `js/misiones.js`, `server/src/Misiones.php`, `server/src/MisionesApi.php`, `server/src/migraciones/misiones.sql`,
`docs/traducciones/errores_nuevos/misiones.json`.
Pruebas: `php server/tests/pruebas_misiones.php` y `NODE_PATH=/opt/npm-tools/node_modules node tests/test_misiones.js`
(capturas en `tests/capturas/misiones_*.png`).

Son las misiones **generales** del juego (sirven sin cuenta). Las del Pase de Temporada (`js/pase.js`, solo juego en línea)
siguen igual; estas además dan **XP del pase** a quien tiene cuenta (15 por misión del día, 40 por semanal), por la API del
pase (`Pase::sumarXp(..., 'misiones', ...)`), dentro de su tope diario de 700 XP.

## Cómo funciona (resumen)

- **Día real del celular** (para volver cada día): 5 misiones del día y 5 de la semana (lunes a domingo). La primera es
  fija ("Haz 3 eventos" / "Haz 15 eventos") y las otras 4 salen de un hash FNV-1a de la fecha (`AAAA-MM-DD:id`), nunca de
  `Math.random`. El servidor elige las mismas (`Misiones::elegir`). Sin cuenta no sale "Juega un evento en línea".
- **Avance** guardado en la partida (`s.misiones`, viaja con la nube), por contador: `evento`, `estrellas4`, `estrellas5`,
  `ganar` (dinero neto ganado en eventos), `reparar`, `contratar`, `repuesto`, `equipo`, `publicidad`, `en_linea`,
  `entrega`, `obra`. Si entras a tu cuenta a mitad del día, las misiones pasan a ser las del servidor sin perder avance.
- **Premios fijos y a la vista** (tabla igual en `js/misiones.js` y `Misiones.php`; la prueba lo revisa): dinero del juego,
  repuestos (cables, baterías), materiales de la sede y un **cofre de actividad del día** a los 20/40/60/80/100 puntos
  (20 por cada misión del día reclamada). Créditos solo en los cofres de 60 (3) y 100 (5) y solo con cuenta.

| Cofre | Contenido |
|---|---|
| 20 | $150 · 1 cable |
| 40 | $250 · 1 batería |
| 60 | $350 · 6 cables (material) · 3 créditos |
| 80 | $500 · 2 cables · 5 placas |
| 100 | $800 · 5 paneles LED · 3 planos · 5 créditos |

- **Con cuenta**: cada reclamo va a `POST /api/misiones/reclamar`. El servidor anota el reclamo (con su hora), da los
  créditos (tope por día) y los materiales como **entregas** `materiales` (las suma la sede oficial con
  `SedeOficial::absorberEntregas`); el juego suma el dinero y los repuestos en la partida y llama `ctx.alReclamar()`
  (ya existe en `ctxModulo`: refresca `/api/estado` y aplica entregas). **Sin cuenta**: todo en la partida, los
  materiales a la sede local, sin créditos (la tarjeta muestra "🔒 N créditos con cuenta").
- **Otro celular**: `GET /api/misiones` (cada 5 min con la tarjeta a la vista) trae lo ya reclamado y lo marca.

### Decisión: validación modesta (a propósito)

El servidor **no** ve los eventos de la partida local, así que no puede comprobar el avance. Valida: cuenta activa,
periodo de hoy ±1 día (zona del celular) o de esta semana, que la misión sea una de las 5 de esa fecha, **un reclamo por
premio y periodo** (UNIQUE, con hora) y un **tope de créditos por día del servidor** (ajuste `misiones_creditos_dia`,
10 por defecto; los cofres dan como mucho 8 al día). Alguien que haga trampa en su celular saca como mucho ese tope y
los materiales fijos de la tabla (poco frente a lo que se compra), y el dinero del juego, que solo vale en su partida.
Créditos nunca se convierten en dinero. Hacer anti-trampa de verdad (repetir cada evento en el servidor) no vale la pena
para premios así de chicos.

## Cambios en archivos compartidos (ya hechos en esta rama)

1. `index.html`, después de `<script defer src="js/pase.js"></script>`:
   ```html
   <script defer src="js/misiones.js"></script>
   ```
2. `sw.js`, después de `'./js/pase.js',`: `'./js/misiones.js',   // Misiones del día y de la semana` (VERSION sin tocar:
   la sube el coordinador).
3. `server/public/api.php`, justo después de la línea del Pase de Temporada:

<!-- api.php -->
```php
    if (class_exists(\EnVivo\MisionesApi::class) && \EnVivo\MisionesApi::esRuta($ruta)) \EnVivo\MisionesApi::responder($ruta, $metodo, requiere_sesion());   // Misiones del día (server/INTEGRAR_MISIONES.md)
```

4. `server/src/Pase.php`, en `Pase::XP` (para que `sumarXp` acepte la fuente; el número que se suma lo pasa
   `Misiones::XP_PASE`): `'misiones' => 15`. Cuenta para el tope diario de XP del pase, no para sus misiones en línea.
5. `server/tests/correr.sh`, sección 3c: `misiones` al final de la lista `for suite in ...`.

## Falta (coordinador)

- `js/ui.js`, `PL_INFO` (título e ícono de la fila de Inicio; sin esto la fila dice "misiones"):
  ```js
  misiones: ['target', 'inicio.pl.misiones'],
  ```
  y la clave `inicio.pl.misiones` en `js/lang/*.js`: es "Misiones", en "Missions", pt-BR "Missões", fr "Missions",
  de "Missionen", it "Missioni", ru "Задания", tr "Görevler", id "Misi", zh-CN "任务" (también en `Misiones.TITULO_PL`
  / `Misiones.titulo()` si se prefiere no tocar los idiomas).
- La tarjeta se registra sola: `window.EnVivoInicio` con id `misiones`, **orden 3**. Botones `data-ext="misiones"`
  `data-acc="reclamar" | "cofre" | "todo"` (los despacha el clic global de ui.js como los demás módulos). El "Nuevo" de la
  fila sale solo: los botones verdes "Reclamar" cambian la firma de la tarjeta; el título "Misiones del día" es fijo.

## Dónde se cuenta el avance (no hace falta tocar nada)

| Contador | Dónde | Cómo |
|---|---|---|
| `evento`, `estrellas4`, `estrellas5`, `ganar` | `logic.js` `finishEvent` | `G.registrarExtension({ id: 'misiones', alTerminarEvento })` (no corre en intentos en línea) |
| `obra`, `entrega` | sede local y oficial | `Misiones.observar(s)` al pintar Inicio, al terminar un evento y cada día (`alNuevoDia`): mejoras terminadas (`s.sede.mejoras` + nivel) y la entrega del día (`s.sede.ultimoCofre` local; `Sede.oficial.estado.cofre.disponible` pasa de true a false en la oficial) |
| `contratar`, `reparar`, `equipo`, `repuesto`, `publicidad` | `ui.js` `case 'hire' / 'repair' / 'buy' / 'buy-cons' / 'mkt'` (y `movilizacion.js` repair) | `js/misiones.js` envuelve `Game.hire / repair / buy / buyConsumable / marketing`: cuenta cuando devuelven `ok` (salta estados de intento) |
| `en_linea` | liga, festival, copa (`ui.js` `terminarIntento`), duelos y desafío | envuelve `EnVivoVivo.terminar` (motor de `js/duelos.js`) y guarda |

`window.Misiones.marcar(clave, n = 1, s = partida)` queda para contar a mano algo nuevo (por ejemplo, si un módulo futuro
compra equipos sin `Game.buy`: `window.Misiones && window.Misiones.marcar('equipo')` justo después de la compra). **No**
agregar llamadas para lo de la tabla de arriba: contaría doble.

Opcional: después de un pago o de cambiar de cuenta, `window.Misiones.recargar(ctxInicio())` trae lo reclamado del
servidor al momento (si no, la tarjeta lo pide sola cada 5 minutos).

## API

Todas con sesión; POST con `X-Envivo: 1`. Errores `{ok:false, error, codigo}`.

- `GET /api/misiones` → `{ok, hoy, lunes, reclamados: {"d:AAAA-MM-DD": [claves], "s:AAAA-MM-DD": [...]} (últimos 16 días),
  dia: [5 ids], semana: [5 ids], creditos_hoy, creditos_tope, xp_pase: bool}`.
- `POST /api/misiones/reclamar {periodo: "d:AAAA-MM-DD" | "s:AAAA-MM-DD" (lunes), clave: id de misión | "cofre20".."cofre100"}`
  → `{ok, periodo, clave, premio: {dinero?, cons?, mat?, creditos?}, creditos_dados, entregas: [entregas materiales],
  xp_pase, tope_alcanzado, creditos (saldo), creditos_hoy, creditos_tope}`.
  Códigos: `ya_reclamado` 409 (con `reclamado`), `mision_invalida` 400/404, `periodo_invalido` 400, `misiones_vencidas` 409,
  `falta_periodo` / `falta_clave` 400, `limite_intentos` 429 (60 en 10 min), `cuenta_suspendida` / `cuenta_baneada` 403.
- Créditos: `movimientos_creditos.motivo = 'misiones'`, ref `misiones:<periodo>:<clave>`. Entregas: origen igual.

## Ajustes (tabla `ajustes`, Centro de Control)

`misiones_creditos_dia` (10): tope de créditos de misiones por jugador y día del servidor. `0` = sin créditos. Vacío = 10.

## Tabla

`misiones_reclamos (jugador_id, periodo, clave, creditos, xp, dia, creado)`, UNIQUE `(jugador_id, periodo, clave)`.
La crea sola `Db::migrarModulos` con `migraciones/misiones.sql` (y `Misiones::preparar()` por si acaso).
