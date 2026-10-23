# Publicar EN VIVO Tycoon en Google Play: lista de pasos desde cero

Esta es la **lista corta y en orden**, para ir marcando. Cada paso dice dónde se hace y qué copiar.
Cuando un paso necesita más detalle, te manda a la guía larga `docs/ANDROID_GOOGLE_PLAY.md` (técnica) o a
`docs/play_store/README.md` (formularios). Revisado el **23 oct 2026** con las reglas de Google vigentes (fuentes al final).

- 📱 = en tu celular Android · 🖥️ = en tu PC con Windows (qfone) · 🌐 = en el navegador · 🐙 = en GitHub · ☁️ = en el VPS
- Datos fijos de la app: nombre **EN VIVO Tycoon** · paquete **`com.tukanec.envivo`** (no se cambia nunca) ·
  web **https://juego.tukanec.com** · cuenta de Play Console **personal** (dimitryfierro@gmail.com).

> **Tiempo total aproximado:** 1 tarde para los pasos 1 a 11; luego **14 días** de prueba cerrada (pasos 12 a 14);
> luego la revisión de Google para producción (normalmente hasta 7 días) y la salida al público (pasos 15 a 18).

---

## FASE A · La cuenta (una sola vez)

### Paso 1 · 🌐📱 Verificar la cuenta y tu teléfono Android
1. Entra a **play.google.com/console**. En **Inicio** termina todas las tareas de verificación que aparezcan
   (identidad, número de teléfono, correo de contacto).
2. Tarea **"Verifica que tienes acceso a un dispositivo móvil Android"** → **Ver detalles** → escanea el código QR con
   tu celular Android (Android 10 o más nuevo, sin root) → se instala la app **Play Console** → entra con el mismo
   Gmail → **Verificar**. Tarda menos de un minuto.

### Paso 2 · 🌐 Perfil de pagos y comisión del 15 %
1. Play Console → **Configuración** → **Perfil de pagos** → crear perfil (datos de QF Producciones / tuyos y la cuenta
   bancaria donde Google deposita). Sin esto **no se pueden crear productos**.
   ⚠️ Como la app vende cosas, Google muestra en la ficha la **dirección** de este perfil.
2. **Comisión del 15 %** (si no te inscribes, Google cobra **30 %**):
   Play Console → **Configuración** → **Cuentas de desarrollador asociadas** (Associated developer accounts) →
   **Crear grupo de cuentas** → tu cuenta como principal → a la pregunta "¿tienes otras cuentas de desarrollador
   asociadas?" responde **No** → en el aviso que sale arriba → **Revisar e inscribirse** → acepta las condiciones →
   **Aceptar e inscribirse**. La rebaja cuenta desde el día en que terminas la inscripción.
3. 📌 **Cambio de comisiones de 2026:** Google empezó un esquema nuevo (10 % de servicio + 5 % por usar Google Play
   Billing en el primer millón al año) el 30 jun 2026 en EE. UU., Reino Unido y Europa; llega al **resto del mundo
   (incluida Latinoamérica) a más tardar en septiembre de 2027**. Para Ecuador, Colombia y Perú, **hoy** sigue
   valiendo el 15 % con inscripción. Si Play Console te muestra un aviso para pasarte al esquema nuevo, léelo y
   pregúntame antes de aceptar.

---

## FASE B · Hacer la app (.aab) y subirla

Hay **dos caminos**. Usa el **A** la primera vez (crea la llave). Después puedes usar el **B** para no depender del PC.
⚠️ La **llave** (`android.keystore`) es una sola para siempre: la que crees en el camino A es la que va a GitHub.

### Paso 3A · 🖥️ Camino A: en tu PC con Bubblewrap (45 a 60 min la primera vez)
Sigue `docs/ANDROID_GOOGLE_PLAY.md`, **sección 4** (instalar Node.js, `npm install -g @bubblewrap/cli@1.27.0`,
`bubblewrap init`, copiar `android\twa-manifest.json`, `bubblewrap update --skipVersionUpgrade`, `bubblewrap build`).
Al final tienes en `C:\envivo-android`:
- **`app-release-bundle.aab`** → el que se sube a Play.
- **`android.keystore`** → la llave. **Haz las 2 copias de seguridad** (sección 4.5 de esa guía) antes de seguir.

### Paso 3B · 🐙 Camino B (opcional): que GitHub haga el .aab por ti
El repositorio ya trae el robot `.github/workflows/android.yml`. Una sola vez, guarda la llave como **secreto** de GitHub
(los secretos no se ven nunca, ni en el código ni en los registros):

