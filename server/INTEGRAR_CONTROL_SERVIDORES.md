# Centro de Control: pestaña "Servidores" (integración)

Pestaña `/control/?t=servidores` del Centro de Control (COPAS.md §3). Código: `server/public/control/lib/servidores.php`.
Pruebas: `server/tests/pruebas_control_servidores.php`.

## Qué muestra

- **Universos y servidores**: por universo, cada servidor con jugadores (y capacidad), activos 1 / 7 / 30 días, estado de
  salud (`sano` / `bajo` / `abandono`, `fusionado`, `cerrado`) y un gráfico SVG de 30 días (activos por día; sin
  librerías, colores como atributos SVG para cumplir la CSP; al tocarlo muestra el detalle con `data-tip`). Los servidores
  sin universo van aparte.
- **Copa de Servidores**: la copa más reciente de cada universo (torneo, semana, fase, tabla y cruces con resultado).
  En "Administrar esta copa": **forzar fase** y **rejugar** un cruce (con confirmación, CSRF y auditoría).
- **Avisos de abandono y fusiones**: cada plan en `fusiones` con estado `plan`/`aprobada`, con el resumen del plan
  (`resumen`, `bloqueos` en rojo, advertencias y el JSON completo). **Aprobar** exige escribir el nombre del servidor de
  origen (se compara sin mayúsculas, tildes ni signos: "servidor 4 loja" vale por "Servidor 4 · Loja") y además el diálogo
  de confirmación. **Cancelar** (motivo opcional). "Revisar el plan ahora" (vista previa de solo lectura con
  `Fusiones::plan`) y "Armar el plan otra vez" / "Guardar como plan" (`Fusiones::crearPlan`, para cuando el plan quedó
  desactualizado). También los avisos de la vigilancia (`avisos` con tipo `servidor_abandono`) y el historial.
- **Crear universo (N servidores)**: nombre + N (1 a 12, por defecto `UNIVERSO_SERVIDORES_INICIALES`).
- Insignia en la pestaña = planes de fusión pendientes.

Si falta una clase o un método, ese bloque dice **"Módulo no instalado"** y el resto sigue. Si `Universos::resumen()` o
`SaludServidores::resumen()` fallan, se leen las tablas del contrato y la página lo indica.

## Líneas de registro (ya están puestas)

`server/public/control/index.php`:

```php
foreach (['resumen', 'jugadores', 'compras', 'productos', 'mercado', 'chat', 'soporte', 'ajustes', 'servidores'] as $f) require __DIR__ . '/lib/' . $f . '.php';
        'servidores' => cc_t_servidores(),                                                   // en el match de pestañas
            str_starts_with($accion, 'servidores_') => cc_a_servidores($accion, $q),          // en cc_post_accion
```

`server/public/control/lib/base.php`:

```php
    'servidores' => 'Servidores',                                                            // en CC_PESTANAS
        if (function_exists('cc_servidores_insignia')) $o['servidores'] = cc_servidores_insignia();   // en cc_insignias
```

## Línea para el coordinador: `server/tests/correr.sh`

Agregar la suite al bucle de la sección 3c:

```bash
for suite in discord festival liga control control_servidores duelos_desafio; do
```

(La prueba toma `P_APP` como primer puerto y busca otros dos libres; usa Playwright de `NODE_PATH` o
`/opt/npm-tools/node_modules` si está, si no lo salta.)

## Métodos que usa (firmas supuestas)

Los argumentos se pasan **por nombre del parámetro** (con sinónimos) mediante Reflection, así que pequeñas diferencias
de nombre u orden no rompen el panel. Firmas que se suponen (las de Universos, SaludServidores y Fusiones coinciden con
lo que hay hoy en `server/src`):

