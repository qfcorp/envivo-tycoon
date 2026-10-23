# Demo completo en el VPS: pasos uno por uno

Cada paso es **una sola cosa**. Haz uno, mándame la captura o lo que salió, y te paso el siguiente.
La guía larga con todos los detalles es `docs/DESPLIEGUE.md` (estos pasos son un resumen de ella).

| # | Qué haces | Dónde | Tiempo |
|---|---|---|---|
| 1 | Crear la dirección `juego` en Cloudflare | Celular (Cloudflare) | 5 min |
| 2 | Instalar el juego | VPS (PuTTY) | 15 min |
| 3 | Revisar la lista RESULTADO | VPS | 1 min |
| 4 | Poner las claves de Plux (producción) | VPS | 5 min |
| 5 | Primera entrada al Centro de Control | Celular | 2 min |
| 6 | Activar el código del celular (2FA) | VPS + celular | 10 min |
| 7 | Probar el juego y una compra real pequeña ($0,99) | Celular | 10 min |
| 8 | Comprobaciones rápidas | VPS | 5 min |
| 9 | Actualizar a la última versión (cuando te avise) | VPS | 2 min |
| 10 | Llenar el mundo con productoras de muestra | VPS | 2 min |
| 11 | Borrar las productoras de muestra (antes del sábado) | VPS | 1 min |

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
   La clave no se ve al escribir. Si es muy corta dice `muy corta, otra vez` y la vuelve a pedir.
5. Trabaja solo 1 a 3 minutos (pasos `== 4` a `== 9`). Al final pregunta
   `Sacar el certificado HTTPS ahora con certbot? (s/n)`: escribe `s` y Enter.
   (Si certbot te pide un correo o aceptar condiciones, escribe tu correo y `Y`.)

## Paso 3 · Lista RESULTADO

Al final sale una lista. Mándame captura. Debe decir:
- `3) Prueba de la API en este servidor: 200 (debe ser 200)`
- `4) Prueba de que el codigo esta protegido: 404 (debe ser 404)`
- `5) Centro de Control /control/: con usuario y clave (falta el codigo del celular)` (normal: es el paso 6)
- `6) Plux: SIN credenciales (...)` (normal: es el paso 4; ya viene en producción)
- `7) HTTPS: si`
- `8) Validador de partidas: activo`

Debajo sale "Lista de lo que falta": ya está en estos pasos, no hace falta seguirla ahora.

## Paso 4 · Claves de Plux (producción: cobra de verdad)

1. `sudo nano /etc/envivo/config.env`
2. En las líneas `PLUX_` pega las claves de **producción** del panel de Plux (la misma integración de TuPass, ya certificada):
   `PLUX_ID_ESTABLECIMIENTO=`, `PLUX_ID_CLIENTE=`, `PLUX_CLAVE_SECRETA=`, `PLUX_LLAVE_PUBLICA=` (en una sola línea).
   `PLUX_AMBIENTE=produccion` ya viene puesto: no lo cambies.
3. **Ctrl + O**, Enter, **Ctrl + X**.
4. `sudo systemctl reload php8.3-fpm`

## Paso 5 · Centro de Control

En el celular: **https://juego.tukanec.com/control/** → usuario y clave del paso 2 → debe abrir **Resumen**.

## Paso 6 · Código del celular (2FA)

1. En el VPS (sin `sudo`): `php /var/www/envivo/server/bin/control_totp.php dimitry` → sale `ENVIVO_ADMIN_TOTP=` y
   **32 letras y números**: cópialos (sin captura). La línea `otpauth://...` de abajo no hace falta.
2. En **Google Authenticator**: **+** → **Introducir una clave de configuración** → Cuenta `EN VIVO Control`, Clave: las 32 letras → **Añadir**.
3. `sudo nano /etc/envivo/config.env` → **Ctrl + W** → `ENVIVO_ADMIN_TOTP` → pega el secreto después del `=` → **Ctrl + O**, Enter, **Ctrl + X**.
4. `sudo systemctl reload php8.3-fpm`
5. Vuelve a abrir `/control/`: ahora pide usuario, clave **y** el código de 6 dígitos de la app.