1. 🖥️ Convierte la llave en texto. Abre **Símbolo del sistema** (`cmd`) y pega:
   ```
   cd C:\envivo-android
   certutil -encode android.keystore keystore_base64.txt
   notepad keystore_base64.txt
   ```
   Se abre el Bloc de notas: **Ctrl + A**, **Ctrl + C** (copias todo, incluidas las líneas `-----BEGIN…` y `-----END…`;
   el robot las ignora).
2. 🐙 En **github.com/qfcorp/envivo-tycoon** → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**. Crea estos 3 (Name exacto, en mayúsculas):

   | Name | Secret (lo que pegas) |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | lo que copiaste del Bloc de notas |
   | `ANDROID_KEYSTORE_PASSWORD` | la contraseña del keystore |
   | `ANDROID_KEY_PASSWORD` | la contraseña de la llave (si usaste la misma, otra vez la misma) |

   (Solo si al crear la llave cambiaste el nombre "android": crea también `ANDROID_KEY_ALIAS` con ese nombre.)
3. 🖥️ Borra `C:\envivo-android\keystore_base64.txt` y vacía la papelera (es la llave en texto).
4. Para construir una versión: 🐙 pestaña **Actions** → **"Android: construir .aab"** → **Run workflow** →
   - **version_code**: un número entero **mayor que el último que subiste** a Play (1, 2, 3…). Play rechaza números repetidos.
   - **version_name**: lo que ve el jugador, por ejemplo `1.0.1`.
   → **Run workflow**. Tarda unos 10 minutos (necesita que **juego.tukanec.com** esté en línea, porque de ahí baja el ícono).
5. Cuando sale el ✅ verde: entra a esa ejecución → abajo, en **Artifacts**, descarga **`envivo-android-<número>`** (un .zip
   con `app-release-bundle.aab`). El resumen de la ejecución muestra también la **huella SHA-256 de la llave de subida**.
   El .zip se borra solo a los 7 días.

> Si un día cambias de camino (PC ↔ GitHub), usa siempre un `version_code` mayor que el último subido.

### Paso 4 · 🌐 Crear la app en Play Console
Play Console → **Crear app** → Nombre `EN VIVO Tycoon` · Idioma predeterminado **Español (Latinoamérica) – es-419** ·
**Juego** · **Gratis** → marca las declaraciones → **Crear app**.
⚠️ "Gratis" no se puede cambiar a "de pago" después (y está bien: se gana con compras dentro del juego).

### Paso 5 · 🌐 Subir a la prueba interna
1. **Prueba y lanzamiento** → **Pruebas** → **Prueba interna** → **Crear versión**.
2. Firma: deja **"Firma de apps de Google Play"** (obligatoria) → Continuar.
3. Sube **`app-release-bundle.aab`** · Nombre de versión: `1.0.0` · Notas: `Primera versión` → **Siguiente** → **Guardar y publicar**.
4. Pestaña **Testers** → crea la lista **"Equipo"** con tu Gmail y 1 o 2 más → copia el **enlace para unirse** y ábrelo en tu celular.

### Paso 6 · 🌐🐙 Las 2 huellas SHA-256 en `.well-known/assetlinks.json`
Sin esto la app se ve con una **barra de dirección arriba** (como un navegador).

1. 🌐 Play Console → **Prueba y lanzamiento** → **Integridad de la app** → **Firma de apps**. Hay 2 certificados; de
   cada uno copia la **"Huella digital del certificado SHA-256"** (32 pares tipo `12:AB:34:…`). No son secretas.
   - **Certificado de la clave de firma de apps** → la llamamos **huella de Play**.
   - **Certificado de la clave de subida** → la llamamos **huella de subida** (es la misma que muestra el robot de GitHub).
2. El archivo `.well-known/assetlinks.json` del repositorio tiene **2 marcadores** que se reemplazan:
   - `AA:AA:…:AA` → **huella de Play**
   - `BB:BB:…:BB` → **huella de subida**
