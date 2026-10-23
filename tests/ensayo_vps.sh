#!/usr/bin/env bash
# =====================================================================
#  ENSAYO del despliegue en el VPS, como lo hara el dueno con docs/PASOS_DEMO_VPS.md, en un contenedor DESECHABLE.
#  Usa las rutas reales (/etc/envivo, /var/www/envivo, /var/lib/envivo, /etc/nginx, cron de www-data y de root),
#  nginx y php8.3-fpm de verdad, y en lugar de lo que no hay aqui:
#    - "GitHub": un repo bare local con el arbol de trabajo ACTUAL de este repo (commit en una copia, nunca en el repo)
#    - systemctl y certbot FALSOS en /usr/local/sbin (certbot crea un certificado propio firmado por una CA de prueba)
#    - juego.tukanec.com -> 127.0.0.1 en /etc/hosts; curl confia en la CA de prueba (CURL_CA_BUNDLE)
#    - Plux falso (server/tests/plux_falso.php) y Telegram falso
#  Pasos: instalar (con teclado: usuario, clave y "s" al certificado) -> RESULTADO -> claves de Plux -> 2FA ->
#  navegador (Centro de Control con codigo, jugador en celular) -> demo_datos -> comprobaciones del paso 8 ->
#  actualizar.sh dos veces -> instalar_ops.sh + Telegram falso. Al final lo deja todo como estaba.
#  Uso (root, en un contenedor desechable):   bash tests/ensayo_vps.sh       (capturas en tests/capturas/ensayo_*.png)
#  ENSAYO_DEJAR=1 no limpia al final (para mirar a mano; luego: bash tests/ensayo_vps.sh --limpiar)
# =====================================================================
set -u
R="$(cd "$(dirname "$0")/.." && pwd)"
D=juego.tukanec.com
APP=/var/www/envivo
C=/etc/envivo/config.env
NODE22="${NODE22:-/opt/node22/bin/node}"
export NODE_PATH="${NODE_PATH:-/opt/npm-tools/node_modules}"
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo como root (contenedor desechable)"; exit 1; }
S="${ENSAYO_DIR:-/var/tmp/envivo-ensayo}"

limpiar() {
  echo "== Limpieza"
  for f in "$S"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2> /dev/null; done
  pkill -f 'envivo/server/validador/servidor.js' 2> /dev/null
  nginx -s quit 2> /dev/null; [ -f /run/php/php8.3-fpm.pid ] && kill "$(cat /run/php/php8.3-fpm.pid)" 2> /dev/null
  sleep 0.5
  crontab -u www-data -r 2> /dev/null
  [ -f "$S/cron_root.antes" ] && crontab -u root "$S/cron_root.antes" 2> /dev/null || crontab -u root -r 2> /dev/null
  rm -rf /etc/envivo /var/lib/envivo /var/lib/envivo-ops /var/backups/envivo /var/www/envivo /etc/letsencrypt \
         "/etc/nginx/sites-available/$D" "/etc/nginx/sites-enabled/$D" /etc/nginx/conf.d/envivo-limites.conf \
         /etc/systemd/system/envivo-validador.service /etc/logrotate.d/envivo /run/systemd/system \
         /usr/local/sbin/systemctl /usr/local/sbin/certbot /usr/local/bin/respaldo_envivo.sh /usr/local/bin/salud_envivo.sh \
         /usr/local/bin/alerta-telegram.sh /usr/bin/node /tmp/instalar_envivo.sh /tmp/envivo-salud-prueba /tmp/envivo-nginx-t.log
  rm -f /var/log/envivo-*.log
  [ -f "$S/hosts.antes" ] && cat "$S/hosts.antes" > /etc/hosts
  [ -f "$S/ca-sistema.antes" ] && cat "$S/ca-sistema.antes" > /etc/ssl/certs/ca-certificates.crt
  git config --global --unset-all safe.directory "^$APP\$" 2> /dev/null
  rm -rf "$S"
}
[ "${1:-}" = "--limpiar" ] && { limpiar; exit 0; }
[ -e "$APP" ] || [ -e /etc/envivo ] && { echo "ERROR: ya hay una instalacion ($APP o /etc/envivo). Corre:  bash $0 --limpiar"; exit 1; }
rm -rf "$S"; mkdir -p "$S"; chmod 755 "$S"
[ "${ENSAYO_DEJAR:-0}" = "1" ] || trap limpiar EXIT
OK=0; FALLAS=0; LISTA_FALLAS=""
check() { if [ "$2" == "$3" ]; then OK=$((OK+1)); echo "  OK    $1"; else FALLAS=$((FALLAS+1)); LISTA_FALLAS="$LISTA_FALLAS\n  - $1"; echo "  FALLA $1 — esperado [$2], salio [$3]"; fi; }
G() { git -c user.email=ensayo@prueba -c user.name=ensayo "$@"; }
mkdir -p "$R/tests/capturas"

