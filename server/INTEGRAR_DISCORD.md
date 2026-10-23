# Integrar el bot de Discord (para quien mantiene `api.php`, nginx y el cron)

El bot ya está hecho en archivos nuevos (no tocan nada de lo existente):

| Archivo | Qué es |
|---|---|
| `server/src/Discord.php` | Toda la lógica: firma Ed25519, comandos, vincular, roles, sincronización, anuncios, límites de Discord |
| `server/src/migraciones/discord.sql` | Tablas `discord_vinculos`, `discord_codigos`, `discord_ajustes` (se crean solas con `Discord::preparar()`) |
| `server/public/discord/interacciones.php` | La dirección que Discord llama: `https://juego.tukanec.com/discord/interacciones` |
| `server/bin/discord_sync.php` | Sincroniza roles (cron cada 10 minutos) |
| `server/bin/discord_comandos.php` | Registra los comandos `/vincular /desvincular /perfil /ranking /eventos /ayuda` |
| `server/tests/pruebas_discord.php` | Pruebas (Discord falso + firmas Ed25519 reales). `php server/tests/pruebas_discord.php` |
| `docs/DISCORD_BOT.md` | Guía para el dueño (Developer Portal, invitación, roles) |

Faltan 4 cambios pequeños en archivos que mantiene otra persona. **Las pruebas aplican estos mismos bloques** (copiados
de este archivo, entre las marcas `prueba:`) sobre una copia de `api.php` y de `nginx-sitio.sh`: si se cambia un bloque
aquí, las pruebas usan el nuevo.

## 1. `server/public/api.php`: rutas nuevas

Dentro del `match ($ruta) { ... }`, justo antes de `default => Http::error(404, 'No encontrado.'),` (usa el nombre completo
`\EnVivo\Discord`, así no hace falta tocar la línea `use`):

<!-- prueba:rutas -->
```php
        // Bot de Discord (server/INTEGRAR_DISCORD.md)
        '/discord/codigo' => $soloPost() && Http::json(200, \EnVivo\Discord::codigoParaJugador(requiere_sesion())),
        '/discord/desvincular' => $soloPost() && Http::json(200, \EnVivo\Discord::desvincularJugador(requiere_sesion())),
```

- `POST /api/discord/codigo` (con sesión y `X-Envivo: 1`) →
  `{ "ok": true, "codigo": "K7M2QX9P", "expira": "ISO", "segundos": 600, "comando": "/vincular codigo:K7M2QX9P", "vinculado": false, "invitacion": "https://discord.gg/..." | null }`.
  8 caracteres (sin I, L, O, 0, 1), sirve 10 minutos y una sola vez; pedir otro anula el anterior. En la base va solo su sha256.
  Límite: 5 códigos cada 10 minutos por jugador y 30 por conexión (→ 429). Cuenta suspendida o bloqueada → 403.
  Si el bot no está configurado → 503 `{ codigo: "discord_no_configurado" }` (el juego puede esconder el botón).
- `POST /api/discord/desvincular` (opcional, desde el juego) → `{ "ok": true, "desvinculado": true|false }` y quita los roles.

## 2. `server/public/api.php`: campo `discord_vinculado` en `/api/estado`

Cambiar esta línea:

<!-- prueba:estado_antes -->
```php
        '/estado' => $soloGet() && Http::json(200, Cuentas::estado(Sesiones::jugadorId())),
```

por esta:

<!-- prueba:estado_despues -->
```php
        '/estado' => $soloGet() && Http::json(200, Cuentas::estado(Sesiones::jugadorId()) + \EnVivo\Discord::estado(Sesiones::jugadorId())),
```

`/api/estado` agrega `"discord_vinculado": true|false` (false sin sesión) y `"discord_invitacion": "https://discord.gg/..." | null`
(de `DISCORD_INVITACION`). Nunca falla: si algo sale mal, `discord_vinculado` queda en false.

## 3. nginx: `server/deploy/nginx-sitio.sh`

En la función `reglas()`, junto a los otros bloques PHP (por ejemplo antes de `location = /terminos.html`). Es una sola
dirección exacta: todo lo demás bajo `/discord/` sigue dando 404 por la lista blanca.

