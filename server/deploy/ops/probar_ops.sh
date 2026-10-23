#!/usr/bin/env bash
# shellcheck disable=SC2016  # (codigo PHP/JS entre comillas simples a proposito)
# =====================================================================
#  SOLO PRUEBAS (en una maquina de pruebas; NUNCA en el VPS). Prueba de server/deploy/ops/:
#   0. bash -n y shellcheck (si esta) de los scripts
#   1. respaldo_envivo.sh con una base TEMPORAL: prueba (DRY_RUN), respaldo real, copia mientras se escribe,
#      revision de integridad, rotacion 7/4, base danada, restaurar
#   2. nginx de verdad con la plantilla + nginx-endurecer.patch + nginx-envivo-limites.conf: nginx -t (HTTP y HTTPS),
#      cabeceras de seguridad en todas las rutas, limite 429 en JSON, tamanos maximos, CSP en Chromium sin violaciones
#   3. salud_envivo.sh contra ese nginx y un Telegram FALSO: todo bien, cada problema, anti-spam de 3 h,
#      "ya se arreglo", DRY_RUN, token leido de alerta-telegram.sh, modo helper, Telegram caido
#   4. instalar_ops.sh en modo prueba (DRY_RUN=1) y de verdad + segunda vez (no duplica) + desinstalar
#  Uso (como root, porque prueba permisos y el usuario www-data):   sudo bash server/deploy/ops/probar_ops.sh
#  GUARDAR_TMP=1 deja los archivos. SIN_INSTALAR=1 salta el punto 4 (que si escribe en /usr/local/bin y el cron).
# =====================================================================
set -u
cd "$(dirname "$0")/../../.." || exit 1
RAIZ=$(pwd)
OPS="$RAIZ/server/deploy/ops"
[ "$(id -u)" = "0" ] || { echo "Correlo como root (sudo)"; exit 1; }
id www-data > /dev/null 2>&1 || { echo "Falta el usuario www-data"; exit 1; }
TMP=$(mktemp -d /var/tmp/envivo-ops-prueba.XXXXXX); chmod 755 "$TMP"
export no_proxy="127.0.0.1,localhost" NO_PROXY="127.0.0.1,localhost" TZ=America/Guayaquil
libre() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
P_NG=${P_NG:-$(libre)}; P_TG=${P_TG:-$(libre)}
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
entre() { if [ "$4" -ge "$2" ] 2> /dev/null && [ "$4" -le "$3" ]; then OK=$((OK+1)); echo "  OK    $1 ($4)"; else FALLAS=$((FALLAS+1)); echo "  FALLA $1 — esperado entre $2 y $3, salio [$4]"; fi; }
contiene() { if grep -qF -- "$2" <<< "$3"; then OK=$((OK+1)); echo "  OK    $1"; else FALLAS=$((FALLAS+1)); echo "  FALLA $1 — no aparece [$2] en: $(head -c 400 <<< "$3")"; fi; }
esperar() { for _ in $(seq 1 80); do curl -s -o /dev/null "$1" && return 0; sleep 0.1; done; return 1; }
sqw() { runuser -u www-data -- sqlite3 -bail -batch -noheader "$DB" ".timeout 5000" "$1"; }

