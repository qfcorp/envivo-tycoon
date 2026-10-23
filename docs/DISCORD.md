# Servidor oficial de Discord de EN VIVO Tycoon

> **¿Primera vez?** Empieza por `docs/DISCORD_CREAR_SERVIDOR.md`: la guía paso a paso (celular o PC) que te dice cuándo usar este script.

Guía para dejar listo el Discord oficial del juego, como los de Kingshot, Whiteout Survival o Rise of Kingdoms, **sin armarlo canal por canal**.
Tú haces 3 cosas a mano (crear el servidor, crear el bot y correr un comando) y el script `discord/configurar_servidor.js` arma todo lo demás.

**Tiempo total:** unos 40 minutos la primera vez.

| Qué | Quién lo hace |
|---|---|
| Crear el servidor vacío y el bot "EN VIVO Bot" | Tú (pasos 1 y 2) |
| 22 roles, 8 categorías, 45 canales, foros con etiquetas, permisos, AutoMod, Comunidad, Onboarding y los mensajes de bienvenida, reglas y FAQ en 10 idiomas | El script (pasos 3 y 4) |
| Verificación de reglas, ícono, enlace de invitación y quitarle permisos al bot | Tú (pasos 5 y 6) |

> 🔒 **Regla de oro:** el **token del bot** es como la contraseña del bot. Va **solo** en tu PC o en el VPS (archivo `.env` o variable de entorno).
> **Nunca** en GitHub (el repositorio es público), ni en un chat, ni en una captura. Si se filtra: Developer Portal → Bot → **Reset Token** y listo, el viejo deja de servir.

---

## Resumen rápido (los pasos en corto)

> **Una sola aplicación "EN VIVO Bot" para todo.** Esta guía arma el servidor de Discord. Después, `docs/DISCORD_BOT.md` conecta ese mismo bot con el juego (vincular cuenta, roles, comandos). Haz primero esta guía y luego la otra. Si en algún momento tocas **Reset Token**, el token viejo deja de servir: pon el nuevo en `discord\.env` (este script) y en `/etc/envivo/config.env` como `DISCORD_BOT_TOKEN` (el bot del juego).

1. Discord → **+** → **Crear mi propio servidor** → "EN VIVO Tycoon · Oficial". Activa la verificación en dos pasos en tu cuenta.
2. https://discord.com/developers/applications → **New Application** "EN VIVO Bot" → pestaña **Bot** → **Reset Token** → copia el token.
3. Invita al bot con el enlace del paso 2.4 (permiso Administrador) y copia el **ID del servidor**.
4. Instala **Node.js LTS** en qfone, descarga el repositorio y crea `discord\.env` con el token y el ID.
5. En PowerShell, dentro de la carpeta `discord`: `node configurar_servidor.js --simular` y luego `node configurar_servidor.js`.
6. A mano: verificación de reglas, ícono, invitación permanente y borrar los canales "general" viejos.
7. Quítale el permiso Administrador al bot.

---

## Paso 1. Crear el servidor (5 minutos)

1. Abre Discord (en la PC es más cómodo) y toca el botón **+** de la columna izquierda ("Añadir un servidor").
2. Elige **Crear mi propio servidor** → **Para un club o una comunidad**.
3. Nombre: **EN VIVO Tycoon · Oficial**. Sube el ícono del juego (`icons/` del repositorio, en PNG de 512×512). Toca **Crear**.
4. **Protege tu cuenta** (Discord lo exige para moderar un servidor grande): ⚙️ **Ajustes de usuario** → **Mi cuenta** →
   **Activar la autenticación en dos pasos** (con Google Authenticator o similar). Guarda los códigos de respaldo.

**Comunidad:** el script la activa solo (con el canal de reglas, el de avisos de Discord, verificación por correo y filtro de
contenido). Solo si al final el script dice que no pudo, actívala a mano:

1. Clic en el nombre del servidor (arriba a la izquierda) → **Ajustes del servidor** → en la izquierda **Habilitar comunidad** → **Comenzar**.
2. Marca **Verificar correo electrónico** y **Analizar contenido multimedia de todos los miembros** → **Siguiente**.
3. En "Canal de reglas" elige **📜┃reglas** y en "Canal de actualizaciones de la comunidad" elige **🧾┃avisos-de-discord** → **Siguiente**.
4. Acepta las normas → **Finalizar configuración**. Vuelve a correr el script (paso 4); lo que faltaba se completa solo.

---

## Paso 2. Crear el bot "EN VIVO Bot" (10 minutos)

### 2.1 La aplicación
1. Entra a **https://discord.com/developers/applications** con tu cuenta de Discord.
2. **New Application** → nombre **EN VIVO Bot** → acepta los términos → **Create**.
3. En **General Information** sube el ícono, escribe una descripción ("Bot oficial de EN VIVO Tycoon") y toca **Save Changes**.
   Copia el **Application ID** (lo usas en el 2.4).

### 2.2 El bot y su token
1. Menú izquierdo → **Installation** → en **Install Link** elige **None** → **Save Changes** (así nadie más puede agregarlo).
2. Menú izquierdo → **Bot**:
   - **Username:** EN VIVO Bot.
   - **Public Bot:** apágalo.
   - **Privileged Gateway Intents** (Presence, Server Members, Message Content): **déjalos apagados**. El script no los necesita.
     (Si el bot de `/vincular` necesitara alguno, quien lo programa te dirá cuál.)
   - Toca **Reset Token** → **Yes, do it!** → **Copy**. Pégalo de inmediato en el archivo `.env` del paso 3 (Discord no lo vuelve a mostrar).

### 2.3 Permisos y alcances (para saber qué estás autorizando)
- **Alcances (scopes):** `bot` y `applications.commands` (este último es para el comando `/vincular`).
- **Permiso:** **Administrator** (valor `8`), solo para la configuración inicial: el bot tiene que crear roles de moderación y
  permisos por canal, y Discord solo deja dar permisos que el bot ya tiene. En el paso 6 se lo quitas.
- **Intents:** ninguno.

### 2.4 Invitar el bot a tu servidor
1. Copia este enlace, cambia `TU_APPLICATION_ID` por el número del 2.1 y ábrelo en el navegador:
   ```
   https://discord.com/oauth2/authorize?client_id=TU_APPLICATION_ID&scope=bot+applications.commands&permissions=8&integration_type=0
   ```
   (Otra forma: Developer Portal → **OAuth2** → **URL Generator** → marca `bot` y `applications.commands` → abajo marca **Administrator** → copia la URL.)
2. Elige **EN VIVO Tycoon · Oficial** → **Continuar** → **Autorizar** → resuelve el captcha.
3. En tu servidor: **Ajustes del servidor** → **Roles** → arrastra el rol **EN VIVO Bot** hasta **arriba de todo**. Así podrá ordenar y dar los roles.

### 2.5 Copiar el ID del servidor
1. ⚙️ **Ajustes de usuario** → **Avanzado** → enciende **Modo desarrollador**.
2. Clic derecho en el ícono del servidor (columna izquierda) → **Copiar ID del servidor**. Es un número largo, por ejemplo `1234567890123456789`.
   (En el celular: mantén presionado el ícono del servidor → **Copiar ID**.)

---

## Paso 3. Dónde poner el token (2 minutos)

El script busca `DISCORD_TOKEN` y `DISCORD_GUILD_ID` en las **variables de entorno** o en el archivo **`discord/.env`** (junto al
script). Ese archivo está en `discord/.gitignore`, así que **git nunca lo sube**.

### En tu PC (qfone, Windows) — recomendado
1. En el Explorador de archivos activa **Vista** → **Mostrar** → **Extensiones de nombre de archivo** (para que no quede `.env.txt`).
2. En la carpeta `discord` copia `.env.ejemplo` y renombra la copia a **`.env`** (Windows pregunta si quieres cambiar la extensión: **Sí**).
3. Ábrelo con el Bloc de notas y llénalo (sin espacios ni comillas):
   ```
   DISCORD_TOKEN=pega_aquí_el_token
   DISCORD_GUILD_ID=pega_aquí_el_ID_del_servidor
   SOPORTE_CORREO=
   ```
   `SOPORTE_CORREO` déjalo vacío hasta que crees el correo de soporte. Mientras tanto, los mensajes dicen "el correo de soporte que aparece en el juego".