echo "== 0. Preparar el ensayo: GitHub local, systemctl y certbot falsos, DNS, CA de prueba"
git clone -q "$R" "$S/trabajo"
(cd "$R" && git ls-files -m -o --exclude-standard -z) | (cd "$R" && xargs -0 -r -I{} cp --parents {} "$S/trabajo/")
(cd "$R" && git ls-files -d -z) | (cd "$S/trabajo" && xargs -0 -r rm -f)
G -C "$S/trabajo" checkout -q -B main && G -C "$S/trabajo" add -A && G -C "$S/trabajo" commit -qm "arbol de trabajo para el ensayo" --allow-empty
git clone -q --bare "$S/trabajo" "$S/github.git"
G -C "$S/trabajo" remote set-url origin "$S/github.git"
cp /etc/hosts "$S/hosts.antes"; echo "127.0.0.1 $D" >> /etc/hosts
crontab -u root -l > "$S/cron_root.antes" 2> /dev/null || rm -f "$S/cron_root.antes"
[ -x /usr/bin/node ] || ln -s "$NODE22" /usr/bin/node        # en el VPS lo pone NodeSource
mkdir -p /run/systemd/system "$S/ca"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=Ensayo CA" -keyout "$S/ca/ca.key" -out "$S/ca/ca.pem" 2> /dev/null
cat /etc/ssl/certs/ca-certificates.crt "$S/ca/ca.pem" > "$S/ca/bundle.pem"
# El sistema confia en la CA de prueba (como en el VPS confia en Let's Encrypt): lo usan salud_envivo.sh y los curl con sudo
cp -p /etc/ssl/certs/ca-certificates.crt "$S/ca-sistema.antes"; cat "$S/ca/ca.pem" >> /etc/ssl/certs/ca-certificates.crt
export CURL_CA_BUNDLE="$S/ca/bundle.pem" no_proxy="127.0.0.1,localhost,$D" NO_PROXY="127.0.0.1,localhost,$D"
cat > /usr/local/sbin/certbot <<EOF
#!/usr/bin/env bash
# certbot FALSO del ensayo: "certbot --nginx -d DOMINIO" -> certificado firmado por la CA de prueba
echo "certbot \$*" >> $S/certbot.log
d=""; while [ \$# -gt 0 ]; do [ "\$1" = "-d" ] && d="\$2"; shift; done
mkdir -p /etc/letsencrypt/live/\$d
openssl req -newkey rsa:2048 -nodes -subj "/CN=\$d" -keyout /etc/letsencrypt/live/\$d/privkey.pem -out $S/ca/sitio.csr 2> /dev/null
printf 'subjectAltName=DNS:%s\n' "\$d" > $S/ca/ext
openssl x509 -req -in $S/ca/sitio.csr -CA $S/ca/ca.pem -CAkey $S/ca/ca.key -CAcreateserial -days 30 -extfile $S/ca/ext -out /etc/letsencrypt/live/\$d/fullchain.pem 2> /dev/null
echo "Successfully deployed certificate for \$d (FALSO)"
EOF
cat > /usr/local/sbin/systemctl <<EOF
#!/usr/bin/env bash
# systemctl FALSO del ensayo: nginx, php8.3-fpm y envivo-validador de verdad, arrancados a mano
echo "systemctl \$*" >> $S/systemctl.log
q=0; [ "\${2:-}" = "--quiet" ] || [ "\${2:-}" = "-q" ] && { q=1; set -- "\$1" "\${@:3}"; }
vivo() { case "\$1" in nginx) pgrep -x nginx > /dev/null ;; php8.3-fpm) pgrep -f 'php-fpm: master' > /dev/null ;;
  envivo-validador) [ -f $S/val.pid ] && kill -0 "\$(cat $S/val.pid)" 2> /dev/null ;; *) return 1 ;; esac; }
