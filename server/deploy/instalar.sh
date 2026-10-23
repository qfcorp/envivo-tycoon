#!/usr/bin/env bash
# =====================================================================
#  Instalador del servidor de EN VIVO Tycoon (juego.tukanec.com) en el VPS (Ubuntu + nginx + PHP 8.3-fpm).
#  Se corre como root (con sudo). Se puede correr las veces que se quiera: NUNCA borra la base de datos,
#  nunca cambia la configuracion que ya existe y NO toca los otros sitios del servidor.
#
#  Uso (copiar y pegar en la consola del VPS, en una sola linea):
#    curl -fsSL https://raw.githubusercontent.com/qfcorp/envivo-tycoon/main/server/deploy/instalar.sh -o /tmp/instalar_envivo.sh && sudo bash /tmp/instalar_envivo.sh
#  Despues, para volver a correrlo:   sudo bash /var/www/envivo/server/deploy/instalar.sh
#
#  Que hace:
#   1. Instala php8.3-sqlite3 y php8.3-curl si faltan (y git).
#   2. Crea /var/lib/envivo (la base de datos; solo www-data, permisos 750).
#   3. Crea /etc/envivo/config.env si no existe (pregunta usuario y clave del Centro de Control; Plux queda vacio, en PRODUCCION).
#   4. Baja (git clone) o actualiza (git pull) https://github.com/qfcorp/envivo-tycoon en /var/www/envivo.
#      Si bajo una version nueva de este instalador, sigue con la nueva.
#   5. Agrega a config.env las lineas de server/config.env.ejemplo que falten (vacias o con su valor por defecto;
#      la clave del validador se crea al azar). Nunca cambia un valor que ya estaba (server/deploy/comun.sh).
#   6. Crea las tablas (migraciones).   7. Programa las tareas (cron de www-data).
#   8. Node 22 (NodeSource) si falta o es viejo, y el servicio envivo-validador (systemd): lo enciende y prueba /salud.
#  8b. Grupo propio de PHP para el juego (/etc/php/8.3/fpm/pool.d/envivo.conf, socket php8.3-fpm-envivo.sock), probado
#      con "php-fpm8.3 -t" antes de recargar; si no se puede, el juego sigue en el PHP compartido (ops/pool_fpm.sh).
#   9. Rangos de Cloudflare (ops/cloudflare_ips.sh, cron semanal). Escribe el sitio de nginx /etc/nginx/sites-available/juego.tukanec.com, prueba con "nginx -t"
#      y SOLO si la prueba sale bien recarga nginx (si sale mal, deja todo como estaba).
#  10. Ofrece el certificado HTTPS con certbot.
#  Variables opcionales: DOMINIO (juego.tukanec.com), APP (/var/www/envivo), RAMA (main), PHPV (8.3).
#  Los mensajes van sin tildes a proposito (se leen bien por SSH desde el celular).
# =====================================================================
set -u

DOMINIO="${DOMINIO:-juego.tukanec.com}"
APP="${APP:-/var/www/envivo}"
RAMA="${RAMA:-main}"
REPO="${REPO:-https://github.com/qfcorp/envivo-tycoon.git}"
PHPV="${PHPV:-8.3}"
DATOS=/var/lib/envivo
CONF_DIR=/etc/envivo
CONF="$CONF_DIR/config.env"
SITIO="/etc/nginx/sites-available/$DOMINIO"
SOCK="/run/php/php$PHPV-fpm.sock"
# Huella de este instalador: si "git pull" trae uno distinto, se sigue con el nuevo (paso 4)
HUELLA=""; [ -f "$0" ] && HUELLA="$(sha256sum < "$0")"
cd /tmp || exit 1

if [ "$(id -u)" != "0" ]; then
  echo "ERROR: correlo con sudo:   sudo bash $0"
  exit 1
