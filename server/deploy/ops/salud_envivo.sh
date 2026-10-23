#!/usr/bin/env bash
# =====================================================================
#  Chequeo de salud de EN VIVO Tycoon (juego.tukanec.com). Lo instala server/deploy/ops/instalar_ops.sh
#  en /usr/local/bin/salud_envivo.sh y lo corre el cron de root cada hora (minuto 17).
#  SOLO avisa por Telegram cuando algo esta mal, y el mismo aviso sale como maximo 1 vez cada 3 horas.
#  Cuando el problema se arregla, manda un solo mensaje "ya se arreglo" (AVISAR_ARREGLADO=0 lo apaga).
#
#  Que revisa:
#   1. https://juego.tukanec.com/api/estado responde 200 con el JSON del juego y rapido (menos de 3 s).
#      Se consulta directo a este servidor (curl --resolve ...:127.0.0.1), sin pasar por Cloudflare,
#      igual que el arreglo del chequeo del ERP.
#   2. PHP (php8.3-fpm) prendido y su socket /run/php/php8.3-fpm.sock existe.
#   3. Disco: mas de 15 % libre donde esta la base y donde estan los respaldos.
#   4. Base de datos: que exista, que no crezca de golpe (mas de 100 MB en 24 h), que no pase de 1 GB
#      y que el archivo -wal no pase de 64 MB.
#   5. Errores del sitio en el registro de errores de nginx (mas de 30 en la ultima hora) y muchas
#      peticiones frenadas por el limite (mas de 300 en la ultima hora: posible ataque).
#   6. Pagos: en la ultima hora, 5 o mas pagos fallidos/rechazados y la mitad o mas de los intentos.
#   7. Avisos nuevos del juego para revisar a mano (tabla avisos: pagos que no se pudieron relacionar, etc.).
#   8. Casos de soporte abiertos sin respuesta hace mas de 24 h, reportes de chat pendientes
#      y reembolsos pendientes (si esas tablas existen).
#   9. Respaldo: que el de anoche haya salido bien (archivo de respaldo_envivo.sh, menos de 26 h).
#  10. Certificado HTTPS: que no venza en menos de 14 dias.
#
#  Uso:
#    sudo salud_envivo.sh                     chequeo normal (lo que hace el cron)
#    sudo DRY_RUN=1 salud_envivo.sh           prueba: muestra que avisaria pero NO manda nada a Telegram
#    sudo salud_envivo.sh --probar-telegram   manda un mensaje de prueba para ver que el bot funciona
#    sudo salud_envivo.sh --modo-telegram     solo dice como mandaria los avisos (no manda nada)
#  Ajustes (umbrales, Telegram) en /etc/envivo/ops.env. Ver docs/OPERACION.md.
#  Los mensajes van sin tildes a proposito (se leen bien por SSH desde el celular).
# =====================================================================
set -u
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C

