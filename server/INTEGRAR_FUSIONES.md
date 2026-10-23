# Integrar la salud de servidores, la fusión de servidores abandonados y el traslado voluntario

Contrato: `server/COPAS.md` §3. Todo en español; errores como el resto de la API:
`{ "ok": false, "error": "texto", "codigo": "..." }` con código HTTP 4xx. POST con cabecera `X-Envivo: 1`.

## Archivos (todos nuevos)

| Archivo | Qué es |
|---|---|
| `server/src/SaludServidores.php` | Foto diaria de salud (`foto()`), umbrales en `ajustes`, aviso + plan sugerido al entrar en abandono, `resumen()` para el Centro de Control (30 días). |
| `server/src/Fusiones.php` | `plan()` (solo lectura), `crearPlan()`, `ejecutar()`, `cancelar()`, `obtener()`, traslado voluntario, `estado()` para `/api/estado`, `ruta()` para `/api/servidor/*`. |
| `server/src/migraciones/fusiones.sql` | `servidores.fusionado_en` / `fusionado_a`, tablas `servidor_salud`, `fusiones`, `traslados`; siembra los 5 umbrales en `ajustes`. Se aplica sola (Db::migrarModulos). |
| `server/bin/salud_servidores.php` | Cron diario. `--dia=YYYY-MM-DD` u `--hoy`. Nunca ejecuta fusiones. |
| `server/tests/pruebas_fusiones.php` | 104 pruebas (base de prueba propia + `php -S` con una COPIA de `api.php` con las líneas de abajo). |

`Db.php`: **no hace falta nada** (la migración es un archivo de `src/migraciones/`).

## 1. `server/public/api.php` (2 cambios)

Dentro del `try`, **después** de las comprobaciones de `X-Envivo` y de método (y de las líneas de Liga / Duelos), justo
**antes** de `match ($ruta) {`:
```php
    // Salud de servidores, fusión y traslado voluntario (server/INTEGRAR_FUSIONES.md): /api/servidor/*
    if (($r = \EnVivo\Fusiones::ruta($ruta, $metodo)) !== null) Http::json(200, $r);
```
En la línea de `'/estado'`, sumar `Fusiones::estado(...)` al final:
```php
        '/estado' => $soloGet() && Http::json(200, Cuentas::estado(Sesiones::jugadorId()) + \EnVivo\Discord::estado(Sesiones::jugadorId()) + \EnVivo\Fusiones::estado(Sesiones::jugadorId())),
```
(Si para entonces la línea ya suma `Universos::estado(...)` u otros, agregar `+ \EnVivo\Fusiones::estado(Sesiones::jugadorId())` al final.)
`Fusiones::ruta()` devuelve `null` si la ruta no es suya; lanza `Fallo` (401 sin sesión, 405 método, 409 reglas).
`pruebas_fusiones.php` hace exactamente estos dos reemplazos sobre una copia de `api.php` y falla si no entran.

Si también se arma `/api/registro` y `/api/entrar` con `Cuentas::estado(...) + Discord::estado(...)`, se puede sumar
`Fusiones::estado($id)` igual (no es obligatorio: el juego vuelve a pedir `/api/estado`).

## 2. `server/tests/correr.sh` (1 cambio)

En la sección 3c, agregar `fusiones` a la lista de suites:
```bash
for suite in discord festival liga control duelos_desafio fusiones; do
```
(La suite usa su propia base temporal y `P_APP`; no necesita validador ni Node.)

## 3. Cron (www-data)

```
20 0 * * *   php /var/www/envivo/server/bin/salud_servidores.php
```
Saca la foto del día anterior (el último completo). Repetir un día reemplaza su foto y no repite avisos.

## 4. API del juego