fi
[[ "$DOMINIO" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "ERROR: dominio no valido: $DOMINIO"; exit 1; }

echo "== 1. Programas (PHP $PHPV con sqlite3 y curl, git)"
command -v nginx > /dev/null || { echo "ERROR: este servidor no tiene nginx. Este instalador es para el VPS que ya usa nginx."; exit 1; }
command -v "php-fpm$PHPV" > /dev/null || [ -S "$SOCK" ] || { echo "ERROR: no esta php$PHPV-fpm (el que usan los otros sitios). Revisa con: ls /run/php/"; exit 1; }
FALTAN=""
php -m 2> /dev/null | grep -qi '^pdo_sqlite$' || FALTAN="$FALTAN php$PHPV-sqlite3"
php -m 2> /dev/null | grep -qi '^curl$' || FALTAN="$FALTAN php$PHPV-curl"
php -m 2> /dev/null | grep -qi '^mbstring$' || FALTAN="$FALTAN php$PHPV-mbstring"
command -v git > /dev/null || FALTAN="$FALTAN git"
if [ -n "$FALTAN" ]; then
  echo "   instalando:$FALTAN"
  apt-get update -qq < /dev/null > /dev/null 2>&1
  # shellcheck disable=SC2086
  if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $FALTAN < /dev/null > /dev/null 2>&1; then
    echo "   listo"; systemctl reload "php$PHPV-fpm" 2> /dev/null || true
  else
    echo "   ERROR: no se pudieron instalar ($FALTAN). Revisa la conexion y vuelve a correrlo."; exit 1
  fi
else
  echo "   ya estaba todo"
fi
php -r 'exit(PHP_VERSION_ID >= 80300 ? 0 : 1);' 2> /dev/null || { echo "ERROR: hace falta PHP 8.3 o mas nuevo."; exit 1; }

echo "== 2. Carpeta de la base de datos: $DATOS (solo www-data)"
mkdir -p "$DATOS"
chown www-data:www-data "$DATOS"
chmod 750 "$DATOS"
[ -f "$DATOS/envivo.sqlite" ] && echo "   ya existe la base: NO se borra nada" || echo "   lista (la base se crea en el paso 6)"

echo "== 3. Configuracion: $CONF (fuera del repositorio; el repositorio es publico)"
mkdir -p "$CONF_DIR"
chown root:www-data "$CONF_DIR"; chmod 750 "$CONF_DIR"
if [ -f "$CONF" ]; then
  echo "   ya existia: se conserva tal cual"
else
  # Usuario y clave del panel: se preguntan (o vienen en ADMIN_USUARIO y ADMIN_CLAVE, sin teclado)
  ADMIN_U="$(printf '%s' "${ADMIN_USUARIO:-}" | tr -cd 'A-Za-z0-9._-')"; ADMIN_C="${ADMIN_CLAVE:-}"
  if [ -z "$ADMIN_U" ] || [ "${#ADMIN_C}" -lt 10 ]; then
    if { : < /dev/tty; } 2> /dev/null; then
      while [ -z "$ADMIN_U" ]; do
        printf '   Usuario para el Centro de Control /control/ (ej. dimitry) y Enter: '
        read -r ADMIN_U < /dev/tty || break
        ADMIN_U="$(printf '%s' "$ADMIN_U" | tr -cd 'A-Za-z0-9._-')"
      done
      while [ -n "$ADMIN_U" ] && [ "${#ADMIN_C}" -lt 10 ]; do
        printf '   Clave del Centro de Control (minimo 10 caracteres; no se ve al escribir) y Enter: '
        read -r -s ADMIN_C < /dev/tty || break; echo
        [ "${#ADMIN_C}" -lt 10 ] && echo "   muy corta, otra vez"
      done
    fi
  fi
  if [ -z "$ADMIN_U" ] || [ "${#ADMIN_C}" -lt 10 ]; then
    echo "   AVISO: no se pudo preguntar el usuario y la clave del Centro de Control (no hay teclado). Queda cerrado."
    echo "          Para ponerlos: sudo rm $CONF  y corre otra vez el instalador desde la consola."
    ADMIN_C=""
  fi
  HASH=""
  [ -n "$ADMIN_C" ] && HASH="$(printf '%s' "$ADMIN_C" | php -r 'echo password_hash(stream_get_contents(STDIN), PASSWORD_BCRYPT);')"
  ADMIN_C=""
  HOOK_CLAVE="$(openssl rand -hex 20 2> /dev/null || php -r 'echo bin2hex(random_bytes(20));')"
  umask 027
  cat > "$CONF" <<CONF
; Configuracion del servidor de EN VIVO Tycoon (creada por instalar.sh el $(date '+%Y-%m-%d %H:%M')).
; Este archivo NO esta en GitHub. Despues de editarlo:   sudo systemctl reload php$PHPV-fpm
ENVIVO_DB=$DATOS/envivo.sqlite
ENVIVO_URL=https://$DOMINIO
ENVIVO_ZONA=America/Guayaquil

; Centro de Control /control/ (la clave se guarda como hash bcrypt, nunca en texto)
ENVIVO_ADMIN_USUARIO=$ADMIN_U
ENVIVO_ADMIN_CLAVE_HASH=$HASH

; Pago Plux: en PRODUCCION (cobra de verdad; la integracion es la misma de TuPass, ya certificada).
; Pega aqui las claves de PRODUCCION del panel de Plux. Solo para pruebas: PLUX_AMBIENTE=sandbox con claves de pruebas
PLUX_AMBIENTE=produccion
PLUX_ID_ESTABLECIMIENTO=
PLUX_ID_CLIENTE=
PLUX_CLAVE_SECRETA=
; La llave publica RSA de Plux en UNA sola linea (sin -----BEGIN/END-----)
PLUX_LLAVE_PUBLICA=
; Aviso de pago (webhook), opcional: https://$DOMINIO/api/plux/webhook con este usuario y clave
PLUX_WEBHOOK_USUARIO=plux_aviso
PLUX_WEBHOOK_CLAVE=$HOOK_CLAVE

; Soporte (lo muestra el juego en "Ayuda y soporte"). Solo correo, sin WhatsApp. Crealo con Cloudflare Email Routing (docs/CORREO.md)
SOPORTE_CORREO=soporte@tukanec.com
SOPORTE_HORARIO=

; Google Play (app de Android). Ver server/GOOGLE_PLAY.md
GOOGLE_PACKAGE_NAME=com.tukanec.envivo
GOOGLE_SERVICE_ACCOUNT_JSON=/etc/envivo/google-play.json
CONF
  umask 022
  echo "   creada"
fi
chown root:www-data "$CONF"; chmod 640 "$CONF"

echo "== 4. Bajar o actualizar el juego en $APP"
git config --global --get-all safe.directory 2> /dev/null | grep -qxF "$APP" || git config --global --add safe.directory "$APP" 2> /dev/null
if [ -d "$APP/.git" ]; then
  # js/intento.js es una COPIA de server/validador/intento.js (nginx solo sirve /js/; no un enlace). No está en git:
  # se quita antes de bajar lo nuevo (así "git pull" nunca choca con ella) y se vuelve a copiar después.
  git -C "$APP" ls-files --error-unmatch js/intento.js > /dev/null 2>&1 || rm -f "$APP/js/intento.js"
  # Despues de volver a una version anterior (actualizar.sh --version) la copia queda fuera de la rama: se vuelve a ella
  git -C "$APP" symbolic-ref -q HEAD > /dev/null || git -C "$APP" checkout -q "$RAMA"
  if git -C "$APP" pull -q --ff-only origin "$RAMA"; then echo "   actualizado a $(git -C "$APP" rev-parse --short HEAD)"
  else echo "   ERROR: no se pudo actualizar (hay cambios hechos a mano en $APP?). Revisa:  git -C $APP status"; exit 1; fi
elif [ -e "$APP" ] && [ -n "$(ls -A "$APP" 2> /dev/null)" ]; then
  echo "   ERROR: $APP ya existe y no es una copia del juego. No se toca. Muevela o usa APP=/otra/carpeta."; exit 1
else
  mkdir -p "$(dirname "$APP")"
  if git clone -q -b "$RAMA" "$REPO" "$APP"; then echo "   bajado ($(git -C "$APP" rev-parse --short HEAD))"
  else echo "   ERROR: no se pudo bajar $REPO (revisa la conexion)."; exit 1; fi
fi
if [ -f "$APP/server/validador/intento.js" ] && ! git -C "$APP" ls-files --error-unmatch js/intento.js > /dev/null 2>&1; then
  install -m 644 "$APP/server/validador/intento.js" "$APP/js/intento.js" && echo "   js/intento.js copiado de server/validador/intento.js (duelos y desafío)"
fi
# El codigo es de root (www-data solo lo lee: si alguien entrara por PHP no podria cambiar el programa)
chown -R root:root "$APP"
chmod -R u+rwX,go+rX,go-w "$APP"
if [ -z "${ENVIVO_REEJECUTADO:-}" ] && [ -f "$APP/server/deploy/instalar.sh" ] && [ "$HUELLA" != "$(sha256sum < "$APP/server/deploy/instalar.sh")" ]; then
  echo "   este instalador cambio en GitHub: se sigue con la version nueva"
  ENVIVO_REEJECUTADO=1 exec bash "$APP/server/deploy/instalar.sh"
fi
# shellcheck source-path=SCRIPTDIR source=comun.sh
. "$APP/server/deploy/comun.sh"

echo "== 5. Configuracion: lineas nuevas de server/config.env.ejemplo (no cambia las que ya estan)"
completar_config "$APP/server/config.env.ejemplo" "$CONF" instalar.sh || exit 1
chown root:www-data "$CONF"; chmod 640 "$CONF"
[ "$CONFIG_CAMBIO" = "1" ] && { systemctl reload "php$PHPV-fpm" 2> /dev/null || true; }

echo "== 6. Tablas de la base de datos"
if sudo -u www-data env ENVIVO_CONFIG="$CONF" php "$APP/server/bin/migrar.php"; then echo "   listo"; else echo "   ERROR en las migraciones (mira el mensaje de arriba)"; exit 1; fi

echo "== 7. Tareas programadas (tarea diaria 4:10, Google Play, Discord, Festival, Liga, Copa de Servidores, salud de servidores)"
TAREA="10 4 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/tareas.php >> /var/log/envivo-tareas.log 2>&1"
touch /var/log/envivo-tareas.log && chown www-data:www-data /var/log/envivo-tareas.log
# Google Play: cada 6 horas reintenta avisos a Google y revisa compras anuladas (reembolsos / contracargos)
# Todas las tareas programadas del juego (cron de www-data, con ENVIVO_CONFIG). Se reescriben cada vez (no se duplican).
CRON_JUEGO="$(cat <<CRON
$TAREA
25 */6 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/google_anulados.php >> /var/log/envivo-tareas.log 2>&1
*/10 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/discord_sync.php >> /var/log/envivo-discord.log 2>&1
*/10 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/festival.php >> /var/log/envivo-festival.log 2>&1
1 0 * * 1 ENVIVO_CONFIG=$CONF php $APP/server/bin/liga.php >> /var/log/envivo-liga.log 2>&1
15 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/liga.php >> /var/log/envivo-liga.log 2>&1
*/10 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/copas.php >> /var/log/envivo-copas.log 2>&1
20 0 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/salud_servidores.php >> /var/log/envivo-servidores.log 2>&1
*/5 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/facturacion.php >> /var/log/envivo-facturacion.log 2>&1
* * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/push_enviar.php >> /var/log/envivo-push.log 2>&1
40 4 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/errores.php >> /var/log/envivo-tareas.log 2>&1
40 0 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/analitica.php >> /var/log/envivo-tareas.log 2>&1
35 1-23 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/analitica.php --dias 2 > /dev/null 2>> /var/log/envivo-tareas.log
CRON
)"
for l in envivo-tareas envivo-discord envivo-festival envivo-liga envivo-copas envivo-servidores envivo-facturacion envivo-push; do touch "/var/log/$l.log" && chown www-data:www-data "/var/log/$l.log"; done
( crontab -u www-data -l 2> /dev/null | grep -v "$APP/server/bin/"; echo "$CRON_JUEGO" ) | crontab -u www-data - && echo "   listo (cron de www-data: tareas, google, discord, festival, liga, copas, salud de servidores, facturación)" || echo "   AVISO: no se pudo programar las tareas (revisa: crontab -u www-data -l)"

