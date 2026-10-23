# Copa de Servidores (servidor): cómo conectarla

Contrato común: `server/COPAS.md` §2. Archivos de este módulo (no tocan nada de lo que ya existe):

| Archivo | Qué es |
|---|---|
| `server/src/Copas.php` | Toda la lógica: ciclo semanal, calendario, equipos, intentos, batalla, tabla, premios |
| `server/src/CopasApi.php` | Rutas `/api/copa...` (api.php las llama con UNA línea) |
| `server/src/migraciones/copas.sql` | Tablas `copas`, `copa_servidores`, `copa_aportes`, `copa_equipos`, `copa_cruces`, `copa_premios` (las de COPAS.md) + `copa_intentos`, `copa_ajustes` (propias). Se aplica sola (`Db::migrarModulos` y `Copas::preparar()`) |
| `server/bin/copas.php` | Tarea programada cada 10 minutos (idempotente) |
| `server/tests/pruebas_copas.php` | Pruebas (reloj inyectable, motor y validador de prueba, motor y validador de verdad si están, HTTP con copia de api.php) |

## Líneas para el coordinador

### 1. `server/public/api.php` — una línea, justo ANTES de la línea de `LigaApi` (línea 31):
```php
    if (\EnVivo\CopasApi::esRuta($ruta)) \EnVivo\CopasApi::responder($ruta, $metodo, requiere_sesion());
```
(Es exactamente la que inserta `pruebas_copas.php` en su copia de api.php.)

### 2. `server/tests/correr.sh` — sumar `copas` a la lista de suites de la sección 3c (línea 134):
```bash
for suite in discord festival liga control duelos_desafio copas; do
```
La suite arranca su propio `php -S` (usa `P_APP` si viene; si no, un puerto al azar) y su propia base temporal.

### 3. Cron (www-data), en `server/deploy/` donde estén los demás:
```
*/10 * * * *  php /var/www/envivo/server/bin/copas.php >> /var/log/envivo/copas.log 2>&1
```

### 4. Configuración opcional (`/etc/envivo/config.env`)
- `COPA_SECRETO` — clave de la firma de los intentos (si falta, se genera una y se guarda en `copa_ajustes`).
- `COPA_MOTOR_SEG` — tiempo máximo de `node server/eventos/batalla.js` por cruce (20 s por defecto; tarda ~0,1 s).
- `NODE_BIN` (ya existe) — Node para el motor y el validador.

`Db.php` no necesita cambios (las tablas salen de `migraciones/copas.sql`). `API.md`: agregar en la tabla de endpoints
`GET /api/copa`, `/api/copa/equipo`, `/api/copa/intento/iniciar`, `/api/copa/intento/enviar` → `INTEGRAR_COPAS.md`.

## Reglas (lo que decide este módulo)

- **Semana** ISO (`copas.semana` = `YYYY-Www`), hora de Ecuador (`America/Guayaquil`, fija en el código):
  `preparacion` lunes 00:00 → sábado 00:00 · `batalla` sábado 00:00 → 20:00 · `cerrada` sábado 20:00 → lunes.
  La fase guardada solo avanza; `cerrada` se pone recién cuando todos los cruces se jugaron y se entregaron los premios.
- **Universos:** se leen de la tabla `universos` + `servidores.universo_id` (de `Universos.php`, que además crea los
  servidores iniciales); los servidores con `fusionado_en` no juegan. Sin esas tablas: todos los servidores en el universo 1.
  Durante la preparación la copa sigue al universo (servidor nuevo entra, fusionado sale) y rehace su calendario.
- **Torneo** de la semana: rota los 8 parodia (mismas claves que `eventos/batalla.js`), uno por semana desde el lunes 2026-01-05.
- **Calendario:** 2 a 6 servidores → todos contra todos (método del círculo). 3 servidores: 3 cruces a las 10:00, 14:00 y
  18:00. Otras cantidades de rondas: repartidas entre 08:00 y 19:00 (múltiplos de 15 min). **7 o más servidores:** grupos de
  3 o 4 (reparto en serpiente por id), todos contra todos dentro del grupo (todas las rondas a la misma hora); una sola
  tabla general (campeón = primero). 1 servidor: sin cruces; solo premio de participación.
- **Equipo de copa** (`POST /api/copa/equipo {staff, equip}`): se revisa con `Festival::revisarEquipo` (el mismo formato
  `{staff, equip}`; habilidad según fama pública, exclusivos solo si están en la bodega del servidor, VIP solo con VIP,
  al menos una cámara; el servidor fija ánimo 80 y estado 90). Solo en preparación; registrar otra vez lo reemplaza.
  `poder` = el de `batalla.js` (`{accion: 'poder'}`); si Node no está, una cuenta parecida en PHP.
- **Plantel:** hasta 5 equipos registrados de más poder, de jugadores que siguen en ese servidor y con la cuenta activa
  (registrar en la semana ya cuenta como actividad). Si son menos de 5, los lugares vacíos llevan copias del **equipo de la
  casa = el equipo MEDIANO por poder del universo esa semana**, contando solo equipos de jugadores que aportaron
  (`Copas::equipoCasa($copa)`; recomendación de `tools/sim_copas.js`). Sin ninguno, `batalla.js` usa su casa por defecto
  (habilidad 2). Se muestra como "Equipo de la casa"; `detalle_json.casa_poder` guarda su poder.