echo "== 0. Sintaxis"
MAL=0
for f in "$OPS"/*.sh; do bash -n "$f" || { echo "  FALLA bash -n $f"; MAL=1; }; done
check "bash -n de los scripts de ops" 0 "$MAL"
if command -v shellcheck > /dev/null; then
  shellcheck -x -S style "$OPS"/*.sh > "$TMP/shellcheck.txt" 2>&1
  check "shellcheck sin avisos (ni de estilo)" 0 "$?"
  [ -s "$TMP/shellcheck.txt" ] && head -n 30 "$TMP/shellcheck.txt"
else
  echo "  (no hay shellcheck: se salta)"
fi
command -v sqlite3 > /dev/null || { echo "Falta sqlite3 (apt install sqlite3)"; exit 1; }

echo
echo "== 1. Base y configuracion TEMPORALES"
mkdir -p "$TMP/etc/envivo" "$TMP/datos"
chown www-data:www-data "$TMP/datos"; chmod 750 "$TMP/datos"
DB="$TMP/datos/envivo.sqlite"
cat > "$TMP/etc/envivo/config.env" <<ENV
; SOLO PRUEBAS (probar_ops.sh)
ENVIVO_DB=$DB
ENVIVO_URL=http://juego.tukanec.com:$P_NG
ENVIVO_ZONA=America/Guayaquil
PLUX_AMBIENTE=sandbox
PLUX_CLAVE_SECRETA=secreto_de_prueba
ENV
chmod 755 "$TMP/etc" "$TMP/etc/envivo"; chmod 644 "$TMP/etc/envivo/config.env"
runuser -u www-data -- env ENVIVO_CONFIG="$TMP/etc/envivo/config.env" php "$RAIZ/server/bin/migrar.php"
check "Migraciones en la base temporal" 0 "$?"
T0=$(date +%s)
sqw "INSERT INTO jugadores (email, nombre, clave_hash, creado) VALUES ('a@prueba.example', 'Ana', 'x', $T0), ('b@prueba.example', 'Beto', 'x', $T0);
     INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES ('t1', 1, 'creditos_700', 4.99, 4.34, 0.65, 'pagado', $T0, $T0);"
check "Datos de prueba" "2" "$(sqw 'SELECT count(*) FROM jugadores;')"

echo
echo "== 1b. respaldo_envivo.sh"
RES="$TMP/respaldos"
R() { env OPS_CONF=/dev/null CONF_DIR="$TMP/etc/envivo" DESTINO="$RES" LOCK="$TMP/respaldo.lock" "$@"; }
SAL=$(R DRY_RUN=1 bash "$OPS/respaldo_envivo.sh" 2>&1); RC=$?
check "DRY_RUN=1: termina bien" 0 "$RC"
contiene "DRY_RUN=1: dice que no guardo nada" "PRUEBA TERMINADA" "$SAL"
check "DRY_RUN=1: no crea la carpeta de respaldos" "no" "$([ -e "$RES" ] && echo si || echo no)"
SAL=$(R bash "$OPS/respaldo_envivo.sh" 2>&1); RC=$?
check "Respaldo real: termina bien" 0 "$RC"
contiene "Lee la base de config.env (ENVIVO_DB) y la revisa" "jugadores: 2, compras pagadas: 1" "$SAL"
check "Carpeta de respaldos solo root (700)" "700 root" "$(stat -c '%a %U' "$RES")"
F1=$(find "$RES/diario" -name 'envivo-*.sqlite.gz' | head -n 1)
cp -p "$F1" "$TMP/respaldo_inicial.sqlite.gz"   # para restaurar al final (la rotacion de abajo puede borrar el original)
check "Copia diaria con permisos 600" "600" "$(stat -c '%a' "$F1" 2> /dev/null)"
check "Primera vez: tambien copia semanal" "1" "$(find "$RES/semanal" -name 'envivo-*.sqlite.gz' | wc -l)"
check "Copia de /etc/envivo (tar con config.env)" "envivo/config.env" "$(tar -tzf "$(find "$RES/config" -name '*.tar.gz' | head -n 1)" | grep config.env)"
gzip -dc "$F1" > "$TMP/restaurada.sqlite"
check "La copia se abre y esta sana" "ok 2" "$(sqlite3 "$TMP/restaurada.sqlite" 'PRAGMA integrity_check;') $(sqlite3 "$TMP/restaurada.sqlite" 'SELECT count(*) FROM jugadores;')"
check "ULTIMO_RESULTADO = OK" "OK" "$(cut -d' ' -f1 "$RES/ULTIMO_RESULTADO")"
check "La base sigue siendo de www-data (tambien -wal/-shm si quedaron)" "www-data" "$(stat -c '%U' "$DB" "$DB"-* 2> /dev/null | sort -u | tr '\n' ' ' | sed 's/ $//')"

# Copia mientras el juego escribe (otro proceso inserta sin parar)
sqw "CREATE TABLE IF NOT EXISTS prueba_carga (id INTEGER PRIMARY KEY, x TEXT);"
runuser -u www-data -- php -r '$p = new PDO("sqlite:" . $argv[1]); $p->exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000");
  $f = microtime(true) + 4; while (microtime(true) < $f) { $p->exec("BEGIN IMMEDIATE"); for ($i = 0; $i < 50; $i++) $p->exec("INSERT INTO prueba_carga (x) VALUES (hex(randomblob(200)))"); $p->exec("COMMIT"); }' "$DB" &
CARGA=$!
sleep 0.5
MAL=0
for i in 1 2 3; do
  R FECHA="20990101-00000$i" bash "$OPS/respaldo_envivo.sh" > "$TMP/carga_$i.log" 2>&1 || MAL=1
  gzip -dc "$RES/diario/envivo-20990101-00000$i.sqlite.gz" > "$TMP/c.sqlite" 2> /dev/null && [ "$(sqlite3 "$TMP/c.sqlite" 'PRAGMA integrity_check;')" = "ok" ] || MAL=1
done
wait "$CARGA"
check "3 respaldos mientras se escribe sin parar: todos sanos" 0 "$MAL"
echo "     (filas escritas durante la prueba: $(sqw 'SELECT count(*) FROM prueba_carga;'))"

# Rotacion: 12 diarias y 8 semanales viejas -> quedan 7 y 4 (las mas nuevas)
for i in $(seq -w 1 12); do echo x | gzip > "$RES/diario/envivo-202001${i}-010000.sqlite.gz"; done
for i in $(seq -w 1 8); do echo x | gzip > "$RES/semanal/envivo-202001${i}-010000.sqlite.gz"; done
for i in $(seq -w 1 9); do echo x | gzip > "$RES/config/envivo-config-202001${i}-010000.tar.gz"; done
SAL=$(R DRY_RUN=1 DIA_HOY=7 bash "$OPS/respaldo_envivo.sh" 2>&1)
check "DRY_RUN con rotacion: dice que borraria pero no borra" "si 12" "$(grep -q 'borraria' <<< "$SAL" && echo si) $(find "$RES/diario" -name '*2020*' | wc -l)"
R FECHA="20990102-000000" DIA_HOY=7 bash "$OPS/respaldo_envivo.sh" > /dev/null 2>&1
check "Rotacion: quedan 7 diarias" "7" "$(find "$RES/diario" -name 'envivo-*.sqlite.gz' | wc -l)"
check "Rotacion: quedan 4 semanales" "4" "$(find "$RES/semanal" -name 'envivo-*.sqlite.gz' | wc -l)"
check "Rotacion: quedan 7 de configuracion" "7" "$(find "$RES/config" -name 'envivo-config-*.tar.gz' | wc -l)"
check "Rotacion: la mas nueva se queda" "si" "$([ -f "$RES/diario/envivo-20990102-000000.sqlite.gz" ] && [ -f "$RES/semanal/envivo-20990102-000000.sqlite.gz" ] && echo si)"
check "Domingo: la semanal es la misma copia (enlace, no ocupa doble)" "2" "$(stat -c %h "$RES/diario/envivo-20990102-000000.sqlite.gz")"
SAL=$(R DIA_HOY=3 FECHA="20990103-000000" bash "$OPS/respaldo_envivo.sh" 2>&1)
contiene "Miercoles con semanal reciente: no hace otra semanal" "hoy no toca" "$SAL"

# Base danada
cp "$TMP/restaurada.sqlite" "$TMP/danada.sqlite"
python3 -c "import sys; f = open(sys.argv[1], 'r+b'); f.seek(4096); f.write(b'\xff' * 4096 * 6); f.close()" "$TMP/danada.sqlite"   # paginas 2 a 7 con basura
SAL=$(R DB="$TMP/danada.sqlite" FECHA="20990104-000000" bash "$OPS/respaldo_envivo.sh" 2>&1); RC=$?
check "Base danada: el respaldo falla (no guarda una copia mala)" "1 no" "$RC $([ -f "$RES/diario/envivo-20990104-000000.sqlite.gz" ] && echo si || echo no)"
check "Base danada: ULTIMO_RESULTADO = FALLA" "FALLA" "$(cut -d' ' -f1 "$RES/ULTIMO_RESULTADO")"
check "Base inexistente: falla con mensaje" "1" "$(R DB=/no/existe.sqlite bash "$OPS/respaldo_envivo.sh" > /dev/null 2>&1; echo $?)"
R bash "$OPS/respaldo_envivo.sh" > /dev/null 2>&1   # deja un OK para salud

# Restaurar
ANTES_J=$(sqw 'SELECT count(*) FROM jugadores;')
sqw "INSERT INTO jugadores (email, nombre, clave_hash, creado) VALUES ('c@prueba.example', 'Carla', 'x', $T0);"
check "Restaurar sin escribir SI: no cambia nada" "1 3" "$(R CONFIRMAR=no bash "$OPS/respaldo_envivo.sh" --restaurar "$TMP/respaldo_inicial.sqlite.gz" > /dev/null 2>&1; echo $?) $(sqw 'SELECT count(*) FROM jugadores;')"
check "Restaurar un respaldo danado: se niega" "1 3" "$(gzip -c "$TMP/danada.sqlite" > "$TMP/danada.sqlite.gz"; R CONFIRMAR=SI bash "$OPS/respaldo_envivo.sh" --restaurar "$TMP/danada.sqlite.gz" > /dev/null 2>&1; echo $?) $(sqw 'SELECT count(*) FROM jugadores;')"
SAL=$(R CONFIRMAR=SI bash "$OPS/respaldo_envivo.sh" --restaurar "$TMP/respaldo_inicial.sqlite.gz" 2>&1); RC=$?
check "Restaurar con SI: termina bien" 0 "$RC"
[ "$RC" = "0" ] || head -n 20 <<< "$SAL"
check "Restaurar: la base vuelve a como estaba en el respaldo" "$ANTES_J" "$(sqw 'SELECT count(*) FROM jugadores;')"
check "Restaurar: guarda antes una copia de la base actual" "1" "$(find "$RES" -maxdepth 1 -name 'antes-de-restaurar-*.sqlite.gz' | wc -l)"
check "Restaurar: la base sigue siendo de www-data y el juego puede escribir" "www-data ok" "$(stat -c %U "$DB") $(sqw "INSERT INTO jugadores (email, nombre, clave_hash, creado) VALUES ('d@prueba.example', 'Dani', 'x', $T0);" && echo ok)"
contiene "--listar muestra los respaldos" "== $RES/diario" "$(R bash "$OPS/respaldo_envivo.sh" --listar 2>&1)"

echo
echo "== 2. nginx de verdad: plantilla + nginx-endurecer.patch + zonas de limite"
FPM=$(command -v php-fpm8.3 || command -v php-fpm || true)
NGINX_OK=0
if command -v nginx > /dev/null && [ -n "$FPM" ]; then
  NGINX_OK=1
  NG="$TMP/nginx"; mkdir -p "$NG/logs" "$NG/tmp"
  APPN="$TMP/app"; mkdir -p "$APPN"
  (cd "$RAIZ" && tar --exclude=./node_modules --exclude=./tests/capturas --exclude=./.git -cf - .) | tar -xf - -C "$APPN"
  (cd "$APPN" && patch -s -p1 < "$OPS/nginx-endurecer.patch")
  check "El parche se aplica a la plantilla actual" 0 "$?"
  chmod -R a+rX "$APPN"
  cat > "$NG/fpm.conf" <<FPMC
[global]
pid = $TMP/fpm.pid
error_log = $NG/logs/fpm.log
daemonize = yes
[envivo]
user = www-data
group = www-data
listen = $NG/fpm.sock
listen.mode = 0666
pm = static
pm.max_children = 4
clear_env = no
env[ENVIVO_CONFIG] = $TMP/etc/envivo/config.env
php_admin_value[error_log] = $NG/logs/php.log
php_admin_flag[log_errors] = on
FPMC
  "$FPM" -y "$NG/fpm.conf" -R 2> "$NG/logs/fpm-arranque.log"
  conf_nginx() {   # $1 = archivo del sitio, $2 = nginx.conf a escribir, $3 = pid
    cat > "$2" <<NGC
worker_processes 1;
pid $3;
error_log $NG/logs/error.log;
events { worker_connections 64; }
http {
  include /etc/nginx/mime.types;
  access_log off;
  client_body_temp_path $NG/tmp; fastcgi_temp_path $NG/tmp; proxy_temp_path $NG/tmp; uwsgi_temp_path $NG/tmp; scgi_temp_path $NG/tmp;
  include $OPS/nginx-envivo-limites.conf;
  include $1;
}
NGC
  }
  # Plantilla de HOY (sin el parche) + zonas: debe seguir pasando (las zonas solas no cambian nada)
  DOMINIO=juego.tukanec.com APP="$APPN" SOCK="$NG/fpm.sock" LISTEN="127.0.0.1:$P_NG" bash "$RAIZ/server/deploy/nginx-sitio.sh" > "$NG/sitio_hoy.conf"
  conf_nginx "$NG/sitio_hoy.conf" "$NG/nginx_hoy.conf" "$NG/t1.pid"
  nginx -t -q -c "$NG/nginx_hoy.conf" -p "$NG" 2> "$NG/logs/t.log"
  check "nginx -t: plantilla actual + zonas de limite" 0 "$?"
  # Plantilla con el parche: prueba (LISTEN), HTTP y HTTPS (certificado de prueba)
  DOMINIO=juego.tukanec.com APP="$APPN" SOCK="$NG/fpm.sock" LISTEN="127.0.0.1:$P_NG" bash "$APPN/server/deploy/nginx-sitio.sh" > "$NG/sitio.conf"
  conf_nginx "$NG/sitio.conf" "$NG/nginx.conf" "$TMP/nginx.pid"
  nginx -t -q -c "$NG/nginx.conf" -p "$NG" 2>> "$NG/logs/t.log"
  check "nginx -t: plantilla endurecida (prueba)" 0 "$?"
  mkdir -p "$NG/cert"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=juego.tukanec.com" -keyout "$NG/cert/privkey.pem" -out "$NG/cert/fullchain.pem" > /dev/null 2>&1
  for modo in http https; do
    C=""; [ "$modo" = "https" ] && C="$NG/cert"
    DOMINIO=juego.tukanec.com APP="$APPN" SOCK="$NG/fpm.sock" CERT="${C:-/no/existe}" bash "$APPN/server/deploy/nginx-sitio.sh" > "$NG/prod_$modo.conf"
    conf_nginx "$NG/prod_$modo.conf" "$NG/nginx_$modo.conf" "$NG/t_$modo.pid"
    nginx -t -q -c "$NG/nginx_$modo.conf" -p "$NG" 2>> "$NG/logs/t.log"
    check "nginx -t: plantilla endurecida de produccion ($modo)" 0 "$?"
  done
  check "HTTPS: cada location con add_header propio repite el HSTS" "0" "$(grep -E '^[[:space:]]*location .*add_header' "$NG/prod_https.conf" | grep -vc 'Strict-Transport-Security')"
  check "Cada location con add_header propio repite las cabeceras de seguridad; existe la respuesta 429" "0 1" "$(grep -E '^[[:space:]]*location .*add_header' "$NG/sitio.conf" | grep -vc 'Permissions-Policy') $(grep -c 'location @envivo_429' "$NG/sitio.conf")"
  [ -s "$NG/logs/t.log" ] && sed 's/^/     /' "$NG/logs/t.log" | head -n 10
  nginx -c "$NG/nginx.conf" -p "$NG" 2>> "$NG/logs/t.log"
  B="http://juego.tukanec.com:$P_NG"
  RS=(--resolve "juego.tukanec.com:$P_NG:127.0.0.1")
  esperar "http://127.0.0.1:$P_NG/api/estado" || echo "  (nginx no arranco: $(tail -n 3 "$NG/logs/error.log"))"
  check "nginx endurecido: /api/estado 200" "200" "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' "$B/api/estado")"
  MAL=""
  for r in / /index.html /sw.js /js/api.js /icons/favicon-32.png /terminos.html /privacidad.html /api/estado /pago.php /admin.php /no-existe; do
    H=$(curl -s "${RS[@]}" -D - -o /dev/null "$B$r" | tr -d '\r')
    for c in "X-Content-Type-Options: nosniff" "Referrer-Policy: same-origin" "Permissions-Policy: camera=()" "X-Frame-Options: DENY"; do
      grep -qiF "$c" <<< "$H" || MAL="$MAL ${r}[${c%%:*}]"
    done
  done
  check "nosniff, Referrer-Policy, Permissions-Policy y X-Frame-Options en TODAS las rutas (juego, legales, API, PHP, 404)" "" "$MAL"
  MAL=""
  for r in / /index.html /sw.js /terminos.html /privacidad.html /pago.php; do
    curl -s "${RS[@]}" -D - -o /dev/null "$B$r" | tr -d '\r' | grep -qiF "Content-Security-Policy: default-src 'self'" || MAL="$MAL $r"
  done
  check "CSP en el juego, el service worker, las legales y la pagina de pago" "" "$MAL"
  H=$(curl -s "${RS[@]}" -D - -o /dev/null "$B/" | tr -d '\r')
  contiene "/ sigue con Cache-Control: no-cache" "Cache-Control: no-cache" "$H"
  contiene "/sw.js sigue con Cache-Control: no-cache" "Cache-Control: no-cache" "$(curl -s "${RS[@]}" -D - -o /dev/null "$B/sw.js" | tr -d '\r')"
  contiene "CSP del juego: frame-ancestors 'none'" "frame-ancestors 'none'" "$H"
  contiene "CSP de sw.js: connect-src deja bajar las fuentes de Google (modo sin internet)" "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com" "$(curl -s "${RS[@]}" -D - -o /dev/null "$B/sw.js" | tr -d '\r')"
  contiene "pago.php conserva su propia CSP de PHP (mas estricta)" "style-src 'self'; img-src" "$(curl -s "${RS[@]}" -D - -o /dev/null "$B/pago.php" | tr -d '\r')"
  check "Lista blanca intacta: el codigo del servidor sigue dando 404" "404 404" "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' "$B/server/src/Config.php") $(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' "$B/server/deploy/ops/salud_envivo.sh")"
  # Limites
  N429=0; NPHP=0
  for _ in $(seq 1 40); do
    c=$(curl -s "${RS[@]}" -o "$TMP/r.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Envivo: 1' -d '{"email":"x@prueba.example","clave":"malamala123"}' "$B/api/entrar")
    if [ "$c" = "429" ] && grep -q 'Espera un minuto' "$TMP/r.json"; then N429=$((N429+1)); elif [ "$c" = "429" ]; then NPHP=$((NPHP+1)); fi
  done
  entre "40 POST /api/entrar seguidos: nginx frena los que pasan de 1+15 (unos 24, con 429 en JSON)" 21 24 "$N429"
  check "La respuesta 429 es JSON valido con ok=false" "false" "$(php -r '$j = json_decode(file_get_contents($argv[1]), true); echo var_export($j["ok"] ?? null, true);' "$TMP/r.json")"
  contiene "La respuesta 429 trae Retry-After" "Retry-After: 60" "$(curl -s "${RS[@]}" -D - -o /dev/null -X POST -H 'X-Envivo: 1' -d '{}' "$B/api/entrar" | tr -d '\r')"
  check "Otra IP real (CF-Connecting-IP) no queda frenada" "no429" "$(c=$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' -H 'CF-Connecting-IP: 203.0.113.9' -X POST -H 'Content-Type: application/json' -H 'X-Envivo: 1' -d '{"email":"y@prueba.example","clave":"malamala123"}' "$B/api/entrar"); [ "$c" = "429" ] && echo "429" || echo no429)"
  MAL=0; for _ in $(seq 1 40); do [ "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' "$B/api/estado")" = "200" ] || MAL=1; done
  check "GET /api/estado (y otras rutas) NO se limitan: 40 seguidas dan 200" 0 "$MAL"
  MAL=0; for _ in $(seq 1 25); do [ "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' -H 'CF-Connecting-IP: 198.51.100.7' "$B/api/chat")" = "429" ] && MAL=1; done
  check "GET /api/chat (leer el chat cada 3 s) no se limita" 0 "$MAL"
  N=0; for _ in $(seq 1 30); do [ "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' -H 'CF-Connecting-IP: 198.51.100.8' -X POST -H 'X-Envivo: 1' -d '{}' "$B/api/chat")" = "429" ] && N=$((N+1)); done
  entre "POST /api/chat: frena despues de 1+15 (unos 14 de 30)" 11 14 "$N"
  N=0; for _ in $(seq 1 15); do [ "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' -H 'CF-Connecting-IP: 198.51.100.9' -X POST -H 'X-Envivo: 1' -d '{}' "$B/api/registro")" = "429" ] && N=$((N+1)); done
  entre "POST /api/registro: frena despues de 1+10 (unos 4 de 15)" 3 4 "$N"
  N=0; for _ in $(seq 1 15); do [ "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' -H 'CF-Connecting-IP: 198.51.100.10' -X POST -H 'X-Envivo: 1' -d '{}' "$B/api/plux/pago")" = "429" ] && N=$((N+1)); done
  entre "POST /api/plux/pago: frena despues de 1+10 (unos 4 de 15)" 2 4 "$N"
  entre "Los frenados quedan en el registro de errores (para salud_envivo.sh)" 1 999 "$(grep 'server: juego.tukanec.com' "$NG/logs/error.log" | grep -c 'limiting requests')"
  # Tamanos
  python3 -c "import json; print(json.dumps({'datos': json.dumps({'x': ['\"a\"'] * 50000})}))" > "$TMP/partida.json"
  check "POST /api/partida de $(( $(stat -c %s "$TMP/partida.json") / 1024 )) KB pasa nginx (llega a PHP: 401 sin sesion)" "401" "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'X-Envivo: 1' -H 'CF-Connecting-IP: 198.51.100.20' --data-binary @"$TMP/partida.json" "$B/api/partida")"
  head -c 1500000 /dev/zero | tr '\0' 'a' > "$TMP/grande.txt"
  check "POST /api/partida de 1.5 MB: nginx lo corta (413)" "413" "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'X-Envivo: 1' -H 'CF-Connecting-IP: 198.51.100.21' --data-binary @"$TMP/grande.txt" "$B/api/partida")"
  head -c 100000 /dev/zero | tr '\0' 'a' > "$TMP/medio.txt"
  check "POST de 100 KB a /pago.php: nginx lo corta (413, limite general 64 KB)" "413" "$(curl -s "${RS[@]}" -o /dev/null -w '%{http_code}' -X POST --data-binary @"$TMP/medio.txt" "$B/pago.php")"
  # CSP en un navegador de verdad
  NP="${NODE_PATH:-/opt/npm-tools/node_modules}"
  if NODE_PATH="$NP" node -e "require('playwright')" 2> /dev/null; then
    cat > "$TMP/csp.cjs" <<'JS'
const { chromium } = require('playwright');
(async () => {
  const [base, swbase] = process.argv.slice(2);
  const r = { violaciones: [], errores: [], paginas: 0 };
  const nav = await chromium.launch({ args: ['--host-resolver-rules=MAP juego.tukanec.com 127.0.0.1'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  for (const ruta of ['/', '/terminos.html', '/privacidad.html', '/pago.php?o=x']) {
    const p = await ctx.newPage();
    p.on('console', m => { const t = m.text(); if (/Content Security Policy|Refused to/i.test(t)) r.violaciones.push(ruta + ': ' + t); });
    p.on('pageerror', e => r.errores.push(ruta + ': ' + e));
    await p.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error('Refused to (CSP) ' + e.violatedDirective + ' ' + e.blockedURI)));
    await p.goto(base + ruta, { waitUntil: 'load' });
    await p.waitForTimeout(ruta === '/' ? 2500 : 500);
    if (ruta === '/') {   // tocar unos botones para que el juego arme pantallas (innerHTML con estilos)
      for (const b of (await p.$$('button:visible')).slice(0, 4)) { try { await b.click({ timeout: 800 }); await p.waitForTimeout(300); } catch (e) { /* ok */ } }
    }
    r.paginas++;
    await p.close();
  }
  // Service worker activo (localhost = contexto seguro): debe poder bajar el CSS de las fuentes de Google
  const ctx2 = await nav.newContext({ serviceWorkers: 'allow' });
  r.fuentes_sw = 0;
  await ctx2.route('https://fonts.googleapis.com/**', (route, req) => { if (req.serviceWorker()) r.fuentes_sw++;
    route.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: 'body{--prueba-fuente:1}' }); });
  await ctx2.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 404, body: '' }));
  const p2 = await ctx2.newPage();
  p2.on('console', m => { const t = m.text(); if (/Content Security Policy|Refused to|ERR_FAILED/i.test(t)) r.violaciones.push('sw: ' + t); });
  await p2.goto(swbase + '/', { waitUntil: 'load' });
  await p2.evaluate(async () => { await navigator.serviceWorker.ready; });
  await p2.waitForTimeout(500);
  await p2.reload({ waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  r.sw_controla = await p2.evaluate(() => !!navigator.serviceWorker.controller);
  r.fuente_css = await p2.evaluate(() => getComputedStyle(document.body).getPropertyValue('--prueba-fuente').trim());
  await nav.close();
  console.log(JSON.stringify(r));
})().catch(e => { console.log(JSON.stringify({ fallo: String(e) })); });
JS
    SAL=$(NODE_PATH="$NP" node "$TMP/csp.cjs" "$B" "http://localhost:$P_NG" 2>&1 | tail -n 1)
    echo "     $SAL" | head -c 600; echo
    check "Chromium: el juego, las legales, pago.php y el modo sin internet SIN violaciones de CSP" "4 0" "$(php -r '$j = json_decode($argv[1], true); echo ($j["paginas"] ?? "x") . " " . count($j["violaciones"] ?? [1]);' "$SAL")"
    echo "     (informativo) errores de JavaScript del juego en esta copia: $(php -r '$j = json_decode($argv[1], true); echo count($j["errores"] ?? []);' "$SAL") — no son de CSP; la prueba del juego es server/tests/correr.sh"
    check "Chromium: con el service worker activo, las fuentes de Google cargan (segunda visita)" "true 1" "$(php -r '$j = json_decode($argv[1], true); echo var_export($j["sw_controla"] ?? null, true) . " " . ($j["fuente_css"] ?? "");' "$SAL")"
  else
    echo "  (no hay Playwright: se salta la prueba de CSP en el navegador)"
  fi