echo "== 8. Node y el validador de partidas (eventos en linea sin trampas)"
VALIDADOR="no"
if preparar_node && instalar_validador "$APP" "$CONF"; then VALIDADOR="si"; fi

echo "== 8b. PHP: grupo propio del juego (el ERP y TuPass siguen en el suyo)"
POOL_SOCK=""
# shellcheck source=ops/pool_fpm.sh
[ -f "$APP/server/deploy/ops/pool_fpm.sh" ] && . "$APP/server/deploy/ops/pool_fpm.sh" && instalar_pool_fpm && SOCK="$POOL_SOCK"

export DOMINIO APP SOCK   # los usa nginx-sitio.sh
echo "== 9. nginx: sitio $DOMINIO (y las zonas de límite /etc/nginx/conf.d/envivo-limites.conf)"
# Rangos de Cloudflare para la IP real (solo los usa este sitio) y su cron semanal (ops/cloudflare_ips.sh)
[ -f "$APP/server/deploy/ops/cloudflare_ips.sh" ] && SIN_RECARGAR=1 bash "$APP/server/deploy/ops/cloudflare_ips.sh" --instalar
# Zonas de límite por IP (limit_req_zone) que usa el sitio en /api/: deben existir ANTES de "nginx -t"
LIMITES=/etc/nginx/conf.d/envivo-limites.conf
grep -qE '^\s*include\s+/etc/nginx/conf\.d/\*\.conf;' /etc/nginx/nginx.conf || echo "   AVISO: /etc/nginx/nginx.conf no incluye /etc/nginx/conf.d/*.conf: nginx -t va a fallar (revisa: grep -n include /etc/nginx/nginx.conf)"
LIM_ANTES=""; [ -f "$LIMITES" ] && LIM_ANTES="$(mktemp)" && cp -p "$LIMITES" "$LIM_ANTES"
install -o root -g root -m 644 "$APP/server/deploy/ops/nginx-envivo-limites.conf" "$LIMITES"
NUEVO="$(mktemp)"
bash "$APP/server/deploy/nginx-sitio.sh" > "$NUEVO"
ANTES=""
[ -f "$SITIO" ] && ANTES="$(mktemp)" && cp -p "$SITIO" "$ANTES"
install -m 644 "$NUEVO" "$SITIO"; rm -f "$NUEVO"
ENLACE_NUEVO=0
[ -L "/etc/nginx/sites-enabled/$DOMINIO" ] || { ln -s "$SITIO" "/etc/nginx/sites-enabled/$DOMINIO"; ENLACE_NUEVO=1; }
if nginx -t > /tmp/envivo-nginx-t.log 2>&1; then
  systemctl reload nginx && echo "   listo (nginx -t correcto y nginx recargado)"
