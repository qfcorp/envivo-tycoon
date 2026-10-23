# Publicar EN VIVO Tycoon en juego.tukanec.com (VPS de OVH)

Guía para copiar y pegar. Tiempo total: **1 hora y cuarto** la primera vez, por partes (puedes parar al final de cualquier paso).
Nada de esto toca TuPass, el ERP ni los otros sitios del VPS.
Al final el juego queda en **https://juego.tukanec.com** con la tienda en **modo de pruebas** (no cobra de verdad),
el Centro de Control protegido con clave y código del celular, y respaldo y alertas a tu Telegram.

| Paso | Qué | Tiempo |
|---|---|---|
| 1 | Dirección "juego" en Cloudflare | 5 min |
| 2 | Instalar el juego en el VPS (también deja lista la configuración, Node 22 y el validador) | 15 min |
| 3 | Mirar qué líneas de la configuración llenas tú (no hay que pegar nada) | 2 min |
| 4 | Claves de Plux en modo de pruebas | 5 min |
| 5 | Comprobar el validador de partidas (eventos en línea) | 1 min |
| 6 | Entrar al Centro de Control y activar el código del celular (2FA) | 10 min |
| 7 | Respaldos y alertas por Telegram | 20 min |
| 8 | Comprobar que todo funciona | 10 min |
| 9 | Proteger la cuenta de GitHub | 5 min |

**Lo hace solo el instalador:** bajar el juego, la configuración completa (con sus claves al azar), las tablas, las
tareas programadas, Node 22, el validador de partidas, nginx y el certificado.
**Lo haces tú a mano:** las claves de Plux (paso 4), el código del celular (paso 6), Telegram y restic (paso 7)
y, más adelante, las claves de Discord (`docs/DISCORD_BOT.md`).

**Antes de empezar, ten a mano:**
- PuTTY abierto en el VPS (como siempre).
- Las claves de **producción** de Pago Plux (panel de Plux, sección Desarrolladores). La integración es la misma de TuPass, ya certificada por Plux: se cobra de verdad desde el primer día.
- En el celular, una app de códigos: **Google Authenticator** (gratis en Play Store) o la que ya uses.

> 💡 **Truco para los bloques de varias líneas:** antes de pegar un bloque largo, corre solo esto y escribe tu clave:
> `sudo -v` . Así `sudo` no te pide la clave en medio del bloque.

> 🔒 **Regla de oro:** ninguna clave va a GitHub (el repositorio es público), ni a un chat, ni a una captura.
> Todas viven solo en `/etc/envivo/` del VPS. En esta guía, donde dice `PEGA_AQUI...` va tu dato.

---

## Paso 1. Crear la dirección "juego" en Cloudflare (5 minutos)

1. Entra a **dash.cloudflare.com** y abre el dominio **tukanec.com**.
2. Menú izquierdo: **DNS** → **Records** → botón **Add record**.
3. Llena así:
   - **Type:** `A`
   - **Name:** `juego`
   - **IPv4 address:** la IP de tu VPS de OVH (está en el panel de OVH; si no la tienes a mano, el instalador del paso 2 la muestra al final).
   - **Proxy status:** apágalo para que quede la **nube gris** ("DNS only"). Así el certificado del paso 2 sale sin problemas.
4. Toca **Save**.

> ⚠️ Si ya creaste (o vas a crear) una regla para que **tukanec.com** redirija a **tukansoftware.com**, revisa que la regla
> sea solo para `tukanec.com` y `www.tukanec.com`, **no** para `*.tukanec.com`. Si no, el juego también se iría a la otra página.

---

## Paso 2. Instalar el juego en el VPS (15 minutos)

1. Entra a tu VPS por **PuTTY** como siempre.
2. Copia esta línea completa, pégala (clic derecho en PuTTY) y presiona **Enter**:

```
curl -fsSL https://raw.githubusercontent.com/qfcorp/envivo-tycoon/main/server/deploy/instalar.sh -o /tmp/instalar_envivo.sh && sudo bash /tmp/instalar_envivo.sh
```

3. Te va a pedir tu contraseña de `sudo` (no se ve mientras escribes: es normal).
4. Te pregunta un **usuario** y una **clave para el Centro de Control** (mínimo 10 caracteres).
   Inventa unos nuevos y **anótalos**: con ellos entras a ver ventas, jugadores y soporte.