<!-- prueba:nginx -->
```nginx
    # Bot de Discord: Discord manda aquí los comandos (firmados con Ed25519; sin firma válida PHP responde 401)
    location = /discord/interacciones {
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/discord/interacciones.php;
        fastcgi_param SCRIPT_NAME /discord/interacciones;
        fastcgi_param HTTP_PROXY "";
        fastcgi_read_timeout 60s;
        client_max_body_size 256k;
        fastcgi_pass unix:$SOCK;
    }
```

(`$PUB` y `$SOCK` son las variables del script; en el archivo final quedan como
`/var/www/envivo/server/public/discord/interacciones.php` y `/run/php/php8.3-fpm.sock`.) Después:
`sudo bash /var/www/envivo/server/deploy/instalar.sh` (escribe el sitio, prueba `nginx -t` y recarga).

Si el dominio pasa por el proxy de **Cloudflare** (nube naranja): en Cloudflare > Security > WAF, crear una regla
"Skip" para `URI Path equals /discord/interacciones` (saltar Bot Fight Mode / Managed Challenge). Si no, Cloudflare puede
bloquear a Discord y el portal dice que la dirección no es válida.

Si se agrega a `server/tests/correr.sh`: `/discord/interacciones` con GET debe dar 405 (llega a PHP) y
`/discord/otra` y `/server/public/discord/interacciones.php` deben dar 404.

## 4. Cron (cron de `www-data`; se puede sumar al paso 5b de `server/deploy/instalar.sh`)

<!-- prueba:cron -->
```cron
*/10 * * * * ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/discord_sync.php >> /var/log/envivo-discord.log 2>&1
```

Para `instalar.sh` (igual que la tarea diaria):

```bash
TAREA_DISCORD="*/10 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/discord_sync.php >> /var/log/envivo-discord.log 2>&1"
touch /var/log/envivo-discord.log && chown www-data:www-data /var/log/envivo-discord.log
( crontab -u www-data -l 2> /dev/null | grep -v "$APP/server/bin/discord_sync.php"; echo "$TAREA_DISCORD" ) | crontab -u www-data -
```

Sin configuración de Discord, `discord_sync.php` solo dice "no está configurado" y sale con 0 (no molesta).

## 5. Configuración (`/etc/envivo/config.env`, nunca en el repositorio)

Para sumar a `server/config.env.ejemplo` (vacío, sin datos reales):

```ini
; Bot de Discord (docs/DISCORD_BOT.md). Developer Portal > tu aplicación.
DISCORD_APP_ID=
; General Information > Public Key (64 letras y números)
DISCORD_PUBLIC_KEY=
; Bot > Reset Token. SECRETO: nunca en GitHub, ni en capturas, ni en el chat.
DISCORD_BOT_TOKEN=
; Id del servidor de Discord (clic derecho en el servidor > Copiar ID del servidor; requiere el Modo desarrollador)
DISCORD_GUILD_ID=
; Opcional. Si los roles tienen otro nombre: {"Jugador verificado":"123...","VIP":"456..."} (nombre -> id). Si no, se buscan por nombre.
DISCORD_ROLES_JSON=
; Opcional: nombres de los roles si se cambian (por defecto estos)
; DISCORD_ROL_VERIFICADO=Jugador verificado
; DISCORD_ROL_COMPRADOR=Comprador verificado
; DISCORD_ROL_VIP=VIP
; DISCORD_ROL_PRESIDENTE=Presidente de asociación
; Webhooks de los canales (Editar canal > Integraciones > Webhooks > Copiar URL). SECRETOS.
DISCORD_WEBHOOK_ANUNCIOS=
DISCORD_WEBHOOK_EVENTOS=
DISCORD_WEBHOOK_ESTADO=
; Opcional: invitación al servidor (sale en el juego). Ej. https://discord.gg/abc123
DISCORD_INVITACION=
```

Los roles de servidor del juego se llaman igual que el servidor en la tabla `servidores` (ej. `Servidor 1 · Quito`).
Al buscarlos por nombre no importan mayúsculas, tildes ni el separador (`Servidor 1 - Quito` también sirve).

## 6. Anuncios desde el servidor del juego

