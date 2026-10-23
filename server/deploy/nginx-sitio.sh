#!/usr/bin/env bash
# Escribe (en la pantalla) la configuracion de nginx del sitio del juego. La usan instalar.sh y las pruebas.
# No toca nada por si sola. Variables:
#   DOMINIO  (juego.tukanec.com)        APP   (/var/www/envivo: la copia del repositorio)
#   SOCK     (/run/php/php8.3-fpm.sock) CERT  (carpeta del certificado; si tiene fullchain.pem se arma HTTPS)
#   LISTEN   (solo pruebas: un unico bloque que escucha en esa direccion, ej. 127.0.0.1:8290)
#
# COMO FUNCIONA (raiz = la copia del repositorio, con LISTA BLANCA):
#   - Se sirven SOLO los archivos del juego: /, /index.html, /sw.js, /manifest.webmanifest, /js/, /icons/
#     (y /css/, /img/, /audio/, /sounds/, /fonts/ si algun dia existen).
#   - /api/...            -> server/public/api.php  (PHP)
#   - /pago.php, /admin.php (redirige a /control/) -> server/public/        (PHP)
#   - /control/ (Centro de Control) -> server/public/control/index.php; /control/assets/control.{css,js}; lo demas 404
#   - /discord/interacciones (bot de Discord) -> server/public/discord/interacciones.php
#   - /terminos.html, /privacidad.html, /borrar-cuenta.html -> server/public/
#   - /.well-known/assetlinks.json (app de Android) -> la raiz del juego
#   - /pago-assets/...    -> server/public/assets/  (estilo y JavaScript de la pagina de pago)
#   - TODO lo demas da 404: /server/src, /server/tests, /server/deploy, /server/bin, los .env, .git, /tests,
#     /tools, /dist, PLAN.md, README.md... Si el juego agrega una carpeta nueva, hay que sumarla aqui.
set -u
DOMINIO="${DOMINIO:-juego.tukanec.com}"
APP="${APP:-/var/www/envivo}"
SOCK="${SOCK:-/run/php/php8.3-fpm.sock}"
CERT="${CERT:-/etc/letsencrypt/live/$DOMINIO}"
LISTEN="${LISTEN:-}"
# IPv6: si el servidor lo tiene (lo normal en OVH) tambien escucha en [::]. IPV6=0 lo apaga, IPV6=1 lo fuerza.
if [ -z "${IPV6:-}" ]; then [ -s /proc/net/if_inet6 ] && IPV6=1 || IPV6=0; fi
v6() { [ "$IPV6" = "1" ] && echo "    listen [::]:$1;"; return 0; }
PUB="$APP/server/public"
HSTS="${HSTS:-}"   # se llena solo en el modo HTTPS (abajo)
# Cloudflare (docs/CLOUDFLARE_PRODUCCION.md; los dos archivos los escribe server/deploy/ops/cloudflare_ips.sh y se
# ponen al dia cada semana). Si no estan, va la lista de rangos de abajo (la de siempre).
CF_REALIP="${CF_REALIP:-/etc/nginx/snippets/envivo-cloudflare-realip.conf}"
CF_GEO="${CF_GEO:-/etc/nginx/conf.d/envivo-cloudflare-geo.conf}"
SOLO_CF="${SOLO_CF:-/etc/envivo/solo-cloudflare}"     # si existe: solo se atiende lo que llega por Cloudflare (403 al resto)
# Modo mantenimiento (server/deploy/ops/mantenimiento.sh): si existe este archivo, /api/ y /pago.php responden 503
MANT="${MANT:-/etc/envivo/MANTENIMIENTO}"

# Cabeceras de seguridad. OJO: en nginx, un add_header dentro de un "location" ANULA todos los de afuera; por eso
# cada location que tiene su propio add_header repite estas lineas (auditoria A-09).
CSP_JUEGO="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
CSP_LEGAL="default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
# connect-src incluye las fuentes de Google porque el service worker (sw.js) las baja con fetch() para el modo sin
# internet: con connect-src 'self' solo, desde la segunda visita el CSS de las fuentes falla (probado en Chromium).
PERMISOS="camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=()"
cab() {
  [ -n "$HSTS" ] && printf '%s ' "add_header Strict-Transport-Security \"$HSTS\" always;"
  printf '%s' "add_header X-Content-Type-Options nosniff always; add_header Referrer-Policy same-origin always; add_header X-Frame-Options DENY always; add_header Permissions-Policy \"$PERMISOS\" always;"
}
# En las location de PHP: nginx pone estas cabeceras (cab); se ocultan las que manda PHP para que no salgan repetidas.
# La CSP y el Cache-Control de cada pagina PHP se quedan (las pone PHP). $1 = cabeceras extra a ocultar.
ocultar() { printf 'fastcgi_hide_header %s; ' X-Frame-Options X-Content-Type-Options Referrer-Policy Permissions-Policy Strict-Transport-Security "$@"; }
cab_juego() { printf '%s add_header Content-Security-Policy "%s" always;' "$(cab)" "$CSP_JUEGO"; }
cab_legal() { printf '%s add_header Content-Security-Policy "%s" always;' "$(cab)" "$CSP_LEGAL"; }