### `GET /api/servidor/opciones`
```json
{ "ok": true,
  "actual":   { "id": 1, "nombre": "Servidor 1 · Quito", "estado": "sano|bajo|abandono", "activos_7": 4, "activos_30": 9,
                "jugadores": 50, "dia": "2026-10-22", "universo": { "id": 1, "nombre": "Universo Andino" } },
  "servidor": { ...igual que "actual"... },
  "universo": { "id": 1, "nombre": "Universo Andino" },
  "sugerido": { "id": 2, "nombre": "Servidor 2 · Guayaquil", "jugadores": 33, "capacidad": 1000, "estado": "sano", "activos_7": 33 } | null,
  "destinos": [ ...los más sanos que el actual, mejor primero... ],
  "puede": true, "codigo": null, "motivo": null,
  "proximo_traslado": "YYYY-MM-DD" | null, "cada_dias": 30, "gratis": true }
```
`codigo` cuando `puede` es false: `servidor_sano`, `sin_destino`, `traslado_reciente` (+ `disponible_desde` ISO),
`presidente_con_miembros`, `intento_abierto` (+ `donde`), `publicaciones_activas`, `copa_en_curso`, `cuenta_no_activa`.

### `POST /api/servidor/trasladar {destino}`
Gratis, 1 vez cada 30 días. Solo a un servidor del mismo universo, abierto, sin fusionar, con cupo y **más sano**
(estado mejor: abandono < bajo < sano). Respuesta:
`{ok, servidor:{id,nombre}, alias_nuevo|null, asociacion|null, dejo_asociacion, asociacion_renombrada|null, proximo_traslado (ISO)}`.
Errores (`codigo`): `falta_destino` 400, `destino_no_existe` 404, `mismo_servidor`, `destino_cerrado`, `otro_universo`,
`destino_lleno`, `destino_no_mas_sano`, `traslado_reciente`, `presidente_con_miembros`, `intento_abierto`,
`publicaciones_activas`, `copa_en_curso` (409), `cuenta_suspendida`/`cuenta_baneada` 403.
- Alias repetido en el destino → `"Alias (Quito)"` (o `"Alias (Quito B)"`...).
- Presidente **solo** → su asociación se va con él (renombrada si choca el nombre o las siglas; deja las coaliciones vigentes).
- Socio / vicepresidente → sale de la asociación (la asociación se queda). Sus pedidos de ingreso pendientes se borran.
- Pasan con él: equipo de duelo, puntaje de la temporada abierta e intentos del desafío de días abiertos.
- Créditos, compras, inventario y partida: no se tocan. Queda en `traslados`, en `auditoria` (`servidor_traslado`) y un mensaje en `sistema:<jugador>`.

### `POST /api/servidor/aviso-visto {id?}` → `{ok, cerrados}`: cierra el `aviso_fusion`.

### `GET /api/estado` → `aviso_fusion`
`null`, o (14 días después de una fusión, hasta que se cierre):
```json
{ "id": 7, "fusion_id": 3, "de": "Servidor 3 · Cuenca", "a": "Servidor 2 · Guayaquil", "fecha": "2026-10-23",
  "fecha_iso": "2026-10-23T10:00:00-05:00", "origen": {"id": 3, "nombre": "..."}, "destino": {"id": 2, "nombre": "..."},
  "alias_antes": "Rayo", "alias_nuevo": "Rayo (Cuenca B)", "asociacion_antes": "Los Andes [AND]", "asociacion_nueva": "Los Andes (Cuenca) [AND]",
  "texto": "Tu servidor ... se unió a ... (texto listo para mostrar)" }
```

## 5. Centro de Control (pestaña "Servidores")

- `SaludServidores::resumen(30)` → `{umbrales, servidores:[{id, nombre, universo_id, abierto, capacidad, jugadores, fusionado_en, fusionado_a,
  salud:{dia, estado, motivo, activos_1/7/14/30, activos_7_antes, tendencia_pct, eventos, mensajes, asociaciones_activas, jugadores},
  historial:[{dia, activos_1, activos_7, activos_14, activos_30, eventos, mensajes, estado}]}], fusiones:[planes pendientes y de 90 días], avisos:[...]}`.
