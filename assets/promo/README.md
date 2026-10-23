# Material para la tienda y redes — EN VIVO Tycoon

Todo es original: dibujos del propio juego (`js/art.js`), capturas del juego real y textos propios.
No hay marcas, personas ni personajes reales: el juego usa solo nombres parodia (MegaVisión, Llévame, Kanon, Zony,
LigaPrima...). `src/capturar.js` revisa el texto de cada pantalla y **falla** si aparece una marca real (LigaPro, Sony,
Canon, Blackmagic, GoPro, DJI, Uber...). Los botones "Compartir por WhatsApp" / Google Play del juego sí pueden salir.

## Archivos y dónde subirlos

### Google Play Console → *Crecimiento → Presencia en la tienda → Ficha principal de Play Store*

| Archivo | Tamaño | Campo en Play Console | Notas |
|---|---|---|---|
| `icon_512.png` | 512 × 512, PNG 32 bits (con alfa) | **Ícono de la app** | Cuadrado completo, sin esquinas redondeadas: Play aplica su propia máscara. Sale de `icons/icon.svg`. |
| `feature_graphic.png` | 1024 × 500, PNG 24 bits (sin alfa) | **Gráfico de funciones** (ficha en español) | Título y letrero dentro de la zona segura central-izquierda. |
| `feature_graphic_en.png` | 1024 × 500, PNG 24 bits | **Gráfico de funciones** de las demás traducciones | Lema: "Run your own live broadcast company". |
| `screens_<idioma>/01.png` … `08.png` | 1080 × 1920 (9:16), PNG 24 bits | **Capturas de pantalla del teléfono** de esa ficha | 8 por idioma (el máximo de Play), súbelas en orden. El teléfono y los títulos están en ese idioma. |

Carpetas de capturas y ficha de Play a la que van (textos de la ficha en `docs/play_store/ficha_<idioma>.md`):
`screens_es` (es-419 / es-ES), `screens_en` (en-US), `screens_pt-BR` (pt-BR), `screens_fr` (fr-FR), `screens_de` (de-DE),
`screens_it` (it-IT), `screens_ru` (ru-RU), `screens_tr` (tr-TR), `screens_id` (id), `screens_zh-CN` (zh-CN).
En Play Console: *Ficha principal → Administrar traducciones → Agregar traducción*, y en cada una sube su carpeta.

Las capturas en orden (partida del capítulo 4 de la productora **Tukán Producciones**, día 47):

| # | Título (es) | Pantalla del juego | Recuadro ampliado |
|---|---|---|---|
| 01 | Tu productora, tu nombre | Inicio: la sede (centro de producción) con el letrero y la van de la flota | El dibujo de la sede |
| 02 | Elige a tus clientes | Clientes: lanzamiento de marca y graduación disputada con MegaVisión | "Disputado" y la calidad que promete MegaVisión |
| 03 | Planifica cada cámara | Preparar un concierto: plano de cámaras | La tarjeta de transporte "Llévame" |
| 04 | Resuelve imprevistos en vivo | En vivo: franja animada y lluvia en el concierto, con las 3 decisiones | La franja animada |
| 05 | Gana 5 estrellas | Resultado: 5 estrellas, +$2.249 y duelo ganado a MegaVisión | "Compartir por WhatsApp" |
| 06 | Equipos de Edición Exclusiva | Bodega → Lentes: el lente Edición Exclusiva | La tarjeta exclusiva |
| 07 | Copa de Servidores | En línea: la copa en plena batalla del sábado (servidor simulado) | El marcador |
| 08 | Decora tu local | Decorar el local: recepción, sofá, neón con el nombre, trofeos... | El dibujo del local |

### Redes sociales

| Archivo | Tamaño | Dónde |
|---|---|---|
| `social_post_1080.png` | 1080 × 1080 | Publicación del feed de Instagram y Facebook ("Muy pronto · Próximamente en Android y web"). |
| `social_story_1080x1920.png` | 1080 × 1920 | Historias de Instagram y Facebook, estado de WhatsApp, TikTok (usa la captura en vivo en español). Deja libres unos 250 px arriba y abajo para la interfaz de la app. |

## Cómo volver a generarlo todo

Requiere Playwright y sharp (en este servidor: `NODE_PATH=/opt/npm-tools/node_modules`) e internet para las fuentes de Google.

```bash
# 1) Capturas en crudo del juego real (360x640 a 3x) en los 10 idiomas → assets/promo/src/raw/<idioma>/ (no van a git)
NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/capturar.js
#    solo algunos idiomas:
GAME_LANGS=es,en NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/capturar.js

# 2) Armar todas las piezas → assets/promo/
NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/componer.js
#    o solo una parte: feature | screens | social | icon  (PROMO_LANGS=es,en para algunos idiomas)
NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/componer.js screens
```

- `src/capturar.js` arma la partida con las reglas del juego (`Game.demoGame('cap4')` + 13 personas, grúa, dron, lente
  Edición Exclusiva, van de 12 pasajeros, decoración y sede nivel 7), abre el juego desde un origen http simulado con
  `?fecha=2026-11-10` (sin temporada especial) y `?lang=`, sin la guía "toca aquí" (`envivo_guia_v1`), sin el aviso de
  cuenta y con las filas de Inicio plegadas; cierra cualquier ventana que aparezca sola. La Copa de Servidores usa un
  servidor simulado (`/api/estado` y `/api/copa`). Guarda `raw/<idioma>/rects.json` (la zona que se amplía en cada
  captura; con `src` cuando sale de otra captura del mismo momento y `pos: "bottom"` para ponerla abajo).
- `src/componer.js` contiene los títulos de cada captura en los 10 idiomas (lista `SCREENS`), el diseño del gráfico de
  funciones, los posts y el ícono. Para cambiar un título, edítalo ahí y vuelve a correr el paso 2.
