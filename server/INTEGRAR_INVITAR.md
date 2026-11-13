# Invita a tu equipo y Productores Aliados

Ideas 5 y 8 de las propuestas del 13-nov-2026 (rama `invitar-creadores`). Todo es del juego: **los créditos nunca se convierten en dinero**. El pago a los creadores es aparte, en dinero, como publicidad; el sistema solo lo calcula y deja anotar "pagado".

## Archivos

| Qué | Dónde |
|---|---|
| Invitaciones (amigos, etapas, metas, distintivos) | `server/src/Invitaciones.php` |
| Creadores (códigos, regalo, insignia, créditos del mes, ventas, pagos, postulaciones) | `server/src/Aliados.php` |
| Rutas `/api/invitar*`, `/api/aliados/*` | `server/src/InvitarApi.php` |
| Tablas | `server/src/migraciones/invitar_creadores.sql` |
| Centro de Control → «Invitar y aliados» (`?t=aliados`) | `server/public/control/lib/invitar.php` |
| Página pública | `server/public/aliados.html` + `js/aliados_web.js` |
| Juego | `js/invitar.js` (textos `inv.*` en `js/lang/es.js`) |
| Pruebas | `server/tests/pruebas_invitar.php`, `tests/test_invitar.js` |

## Ganchos (una línea cada uno)

- `server/public/api.php`: la ruta (después de la revisión de `X-Envivo`) y, en `api_registro`, `Invitaciones::alRegistrar($id, $in)` (nunca falla: la cuenta ya existe).
- `server/src/Buzon.php` (`canjear`): si el código es de un creador activo → `Aliados::canjearCodigo`.
- `server/src/Visitas.php` (`armar`): `distintivos` (Productor Aliado y letrero dorado) en la vitrina.
- `js/chat.js` (`abrir`): `Invitar.enAsociacion(panel, visible)` → botón «Invitar» en la pestaña Asociación.
- `js/visitas.js`: `Invitar.distintivosHtml(v)` en las etiquetas y `Invitar.letrero(v)` sobre la sede.
- `index.html`, `sw.js` (SHELL y `aliados.html` fuera del service worker), `server/tests/router.php`, `server/deploy/nginx-sitio.sh` (`/aliados.html`), `control/index.php` y `control/lib/base.php` (pestaña).

## Invita a tu equipo

- Código de cada cuenta: `p` + id en base 36 (el mismo que ya arma `js/compartir.js`). El amigo abre `https://juego.tukanec.com/?ref=p1z`; `compartir.js` lo guarda y `js/invitar.js` lo manda en `POST /api/registro` (`ref`, `creador`, `instalacion`). Si se perdió, `POST /api/invitar/vincular` hasta 3 días después de crear la cuenta.
- **Amigo**: pack de bienvenida al buzón (3 cables, 3 baterías, $1.000 del juego). Uno por aparato y como mucho 3 por conexión cada 30 días.
- **Quien invita** (al buzón, cuando el amigo AVANZA, nunca por instalar): capítulo 2 → $1.500 + 2 cables; 3 días distintos jugados → 10 créditos; entra a una asociación → $1.000 + 2 baterías. Premios por etapa para los primeros 30 amigos.
- **Amigo activo** = capítulo 2 y 3 días. Metas: 1 → 20 créditos + $2.000; 3 → 40 créditos + reparar todo; 5 → 60 créditos + $5.000; 10 → 100 créditos + **letrero dorado** (distintivo exclusivo en la vitrina).
- **Antifraude**: no a uno mismo; el invitador debe ser una cuenta más vieja; mismo aparato que el invitador (analítica, Black Friday, sus propios registros) = no cuenta; un aparato que ya usó otra cuenta = no cuenta; más de 2 invitados desde la misma conexión = no cuentan. Nunca hay premios por calificar o reseñar.
- Se evalúa al pedir `GET /api/invitar` (el invitador o el invitado), sin tareas programadas. Se apaga en el panel (ajuste `inv_activa`).
- Lo que sabe el servidor del avance: `partidas.datos.chapter` (partida en la nube), días en `actividad` / `actividad_diaria` y `asociacion_miembros`.

## Productores Aliados

- Códigos creados en el panel: código (`PRODUCTOR-JUAN`, se guarda también normalizado `PRODUCTORJUAN`), nombre, redes, nivel 1–5, cuenta del creador (N° o correo), % propio y créditos al mes (vacío = por defecto). No puede chocar con un código del buzón, la palabra de Black Friday ni parecer un código de jugador (`P` + hasta 6 letras/números).
- Se usa en «Canjear código» (juego y `canjear.html`), al crear la cuenta (campo «Código de creador») o con el enlace `?ref=PRODUCTOR-JUAN`. Uno por cuenta; un creador no usa el suyo. Regalo pequeño (no descuento): $2.000 del juego + 2 cables + 2 baterías; uno por aparato y 5 por conexión al día (sin regalo igual queda asociado).
- Creador: insignia «Productor Aliado» en su vitrina y créditos del mes en su buzón (nivel 1: 100, 2: 200, 3: 350, 4: 500, 5: 800; máx. 5.000), la primera vez que abre el juego cada mes. En el juego ve su código y cuántos jugadores lo usaron (sin montos de dinero).
- Panel: por creador, jugadores, compradores, compras pagadas **después** de usar el código (Plux / PayPal / Google, USD con impuestos; las revertidas no cuentan), por mes, × % (10 % por defecto, ajuste `aliados_pct`). «Marcar pagado» solo en meses cerrados; guarda lo calculado en ese momento (`aliados_pagos`) y no toca nada del juego.
- `/aliados.html`: explica el programa (sin marcas, sin datos privados) y la postulación llega a `aliados_postulaciones` (panel) y por correo a `SOPORTE_CORREO`.

## API

```
GET  /api/invitar             (sesión)  { codigo, enlace, amigos[], total, activos, tope, metas[], etapas[], bienvenida[], mi_invitacion,
                                          puede_vincular, distintivos[], asociacion, creador, aliado }
POST /api/invitar/vincular    (sesión)  { ref, instalacion? } → { ok, invitador, estado, motivo, bienvenida, estado_invitar }
POST /api/aliados/codigo      (sesión)  { codigo, instalacion? } → lo mismo que /api/buzon/canjear + aliado
POST /api/aliados/postular    (sin sesión, X-Envivo) { nombre, correo, redes, pais?, mensaje? }
```
Errores nuevos (`codigo`): `invitacion_*`, `aliado_*`, `postulacion_no_existe` (en `docs/traducciones/errores.json`).