3. Cómo reemplazarlas (elige una):
   - **Lo más fácil:** mándame las 2 huellas por el chat y yo las pongo y lo subimos al VPS con la actualización de siempre.
   - **Tú mismo en GitHub:** 🐙 abre `.well-known/assetlinks.json` → ícono del lápiz ✏️ → reemplaza **solo** las letras
     `AA:AA…` y `BB:BB…` (deja las comillas `"` y la coma `,` entre las dos) → **Commit changes** → en el VPS corre la
     actualización de siempre (`docs/DESPLIEGUE.md`).
   - **Con Bubblewrap en el PC:** `bubblewrap fingerprint add <huella> --name=play`, lo mismo con `--name=subida`, y
     `bubblewrap fingerprint generateAssetLinks` (guía larga, sección 5.1).
4. Comprueba: abre en el navegador
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://juego.tukanec.com&relation=delegate_permission/common.handle_all_urls`
   → debe aparecer `com.tukanec.envivo` y tus 2 huellas.
5. 📱 Desinstala y vuelve a instalar la app desde el enlace de la prueba interna: **no debe verse ninguna barra arriba**.

---

## FASE C · Cobrar con Google Play

### Paso 7 · 🌐 Crear los productos (compras dentro de la app)
Play Console → **Monetizar con Play** → **Productos** → **Productos únicos** → **Crear producto único**. Por cada fila:
1. **ID del producto**: copia **exacto** el de la tabla (no se puede cambiar después; si no coincide, el servidor no entrega nada).
2. **Nombre** y **Descripción**: los de la tabla (los ve el jugador en la ventana de pago de Google).
3. **Opción de compra**: tipo **Comprar** (Buy). ID de la opción: `comprar`. Deja marcada **"Compatible con versiones
   anteriores"** (Backwards compatible): la app la necesita.
4. **Precio**: el de la tabla en **USD** → Google calcula los demás países (en el Paso 17 se ajustan Colombia y Perú).
5. **Guardar** → **Activar**.

Todos son **productos únicos** (ninguno es "suscripción": nada se renueva solo). Los "de una sola vez" los controla el servidor.

**Productos confirmados** (están en `server/src/Catalogo.php` y ya se venden en la web):

| ID del producto | Nombre (≤55) | Descripción (≤200) | USD | ¿Se repite? |
|---|---|---|---|---|
| `creditos_250` | 250 créditos | Paquete de 250 créditos para EN VIVO Tycoon. | 1,99 | Sí |
| `creditos_700` | 700 créditos | 700 créditos (+40 % extra). | 4,99 | Sí |
| `creditos_1500` | 1.500 créditos | 1.500 créditos (+50 % extra). | 9,99 | Sí |
| `creditos_3200` | 3.200 créditos | 3.200 créditos (+60 % extra). | 19,99 | Sí |
| `bienvenida` | Oferta de bienvenida | Una sola vez: 150 créditos, un camarógrafo senior de refuerzo por 3 eventos y 3 cables. | 0,99 | No (1 por cuenta) |
| `inicio` | Paquete de inicio | Una sola vez: cámara profesional, 5 cables, 3 baterías, técnico de streaming nivel 3 y 200 créditos. | 2,99 | No (1 por cuenta) |
| `tarjeta_mensual` | Tarjeta mensual | 30 días: reclama 20 créditos cada día (600 en total). No se renueva sola. | 4,99 | Sí |
| `vip30` | Pase VIP 30 días | 30 días: bono diario de $150 del juego + 10 créditos, reparaciones 30 % más baratas, 1 oferta extra al día y distintivo VIP. No se renueva solo. | 9,99 | Sí |
| `refuerzo_camarografo_senior` | Camarógrafo senior de refuerzo | Un camarógrafo con experiencia te acompaña en tus próximos 2 eventos. | 0,99 | Sí |
| `refuerzo_tecnico_internacional` | Técnico de streaming internacional | Un técnico de nivel internacional cuida tu señal en tus próximos 3 eventos. | 0,99 | Sí |
| `alquiler_lente_box` | Alquiler de lente box 100x | Un lente de estadio de 100x para tu próximo evento. | 0,99 | Sí |
| `seguro_evento` | Seguro de evento | En tu próximo evento, si sacas 2 estrellas o menos te devuelven el 50 % del pago. | 0,99 | Sí |
| `equipo_descansado` | Equipo descansado | Todo tu personal recupera la energía ahora mismo. | 0,99 | Sí |

**Productos nuevos — ⏳ pendiente de confirmar** (están en el catálogo, pero se venden solo cuando su módulo esté instalado
en el servidor; créalos igual y **actívalos cuando yo te confirme** que su módulo está en línea):