```php
use EnVivo\Discord;
Discord::anunciar('anuncios', '¡Nueva temporada de la Liga Semanal!');                    // texto
Discord::anunciar('eventos', ['embeds' => [Discord::embed('🎬 Copa Planeta', 'Inscripciones abiertas')]]);
Discord::anunciarEvento('Desafío Técnico del Día', $inicio, $fin, 'Transmite el partido con 4 cámaras.');
Discord::anunciarMantenimiento('Actualizamos el servidor.', time() + 1800);               // canal "estado"
```

Devuelve true/false (nunca lanza error). Nunca menciona a nadie (ni @everyone). **Nunca** publicar compras ni datos
personales: si el texto tiene un correo o un número de teléfono, no se publica (y queda una nota en el registro).
Ideas de dónde llamarlo: al empezar y terminar un evento en línea (resultado con nombres públicos de productoras y
asociaciones), al activar o quitar el mantenimiento en el Centro de Control.

## 7. Botón "Vincular Discord" en el juego

En `js/api.js`, junto a las otras llamadas:

```js
  Api.discordCodigo = () => req('POST', '/api/discord/codigo', {});
  Api.discordDesvincular = () => req('POST', '/api/discord/desvincular', {});
```

En `js/ui.js`, en la sección de la cuenta (solo con sesión y si el servidor responde):

```js
  // Botón (dentro de lo que se pinta cuando Api.estado.logueado):
  //   `<button class="btn" data-act="discord">${Api.estado.discord_vinculado ? '✅ Discord vinculado' : '🎮 Vincular Discord'}</button>`
  // En el switch (a) de los clics:
  //   case 'discord': abrirDiscord(); break;
  async function abrirDiscord() {
    let r;
    try { r = await Api.discordCodigo(); } catch (err) { toast(err.message); return; }
    const fin = Date.now() + r.segundos * 1000;
    openModal(`<h2>Vincular Discord</h2>
      <p>1. ${r.invitacion ? `Entra al <a href="${esc(r.invitacion)}" target="_blank" rel="noopener">Discord oficial</a>.` : 'Entra al Discord oficial del juego.'}</p>
      <p>2. Escribe este comando en cualquier canal:</p>
      <p style="font-size:1.6em;letter-spacing:.12em;text-align:center"><b>${esc(r.codigo)}</b></p>
      <p class="muted small" style="text-align:center"><code>${esc(r.comando)}</code> · vence en <span id="dc-t">10:00</span></p>
      <p class="muted small">Nadie del equipo te pedirá este código ni tu clave. Úsalo solo tú, en el comando /vincular.</p>
      <button class="btn main" id="dc-copiar">Copiar comando</button>
      ${Api.estado.discord_vinculado ? '<button class="btn" id="dc-quitar">Desvincular Discord</button>' : ''}
      <button class="btn" data-act="close">Cerrar</button>`);
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((fin - Date.now()) / 1000)), el = document.getElementById('dc-t');
      if (!el) return clearInterval(t);
      el.textContent = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'vencido (pide otro)';
    }, 1000);
    document.getElementById('dc-copiar').onclick = () => navigator.clipboard && navigator.clipboard.writeText(r.comando).then(() => toast('Copiado'));
    const q = document.getElementById('dc-quitar');
    if (q) q.onclick = async () => { try { await Api.discordDesvincular(); await Api.refrescar(); closeModal(); toast('Discord desvinculado'); render(); } catch (err) { toast(err.message); } };
  }
```

(Usa `openModal`, `closeModal`, `esc`, `toast` y `render` que ya existen dentro de `ui.js`. Los textos se pueden pasar
a `js/i18n.js` como el resto.)

## 8. Probar

```bash
php server/tests/pruebas_discord.php        # GUARDAR_TMP=1 para dejar los archivos de la prueba
```

Arranca un Discord falso y el juego con `php -S`, aplica los bloques de arriba sobre copias de `api.php` y de
`nginx-sitio.sh`, firma las peticiones con Ed25519 de verdad y (si la máquina tiene nginx y php-fpm) prueba también
`/discord/interacciones` con nginx + php-fpm (la respuesta antes del trabajo lento con `fastcgi_finish_request`).