5. Después trabaja solo unos minutos: baja el juego, completa la configuración, instala **Node 22** y enciende el
   **validador de partidas** (lo que repite los eventos en línea para que nadie haga trampa). No tienes que hacer nada.
6. Cuando pregunte si quieres sacar el **certificado HTTPS** escribe `s` y Enter
   (si dice que el DNS todavía no apunta, espera 5 minutos y vuelve a correr la línea del punto 2).
7. Al final muestra la lista **RESULTADO**. Debe decir:
   - `3) Prueba de la API en este servidor: 200`
   - `4) Prueba de que el codigo esta protegido: 404`
   - `5) Centro de Control /control/: con usuario y clave (falta el codigo del celular)` (el código se pone en el paso 6)
   - `6) Plux: SIN credenciales` (normal: se ponen en el paso 4)
   - `7) HTTPS: si`
   - `8) Validador de partidas: activo`

   **Mándame una captura de esa lista** y la reviso.

Para volver a correr el instalador más adelante (no borra nada, no duplica nada, no cambia lo que ya escribiste):

```
sudo bash /var/www/envivo/server/deploy/instalar.sh
```

> Si ya lo habías instalado antes, igual corre la línea del punto 2 (o esta última): agrega solo lo que falta
> (las líneas nuevas de la configuración y el validador) y deja tus claves como estaban.

### Qué dejó programado el instalador (no tienes que hacer nada)

El instalador deja estas tareas en el cron del usuario `www-data` (cada vez que corre, las vuelve a escribir sin repetirlas):

| Cuándo | Qué hace | Registro |
|---|---|---|
| Todos los días a las 4:10 | Tarea diaria del juego (`bin/tareas.php`) | `/var/log/envivo-tareas.log` |
| Cada 6 horas (minuto 25) | Google Play: reembolsos y avisos pendientes (`bin/google_anulados.php`) | `/var/log/envivo-tareas.log` |
| Cada 10 minutos | Roles del bot de Discord (`bin/discord_sync.php`) | `/var/log/envivo-discord.log` |
| Cada 10 minutos | Mega Festival (`bin/festival.php`) | `/var/log/envivo-festival.log` |
| Lunes 0:01 y cada hora (minuto 15) | Liga Semanal (`bin/liga.php`) | `/var/log/envivo-liga.log` |
| Cada 10 minutos | Copa de Servidores (`bin/copas.php`) | `/var/log/envivo-copas.log` |
| Todos los días a las 0:20 | Salud de los servidores y avisos de abandono (`bin/salud_servidores.php`) | `/var/log/envivo-servidores.log` |

Para verlas: `sudo crontab -u www-data -l` (deben salir **8 líneas**).
Mientras Discord no esté configurado, `envivo-discord.log` solo dice "el bot no está configurado. Nada que hacer": es normal.

---

## Paso 3. La configuración: qué líneas llenas tú (2 minutos, no hay que pegar nada)

El instalador deja `/etc/envivo/config.env` **completo**: pone todas las líneas, vacías o con su valor normal, y crea
solo las claves al azar (la del aviso de pago de Plux y la del validador). Cada vez que corre `instalar.sh` o
`actualizar.sh` agrega las líneas nuevas que traiga el juego, **sin cambiar las que ya llenaste**
(antes de cambiar algo guarda una copia: `/etc/envivo/config.env.antes-FECHA`).

### Todas las líneas de la configuración: cuáles llenas tú y cuándo

Para editar: `sudo nano /etc/envivo/config.env` → buscar una línea con **Ctrl + W**, escribir el nombre y Enter →
escribir después del `=` → guardar con **Ctrl + O**, Enter, salir con **Ctrl + X** → `sudo systemctl reload php8.3-fpm`.
Si una línea aparece dos veces, **vale la de más abajo**.

