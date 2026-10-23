#!/usr/bin/env bash
# Actualiza el juego y su servidor en el VPS: baja lo nuevo de GitHub, agrega a la configuracion las lineas nuevas
# (sin cambiar las que ya estan), actualiza las tablas, reinicia el validador si cambio y recarga PHP.
# No borra nada (ni la base de datos ni los valores de /etc/envivo/config.env) y no toca los otros sitios.
# Uso:   sudo bash /var/www/envivo/server/deploy/actualizar.sh
set -u
APP="${APP:-/var/www/envivo}"
RAMA="${RAMA:-main}"
PHPV="${PHPV:-8.3}"
CONF="${CONF:-/etc/envivo/config.env}"
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0"; exit 1; }
[ -d "$APP/.git" ] || { echo "ERROR: no esta el juego en $APP. Primero corre instalar.sh"; exit 1; }
[ -f "$CONF" ] || { echo "ERROR: no esta $CONF. Primero corre instalar.sh"; exit 1; }
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
if git -C "$APP" pull -q --ff-only origin "$RAMA"; then echo "   ${ANTES:0:7} -> $(git -C "$APP" rev-parse --short HEAD)"
else echo "   ERROR: no se pudo actualizar (cambios hechos a mano?). Revisa:  git -C $APP status"
     [ -f "$APP/server/validador/intento.js" ] && [ ! -e "$APP/js/intento.js" ] && install -m 644 "$APP/server/validador/intento.js" "$APP/js/intento.js"
     exit 1; fi
DESPUES="$(git -C "$APP" rev-parse HEAD)"
if [ -f "$APP/server/validador/intento.js" ] && ! git -C "$APP" ls-files --error-unmatch js/intento.js > /dev/null 2>&1; then
  install -m 644 "$APP/server/validador/intento.js" "$APP/js/intento.js" && echo "   js/intento.js copiado de server/validador/intento.js (duelos y desafío)"
fi
chown -R root:root "$APP"; chmod -R u+rwX,go+rX,go-w "$APP"
if [ -z "${ENVIVO_REEJECUTADO:-}" ] && [ "$HUELLA" != "$(sha256sum < "$APP/server/deploy/actualizar.sh")" ]; then
  echo "   este script cambio en GitHub: se sigue con la version nueva"
  ENVIVO_REEJECUTADO=1 ENVIVO_ANTES="$ANTES" exec bash "$APP/server/deploy/actualizar.sh"
fi
# shellcheck source-path=SCRIPTDIR source=comun.sh
. "$APP/server/deploy/comun.sh"

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
actualizar_logrotate "$APP/server/deploy/ops/envivo.logrotate"

echo "== 5. Recargar PHP (para que use el codigo nuevo)"
systemctl reload "php$PHPV-fpm" && echo "   listo"
echo
echo "Listo. Si cambio la configuracion de nginx del juego, corre tambien:  sudo bash $APP/server/deploy/instalar.sh"
