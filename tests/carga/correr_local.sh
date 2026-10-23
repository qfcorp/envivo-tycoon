#!/usr/bin/env bash
# =====================================================================
#  SOLO PRUEBAS: prueba de carga corta en ESTA maquina (docs/PRUEBA_CARGA.md, "ensayo local").
#  Arma un juego temporal (base y configuracion en una carpeta temporal), el validador de partidas (Node) y PHP con
#  "php -S" + server/tests/router.php (con varios procesos: PHP_CLI_SERVER_WORKERS), crea las cuentas de prueba y corre
#  tests/carga/k6_juego.js. No toca nada del sistema. Al final borra todo.
#  Uso:  bash tests/carga/correr_local.sh                  (300 jugadores: 30 s subiendo, 60 s arriba, 10 s bajando)
#        JUGADORES=100 MESETA=2m PROCESOS=8 bash tests/carga/correr_local.sh
#  Ojo: php -S no es nginx + php-fpm; sirve para ver que la API y el validador aguantan y para comparar versiones.
#  La prueba que vale para el VPS es la del paso 3 de docs/PRUEBA_CARGA.md.
# =====================================================================
set -u
R="$(cd "$(dirname "$0")/../.." && pwd)"
K6="${K6:-$(command -v k6)}"; [ -x "$K6" ] || { echo "ERROR: falta k6 (docs/PRUEBA_CARGA.md, paso 1)"; exit 1; }
NODE="${NODE:-$(command -v node || echo /opt/node22/bin/node)}"
JUGADORES="${JUGADORES:-300}"; PROCESOS="${PROCESOS:-8}"
T="$(mktemp -d)"; chmod 755 "$T"
puerto() { php -r '$s = stream_socket_server("tcp://127.0.0.1:0"); echo substr(strrchr(stream_socket_get_name($s, false), ":"), 1);'; }
P_APP="$(puerto)"; P_VAL="$(puerto)"
PIDS=()
fin() { for p in "${PIDS[@]}"; do kill "$p" 2> /dev/null; done; sleep 0.3; [ "${GUARDAR_TMP:-0}" = "1" ] && echo "Archivos en $T" || rm -rf "$T"; }
trap fin EXIT
export no_proxy="127.0.0.1,localhost" NO_PROXY="127.0.0.1,localhost" TZ=America/Guayaquil
CLAVE_V="$(openssl rand -hex 24)"
cat > "$T/config.env" <<CONF
ENVIVO_DB=$T/envivo.sqlite
ENVIVO_URL=http://127.0.0.1:$P_APP
ENVIVO_ZONA=America/Guayaquil
PLUX_AMBIENTE=sandbox
VALIDADOR_URL=http://127.0.0.1:$P_VAL
VALIDADOR_CLAVE=$CLAVE_V
NODE_BIN=$NODE
UNIVERSO_SERVIDORES_INICIALES=3
CONF
export ENVIVO_CONFIG="$T/config.env"
echo "== Juego temporal en $T (API 127.0.0.1:$P_APP, validador 127.0.0.1:$P_VAL, $PROCESOS procesos de PHP)"
php "$R/server/bin/migrar.php" || exit 1
php "$R/tests/carga/preparar_cuentas.php" "$JUGADORES" "$T/cuentas.json" || exit 1
VALIDADOR_PUERTO="$P_VAL" VALIDADOR_CLAVE="$CLAVE_V" ENVIVO_JUEGO="$R" "$NODE" "$R/server/validador/servidor.js" > "$T/validador.log" 2>&1 & PIDS+=($!)
PHP_CLI_SERVER_WORKERS="$PROCESOS" php -d variables_order=EGPCS -d opcache.enable_cli=1 -d opcache.validate_timestamps=0 -S "127.0.0.1:$P_APP" -t "$R" "$R/server/tests/router.php" > "$T/php.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$P_APP/api/salud" && break; sleep 0.2; done
echo "   /api/salud: $(curl -s "http://127.0.0.1:$P_APP/api/salud")"
"$K6" run --quiet -e BASE="http://127.0.0.1:$P_APP" -e CUENTAS="$T/cuentas.json" -e JUGADORES="$JUGADORES" \
  -e SUBIDA="${SUBIDA:-30s}" -e MESETA="${MESETA:-60s}" -e BAJADA="${BAJADA:-10s}" -e IP_POR_JUGADOR=0 \
  -e LOGIN_PCT="${LOGIN_PCT:-10}" -e DESAFIO_PCT="${DESAFIO_PCT:-30}" \
  --summary-export "$T/resumen.json" "$R/tests/carga/k6_juego.js"
RC=$?
echo "== Base despues de la prueba: $(sqlite3 "$T/envivo.sqlite" "select count(*) from jugadores") jugadores, $(sqlite3 "$T/envivo.sqlite" "select count(*) from chat_mensajes" 2> /dev/null || echo '?') mensajes de chat, desafios: $(sqlite3 "$T/envivo.sqlite" "select estado || '=' || count(*) from desafio_intentos group by estado" 2> /dev/null | tr '\n' ' ')"
echo "== Errores de PHP: $(grep -ciE 'fatal|uncaught' "$T/php.log")"
[ -n "${RESUMEN:-}" ] && cp "$T/resumen.json" "$RESUMEN"
exit $RC
