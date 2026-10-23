# Integrar: correo del juego y "¿Olvidaste tu contraseña?" (módulo correo)

Guía del dueño (SMTP con Brevo/Resend, soporte@tukanec.com con Cloudflare Email Routing, SPF/DKIM/DMARC):
**docs/CORREO.md**.

## Archivos nuevos (no chocan con nada)

| Archivo | Qué es |
|---|---|
| `server/src/Correo.php` | SMTP con sockets de PHP (STARTTLS 587 / SSL 465, AUTH PLAIN o LOGIN, certificado verificado). Sin `SMTP_HOST`: modo registro (escribe JSON por línea en `CORREO_REGISTRO`, vacío = `correos.log` junto a la base, permisos 600). `Correo::despues()` manda después de responder (`fastcgi_finish_request`). |
| `server/src/CorreoPlantillas.php` | Plantillas HTML + texto en los 10 idiomas: `recuperar` y `clave_cambiada`. |
| `server/src/Recuperar.php` | Lógica: pedir enlace (misma respuesta exista o no la cuenta), revisar, cambiar (gasta el enlace de forma atómica, cierra TODAS las sesiones, avisa por correo, limpia el bloqueo de "entrar"). |
| `server/src/RecuperarApi.php` | Rutas `/api/cuenta/recuperar*` (sin sesión). |
| `server/src/migraciones/correo.sql` | Tabla `recuperaciones` (solo el sha256 del código). Se aplica sola. |
| `server/public/recuperar.html` + `server/public/assets/recuperar.js` | Página del enlace (10 idiomas; sin código sirve para pedir el enlace). JS servido en `/pago-assets/recuperar.js`. |
| `server/bin/correo_prueba.php` | `sudo -u www-data php server/bin/correo_prueba.php tu@correo.com [idioma]` |
| `js/recuperar.js` | Botón "¿Olvidaste tu contraseña?" y ventana dentro del juego (10 idiomas en el módulo). |
| `server/tests/pruebas_correo.php`, `server/tests/smtp_falso.php`, `tests/test_correo.js` | Pruebas. |
| `docs/traducciones/errores_nuevos/correo.json` | Códigos nuevos `recuperar_limite` y `recuperar_enlace_invalido` en 10 idiomas: **pasarlos a `docs/traducciones/errores.json`** (`_codigos` y cada idioma). Hasta entonces `test_traducciones.js` puede quejarse solo por eso. |

## Cambios en archivos compartidos (todos con ancla, ya hechos en esta rama)

1. **`server/public/api.php`** — una línea (dos con el comentario) justo después de la de Fusiones:
   <!-- api.php -->
   ```php
   if (class_exists(\EnVivo\RecuperarApi::class) && \EnVivo\RecuperarApi::esRuta($ruta)) \EnVivo\RecuperarApi::responder($ruta, $metodo);
   ```
   Va después del control de `X-Envivo` (igual RecuperarApi lo vuelve a revisar). No pide sesión.
