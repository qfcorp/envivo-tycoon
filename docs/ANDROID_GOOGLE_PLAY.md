# Publicar EN VIVO Tycoon en Google Play (app de Android)

Guía técnica paso a paso. **La lista corta y en orden para el dueño está en `docs/PUBLICAR_GOOGLE_PLAY.md`** (incluye
el robot de GitHub que construye el .aab, la prueba cerrada y la solicitud de producción). Lo que se hace a mano está marcado:

- 🖥️ **qfone**: en tu PC con Windows.
- 🌐 **Play Console**: en el navegador, en play.google.com/console.
- ☁️ **VPS**: en el servidor de OVH, por PuTTY.

Revisado el 23 oct 2026. Las fuentes están al final. Google cambia los nombres de los menús seguido: si un botón
no aparece igual, escribe la palabra en inglés que va entre paréntesis en la **lupa de arriba** de Play Console.

---

## 0. Cómo funciona (en 1 minuto)

- La app de Android es una **TWA** (Trusted Web Activity): una "cáscara" que abre **https://juego.tukanec.com**
  a pantalla completa con el Chrome del teléfono. Se arma con **Bubblewrap**, la herramienta oficial de Google.
- **Casi nunca hay que subir otra versión a Play.** Cuando cambias el juego en el VPS, la app lo recibe sola.
  Solo se sube una versión nueva cuando cambia la cáscara: ícono, nombre o requisitos anuales de Google.
- Para que Android confíe en que la app y la web son tuyas, la web publica un archivo:
  **`https://juego.tukanec.com/.well-known/assetlinks.json`**, con la "huella" (SHA-256) de la firma de la app.
  Si la huella no coincide, la app se ve con una barra de dirección arriba, como un navegador.
- **Dentro de la app, todo lo que se pague con dinero real se cobra con Google Play** (no con Plux).
  En Ecuador no existe otra opción ("facturación alternativa"): hoy ese programa es solo para Europa (EEA).
  El juego detecta si está dentro de la app (`js/googleplay.js`) y cambia la Tienda sola.
- Google cobra **15 %** de comisión sobre el primer millón de dólares al año (hay que **inscribirse** en ese nivel
  del 15 %; sin inscripción es 30 %). Esta comisión no se aplica a lo que se vende por la web con Plux.
  (Google cambia a 10 % + 5 % de facturación por región desde el 30 jun 2026; Latinoamérica a más tardar en sept. 2027:
  ver `docs/PUBLICAR_GOOGLE_PLAY.md`, paso 2.)

### Qué ya está listo en el repositorio

| Archivo | Para qué |
|---|---|
| `android/twa-manifest.json` | Configuración de la app para Bubblewrap (nombre, colores, ícono, Play Billing activado) |
| `.well-known/assetlinks.json` | Plantilla del archivo de huellas (las huellas `AA:AA…` y `BB:BB…` se reemplazan en el Paso 5) |
| `js/googleplay.js` | Compras con Google Play dentro de la app (lista de precios, comprar, restaurar). Fuera de la app no hace nada |
| `tests/test_googleplay.js` | Prueba automática de lo anterior: `node tests/test_googleplay.js` |
| `server/src/Google.php` | Lo hace otra persona: verifica cada compra con Google, la entrega y la confirma (`POST /api/google/verificar`) |

---

## 1. Reglas de Google que debe cumplir el juego (léelas antes)

