# Edad del servidor y días temáticos de la Copa: cómo conectarlo

Dos mecánicas de Kingshot: (1) lo que se abre según los días que tiene el servidor y (2) la preparación de la Copa de
Servidores con un tema distinto cada día (como la preparación del KvK).

| Archivo | Qué es |
|---|---|
| `server/src/EdadServidor.php` | Línea de tiempo del servidor, veteranos, candados (403 `edad_servidor`), `/api/servidor/calendario`, datos para `/api/estado`, reinicio desde el Centro de Control |
| `server/src/CopaTemas.php` | Días temáticos: factor de cada intento (solo con datos del validador), obras de la sede oficial del lunes y viernes, datos para la pantalla |
| `server/src/migraciones/edad_servidor.sql` | Tabla `servidor_edad_ajustes` (clave `corte` = quién es veterano; `inicio:<id>` = reinicio). Se aplica sola |
| `js/edad_servidor.js` | Pantalla: botón y ventana "Calendario del servidor", candados en "En línea", tarjeta "Hoy en la preparación" de la Copa. 10 idiomas |
| `server/tests/pruebas_edad_servidor.php` | Pruebas del servidor (71) |
| `tests/test_edad_servidor.js` | Prueba en el navegador (Playwright, 45) + capturas `tests/capturas/edad_*.png` |
| `docs/traducciones/errores_nuevos/edad_servidor.json` | Código de error nuevo `edad_servidor` en 10 idiomas |

## 1. Líneas en archivos compartidos (YA están hechas en esta rama; si hay choque, son estas)

### `server/public/api.php`
UNA línea, justo ANTES del comentario `// Módulos de monetización (server/MONETIZACION.md)...`:
```php
    // Edad del servidor (server/INTEGRAR_EDAD_SERVIDOR.md): POST a un modo que el servidor todavía no abre → 403 edad_servidor; GET /api/servidor/calendario; /api/estado + edad_servidor
    if (class_exists(\EnVivo\EdadServidor::class)) { \EnVivo\EdadServidor::revisarRuta($ruta, $metodo, fn() => Sesiones::jugadorId()); \EnVivo\EdadServidor::decorarEstado($ruta, $metodo, fn() => Sesiones::jugadorId()); if (\EnVivo\EdadServidor::esRuta($ruta)) Http::json(200, \EnVivo\EdadServidor::responder($ruta, $metodo, requiere_sesion())); }
```
- Tiene que ir antes de las rutas de los módulos y antes de la línea de `Fusiones::ruta`. La sesión solo se busca si la
  ruta tiene candado o es `GET /estado`.
- **La línea de `'/estado'` NO se toca**: la fijan textualmente `pruebas_discord.php` (INTEGRAR_DISCORD.md) y
  `pruebas_fusiones.php`, y `pruebas.php` compara `servidor` exacto (`{id, nombre}`). Por eso `decorarEstado` calcula la
  edad ANTES y deja un filtro de salida (`ob_start`) que solo agrega la clave `edad_servidor` al JSON de un `/api/estado`
  200 con sesión (sin tocar la base en el filtro; si algo falla, sale el JSON de siempre).

### `server/src/Copas.php` (6 cambios chicos, todos con `class_exists`)
- `asegurarCopa()`: `$ids = class_exists(EdadServidor::class) ? EdadServidor::filtrarAbiertos($u['servidores'], 'copa', $t) : $u['servidores'];`
  y `sincronizarServidores(..., $ids)` → un servidor nuevo entra a la copa recién el día que se le abre (si la
  preparación sigue abierta; si cae en sábado, juega la semana siguiente).
- `registrarEquipo()` e `iniciarIntento()`: `EdadServidor::exigir($sid, 'copa', self::ahora());` (lo mismo que el candado
  de api.php, por si alguien llama a Copas directo).
- `aplicar()`: `$base = CopaTemas::puntosIntento(self::puntosIntento($cal, $est), (int) $i['creado'], $r, $valido || $otraVersion)`;
  el bono de ventajas pagadas se suma DESPUÉS, sin multiplicar.
- `recalcularPrep()` pasa de `private` a `public` (lo usa CopaTemas al sumar obras).
- `tareaProgramada()`: `CopaTemas::sumarObras();` después de asegurar las copas.
- `estado()`: `CopaTemas::sumarObras($j);` al abrir y la clave nueva `tema` en la respuesta (ver §3).

### `js/servidores.js` (1 línea): al final de la tarjeta "Tu servidor"
```js
        ${badge}</div>${extra}${root.EdadServidor && root.EdadServidor.boton ? root.EdadServidor.boton() : ''}</div>`;