| Llamada | Firma supuesta | Si falta |
|---|---|---|
| `Universos::resumen()` | `resumen(): array` → `['universos' => [{id, nombre, activo, creado, servidores: [{id, nombre, capacidad, abierto, fusionado_en, jugadores, activos_1, activos_7}]}]]` | lee `universos` + `servidores.universo_id`; sin tablas: "Módulo no instalado" y lista de servidores sueltos |
| `Universos::crear()` | `crear(string $nombre, int $n, string $quien): array` → `{id, nombre, servidores}` | "Módulo no instalado" |
| `SaludServidores::resumen()` | `resumen(int $dias = 30): array` → `['servidores' => [{id, salud: {estado, activos_1, activos_7, ...}, historial: [{dia, activos_1}]}]]` | última fila de `servidor_salud`; sin tabla: estado "sin datos" |
| `Fusiones::plan()` | `plan(int $origen, int $destino): array` (solo lectura) con `resumen`, `bloqueos: [{codigo, texto}]`, `advertencias` | sin vista previa |
| `Fusiones::crearPlan()` | `crearPlan(int $origen, int $destino, string $quien, bool $sugerida = false): int` | sin botones de armar plan |
| `Fusiones::ejecutar()` | `ejecutar(int $planId, string $quien): array` → `{jugadores, ...}` | botón Aprobar desactivado + "Módulo no instalado" |
| `Fusiones::cancelar()` | `cancelar(int $planId, string $quien, string $motivo = ''): void` | `UPDATE fusiones SET estado = 'cancelada'` (solo si sigue en plan/aprobada) |
| `Copas::forzarFase()` | `forzarFase(int $copa, string $fase, string $quien): void` | **respaldo** con lo público de Copas: la fase solo avanza; `preparacion → batalla` con el mismo UPDATE que `tareaProgramada`; `→ cerrada` juega los cruces pendientes con `jugarCruce` y llama `cerrar($id)` (que solo cierra tras el sábado 20:00) |
| `Copas::rejugarCruce()` | `rejugarCruce(int $cruce, string $quien): array` → `{puntos_a, puntos_b}` | **respaldo**: el cruce vuelve a `pendiente` (detalle_json conserva la semilla), `jugarCruce($id)`; si el motor no responde, `recalcularTabla($copa)` y queda para la tarea programada. No se rejuega si la copa ya cerró |

**Pendiente para el módulo Copa**: hoy `Copas.php` no tiene `forzarFase` ni `rejugarCruce`; el panel usa los respaldos de
arriba. Si se agregan con esas firmas, el panel los usa solo (sin cambios aquí). En cuanto exista `forzarFase`, también
se puede volver atrás de fase.

Lecturas directas de tablas del contrato: `actividad_diaria` (activos y gráfico; si no existe, la tabla vieja `actividad`
con `jugadores.servidor_id`), `servidor_salud`, `copas`, `copa_servidores`, `copa_cruces`, `fusiones`, `avisos`.

## Auditoría (tabla `auditoria`, quien = `control:<usuario>`)

| Acción | Cuándo |
|---|---|
| `servidores_fusion_aprobar` | fusión aprobada y ejecutada (además, `Fusiones` anota `fusion_ejecutar`) |
| `servidores_fusion_confirmacion_mala` | se intentó aprobar con un nombre que no coincide (no se hizo nada) |
| `servidores_fusion_cancelar` | plan cancelado (con el motivo) |
| `servidores_fusion_plan` | plan armado / rehecho desde el panel |
| `servidores_universo_crear` | universo nuevo (además, `Universos` anota `universo_crear`) |
| `servidores_copa_fase` | fase forzada (con `[respaldo]` si fue sin `Copas::forzarFase`) |
| `servidores_copa_rejugar` | cruce rejugado (o vuelto a pendiente) |
| `<acción>_fallida` | el módulo lanzó un error inesperado (el panel muestra el error y no se cae) |
| `control_csrf_rechazado` | cualquier POST sin código CSRF válido o desde otro sitio (de `index.php`, como en las demás pestañas) |