validador() {
  [ -f $S/val.pid ] && kill "\$(cat $S/val.pid)" 2> /dev/null; sleep 0.3
  U=/etc/systemd/system/envivo-validador.service
  ( eval "\$(sed -n 's/^Environment=\(ENVIVO_JUEGO=.*\|VALIDADOR_PUERTO=.*\)/export \1/p' \$U)"
    # como DynamicUser + LoadCredential: usuario sin permisos y una copia de la clave solo para el
    install -o nobody -m 400 /etc/envivo/validador.clave $S/val.clave; export VALIDADOR_CLAVE_ARCHIVO=$S/val.clave
    cd /; setsid setpriv --reuid=nobody --regid=nogroup --clear-groups \$(sed -n 's/^ExecStart=//p' \$U) >> $S/validador.log 2>&1 < /dev/null & echo \$! > $S/val.pid ) ;
}
case "\$1" in
  reload|restart|start)
    case "\$2" in
      nginx) nginx -s reload 2> /dev/null || nginx ;;
      php8.3-fpm) if vivo php8.3-fpm; then kill -USR2 "\$(cat /run/php/php8.3-fpm.pid)"; sleep 0.3; else mkdir -p /run/php; php-fpm8.3; fi ;;
      envivo-validador) validador ;;
    esac ;;
  is-active) if vivo "\$2"; then [ \$q = 1 ] || echo active; exit 0; else [ \$q = 1 ] || echo inactive; exit 3; fi ;;
esac
exit 0
EOF
chmod 755 /usr/local/sbin/systemctl /usr/local/sbin/certbot
# Como en el VPS: nginx y php-fpm ya corren (los usan el ERP y TuPass)
systemctl start nginx; systemctl start php8.3-fpm
check "nginx y php-fpm encendidos antes de empezar" "active active" "$(systemctl is-active nginx) $(systemctl is-active php8.3-fpm)"

echo "== 1. Paso 2: instalar (curl ... -o /tmp/instalar_envivo.sh && sudo bash /tmp/instalar_envivo.sh), con teclado"
git -C "$S/github.git" show main:server/deploy/instalar.sh > /tmp/instalar_envivo.sh    # = lo que baja curl de raw.githubusercontent
# Lo que escribe el dueno, cuando se lo pregunta: usuario, una clave corta (la pide otra vez), la clave buena, "s" al certificado
esperar() { for _ in $(seq 1 900); do [ "$(grep -o "$1" "$S/inst1.raw" 2> /dev/null | wc -l)" -ge "$2" ] && return 0; sleep 0.4; done; return 1; }
mkfifo "$S/teclado"; : > "$S/inst1.raw"
( exec 3> "$S/teclado"
  esperar 'Usuario para el Centro' 1 && echo dimitry >&3
  esperar 'Clave del Centro' 1 && echo corta >&3
  esperar 'Clave del Centro' 2 && echo claveDePrueba123 >&3
  esperar 'Sacar el certificado' 1 && echo s >&3
  sleep 900 ) & TECLADO=$!
