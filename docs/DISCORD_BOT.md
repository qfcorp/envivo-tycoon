# Bot de Discord de EN VIVO Tycoon — guía para el dueño

El bot conecta el Discord oficial con el juego:

- **/vincular codigo:XXXXXXXX** — el jugador une su productora con su Discord y recibe sus roles solo:
  `Jugador verificado`, `Comprador verificado` (si compró alguna vez), `VIP` (mientras tenga el Pase VIP),
  `Presidente de asociación` y el de su servidor del juego (`Servidor 1 · Quito`).
- **/desvincular** — quita el vínculo y esos roles.
- **/perfil [usuario]** — perfil público: nombre de la productora, servidor, fama, asociación y capítulo de la historia.
  Nunca muestra correo, compras ni dinero.
- **/ranking** — productoras y asociaciones con más fama del servidor del juego.
- **/eventos** — eventos en línea de ahora y los próximos, con cuenta regresiva.
- **/ayuda** — cómo pedir soporte (en el juego: **Ayuda y soporte**, o el correo de soporte) y el aviso de que el staff
  nunca pide contraseñas.
- Los roles se revisan solos cada 10 minutos (VIP vencido, compras nuevas, cambios de asociación o de servidor).
- El juego puede publicar anuncios, eventos y mantenimientos en los canales con webhooks.
- Responde en español, inglés o portugués según el idioma del Discord de cada jugador.

No hay que tener ningún programa del bot prendido: Discord le manda cada comando al servidor del juego
(`https://juego.tukanec.com/discord/interacciones`) y PHP responde. Es la misma aplicación "EN VIVO Bot" que usa
`discord/configurar_servidor.js` para armar el servidor (mismo token).

> **El token del bot y los webhooks son como la clave de una cuenta.** Van SOLO en `/etc/envivo/config.env` del VPS.
> Nunca en GitHub (el repositorio es público), nunca en capturas ni en el chat. Si se filtran: Developer Portal >
> Bot > **Reset Token** (y para un webhook: borrarlo y crear otro).

---

## 1. Crear la aplicación (Discord Developer Portal)

1. Entra a <https://discord.com/developers/applications> con tu cuenta de Discord. Si ya existe "EN VIVO Bot", ábrela;
   si no: **New Application** → nombre `EN VIVO Bot` → acepta los términos.
2. **General Information**:
   - Copia **Application ID** → será `DISCORD_APP_ID`.
   - Copia **Public Key** → será `DISCORD_PUBLIC_KEY`.
   - Ícono y descripción a tu gusto. Pon el enlace de términos y privacidad del juego.
3. **Bot**:
   - **Reset Token** → copia el token (solo se ve una vez) → será `DISCORD_BOT_TOKEN`.
   - Apaga **Public Bot** (así nadie más puede meter el bot en otro servidor).
   - Los "Privileged Gateway Intents" se quedan **apagados** (no hacen falta).
4. Copia el **ID del servidor de Discord**: en Discord, Ajustes de usuario > Avanzado > **Modo desarrollador** encendido;
   luego clic derecho en el servidor > **Copiar ID del servidor** → será `DISCORD_GUILD_ID`.

## 2. Invitar el bot al servidor

En **OAuth2 > URL Generator** marca los permisos (scopes) **bot** y **applications.commands**, y en "Bot Permissions"
marca **Manage Roles** (Gestionar roles). Abre la dirección que aparece abajo y elige el servidor oficial.

O directamente (cambia `TU_APP_ID`):

```
https://discord.com/oauth2/authorize?client_id=TU_APP_ID&scope=bot+applications.commands&permissions=268435456
```

### Muy importante: el orden de los roles

Discord solo deja que el bot ponga roles que estén **por debajo** del rol del bot.

En Discord: **Ajustes del servidor > Roles**, arrastra el rol **EN VIVO Bot** (o el rol "Bots") **ARRIBA** de:
`VIP`, `Comprador verificado`, `Presidente de asociación`, `Jugador verificado` y todos los `Servidor N · Ciudad`.
(Los roles de idioma y los del staff pueden quedar donde estén: el bot nunca los toca.)

Si el orden está mal, el bot no se rompe: deja un aviso en el panel (`/admin.php`, avisos) que dice "el rol del bot debe
estar ARRIBA" y lo reintenta solo cada hora.

## 3. Webhooks para los anuncios (opcional pero recomendado)

En cada canal: **Editar canal > Integraciones > Webhooks > Nuevo webhook > Copiar URL del webhook**.

