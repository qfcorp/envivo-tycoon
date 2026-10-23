#!/usr/bin/env bash
# =====================================================================
#  SOLO PRUEBAS (en una maquina de pruebas; NUNCA en el servidor del juego). Prueba completa del servidor de EN VIVO Tycoon:
#   0. php -l de todos los .php, bash -n de los .sh, node --check del JavaScript
#   1. Base SQLite y configuracion TEMPORALES (ENVIVO_CONFIG), migraciones desde cero y otra vez (no hace nada)
#   2. Plux FALSO (llaves RSA de prueba hechas aqui con openssl) y el juego con "php -S" + router.php (imita a nginx)
#   3. pruebas.php: cuenta, limites, X-Envivo, estado (API.md), partida, gastar, ordenes, Plux 0/2/100/102/103, 3DS,
#      idempotencia, paquete de inicio, VIP, webhook, panel, CSV, creditos a mano
#   4. Navegador de verdad (Playwright + Chromium) en un celular 390x844
#   5. nginx de verdad con la plantilla (si hay nginx y php-fpm en esta maquina): rutas permitidas y prohibidas
#   6. Ningun numero de tarjeta en la base, en los registros de PHP ni en las respuestas guardadas
#  Uso:  bash server/tests/correr.sh        (GUARDAR_TMP=1 para dejar los archivos de la prueba)
# =====================================================================
set -u
cd "$(dirname "$0")/../.." || exit 1
RAIZ=$(pwd)
SRV="$RAIZ/server"
TMP=$(mktemp -d)
chmod 755 "$TMP"
export no_proxy="127.0.0.1,localhost" NO_PROXY="127.0.0.1,localhost" TZ=America/Guayaquil
# Puertos libres al azar (otras pruebas pueden estar corriendo a la vez en la misma máquina)
puerto() { php -r '$s = stream_socket_server("tcp://127.0.0.1:0"); echo substr(strrchr(stream_socket_get_name($s, false), ":"), 1);'; }
P_APP=${P_APP:-$(puerto)}; P_SIN=${P_SIN:-$(puerto)}; P_FALSO=${P_FALSO:-$(puerto)}; P_NGINX=${P_NGINX:-$(puerto)}; P_GOOGLE=${P_GOOGLE:-$(puerto)}
PIDS=()
limpiar() {
  for p in "${PIDS[@]}"; do kill "$p" 2> /dev/null; done
  [ -f "$TMP/nginx.pid" ] && kill "$(cat "$TMP/nginx.pid")" 2> /dev/null
  [ -f "$TMP/fpm.pid" ] && kill "$(cat "$TMP/fpm.pid")" 2> /dev/null
  sleep 0.3
  if [ "${GUARDAR_TMP:-0}" = "1" ]; then echo "Archivos de la prueba en $TMP"; else rm -rf "$TMP"; fi
}
trap limpiar EXIT
OK=0; FALLAS=0
check() { if [ "$2" == "$3" ]; then OK=$((OK+1)); echo "  OK    $1"; else FALLAS=$((FALLAS+1)); echo "  FALLA $1 — esperado [$2], salio [$3]"; fi; }
esperar() { for _ in $(seq 1 60); do curl -s -o /dev/null "$1" && return 0; sleep 0.1; done; return 1; }

echo "== 0. Sintaxis"
MAL=0
while IFS= read -r f; do php -l "$f" > /dev/null 2>&1 || { echo "  FALLA php -l $f"; MAL=1; }; done < <(find "$SRV" -name '*.php')
while IFS= read -r f; do bash -n "$f" || { echo "  FALLA bash -n $f"; MAL=1; }; done < <(find "$SRV" -name '*.sh')
check "php -l y bash -n sin errores" 0 "$MAL"
node --check "$SRV/public/assets/pago.js" && node --check "$SRV/tests/navegador.cjs"
check "JavaScript sin errores de sintaxis" 0 "$?"
check "Vendor CryptoJS y JSEncrypt iguales a los de TuPass (si esta TuPass)" 0 "$( [ -d /home/claude/tupass ] && { cmp -s "$SRV/public/assets/vendor/crypto-js.min.js" /home/claude/tupass/public/assets/vendor/crypto-js.min.js && cmp -s "$SRV/public/assets/vendor/jsencrypt.min.js" /home/claude/tupass/public/assets/vendor/jsencrypt.min.js; echo $?; } || echo 0)"