| Regla | Qué significa para EN VIVO |
|---|---|
| **Pagos solo con Google Play** | Créditos, VIP, tarjeta mensual, paquete de inicio, bienvenida y refuerzos: dentro de la app se compran **solo** con Google Play. |
| **Prohibido mandar a pagar por fuera** | Dentro de la app **no** puede haber botones, enlaces ni textos como "compra más barato en juego.tukanec.com" ni "paga con tarjeta en Plux". Tampoco en la ficha de Play Store. Fuera de la app (Instagram, Facebook, tu web) sí puedes hablar de la tienda web. |
| **Lo comprado en la web sí se puede usar en la app** | Si alguien compró créditos en la web con Plux y entra con su cuenta en la app, los tiene. Eso está permitido. Lo que no se puede es *venderlos* en la app por fuera de Google. |
| **El precio que se muestra = el de Google** | En la app se muestra el precio que da Google Play (moneda e impuestos del país del jugador), no el de `Catalogo.php`. |
| **Créditos solo para este juego** | Los créditos comprados se usan solo dentro de EN VIVO. El mercado entre jugadores con créditos está bien. El juego nunca maneja dinero real entre jugadores. |
| **Cajas sorpresa** | Si algún día se vende algo al azar (cajas, sobres), hay que mostrar las probabilidades **antes** de comprar. Hoy no hay. |
| **Transferencia de cuenta ($9,99)** | Es un servicio digital. En la app se vende con Google Play o **no se ofrece**. Recomendado: no mostrarla en la app, solo en la web. |
| **Chat (contenido de usuarios)** | Debe haber: (1) términos aceptados **antes** de escribir en el chat, (2) qué está prohibido (insultos, estafas, contenido sexual…), (3) botón para **reportar** y para **bloquear** dentro del juego (ya existe: "Reportar y bloquear"), (4) moderación de verdad y continua (el panel ya tiene ocultar, silenciar y expulsar). |
| **Borrar la cuenta** | Como se puede crear una cuenta, el jugador debe poder **pedir que se borre** desde el juego **y** desde una página web cuyo enlace va en el formulario "Seguridad de los datos". ✅ Ya existe: Cuenta → Borrar mi cuenta, y `https://juego.tukanec.com/borrar-cuenta.html`. |
| **Compras sin confirmar** | Si el servidor no confirma la compra en **3 días**, Google le devuelve el dinero al jugador y le quita lo comprado. `Google.php` lo confirma al instante. Si se cae, `GooglePlay.restaurar()` vuelve a intentar cada vez que se abre la app. |
| **Reembolsos y contracargos** | Si Google devuelve el dinero, el servidor debe **quitar** lo entregado. Lo hace `bin/google_anulados.php` con la API de compras anuladas (Voided Purchases), que solo guarda los últimos **30 días**: debe correr por lo menos una vez al día. |
| **Requisitos técnicos 2026** | Desde el 31 ago 2026, las apps nuevas deben apuntar a **Android 16 (API 36)** y usar **Play Billing Library 8 o más nueva**. Bubblewrap 1.27.0 ya lo cumple: API 36 y la librería de pagos `androidbrowserhelper:billing:1.2.0`, que usa Play Billing **8.3.0**. |
| **Firma con Play App Signing** | Es obligatoria en las apps nuevas. Google guarda la llave final y tú firmas con una "llave de subida" (tu archivo `android.keystore`). |
| **Cuenta personal nueva** | Antes de salir al público hay que hacer una **prueba cerrada** con **mínimo 12 personas** que estén inscritas **14 días seguidos**. |
| **Dirección pública** | Como la app vende cosas, Google muestra en Play Store la **dirección completa** de tu perfil de pagos. Ecuador sí puede vender en Play. |
| **Edad** | Por el chat, el mercado y las compras, declara el público como **mayores de 13 años** (mejor **16+**), **no** niños. Si marcas niños, aplican reglas de "Familias" mucho más estrictas. |

---

## 2. Antes de empezar

1. Que el juego ya esté funcionando en **https://juego.tukanec.com** (guía `docs/DESPLIEGUE.md`).
2. Que tu cuenta de Play Console esté **verificada** (identidad y teléfono).
3. 🌐 **Perfil de pagos (cuenta de comerciante):** Play Console → **Configuración** (Settings) → **Perfil de pagos**
   (Payments profile) → crear o vincular. Aquí van tus datos para cobrar y la cuenta bancaria. Sin esto **no se
   pueden crear productos** para vender.
4. 🌐 **Nivel del 15 %:** Play Console → busca **"15% service fee"** (nivel de tarifa de servicio del 15 %) → inscríbete.
5. Ten a mano **12 correos de Gmail** de personas que vayan a probar la app (familia, equipo de QF, amigos).

---

## 3. ☁️ El archivo de huellas en el VPS (ya está listo en nginx)

nginx ya deja ver `/.well-known/assetlinks.json` (la plantilla `server/deploy/nginx-sitio.sh` lo trae, y `instalar.sh`
la escribe cada vez). No hay que agregar nada a nginx. El archivo es `.well-known/assetlinks.json` del repositorio: llega
al VPS con `actualizar.sh` cuando sus huellas estén puestas (Paso 5). No lo edites a mano en el VPS.

Condiciones de Google para ese archivo: **https**, respuesta **200** sin redirecciones, tipo `application/json` y
JSON perfecto (una coma de más lo rompe). Prueba en el VPS después de actualizar:

```
curl -sI https://juego.tukanec.com/.well-known/assetlinks.json | head -5
curl -s https://juego.tukanec.com/.well-known/assetlinks.json | python3 -m json.tool
```

Debe decir `HTTP/2 200` y `content-type: application/json`, y mostrar el JSON sin errores.

---

## 4. 🖥️ qfone: crear la app con Bubblewrap (45 a 60 minutos la primera vez)

### 4.1 Instalar lo necesario

