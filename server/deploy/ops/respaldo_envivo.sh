#!/usr/bin/env bash
# =====================================================================
#  Respaldo diario de EN VIVO Tycoon (juego.tukanec.com). Lo instala server/deploy/ops/instalar_ops.sh
#  en /usr/local/bin/respaldo_envivo.sh y lo corre el cron de root a la 1:30 (antes del restic de las 2:00).
#
#  Que hace (sin parar el juego y sin tocar los otros sitios):
#   1. Copia la base SQLite /var/lib/envivo/envivo.sqlite con la copia "en caliente" de SQLite (.backup):
#      la copia queda completa y consistente aunque haya jugadores comprando en ese momento.
#   2. Revisa la copia con PRAGMA integrity_check (si no sale "ok", NO la guarda y avisa).
#   3. La comprime y la guarda en /var/backups/envivo/diario (solo root puede entrar: permisos 700).
#   4. Los domingos guarda ademas una copia en /var/backups/envivo/semanal.
#   5. Guarda la configuracion /etc/envivo (claves de Plux y del panel) en /var/backups/envivo/config.
#   6. Borra las viejas: se quedan 7 diarias, 4 semanales y 7 de configuracion.
#   7. Escribe el resultado en /var/backups/envivo/ULTIMO_RESULTADO (salud_envivo.sh lo revisa cada hora
#      y avisa por Telegram si fallo o si no hay respaldo de las ultimas 26 horas).
#  El restic de cada noche se lleva /var/backups/envivo y /etc/envivo a la laptop (ver docs/OPERACION.md).
#
#  Uso:
#    sudo respaldo_envivo.sh                      hace el respaldo
#    sudo DRY_RUN=1 respaldo_envivo.sh            prueba: hace la copia en una carpeta temporal, la revisa
#                                                 y dice que borraria, pero NO guarda ni borra nada
#    sudo respaldo_envivo.sh --listar             muestra los respaldos guardados
#    sudo respaldo_envivo.sh --restaurar ARCHIVO  vuelve la base a como estaba en ese respaldo
#                                                 (antes guarda una copia de la base actual; pide escribir SI)
#  Ajustes opcionales en /etc/envivo/ops.env (o como variables): DB, DESTINO, DIARIOS, SEMANALES, DIA_SEMANAL.
#  Los mensajes van sin tildes a proposito (se leen bien por SSH desde el celular).
# =====================================================================
set -u
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C

# ---- Configuracion: valores por defecto < /etc/envivo/ops.env < variables del entorno ----
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

CONF_DIR="${CONF_DIR:-/etc/envivo}"
if [ -z "${DB:-}" ] && [ -r "$CONF_DIR/config.env" ]; then
  DB="$(sed -n 's/^ENVIVO_DB=//p' "$CONF_DIR/config.env" | tail -n 1 | tr -d '\r')"
fi
DB="${DB:-/var/lib/envivo/envivo.sqlite}"
DESTINO="${DESTINO:-/var/backups/envivo}"
DIARIOS="${DIARIOS:-7}"
SEMANALES="${SEMANALES:-4}"
DIA_SEMANAL="${DIA_SEMANAL:-7}"          # dia de la copia semanal: 1=lunes ... 7=domingo
DRY_RUN="${DRY_RUN:-0}"
FECHA="${FECHA:-$(date +%Y%m%d-%H%M%S)}" # (las pruebas lo cambian)
DIA_HOY="${DIA_HOY:-$(date +%u)}"
LOCK="${LOCK:-/run/lock/envivo-respaldo.lock}"

