# Correo del juego: soporte@tukanec.com y "¿Olvidaste tu contraseña?"

Guía para Dimitry, paso a paso. Son dos cosas distintas:

| Para qué | Qué se usa | Costo |
|---|---|---|
| **Recibir** correos en `soporte@tukanec.com` (los jugadores te escriben) | Cloudflare Email Routing: reenvía a tu Gmail | Gratis |
| **Enviar** correos desde el juego (enlace para recuperar la contraseña) | Un proveedor de correo transaccional por SMTP: **Brevo** (recomendado) o Resend | Gratis (Brevo: 300 correos al día) |

Cloudflare Email Routing **solo recibe**: no sirve para mandar. Por eso hacen falta las dos partes.

Mientras no configures el envío, el juego funciona igual, pero los correos de recuperar la contraseña **no salen**:
quedan escritos en `/var/lib/envivo/correos.log` (ver el paso 5).

---

## Paso 0. Antes de empezar: ¿ya tienes correos @tukanec.com en un hosting?

Abre Cloudflare → `tukanec.com` → **DNS** → **Records** y mira si hay registros de tipo **MX**.

- **No hay ningún MX** → sigue con el paso 1 tal cual.
- **Sí hay MX** (por ejemplo de tu hosting cPanel, de Google Workspace o de Zoho) → **NO actives Email Routing**: borraría
  esos MX y dejarías de recibir los correos que ya usas en `@tukanec.com`. En ese caso crea el buzón
  `soporte@tukanec.com` en ese mismo hosting y salta al paso 2.

## Paso 1. Recibir: soporte@tukanec.com con Cloudflare Email Routing (gratis)

1. Entra a <https://dash.cloudflare.com> → elige **tukanec.com**.
2. Menú de la izquierda: **Email** → **Email Routing** → **Get started** (o "Empezar").
3. **Custom address**: escribe `soporte`. **Destination**: tu Gmail. Toca **Create and continue**.
4. Cloudflare te manda un correo a tu Gmail: ábrelo y toca **Verify email address**.
5. Cloudflare pide agregar los registros DNS (MX y un TXT de SPF). Toca **Add records and enable**. Listo.
6. Prueba: desde otro correo escribe a `soporte@tukanec.com`. Debe llegar a tu Gmail en menos de un minuto.

> Para contestar a los jugadores desde `soporte@tukanec.com` (y no desde tu Gmail), en Gmail ve a
> Configuración → Cuentas → "Enviar como" → Agregar otra dirección, y usa los datos SMTP de Brevo del paso 2.
> Es opcional: contestar desde tu Gmail también funciona.

## Paso 2. Enviar: cuenta gratis en Brevo

1. Crea la cuenta en <https://www.brevo.com> (plan **Free**: 300 correos al día, de sobra para recuperar claves).
2. Arriba a la derecha: tu nombre → **Senders, Domains & Dedicated IPs** → pestaña **Domains** → **Add a domain** →
   escribe `tukanec.com`.
3. Brevo ofrece **"Authenticate with Cloudflare"** (lo hace solo): úsalo si aparece. Si no, elige "Authenticate the
   domain yourself" y **copia EXACTAMENTE** los registros que te muestra (paso 3).
4. En **Senders** → **Add a sender**: nombre `EN VIVO Tycoon`, correo `no-responder@tukanec.com`.
   (Si Brevo pide confirmarlo con un código, crea antes `no-responder` en Email Routing igual que `soporte` en el
   paso 1, recibe el código en tu Gmail y después puedes dejarlo así: no estorba.)
5. Menú: tu nombre → **SMTP & API** → pestaña **SMTP** → **Generate a new SMTP key** → nombre `envivo` → copia la clave
   (sale UNA vez; guárdala en tu gestor de claves). En esa misma página verás:
   - **SMTP Server**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Login**: algo como `8a1b2c003@smtp-brevo.com` (cópialo tal cual; NO es tu correo de Gmail)

## Paso 3. DNS en Cloudflare: SPF, DKIM y DMARC (para que no caiga en spam)

En Cloudflare → `tukanec.com` → **DNS** → **Records** → **Add record**. Pon la **nube en gris (DNS only)** en todos.

**a) DKIM y código de Brevo** (copia los valores de la pantalla de Brevo; estos son ejemplos de cómo se ven):

| Tipo | Nombre | Contenido (ejemplo: usa el tuyo) |
|---|---|---|
| TXT | `@` | `brevo-code:1234abcd...` |
| CNAME | `brevo1._domainkey` | `b1.tukanec-com.dkim.brevo.com` |
| CNAME | `brevo2._domainkey` | `b2.tukanec-com.dkim.brevo.com` |

