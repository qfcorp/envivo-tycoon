# Integrar: Universos y reparto parejo de jugadores (COPAS.md §1)

Archivos del módulo (ya en su lugar, no hace falta tocarlos):
- `server/src/Universos.php` — clase `EnVivo\Universos`.
- `server/src/migraciones/universos.sql` — tablas `universos`, `actividad_diaria`, columna `servidores.universo_id`
  (se aplica sola al cambiar la huella de `migraciones/`). Crea el Universo 1 "Universo Andino" y le asigna los servidores
  que ya existían; copia a `actividad_diaria` los últimos 31 días de la tabla vieja `actividad`. No toca `fusionado_en`.
- `server/src/Social.php` — `Social::servidorParaNuevo()` ahora llama a `Universos::asignar()` (reparto parejo).
- `server/tests/pruebas_universos.php` — 92 pruebas en 6 partes (base nueva, base existente con 30 jugadores, actividad,
  desborde de universo, servidores en abandono y `UNIVERSO_SERVIDORES_INICIALES=1`), cada una con su propia base temporal.
- `server/tests/pruebas_mercado_social.php`, sección "Servidores y perfil público" (autorizado por el coordinador): ahora
  prueba el reparto parejo con 3 servidores (vacío primero, menos activos, desborde a un universo nuevo) y junta a los
  jugadores de la prueba en el Servidor 1 a mano para que asociaciones y chat sigan probando lo mismo. Funciona con o sin
  el paso 2 integrado. Las demás secciones no se tocaron.

## Líneas para el coordinador

> **Estado: APLICADAS** (integración del servidor). En `api.php` el orden final de `/api/estado` y de las otras 4
> respuestas con el estado completo es `Universos::estado + Fusiones::estado + Cuentas::estado + Discord::estado`: así la
> línea sigue terminando en `Cuentas::estado(...) + \EnVivo\Discord::estado(...)),`, que es el texto que buscan
> `pruebas_discord.php` (bloque `estado_despues` de INTEGRAR_DISCORD.md, actualizado) y `pruebas_fusiones.php`.
> `$CLAVES_ESTADO` de `pruebas.php` empieza con `'universo', 'aviso_fusion'`. Los bloques de abajo son la versión original.

### 1. `server/public/api.php` — `/api/estado` (y las respuestas que devuelven el estado completo)
Línea 36:
```php
        '/estado' => $soloGet() && Http::json(200, Cuentas::estado(Sesiones::jugadorId()) + \EnVivo\Discord::estado(Sesiones::jugadorId()) + \EnVivo\Universos::estado(Sesiones::jugadorId())),
```
Líneas 119 y 137:
```php
    Http::json(200, Cuentas::estado($id) + \EnVivo\Discord::estado($id) + \EnVivo\Universos::estado($id));
```
Línea 475:
```php
    Http::json(200, Cuentas::estado($j) + \EnVivo\Discord::estado($j) + \EnVivo\Universos::estado($j));
```
Línea 495: agregar `+ \EnVivo\Universos::estado($j)` al final, igual que arriba.

**Importante:** `pruebas_discord.php` busca en api.php la línea exacta del bloque `<!-- prueba:estado_despues -->` de
`server/INTEGRAR_DISCORD.md` (línea 51). Al cambiar la línea 36 hay que poner ahí la misma línea nueva (la de arriba, con
lo que agreguen los demás módulos); si no, falla "api.php (de hoy) tiene el lugar donde va cada bloque". Probado: con ese
bloque actualizado, `pruebas_discord.php` da 120 correctas, 0 fallas.

`Universos::estado(?int $jugador)` devuelve `['universo' => ['id' => 1, 'nombre' => 'Universo Andino']]`, o
`['universo' => null]` sin sesión. Con sesión además marca al jugador activo hoy (`marcarActivo`: una lectura por clave
primaria y, solo la primera vez del día, una escritura). Nunca lanza error. No dispara el arranque.

### 2. `server/bin/migrar.php` — arranque (servidores 2 y 3) al instalar/actualizar
Justo después de `Db::pdo();   // al abrir ya aplica las que falten`:
```php
    \EnVivo\Universos::preparar();   // Universo Andino con UNIVERSO_SERVIDORES_INICIALES servidores (idempotente, no imprime nada)
```
`deploy/instalar.sh` y `deploy/actualizar.sh` ya corren `migrar.php`, así que en producción los servidores
`Servidor 2 · Guayaquil` y `Servidor 3 · Cuenca` aparecen en el próximo despliegue. Los jugadores que ya existen no se mueven.
(Además se arranca solo la primera vez que alguien llama a `servidoresDe`, `universoDe`, `resumen` o `crear`: Copa, Salud
y Centro de Control. El registro y `/api/estado` NO lo disparan a propósito: no cambian el reparto a mitad de una prueba.)