dice() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
# Aviso externo opcional (docs/MONITOREO.md, Healthchecks.io): HC_RESPALDO=https://hc-ping.com/... en ops.env.
# Si el respaldo no avisa en 26 h (o avisa /fail), Healthchecks manda un correo aunque el VPS entero este caido.
hc() { [ -n "${HC_RESPALDO:-}" ] && [ "$DRY_RUN" != "1" ] && [[ "$HC_RESPALDO" =~ ^https:// ]] && curl -fsS -m 10 --retry 3 -o /dev/null "$HC_RESPALDO$1" 2> /dev/null; return 0; }
falla() {
  dice "ERROR: $*"
  if [ "$DRY_RUN" != "1" ] && [ -d "$DESTINO" ]; then
    printf 'FALLA %s %s\n' "$(date +%s)" "$*" > "$DESTINO/ULTIMO_RESULTADO.tmp" && mv -f "$DESTINO/ULTIMO_RESULTADO.tmp" "$DESTINO/ULTIMO_RESULTADO"
  fi
  hc /fail
  [ -n "${TRABAJO_TMP:-}" ] && rm -rf "$TRABAJO_TMP"
  exit 1
}
sq() { sqlite3 -bail -batch -noheader "$@"; }

# Copia en caliente (API de respaldo de SQLite). $1 = base, $2 = archivo nuevo
copiar_base() {
  local origen="$1" copia="$2"
  rm -f "$copia"
  sq "$origen" ".timeout 30000" ".backup '$copia'" || return 1
  [ -s "$copia" ]
}
# "ok" si la base esta sana
revisar_base() { sq "$1" "PRAGMA integrity_check;" 2>&1 | head -n 5 | tr '\n' ' ' | sed 's/ $//'; }
resumen_base() {
  local b="$1" j c
  j="$(sq "$b" "SELECT count(*) FROM jugadores;" 2> /dev/null || echo '?')"
  c="$(sq "$b" "SELECT count(*) FROM compras WHERE estado = 'pagado';" 2> /dev/null || echo '?')"
  echo "version $(sq "$b" 'PRAGMA user_version;' 2> /dev/null || echo '?'), jugadores: $j, compras pagadas: $c"
}

# Borra los mas viejos de una carpeta (los nombres llevan la fecha, asi que ordenar por nombre = ordenar por fecha)
rotar() {
  local dir="$1" patron="$2" quedan="$3" f
  [ -d "$dir" ] || return 0
  find "$dir" -maxdepth 1 -type f -name "$patron" -printf '%f\n' | sort -r | tail -n +"$((quedan + 1))" | while IFS= read -r f; do
    if [ "$DRY_RUN" = "1" ]; then dice "   (prueba) borraria $dir/$f"; else rm -f -- "${dir:?}/$f" && dice "   borrado el viejo $dir/$f"; fi
  done
}

listar() {
  local d
  for d in diario semanal config; do
    echo "== $DESTINO/$d"
    if [ -d "$DESTINO/$d" ]; then
      find "$DESTINO/$d" -maxdepth 1 -type f -printf '%f  %s bytes\n' | sort -r
    else
      echo "   (vacia)"
    fi
  done
  [ -f "$DESTINO/ULTIMO_RESULTADO" ] && echo "Ultimo resultado: $(cat "$DESTINO/ULTIMO_RESULTADO")"
  return 0
}

restaurar() {
  local archivo="$1" tmp ok resp dueno
  [ -f "$archivo" ] || { [ -f "$DESTINO/diario/$archivo" ] && archivo="$DESTINO/diario/$archivo"; }
  [ -f "$archivo" ] || { [ -f "$DESTINO/semanal/$archivo" ] && archivo="$DESTINO/semanal/$archivo"; }
  [ -f "$archivo" ] || { echo "ERROR: no encuentro $1. Mira la lista con:  sudo respaldo_envivo.sh --listar"; exit 1; }
  [ -f "$DB" ] || { echo "ERROR: no existe la base $DB"; exit 1; }
  TRABAJO_TMP="$(mktemp -d "$DESTINO/.restaurar.XXXXXX")" || exit 1
  tmp="$TRABAJO_TMP/restaurar.sqlite"
  case "$archivo" in
    *.gz) gzip -dc -- "$archivo" > "$tmp" || { rm -rf "$TRABAJO_TMP"; echo "ERROR: el archivo esta danado (gzip)"; exit 1; } ;;
    *) cp -- "$archivo" "$tmp" ;;
  esac
  ok="$(revisar_base "$tmp")"
  [ "$ok" = "ok" ] || { rm -rf "$TRABAJO_TMP"; echo "ERROR: ese respaldo no esta sano ($ok). Usa otro."; exit 1; }
  echo "Respaldo elegido: $archivo"
  echo "   contiene: $(resumen_base "$tmp")"
  echo "Base actual:      $DB"
  echo "   contiene: $(resumen_base "$DB")"
  echo "OJO: todo lo que paso en el juego DESPUES de ese respaldo (cuentas nuevas, compras, partidas) se pierde."
  echo "     Antes se guarda una copia de la base actual, por si te arrepientes."
  if [ "$DRY_RUN" = "1" ]; then echo "(prueba) No se cambio nada."; rm -rf "$TRABAJO_TMP"; return 0; fi
  resp="${CONFIRMAR:-}"
  if [ -z "$resp" ] && { : < /dev/tty; } 2> /dev/null; then
    printf 'Para seguir escribe SI (en mayusculas) y Enter: '; read -r resp < /dev/tty || resp=""
  fi
  [ "$resp" = "SI" ] || { echo "Cancelado: no se cambio nada."; rm -rf "$TRABAJO_TMP"; exit 1; }
  local antes="$DESTINO/antes-de-restaurar-$FECHA.sqlite"
  copiar_base "$DB" "$antes" || { rm -rf "$TRABAJO_TMP"; echo "ERROR: no se pudo copiar la base actual. No se cambio nada."; exit 1; }
  gzip -n -f "$antes" && echo "Copia de la base actual: $antes.gz"
  dueno="$(stat -c '%U:%G' "$DB")"
  # .restore escribe DENTRO del mismo archivo con los bloqueos de SQLite: el juego solo espera unos segundos
  if sq "$DB" ".timeout 30000" ".restore '$tmp'"; then
    chown "$dueno" "$DB" "$DB-wal" "$DB-shm" 2> /dev/null
    ok="$(revisar_base "$DB")"
    rm -rf "$TRABAJO_TMP"
    if [ "$ok" = "ok" ]; then echo "LISTO: base restaurada ($(resumen_base "$DB"))."
    else echo "ATENCION: la base restaurada no paso la revision ($ok). Vuelve a la copia: sudo respaldo_envivo.sh --restaurar $antes.gz"; exit 1; fi
  else
    rm -rf "$TRABAJO_TMP"; echo "ERROR: no se pudo restaurar (la base sigue como estaba)."; exit 1
  fi
}

# ---------------------------------------------------------------------------------------------- inicio
if [ "$(id -u)" != "0" ] && [ "${PERMITIR_NO_ROOT:-0}" != "1" ]; then echo "ERROR: correlo con sudo:   sudo $0"; exit 1; fi
command -v sqlite3 > /dev/null || { echo "ERROR: falta el programa sqlite3. Instalalo con:  sudo apt install sqlite3"; exit 1; }

case "${1:-}" in
  --listar) listar; exit 0 ;;
  --restaurar) [ -n "${2:-}" ] || { echo "Uso: sudo respaldo_envivo.sh --restaurar ARCHIVO"; exit 1; }; restaurar "$2"; exit 0 ;;
  --ayuda|-h|--help) sed -n '2,30p' "$0"; exit 0 ;;
  "") ;;
  *) echo "Opcion desconocida: $1  (usa --ayuda)"; exit 1 ;;