OPS_CONF="${OPS_CONF:-/etc/envivo/ops.env}"
cargar_conf() {
  # Lee solo lineas NOMBRE=valor (no ejecuta nada del archivo). Una variable que ya viene del entorno gana.
  local f="$1" linea k v
  [ -r "$f" ] || return 0
  while IFS= read -r linea || [ -n "$linea" ]; do
    linea="${linea%$'\r'}"
    [[ "$linea" =~ ^[[:space:]]*([A-Z][A-Z0-9_]*)=(.*)$ ]] || continue
    k="${BASH_REMATCH[1]}"; v="${BASH_REMATCH[2]}"
    v="${v%"${v##*[![:space:]]}"}"
    if [[ "$v" =~ ^\"(.*)\"$ ]] || [[ "$v" =~ ^\'(.*)\'$ ]]; then v="${BASH_REMATCH[1]}"; fi
    [ -n "${!k+x}" ] || printf -v "$k" '%s' "$v"
  done < "$f"
}
cargar_conf "$OPS_CONF"

DOMINIO="${DOMINIO:-juego.tukanec.com}"
CONF_DIR="${CONF_DIR:-/etc/envivo}"
if [ -z "${DB:-}" ] && [ -r "$CONF_DIR/config.env" ]; then
  DB="$(sed -n 's/^ENVIVO_DB=//p' "$CONF_DIR/config.env" | tail -n 1 | tr -d '\r')"
fi
DB="${DB:-/var/lib/envivo/envivo.sqlite}"
PHPV="${PHPV:-8.3}"
FPM_SOCK="${FPM_SOCK:-/run/php/php$PHPV-fpm.sock}"
FPM_SERVICIO="${FPM_SERVICIO:-php$PHPV-fpm}"
CERT="${CERT:-/etc/letsencrypt/live/$DOMINIO/fullchain.pem}"
# https si ya hay certificado; si no, http (igual que la prueba final de instalar.sh)
if [ -z "${ESQUEMA:-}" ]; then [ -f "$CERT" ] && ESQUEMA=https || ESQUEMA=http; fi
if [ -z "${PUERTO:-}" ]; then [ "$ESQUEMA" = "https" ] && PUERTO=443 || PUERTO=80; fi
IP_LOCAL="${IP_LOCAL:-127.0.0.1}"
LENTO_SEG="${LENTO_SEG:-3}"
DISCO_MIN_LIBRE="${DISCO_MIN_LIBRE:-15}"
DB_MAX_MB="${DB_MAX_MB:-1024}"
CRECE_MAX_MB="${CRECE_MAX_MB:-100}"
WAL_MAX_MB="${WAL_MAX_MB:-64}"
NGINX_ERROR_LOG="${NGINX_ERROR_LOG:-/var/log/nginx/error.log}"
ERRORES_MAX="${ERRORES_MAX:-30}"
LIMITADOS_MAX="${LIMITADOS_MAX:-300}"
PAGOS_FALLIDOS_MIN="${PAGOS_FALLIDOS_MIN:-5}"
PAGOS_FALLIDOS_PCT="${PAGOS_FALLIDOS_PCT:-50}"
SOPORTE_HORAS="${SOPORTE_HORAS:-24}"
REPORTES_MAX="${REPORTES_MAX:-10}"
RESPALDOS="${RESPALDOS:-/var/backups/envivo}"
RESPALDO_MAX_HORAS="${RESPALDO_MAX_HORAS:-26}"
CERT_MIN_DIAS="${CERT_MIN_DIAS:-14}"
REPETIR_HORAS="${REPETIR_HORAS:-3}"
REPETIR_HORAS_PENDIENTES="${REPETIR_HORAS_PENDIENTES:-12}"   # recordatorios de soporte/reportes/reembolsos
AVISAR_ARREGLADO="${AVISAR_ARREGLADO:-1}"
USUARIO_DB="${USUARIO_DB:-www-data}"   # las consultas a la base se hacen como el usuario del juego (solo lectura)
DRY_RUN="${DRY_RUN:-0}"
if [ "$DRY_RUN" = "1" ]; then ESTADO_DIR="${ESTADO_DIR:-/tmp/envivo-salud-prueba}"; else ESTADO_DIR="${ESTADO_DIR:-/var/lib/envivo-ops}"; fi
# Telegram: TELEGRAM_MODO=auto (por defecto) | directo | helper
TELEGRAM_MODO="${TELEGRAM_MODO:-auto}"
TELEGRAM_HELPER="${TELEGRAM_HELPER:-/usr/local/bin/alerta-telegram.sh}"
TELEGRAM_TOKEN="${TELEGRAM_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
TELEGRAM_API="${TELEGRAM_API:-https://api.telegram.org}"
AHORA="${AHORA:-$(date +%s)}"
SERVIDOR="$(hostname 2> /dev/null || echo servidor)"

# ---------------------------------------------------------------------------------------------- Telegram
# Saca el token y el chat del ayudante del dueno SIN ejecutarlo (como hace su script de restic).
leer_helper() {
  local f="$TELEGRAM_HELPER" t c
  [ -r "$f" ] || return 1
  t="$(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?[A-Za-z_]*(TOKEN|Token|token)[A-Za-z_]*=["'\'']?([0-9]{5,}:[A-Za-z0-9_-]{20,})["'\'']?.*$/\3/p' "$f" | head -n 1)"
  [ -n "$t" ] || t="$(grep -oE 'bot[0-9]{5,}:[A-Za-z0-9_-]{20,}' "$f" | head -n 1 | sed 's/^bot//')"
  c="$(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?[A-Za-z_]*(CHAT|Chat|chat)[A-Za-z_]*=["'\'']?(-?[0-9]{3,})["'\'']?.*$/\3/p' "$f" | head -n 1)"
  [ -n "$c" ] || c="$(grep -oE 'chat_id=-?[0-9]{3,}' "$f" | head -n 1 | cut -d= -f2)"
  [ -n "$t" ] && [ -n "$c" ] || return 1
  TELEGRAM_TOKEN="$t"; TELEGRAM_CHAT_ID="$c"
}
modo_telegram() {
  case "$TELEGRAM_MODO" in
    directo) [ -n "$TELEGRAM_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ] && echo directo || echo ninguno ;;
    helper) [ -x "$TELEGRAM_HELPER" ] && echo helper || echo ninguno ;;
    *)
      if [ -n "$TELEGRAM_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then echo directo
      elif leer_helper; then echo "directo (token leido de $TELEGRAM_HELPER)"
      elif [ -x "$TELEGRAM_HELPER" ]; then echo helper
      else echo ninguno; fi ;;
  esac
}
enviar() {
  local msg="$1" modo codigo
  if [ "$DRY_RUN" = "1" ]; then printf '[PRUEBA: no se manda a Telegram]\n%s\n' "$msg"; return 0; fi
  modo="$(modo_telegram)"
  [ "$TELEGRAM_MODO" = "auto" ] && [ -z "$TELEGRAM_TOKEN" ] && leer_helper
  case "$modo" in
    directo*)
      # El token va por la entrada del curl (no aparece en la lista de procesos)
      codigo="$(printf 'url = "%s/bot%s/sendMessage"\n' "$TELEGRAM_API" "$TELEGRAM_TOKEN" | curl -sS -m 20 --retry 2 -o /dev/null -w '%{http_code}' -K - \
        --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" --data-urlencode "text=$msg" --data-urlencode "disable_web_page_preview=true" 2> /dev/null)"
      [ "$codigo" = "200" ] && return 0
      echo "ERROR: Telegram respondio ${codigo:-sin respuesta} (revisa TELEGRAM_TOKEN y TELEGRAM_CHAT_ID en $OPS_CONF)"; return 1 ;;
    helper)
      "$TELEGRAM_HELPER" "$msg" > /dev/null 2>&1 && return 0
      echo "ERROR: $TELEGRAM_HELPER fallo"; return 1 ;;
    *)
      echo "ERROR: no hay como mandar a Telegram (no esta $TELEGRAM_HELPER ni TELEGRAM_TOKEN/TELEGRAM_CHAT_ID en $OPS_CONF)"; return 1 ;;
  esac
}