4. Guarda y cierra.

> Si usas **GitHub Desktop**, revisa antes de cada "Commit" que en la lista **no aparezca** `discord/.env`. No debería (está ignorado), pero mirar no cuesta nada.

### En el VPS (alternativa)
Guarda el token fuera del repositorio, con permisos solo para root (copia y pega en PuTTY; `nano` se cierra con Ctrl+O, Enter, Ctrl+X):
```
sudo nano /etc/envivo/discord.env
sudo chmod 600 /etc/envivo/discord.env
```
Con el mismo contenido de arriba (`DISCORD_TOKEN=...` y `DISCORD_GUILD_ID=...`).

---

## Paso 4. Correr el script (5 minutos, una sola vez)

### En qfone (Windows)
1. **Instala Node.js:** entra a https://nodejs.org → botón **LTS** → descarga el instalador de Windows (`.msi`) → Siguiente, Siguiente, Instalar
   (deja todo como viene). Necesita la versión 18 o más nueva.
2. **Descarga el repositorio:** con GitHub Desktop (**File → Clone repository → qfcorp/envivo-tycoon**) o en https://github.com/qfcorp/envivo-tycoon →
   botón verde **Code** → **Download ZIP** → descomprime. Crea el `.env` del paso 3 dentro de la carpeta `discord`.
3. Abre la carpeta `discord` en el Explorador, haz clic en la **barra de dirección**, escribe `powershell` y presiona **Enter**. Se abre una ventana azul ya en esa carpeta.
4. Comprueba Node: escribe `node -v` y Enter. Debe salir algo como `v22.x.x`.
5. **Ensayo (no toca Discord):**
   ```
   node configurar_servidor.js --simular
   ```
   Muestra todo lo que va a crear. Si dice `❌ estructura.json tiene problemas`, mándame la captura.
6. **Ahora sí:**
   ```
   node configurar_servidor.js
   ```
   (o `npm run configurar`). Tarda de 2 a 5 minutos. Si ves `⏳ Discord pidió esperar...` es normal: Discord pone límites de velocidad y el script espera solo.
7. Al final sale **✅ Listo** con un resumen y la lista **👉 Falta hacer a mano**. Mándame una captura.