| Línea | Quién la llena | Cuándo |
|---|---|---|
| `ENVIVO_DB`, `ENVIVO_URL`, `ENVIVO_ZONA` | El instalador | No tocar |
| `ENVIVO_ADMIN_USUARIO`, `ENVIVO_ADMIN_CLAVE_HASH` | El instalador (lo que contestaste en el paso 2) | Para cambiar la clave, ver "Si algo sale mal" |
| `PLUX_AMBIENTE` | Viene en `produccion` (cobra de verdad) | Solo para pruebas: `sandbox` con claves de pruebas |
| `PLUX_ID_ESTABLECIMIENTO`, `PLUX_ID_CLIENTE`, `PLUX_CLAVE_SECRETA`, `PLUX_LLAVE_PUBLICA` | Tú, del panel de Plux | Paso 4 |
| `PLUX_WEBHOOK_USUARIO`, `PLUX_WEBHOOK_CLAVE` | El instalador (clave al azar) | Solo se los das a Plux si te piden el "aviso de pago" |
| `SOPORTE_CORREO`, `SOPORTE_HORARIO` | Tú | Cuando tengas el correo de soporte (ver "Antes de cobrar") |
| `GOOGLE_PACKAGE_NAME`, `GOOGLE_SERVICE_ACCOUNT_JSON` | Ya vienen puestos | Se usan con Google Play (`docs/ANDROID_GOOGLE_PLAY.md`) |
| `ENVIVO_ADMIN_TOTP` | Tú | Paso 6 |
| `ENVIVO_CONTROL_IPS` | Tú (opcional) | Paso 6 |
| `ENVIVO_CONTROL_TOPE_CREDITOS` | Vacío = 20.000 créditos a mano por día | Solo si quieres otro tope (0 = sin tope) |
| `DISCORD_...` (9 líneas) | Tú | Con `docs/DISCORD_BOT.md` |
| `FESTIVAL_INICIO`, `LIGA_VALIDACION`, `LIGA_SECRETO`, `NODE_BIN` | Dejar como están | — |
| `VALIDADOR_URL`, `VALIDADOR_CLAVE` | El instalador (clave al azar, la misma del validador) | No tocar |

> ⚠️ Nunca agregues `PLUX_API_BASE`, `GOOGLE_API_BASE` ni `GOOGLE_TOKEN_URL`: son solo para pruebas del programador.

---

## Paso 4. Poner las claves de Plux en modo de pruebas (5 minutos)

1. En el VPS, abre el archivo de configuración:

```
sudo nano /etc/envivo/config.env
```

2. Baja con las flechas hasta las líneas que empiezan con `PLUX_` y escribe después del `=` las claves de **producción**
   de tu cuenta de Pago Plux (las del panel de Plux, sección Desarrolladores). **Deja `PLUX_AMBIENTE=produccion`.**
   - `PLUX_ID_ESTABLECIMIENTO=PEGA_AQUI`
   - `PLUX_ID_CLIENTE=PEGA_AQUI`
   - `PLUX_CLAVE_SECRETA=PEGA_AQUI`
   - `PLUX_LLAVE_PUBLICA=PEGA_AQUI` (la llave pública en una sola línea, sin `-----BEGIN` ni `-----END`)
3. Guarda: **Ctrl + O**, Enter, y sal con **Ctrl + X**.
4. Aplica los cambios:

```
sudo systemctl reload php8.3-fpm
```

> 🔒 Estas claves **nunca** van a GitHub (el repositorio es público). Solo viven en ese archivo del VPS.

---

## Paso 5. Comprobar el validador de partidas (1 minuto)

Los eventos en línea (Liga Semanal, Mega Festival, Duelos, Desafío del Día) los **repite el servidor** para que nadie haga
trampa. El instalador del paso 2 ya instaló **Node 22**, creó la clave entre el juego y el validador y encendió el
servicio `envivo-validador` (solo escucha dentro del mismo servidor: no hay que tocar nginx ni el firewall).

Solo comprueba:

```
systemctl is-active envivo-validador
```

Debe decir **`active`** (y en la lista RESULTADO del paso 2, `8) Validador de partidas: activo`).

Si dice otra cosa: vuelve a correr `sudo bash /var/www/envivo/server/deploy/instalar.sh` y, si sigue igual,
mándame lo que sale de `sudo journalctl -u envivo-validador -n 50`.
(Si el servicio se cae, el juego sigue funcionando: usa Node directo, solo que más lento.)

---

## Paso 6. Entrar al Centro de Control y activar el código del celular (10 minutos)