| ID del producto | Nombre | Descripción | USD | ¿Se repite? | Módulo |
|---|---|---|---|---|---|
| `pase_premium` | Pase de Temporada Premium | Premios premium en los 40 niveles de esta temporada. Dura la temporada (28 días). | 4,99 | 1 por temporada | Pase |
| `pase_premium_plus` | Pase de Temporada Premium Plus | Todo el Pase Premium de esta temporada y 10 niveles ya desbloqueados. | 9,99 | 1 por temporada | Pase |
| `pack_obra_s` | Pack de obra S | Sede oficial: 10 h de aceleradores de obra y materiales. Contenido fijo. | 1,99 | Sí | Sede oficial |
| `pack_obra_m` | Pack de obra M | Sede oficial: 30 h de aceleradores de obra y materiales. Contenido fijo. | 4,99 | Sí | Sede oficial |
| `pack_obra_l` | Pack de obra L | Sede oficial: 80 h de aceleradores de obra y materiales. Contenido fijo. | 9,99 | Sí | Sede oficial |
| `pase_copa` | Pase de Copa | +5 eventos de preparación por día durante la Copa de Servidores de esta semana. | 2,99 | 1 por semana | Estrellas |
| `oferta_vip_s` | Oferta VIP: Primer impulso | Oferta de nivel: 300 créditos, $2.000 del juego y 5 cables. Contenido fijo. | 1,99 | Con tope | VIP |
| `oferta_vip_m` | Oferta VIP: Productora en ascenso | Oferta de nivel: 900 créditos, dinero del juego y repuestos. Contenido fijo. | 4,99 | Con tope | VIP |
| `oferta_vip_l` | Oferta VIP: Gran producción | Oferta de nivel: 2.000 créditos, dinero del juego y repuestos. Contenido fijo. | 9,99 | Con tope | VIP |
| `oferta_campeon` | Oferta del campeón | Por tu primera Copa: 1.000 créditos, dinero del juego y repuestos. Contenido fijo. | 4,99 | Con tope | VIP |
| `oferta_sede_5` | Oferta Sede nivel 5 | Tu sede llegó a nivel 5: 800 créditos, dinero del juego y repuestos. Contenido fijo. | 4,99 | Con tope | VIP |
| `oferta_sede_10` | Oferta Sede nivel 10 | Tu sede llegó a nivel 10: 1.800 créditos, dinero del juego y repuestos. Contenido fijo. | 9,99 | Con tope | VIP |
| *(otros)* | *Los que agreguen los ayudantes de monetización (ofertas de temporada, packs de eventos especiales…)* | | | | ⏳ se agregan a esta tabla cuando lleguen a `Catalogo.php` |

**No crear en Play:** `transferencia_cuenta` (solo se vende en la web) ni `estrella_copa` (se paga solo con créditos).
Los equipos exclusivos y VIP tampoco: se canjean con créditos dentro del juego.

> Regla de oro: el **ID** de Play = el **ID** de `server/src/Catalogo.php`. Si algún precio cambia en el Centro de Control,
> cámbialo también en Play Console (en la app manda el precio de Google).

### Paso 8 · 🌐 Probar compras sin pagar
Play Console (vista de **todas las apps**) → **Configuración** → **Pruebas de licencias** → agrega tu Gmail y los de
quien vaya a probar → **RESPOND_NORMALLY** → Guardar. Esas cuentas ven "Pedido de prueba" y **no se les cobra**.

### Paso 9 · 🌐☁️ Conectar el servidor con Google (cuenta de servicio)
Sigue **`server/GOOGLE_PLAY.md`** de principio a fin (unos 20 minutos): proyecto `envivo-play` en Google Cloud →
habilitar **Google Play Android Developer API** → cuenta de servicio `envivo-servidor` → clave **JSON** → invitarla
en Play Console con **Ver datos financieros** y **Administrar pedidos** → subir el `.json` a `/etc/envivo/google-play.json`
→ completar `GOOGLE_PACKAGE_NAME=com.tukanec.envivo` en `/etc/envivo/config.env`. El permiso puede tardar **24 horas**.

### Paso 10 · 📱 Probar todo en la prueba interna
Lista de pruebas en `docs/ANDROID_GOOGLE_PLAY.md`, **sección 9** (precios de Google, comprar 700 créditos, paquete de
inicio solo una vez, compra sin internet, reembolso de prueba). Si todo sale bien, sigue.

---

## FASE D · Ficha y formularios