timeout 600 script -qefc "sudo REPO=$S/github.git bash /tmp/instalar_envivo.sh" "$S/inst1.raw" < "$S/teclado" > /dev/null 2>&1; echo "rc=$?" > "$S/inst1.rc"
pkill -P $TECLADO 2> /dev/null; kill $TECLADO 2> /dev/null
tr -d '\r' < "$S/inst1.raw" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' > "$S/inst1.txt"
sed 's/^/      | /' "$S/inst1.txt"
check "termina bien" "rc=0" "$(cat "$S/inst1.rc")"
check "la clave corta la pide otra vez" "1" "$(grep -c 'muy corta, otra vez' "$S/inst1.txt")"
check "certbot se corrio con el dominio" "1" "$(grep -c "certbot --nginx -d $D" "$S/certbot.log" 2> /dev/null)"
for l in "3) Prueba de la API en este servidor: 200" "4) Prueba de que el codigo esta protegido: 404" \
         "5) Centro de Control /control/: con usuario y clave (falta el codigo del celular)" \
         "6) Plux: SIN credenciales" "7) HTTPS: si" "8) Validador de partidas: activo"; do
  check "RESULTADO dice: $l" "1" "$(grep -cF "$l" "$S/inst1.txt")"
done
check "config 640 root:www-data, carpeta de la base 750 www-data" "640 root:www-data 750 www-data" "$(stat -c '%a %U:%G' $C) $(stat -c '%a %U' /var/lib/envivo)"
check "config: todas las claves del ejemplo estan" "0" "$(grep -oE '^[A-Z][A-Z0-9_]*=' "$APP/server/config.env.ejemplo" | while read -r k; do grep -q "^$k" $C || echo "$k"; done | wc -l)"
check "config: usuario dimitry y hash bcrypt" "1 1" "$(grep -c '^ENVIVO_ADMIN_USUARIO=dimitry$' $C) $(grep -cE '^ENVIVO_ADMIN_CLAVE_HASH=\$2y\$' $C)"
check "el codigo es de root y www-data no puede escribirlo" "root 0" "$(stat -c %U $APP/server/src/Config.php) $(sudo -u www-data test -w $APP/server/src/Config.php && echo 1 || echo 0)"
check "js/intento.js copiado" "1" "$(cmp -s $APP/js/intento.js $APP/server/validador/intento.js && echo 1)"
check "validador corre sin permisos (nobody)" "nobody" "$(ps -o user= -p "$(cat "$S/val.pid" 2> /dev/null)" 2> /dev/null | tr -d ' ')"
md5sum $C > "$S/md5.conf"

echo "== 2. Paso 4: claves de PRUEBAS de Plux (con el Plux falso) y recargar php-fpm"
P_PLUX=18393
openssl genrsa -out "$S/plux_priv.pem" 2048 2> /dev/null; openssl rsa -in "$S/plux_priv.pem" -pubout -out "$S/plux_pub.pem" 2> /dev/null
LLAVE=$(grep -v -- '-----' "$S/plux_pub.pem" | tr -d '\n')
( export FALSO_LLAVE_PRIVADA="$S/plux_priv.pem" FALSO_ID_CLIENTE=cliente_sandbox FALSO_CLAVE=secreto_sandbox_123 \
         FALSO_ESTABLECIMIENTO=EST-SANDBOX-1 FALSO_LOG="$S/plux.log" FALSO_BASE="http://127.0.0.1:$P_PLUX"
  setsid php -S 127.0.0.1:$P_PLUX "$S/trabajo/server/tests/plux_falso.php" > "$S/plux_srv.log" 2>&1 & echo $! > "$S/plux.pid" )
# Lo que hace con nano: llena las 4 lineas PLUX_ (y, solo en el ensayo, apunta la API al Plux falso)
sed -i -e "s#^PLUX_ID_ESTABLECIMIENTO=.*#PLUX_ID_ESTABLECIMIENTO=EST-SANDBOX-1#" -e "s#^PLUX_ID_CLIENTE=.*#PLUX_ID_CLIENTE=cliente_sandbox#" \
       -e "s#^PLUX_CLAVE_SECRETA=.*#PLUX_CLAVE_SECRETA=secreto_sandbox_123#" -e "s#^PLUX_LLAVE_PUBLICA=.*#PLUX_LLAVE_PUBLICA=$LLAVE#" $C
