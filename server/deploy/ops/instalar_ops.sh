#!/usr/bin/env bash
# =====================================================================
#  Instala el respaldo diario y el chequeo de salud de EN VIVO Tycoon en el VPS. Se corre como root (sudo).
#  Se puede correr las veces que se quiera: no duplica nada, no borra respaldos y NO toca los otros sitios
#  (ERP, TuPass): no edita sus archivos, ni el sitio de nginx de nadie, ni el script de restic.
#
#  Uso:   sudo bash /var/www/envivo/server/deploy/ops/instalar_ops.sh
#         sudo DRY_RUN=1 bash .../instalar_ops.sh        solo muestra lo que haria (no cambia nada)
#         sudo bash .../instalar_ops.sh --desinstalar    quita los cron, los scripts y la configuracion de logs
#                                                         (los respaldos de /var/backups/envivo se quedan)
#  Que hace:
#   1. Instala sqlite3 si falta.
#   2. Copia respaldo_envivo.sh y salud_envivo.sh a /usr/local/bin (dueno root, permisos 750).
#   3. Crea /var/backups/envivo y /var/lib/envivo-ops (solo root, 700).
#   4. Crea /etc/envivo/ops.env (ajustes y Telegram) si no existe. Si ya existe, no lo toca.
#   5. Agrega al cron de root (sin repetir):  1:30 respaldo   y   cada hora (minuto 17) chequeo de salud.
#      Antes guarda una copia del cron de root en /var/backups/envivo/.
#   6. Rotacion de los registros del juego (/etc/logrotate.d/envivo, desde envivo.logrotate), probada con logrotate -d:
#      respaldo, salud, tareas, discord, festival y liga.
#   7. Zonas de limite para nginx en /etc/nginx/conf.d/envivo-limites.conf (solo definen zonas: no cambian
#      ningun sitio). Prueba con "nginx -t": si falla, lo quita y deja nginx como estaba. NGINX_LIMITES=0 lo salta.
#   8. Hace el primer respaldo, un chequeo de prueba (sin mandar a Telegram) y muestra la lista de pendientes.
#  Los mensajes van sin tildes a proposito (se leen bien por SSH desde el celular).
# =====================================================================
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN="${DRY_RUN:-0}"
BIN="${BIN:-/usr/local/bin}"
CONF_DIR="${CONF_DIR:-/etc/envivo}"
OPS_CONF="$CONF_DIR/ops.env"
RESPALDOS="${RESPALDOS:-/var/backups/envivo}"
ESTADO_DIR="${ESTADO_DIR:-/var/lib/envivo-ops}"
LOGROTATE="${LOGROTATE:-/etc/logrotate.d/envivo}"
NGINX_LIMITES="${NGINX_LIMITES:-1}"
NGINX_CONF_D="${NGINX_CONF_D:-/etc/nginx/conf.d}"
LIMITES="$NGINX_CONF_D/envivo-limites.conf"
TELEGRAM_HELPER="${TELEGRAM_HELPER:-/usr/local/bin/alerta-telegram.sh}"
CRON_RESPALDO="30 1 * * * $BIN/respaldo_envivo.sh >> /var/log/envivo-respaldo.log 2>&1"
CRON_SALUD="17 * * * * $BIN/salud_envivo.sh >> /var/log/envivo-salud.log 2>&1"
FECHA="$(date +%Y%m%d-%H%M%S)"
cd /tmp || exit 1

