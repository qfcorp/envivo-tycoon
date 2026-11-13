# Integrar la Gran Producción de Asociación (módulo `gran_produccion`)

Evento de equipo semanal (idea 10 de las propuestas): una vez por semana cada asociación cubre en conjunto un **mega evento
inventado** y, según lo que aportaron sus miembros, todos los que aportaron reciben premios fijos; hay una tabla entre las
asociaciones de cada servidor. Todo gratis, nada al azar y nada que se cambie por dinero.

| Archivo | Qué es |
|---|---|
| `server/src/GranProduccion.php` | Reglas, calendario, aportes, cierre con premios, pausa/cancelación, avisos push, datos del panel |
| `server/src/GranProduccionApi.php` | Rutas `/api/gran`, `/api/gran/resumen`, `/api/gran/aportar` |
| `server/src/migraciones/gran_produccion.sql` | Tablas `gp_*` (se aplica sola con `Db::migrarModulos`) |
| `server/public/control/lib/gran_produccion.php` | Pestaña **Gran Producción** del Centro de Control |
| `server/bin/gran_produccion.php` | Tarea opcional (cada 5 min): abre y cierra a la hora exacta |
| `js/gran_produccion.js` | Pantalla, franja en Inicio y en la pestaña Asociación del chat, `?ir=gran` |
| `server/tests/pruebas_gran_produccion.php` | Pruebas del servidor y del panel (base temporal, reloj congelado, HTTP con `php -S`) |
| `tests/test_gran_produccion.js` | Prueba en un celular 390×844 (Playwright, servidor imitado) + capturas `tests/capturas/gran_produccion_*.png` |

## Reglas (números en `GranProduccion.php`)

- **Calendario**: por defecto empieza el **viernes 18:00** (America/Guayaquil) y dura **48 h**. En el Centro de Control se
  cambian día, hora, duración (12 a 120 h), encendido y el mega evento de la próxima (si no, rota uno por semana entre 6:
  Concierto de 3 noches en el Estadio del Sol, Gran Final del Torneo Nacional Relámpago, Festival Olas y Luces en la playa,
  Gala de las Estrellas del Aire, Maratón Ciudad de las Nubes, Feria de Innovación del Pacífico). Ajustes `gp_activa`,
  `gp_dia` (1 = lunes … 7 = domingo), `gp_hora` (HH:MM), `gp_horas`, `gp_tema_proximo`.
- **Reloj perezoso**: `GranProduccion::tick()` crea la producción al llegar la hora y la cierra al terminar. Lo llaman todas
  las rutas `/api/gran*`, la pestaña del panel, el detector de push (cada minuto con `bin/push_enviar.php`) y, si se quiere
  exactitud sin push, `bin/gran_produccion.php` en el cron.
- **Al empezar** entran todas las asociaciones con miembros: su **meta queda fija** según sus miembros activos en 7 días
  (mínimo 1, máximo 20): personal 4, equipos 4 y transmisiones 6 **por miembro activo**. Una asociación de 1 o 2 llega igual
  que una de 20. Asociaciones creadas durante la producción entran al primer aporte. Aviso en el chat de cada asociación.
- **Cómo aporta cada productora** (sin gastar nada de su partida: el personal y los equipos "vuelven" al instante):
  - **Personal** ("Enviar cuadrilla") y **Equipos** ("Prestar equipos"): un turno al empezar y otro cada 4 h. Los turnos
    **se acumulan** (no se pierde nada por entrar tarde) y un toque manda todos los listos. Máximo 8 de cada uno.
  - **Transmisiones**: automáticas. Cada evento que la productora juega en su partida durante la producción suma 1; el
    servidor lo cuenta con `stats.events` de su **partida en la nube** (foto al empezar, se suma la diferencia; una partida
    nueva con menos eventos no resta). Máximo 12.
  - **Tope por productora** (8 + 8 + 12): nadie llena la meta solo y todos tienen lugar.
  - **Una sola asociación por producción**: si se cambia, lo que aportó queda con la anterior y no puede aportar en la nueva
    hasta la semana siguiente (`gp_otra_asociacion`).
  - **Anti cuentas alternas**: puede aportar quien ya estaba en la asociación al empezar o lleva 24 h en ella (`gp_miembro_nuevo`).
- **Progreso** = Σ min(aportado, 2 × meta) / Σ meta, de 0 a 200 %. **Niveles y premios** (fijos, se ven antes de empezar,
  llegan al buzón de cada productora que aportó al menos 1):

  | Nivel | Desde | Premio |
  |---|---|---|
  | Participación | 1 % | $1.500 del juego · 1 cable |
  | Bronce | 30 % | $3.000 · 2 cables |
  | Plata | 60 % | $6.000 · 3 cables · 2 baterías · 10 créditos |
  | Oro | 100 % | $10.000 · 4 cables · 3 baterías · 25 créditos |
  | Leyenda | 150 % | $15.000 · 6 cables · 4 baterías · 40 créditos · reparar todo |

  **Tabla del servidor**: por progreso (empate: quien llegó primero). Puestos 1, 2 y 3 suman +20 / +15 / +10 créditos (solo
  con Bronce o más). Los premios se guardan en `gp_premios` (una fila por productora y producción: nunca se paga dos veces).
- **Pausa** (panel): nadie aporta, el reloj se detiene y el final se corre lo que dure la pausa. **Cancelar** (panel): sin
  premios, aviso en el chat de cada asociación, no se vuelve a crear esa semana.