**b) SPF: UN solo registro TXT que empieza con `v=spf1`** (si hay dos, los dos fallan). Si hiciste el paso 1, ya existe
uno de Cloudflare: **edítalo** (no agregues otro) para que quede así:

```
v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
```

Si NO usas Email Routing (tienes hosting con MX), agrega `include:spf.brevo.com` dentro del SPF que ya tienes, antes del `~all`.

**c) DMARC** (si Brevo no lo creó solo):

| Tipo | Nombre | Contenido |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:soporte@tukanec.com` |

Espera 5–30 minutos y en Brevo toca **Authenticate / Verify** en el dominio: deben salir en verde **Brevo code, DKIM y
DMARC**.

## Paso 4. Poner los datos en el servidor

Por SSH en el VPS:

```bash
sudo nano /etc/envivo/config.env
```

Busca (o escribe al final, si no están) estas líneas y complétalas. `actualizar.sh` las agrega solas vacías la próxima
vez que actualices.

```ini
SOPORTE_CORREO=soporte@tukanec.com
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SEGURIDAD=tls
SMTP_USUARIO=8a1b2c003@smtp-brevo.com
SMTP_CLAVE=xsmtpsib-la-clave-que-copiaste-en-el-paso-2
SMTP_DE=no-responder@tukanec.com
SMTP_NOMBRE=EN VIVO Tycoon
```

> Si tu `config.env` ya tenía `SOPORTE_CORREO=` vacío, escríbelo tú: el actualizador nunca cambia una línea que ya existe.

Guarda con **Ctrl+O**, **Enter**, **Ctrl+X** y recarga PHP:

```bash
sudo systemctl reload php8.3-fpm
```

## Paso 5. Probar

```bash
sudo -u www-data php /var/www/envivo/server/bin/correo_prueba.php tucorreo@gmail.com
```

- `OK: el servidor SMTP aceptó el correo` → revisa tu Gmail (y spam). El enlace de ese correo de prueba no sirve; es solo
  para ver que llega y cómo se ve.
- `NO SALIÓ: ...` → el mensaje dice por qué. Los más comunes:
  - `535` → usuario o clave SMTP mal copiados (el usuario es el **Login** de Brevo, no tu correo).
  - `no se pudo conectar` → revisa `SMTP_HOST` y `SMTP_PORT`. Si tu VPS bloquea el 587, usa
    `SMTP_PORT=465` y `SMTP_SEGURIDAD=ssl`.
  - `sender not valid` / `MAIL FROM` → el remitente `SMTP_DE` no está agregado o verificado en Brevo (paso 2.4).
- Prueba de punta a punta: abre el juego → **Entrar** → **¿Olvidaste tu contraseña?** → tu correo → abre el enlace →
  elige la clave nueva.
- Opcional: manda la prueba a la dirección que te da <https://www.mail-tester.com> y mira la nota (9/10 o más es bien).

**Sin SMTP todavía** (o si un jugador te escribe que no le llega): los correos quedan en el archivo. Puedes ver el último
enlace y mandárselo tú (sirve 30 minutos y una sola vez):

```bash
sudo tail -n 1 /var/lib/envivo/correos.log
```

Cuando el SMTP ya funcione, borra ese archivo: `sudo rm /var/lib/envivo/correos.log`.

## Alternativa: Resend (en vez de Brevo)

Gratis 3.000 correos al mes (100 al día), un dominio. En <https://resend.com> → **Domains** → **Add domain** →
`tukanec.com` (tiene botón para configurarlo solo en Cloudflare; si no, copia sus registros: DKIM `resend._domainkey`,
y MX + TXT de SPF en el subdominio `send`). Luego **API Keys** → crea una clave. En `config.env`:

```ini
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SEGURIDAD=ssl
SMTP_USUARIO=resend
SMTP_CLAVE=re_la_clave_de_api
SMTP_DE=no-responder@tukanec.com
```

## Cómo funciona (resumen)

- El jugador toca **¿Olvidaste tu contraseña?** y escribe su correo. El juego responde **lo mismo** exista o no la
  cuenta (nadie puede averiguar qué correos están registrados).
- Si la cuenta existe, le llega un enlace `https://juego.tukanec.com/recuperar.html#t=...` que sirve **una sola vez** y
  **vence en 30 minutos**. En la base solo se guarda una "huella" (sha256) del enlace.
- Al elegir la clave nueva se **cierran todas las sesiones** de esa cuenta (en todos los celulares) y queda abierta solo
  la de ese navegador. Le llega otro correo: "Tu contraseña cambió" (si no fue él, responde a soporte).
- Límites: 3 enlaces por correo y 20 por conexión cada hora; 30 intentos de usar enlaces cada 10 minutos.
- Las cuentas baneadas no reciben enlace.