sudo systemctl reload php8.3-fpm
check "instalar.sh deja Plux en PRODUCCION (decision 2026-10-23)" "1" "$(grep -c '^PLUX_AMBIENTE=produccion$' $C)"
check "PASOS 8 (como lo vera Dimitry): plux en produccion" '"plux":{"disponible":true,"ambiente":"produccion"}' "$(curl -s https://$D/api/estado | grep -o '"plux":{[^}]*}')"
{ sudo cat $C; echo "PLUX_API_BASE=http://127.0.0.1:1/x/"; } > "$S/conf_prod.env"; chmod 644 "$S/conf_prod.env"
check "en produccion se ignora PLUX_API_BASE (auditoria A-15)" "https://api.pagoplux.com/intv1/" "$(cd $APP/server && ENVIVO_CONFIG="$S/conf_prod.env" php -r 'require "src/arranque.php"; echo \EnVivo\Plux::urlBase();' 2>&1)"; rm -f "$S/conf_prod.env"
# Solo en el ensayo: el Plux falso necesita sandbox (en produccion la API falsa se ignora a proposito)
sed -i "s#^PLUX_AMBIENTE=.*#PLUX_AMBIENTE=sandbox#" $C
echo "PLUX_API_BASE=http://127.0.0.1:$P_PLUX/intv1/" >> $C
sudo systemctl reload php8.3-fpm
check "plux disponible en sandbox (solo ensayo, Plux falso)" '"plux":{"disponible":true,"ambiente":"sandbox"}' "$(curl -s https://$D/api/estado | grep -o '"plux":{[^}]*}')"

echo "== 3. Paso 6: secreto 2FA (como el usuario normal, sin sudo) y ponerlo en la config"
sudo -u ubuntu php $APP/server/bin/control_totp.php dimitry > "$S/totp.txt" 2> "$S/totp.err"
SECRETO=$(sed -n 's/^ENVIVO_ADMIN_TOTP=//p' "$S/totp.txt")
check "control_totp.php da 32 letras y numeros y el enlace otpauth" "32 1 0" "${#SECRETO} $(grep -c '^otpauth://totp/' "$S/totp.txt") $(wc -c < "$S/totp.err")"
check "--codigo da 6 digitos" "1" "$(sudo -u ubuntu php $APP/server/bin/control_totp.php --codigo "$SECRETO" | grep -cE '^[0-9]{6}$')"
sed -i "s#^ENVIVO_ADMIN_TOTP=.*#ENVIVO_ADMIN_TOTP=$SECRETO#" $C
sudo systemctl reload php8.3-fpm

echo "== 4. Navegador (Playwright, celular 390x844, $D -> 127.0.0.1): Centro de Control con codigo y jugador"
NAV_OK=0
"$NODE22" "$R/tests/ensayo_vps.cjs" "https://$D" dimitry claveDePrueba123 "$SECRETO" "$R/tests/capturas" antes-demo > "$S/nav1.txt" 2>&1 && NAV_OK=1
sed 's/^/      | /' "$S/nav1.txt"
check "navegador: todo el recorrido del jugador y del panel" "1" "$NAV_OK"
check "Plux falso: hubo pago aprobado y uno con 3DS" "1 1" "$(grep -c '"code":0' "$S/plux.log" | awk '{print ($1>=1)}') $(grep -c '"ruta":"3ds"' "$S/plux.log" | awk '{print ($1>=1)}')"
check "la venta quedo en la base (2 compras aprobadas)" "2" "$(sudo -u www-data sqlite3 /var/lib/envivo/envivo.sqlite "select count(*) from compras where estado='pagado'" 2> /dev/null)"

