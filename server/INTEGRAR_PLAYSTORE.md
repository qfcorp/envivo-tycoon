# Integrar: módulo playstore (publicación en Google Play)

Archivos de este módulo (solo estos se tocaron):

| Archivo | Qué es |
|---|---|
| `docs/PUBLICAR_GOOGLE_PLAY.md` | **Nuevo.** Pasos numerados para el dueño, desde cero hasta producción (cuenta, .aab, huellas, productos, prueba cerrada de 12 × 14 días, solicitud de producción, países y precios) |
| `.github/workflows/android.yml` | **Nuevo.** Robot de GitHub Actions que construye y firma el `.aab` con Bubblewrap 1.27.0 usando la llave guardada en secretos (se corre a mano) |
| `docs/LANZAMIENTO_LIMITADO.md` | **Nuevo.** Plan de lanzamiento limitado (Ecuador → Colombia + Perú → México) |
| `docs/play_store/ASO_Y_CAPTURAS.md` | **Nuevo.** Palabras clave, decisión del nombre, plan de 8 capturas, revisión de gráficos, guion del video de 30 s |
| `docs/play_store/README.md` | Seguridad de los datos (analítica propia, registros de fallas, IP/dispositivo para fraude, ID de Discord, enlace de borrado), IARC con tabla de respuestas, público 16+, ID de publicidad, pendientes al día |
| `docs/play_store/ficha_*.md` (10) | Descripción breve con palabras clave, viñeta de eventos en línea (ya existen), párrafo de compras actualizado; mismas ideas en los 10 idiomas |
| `docs/ANDROID_GOOGLE_PLAY.md` | Solo punteros: a la guía nueva, cambio de comisiones 2026, borrado de cuenta ya hecho, público 16+, lista completa de productos |
| `server/INTEGRAR_PLAYSTORE.md` | Este archivo |

`node tests/test_traducciones.js` → 11405/11405 OK.

## 1. Cambios en archivos compartidos que debe hacer el integrador

1. **`.gitignore`** (agregar al final), para que una llave nunca llegue a GitHub por accidente:
   ```
   # Android / Google Play: llaves y credenciales (nunca al repositorio)
   *.keystore
   *.jks
   keystore_base64.txt
   google-play*.json
   ```
2. **`server/public/terminos.html` y `server/public/privacidad.html`**: que digan **16 años o más** (el formulario de
   público objetivo de Play quedó en 16-17 y 18+) y que la privacidad nombre: analítica propia de uso, registros de
   errores, IP y navegador para prevenir fraude, ID de Discord si el jugador vincula su cuenta (ver
   `docs/play_store/README.md` §2.6). Lo revisa el abogado junto con lo demás.
3. **`PLAN.md`**, Fase 3, agregar debajo de la línea de fichas:
   `- [x] Guía para el dueño `docs/PUBLICAR_GOOGLE_PLAY.md`, robot de GitHub para el .aab, formularios 16+ y plan de lanzamiento limitado (`docs/LANZAMIENTO_LIMITADO.md`)`

## 2. Pedidos a otros módulos (no son de este módulo; quedan anotados para que no se pierdan)

1. **Capturas (`assets/promo/src/capturar.js` y `componer.js`)**: `capturar.js` ya no funciona con la pantalla v6
   (TimeoutError: espera un botón que queda desactivado). Hay que actualizar los selectores, agregar las capturas
   `plan de cámaras` y `En línea`, y dejar las 8 de `docs/play_store/ASO_Y_CAPTURAS.md` §3 en ese orden.
   **Bloqueante para publicar:** la captura 01 actual dice "Partido de **Liga-Pro**" (nombre de una liga real, sin guion).
2. **Analítica (Centro de Control)**: para `docs/LANZAMIENTO_LIMITADO.md` §8 hacen falta, por cohorte (semana de
   instalación) y país: D1/D7/D30, embudo del primer evento y de capítulos, cuentas creadas, conversión a pago (día 1/7/30),
   ARPDAU/ARPPU, ingresos por producto, canjes por código de regalo con D7 y pagadores de esos jugadores, invitaciones
   por WhatsApp, errores por 1.000 sesiones y métricas de chat/soporte. Distinguir `origen=android` (TWA) de la web.
   Todo propio, sin SDK de terceros (si se agrega uno, hay que cambiar el formulario de Seguridad de los datos).
3. **Códigos de regalo**: códigos personales por influencer con contenido fijo, 1 canje por cuenta, tope de canjes,
   vencimiento y reporte de canjes por código (`docs/LANZAMIENTO_LIMITADO.md` §5). Los códigos se regalan, nunca se venden.
4. **Botón "Invitar por WhatsApp"** (`js/ui.js` + `js/lang/*`): en 3 momentos (5 ⭐, duelo ganado a MegaVisión, capítulo
   terminado), con `navigator.share` o `https://wa.me/?text=` y el enlace de Play con `referrer=utm_source%3Dwhatsapp` y el
   código del jugador; premio para ambos cuando el invitado llega al capítulo 2 (máx. 10 por jugador). Texto en
   `docs/LANZAMIENTO_LIMITADO.md` §6. Dentro de la app no debe enlazar a la tienda web (regla de pagos de Play).
5. **Monetización**: cada producto nuevo con dinero real que llegue a `Catalogo.php` debe agregarse a la tabla
   "pendiente de confirmar" de `docs/PUBLICAR_GOOGLE_PLAY.md` paso 7 (ID, nombre ≤55, descripción ≤200, USD) y a los
   niveles de precio del paso 17.

## 3. Decisiones que quedan para Dimitry

- **Nombre en Play**: "EN VIVO Tycoon" (hoy) o "EN VIVO Tycoon: Productora TV" (más ASO). Si cambia, también la regla
  de `tests/test_traducciones.js` que exige el nombre exacto (`docs/play_store/ASO_Y_CAPTURAS.md` §1).
- **Comisiones 2026**: si Play Console le ofrece el esquema nuevo (10 % + 5 %) antes de 2027, revisar antes de aceptar.

## 4. Lo que el robot de GitHub (`android.yml`) hace y no hace

- Se corre **a mano** (Actions → "Android: construir .aab" → Run workflow) con `version_code` y `version_name`.
- Usa `android/twa-manifest.json` del repositorio, Node 20, JDK 17 (Temurin) y el Android SDK del runner con
  build-tools 36.1.0 y la plataforma android-36 (los que pide Bubblewrap 1.27.0); escribe `~/.bubblewrap/config.json`
  para que Bubblewrap no haga preguntas; firma con `BUBBLEWRAP_KEYSTORE_PASSWORD` / `BUBBLEWRAP_KEY_PASSWORD`.
- La llave se escribe solo en `$RUNNER_TEMP` y se borra al final (`if: always()`); el artefacto (7 días) lleva solo el
  `.aab` y el `.apk`. Acepta el secreto en base64 puro o tal como sale de `certutil -encode` (probado).
- **No se pudo correr de punta a punta desde aquí** (no hay secretos ni runner de GitHub): la primera corrida real la
  hace el dueño. Si falla, el registro de la ejecución dice en qué paso; los errores más probables son secretos mal
  pegados ("El keystore quedó vacío") o juego.tukanec.com caído (Bubblewrap baja el ícono de ahí).
- No sube nada a Play Console (se sube a mano; una subida automática necesitaría otra cuenta de servicio con permiso
  de publicar, y no conviene para las primeras versiones).
