# 🔴 EN VIVO Tycoon (nombre provisional)

Juego de gestión de una productora de eventos y transmisiones en vivo.
Empiezas en un garaje con la vieja cámara de Don Ramiro y creces hasta
transmitir la final del campeonato. En cada evento pasan imprevistos
(se rompe un cable, se cae el internet, llueve, se va la luz) y tú decides
cómo resolverlos.

## ▶️ Cómo jugar

- **En el celular o PC:** abre `index.html` en el navegador.
- **Versión de un solo archivo:** `dist/envivo-tycoon.html` (funciona sin internet).
- La partida se guarda sola en el navegador.

## 🧪 Pruebas (para verificar que todo funciona)

```bash
node tests/test_logic.js        # simula 400 partidas completas con un bot
node tests/test_browser.js      # juega en un celular simulado (requiere Playwright)
node tools/build_single.js      # vuelve a crear dist/envivo-tycoon.html
```

## 📁 Archivos

| Archivo | Para qué sirve |
|---|---|
| `PLAN.md` | Bloc de notas del proyecto: plan, hecho y pendiente |
| `index.html` | La página del juego y sus estilos |
| `js/logic.js` | Las reglas del juego (dinero, eventos, imprevistos, historia) |
| `js/ui.js` | Las pantallas y botones |
| `tests/` | Pruebas automáticas |
| `tools/build_single.js` | Junta todo en un solo archivo |

## 📲 Instalar como app

El juego se puede instalar en la pantalla de inicio del celular como si fuera
una app (ícono propio, pantalla completa) y **funciona sin internet** después
de abrirlo una vez.

> ⚠️ Para que se pueda instalar, el juego tiene que estar publicado en una
> dirección **https** (por ejemplo GitHub Pages). Abriendo el archivo
> `index.html` directo desde el teléfono no aparece la opción de instalar.

### Android (Chrome)

1. Abre la dirección del juego en **Chrome**.
2. Toca el menú **⋮** (arriba a la derecha).
3. Toca **Instalar app** (en algunos teléfonos dice **Agregar a pantalla principal**).
4. Confirma con **Instalar**. El ícono de EN VIVO aparece en tu pantalla de inicio.

### iPhone / iPad (Safari)

1. Abre la dirección del juego en **Safari** (en otros navegadores no aparece la opción).
2. Toca el botón **Compartir** (el cuadrado con una flecha hacia arriba).
3. Baja y toca **Agregar a inicio**.
4. Toca **Agregar**. El ícono aparece en tu pantalla de inicio.

### Publicarlo gratis con GitHub Pages

1. En GitHub abre el repositorio **qfcorp/envivo-tycoon**.
2. Ve a **Settings → Pages**.
3. En **Branch** elige **main** y la carpeta **/ (root)**, y toca **Save**.
4. Espera 1–2 minutos. El juego queda en:
   **https://qfcorp.github.io/envivo-tycoon/**

> Nota: GitHub Pages en repositorios **privados** requiere un plan pagado.
> Si el repositorio es privado, puedes hacerlo público o usar otro hosting
> con https (por ejemplo Cloudflare Pages o Netlify).

### Para quien programa

- Archivos de la app: `manifest.webmanifest`, `sw.js` (modo sin internet),
  `js/pwa.js` (registro e instalación) e `icons/` (ícono en `icons/icon.svg`).
- Las etiquetas para el `<head>` de `index.html` están en `HEAD_SNIPPET.html`.
- Cada vez que cambies archivos del juego, sube la versión en `sw.js`
  (`envivo-v1` → `envivo-v2`) para que los teléfonos descarguen lo nuevo.
- Prueba: `node tests/test_pwa.js`