echo "== 5. Pasos 10 y 11: productoras de muestra"
DEMO="sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/demo_datos.php"
(cd /home/ubuntu 2> /dev/null || cd /tmp; $DEMO --crear) > "$S/demo1.txt" 2>&1; echo "rc=$?" >> "$S/demo1.txt"; sed 's/^/      | /' "$S/demo1.txt"
check "--crear termina bien y crea 24 productoras" "1 1" "$(grep -c '^rc=0$' "$S/demo1.txt") $(grep -cE 'productoras +\+24' "$S/demo1.txt")"
(cd /tmp; $DEMO --crear) > "$S/demo2.txt" 2>&1
check "--crear otra vez no duplica (productoras +0)" "1" "$(grep -cE 'productoras +\+0' "$S/demo2.txt")"
(cd /tmp; $DEMO --estado) > "$S/demo3.txt" 2>&1; sed 's/^/      | /' "$S/demo3.txt"
"$NODE22" "$R/tests/ensayo_vps.cjs" "https://$D" dimitry claveDePrueba123 "$SECRETO" "$R/tests/capturas" con-demo > "$S/nav2.txt" 2>&1; sed 's/^/      | /' "$S/nav2.txt"
check "con demo: el chat y la copa se ven vivos" "1 1" "$(grep -c 'CHAT_VIVO' "$S/nav2.txt") $(grep -c 'COPA_VIVA' "$S/nav2.txt")"
(cd /tmp; $DEMO --borrar) > "$S/demo4.txt" 2>&1; sed 's/^/      | /' "$S/demo4.txt"
check "--borrar: foreign_key_check ok, integrity_check ok" "1 1" "$(grep -c 'foreign_key_check): ok' "$S/demo4.txt") $(grep -c 'integrity_check): ok' "$S/demo4.txt")"
check "--estado despues: No hay datos demo en esta base." "1" "$( (cd /tmp; $DEMO --estado) 2>&1 | grep -c 'No hay datos demo en esta base.')"
check "la cuenta real y sus compras siguen" "2" "$(sudo -u www-data sqlite3 /var/lib/envivo/envivo.sqlite "select count(*) from compras where estado='pagado'" 2> /dev/null)"

echo "== 6. Paso 8: comprobaciones (los comandos EXACTOS de las guias)"
uno() { bash -c "$1" 2>&1 | tr -d '\r'; }
check "PASOS 8: plux (ensayo en sandbox)" '"plux":{"disponible":true,"ambiente":"sandbox"}' "$(uno "curl -s https://juego.tukanec.com/api/estado | grep -o '\"plux\":{[^}]*}'")"
check "PASOS 8: Config.php 404" "404"    "$(uno "curl -s -o /dev/null -w '%{http_code}\n' https://juego.tukanec.com/server/src/Config.php")"
check "PASOS 8: validador"      "active" "$(uno "systemctl is-active envivo-validador")"
check "DESPLIEGUE 8: / 200"     "200"    "$(uno "curl -s -o /dev/null -w '%{http_code}\n' https://juego.tukanec.com/")"
check "DESPLIEGUE 8: base.php"  "404"    "$(uno "curl -s -o /dev/null -w '%{http_code}\n' https://juego.tukanec.com/control/lib/base.php")"
check "DESPLIEGUE 8: admin.php" "302 https://juego.tukanec.com/control/" "$(uno "curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://juego.tukanec.com/admin.php")"
check "DESPLIEGUE 8: cabeceras" "5"      "$(uno "curl -sI https://juego.tukanec.com/ | grep -icE \"content-security|permissions-policy|strict-transport|x-frame|referrer\"")"
check "DESPLIEGUE 8: soporte"   '{"ok":true,"correo":"","horario":""}' "$(uno "curl -s https://juego.tukanec.com/api/soporte/contacto")"
check "DESPLIEGUE 8: cron www-data" "8"  "$(uno "sudo crontab -u www-data -l | grep -c envivo")"
check "DESPLIEGUE 8: http -> https" "301" "$(uno "curl -s -o /dev/null -w '%{http_code}' http://juego.tukanec.com/")"

