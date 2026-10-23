# Publicar EN VIVO Tycoon en juego.tukanec.com (VPS de OVH)

Guía para copiar y pegar. Tiempo: 30 a 45 minutos. Nada de esto toca TuPass, el ERP ni los otros sitios del VPS.
Al final el juego queda en **https://juego.tukanec.com** con la tienda en **modo de pruebas** (no cobra de verdad).

---

## Paso 1. Crear la dirección "juego" en Cloudflare (5 minutos)

1. Entra a **dash.cloudflare.com** y abre el dominio **tukanec.com**.
2. Menú izquierdo: **DNS** → **Records** → botón **Add record**.
3. Llena así:
   - **Type:** `A`
   - **Name:** `juego`
   - **IPv4 address:** la IP de tu VPS de OVH (está en el panel de OVH; si no la tienes a mano, el instalador del paso 2 la muestra al final).
   - **Proxy status:** apágalo para que quede la **nube gris** ("DNS only"). Así el certificado del paso 3 sale sin problemas.
4. Toca **Save**.

> ⚠️ Si ya creaste (o vas a crear) una regla para que **tukanec.com** redirija a **tukansoftware.com**, revisa que la regla
> sea solo para `tukanec.com` y `www.tukanec.com`, **no** para `*.tukanec.com`. Si no, el juego también se iría a la otra página.

---

## Paso 2. Instalar el juego en el VPS (10 minutos)

1. Entra a tu VPS por **PuTTY** como siempre.
2. Copia esta línea completa, pégala (clic derecho en PuTTY) y presiona **Enter**:

```
curl -fsSL https://raw.githubusercontent.com/qfcorp/envivo-tycoon/main/server/deploy/instalar.sh -o /tmp/instalar_envivo.sh && sudo bash /tmp/instalar_envivo.sh
```

3. Te va a pedir tu contraseña de `sudo` (no se ve mientras escribes: es normal).
4. Te pregunta un **usuario** y una **contraseña para el panel de ventas** (mínimo 10 caracteres).
   Inventa unos nuevos y **anótalos**: con ellos entras a ver tus ventas.
5. Cuando pregunte si quieres sacar el **certificado HTTPS** escribe `s` y Enter
   (si dice que el DNS todavía no apunta, espera 5 minutos y vuelve a correr la línea del punto 2).
6. Al final muestra una lista de verificación. **Mándame una captura de esa lista** y la reviso.

---

## Paso 3. Poner las claves de Plux en modo de pruebas (5 minutos)

1. En el VPS, abre el archivo de configuración:

```
sudo nano /etc/envivo/config.env
```

2. Baja con las flechas hasta las líneas que empiezan con `PLUX_` y escribe después del `=` las claves de **pruebas (sandbox)**
   de tu cuenta de Pago Plux (las del panel de Plux, sección Desarrolladores). **Deja `PLUX_AMBIENTE=sandbox`.**
   - `PLUX_ID_ESTABLECIMIENTO=`
   - `PLUX_ID_CLIENTE=`
   - `PLUX_CLAVE_SECRETA=`
   - `PLUX_LLAVE_PUBLICA=` (la llave pública en una sola línea, sin `-----BEGIN` ni `-----END`)
3. Guarda: **Ctrl + O**, Enter, y sal con **Ctrl + X**.
4. Aplica los cambios:

```
sudo systemctl reload php8.3-fpm
```

> 🔒 Estas claves **nunca** van a GitHub (el repositorio es público). Solo viven en ese archivo del VPS.

---

## Paso 4. Probar (5 minutos)

1. En el celular abre **https://juego.tukanec.com**.
2. Ve a la pestaña **Tienda** → **Crear cuenta**.
3. Compra el paquete de 700 créditos con una **tarjeta de pruebas de Plux** (no cobra nada).
4. Revisa tus ventas en **https://juego.tukanec.com/admin.php** con el usuario y la contraseña del paso 2.

---

## Paso 5. Agregar el juego al respaldo de cada noche (5 minutos)

Tu respaldo automático (restic, 2:00 AM) todavía no incluye las carpetas nuevas del juego, donde se guardan las
cuentas y las compras: `/var/lib/envivo` y `/etc/envivo`.
Copia esta línea, pégala en el VPS y **mándame lo que sale**; con eso te preparo el cambio exacto:

```
sudo grep -n "/etc/erp_qf\|/var/www" /usr/local/bin/backup_restic_erp_qf.sh
```

---

## Actualizar el juego más adelante

Cada vez que haya una versión nueva en GitHub:

```
sudo bash /var/www/envivo/server/deploy/actualizar.sh
```

---

## Antes de cobrar con dinero real (no es para el demo)

1. **Certificación de Pago Plux:** pedirle a Plux que apruebe el sitio **juego.tukanec.com** con tus credenciales.
   Mientras no lo aprueben, se queda en `PLUX_AMBIENTE=sandbox`.
2. **Páginas legales:** completar en `server/public/terminos.html` y `privacidad.html` el RUC, el correo y el WhatsApp de soporte,
   y que un abogado las revise.
3. **Nombres de marcas y torneos:** que el abogado revise también la lista de nombres cambiados.
4. **Facturación electrónica (SRI):** el panel ya guarda los datos del comprador para facturar cada venta.