```
### `js/copas.js` (1 línea): antes de las tarjetas de preparación/cruces en `pintar()`
```js
      ${root.EdadServidor && root.EdadServidor.tarjetaTema ? root.EdadServidor.tarjetaTema(d) : ''}
```
### `index.html` (1 línea, después de servidores.js)
```html
<script defer src="js/edad_servidor.js"></script>
```

## 2. Líneas que pone el COORDINADOR (no están en esta rama)
- `sw.js`, en la lista de archivos, después de `'./js/servidores.js'`: `  './js/edad_servidor.js', // Edad del servidor: calendario y candados`
- `tools/build_single.js`: si arma la lista de scripts a mano, agregar `js/edad_servidor.js` después de `js/servidores.js`.
- `docs/traducciones/errores.json`: copiar `edad_servidor` (10 idiomas y `_codigos`) desde
  `docs/traducciones/errores_nuevos/edad_servidor.json`. **Mientras no se copie, `tests/test_traducciones.js` marca 1
  fallo** ("falta el código del servidor edad_servidor").
- `server/tests/correr.sh` §3c: sumar `edad_servidor` a la lista de suites:
  `for suite in discord festival liga control control_servidores duelos_desafio universos copas fusiones demo_datos edad_servidor; do`
- `server/API.md`: `GET /api/servidor/calendario` y el 403 `edad_servidor` (§3).
- `docs/COPA_DE_SERVIDORES.md` (reglas para jugadores): agregar la tabla de días temáticos de §4.

## 3. Contrato

### Línea de tiempo (EdadServidor::LINEA)
| Día del servidor | Clave | Qué se abre | Rutas que se cierran antes (solo POST; mirar con GET sigue) |
|---|---|---|---|
| 1 | `apertura` | Productora (historia y tutorial), Liga Semanal, Desafío del Día, Mercado, chat, asociaciones, sede | — |
| 3 | `duelos` | Duelo de Productoras | `/duelos/equipo`, `/duelos/retar`, `/duelos/jugar`, `/duelos/extra` |
| 5 | `festival` | Mega Festival | `/festival/intento/iniciar`, `/festival/intento/enviar`, `/festival/pases/comprar` |
| 7 | `copa` | Copa de Servidores (y el Pase de Copa) | `/copa/equipo`, `/copa/intento/iniciar`, `/copa/intento/enviar`, `/pase_copa/comprar` |

- **Día 1** = la fecha (America/Guayaquil) de `servidores.creado`; cada cosa se abre a las 00:00 de su día. `edad_dias = dia − 1`.
- **Veteranos** (todo abierto, nadie pierde nada): servidores con `creado <= corte`. El `corte` lo fija la migración UNA
  vez, la primera vez que corre, en "ahora + 24 h" (así también son veteranos los que se crean en el mismo despliegue,
  por ejemplo los servidores 2 y 3 del Universo Andino). El tutorial y el juego local nunca se cierran.
- **Configuración** (`/etc/envivo/config.env`): `EDAD_SERVIDOR=apagado` (todo abierto), `EDAD_SERVIDOR_DIAS="duelos=3,festival=5,copa=7"`
  (claves desconocidas y `apertura` se ignoran), `EDAD_SERVIDOR_CORTE` (ISO o segundos Unix).
- **Centro de Control**: `EdadServidor::fijarInicio(int $sid, ?int $inicio, string $quien)` reinicia la línea de tiempo de un
  servidor (deja de ser veterano) o con `null` la devuelve a lo normal; queda en `auditoria` (`edad_servidor_inicio`).
  (No hay botón todavía: si se quiere, va en la pestaña Servidores de `public/control/lib/servidores.php`.)
- **Error**: `403 {ok:false, codigo:'edad_servidor', error:'Se abre el día 7 del servidor (en 3 días).', desbloqueo, dia, faltan_dias, abre}`
  (`mañana` cuando falta 1 día).

### `/api/estado` (con sesión)
Clave nueva `edad_servidor: {servidor_id, dia, edad_dias, veterano, ahora, desbloqueos:[{clave, dia, nombre, detalle, icono, modo, abierto, abre (ISO), faltan_dias, mensaje}], proximos}`.
`servidor` NO cambia (sigue `{id, nombre}`: `pruebas.php` lo compara exacto). Sin sesión no cambia nada. Si algo falla,
`/api/estado` sale igual que antes (sin la edad) y la pantalla pide `/api/servidor/calendario`.

