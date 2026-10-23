# shellcheck shell=bash
# =====================================================================
#  Grupo PROPIO de PHP para el juego (php-fpm "pool" [envivo]). Se carga con "source" desde instalar.sh y actualizar.sh;
#  solo no hace nada. El ERP y TuPass siguen en el grupo [www] de siempre (/run/php/php8.3-fpm.sock): si el juego se
#  llena no les quita procesos de PHP, y al reves. Nunca se toca www.conf ni otro archivo de pool.d.
#
#   instalar_pool_fpm   escribe /etc/php/8.3/fpm/pool.d/envivo.conf, lo prueba con "php-fpm8.3 -t" ANTES de recargar
#                       (si la prueba falla lo deja como estaba y NO recarga: los otros sitios no se enteran),
#                       recarga php-fpm y espera el socket /run/php/php8.3-fpm-envivo.sock. Deja POOL_SOCK.
#                       Sale con 1 si no se pudo (el juego sigue en el grupo compartido, como antes).
#   revisar_pool_fpm    (actualizar.sh) si el sitio de nginx usa el grupo del juego, lo pone al dia y revisa el socket.
#   pool_fpm_hijos      cuantos procesos de PHP como maximo: FPM_MAX_HIJOS, si no el que ya tenia el archivo
#                       (asi se respeta un cambio a mano), si no segun la memoria (1 por cada 300 MB, entre 4 y 12).
#  Variables (para pruebas): PHPV, FPM_POOL_DIR, FPM_BIN, POOL_SOCK_JUEGO, FPM_MAX_HIJOS, FPM_ESPERA (segundos),
#  FPM_LENTO_LOG.   Los mensajes van sin tildes a proposito (se leen bien por SSH desde el celular).
# =====================================================================

pool_fpm_rutas() {
  local v="${PHPV:-8.3}"
  FPM_POOL_DIR="${FPM_POOL_DIR:-/etc/php/$v/fpm/pool.d}"
  FPM_POOL="$FPM_POOL_DIR/envivo.conf"
  FPM_BIN="${FPM_BIN:-php-fpm$v}"
  POOL_SOCK_JUEGO="${POOL_SOCK_JUEGO:-/run/php/php$v-fpm-envivo.sock}"
  FPM_LENTO_LOG="${FPM_LENTO_LOG:-/var/log/envivo-php-lento.log}"
}

pool_fpm_hijos() {
  local n="${FPM_MAX_HIJOS:-}" mem
  [ -z "$n" ] && [ -f "$FPM_POOL" ] && n="$(sed -n 's/^[[:space:]]*pm\.max_children[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$FPM_POOL" | tail -n 1)"
  if [ -z "$n" ]; then
    mem="$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo 2> /dev/null)"; mem="${mem:-2048}"
    n=$(( mem / 300 )); [ "$n" -lt 4 ] && n=4; [ "$n" -gt 12 ] && n=12
  fi
  case "$n" in ''|*[!0-9]*) n=6 ;; esac
  [ "$n" -lt 2 ] && n=2; [ "$n" -gt 64 ] && n=64
  echo "$n"
}

pool_fpm_texto() {   # $1 = pm.max_children
  local h="$1" ini=2 min=1 max=3
  [ "$h" -ge 6 ] && { ini=3; min=2; max=4; }
  [ "$h" -ge 10 ] && { ini=4; min=2; max=6; }
  cat <<POOL
; EN VIVO Tycoon (juego.tukanec.com): grupo PROPIO de PHP. Lo escribe server/deploy/instalar.sh (ops/pool_fpm.sh)
; y actualizar.sh lo mantiene. NO es el grupo [www] del ERP y TuPass (ese no se toca).
; Para cambiar cuantos procesos usa como maximo:   sudo FPM_MAX_HIJOS=8 bash /var/www/envivo/server/deploy/instalar.sh
; (o cambia pm.max_children aqui a mano: el instalador respeta el numero que encuentre).
[envivo]
user = www-data
group = www-data
listen = $POOL_SOCK_JUEGO
listen.owner = www-data
listen.group = www-data
listen.mode = 0660

; Procesos: crecen con la gente y bajan cuando no hay nadie (el VPS es compartido)
pm = dynamic
pm.max_children = $h
pm.start_servers = $ini
pm.min_spare_servers = $min
pm.max_spare_servers = $max
pm.max_requests = 500

; Una peticion pegada se corta a los 100 s (nginx espera hasta 90 s en /api/).
; Las que tardan mas de 5 s quedan en $FPM_LENTO_LOG con lo que estaban haciendo.
request_terminate_timeout = 100s
request_slowlog_timeout = 5s
slowlog = $FPM_LENTO_LOG

; Solo lo del juego: sin las variables de entorno del sistema; errores al registro de PHP-FPM
clear_env = yes
catch_workers_output = yes
php_admin_flag[log_errors] = on
php_admin_flag[display_errors] = off
php_admin_value[max_execution_time] = 95
php_admin_value[memory_limit] = 192M
POOL
}