El Centro de Control es **tu panel**: ventas, jugadores, compras, productos y ofertas, mercado, chat, soporte y ajustes
(mantenimiento, anuncio). Está en **https://juego.tukanec.com/control/** (la dirección vieja `/admin.php` te lleva ahí sola).

### 6.1 Primera entrada (sin código todavía)

1. En el celular abre **https://juego.tukanec.com/control/**
2. Escribe el **usuario** y la **clave** del paso 2 → **Entrar**.
3. Debe abrir la pestaña **Resumen**. Abajo de la entrada dice "Recomendado: activa el segundo factor": eso es lo que sigue.

> Después de **5 intentos equivocados** la entrada se bloquea **15 minutos**. Cada entrada queda anotada en la auditoría.

### 6.2 Activar el código de 6 dígitos (2FA)

Hazlo en este orden (primero la app, después el servidor) para no quedarte afuera.

1. En el VPS, crea tu secreto:

```
php /var/www/envivo/server/bin/control_totp.php dimitry
```

   Muestra dos líneas: `ENVIVO_ADMIN_TOTP=` seguido de **32 letras y números** (tu secreto), y un enlace `otpauth://...`.
   🔒 **No le saques captura** ni lo mandes por chat: es como una clave.

2. En el celular, abre **Google Authenticator** → botón **+** → **Introducir una clave de configuración**:
   - **Cuenta:** `EN VIVO Control`
   - **Clave:** las 32 letras y números (sin `ENVIVO_ADMIN_TOTP=`)
   - **Tipo de clave:** Basada en el tiempo → **Añadir**.

3. Comprueba que la app y el servidor coinciden (cambia `PEGA_AQUI_EL_SECRETO` por tus 32 letras y números):

```
php /var/www/envivo/server/bin/control_totp.php --codigo PEGA_AQUI_EL_SECRETO
```

   Debe mostrar **el mismo número de 6 dígitos** que la app en ese momento (cambia cada 30 segundos).

4. Ponlo en el servidor: `sudo nano /etc/envivo/config.env` → **Ctrl + W** → escribe `ENVIVO_ADMIN_TOTP` → Enter →
   pega tu secreto después del `=` (queda `ENVIVO_ADMIN_TOTP=PEGA_AQUI_EL_SECRETO`) → **Ctrl + O**, Enter, **Ctrl + X**. Luego:

```
sudo systemctl reload php8.3-fpm
```

5. Abre otra vez **https://juego.tukanec.com/control/**: ahora pide **usuario, clave y código de la app de autenticación**.
   Cada código sirve **una sola vez**. Activar o cambiar el secreto cierra todas las sesiones abiertas del panel.

> Si pierdes el celular: en el VPS deja la línea vacía (`ENVIVO_ADMIN_TOTP=`), recarga PHP, entra solo con clave
> y vuelve a hacer este paso 6.2 con el celular nuevo.

### 6.3 (Opcional) Que el panel solo abra desde tus redes

Con `ENVIVO_CONTROL_IPS` el panel **solo existe** para esas direcciones: desde cualquier otra da "404", como si no hubiera nada.

⚠️ **Úsalo solo si tienes una IP fija** (por ejemplo el internet de la oficina). Los datos móviles en Ecuador cambian de IP
seguido, y te dejarías afuera. Si no tienes IP fija, con el código del paso 6.2 ya estás bien protegido.

1. Desde la red que quieres permitir, abre **https://ifconfig.me** y anota el número que sale.
2. `sudo nano /etc/envivo/config.env` → en la línea `ENVIVO_CONTROL_IPS=` escribe las IPs separadas por coma, por ejemplo
   `ENVIVO_CONTROL_IPS=PEGA_AQUI_IP_OFICINA, PEGA_AQUI_OTRA_IP` (también acepta rangos como `190.12.34.0/24`).
3. Guarda y `sudo systemctl reload php8.3-fpm`.

Si te quedas afuera: en el VPS deja la línea vacía (`ENVIVO_CONTROL_IPS=`) y recarga PHP.

---

## Paso 7. Respaldos y alertas por Telegram (20 minutos)

La guía completa es `docs/OPERACION.md`. Aquí van los comandos en orden.

### 7.1 Instalar el respaldo de cada noche y el chequeo de salud

```
sudo bash /var/www/envivo/server/deploy/ops/instalar_ops.sh
```