2. **`js/ui.js`** — `abrirCuenta()`, última línea de la ventana: el texto `cuenta.olvido` ("escríbenos a soporte") se cambia
   por el botón del módulo; si el módulo no está, sale el texto de antes:
   ```js
   ${window.Recuperar ? window.Recuperar.enlace() : `<p class="small muted">${T('cuenta.olvido')}</p>`}`);
   ```
   La clave `cuenta.olvido` de `js/lang/*.js` NO se tocó (queda de respaldo).
3. **`index.html`** — `<script defer src="js/recuperar.js"></script>` después del de `js/soporte.js`.
4. **`sw.js`** — `'./js/recuperar.js',` en `SHELL`, después de `./js/soporte.js` (sin subir `VERSION`: lo sube el coordinador).
5. **`server/deploy/nginx-sitio.sh`** — después de `location = /borrar-cuenta.html`:
   ```nginx
   location = /recuperar.html { root $PUB; add_header Cache-Control "no-store"; $(cab_juego) }
   ```
   (CSP del juego: `script-src 'self'`, `connect-src 'self'`). `/pago-assets/recuperar.js` ya lo cubre `location ^~ /pago-assets/`.
   Después de desplegar hay que regenerar el sitio de nginx (lo hace `instalar.sh`/`actualizar.sh` como siempre).
6. **`server/tests/router.php`** — una línea para `/recuperar.html` (misma CSP del juego y `no-store`).
7. **`server/tests/correr.sh`** — bloque "3e. Correo" (corre `pruebas_correo.php`) antes de "== 4." y un `check` de nginx
   para `/recuperar.html` y `/pago-assets/recuperar.js` después del de `/discord/interacciones`.
8. **`server/config.env.ejemplo`** — `SOPORTE_CORREO=soporte@tukanec.com` y el bloque `SMTP_HOST, SMTP_PORT=587,
   SMTP_SEGURIDAD=tls, SMTP_USUARIO, SMTP_CLAVE, SMTP_DE=no-responder@tukanec.com, SMTP_NOMBRE=EN VIVO Tycoon,
   CORREO_REGISTRO` (`completar_config` los agrega solos en servidores existentes). Opcional sin línea en el ejemplo:
   `SMTP_CA` (certificado raíz propio; lo usan las pruebas).
9. **`server/deploy/instalar.sh`** — plantilla nueva con `SOPORTE_CORREO=soporte@tukanec.com` y el texto final (d2) que
   apunta a docs/CORREO.md.

## API

Todas `POST` con `X-Envivo: 1`, sin sesión. El código del enlace va en el cuerpo, nunca en la dirección.

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `/api/cuenta/recuperar` | `{email, idioma?}` (sin `idioma`: `Accept-Language`) | `200 {ok, mensaje, minutos: 30}` **igual exista o no la cuenta** · `400 email_invalido` · `429 recuperar_limite` (3/h por correo, cuenta exista o no) · `429 limite_intentos` (20/h por IP) |
| `/api/cuenta/recuperar/revisar` | `{token}` | `200 {ok, email: "d•••@gmail.com", vence, clave_min}` · `410 recuperar_enlace_invalido` · `429 limite_intentos` (30/10 min por IP, junto con cambiar) |
| `/api/cuenta/recuperar/cambiar` | `{token, clave}` | `200 {ok, mensaje}` + galleta `envivo_s` nueva · `400 clave_corta {min}` / `clave_larga` · `410 recuperar_enlace_invalido` |

Enlace del correo: `ENVIVO_URL/recuperar.html#t=<64 hex>[&l=<idioma>]` (después del `#`: no llega a los registros de nginx).
Cuentas `baneado`/`borrado`: no reciben enlace y sus enlaces no sirven. Auditoría: `recuperar_pedido` (dice si el correo salió
o el error SMTP) y `clave_recuperada`.

## Sugerencias (no hechas, archivos compartidos)

- `Cuentas::borrar()`: sumar `'recuperaciones'` a la lista de tablas que se borran (hoy quedan solo huellas sha256 que ya no
  sirven porque la cuenta queda `borrado`; vencen en 30 minutos).
- `privacidad.html`: mencionar que el correo se usa también para recuperar la contraseña y avisos de seguridad de la cuenta,
  y que el envío lo hace un proveedor (Brevo).
- `Soporte::contacto()` / `Cuentas::aviso()`: si un servidor ya instalado tiene `SOPORTE_CORREO=` vacío, el dueño debe
  escribirlo (el actualizador no cambia líneas existentes).

## Pruebas

- `php server/tests/pruebas_correo.php` (64 casos: plantillas, SMTP falso sin cifrar/STARTTLS/SSL/PLAIN/LOGIN, errores,
  HTTP completo, concurrencia, límites, página, de punta a punta por SMTP).
- `NODE_PATH=/opt/npm-tools/node_modules node tests/test_correo.js` (Playwright 390x844 con el servidor real; capturas
  `tests/capturas/correo_*.png`).
- `bash server/tests/correr.sh` (incluye el bloque 3e y el check de nginx).
