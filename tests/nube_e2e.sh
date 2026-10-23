#!/usr/bin/env bash
# Partida en la nube con DOS navegadores en la misma cuenta, contra el servidor real (php -S + router.php, base temporal).
# Reproduce el caso del dueño (computadora con la pestaña abierta, avanza en el celular) y el de sin internet.
# Uso:  bash tests/nube_e2e.sh
set -u
cd "$(dirname "$0")/.." || exit 1
RAIZ=$(pwd); SRV="$RAIZ/server"; TMP=$(mktemp -d)
export no_proxy="127.0.0.1,localhost" NO_PROXY="127.0.0.1,localhost" TZ=America/Guayaquil
puerto() { php -r '$s = stream_socket_server("tcp://127.0.0.1:0"); echo substr(strrchr(stream_socket_get_name($s, false), ":"), 1);'; }
P_APP=${P_APP:-$(puerto)}; PIDS=()
trap 'for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; rm -rf "$TMP"' EXIT
mkdir -p "$TMP/datos" "$RAIZ/tests/capturas"
cat > "$TMP/config.env" <<ENV
; SOLO PRUEBAS (tests/nube_e2e.sh)
ENVIVO_DB=$TMP/datos/envivo.sqlite
ENVIVO_URL=http://127.0.0.1:$P_APP
ENVIVO_ZONA=America/Guayaquil
PLUX_AMBIENTE=sandbox
ENV
export ENVIVO_CONFIG="$TMP/config.env"
PHP_CLI_SERVER_WORKERS=4 php -d error_log="$TMP/php_errores.log" -d log_errors=1 -S 127.0.0.1:$P_APP -t "$RAIZ" "$SRV/tests/router.php" > "$TMP/a.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$P_APP/api/estado" && break; sleep 0.1; done
NODE_PATH=${NODE_PATH:-/opt/npm-tools/node_modules} node tests/nube_e2e.cjs "http://127.0.0.1:$P_APP"
R=$?
if cat "$TMP/a.log" "$TMP/php_errores.log" 2>/dev/null | grep -qiE "PHP (Warning|Fatal|Notice|Deprecated)|EN VIVO api"; then echo "❌ Hubo errores de PHP:"; cat "$TMP/a.log" "$TMP/php_errores.log" | grep -iE "PHP |EN VIVO api" | head; R=1; fi
exit $R
