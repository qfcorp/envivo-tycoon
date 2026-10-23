# Universos, Copa de Servidores y fusión de servidores abandonados — contrato técnico

Este documento es el **contrato común** entre los módulos. Si algo no está aquí, cada módulo lo decide dentro de sus
propios archivos y lo documenta. Todo el texto visible para el jugador va en español (y traducido en el cliente).
Nunca nombres, siglas ni logos reales de torneos, ligas o cadenas (solo parodias).

## 1. Universos y servidores

- **Servidor** (ya existe: tabla `servidores`, `jugadores.servidor_id`): un "reino" de productoras con su chat,
  asociaciones, ranking, liga y festival propios.
- **Universo** (nuevo): grupo de servidores que compiten entre sí en la Copa de Servidores. Tabla `universos`
  (id, nombre, creado, activo). Columna nueva `servidores.universo_id`.
- **Arranque**: 1 universo ("Universo Andino") con **3 servidores**: `Servidor 1 · Quito` (ya existe),
  `Servidor 2 · Guayaquil`, `Servidor 3 · Cuenca`. Configurable con `UNIVERSO_SERVIDORES_INICIALES=3`.
  Se pueden crear más universos desde el Centro de Control (cada uno nace con N servidores).
- **Reparto de jugadores nuevos**: al registrarse entra al servidor abierto del universo más nuevo con **menos jugadores
  activos** (activo = entró en los últimos 7 días), para que los 3 crezcan parejos. Si todos los servidores de un universo
  superan la capacidad, se cierra a nuevos y se abre un universo nuevo con N servidores.
- **Actividad**: tabla `actividad_diaria` (dia 'YYYY-MM-DD', jugador_id, servidor_id, eventos, PRIMARY KEY(dia, jugador_id)).
  Se escribe al pedir `/api/estado` con sesión (1 vez por día por jugador, barato) y al validar intentos en línea.
  Helper: `Universos::marcarActivo(int $jugador)`.

## 2. Copa de Servidores (pelea servidor contra servidor)

Ciclo **semanal** (hora de Ecuador, America/Guayaquil):

| Fase | Cuándo | Qué pasa |
|---|---|---|
| `preparacion` | lunes 00:00 → viernes 23:59 | Los jugadores suman **puntos de preparación** para su servidor con eventos en línea validados (repetición del validador). Cada jugador registra su **equipo de copa** (como en duelos). |
| `batalla` | sábado 00:00 → 20:00 | Se juegan los cruces: cada servidor presenta su **plantel** (los 5 mejores equipos registrados de jugadores activos) y se transmiten 5 "partidos" contra el plantel rival. El servidor calcula todo con el motor determinista. |
| `cerrada` | sábado 20:00 → domingo 23:59 | Resultados, tabla, premios entregados, anuncio en chat y Discord. |

- **Formato** con los servidores del universo: todos contra todos (con 3 servidores: 3 cruces, uno cada 4 horas
  del sábado: 10:00, 14:00, 18:00). Con 4 o más: grupos o eliminación (documentar).
- **Puntos de un cruce** = puntos de batalla (los 5 partidos) + bono de preparación **normalizado**:
  bono = min(15, 15 × puntos_preparación / máximo_del_universo) para que un servidor chico pueda competir.
  Cada partido: el motor juega el mismo contrato (misma semilla) con el equipo de cada lado; gana la mayor calidad.
  Ganar un cruce = 3 puntos de tabla, empatar = 1. Desempate: diferencia de calidad total, luego preparación.
- **Justicia para servidores chicos**: el plantel son los 5 mejores equipos; si un servidor tiene menos de 5 equipos
  registrados, completa con el "equipo de la casa" (equipo base estándar con habilidad 2) — nunca pierde por no presentarse.
- **Torneos (nombres parodia, rotan por semana)**: Copa Planeta de Balompié, Copa de los Libertadores del Sur,
  Liga Estelar de Clubes, Mundial de Aro y Tablero, Juegos de los Cinco Continentes, Gran Premio Fórmula Veloz,
  La Pelea del Siglo, El Gran Tazón. Cada torneo define el tipo de evento de los partidos (fútbol → `ligapro`/`final`,
  básquet → `concierto`-like arena, boxeo → `boxeo`, autos → `lanzamiento_autos`, etc.) y su cadena internacional parodia.
