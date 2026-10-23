#!/usr/bin/env bash
# Actualiza el juego y su servidor en el VPS: baja lo nuevo de GitHub, actualiza las tablas y recarga PHP.
# No borra nada (ni la base de datos ni /etc/envivo/config.env) y no toca los otros sitios.
# Uso:   sudo bash /var/www/envivo/server/deploy/actualizar.sh
set -u
APP="${APP:-/var/www/envivo}"
RAMA="${RAMA:-main}"
PHPV="${PHPV:-8.3}"
CONF=/etc/envivo/config.env
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0"; exit 1; }
[ -d "$APP/.git" ] || { echo "ERROR: no esta el juego en $APP. Primero corre instalar.sh"; exit 1; }
cd /tmp || exit 1

echo "== 1. Bajar lo nuevo de GitHub"
git config --global --add safe.directory "$APP" 2> /dev/null
ANTES="$(git -C "$APP" rev-parse --short HEAD)"
if git -C "$APP" pull -q --ff-only origin "$RAMA"; then echo "   $ANTES -> $(git -C "$APP" rev-parse --short HEAD)"
else echo "   ERROR: no se pudo actualizar (cambios hechos a mano?). Revisa:  git -C $APP status"; exit 1; fi
chown -R root:root "$APP"; chmod -R u+rwX,go+rX,go-w "$APP"

echo "== 2. Tablas de la base de datos"
sudo -u www-data env ENVIVO_CONFIG="$CONF" php "$APP/server/bin/migrar.php" || { echo "   ERROR en las migraciones"; exit 1; }

echo "== 3. Recargar PHP (para que use el codigo nuevo)"
systemctl reload "php$PHPV-fpm" && echo "   listo"
echo
echo "Listo. Si cambio la configuracion de nginx del juego, corre tambien:  sudo bash $APP/server/deploy/instalar.sh"