if [ "${1:-}" = "--probar-telegram" ]; then
  echo "Modo de Telegram: $(modo_telegram)"
  if enviar "🧪 Prueba de alertas de EN VIVO Tycoon ($DOMINIO) desde $SERVIDOR: si ves esto, las alertas del juego llegan bien."; then echo "Enviado. Revisa tu Telegram."; exit 0; fi
  exit 1
fi
case "${1:-}" in
  ""|--ahora) ;;
  --modo-telegram) modo_telegram; exit 0 ;;
  --ayuda|-h|--help) sed -n '2,32p' "$0"; exit 0 ;;
  *) echo "Opcion desconocida: $1  (usa --ayuda)"; exit 1 ;;
esac
if [ "$(id -u)" != "0" ] && [ "${PERMITIR_NO_ROOT:-0}" != "1" ]; then echo "ERROR: correlo con sudo:   sudo $0"; exit 1; fi

# ---------------------------------------------------------------------------------------------- chequeos
declare -a CLAVES=() TEXTOS=() REPITE=()
problema() { CLAVES+=("$1"); TEXTOS+=("$2"); REPITE+=("${3:-$REPETIR_HORAS}"); }

sql() {
  # Consulta de solo lectura. Imprime el resultado; si falla, devuelve 1.
  if [ -n "$USUARIO_DB" ] && [ "$(id -u)" = "0" ] && id "$USUARIO_DB" > /dev/null 2>&1; then
    runuser -u "$USUARIO_DB" -- sqlite3 -readonly -bail -batch -noheader "$DB" ".timeout 5000" "$1" 2> /dev/null
  else
    sqlite3 -readonly -bail -batch -noheader "$DB" ".timeout 5000" "$1" 2> /dev/null
  fi
}
hay_tabla() { [ "$(sql "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '$1';")" = "1" ]; }
es_numero() { [[ "${1:-}" =~ ^[0-9]+$ ]]; }