La lista **RESULTADO** debe decir:
- `1) Scripts:` con `respaldo_envivo.sh` y `salud_envivo.sh`.
- `2) Cron de root:` con **dos** líneas (respaldo a la **1:30** y chequeo cada hora en el **minuto 17**).
- `3) Respaldos:` con **1 diario(s)**.
- `4) Telegram:` cómo va a mandar los avisos.
- `5) nginx: zonas instaladas`.

### 7.2 Probar que las alertas llegan a tu Telegram (bot qfserver)

```
sudo salud_envivo.sh --probar-telegram
```

Te debe llegar "🧪 Prueba de alertas de EN VIVO Tycoon…". Si dice `ERROR` o no llega nada, sigue el **paso 2 de
`docs/OPERACION.md`** (te pide mandarme una salida con el token tapado).

### 7.3 Sumar el juego a tu restic de las 2:00 (`/usr/local/bin/backup_restic_erp_qf.sh`)

**3A. Mándame cómo está escrito tu script** (no cambia nada) y **espera mi respuesta** antes del 3B:

```
sudo grep -n "/etc/erp_qf\|/var/www" /usr/local/bin/backup_restic_erp_qf.sh
```

**3B. El cambio** (solo si en el 3A salió **una sola** línea de restic con `/etc/erp_qf`). Copia **todo el bloque** de una vez:
guarda una copia del script, agrega `/etc/envivo` y `/var/backups/envivo` junto a `/etc/erp_qf`, revisa la sintaxis y
si algo sale mal vuelve a la copia.

```
F=/usr/local/bin/backup_restic_erp_qf.sh; COPIA=/root/backup_restic_erp_qf.sh.antes-envivo-$(date +%Y%m%d-%H%M)
if sudo grep -q "/var/backups/envivo" $F; then echo "YA ESTABA: no hay que hacer nada"; else
sudo cp -p $F $COPIA && echo "Copia guardada: $COPIA"
N=$(sudo grep -vE '^[[:space:]]*#' $F | grep -cE '("?)/etc/erp_qf\1([[:space:]\\)"]|$)')
if [ "$N" = "1" ]; then
  sudo sed -i -E '/^[[:space:]]*#/! s#("?)/etc/erp_qf\1([[:space:]\\)"]|$)#\1/etc/erp_qf\1 \1/etc/envivo\1 \1/var/backups/envivo\1\2#' $F
  sudo bash -n $F && echo "SINTAXIS OK" || { sudo cp -p $COPIA $F; echo "ERROR de sintaxis: se volvio a la copia"; }
  echo "--- Lo que cambio:"; sudo diff $COPIA $F
else echo "NO SE CAMBIO NADA: hay $N lineas con /etc/erp_qf. Mandame la salida del paso 3A."; fi; fi
```

Debe decir **`SINTAXIS OK`** y mostrar la misma línea de antes, ahora con `/etc/envivo /var/backups/envivo`. **Mándame una captura.**

**3C. Probar el respaldo completo ahora** (no esperar a las 2:00):

```
sudo bash /usr/local/bin/backup_restic_erp_qf.sh
```

Te debe llegar el ✅ de siempre a Telegram. Para confirmar que el último respaldo ya trae las carpetas del juego:

```
sudo restic -r sftp:respaldo.qfradioec.com:/erp_qf --password-file /etc/restic/password_erp_qf snapshots --latest 1
```

En la columna **Paths** deben aparecer `/etc/envivo` y `/var/backups/envivo`. Si da error de conexión, mándamelo
(tu script se conecta a su manera). Para deshacer el cambio, ver "Deshacer el cambio" en `docs/OPERACION.md`.

---

## Paso 8. Comprobar que todo funciona (10 minutos)

**En el celular:**

