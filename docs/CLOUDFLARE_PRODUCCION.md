# Cloudflare en producción (nube naranja) para juego.tukanec.com

Hoy el registro `juego` está en **DNS only** (nube gris): los jugadores llegan directo a la IP del VPS. Con la **nube
naranja** pasan primero por Cloudflare, que esconde la IP del VPS, frena ataques (DDoS, robots, fuerza bruta) y guarda
en caché los archivos del juego. Esta guía es **solo para el registro `juego`**: el ERP y TuPass **no cambian**.

Tiempo: 30 minutos. Todo se hace en el panel de Cloudflare (dash.cloudflare.com → **tukanec.com**) y dos comandos en PuTTY.

> ⚠️ **Lo que NO hay que tocar:** los registros DNS del ERP y de TuPass, y el firewall del VPS (UFW).
> El VPS atiende los 3 sitios por los mismos puertos 80 y 443, y UFW no distingue sitios: si cerraras el 443 para todo lo
> que no venga de Cloudflare, el ERP y TuPass dejarían de funcionar. Por eso el "solo Cloudflare" del juego se hace dentro
> de nginx y solo para su sitio (paso 7, opcional).

---

## Paso 1. Preparar el VPS (5 minutos)

El instalador ya deja listo todo lo del lado del servidor: la IP real del jugador detrás de Cloudflare, la lista de IPs de
Cloudflare que se pone al día sola cada lunes y el grupo propio de PHP del juego. Córrelo una vez con la versión nueva:

```
sudo bash /var/www/envivo/server/deploy/instalar.sh
```

Comprueba (deben salir **2 archivos** y la línea del cron):

```
ls /etc/nginx/snippets/envivo-cloudflare-realip.conf /etc/nginx/conf.d/envivo-cloudflare-geo.conf ; cat /etc/cron.d/envivo-cloudflare | tail -n 1
```

Y que la lista de Cloudflare se puede bajar (debe terminar en `sin cambios` o `listo`):

```
sudo bash /var/www/envivo/server/deploy/ops/cloudflare_ips.sh
```

> Si Cloudflare publica rangos nuevos, el cron de los lunes (4:41) los pone solo: baja
> `https://www.cloudflare.com/ips-v4` y `ips-v6`, revisa que la lista tenga sentido, prueba con `nginx -t` y solo
> entonces recarga. Si algo sale raro, deja la lista que había. Registro: `/var/log/envivo-cloudflare.log`.

---

## Paso 2. SSL/TLS en "Full (strict)" solo para el juego (3 minutos)

El VPS ya tiene certificado de Let's Encrypt para `juego.tukanec.com`, así que Cloudflare puede conectarse con HTTPS
verificado (**Full (strict)**). Nunca uses *Flexible* (el juego quedaría en un bucle de redirecciones).

1. **Si `juego` es el único registro con nube naranja en tukanec.com:** SSL/TLS → Overview → **Full (strict)**.
2. **Si hay otros subdominios con nube naranja** (para no cambiarles nada): Rules → **Configuration Rules** → Create rule
   - Nombre: `juego SSL estricto`
   - Field **Hostname** · Operator **equals** · Value `juego.tukanec.com`
   - Then → **SSL** → **Full (strict)** → Deploy.

En SSL/TLS → Edge Certificates:
- **Always Use HTTPS: apagado** (el VPS ya redirige de http a https, y así la renovación del certificado de Let's Encrypt
  sigue funcionando por el puerto 80).
- **Minimum TLS Version: TLS 1.2**.
- **HSTS: no lo actives en Cloudflare** (el VPS ya lo manda).

---

## Paso 3. Apagar lo que rompe los avisos de Plux, Discord y Google (2 minutos)

Plux (aviso de pago), Discord (comandos del bot) y Google (verificación de la app de Android) son **robots**: si
Cloudflare les pide un "desafío", no lo pueden resolver y el aviso se pierde.

- Security → Bots → **Bot Fight Mode: apagado** (en el plan gratis no se le pueden poner excepciones).
- Security → Settings → **Security Level: Medium** (o Low). **No** uses "I'm Under Attack" salvo durante un ataque, y solo
  unas horas (también frena a Plux).

---

## Paso 4. Reglas de seguridad (WAF, plan gratis) (8 minutos)

Security → WAF → **Custom rules** → Create rule. Créalas **en este orden** (la 1 tiene que quedar primera).
En cada una: *Edit expression* y pega el texto tal cual.