## Paso 7 · Probar el juego

En el celular **https://juego.tukanec.com**:
1. Juega el tutorial (3 eventos: **Clientes** → Preparar → En vivo).
2. **Tienda** → **Crear cuenta** → comprar la **Oferta de bienvenida ($0,99)** con **tu tarjeta real** (es una compra
   de verdad: te lleva a la página de pago de Plux y vuelve solo al juego con los créditos y el camarógrafo).
3. Revisa que lleguen los créditos y que en `/control/` → **Compras** aparezca la venta.
4. **Inicio**: sale la tarjeta **Tu servidor** (por ejemplo `Servidor 1 · Quito`).
5. Pestaña **En línea**: deben salir Liga Semanal, Mega Festival, Duelo de Productoras, Desafío del Día y
   Copa de Servidores. La **Liga** pide unirse a una asociación: antes del paso 10 no hay ninguna (crear una cuesta
   $5.000 del juego), así que el encargo de liga se prueba después del paso 10.
6. El botón rojo redondo (abajo a la derecha) abre el **chat**; **Tienda** → **Mercado**; **Tienda** → **Ayuda y soporte**.

## Paso 8 · Comprobaciones rápidas (una línea a la vez)

```
curl -s https://juego.tukanec.com/api/estado | grep -o '"plux":{[^}]*}'
```
Debe salir `"plux":{"disponible":true,"ambiente":"produccion"}`.

```
curl -s -o /dev/null -w '%{http_code}\n' https://juego.tukanec.com/server/src/Config.php
```
Debe salir `404`.

```
systemctl is-active envivo-validador
```
Debe salir `active`.

```
sudo crontab -u www-data -l | grep -c envivo
```
Debe salir `8` (las tareas programadas del juego).

## Paso 9 · Actualizar a la última versión

Cuando te diga "hay versión nueva" (por ejemplo cuando entren los eventos de fechas especiales, la sede o la Copa de Servidores):

```
sudo bash /var/www/envivo/server/deploy/actualizar.sh
```

Debe terminar con `Listo. Si cambio la configuracion de nginx ...` (esa frase sale siempre: no es un error).
Si dice `este script cambio en GitHub: se sigue con la version nueva`, el paso `== 1` sale dos veces: es normal.
Si te aviso que cambió nginx o las tareas, corre además:

```
sudo bash /var/www/envivo/server/deploy/instalar.sh
```


## Paso 10 · Productoras de muestra (para que el demo se vea vivo)

Crea 24 productoras de muestra en los 3 servidores (Quito, Guayaquil, Cuenca), con asociaciones, chat, mercado,
liga y la Copa de Servidores en marcha. No pueden entrar al juego y se borran con un comando.

```
sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/demo_datos.php --crear
```

Al final sale el resumen con `productoras    +24`, `asociaciones   +7`, `chat           +21`… Mándame captura.
En el juego, **En línea** → **Liga** → **Buscar asociación** → **Unirme** a una de muestra → **Tomar** un encargo →
**Jugar el encargo** → **Enviar resultado**. Ojo: el chat del **Servidor** muestra solo los mensajes de tu servidor
(una cuenta nueva puede caer en Guayaquil o Cuenca, con menos mensajes que Quito).

Para ver qué hay:

```
sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/demo_datos.php --estado
```

## Paso 11 · Borrar las productoras de muestra

⚠️ **Antes del sábado a las 00:00** (ese día se juega la Copa y podrían llevarse premios) y siempre antes de lanzar de verdad:

```
sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php /var/www/envivo/server/bin/demo_datos.php --borrar
```

Detalles y qué hacer si algo sale mal: `docs/DEMO_DATOS.md`.

---

Después del demo (no hace falta hoy): respaldos y alertas por Telegram (paso 7 de `DESPLIEGUE.md`) y proteger GitHub (paso 9).