- **Avisos push** con `Push::encolar` (categoría `liga`, obedece el interruptor "Duelos y Liga" del jugador; respeta el tope
  diario, las horas de silencio y el "no repetir"): **inicio** a todos los miembros suscritos (solo en las primeras 6 h;
  vence a las 8 h) y **"faltan 2 h"** solo a quien todavía tiene aportes listos (vence al terminar). Abren `/?ir=gran`.
  Textos en los 10 idiomas (`GranProduccion::TEXTOS`, `TEMA_NOMBRES`, `NIVEL_NOMBRES`), en el idioma del aparato del jugador
  (`Push::idiomaJugador`). Los avisos del chat guardan los 10 textos en `chat_mensajes.textos_json` y `Chat` muestra el del
  idioma de quien lee (`Accept-Language`); la columna `texto` queda en español.
- **Auditoría**: `gp_aportes` (cada aporte) y `auditoria` (inicio, cierre, pausa, reanudar, cancelar, horario).

## API (todas con sesión; POST con `X-Envivo: 1`, 60 aportes cada 10 min)

- `GET /api/gran` → `{ fase: en_curso|pausada|pronto|apagada, reglas{frentes[{id,max,meta,cada_seg}], niveles[{id,pct,premios[]}], puestos[], antiguedad_seg},
  produccion: null|{id, tema, icono, nombre, estado, inicio, fin, horas, quedan_seg}, proxima: null|{…, empieza_seg}, en_asociacion,
  asociacion: null|{id, nombre, siglas, color, activos, metas{personal,equipos,transmision}, totales{…}, progreso, nivel, siguiente{id,pct}|null, puesto},
  yo: null|{espera, otra_asociacion, aportes{…}, max{…}, disponibles{personal,equipos}, proximo_seg{personal,equipos}, aporto},
  miembros[{jugador_id, nombre, cargo, personal, equipos, transmision, total, yo}], tabla[{posicion, asociacion_id, nombre, siglas, color, progreso, nivel, activos, mia}],
  ultima: null|{…producción, asociacion{progreso,nivel,puesto}|null, premio{nivel,puesto,premios[]}|null} }`
- `GET /api/gran/resumen` → `{ fase, produccion, en_asociacion, progreso, disponibles, espera }`
- `POST /api/gran/aportar` `{ frente: 'personal' | 'equipos' }` → `{ aporte{frente, cantidad}, …vista }`

Errores nuevos (en `docs/traducciones/errores.json`, los 10 idiomas): `gp_no_hay`, `gp_pausada`,
`gp_miembro_nuevo` (`espera`), `gp_otra_asociacion`, `gp_tope` (`max`), `gp_espera` (`espera`), `gp_config`. Usa también
`sin_asociacion` y `datos_invalidos`.

## Cambios en archivos compartidos (YA HECHOS en esta rama; si hay conflicto, estas son las líneas)

1. `server/public/api.php` — justo **antes** de `    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina`:

```php
    // Gran Producción de Asociación, evento de equipo semanal (server/INTEGRAR_GRAN_PRODUCCION.md): /api/gran*
    if (class_exists(\EnVivo\GranProduccionApi::class) && \EnVivo\GranProduccionApi::esRuta($ruta)) \EnVivo\GranProduccionApi::responder($ruta, $metodo, requiere_sesion());
```

2. `server/src/Push.php` — al final de `detectar()`, antes del `return $n;`:
   `if (class_exists(GranProduccion::class)) { try { $n += GranProduccion::detectarPush(); } catch (\Throwable $e) { error_log(...); } }`
3. Centro de Control: `lib/base.php` (`CC_PESTANAS` + `'gran' => 'Gran Producción'`), `index.php` (`require __DIR__ . '/lib/gran_produccion.php';`,
   `'gran' => cc_t_gran(),` en el `match` y `str_starts_with($accion, 'gp_') => cc_a_gran($accion, $q),`).
4. `js/chat.js` — en `abrir()`, después de la línea de la barra de AyudaAsoc:
   `if (root.GranProduccion) root.GranProduccion.franja(p, st.canal === 'asociacion' && !!(st.ctx.Api.estado || {}).asociacion);`;
   en `Chat.iniciar`: `if (root.GranProduccion) root.GranProduccion.iniciar(ctx); else root.GranProduccionCtx = ctx;`;
   al final de `Chat.refrescar()`: `if (root.GranProduccion) root.GranProduccion.refrescar();`.
5. `index.html` — después de `js/ayuda_asoc.js`: `<script defer src="js/gran_produccion.js"></script>`.
6. `sw.js` — en `SHELL`, después de `'./js/ayuda_asoc.js',`: `'./js/gran_produccion.js',` (**subir `VERSION`** al integrar).
7. `js/lang/es.js` — bloque `// gran_produccion` (claves `gp.*` y `error.gp_*`).
8. `server/tests/correr.sh` — bloque "3d": `gran_produccion:GranProduccion`.

La franja de Inicio entra sola por `window.EnVivoInicio` (`banner(ctx)`), sin tocar `js/ui.js`.

## Pruebas

- `php server/tests/pruebas_gran_produccion.php` (también la corre `bash server/tests/correr.sh`, bloque 3d)
- `node tests/test_gran_produccion.js` (capturas en `tests/capturas/gran_produccion_*.png`)