**Regla 1 — `Permitir servicios del juego`** (acción **Skip**)

```
(http.host eq "juego.tukanec.com" and http.request.uri.path in {"/.well-known/assetlinks.json" "/api/plux/webhook" "/api/plux/3ds" "/discord/interacciones" "/api/salud"})
```

Action **Skip** → marca: *All remaining custom rules*, *All rate limiting rules* y, en *More components to skip*:
*Browser Integrity Check*, *Security Level*, *User Agent Blocking*. Activa **Log matching requests**. Deploy.

**Regla 2 — `Bloquear basura`** (acción **Block**): robots que buscan WordPress, claves y copias. nginx ya da 404, pero
así ni llegan al VPS.

```
(http.host eq "juego.tukanec.com" and (http.request.uri.path contains "/wp-" or http.request.uri.path contains "/.env" or http.request.uri.path contains "/.git" or http.request.uri.path contains "phpmyadmin" or http.request.uri.path contains "/server/" or http.request.uri.path contains "xmlrpc"))
```

**Regla 3 (opcional) — `Centro de Control solo desde Ecuador`** (acción **Managed Challenge**)

```
(http.host eq "juego.tukanec.com" and starts_with(http.request.uri.path, "/control") and ip.src.country ne "EC")
```

(Si viajas, cámbiala a *Disabled* mientras estás fuera. El panel ya pide usuario, clave y código del celular.)

**Regla de límite (Security → WAF → Rate limiting rules, el plan gratis trae 1)** — `Frenar fuerza bruta`

```
(http.host eq "juego.tukanec.com" and http.request.method eq "POST" and http.request.uri.path in {"/api/entrar" "/api/registro"})
```

- Characteristics: **IP** · Period **10 seconds** · Requests **20** · Action **Block** · Duration **10 seconds**.
- (Es un tope alto a propósito: en Ecuador muchos celulares salen con la misma IP. nginx y PHP ya tienen sus propios
  límites más finos por jugador; esto solo frena inundaciones antes de que lleguen al VPS.)

---

## Paso 5. Caché: archivos del juego sí, API no (5 minutos)

Caching → **Cache Rules** → Create rule.

**Regla A — `Juego sin cache (API y paginas)`** → **Bypass cache**

```
(http.host eq "juego.tukanec.com" and (starts_with(http.request.uri.path, "/api/") or starts_with(http.request.uri.path, "/control") or starts_with(http.request.uri.path, "/discord/") or starts_with(http.request.uri.path, "/.well-known/") or http.request.uri.path in {"/" "/index.html" "/sw.js" "/manifest.webmanifest" "/pago.php" "/admin.php" "/terminos.html" "/privacidad.html" "/borrar-cuenta.html"}))
```

**Regla B — `Juego archivos en cache`** → **Eligible for cache**

```
(http.host eq "juego.tukanec.com" and (starts_with(http.request.uri.path, "/js/") or starts_with(http.request.uri.path, "/icons/") or starts_with(http.request.uri.path, "/css/") or starts_with(http.request.uri.path, "/img/") or starts_with(http.request.uri.path, "/audio/") or starts_with(http.request.uri.path, "/sounds/") or starts_with(http.request.uri.path, "/fonts/") or starts_with(http.request.uri.path, "/pago-assets/")))
```

- Edge TTL: **Use cache-control header if present** (el VPS dice 1 hora). Browser TTL: **Respect origin**.

> 🔁 **Cada vez que actualices el juego** (`actualizar.sh`) con la nube naranja: Caching → Configuration →
> **Purge Cache → Custom Purge → Prefix** `juego.tukanec.com/js/` (o *Purge Everything* si no estás seguro). Si no, algunos
> jugadores pueden recibir el JavaScript anterior hasta por 1 hora.

---

## Paso 6. Encender la nube naranja (2 minutos)

DNS → Records → el registro **A `juego`** → Edit → **Proxy status: Proxied** (nube naranja) → Save.
**No toques los registros del ERP ni de TuPass.**

Espera 2 minutos y prueba **desde tu laptop o el celular** (no desde el VPS):

1. Abre `https://juego.tukanec.com` y juega un evento: debe funcionar igual que antes.
2. En PowerShell de tu laptop:

```
curl.exe -sI https://juego.tukanec.com/api/salud
```

   Debe decir `HTTP/1.1 200` (o `HTTP/2 200`) y tener una línea **`cf-ray:`** (eso confirma que pasa por Cloudflare) y
   `cf-cache-status: BYPASS` o `DYNAMIC`.
3. En el VPS, que nginx ve la IP real de los jugadores (no IPs de Cloudflare como 172.70… o 162.158…):

```
sudo tail -n 5 /var/log/nginx/access.log
```

4. Que la renovación del certificado sigue bien con Cloudflare delante:

```
sudo certbot renew --dry-run --cert-name juego.tukanec.com
```

   Debe terminar en `Congratulations, all simulated renewals succeeded`. (Si falla, revisa que **Always Use HTTPS** esté
   apagado y que la Regla 2 no bloquee `/.well-known/acme-challenge/`.)
5. Plux: haz una compra pequeña real y mira que llegue sola (Centro de Control → Compras). En Security → Events no debe
   haber nada bloqueado de `/api/plux/webhook`.
6. Android: en Play Console → Configuración → Integridad de la app → **Vínculos de recursos digitales**, debe seguir en verde.

**Si algo falla:** vuelve el registro `juego` a **DNS only** (nube gris). Se arregla en 1 a 5 minutos y no se pierde nada.

---

## Paso 7 (opcional). "Solo Cloudflare": que nadie entre directo a la IP del VPS

Con la nube naranja, alguien que conozca la IP del VPS todavía podría saltarse Cloudflare (y sus reglas) entrando
directo a `149.56.111.193`. Esto lo cierra **solo para el juego** (el ERP y TuPass siguen igual):

```
sudo touch /etc/envivo/solo-cloudflare && sudo bash /var/www/envivo/server/deploy/instalar.sh
```

Desde ese momento nginx responde **403** a lo que llegue al sitio del juego sin pasar por Cloudflare (lo de este mismo
VPS, como el chequeo de salud, sigue entrando). Prueba **desde tu laptop**:

```
curl.exe -sk -o NUL -w "%{http_code}" --resolve juego.tukanec.com:443:149.56.111.193 https://juego.tukanec.com/api/salud
```

Debe salir **403**. Y por el dominio normal (`https://juego.tukanec.com`) el juego sigue funcionando.

Para quitarlo (por ejemplo, si vuelves a la nube gris — **hazlo antes**, si no el juego dará 403 a todos):

```
sudo rm /etc/envivo/solo-cloudflare && sudo bash /var/www/envivo/server/deploy/instalar.sh
```

---

## Detalles técnicos (para el programador)

- `server/deploy/ops/cloudflare_ips.sh` escribe `/etc/nginx/snippets/envivo-cloudflare-realip.conf` (`set_real_ip_from`
  + `real_ip_header CF-Connecting-IP`, incluido SOLO por el sitio del juego; si no existe, `nginx-sitio.sh` usa la lista
  fija de siempre) y `/etc/nginx/conf.d/envivo-cloudflare-geo.conf` (`geo $realip_remote_addr $envivo_desde_cf`, solo
  define una variable con prefijo `envivo_`). Valida la lista (solo CIDR IPv4/IPv6, mínimo 10 + 4, máximo 300 líneas),
  compara sin los comentarios, `nginx -t` antes de recargar y vuelve atrás si falla. Cron: `/etc/cron.d/envivo-cloudflare`.
- "Solo Cloudflare" = marca `/etc/envivo/solo-cloudflare` → `nginx-sitio.sh` agrega `if ($envivo_desde_cf = 0) { return 403; }`
  en el server del juego (443; el bloque del puerto 80 queda igual para Let's Encrypt). Se evalúa con
  `$realip_remote_addr` (la IP de la conexión, no la del encabezado), así un `CF-Connecting-IP` inventado no sirve.
- `127.0.0.1` está en `set_real_ip_from` (túnel cloudflared): una petición desde el mismo VPS puede declarar su IP con
  `CF-Connecting-IP`. Lo usa la prueba de carga (docs/PRUEBA_CARGA.md) para simular jugadores con IPs distintas.
- Límites de nginx (`/etc/nginx/conf.d/envivo-limites.conf`): entrar 20/min, registro 6/min, pago 12/min, chat (escribir)
  30/min, `/api/error(es)` 30/min, `/api/eventos` 60/min, y un tope general de `/api/` de 20/s por IP (+200 de golpe) que no
  cuenta 127.0.0.1. Todos devuelven 429 en JSON con `Retry-After`.