### En el VPS (alternativa)
```
node -v
```
Si sale `v18` o más, sigue. Si no existe o es más viejo: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`.
```
cd /var/www/envivo/discord
sudo node configurar_servidor.js --env /etc/envivo/discord.env --estado /etc/envivo/discord-estado.json --simular
sudo node configurar_servidor.js --env /etc/envivo/discord.env --estado /etc/envivo/discord-estado.json
```

### Lo que conviene saber del script
- **Se puede correr las veces que quieras.** La segunda vez dice "sin cambios". Si editas `discord/estructura.json` (un tema, un color, un canal
  nuevo) o un texto de `discord/mensajes/`, lo vuelves a correr y **solo cambia eso** (los mensajes se editan, no se repiten).
- **Nunca borra nada.** Ni canales, ni roles, ni mensajes, ni reglas. Si algo sobra, lo borras tú a mano.
- **Conserva lo que hagas a mano** en roles o personas que el script no maneja (permisos extra, etiquetas nuevas en un foro, otros bots).
  Pero si cambias a mano algo que **sí** está en `estructura.json` (por ejemplo el tema de #reglas o una lista de AutoMod), la próxima vez el
  script lo vuelve a dejar como dice el archivo. Para cambios permanentes, edita `estructura.json`.
- **Abrir un servidor nuevo del juego** ("Servidor 2 · Guayaquil"): en `estructura.json`, en `servidores_del_juego.lista`, agrega
  `{ "numero": 2, "ciudad": "Guayaquil" }` y vuelve a correr. Crea el rol, el canal, la etiqueta del foro de reclutamiento, la opción del
  Onboarding y actualiza la FAQ.
- **Cuando exista el correo de soporte:** ponlo en `SOPORTE_CORREO` (en `.env`) y vuelve a correr: se actualizan bienvenida, reglas y FAQ.
- Guarda `discord/.estado.json` con los números (IDs) de lo que creó. No tiene secretos y tampoco se sube a GitHub. Si lo borras, el script
  encuentra todo por nombre.
- **Pruebas:** `node test.js` corre el script contra un Discord falso y revisa todo (no necesita token ni internet).

---

## Paso 5. Toques finales a mano (10 minutos)

1. **Verificación de reglas** (los nuevos aceptan las reglas antes de escribir): **Ajustes del servidor** → **Configuración de seguridad**
   (Safety Setup) → **Protección contra MD y spam** → **Editar** → marca **Los miembros deben aceptar las reglas antes de hablar o enviar MD**
   → **Comenzar**. Pega las 8 reglas cortas en español de `discord/estructura.json` → `reglas_para_verificacion` → `es` (una por casilla;
   Discord permite hasta 16) y agrega una novena: *"English / Português: reglas completas en #reglas · full rules in #reglas."* → **Guardar**.
2. **Seguridad del staff:** en la misma pantalla, **Permisos** → activa **Requerir 2FA para acciones de moderación**. Revisa que estén
   activos **Protección contra raids y CAPTCHA** y el **filtro de spam en MD**.
3. **Borra lo viejo:** el canal de texto **#general**, el de voz **General** y las categorías **Canales de texto / Canales de voz** que Discord
   creó al inicio (clic derecho → **Eliminar**). Si activaste Comunidad a mano, borra también el **#reglas** y **#moderator-only** que creó Discord
   (los nuestros son **📜┃reglas** y **🧾┃avisos-de-discord**).
4. **Guía del servidor** (opcional, se ve muy profesional): **Ajustes del servidor** → **Onboarding** → **Guía del servidor**: mensaje de
   bienvenida corto, tareas para nuevos ("Lee #reglas", "Vincula tu cuenta en #vincular-cuenta", "Saluda en #general-español") y como
   recursos #reglas y #preguntas-frecuentes. Revisa también ahí las preguntas que creó el script (idioma, servidor, intereses).
5. **Invitación permanente:** clic derecho en **👋┃bienvenida** → **Invitar a gente** → **Editar enlace de invitación** → Caducar: **Nunca**,
   Máximo de usos: **Sin límite** → copia el enlace. Ponlo en la web, en la sección Soporte del juego y en las redes de QF.
   (Con más de 1.000 miembros puedes pedir estar en **Explorar servidores**.)
6. **Banner y descripción:** **Ajustes del servidor** → **Perfil del servidor**.

## Paso 6. Quitarle el Administrador al bot (1 minuto)

**Ajustes del servidor** → **Roles** → **EN VIVO Bot** → **Permisos** → apaga **Administrador** y deja encendidos solo:
**Ver canales, Gestionar roles, Enviar mensajes, Insertar enlaces, Leer el historial de mensajes y Usar comandos de la aplicación** → **Guardar**.
Así, si algún día se filtrara el token, el daño posible es mínimo. Cuando quieras volver a correr el script, enciende Administrador
un momento y apágalo al terminar (el script te avisa si le falta).

---

## Cómo quedó el servidor

| Categoría | Canales | Quién escribe |
|---|---|---|
| 📌 INFORMACIÓN | bienvenida, reglas, **anuncios**, **novedades-del-juego**, **códigos-de-regalo**, **eventos-en-curso**, **estado-del-servidor** (estos 5 son canales de anuncios que otros servidores pueden seguir), preguntas-frecuentes, vincular-cuenta | Solo staff (en vincular-cuenta todos usan `/vincular`) |
| 🛟 SOPORTE Y OPINIONES | **soporte** (foro), **reporte-de-errores** (foro con plantilla), **sugerencias** (foro con votos), ayuda-entre-jugadores | Todos, con etiqueta obligatoria |
| 💬 COMUNIDAD | general-español, general-english, general-português, capturas-y-clips, creadores-de-contenido, fuera-de-tema, comandos-bot | Todos (creadores: solo el rol Creador publica, todos comentan) |
| 🎥 PRODUCTORAS | eventos-y-ligas, **copa-de-servidores**, **reclutamiento-de-asociaciones** (foro, 1 cada 6 h, solo verificados), **mercado** (foro solo para conversar), **guias-y-consejos** (foro), sala-vip | Según el rol |
| 🌎 SERVIDORES DEL JUEGO | un canal por servidor (hoy: servidor-1-quito) | Solo quien tiene el rol de ese servidor lo ve |
| 🌐 IDIOMAS | français, deutsch, italiano, русский, türkçe, bahasa-indonesia, 中文 | Solo quien eligió ese idioma lo ve |
| 🔊 VOZ Y EN VIVO | Sala de productoras, Asociaciones 1 y 2, **Escenario EN VIVO** (charlas con el equipo), Sala VIP | Todos (VIP solo VIP) |
| 🛡️ STAFF | staff-general, automod-alertas, registro-moderacion, soporte-interno, avisos-de-discord, voz Staff | Oculta para todos menos el staff |

**Roles (de arriba hacia abajo):** Admin QF · Moderador · Soporte · Bots · Creador de contenido · VIP · Comprador verificado ·
Presidente de asociación · Jugador verificado · Servidor 1 · Quito · 🔔 Avisos de eventos · 🔔 Novedades del juego · 10 roles de idioma.
VIP, Comprador verificado, Presidente, Jugador verificado y el de servidor los pone el **bot de `/vincular`**; los de idioma, servidor y
avisos los elige cada persona en el **Onboarding** (Canales y roles).

**Onboarding (al entrar):** 1) idioma (obligatoria), 2) servidor del juego, 3) intereses (avisos de eventos, novedades, asociaciones,
mercado, guías, crear contenido, probar y sugerir, voz).

**AutoMod (8 reglas):** invitaciones a otros servidores y enlaces de estafa (bloquea + silencia 10 min + avisa), estafas y venta con dinero
real ("vendo cuenta", "pásame tu contraseña", "nitro gratis"...), teléfonos/correos/WhatsApp, groserías en español de Ecuador, inglés y
portugués, una lista de "avisar sin bloquear" (contraseña, me hackearon, estafa...), la lista de Discord en inglés, spam y más de 5 menciones
(con protección contra raids). Las alertas llegan a **🚨┃automod-alertas**. Se deja 1 regla de palabras libre por si quieres crear una a mano.

---

## Guía de moderación

### El equipo
- **Admin QF:** tú y máximo 1 o 2 personas de confianza. **Moderador:** jugadores activos y maduros (mejor que amigos o gente de afuera),
  idealmente uno por idioma grande. **Soporte:** quien orienta dudas y pasa casos al soporte del juego.
- Todos con **verificación en dos pasos**. Nadie del staff comparte su cuenta.
- El staff **nunca** pide contraseñas, códigos ni datos de tarjeta, **nunca** escribe primero por privado, **no** compra ni vende en el mercado
  con otros jugadores y **no** promete regalos que no estén anunciados.

### Escalera de sanciones (con las herramientas de Discord)
| Falta | Primera vez | Se repite |
|---|---|---|
| Spam leve, canal equivocado, mayúsculas | Borrar + aviso amable | Silenciar 1 h |
| Insultos, provocaciones, groserías evadiendo el filtro | Silenciar 1 h | 24 h → 7 días → expulsión |
| Acoso, discriminación, amenazas | Silenciar 7 días | Expulsión |
| Estafa, venta con dinero real, pedir contraseñas, enlaces maliciosos, hacerse pasar por staff, contenido sexual, datos personales de otros, cuenta para evadir sanción | **Expulsión directa** (con "borrar mensajes de los últimos 7 días") | — |

- **Silenciar** = clic derecho en la persona → **Aislar temporalmente** (Timeout). **Expulsar** = **Banear**.
- Cada sanción se anota en **📋┃registro-moderacion**: `ID de la persona · qué hizo · enlace al mensaje · sanción · quién`.
- Las apelaciones van por el soporte del juego o el correo, nunca en canales públicos.

### Casos especiales
- **Venta o compra con dinero real / estafa:** banear, guardar capturas en #soporte-interno y avisar al soporte del juego para revisar esas cuentas.
- **Menores:** si un adulto pide a menores escribirle por privado, pasar a WhatsApp/Telegram, fotos o datos: **ban inmediato** y reporte a
  Discord en https://dis.gd/report. Lo mismo con cualquier contenido sexual que involucre menores.
- **Cuenta hackeada** (alguien manda enlaces raros de golpe): aislar 1 día y avisarle que cambie la contraseña y active 2FA.
- **Raid** (muchas cuentas nuevas haciendo spam): clic en el nombre del servidor → **Acciones de seguridad** → **Pausar invitaciones** y
  **Pausar MD**; sube la verificación a **Máxima** por unas horas.

### Foros: cómo trabajar las etiquetas
- **🛟 soporte:** responde en menos de 24 h. Lo de pagos o cuentas → "abre un caso en el juego" + etiqueta **Pasado al juego**. Resuelto → **Respondido** y cerrar.
- **🐞 errores:** reacciona 👀 en menos de 48 h. Flujo: **Revisando → En arreglo → Arreglado**. Repetido → **Duplicado** con enlace al original y cerrar.
  Falta información → **Faltan datos**.
- **💡 sugerencias:** cada **martes** revisa las que tienen más 👍 y marca **En votación**, **Planeada**, **Lanzada** o **No por ahora** (con una línea de por qué).
- **🛡️ reclutamiento:** cierra los temas de asociaciones llenas (**Cerrada**). **🛒 mercado:** cualquier mención de dinero real → borrar y aplicar la escalera.

### AutoMod
- Revisa **🚨┃automod-alertas** al menos 2 veces al día. Si una palabra bloquea cosas inocentes (por ejemplo una palabra que en portugués
  es normal), sácala de `discord/estructura.json` y vuelve a correr el script. Si se cuela una grosería nueva, agrégala ahí mismo.
- Los admins y moderadores no son bloqueados por algunas reglas (por ejemplo, pueden pegar invitaciones oficiales).

---

## Calendario semanal de la comunidad (hora de Ecuador, UTC-5)

Pensado para cuando estén activos los eventos en línea del juego. Hasta entonces, usa solo la parte de "Discord".
Las plantillas listas para copiar están en `discord/mensajes/<idioma>/plantillas-eventos.md` (es, en, pt-BR).

| Día | En el juego | En Discord |
|---|---|---|
| **Lunes** | 00:00 arranca la **Liga Semanal de Productoras** · Desafío del Día: lluvia garantizada · cadenas de la semana del **Desafío de Cadenas** | 09:00 anuncio de la Liga en #eventos-en-curso (mención 🔔 Avisos de eventos) · ganadores de la liga anterior · Desafío de Cadenas |
| **Martes** | Desafío: una sola cámara | 18:00 revisión de **sugerencias** (staff) y post con "Lo que viene" en #novedades-del-juego si hay algo |
| **Miércoles** | Desafío: internet inestable | "Miércoles de capturas": tema de la semana en #capturas-y-clips (la mejor sede, el peor imprevisto…) |
| **Jueves** | Desafío: cliente exigente | Mantenimientos y versiones nuevas preferiblemente jueves de noche (aviso con 24 h en #estado-del-servidor) |
| **Viernes** | Desafío: apagón | 20:00 **Viernes EN VIVO** en el 🎤 Escenario cada 2 semanas: charla con el equipo, preguntas de la comunidad (recógelas antes en #eventos-y-ligas) |
| **Sábado** | Desafío: final de campeonato · empieza **Switcher en Vivo** · 1.er sábado del mes: **Gran Licitación** 20:00 · semana de copa: **batalla en vivo** | Anuncios con mención al empezar · salas de voz de Asociaciones para coordinar |
| **Domingo** | Desafío: todo junto · 23:59 cierra la **Liga Semanal** y el Switcher | Recordatorio de cierre (sin mención) a las 18:00 |

**Cada 2 días:** **Mega Festival** (24 h) → un anuncio al abrir. **Duelos:** siempre disponibles; el lunes, top de la semana.
**Cada 4 semanas:** **Productor del Año** (7 días). **Cada temporada (~6 semanas):** **Copa internacional** (inscripción lunes a miércoles,
preparación jueves y viernes, batalla el sábado) y nuevo Pase de Temporada.

**Buenas costumbres:** usa las horas de https://hammertime.cyou (cada persona ve su hora); menciona 🔔 solo al **empezar** un evento
(nunca en recordatorios, o la gente silencia el rol); crea también el evento en Discord (**Eventos** → **Crear evento**) para la Gran
Licitación, las copas y los Viernes EN VIVO, así aparece arriba con cuenta regresiva.

---

## Para quien programa el bot de `/vincular`

- Los mensajes de #vincular-cuenta dicen que en el juego se toca **"Vincular Discord"**, que sale un **código** que dura pocos minutos, y que
  en Discord se usa `/vincular` con la opción **`codigo`**. Si el comando o el botón se llaman distinto, cambia los textos en
  `discord/mensajes/*/vincular-cuenta.md` y vuelve a correr el script (edita los mensajes, no los repite).
- Roles que debe dar o quitar (búscalos por nombre, o por ID en `discord/.estado.json` → `roles`):
  `Jugador verificado`, `Servidor N · Ciudad`, `VIP` (solo con Pase VIP activo), `Comprador verificado`, `Presidente de asociación`.
  Los de idioma y avisos son del Onboarding: no los toques.
- Si es la misma aplicación "EN VIVO Bot", ya está en el servidor y su rol queda arriba de esos roles. Necesita **Gestionar roles**.
  Responder con mensajes efímeros (solo los ve quien usa el comando) y nunca pedir contraseña ni correo.

---

## Fuentes consultadas

- Discord, *Enabling Your Community Server*: https://support.discord.com/hc/en-us/articles/360047132851
- Discord, *Community Onboarding FAQ* (mínimo 7 canales por defecto, 5 donde se pueda escribir; preguntas antes de entrar): https://support.discord.com/hc/en-us/articles/11074987197975
- Discord, *Rules Screening FAQ* (hasta 16 reglas, requiere Comunidad): https://support.discord.com/hc/en-us/articles/1500000466882
- Discord, *AutoMod FAQ* (1.000 palabras por regla, 60 letras, comodines `*`, bloquear/alertar/aislar): https://support.discord.com/hc/articles/4421269296535
- Discord, *Best practices for starting a great community*: https://discord.com/blog/best-practices-for-starting-a-great-community-on-discord
- Discord, *Forum Channels*: https://discord.com/blog/forum-channels-space-for-organized-conversation
- Límites de AutoMod en la API (10 expresiones regulares de 260 letras, 50 menciones): https://discord.js.org/docs/packages/discord-api-types/main/v10/APIAutoModerationRuleTriggerMetadata:Interface
- Formato del Onboarding en la API (preguntas, opciones e IDs): https://docs.pycord.dev/en/master/_modules/discord/onboarding.html
- Foros para soporte, errores y sugerencias (etiquetas de estado, plantilla, etiqueta obligatoria): https://blog.communityone.io/discord-forum-channels-setup-guide/ y https://betahub.io/blog/guides/2025/07/16/discord-community-feedback.html
- Servidores oficiales de referencia: Whiteout Survival (https://discord.com/servers/whiteout-survival-973157270554804264, ~1,5 millones de miembros: novedades, guías, códigos, sugerencias) y Rise of Kingdoms (https://discord.com/servers/rise-of-kingdoms-474739462589382667 y https://discord.me/riseofkingdoms: noticias oficiales, eventos, canal de sugerencias, muchos idiomas).
- Calendario de eventos del juego: documento "Eventos en línea entre productoras" y `server/SOCIAL.md`.