else
  echo "   ERROR: nginx -t fallo. NO se recargo nginx y se deja como estaba. Detalle:"
  sed 's/^/     /' /tmp/envivo-nginx-t.log
  if [ -n "$ANTES" ]; then cp -p "$ANTES" "$SITIO"; else rm -f "$SITIO"; fi
  if [ -n "$LIM_ANTES" ]; then cp -p "$LIM_ANTES" "$LIMITES"; else rm -f "$LIMITES"; fi
  [ "$ENLACE_NUEVO" = "1" ] && rm -f "/etc/nginx/sites-enabled/$DOMINIO"
  exit 1
fi
[ -n "$ANTES" ] && rm -f "$ANTES"
[ -n "$LIM_ANTES" ] && rm -f "$LIM_ANTES"

echo "== 10. Certificado HTTPS"
if [ -f "/etc/letsencrypt/live/$DOMINIO/fullchain.pem" ]; then
  echo "   ya hay certificado para $DOMINIO (el sitio ya usa HTTPS)"
elif command -v certbot > /dev/null; then
  RESP="n"
  if { : < /dev/tty; } 2> /dev/null; then
    echo "   Antes de seguir, el DNS de $DOMINIO debe apuntar a este servidor (ver la lista del final)."
    printf '   Sacar el certificado HTTPS ahora con certbot? (s/n) y Enter: '; read -r RESP < /dev/tty || RESP="n"
  fi
  if [ "$RESP" = "s" ] || [ "$RESP" = "S" ]; then
    if certbot --nginx -d "$DOMINIO"; then
      # Se vuelve a escribir el sitio, ya con HTTPS, con la plantilla de siempre (y se prueba otra vez)
      bash "$APP/server/deploy/nginx-sitio.sh" > "$SITIO.nuevo"
      cp -p "$SITIO" "$SITIO.certbot"; mv "$SITIO.nuevo" "$SITIO"
      if nginx -t > /dev/null 2>&1; then systemctl reload nginx; rm -f "$SITIO.certbot"; echo "   HTTPS listo"
      else mv "$SITIO.certbot" "$SITIO"; nginx -t > /dev/null 2>&1 && systemctl reload nginx; echo "   HTTPS listo (se dejo la version de certbot)"; fi
    else
      echo "   AVISO: certbot no pudo. Revisa que el DNS ya apunte aqui y vuelve a correr el instalador."
    fi
  else
    echo "   saltado. Cuando el DNS ya apunte aqui:   sudo certbot --nginx -d $DOMINIO   y luego otra vez este instalador"
  fi