else
  echo "  (no hay nginx o php-fpm en esta maquina: se salta)"
fi

echo
echo "== 3. salud_envivo.sh (contra el nginx de arriba y un Telegram FALSO)"
mkdir -p "$TMP/tg"
cat > "$TMP/tg/router.php" <<'PHP'
<?php
// Telegram FALSO: guarda cada mensaje en una linea JSON
file_put_contents(getenv('TG_LOG'), json_encode(['ruta' => $_SERVER['REQUEST_URI'], 'chat' => $_POST['chat_id'] ?? '', 'texto' => $_POST['text'] ?? '']) . "\n", FILE_APPEND);
header('Content-Type: application/json'); echo '{"ok":true}';
PHP
TG_LOG="$TMP/tg/mensajes.log"; touch "$TG_LOG"
TG_LOG="$TG_LOG" php -S "127.0.0.1:$P_TG" "$TMP/tg/router.php" > "$TMP/tg/server.log" 2>&1 & PIDS+=($!)
esperar "http://127.0.0.1:$P_TG/" || echo "  (no arranco el Telegram falso)"
TOKEN_PRUEBA="123456789:AAprueba_prueba_prueba_prueba_xyz"
ED="$TMP/estado"
S() {
  env OPS_CONF=/dev/null CONF_DIR="$TMP/etc/envivo" ESQUEMA=http PUERTO="$P_NG" FPM_SOCK="$NG/fpm.sock" SIN_SYSTEMCTL=1 \
    NGINX_ERROR_LOG="$NG/logs/error.log" RESPALDOS="$RES" ESTADO_DIR="$ED" LIMITADOS_MAX=100000 \
    TELEGRAM_TOKEN="$TOKEN_PRUEBA" TELEGRAM_CHAT_ID=4242 TELEGRAM_API="http://127.0.0.1:$P_TG" TELEGRAM_HELPER=/no/existe "$@" bash "$OPS/salud_envivo.sh"
}
msgs() { grep -c sendMessage "$TG_LOG"; }
ultimo() { tail -n 1 "$TG_LOG" | php -r '$j = json_decode(stream_get_contents(STDIN), true); echo $j["texto"] ?? "";'; }
if [ "$NGINX_OK" = "1" ]; then
  sleep 1   # que pase el limite de la prueba de arriba
  SAL=$(S 2>&1); RC=$?
  check "Todo bien: sale 0 y no manda nada" "0 0" "$RC $(msgs)"
  contiene "Todo bien: deja una linea OK en el registro" "OK: todo bien" "$SAL"
  check "Primera vez: guarda el ultimo aviso visto (no avisa los viejos)" "si" "$([ -f "$ED/ultimo_aviso_id" ] && echo si)"

  # Pagos fallidos
  T=$(date +%s)
  for i in 1 2 3 4 5 6; do sqw "INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, plux_paso, creado) VALUES ('f$i', 1, 'creditos_700', 4.99, 4.34, 0.65, $( [ $i -le 3 ] && echo "'rechazado', 'rechazado'" || echo "'pendiente', 'fallido'"), $T);"; done
  S > /dev/null 2>&1; RC=$?
  check "6 pagos fallidos y 1 aprobado en 1 hora: sale 1 y manda 1 mensaje" "1 1" "$RC $(msgs)"
  contiene "El mensaje dice que hay muchos pagos fallidos" "6 fallidos/rechazados y 1 aprobados" "$(ultimo)"
  check "El mensaje va al chat configurado y con el token por la entrada del curl" "4242 /bot$TOKEN_PRUEBA/sendMessage" "$(tail -n 1 "$TG_LOG" | php -r '$j = json_decode(stream_get_contents(STDIN), true); echo $j["chat"] . " " . $j["ruta"];')"
  S > /dev/null 2>&1
  check "Anti-spam: la hora siguiente NO repite el mismo aviso" "1" "$(msgs)"
  touch -d '-3 hours -1 minute' "$ED/alerta_pagos"; S > /dev/null 2>&1
  check "Anti-spam: pasadas 3 horas lo repite (1 vez)" "2" "$(msgs)"
  for i in $(seq 1 6); do sqw "INSERT INTO compras (token, jugador_id, producto, total, subtotal, iva, estado, creado, pagado_en) VALUES ('ok$i', 1, 'creditos_700', 4.99, 4.34, 0.65, 'pagado', $T, $T);"; done
  S > /dev/null 2>&1; RC=$?
  check "Con mas aprobados que fallidos: sale 0" "0" "$RC"
  contiene "Y manda UNA vez 'Ya se arreglo'" "Ya se arreglo" "$(ultimo)"
  S > /dev/null 2>&1
  check "'Ya se arreglo' no se repite" "3" "$(msgs)"
  sqw "DELETE FROM compras WHERE token LIKE 'f%' OR token LIKE 'ok%';"

  # Avisos del juego, soporte, reportes
  sqw "INSERT INTO avisos (tipo, detalle, compra_id, creado) VALUES ('plux_sin_relacionar', 'prueba', NULL, $T), ('plux_sin_relacionar', 'prueba 2', NULL, $T);"
  S > /dev/null 2>&1
  contiene "Avisos nuevos del juego: los nombra" "2 aviso(s) nuevo(s) del juego para revisar en /admin.php: plux_sin_relacionar (2)" "$(ultimo)"
  N=$(msgs); S > /dev/null 2>&1
  check "Los mismos avisos no se repiten" "$N" "$(msgs)"
  sqw "INSERT INTO avisos (tipo, detalle, compra_id, creado) VALUES ('plux_aviso_monto', 'otro', 5, $T);"
  S > /dev/null 2>&1
  contiene "Un aviso nuevo despues: avisa solo ese" "1 aviso(s) nuevo(s) del juego para revisar en /admin.php: plux_aviso_monto (1)" "$(ultimo)"
  if sqw "SELECT 1 FROM sqlite_master WHERE name = 'soporte_casos';" | grep -q 1; then
    sqw "INSERT INTO soporte_casos (jugador_id, categoria, asunto, estado, creado, actualizado) VALUES (1, 'pago', 'No me llego', 'abierto', $(( T - 30 * 3600 )), $(( T - 30 * 3600 )));"
    S > /dev/null 2>&1
    contiene "Soporte abierto hace mas de 24 h: avisa" "1 caso(s) de soporte abiertos sin respuesta" "$(ultimo)"
    N=$(msgs); S AHORA=$(( $(date +%s) + 4 * 3600 )) > /dev/null 2>&1
    check "Soporte pendiente: recuerda cada 12 h (no cada 3 h)" "$N" "$(msgs)"
    sqw "UPDATE soporte_casos SET estado = 'respondido';"
    S > /dev/null 2>&1
  else
    echo "  (la base no tiene soporte_casos: se salta)"
  fi

  # Errores de nginx de este sitio
  AHORA_LOG=$(date '+%Y/%m/%d %H:%M:%S')
  for i in $(seq 1 31); do echo "$AHORA_LOG [error] 1#1: *$i FastCGI sent in stderr: \"PHP message: prueba\" while reading response header from upstream, client: 1.2.3.4, server: juego.tukanec.com, request: \"GET /api/estado HTTP/1.1\"" >> "$NG/logs/error.log"; done
  for i in $(seq 1 50); do echo "$AHORA_LOG [error] 1#1: *$i otro sitio, client: 1.2.3.4, server: erp.tupassec.com, request: \"GET / HTTP/1.1\"" >> "$NG/logs/error.log"; done
  echo "2001/01/01 00:00:00 [error] 1#1: viejo, client: 1.2.3.4, server: juego.tukanec.com, request: \"GET /\"" >> "$NG/logs/error.log"
  SAL=$(S ERRORES_MAX=50 2>&1)
  check "50 errores del ERP y uno viejo NO cuentan como errores del juego" "no" "$(grep -q 'errores de nginx' <<< "$SAL" && echo si || echo no)"
  S > /dev/null 2>&1
  contiene "Mas de 30 errores del juego en 1 hora: avisa" "errores de nginx/PHP del juego en la ultima hora" "$(ultimo)"
  S LIMITADOS_MAX=10 ERRORES_MAX=1000 > /dev/null 2>&1
  contiene "Muchas peticiones frenadas por el limite: avisa posible ataque" "peticiones frenadas por el limite" "$(ultimo)"

  # Disco, base, respaldo, PHP y API caidos
  S DISCO_MIN_LIBRE=101 ERRORES_MAX=1000 > /dev/null 2>&1
  contiene "Disco con menos libre que el minimo: avisa" "Disco casi lleno" "$(ultimo)"
  echo "$(( $(date +%s) - 90000 )) 0" > "$ED/tamano_db.txt"
  S CRECE_MAX_MB=0 ERRORES_MAX=1000 > /dev/null 2>&1
  contiene "La base crecio de golpe en 24 h: avisa" "La base crecio" "$(ultimo)"
  S DB_MAX_MB=0 ERRORES_MAX=1000 > /dev/null 2>&1
  contiene "La base pasa del tamano maximo: avisa" "La base pesa" "$(ultimo)"
  cp "$RES/ULTIMO_RESULTADO" "$TMP/ur.bak"
  echo "FALLA $(date +%s) la copia NO paso la revision" > "$RES/ULTIMO_RESULTADO"
  S ERRORES_MAX=1000 > /dev/null 2>&1
  contiene "El respaldo de anoche fallo: avisa con el motivo" "El ultimo respaldo del juego FALLO: la copia NO paso la revision" "$(ultimo)"
  echo "OK $(( $(date +%s) - 30 * 3600 )) x" > "$RES/ULTIMO_RESULTADO"
  touch -d '-3 hours -1 minute' "$ED/alerta_respaldo"; S ERRORES_MAX=1000 > /dev/null 2>&1
  contiene "Respaldo de hace mas de 26 h: avisa" "El ultimo respaldo del juego es de hace" "$(ultimo)"
  cp "$TMP/ur.bak" "$RES/ULTIMO_RESULTADO"
  S ERRORES_MAX=1000 FPM_SOCK=/no/existe.sock > /dev/null 2>&1
  contiene "PHP-FPM caido (no hay socket): avisa" "No existe el socket de PHP" "$(ultimo)"
  S ERRORES_MAX=1000 PUERTO=1 > /dev/null 2>&1
  contiene "nginx no contesta: avisa que el juego NO responde" "El juego NO responde" "$(ultimo)"
  S ERRORES_MAX=1000 LENTO_SEG=0 > /dev/null 2>&1
  contiene "Respuesta lenta: avisa" "El juego esta LENTO" "$(ultimo)"

  # DRY_RUN, token leido del ayudante, modo helper, Telegram caido
  N=$(msgs)
  SAL=$(S DRY_RUN=1 ESTADO_DIR="$TMP/estado_dry" DISCO_MIN_LIBRE=101 2>&1)
  check "DRY_RUN=1: no manda nada a Telegram" "$N" "$(msgs)"
  contiene "DRY_RUN=1: muestra lo que mandaria" "[PRUEBA: no se manda a Telegram]" "$SAL"
  cat > "$TMP/alerta-telegram.sh" <<'AYU'