- **Premios** (entregas existentes + nuevas): servidor campeón → todos sus jugadores **activos que aportaron** reciben
  dinero del juego, fama, un **trofeo de copa** (cosmético) y materiales de sede (si existe `js/sede.js`); top 10 aportantes
  del servidor campeón → premio extra; los demás servidores → premio de participación por aporte. Sin dinero real.
  Tipos de entrega: usar `dinero`, `consumible`, `reparar_todo`, `fama`, y nuevos `trofeo` {clave, nombre} y
  `materiales` {clave: cantidad} (el cliente los aplica si sabe; si no, los ignora sin romperse).
- **Anti-trampas**: igual que duelos/liga: semilla por intento con `random_int`, validación con `Repeticion::validar`,
  equipos registrados revisados contra fama pública e inventario del servidor (reusar `Duelos` para validar equipo
  si es posible). Las extensiones del cliente (sede, temporadas) NO aplican en intentos en línea.

### Tablas (migración `server/src/migraciones/copas.sql`, todo `IF NOT EXISTS`)
- `copas` (id, universo_id, semana 'YYYY-Www', torneo_key, nombre, fase, inicio, fin, creado)
- `copa_servidores` (copa_id, servidor_id, puntos_prep, puntos_tabla, ganados, empatados, perdidos, dif_calidad, posicion)
- `copa_aportes` (id, copa_id, jugador_id, servidor_id, asociacion_id, puntos, fuente, ref UNIQUE, creado)
- `copa_equipos` (copa_id, jugador_id, servidor_id, equipo_json, poder, registrado) — PK (copa_id, jugador_id)
- `copa_cruces` (id, copa_id, ronda, servidor_a, servidor_b, hora, estado, puntos_a, puntos_b, detalle_json)
- `copa_premios` (copa_id, jugador_id, clave, entregado) — UNIQUE (copa_id, jugador_id, clave)

### API (todo con sesión; POST con `X-Envivo: 1`; errores con `codigo`)
- `GET /api/copa` → `{copa:{id, nombre, torneo_key, fase, inicio, fin, ahora}, universo:{id,nombre},
   servidores:[{id, nombre, puntos_prep, puntos_tabla, g,e,p, posicion, yo:bool}], cruces:[{id, ronda, a, b, hora, estado,
   puntos_a, puntos_b, partidos:[{n, tipo, calidad_a, calidad_b, ganador}]}], yo:{aporte, posicion_en_servidor,
   equipo_registrado:bool, intento_abierto|null}, top_aportantes:[{alias, siglas, puntos}], historial:[{semana, nombre,
   campeon}] }`
- `POST /api/copa/equipo {staff:[...], equip:[...]}` → registra el equipo de copa (validado como en duelos).
- `POST /api/copa/intento/iniciar {}` → `{id, seed, contrato, equipo, contexto, vip, firma, vence}` (misma forma que liga).
- `POST /api/copa/intento/enviar {intento_id, decisiones, resultado}` → `{resultado:{calidad, estrellas, valido, puntos}, copa}`
- Clase `server/src/Copas.php` + `server/src/CopasApi.php` con `CopasApi::esRuta($ruta)` / `CopasApi::responder($ruta, $metodo, $jugador)`
  (igual que LigaApi). `api.php` solo agrega una línea (la pone el coordinador).
- Cron `server/bin/copas.php` (cada 10 min): abre la copa de la semana, cambia de fase, juega los cruces a su hora,
  cierra y entrega premios. Idempotente.

### Motor de batalla (Node)
`server/eventos/batalla.js`: `jugarCruce({seed, torneo, contratos:[...5], planA:[equipos], planB:[equipos]}) →
{partidos:[{n, tipo, calidad_a, calidad_b, ganador, incidentes_a, incidentes_b}], calidad_total_a, calidad_total_b}`.
Usa la lógica real (`js/datos.js`, `js/logic.js`, sin extensiones) igual que `server/eventos/motor.js` (política "prudente").
Llamado desde PHP como el motor de duelos (`Repeticion` o un helper `Batalla::jugar()` en `Copas.php` vía HTTP del
validador si se agrega ruta, o por consola `node server/eventos/batalla.js < json`). Determinista: misma entrada → misma salida.