| Abre | Qué debes ver |
|---|---|
| https://juego.tukanec.com | El juego carga. Arriba, candado (HTTPS). |
| https://juego.tukanec.com/control/ | La entrada pide usuario, clave **y código de 6 dígitos**. |
| https://juego.tukanec.com/admin.php | Te lleva solo a `/control/`. |
| https://juego.tukanec.com/terminos.html | Los términos (todavía con `[RUC]` y `[CORREO DE SOPORTE]`: normal hasta completarlos). |
| En el juego: **Tienda** → **Crear cuenta** → comprar **700 créditos** con una **tarjeta de pruebas de Plux** | La compra sale aprobada, los créditos llegan, y la tienda avisa que está en **modo de pruebas**. En `/control/` → **Compras** aparece la venta. |
| En el juego: pestaña **En línea** (ya con cuenta) | Salen Liga Semanal, Mega Festival, Duelo de Productoras, Desafío del Día y Copa de Servidores. La Liga pide unirse a una asociación (antes de las productoras de muestra no hay ninguna). |

**En el VPS** (copia una línea a la vez):

| Comando | Qué debe salir |
|---|---|
| `curl -s -o /dev/null -w '%{http_code}\n' https://juego.tukanec.com/` | `200` |
| `curl -s https://juego.tukanec.com/api/estado \| grep -o '"plux":{[^}]*}'` | `"plux":{"disponible":true,"ambiente":"produccion"}` (`false` si faltan las claves del paso 4) |
| `curl -s -o /dev/null -w '%{http_code}\n' https://juego.tukanec.com/server/src/Config.php` | `404` (el código está protegido) |
| `curl -s -o /dev/null -w '%{http_code}\n' https://juego.tukanec.com/control/lib/base.php` | `404` |
| `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://juego.tukanec.com/admin.php` | `302 https://juego.tukanec.com/control/` |
| `curl -sI https://juego.tukanec.com/ \| grep -icE "content-security\|permissions-policy\|strict-transport\|x-frame\|referrer"` | `5` (las 5 cabeceras de seguridad) |
| `curl -s https://juego.tukanec.com/api/soporte/contacto` | `{"ok":true,"correo":"","horario":""}` (con tu correo cuando lo pongas) |
| `systemctl is-active envivo-validador` | `active` |
| `sudo crontab -u www-data -l \| grep -c envivo` | `8` |
| `sudo crontab -u root -l \| grep -c _envivo.sh` | `2` |
| `sudo respaldo_envivo.sh --listar` | Al menos 1 respaldo diario |
| `sudo DRY_RUN=1 salud_envivo.sh` | Una línea con `OK: todo bien` (en esta prueba no manda nada a Telegram) |

Si algo no sale igual, **mándame una captura de esa línea**.

---

## Paso 9. Proteger la cuenta de GitHub (5 minutos)

El VPS baja el juego de GitHub (`qfcorp/envivo-tycoon`, rama `main`). Quien entre a tu GitHub podría meter algo en el
servidor con la siguiente actualización (auditoría A-10). Desde el navegador del celular, en **github.com**:

1. **Tu foto** → **Settings** → **Password and authentication** → **Enable two-factor authentication**
   (usa la misma app del paso 6) y guarda los códigos de recuperación en un lugar seguro.
2. En el repositorio **qfcorp/envivo-tycoon** → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**:
   - **Ruleset name:** `proteger main` · **Enforcement status:** Active
   - **Target branches** → **Add target** → **Include default branch**
   - Deja marcados **Restrict deletions** y **Block force pushes** → **Create**.

(Lo de exigir revisión antes de cada cambio lo vemos juntos, para no frenar las actualizaciones.)

---

## Actualizar el juego más adelante

Cada vez que te avise que hay una versión nueva en GitHub:

```
sudo bash /var/www/envivo/server/deploy/actualizar.sh
```

Baja lo nuevo, agrega a la configuración las líneas nuevas (sin cambiar las tuyas), actualiza las tablas, reinicia el
validador si cambió y recarga PHP. Debe terminar con `Listo.` No borra la base ni tus claves.

Solo si te aviso que **cambió nginx o las tareas programadas**, corre además (es seguro correrlo las veces que quieras):

```
sudo bash /var/www/envivo/server/deploy/instalar.sh
```

Y solo si te aviso que **cambiaron los respaldos o las alertas**:

```
sudo bash /var/www/envivo/server/deploy/ops/instalar_ops.sh
```

> No edites archivos dentro de `/var/www/envivo` ni `/etc/nginx/sites-available/juego.tukanec.com`: la actualización
> los vuelve a escribir (y si hay cambios a mano, `actualizar.sh` se detiene con un ERROR).

---

## Si algo sale mal