else
  echo "   certbot no esta instalado. Para instalarlo:  sudo apt install certbot python3-certbot-nginx"
fi

echo
echo "=========== RESULTADO ==========="
echo "1) Version del juego: $(git -C "$APP" log -1 --format='%h %cd' --date=short 2> /dev/null)"
echo "2) Base de datos: $(stat -c '%U:%G %s bytes' "$DATOS/envivo.sqlite" 2> /dev/null)"
if [ -f "/etc/letsencrypt/live/$DOMINIO/fullchain.pem" ]; then PRUEBA=(curl -sk --noproxy '*' --resolve "$DOMINIO:443:127.0.0.1" -o /dev/null -w '%{http_code}'); BASE="https://$DOMINIO"
else PRUEBA=(curl -s --noproxy '*' --resolve "$DOMINIO:80:127.0.0.1" -o /dev/null -w '%{http_code}'); BASE="http://$DOMINIO"; fi
# "systemctl reload nginx" no espera a que nginx abra el puerto 443 nuevo: si sale 000 (no conecto) se reintenta unos segundos
probar() { local c _; for _ in 1 2 3 4 5 6 7 8 9 10; do c="$("${PRUEBA[@]}" --max-time 10 "$1")"; [ "$c" != "000" ] && break; sleep 1; done; echo "$c"; }
echo "3) Prueba de la API en este servidor: $(probar "$BASE/api/estado") (debe ser 200)"
echo "4) Prueba de que el codigo esta protegido: $(probar "$BASE/server/src/Config.php") (debe ser 404)"
if grep -qE '^ENVIVO_ADMIN_CLAVE_HASH=.+' "$CONF"; then
  grep -qE '^ENVIVO_ADMIN_TOTP=.+' "$CONF" && echo "5) Centro de Control /control/: con usuario, clave y codigo del celular" || echo "5) Centro de Control /control/: con usuario y clave (falta el codigo del celular)"