mkdir -p "$ESTADO_DIR" 2> /dev/null && chmod 700 "$ESTADO_DIR" 2> /dev/null

# 1. La API del juego
URL="$ESQUEMA://$DOMINIO"
[ "$PUERTO" != "443" ] && [ "$PUERTO" != "80" ] && URL="$URL:$PUERTO"
CUERPO="$(mktemp)"
SALIDA="$(curl -sS --noproxy '*' --resolve "$DOMINIO:$PUERTO:$IP_LOCAL" -m 15 -o "$CUERPO" -w '%{http_code} %{time_total}' "$URL/api/estado" 2>&1)"
RC=$?
COD="${SALIDA%% *}"; SEG="${SALIDA##* }"
if [ "$RC" != "0" ]; then
  case "$RC" in
    7) problema api "El juego NO responde: nginx no contesta en $ESQUEMA puerto $PUERTO (nginx caido?)" ;;
    28) problema api "El juego NO responde: /api/estado tardo mas de 15 s" ;;
    35|51|58|60) problema api "El juego NO responde por HTTPS: problema con el certificado (curl error $RC)" ;;
    *) problema api "El juego NO responde: curl error $RC ($(head -c 150 <<< "$SALIDA"))" ;;
  esac
elif [ "$COD" != "200" ]; then
  problema api "El juego responde mal: /api/estado da HTTP $COD (debe ser 200)"
elif ! grep -q '"ok":true' "$CUERPO" || ! grep -q '"tienda"' "$CUERPO"; then
  problema api "El juego responde 200 pero NO con el JSON del juego: $(head -c 120 "$CUERPO" | tr -d '\n')"
elif awk -v s="$SEG" -v m="$LENTO_SEG" 'BEGIN { exit !(s + 0 > m + 0) }'; then
  problema lento "El juego esta LENTO: /api/estado tardo ${SEG} s (limite ${LENTO_SEG} s)"
fi
rm -f "$CUERPO"

# 2. PHP-FPM
if [ ! -S "$FPM_SOCK" ]; then
  problema fpm "No existe el socket de PHP $FPM_SOCK (php$PHPV-fpm caido?)"
elif command -v systemctl > /dev/null && [ "${SIN_SYSTEMCTL:-0}" != "1" ] && [ -d /run/systemd/system ] && ! systemctl is-active --quiet "$FPM_SERVICIO"; then
  problema fpm "El servicio $FPM_SERVICIO no esta activo"
fi

