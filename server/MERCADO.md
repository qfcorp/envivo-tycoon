# Mercado entre jugadores y equipos VIP (amplía server/API.md)

## Reglas (decididas por el dueño, 23 oct 2026)
- Solo se intercambian **equipos que viven en el servidor** (tabla `inventario`): los exclusivos y VIP canjeados
  con créditos y la cámara del paquete de inicio. Los equipos comprados con dinero del juego NO se intercambian.
- **Comisión 5 %**: el vendedor recibe `floor(precio * 0.95)`; la diferencia desaparece (no va a nadie).
- **Acceso**: solo jugadores con **al menos una compra pagada con dinero real** (`compras.estado = 'pagado'`) pueden
  publicar y comprar. Los demás ven el mercado en modo lectura con el motivo.
- **Los créditos nunca se convierten en dinero real** (no hay retiro). Está en los términos.
- **Equipos VIP**: se canjean con créditos solo con VIP activo. Después son del jugador y **funcionan siempre**, con o sin
  el Pase VIP (modo historia y en línea; decisión de Dimitry, oct. 2026). Se pueden vender en el mercado.
- Publicación: precio entero entre 10 y 100.000 créditos; máximo 10 publicaciones activas por jugador; vencen a los
  7 días y el equipo vuelve solo al dueño. El equipo publicado sale de la bodega del vendedor al instante.
- Al comprar: todo en UNA transacción (créditos del comprador, del vendedor, dueño del equipo, publicación vendida,
  movimientos en el libro). No se puede comprar lo propio. Si dos compran a la vez, solo uno gana.
- Al pasar de dueño, el equipo llega al 100 % de estado (revisado por el mercado).
- Cada equipo del inventario tiene un **número de serie** por tipo (ej. "Dron 4K #0007"), que no cambia al venderse.

## Cambios a /api/estado
Se agregan:
```json
"inventario": [ { "id": 12, "item": "dron4k", "serie": 7, "origen": "canje", "estado": "bodega" } ],
"mercado": { "puede": true, "motivo": "", "comision": 0.05 }
```
- `inventario` = equipos del jugador en el servidor con `estado` `bodega` (los publicados NO vienen aquí; vienen en
  `/api/mercado` → `mis_publicaciones`).
- En `tienda.premium` los equipos VIP traen `"vip": true` y no se pueden canjear sin VIP activo (403 con motivo).
- Las entregas de tipo `item` dejan de usarse: todo equipo (canje, paquete de inicio, VIP) se crea en `inventario`.
  Los demás tipos de entrega siguen igual.

## Nuevos productos con créditos (VIP)
| id | Qué es | Créditos | Juego |
|---|---|---|---|
| `vip_cam8k` | Cámara de cine 8K Edición VIP | 800 | cámara calidad 5 |
| `vip_switcher` | Switcher de estudio VIP | 1.000 | switcher calidad 4 |
| `vip_satelital` | Enlace satelital VIP (internet que nunca se cae) | 700 | internet calidad 3 |

Los 14 de **Edición Exclusiva** (`ex_*`, MONETIZACION.md §5) también viven en `inventario` y se publican en el mercado
(precio máximo: 3 veces su costo en créditos, `Catalogo::MERCADO_PRECIO_MAX`).

## Endpoints nuevos (todos con sesión; POST con cabecera `X-Envivo: 1`)
- `GET /api/mercado?item=<tipo opcional>&orden=precio|reciente` →
```json
{ "ok": true, "puede": true, "motivo": "", "comision": 0.05,
  "publicaciones": [ { "id": 5, "item": "dron4k", "serie": 7, "precio": 520, "vendedor": "Dimitry F.", "publicado": "ISO", "vence": "ISO", "mia": false } ],
  "mis_publicaciones": [ ... mismo formato, mia: true ... ],
  "precios": { "dron4k": { "ultimo": 500, "minimo_publicado": 480, "vendidos_7d": 3 } } }
```
  `vendedor` = nombre + inicial del apellido, nunca el correo. Máximo 100 publicaciones por página, solo activas.
- `POST /api/mercado/publicar` `{ "inventario_id": 12, "precio": 520 }` → `{ "ok": true, "publicacion": {...} }`
- `POST /api/mercado/retirar` `{ "publicacion_id": 5 }` → `{ "ok": true }` (el equipo vuelve a `inventario`)
- `POST /api/mercado/comprar` `{ "publicacion_id": 5 }` → `{ "ok": true, "creditos": 300, "item": { ...fila de inventario... } }`
  Errores claros: sin acceso, sin créditos (402), ya vendido (409), es tuyo, vencido.
- Panel admin: lista de ventas del mercado (fecha, equipo, serie, vendedor, comprador, precio, comisión) y totales
  de créditos quemados por comisión.

## Cómo lo usa el juego
El juego reconcilia la bodega con `inventario`: cada equipo del servidor está en la partida con `srvId` = id del
inventario. Si un `srvId` ya no está en `inventario` (lo publicaste o lo vendiste) se quita de la partida; si hay un
equipo nuevo en `inventario` se agrega al 100 %.