realip() {
  if [ -f "$CF_REALIP" ]; then
    echo "    include $CF_REALIP;"
    return 0
  fi
  cat <<NGINX
    set_real_ip_from 127.0.0.1;   # por si se publica con un tunel de Cloudflare (cloudflared en este servidor)
    set_real_ip_from ::1;
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 2400:cb00::/32;
    set_real_ip_from 2606:4700::/32;
    set_real_ip_from 2803:f800::/32;
    set_real_ip_from 2405:b500::/32;
    set_real_ip_from 2405:8100::/32;
    set_real_ip_from 2a06:98c0::/29;
    set_real_ip_from 2c0f:f248::/32;
    real_ip_header CF-Connecting-IP;
NGINX
}
# Solo Cloudflare (opcional, docs/CLOUDFLARE_PRODUCCION.md paso 7): lo que llegue directo a la IP del VPS sin pasar por
# Cloudflare recibe 403 (solo en ESTE sitio; el ERP y TuPass no cambian). 127.0.0.1 (chequeo de salud) siempre entra.
solo_cf() {
  [ -f "$SOLO_CF" ] && [ -f "$CF_GEO" ] || return 0
  echo "    if (\$envivo_desde_cf = 0) { return 403; }"
}

reglas() {
cat <<NGINX
    root $APP;
    index index.html;
    server_tokens off;
    charset utf-8;
    # Lo que puede mandar un navegador: 64 KB en general (formularios, pago, panel).
    # /api/ permite 1 MB (abajo) porque ahi se guarda la partida (hasta 300 KB, unos 400 KB ya dentro del JSON).
    client_max_body_size 64k;

    # IP real del visitante si el dominio pasa por el proxy de Cloudflare (nube naranja).
    # Rangos publicados en https://www.cloudflare.com/ips/ (cloudflare_ips.sh los pone al dia cada semana en $CF_REALIP).
$(realip)
$(solo_cf)

    # Para todo lo que no tiene su propio add_header (API, PHP, js, iconos...)
    $(cab)

    # Mantenimiento (server/deploy/ops/mantenimiento.sh on|off): con $MANT, /api/ y /pago.php dan 503 en JSON.
    # Siguen funcionando: el juego sin conexion (archivos), /api/salud, los avisos de pago de Plux y el Centro de Control.
    set \$envivo_mant "";
    if (-f $MANT) { set \$envivo_mant "1"; }
    if (\$uri !~ "^/(api/|pago\\.php)") { set \$envivo_mant ""; }
    if (\$uri ~ "^/api/(salud|plux/webhook|plux/3ds)/?\$") { set \$envivo_mant ""; }
    if (\$envivo_mant) { return 503; }
    error_page 503 = @envivo_503;

    # ---- Archivos del juego (lista blanca) ----
    location = / { try_files /index.html =404; add_header Cache-Control "no-cache"; $(cab_juego) }
    location = /index.html { add_header Cache-Control "no-cache"; $(cab_juego) }
    location = /sw.js { add_header Cache-Control "no-cache"; $(cab_juego) }
    location = /manifest.webmanifest { default_type application/manifest+json; }
    location = /favicon.ico { try_files /icons/favicon-32.png =404; }
    location = /robots.txt { try_files \$uri =404; }
    location ~ ^/(js|icons|css|img|audio|sounds|fonts)/[A-Za-z0-9._/-]+\$ { try_files \$uri =404; expires 1h; }

    # ---- Servidor del juego (PHP) ----
    location ^~ /api/ {
        client_max_body_size 1m;
        # Limites por IP (zonas en /etc/nginx/conf.d/envivo-limites.conf; cada una solo cuenta su direccion y solo POST)
        limit_req zone=envivo_entrar burst=15 nodelay;
        limit_req zone=envivo_registro burst=10 nodelay;
        limit_req zone=envivo_pago burst=10 nodelay;
        limit_req zone=envivo_chat burst=15 nodelay;
        limit_req zone=envivo_error burst=20 nodelay;
        limit_req zone=envivo_eventos burst=30 nodelay;
        limit_req zone=envivo_api burst=200 nodelay;
        limit_req_status 429;
        limit_req_log_level error;   # "error" para que quede en el registro (el nivel normal no guarda "warn")
        error_page 429 = @envivo_429;
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/api.php;
        fastcgi_param SCRIPT_NAME /api.php;
        fastcgi_param HTTP_PROXY "";
        $(ocultar)
        fastcgi_read_timeout 90s;
        fastcgi_pass unix:$SOCK;
    }
    location = /pago.php {
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/pago.php;
        fastcgi_param SCRIPT_NAME /pago.php;
        fastcgi_param HTTP_PROXY "";
        $(ocultar)
        fastcgi_pass unix:$SOCK;
    }
    location = /admin.php {
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/admin.php;
        fastcgi_param SCRIPT_NAME /admin.php;
        fastcgi_param HTTP_PROXY "";
        $(ocultar)
        fastcgi_pass unix:$SOCK;
    }
    # Bot de Discord: Discord manda aquí los comandos (firmados con Ed25519; sin firma válida PHP responde 401)
    location = /discord/interacciones {
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/discord/interacciones.php;
        fastcgi_param SCRIPT_NAME /discord/interacciones;
        fastcgi_param HTTP_PROXY "";
        $(ocultar)
        fastcgi_read_timeout 60s;
        client_max_body_size 256k;
        fastcgi_pass unix:$SOCK;
    }
    location = /terminos.html { root $PUB; add_header Cache-Control "no-cache"; $(cab_legal) }
    location = /privacidad.html { root $PUB; add_header Cache-Control "no-cache"; $(cab_legal) }
    location = /borrar-cuenta.html { root $PUB; add_header Cache-Control "no-cache"; $(cab_legal) }
    # App de Android (Trusted Web Activity): Digital Asset Links. El archivo va en la raiz del juego: .well-known/assetlinks.json
    location = /.well-known/assetlinks.json { default_type application/json; add_header Cache-Control "no-cache"; $(cab) try_files \$uri =404; }
    location ^~ /pago-assets/ {
        alias $PUB/assets/;
        try_files \$uri =404;
        expires 1h;
    }

    # Respuesta del limite en JSON (asi el juego y la pagina de pago muestran el mensaje en vez de "error")
    location @envivo_429 {
        default_type application/json;
        add_header Cache-Control "no-store" always;
        add_header Retry-After 60 always;
        $(cab)
        return 429 '{"ok":false,"status":"failed","error":"Demasiados intentos. Espera un minuto e intenta de nuevo.","message":"Demasiados intentos. Espera un minuto e intenta de nuevo."}';
    }
    # Respuesta del modo mantenimiento (JSON, con el mismo codigo que usa PHP para la tienda)
    location @envivo_503 {
        default_type application/json;
        add_header Cache-Control "no-store" always;
        add_header Retry-After 600 always;
        $(cab)
        return 503 '{"ok":false,"status":"failed","codigo":"mantenimiento","error":"El juego está en mantenimiento. Volvemos en un rato; tu partida y tus compras están a salvo.","message":"El juego está en mantenimiento. Volvemos en un rato; tu partida y tus compras están a salvo."}';
    }

    # ---- Centro de Control (/control/, docs/INTEGRAR_CONTROL.md): lista blanca. Solo index.php y sus dos archivos;
    # todo lo demas bajo /control/ (lib/, etc.) da 404. PHP manda su propia CSP y noindex (Http::cabecerasPagina).
    location = /control { return 301 /control/; }
    location = /control/ {
        # Opcional (A-04): solo estas IPs. Con Cloudflare, nginx ya tiene la IP real (real_ip_header).
        # allow 190.12.34.56; deny all;
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/control/index.php;
        fastcgi_param SCRIPT_NAME /control/index.php;
        fastcgi_param HTTP_PROXY "";
        $(ocultar Cache-Control X-Robots-Tag)
        fastcgi_pass unix:$SOCK;
        add_header Cache-Control "no-store" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        $(cab)
    }
    # Exactas (no una expresion): con "^~ /control/" abajo, nginx no revisaria una expresion para /control/assets/...
    location = /control/assets/control.css { alias $PUB/control/assets/control.css; expires 1h; }
    location = /control/assets/control.js { alias $PUB/control/assets/control.js; expires 1h; }
    location ^~ /control/ { return 404; }

    # ---- Todo lo demas: prohibido (codigo del servidor, pruebas, .git, .env, PLAN.md...) ----
    location / { return 404; }
NGINX
}