1. Descarga e instala **Node.js LTS** desde **nodejs.org** (botón verde "LTS"). Usa las opciones de siempre: Next, Next, Install.
2. Abre **Símbolo del sistema** (tecla Windows → escribe `cmd` → Enter). Usa este y **no PowerShell**: PowerShell a veces bloquea los comandos de npm.
3. Instala Bubblewrap (copia y pega):

```
npm install -g @bubblewrap/cli@1.27.0
```

4. Revisa que quedó instalado:

```
bubblewrap help
```

### 4.2 Crear la carpeta del proyecto Android

Va **fuera** de la carpeta del repositorio, para que la llave nunca termine en GitHub:

```
mkdir C:\envivo-android
cd C:\envivo-android
```

### 4.3 Crear el proyecto

```
bubblewrap init --manifest=https://juego.tukanec.com/manifest.webmanifest
```

La primera vez pregunta si quiere instalar el **JDK** y el **Android SDK**: responde **Yes** (`Y`) a los dos y
acepta los términos (`y`). Descarga como 1 GB: espera. Se instala en `C:\Users\<tu usuario>\.bubblewrap\`.
⚠️ Si tu usuario de Windows tiene espacios en el nombre, avísame antes: el Android SDK no funciona con espacios en la ruta.

Después te pregunta los datos de la app. Responde así (Enter acepta lo que sale entre paréntesis):

| Pregunta | Respuesta |
|---|---|
| Domain | `juego.tukanec.com` |
| URL path | `/index.html?origen=android` |
| Application name | `EN VIVO Tycoon` |
| Short name | `EN VIVO` |
| Application ID | `com.tukanec.envivo` ⚠️ **no se puede cambiar nunca** (lee la nota de abajo) |
| Starting version code | `1` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar color | `#0D0F14` |
| Splash screen color | `#0D0F14` |
| Icon URL | `https://juego.tukanec.com/icons/icon-512.png` |
| Maskable icon URL | `https://juego.tukanec.com/icons/icon-maskable-512.png` |
| Include app shortcuts? | `No` |
| Monochrome icon URL | (Enter, vacío) |
| Include support for Play Billing? | **`Yes`** |
| Request geolocation permission? | `No` |
| Key store location | (Enter: `./android.keystore`) |
| Key name | (Enter: `android`) |
| Do you want to create one now? | `Yes` |
| First and Last names | `Dimitry Fierro` |
| Organizational Unit | `QF Producciones` |
| Organization | `QF Producciones` |
| Country | `EC` |
| Password for the Key Store / for the Key | Inventa una contraseña **larga** (mínimo 12 caracteres). Puede ser la misma para las dos. **Anótala** (ver 4.5) |

> **Nota sobre el Application ID (`com.tukanec.envivo`)**: es el identificador de la app en Play Store para siempre.
> Si prefieres otro (por ejemplo `com.tukanec.envivo`), decídelo **ahora**, antes de subir la primera versión, y
> usa el **mismo** en los 3 lugares: aquí, en `android/twa-manifest.json` / `.well-known/assetlinks.json`, y en
> `GOOGLE_PACKAGE_NAME` del servidor (Paso 8).

### 4.4 Usar la configuración preparada y construir

1. Copia el archivo `android\twa-manifest.json` del repositorio encima del `C:\envivo-android\twa-manifest.json` que
   se acaba de crear (reemplázalo). Trae todo ya puesto: colores `#0d0f14`, Play Billing activado, notificaciones
   activadas (Bubblewrap las exige para Play Billing), acceso a "Configuración del sitio", plan B de Chrome Custom Tabs
   si el teléfono no tiene Chrome, Android 7.0 o más nuevo (`minSdkVersion 24`, lo exige la librería de pagos).
2. Aplica la configuración y construye:

```
cd C:\envivo-android
bubblewrap update --skipVersionUpgrade
bubblewrap build
```

`build` te pide las 2 contraseñas de la llave. Si pregunta por "PWA validation" o "Quality Criteria", deja que la haga.
Al terminar aparecen en `C:\envivo-android`:

- **`app-release-bundle.aab`** → el que se sube a Google Play.
- `app-release-signed.apk` → para instalar a mano en un teléfono (no se sube).

### 4.5 🔒 Guardar la llave (MUY importante)

El archivo **`C:\envivo-android\android.keystore`** y sus contraseñas son la "llave de subida" de la app.

- Haz **2 copias** del archivo `android.keystore`: una en una memoria USB que guardes en casa y otra en tu Google
  Drive personal dentro de un `.zip` con contraseña (por ejemplo con 7-Zip, cifrado AES-256).