### `GET /api/servidor/calendario` (con sesión)
`{ok, servidor:{id, nombre, dia, edad_dias, veterano, inicio}, ahora, desbloqueos, proximos, copa_semana:[{n, clave, nombre, cuenta, fecha, hoy, pasado}], recurrentes:[{clave, nombre, cada}]}`.
405 con otro método, 401 sin sesión.

### `GET /api/copa` → clave nueva `tema`
`{hoy: {n, clave, nombre, cuenta, intentos, personal, equipos, obras, max} | null (sábado y domingo), semana:[5 días], obras:{puntos, cuantas, max, puntos_mejora, puntos_nivel}}`.

## 4. Días temáticos de la preparación (CopaTemas)

| Día | Tema | Qué cuenta |
|---|---|---|
| Lunes | Día de construcción (`construccion`) | Obras de la sede oficial terminadas hoy: mejora 15 × 2 = **30**, nivel 40 × 2 = **80**. Eventos de copa ×1 |
| Martes | Día de personal (`personal`) | Eventos de copa con el personal ideal completo **×1,5** |
| Miércoles | Día de equipos (`equipos`) | Eventos de copa con todos los equipos que pide el contrato **×1,5** |
| Jueves | Día de eventos en línea (`en_linea`) | Todos los eventos de copa validados **×1,5** |
| Viernes | Día total (`total`) | Personal ideal +25 %, equipos completos +25 % (máx. ×1,5) y obras de la sede ×1 (15 / 40) |

- El día lo marca cuándo se **pidió** el evento (`copa_intentos.creado`), en hora de Ecuador.
- **Anti-trampas**: "personal ideal" y "equipos completos" se leen de la **repetición del validador**
  (`detalle.partes` de `Repeticion::validar`: las partes de la calidad que calculó `js/logic.js` con el equipo registrado
  en el servidor), nunca del juego. Personal completo = ninguna de `parte.falta_rol`, `parte.justo_rol`,
  `parte.switcher_sin_director`, `parte.consola_sin_sonidista`, `parte.equipo_sin_tecnico`, `parte.repeticiones_sin_operador`,
  `parte.graficos_sin_operador`, `parte.sin_shader`, `parte.sin_operador`. Equipos completos = ninguna de `parte.sin_switcher`,
  `parte.sin_consola`, `parte.sin_equipo_transmision`, `parte.sin_repeticiones`, `parte.sin_graficos`, `parte.sin_intercom`,
  `bloq.*`, y `parte.camaras` ≥ 20 de 25. Sin partes (o mal formadas, o sin `parte.base`) → sin bono.
  Intento sospechoso (el juego dijo otro resultado) → sin bono. Nunca más de ×1,5. El bono de ventajas pagadas no se multiplica.
- **Obras**: de la sede OFICIAL (`sede_obras.fin`, que fija el servidor). Cuentan si el jugador registró su equipo de copa
  y su servidor está en la copa; máximo 6 por día; una sola vez (`copa_aportes.ref = 'obra:<id>'`, `fuente = 'obra'`,
  `creado` = fin de la obra). Se suman en la tarea programada (cada 10 min) y al abrir la copa. Después del sábado 00:00 ya no.
- Por qué así (y no "todo vale doble"): la calidad del validador ya premia el buen personal y los buenos equipos; el tema
  solo empuja a probar algo distinto cada día, igual para todos (un servidor nuevo y uno viejo tienen los mismos temas).

## 5. Lo que NO se hizo (próximos, para cuando existan)
- **Día 14 "Mega Festival con premios mayores"** y **día 45 "Mercado ampliado (15 publicaciones)"**: tocarían premios de
  Festival y `Mercado::MAX_ACTIVAS`, y los servidores veteranos los recibirían de golpe (cambia la economía y rompe sus
  pruebas). Si se quieren: agregar la clave a `EdadServidor::LINEA` (sin rutas) y en el módulo
  `EdadServidor::abierto($sid, 'mercado_ampliado') ? 15 : 10`.
- **Día 21 "Contratos internacionales nivel 2"** y **día 30 "Generación 2 de personal estrella/equipos exclusivos"**:
  `Estrellas` no tiene generaciones todavía. Cuando las tenga: clave `estrellas_g2` en `LINEA` y filtrar el catálogo con
  `EdadServidor::abierto($sid, 'estrellas_g2')`.
- No se cierran compras de créditos ni el Personal estrella (ingresos); solo el Pase de Copa mientras la copa no existe
  en tu servidor (sería una compra que no sirve).
