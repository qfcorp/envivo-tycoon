#!/usr/bin/env bash
# =====================================================================
#  SIMULACRO de restauracion de EN VIVO Tycoon (docs/OPERACION.md, paso 5). NO toca la base del juego.
#  Un respaldo solo sirve si se puede volver a abrir: este script lo comprueba de verdad.
#   1. Saca el respaldo mas reciente a una carpeta temporal (/var/tmp/envivo-simulacro.XXXX, solo root):
#        - de restic (la laptop qfcorp): "restic restore latest" SOLO de /var/backups/envivo y /etc/envivo, o
#        - si restic no esta configurado (o con --local): de /var/backups/envivo en este mismo VPS.
#   2. Descomprime la copia mas nueva de la base (diario/envivo-AAAAMMDD-HHMMSS.sqlite.gz).
#   3. PRAGMA integrity_check (debe salir "ok") y cuenta jugadores, partidas y compras.
#   4. Revisa que la copia de la configuracion (config/envivo-config-*.tar.gz) se pueda abrir.
#   5. Dice que tan viejo es el respaldo (avisa si tiene mas de 2 dias) y lo anota en
#      /var/backups/envivo/ULTIMO_SIMULACRO. Borra la carpeta temporal al terminar (pase lo que pase).
#  Uso (como root):
#    sudo bash probar_restauracion.sh                 restic si esta configurado; si no, lo local
#    sudo bash probar_restauracion.sh --local         solo lo de /var/backups/envivo
#    sudo bash probar_restauracion.sh --restic        solo restic (falla si no esta configurado)
#    sudo bash probar_restauracion.sh --archivo X.sqlite.gz   prueba ese archivo
#  restic: se leen de /etc/envivo/ops.env (o del entorno) RESTIC_REPOSITORY, RESTIC_PASSWORD_FILE y, si tu restic
#  se conecta por un tunel, RESTIC_SFTP_COMMAND (lo mismo que va en "-o sftp.command=..." de tu script).
#  Por defecto, los de tu respaldo del ERP: sftp:respaldo.qfradioec.com:/erp_qf y /etc/restic/password_erp_qf.
#  Sale con 0 si todo esta bien, 1 si algo fallo. Los mensajes van sin tildes a proposito (SSH desde el celular).
# =====================================================================
set -u
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C
OPS_CONF="${OPS_CONF:-/etc/envivo/ops.env}"
cargar_conf() {   # solo lineas NOMBRE=valor (no ejecuta nada); lo que ya viene del entorno gana
  local f="$1" linea k v
  [ -r "$f" ] || return 0
  while IFS= read -r linea || [ -n "$linea" ]; do
    linea="${linea%$'\r'}"
    [[ "$linea" =~ ^[[:space:]]*([A-Z][A-Z0-9_]*)=(.*)$ ]] || continue
    k="${BASH_REMATCH[1]}"; v="${BASH_REMATCH[2]}"; v="${v%"${v##*[![:space:]]}"}"
    if [[ "$v" =~ ^\"(.*)\"$ ]] || [[ "$v" =~ ^\'(.*)\'$ ]]; then v="${BASH_REMATCH[1]}"; fi
    [ -n "${!k+x}" ] || printf -v "$k" '%s' "$v"
  done < "$f"
}
cargar_conf "$OPS_CONF"
RESPALDOS="${RESPALDOS:-/var/backups/envivo}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-sftp:respaldo.qfradioec.com:/erp_qf}"
RESTIC_PASSWORD_FILE="${RESTIC_PASSWORD_FILE:-/etc/restic/password_erp_qf}"
RESTIC_SFTP_COMMAND="${RESTIC_SFTP_COMMAND:-}"   # si tu restic se conecta con un comando ssh especial (tunel)
MAX_DIAS="${MAX_DIAS:-2}"
TMPBASE="${TMPBASE:-/var/tmp}"
MODO=auto; ARCHIVO=""
case "${1:-}" in
  --local) MODO=local ;;
  --restic) MODO=restic ;;
  --archivo) MODO=archivo; ARCHIVO="${2:-}"; [ -f "$ARCHIVO" ] || { echo "ERROR: no existe el archivo $ARCHIVO"; exit 1; } ;;
  "") ;;
  *) echo "Uso: sudo bash $0 [--local | --restic | --archivo X.sqlite.gz]"; exit 1 ;;
esac
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0"; exit 1; }
command -v sqlite3 > /dev/null || { echo "ERROR: falta sqlite3 (sudo apt install sqlite3)"; exit 1; }
T="$(mktemp -d "$TMPBASE/envivo-simulacro.XXXXXX")" || exit 1
trap 'rm -rf "$T"' EXIT
FALLAS=0
mal() { echo "   FALLA: $*"; FALLAS=$((FALLAS + 1)); }

