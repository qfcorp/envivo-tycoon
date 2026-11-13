#!/usr/bin/env bash
# Actualiza el juego y su servidor en el VPS: baja lo nuevo de GitHub, agrega a la configuracion las lineas nuevas
# (sin cambiar las que ya estan), actualiza las tablas, reinicia el validador si cambio, pone al dia las tareas
# programadas (cron de www-data), instala el respaldo nocturno y el chequeo de salud si faltan (ops/instalar_ops.sh)
# y recarga PHP. Al final avisa EN GRANDE si el respaldo nocturno no esta bien.
# No borra nada (ni la base de datos ni los valores de /etc/envivo/config.env) y no toca los otros sitios.
# Uso:   sudo bash /var/www/envivo/server/deploy/actualizar.sh
#        sudo bash /var/www/envivo/server/deploy/actualizar.sh --version abc1234   VOLVER a una version (commit) de la
#             rama main (docs/INCIDENTES.md). La base NO vuelve atras (solo el programa). Para volver a lo ultimo: sin nada.
#        sudo bash /var/www/envivo/server/deploy/actualizar.sh --anterior          volver a la version de antes de la
#             ultima actualizacion (la lista esta en /etc/envivo/versiones.log)
set -u
APP="${APP:-/var/www/envivo}"
RAMA="${RAMA:-main}"
PHPV="${PHPV:-8.3}"
CONF="${CONF:-/etc/envivo/config.env}"
DOMINIO="${DOMINIO:-juego.tukanec.com}"
VERSIONES="$(dirname "$CONF")/versiones.log"
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0"; exit 1; }
[ -d "$APP/.git" ] || { echo "ERROR: no esta el juego en $APP. Primero corre instalar.sh"; exit 1; }
[ -f "$CONF" ] || { echo "ERROR: no esta $CONF. Primero corre instalar.sh"; exit 1; }
PEDIDA=""
case "${1:-}" in
  --version) PEDIDA="${2:-}"; [ -n "$PEDIDA" ] || { echo "Uso: sudo bash $0 --version COMMIT   (ver: git -C $APP log --oneline -15 origin/$RAMA)"; exit 1; } ;;
  --anterior) PEDIDA="$(awk '{ print $3 }' "$VERSIONES" 2> /dev/null | tail -n 1)"
              [ -n "$PEDIDA" ] || { echo "ERROR: no hay versiones anteriores anotadas en $VERSIONES. Usa --version COMMIT"; exit 1; } ;;
  "") ;;
  *) echo "Uso: sudo bash $0 [--version COMMIT | --anterior]"; exit 1 ;;
esac
# Huella de este script: si "git pull" trae uno distinto, se sigue con el nuevo
HUELLA=""; [ -f "$0" ] && HUELLA="$(sha256sum < "$0")"
cd /tmp || exit 1

echo "== 1. Bajar lo nuevo de GitHub"
git config --global --get-all safe.directory 2> /dev/null | grep -qxF "$APP" || git config --global --add safe.directory "$APP" 2> /dev/null
# ANTES = la version que habia (si este script se reinicio con la version nueva, viene de la primera vuelta)
ANTES="${ENVIVO_ANTES:-$(git -C "$APP" rev-parse HEAD)}"
# js/intento.js es una COPIA de server/validador/intento.js (nginx solo sirve /js/; no un enlace). No está en git:
# se quita antes de bajar lo nuevo (así "git pull" nunca choca con ella) y se vuelve a copiar después.
git -C "$APP" ls-files --error-unmatch js/intento.js > /dev/null 2>&1 || rm -f "$APP/js/intento.js"
if [ -n "$PEDIDA" ]; then
  # Volver a una version: solo commits de la rama oficial (nada que no este en GitHub). Las funciones de comun.sh
  # se toman de ESTA version (la vieja puede no tenerlas) y no se sigue con el actualizar.sh de la version vieja.
  git -C "$APP" fetch -q origin "$RAMA" || { echo "   ERROR: no se pudo consultar GitHub"; exit 1; }
  OBJ="$(git -C "$APP" rev-parse -q --verify "$PEDIDA^{commit}" 2> /dev/null)"
  if [ -z "$OBJ" ] || ! git -C "$APP" merge-base --is-ancestor "$OBJ" "origin/$RAMA"; then
    echo "   ERROR: \"$PEDIDA\" no es una version de la rama $RAMA. Mira la lista:  git -C $APP log --oneline -15 origin/$RAMA"
    [ -f "$APP/server/validador/intento.js" ] && [ ! -e "$APP/js/intento.js" ] && install -m 644 "$APP/server/validador/intento.js" "$APP/js/intento.js"
    exit 1
  fi
  COMUN="$(mktemp)"; cp "$APP/server/deploy/comun.sh" "$COMUN"
  POOL_LIB="$(mktemp)"; cp "$APP/server/deploy/ops/pool_fpm.sh" "$POOL_LIB" 2> /dev/null || : > "$POOL_LIB"
  if git -C "$APP" checkout -q --detach "$OBJ"; then echo "   VUELTA a una version anterior: ${ANTES:0:7} -> ${OBJ:0:7} ($(git -C "$APP" log -1 --format='%cd %s' --date=short | cut -c1-70))"
  else echo "   ERROR: no se pudo cambiar de version (cambios hechos a mano?). Revisa:  git -C $APP status"; exit 1; fi
  ENVIVO_REEJECUTADO=1
