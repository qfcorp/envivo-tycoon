# shellcheck shell=bash
# =====================================================================
#  Funciones que comparten instalar.sh y actualizar.sh. Se cargan con "source"; solas no hacen nada.
#   completar_config    agrega a /etc/envivo/config.env las lineas de server/config.env.ejemplo que falten
#                       (con su valor por defecto); NUNCA cambia un valor que ya esta. Se puede correr mil veces.
#   preparar_node       instala Node 22 (NodeSource) si /usr/bin/node falta o es mas viejo que Node 20
#   instalar_validador  clave del validador, servicio envivo-validador (systemd), lo enciende y prueba /salud
#   salud_validador     solo la prueba de /salud
#   actualizar_logrotate  pone al dia /etc/logrotate.d/envivo si ya estaba (lo crea ops/instalar_ops.sh)
#  Los mensajes van sin tildes a proposito (se leen bien por SSH desde el celular).
#  Variables (para pruebas): CLAVE_VALIDADOR, UNIDAD_VALIDADOR, LOGROTATE_ENVIVO, NODE_MIN, NODE_VERSION, NODE_RUTA,
#  SYSTEMD_RUN (carpeta que dice que systemd esta corriendo).
# =====================================================================

CLAVE_VALIDADOR="${CLAVE_VALIDADOR:-/etc/envivo/validador.clave}"
UNIDAD_VALIDADOR="${UNIDAD_VALIDADOR:-/etc/systemd/system/envivo-validador.service}"
LOGROTATE_ENVIVO="${LOGROTATE_ENVIVO:-/etc/logrotate.d/envivo}"
NODE_MIN="${NODE_MIN:-20}"
NODE_VERSION="${NODE_VERSION:-22}"
NODE_RUTA="${NODE_RUTA:-/usr/bin/node}"      # el node del servicio (el que instala NodeSource)
SYSTEMD_RUN="${SYSTEMD_RUN:-/run/systemd/system}"
VALIDADOR_URL_POR_DEFECTO="http://127.0.0.1:8790"

# Un secreto al azar en hexadecimal ($1 = bytes)
# shellcheck disable=SC2016  # (codigo PHP entre comillas simples a proposito)
envivo_secreto() { openssl rand -hex "${1:-32}" 2> /dev/null || php -r 'echo bin2hex(random_bytes((int) $argv[1]));' "${1:-32}"; }