echo
echo "== 1. Configuracion y base TEMPORALES"
openssl genrsa -out "$TMP/plux_privada.pem" 2048 2> /dev/null
openssl rsa -in "$TMP/plux_privada.pem" -pubout -out "$TMP/plux_publica.pem" 2> /dev/null
LLAVE=$(grep -v -- '-----' "$TMP/plux_publica.pem" | tr -d '\n')
HOOK_CLAVE=$(openssl rand -hex 16)
# Cuenta de servicio de Google FALSA (llaves hechas aquí; el Google falso verifica la firma del JWT con la pública)
openssl genrsa -out "$TMP/google_privada.pem" 2048 2> /dev/null
openssl rsa -in "$TMP/google_privada.pem" -pubout -out "$TMP/google_publica.pem" 2> /dev/null
php -r 'echo json_encode(["type" => "service_account", "client_email" => "envivo@prueba.iam.gserviceaccount.com", "private_key" => file_get_contents($argv[1]), "token_uri" => $argv[2]]);' "$TMP/google_privada.pem" "http://127.0.0.1:$P_GOOGLE/token" > "$TMP/google-play.json"
ADMIN_CLAVE="Panel-$(openssl rand -hex 6)"
ADMIN_HASH=$(printf '%s' "$ADMIN_CLAVE" | php -r 'echo password_hash(stream_get_contents(STDIN), PASSWORD_BCRYPT);')
mkdir -p "$TMP/datos"
cat > "$TMP/config.env" <<ENV
; SOLO PRUEBAS (server/tests/correr.sh)
ENVIVO_DB=$TMP/datos/envivo.sqlite
ENVIVO_URL=http://127.0.0.1:$P_APP
ENVIVO_ZONA=America/Guayaquil
ENVIVO_ADMIN_USUARIO=admin_prueba
ENVIVO_ADMIN_CLAVE_HASH=$ADMIN_HASH
PLUX_AMBIENTE=sandbox
PLUX_API_BASE=http://127.0.0.1:$P_FALSO/intv1/
PLUX_ID_ESTABLECIMIENTO=EST-PRUEBA-1
PLUX_ID_CLIENTE=cliente_prueba
PLUX_CLAVE_SECRETA=secreto_prueba_123
PLUX_LLAVE_PUBLICA=$LLAVE
PLUX_WEBHOOK_USUARIO=plux_aviso
PLUX_WEBHOOK_CLAVE=$HOOK_CLAVE
SOPORTE_CORREO=soporte@prueba.example
SOPORTE_HORARIO=Lunes a viernes 9:00-18:00
GOOGLE_PACKAGE_NAME=com.tukanec.envivo
GOOGLE_SERVICE_ACCOUNT_JSON=$TMP/google-play.json
GOOGLE_API_BASE=http://127.0.0.1:$P_GOOGLE/
GOOGLE_TOKEN_URL=http://127.0.0.1:$P_GOOGLE/token
ENV
grep -vE '^(PLUX_ID_|PLUX_CLAVE|PLUX_LLAVE)' "$TMP/config.env" | sed "s#^ENVIVO_URL=.*#ENVIVO_URL=http://127.0.0.1:$P_SIN#; s#envivo.sqlite#envivo_sin.sqlite#" > "$TMP/config_sin.env"
export ENVIVO_CONFIG="$TMP/config.env"
check "Migraciones desde cero" "Base de datos al día: $TMP/datos/envivo.sqlite (versión 4 de 4, modo wal)" "$(php "$SRV/bin/migrar.php")"
check "Migraciones otra vez: igual, sin error" "0" "$(php "$SRV/bin/migrar.php" > /dev/null; echo $?)"
TABLAS=$(php -r '$p = new PDO("sqlite:" . $argv[1]); echo implode(" ", $p->query("SELECT name FROM sqlite_master WHERE type = '"'"'table'"'"' AND name NOT LIKE '"'"'sqlite_%'"'"' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN));' "$TMP/datos/envivo.sqlite")
FALTAN=""
for t in actividad ajustes asociacion_miembros asociacion_solicitudes asociaciones auditoria avisos bonos_vip chat_bloqueos chat_mensajes chat_palabras chat_reportes chat_sanciones coalicion_miembros coaliciones compras entregas esquema_modulos intentos inventario jugadores mercado_publicaciones mercado_retenciones movimientos_creditos ofertas partidas plux_3ds_usados productos_ajustes series servidores sesiones soporte_casos soporte_mensajes soporte_respuestas tarjeta_reclamos transferencias; do
  case " $TABLAS " in *" $t "*) ;; *) FALTAN="$FALTAN $t" ;; esac