# Si OTRO archivo de pool.d ya tiene un [envivo] o usa nuestro socket, se dice cual (y no se crea el grupo)
pool_fpm_choca() {
  local f
  for f in "$FPM_POOL_DIR"/*.conf; do
    if [ ! -f "$f" ] || [ "$f" = "$FPM_POOL" ]; then continue; fi
    grep -qE '^[[:space:]]*\[envivo\]' "$f" && { echo "$f ya define un grupo [envivo]"; return 0; }
    grep -qE "^[[:space:]]*listen[[:space:]]*=[[:space:]]*${POOL_SOCK_JUEGO}[[:space:]]*$" "$f" && { echo "$f ya usa $POOL_SOCK_JUEGO"; return 0; }
  done
  return 1
}

pool_fpm_recargar() {
  local _
  systemctl reload "php${PHPV:-8.3}-fpm" 2> /dev/null || return 1
  for _ in $(seq 1 $(( ${FPM_ESPERA:-15} * 2 ))); do [ -S "$POOL_SOCK_JUEGO" ] && return 0; sleep 0.5; done
  return 1
}

instalar_pool_fpm() {
  local nuevo antes choque h
  pool_fpm_rutas
  POOL_SOCK=""
  if [ ! -d "$FPM_POOL_DIR" ] || ! command -v "$FPM_BIN" > /dev/null; then
    echo "   AVISO: no esta $FPM_POOL_DIR o $FPM_BIN: el juego sigue en el PHP compartido"; return 1
  fi
  if choque="$(pool_fpm_choca)"; then echo "   AVISO: $choque. No se crea el grupo del juego (sigue en el PHP compartido)"; return 1; fi
  h="$(pool_fpm_hijos)"
  nuevo="$(mktemp)"; pool_fpm_texto "$h" > "$nuevo"
  if [ -f "$FPM_POOL" ] && cmp -s "$nuevo" "$FPM_POOL"; then
    rm -f "$nuevo"
    if [ -S "$POOL_SOCK_JUEGO" ] || pool_fpm_recargar; then
      POOL_SOCK="$POOL_SOCK_JUEGO"; echo "   grupo envivo: ya estaba (maximo $h procesos, socket $POOL_SOCK_JUEGO)"; return 0
    fi
    echo "   AVISO: el grupo envivo esta escrito pero su socket no aparece. Revisa:  sudo tail -n 20 /var/log/php${PHPV:-8.3}-fpm.log"
    return 1
  fi
  # La configuracion de PHP-FPM tiene que estar bien ANTES de tocar nada (si ya fallaba, es cosa de otro sitio: no se toca)
  if ! "$FPM_BIN" -t > /tmp/envivo-fpm-t.log 2>&1; then
    rm -f "$nuevo"
    echo "   AVISO: \"$FPM_BIN -t\" YA fallaba antes de tocar nada: no se cambia PHP. Detalle:"; sed 's/^/     /' /tmp/envivo-fpm-t.log | head -n 5
    [ -f "$FPM_POOL" ] && [ -S "$POOL_SOCK_JUEGO" ] && { POOL_SOCK="$POOL_SOCK_JUEGO"; echo "   (el grupo envivo que ya estaba sigue funcionando)"; return 0; }
    return 1
  fi
  antes=""; [ -f "$FPM_POOL" ] && antes="$(mktemp)" && cp -p "$FPM_POOL" "$antes"
  install -o root -g root -m 644 "$nuevo" "$FPM_POOL"; rm -f "$nuevo"
  [ -f "$FPM_LENTO_LOG" ] || { touch "$FPM_LENTO_LOG" && chmod 640 "$FPM_LENTO_LOG"; } 2> /dev/null
  if ! "$FPM_BIN" -t > /tmp/envivo-fpm-t.log 2>&1; then
    echo "   ERROR: \"$FPM_BIN -t\" fallo con el grupo envivo. Se deja PHP como estaba (no se recargo). Detalle:"
    sed 's/^/     /' /tmp/envivo-fpm-t.log | head -n 5
    if [ -n "$antes" ]; then cp -p "$antes" "$FPM_POOL"; rm -f "$antes"; else rm -f "$FPM_POOL"; fi
    return 1
  fi
  if pool_fpm_recargar; then
    [ -n "$antes" ] && rm -f "$antes"
    # shellcheck disable=SC2034  # (la leen instalar.sh y actualizar.sh)
    POOL_SOCK="$POOL_SOCK_JUEGO"
    echo "   grupo envivo listo: maximo $h procesos, socket $POOL_SOCK_JUEGO (el ERP y TuPass siguen en el suyo)"
    return 0
  fi
  echo "   ERROR: PHP-FPM no abrio $POOL_SOCK_JUEGO. Se vuelve a como estaba."
  if [ -n "$antes" ]; then cp -p "$antes" "$FPM_POOL"; rm -f "$antes"; else rm -f "$FPM_POOL"; fi
  systemctl reload "php${PHPV:-8.3}-fpm" 2> /dev/null
  return 1
}

# $1 = archivo del sitio de nginx. Si usa el grupo del juego, lo pone al dia (con la misma prueba) y revisa el socket.
# Si el sitio todavia usa el PHP compartido no hace nada (el cambio lo hace instalar.sh, que tambien reescribe nginx).
revisar_pool_fpm() {
  pool_fpm_rutas
  if [ -f "$1" ] && grep -qF "$POOL_SOCK_JUEGO" "$1"; then
    instalar_pool_fpm || echo "   AVISO: el sitio usa $POOL_SOCK_JUEGO y el grupo envivo no esta bien. Corre:  sudo bash ${APP:-/var/www/envivo}/server/deploy/instalar.sh"
  else
    echo "   el sitio usa el PHP compartido (para el grupo propio del juego corre una vez instalar.sh)"
  fi
}