# Valor de una linea de la configuracion, leida igual que server/src/Config.php: si se repite vale la de mas abajo,
# se quitan espacios y comillas de los lados. Sale con 1 si la linea no esta.   Uso: config_valor CLAVE archivo
config_valor() {
  awk -v k="$1" '
    { l = $0; sub(/\r$/, "", l); sub(/^[ \t]+/, "", l) }
    l ~ /^[;#]/ { next }
    match(l, "^" k "[ \t]*=") { v = substr(l, RLENGTH + 1); gsub(/^[ \t]+|[ \t]+$/, "", v)
      if (length(v) >= 2 && (substr(v, 1, 1) == "\"" || substr(v, 1, 1) == "'\''") && substr(v, length(v)) == substr(v, 1, 1)) v = substr(v, 2, length(v) - 2)
      u = v; hay = 1 }
    END { if (hay) print u; exit hay ? 0 : 1 }' "$2"
}

# completar_config EJEMPLO CONF [quien]
#  - Agrega al final de CONF cada CLAVE= de EJEMPLO que no este en CONF (con los comentarios de su grupo y el valor
#    del ejemplo). Las lineas comentadas del ejemplo (; PLUX_API_BASE=...) no se agregan.
#  - Valores que no salen del ejemplo: VALIDADOR_URL = http://127.0.0.1:8790, PLUX_WEBHOOK_CLAVE = al azar.
#  - VALIDADOR_CLAVE (secreto compartido con el validador): si falta o esta vacia se pone la de
#    /etc/envivo/validador.clave (si ya existia) o una nueva con "openssl rand -hex 32". Es lo unico que se llena
#    estando vacio; un valor que ya tiene algo nunca se cambia.
#  - Si no falta nada, no toca el archivo. Si cambia algo, guarda antes una copia (solo root) y deja 640 root:www-data.
#  Deja CONFIG_CAMBIO=1 si cambio algo.
completar_config() {
  local ej="$1" conf="$2" quien="${3:-instalar.sh}" dir fecha agregar final nuevas clave_v copia
  # shellcheck disable=SC2034  # (la leen instalar.sh y actualizar.sh)
  CONFIG_CAMBIO=0
  [ -f "$ej" ] || { echo "   AVISO: no esta $ej: no se revisan las lineas nuevas"; return 0; }
  [ -f "$conf" ] || { echo "   ERROR: no esta $conf"; return 1; }
  dir="$(dirname "$conf")"; fecha="$(date '+%Y-%m-%d %H:%M')"
  agregar="$(mktemp "$dir/.config-agregar.XXXXXX")" || { echo "   ERROR: no se pudo escribir en $dir"; return 1; }
  ENVIVO_NUEVO_VALIDADOR_URL="$VALIDADOR_URL_POR_DEFECTO" ENVIVO_NUEVO_PLUX_WEBHOOK_CLAVE="$(envivo_secreto 20)" \
  awk -v fecha="$fecha" -v quien="$quien" '
    function clave(l,   k) { sub(/\r$/, "", l); sub(/^[ \t]+/, "", l); if (l !~ /^[A-Z][A-Z0-9_]*[ \t]*=/) return ""; k = l; sub(/[ \t]*=.*/, "", k); return k }
    FNR == NR { k = clave($0); if (k != "") ya[k] = 1; next }
    { l = $0; sub(/\r$/, "", l); t = l; sub(/^[ \t]+/, "", t) }
    t == "" { grupo = ""; next }
    t ~ /^[;#]/ { grupo = grupo t "\n"; next }
    { k = clave(t); if (k == "" || (k in ya)) { grupo = ""; next }
      if (!titulo) { printf "\n; ---- Agregado por %s el %s, desde server/config.env.ejemplo (lo de arriba no se toco) ----\n", quien, fecha; titulo = 1 }
      if (grupo != "") printf "\n%s", grupo
      v = t; sub(/^[A-Z][A-Z0-9_]*[ \t]*=[ \t]*/, "", v)
      if (("ENVIVO_NUEVO_" k) in ENVIRON) v = ENVIRON["ENVIVO_NUEVO_" k]
      print k "=" v; ya[k] = 1; grupo = "" }
  ' "$conf" "$ej" > "$agregar"

  # VALIDADOR_CLAVE: la que valga al final (la del archivo, o la que se va a agregar vacia)
  clave_v="$(cat "$conf" "$agregar" | config_valor VALIDADOR_CLAVE /dev/stdin)"
  if [ -z "$clave_v" ] && config_valor VALIDADOR_CLAVE "$ej" > /dev/null; then
    [ -f "$CLAVE_VALIDADOR" ] && clave_v="$(tr -d ' \t\r\n' < "$CLAVE_VALIDADOR")"
    [ "${#clave_v}" -ge 24 ] || clave_v="$(envivo_secreto 32)"
  else
    clave_v=""
  fi

  if [ ! -s "$agregar" ] && [ -z "$clave_v" ]; then
    rm -f "$agregar"; echo "   no falta ninguna linea (nada que hacer)"; return 0
  fi
  nuevas="$(grep -oE '^[A-Z][A-Z0-9_]*=' "$agregar" | tr -d '=' | tr '\n' ' ')"
  final="$(mktemp "$dir/.config-nueva.XXXXXX")" || { rm -f "$agregar"; return 1; }
  { cat "$conf"; [ -n "$(tail -c 1 "$conf")" ] && echo; cat "$agregar"; } > "$final"
  rm -f "$agregar"
  if [ -n "$clave_v" ]; then
    # Llena solo las lineas VALIDADOR_CLAVE= vacias (el secreto va por el entorno, no en la linea de comandos)
    local tmp2; tmp2="$(mktemp "$dir/.config-nueva.XXXXXX")"
    ENVIVO_CLAVE_V="$clave_v" awk '{ l = $0; sub(/^[ \t]+/, "", l) } l ~ /^VALIDADOR_CLAVE[ \t]*=[ \t\r]*$/ { print "VALIDADOR_CLAVE=" ENVIRON["ENVIVO_CLAVE_V"]; next } { print }' "$final" > "$tmp2" && mv -f "$tmp2" "$final"
  fi
  # Copia de antes (solo root) y cambio de una sola vez (mv), con los permisos de siempre
  copia="$conf.antes-$(date +%Y%m%d-%H%M%S)"
  install -o root -g root -m 600 "$conf" "$copia" 2> /dev/null || copia=
  chown root:www-data "$final" 2> /dev/null; chmod 640 "$final"
  mv -f "$final" "$conf"
  # shellcheck disable=SC2034
  CONFIG_CAMBIO=1
  [ -n "$nuevas" ] && echo "   agregadas (vacias o con su valor por defecto): $nuevas"
  [ -n "$clave_v" ] && echo "   VALIDADOR_CLAVE: puesta (secreto al azar, compartido con el validador)"
  [ -n "$copia" ] && echo "   copia de como estaba: $copia"
  return 0
}

# Version principal de Node (22, 20...) de un ejecutable; vacio si no hay
node_mayor() { [ -x "${1:-$NODE_RUTA}" ] && "${1:-$NODE_RUTA}" -p 'process.versions.node.split(".")[0]' 2> /dev/null; }

# El servicio usa /usr/bin/node (el que instala NodeSource). Instala Node $NODE_VERSION si falta o es < $NODE_MIN.
preparar_node() {
  local v; v="$(node_mayor "$NODE_RUTA")"
  if [ -n "$v" ] && [ "$v" -ge "$NODE_MIN" ] 2> /dev/null; then echo "   Node $("$NODE_RUTA" -v) ya estaba"; return 0; fi
  if [ -n "$v" ]; then echo "   Node v$v es muy viejo: instalando Node $NODE_VERSION (NodeSource)..."
  else echo "   instalando Node $NODE_VERSION (NodeSource)..."; fi
  local LOG=/tmp/envivo-node.log
  if curl -fsSL "https://deb.nodesource.com/setup_$NODE_VERSION.x" -o /tmp/nodesource_setup.sh > "$LOG" 2>&1 \
     && bash /tmp/nodesource_setup.sh < /dev/null >> "$LOG" 2>&1 \
     && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs < /dev/null >> "$LOG" 2>&1; then :; fi
  rm -f /tmp/nodesource_setup.sh
  v="$(node_mayor "$NODE_RUTA")"
  if [ -n "$v" ] && [ "$v" -ge "$NODE_MIN" ] 2> /dev/null; then echo "   listo: Node $("$NODE_RUTA" -v)"; return 0; fi
  echo "   AVISO: no se pudo instalar Node $NODE_VERSION. Mandame lo que sale de:  tail -n 20 $LOG"
  echo "          (el juego funciona igual; los eventos en linea necesitan Node)"
  return 1
}

# salud_validador CONF: GET /salud con la clave (la clave va a curl por la entrada, no en la linea de comandos)
salud_validador() {
  local conf="$1" clave url r _
  clave="$(config_valor VALIDADOR_CLAVE "$conf")"
  url="$(config_valor VALIDADOR_URL "$conf")"; url="${url:-$VALIDADOR_URL_POR_DEFECTO}"; url="${url%/}"
  for _ in $(seq 1 20); do
    r="$(printf 'header = "X-Validador-Clave: %s"\n' "$clave" | curl -s --noproxy '*' --max-time 3 -K - "$url/salud" 2> /dev/null)"
    case "$r" in
      '{"ok":true'*) echo "   validador: OK ($url/salud responde, logica $(printf '%s' "$r" | sed -n 's/.*"version_logica":"\([^"]*\)".*/\1/p'))"; return 0 ;;
    esac
    sleep 0.5
  done
  echo "   AVISO: el validador no responde en $url/salud. Mandame lo que sale de:  sudo journalctl -u envivo-validador -n 50"
  echo "          (el juego sigue funcionando: PHP usa Node directo, solo que mas lento)"
  return 1
}

# instalar_validador APP CONF: clave en /etc/envivo/validador.clave (igual a VALIDADOR_CLAVE), servicio de systemd
# (plantilla server/validador/envivo-validador.service con la carpeta APP), lo enciende, lo reinicia y prueba /salud.
instalar_validador() {
  local app="$1" conf="$2" clave nueva
  if ! command -v systemctl > /dev/null || [ ! -d "$SYSTEMD_RUN" ]; then
    echo "   AVISO: este servidor no usa systemd: no se instala el servicio (PHP usa Node directo, mas lento)"; return 1
  fi
  [ -x "$NODE_RUTA" ] || { echo "   AVISO: no esta $NODE_RUTA: no se instala el validador"; return 1; }
  [ -f "$app/server/validador/envivo-validador.service" ] || { echo "   AVISO: falta $app/server/validador/envivo-validador.service"; return 1; }
  clave="$(config_valor VALIDADOR_CLAVE "$conf")"
  [ "${#clave}" -ge 24 ] || { echo "   AVISO: VALIDADOR_CLAVE vacia o corta en $conf: no se instala el validador"; return 1; }
  if [ ! -f "$CLAVE_VALIDADOR" ] || [ "$(tr -d ' \t\r\n' < "$CLAVE_VALIDADOR")" != "$clave" ]; then
    ( umask 077; printf '%s\n' "$clave" > "$CLAVE_VALIDADOR.nueva" ) && mv -f "$CLAVE_VALIDADOR.nueva" "$CLAVE_VALIDADOR" \
      && echo "   clave del validador guardada en $CLAVE_VALIDADOR (solo root; la misma que VALIDADOR_CLAVE)"
  fi
  chown root:root "$CLAVE_VALIDADOR"; chmod 600 "$CLAVE_VALIDADOR"
  nueva="$(mktemp)"
  sed -e "s#/var/www/envivo#$app#g" -e "s#/usr/bin/node #$NODE_RUTA #" "$app/server/validador/envivo-validador.service" > "$nueva"
  if [ -f "$UNIDAD_VALIDADOR" ] && cmp -s "$nueva" "$UNIDAD_VALIDADOR"; then rm -f "$nueva"
  else install -o root -g root -m 644 "$nueva" "$UNIDAD_VALIDADOR"; rm -f "$nueva"; systemctl daemon-reload; echo "   servicio: $UNIDAD_VALIDADOR"; fi
  systemctl enable -q envivo-validador 2> /dev/null || systemctl enable envivo-validador > /dev/null 2>&1
  if systemctl restart envivo-validador; then echo "   envivo-validador encendido (se enciende solo al reiniciar el VPS)"
  else echo "   AVISO: no arranco envivo-validador. Mandame:  sudo journalctl -u envivo-validador -n 50"; return 1; fi
  salud_validador "$conf"
}

# actualizar_logrotate PLANTILLA: si /etc/logrotate.d/envivo ya existe (lo crea ops/instalar_ops.sh) y es distinto,
# lo cambia por la plantilla (solo si "logrotate -d" la acepta).
actualizar_logrotate() {
  local p="$1" prueba
  [ -f "$p" ] && [ -f "$LOGROTATE_ENVIVO" ] || return 0
  cmp -s "$p" "$LOGROTATE_ENVIVO" && return 0
  command -v logrotate > /dev/null || return 0
  prueba="$(mktemp)"
  if logrotate -d "$p" > "$prueba" 2>&1 && ! grep -qiE '^error' "$prueba"; then
    install -o root -g root -m 644 "$p" "$LOGROTATE_ENVIVO" && echo "   rotacion de registros al dia ($LOGROTATE_ENVIVO)"
  else
    echo "   AVISO: logrotate no acepto $p; se deja $LOGROTATE_ENVIVO como estaba"
  fi
  rm -f "$prueba"
}
