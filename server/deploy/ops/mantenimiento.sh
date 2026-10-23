#!/usr/bin/env bash
# =====================================================================
#  Modo mantenimiento de TODO el juego (docs/INCIDENTES.md). Distinto del "mantenimiento de la tienda" del Centro de
#  Control (ese solo frena las compras). Aqui nginx responde 503 en JSON a /api/ y /pago.php, asi nadie escribe en la
#  base mientras se restaura un respaldo o se arregla algo. No toca el ERP ni TuPass.
#  Sigue funcionando: el juego sin conexion (la PWA), /api/salud (dice "mantenimiento":true), los avisos de pago de
#  Plux (/api/plux/webhook y /api/plux/3ds: un pago que ya se hizo no se pierde) y el Centro de Control /control/.
#  Uso:
#    sudo bash mantenimiento.sh on [--discord "texto"] [--minutos 30]   encender (con aviso opcional en Discord)
#    sudo bash mantenimiento.sh off [--discord "texto"]                 apagar
#    sudo bash mantenimiento.sh estado
#  Funciona con el sitio de nginx que escribe instalar.sh desde esta version (si el sitio es mas viejo, lo avisa).
#  Variables (para pruebas): MANT, CONF, APP, SITIO, DOMINIO.
# =====================================================================
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MANT="${MANT:-/etc/envivo/MANTENIMIENTO}"
CONF="${CONF:-/etc/envivo/config.env}"
APP="${APP:-/var/www/envivo}"
DOMINIO="${DOMINIO:-juego.tukanec.com}"
SITIO="${SITIO:-/etc/nginx/sites-available/$DOMINIO}"
cd /tmp || exit 1
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0 ${1:-estado}"; exit 1; }
ACCION="${1:-estado}"; shift 2> /dev/null
DISCORD=""; MINUTOS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --discord) DISCORD="${2:-}"; shift 2 ;;
    --minutos) MINUTOS="${2:-}"; shift 2 ;;
    *) echo "No entiendo: $1"; exit 1 ;;
  esac
done
case "$MINUTOS" in ''|*[!0-9]*) MINUTOS="" ;; esac

discord() {   # $1 = texto, $2 = hasta (segundos Unix o vacio). Usa el bot del juego (si Discord esta configurado)
  [ -n "$1" ] || return 0
  # shellcheck disable=SC2016  # (codigo PHP entre comillas simples a proposito)
  if sudo -u www-data env ENVIVO_CONFIG="$CONF" ENVIVO_APP="$APP/server/src/arranque.php" ENVIVO_TXT="$1" ENVIVO_HASTA="${2:-}" php -r '
      require getenv("ENVIVO_APP");
      $h = getenv("ENVIVO_HASTA"); exit(\EnVivo\Discord::anunciarMantenimiento((string) getenv("ENVIVO_TXT"), $h !== "" ? (int) $h : null) ? 0 : 1);' 2> /dev/null; then
    echo "   aviso publicado en Discord (canal de estado)"
  else
    echo "   AVISO: no se pudo publicar en Discord (sin bot configurado?). Avisa a mano."
  fi
}

sitio_ok() { [ -f "$SITIO" ] && grep -qF "$MANT" "$SITIO"; }

case "$ACCION" in
  on|encender)
    sitio_ok || echo "   AVISO: el sitio de nginx $SITIO no tiene el modo mantenimiento. Corre antes:  sudo bash $APP/server/deploy/instalar.sh"
    { echo "desde=$(date '+%Y-%m-%d %H:%M:%S')"; [ -n "$MINUTOS" ] && echo "minutos=$MINUTOS"; } > "$MANT"
    chown root:www-data "$MANT"; chmod 640 "$MANT"
    echo "MANTENIMIENTO ENCENDIDO: /api/ y /pago.php responden 503 (el ERP y TuPass no cambian)."
    HASTA=""; [ -n "$MINUTOS" ] && HASTA=$(( $(date +%s) + MINUTOS * 60 ))
    discord "$DISCORD" "$HASTA"
    echo "Para apagarlo:   sudo bash $0 off" ;;
  off|apagar)
    rm -f "$MANT"
    echo "MANTENIMIENTO APAGADO: el juego atiende normal."
    discord "$DISCORD" ""
    ;;
  estado)
    if [ -f "$MANT" ]; then echo "ENCENDIDO ($(tr '\n' ' ' < "$MANT"))"; else echo "apagado"; fi
    sitio_ok && echo "   (el sitio de nginx tiene el modo mantenimiento)" || echo "   AVISO: el sitio de nginx no tiene el modo mantenimiento (corre instalar.sh)" ;;
  *) echo "Uso: sudo bash $0 on|off|estado [--discord \"texto\"] [--minutos N]"; exit 1 ;;
esac
