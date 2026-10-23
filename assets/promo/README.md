# Material para la tienda y redes — EN VIVO Tycoon

Todo es original: dibujos del propio juego (`js/art.js`), capturas del juego real y textos propios.
No hay marcas, personas ni personajes reales (MegaVisión, los clubes y las productoras del chat son inventados).

## Archivos y dónde subirlos

### Google Play Console → *Crecimiento → Presencia en la tienda → Ficha principal de Play Store*

| Archivo | Tamaño | Campo en Play Console | Notas |
|---|---|---|---|
| `icon_512.png` | 512 × 512, PNG 32 bits (con alfa) | **Ícono de la app** | Cuadrado completo, sin esquinas redondeadas: Play aplica su propia máscara. Sale de `icons/icon.svg`. |
| `feature_graphic.png` | 1024 × 500, PNG 24 bits (sin alfa) | **Gráfico de funciones** (ficha en español) | Título y letrero dentro de la zona segura central-izquierda. |
| `feature_graphic_en.png` | 1024 × 500, PNG 24 bits | **Gráfico de funciones** de la traducción **en-US** | Lema: "Run your own live broadcast company". |
| `screens_es/01.png` … `06.png` | 1080 × 1920 (9:16), PNG 24 bits | **Capturas de pantalla del teléfono** (ficha en español) | Súbelas en este orden. Play pide de 2 a 8; estas 6 también sirven para "tablet de 7 pulgadas" si te lo pide. |
| `screens_en/01.png` … `06.png` | 1080 × 1920, PNG 24 bits | **Capturas de pantalla del teléfono** de la traducción **en-US** | Ver la nota de idioma más abajo. |

Las capturas en orden:

| # | Español | Inglés | Pantalla del juego |
|---|---|---|---|
| 01 | Resuelve imprevistos en vivo | Handle disasters live on air | Lluvia en un partido de LigaPro |
| 02 | Arma tu equipo de producción | Build your production crew | Personal con avatares |
| 03 | Compite contra MegaVisión | Beat MegaVisión to the contract | Resultado: 5 estrellas y duelo ganado |
| 04 | Equipos de nivel broadcast | Broadcast-grade gear | Bodega con equipos exclusivos numerados |
| 05 | Crece de garaje a unidad móvil | From garage to OB van | Inicio con el centro de producción |
| 06 | Juega con otras productoras | Team up with other companies | Chat de la asociación |

Para la traducción en inglés: en Play Console, ve a *Ficha principal → Administrar traducciones → Agregar traducción → Inglés (Estados Unidos)*.
En esa ficha sube `feature_graphic_en.png` y `screens_en/`.

### Redes sociales

| Archivo | Tamaño | Dónde |
|---|---|---|
| `social_post_1080.png` | 1080 × 1080 | Publicación del feed de Instagram y Facebook ("Muy pronto · Próximamente en Android y web"). |
| `social_story_1080x1920.png` | 1080 × 1920 | Historias de Instagram y Facebook, estado de WhatsApp, TikTok. Deja libres unos 250 px arriba y abajo para la interfaz de la app (ya está pensado así). |

## Nota de idioma (capturas en inglés)

Cuando se hicieron estas piezas, el juego solo tenía la interfaz en español (`js/lang/es.js`).
Por eso, en `screens_en/` los títulos están en inglés pero la pantalla del teléfono se ve en español.
Cuando exista `js/lang/en.js`, vuelve a generar las capturas en inglés (ver abajo) para que el teléfono también salga en inglés.

## Cómo volver a generarlo todo

Requiere Playwright y sharp (en este servidor: `NODE_PATH=/opt/npm-tools/node_modules`) e internet para las fuentes de Google.

```bash
# 1) Capturas en crudo del juego real (360x640 a 3x) → assets/promo/src/raw/
NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/capturar.js

# 2) Armar todas las piezas → assets/promo/
NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/componer.js
#    o solo una parte: feature | screens | social | icon
NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/componer.js screens
```

- `src/capturar.js` arma una partida avanzada con las reglas del juego (capítulo 4, $18.000, fama 48, 8 personas,
  equipos exclusivos, ofertas disputadas con MegaVisión) y toma las pantallas. La pantalla de comunidad usa un servidor
  simulado solo para mostrar el chat. También guarda `raw/rects.json` (la zona que se amplía en cada captura).
- Variables opcionales: `GAME_ROOT=<carpeta del juego>` (usar otra copia del juego),
  `GAME_LANG=en` (abre el juego en inglés cuando exista la traducción) y `RAW_DIR=<carpeta>`.
  Para las capturas en inglés, cuando ya exista la traducción:
  `GAME_LANG=en RAW_DIR=assets/promo/src/raw_en node assets/promo/src/capturar.js` y luego el paso 2:
  `componer.js` usa `src/raw_en/` para `screens_en/` automáticamente si esa carpeta existe.
- `src/componer.js` contiene los textos de cada captura (lista `SCREENS`), el diseño del gráfico de funciones,
  los posts y el ícono. Para cambiar un título, edítalo ahí y vuelve a correr el paso 2.