done
check "Tablas del servidor creadas (y las de los modulos de src/migraciones/*.sql)" "" "$FALTAN"
ENVIVO_CONFIG="$TMP/no-existe.env" php "$SRV/bin/migrar.php" > /dev/null 2>&1
check "migrar.php sin configuracion ni carpeta -> error claro (no crea nada en otro lado)" "1" "$?"
echo "  -- base de la version 1 (produccion) -> version nueva:"
php "$SRV/tests/migracion_v1.php" "$TMP" | sed 's/^/  /'
check "Migracion desde la base de produccion (v1) sin perder datos" 0 "${PIPESTATUS[0]}"

echo
echo "== 2. Servidores: Plux FALSO y el juego (php -S + router.php)"
export FALSO_LLAVE_PRIVADA="$TMP/plux_privada.pem" FALSO_LLAVE_PUBLICA="$TMP/plux_publica.pem" FALSO_ID_CLIENTE=cliente_prueba FALSO_CLAVE=secreto_prueba_123
export FALSO_ESTABLECIMIENTO=EST-PRUEBA-1 FALSO_LOG="$TMP/plux_falso.log" FALSO_BASE="http://127.0.0.1:$P_FALSO"
touch "$FALSO_LOG"
PHP_CLI_SERVER_WORKERS=3 php -S 127.0.0.1:$P_FALSO "$SRV/tests/plux_falso.php" > "$TMP/falso.log" 2>&1 & PIDS+=($!)
export FALSO_G_PUB="$TMP/google_publica.pem" FALSO_G_LOG="$TMP/google_falso.log" FALSO_G_ANULADAS="$TMP/google_anuladas.json" FALSO_G_PAQUETE=com.tukanec.envivo
touch "$FALSO_G_LOG"
PHP_CLI_SERVER_WORKERS=2 php -S 127.0.0.1:$P_GOOGLE "$SRV/tests/google_api_falso.php" > "$TMP/google.log" 2>&1 & PIDS+=($!)
PHPINI=(-d error_log="$TMP/php_errores.log" -d log_errors=1 -d display_errors=0 -d error_reporting=-1)
# 4 procesos a la vez (como php-fpm): asi las pruebas de "gastar a la vez" y "4 avisos a la vez" son de verdad simultaneas
(cd "$RAIZ" && PHP_CLI_SERVER_WORKERS=4 exec php "${PHPINI[@]}" -S 127.0.0.1:$P_APP -t "$RAIZ" server/tests/router.php) > "$TMP/app.log" 2>&1 & PIDS+=($!)
(cd "$RAIZ" && ENVIVO_CONFIG="$TMP/config_sin.env" exec php "${PHPINI[@]}" -S 127.0.0.1:$P_SIN -t "$RAIZ" server/tests/router.php) > "$TMP/sin.log" 2>&1 & PIDS+=($!)
esperar "http://127.0.0.1:$P_APP/api/estado" && esperar "http://127.0.0.1:$P_SIN/api/estado" && esperar "http://127.0.0.1:$P_FALSO/x" && esperar "http://127.0.0.1:$P_GOOGLE/x" || { echo "No arrancaron los servidores"; exit 1; }
check "El juego responde /api/estado" "200" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$P_APP/api/estado")"

echo
echo "== 3. Pruebas por HTTP (pruebas.php)"
EV_URL="http://127.0.0.1:$P_APP" EV_URL_SINPLUX="http://127.0.0.1:$P_SIN" EV_TMP="$TMP" EV_DB="$TMP/datos/envivo.sqlite" \
EV_ADMIN_USUARIO=admin_prueba EV_ADMIN_CLAVE="$ADMIN_CLAVE" PLUX_WEBHOOK_USUARIO=plux_aviso PLUX_WEBHOOK_CLAVE="$HOOK_CLAVE" php "$SRV/tests/pruebas.php"
check "pruebas.php sin fallas" 0 "$?"
P_OK=$(cut -d" " -f1 "$TMP/resumen_pruebas.txt" 2> /dev/null); P_FALLAS=$(cut -d" " -f2 "$TMP/resumen_pruebas.txt" 2> /dev/null)