else
  # Si antes se volvio a una version (copia fuera de la rama), se vuelve a la rama y se baja lo ultimo
  git -C "$APP" symbolic-ref -q HEAD > /dev/null || git -C "$APP" checkout -q "$RAMA"
  if git -C "$APP" pull -q --ff-only origin "$RAMA"; then echo "   ${ANTES:0:7} -> $(git -C "$APP" rev-parse --short HEAD)"
  else echo "   ERROR: no se pudo actualizar (cambios hechos a mano?). Revisa:  git -C $APP status"
       [ -f "$APP/server/validador/intento.js" ] && [ ! -e "$APP/js/intento.js" ] && install -m 644 "$APP/server/validador/intento.js" "$APP/js/intento.js"
       exit 1; fi
fi
DESPUES="$(git -C "$APP" rev-parse HEAD)"
# Lista de versiones (para --anterior y para el registro de incidentes): fecha, antes, despues
[ "$ANTES" != "$DESPUES" ] && [ -z "${ENVIVO_ANOTADO:-}" ] && { echo "$(date '+%Y-%m-%d_%H:%M') $DESPUES $ANTES"; } >> "$VERSIONES" && chmod 640 "$VERSIONES" && export ENVIVO_ANOTADO=1
if [ -f "$APP/server/validador/intento.js" ] && ! git -C "$APP" ls-files --error-unmatch js/intento.js > /dev/null 2>&1; then
  install -m 644 "$APP/server/validador/intento.js" "$APP/js/intento.js" && echo "   js/intento.js copiado de server/validador/intento.js (duelos y desafío)"
fi
chown -R root:root "$APP"; chmod -R u+rwX,go+rX,go-w "$APP"
if [ -z "${ENVIVO_REEJECUTADO:-}" ] && [ "$HUELLA" != "$(sha256sum < "$APP/server/deploy/actualizar.sh")" ]; then
  echo "   este script cambio en GitHub: se sigue con la version nueva"
  ENVIVO_REEJECUTADO=1 ENVIVO_ANTES="$ANTES" exec bash "$APP/server/deploy/actualizar.sh"
fi
# shellcheck source-path=SCRIPTDIR source=comun.sh
if [ -n "$PEDIDA" ]; then . "$COMUN"; rm -f "$COMUN"; else . "$APP/server/deploy/comun.sh"; fi

echo "== 2. Configuracion: lineas nuevas de server/config.env.ejemplo (no cambia las que ya estan)"
completar_config "$APP/server/config.env.ejemplo" "$CONF" actualizar.sh || exit 1
chown root:www-data "$CONF"; chmod 640 "$CONF"

echo "== 3. Tablas de la base de datos"
sudo -u www-data env ENVIVO_CONFIG="$CONF" php "$APP/server/bin/migrar.php" || { echo "   ERROR en las migraciones"; exit 1; }

echo "== 4. Validador de partidas"
# Que cambio entre la version de antes y la nueva: el validador o la logica que repite (js/logic.js, datos.js, premium.js)
CAMBIO_VALIDADOR="$(git -C "$APP" diff --name-only "$ANTES" "$DESPUES" -- server/validador js/logic.js js/datos.js js/premium.js 2> /dev/null | head -n 5)"
if [ ! -f "$UNIDAD_VALIDADOR" ]; then
  echo "   no estaba instalado: se instala ahora"
  preparar_node && instalar_validador "$APP" "$CONF"
elif [ -n "$CAMBIO_VALIDADOR" ] || [ "$CONFIG_CAMBIO" = "1" ]; then
  [ -n "$CAMBIO_VALIDADOR" ] && echo "   cambio: $(echo "$CAMBIO_VALIDADOR" | tr '\n' ' ')"
  preparar_node && instalar_validador "$APP" "$CONF"
else
  echo "   sin cambios en el validador ni en la logica: no se reinicia"
  salud_validador "$CONF" || { echo "   se intenta reiniciarlo..."; instalar_validador "$APP" "$CONF"; }
fi
[ -z "$PEDIDA" ] && actualizar_logrotate "$APP/server/deploy/ops/envivo.logrotate"

echo "== 4b. Tareas programadas del juego (cron de www-data)"
instalar_cron_juego "$APP" "$CONF"

echo "== 4c. Respaldo nocturno, chequeo de salud y rotacion de registros"
# Si falta algo (o cambio un script de ops/) se corre ops/instalar_ops.sh: no duplica nada y hace un respaldo enseguida.
# Al volver a una version vieja (--version / --anterior) no se cambian (solo se revisa abajo que sigan instalados).
if [ -z "$PEDIDA" ]; then asegurar_ops "$APP"; else echo "   (version anterior: no se cambian)"; fi