# 3. Disco
declare -A VISTO=()
for d in "$(dirname "$DB")" "$RESPALDOS" /; do
  [ -d "$d" ] || continue
  fs="$(df -P "$d" | awk 'NR==2 {print $6}')"
  [ -n "${VISTO[$fs]:-}" ] && continue
  VISTO[$fs]=1
  uso="$(df -P "$d" | awk 'NR==2 {gsub("%", "", $5); print $5}')"
  es_numero "$uso" || continue
  libre=$(( 100 - uso ))
  [ "$libre" -lt "$DISCO_MIN_LIBRE" ] && problema "disco_$(echo "$fs" | tr -c 'A-Za-z0-9\n' '_')" "Disco casi lleno en $fs: solo ${libre} % libre (minimo ${DISCO_MIN_LIBRE} %)"
done

# 4. Base de datos
if [ ! -f "$DB" ]; then
  problema db "No existe la base de datos $DB"
else
  tam="$(stat -c %s "$DB")"; wal="$(stat -c %s "$DB-wal" 2> /dev/null || echo 0)"
  mb=$(( tam / 1048576 )); walmb=$(( wal / 1048576 ))
  [ "$mb" -ge "$DB_MAX_MB" ] && problema db_grande "La base pesa ${mb} MB (aviso desde ${DB_MAX_MB} MB)"
  [ "$walmb" -ge "$WAL_MAX_MB" ] && problema db_wal "El archivo $DB-wal pesa ${walmb} MB (aviso desde ${WAL_MAX_MB} MB): algo no deja cerrar las escrituras"
  # Historial de tamanos (uno por hora, 3 dias) para ver si crece de golpe
  H="$ESTADO_DIR/tamano_db.txt"
  { [ -f "$H" ] && tail -n 80 "$H"; echo "$AHORA $tam"; } > "$H.nuevo" 2> /dev/null && mv -f "$H.nuevo" "$H"
  base24="$(awk -v t=$(( AHORA - 86400 )) '$1 <= t { v = $2 } END { print v }' "$H" 2> /dev/null)"
  if es_numero "$base24"; then
    crece=$(( (tam - base24) / 1048576 ))
    [ "$crece" -ge "$CRECE_MAX_MB" ] && problema db_crece "La base crecio ${crece} MB en 24 h (de $(( base24 / 1048576 )) a ${mb} MB): revisar si alguien abusa"
  fi
  if ! command -v sqlite3 > /dev/null; then
    problema sqlite3 "Falta el programa sqlite3 (sudo apt install sqlite3): no se pueden revisar pagos ni soporte"
  elif ! hay_tabla compras; then
    problema db_leer "No se pudo leer la base $DB (o no tiene la tabla compras)"
  else
    DESDE=$(( AHORA - 3600 ))
    # 6. Pagos de la ultima hora (compras creadas en la ultima hora)
    fila="$(sql "SELECT sum(estado = 'pagado'), sum(estado = 'rechazado' OR (estado = 'pendiente' AND plux_paso = 'fallido')) FROM compras WHERE creado >= $DESDE;")"
    pag="$(echo "$fila" | cut -d'|' -f1)"; fal="$(echo "$fila" | cut -d'|' -f2)"
    es_numero "$pag" || pag=0; es_numero "$fal" || fal=0
    if [ "$fal" -ge "$PAGOS_FALLIDOS_MIN" ] && [ $(( fal * 100 )) -ge $(( (fal + pag) * PAGOS_FALLIDOS_PCT )) ]; then
      problema pagos "Muchos pagos fallidos en la ultima hora: $fal fallidos/rechazados y $pag aprobados (revisar Plux o la pagina de pago)"
    fi
    # 7. Avisos nuevos (cosas de dinero para revisar a mano en /admin.php)
    if hay_tabla avisos; then
      ult="$(cat "$ESTADO_DIR/ultimo_aviso_id" 2> /dev/null)"; es_numero "$ult" || ult=""
      maxid="$(sql "SELECT coalesce(max(id), 0) FROM avisos;")"
      if es_numero "$maxid"; then
        if [ -z "$ult" ]; then
          echo "$maxid" > "$ESTADO_DIR/ultimo_aviso_id"   # primera vez: los viejos no se avisan
        elif [ "$maxid" -gt "$ult" ]; then
          tipos="$(sql "SELECT tipo || ' (' || count(*) || ')' FROM avisos WHERE id > $ult GROUP BY tipo ORDER BY count(*) DESC LIMIT 6;" | paste -sd ',' - | sed 's/,/, /g')"
          AVISOS_NUEVOS="$maxid"
          problema "avisos_$maxid" "$(( maxid - ult )) aviso(s) nuevo(s) del juego para revisar en /admin.php: $tipos" 9999
        fi
      fi
    fi
    # 8. Pendientes
    if hay_tabla soporte_casos; then
      n="$(sql "SELECT count(*) FROM soporte_casos WHERE estado = 'abierto' AND actualizado < $(( AHORA - SOPORTE_HORAS * 3600 ));")"
      es_numero "$n" && [ "$n" -gt 0 ] && problema soporte "$n caso(s) de soporte abiertos sin respuesta hace mas de ${SOPORTE_HORAS} h (/admin.php > Soporte)" "$REPETIR_HORAS_PENDIENTES"
    fi
    if hay_tabla chat_reportes; then
      n="$(sql "SELECT count(*) FROM chat_reportes WHERE estado = 'pendiente';")"
      es_numero "$n" && [ "$n" -ge "$REPORTES_MAX" ] && problema reportes "$n reportes de chat pendientes de revisar (/admin.php)" "$REPETIR_HORAS_PENDIENTES"
    fi
    for t in reembolsos devoluciones; do
      if hay_tabla "$t"; then
        n="$(sql "SELECT count(*) FROM $t WHERE estado = 'pendiente';")"
        es_numero "$n" && [ "$n" -gt 0 ] && problema "$t" "$n $t pendiente(s) (/admin.php)" "$REPETIR_HORAS_PENDIENTES"
      fi
    done
  fi
