# Operación del juego en el VPS: respaldos, alertas y protección

Esta guía es para **después** de publicar el juego (docs/DESPLIEGUE.md). Son comandos para copiar y pegar en PuTTY.
Nada de esto toca el ERP, TuPass ni los otros sitios del VPS.

Qué queda funcionando al terminar:

| Qué | Cuándo | Dónde |
|---|---|---|
| **Respaldo de la base del juego** (cuentas, compras, partidas) y de su configuración | Cada noche a la **1:30** | `/var/backups/envivo` (7 diarios, 4 semanales) |
| **Respaldo a tu laptop** (tu restic de siempre se lleva también lo del juego) | Cada noche a las **2:00** | laptop qfcorp |
| **Chequeo de salud del juego** con aviso a Telegram (bot qfserver) **solo si algo está mal** | Cada hora (minuto 17) | — |
| **Protección de nginx**: límite de intentos y cabeceras de seguridad | Siempre | sitio juego.tukanec.com |

---

## Paso 1. Instalar el respaldo y el chequeo de salud (5 minutos)

En el VPS (PuTTY), copia esta línea, pégala y presiona **Enter**:

```
sudo bash /var/www/envivo/server/deploy/ops/instalar_ops.sh
```

Al final muestra una lista **RESULTADO**. Debe decir:

- `1) Scripts:` con dos archivos (`respaldo_envivo.sh` y `salud_envivo.sh`).
- `2) Cron de root:` con **dos** líneas (una a la 1:30 y otra cada hora en el minuto 17).
- `3) Respaldos:` con **1 diario(s)** (hizo el primer respaldo en ese momento).
- `4) Telegram:` cómo va a mandar los avisos (ver paso 2).
- `5) nginx: zonas instaladas` (ver paso 4).

**Mándame una captura de esa lista.**

> Se puede correr las veces que quieras: no repite las líneas del cron y no borra nada.
> Si quieres ver qué haría sin cambiar nada: `sudo DRY_RUN=1 bash /var/www/envivo/server/deploy/ops/instalar_ops.sh`
> Para quitarlo todo (los respaldos se quedan): `sudo bash /var/www/envivo/server/deploy/ops/instalar_ops.sh --desinstalar`

---

## Paso 2. Que las alertas lleguen a tu Telegram (5 minutos)

El chequeo usa **el mismo bot qfserver** de tus otros avisos. Por defecto busca tu ayudante
`/usr/local/bin/alerta-telegram.sh` y **lee de ahí el token y el chat sin ejecutarlo** (igual que tu respaldo de restic).

1. Manda un mensaje de prueba:

```
sudo salud_envivo.sh --probar-telegram
```

2. Si te llegó "🧪 Prueba de alertas de EN VIVO Tycoon…", **listo, sigue al paso 3.**

3. Si dice `ERROR` o no llega nada, mira dónde está tu ayudante y cómo está escrito
   (este comando **tapa el token**, así no queda visible en el chat):

```
sudo grep -rln "api.telegram.org" /usr/local/bin ; sudo grep -nE 'TOKEN|CHAT|curl|\$1' /usr/local/bin/alerta-telegram.sh | sed -E 's/[0-9]{6,}:[A-Za-z0-9_-]{20,}/TOKEN-OCULTO/g'
```

   **Mándame lo que sale** y te digo cuál de estas tres opciones usar. Todas se ponen en el archivo de ajustes:

```
sudo nano /etc/envivo/ops.env
```

   - **El ayudante está en otra ruta:** cambia la línea `TELEGRAM_HELPER=` por la ruta correcta.
   - **El ayudante se usa así: `alerta-telegram.sh "mensaje"`:** pon `TELEGRAM_MODO=helper`.
   - **Poner el token directo:** escribe el token y el número de chat después de `TELEGRAM_TOKEN=` y `TELEGRAM_CHAT_ID=`,
     y pon `TELEGRAM_MODO=directo`. (Ese archivo solo lo puede leer root.)

   Guarda con **Ctrl + O**, Enter, **Ctrl + X**, y vuelve a probar con `sudo salud_envivo.sh --probar-telegram`.

> 🔒 Si algún día regeneras el token del bot en BotFather, cámbialo en `alerta-telegram.sh` (y en `ops.env` si lo pusiste ahí).