### Paso 11 · 🌐 Llenar la ficha y "Contenido de la app"
Todo está redactado en **`docs/play_store/README.md`** (copiar y pegar), en este orden:
1. **Ficha principal** (es-419) con `docs/play_store/ficha_es.md` + las 9 traducciones.
2. **Gráficos**: ícono, gráfico de funciones, **8 capturas** (plan en `docs/play_store/ASO_Y_CAPTURAS.md`) y el video (opcional).
3. **Política de privacidad**: `https://juego.tukanec.com/privacidad.html` (con RUC, dirección y correo completos).
4. **Acceso a la app**: cuenta de prueba para el revisor.
5. **Anuncios: No** · **ID de publicidad: No**.
6. **Clasificación de contenido** (IARC): respuestas en la tabla 2.4.
7. **Público objetivo: 16-17 y 18+** (sección 2.5).
8. **Seguridad de los datos**: tabla 2.6, con el enlace `https://juego.tukanec.com/borrar-cuenta.html`.
9. **Categoría**: Juegos › **Simulación** · Etiquetas: "Simulación de negocios", "Gestión", "Un jugador" y "Multijugador".
   **Correo de contacto** (obligatorio, público): el de soporte. **Sitio web**: `https://juego.tukanec.com`.

---

## FASE E · Prueba cerrada: 12 personas durante 14 días seguidos

Es obligatoria para cuentas **personales** creadas después del 13 nov 2023: necesitas **al menos 12 testers** que estén
**inscritos (opt-in) 14 días seguidos**. Si alguien se sale antes, no cuenta (y si vuelve, empieza de cero).
👉 **Invita a 20 o 25**, porque siempre alguien se sale o nunca acepta.

### Paso 12 · 🌐 Crear el grupo de Google y la prueba cerrada
1. Entra a **groups.google.com** con tu Gmail → **Crear grupo**:
   - Nombre: `EN VIVO Tycoon Testers` · Correo del grupo: `envivo-testers` (queda `envivo-testers@googlegroups.com`).
   - Siguiente → **Quién puede buscar el grupo**: "Cualquier persona en la Web" · **Quién puede unirse**:
     "**Cualquier persona puede unirse**" · **Quién puede ver las conversaciones**: "Miembros del grupo".
   - Crear grupo. Copia el enlace del grupo: `https://groups.google.com/g/envivo-testers`.
2. Play Console → **Prueba y lanzamiento** → **Pruebas** → **Prueba cerrada** → en el canal **Alpha** →
   **Administrar canal** → **Crear versión** → **Agregar desde biblioteca** (el mismo .aab de la prueba interna) →
   Guardar → **Revisar versión** → **Iniciar lanzamiento en prueba cerrada**.
3. Pestaña **Testers** → **Grupos de Google** → pega `envivo-testers@googlegroups.com` → Guardar.
   En **Comentarios** pon tu correo de soporte. Copia el **enlace para unirse en la Web** (opt-in).
4. **Países** de la prueba cerrada: Ecuador, Colombia y Perú (y cualquiera donde viva un tester).
5. La primera versión de prueba cerrada **pasa por revisión de Google** (de horas a unos días). Los 14 días cuentan
   cuando los testers ya pudieron inscribirse.

### Paso 13 · 📱 Invitar a los testers (mensajes listos para copiar)

**WhatsApp** (para familia, equipo de QF, amigos, grupos de fútbol y de producción):

```
¡Hola! 🎥 Estoy por lanzar EN VIVO Tycoon, un juego de celular donde manejas tu propia productora:
cámaras, transmisiones en vivo, imprevistos (lluvia, apagones, cables rotos) y una rival que te pelea los contratos.

Google me pide que 12 personas lo prueben 14 días antes de publicarlo. ¿Me ayudas? Son 3 pasos (2 minutos):

1) Únete a este grupo con tu Gmail (el mismo de tu Play Store): https://groups.google.com/g/envivo-testers
2) Abre este enlace y toca "Convertirse en tester": [ENLACE OPT-IN DE PLAY CONSOLE]
3) Instala el juego desde Play Store: https://play.google.com/store/apps/details?id=com.tukanec.envivo

🙏 Lo importante: NO te salgas de la prueba ni lo desinstales en 14 días, y ábrelo de vez en cuando.
Si algo falla o no se entiende, cuéntamelo desde "Ayuda y soporte" dentro del juego o por aquí.
Como agradecimiento, al lanzar te doy un código de regalo de "Productora fundadora". ¡Gracias!
```

