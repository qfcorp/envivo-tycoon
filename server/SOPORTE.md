# Soporte dentro del juego (amplía server/API.md)

Todo con sesión (salvo `GET /api/soporte/contacto`); POST con cabecera `X-Envivo: 1`.

## Casos (tickets)
- Tablas `soporte_casos` (id, jugador_id, categoria 'pago'|'cuenta'|'error'|'sugerencia'|'reporte'|'otro', asunto ≤ 80,
  estado 'abierto'|'respondido'|'cerrado', compra_id NULL, diagnostico_json, creado, actualizado) y
  `soporte_mensajes` (id, caso_id, autor 'jugador'|'soporte', texto ≤ 2000, creado, leido).
- `GET /api/soporte` → `{ ok, casos: [ { id, categoria, asunto, estado, compra_id, creado, actualizado, sin_leer,
  mensajes: [ { autor, texto, creado } ] } ] }` (los del jugador, más recientes primero).
- `POST /api/soporte` `{ categoria, asunto, mensaje, compra_id?, diagnostico? }` → `{ ok, caso }`.
  `compra_id` debe ser del jugador. `diagnostico` = objeto pequeño que manda el juego (versión, día, capítulo, dinero,
  idioma, navegador, tamaño de pantalla); máx. 4 KB, sin datos sensibles. Límite: 5 casos abiertos y 10 mensajes por hora.
- `POST /api/soporte/responder` `{ caso_id, mensaje }` → reabre si estaba respondido.
- `POST /api/soporte/leido` `{ caso_id }`.
- `/api/estado` agrega `soporte_sin_leer` (número de respuestas de soporte no leídas) y `compras_recientes` (las últimas 10 compras del jugador: `{ id, producto, total, estado, creado }`) para elegir la compra en el formulario.
- `GET /api/soporte/contacto` (público) → `{ whatsapp, correo, horario }` desde la configuración
  (`SOPORTE_WHATSAPP`, `SOPORTE_CORREO`, `SOPORTE_HORARIO` en /etc/envivo/config.env; vacíos si no están).

## Centro de Control
- Bandeja de casos por estado y categoría, con el jugador, su última compra y el diagnóstico.
- Responder (con respuestas rápidas editables), cerrar, reabrir; enlace directo a la ficha del jugador y a la compra.
- Contador de casos abiertos en el resumen. Todo queda en la auditoría.