## 3. Servidores abandonados: vigilancia y fusión

- **Salud de cada servidor** (`server/src/SaludServidores.php`, cron diario `server/bin/salud_servidores.php`):
  activos 1/7/14/30 días, eventos por día, mensajes de chat, asociaciones activas, tendencia (semana vs semana anterior).
  Estado: `sano` | `bajo` (activos 7d < 25 o caída > 40%) | `abandono` (activos 14d < 10, o activos 7d < 5 durante 2 semanas).
  Tabla `servidor_salud` (dia, servidor_id, activos_1, activos_7, activos_14, activos_30, eventos, mensajes, estado).
- **Fusión** (`server/src/Fusiones.php`): plan para mover a los jugadores de un servidor en `abandono` a otro del
  mismo universo (el de más actividad con cupo, o uno elegido).
  - `Fusiones::plan(origen, destino)` (solo lectura) → informe: jugadores a mover (activos e inactivos), choques de
    alias (se resuelven con sufijo " (Quito)" / número), choques de nombre y siglas de asociaciones, publicaciones del
    mercado, copas/ligas/festivales/duelos en curso (se cierran o esperan), canales de chat, rankings.
  - `Fusiones::ejecutar(plan_id, quien)` → en **una transacción**: mueve todo, deja el servidor origen `fusionado_en`,
    `abierto=0`, anota en `auditoria`, manda mensaje de sistema a ambos servidores y aviso en `/api/estado` a los movidos.
    Nunca borra datos de jugadores; nunca toca créditos ni compras.
  - Aviso previo: cuando un servidor entra en `abandono`, se crea un **aviso** en el Centro de Control con el plan
    sugerido. La fusión la **aprueba una persona** (Dimitry) en el Centro de Control: nunca es automática.
  - Opción para jugadores activos de un servidor en `bajo`/`abandono`: **traslado voluntario gratis** a un servidor
    sugerido (`POST /api/servidor/trasladar {destino}`; 1 vez cada 30 días; no si es presidente con miembros).
  - Tablas: `fusiones` (id, origen, destino, estado 'plan'|'aprobada'|'ejecutada'|'cancelada', plan_json, creado,
    ejecutada, quien), columna `servidores.fusionado_en`, `traslados` (id, jugador_id, origen, destino, motivo, creado).
- **Centro de Control**: pestaña "Servidores": universos, servidores con salud (gráfico simple 30 días), copa actual
  y su tabla, avisos de abandono con el plan y botones Aprobar / Cancelar (con confirmación y auditoría), crear universo.

## 4. Quién hace qué (archivos)

| Módulo | Archivos propios |
|---|---|
| Universos y reparto | `src/Universos.php`, `src/migraciones/universos.sql`, cambio en `Social::servidorParaNuevo` (Social.php), `tests/pruebas_universos.php` |
| Copa (servidor) | `src/Copas.php`, `src/CopasApi.php`, `src/migraciones/copas.sql`, `bin/copas.php`, `tests/pruebas_copas.php` |
| Motor de batalla | `eventos/batalla.js`, `eventos/test_batalla.js` |
| Copa (pantalla) | `js/copas.js`, `tests/test_copas.js` |
| Salud y fusión | `src/SaludServidores.php`, `src/Fusiones.php`, `src/migraciones/fusiones.sql`, `bin/salud_servidores.php`, `tests/pruebas_fusiones.php` |
| Traslado (pantalla) | `js/servidores.js`, `tests/test_servidores.js` |
| Centro de Control | `public/control/lib/servidores.php` (+ registro de la pestaña en `public/control/index.php` / `lib/base.php`), `tests/pruebas_control_servidores.php` |
| Simulación y reglas | `tools/sim_copas.js`, `docs/COPA_DE_SERVIDORES.md` (reglas para jugadores, ES) |

`api.php`, `Db.php`, `index.html`, `sw.js`, `tools/build_single.js`, `js/ui.js` y `correr.sh` los toca **solo el coordinador**
al final (cada módulo deja sus líneas exactas en `server/INTEGRAR_<MODULO>.md`).