| Pasa esto | Haz esto |
|---|---|
| El instalador dice `ERROR` | Mándame la captura completa; no borra nada, se puede volver a correr. |
| `/control/` dice "Centro de Control sin configurar" | Falta usuario o clave: `sudo rm /etc/envivo/config.env` y corre otra vez el instalador **desde PuTTY** (vuelve a pedir usuario y clave; después repite los pasos 4 y 6). |
| Quieres cambiar la clave del panel | `php -r 'echo password_hash(trim(fgets(STDIN)), PASSWORD_BCRYPT), "\n";'` → escribe la clave nueva y Enter → copia lo que sale (empieza con `$2y$`) en `ENVIVO_ADMIN_CLAVE_HASH=` y recarga PHP. |
| "Demasiados intentos fallidos" en `/control/` | Espera 15 minutos. |
| `/control/` da 404 | Revisa `ENVIVO_CONTROL_IPS` (paso 6.3): déjala vacía y recarga PHP. |
| La tienda dice "pago no disponible" | Faltan las claves de Plux (paso 4) o no recargaste PHP. |
| El RESULTADO dice `8) Validador de partidas: NO activo` | Mira el paso 5. |
| Llegó una alerta a Telegram | Mira la tabla "Qué avisos te pueden llegar" en `docs/OPERACION.md`. |
| Algo se rompió después de actualizar | `sudo bash /var/www/envivo/server/deploy/actualizar.sh --anterior` (vuelve a la versión de antes; ver `docs/INCIDENTES.md`). |

**Para producción** (después del demo): nube naranja de Cloudflare `docs/CLOUDFLARE_PRODUCCION.md`, monitor externo
`docs/MONITOREO.md`, qué hacer en un incidente `docs/INCIDENTES.md`, prueba de carga `docs/PRUEBA_CARGA.md` y el
simulacro mensual de restauración (`docs/OPERACION.md`, paso 5).

---

## Antes de cobrar con dinero real (no es para el demo)

1. **Correo de soporte** (solo correo, nunca WhatsApp): créalo (por ejemplo `soporte@tukanec.com`; Cloudflare →
   **Email Routing** lo reenvía gratis a tu Gmail). Ponlo en el VPS en `SOPORTE_CORREO=` y
   `SOPORTE_HORARIO=Lunes a viernes 9:00-18:00`, y recarga PHP. El juego lo muestra en **Ayuda y soporte**.
2. **Páginas legales** (`terminos.html`, `privacidad.html`, `borrar-cuenta.html`): mándame el **RUC**, el **correo de
   soporte**, la **dirección** y la **fecha**, y las completo en GitHub (no las edites en el VPS). Después, que un
   abogado las revise, junto con la lista de nombres parodia de marcas y torneos.
3. **Pago Plux en producción:** la integración es la misma de TuPass (ya certificada). Con las claves de producción
   puestas (paso 4) y `PLUX_AMBIENTE=produccion`, haz una compra real pequeña: la **Oferta de bienvenida ($0,99)**.
   Si Plux te pide la dirección del aviso de pago (webhook): `https://juego.tukanec.com/api/plux/webhook`, con el
   usuario y la clave que están en `PLUX_WEBHOOK_USUARIO` y `PLUX_WEBHOOK_CLAVE` (míralos con
   `sudo grep PLUX_WEBHOOK /etc/envivo/config.env`, sin captura).
4. **Facturación electrónica (SRI):** en `/control/` → **Compras** está el CSV con los datos del comprador de cada venta.
5. **Discord** (`docs/DISCORD.md` y luego `docs/DISCORD_BOT.md`) y **Google Play** (`docs/ANDROID_GOOGLE_PLAY.md`).

---

**Para el técnico:** todo este documento y `docs/PASOS_DEMO_VPS.md` se ensayan de punta a punta en un contenedor
desechable con `bash tests/ensayo_vps.sh` (root; nginx y php8.3-fpm reales, GitHub local con el árbol de trabajo,
systemctl/certbot/Plux/Telegram falsos, Playwright en un celular; capturas en `tests/capturas/ensayo_*.png`).
Comprueba las salidas exactas de los pasos 2, 7 y 8, `actualizar.sh` dos veces y `demo_datos.php`, y lo deja todo limpio.
