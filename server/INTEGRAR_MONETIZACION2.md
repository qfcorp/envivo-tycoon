# Integrar Impulsos (monetización 2): equipo de obra extra, Fondo de crecimiento, Tarjeta semanal

Los "más vendidos" de Kingshot adaptados a EN VIVO Tycoon, con las reglas de `server/MONETIZACION.md`: contenido fijo y a
la vista (nada al azar), los créditos nunca se cambian por dinero, lo pagado que da poder también se consigue gratis (más
lento) y el techo de competencia (`Ventajas::TOPE`) no cambia: la sede solo aporta su bono por nivel (hasta +6), igual que hoy.

## Archivos nuevos (solo de este módulo)

| Archivo | Qué es |
|---|---|
| `server/src/Impulsos.php` | Reglas, entrega (gancho + conciliación), reembolsos, vista |
| `server/src/ImpulsosApi.php` | Rutas `/api/impulsos*` |
| `server/src/migraciones/impulsos.sql` | Tablas `impulsos_*` (se aplica sola, se puede repetir) |
| `server/tests/pruebas_impulsos.php` | Pruebas del servidor (base temporal, reloj congelado, HTTP con copia de api.php) |
| `js/impulsos.js` | Tarjetas de la Tienda, botón junto a la cola de obras, tarjeta de Inicio, textos en 10 idiomas |
| `tests/test_impulsos.js` | Playwright (servidor imitado), capturas `tests/capturas/impulsos_*.png` |
| `docs/traducciones/errores_nuevos/monetizacion2.json` | Textos de los códigos de error nuevos (10 idiomas) |

## Productos (Catalogo.php, precios por defecto; se cambian en el Centro de Control › Productos)

| id (web = Google Play) | Precio | Tipo | Una sola vez | Google Play |
|---|---|---|---|---|
| `equipo_obra_2` | $2.99 | `equipo_obra` | Sí | Producto administrado, **no consumible** (acknowledge) |
| `fondo_crecimiento` | $19.99 | `fondo` | Sí | Producto administrado, **no consumible** (acknowledge) |
| `tarjeta_semanal` | $1.99 | `tarjeta_semanal` | No | Producto administrado **consumible** (consume) |

`Google.php` ya decide consume/acknowledge por `una_vez`; no hay que tocarlo. Hay que crear los 3 ids en Play Console.

### 1. Equipo de obra extra (permanente) — `equipo_obra_2`

- Equipos de obra de la Sede oficial (`SedeOficial::obreros`): **(1, o 2 desde el nivel 5 o con VIP 4 — como hoy, no se
  suman entre sí) + 1 de Impulsos, máximo 3.** Decisión: la compra siempre es "+1 para siempre"; antes del nivel 5 y sin VIP
  es tu segundo equipo, después es el tercero. El VIP no se cambia (su `slots_obra` sigue igual).
- Camino gratis: **alquilarlo 2 días con dinero del juego** ($1.500 + $500 × nivel de la sede oficial), una vez por semana
  (2 días puesto + 5 de espera). El dinero del juego vive en la partida (el servidor no lo ve): el juego lo descuenta cuando
  `POST /api/impulsos/alquilar` responde ok. Como la espera la pone el servidor, quien hiciera trampa con el dinero no
  consigue más que quien paga en el juego.
- Premios de misiones/eventos (para otros módulos): `Impulsos::darHoras($jugador, $horas, $ref)` — +1 equipo por $horas, una
  vez por `$ref`, sin espera (si ya hay uno puesto, se alarga).
- Reembolso: deja de contar (las obras ya empezadas siguen; solo no se puede empezar otra hasta que haya un equipo libre).

### 2. Fondo de crecimiento — `fondo_crecimiento`

Premios FIJOS al llegar a cada nivel de la sede oficial (`Impulsos::HITOS`; la tabla se ve antes de comprar). Total
10.000 créditos + 1.430 materiales comunes + 27 chips 4K (≈ 5 veces su valor: 10.000 créditos ≈ $62 en paquetes de créditos y
los materiales ≈ 4 Packs de obra L). Se reclaman uno a uno o todos; los niveles que ya tenías al comprarlo se reclaman al momento.

| Nivel | 5 | 8 | 10 | 12 | 15 | 18 | 20 | 25 | 30 |
|---|---|---|---|---|---|---|---|---|---|
| Créditos | 500 | 700 | 800 | 900 | 1.000 | 1.200 | 1.300 | 1.500 | 2.100 |
| Cada material común | 10 | 16 | 20 | 24 | 30 | 36 | 40 | 50 | 60 |
| Chips 4K | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 5 | 6 |

Reembolso: se quitan los créditos reclamados (si ya los gastó quedan como deuda, igual que `Compras::revertir`) y los
materiales que le queden (lo gastado queda en el libro); no se puede reclamar más.

### 3. Tarjeta semanal — `tarjeta_semanal`

Mismo mecanismo que la tarjeta mensual (días que se suman si compras otra, un reclamo por día de Guayaquil, no se renueva sola,
el reembolso quita sus días), pero en su propia tabla (`impulsos_tarjeta`), porque la mensual da 20 créditos/día y la semanal
15 créditos + 3 de cada material común por día. `tarjeta_hasta` y `/api/tarjeta/reclamar` de la mensual no se tocan.