#!/bin/bash
# ayudante de ejemplo, parecido al del dueno
TOKEN="987654321:AAayudante_ayudante_ayudante_ayud"
CHAT_ID="-100777"
curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" -d chat_id="$CHAT_ID" -d text="$1" > /dev/null
AYU
  chmod 700 "$TMP/alerta-telegram.sh"
  rm -rf "$TMP/estado_h"
  S TELEGRAM_TOKEN= TELEGRAM_CHAT_ID= TELEGRAM_HELPER="$TMP/alerta-telegram.sh" ESTADO_DIR="$TMP/estado_h" DISCO_MIN_LIBRE=101 > /dev/null 2>&1
  check "auto: lee token y chat de alerta-telegram.sh SIN ejecutarlo" "-100777 /bot987654321:AAayudante_ayudante_ayudante_ayud/sendMessage" "$(tail -n 1 "$TG_LOG" | php -r '$j = json_decode(stream_get_contents(STDIN), true); echo $j["chat"] . " " . $j["ruta"];')"
  check "--modo-telegram lo dice" "directo (token leido de $TMP/alerta-telegram.sh)" "$(env OPS_CONF=/dev/null TELEGRAM_HELPER="$TMP/alerta-telegram.sh" bash "$OPS/salud_envivo.sh" --modo-telegram)"
  printf '#!/bin/bash\necho "$1" >> %s/helper_recibio.txt\n' "$TMP" > "$TMP/helper2.sh"; chmod 700 "$TMP/helper2.sh"
  rm -rf "$TMP/estado_h2"
  S TELEGRAM_TOKEN= TELEGRAM_CHAT_ID= TELEGRAM_HELPER="$TMP/helper2.sh" ESTADO_DIR="$TMP/estado_h2" DISCO_MIN_LIBRE=101 > /dev/null 2>&1
  contiene "Ayudante sin token adentro: lo llama con el mensaje (modo helper)" "Disco casi lleno" "$(cat "$TMP/helper_recibio.txt" 2> /dev/null)"
  rm -rf "$TMP/estado_c"
  SAL=$(S TELEGRAM_API="http://127.0.0.1:1" ESTADO_DIR="$TMP/estado_c" DISCO_MIN_LIBRE=101 2>&1)
  contiene "Telegram caido: lo dice en el registro" "ERROR: Telegram respondio" "$SAL"
  N=$(msgs); S ESTADO_DIR="$TMP/estado_c" DISCO_MIN_LIBRE=101 > /dev/null 2>&1
  check "Telegram caido: no se marca como avisado (la hora siguiente lo manda)" "$(( N + 1 ))" "$(msgs)"
  N=$(msgs); env OPS_CONF=/dev/null TELEGRAM_TOKEN="$TOKEN_PRUEBA" TELEGRAM_CHAT_ID=4242 TELEGRAM_API="http://127.0.0.1:$P_TG" bash "$OPS/salud_envivo.sh" --probar-telegram > /dev/null 2>&1
  check "--probar-telegram manda un mensaje" "$(( N + 1 ))" "$(msgs)"
  contiene "El mensaje de prueba se entiende" "Prueba de alertas de EN VIVO Tycoon" "$(ultimo)"
  check "Sin Telegram configurado: --modo-telegram dice ninguno" "ninguno" "$(env OPS_CONF=/dev/null TELEGRAM_HELPER=/no/existe bash "$OPS/salud_envivo.sh" --modo-telegram)"
  # ops.env se lee sin ejecutarlo
  printf 'LENTO_SEG=0\nTOUCH=$(touch %s/ejecutado)\n; comentario\n' "$TMP" > "$TMP/ops.env"
  SAL=$(S OPS_CONF="$TMP/ops.env" DRY_RUN=1 ESTADO_DIR="$TMP/estado_o" 2>&1)
  check "ops.env: se leen los valores pero no se ejecuta nada de adentro" "LENTO no" "$(grep -q 'LENTO' <<< "$SAL" && echo LENTO) $([ -f "$TMP/ejecutado" ] && echo si || echo no)"
