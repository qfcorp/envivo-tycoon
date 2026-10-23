# Integrar `discord2`: crear el Discord oficial + botón "Únete a nuestro Discord"

Módulo de documentación para el dueño + un botón pequeño en el juego. No cambia ninguna ruta, tabla ni comando del bot.

## Archivos nuevos

| Archivo | Qué es |
|---|---|
| `docs/DISCORD_CREAR_SERVIDOR.md` | Guía paso a paso (celular/PC) para crear el servidor, roles, canales, permisos, Comunidad, AutoMod, Onboarding, invitación permanente, conectar el bot (Developer Portal, `/etc/envivo/config.env`, endpoint, `discord_comandos.php`) y probar `/vincular`. |
| `docs/DISCORD_TEXTOS.md` | Textos listos para pegar: descripción, temas de canales, etiquetas de foros, reglas, reglas cortas, bienvenida, Onboarding, vincular, FAQ, anuncio de lanzamiento, códigos de regalo, copa, soporte, listas de AutoMod, post para redes. |
| `server/tests/pruebas_discord2.php` | Prueba de `Discord::invitacion()` / `discord_invitacion` en `/api/estado` (14 casos, sin base ni red). |
| `tests/test_discord_unirse.js` | Prueba en navegador (Playwright, 390x844) del botón en Inicio y Tienda (27 comprobaciones). |

## Cambios pequeños en archivos compartidos

1. **`js/ui.js`** (3 lugares):
   - Inicio: `${soporteBtn()}` → `${soporteBtn()}${unirseDiscordBtn()}` (debajo de "Ayuda y soporte").
   - Tienda → Tu cuenta: `${discordBtn('sm')}` → `${discordBtn('sm')}${unirseDiscordBtn('sm')}` (junto a "Vincular Discord").
   - Antes de `let discordT = null;`: funciones `invitacionDiscord()` (lee `Api.estado.discord_invitacion` y solo acepta
     `https://discord.gg/...` o `https://discord.com/invite/...`) y `unirseDiscordBtn(cls)` (vacío si no hay invitación).
   - En el `switch` de `data-act`: `case 'discord-unirse'` → `window.open(url, '_blank', 'noopener')`.
2. **`js/lang/*.js`** (10 idiomas): una clave nueva `"discord.unirse"` justo después de `"discord.desvinculado"`.
3. **`server/src/Discord.php`** → `invitacion()`: también acepta `DISCORD_INVITE_URL` como otro nombre de `DISCORD_INVITACION`
   (gana `DISCORD_INVITACION` si están las dos). Misma validación de antes. `/api/estado` ya devolvía `discord_invitacion`.
4. **`discord/estructura.json`**: 2 canales nuevos para el programa `configurar_servidor.js` (para que la guía manual y el
   programa den el mismo servidor): `🎁┃códigos-de-regalo` (anuncios, en 📌 INFORMACIÓN, después de novedades) y
   `🏆┃copa-de-servidores` (texto, en 🎥 PRODUCTORAS, después de eventos-y-ligas); `codigos-regalo` en `onboarding.canales_por_defecto`.
5. **`docs/DISCORD.md`**: conteo (43 → 45 canales), los 2 canales en la tabla y un aviso arriba que apunta a la guía nueva.
   **`docs/DISCORD_BOT.md`**: aviso arriba (guía nueva) y una línea sobre `DISCORD_INVITACION` → botón del juego.

## Para el coordinador

- Sube `VERSION` en `sw.js` y regenera `dist/` si corresponde (no lo hice para no chocar con los otros módulos).
- Opcional: agregar `php "$SRV/tests/pruebas_discord2.php"` a `server/tests/correr.sh` junto a `pruebas_discord.php` (paso 3c).
- Nota: `UNIVERSO_SERVIDORES_INICIALES=3` abre Servidor 2 · Guayaquil y 3 · Cuenca, pero `discord/estructura.json` →
  `servidores_del_juego.lista` solo tiene Quito (si el dueño usa el programa, debe agregarlos; la guía manual ya dice que
  cree los roles de los servidores que existan). Si faltan esos roles, el bot deja un aviso en `/admin.php` y no se rompe.

## Pruebas

```
php server/tests/pruebas_discord2.php                                    # 14 correctas
php server/tests/pruebas_discord.php                                     # 120 correctas (sin cambios)
(cd discord && node test.js)                                             # 71/71 (con los 2 canales nuevos)
NODE_PATH=/opt/npm-tools/node_modules node tests/test_discord_unirse.js  # 27 correctas
NODE_PATH=/opt/npm-tools/node_modules node tests/test_i18n.js            # 10 idiomas OK
```