echo
echo "== 3b. Soporte y Google Play (pruebas_soporte_google.php, con su propio Google falso y sus propios puertos)"
php "$SRV/tests/pruebas_soporte_google.php" > "$TMP/soporte_google.log" 2>&1; R3B=$?
grep -E "FALLA|PENDIENTE|Resumen|correctas" "$TMP/soporte_google.log" | sed 's/^/  /'
check "pruebas_soporte_google.php sin fallas" 0 "$R3B"
check "pruebas_soporte_google.php: nada PENDIENTE del servidor (S5 = dist/, lo reconstruye el juego)" "" "$(grep 'PENDIENTE' "$TMP/soporte_google.log" | grep -v ' S5 ' | tr -s ' ' | tr '\n' ';')"

echo
echo "== 4. Navegador de verdad (Playwright + Chromium, celular 390x844)"
php -r '$p = new PDO("sqlite:" . $argv[1]); $p->exec("DELETE FROM intentos");' "$TMP/datos/envivo.sqlite"
NP="${NODE_PATH:-/opt/npm-tools/node_modules}"
SAL=$(NODE_PATH="$NP" node "$SRV/tests/navegador.cjs" "http://127.0.0.1:$P_APP" 2>&1 | tail -1)
echo "  $SAL"
check "Navegador: pagar con la tarjeta aprobada y llegar a /?compra=ok, sin errores ni desborde" "true" "$(echo "$SAL" | php -r '$j = json_decode(stream_get_contents(STDIN), true); echo !empty($j["ok"]) ? "true" : "false";')"
check "Navegador: Plux recibio la tarjeta cifrada por CryptoJS/JSEncrypt (rechazada, aprobada y 3DS)" "3" "$(grep '"ruta":"pago"' "$FALSO_LOG" | tail -3 | grep -c '"clave_ok":true,"tarjeta_ok":true')"

echo
echo "== 5. nginx de verdad con la plantilla (deploy/nginx-sitio.sh)"
FPM=$(command -v php-fpm8.3 || command -v php-fpm || true)
if command -v nginx > /dev/null && [ -n "$FPM" ]; then
  NG="$TMP/nginx"; mkdir -p "$NG/logs" "$NG/tmp"
  APPN="$TMP/app"; mkdir -p "$APPN"
  # Copia del repositorio como quedaria en /var/www/envivo (con los archivos de pruebas y .git para ver que NO se sirven)
  (cd "$RAIZ" && tar --exclude=./node_modules --exclude=./tests/capturas -cf - .) | tar -xf - -C "$APPN"
  chmod -R a+rX "$APPN"
  cat > "$NG/fpm.conf" <<FPM
[global]
pid = $TMP/fpm.pid
error_log = $NG/logs/fpm.log
daemonize = yes
[envivo]
listen = $NG/fpm.sock
listen.mode = 0666
pm = static
pm.max_children = 4
clear_env = no
env[ENVIVO_CONFIG] = $TMP/config_nginx.env
php_admin_value[error_log] = $TMP/php_errores.log
php_admin_flag[log_errors] = on
FPM
  [ "$(id -u)" = "0" ] && printf 'user = nobody\ngroup = nogroup\n' >> "$NG/fpm.conf"
  sed "s#^ENVIVO_URL=.*#ENVIVO_URL=http://127.0.0.1:$P_NGINX#" "$TMP/config.env" > "$TMP/config_nginx.env"
  touch "$TMP/php_errores.log"; chmod 666 "$TMP/php_errores.log"
  chmod 777 "$TMP/datos"; chmod 666 "$TMP/datos/"* 2> /dev/null; chmod 644 "$TMP/config_nginx.env"
  "$FPM" -y "$NG/fpm.conf" -R 2> "$NG/logs/fpm-arranque.log"
  DOMINIO=juego.tukanec.com APP="$APPN" SOCK="$NG/fpm.sock" LISTEN="127.0.0.1:$P_NGINX" bash "$SRV/deploy/nginx-sitio.sh" > "$NG/sitio.conf"
  cat > "$NG/nginx.conf" <<NGC
