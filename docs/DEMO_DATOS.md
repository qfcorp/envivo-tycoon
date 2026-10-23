# Datos de demostración (mundo "vivo" para la demo)

Este comando llena el servidor del juego con **productoras de mentira** para que la demo se vea con vida:
24 productoras repartidas en los 3 servidores (12 en Quito, 8 en Guayaquil, 4 en Cuenca), 7 asociaciones con
presidente y siglas, mensajes en el chat, 8 equipos a la venta en el mercado, avance en la Liga Semanal, ranking de
Duelos y puntos de preparación en la Copa de Servidores (el servidor chico queda cerca, no perdido).

> ⚠️ **IMPORTANTE: BORRA los datos demo antes del lanzamiento real** (paso 3).
> Y si la demo dura varios días, bórralos **antes del sábado 00:00** (hora de Ecuador): ese día se juega la Copa,
> el lunes se cierra la Liga y a fin de mes los Duelos. No queremos que productoras de mentira ganen premios ni le
> quiten puestos a jugadores reales.

Las cuentas demo:
- tienen correos `@demo.envivo.local` (no existen) y **nadie puede entrar con ellas** (clave inservible);
- **no compraron nada**: sus créditos son un ajuste manual que queda en la auditoría como `demo_datos`;
- quedan anotadas en una tabla `demo_marcas`, así el borrado sabe exactamente qué quitar.

Todos los comandos se pegan en el VPS (PuTTY), **una línea a la vez**.

---

## Paso 0 · (Opcional) Respaldo de la base antes de empezar

```
sudo -u www-data sqlite3 /var/lib/envivo/envivo.sqlite ".backup /var/lib/envivo/antes-de-demo.sqlite"
```

Si dice `command not found`, sáltalo (no es obligatorio).

## Paso 1 · Crear los datos demo

```
sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/demo_datos.php --crear
```

- Tarda unos 15 segundos.
- Al final sale un resumen: `productoras +24`, `asociaciones +7`, `chat +21`, `publicaciones +8`, etc.
  y la lista por servidor (`Servidor 1 · Quito 12 productoras demo`…).
- Si lo corres **otra vez**, no duplica nada (sale todo en `+0`). Sirve, por ejemplo, para cargar los puntos de la
  Copa si el primer día la copa todavía no estaba abierta.
- Líneas con `·` son avisos (por ejemplo, "la copa está en fase batalla: solo se cargan puntos de lunes a viernes").
  No son errores.

Mándame captura del resumen.

## Paso 2 · Revisar qué hay (cuando quieras)

```
sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/demo_datos.php --estado
```

Muestra cuántas productoras demo hay por servidor, asociaciones, mensajes, publicaciones, puntos de liga y de copa.
Si dice `asociaciones 7 (… miembros, 1 reales)` es que un jugador real entró a una asociación demo (está bien).

En el juego (con una cuenta):
- botón rojo redondo de abajo a la derecha → **chat** con mensajes. La pestaña **Servidor** muestra solo los de TU
  servidor: una cuenta nueva puede caer en Guayaquil o Cuenca, que tienen menos mensajes que Quito (es normal);
- **En línea** → **Liga** → **Buscar asociación**: las asociaciones de muestra para unirse (y luego jugar un encargo);
- **En línea** → **Copa de Servidores**: el marcador con puntos de preparación (por ejemplo `S3 Cuenca 1.040 VS S1 Quito 1.340`);
- **Tienda** → **Mercado**: equipos a la venta.

## Paso 3 · Borrar TODO lo demo (después de la demo)

```
sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/demo_datos.php --borrar
```

- Borra todo lo demo en **una sola operación** (o se borra todo, o no se borra nada).
- Al final debe decir:
  - `revisión de llaves (foreign_key_check): ok`
  - `integridad de la base (integrity_check): ok`
- Luego confirma con el Paso 2: debe decir **`No hay datos demo en esta base.`**

Mándame captura de las dos cosas.

### Qué pasa con los jugadores REALES al borrar

- **Nunca** se tocan sus cuentas, créditos, compras, inventario ni su libro de créditos.
- Si un jugador real **compró** un equipo demo en el mercado: se queda con el equipo (lo pagó con sus créditos).
- Si un jugador real **entró** a una asociación demo: la asociación **se queda** para él (pasa a ser presidente) y
  solo salen las productoras demo. Si no entró nadie real, la asociación se borra.
- Se borran los mensajes de las demo en el chat, los reportes o bloqueos que alguien hizo contra ellas y su lugar en
  rankings (liga, duelos, copa). La preparación de la Copa de cada servidor se vuelve a sumar sin los puntos demo.

---

## Si algo sale mal

| Mensaje | Qué hacer |
|---|---|
| `ERROR: no lo corras como root` | Te faltó `sudo -u www-data` al inicio. Cópialo completo otra vez. |
| `ERROR: no existe la carpeta de la base` | Falta `ENVIVO_CONFIG=/etc/envivo/config.env` o el juego no está instalado. |
| `No such file` / `Could not open input file` | Primero actualiza el juego (Paso 9 de `docs/PASOS_DEMO_VPS.md`). |
| `ERROR: … (no se guardó nada de este paso)` | No se cambió nada. Mándame la captura del mensaje. |

## Para el técnico (detalles)

- Script: `server/bin/demo_datos.php` (`--crear`, `--estado`, `--borrar`). Pruebas: `php server/tests/pruebas_demo_datos.php`
  (base temporal con todas las migraciones, 2 jugadores reales con compra; revisa que `--crear` dos veces no duplica,
  que `--borrar` no toca nada real, que no queda ninguna fila apuntando a ids demo, `foreign_key_check`,
  `integrity_check` y `/api/estado` de un jugador real).
- Marca doble: tabla `demo_marcas(tabla, id, extra, creado)` **y** correo `@demo.envivo.local`; solo se borra lo que
  tiene las dos. `--borrar` elimina también la tabla `demo_marcas`.
- Se usa el código del juego: `Cuentas::registrar`, `Social::guardarPerfil / crear / unirse / solicitud / cargo`,
  `Chat::prepararTexto` (filtro), `Monedero::ajusteManual` (auditoría `demo_datos`) + `Monedero::gastar` (inventario
  con número de serie), `Liga::asegurarSemana / inscribir`, `Copas::asegurarCopa / registrarEquipo`, `Universos::preparar / marcarActivo`.
  Directo en la base (a propósito): la fama pública (el tope de +15 por día es contra trampas), los mensajes con horas
  escalonadas, las publicaciones del mercado (mismas sentencias que `Mercado::publicar`; el mercado exige una compra
  real y las demo no compran), el avance del tablero de liga, las filas del ranking de duelos (sin equipo de duelo, así
  nadie real puede retar a una demo) y los aportes de la copa (`fuente = 'demo'`, `ref = 'demo:copa:…'`).
- Quedan después de borrar (son del funcionamiento normal, no datos demo): la fila de la semana de liga, la copa de la
  semana con sus servidores (en 0 si nadie real aportó), los servidores 2 y 3 del universo (los crea `Universos::preparar`
  igual que la API) y una línea `demo_borrado` en la auditoría. Si la tarea diaria de salud de servidores corrió durante
  la demo, sus resúmenes de ese día cuentan a las demo como activas (no se puede separar).
- Los créditos demo cuentan en el tope diario de créditos a mano del Centro de Control (unos 4.300 de 20.000).
