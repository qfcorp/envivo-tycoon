# Integrar "Tu servidor" (pantalla): salud, mudanza gratis y aviso de fusión

Módulo de cliente de **Universos, Copa de Servidores y fusión de servidores abandonados** (contrato: `server/COPAS.md` §1 y §3).

| Archivo | Qué es |
|---|---|
| `js/servidores.js` | Tarjeta de Inicio "Tu servidor" (`window.EnVivoInicio`, orden 5, solo con sesión), ventana de mudanza y aviso de fusión. Textos ES + `TRAD` (en, pt-BR, fr, de, it, ru, tr, id, zh-CN) dentro del archivo. |
| `tests/test_servidores.js` | Prueba en el juego real (index.html + ui.js) a 390x844 con el servidor imitado. Capturas `tests/capturas/servidores_*.png`. |

## Líneas exactas (las pone el coordinador)

### `index.html`
Justo después de la línea de la liga:
```html
<script defer src="js/liga.js"></script>
```
agregar:
```html
<script defer src="js/servidores.js"></script>
```

### `sw.js`
1. En `SHELL`, después de `'./js/liga.js',       // Liga Semanal` agregar:
```js
  './js/servidores.js', // Tu servidor: salud, mudanza gratis y aviso de fusión
```
2. Subir la versión de la caché (si nadie más la subió en esta ronda, una sola vez para todos):
```js
const VERSION = 'envivo-v8';
```

### `tools/build_single.js`
**No lleva ninguna línea nueva.** El script incrusta todo `<script src="js/...">` de `index.html` (los `defer` al final, en su
orden), así que `js/servidores.js` entra solo en cuanto está en `index.html`. Para comprobarlo:
```bash
node tools/build_single.js && grep -c "id: ID, orden: 5" dist/envivo-tycoon.html   # → 1
```

### `js/ui.js`
Nada. La tarjeta usa el registro `window.EnVivoInicio` y el `ctx` de `ctxInicio()` (`render`, `openModal`, `closeModal`,
`toast`, `I`, `snd`). Los botones llevan `data-ext="servidores" data-acc="mudar|confirmar"`; ui.js ya los reparte.

## Lo que espera del servidor

- `GET /api/estado` (con sesión): `servidor: {id, nombre}` (ya existe, `SOCIAL.md`) y, a los jugadores movidos por una fusión,
  `aviso_fusion: {de, a, fecha}` (`de`/`a` pueden ser texto o `{id, nombre}`; `fecha` 'YYYY-MM-DD' o ISO, opcional).
  El aviso se muestra **una sola vez** por `de|a|fecha` (guardado en `localStorage['envivo_avisos_fusion_vistos']`, con
  try/catch; si el navegador no deja guardar, se recuerda en la sesión). Espera a que no haya otra ventana abierta.
- `GET /api/servidor/opciones` → `{actual:{id, nombre, estado:'sano'|'bajo'|'abandono', activos_7}, sugerido:{id, nombre, activos_7}|null,
  puede, motivo|null, proximo_traslado|null}`.
  **Opcional (para mostrar el universo):** `universo:{id, nombre}` en la raíz o `actual.universo` (texto u objeto). También se
  lee `estado.servidor.universo` o `estado.universo`. Si no viene, la tarjeta muestra solo el servidor.
  Se pide al ver Inicio con sesión: una vez, de nuevo a los 10 min, al cambiar `estado.servidor.id`, o 1 min después de un error.
- `POST /api/servidor/trasladar {destino}` (con `X-Envivo: 1`). Si responde error, la ventana muestra el texto (o `error.<codigo>`
  traducido si existe en I18N) y deja reintentar. Si sale bien: cierra, avisa "¡Listo! Ya estás en …", pide `/api/estado`
  (`Api.refrescar()`) y vuelve a pedir las opciones.
- `motivo` llega en español; se pasa por `I18N.TL` por si la lógica tiene traducción.

## Qué muestra

- **Sano**: "Tu servidor · Servidor 2 · Guayaquil · Universo Andino" + insignia verde "Sano".
- **Poca actividad / En abandono** (ámbar / rojo): una línea amable y, si `puede` y hay `sugerido`, el botón
  "Mudarte gratis a Servidor X (más activo)" con las productoras activas de allá y de aquí. Si no puede: el `motivo` y la fecha
  de `proximo_traslado`. Sin sugerido: "Estamos buscando un servidor más activo para ti."
- **Ventana de mudanza**: se mudan tu productora (dinero del juego, personal, fama, avance), tus equipos, tus créditos y tu VIP;
  dejas tu asociación (allá puedes unirte a una o crear la tuya); chat, ranking y Copa pasan a ser los del nuevo servidor.

## Pruebas
```bash
NODE_PATH=/opt/npm-tools/node_modules node tests/test_servidores.js
```
Cubre: diccionarios completos (mismas claves y marcadores en los 9 idiomas), sano, bajo con sugerencia + ventana, no puede
(motivo + fecha), mudanza que falla y luego sale bien (POST `{destino}`, toast, tarjeta refrescada, `/api/estado` otra vez),
aviso de fusión una sola vez (también tras recargar y con `localStorage` bloqueado), sin sesión no hay tarjeta, inglés,
`X-Envivo: 1`, sin errores de JS y sin desborde horizontal. La prueba agrega la línea de `index.html` por su cuenta si todavía no está.

Nota: después de una mudanza, el chat del servidor (js/chat.js) sigue con el canal `servidor` genérico; el servidor responde con el
del nuevo servidor del jugador, así que no hace falta reiniciarlo.
