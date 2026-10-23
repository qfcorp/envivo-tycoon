# Demo completo en el VPS: pasos uno por uno

Cada paso es **una sola cosa**. Haz uno, mándame la captura o lo que salió, y te paso el siguiente.
La guía larga con todos los detalles es `docs/DESPLIEGUE.md` (estos pasos son un resumen de ella).

| # | Qué haces | Dónde | Tiempo |
|---|---|---|---|
| 1 | Crear la dirección `juego` en Cloudflare | Celular (Cloudflare) | 5 min |
| 2 | Instalar el juego | VPS (PuTTY) | 15 min |
| 3 | Revisar la lista RESULTADO | VPS | 1 min |
| 4 | Poner las claves de prueba de Plux | VPS | 5 min |
| 5 | Primera entrada al Centro de Control | Celular | 2 min |
| 6 | Activar el código del celular (2FA) | VPS + celular | 10 min |
| 7 | Probar el juego y una compra de prueba | Celular | 10 min |
| 8 | Comprobaciones rápidas | VPS | 5 min |
| 9 | Actualizar a la última versión (cuando te avise) | VPS | 2 min |

---

## Paso 1 · Cloudflare

1. Entra a **dash.cloudflare.com** → dominio **tukanec.com**.
2. **DNS** → **Records** → **Add record**:
   - Type: `A`
   - Name: `juego`
   - IPv4 address: la IP de tu VPS de OVH
   - Proxy status: **nube gris** ("DNS only")
3. **Save**. Mándame captura del registro creado.

## Paso 2 · Instalar

1. Entra al VPS con **PuTTY**.
2. Pega esta línea completa y Enter:

```
curl -fsSL https://raw.githubusercontent.com/qfcorp/envivo-tycoon/main/server/deploy/instalar.sh -o /tmp/instalar_envivo.sh && sudo bash /tmp/instalar_envivo.sh
```

3. Pide tu clave de `sudo` (no se ve al escribir: es normal).
4. Pide **usuario** y **clave del Centro de Control** (mínimo 10 caracteres): invéntalos y **anótalos**.
5. Cuando pregunte por el **certificado HTTPS**: escribe `s` y Enter.

## Paso 3 · Lista RESULTADO

Al final sale una lista. Mándame captura. Debe decir:
- `3) Prueba de la API en este servidor: 200`
- `4) Prueba de que el codigo esta protegido: 404`
- `7) HTTPS: si`
- `8) Validador de partidas: activo`

## Paso 4 · Claves de prueba de Plux

1. `sudo nano /etc/envivo/config.env`
2. En las líneas `PLUX_` pega las claves de **pruebas (sandbox)** del panel de Plux:
   `PLUX_ID_ESTABLECIMIENTO=`, `PLUX_ID_CLIENTE=`, `PLUX_CLAVE_SECRETA=`, `PLUX_LLAVE_PUBLICA=` (en una sola línea).
   Deja `PLUX_AMBIENTE=sandbox`.
3. **Ctrl + O**, Enter, **Ctrl + X**.
4. `sudo systemctl reload php8.3-fpm`

## Paso 5 · Centro de Control

En el celular: **https://juego.tukanec.com/control/** → usuario y clave del paso 2 → debe abrir **Resumen**.

## Paso 6 · Código del celular (2FA)

1. En el VPS: `php /var/www/envivo/server/bin/control_totp.php dimitry` → copia las 32 letras y números (sin captura).
2. En **Google Authenticator**: **+** → **Introducir una clave de configuración** → Cuenta `EN VIVO Control`, Clave: las 32 letras → **Añadir**.
3. `sudo nano /etc/envivo/config.env` → **Ctrl + W** → `ENVIVO_ADMIN_TOTP` → pega el secreto después del `=` → **Ctrl + O**, Enter, **Ctrl + X**.
4. `sudo systemctl reload php8.3-fpm`
5. Vuelve a abrir `/control/`: ahora pide el código de 6 dígitos.

## Paso 7 · Probar el juego

En el celular **https://juego.tukanec.com**:
1. Juega el tutorial (3 eventos).
2. **Tienda** → **Crear cuenta** → comprar **700 créditos** con una **tarjeta de pruebas de Plux**.
3. Revisa que lleguen los créditos y que en `/control/` → **Compras** aparezca la venta.
4. Pestaña **En línea**: deben salir Liga, Festival, Duelos y Desafío.

## Paso 8 · Comprobaciones rápidas (una línea a la vez)

```
curl -s https://juego.tukanec.com/api/estado | grep -o '"plux":{[^}]*}'
```
Debe salir `"plux":{"disponible":true,"ambiente":"sandbox"}`.

```
curl -s -o /dev/null -w '%{http_code}\n' https://juego.tukanec.com/server/src/Config.php
```
Debe salir `404`.

```
systemctl is-active envivo-validador
```
Debe salir `active`.

## Paso 9 · Actualizar a la última versión

Cuando te diga "hay versión nueva" (por ejemplo cuando entren los eventos de fechas especiales, la sede o la Copa de Servidores):

```
sudo bash /var/www/envivo/server/deploy/actualizar.sh
```

Debe terminar con `Listo.` Si te aviso que cambió nginx o las tareas, corre además:

```
sudo bash /var/www/envivo/server/deploy/instalar.sh
```

---

Después del demo (no hace falta hoy): respaldos y alertas por Telegram (paso 7 de `DESPLIEGUE.md`) y proteger GitHub (paso 9).