esac

mkdir -p "$(dirname "$LOCK")" 2> /dev/null
exec 9> "$LOCK" || { echo "ERROR: no se pudo crear $LOCK"; exit 1; }
flock -n 9 || { dice "Ya hay otro respaldo corriendo. Salgo."; exit 0; }

dice "== Respaldo de EN VIVO Tycoon ($( [ "$DRY_RUN" = "1" ] && echo 'PRUEBA, no guarda nada' || echo "en $DESTINO"))"
[ -f "$DB" ] || falla "no existe la base $DB"

if [ "$DRY_RUN" = "1" ]; then
  TRABAJO_TMP="$(mktemp -d)" || exit 1
  TRAB="$TRABAJO_TMP"
else
  for d in "$DESTINO" "$DESTINO/diario" "$DESTINO/semanal" "$DESTINO/config"; do
    mkdir -p "$d" || falla "no se pudo crear $d"
  done
  chown root:root "$DESTINO" 2> /dev/null; chmod 700 "$DESTINO"
  TRAB="$DESTINO/diario"
fi

# Espacio libre: al menos 2 veces la base + 20 MB
TAM_DB=$(( $(stat -c %s "$DB") + $(stat -c %s "$DB-wal" 2> /dev/null || echo 0) ))
LIBRE_KB="$(df -Pk "$TRAB" | awk 'NR==2 {print $4}')"
[ "${LIBRE_KB:-0}" -gt $(( TAM_DB * 2 / 1024 + 20480 )) ] || falla "poco espacio en disco para el respaldo (libres ${LIBRE_KB:-?} KB, la base pesa $TAM_DB bytes)"

PARCIAL="$TRAB/.envivo-$FECHA.sqlite.parcial"
dice "1. Copia en caliente de $DB ($TAM_DB bytes)"
copiar_base "$DB" "$PARCIAL" || { rm -f "$PARCIAL"; falla "sqlite3 .backup no pudo copiar la base"; }