echo "== 7. Paso 9: actualizar.sh con versiones nuevas en GitHub (dos veces)"
empujar() { echo "$1" >> "$S/trabajo/$2"; G -C "$S/trabajo" commit -qam "$3" && G -C "$S/trabajo" push -q origin main; }
empujar "// ensayo: version nueva 1" js/logic.js "version nueva 1 (logica)"
sudo bash /var/www/envivo/server/deploy/actualizar.sh > "$S/act1.txt" 2>&1; echo "rc=$?" >> "$S/act1.txt"; sed 's/^/      | /' "$S/act1.txt"
check "1a: termina con Listo. y rc=0" "1 1" "$(grep -c '^Listo\.' "$S/act1.txt") $(grep -c '^rc=0$' "$S/act1.txt")"
check "1a: ve el cambio de la logica y reinicia el validador (OK)" "1 1" "$(grep -c 'cambio: js/logic.js' "$S/act1.txt") $(grep -c 'validador: OK' "$S/act1.txt")"
check "1a: la version servida es la nueva" "1" "$(curl -s https://$D/js/logic.js | grep -c 'ensayo: version nueva 1')"
check "1a: config intacta (Plux y 2FA)" "1 1" "$(grep -c '^PLUX_CLAVE_SECRETA=secreto_sandbox_123$' $C) $(grep -c "^ENVIVO_ADMIN_TOTP=$SECRETO\$" $C)"
empujar "<!-- ensayo: version nueva 2 -->" docs/DEMO.md "version nueva 2 (solo docs)"
echo "# ensayo: actualizar.sh nuevo" >> "$S/trabajo/server/deploy/actualizar.sh"; G -C "$S/trabajo" commit -qam "actualizar.sh nuevo" && G -C "$S/trabajo" push -q origin main
sudo bash /var/www/envivo/server/deploy/actualizar.sh > "$S/act2.txt" 2>&1; echo "rc=$?" >> "$S/act2.txt"; sed 's/^/      | /' "$S/act2.txt"
check "2a: termina con Listo. y rc=0; sigue con el actualizar.sh nuevo" "1 1 1" "$(grep -c '^Listo\.' "$S/act2.txt") $(grep -c '^rc=0$' "$S/act2.txt") $(grep -c 'se sigue con la version nueva' "$S/act2.txt")"
check "2a: sin cambios de logica no reinicia; validador OK" "1 1" "$(grep -c 'no se reinicia' "$S/act2.txt") $(grep -c 'validador: OK' "$S/act2.txt")"
check "2a: en el VPS quedo la ultima version" "$(git -C "$S/trabajo" rev-parse --short HEAD)" "$(git -C $APP rev-parse --short HEAD)"
sudo bash /var/www/envivo/server/deploy/instalar.sh < /dev/null > "$S/inst2.txt" 2>&1; echo "rc=$?" >> "$S/inst2.txt"
check "instalar.sh otra vez: rc=0, 5) con codigo del celular, 6) Plux puestas, HTTPS si" "1 1 1 1" "$(grep -c '^rc=0$' "$S/inst2.txt") $(grep -c '5) Centro de Control /control/: con usuario, clave y codigo del celular' "$S/inst2.txt") $(grep -c '6) Plux: credenciales puestas (ambiente: sandbox)' "$S/inst2.txt") $(grep -c '7) HTTPS: si' "$S/inst2.txt")"
check "instalar.sh otra vez: el cron sigue con 8 lineas, sitio con HTTPS" "8 1" "$(crontab -u www-data -l | grep -c envivo) $(grep -c 'listen 443 ssl' /etc/nginx/sites-available/$D)"