## Ya aplicado en este cambio (ediciones mínimas en archivos compartidos)

1. `server/src/Catalogo.php`: las 3 filas en `PRODUCTOS` (después de `pase_copa`), con `'modulo' => 'Impulsos'`.
2. `server/src/SedeOficial.php`: `obreros()` suma `Impulsos::obrerosExtra($j)` (con `class_exists`, tope 3) y método nuevo
   `SedeOficial::sumarDesdeModulo($j, $bolsa, $motivo, $ref, $hastaCero = false)` (materiales desde otro módulo, con libro).
3. `server/public/api.php`, antes de la línea de la Liga:
   ```php
       // Impulsos: equipo de obra extra, Fondo de crecimiento y Tarjeta semanal (server/INTEGRAR_MONETIZACION2.md): /api/impulsos*
       if (class_exists(\EnVivo\ImpulsosApi::class) && \EnVivo\ImpulsosApi::esRuta($ruta)) \EnVivo\ImpulsosApi::responder($ruta, $metodo, requiere_sesion());
   ```
4. `js/ui.js`: función `seccionImpulsos(log, lista)` antes de `renderTienda`, `...seccionImpulsos(log, lista),` en la lista de
   secciones (después de `tv-obra`) y en `trasCompra()` la línea que invalida y recarga `window.Impulsos`.
5. `js/sede.js` (`modalOficial`): `colaExtra` = `root.Impulsos.avisoCola(sd)` entre las obras en curso y la lista de mejoras.
6. `index.html`: `<script defer src="js/impulsos.js"></script>` después de `js/estrellas.js`.
7. `sw.js`: `'./js/impulsos.js'` en la lista (después de `estrellas.js`). **El integrador sube `VERSION`** (no se tocó para no chocar).

## Pendiente para el integrador

- `server/src/arranque.php`, junto a los demás módulos (sin esta línea igual funciona: la conciliación entrega y revierte al
  abrir `/api/impulsos`, pero con ella la entrega es inmediata):
  ```php
  $registrar(Impulsos::class);      // \EnVivo\Impulsos::registrar(); equipo de obra extra, fondo, tarjeta semanal — INTEGRAR_MONETIZACION2.md
  ```
- `server/tests/correr.sh`, sección 3d: agregar `impulsos:Impulsos` a `for par in vip:Vip sede_oficial:SedeOficial pase:Pase estrellas:Estrellas`.
- `docs/traducciones/errores.json`: copiar los códigos de `docs/traducciones/errores_nuevos/monetizacion2.json` (y a `js/lang/*`
  como `error.<codigo>` si se quiere; `js/impulsos.js` ya trae sus propios textos para esos códigos).
- `server/GOOGLE_PLAY.md`: filas de la tabla de productos (ya agregadas en este cambio).
- Centro de Control: nada que hacer (los productos salen solos en Productos; `tarjeta_dias` solo muestra la mensual).

## API

| Ruta | Cuerpo | Respuesta / errores |
|---|---|---|
| `GET /api/impulsos` | — | `{ok, ahora, dia, sede_nivel, obreros, obreros_max, equipo:{producto, permanente, extra, alquiler:{activo, hasta, origen, horas, precio, espera_hasta, puede, ultimo_precio}}, fondo:{producto, comprado, hitos:[{nivel, creditos, mat, alcanzado, reclamado}], por_reclamar, total_creditos}, tarjeta:{producto, activa, hasta, dias_restantes, reclamada_hoy, creditos_dia, mat_dia, dias, proximo}, productos, creditos}` |
| `POST /api/impulsos/alquilar` | `{confirmar_precio}` | `{alquilado, precio, …vista}` · 400 `confirmar_precio` {precio} · 409 `precio_cambio` {precio} / `equipo_ya_tienes` / `equipo_alquilado` {hasta} / `equipo_espera` {disponible} |
| `POST /api/impulsos/fondo` | `{nivel?}` | `{recibido:{niveles, creditos, mat}, …vista}` · 403 `fondo_requerido` · 400 `hito_invalido` · 409 `fondo_nivel_bajo` / `fondo_ya` / `fondo_nada` |
| `POST /api/impulsos/tarjeta` | — | `{recibido:{creditos, mat}, …vista}` · 403 `tarjeta_semanal_requerida` · 409 `ya_reclamado` {proximo} |

Todas con sesión; POST con `X-Envivo: 1`; límite 60 acciones / 10 min. Cuenta suspendida/baneada: `Cuentas::exigirActiva`.
Libros: créditos con motivos `fondo_crecimiento`, `tarjeta_semanal` y `reversion`; sede con `fondo`, `tarjeta_semanal`, `fondo_revertido`.

## Pruebas

- `php server/tests/pruebas_impulsos.php` (81 casos).
- `NODE_PATH=/opt/npm-tools/node_modules node tests/test_impulsos.js` (64 casos; capturas `tests/capturas/impulsos_*.png`).
