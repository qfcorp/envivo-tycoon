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
#   - /pago.php, /admin.php -> server/public/        (PHP)
#   - /terminos.html, /privacidad.html -> server/public/
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

reglas() {
cat <<NGINX
    root $APP;
    index index.html;
    server_tokens off;
    charset utf-8;
    client_max_body_size 2m;

    # IP real del visitante si el dominio pasa por el proxy de Cloudflare (nube naranja).
    # Rangos publicados en https://www.cloudflare.com/ips/ (si Cloudflare agrega rangos nuevos, se suman aqui).
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

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;

    # ---- Archivos del juego (lista blanca) ----
    location = / { try_files /index.html =404; add_header Cache-Control "no-cache"; add_header X-Content-Type-Options nosniff always; }
    location = /index.html { add_header Cache-Control "no-cache"; add_header X-Content-Type-Options nosniff always; }
    location = /sw.js { add_header Cache-Control "no-cache"; add_header X-Content-Type-Options nosniff always; }
    location = /manifest.webmanifest { default_type application/manifest+json; }
    location = /favicon.ico { try_files /icons/favicon-32.png =404; }
    location = /robots.txt { try_files \$uri =404; }
    location ~ ^/(js|icons|css|img|audio|sounds|fonts)/[A-Za-z0-9._/-]+\$ { try_files \$uri =404; expires 1h; }

    # ---- Servidor del juego (PHP) ----
    location ^~ /api/ {
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/api.php;
        fastcgi_param SCRIPT_NAME /api.php;
        fastcgi_param HTTP_PROXY "";
        fastcgi_read_timeout 90s;
        fastcgi_pass unix:$SOCK;
    }
    location = /pago.php {
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/pago.php;
        fastcgi_param SCRIPT_NAME /pago.php;
        fastcgi_param HTTP_PROXY "";
        fastcgi_pass unix:$SOCK;
    }
    location = /admin.php {
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/admin.php;
        fastcgi_param SCRIPT_NAME /admin.php;
        fastcgi_param HTTP_PROXY "";
        fastcgi_pass unix:$SOCK;
    }
    location = /terminos.html { root $PUB; add_header Cache-Control "no-cache"; }
    location = /privacidad.html { root $PUB; add_header Cache-Control "no-cache"; }
    location ^~ /pago-assets/ {
        alias $PUB/assets/;
        try_files \$uri =404;
        expires 1h;
    }

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
  echo '    add_header Strict-Transport-Security "max-age=31536000" always;'
  reglas
  echo "}"
else
  echo "server {"; echo "    listen 80;"; v6 80; echo "    server_name $DOMINIO;"; reglas; echo "}"
fi