- **Intentos de preparación:** `POST /api/copa/intento/iniciar {}` (solo en preparación, con equipo registrado, máx. 10
  por día; si hay uno abierto devuelve el mismo, con la misma semilla) → `{ok, reanudado, id, seed, contrato, equipo,
  contexto, vip, firma, vence}` (30 min). El contrato es de un tipo de evento del torneo (`contrato.copa = true`). Contexto
  fijo igual para todos (el de duelos). `POST /api/copa/intento/enviar {intento_id, decisiones, resultado: {quality|calidad,
  stars|estrellas}, firma?}` → `{ok, resultado: {calidad, estrellas, valido, puntos, estado, sospechoso, motivo}, copa}`
  (202 si quedó `pendiente`). La semilla queda usada antes de validar. Firma opcional; si viene y no coincide: 403 `firma`.
- **Puntos de preparación SOLO de intentos validados** (`Repeticion::validar`, o `Copas::$validador` en pruebas):
  puntos = calidad **del validador** + 5/10/20 por 3/4/5 estrellas (del validador). Si el juego dijo otro resultado,
  cuenta igual lo del validador y el intento queda `sospechoso = 1` (`resultado.sospechoso: true`; no con `version_distinta`):
  mentir no da nada. Jugada imposible (calidad null) → `rechazado`, 0 puntos. Validador caído → `pendiente` (la tarea lo
  revalida). Cada aporte es una fila de `copa_aportes` con `ref = 'intento:<id>'` (UNIQUE: nunca suma dos veces); lo que
  llega después del primer cruce jugado ya no suma. Al validar llama `Universos::marcarActivo($j, true)` si existe.
- **Cruce:** semilla `random_int` guardada al crear el calendario en `detalle_json`; 5 contratos que salen de esa semilla
  (tipos del torneo); `node server/eventos/batalla.js` (o `Copas::$motor`). Gana cada partido la mayor calidad (se calcula
  en PHP): 10 puntos ganar, 5 empatar. Puntos del cruce = partidos + bono **mixto**
  `round(min(15, 15 × (½ · prep / máx_prep + ½ · prom / máx_prom)))`, con `prom` = prep del servidor ÷ jugadores activos
  de 7 días (`Universos::activos($s, 7)`, mínimo 1; sin Universos: los que aportaron). Los bonos se calculan al jugar el
  primer cruce y quedan congelados en `copa_ajustes` (`bonos:<copa>`), así no cambian en el sábado ni al rejugar (`Copas::bonos($copa)`).
  Ganar el cruce = 3 puntos de tabla, empatar = 1. Desempate: diferencia de calidad total, luego preparación, luego id.
  Si el motor no responde, el cruce queda `pendiente` y se reintenta en la próxima tarea (aviso `copa_motor` en `avisos`, 1 por hora).
- **Cierre** (sábado ≥ 20:00 y sin cruces pendientes): tabla final, premios, mensaje en `servidor:<id>` de cada servidor,
  aviso `sistema:<jugador>` a cada premiado y, si está `DISCORD_WEBHOOK_EVENTOS`, anuncio en Discord.

## Centro de Control (auditado en `auditoria`)
- `Copas::forzarFase(int $copa, string $fase, string $quien): void` — solo hacia adelante (409 `fase` si no). A `cerrada`:
  juega ya los cruces pendientes (sin esperar su hora), cierra y premia (`cerrar($id, true)`); si el motor no responde,
  queda en batalla y lanza 503 `motor_caido`. Acción `copa_fase`.
- `Copas::rejugarCruce(int $cruce, string $quien): array` → `{puntos_a, puntos_b, estado}` — vuelve a jugar el cruce con
  la misma semilla y recalcula la tabla; 409 `copa_cerrada` si la copa ya cerró. Acción `copa_rejugar`.
- Errores: siempre `Fallo` con `codigo` (api.php lo pasa al juego; el resto sale del código HTTP).

## Premios (sin dinero real; `copa_premios` UNIQUE (copa, jugador, clave) en la misma transacción que las entregas)
Solo para quien **aportó** (intentos validados) a su servidor esta semana. Origen de las entregas: `copa:<copa_id>:<clave>`.

| clave | quién | entregas |
|---|---|---|
| `campeon` | todos los aportantes del servidor campeón | `dinero` 3000, `fama` 3, `trofeo`, `materiales` chips 2 · paneles 4 · placas 4 · credenciales 2 |
| `top10` | 10 mayores aportantes del campeón | `dinero` 2000, `consumible` cable 5, `consumible` battery 3 |
| `subcampeon` | aportantes del 2.º (con 3+ servidores) | `dinero` 1000, `fama` 1, `materiales` placas 2 · cables 4 |
| `participacion` | aportantes de los demás servidores | `dinero` 300 + 100 por cada 150 puntos (máx. +1200), `materiales` cables 3 |

### Tipos de entrega nuevos (el juego los aplica si sabe; si no, los ignora)
- `trofeo`: `item` = clave del trofeo (`copa_<torneo>_<semana>`, p. ej. `copa_el_gran_tazon_2026-W44`), `cantidad` 1.
  El nombre para mostrar viene en `GET /api/copa` → `yo.trofeos[{clave, nombre, semana}]` (la tabla `entregas` no tiene
  columna de nombre).
- `materiales`: una entrega por material: `item` = material de `js/sede.js` (`cables`, `placas`, `paneles`,
  `credenciales`, `planos`, `chips`), `cantidad` = cuántos. Solo se entregan si existe `js/sede.js`.

## `GET /api/copa` (además de lo de COPAS.md)
`copa` trae también `semana`, `batalla` y `cierre` (ISO), `deporte`, `cadena`, `tipos`; `servidores[]` trae `dif_calidad`
`bono` y `activos`; `cruces[]`: `a`/`b` son ids de servidor + `a_nombre`, `b_nombre`, `grupo`, `bono_a/b`, `calidad_total_a/b` y en
cada partido `equipo_a`/`equipo_b` (nombre público o "Equipo de la casa"); `yo` trae `servidor_id`, `intentos_hoy`,
`intentos_max`, `trofeos`, `premios`.