**Correo** (asunto: *¿Me ayudas a probar mi juego EN VIVO Tycoon? (2 minutos)*):

```
Hola [Nombre]:

Estoy por publicar en Google Play EN VIVO Tycoon, un juego de gestión donde diriges una productora de eventos
y transmisiones en vivo, hecho en Ecuador por gente que trabaja en eso todos los días.

Google exige que al menos 12 personas lo prueben durante 14 días seguidos antes de publicarlo. Si me ayudas:

1. Únete al grupo de testers con tu cuenta de Gmail (la misma de tu Play Store):
   https://groups.google.com/g/envivo-testers
2. Acepta la invitación de prueba: [ENLACE OPT-IN DE PLAY CONSOLE]
3. Instala el juego: https://play.google.com/store/apps/details?id=com.tukanec.envivo

Por favor no salgas de la prueba ni desinstales el juego durante 14 días. Juega cuando quieras y cuéntame
qué te gustó, qué no entendiste y si algo falló (dentro del juego: "Ayuda y soporte").

Al lanzarlo te enviaré un código de regalo de "Productora fundadora".

¡Mil gracias!
Dimitry · QF Producciones
```

(El código de regalo sale del **sistema de códigos de regalo** que está construyendo otro ayudante; ver
`docs/LANZAMIENTO_LIMITADO.md` §5. Regalar algo del juego por probar está bien; lo que Google prohíbe es pagar o
premiar a cambio de **reseñas o estrellas**: no lo pidas.)

### Paso 14 · 📋 Los 14 días: qué hacer cada día
| Día | Qué hacer |
|---|---|
| 0 | Manda los mensajes. Revisa en Play Console → Prueba cerrada → Testers cuántos se inscribieron. |
| 1–3 | Escribe a quien no se inscribió. Meta: **20 inscritos** el día 3. |
| 3 | Pregunta en el grupo de WhatsApp: "¿Entendieron el primer evento? ¿Dónde se trabaron?" Anota las respuestas. |
| 7 | Mini encuesta (Google Forms, 5 preguntas): ¿qué capítulo vas?, ¿qué te gustó?, ¿qué te frustró?, ¿comprarías algo?, ¿lo recomendarías? |
| 7–12 | Arregla lo que salió (en el VPS; la app se actualiza sola). Si cambias la cáscara, sube otro .aab a la prueba cerrada. |
| 10 | Prueba una compra con cada tester de "Pruebas de licencias" (pedido de prueba, no cobra). |
| 14+ | En **Inicio** de Play Console aparece **"Solicitar acceso a producción"** cuando se cumplen los 12 × 14 días. |

Guarda todo (capturas de los comentarios, la encuesta, lo que cambiaste): lo vas a necesitar en el Paso 15.

### Paso 15 · 🌐 Solicitar acceso a producción (respuestas listas)
Play Console → **Inicio** → **Solicitar acceso a producción**. Son 3 partes. Ajusta los números `[ ]` a lo que pasó de verdad
(Google rechaza respuestas genéricas o copiadas; si te rechazan, puedes volver a pedirlo después de otra prueba).

**Parte 1 · Sobre tu prueba cerrada**

- *¿Qué tan fácil fue reclutar testers?* → "Moderadamente fácil. Invitamos a [25] personas: familiares, el equipo de
  QF Producciones (productora de transmisiones en vivo en Ecuador), camarógrafos y técnicos con los que trabajamos, y
  amigos aficionados al fútbol. Usamos un grupo de Google y mensajes por WhatsApp y correo. [21] se inscribieron y [14]
  completaron los 14 días."
- *Describe el uso de los testers / ¿usaron todas las funciones?* → "Sí. Jugaron el modo historia (capítulos 1 a [4]),
  contrataron personal, compraron y repararon equipos, resolvieron imprevistos en vivo, crearon cuenta, guardaron en la
  nube, usaron el chat de la asociación, el mercado entre jugadores y los eventos en línea (Liga Semanal, Desafío del Día),
  e hicieron compras de prueba con Google Play (pedidos de prueba)."
- *¿El uso fue parecido al que esperas en producción? ¿En qué se diferenció?* → "Parecido en el modo historia y la
  tienda. La diferencia: los eventos en línea y el chat tuvieron poca gente porque eran pocos testers; en producción
  esperamos asociaciones más grandes. Los testers jugaron sobre todo en sesiones cortas de 5 a 15 minutos, que es el
  uso que esperamos."