worker_processes 1;
pid $TMP/nginx.pid;
error_log $NG/logs/error.log;
events { worker_connections 64; }
http {
  include /etc/nginx/mime.types;
  access_log off;
  client_body_temp_path $NG/tmp; fastcgi_temp_path $NG/tmp; proxy_temp_path $NG/tmp; uwsgi_temp_path $NG/tmp; scgi_temp_path $NG/tmp;
  include $NG/sitio.conf;
}
NGC
  nginx -t -q -c "$NG/nginx.conf" -p "$NG" 2> "$NG/logs/t.log"
  check "nginx -t acepta la plantilla del sitio" 0 "$?"
  # La plantilla de produccion (HTTP, y HTTPS con un certificado de prueba) tambien debe pasar nginx -t
  mkdir -p "$NG/cert"; openssl req -x509 -newkey rsa:2048 -nodes -keyout "$NG/cert/privkey.pem" -out "$NG/cert/fullchain.pem" -days 1 -subj "/CN=juego.tukanec.com" 2> /dev/null
  for modo in http https; do
    C=""; [ "$modo" = "https" ] && C="$NG/cert"
    DOMINIO=juego.tukanec.com APP="$APPN" SOCK="$NG/fpm.sock" CERT="${C:-/no/existe}" bash "$SRV/deploy/nginx-sitio.sh" > "$NG/prod_$modo.conf"
    sed "s#include $NG/sitio.conf;#include $NG/prod_$modo.conf;#; s#^pid .*#pid $NG/t.pid;#" "$NG/nginx.conf" > "$NG/nginx_$modo.conf"
    nginx -t -q -c "$NG/nginx_$modo.conf" -p "$NG" 2>> "$NG/logs/t.log"
    check "nginx -t acepta la plantilla de produccion ($modo)" 0 "$?"
  done
  nginx -c "$NG/nginx.conf" -p "$NG" 2>> "$NG/logs/t.log"
  esperar "http://127.0.0.1:$P_NGINX/api/estado"
  B="http://127.0.0.1:$P_NGINX"
  RUTAS_BIEN="/ /index.html /js/logic.js /icons/icon-192.png /manifest.webmanifest /sw.js /terminos.html /privacidad.html /pago-assets/pago.js /pago-assets/estilo.css /pago-assets/vendor/crypto-js.min.js /api/estado"
  RUTAS_MAL="/server/src/Config.php /server/src/Db.php /server/tests/pruebas.php /server/tests/plux_falso.php /server/deploy/instalar.sh /server/bin/migrar.php /server/config.env.ejemplo /server/API.md /server/public/api.php /server/public/assets/pago.js /.git/config /.git/HEAD /.gitignore /PLAN.md /README.md /tests/test_logic.js /tools/build_single.js /dist/envivo-tycoon.html /HEAD_SNIPPET.html /config.env /server/tests/correr.sh /js/../server/src/Config.php /pago-assets/../src/Config.php /pago-assets/../../src/Db.php /api.php /index.php"
  MAL=""
  for r in $RUTAS_BIEN; do h=$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$B$r"); [ "$h" = "200" ] || MAL="$MAL $r=$h"; done
  check "nginx: el juego, la API, pago-assets y las legales se ven (200)" "" "$MAL"
  MAL=""
  for r in $RUTAS_MAL; do h=$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$B$r"); { [ "$h" = "404" ] || [ "$h" = "400" ] || [ "$h" = "403" ]; } || MAL="$MAL $r=$h"; done
  check "nginx: codigo del servidor, pruebas, .git, PLAN.md, README.md... prohibidos" "" "$MAL"
  check "nginx: /api/estado devuelve JSON del juego" "true" "$(curl -s "$B/api/estado" | php -r '$j = json_decode(stream_get_contents(STDIN), true); echo isset($j["tienda"]["productos"]) ? "true" : "false";')"
  check "nginx: /pago.php llega a PHP (sin sesion -> 401)" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$B/pago.php?o=abc")"
  check "nginx: /admin.php pide clave (401)" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$B/admin.php")"
  check "nginx: /admin.php con la clave -> 200 (Basic Auth llega a PHP)" "200" "$(curl -s -o /dev/null -w '%{http_code}' -u "admin_prueba:$ADMIN_CLAVE" "$B/admin.php")"
  check "nginx: POST /api/registro sin X-Envivo -> 403" "403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$B/api/registro")"
  check "nginx: registro con X-Envivo -> 200" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Envivo: 1' -d '{"email":"nginx@prueba.example","nombre":"Nginx","clave":"ClaveNginx1"}' "$B/api/registro")"
  check "nginx: el webhook con Basic Auth llega a PHP (clave mala -> 401)" "401" "$(curl -s -o /dev/null -w '%{http_code}' -u plux_aviso:mala -X POST -d '{}' "$B/api/plux/webhook")"
  check "nginx: el webhook con la clave buena -> 422 (estado vacio)" "422" "$(curl -s -o /dev/null -w '%{http_code}' -u "plux_aviso:$HOOK_CLAVE" -X POST -H 'Content-Type: application/json' -d '{"x":1}' "$B/api/plux/webhook")"
  check "nginx: el juego tiene la tienda de Plux disponible" "true" "$(curl -s "$B/api/estado" | php -r '$j = json_decode(stream_get_contents(STDIN), true); echo !empty($j["plux"]["disponible"]) ? "true" : "false";')"