### 3. `server/tests/correr.sh` (con el valor por defecto de 3 servidores; NO hace falta `UNIVERSO_SERVIDORES_INICIALES=1`)
a) En la lista de suites del paso 3c (con `fusiones` del módulo de salud/fusión):
```bash
for suite in discord festival liga control duelos_desafio universos fusiones; do
```
(`pruebas_universos.php` hace su propia configuración y bases; su última línea es el resumen, como las demás.)

b) En la lista de tablas del paso 1 (`for t in actividad ajustes ...`), agregar `actividad_diaria` y `universos`.

### 4. `server/tests/pruebas.php` línea 115 (`$CLAVES_ESTADO`)
Al final de la lista, después de `'discord_invitacion'`: `, 'universo'` (y las claves que agreguen los otros módulos,
en el orden de los `+` de la línea 36 de api.php).

### 5. Otros módulos: marcar eventos en línea validados
Donde un intento en línea queda **válido** (Liga, Duelos, Desafío, Festival, Copa), una línea:
```php
\EnVivo\Universos::marcarActivo($jugador, true);   // suma 1 a actividad_diaria.eventos de hoy (nunca lanza error)
```

### 6. Documentación (`server/API.md`, tabla de claves del estado, y `server/config.env.ejemplo`)
API.md, fila nueva: `| universo | {id, nombre} del universo del servidor del jugador, o null sin sesión | COPAS.md |`

config.env.ejemplo (todo opcional):
```
; Universos (COPAS.md §1): servidores con los que nace cada universo (1 a 12; el primero es el Universo Andino)
UNIVERSO_SERVIDORES_INICIALES=3
; Opcionales: ciudades para nombrar servidores ("Servidor <id> · <ciudad n.º id>"), nombres de los universos que se abren
; solos, y capacidad de los servidores nuevos (por defecto la del servidor más nuevo, 1000)
; UNIVERSO_CIUDADES=Quito,Guayaquil,Cuenca,Manta,Loja,Ambato
; UNIVERSO_NOMBRES=Universo Andino,Universo Pacífico,Universo Amazónico
; SERVIDOR_CAPACIDAD=1000
```

## API de la clase (para Copa, Salud/Fusión y Centro de Control)
| Función | Qué hace |
|---|---|
| `Universos::preparar(bool $forzar = false): list<int>` | Arranque idempotente; devuelve los servidores creados (vacío si ya estaba). |
| `Universos::asignar(): int` | Reparto (lo usa `Social::servidorParaNuevo`). Universo activo más nuevo con cupo; servidor con menos activos 7 días, empate -> menos jugadores, luego id. Salta los fusionados (`fusionado_en`) y los que están en `abandono` según su última foto de `servidor_salud` (no los cierra). Cierra los llenos (`abierto = 0`); si no queda ninguno elegible, abre un universo con N servidores (auditoría `sistema`, acción `universo_crear`). |
| `Universos::siguiente(): ?int` | Solo lectura: a qué servidor entraría ahora un jugador nuevo (null = se abriría un universo). |
| `Universos::marcarActivo(int $jugador, bool $evento = false): bool` | Actividad de hoy (ver arriba). Devuelve si escribió. |
| `Universos::activos(int $servidor, int $dias = 7): int` | Jugadores que HOY son del servidor y jugaron en los últimos `$dias` días (1 = hoy). |
| `Universos::eventos(int $servidor, int $dias = 7): int` | Suma de eventos en línea validados (según el servidor de cada día). |
| `Universos::servidoresDe(int $universo, bool $conFusionados = false): list` | `{id, nombre, universo_id, capacidad, abierto, creado, fusionado_en?}` por id; sin fusionados por defecto. |
| `Universos::universoDe(int $servidor): ?array` | `{id, nombre, activo, creado}` o null. |
| `Universos::crear(string $nombre, int $n, string $quien): array` | Universo nuevo con `$n` (1-12) servidores; auditado (`universo_crear`). Fallo 400 (`nombre`, `servidores`) / 409 (`nombre_ocupado`). Devuelve `{id, nombre, servidores}`. |
| `Universos::resumen(): array` | `{universos:[{id, nombre, activo, creado, abierto, jugadores, activos_7, servidores:[{…, jugadores, activos_1, activos_7, siguiente}]}], siguiente_servidor, servidores_iniciales, dias_activo}` |
| `Universos::estado(?int $jugador): array` | El bloque de `/api/estado`. |
| `Universos::fijarReloj(?int)`, `Universos::reiniciar()` | Solo pruebas. |

Notas: `universos.activo = 0` retira un universo (no recibe jugadores; la copa decide si lo salta). Un universo con todos
sus servidores cerrados sigue `activo = 1` (sigue jugando la copa). Los servidores nunca se borran: el arranque solo
completa el Universo 1 hasta N, así que correrlo de nuevo (o después de una fusión) no crea nada.
