# Integrar la pantalla de la Copa de Servidores (`js/copas.js`)

Para quien mantiene `index.html`, `sw.js`, `tools/build_single.js`, `js/ui.js` y `js/lang/*.js`.
Contrato del servidor: `server/COPAS.md` §2. Prueba: `NODE_PATH=/opt/npm-tools/node_modules node tests/test_copas.js`
(capturas en `tests/capturas/copa_*.png`).

Qué hace el módulo por su cuenta (no hay que tocar nada para esto):
- Expone `window.Copas` → `render(el, ctx)`, `detener()`, `recargar()`, `invalidar()`, `T(clave)`.
- Se agrega solo a `window.EnVivoInicio` (`id: 'copa'`, `orden: 30`): tarjeta en Inicio con cuenta regresiva y
  "Tu servidor va 2°" mientras la copa está en `preparacion` o `batalla` y hay sesión. Su botón usa
  `data-ext="copa" data-acc="abrir"` (ya lo atiende `ui.js`) y abre la pantalla con `window.EnVivoAbrirOnline('copa')`
  si existe; si no, toca la pestaña "En línea" y un `data-act="online" data-k="copa"`.
- Todos sus textos (es + en, pt-BR, fr, de, it, ru, tr, id, zh-CN) están dentro de `copas.js` (`TRAD[código]`, según
  `I18N.idioma`, con español de respaldo). Solo los dos textos de la ficha del hub van en `js/lang/*.js` (punto 5).

## 1. `index.html`

Después de `<script defer src="js/desafio.js"></script>`:

```html
<script defer src="js/copas.js"></script>
```

(Necesita `js/intento.js` cargado antes, como liga/festival; ya está más arriba.)

## 2. `sw.js`

En la lista de archivos del juego, después de `'./js/desafio.js',   // Desafío del Día`:

```js
  './js/copas.js',      // Copa de Servidores
```

y subir la versión: `const VERSION = 'envivo-v8';` (o la siguiente a la que esté). Nunca cachear `/api/`.

## 3. `tools/build_single.js`

No hace falta ninguna línea: el build ya incrusta cada `<script src="js/...">` (con o sin `defer`) de `index.html`.
Basta con el punto 1. Comprobar después de construir: `grep -c "window.Copas" dist/envivo-tycoon.html` → `1`.

## 4. `js/ui.js` (pestaña "En línea")

a) En `const MODOS = [ ... ]`, agregar al final:

```js
    { k: 'copa', mod: 'Copas', icon: 'crown', tono: 'red' },
```

b) En `function ctxOnline(k)`, antes de `return base;`:

```js
    if (k === 'copa') {
      return { Api, A, G, estado: () => S, guardar: save, toast, ask, vip: !!(Pm && Pm.vip), snd: (n) => snd.play(n),
        jugarIntento: (it) => jugarIntento(it, 'copa'),
        sincronizar: () => { Api.refrescar().then(() => sincronizarEntregas()).catch(() => {}); } };
    }
```

`jugarIntento` va al estilo de la liga: recibe el intento entero (`{id, seed, contrato, equipo, contexto, vip, firma, vence}`)
y devuelve `{decisiones, resultado:{quality, stars}}` o `null`. La pantalla manda al servidor exactamente
`{intento_id, decisiones, resultado:{calidad, estrellas}}`.

c) En `function desmontarOnline()`, junto a la línea del festival:

```js
    try { if (montado === 'copa' && window.Copas && window.Copas.detener) window.Copas.detener(); } catch (e) { /* nada */ }
```

d) En `function invalidarOnline()`, agregar `'Copas'` a la lista:

```js
    ['Liga', 'Duelos', 'Desafio', 'Copas'].forEach((m) => { ... });
```

e) (Recomendado) Etiqueta del evento en vivo: reemplazar la línea `const viTag = ...` por:

```js
  const viTag = () => (VI ? `<span class="tag ${VI.modo === 'festival' || VI.modo === 'copa' ? 'amber' : ''}" style="margin:0">${I(VI.modo === 'festival' ? 'festival' : VI.modo === 'copa' ? 'crown' : 'shield')}${VI.modo === 'copa' ? (window.Copas ? window.Copas.T('titulo') : 'Copa de Servidores') : T(VI.modo === 'festival' ? 'online.festival' : 'online.liga')}</span>` : '');
```

f) (Recomendado) Abrir la copa desde la tarjeta de Inicio sin rodeos — después de `function ctxOnline(k) { ... }`:

```js
  window.EnVivoAbrirOnline = (k) => { if (VI) return; tab = 'online'; vistaOnline = k || 'hub'; desmontarOnline(); render(); window.scrollTo(0, 0); };
```

## 5. `js/lang/*.js` (texto de la ficha del hub)

Junto a `"online.desafio_det"` en cada archivo:

| Archivo | `"online.copa"` | `"online.copa_det"` |
|---|---|---|
| es.js | `"Copa de Servidores"` | `"Tu servidor contra los demás, cada semana."` |
| en.js | `"Server Cup"` | `"Your server against the others, every week."` |
| pt-BR.js | `"Copa de Servidores"` | `"Seu servidor contra os outros, toda semana."` |
| fr.js | `"Coupe des Serveurs"` | `"Ton serveur contre les autres, chaque semaine."` |
| de.js | `"Server-Pokal"` | `"Dein Server gegen die anderen, jede Woche."` |
| it.js | `"Coppa dei Server"` | `"Il tuo server contro gli altri, ogni settimana."` |
| ru.js | `"Кубок серверов"` | `"Твой сервер против остальных, каждую неделю."` |
| tr.js | `"Sunucular Kupası"` | `"Sunucun diğerlerine karşı, her hafta."` |
| id.js | `"Piala Server"` | `"Server-mu melawan yang lain, setiap minggu."` |
| zh-CN.js | `"服务器杯"` | `"你的服务器对战其他服务器，每周一届。"` |

## 6. Lo que la pantalla espera del servidor (resumen de COPAS.md §2)

- `GET /api/copa` → `{copa|null, universo, servidores[], cruces[], yo, top_aportantes[], historial[]}`. Opcionales que
  usa si vienen: `copa.fin_fase` (si no, calcula: preparación → lunes+5 d, batalla → sábado 20:00, cerrada → `copa.fin`),
  `yo.topes` (como festival), `yo.intento_abierto` (objeto con `seed` para retomar), `premios[]`
  (`{nombre, detalle?, entregas[]}`; si no viene, muestra la lista general), `top_aportantes[].yo`.
- En `cruces[]`: `a`/`b` pueden ser id o `{id, nombre}`; `estado` `pendiente` | `en_vivo` | `jugado`; `ganador` del
  partido `'a'` | `'b'` | `'empate'` o el id del servidor.
- `POST /api/copa/equipo {staff, equip}`, `POST /api/copa/intento/iniciar {}` (respuesta plana o `{intento}`),
  `POST /api/copa/intento/enviar {intento_id, decisiones, resultado:{calidad, estrellas}}` → `{resultado, copa}`.
- Errores `{ok:false, error, codigo}`: muestra el código; traduce `sin_sesion`, `fase`, `sin_equipo`, `equipo_invalido`,
  `limite`, `vencido`, `sin_copa`; HTTP 401 se trata como `sin_sesion`; `intento_abierto` con `intento` retoma ese intento.