---

## Paso 3. Agregar el juego a tu respaldo de restic de las 2:00 (10 minutos)

Tu script `/usr/local/bin/backup_restic_erp_qf.sh` ya se lleva `/var/www` (el código del juego), pero **no** las dos carpetas
donde están los datos del juego: `/var/backups/envivo` (las copias de la base) y `/etc/envivo` (las claves de Plux y del panel).
Hay que agregarlas a la misma línea donde ya está `/etc/erp_qf`.

### 3A. Primero mándame cómo está escrito (no cambia nada)

```
sudo grep -n "/etc/erp_qf\|/var/www" /usr/local/bin/backup_restic_erp_qf.sh
```

**Mándame lo que sale y espera mi respuesta** antes del 3B. Lo normal es **una sola línea** de restic con
`/etc/erp_qf` (por ejemplo `restic ... backup /var/www /etc/erp_qf /etc/nginx ...`). Si salen varias líneas,
o las carpetas están en un archivo aparte, te preparo otro comando.

### 3B. El cambio (solo si en el 3A salió una sola línea de restic con `/etc/erp_qf`)

Copia y pega **todo el bloque** de una vez. Primero guarda una copia del script original, después revisa que
haya **exactamente una** línea para cambiar (si no, se detiene sin tocar nada), hace el cambio y lo comprueba:

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

Debe decir **`SINTAXIS OK`** y mostrar el cambio: la misma línea de antes, ahora con `/etc/envivo /var/backups/envivo`
justo después de `/etc/erp_qf`. **Mándame una captura.**

### 3C. Probar el respaldo completo ahora (no esperar a las 2:00)

```
sudo bash /usr/local/bin/backup_restic_erp_qf.sh
```

Te debe llegar el ✅ de siempre a Telegram. Para ver que el último respaldo ya tiene las carpetas del juego:

```
sudo restic -r sftp:respaldo.qfradioec.com:/erp_qf --password-file /etc/restic/password_erp_qf snapshots --latest 1
```

En la columna de carpetas (Paths) deben aparecer `/etc/envivo` y `/var/backups/envivo`.
Si este último comando da error de conexión, no pasa nada: mándamelo (tu script usa su propia forma de conectarse por el túnel).

### Deshacer el cambio (si algo no te gusta)

```
ls /root/backup_restic_erp_qf.sh.antes-envivo-*
sudo cp -p /root/backup_restic_erp_qf.sh.antes-envivo-FECHA /usr/local/bin/backup_restic_erp_qf.sh
```

(cambia `FECHA` por la que muestra el primer comando).

---

## Paso 4. Protección de nginx (ya está puesta: solo comprobar)

El paso 1 dejó las **zonas de límite** en `/etc/nginx/conf.d/envivo-limites.conf` (el instalador del juego también las
pone). El **sitio del juego** ya trae los límites y las cabeceras de seguridad: la plantilla `server/deploy/nginx-sitio.sh`
ya tiene aplicado `server/deploy/ops/nginx-endurecer.patch`, y `instalar.sh` la escribe cada vez que corre
(prueba con `nginx -t` y si algo falla deja el sitio como estaba). No hay nada que aplicar. Para comprobar:

```
curl -sI --resolve juego.tukanec.com:443:127.0.0.1 https://juego.tukanec.com/ | grep -iE "content-security|permissions-policy|strict-transport|x-frame|referrer"
```

Deben salir **5 líneas**. Si salen menos, corre `sudo bash /var/www/envivo/server/deploy/instalar.sh` y vuelve a probar.
**No edites a mano** `/etc/nginx/sites-available/juego.tukanec.com`: el instalador lo vuelve a escribir cada vez desde la plantilla.

### Qué hace (para el programador): fragmentos exactos, ya en la plantilla, probados con `nginx -t` (nginx 1.24, el de Ubuntu 24.04)

**a) Zonas (nivel `http`, archivo `/etc/nginx/conf.d/envivo-limites.conf`, es `server/deploy/ops/nginx-envivo-limites.conf`).**
Cada zona cuenta por IP real (también detrás de Cloudflare: el sitio ya tiene `real_ip_header CF-Connecting-IP`)
y **solo** los POST a su dirección; para cualquier otra dirección la llave queda vacía y nginx no cuenta nada:

```nginx
map "$request_method:$uri" $envivo_lim_entrar   { default ""; "~^POST:/api/entrar/?$"    $binary_remote_addr; }
map "$request_method:$uri" $envivo_lim_registro { default ""; "~^POST:/api/registro/?$"  $binary_remote_addr; }
map "$request_method:$uri" $envivo_lim_pago     { default ""; "~^POST:/api/plux/pago/?$" $binary_remote_addr; }
map "$request_method:$uri" $envivo_lim_chat     { default ""; "~^POST:/api/chat/?$"      $binary_remote_addr; }
limit_req_zone $envivo_lim_entrar   zone=envivo_entrar:10m   rate=20r/m;
limit_req_zone $envivo_lim_registro zone=envivo_registro:10m rate=6r/m;
limit_req_zone $envivo_lim_pago     zone=envivo_pago:10m     rate=12r/m;
limit_req_zone $envivo_lim_chat     zone=envivo_chat:10m     rate=30r/m;
```

**b) Dentro de `location ^~ /api/ { ... }`** (antes del `include fastcgi_params`):

```nginx
client_max_body_size 1m;          # la partida guardada: hasta 300 KB de datos, unos 400 KB ya dentro del JSON
limit_req zone=envivo_entrar burst=15 nodelay;
limit_req zone=envivo_registro burst=10 nodelay;
limit_req zone=envivo_pago burst=10 nodelay;
limit_req zone=envivo_chat burst=15 nodelay;
limit_req_status 429;
limit_req_log_level error;        # con "warn" no queda en el registro (el nivel normal de error_log es "error")
error_page 429 = @envivo_429;
```

**c) Nivel `server`:** `client_max_body_size 64k;` (en vez de `2m`) y la respuesta del límite en JSON, para que el juego
y la página de pago muestren el mensaje en vez de "el servidor no respondió bien":

```nginx
location @envivo_429 {
    default_type application/json;
    add_header Cache-Control "no-store" always;
    add_header Retry-After 60 always;
    # + las cabeceras de seguridad de siempre ($(cab) en la plantilla)
    return 429 '{"ok":false,"status":"failed","error":"Demasiados intentos. Espera un minuto e intenta de nuevo.","message":"Demasiados intentos. Espera un minuto e intenta de nuevo."}';
}
```

**d) Cabeceras de seguridad.** La plantilla las repite en cada `location` que tiene su propio `add_header`
(en nginx un `add_header` dentro de un `location` anula todos los de afuera; auditoría A-09). El parche agregó:

- `Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=()"` en todas las respuestas.
- **Arreglo importante en la CSP del juego:** `connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com`.
  Con `connect-src 'self'` solo, el service worker (`sw.js`, que baja las fuentes con `fetch()` para el modo sin internet)
  queda bloqueado y **desde la segunda visita el CSS de las fuentes falla** (`net::ERR_FAILED`, probado en Chromium).