echo "== 5. Recargar PHP (para que use el codigo nuevo)"
# Grupo propio de PHP del juego (ops/pool_fpm.sh): si el sitio lo usa, se pone al dia y se revisa su socket
if [ -n "$PEDIDA" ]; then POOL_LIB_USAR="$POOL_LIB"; else POOL_LIB_USAR="$APP/server/deploy/ops/pool_fpm.sh"; fi
# shellcheck source=ops/pool_fpm.sh
if [ -s "$POOL_LIB_USAR" ]; then . "$POOL_LIB_USAR"; revisar_pool_fpm "/etc/nginx/sites-available/$DOMINIO"; fi
[ -n "$PEDIDA" ] && rm -f "$POOL_LIB"
systemctl reload "php$PHPV-fpm" && echo "   listo"

echo "== 6. nginx: configuracion del sitio $DOMINIO (solo si cambio la plantilla server/deploy/nginx-sitio.sh)"
# La misma plantilla que usa instalar.sh, con el socket de PHP que ya usa el sitio (el del grupo propio si lo tiene). Si el
# resultado es igual al que esta, no se toca nada. Si cambio: se prueba con "nginx -t" y SOLO si sale bien se recarga
# nginx; si sale mal se deja todo como estaba (sitio y zonas de limite). Asi un cambio de la plantilla (p. ej. gzip,
# auditoria 13-nov) llega con este script, sin tener que correr instalar.sh.
SITIO_NG="/etc/nginx/sites-available/$DOMINIO"
LIMITES_NG=/etc/nginx/conf.d/envivo-limites.conf
if [ ! -f "$SITIO_NG" ] || ! command -v nginx > /dev/null; then
  echo "   no esta el sitio de nginx ($SITIO_NG): corre instalar.sh"
else
  SOCK_NG="$(grep -oE 'fastcgi_pass unix:[^;]+' "$SITIO_NG" | head -n 1 | sed 's/^fastcgi_pass unix://')"
  NUEVO_NG="$(mktemp)"
  if [ -z "$SOCK_NG" ]; then
    echo "   no se encontro el socket de PHP en $SITIO_NG: no se toca (corre instalar.sh)"
  elif ! DOMINIO="$DOMINIO" APP="$APP" SOCK="$SOCK_NG" bash "$APP/server/deploy/nginx-sitio.sh" > "$NUEVO_NG" || [ ! -s "$NUEVO_NG" ]; then
    echo "   ERROR: no se pudo armar la configuracion nueva: no se toca nada"
  else
    CAMBIA_LIM=0
    [ -f "$APP/server/deploy/ops/nginx-envivo-limites.conf" ] && ! cmp -s "$APP/server/deploy/ops/nginx-envivo-limites.conf" "$LIMITES_NG" && CAMBIA_LIM=1
    if cmp -s "$NUEVO_NG" "$SITIO_NG" && [ "$CAMBIA_LIM" = "0" ]; then
      echo "   sin cambios"
    else
      ANT_NG="$(mktemp)"; cp -p "$SITIO_NG" "$ANT_NG"
      ANT_LIM=""; [ -f "$LIMITES_NG" ] && ANT_LIM="$(mktemp)" && cp -p "$LIMITES_NG" "$ANT_LIM"
      install -m 644 "$NUEVO_NG" "$SITIO_NG"
      [ "$CAMBIA_LIM" = "1" ] && install -o root -g root -m 644 "$APP/server/deploy/ops/nginx-envivo-limites.conf" "$LIMITES_NG"
      if nginx -t > /tmp/envivo-nginx-t.log 2>&1; then
        systemctl reload nginx && echo "   configuracion nueva puesta (nginx -t correcto y nginx recargado)"
      else
        echo "   ERROR: nginx -t fallo con la configuracion nueva. Se deja la de antes y NO se recarga nginx. Detalle:"
        sed 's/^/     /' /tmp/envivo-nginx-t.log
        cp -p "$ANT_NG" "$SITIO_NG"
        if [ -n "$ANT_LIM" ]; then cp -p "$ANT_LIM" "$LIMITES_NG"; elif [ "$CAMBIA_LIM" = "1" ]; then rm -f "$LIMITES_NG"; fi
      fi
      rm -f "$ANT_NG"; [ -n "$ANT_LIM" ] && rm -f "$ANT_LIM"
    fi
  fi
  rm -f "$NUEVO_NG"
fi
echo
if [ -n "$PEDIDA" ]; then
  echo "Listo: el juego quedo en la version ${DESPUES:0:7} (fuera de la rama $RAMA). La base de datos NO volvio atras."
  echo "Para volver a lo ultimo de GitHub:   sudo bash $APP/server/deploy/actualizar.sh"
else
  echo "Listo. (La configuracion de nginx del sitio ya se puso al dia en el paso 6; el certificado y lo demas: instalar.sh)"
fi
# Al final, para que se vea: si el respaldo nocturno no esta o el ultimo no fue bueno, un AVISO GRANDE
aviso_respaldo "$APP" || true