[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0"; exit 1; }
for f in respaldo_envivo.sh salud_envivo.sh nginx-envivo-limites.conf envivo.logrotate; do
  [ -f "$SRC/$f" ] || { echo "ERROR: falta $SRC/$f (corre este instalador desde la carpeta del juego)"; exit 1; }
done
haz() { if [ "$DRY_RUN" = "1" ]; then echo "   (prueba) haria: $*"; else "$@"; fi; }
[ "$DRY_RUN" = "1" ] && echo "*** MODO PRUEBA: no se cambia nada ***"

recargar_nginx() {
  if command -v systemctl > /dev/null && [ -d /run/systemd/system ]; then systemctl reload nginx
  else nginx -s reload 2> /dev/null || { echo "   (nginx no esta corriendo como servicio aqui: no se recargo)"; return 0; }; fi
}
cron_actual() { crontab -u root -l 2> /dev/null || true; }
cron_sin_nuestros() { cron_actual | grep -vF "$BIN/respaldo_envivo.sh" | grep -vF "$BIN/salud_envivo.sh"; }

# ---------------------------------------------------------------------------------------------- desinstalar
if [ "${1:-}" = "--desinstalar" ]; then
  echo "== Quitar el respaldo y el chequeo de salud del juego"
  if cron_actual | grep -qF -e "$BIN/respaldo_envivo.sh" -e "$BIN/salud_envivo.sh"; then
    if [ "$DRY_RUN" = "1" ]; then echo "   (prueba) quitaria del cron de root las 2 lineas del juego"
    else
      mkdir -p "$RESPALDOS" && cron_actual > "$RESPALDOS/crontab-root-antes-$FECHA.txt"
      cron_sin_nuestros | crontab -u root - && echo "   cron de root: quitadas las lineas del juego (copia: $RESPALDOS/crontab-root-antes-$FECHA.txt)"
    fi
  fi
  haz rm -f "$BIN/respaldo_envivo.sh" "$BIN/salud_envivo.sh" "$LOGROTATE"
  if [ -f "$LIMITES" ]; then
    if grep -Rqs -e 'zone=envivo_' /etc/nginx/sites-enabled/; then
      echo "   nginx: el sitio del juego todavia usa las zonas envivo_: NO se quita $LIMITES"
    else
      haz mv "$LIMITES" "$RESPALDOS/envivo-limites.conf.quitado-$FECHA"
      if [ "$DRY_RUN" != "1" ]; then
        if nginx -t > /dev/null 2>&1; then recargar_nginx; echo "   nginx: quitado $LIMITES"
        else mv "$RESPALDOS/envivo-limites.conf.quitado-$FECHA" "$LIMITES"; echo "   nginx -t fallo sin el archivo: se dejo como estaba"; fi
      fi
    fi
  fi
  echo "Listo. Los respaldos de $RESPALDOS y $OPS_CONF se quedan (borralos a mano si quieres)."
  exit 0
fi

echo "== 1. Programa sqlite3"
if command -v sqlite3 > /dev/null; then echo "   ya estaba ($(sqlite3 --version | cut -d' ' -f1))"
elif [ "$DRY_RUN" = "1" ]; then echo "   (prueba) instalaria sqlite3"
else
  apt-get update -qq < /dev/null > /dev/null 2>&1
  if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq sqlite3 < /dev/null > /dev/null 2>&1; then echo "   instalado"
  else echo "   ERROR: no se pudo instalar sqlite3. Revisa la conexion y vuelve a correrlo."; exit 1; fi
fi

echo "== 2. Scripts en $BIN"
for f in respaldo_envivo.sh salud_envivo.sh; do
  bash -n "$SRC/$f" || { echo "   ERROR: $f tiene un error de sintaxis. No se instala."; exit 1; }
  if [ -f "$BIN/$f" ] && cmp -s "$SRC/$f" "$BIN/$f"; then echo "   $f: igual (nada que hacer)"
  else haz install -o root -g root -m 750 "$SRC/$f" "$BIN/$f" && echo "   $f: $( [ -f "$BIN/$f" ] && echo 'instalado/actualizado' || echo 'se instalaria')"; fi
done

echo "== 3. Carpetas (solo root)"
for d in "$RESPALDOS" "$ESTADO_DIR"; do
  haz mkdir -p "$d"; haz chown root:root "$d"; haz chmod 700 "$d"
  echo "   $d"
done

echo "== 4. Ajustes $OPS_CONF"
if [ ! -d "$CONF_DIR" ]; then
  echo "   AVISO: no existe $CONF_DIR. Primero instala el juego (server/deploy/instalar.sh). Se sigue con valores por defecto."
elif [ -f "$OPS_CONF" ]; then
  echo "   ya existia: se conserva tal cual"
elif [ "$DRY_RUN" = "1" ]; then
  echo "   (prueba) crearia $OPS_CONF"
else
  ( umask 077; cat > "$OPS_CONF" <<CONF
; Ajustes del respaldo y del chequeo de salud de EN VIVO Tycoon (creado por instalar_ops.sh el $(date '+%Y-%m-%d %H:%M')).
; Solo root lo puede leer (puede llevar el token de Telegram). Formato: NOMBRE=valor. Los cambios valen desde la proxima hora.

; ---- Telegram (el mismo bot qfserver de tus otros avisos) ----
; auto = usa TELEGRAM_TOKEN/TELEGRAM_CHAT_ID si estan aqui; si no, los lee de tu alerta-telegram.sh (sin ejecutarlo);
;        si no los encuentra ahi, llama a alerta-telegram.sh "mensaje".
; directo = solo TELEGRAM_TOKEN/TELEGRAM_CHAT_ID de aqui.   helper = siempre llama a alerta-telegram.sh "mensaje".
TELEGRAM_MODO=auto
TELEGRAM_HELPER=$TELEGRAM_HELPER
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=

; ---- Cada cuanto repetir el mismo aviso (horas) ----
REPETIR_HORAS=3
REPETIR_HORAS_PENDIENTES=12
; 1 = avisar una vez cuando un problema se arregla
AVISAR_ARREGLADO=1

; ---- Umbrales ----
LENTO_SEG=3
DISCO_MIN_LIBRE=15
DB_MAX_MB=1024
CRECE_MAX_MB=100
WAL_MAX_MB=64
ERRORES_MAX=30
LIMITADOS_MAX=300
PAGOS_FALLIDOS_MIN=5
PAGOS_FALLIDOS_PCT=50
SOPORTE_HORAS=24
REPORTES_MAX=10

; ---- Respaldos ----
DIARIOS=7
SEMANALES=4
CONF
  ) && chown root:root "$OPS_CONF" && chmod 600 "$OPS_CONF" && echo "   creado (solo root)"
fi

echo "== 5. Cron de root"
NUEVO="$(cron_sin_nuestros; echo "$CRON_RESPALDO"; echo "$CRON_SALUD")"
if [ "$(cron_actual)" = "$NUEVO" ]; then
  echo "   ya estaba (nada que hacer)"
elif [ "$DRY_RUN" = "1" ]; then
  echo "   (prueba) agregaria:"; echo "     $CRON_RESPALDO"; echo "     $CRON_SALUD"
else
  mkdir -p "$RESPALDOS"
  cron_actual > "$RESPALDOS/crontab-root-antes-$FECHA.txt"; chmod 600 "$RESPALDOS/crontab-root-antes-$FECHA.txt"
  if printf '%s\n' "$NUEVO" | crontab -u root -; then echo "   listo (copia del cron anterior: $RESPALDOS/crontab-root-antes-$FECHA.txt)"
  else echo "   ERROR: no se pudo cambiar el cron de root (no se toco)"; fi
fi
if [ "$DRY_RUN" != "1" ]; then
  n1="$(cron_actual | grep -cF "$BIN/respaldo_envivo.sh")"; n2="$(cron_actual | grep -cF "$BIN/salud_envivo.sh")"
  [ "$n1" = "1" ] && [ "$n2" = "1" ] && echo "   verificado: 1 linea de respaldo y 1 de salud" || echo "   AVISO: revisa con  sudo crontab -l -u root  (respaldo: $n1, salud: $n2)"
fi

echo "== 6. Rotacion de registros ($LOGROTATE)"
LR="$(mktemp)"
cp "$SRC/envivo.logrotate" "$LR"
if ! command -v logrotate > /dev/null; then
  echo "   AVISO: no esta logrotate (sudo apt install logrotate). Se salta."
elif [ -f "$LOGROTATE" ] && cmp -s "$LR" "$LOGROTATE"; then
  echo "   ya estaba (nada que hacer)"
elif logrotate -d "$LR" > "$LR.prueba" 2>&1 && ! grep -qiE '^error' "$LR.prueba"; then
  haz install -o root -g root -m 644 "$LR" "$LOGROTATE" && echo "   listo (probado con logrotate -d)"
else
  echo "   ERROR: logrotate no acepto la configuracion; no se instala. Detalle:"; sed 's/^/     /' "$LR.prueba" | head -n 10
fi
rm -f "$LR" "$LR.prueba"
for f in /var/log/envivo-respaldo.log /var/log/envivo-salud.log; do
  [ -f "$f" ] || { haz touch "$f"; haz chown root:adm "$f"; haz chmod 640 "$f"; }
done

echo "== 7. nginx: zonas de limite ($LIMITES)"
if [ "$NGINX_LIMITES" != "1" ]; then
  echo "   saltado (NGINX_LIMITES=0)"
elif ! command -v nginx > /dev/null; then
  echo "   no hay nginx en este servidor: se salta"
elif ! nginx -T 2> /dev/null | grep -qE "^[[:space:]]*include[[:space:]]+$NGINX_CONF_D/\*\.conf;"; then
  echo "   AVISO: el nginx.conf de este servidor no incluye $NGINX_CONF_D/*.conf. No se instala (mandame:  grep -n include /etc/nginx/nginx.conf)"
elif [ -f "$LIMITES" ] && cmp -s "$SRC/nginx-envivo-limites.conf" "$LIMITES"; then
  echo "   ya estaba (nada que hacer)"
elif ! nginx -t > /dev/null 2>&1; then
  echo "   AVISO: nginx -t YA fallaba antes de tocar nada. No se instala. Revisa:  sudo nginx -t"
elif [ "$DRY_RUN" = "1" ]; then
  echo "   (prueba) copiaria las zonas y probaria con nginx -t"
else
  ANTES=""; [ -f "$LIMITES" ] && ANTES="$RESPALDOS/envivo-limites.conf.antes-$FECHA" && cp -p "$LIMITES" "$ANTES"
  install -o root -g root -m 644 "$SRC/nginx-envivo-limites.conf" "$LIMITES"
  if nginx -t > /tmp/envivo-ops-nginx-t.log 2>&1; then
    recargar_nginx && echo "   listo (nginx -t correcto y nginx recargado). Solo define zonas: las usa el sitio del juego."
  else
    echo "   ERROR: nginx -t fallo con las zonas. Se deja nginx como estaba. Detalle:"; sed 's/^/     /' /tmp/envivo-ops-nginx-t.log | head -n 10
    if [ -n "$ANTES" ]; then cp -p "$ANTES" "$LIMITES"; else rm -f "$LIMITES"; fi
  fi
  rm -f /tmp/envivo-ops-nginx-t.log
fi

echo "== 8. Primer respaldo y chequeo de prueba"
if [ "$DRY_RUN" = "1" ]; then
  echo "   (prueba) correria:  $BIN/respaldo_envivo.sh   y   DRY_RUN=1 $BIN/salud_envivo.sh"
else
  if OPS_CONF="$OPS_CONF" CONF_DIR="$CONF_DIR" DESTINO="$RESPALDOS" "$BIN/respaldo_envivo.sh" >> /var/log/envivo-respaldo.log 2>&1; then echo "   respaldo: OK ($(cut -d' ' -f3 "$RESPALDOS/ULTIMO_RESULTADO" 2> /dev/null))"
  else echo "   respaldo: FALLO. Mira:  sudo tail -n 20 /var/log/envivo-respaldo.log"; fi
  echo "   chequeo de salud (prueba, no manda nada a Telegram):"
  PRUEBA_DIR="$(mktemp -d)"
  OPS_CONF="$OPS_CONF" CONF_DIR="$CONF_DIR" RESPALDOS="$RESPALDOS" DRY_RUN=1 ESTADO_DIR="$PRUEBA_DIR" "$BIN/salud_envivo.sh" 2>&1 | sed 's/^/     /'
  rm -rf "$PRUEBA_DIR"
fi

echo
echo "=========== RESULTADO ==========="
echo "1) Scripts:   $(for f in respaldo_envivo.sh salud_envivo.sh; do [ -x "$BIN/$f" ] && printf '%s ' "$BIN/$f"; done)"
echo "2) Cron de root:"; cron_actual | grep -F -e "$BIN/respaldo_envivo.sh" -e "$BIN/salud_envivo.sh" | sed 's/^/     /'
echo "3) Respaldos: $RESPALDOS ($(find "$RESPALDOS/diario" -maxdepth 1 -name 'envivo-*.sqlite.gz' 2> /dev/null | wc -l) diario(s))"
if [ -x "$BIN/salud_envivo.sh" ]; then
  MODO_TG="$(OPS_CONF="$OPS_CONF" "$BIN/salud_envivo.sh" --modo-telegram 2> /dev/null)"
  if [ "${MODO_TG:-ninguno}" = "ninguno" ]; then echo "4) Telegram:  NO configurado (no esta $TELEGRAM_HELPER: pon TELEGRAM_TOKEN y TELEGRAM_CHAT_ID en $OPS_CONF)"
  else echo "4) Telegram:  $MODO_TG"; fi
fi
echo "5) nginx:     $( [ -f "$LIMITES" ] && echo "zonas instaladas en $LIMITES" || echo 'zonas NO instaladas')"
echo "================================="
echo
echo "Lista de lo que falta (en orden, ver docs/OPERACION.md):"
echo " a) Probar que llegan las alertas:   sudo $BIN/salud_envivo.sh --probar-telegram"
echo " b) Agregar /var/backups/envivo y /etc/envivo al restic de las 2:00 (docs/OPERACION.md, paso 3)."
echo "    Primero mandame lo que sale de:   sudo grep -n \"/etc/erp_qf\\|/var/www\" /usr/local/bin/backup_restic_erp_qf.sh"
echo " c) Ver los respaldos:   sudo $BIN/respaldo_envivo.sh --listar"