fi

# 5. Errores de nginx de este sitio en la ultima hora
if [ -r "$NGINX_ERROR_LOG" ]; then
  corte="$(date -d "@$(( AHORA - 3600 ))" '+%Y/%m/%d %H:%M:%S')"
  cuenta="$(tail -n 50000 "$NGINX_ERROR_LOG" | awk -v c="$corte" -v s="server: $DOMINIO," '
    index($0, s) && (substr($0, 1, 19) >= c) {
      if ($0 ~ /limiting requests/) l++
      else if ($3 ~ /^\[(error|crit|alert|emerg)\]$/) e++
    }
    END { printf "%d %d", e, l }')"
  errs="${cuenta% *}"; lims="${cuenta#* }"
  [ "$errs" -gt "$ERRORES_MAX" ] && problema errores "$errs errores de nginx/PHP del juego en la ultima hora (ver: sudo grep 'server: $DOMINIO' $NGINX_ERROR_LOG | tail)"
  [ "$lims" -gt "$LIMITADOS_MAX" ] && problema limitados "$lims peticiones frenadas por el limite en la ultima hora (posible ataque o un bot)"
fi

# 9. Respaldo de anoche
R="$RESPALDOS/ULTIMO_RESULTADO"
if [ -f "$R" ]; then
  read -r est cuando resto < "$R"
  if [ "$est" != "OK" ]; then problema respaldo "El ultimo respaldo del juego FALLO: ${resto:-sin detalle}"
  elif es_numero "$cuando" && [ $(( AHORA - cuando )) -gt $(( RESPALDO_MAX_HORAS * 3600 )) ]; then
    problema respaldo "El ultimo respaldo del juego es de hace $(( (AHORA - cuando) / 3600 )) h (debe ser de cada noche)"
  fi
elif [ -f "$DB" ]; then
  problema respaldo "Todavia no hay ningun respaldo del juego en $RESPALDOS (corre: sudo respaldo_envivo.sh)"
fi

