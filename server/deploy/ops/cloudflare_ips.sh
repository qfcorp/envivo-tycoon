#!/usr/bin/env bash
# =====================================================================
#  Rangos de IP de Cloudflare para el sitio del juego (nube naranja: docs/CLOUDFLARE_PRODUCCION.md).
#  Escribe DOS archivos, que solo usa el juego (los otros sitios del VPS no cambian):
#   /etc/nginx/snippets/envivo-cloudflare-realip.conf  "set_real_ip_from" + "real_ip_header CF-Connecting-IP":
#        nginx ve la IP REAL del jugador (limites por IP, registros). Lo incluye SOLO el sitio del juego.
#   /etc/nginx/conf.d/envivo-cloudflare-geo.conf       define la variable $envivo_desde_cf (1 = llego por Cloudflare).
#        Solo define una variable; la usa el sitio del juego si se activa "solo Cloudflare" (paso 7 de la guia).
#  Uso (como root):
#    sudo bash cloudflare_ips.sh               baja la lista de Cloudflare; si cambio, la pone (nginx -t y recarga;
#                                              si nginx -t falla, deja todo como estaba). Lo corre el cron cada lunes.
#    sudo bash cloudflare_ips.sh --instalar    (lo usa instalar.sh) si faltan los archivos los crea con la copia del
#                                              repositorio (ops/cloudflare-ips.txt) y pone el cron semanal. No recarga.
#    sudo bash cloudflare_ips.sh --desde-repo  pone la copia del repositorio (sin internet)
#    sudo DRY_RUN=1 bash cloudflare_ips.sh     solo dice que haria
#  Si la lista bajada viene rara (vacia, muy corta o con algo que no es un rango), NO se cambia nada.
#  Variables (para pruebas): CF_URL_V4, CF_URL_V6, CF_REALIP, CF_GEO, CRON_CF, APP, SIN_RECARGAR=1.
#  Los mensajes van sin tildes a proposito (se leen bien por SSH desde el celular).
# =====================================================================
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${APP:-$(cd "$SRC/../../.." && pwd)}"
LISTA_REPO="$SRC/cloudflare-ips.txt"
CF_URL_V4="${CF_URL_V4:-https://www.cloudflare.com/ips-v4}"
CF_URL_V6="${CF_URL_V6:-https://www.cloudflare.com/ips-v6}"
CF_REALIP="${CF_REALIP:-/etc/nginx/snippets/envivo-cloudflare-realip.conf}"
CF_GEO="${CF_GEO:-/etc/nginx/conf.d/envivo-cloudflare-geo.conf}"
CRON_CF="${CRON_CF:-/etc/cron.d/envivo-cloudflare}"
LOG_CF=/var/log/envivo-cloudflare.log
DRY_RUN="${DRY_RUN:-0}"
MIN_V4=10; MIN_V6=4
MODO="${1:-bajar}"
cd /tmp || exit 1
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0"; exit 1; }
command -v nginx > /dev/null || { echo "ERROR: no hay nginx en este servidor"; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ahora() { date '+%Y-%m-%d %H:%M'; }

# Deja en $TMP/rangos.txt solo rangos validos (IPv4/IPv6 con /bits). Sale con 1 si la lista no sirve.
validar() {   # $1 = archivo con la lista (comentarios # permitidos)
  local f="$1" malas v4 v6
  sed -e 's/#.*//' -e 's/[[:space:]]//g' "$f" | grep -v '^$' > "$TMP/crudo.txt"
  malas="$(grep -cvE '^(([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])|[0-9A-Fa-f:]*:[0-9A-Fa-f:]*/([0-9]{1,2}|1[01][0-9]|12[0-8]))$' "$TMP/crudo.txt")"
  v4="$(grep -c '\.' "$TMP/crudo.txt")"; v6="$(grep -c ':' "$TMP/crudo.txt")"
  if [ "$malas" != "0" ] || [ "$v4" -lt "$MIN_V4" ] || [ "$v6" -lt "$MIN_V6" ] || [ "$(wc -l < "$TMP/crudo.txt")" -gt 300 ]; then
    echo "   ERROR: la lista no se ve bien ($v4 IPv4, $v6 IPv6, $malas lineas raras). No se cambia nada."
    return 1
  fi
  sort -u "$TMP/crudo.txt" > "$TMP/rangos.txt"
  echo "   lista valida: $v4 rangos IPv4 y $v6 IPv6"
}

escribir() {   # arma $TMP/realip.conf y $TMP/geo.conf con $TMP/rangos.txt ($1 = de donde salio)
  local r
  {
    echo "# EN VIVO Tycoon: IP real detras de Cloudflare. Lo escribe server/deploy/ops/cloudflare_ips.sh ($1, $(ahora))."
    echo "# Lo incluye SOLO el sitio del juego. NO editar a mano (se reescribe cada lunes)."
    echo "set_real_ip_from 127.0.0.1;   # tunel de Cloudflare (cloudflared) en este servidor, si algun dia se usa"
    echo "set_real_ip_from ::1;"
    while read -r r; do echo "set_real_ip_from $r;"; done < "$TMP/rangos.txt"
    echo "real_ip_header CF-Connecting-IP;"
  } > "$TMP/realip.conf"
  {
    echo "# EN VIVO Tycoon: \$envivo_desde_cf = 1 si la peticion llego por Cloudflare (o desde este mismo servidor)."
    echo "# Lo escribe server/deploy/ops/cloudflare_ips.sh ($1, $(ahora)). Solo define una variable: no cambia ningun sitio."
    echo "geo \$realip_remote_addr \$envivo_desde_cf {"
    echo "    default 0;"
    echo "    127.0.0.1 1;"
    echo "    ::1 1;"
    while read -r r; do echo "    $r 1;"; done < "$TMP/rangos.txt"
    echo "}"
  } > "$TMP/geo.conf"
}

# Sin contar las 2 lineas de comentario de arriba (la fecha cambia siempre)
igual() { [ -f "$2" ] && cmp -s <(grep -v '^#' "$1") <(grep -v '^#' "$2"); }

recargar_nginx() {
  [ "${SIN_RECARGAR:-0}" = "1" ] && return 0
  if command -v systemctl > /dev/null && [ -d /run/systemd/system ]; then systemctl reload nginx
  else nginx -s reload 2> /dev/null || true; fi
}

# Pone los dos archivos, prueba con nginx -t y recarga. Si falla, vuelve a como estaba.
poner() {   # $1 = recargar (1/0)
  local a1="" a2=""
  if igual "$TMP/realip.conf" "$CF_REALIP" && igual "$TMP/geo.conf" "$CF_GEO"; then echo "   sin cambios (ya estaba al dia)"; return 0; fi
  if [ "$DRY_RUN" = "1" ]; then echo "   (prueba) pondria $CF_REALIP y $CF_GEO"; diff <(grep -v '^#' "$CF_REALIP" 2> /dev/null) <(grep -v '^#' "$TMP/realip.conf") | sed 's/^/     /' | head -n 20; return 0; fi
  if ! nginx -t > "$TMP/t0.log" 2>&1; then echo "   AVISO: nginx -t YA fallaba antes de tocar nada. No se cambia. Revisa:  sudo nginx -t"; return 1; fi
  mkdir -p "$(dirname "$CF_REALIP")" "$(dirname "$CF_GEO")"
  [ -f "$CF_REALIP" ] && a1="$TMP/realip.antes" && cp -p "$CF_REALIP" "$a1"
  [ -f "$CF_GEO" ] && a2="$TMP/geo.antes" && cp -p "$CF_GEO" "$a2"
  install -o root -g root -m 644 "$TMP/realip.conf" "$CF_REALIP"
  install -o root -g root -m 644 "$TMP/geo.conf" "$CF_GEO"
  if nginx -t > "$TMP/t.log" 2>&1; then
    if [ "$1" = "1" ]; then recargar_nginx && echo "   listo: nginx -t correcto y nginx recargado"; else echo "   listo: nginx -t correcto"; fi
    return 0
  fi
  echo "   ERROR: nginx -t fallo con la lista nueva. Se deja como estaba. Detalle:"; sed 's/^/     /' "$TMP/t.log" | head -n 8
  if [ -n "$a1" ]; then cp -p "$a1" "$CF_REALIP"; else rm -f "$CF_REALIP"; fi
  if [ -n "$a2" ]; then cp -p "$a2" "$CF_GEO"; else rm -f "$CF_GEO"; fi
  return 1
}

poner_cron() {
  local linea="41 4 * * 1 root bash $APP/server/deploy/ops/cloudflare_ips.sh >> $LOG_CF 2>&1"
  local texto; texto="$(printf '# EN VIVO Tycoon: rangos de Cloudflare al dia cada lunes 4:41 (server/deploy/ops/cloudflare_ips.sh)\nSHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n%s\n' "$linea")"
  if [ -f "$CRON_CF" ] && [ "$(cat "$CRON_CF")" = "$texto" ]; then echo "   cron semanal: ya estaba ($CRON_CF)"; return 0; fi
  [ "$DRY_RUN" = "1" ] && { echo "   (prueba) pondria el cron $CRON_CF"; return 0; }
  printf '%s\n' "$texto" > "$TMP/cron" && install -o root -g root -m 644 "$TMP/cron" "$CRON_CF" && echo "   cron semanal: $CRON_CF (lunes 4:41)"
  [ -f "$LOG_CF" ] || { touch "$LOG_CF"; chown root:adm "$LOG_CF" 2> /dev/null; chmod 640 "$LOG_CF"; }
}

case "$MODO" in
  --instalar)
    if [ -f "$CF_REALIP" ] && [ -f "$CF_GEO" ]; then echo "   rangos de Cloudflare: ya estaban ($CF_REALIP)"
    else validar "$LISTA_REPO" || exit 1; escribir "copia del repositorio"; poner 0 || exit 1; fi
    poner_cron ;;
  --desde-repo)
    echo "[$(ahora)] Rangos de Cloudflare desde la copia del repositorio"
    validar "$LISTA_REPO" || exit 1; escribir "copia del repositorio"; poner 1 || exit 1 ;;
  bajar|--bajar)
    echo "[$(ahora)] Rangos de Cloudflare: bajando $CF_URL_V4 y $CF_URL_V6"
    if ! curl -fsS --max-time 20 "$CF_URL_V4" -o "$TMP/v4" || ! curl -fsS --max-time 20 "$CF_URL_V6" -o "$TMP/v6"; then
      echo "   ERROR: no se pudo bajar la lista (sin internet?). Se queda la que estaba."; exit 1
    fi
    { cat "$TMP/v4"; echo; cat "$TMP/v6"; echo; } > "$TMP/bajada.txt"
    validar "$TMP/bajada.txt" || exit 1; escribir "bajada de cloudflare.com"; poner 1 || exit 1 ;;
  *) echo "Uso: sudo bash $0 [--instalar | --desde-repo]"; exit 1 ;;
esac
exit 0
