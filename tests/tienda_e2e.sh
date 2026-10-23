#!/usr/bin/env bash
# Prueba de la tienda desde el juego, con el servidor real (php -S) y un Plux FALSO. Nunca cobra nada.
# Uso:  bash tests/tienda_e2e.sh
set -u
cd "$(dirname "$0")/.." || exit 1
RAIZ=$(pwd); SRV="$RAIZ/server"; TMP=$(mktemp -d)
export no_proxy="127.0.0.1,localhost" NO_PROXY="127.0.0.1,localhost" TZ=America/Guayaquil
P_APP=8391; P_FALSO=8393; PIDS=()
trap 'for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; rm -rf "$TMP"' EXIT
openssl genrsa -out "$TMP/priv.pem" 2048 2>/dev/null
openssl rsa -in "$TMP/priv.pem" -pubout -out "$TMP/pub.pem" 2>/dev/null
LLAVE=$(grep -v -- '-----' "$TMP/pub.pem" | tr -d '\n')
mkdir -p "$TMP/datos" "$RAIZ/tests/capturas"
cat > "$TMP/config.env" <<ENV
ENVIVO_DB=$TMP/datos/envivo.sqlite
ENVIVO_URL=http://127.0.0.1:$P_APP
ENVIVO_ZONA=America/Guayaquil
ENVIVO_ADMIN_USUARIO=admin_prueba
ENVIVO_ADMIN_CLAVE_HASH=x
PLUX_AMBIENTE=sandbox
PLUX_API_BASE=http://127.0.0.1:$P_FALSO/intv1/
PLUX_ID_ESTABLECIMIENTO=EST-PRUEBA-1
PLUX_ID_CLIENTE=cliente_prueba
PLUX_CLAVE_SECRETA=secreto_prueba_123
PLUX_LLAVE_PUBLICA=$LLAVE
PLUX_WEBHOOK_USUARIO=plux_aviso
PLUX_WEBHOOK_CLAVE=no_se_usa
ENV
export ENVIVO_CONFIG="$TMP/config.env"
export FALSO_LLAVE_PRIVADA="$TMP/priv.pem" FALSO_ID_CLIENTE=cliente_prueba FALSO_CLAVE=secreto_prueba_123
export FALSO_ESTABLECIMIENTO=EST-PRUEBA-1 FALSO_LOG="$TMP/falso.log" FALSO_BASE="http://127.0.0.1:$P_FALSO"
php -S 127.0.0.1:$P_FALSO "$SRV/tests/plux_falso.php" > "$TMP/f.log" 2>&1 & PIDS+=($!)
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:$P_APP -t "$RAIZ" "$SRV/tests/router.php" > "$TMP/a.log" 2>&1 & PIDS+=($!)
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$P_APP/api/estado" && break; sleep 0.1; done
NODE_PATH=${NODE_PATH:-/opt/npm-tools/node_modules} node tests/tienda_e2e.cjs "http://127.0.0.1:$P_APP"
R=$?
if grep -q "PHP \(Warning\|Fatal\|Notice\)" "$TMP/a.log"; then echo "❌ Hubo errores de PHP:"; grep "PHP " "$TMP/a.log" | head; R=1; fi
exit $R