- Umbrales (tabla `ajustes`, editables con `Ajustes::guardar([...], $usuario, 'salud_umbrales')`): `salud_bajo_activos7` (25),
  `salud_bajo_caida_pct` (40), `salud_abandono_activos14` (10), `salud_abandono_activos7` (5, dos semanas seguidas),
  `salud_gracia_dias` (14: un servidor más nuevo nunca es abandono).
- Al entrar en abandono: plan sugerido (`fusiones`, `sugerida = 1`, estado `plan`) hacia el servidor más activo con cupo
  del mismo universo (no en abandono) + `avisos` tipo `servidor_abandono` con el resumen del plan.
- `Fusiones::obtener($id)` → plan completo (choques de alias, asociaciones, límite de miembros, mercado, chat, en curso con
  la decisión de cada módulo, rankings, cada tabla con columna de servidor y su regla, bloqueos, advertencias).
- `Fusiones::plan($origen, $destino)` (solo lectura) y `Fusiones::crearPlan($origen, $destino, $usuario)` para elegir otro destino
  (reemplaza el plan pendiente de ese origen).
- Botón **Aprobar**: `Fusiones::ejecutar($planId, $usuario)` (con confirmación). Se niega con `requiere_persona` si `$usuario`
  es '', 'sistema', 'cron', 'vigilancia', 'automatico'. Otros códigos: `plan_no_existe`, `ya_ejecutada`, `plan_cancelado`,
  `plan_desactualizado` (algo cambió desde el plan: armarlo otra vez), y los bloqueos `copa_en_curso`, `sin_cupo`,
  `origen_fusionado`, `destino_fusionado`, `destino_cerrado`, `otro_universo`, `mismo_servidor`.
- Botón **Cancelar**: `Fusiones::cancelar($planId, $usuario, $motivo)`. Las dos acciones quedan en `auditoria`
  (`fusion_plan`, `fusion_ejecutar`, `fusion_cancelar`).

## 6. Qué hace `ejecutar` (una transacción) y por qué

Vuelve a armar el plan y exige la misma huella; renombra alias y asociaciones que chocan; mueve cada tabla según
`Fusiones::REGLAS`; deja el origen `fusionado_en`, `fusionado_a`, `abierto = 0`; un `traslados` por jugador (para el
`aviso_fusion`); mensaje del sistema en `servidor:<origen>` y `servidor:<destino>`; `auditoria`. Revisa que la suma de
créditos de los movidos no cambió. Nunca borra jugadores ni toca `creditos`, `compras` o `movimientos_creditos`.

| Módulo | Decisión |
|---|---|
| jugadores, asociaciones, equipos de duelo | se mueven (las asociaciones conservan su id; no se juntan, cada una con sus miembros ≤ 20) |
| liga semanal | entre asociaciones de todos los servidores: solo se corrige `servidor_id` de la semana abierta |
| Mega Festival | los abiertos siguen (servidor y nombre si cambian las siglas); los cerrados = historial |
| duelos | temporada abierta y duelos sin cerrar → destino; temporadas cerradas y premios = historial |
| desafío del día | intentos de días sin cerrar → ranking del destino; días cerrados y premios = historial |
| coaliciones | vigentes o futuras → destino; terminadas = historial |
| copa | preparación: aportes, equipos e intentos → destino (Copas saca al fusionado y recalcula); en batalla: **espera** (`copa_en_curso`) |
| chat | `servidor:<origen>` queda como archivo; los demás canales van por id |
| mercado | es uno solo para todos los servidores: sin cambios |
| ranking de fama | en vivo con `jugadores.servidor_id`: se mueve solo |
| tablas nuevas con columna de servidor sin regla | historial + advertencia en el plan |

## 7. Notas para otros módulos

- **Universos** (reparto): los servidores fusionados ya se excluyen. Conviene no mandar jugadores nuevos a un servidor
  cuya última foto en `servidor_salud` sea `abandono` (hoy el reparto por "menos activos" lo elegiría).
- **Salud**: activos = unión de `actividad_diaria` (Universos), `actividad` (núcleo) y `jugadores.ultimo_ingreso`.
  `opciones` lee el universo directo de la tabla `universos` (no llama a `Universos::universoDe`, que dispara `preparar()`).
