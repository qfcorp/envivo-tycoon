# Integrar las Visitas a otras productoras — líneas exactas

Módulo: `server/src/Visitas.php` (vitrina, privacidad, aplausos), `server/src/VisitasApi.php` (rutas `/api/visitas/*`),
`server/src/migraciones/visitas.sql` (tablas, se aplica sola con `Db::migrarModulos`), `js/visitas.js` (pantalla "Visitar",
tarjeta de Inicio, botón `Visitas.boton(id)`, interruptor de privacidad `Visitas.ajusteCuenta()`).
Códigos de error nuevos: `docs/traducciones/errores_nuevos/visitas.json` (10 idiomas, mismo formato que `errores.json`).
Pruebas: `php server/tests/pruebas_visitas.php` y `NODE_PATH=/opt/npm-tools/node_modules node tests/test_visitas.js`
(capturas en `tests/capturas/visitas_*.png`). **Ningún archivo compartido se editó**: estas son las líneas que faltan.

## Qué hace

- **Vitrina pública** de cada jugador, armada con su partida en la nube (`partidas.datos`, lista BLANCA de claves revisadas)
  + datos del servidor: alias público (`Social::nombrePublico`, igual que en el chat), nombre de la productora (`s.productora`,
  sin groserías ni contactos), asociación, etapa del local (garaje/oficina/estudio/centro, misma regla que `Game.venue`),
  nivel de la Sede oficial, decoración (`s.decor.items`), cosméticos de temporada, flota, equipos que se dibujan,
  trofeos (Copa campeón/subcampeón/top 10, Duelos top 10, fechas especiales, historia completa), mejores 3 eventos
  (`stats.best` + `stats.good`), números, personal destacado y personal estrella vigente. **Nunca**: correo, nombre de la
  cuenta, compras, créditos, dinero del juego, contratos, registro, entregas. Cache en `visitas_vitrinas` (5 min o hasta
  que cambie `partidas.actualizado`).
- **Privacidad**: `visitas_ajustes.permitir` (por defecto sí). Con visitas apagadas: 403 `visitas_cerradas` y no sale en sugeridas.
- **Aplauso 👏**: 1 por visitante, productora y día (Ecuador). $50 del juego a cada lado como entrega `dinero`
  (`Monedero::entregar`, la recoge `/api/estado`), con tope de 10 premios por día al dar y 10 al recibir. Cuenta suspendida no aplaude.
- **Enviar mensaje**: el botón sale solo si el chat tiene mensajes privados (`window.Chat.abrirPrivado(id, alias)` o `Chat.abrirDM`). Hoy no hay: no sale.

API (todas con sesión; POST con `X-Envivo: 1`):

| Ruta | Respuesta |
|---|---|
| `GET /api/visitas/vitrina?jugador_id=N` | `{ok, propio, vitrina:{…}, aplausos:{total, hoy, ya_hoy}, puede_aplaudir, premio:{dinero, tope_dia}}` · 403 `visitas_cerradas` · 404 `productora_no_existe` |
| `POST /api/visitas/aplaudir {jugador_id}` | `{ok, aplausos, puede_aplaudir:false, premio:{dinero, tope_alcanzado, para_visitado}, entregas:[…]}` · 409 `aplauso_ya` · 400 `aplauso_propio` |
| `GET /api/visitas/sugeridas` | `{ok, productoras:[{jugador_id, alias, fama, siglas, aplausos}], permitir, mis_aplausos}` (tu servidor, las más activas) |
| `GET /api/visitas/ajustes` · `POST {permitir}` | `{ok, permitir, aplausos}` · 400 `falta_permitir` |

## 1. `server/public/api.php` (rutas)

Justo **antes** de la línea `    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina`:

```php
    // Visitas a otras productoras (server/INTEGRAR_VISITAS.md): /api/visitas/*
    if (\EnVivo\VisitasApi::esRuta($ruta)) \EnVivo\VisitasApi::responder($ruta, $metodo, requiere_sesion());
```

(La prueba PHP copia `api.php`, inserta exactamente esa línea en ese lugar y prueba las rutas con `php -S`.)

## 2. `index.html` (script)

Después de `<script defer src="js/copas.js"></script>`:

```html
<script defer src="js/visitas.js"></script>
```

## 3. `js/ui.js`

a) `PL_INFO` (título e ícono de la fila plegable de Inicio), después de `    flota: ['unidad_movil', 'inicio.pl.flota'],`:

