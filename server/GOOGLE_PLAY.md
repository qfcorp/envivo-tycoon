# Google Play: conectar el servidor (paso a paso, para el dueño)

Esto sirve para que el servidor del juego (`server/src/Google.php`) le pregunte a Google si cada compra hecha en la app
de Android es real, la entregue **una sola vez** y quite lo entregado si Google devuelve el dinero.
La parte de crear la app y subirla está en `docs/ANDROID_GOOGLE_PLAY.md`. Aquí va solo lo del servidor.

Leyenda: 🌐 = en el navegador · ☁️ = en el VPS (por SSH o WinSCP)

---

## 1. 🌐 Crear la cuenta de servicio en Google Cloud (una sola vez, unos 10 minutos)

1. Entra a **console.cloud.google.com** con el **mismo Gmail** de Play Console.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre `envivo-play` → **Crear**.
3. Menú ☰ → **APIs y servicios** → **Biblioteca** → busca **Google Play Android Developer API** → **Habilitar**.
4. Menú ☰ → **IAM y administración** → **Cuentas de servicio** → **Crear cuenta de servicio**
   - Nombre: `envivo-servidor` → **Crear y continuar** → en "roles" no pongas nada → **Listo**.
5. Haz clic en la cuenta que creaste → pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → **JSON** → **Crear**.
   Se descarga un archivo `.json`.
   🔒 **Ese archivo es una llave secreta** (como la clave de Plux): no lo mandes por chat ni por correo, no lo subas a
   GitHub, y no lo dejes en la carpeta de Descargas cuando termines.
6. Copia el **correo** de la cuenta de servicio (se ve así: `envivo-servidor@envivo-play.iam.gserviceaccount.com`).

## 2. 🌐 Darle permiso en Play Console

Ya **no** hace falta "vincular" un proyecto en la página "Acceso a la API": basta con invitar al correo.

1. Play Console → menú de la izquierda → **Usuarios y permisos** → **Invitar a usuarios nuevos**.
2. Pega el correo de la cuenta de servicio.
3. Pestaña **Permisos de la app** → **Agregar app** → elige **EN VIVO Tycoon** y marca:
   - **Ver datos financieros, pedidos y respuestas a la encuesta de cancelación**
   - **Administrar pedidos y suscripciones**
4. **Invitar usuario**. Google puede tardar **hasta 24 horas** en activar el permiso (mientras tanto el servidor
   responde "No se pudo verificar la compra con Google Play").

## 3. 🌐 Crear los productos con los MISMOS ids de la tienda web

Play Console → **Monetizar con Play** → **Productos** → **Productos únicos** → **Crear producto**.
El **ID del producto** debe ser **exactamente** el de `server/src/Catalogo.php` (no se puede cambiar después).
Todos son **productos únicos** (ninguno es suscripción). Después de crear cada uno → **Activar**.

| ID del producto | Qué es | ¿Se vuelve a comprar? |
|---|---|---|
| `creditos_250`, `creditos_700`, `creditos_1500`, `creditos_3200` | Paquetes de créditos | Sí |
| `bienvenida` | Oferta de bienvenida | No (una vez por cuenta) |
| `inicio` | Paquete de inicio | No (una vez por cuenta) |
| `tarjeta_mensual` | Tarjeta mensual (30 días) | Sí |
| `vip30` | Pase VIP 30 días | Sí |
| `refuerzo_camarografo_senior`, `refuerzo_tecnico_internacional`, `alquiler_lente_box`, `seguro_evento`, `equipo_descansado` | Refuerzos | Sí |
| `pase_premium` ($4.99), `pase_premium_plus` ($9.99) | Pase de Temporada (dura la temporada de 28 días; no es suscripción) | Sí (uno por temporada) |
| `pack_obra_s` ($1.99), `pack_obra_m` ($4.99), `pack_obra_l` ($9.99) | Packs de obra de la sede oficial (contenido fijo) | Sí |
| `pase_copa` ($2.99) | Pase de Copa: +5 intentos por día esa semana | Sí |
| `oferta_vip_s` ($1.99), `oferta_vip_m` ($4.99), `oferta_vip_l` ($9.99), `oferta_campeon` ($4.99), `oferta_sede_5` ($4.99), `oferta_sede_10` ($9.99) | Ofertas por logros (aparecen al subir de nivel VIP, ganar una copa o subir la sede) | Con tope por oferta (lo controla el servidor) |

`estrella_copa` (personal estrella) **no** se crea en Play: se paga solo con créditos dentro del juego.

**No** crees `transferencia_cuenta` (solo se paga en la web). Los precios sugeridos están en `docs/ANDROID_GOOGLE_PLAY.md`
(sección 6). Si un id no coincide, el servidor responde "Ese producto no existe" y **no** entrega nada.

## 4. ☁️ Poner el archivo .json en el VPS

1. Con WinSCP, sube el `.json` a `/tmp/` del VPS.
2. Por SSH, muévelo a su lugar y protégelo (solo root lo puede cambiar; el juego, `www-data`, solo lo puede leer):

```
sudo mv /tmp/envivo-play-*.json /etc/envivo/google-play.json
sudo chown root:www-data /etc/envivo/google-play.json
sudo chmod 640 /etc/envivo/google-play.json
ls -l /etc/envivo/google-play.json
```

   Debe salir `-rw-r----- 1 root www-data ...`.
3. Borra el `.json` de tu computadora (Descargas y papelera). Si algún día lo pierdes, en Google Cloud se crea otra clave
   y se borra la vieja.
4. Edita la configuración:

```
sudo nano /etc/envivo/config.env
```

   Completa estas líneas (el nombre del paquete es el de tu app en Play Console):

```
GOOGLE_PACKAGE_NAME=com.tukanec.envivo
GOOGLE_SERVICE_ACCOUNT_JSON=/etc/envivo/google-play.json
```

   Las líneas `GOOGLE_API_BASE` y `GOOGLE_TOKEN_URL` son **solo para pruebas**: en el servidor deben quedar vacías o no estar.
   Guarda con **Ctrl + O**, Enter, **Ctrl + X** y recarga PHP:

```
sudo systemctl reload php8.3-fpm
```

## 5. ☁️ Revisión diaria de reembolsos

Cuando Google devuelve un dinero (reembolso o contracargo), el servidor quita lo que entregó y suspende la cuenta.
Google solo guarda las compras anuladas de los **últimos 30 días**, así que la revisión debe correr **todos los días**
(la programa `deploy/instalar.sh` cuando exista `bin/google_anulados.php`; ver `docs/INTEGRAR_SOPORTE_GOOGLE.md`). Para
correrla a mano:

```
sudo -u www-data php /var/www/envivo/server/bin/google_anulados.php
```

## 6. Probar sin pagar

Play Console (vista de todas las apps) → **Configuración** → **Pruebas de licencias** → agrega tu Gmail →
`RESPOND_NORMALLY`. Esas cuentas ven "Pedido de prueba" y Google **no cobra**, pero el juego sí entrega lo comprado.

## 7. Si algo falla: qué significa cada `codigo`

| codigo | Qué pasa | Qué hacer |
|---|---|---|
| `google_no_disponible` | Falta `GOOGLE_PACKAGE_NAME` o el `.json` (o www-data no lo puede leer) | Revisa el paso 4 (`ls -l`, permisos 640 root:www-data) |
| `google_error` | Google no respondió o no aceptó la llave | Espera las 24 h del permiso (paso 2); si sigue, crea otra clave .json |
| `google_invalida` | Google no conoce ese comprobante | Compra de otra app o de otro paquete: revisa `GOOGLE_PACKAGE_NAME` |
| `no_existe` | El id del producto no está en el catálogo | El id de Play Console debe ser igual al de la tabla del paso 3 |
| `google_pendiente` | El jugador pagó en efectivo y aún no se acredita | Nada: al aprobarse, la app lo vuelve a mandar |
| `google_otra_cuenta` | Ese comprobante ya se usó en otra cuenta del juego | Revisa el aviso en el Centro de Control |
| `cuenta_suspendida` | La cuenta está suspendida (reembolso o contracargo) | No se entrega; Google devuelve el dinero solo a los 3 días |
| `mantenimiento` | La tienda está en mantenimiento | Quita el mantenimiento en el Centro de Control |

Los errores también quedan en el registro de errores de PHP / nginx con el texto `EN VIVO Google:`. Para buscarlos:
`sudo grep -h "EN VIVO Google" /var/log/nginx/error.log /var/log/php8.3-fpm.log 2> /dev/null | tail -20`