- *Resumen de los comentarios y cómo los recogiste* → "Recogimos comentarios por el botón 'Ayuda y soporte' dentro del
  juego, una encuesta en Google Forms el día 7 y el grupo de WhatsApp. Lo principal: [el primer evento no se entendía
  sin la guía], [pedían más explicación de qué hace cada equipo], [un error al guardar en la nube en celulares viejos],
  [les gustaron los imprevistos y la rivalidad con MegaVisión]."

**Parte 2 · Sobre tu app o juego**

- *¿Quién es el público objetivo?* → "Jóvenes y adultos de 16 años o más de Latinoamérica (primero Ecuador, Colombia y
  Perú) que juegan simuladores de gestión ('tycoon') y les gusta el fútbol, la televisión, el streaming y la producción
  de eventos. También personas que trabajan en producción audiovisual."
- *¿Qué hace único a tu juego / qué valor da?* → "Es un tycoon sobre un oficio real que casi no tiene juegos: la
  producción de eventos y transmisiones en vivo. Lo hace una productora real de Ecuador, con equipos y situaciones
  realistas (lluvia en el estadio, apagones, el internet que se cae, personal que se cansa) y una historia en 6 capítulos
  con una productora rival. Se juega gratis, sin anuncios, y funciona sin internet en el modo historia."
- *¿Cuántas instalaciones esperas en el primer año?* → "Entre 10.000 y 50.000" (elige el rango más cercano a esa cifra).

**Parte 3 · Preparación para producción**

- *¿Qué cambios hiciste por la prueba cerrada?* → "[Mejoramos la guía 'toca aquí' del primer evento], [agregamos
  botones de ayuda '?' en la preparación del evento], [arreglamos el error de guardado en la nube], [ajustamos la
  dificultad de los primeros capítulos] y [mejoramos los textos de la tienda]. Los cambios del juego se publican en el
  servidor y la app los recibe al instante."
- *¿Cómo decidiste que está lista para producción?* → "Los testers completaron el primer capítulo sin ayuda, no hubo
  cierres inesperados en Android vitals durante los últimos [7] días, las compras de prueba se entregaron y se
  verificaron en el servidor, el borrado de cuenta funciona dentro del juego y en la web, y el chat tiene filtro,
  reportes y bloqueo con moderación diaria."

---

## FASE F · Salir al público (Ecuador, Colombia y Perú)

### Paso 16 · 🌐 Países
Cuando aprueben el acceso: **Prueba y lanzamiento** → **Producción** → **Países/regiones** → **Agregar países o
regiones** → marca **solo Ecuador, Colombia y Perú** → Guardar.
**No** agregues Brasil todavía (necesita su propia ficha y precios en portugués y se abre después; ver
`docs/LANZAMIENTO_LIMITADO.md`). México se agrega cuando se cumplan las reglas de ese documento.

### Paso 17 · 🌐 Precios por país
Google convierte el precio en USD a cada moneda, pero conviene dejar precios "redondos" y un poco más bajos en Colombia
y Perú (poder de compra). En cada producto → **Opción de compra `comprar`** → **Editar precios** → busca el país →
cambia el valor → Guardar. (También existe **Plantillas de precios** en *Configuración › Monetización*: crea una por
nivel —0,99 / 1,99 / 2,99 / 4,99 / 9,99 / 19,99— y asígnala a cada producto: así cambias un nivel en un solo lugar.)

| Nivel (USD) | 🇪🇨 Ecuador (USD) | 🇨🇴 Colombia (COP) | 🇵🇪 Perú (PEN) | Productos de ese nivel |
|---|---|---|---|---|
| 0,99 | 0,99 | 3.500 | 3,49 | `bienvenida`, refuerzos |
| 1,99 | 1,99 | 6.900 | 6,90 | `creditos_250`, `pack_obra_s`, `oferta_vip_s` |
| 2,99 | 2,99 | 9.900 | 9,90 | `inicio`, `pase_copa` |
| 4,99 | 4,99 | 16.900 | 16,90 | `creditos_700`, `tarjeta_mensual`, `pase_premium`, `pack_obra_m`, `oferta_vip_m`, `oferta_campeon`, `oferta_sede_5` |
| 9,99 | 9,99 | 34.900 | 32,90 | `creditos_1500`, `vip30`, `pase_premium_plus`, `pack_obra_l`, `oferta_vip_l`, `oferta_sede_10` |
| 19,99 | 19,99 | 69.900 | 64,90 | `creditos_3200` |

