#!/usr/bin/env bash
# Conecta la tienda del juego con Tukan Pagos (pagos.tukanec.com). Pregunta la clave y el secreto del programa «envivo»
# (no se ven al escribirlos), los guarda en /etc/envivo/config.env, enciende el modulo, recarga PHP y prueba la conexion.
# Uso:   sudo bash /var/www/envivo/server/deploy/configurar_tukanpagos.sh            (encender / cambiar la clave)
#        sudo bash /var/www/envivo/server/deploy/configurar_tukanpagos.sh --apagar   (vuelve al Plux propio del juego)
# Guia: server/TUKAN_PAGOS.md. Mensajes sin tildes a proposito.
set -u
APP="${APP:-/var/www/envivo}"
CONF="${CONF:-/etc/envivo/config.env}"
PHPV="${PHPV:-8.3}"
[ "$(id -u)" = "0" ] || { echo "ERROR: correlo con sudo:   sudo bash $0"; exit 1; }
[ -f "$CONF" ] || { echo "ERROR: no esta $CONF. Primero corre instalar.sh"; exit 1; }

# poner CLAVE=VALOR en el archivo (cambia la linea si existe; si no, la agrega). El valor va por variable de entorno:
# nunca aparece en la linea de comandos ni en un registro.
poner() {
  CLAVE_CONF="$1" VALOR_CONF="$2" php -r '
    $f = $argv[1]; $k = getenv("CLAVE_CONF"); $v = getenv("VALOR_CONF");
    $l = file($f, FILE_IGNORE_NEW_LINES); $hecho = false;
    foreach ($l as $i => $x) if (preg_match("/^" . preg_quote($k, "/") . "\\s*=/", $x)) { $l[$i] = $k . "=" . $v; $hecho = true; }
    if (!$hecho) $l[] = $k . "=" . $v;
    file_put_contents($f, implode("\n", $l) . "\n");' "$CONF"
}

if [ "${1:-}" = "--apagar" ]; then
  poner TUKAN_PAGOS_ACTIVO 0
  systemctl reload "php$PHPV-fpm" 2> /dev/null || true
  echo "Listo: Tukan Pagos APAGADO. La tienda vuelve al pago con tarjeta propio del juego (Plux)."
  exit 0
fi

echo "== Conectar la tienda del juego con Tukan Pagos"
echo "En pagos.tukanec.com: Programas -> Agregar -> codigo envivo, nombre EN VIVO Tycoon,"
echo "direccion de aviso https://juego.tukanec.com/api/tukanpagos/aviso y regreso https://juego.tukanec.com"
echo "Copia la CLAVE (tkp_...) y el SECRETO DE AVISOS que te muestra (se ven una sola vez)."
echo
read -r -s -p "Pega la CLAVE del programa (no se ve al pegar) y Enter: " CLAVE; echo
case "$CLAVE" in tkp_*) ;; *) echo "ERROR: la clave debe empezar con tkp_. No se cambio nada."; exit 1 ;; esac
read -r -s -p "Pega el SECRETO DE AVISOS (no se ve al pegar) y Enter: " SECRETO; echo
[ "${#SECRETO}" -ge 16 ] || { echo "ERROR: el secreto es muy corto. No se cambio nada."; exit 1; }

grep -q '^TUKAN_PAGOS_URL=.\+' "$CONF" || poner TUKAN_PAGOS_URL https://pagos.tukanec.com
poner TUKAN_PAGOS_CLAVE "$CLAVE"
poner TUKAN_PAGOS_SECRETO_AVISO "$SECRETO"
poner TUKAN_PAGOS_ACTIVO 1
unset CLAVE SECRETO
chown root:www-data "$CONF"; chmod 640 "$CONF"
systemctl reload "php$PHPV-fpm" 2> /dev/null || true
echo
sudo -u www-data php "$APP/server/bin/tukanpagos.php" probar