- Guarda las contraseñas en un gestor de contraseñas o en papel, **separadas** del archivo.
- **Nunca** la subas a GitHub (el repositorio es público), **nunca** la mandes por chat ni correo, y **nunca** la
  pegues en una conversación con Claude.
- Con Play App Signing, si se pierde la llave de subida, Google la puede **cambiar** (lo pides en Play Console →
  Integridad de la app → "Solicitar restablecimiento de la llave de subida"), pero tarda días. Sin copia
  tampoco puedes sacar actualizaciones mientras tanto.

---

## 5. 🌐 Play Console: crear la app y subir la primera versión

1. Play Console → **Crear app** (Create app).
   - Nombre: `EN VIVO Tycoon` · Idioma: Español (Latinoamérica) · **Juego** · **Gratis**.
   - Marca las declaraciones (políticas y leyes de exportación) → **Crear app**.
2. Menú → **Prueba y lanzamiento** (Test and release) → **Pruebas** (Testing) → **Prueba interna** (Internal testing)
   → **Crear versión** (Create new release).
3. Si pregunta por la firma, deja **"Firma de apps de Google Play"** (Play App Signing, recomendado) → Continuar.
4. Sube **`app-release-bundle.aab`**. Nombre de versión: `1.0.0`. Notas: "Primera versión". → **Siguiente** → **Guardar y publicar**.
5. En **Testers** (pestaña de la prueba interna) crea una lista con tu correo y el de 1 o 2 personas más. Copia el **enlace para unirse**.

### 5.1 Copiar las huellas al archivo de la web

1. Menú → **Prueba y lanzamiento** (Test and release) → **Integridad de la app** (App integrity) →
   **Firma de apps** (App signing).
2. Ahí hay 2 certificados. Copia la **"Huella digital del certificado SHA-256"** de los dos:
   - **Certificado de la clave de firma de apps** (App signing key certificate): el que usa la app bajada de Play.
   - **Certificado de la clave de subida** (Upload key certificate): el que usa el `.apk` que instalas a mano.
3. **Mándame esas 2 huellas** (son públicas, no son secretas: tienen la forma `12:AB:34:…`, 32 pares). Yo las
   pongo en `.well-known/assetlinks.json`, en lugar de `AA:AA…` y `BB:BB…`, y lo subimos al VPS con la
   actualización de siempre.
   Si lo quieres hacer tú en qfone:

```
cd C:\envivo-android
bubblewrap fingerprint add 12:AB:...(huella de firma de apps)... --name=play
bubblewrap fingerprint add 34:CD:...(huella de subida)... --name=subida
bubblewrap fingerprint generateAssetLinks
```

   Eso crea `C:\envivo-android\assetlinks.json`, con el mismo contenido que va en `.well-known/assetlinks.json` del repositorio.