fi

echo
echo "== 4. instalar_ops.sh"
if [ "${SIN_INSTALAR:-0}" = "1" ]; then
  echo "  (SIN_INSTALAR=1: se salta)"
else
  CRON_ANTES="$(crontab -u root -l 2> /dev/null || true)"
  # Un cron "del dueno" que NO se debe tocar
  printf '0 2 * * * /usr/local/bin/backup_restic_erp_qf.sh\n0 * * * * /usr/local/bin/chequeo-salud-servidor.sh\n' | crontab -u root -
  I() { env CONF_DIR="$TMP/etc/envivo" RESPALDOS="$RES" ESTADO_DIR="$TMP/estado_inst" LOGROTATE="$TMP/logrotate-envivo" NGINX_CONF_D="$TMP/conf.d" TELEGRAM_HELPER=/no/existe "$@"; }
  mkdir -p "$TMP/conf.d"
  SAL=$(I DRY_RUN=1 bash "$OPS/instalar_ops.sh" 2>&1); RC=$?
  check "DRY_RUN=1: termina bien" 0 "$RC"
  check "DRY_RUN=1: no cambia el cron ni crea ops.env ni copia scripts" "2 no" "$(crontab -u root -l | wc -l) $([ -f "$TMP/etc/envivo/ops.env" ] && echo si || echo no)"
  BIN_ANTES=$( [ -f /usr/local/bin/salud_envivo.sh ] && echo si || echo no)
  SAL=$(I bash "$OPS/instalar_ops.sh" 2>&1); RC=$?
  echo "$SAL" | sed -n '/RESULTADO/,$p' | sed 's/^/     /'
  check "Instalar: termina bien" 0 "$RC"
  check "Scripts en /usr/local/bin (root, 750)" "750 root 750 root" "$(stat -c '%a %U' /usr/local/bin/respaldo_envivo.sh /usr/local/bin/salud_envivo.sh | tr '\n' ' ' | sed 's/ $//')"
  check "ops.env creado solo root (600)" "600 root" "$(stat -c '%a %U' "$TMP/etc/envivo/ops.env")"
  check "Cron: las 2 lineas del dueno siguen y se agregan 2 del juego" "4 1 1 1 1" "$(crontab -u root -l | wc -l) $(crontab -u root -l | grep -c backup_restic_erp_qf) $(crontab -u root -l | grep -c chequeo-salud-servidor) $(crontab -u root -l | grep -c respaldo_envivo) $(crontab -u root -l | grep -c salud_envivo)"
  check "Copia del cron anterior guardada" "1" "$(find "$RES" -maxdepth 1 -name 'crontab-root-antes-*' | wc -l)"
  check "logrotate: configuracion instalada y valida (logrotate -d)" "0" "$(logrotate -d "$TMP/logrotate-envivo" > /dev/null 2>&1; echo $?)"
  contiene "Hizo el primer respaldo" "respaldo: OK" "$SAL"
  if [ -f "$TMP/conf.d/envivo-limites.conf" ]; then echo "  OK    (zonas de nginx en $TMP/conf.d)"; OK=$((OK+1))
  else contiene "nginx: explica por que no instalo las zonas (este nginx.conf no incluye la carpeta de prueba)" "no incluye" "$SAL"; fi
  echo "local" >> "$TMP/etc/envivo/ops.env"
  SAL=$(I bash "$OPS/instalar_ops.sh" 2>&1); RC=$?
  check "Segunda vez: termina bien y NO duplica el cron" "0 4" "$RC $(crontab -u root -l | wc -l)"
  contiene "Segunda vez: ops.env se conserva" "ya existia: se conserva" "$SAL"
  check "Segunda vez: no toco ops.env" "local" "$(tail -n 1 "$TMP/etc/envivo/ops.env")"
  SAL=$(I bash "$OPS/instalar_ops.sh" --desinstalar 2>&1)
  check "Desinstalar: quita solo las lineas del juego del cron" "2 0" "$(crontab -u root -l | wc -l) $(crontab -u root -l | grep -c envivo)"
  check "Desinstalar: quita los scripts, deja los respaldos" "no si" "$([ -f /usr/local/bin/salud_envivo.sh ] && echo si || echo no) $([ -d "$RES/diario" ] && echo si)"
  # Dejar el cron y /usr/local/bin como estaban antes de la prueba
  if [ -n "$CRON_ANTES" ]; then printf '%s\n' "$CRON_ANTES" | crontab -u root -; else crontab -u root -r 2> /dev/null; fi
  [ "$BIN_ANTES" = "si" ] && echo "  (ojo: habia un salud_envivo.sh antes en /usr/local/bin y la prueba lo quito)"
  # instalar_ops.sh de verdad contra el nginx de esta maquina (si tiene /etc/nginx/conf.d incluido)
  if command -v nginx > /dev/null && nginx -t > /dev/null 2>&1 && [ ! -f /etc/nginx/conf.d/envivo-limites.conf ]; then
    SAL=$(env CONF_DIR="$TMP/etc/envivo" RESPALDOS="$RES" ESTADO_DIR="$TMP/estado_inst" LOGROTATE="$TMP/logrotate-envivo" TELEGRAM_HELPER=/no/existe bash "$OPS/instalar_ops.sh" 2>&1)
    contiene "nginx del sistema: instala las zonas y pasa nginx -t" "listo (nginx -t correcto" "$SAL"
    check "nginx del sistema: nginx -t sigue bien con las zonas" 0 "$(nginx -t > /dev/null 2>&1; echo $?)"
    env CONF_DIR="$TMP/etc/envivo" RESPALDOS="$RES" LOGROTATE="$TMP/logrotate-envivo" bash "$OPS/instalar_ops.sh" --desinstalar > /dev/null 2>&1
    check "Desinstalar: quita las zonas del nginx del sistema y nginx -t sigue bien" "no 0" "$([ -f /etc/nginx/conf.d/envivo-limites.conf ] && echo si || echo no) $(nginx -t > /dev/null 2>&1; echo $?)"
    if [ -n "$CRON_ANTES" ]; then printf '%s\n' "$CRON_ANTES" | crontab -u root -; else crontab -u root -r 2> /dev/null; fi
  fi