dice "2. Revision de la copia (PRAGMA integrity_check)"
OK="$(revisar_base "$PARCIAL")"
[ "$OK" = "ok" ] || { rm -f "$PARCIAL"; falla "la copia NO paso la revision: $OK"; }
dice "   ok ($(resumen_base "$PARCIAL"))"

dice "3. Comprimir"
if ! { gzip -n -6 --rsyncable -c "$PARCIAL" > "$PARCIAL.gz" && gzip -t "$PARCIAL.gz"; }; then
  rm -f "$PARCIAL" "$PARCIAL.gz"; falla "no se pudo comprimir la copia"
fi
rm -f "$PARCIAL"
NOMBRE="envivo-$FECHA.sqlite.gz"
if [ "$DRY_RUN" = "1" ]; then
  dice "   (prueba) guardaria $DESTINO/diario/$NOMBRE ($(stat -c %s "$PARCIAL.gz") bytes)"
else
  mv -f "$PARCIAL.gz" "$DESTINO/diario/$NOMBRE" || falla "no se pudo guardar la copia"
  chmod 600 "$DESTINO/diario/$NOMBRE"
  dice "   guardado $DESTINO/diario/$NOMBRE ($(stat -c %s "$DESTINO/diario/$NOMBRE") bytes)"
fi

dice "4. Copia semanal"
ULT_SEM="$(find "$DESTINO/semanal" -maxdepth 1 -type f -name 'envivo-*.sqlite.gz' -mtime -6 2> /dev/null | head -n 1)"
if [ "$DIA_HOY" = "$DIA_SEMANAL" ] || [ -z "$ULT_SEM" ]; then
  if [ "$DRY_RUN" = "1" ]; then dice "   (prueba) guardaria la copia semanal $DESTINO/semanal/$NOMBRE"
  else
    ln -f "$DESTINO/diario/$NOMBRE" "$DESTINO/semanal/$NOMBRE" 2> /dev/null || cp -p "$DESTINO/diario/$NOMBRE" "$DESTINO/semanal/$NOMBRE" || falla "no se pudo guardar la copia semanal"
    dice "   guardada $DESTINO/semanal/$NOMBRE"
  fi
else
  dice "   hoy no toca (ya hay una de esta semana)"
fi

dice "5. Configuracion $CONF_DIR"
if [ -d "$CONF_DIR" ]; then
  CFG="envivo-config-$FECHA.tar.gz"
  if tar -czf "$TRAB/.$CFG.parcial" -C "$(dirname "$CONF_DIR")" "$(basename "$CONF_DIR")" 2> /dev/null; then
    if [ "$DRY_RUN" = "1" ]; then dice "   (prueba) guardaria $DESTINO/config/$CFG"; rm -f "$TRAB/.$CFG.parcial"
    else mv -f "$TRAB/.$CFG.parcial" "$DESTINO/config/$CFG" && chmod 600 "$DESTINO/config/$CFG" && dice "   guardada $DESTINO/config/$CFG"; fi
  else
    rm -f "$TRAB/.$CFG.parcial"; falla "no se pudo copiar $CONF_DIR"
  fi
else
  dice "   AVISO: no existe $CONF_DIR (nada que copiar)"
fi

dice "6. Borrar las viejas (quedan $DIARIOS diarias, $SEMANALES semanales, $DIARIOS de configuracion)"
rotar "$DESTINO/diario" 'envivo-*.sqlite.gz' "$DIARIOS"
rotar "$DESTINO/semanal" 'envivo-*.sqlite.gz' "$SEMANALES"
rotar "$DESTINO/config" 'envivo-config-*.tar.gz' "$DIARIOS"
# Restos de un respaldo que se corto (luz, reinicio): mas de 1 dia
find "$DESTINO" -maxdepth 2 -name '.*.parcial*' -mtime +0 -delete 2> /dev/null

if [ "$DRY_RUN" = "1" ]; then
  rm -rf "$TRABAJO_TMP"
  dice "PRUEBA TERMINADA: la copia salio bien y no se guardo ni borro nada."
else
  printf 'OK %s %s\n' "$(date +%s)" "$DESTINO/diario/$NOMBRE" > "$DESTINO/ULTIMO_RESULTADO.tmp" && mv -f "$DESTINO/ULTIMO_RESULTADO.tmp" "$DESTINO/ULTIMO_RESULTADO"
  hc ""
  dice "LISTO."
fi
exit 0