| Canal (de `discord/estructura.json`) | Variable |
|---|---|
| 📢┃anuncios | `DISCORD_WEBHOOK_ANUNCIOS` |
| 🎪┃eventos-en-curso | `DISCORD_WEBHOOK_EVENTOS` |
| 🟢┃estado-del-servidor | `DISCORD_WEBHOOK_ESTADO` |

El juego nunca publica compras ni datos personales, y nunca menciona a nadie (ni @everyone).

## 4. Poner los datos en el servidor (VPS)

Por SSH:

```bash
sudo nano /etc/envivo/config.env
```

Agrega al final (con tus datos):

```ini
DISCORD_APP_ID=123456789012345678
DISCORD_PUBLIC_KEY=pega_aqui_la_public_key
DISCORD_BOT_TOKEN=pega_aqui_el_token
DISCORD_GUILD_ID=123456789012345678
DISCORD_WEBHOOK_ANUNCIOS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_EVENTOS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_ESTADO=https://discord.com/api/webhooks/...
DISCORD_INVITACION=https://discord.gg/tu-invitacion
```

Guarda (Ctrl+O, Enter, Ctrl+X) y recarga PHP:

```bash
sudo systemctl reload php8.3-fpm
```

(Opcional) Si cambiaste el nombre de algún rol en Discord, se puede indicar el nombre nuevo con `DISCORD_ROL_VIP=...`,
`DISCORD_ROL_VERIFICADO=...`, `DISCORD_ROL_COMPRADOR=...`, `DISCORD_ROL_PRESIDENTE=...`, o el id directo con
`DISCORD_ROLES_JSON={"VIP":"123..."}`. Si los nombres son los de `discord/estructura.json`, no hace falta nada.

## 5. Actualizar el juego y registrar los comandos

Primero quien mantiene el servidor aplica `server/INTEGRAR_DISCORD.md` (la ruta en `api.php`, el bloque de nginx y el cron).
Después:

```bash
sudo bash /var/www/envivo/server/deploy/actualizar.sh
sudo -u www-data php /var/www/envivo/server/bin/discord_comandos.php
```

Debe decir: `Listo: 6 comandos registrados globales: /vincular /desvincular /perfil /ranking /eventos /ayuda`.
(Para que aparezcan al instante en tu servidor mientras pruebas: agrega `--servidor` al final.)

## 6. Conectar Discord con el servidor del juego

En el Developer Portal > **General Information** > **Interactions Endpoint URL** escribe:

```
https://juego.tukanec.com/discord/interacciones
```

y **Save Changes**. Discord prueba la dirección en ese momento: si sale en verde, quedó. Si dice que no es válida:

- Revisa que `DISCORD_PUBLIC_KEY` esté bien copiada y que recargaste PHP.
- Revisa que nginx tenga el bloque de `/discord/interacciones` (`curl -i https://juego.tukanec.com/discord/interacciones`
  debe responder **405**, no 404).
- Si el dominio pasa por Cloudflare con la nube naranja: en Cloudflare > Security > WAF crea una regla que **salte**
  (Skip) Bot Fight Mode / desafíos para la ruta `/discord/interacciones`.

## 7. Probar

1. En el juego, entra a tu cuenta y toca **Vincular Discord**: sale un código de 8 caracteres (dura 10 minutos).
2. En Discord, en el canal 🔗┃vincular-cuenta, escribe `/vincular` y pega el código.
3. El bot responde (solo lo ves tú) y te pone los roles.
4. Prueba `/perfil`, `/ranking`, `/eventos` y `/ayuda`.

Revisar la sincronización a mano:

```bash
sudo -u www-data php /var/www/envivo/server/bin/discord_sync.php --detalle
tail -n 20 /var/log/envivo-discord.log
```

## Preguntas frecuentes

- **"Ese código no es válido o ya venció"**: el código dura 10 minutos y sirve una sola vez; pide otro en el juego.
- **"Primero únete al servidor oficial"**: el jugador vinculó sin estar en el Discord. Queda vinculado; cuando entre,
  los roles llegan solos en máximo una hora (o al instante si vuelve a usar `/vincular` con un código nuevo).
- **Alguien quitó un rol a mano**: el bot lo repone en la próxima revisión. Para quitar un rol del juego de verdad hay que
  cambiarlo en el juego (por ejemplo, el VIP vence solo).
- **Cuenta bloqueada en el juego**: el bot le quita los roles del juego en la siguiente revisión.
- **Límites de Discord**: si Discord pide esperar, el bot espera y sigue; lo que no alcance queda para la próxima vuelta.
- **Seguridad**: cada petición de Discord viene firmada; sin firma válida el servidor responde 401. El token nunca se
  escribe en los registros. El staff nunca debe pedir contraseñas ni códigos de vinculación.