echo "== 8. DESPLIEGUE paso 7: instalar_ops.sh con el ayudante de Telegram del dueno (falso) y Telegram falso"
P_TG=18394; mkdir -p "$S/tg"
cat > "$S/tg/router.php" <<'PHP'
<?php
file_put_contents(getenv('TG_LOG'), json_encode(['ruta' => $_SERVER['REQUEST_URI'], 'chat' => $_POST['chat_id'] ?? '', 'texto' => $_POST['text'] ?? '']) . "\n", FILE_APPEND);
header('Content-Type: application/json'); echo '{"ok":true}';
PHP
( TG_LOG="$S/tg/mensajes.log" setsid php -S 127.0.0.1:$P_TG "$S/tg/router.php" > "$S/tg/srv.log" 2>&1 & echo $! > "$S/tg.pid" )
printf '#!/bin/bash\n# alerta-telegram.sh del dueno (bot qfserver) - FALSO del ensayo\nTOKEN="123456789:AAensayo_ensayo_ensayo_ensayo_xyz"\nCHAT_ID="4242"\ncurl -s "https://api.telegram.org/bot$TOKEN/sendMessage" -d chat_id=$CHAT_ID --data-urlencode "text=$1"\n' > /usr/local/bin/alerta-telegram.sh
chmod 750 /usr/local/bin/alerta-telegram.sh
sudo bash /var/www/envivo/server/deploy/ops/instalar_ops.sh > "$S/ops.txt" 2>&1; echo "rc=$?" >> "$S/ops.txt"; sed 's/^/      | /' "$S/ops.txt"
check "instalar_ops.sh termina bien" "1" "$(grep -c '^rc=0$' "$S/ops.txt")"
check "RESULTADO ops: scripts, 2 cron, 1 diario, Telegram, nginx" "1 1 1 1 1" "$(grep -c '1) Scripts:.*respaldo_envivo.sh.*salud_envivo.sh' "$S/ops.txt") $(grep -cE '2\) Cron de root:' "$S/ops.txt") $(grep -c '1 diario(s)' "$S/ops.txt") $(grep -c '4) Telegram:' "$S/ops.txt") $(grep -cE '5\) nginx: +zonas instaladas' "$S/ops.txt")"
check "DESPLIEGUE 8: cron root" "2" "$(uno "sudo crontab -u root -l | grep -c _envivo.sh")"
check "DESPLIEGUE 8: --listar con al menos 1 diario" "1" "$(uno "sudo respaldo_envivo.sh --listar" | grep -ciE 'diario' | awk '{print ($1>=1)}')"
uno "sudo DRY_RUN=1 salud_envivo.sh" > "$S/salud.txt"; sed 's/^/      | /' "$S/salud.txt"
check "DESPLIEGUE 8: DRY_RUN salud dice OK: todo bien" "1" "$(grep -c 'OK: todo bien' "$S/salud.txt")"
echo "TELEGRAM_API=http://127.0.0.1:$P_TG" >> /etc/envivo/ops.env      # solo en el ensayo: el Telegram falso
uno "sudo salud_envivo.sh --probar-telegram" > "$S/tgp.txt"; sed 's/^/      | /' "$S/tgp.txt"
check "--probar-telegram llega al chat 4242 con el token del ayudante" "1" "$(grep -c '"chat":"4242".*Prueba de alertas' "$S/tg/mensajes.log" 2> /dev/null)"
sudo bash /var/www/envivo/server/deploy/ops/instalar_ops.sh > "$S/ops2.txt" 2>&1
check "instalar_ops.sh otra vez: cron root sigue en 2, no toca ops.env" "2 1" "$(crontab -u root -l | grep -c _envivo.sh) $(grep -c "^TELEGRAM_API=http://127.0.0.1:$P_TG" /etc/envivo/ops.env)"

echo "== 9. Sin errores de PHP en los registros"
check "error.log de nginx sin 'PHP Fatal'" "0" "$(grep -c 'PHP Fatal' /var/log/nginx/error.log 2> /dev/null)"
echo
echo "Resumen del ensayo: $OK OK, $FALLAS fallas"
[ "$FALLAS" = "0" ] || printf "Fallas:$LISTA_FALLAS\n"
[ "$FALLAS" = "0" ]