# 10. Certificado
if [ "$ESQUEMA" = "https" ] && [ -f "$CERT" ] && command -v openssl > /dev/null; then
  fin="$(openssl x509 -enddate -noout -in "$CERT" 2> /dev/null | cut -d= -f2)"
  if [ -n "$fin" ]; then
    dias=$(( ( $(date -d "$fin" +%s) - AHORA ) / 86400 ))
    [ "$dias" -lt "$CERT_MIN_DIAS" ] && problema certificado "El certificado HTTPS de $DOMINIO vence en $dias dias (certbot no lo renovo: sudo certbot renew)"
  fi
fi

# ---------------------------------------------------------------------------------------------- avisar
NUEVOS=""; ARREGLADOS=""; declare -A ACTUAL=()
for i in "${!CLAVES[@]}"; do
  k="${CLAVES[$i]}"; ACTUAL[$k]=1
  f="$ESTADO_DIR/alerta_$k"
  if [ -f "$f" ] && [ $(( AHORA - $(stat -c %Y "$f") )) -lt $(( ${REPITE[$i]} * 3600 )) ]; then
    echo "   (ya avisado hace poco) ${TEXTOS[$i]}"
  else
    NUEVOS="$NUEVOS"$'\n'"• ${TEXTOS[$i]}"
  fi
done
for f in "$ESTADO_DIR"/alerta_*; do
  [ -e "$f" ] || continue
  k="${f##*/alerta_}"
  case "$k" in avisos_*) continue ;; esac
  [ -n "${ACTUAL[$k]:-}" ] || ARREGLADOS="$ARREGLADOS"$'\n'"• $(cat "$f" 2> /dev/null)"
done

FECHA_TXT="$(date -d "@$AHORA" '+%Y-%m-%d %H:%M')"
MENSAJE=""
[ -n "$NUEVOS" ] && MENSAJE="⚠️ EN VIVO Tycoon ($DOMINIO) - $SERVIDOR - $FECHA_TXT$NUEVOS"
if [ -n "$ARREGLADOS" ] && [ "$AVISAR_ARREGLADO" = "1" ]; then
  [ -n "$MENSAJE" ] && MENSAJE="$MENSAJE"$'\n\n'
  MENSAJE="${MENSAJE}✅ Ya se arreglo:$ARREGLADOS"
fi

if [ -n "$MENSAJE" ]; then
  if enviar "$MENSAJE"; then
    ENVIADO=1
  else
    ENVIADO=0
  fi
else
  ENVIADO=1
fi
# El estado del anti-spam solo cambia si el mensaje salio (si Telegram fallo, se intenta en la proxima hora)
if [ "$ENVIADO" = "1" ]; then
  for i in "${!CLAVES[@]}"; do
    f="$ESTADO_DIR/alerta_${CLAVES[$i]}"
    if [ ! -f "$f" ] || [ $(( AHORA - $(stat -c %Y "$f") )) -ge $(( ${REPITE[$i]} * 3600 )) ]; then
      printf '%s\n' "${TEXTOS[$i]}" > "$f"; touch -d "@$AHORA" "$f"
    fi
  done
  for f in "$ESTADO_DIR"/alerta_*; do
    [ -e "$f" ] || continue
    k="${f##*/alerta_}"
    case "$k" in avisos_*) [ -n "${ACTUAL[$k]:-}" ] || rm -f "$f"; continue ;; esac
    [ -n "${ACTUAL[$k]:-}" ] || rm -f "$f"
  done
  [ -n "${AVISOS_NUEVOS:-}" ] && echo "$AVISOS_NUEVOS" > "$ESTADO_DIR/ultimo_aviso_id"
fi

if [ "${#CLAVES[@]}" -eq 0 ]; then
  echo "[$FECHA_TXT] OK: todo bien (api ${SEG:-?} s)"
  exit 0
fi
echo "[$FECHA_TXT] PROBLEMAS: ${#CLAVES[@]}"
for t in "${TEXTOS[@]}"; do echo "   - $t"; done
exit 1