else
  echo "  (sin nginx o php-fpm en esta maquina: se salta)"
fi

echo
echo "== 6. Ningun dato de tarjeta guardado ni registrado"
php -r '$p = new PDO("sqlite:" . $argv[1]); $p->exec("PRAGMA wal_checkpoint(TRUNCATE)");' "$TMP/datos/envivo.sqlite"
TARJETAS='4540639936908783|4111111111111111|36417200103608|5555555555554444|4000000000000002'
touch "$TMP/php_errores.log"
check "Base de datos (archivo .sqlite, -wal y -shm): sin numeros de tarjeta" "0" "$(cat "$TMP"/datos/* 2> /dev/null | grep -caE "$TARJETAS")"
check "Base de datos: sin campos de tarjeta (cardNumber, cvv, expiration, simetricKey)" "0" "$(cat "$TMP"/datos/* 2> /dev/null | grep -caiE 'cardNumber|"card"|"cvv"|expirationMonth|expirationYear|simetricKey')"
check "Registro de errores de PHP: sin numeros de tarjeta ni campos cifrados" "0" "$(cat "$TMP/php_errores.log" "$TMP/app.log" "$TMP/sin.log" | grep -cE "$TARJETAS|expirationMonth|simetricKey")"
check "El codigo no escribe el pedido a Plux en ningun registro" "0" "$(grep -rnE 'error_log\([^)]*(\$cuerpo|\$in\b|card)' "$SRV/src" "$SRV/public" | wc -l)"
AVISOS=$(cat "$TMP/php_errores.log" "$TMP/app.log" "$TMP/sin.log" | grep -ciE "fatal|warning|deprecated|notice|EN VIVO api|EN VIVO pago|EN VIVO admin")
check "Sin errores ni avisos de PHP" 0 "$AVISOS"; [ "$AVISOS" = 0 ] || cat "$TMP/php_errores.log" "$TMP/app.log" | grep -iE "fatal|warning|deprecated|notice|EN VIVO" | sort | uniq -c | head -10
check "Plux falso: ninguna llamada sin Basic Auth valida" "0" "$(grep -c '"auth_ok":false' "$FALSO_LOG")"
SECRETOS=$(grep -rnIE '^[[:space:]]*(PLUX_CLAVE_SECRETA|PLUX_ID_CLIENTE|PLUX_WEBHOOK_CLAVE|ENVIVO_ADMIN_CLAVE_HASH)=[^$ ]' "$SRV" --include='*.php' --include='*.sh' --include='*.ejemplo' --include='*.env' | grep -v '^.*tests/' | grep -viE '=[A-Za-z0-9_]*prueba' )
check "Ninguna clave real escrita en el codigo ni en el ejemplo" "" "$SECRETOS"

echo
echo "----------------------------------------"
echo "pruebas.php: $P_OK correctas, $P_FALLAS fallas"
echo "Resumen correr.sh — correctas: $OK  ·  Fallas: $FALLAS"
[ "$FALLAS" -eq 0 ]