```js
    visitas: ['home', 'inicio.pl.visitas'],
```

(La clave `inicio.pl.visitas` la agrega `js/visitas.js` sola a cada diccionario cargado; si se prefiere en `js/lang/*.js`:
es "Visita otras productoras", en "Visit other companies", pt-BR "Visite outras produtoras", fr "Visitez d’autres sociétés",
de "Andere Firmen besuchen", it "Visita altre case di produzione", ru "Загляните к другим студиям", tr "Diğer şirketleri ziyaret et",
id "Kunjungi rumah produksi lain", zh-CN "拜访其他制作公司".)

b) Privacidad en la tarjeta de la cuenta (pestaña Tienda, con sesión): reemplazar

```js
        ${discordBtn('sm')}
        <button class="btn sm" data-act="salir">${T('cuenta.salir')}</button></div>`;
```

por

```js
        ${discordBtn('sm')}
        ${window.Visitas ? window.Visitas.ajusteCuenta() : ''}
        <button class="btn sm" data-act="salir">${T('cuenta.salir')}</button></div>`;
```

(El interruptor guarda solo con `POST /api/visitas/ajustes`; también está en "Ver mi vitrina".)

## 4. Botón "Visitar" donde salen nombres de jugadores

`Visitas.boton(jugadorId)` devuelve el html (vacío sin sesión, sin id o si eres tú); cualquier `[data-visitar="<id>"]` abre la visita.

a) **Chat** — `js/chat.js`, en `pintarLista()`, reemplazar

```js
        <p>${esc(m.texto)}</p></div>`).join('')
```

por

```js
        <p>${esc(m.texto)}</p>${!m.mio && m.jugador_id && window.Visitas ? window.Visitas.boton(m.jugador_id) : ''}</div>`).join('')
```

b) **Duelos (rivales de tu servidor)** — `js/duelos.js`, en la tarjeta `dl-rival`, reemplazar

```js
        <button class="btn sm main" data-dl="retar" data-id="${v.id}"
```

por

```js
        ${window.Visitas ? window.Visitas.boton(v.id) : ''}<button class="btn sm main" data-dl="retar" data-id="${v.id}"
```

y en el historial, reemplazar `<span class="muted">${esc(T('duelo.vs'))} ${esc(d.rival.nombre)}</span>` por
`<span class="muted">${esc(T('duelo.vs'))} ${esc(d.rival.nombre)}</span>${window.Visitas ? ' ' + window.Visitas.boton(d.rival.id) : ''}`.

c) **Copa: top aportantes** — el servidor todavía no manda el id. `server/src/Copas.php` (≈ línea 1078), en `top_aportantes`, reemplazar
`fn($a) => ['alias' =>` por `fn($a) => ['jugador_id' => (int) $a['jugador_id'], 'alias' =>`. Luego en `js/copas.js` `tarjetaTop()`, reemplazar
`<span class="v">${esc(T('puntos', { n: num(r.puntos) }))}</span></div>` por
`<span class="v">${esc(T('puntos', { n: num(r.puntos) }))}</span>${!r.yo && r.jugador_id && window.Visitas ? window.Visitas.boton(r.jugador_id) : ''}</div>`.

d) **Lista de miembros de la asociación** — `Social::asociacionJson(..., detalle)` ya manda `lista[].jugador_id`, pero hoy ninguna
pantalla la dibuja. Donde se dibuje: `${window.Visitas ? window.Visitas.boton(m.jugador_id) : ''}` al lado del nombre.

## 5. Opcional: `server/public/api.php` → `api_partida()` (vitrina al día apenas se sube la partida)

Sin esto la vitrina igual se rehace sola (compara `partidas.actualizado`). Si se quiere borrar la cache al subir, después de la línea
`    Db::q('INSERT INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?) ON CONFLICT ...` agregar:

```php
    if (class_exists(\EnVivo\Visitas::class)) \EnVivo\Visitas::alSubirPartida($j);
```

## 6. `server/tests/correr.sh`

Agregar `visitas` a la lista de suites de la sección 3c (`for suite in discord festival liga ... demo_datos visitas; do`).

## 7. Errores

Copiar `docs/traducciones/errores_nuevos/visitas.json` (`visitas_cerradas`, `productora_no_existe`, `aplauso_ya`, `aplauso_propio`)
a `docs/traducciones/errores.json` y a `error.<codigo>` de `js/lang/*.js`. `js/visitas.js` ya trae esos textos propios, así que funciona sin eso.
