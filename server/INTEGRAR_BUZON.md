# Integrar el Buzón y los códigos de regalo

Módulo: `server/src/Buzon.php`, `server/src/BuzonApi.php`, `server/src/migraciones/buzon.sql`,
`server/public/control/lib/buzon.php` (pestaña «Buzón y códigos»), `server/public/canjear.html`, `js/buzon.js`, `js/canjear.js`.
Pruebas: `php server/tests/pruebas_buzon.php` (107) y `NODE_PATH=/opt/npm-tools/node_modules node tests/test_buzon.js`
(servidor real con base temporal; capturas `tests/capturas/buzon_*.png`). Errores nuevos: `docs/traducciones/errores_nuevos/buzon.json`.

Las tablas (`buzon`, `buzon_envios`, `buzon_codigos`, `buzon_canjes`, `buzon_borradores`) las crea sola `Db::migrarModulos`
(y `Buzon::preparar()` por si acaso).

## Cómo funciona

- **Mensajes** por jugador: remitente (por defecto «EN VIVO Tycoon»), tipo (aviso, compensación, evento, regalo, código,
  sistema), título, texto (se muestra tal cual, escapado), hasta 8 premios, estados `sin_leer` → `leido` → `reclamado`,
  vencimiento (30 días por defecto, máximo 365). Los vencidos sin reclamar ya no se ven; se borran 30 días después.
- **Premios** (se entregan al RECLAMAR, dentro de una transacción; reclamar es idempotente, probado con 4 procesos a la vez):
  `creditos` → `Monedero::mover(…, 'buzon', 'buzon:<id>')` (tope 5.000 por premio), `item` (equipo de `Catalogo::EQUIPOS`) →
  `Inventario::crear(…, 'buzon', 'buzon:<id>')`, y `dinero`, `consumible` (cable/battery), `refuerzo` (los de `Catalogo::PREMIUM`),
  `personal` (cantidad = habilidad), `reparar_todo` → entregas normales (`origen` = `buzon:<id>`), que el juego ya aplica.
- **Para otros módulos** (compensaciones automáticas, avisos del sistema): `Buzon::enviar($jugador, $titulo, $texto, $premios,
  ['tipo' => 'compensacion', 'ref' => 'algo:unico', 'dias' => 30])` — con `ref` no se duplica nunca. Seguro dentro de otra transacción.
- **Difusiones** (Centro de Control): a todos, a un servidor, a un universo, o filtros (registrados entre fechas, activos en N
  días por `ultimo_ingreso`, solo compradores, solo VIP) o una lista de ids/correos (compensaciones). Nunca a cuentas borradas
  ni bloqueadas. Vista previa (cuántos lo reciben y créditos totales) → casilla + diálogo de confirmación → envío (cada
  borrador se envía una sola vez; si la cantidad cambió mucho desde la vista previa, pide revisar). Opción «también a los
  que entren después» (se copia al abrir su buzón, hasta que vence). **Retirar** quita el envío de los buzones donde no se reclamó.
- **Códigos de regalo**: premios fijos, usos máximos en total (0 = sin límite), SIEMPRE uno por cuenta, fechas desde/hasta,
  etiqueta (influencer/campaña) y activo/desactivado. **Lote** para influencers: N códigos únicos `PREFIJO + 8` (alfabeto sin
  0/O/1/I/L, 31^8 combinaciones), de 1 uso cada uno, y una cuenta solo puede canjear UNO del lote; CSV del lote en el panel.
  El premio llega al buzón (mensaje tipo `codigo`). **Fuerza bruta**: 8 códigos equivocados por cuenta y 30 por conexión
  cada 10 minutos (tabla `intentos`, anotados fuera de la transacción) → 429 `limite_intentos`.
- **Estadísticas** por etiqueta: códigos, canjes, jugadores únicos, canjes desde la web, cuántos compraron con dinero real
  DESPUÉS de su primer canje, cuántas compras y cuánto pagaron (compras `pagado`).
- **Web** `/canjear.html`: se entra con la MISMA cuenta del juego (`/api/entrar`, con sus límites) y se canjea
  (`canal: 'web'`). `?codigo=XYZ` deja el código escrito (enlace para influencers). Sin datos de pago. Textos de `js/buzon.js`.
- **Juego**: sobre ✉ con número (sin leer + regalos por reclamar) en el encabezado, antes del botón de sonido; solo con
  cuenta; lo pone `js/buzon.js` solo (nada que tocar en el HTML del encabezado). A ≤430 px con el sobre visible el título baja
  a 18 px y los botones a 32 px (16 px/30 px a ≤380 px) para que todo quede en una línea (probado a 360/390 px, con VIP y en
  escritorio). Fila «Buzón» en Inicio cuando hay regalos. Botón «Canjear código» en Tienda → Cuenta y en el buzón.