fi

echo
echo "== 5. Cambio del script de restic (los comandos EXACTOS de docs/OPERACION.md, paso 3) en 5 formas de escribirlo"
RX="$TMP/restic"; mkdir -p "$RX"
cat > "$RX/v1.sh" <<'V'
#!/bin/bash
# respalda /etc/erp_qf y mas
mkdir -p /etc/erp_qf/tmp
restic -r sftp:respaldo.qfradioec.com:/erp_qf --password-file /etc/restic/password_erp_qf backup /var/www /etc/erp_qf /etc/nginx /usr/local/bin /etc/systemd/system /etc/letsencrypt /var/backups/erp_dumps
V
cat > "$RX/v2.sh" <<'V'
#!/bin/bash
restic backup \
  /var/www \
  /etc/erp_qf \
  /etc/nginx
V
cat > "$RX/v3.sh" <<'V'
#!/bin/bash
RUTAS=(
  "/var/www"
  "/etc/erp_qf"
  "/etc/nginx"
)
restic backup "${RUTAS[@]}"
V
cat > "$RX/v4.sh" <<'V'
#!/bin/bash
RUTAS="/var/www /etc/nginx /etc/erp_qf"
restic backup $RUTAS
V
cat > "$RX/v5.sh" <<'V'
#!/bin/bash
restic backup "/var/www" "/etc/erp_qf" "/etc/nginx" --exclude-caches
V
MAL=""
for v in v1 v2 v3 v4 v5; do
  F="$RX/$v.sh"
  # --- comandos de docs/OPERACION.md (paso 3B), con F apuntando a la copia de prueba ---
  cp -p "$F" "$F.antes-envivo"
  n=$(grep -vE '^[[:space:]]*#' "$F" | grep -cE '("?)/etc/erp_qf\1([[:space:]\\)"]|$)')
  [ "$n" = "1" ] || { MAL="$MAL $v(lineas=$n)"; continue; }
  sed -i -E '/^[[:space:]]*#/! s#("?)/etc/erp_qf\1([[:space:]\\)"]|$)#\1/etc/erp_qf\1 \1/etc/envivo\1 \1/var/backups/envivo\1\2#' "$F"
  bash -n "$F" || MAL="$MAL $v(sintaxis)"
  # --- fin ---
  # Lo que restic recibiria: se cambia "restic" por un eco de los argumentos
  ARGS=$(sed 's#^\([[:space:]]*\)restic #\1printf "%s\\n" #; s#^mkdir .*##' "$F" | bash 2> /dev/null | tr '\n' ' ')
  for r in /etc/erp_qf /etc/envivo /var/backups/envivo /var/www; do grep -qE "(^| )$r( |$)" <<< "$ARGS" || MAL="$MAL $v(falta $r)"; done
  [ "$(diff "$F.antes-envivo" "$F" | grep -c '^>')" = "1" ] || MAL="$MAL $v(cambio mas de 1 linea)"
done
check "El sed agrega /etc/envivo y /var/backups/envivo en las 5 formas, cambia 1 sola linea y no toca comentarios ni /etc/erp_qf/tmp" "" "$MAL"
check "Comentario y mkdir /etc/erp_qf/tmp siguen igual (v1)" "2" "$(grep -c -e '^# respalda /etc/erp_qf y mas$' -e '^mkdir -p /etc/erp_qf/tmp$' "$RX/v1.sh")"

echo
echo "================ $OK OK, $FALLAS FALLAS ================"
[ "$FALLAS" = "0" ]