La CSP del juego queda así (solo archivos del propio sitio y las fuentes de Google; `'unsafe-inline'` solo en estilos,
porque `index.html` tiene un `<style>` y el juego arma estilos dentro del HTML; los scripts no):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' data: blob:;
connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; worker-src 'self'; manifest-src 'self';
object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
```

- **HSTS** (`Strict-Transport-Security: max-age=31536000`): la plantilla lo pone **solo cuando ya hay certificado**
  (modo HTTPS) y lo repite en cada `location`. No agregar `includeSubDomains` ni `preload` (afectaría a otros subdominios de tukanec.com).
- `pago.php` y `/control/` mandan además su propia CSP desde PHP (más estricta); el navegador cumple las dos.
  No poner `form-action` en la CSP de nginx para `pago.php`: el 3DS manda un formulario al banco.

> Ojo con los límites y los celulares: en Ecuador muchos celulares salen a internet con **la misma IP** (CGNAT).
> Los valores son generosos a propósito. Si algún día llegan quejas de "Demasiados intentos", sube el `rate=` en
> `/etc/nginx/conf.d/envivo-limites.conf` y corre `sudo nginx -t && sudo systemctl reload nginx`.

---

## Qué avisos te pueden llegar y qué hacer

Llegan **solo si algo está mal**. El mismo aviso se repite como máximo **cada 3 horas** (los recordatorios de soporte,
cada 12 horas). Cuando se arregla, llega una vez "✅ Ya se arreglo".

| Aviso | Qué hacer |
|---|---|
| **El juego NO responde** / responde mal | `sudo systemctl status nginx php8.3-fpm` y mándame la salida. |
| **El juego está LENTO** (más de 3 s) | Si se repite, mándame `uptime` y `free -h`. |
| **No existe el socket de PHP** / servicio no activo | `sudo systemctl restart php8.3-fpm` (también lo usan el ERP y TuPass: hazlo con poco tráfico). |
| **Disco casi lleno** | `df -h` y mándamelo. |
| **La base creció / pesa mucho / el -wal pesa mucho** | Mándame el aviso; puede ser alguien abusando del juego. |
| **errores de nginx/PHP del juego** | `sudo grep 'server: juego.tukanec.com' /var/log/nginx/error.log \| tail -n 20` y mándamelo. |
| **peticiones frenadas por el límite** | Posible ataque o un bot. Si el juego anda bien, no hay que hacer nada. |
| **Muchos pagos fallidos** | Revisa en el panel de Plux si hay una caída; mira las compras en `/control/` → **Compras**. |
| **aviso(s) nuevo(s) del juego** | Entra a `https://juego.tukanec.com/control/` → **Resumen** (avisos): casi siempre es un pago para revisar a mano. |
| **casos de soporte abiertos** / **reportes de chat** | Respóndelos en `/control/` → **Soporte** / **Chat**. |
| **El último respaldo FALLÓ** / es de hace más de 26 h | `sudo tail -n 30 /var/log/envivo-respaldo.log` y mándamelo. |
| **El certificado vence en N días** | `sudo certbot renew` y mándame la salida si falla. |

---

## Comandos útiles

| Para | Comando |
|---|---|
| Ver los respaldos guardados | `sudo respaldo_envivo.sh --listar` |
| Hacer un respaldo ahora | `sudo respaldo_envivo.sh` |
| Probar el respaldo sin guardar nada | `sudo DRY_RUN=1 respaldo_envivo.sh` |
| Correr el chequeo ahora sin mandar a Telegram | `sudo DRY_RUN=1 salud_envivo.sh` |
| Ver cómo manda los avisos | `sudo salud_envivo.sh --modo-telegram` |
| Ver los registros | `sudo tail -n 30 /var/log/envivo-respaldo.log` · `sudo tail -n 30 /var/log/envivo-salud.log` (y `envivo-tareas`, `envivo-discord`, `envivo-festival`, `envivo-liga`; todos rotan cada semana) |
| Cambiar umbrales o Telegram | `sudo nano /etc/envivo/ops.env` (vale desde la próxima hora) |

### Volver la base del juego a como estaba en un respaldo (solo si hace falta)

⚠️ Todo lo que pasó en el juego **después** de ese respaldo (cuentas nuevas, compras, partidas) se pierde.
Antes de hacerlo, **escríbeme**.

```
sudo respaldo_envivo.sh --listar
sudo respaldo_envivo.sh --restaurar envivo-AAAAMMDD-HHMMSS.sqlite.gz
```

Revisa que el respaldo esté sano, muestra cuántos jugadores y compras tiene, **guarda primero una copia de la base actual**
(`/var/backups/envivo/antes-de-restaurar-….sqlite.gz`) y pide escribir **SI**. El juego no se apaga: solo espera unos segundos.

Si el respaldo que quieres solo está en la laptop (restic), sácalo primero de restic a `/var/backups/envivo` y luego usa el
mismo comando con la ruta completa del archivo.

---

## Detalles técnicos (para el programador)

- `respaldo_envivo.sh`: copia en caliente con la API de respaldo de SQLite (`sqlite3 .backup`), `PRAGMA integrity_check`
  sobre la copia (si no es `ok`, no la guarda y deja `FALLA` en `/var/backups/envivo/ULTIMO_RESULTADO`), `gzip --rsyncable`
  (para que restic deduplique mejor), semanal los domingos (enlace duro, no ocupa doble), tar de `/etc/envivo`, rotación
  por cantidad (7 diarias, 4 semanales, 7 de configuración), `flock` para no correr dos a la vez. Corre como root;
  SQLite deja `-wal`/`-shm` con el dueño de la base (www-data). `--restaurar` usa `sqlite3 .restore` sobre el mismo archivo
  (con los bloqueos de SQLite), conserva el dueño y revisa la integridad al final.