4. Comprueba que Google lo lee bien: abre en el navegador

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://juego.tukanec.com&relation=delegate_permission/common.handle_all_urls
```

   Debe aparecer `com.tukanec.envivo` y tus huellas. Si sale vacío, el archivo no está publicado o tiene un error.
5. En el teléfono: abre el **enlace de la prueba interna**, instala la app desde Play y ábrela. **No debe verse
   ninguna barra de dirección arriba.** Si se ve, la huella no coincide (vuelve al punto 2).

---

## 6. 🌐 Crear los productos en Play Console

Menú → **Monetizar con Play** (Monetize with Play) → **Productos** (Products) → **Productos únicos** (One-time products) → **Crear producto**.

- El **ID del producto** debe ser **exactamente** el del servidor (no se puede cambiar después).
- Todos son **productos únicos** (no "suscripciones"): VIP y tarjeta mensual **no** se renuevan solos en el juego.
- Precio: pon el precio en USD **con impuestos incluidos** y deja que Google calcule los demás países.
  (Consulta con tu contador cómo factura el IVA de Ecuador en las ventas por Google Play.)
- Después de crear cada uno → **Activar** (Activate).

| ID del producto | Nombre | Precio sugerido (USD) | ¿Se vuelve a comprar? |
|---|---|---|---|
| `creditos_250` | 250 créditos | 1,99 | Sí |
| `creditos_700` | 700 créditos | 4,99 | Sí |
| `creditos_1500` | 1.500 créditos | 9,99 | Sí |
| `creditos_3200` | 3.200 créditos | 19,99 | Sí |
| `bienvenida` | Oferta de bienvenida | 0,99 | No (una vez por cuenta) |
| `inicio` | Paquete de inicio | 2,99 | No (una vez por cuenta) |
| `tarjeta_mensual` | Tarjeta mensual | 4,99 | Sí |
| `vip30` | Pase VIP 30 días | 9,99 | Sí |
| `refuerzo_camarografo_senior` | Camarógrafo senior de refuerzo | 0,99 | Sí |
| `refuerzo_tecnico_internacional` | Técnico de streaming internacional | 0,99 | Sí |
| `alquiler_lente_box` | Alquiler de lente box 100x | 0,99 | Sí |
| `seguro_evento` | Seguro de evento | 0,99 | Sí |
| `equipo_descansado` | Equipo descansado | 0,99 | Sí |

(Los precios salen de `server/src/Catalogo.php`. Los refuerzos se venden directo a 0,99 según `GOOGLE_PRECIO_REFUERZO`.
No crees `transferencia_cuenta`.)

⚠️ Esta tabla tiene solo los productos de la versión 1. La **lista completa** (pases de temporada, packs de obra,
pase de copa, ofertas VIP…), con nombres, descripciones y cuáles están pendientes de confirmar, está en
`docs/PUBLICAR_GOOGLE_PLAY.md`, paso 7; los precios por país (Colombia, Perú), en el paso 17.

---

## 7. 🌐 Que puedas probar compras sin pagar

1. Play Console, en la vista de **todas las apps** (arriba a la izquierda) → **Configuración** (Settings) →
   **Pruebas de licencias** (License testing).
2. Agrega tu Gmail y los de quienes prueban → **Respuesta de licencia**: `RESPOND_NORMALLY` → Guardar.
3. Esas cuentas ven "Pedido de prueba" (Test order) en la ventana de Google y **no se les cobra**.
   La compra igual pasa por el servidor y entrega los créditos de verdad en el juego.

---

## 8. Conectar el servidor con Google (cuenta de servicio)

Esto lo usa `server/src/Google.php` para preguntarle a Google si cada compra es real. Detalles en `server/GOOGLE_PLAY.md`
(lo escribe quien hace el servidor).

1. 🌐 Entra a **console.cloud.google.com** con el mismo Gmail → crea un proyecto llamado `envivo-play`.
2. Menú → **APIs y servicios** → **Biblioteca** → busca **"Google Play Android Developer API"** → **Habilitar**.
3. Menú → **IAM y administración** → **Cuentas de servicio** → **Crear cuenta de servicio** → nombre `envivo-servidor`
   → Crear y continuar → (sin roles) → Listo.
4. Entra a esa cuenta → pestaña **Claves** → **Agregar clave** → **Crear clave nueva** → **JSON** → se descarga un archivo `.json`.
   🔒 Ese archivo es **secreto**, igual que las claves de Plux: no va a GitHub ni al chat.
5. Copia el correo de la cuenta de servicio (`envivo-servidor@envivo-play.iam.gserviceaccount.com`).
6. 🌐 Play Console → **Usuarios y permisos** (Users and permissions) → **Invitar a usuarios nuevos** → pega ese correo
   → pestaña **Permisos de la app** → agrega EN VIVO Tycoon con: **Ver datos financieros** (View financial data) y
   **Administrar pedidos y suscripciones** (Manage orders and subscriptions) → **Invitar**.
   Google puede tardar hasta 24 horas en activar el permiso.
7. ☁️ Sube el `.json` al VPS con WinSCP a `/etc/envivo/google-play.json` y luego:

```
sudo chown root:www-data /etc/envivo/google-play.json
sudo chmod 640 /etc/envivo/google-play.json
sudo nano /etc/envivo/config.env
```

   Agrega o completa estas 2 líneas, guarda (**Ctrl + O**, Enter, **Ctrl + X**) y recarga PHP:

```
GOOGLE_PACKAGE_NAME=com.tukanec.envivo
GOOGLE_SERVICE_ACCOUNT_JSON=/etc/envivo/google-play.json
```

```
sudo systemctl reload php8.3-fpm
```

8. ☁️ Revisión diaria de reembolsos: que `bin/google_anulados.php` corra **todos los días** (lo deja programado
   quien hace el servidor; con eso se quita lo entregado cuando Google devuelve un dinero).
   `/etc/envivo/google-play.json` ya queda en el respaldo de cada noche si `/etc/envivo` está en restic.

---

## 9. Probar todo en el teléfono (prueba interna)

Con la app instalada desde el **enlace de la prueba interna** y tu Gmail en "Pruebas de licencias":

1. Abre la app → **Tienda** → entra con tu cuenta del juego.
2. Los precios deben verse con el formato de Google (por ejemplo `US$ 4,99`) y **no** debe aparecer nada de Plux ni de "juego.tukanec.com".
3. Compra `700 créditos` → sale la ventana de Google con "Pedido de prueba" → aceptar → los créditos llegan en segundos.
4. Revisa en `https://juego.tukanec.com/admin.php` que la venta aparece con canal **google_play**.
5. Compra el **Paquete de inicio** → después ya no debe dejar comprarlo otra vez.
6. Prueba "sin internet": compra, apaga los datos justo después de pagar, cierra la app, vuelve a prender los datos
   y abre la app: la compra debe llegar sola (restaurar).
