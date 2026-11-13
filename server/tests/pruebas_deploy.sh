#!/usr/bin/env bash
# shellcheck disable=SC2016  # (codigo y patrones entre comillas simples a proposito)
# =====================================================================
#  SOLO PRUEBAS (en una maquina de pruebas; NUNCA en el VPS). Prueba las funciones de server/deploy/comun.sh que usan
#  instalar.sh y actualizar.sh para:
#   - instalar_cron_juego: el cron de www-data con las tareas del juego (auditoria A2). Con un crontab FALSO:
#     cron vacio, cron con lineas de otros sistemas, cron viejo con tareas que faltan o sobran, correrlo otra vez.
#   - asegurar_ops / aviso_respaldo: respaldo nocturno, chequeo de salud y rotacion de registros (auditoria C1), con un
#     instalar_ops.sh FALSO que anota cuando lo llaman (el de verdad lo prueba deploy/ops/probar_ops.sh).
#   - que instalar.sh y actualizar.sh llamen a esas funciones (y ya no tengan su propio bloque de cron).
#  Todo en una carpeta temporal: no toca el cron de verdad, ni /usr/local/bin, ni /var/log.
#  Uso:  bash server/tests/pruebas_deploy.sh
# =====================================================================
set -u
cd "$(dirname "$0")/../.." || exit 1
RAIZ=$(pwd)
DEP="$RAIZ/server/deploy"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
OK=0; FALLAS=0
check() { if [ "$2" == "$3" ]; then OK=$((OK+1)); echo "  OK    $1"; else FALLAS=$((FALLAS+1)); echo "  FALLA $1 — esperado [$2], salio [$3]"; fi; }