echo "# EN VIVO Tycoon ($DOMINIO). Generado por server/deploy/nginx-sitio.sh: NO editar a mano"
echo "# (se vuelve a escribir cada vez que corre server/deploy/instalar.sh)."
if [ -n "$LISTEN" ]; then
  echo "server {"; echo "    listen $LISTEN;"; echo "    server_name $DOMINIO localhost 127.0.0.1;"; reglas; echo "}"
elif [ -f "$CERT/fullchain.pem" ] && [ -f "$CERT/privkey.pem" ]; then
  cat <<NGINX
server {
    listen 80;
$(v6 80)
    server_name $DOMINIO;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
$(v6 "443 ssl http2")
    server_name $DOMINIO;
    ssl_certificate $CERT/fullchain.pem;
    ssl_certificate_key $CERT/privkey.pem;
NGINX
  [ -f /etc/letsencrypt/options-ssl-nginx.conf ] && echo "    include /etc/letsencrypt/options-ssl-nginx.conf;"
  [ -f /etc/letsencrypt/ssl-dhparams.pem ] && echo "    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"
  HSTS="max-age=31536000"
  reglas
  echo "}"
else
  echo "server {"; echo "    listen 80;"; v6 80; echo "    server_name $DOMINIO;"; reglas; echo "}"
fi