7. Reembolso de prueba: Play Console → **Administración de pedidos** (Order management) → busca el pedido →
   **Reembolsar** marcando "Quitar derecho" (Revoke). Al día siguiente (o al correr `bin/google_anulados.php`) los
   créditos deben descontarse.

---

## 10. 🌐 Llenar la ficha y los formularios

En **Panel** (Dashboard) → "Configura tu app", completa todo:

- **Política de privacidad**: `https://juego.tukanec.com/privacidad.html` (que mencione Google Play y el chat).
- **Acceso a la app**: Play revisa el juego. Si algo necesita cuenta, da un usuario y contraseña de prueba.
- **Anuncios**: "No, mi app no contiene anuncios" (si es así).
- **Clasificación de contenido** (cuestionario IARC): categoría Juego. Responde **Sí** a: los usuarios pueden
  interactuar/chatear, compras digitales. Responde la verdad sobre violencia, apuestas, etc. (no hay apuestas).
- **Público objetivo**: **16-17 y 18 o más** (decisión: 16+). **No** marques niños ni 13-15.
- **Seguridad de los datos** (Data safety): correo y nombre (cuenta), compras, mensajes del chat, partida guardada;
  todo **cifrado en tránsito** (https). Enlace web para borrar la cuenta: `https://juego.tukanec.com/borrar-cuenta.html`.
  Respuestas completas en `docs/play_store/README.md` §2.6.
- **Ficha de Play Store**: descripción, ícono 512×512 (`icons/icon-512.png`), imagen destacada de 1024×500 y
  mínimo 2 capturas del celular (sirven las de `tests/capturas/`). **No** escribas que se puede comprar en la web.

---

## 11. 🌐 Prueba cerrada de 14 días y salida al público

1. **Prueba y lanzamiento** → **Pruebas** → **Prueba cerrada** (Closed testing) → crea una versión con el **mismo** `.aab`
   (o uno nuevo) → agrega una lista de testers con los **12 Gmail o más**.
2. Manda el enlace de la prueba a esas 12 personas: tienen que **aceptar** el enlace e **instalar** la app.
   Pídeles que la abran varias veces en esos días y que te comenten.
3. Espera **14 días seguidos** con las 12 inscritas (si alguien se sale, su cuenta de días vuelve a empezar).
4. **Panel** → **Solicitar acceso a producción** (Apply for production) → responde el cuestionario (respuestas
   listas, mensajes para reclutar testers y grupo de Google en `docs/PUBLICAR_GOOGLE_PLAY.md`, pasos 12 a 15).
5. Cuando lo aprueben (pueden tardar unos días): **Producción** → **Crear versión** → el mismo `.aab` → **Países**:
   Ecuador (y los que quieras) → **Enviar a revisión**.

---

## 12. Actualizar la app más adelante

- **Cambios del juego** (nuevos eventos, precios, arreglos): solo se suben al VPS. **No** hace falta tocar Play.
- **Cambios de la cáscara** (ícono, nombre, versión de Bubblewrap, requisito anual de Google): en qfone:

```
npm install -g @bubblewrap/cli@latest
cd C:\envivo-android
bubblewrap update
bubblewrap build
```

  `update` sube solo el número de versión. Después subes el nuevo `app-release-bundle.aab` en Play Console
  (Producción → Crear versión).
- **Cada año, antes del 31 de agosto**, Google sube el API mínimo y la versión de Play Billing exigida.
  Play Console avisa en **Estado de la política** (Policy status). Actualizar Bubblewrap y volver a construir suele bastar.

---

## 13. Para quien programa

### 13.1 Lo que falta conectar (archivos que esta tarea no tocó)

1. **`index.html`**: agregar `<script src="js/googleplay.js"></script>` **antes** de `js/ui.js`.
2. **`sw.js`**: agregar `'./js/googleplay.js'` a `SHELL` y subir `VERSION`.
3. **`tools/build_single.js`**: agregar `'js/googleplay.js'` a la lista (antes de `js/ui.js`).
4. **`server/deploy/nginx-sitio.sh`**: la línea de `/.well-known/assetlinks.json` (Sección 3). `/js/googleplay.js`
   ya entra con la regla de `/js/`.