# ---- crontab FALSO: guarda el cron de cada usuario en $TMP/cron/<usuario>
mkdir -p "$TMP/cron" "$TMP/log" "$TMP/bin" "$TMP/ops_bin" "$TMP/respaldos" "$TMP/app/server/deploy/ops"
cat > "$TMP/bin/crontab" <<'FALSO'
#!/usr/bin/env bash
u=""; acc=""
while [ $# -gt 0 ]; do case "$1" in -u) u="$2"; shift 2 ;; -l) acc=l; shift ;; -) acc=w; shift ;; *) shift ;; esac; done
f="$CRON_FALSO_DIR/$u"
echo "$acc $u" >> "$CRON_FALSO_DIR/llamadas.log"
if [ "$acc" = l ]; then [ -f "$f" ] || { echo "no crontab for $u" >&2; exit 1; }; cat "$f"; exit 0; fi
if [ "$acc" = w ]; then cat > "$f.nuevo.$$" && mv -f "$f.nuevo.$$" "$f"; exit 0; fi
exit 2
FALSO
chmod +x "$TMP/bin/crontab"
export CRON_FALSO_DIR="$TMP/cron"
export CRONTAB="$TMP/bin/crontab" CRON_USUARIO="usuario_juego" LOG_DIR="$TMP/log" OPS_BIN="$TMP/ops_bin" \
       RESPALDOS_ENVIVO="$TMP/respaldos" LOGROTATE_ENVIVO="$TMP/logrotate_envivo"
APP="$TMP/app"; CONF=/etc/envivo/config.env
# shellcheck source=../deploy/comun.sh
. "$DEP/comun.sh"
escrituras() { grep -c "^w usuario_juego" "$TMP/cron/llamadas.log" 2> /dev/null || echo 0; }

echo "== 1. Tareas programadas del juego (instalar_cron_juego)"
N=$(cron_juego "$APP" "$CONF" | grep -c "$APP/server/bin/")
check "cron_juego: 13 tareas, todas con ENVIVO_CONFIG y el registro en LOG_DIR" "13 13 13" \
  "$N $(cron_juego "$APP" "$CONF" | grep -c "ENVIVO_CONFIG=$CONF php") $(cron_juego "$APP" "$CONF" | grep -c "$TMP/log/envivo-")"
for t in tareas.php google_anulados.php facturacion.php push_enviar.php analitica.php errores.php discord_sync.php festival.php liga.php copas.php salud_servidores.php; do
  cron_juego "$APP" "$CONF" | grep -qF "$APP/server/bin/$t" || echo "  falta $t"
done
check "cron_juego: incluye google_anulados cada 6 h (reembolsos de Google) y facturacion cada 5 min" "1 1" \
  "$(cron_juego "$APP" "$CONF" | grep -cF "25 */6 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/google_anulados.php") $(cron_juego "$APP" "$CONF" | grep -cF "*/5 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/facturacion.php")"
# a) sin cron
SAL=$(instalar_cron_juego "$APP" "$CONF")
check "cron vacio: lo escribe con las 13 tareas" "13 1" "$(grep -c "$APP/server/bin/" "$TMP/cron/usuario_juego") $(grep -c 'puesto al dia' <<< "$SAL")"
check "…y crea los registros en LOG_DIR" "8" "$(find "$TMP/log" -name 'envivo-*.log' | wc -l)"
# b) otra vez: no reescribe
E=$(escrituras); SAL=$(instalar_cron_juego "$APP" "$CONF")
check "otra vez: 'ya estaba al dia' y no reescribe el cron" "1 $E" "$(grep -c 'ya estaba al dia' <<< "$SAL") $(escrituras)"
# c) cron VIEJO (como en el VPS tras la primera instalacion): faltan tareas nuevas, sobra una vieja, y lineas de otros
{ echo "MAILTO=\"\""
  echo "0 3 * * * php /var/www/erp/cron.php >> /var/log/erp.log 2>&1"
  echo "10 4 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/tareas.php >> /var/log/envivo-tareas.log 2>&1"
  echo "*/10 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/tarea_que_ya_no_existe.php >> /var/log/envivo-x.log 2>&1"
  echo "*/15 * * * * php /var/www/tupass/bin/aviso.php"; } > "$TMP/cron/usuario_juego"
SAL=$(instalar_cron_juego "$APP" "$CONF")
C="$TMP/cron/usuario_juego"
check "cron viejo: queda con las 13 tareas actuales (agrega google_anulados, facturacion, push...)" "13 1 1 1" \
  "$(grep -c "$APP/server/bin/" "$C") $(grep -c google_anulados "$C") $(grep -c facturacion.php "$C") $(grep -c push_enviar.php "$C")"
check "…quita la tarea del juego que ya no existe y no duplica tareas.php" "0 1" "$(grep -c tarea_que_ya_no_existe "$C") $(grep -c 'bin/tareas.php' "$C")"
check "…deja tal cual las lineas de los otros sistemas (ERP, TuPass, MAILTO)" "1 1 1" \
  "$(grep -cxF '0 3 * * * php /var/www/erp/cron.php >> /var/log/erp.log 2>&1' "$C") $(grep -cxF '*/15 * * * * php /var/www/tupass/bin/aviso.php' "$C") $(grep -cxF 'MAILTO=""' "$C")"
E=$(escrituras); instalar_cron_juego "$APP" "$CONF" > /dev/null
check "…y correrlo otra vez ya no cambia nada" "$E" "$(escrituras)"
# d) crontab que falla al escribir
printf '#!/usr/bin/env bash\n[ "${3:-}" = "-l" ] && exit 1\nexit 1\n' > "$TMP/bin/crontab_malo"; chmod +x "$TMP/bin/crontab_malo"
SAL=$(CRONTAB="$TMP/bin/crontab_malo" instalar_cron_juego "$APP" "$CONF"); RC=$?
check "si crontab falla: AVISO y sale con 1" "1 1" "$(grep -c 'AVISO: no se pudo programar' <<< "$SAL") $RC"

echo "== 2. Respaldo nocturno y chequeo de salud (asegurar_ops / aviso_respaldo)"
OPS="$APP/server/deploy/ops"
printf '#!/usr/bin/env bash\necho respaldo v1\n' > "$OPS/respaldo_envivo.sh"
printf '#!/usr/bin/env bash\necho salud v1\n' > "$OPS/salud_envivo.sh"
# instalar_ops.sh FALSO: hace lo mismo que el de verdad en lo que importa aqui (scripts, cron de root sin duplicar,
# logrotate y un respaldo enseguida) y anota que lo llamaron y con que variables
cat > "$OPS/instalar_ops.sh" <<'FALSO'
#!/usr/bin/env bash
SRC="$(cd "$(dirname "$0")" && pwd)"
echo "llamado BIN=$BIN RESPALDOS=$RESPALDOS LOGROTATE=$LOGROTATE" >> "$CRON_FALSO_DIR/ops.log"
install -m 750 "$SRC/respaldo_envivo.sh" "$BIN/respaldo_envivo.sh"; install -m 750 "$SRC/salud_envivo.sh" "$BIN/salud_envivo.sh"
{ "$CRONTAB" -u root -l 2> /dev/null | grep -vF "$BIN/respaldo_envivo.sh" | grep -vF "$BIN/salud_envivo.sh"
  echo "30 1 * * * $BIN/respaldo_envivo.sh >> /var/log/envivo-respaldo.log 2>&1"; echo "17 * * * * $BIN/salud_envivo.sh >> /var/log/envivo-salud.log 2>&1"; } | "$CRONTAB" -u root -
echo "logrotate" > "$LOGROTATE"
[ "${OPS_FALSO_FALLA_RESPALDO:-0}" = "1" ] && { printf 'FALLA %s disco lleno\n' "$(date +%s)" > "$RESPALDOS/ULTIMO_RESULTADO"; exit 0; }
printf 'OK %s %s\n' "$(date +%s)" "$RESPALDOS/diario/envivo-x.sqlite.gz" > "$RESPALDOS/ULTIMO_RESULTADO"
echo "== 8. Primer respaldo"
FALSO
llamadas_ops() { grep -c '^llamado' "$TMP/cron/ops.log" 2> /dev/null || echo 0; }
echo "0 2 * * * /usr/local/bin/backup_restic_erp_qf.sh" > "$TMP/cron/root"
# a) nada instalado (como estaba el VPS): aviso grande antes, se instala, respaldo enseguida
SAL=$(aviso_respaldo "$APP"); RC=$?
check "sin instalar: aviso_respaldo da el AVISO GRANDE y sale con 1" "1 1 1" "$(grep -c 'AVISO: EL RESPALDO DE LA BASE DEL JUEGO NO ESTA BIEN' <<< "$SAL") $(grep -c 'falta respaldo_envivo.sh' <<< "$SAL") $RC"
SAL=$(asegurar_ops "$APP"); RC=$?
check "asegurar_ops: dice lo que falta, corre instalar_ops.sh (1 vez) con OPS_BIN/RESPALDOS/LOGROTATE y sale bien" "1 1 1 0" \
  "$(grep -c 'falta respaldo_envivo.sh' <<< "$SAL") $(llamadas_ops) $(grep -c "BIN=$TMP/ops_bin RESPALDOS=$TMP/respaldos LOGROTATE=$TMP/logrotate_envivo" "$TMP/cron/ops.log") $RC"
check "…muestra lo que dijo el instalador (con sangria) y hubo respaldo enseguida" "1 OK" "$(grep -c '     | == 8. Primer respaldo' <<< "$SAL") $(cut -d' ' -f1 "$TMP/respaldos/ULTIMO_RESULTADO")"
check "…cron de root: 1 respaldo, 1 salud y el restic del ERP sigue" "1 1 1" \
  "$(grep -c respaldo_envivo.sh "$TMP/cron/root") $(grep -c salud_envivo.sh "$TMP/cron/root") $(grep -c backup_restic_erp_qf.sh "$TMP/cron/root")"
SAL=$(aviso_respaldo "$APP"); RC=$?
check "ya instalado y con respaldo OK: aviso_respaldo dice una linea y sale con 0" "1 0 0" "$(grep -c 'Respaldo nocturno: instalado, ultimo respaldo OK' <<< "$SAL") $(grep -c AVISO <<< "$SAL") $RC"
# b) otra vez: no llama al instalador
SAL=$(asegurar_ops "$APP")
check "otra vez: 'ya estaban' y NO corre instalar_ops.sh" "1 1" "$(grep -c 'ya estaban' <<< "$SAL") $(llamadas_ops)"
# c) cambio un script en el repo -> se reinstala
printf '#!/usr/bin/env bash\necho salud v2\n' > "$OPS/salud_envivo.sh"
SAL=$(asegurar_ops "$APP")
check "salud_envivo.sh cambio en el repo: se corre instalar_ops.sh y queda la version nueva" "1 2 1" \
  "$(grep -c 'salud_envivo.sh cambio en el repo' <<< "$SAL") $(llamadas_ops) $(grep -c 'salud v2' "$TMP/ops_bin/salud_envivo.sh")"
# d) alguien quito la linea del cron de root
grep -v respaldo_envivo "$TMP/cron/root" > "$TMP/r" && cat "$TMP/r" > "$TMP/cron/root"
check "sin la linea del respaldo en el cron de root: aviso_respaldo avisa" "1" "$(aviso_respaldo "$APP" | grep -c 'falta el respaldo de la 1:30')"
asegurar_ops "$APP" > /dev/null
check "…asegurar_ops la vuelve a poner (una sola) y no toca el restic" "3 1 1" "$(llamadas_ops) $(grep -c respaldo_envivo.sh "$TMP/cron/root") $(grep -c backup_restic_erp_qf.sh "$TMP/cron/root")"
# e) respaldo viejo o fallido
printf 'OK %s x\n' "$(( $(date +%s) - 30 * 3600 ))" > "$TMP/respaldos/ULTIMO_RESULTADO"
check "ultimo respaldo de hace 30 h: AVISO" "1 1" "$(aviso_respaldo "$APP" | grep -c 'es de hace 30 h') $(aviso_respaldo "$APP" | grep -c 'AVISO: EL RESPALDO')"
printf 'FALLA %s disco lleno\n' "$(date +%s)" > "$TMP/respaldos/ULTIMO_RESULTADO"
check "ultimo respaldo FALLO: AVISO con el detalle" "1" "$(aviso_respaldo "$APP" | grep -c 'el ultimo respaldo FALLO: disco lleno')"
rm -f "$TMP/respaldos/ULTIMO_RESULTADO"
check "sin ningun respaldo: AVISO" "1" "$(aviso_respaldo "$APP" | grep -c 'todavia no hay ningun respaldo')"
# f) en una version vieja (--version) un script distinto no es un problema para el aviso (solo lo que falta)
printf 'OK %s x\n' "$(date +%s)" > "$TMP/respaldos/ULTIMO_RESULTADO"
printf '#!/usr/bin/env bash\necho salud v0\n' > "$OPS/salud_envivo.sh"
check "script distinto al del repo: el aviso final no lo cuenta como falla" "0" "$(aviso_respaldo > /dev/null "$APP"; echo $?)"
# g) el instalador falla
printf '#!/usr/bin/env bash\necho roto; exit 3\n' > "$TMP/inst_malo.sh"
rm -f "$TMP/ops_bin/respaldo_envivo.sh"
SAL=$(INSTALAR_OPS="$TMP/inst_malo.sh" asegurar_ops "$APP"); RC=$?
check "si instalar_ops.sh falla: AVISO con el codigo y sale con ese codigo" "1 3" "$(grep -c 'termino con error (3)' <<< "$SAL") $RC"

echo "== 3. instalar.sh y actualizar.sh usan las funciones compartidas"
for s in instalar.sh actualizar.sh; do
  check "$s llama a instalar_cron_juego, asegurar_ops y aviso_respaldo" "1 1 1" \
    "$(grep -cE '^\s*instalar_cron_juego "\$APP" "\$CONF"' "$DEP/$s") $(grep -cE '^\s*(if .*then )?asegurar_ops "\$APP"' "$DEP/$s") $(grep -cE '^\s*aviso_respaldo "\$APP"' "$DEP/$s")"
done
check "instalar.sh ya no tiene su propio bloque de cron (las tareas viven en comun.sh)" "0 0" "$(grep -c 'CRON_JUEGO' "$DEP/instalar.sh") $(grep -c 'crontab -u www-data' "$DEP/instalar.sh")"
check "actualizar.sh: el aviso del respaldo es lo ultimo que se imprime" "aviso_respaldo" "$(grep -vE '^\s*(#|$)' "$DEP/actualizar.sh" | tail -n 1 | awk '{print $1}')"
check "actualizar.sh: con --version no cambia los scripts de ops" "1" "$(grep -c 'if \[ -z "\$PEDIDA" \]; then asegurar_ops' "$DEP/actualizar.sh")"

echo
echo "Resumen pruebas_deploy.sh — correctas: $OK  ·  Fallas: $FALLAS"
[ "$FALLAS" -eq 0 ]