- `salud_envivo.sh`: `curl --resolve juego.tukanec.com:443:127.0.0.1` (https si hay certificado, si no http:80), las
  consultas a la base van como `www-data` y en solo lectura, los errores de nginx se filtran por `server: juego.tukanec.com`
  en `/var/log/nginx/error.log` (el sitio no tiene registro propio), "pagos fallidos" = compras creadas en la última hora con
  estado `rechazado` o `pendiente` con `plux_paso = 'fallido'` (alerta si son 5 o más y al menos la mitad de los intentos).
  Estado del anti-spam en `/var/lib/envivo-ops` (solo se marca "avisado" si Telegram respondió 200). El token va a curl
  por la entrada estándar (`-K -`), no en la línea de comandos. `ops.env` se lee línea por línea, no se ejecuta.
- No existe una tabla de reembolsos en la base: el chequeo revisa `reembolsos`/`devoluciones` si algún día se crean,
  y mientras tanto los pagos que necesitan acción a mano llegan como "avisos nuevos" (tabla `avisos`).
- Todo se prueba con `sudo bash server/deploy/ops/probar_ops.sh` (solo en una máquina de pruebas).

### Resultado de las pruebas (23-oct-2026, Ubuntu 24.04, nginx 1.24, PHP 8.3, SQLite 3.45, Chromium)

`probar_ops.sh`: **123 OK, 0 fallas**. Incluye:

- `bash -n` y `shellcheck -S style` sin avisos en los 4 scripts.
- Respaldo: modo prueba sin escribir nada; copia sana (`integrity_check = ok`) con los datos; **3 respaldos mientras otro
  proceso escribía sin parar (unas 129 000 filas en 4 s): los 3 sanos**; rotación 7/4/7 con las más nuevas;
  base dañada → no guarda y marca FALLA; restaurar con y sin "SI", respaldo dañado rechazado, copia previa guardada,
  dueño www-data conservado.
- nginx de verdad: `nginx -t` de la plantilla (que ya trae el parche; `probar_ops.sh` lo detecta y no lo vuelve a aplicar)
  + zonas (prueba, HTTP y HTTPS con certificado de prueba); cabeceras en las 11 rutas probadas (juego, sw.js, js, iconos, legales, API, pago.php, admin.php, 404);
  `POST /api/entrar` ×40 → 24 respuestas 429 en JSON con `Retry-After`; otra IP real (CF-Connecting-IP) no queda frenada;
  GET de `/api/estado` y `/api/chat` nunca se frenan; registro 4/15, pago 4/15, chat 14/30 frenados; partida de 732 KB pasa
  y 1,5 MB se corta (413); 100 KB a `/pago.php` se corta (413).
- Chromium: el juego, las legales y `pago.php` **sin violaciones de CSP**; con el service worker activo las fuentes cargan
  (con la CSP de la plantilla sin el parche, fallan desde la segunda visita).
- Chequeo de salud contra ese nginx y un Telegram falso: todo bien → nada; cada problema (pagos, avisos nuevos, soporte,
  errores del juego sin contar los del ERP, límite, disco, crecimiento y tamaño de la base, respaldo fallido o viejo, PHP caído,
  nginx caído, lentitud); anti-spam de 3 h y de 12 h; "Ya se arreglo" una sola vez; modo prueba; token leído del
  ayudante sin ejecutarlo; modo ayudante; Telegram caído (lo reintenta la hora siguiente); `ops.env` no ejecuta nada.
- Instalador: modo prueba sin cambios; instalación real; cron del dueño intacto (restic y chequeo del ERP) + 2 líneas del
  juego; segunda vez sin duplicar y sin tocar `ops.env`; `logrotate -d` válido; zonas en el nginx del sistema con `nginx -t`
  correcto; desinstalar quita solo lo del juego.
- El bloque `sed` del paso 3B probado en 5 formas de escribir el script de restic (una línea, varias líneas con `\`,
  lista entre paréntesis, variable con texto, rutas entre comillas): agrega las 2 carpetas, cambia 1 sola línea y no toca
  comentarios ni rutas como `/etc/erp_qf/tmp`.