- Cálculo con ~4.000 COP y ~3,75 PEN por dólar (oct 2026): queda entre 85 % y 94 % del precio en USD. **Revisa el
  cambio del día** antes de guardar; si Play muestra un aviso de "fuera del rango permitido", usa el valor que sugiere.
- **Ecuador:** Play Console muestra si el precio **incluye impuestos**. Pregúntale a tu contador cómo se declara el IVA
  de lo que vende Google (Google es quien vende al jugador y te paga a ti la parte neta).
- El juego siempre muestra el precio que da Google (moneda e impuestos de cada jugador), nunca el de `Catalogo.php`.

### Paso 18 · 🌐 Publicar
1. **Producción** → **Crear versión** → **Agregar desde biblioteca** (el último .aab probado) → Nombre `1.0.0` →
   Notas de la versión: las de `## Novedades (versión 1.0)` de cada ficha → **Siguiente**.
2. Lanzamiento: **100 %** (es un lanzamiento limitado a 3 países, no hace falta escalonarlo).
3. **Enviar a revisión**. Si en **Resumen de la publicación** está activada la **publicación administrada**, cuando
   Google apruebe tú decides el momento de salir con **Publicar** (recomendado: un martes o miércoles por la mañana,
   para poder reaccionar si algo falla).
4. Después de publicar: **Mantén la prueba cerrada activa** (sirve para probar versiones nuevas) y sigue el plan de
   `docs/LANZAMIENTO_LIMITADO.md`.

---

## Resumen de lo que haces tú y lo que ya está hecho

| Ya está en el repositorio | Lo haces tú |
|---|---|
| Configuración de la app (`android/twa-manifest.json`), compras con Google (`js/googleplay.js`, `server/src/Google.php`) | Verificar cuenta y teléfono, perfil de pagos, inscripción al 15 % (Pasos 1–2) |
| Robot que construye el .aab (`.github/workflows/android.yml`) | Crear la llave una vez en el PC y guardarla como secreto (Paso 3) |
| Plantilla de huellas (`.well-known/assetlinks.json`) | Copiar las 2 huellas de Play Console (Paso 6) |
| Fichas en 10 idiomas, formularios redactados, ícono y gráfico de funciones | Pegar en Play Console; regenerar la captura 01 (Paso 11) |
| Lista de productos con sus IDs | Crearlos y activarlos (Paso 7) |
| Mensajes para testers y respuestas para producción | Conseguir los 12+ testers y esperar 14 días (Pasos 12–15) |

---

## Fuentes (revisadas el 23 oct 2026)

- Requisitos de prueba para cuentas personales nuevas (12 testers, 14 días seguidos, preguntas de acceso a producción): https://support.google.com/googleplay/android-developer/answer/14151465
- Verificación del dispositivo Android de la cuenta: https://support.google.com/googleplay/android-developer/answer/14316361
- Nivel de comisión del 15 % (grupo de cuentas e inscripción): https://support.google.com/googleplay/android-developer/answer/10632485
- Nuevas comisiones 2026 (10 % + 5 % de facturación; EE. UU./RU/EEE desde el 30 jun 2026, resto del mundo hasta sept. 2027): https://www.macrumors.com/2026/06/24/google-play-store-fee-change/ · https://www.pocketgamer.biz/google-play-expands-billing-options-and-lowers-fees-for-developers/
- Modelo nuevo de productos únicos (opciones de compra, "compatible con versiones anteriores"): https://android-developers.googleblog.com/2025/07/new-tools-to-help-drive-success-for-one-time-products.html
- Recursos gráficos de la ficha (capturas, gráfico de funciones, video): https://support.google.com/googleplay/android-developer/answer/9866151
- Formulario de Seguridad de los datos (tipos de datos, finalidades, borrado): https://support.google.com/googleplay/android-developer/answer/10787469
- Bubblewrap 1.27.0 (variables `BUBBLEWRAP_KEYSTORE_PASSWORD` / `BUBBLEWRAP_KEY_PASSWORD`, build-tools 36.1.0, JDK 17): paquetes npm `@bubblewrap/cli@1.27.0` y `@bubblewrap/core@1.27.0` (código revisado) · https://github.com/GoogleChromeLabs/bubblewrap
- Firma, huellas y Digital Asset Links para TWA: https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs
- Más fuentes técnicas (Play Billing en TWA, API 36, reembolsos): al final de `docs/ANDROID_GOOGLE_PLAY.md`.