## Cambios en archivos compartidos (ya hechos en esta rama; todos de 1–3 líneas ancladas)

| Archivo | Cambio |
|---|---|
| `server/public/api.php` | antes de `// Copa de Servidores …`: `if (class_exists(\EnVivo\BuzonApi::class) && \EnVivo\BuzonApi::esRuta($ruta)) \EnVivo\BuzonApi::responder($ruta, $metodo, requiere_sesion());` |
| `server/public/control/index.php` | `require __DIR__ . '/lib/buzon.php';` después del `foreach (… ) require`; `'buzon' => cc_t_buzon(),` en el match de pestañas; `str_starts_with($accion, 'buzon_') => cc_a_buzon($accion, $q),` en `cc_post_accion` |
| `server/public/control/lib/base.php` | `'buzon' => 'Buzón y códigos',` en `CC_PESTANAS` |
| `server/deploy/nginx-sitio.sh` | `location = /canjear.html { root $PUB; add_header Cache-Control "no-cache"; $(cab_juego) }` (CSP del juego: solo scripts propios; usa `/js/buzon.js` y `/js/canjear.js`, que ya sirve la regla de `/js/`) |
| `server/tests/router.php` | `if ($ruta === '/canjear.html') { $csp('juego'); return $enviar($pub . $ruta); }` |
| `server/tests/correr.sh` | `buzon` al final de la lista de suites de la sección 3c |
| `index.html` | `<script defer src="js/buzon.js"></script>` después de `js/googleplay.js` |
| `sw.js` | `'./js/buzon.js'` en `SHELL` y `canjear\.html` en la lista que siempre va a la red (VERSION sin cambiar: súbela al integrar) |
| `js/ui.js` | (1) Tienda → Cuenta: `${window.Buzon && window.Buzon.botonCanjear ? window.Buzon.botonCanjear() : ''}` antes del botón «Cerrar sesión»; (2) en `plegablesInicio`: `const info = PL_INFO[id] \|\| [(o && o.icono) \|\| 'box', ''];` y `fila(m.id, h, typeof m.fila === 'function' ? m.fila(ctx) : undefined);` (un módulo de Inicio puede dar `{titulo, icono, abierta, tono, resumen}` para su fila; los demás siguen igual) |

## Opcional para el coordinador

- `docs/traducciones/errores_nuevos/buzon.json` → sumarlo a `errores.json` / `js/lang/*.js` (`error.<codigo>`).
- `Cuentas::borrar`: agregar `'buzon'` y `'buzon_canjes'` a la lista de tablas que se borran por `jugador_id` (hoy quedan
  sin datos personales; el jugador está anonimizado).
- `server/tests/correr.sh` → tabla `buzon` en la lista «Tablas del servidor creadas» si se quiere revisar.

## API (todas con sesión; POST con `X-Envivo: 1`; límite 120 POST/10 min por cuenta)

- `GET /api/buzon` → `{ok, mensajes:[{id, tipo, remitente, titulo, cuerpo, adjuntos:[{tipo, item, cantidad, nombre}], estado,
  reclamable, creado, expira, vence_seg, reclamado}], sin_leer, por_reclamar}` (máx. 100; primero los no reclamados).
- `GET /api/buzon/resumen` → `{ok, sin_leer, por_reclamar}`.
- `POST /api/buzon/leer {id}` → `{ok, mensaje, sin_leer, por_reclamar}`.
- `POST /api/buzon/reclamar {id}` → `{ok, ya_reclamado, entregas, equipos, creditos_recibidos, creditos, mensaje, inventario?, …}`.
  Ya reclamado → 200 con `ya_reclamado: true`. Errores: `mensaje_no_existe` 404, `sin_regalo` 409, `mensaje_vencido` 410, `cuenta_*` 403.
- `POST /api/buzon/reclamar_todo` → `{ok, reclamados:[ids], entregas, equipos, creditos_recibidos, creditos, …}`.
- `POST /api/buzon/borrar {id}` → `{ok, borrado}`; con regalo sin reclamar → 409 `mensaje_con_regalo`.
- `POST /api/buzon/canjear {codigo, canal?: 'web'}` → `{ok, codigo, mensaje, sin_leer, por_reclamar}`. Errores:
  `codigo_invalido` 404, `codigo_ya_usado` 409, `codigo_lote_usado` 409, `codigo_agotado` 409, `codigo_pronto` 409 (`fecha`),
  `codigo_vencido` 410, `limite_intentos` 429, `falta_codigo` 400.