R() { if [ -n "$RESTIC_SFTP_COMMAND" ]; then restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" -o "sftp.command=$RESTIC_SFTP_COMMAND" "$@"
      else restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" "$@"; fi; }
restic_listo() { command -v restic > /dev/null && [ -r "$RESTIC_PASSWORD_FILE" ] && [ -n "$RESTIC_REPOSITORY" ]; }
if [ "$MODO" = "auto" ]; then restic_listo && MODO=restic || MODO=local; fi

echo "== Simulacro de restauracion ($(date '+%Y-%m-%d %H:%M')), desde: $MODO"
case "$MODO" in
  restic)
    restic_listo || { echo "ERROR: restic no esta listo (falta el programa restic o $RESTIC_PASSWORD_FILE). Ver docs/OPERACION.md paso 5."; exit 1; }
    echo "   restic: $RESTIC_REPOSITORY (ultimo respaldo que tenga /var/backups/envivo)"
    R snapshots --latest 1 --path "$RESPALDOS" --compact > "$T/snap.txt" 2>&1 \
      && sed -n '3p' "$T/snap.txt" | sed 's/^/   ultimo: /'
    if ! R restore latest --path "$RESPALDOS" \
         --target "$T/restic" --include "$RESPALDOS/diario" --include "$RESPALDOS/config" --include /etc/envivo > "$T/restic.log" 2>&1; then
      echo "   ERROR: restic no pudo restaurar. Detalle:"; tail -n 8 "$T/restic.log" | sed 's/^/     /'; exit 1
    fi
    DIR="$T/restic$RESPALDOS"
    if [ -f "$T/restic/etc/envivo/config.env" ]; then echo "   /etc/envivo/config.env: esta en restic"
    else mal "restic no tiene /etc/envivo/config.env (falta agregarlo al respaldo: OPERACION.md paso 3)"; fi
    ;;
  local) DIR="$RESPALDOS"; echo "   carpeta: $DIR (en este VPS; la copia de la laptop se prueba con --restic)" ;;
  archivo) DIR="" ;;
esac

if [ "$MODO" = "archivo" ]; then GZ="$ARCHIVO"
else GZ="$(find "$DIR/diario" -maxdepth 1 -type f -name 'envivo-*.sqlite.gz' 2> /dev/null | sort | tail -n 1)"; fi
if [ -z "$GZ" ] || [ ! -f "$GZ" ]; then echo "ERROR: no hay ninguna copia de la base (diario/envivo-*.sqlite.gz) en ${DIR:-?}"; exit 1; fi
echo "   copia de la base: $(basename "$GZ") ($(stat -c %s "$GZ") bytes comprimida)"

case "$GZ" in
  *.gz) gzip -dc -- "$GZ" > "$T/prueba.sqlite" 2> "$T/gz.log" || mal "el archivo esta danado (gzip: $(head -c 120 "$T/gz.log"))" ;;
  *) cp -- "$GZ" "$T/prueba.sqlite" ;;
esac
if [ -s "$T/prueba.sqlite" ]; then
  INTEG="$(sqlite3 -readonly "$T/prueba.sqlite" 'PRAGMA integrity_check;' 2>&1 | head -n 3 | tr '\n' ' ' | sed 's/ $//')"
  if [ "$INTEG" = "ok" ]; then echo "   integrity_check: ok"; else mal "integrity_check dice: $INTEG"; fi
  cuenta() { sqlite3 -readonly "$T/prueba.sqlite" "SELECT count(*) FROM $1;" 2> /dev/null || echo "?"; }
  echo "   contiene: $(cuenta jugadores) jugadores, $(cuenta partidas) partidas, $(cuenta compras) compras ($(sqlite3 -readonly "$T/prueba.sqlite" "SELECT count(*) FROM compras WHERE estado='pagado';" 2> /dev/null || echo '?') pagadas)"
  [ "$(cuenta jugadores)" = "?" ] && mal "la copia no tiene la tabla jugadores (no parece la base del juego)"
else
  mal "la copia quedo vacia"
fi

# Que tan viejo es (por el nombre: envivo-AAAAMMDD-HHMMSS)
F="$(basename "$GZ" | sed -n 's/^envivo-\([0-9]\{8\}\)-\([0-9]\{2\}\)\([0-9]\{2\}\).*/\1 \2:\3/p')"
if [ -n "$F" ] && S="$(date -d "$F" +%s 2> /dev/null)"; then
  H=$(( ( $(date +%s) - S ) / 3600 ))
  echo "   antiguedad: $H horas"
  [ "$MODO" != "archivo" ] && [ "$H" -gt $(( MAX_DIAS * 24 )) ] && mal "el respaldo mas nuevo tiene $H horas (mas de $MAX_DIAS dias): revisa el respaldo de la 1:30 y el restic de las 2:00"
fi

if [ "$MODO" != "archivo" ]; then
  CFG="$(find "$DIR/config" -maxdepth 1 -type f -name 'envivo-config-*.tar.gz' 2> /dev/null | sort | tail -n 1)"
  if [ -z "$CFG" ]; then mal "no hay copia de la configuracion (config/envivo-config-*.tar.gz)"
  elif tar -tzf "$CFG" > "$T/cfg.txt" 2> /dev/null && grep -q 'config.env' "$T/cfg.txt"; then echo "   configuracion: $(basename "$CFG") se abre y tiene config.env"
  else mal "la copia de la configuracion $(basename "$CFG") no se puede abrir o no tiene config.env"; fi
fi

RES="OK"; [ "$FALLAS" -gt 0 ] && RES="FALLA"
if [ -d "$RESPALDOS" ] && [ "$MODO" != "archivo" ]; then
  printf '%s %s %s %s\n' "$RES" "$(date +%s)" "$MODO" "$(basename "$GZ")" > "$RESPALDOS/ULTIMO_SIMULACRO" 2> /dev/null
fi
echo
if [ "$FALLAS" = "0" ]; then echo "SIMULACRO OK: el respaldo se puede restaurar (no se toco la base del juego)."; exit 0; fi
echo "SIMULACRO CON $FALLAS FALLA(S): mandame esta pantalla."; exit 1
