#!/usr/bin/env bash
# Conecta el juego con el Panel Tukan Central: sus ventas se anotan en «Cobros y facturas» y se FACTURAN con TuFactura,
# igual que todos los sistemas Tukan (src/PanelVentas.php). La facturacion propia del juego se apaga sola.
# El Panel da este comando al agregar el programa «EN VIVO Tycoon» (Programas -> Agregar):
#   sudo bash /var/www/envivo/server/deploy/conectar_central.sh ID SECRETO URL
# Desconectar (vuelve a la facturacion propia del juego):  sudo bash /var/www/envivo/server/deploy/conectar_central.sh --quitar
# Mensajes sin tildes a proposito.
set -u
APP="${APP:-/var/www/envivo}"
CONF="${CONF:-/etc/envivo/config.env}"
PHPV="${PHPV:-8.3}"
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0 ..."; exit 1; }
[ -f "$CONF" ] || { echo "ERROR: no esta $CONF. Primero corre instalar.sh"; exit 1; }

poner() {
  CLAVE_CONF="$1" VALOR_CONF="$2" php -r '
    $f = $argv[1]; $k = getenv("CLAVE_CONF"); $v = getenv("VALOR_CONF");
    $l = file($f, FILE_IGNORE_NEW_LINES); $hecho = false;
    foreach ($l as $i => $x) if (preg_match("/^" . preg_quote($k, "/") . "\\s*=/", $x)) { $l[$i] = $k . "=" . $v; $hecho = true; }
    if (!$hecho) $l[] = $k . "=" . $v;
    file_put_contents($f, implode("\n", $l) . "\n");' "$CONF"
}

if [ "${1:-}" = "--quitar" ]; then
  poner FACTURACION_POR_PANEL 0
  systemctl reload "php$PHPV-fpm" 2> /dev/null || true
  echo "Listo: el juego ya no manda sus ventas al Panel (vuelve a su facturacion propia)."
  exit 0
fi

ID="${1:-}"; SECRETO="${2:-}"; URL="${3:-https://panel.tukanec.com}"
[[ "$ID" =~ ^[a-z0-9][a-z0-9_-]{1,40}$ ]] || { echo "ERROR: falta el ID del programa (copia el comando completo que da el Panel)."; exit 1; }
[ "${#SECRETO}" -ge 16 ] || { echo "ERROR: falta el SECRETO (copia el comando completo que da el Panel)."; exit 1; }
[[ "$URL" =~ ^https:// ]] || { echo "ERROR: la direccion del Panel debe empezar con https://"; exit 1; }

poner TUKAN_CENTRAL_URL "$URL"
poner TUKAN_CENTRAL_ID "$ID"
poner TUKAN_CENTRAL_SECRET "$SECRETO"
poner FACTURACION_POR_PANEL 1
chown root:www-data "$CONF"; chmod 640 "$CONF"
systemctl reload "php$PHPV-fpm" 2> /dev/null || true
echo "== Juego conectado al Panel Tukan ($URL, programa $ID)"
sudo -u www-data php "$APP/server/bin/panel_ventas.php" probar