5. **Servidor (`Google.php`)**: ⚠️ dentro de la TWA, el pago **no devuelve `orderId`**. android-browser-helper
   responde solo `{ token, purchaseToken }`, y `listPurchases()` da solo `{ itemId, purchaseToken }`.
   `js/googleplay.js` manda `orderId: ""`. El servidor debe aceptar `orderId` vacío y usar el `orderId` que
   devuelve `purchases.products.get`. Tampoco se puede mandar `obfuscatedAccountId` desde la TWA, así que la cuenta
   queda amarrada por la sesión: la primera cuenta que verifica el token se queda con la compra.
6. **Precios y facturas**: el `total` que guarda `compras` sale de `Catalogo.php`, pero el jugador pagó el precio
   de Google (en su moneda) y Google se queda con su comisión. Para los reportes, conviene guardar lo que responde Google.

### 13.2 Cambios en `js/ui.js` (Tienda)

Reglas:

- Si `GooglePlay.enApp()` es `true`, **nunca** mostrar Plux, "Pago con tarjeta por Pago Plux", el texto
  "La tienda funciona en juego.tukanec.com" ni enlaces a `pago.php`. Esto vale aunque Play Billing no
  esté disponible: en ese caso se muestra "Las compras no están disponibles en este dispositivo".
- Si `await GooglePlay.disponible()` es `true`: precios de `GooglePlay.productos(ids)` y compra con `GooglePlay.comprar(id)`.
- Llamar `GooglePlay.comprar(id)` **directo en el clic**, sin `await` antes (nada de `await subirNube()` antes):
  Chrome exige un toque reciente del usuario para abrir la ventana de pago. La nube se guarda después.
- Productos que no devuelve Google (inactivos en Play Console): no se muestran en la app.
- Ocultar `transferencia_cuenta` y cualquier texto que invite a comprar en la web.
- Llamar `GooglePlay.restaurar()` al abrir el juego (después de `Api.iniciar()`) y al entrar a la cuenta.

Ejemplo (adaptarlo a `renderTienda`, `comprar` y el arranque):

```js
// Arranque, después de Api.iniciar() / alConectar():
const enApp = window.GooglePlay && GooglePlay.enApp();
let playOk = false, preciosPlay = {};
if (window.GooglePlay && Api.disponible) {
  playOk = await GooglePlay.disponible();
  if (playOk) {
    const ids = (Api.estado.tienda.productos || []).map((p) => p.id);
    (await GooglePlay.productos(ids)).forEach((p) => { preciosPlay[p.id] = p; });
    if (Api.logueado()) {
      const r = await GooglePlay.restaurar();
      if (r.entregadas.length) { await Api.refrescar(); aplicarEntregas(); render(); toast('¡Tu compra de Google Play llegó!'); }
    }
  }
}

// En renderTienda(): precio y botón
//   enApp && !playOk  -> "Las compras no están disponibles en este dispositivo." (sin Plux, sin enlaces)
//   playOk            -> precio = preciosPlay[p.id].precio ; si no hay preciosPlay[p.id], no mostrar el producto
//   texto de ayuda    -> "Pagos procesados por Google Play." (no "Pago Plux")

// En comprar(id), rama de la app:
function comprarPlay(id) {
  if (!Api.logueado()) { abrirCuenta('registro', 'Crea tu cuenta para comprar: así tus compras quedan guardadas.'); return; }
  GooglePlay.comprar(id).then(async (r) => {          // <- primera línea del clic
    if (r.ok) { snd.play('buy'); await Api.refrescar(); aplicarEntregas(); save(); render(); toast(r.mensaje); subirNube(); }
    else if (r.estado === 'cancelado') { /* nada */ }
    else if (r.estado === 'pendiente') toast(r.mensaje);
    else { toast(r.mensaje); snd.play('error'); }
  });
}
```

### 13.3 Cómo funciona `js/googleplay.js`

- `disponible()`: `window.getDigitalGoodsService('https://play.google.com/billing')`. Solo existe dentro de la TWA,
  en https, con Chrome 101 o más nuevo. Si falla o tarda más de 6 s → `false`.
- `productos(ids)` → `service.getDetails(ids)` → precio formateado con `Intl.NumberFormat` (moneda del jugador).
- `comprar(id)` → `new PaymentRequest([{ supportedMethods: 'https://play.google.com/billing', data: { sku: id } }], …).show()`
  → `details.purchaseToken` → `POST /api/google/verificar { producto, purchaseToken, orderId }` (con `X-Envivo: 1`)
  → si el servidor confirma: `service.consume(token)` como respaldo (solo para lo que se vuelve a comprar; los de
  una sola vez los **reconoce** el servidor con `acknowledge`). Nunca consume antes de que el servidor confirme.