else echo "5) Centro de Control /control/: SIN clave (borra $CONF y corre otra vez el instalador desde la consola)"; fi
if grep -qE '^PLUX_CLAVE_SECRETA=.+' "$CONF"; then echo "6) Plux: credenciales puestas (ambiente: $(grep -E '^PLUX_AMBIENTE=' "$CONF" | cut -d= -f2))"
else echo "6) Plux: SIN credenciales (la tienda muestra 'pago no disponible' hasta ponerlas)"; fi
[ -f "/etc/letsencrypt/live/$DOMINIO/fullchain.pem" ] && echo "7) HTTPS: si" || echo "7) HTTPS: todavia no"
[ "$VALIDADOR" = "si" ] && echo "8) Validador de partidas: activo" || echo "8) Validador de partidas: NO activo (mira el paso 8 de arriba; el juego usa Node directo, mas lento)"
[ -n "$POOL_SOCK" ] && echo "9) PHP del juego: grupo propio envivo ($POOL_SOCK)" || echo "9) PHP del juego: compartido con los otros sitios (mira el paso 8b de arriba)"
echo "================================="
echo
echo "Lista de lo que falta (en orden):"
echo " a) DNS en Cloudflare (tukanec.com > DNS > Records > Add record):"
echo "      Tipo A   Nombre: juego   IPv4: $(curl -s -4 --max-time 5 https://ifconfig.me 2> /dev/null || echo 'LA_IP_DE_ESTE_VPS')   Proxy: DNS only (nube gris)"
echo "    (con la nube gris certbot funciona directo; para ponerla naranja sigue docs/CLOUDFLARE_PRODUCCION.md)"
echo " b) Certificado:   sudo certbot --nginx -d $DOMINIO     y despues otra vez:   sudo bash $APP/server/deploy/instalar.sh"
echo " c) Plux: edita   sudo nano $CONF   pega PLUX_ID_ESTABLECIMIENTO, PLUX_ID_CLIENTE, PLUX_CLAVE_SECRETA y PLUX_LLAVE_PUBLICA"
echo "    (claves de PRODUCCION; PLUX_AMBIENTE=produccion ya viene puesto), guarda con Ctrl+O, Enter, Ctrl+X, y luego:   sudo systemctl reload php$PHPV-fpm"
echo " c2) Codigo del celular (2FA) del Centro de Control: docs/DESPLIEGUE.md, paso 6"
echo " d) Completa [DIRECCION] en terminos.html y privacidad.html y que un abogado los revise (docs/LEGAL_REVISION.md)."
echo " d2) Soporte: crea soporte@tukanec.com (Cloudflare Email Routing) y revisa en $CONF SOPORTE_CORREO y SOPORTE_HORARIO=Lunes a viernes 9:00-18:00"
echo "     Correo del juego (recuperar la contraseña): llena las líneas SMTP_ de $CONF siguiendo docs/CORREO.md"
echo "     y luego:  sudo systemctl reload php$PHPV-fpm   (el juego lo muestra en Ayuda y soporte)"
echo " d3) Google Play (cuando publiques la app): sigue server/GOOGLE_PLAY.md"
echo " e) Centro de Control (ventas, jugadores, soporte):   https://$DOMINIO/control/"
echo " f) Para actualizar mas adelante:   sudo bash $APP/server/deploy/actualizar.sh"