- `restaurar()` → `service.listPurchases()` → manda al servidor los comprobantes que este celular todavía no vio
  confirmados (se recuerdan en `localStorage` como `envivo_gp_hechos`). El servidor es idempotente (`nueva: false`).
- `enApp()`: `document.referrer` que empieza con `android-app://`, o `?origen=android` (el `startUrl` de
  `twa-manifest.json`). Se recuerda en `sessionStorage` (no en `localStorage`, porque la TWA comparte datos con Chrome).
- Prueba: `node tests/test_googleplay.js` (Playwright, con Google y el servidor simulados).
- Prueba en un teléfono real sin bajar de Play: Android 9+, opciones de desarrollador, Chrome 101+,
  activar `chrome://flags/#enable-debug-for-store-billing`, instalar `app-release-signed.apk` y que el Gmail esté
  en Pruebas de licencias. La app debe estar subida a algún canal de prueba con los productos activos.
- Diagnóstico si sale la barra de dirección: con el teléfono conectado por USB,
  `adb logcat -v brief | findstr /i "OriginVerifier digital_asset_links"`. "Statement failure matching fingerprint" = huella equivocada.

---

## Fuentes

- Usar Google Play Billing en una TWA (Digital Goods API + Payment Request, `#enable-debug-for-store-billing`, acknowledge en 3 días): https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing y https://developer.chrome.com/docs/android/trusted-web-activity/billing
- Especificación de la Digital Goods API (getDetails, listPurchases, consume; no existe acknowledge en el cliente): https://wicg.github.io/digital-goods/
- Bubblewrap CLI (campos de `twa-manifest.json`, comandos, JDK 17): https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md · versiones: https://github.com/GoogleChromeLabs/bubblewrap/releases (1.25.0 sube targetSdk a 36; 1.27.0 usa android-browser-helper 2.7.4). Revisado en el paquete npm `@bubblewrap/core@1.27.0`: `targetSdkVersion 36`, `com.google.androidbrowserhelper:billing:1.2.0`, Play Billing exige `enableNotifications: true`.
- android-browser-helper billing 1.2.0 = Play Billing Library 8.3.0 (y respuesta del pago `{token, purchaseToken}`): https://github.com/GoogleChrome/android-browser-helper/releases y el código `playbilling/` de ese repositorio
- Digital Goods API y Play Billing Library 7 (billing 1.1.0, Bubblewrap 1.23.0): https://developers.google.com/chromeos/app-development/news/upgrade-digital-goods-api-to-google-play-billing-library-7
- Plazos de Play Billing Library (v8 obligatoria desde el 31 ago 2026, prórroga hasta el 1 nov 2026): https://developer.android.com/google/play/billing/deprecation-faq
- API objetivo (Android 16 / API 36 desde el 31 ago 2026): https://developer.android.com/google/play/requirements/target-sdk · https://support.google.com/googleplay/android-developer/answer/11926878
- Procesar compras (verificar en el servidor, PENDING, acknowledge en 3 días, consume): https://developer.android.com/google/play/billing/integrate
- Compras anuladas (Voided Purchases API, 30 días, cuotas): https://developers.google.com/android-publisher/voided-purchases · notificaciones en tiempo real: https://developer.android.com/google/play/billing/rtdn-reference
- Política de Pagos (Play Billing obligatorio, no dirigir a otros métodos, precios, cajas sorpresa): https://support.google.com/googleplay/android-developer/answer/9858738 · preguntas frecuentes (apps de "solo consumo", enlaces permitidos): https://support.google.com/googleplay/android-developer/answer/10281818
- Facturación alternativa (solo EEA): https://support.google.com/googleplay/android-developer/answer/12348241
- Contenido generado por usuarios (términos, reportar, bloquear, moderación): https://support.google.com/googleplay/android-developer/answer/9876937
- Borrado de cuenta (dentro de la app + enlace web): https://support.google.com/googleplay/android-developer/answer/13327111
- Cuentas personales nuevas (12 testers, 14 días): https://support.google.com/googleplay/android-developer/answer/14151465
- Datos públicos del desarrollador (dirección si la app vende): https://support.google.com/googleplay/android-developer/answer/13634081
- Comisión del 15 %: https://support.google.com/googleplay/android-developer/answer/112622
- Ecuador puede vender en Play: https://www.androidpolice.com/2018/03/02/developers-ecuador-can-now-sell-paid-apps-play-store/ · ubicaciones admitidas: https://support.google.com/googleplay/android-developer/answer/9306917
- Digital Asset Links, huellas de Play App Signing y diagnóstico: https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs
