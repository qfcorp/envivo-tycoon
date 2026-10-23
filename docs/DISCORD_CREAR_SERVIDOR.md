# Crear el Discord oficial de EN VIVO Tycoon y conectar el bot (paso a paso)

Guía para Dimitry. Un paso = una acción. Debajo de algunos pasos dice **Verás:** con lo que debe salir en la pantalla.
Los textos para copiar y pegar (reglas, bienvenida, anuncio, descripciones de canales, preguntas del Onboarding) están en
**`docs/DISCORD_TEXTOS.md`**.

**Al final vas a tener:** el servidor "EN VIVO Tycoon · Oficial" con sus canales, roles, reglas, filtros contra insultos y
spam, una invitación que no vence, el bot **EN VIVO Bot** conectado al juego (`/vincular`, `/perfil`, `/ranking`, `/eventos`,
`/ayuda`) y el botón **"Únete a nuestro Discord"** dentro del juego.

> **Importante sobre el soporte:** el soporte oficial del juego es **dentro del juego (Ayuda y soporte) y por correo**.
> El Discord es la comunidad: ahí se orienta, pero los pagos y las cuentas se ven solo en el juego. Los textos ya lo dicen así.

> 🔒 **El token del bot es la contraseña del bot.** Va **solo** en `/etc/envivo/config.env` del VPS. Nunca en GitHub
> (el repositorio es público), ni en WhatsApp, ni en un chat, ni en una captura. Si se filtra: Developer Portal → Bot →
> **Reset Token** y pon el nuevo en el VPS.

---

## Celular o PC: qué se puede hacer en cada uno

Discord **no deja** hacer todo desde el celular. Esto es lo que dice Discord (ver Fuentes al final):

| Parte | Celular | PC |
|---|---|---|
| 1. Crear el servidor · 3. Roles · 4. Canales · 8. Invitación | ✅ | ✅ |
| 2. Activar Comunidad | ❌ (Discord solo lo explica en PC) | ✅ |
| 6. AutoMod (filtros) · 7. Onboarding (preguntas al entrar) | ❌ (Discord no lo permite en el celular) | ✅ |
| 9. Bot (Developer Portal y VPS) | Incómodo | ✅ |

En la PC puedes usar el programa de Discord o el navegador en **https://discord.com/app**.

---

## Elige tu camino

| Camino | Para quién | Tiempo |
|---|---|---|
| **A. Automático (recomendado si tienes la PC qfone a mano)** | Un programa (`discord/configurar_servidor.js`) arma en 5 minutos los 45 canales, 22 roles, permisos, AutoMod, Comunidad, Onboarding y los mensajes en 10 idiomas. | 40 min |
| **B. A mano** | Si prefieres hacerlo tú, desde el celular y la PC. Arma una versión más corta (unos 32 canales y 13 roles). | 1 h 30 a 2 h |

- **Camino A:** sigue `docs/DISCORD.md` (pasos 1 a 6). Cuando termines, **salta a la Parte 8** de esta guía.
- **Camino B:** sigue esta guía desde la Parte 0.

> Los nombres de canales y roles de esta guía son **los mismos** que usa el programa del camino A. Si un día haces el camino B
> y después quieres correr el programa, este reconoce lo que ya creaste (por el nombre), lo completa y **nunca borra nada**.
> Por eso: **copia los nombres tal cual**, con sus emojis y la barrita `┃`.

---

## Parte 0. Antes de empezar (5 minutos)

1. Abre Discord con la cuenta que va a ser **dueña** del servidor (la tuya).
2. Toca tu foto (abajo) → **⚙️ Ajustes** → **Mi cuenta**.
3. Toca **Activar la autenticación en dos pasos** y sigue los pasos con Google Authenticator (o similar).
   **Verás:** "Autenticación en dos pasos activada". Guarda los **códigos de respaldo** en un lugar seguro (no en el chat).
4. Vuelve a **Ajustes** → **Avanzado** (en el celular: **Ajustes de la app** → **Avanzado**).
5. Enciende **Modo desarrollador**. (Sirve para copiar los números de ID más adelante.)

---

## Parte 1. Crear el servidor (celular o PC, 5 minutos)

1. En la columna de la izquierda toca el botón **+** ("Añadir un servidor").
2. Toca **Crear mi propio servidor**.
3. Toca **Para un club o una comunidad**.
4. Escribe el nombre: `EN VIVO Tycoon · Oficial`
5. Toca el círculo de la foto y sube el ícono del juego (en el repositorio: `icons/`, el PNG de 512×512).
6. Toca **Crear**.
   **Verás:** tu servidor nuevo con un canal `#general` y un canal de voz `General`. Los borraremos al final (Parte 4.10).
7. Crea los 2 canales que pide Comunidad (los necesitas en la Parte 2):
   1. Toca el nombre del servidor (arriba) → **Crear canal** → **Texto** → nombre: `📜┃reglas` → **Crear canal**.
   2. Otra vez **Crear canal** → **Texto** → nombre: `🧾┃avisos-de-discord` → enciende **Canal privado** → **Crear canal**.
   **Verás:** los dos canales en la lista (Discord pone el nombre en minúsculas: está bien).

---

## Parte 2. Activar Comunidad (PC, 5 minutos)

Comunidad desbloquea los canales de **Anuncios**, los **Foros**, el **AutoMod**, el **Onboarding** y las estadísticas.

1. En la PC, clic en el nombre del servidor (arriba a la izquierda) → **Ajustes del servidor**.
2. En la columna izquierda, baja y clic en **Habilitar comunidad** → **Comenzar**.
3. Marca **Se requiere correo electrónico verificado** y **Analizar el contenido multimedia de todos los miembros** → **Siguiente**.
4. En "Canal de reglas" elige **📜┃reglas**. En "Canal de actualizaciones de la comunidad" elige **🧾┃avisos-de-discord** → **Siguiente**.
5. Deja marcadas las opciones recomendadas (notificaciones solo con menciones, quitar permisos de moderación a @everyone).
6. Marca **Acepto y entiendo** → **Finalizar configuración**.
   **Verás:** en la columna izquierda aparecen **Resumen de Comunidad**, **Onboarding** y **AutoMod**.

> Si Discord pregunta por crear canales nuevos de reglas, di que no: ya los tienes.

---

## Parte 3. Roles (celular o PC, 15 minutos)

**Dónde:** nombre del servidor → **Ajustes del servidor** → **Roles** → **Crear rol**.
Por cada rol: escribe el **nombre exacto**, elige el **color**, marca lo que dice la tabla y toca **Guardar cambios**.

### 3.1 Los roles (créalos en este orden, de arriba hacia abajo)

| # | Nombre exacto (cópialo) | Color | "Mostrar por separado" | ¿Quién lo pone? |
|---|---|---|---|---|
| 1 | `Admin QF` | `#ff3b3b` rojo | Sí | Tú, a mano (solo tú y 1 o 2 personas de confianza) |
| 2 | `Moderador` | `#4da3ff` azul | Sí | Tú, a mano |
| 3 | `Soporte` | `#2ecc71` verde | Sí | Tú, a mano |
| 4 | `Creador de contenido` | `#b06cff` morado | Sí | Tú, a mano (youtubers, streamers) |
| 5 | `VIP` | `#ffb020` dorado | Sí | **El bot** (mientras el jugador tenga Pase VIP) |
| 6 | `Comprador verificado` | `#ffd479` amarillo | No | **El bot** (si compró alguna vez) |
| 7 | `Presidente de asociación` | `#ff8a3d` naranja | Sí | **El bot** (si preside una asociación en el juego) |
| 8 | `Jugador verificado` | `#9ad0ff` celeste | No | **El bot** (al usar `/vincular`) |
| 9 | `Servidor 1 · Quito` | `#5d6b82` gris | No | **El bot** (según el servidor del juego) y el Onboarding |
| 10 | `Servidor 2 · Guayaquil` | `#5d6b82` gris | No | Igual. **Créalo solo si ya existe en el juego** |
| 11 | `Servidor 3 · Cuenca` | `#5d6b82` gris | No | Igual. **Créalo solo si ya existe en el juego** |
| 12 | `🔔 Avisos de eventos` | sin color | No | Cada jugador, en el Onboarding |
| 13 | `🔔 Novedades del juego` | sin color | No | Cada jugador, en el Onboarding |

**Sobre los nombres que pone el bot** (5 a 11): el bot los busca **por nombre**. No importan mayúsculas ni tildes
(`Presidente de asociacion` también sirve) y el punto `·` se puede cambiar por un espacio o un guion. Pero tiene que decir lo mismo.
El rol que la gente llama "jugador vinculado" se llama **`Jugador verificado`**. Para saber qué servidores del juego existen:
en el juego, **Inicio → Tu servidor**, o en el panel `/admin.php`. Los nombres deben ser los mismos que salen ahí.

> ¿Prefieres otros nombres? Se puede, pero entonces hay que decírselo al bot en el VPS (`DISCORD_ROL_VIP=`, `DISCORD_ROL_VERIFICADO=`,
> `DISCORD_ROL_COMPRADOR=`, `DISCORD_ROL_PRESIDENTE=`). Más fácil: usa los de la tabla.

### 3.2 Permisos de cada rol

**Dónde:** **Roles** → toca el rol → pestaña **Permisos**. Lo que no dice la tabla, déjalo **apagado**.

| Rol | Enciende estos permisos |
|---|---|
| **@everyone** (todos) | Deja los que vienen. **Apaga:** "Mencionar @everyone, @here y todos los roles", "Gestionar expresiones" y "Crear expresiones". |
| **Admin QF** | **Administrador** (solo este). |
| **Moderador** | Ver el registro de auditoría · Gestionar mensajes · Gestionar hilos · Gestionar apodos · Aislar temporalmente a miembros · Expulsar miembros · Banear miembros · Silenciar miembros · Ensordecer miembros · Mover miembros · Crear eventos · Gestionar eventos · Ver estadísticas del servidor |
| **Soporte** | Gestionar mensajes · Gestionar hilos |
| **Creador de contenido, VIP, Comprador verificado, Presidente, Jugador verificado, Servidor N, 🔔** | Ninguno extra (solo dan color y acceso a ciertos canales). |
| **EN VIVO Bot** (aparece solo en la Parte 9) | Ver canales · Gestionar roles · Enviar mensajes · Insertar enlaces · Leer el historial de mensajes · Usar comandos de la aplicación |

En **Admin QF**, **Moderador** y **Soporte** apaga "Permitir que cualquiera @mencione este rol". En los dos **🔔** también
(solo el staff los menciona cuando empieza un evento).

### 3.3 Ponerte el rol Admin QF

1. Toca tu nombre en la lista de miembros → **Roles** (o **Editar**) → marca **Admin QF**.

---

## Parte 4. Categorías y canales (celular o PC, 30 a 40 minutos)

**Cómo crear una categoría:** nombre del servidor → **Crear categoría** → nombre → (si dice "privada", enciende **Categoría privada**
y elige los roles) → **Crear categoría**.
**Cómo crear un canal dentro:** en la PC, el **+** al lado de la categoría; en el celular, mantén presionada la categoría → **Crear canal**.
Elige el **tipo**, pega el **nombre** y toca **Crear canal**.
**Modo pausado** (cuántos segundos debe esperar cada persona entre mensajes): mantén presionado el canal → **Editar canal** → **Modo pausado**.
**Tema / descripción** de cada canal: está en `docs/DISCORD_TEXTOS.md`, sección 2 (pégalo en **Editar canal** → **Tema del canal**).

> Si en el celular no ves el tipo **Anuncios** o **Foro**, haz ese canal en la PC (o revisa que la Parte 2 quedó hecha).

### 4.1 📌 INFORMACIÓN — todos leen, solo el staff escribe

Categoría: `📌 INFORMACIÓN`

| Canal (nombre exacto) | Tipo | Modo pausado | Para qué |
|---|---|---|---|
| `👋┃bienvenida` | Texto | — | Mensaje de bienvenida |
| `📜┃reglas` | Texto (ya existe: arrástralo aquí) | — | Reglas |
| `📢┃anuncios` | **Anuncios** | — | Anuncios oficiales (el juego publica aquí con el webhook) |
| `🆕┃novedades-del-juego` | **Anuncios** | — | Actualizaciones y notas de versión |
| `🎁┃códigos-de-regalo` | **Anuncios** | — | Códigos, sorteos y premios oficiales |
| `🎪┃eventos-en-curso` | **Anuncios** | — | Eventos en línea activos (webhook del juego) |
| `🟢┃estado-del-servidor` | **Anuncios** | — | Mantenimientos y caídas (webhook del juego) |
| `❓┃preguntas-frecuentes` | Texto | — | Preguntas frecuentes |
| `🔗┃vincular-cuenta` | Texto | 30 s | Donde se usa `/vincular` |

Permisos de la categoría (mantén presionada la categoría → **Editar categoría** → **Permisos**):
1. **@everyone:** pon en ✗ (rojo) **Enviar mensajes**, **Enviar mensajes en hilos**, **Crear hilos públicos**, **Crear hilos privados** y **Crear encuestas**.
2. **Agregar rol → Moderador:** pon en ✓ (verde) **Enviar mensajes** y **Enviar mensajes en hilos**.
3. **Guardar cambios.** Los canales de dentro quedan "sincronizados" con la categoría (así debe ser).

> En `🔗┃vincular-cuenta` nadie puede escribir mensajes, pero **sí** usar `/vincular` (eso es "Usar comandos de la aplicación",
> que @everyone ya tiene). Así el canal queda limpio y los códigos no quedan a la vista.

### 4.2 🛟 SOPORTE Y OPINIONES — todos escriben

Categoría: `🛟 SOPORTE Y OPINIONES`

| Canal | Tipo | Modo pausado | Para qué |
|---|---|---|---|
| `🛟┃soporte` | **Foro** | 10 min | Orientación. **El soporte oficial es en el juego y por correo** (el tema lo dice) |
| `🐞┃reporte-de-errores` | **Foro** | 5 min | Un error por publicación, con plantilla |
| `💡┃sugerencias` | **Foro** | 30 min | Ideas, se votan con 👍 |
| `🤝┃ayuda-entre-jugadores` | Texto | 5 s | La "ayuda del juego" entre jugadores: qué equipo comprar, cómo pasar un capítulo |

En los foros: **Editar canal** → **Etiquetas** → crea las de `docs/DISCORD_TEXTOS.md` (sección 2) y enciende
**Requerir etiquetas al publicar**.

### 4.3 💬 COMUNIDAD — todos escriben

Categoría: `💬 COMUNIDAD`

| Canal | Tipo | Modo pausado |
|---|---|---|
| `💬┃general-español` | Texto | 3 s |
| `💬┃general-english` | Texto | 3 s |
| `📸┃capturas-y-clips` | Texto | 30 s |
| `🎲┃fuera-de-tema` | Texto | 5 s |
| `🤖┃comandos-bot` | Texto | 5 s |

**Por país (opcional, créalos cuando haya unas 20 personas de ese país):** `🇪🇨┃ecuador`, `🇨🇴┃colombia`, `🇵🇪┃perú`
(Texto, 3 s, en esta misma categoría). Si los creas, agrega la pregunta 4 del Onboarding (Parte 7).

### 4.4 🎥 PRODUCTORAS

Categoría: `🎥 PRODUCTORAS`

| Canal | Tipo | Modo pausado | Notas |
|---|---|---|---|
| `🏆┃eventos-y-ligas` | Texto | 5 s | Liga Semanal, Mega Festival, Duelos, Desafío del Día |
| `🏆┃copa-de-servidores` | Texto | 5 s | La Copa de Servidores: tu servidor contra los demás |
| `🛡️┃reclutamiento-de-asociaciones` | **Foro** | 6 horas | "Buscar asociación": busca o recluta productoras |
| `🎓┃guias-y-consejos` | **Foro** | 1 hora | Guías de la comunidad |
| `💎┃sala-vip` | Texto | 3 s | **Canal privado** → rol **VIP**, **Moderador** y **Soporte** |

### 4.5 🌎 SERVIDORES DEL JUEGO — cada quien ve el de su servidor

Categoría: `🌎 SERVIDORES DEL JUEGO` → **Categoría privada** → roles **Moderador** y **Soporte**.

| Canal | Tipo | Quién lo ve |
|---|---|---|
| `🏙️┃servidor-1-quito` | Texto, 3 s | Editar canal → **Permisos** → **Agregar rol** `Servidor 1 · Quito` → ✓ **Ver canal** |
| `🏙️┃servidor-2-guayaquil` | Texto, 3 s | Igual, con `Servidor 2 · Guayaquil` (solo si ese servidor existe) |
| `🏙️┃servidor-3-cuenca` | Texto, 3 s | Igual, con `Servidor 3 · Cuenca` (solo si existe) |

### 4.6 🔊 VOZ Y EN VIVO

Categoría: `🔊 VOZ Y EN VIVO`

| Canal | Tipo |
|---|---|
| `🎙️ Sala de productoras` | Voz |
| `🤝 Asociaciones 1` | Voz |
| `🎤 Escenario EN VIVO` | **Escenario** (para charlas con el equipo; si no aparece, déjalo para después) |

### 4.7 🛡️ STAFF — oculto para todos menos el staff

Categoría: `🛡️ STAFF` → **Categoría privada** → roles **Moderador** y **Soporte**.

| Canal | Tipo |
|---|---|
| `🛡️┃staff-general` | Texto |
| `🚨┃automod-alertas` | Texto (aquí llegan los avisos del AutoMod) |
| `📋┃registro-moderacion` | Texto (anotar cada sanción) |
| `🧾┃avisos-de-discord` | Texto (ya existe: arrástralo aquí) |
| `🔒 Staff` | Voz |

### 4.8 Ordenar

1. En la PC, arrastra las categorías en este orden: 📌 INFORMACIÓN · 🛟 SOPORTE Y OPINIONES · 💬 COMUNIDAD · 🎥 PRODUCTORAS ·
   🌎 SERVIDORES DEL JUEGO · 🔊 VOZ Y EN VIVO · 🛡️ STAFF.
   (En el celular: nombre del servidor → **Ajustes** → **Canales** → **Editar** / arrastrar.)

### 4.9 Resumen de permisos por canal

| Dónde | @everyone | Jugador verificado / Servidor N / VIP | Moderador y Soporte | Admin QF |
|---|---|---|---|---|
| 📌 INFORMACIÓN | Lee y reacciona; no escribe | Igual que @everyone | Moderador escribe | Todo |
| 🔗┃vincular-cuenta | Solo `/vincular` y comandos | Igual | Escribe | Todo |
| 🛟, 💬, 🎥 (menos sala-vip) | Lee y escribe | Igual | Borra, aísla, gestiona hilos | Todo |
| 💎┃sala-vip | No la ve | Solo **VIP** la ve | La ven | Todo |
| 🏙️┃servidor-N | No lo ve | Solo su **Servidor N** lo ve | Lo ven | Todo |
| 🛡️ STAFF | No la ve | No la ve | La ven | Todo |

### 4.10 Borrar lo que creó Discord al inicio

1. Mantén presionado `#general` → **Eliminar canal** → confirmar.
2. Mantén presionado el canal de voz `General` → **Eliminar canal**.
3. Borra también las categorías vacías **Canales de texto** y **Canales de voz** (y `#moderator-only` o `#rules` si Discord los creó en la Parte 2).

---

## Parte 5. Mensajes fijos (celular o PC, 15 minutos)

Copia los textos de `docs/DISCORD_TEXTOS.md` y pégalos así:

1. `📜┃reglas` → sección 3 (son 2 mensajes: pega uno, envía, pega el otro).
2. `👋┃bienvenida` → sección 5.
3. `🔗┃vincular-cuenta` → sección 7.
4. `❓┃preguntas-frecuentes` → sección 8.
5. `🛟┃soporte` → crea una publicación "📌 Cómo pedir soporte" con la sección 12 y **fíjala** (⋯ → **Fijar publicación**).
6. Cambia `[correo de soporte]` por el correo real. Si todavía no existe, borra esa parte de la frase (deja "dentro del juego").

> Los nombres de canal en los textos (por ejemplo `#vincular-cuenta`) se ven como texto normal. Si quieres que sean enlaces azules:
> borra el nombre, escribe `#` y elige el canal de la lista.

---

## Parte 6. Seguridad (PC, 15 minutos)

### 6.1 Nivel de verificación y filtro

1. **Ajustes del servidor** → **Configuración de seguridad** (Safety Setup) → **Protección contra MD y spam** → **Editar**.
2. **Nivel de verificación:** elige **Medio** (cuenta de Discord con más de 5 minutos y correo verificado).
   Si un día hay un ataque de cuentas nuevas (raid), súbelo a **Alto** o **Máximo** unas horas.
3. **Filtro de contenido explícito:** **Analizar el contenido de todos los miembros**.
4. Enciende la **protección contra raids y CAPTCHA** y el **filtro de spam en MD** si aparecen.
5. **Guardar.**

### 6.2 Que acepten las reglas antes de escribir

1. En la misma pantalla (**Protección contra MD y spam** → **Editar**) marca
   **Los miembros deben aceptar las reglas antes de poder hablar o enviar MD** → **Comenzar**.
2. Pega las reglas cortas de `docs/DISCORD_TEXTOS.md`, sección 4, **una por casilla** (Discord permite hasta 16).
3. **Guardar.**
   **Verás:** al entrar con una cuenta de prueba, sale una ventana con las reglas y el botón para aceptarlas.

### 6.3 Seguridad del staff

1. **Configuración de seguridad** → **Permisos** → enciende **Requerir 2FA para acciones de moderación**.
2. Pide a cada Moderador y Soporte que active la verificación en dos pasos (Parte 0) **antes** de darle el rol.

### 6.4 AutoMod (los filtros automáticos)

**Dónde:** **Ajustes del servidor** → **AutoMod**. Las palabras se pegan **separadas por comas** (las listas están en
`docs/DISCORD_TEXTOS.md`, sección 13). Un `*` al principio o al final sirve para que encuentre la palabra dentro de otras.

| # | Regla | Qué hacer en la pantalla | Respuesta |
|---|---|---|---|
| 1 | **Bloquear spam de menciones** | **Configurar** → límite **5** menciones por mensaje → enciende la protección contra raids | Bloquear + alerta a `🚨┃automod-alertas` + aislar **10 minutos** |
| 2 | **Bloquear contenido spam** | **Configurar** | Bloquear + alerta |
| 3 | **Palabras frecuentemente marcadas** (lista de Discord, solo en inglés) | **Configurar** → marca las 3 listas (Groserías, Contenido sexual, Insultos e insultos ofensivos) | Bloquear + alerta |
| 4 | **Palabras clave personalizadas** → nombre `EN VIVO · Groserías (Ecuador y vecinos)` | **Crear regla** → pega la **lista A** | Bloquear con el aviso "🚫 Ese lenguaje no va aquí. Lee #reglas." + alerta |
| 5 | **Palabras clave personalizadas** → `EN VIVO · Estafas y dinero real` | Pega la **lista B** | Bloquear + alerta + aislar **10 minutos** |
| 6 | **Palabras clave personalizadas** → `EN VIVO · Invitaciones a otros servidores` | Pega la **lista C** | Bloquear + alerta |
| 7 | **Palabras clave personalizadas** → `EN VIVO · Avisar sin bloquear` | Pega la **lista D** | **Solo** alerta (no bloquea) |

En cada regla, en **Exenciones / Permitir**: agrega los roles **Admin QF** y **Moderador** (así pueden pegar la invitación
oficial o citar una palabra al moderar). En **Canal de alertas** elige siempre `🚨┃automod-alertas`.
**Verás:** cada regla con un interruptor verde.

> Revisa `🚨┃automod-alertas` dos veces al día. Si una palabra bloquea cosas inocentes, sácala de la lista. Si se cuela un
> insulto nuevo, agrégalo.

---

## Parte 7. Bienvenida y Onboarding (PC, 15 minutos)

En un servidor Comunidad, la "pantalla de bienvenida" de antes ya no se edita: ahora se usa el **Onboarding**
(preguntas al entrar) y la **Guía del servidor**.

### 7.1 Canales por defecto

1. **Ajustes del servidor** → **Onboarding** (puede decir **Incorporación**) → **Canales predeterminados**.
2. Marca: `👋┃bienvenida`, `📜┃reglas`, `📢┃anuncios`, `🆕┃novedades-del-juego`, `🎁┃códigos-de-regalo`, `🎪┃eventos-en-curso`,
   `🟢┃estado-del-servidor`, `❓┃preguntas-frecuentes`, `🔗┃vincular-cuenta`, `💬┃general-español`, `🤝┃ayuda-entre-jugadores`,
   `📸┃capturas-y-clips`, `🏆┃eventos-y-ligas`, `🐞┃reporte-de-errores`, `🛟┃soporte`.
   (Discord pide **mínimo 7**, y **5** donde todos puedan escribir: los 5 últimos cumplen.)

### 7.2 Preguntas

**Preguntas** → **Agregar una pregunta**. Los títulos y las opciones para copiar están en `docs/DISCORD_TEXTOS.md`, sección 6.

| # | Pregunta | Opciones → qué dan | Ajustes |
|---|---|---|---|
| 1 | Idioma | Español → canal `💬┃general-español` · English → `💬┃general-english` | **Obligatoria**, **Preguntar antes de entrar** |
| 2 | ¿En qué servidor del juego estás? | Servidor 1 · Quito → rol `Servidor 1 · Quito` (y 2 y 3 si existen) · "Todavía no juego" → nada | Preguntar antes de entrar, **varias respuestas** |
| 3 | ¿Qué te interesa? | Avisos de eventos → rol `🔔 Avisos de eventos` · Novedades → rol `🔔 Novedades del juego` · Buscar asociación → canal reclutamiento · Copa de Servidores → canal copa · Guías → canal guías | Varias respuestas |
| 4 | (Opcional) ¿De dónde eres? | Ecuador / Colombia / Perú → su canal · Otro país → nada | Solo si creaste los canales por país |

### 7.3 Guía del servidor y vista previa

1. En **Onboarding** → **Guía del servidor**: pega el mensaje corto de bienvenida (sección 6 de los textos), agrega las
   **tareas** ("Lee las reglas" → `📜┃reglas`; "Vincula tu cuenta" → `🔗┃vincular-cuenta`; "Saluda" → `💬┃general-español`)
   y como **recursos** `📜┃reglas` y `❓┃preguntas-frecuentes`.
2. Toca **Vista previa** (arriba). Revisa que todo se entienda.
3. Toca **Habilitar**.
   **Verás:** "Onboarding activado".

---

## Parte 8. Invitación que nunca vence (celular o PC, 2 minutos)

1. Mantén presionado `👋┃bienvenida` → **Invitar a gente**.
2. Toca **Editar enlace de invitación** (o el engranaje).
3. **Caducar después de:** **Nunca**. **Número máximo de usos:** **Sin límite**. → **Guardar** / **Generar nuevo enlace**.
4. Toca **Copiar**. **Verás:** algo como `https://discord.gg/AbCd1234`. Guárdalo: lo usas en la Parte 9.6 (botón del juego).
5. Ponlo también en las redes de QF Producciones (texto listo en `docs/DISCORD_TEXTOS.md`, sección 14).

> **Enlace bonito** (`discord.gg/envivotycoon`, "vanity"): Discord lo da cuando el servidor llega a nivel 3 de mejoras (boosts)
> o si entra a su programa de socios. Cuando lo tengas: **Ajustes del servidor** → **Enlace de invitación personalizado**, y
> cambia la dirección en el VPS (Parte 9.6). Mientras tanto, el de arriba sirve para siempre.

---

## Parte 9. Conectar el bot "EN VIVO Bot" (PC, 25 minutos)

El bot ya está programado dentro del juego (`server/src/Discord.php`). No hay que dejar ningún programa prendido: Discord le
manda los comandos a `https://juego.tukanec.com/discord/interacciones` y el juego responde.
Si hiciste el **camino A**, la aplicación "EN VIVO Bot" ya existe y ya está en tu servidor: **salta al paso 9.1.3**.

### 9.1 La aplicación (Developer Portal)

1. Entra a **https://discord.com/developers/applications** con tu cuenta de Discord.
2. **New Application** → nombre `EN VIVO Bot` → acepta los términos → **Create**.
3. Pestaña **General Information**. Copia en un bloc de notas **de tu PC** (no en el chat):
   - **Application ID** → será `DISCORD_APP_ID`
   - **Public Key** → será `DISCORD_PUBLIC_KEY`
4. Sube el ícono y escribe la descripción: `Bot oficial de EN VIVO Tycoon. Vincula tu cuenta con /vincular.` → **Save Changes**.
5. Pestaña **Installation** → en **Install Link** elige **None** → **Save Changes** (así nadie más puede agregar el bot).
6. Pestaña **Bot**:
   1. Apaga **Public Bot**.
   2. Los tres **Privileged Gateway Intents** se quedan **apagados** (el bot no los necesita).
   3. Toca **Reset Token** → **Yes, do it!** → **Copy**. Es `DISCORD_BOT_TOKEN`. Pégalo de inmediato en el bloc de notas
      (Discord no lo vuelve a mostrar).
   4. **Save Changes**.

### 9.2 Meter el bot a tu servidor

1. Copia esta dirección, cambia `TU_APP_ID` por el **Application ID** y ábrela en el navegador:
   ```
   https://discord.com/oauth2/authorize?client_id=TU_APP_ID&scope=bot+applications.commands&permissions=268435456&integration_type=0
   ```
   (`268435456` = solo **Gestionar roles**, lo único que necesita.)
2. Elige **EN VIVO Tycoon · Oficial** → **Continuar** → **Autorizar** → resuelve el captcha.
   **Verás:** "EN VIVO Bot se unió al servidor" y un rol nuevo **EN VIVO Bot**.
3. **Copia el ID del servidor:** clic derecho en el ícono del servidor (columna izquierda) → **Copiar ID del servidor**
   (en el celular: mantén presionado el ícono → **Copiar ID**). Es `DISCORD_GUILD_ID`.

### 9.3 El rol del bot va ARRIBA (muy importante)

1. **Ajustes del servidor** → **Roles**.
2. Arrastra **EN VIVO Bot** hasta quedar **encima** de `VIP`, `Comprador verificado`, `Presidente de asociación`,
   `Jugador verificado` y los `Servidor N · Ciudad` (lo más fácil: justo debajo de **Soporte**).
3. Abre **EN VIVO Bot** → **Permisos** → revisa que tenga los de la tabla 3.2 (Ver canales, Gestionar roles, Enviar mensajes,
   Insertar enlaces, Leer el historial, Usar comandos). Si hiciste el camino A, **apaga Administrador**.
   **Verás:** el orden: Admin QF · Moderador · Soporte · **EN VIVO Bot** · Creador · VIP · ...

> Si el orden queda mal, el bot no se rompe: deja un aviso en el panel (`/admin.php`) y reintenta cada hora.

### 9.4 Webhooks (para que el juego publique anuncios solo)

Por cada canal: mantén presionado el canal (o el engranaje) → **Editar canal** → **Integraciones** → **Webhooks** →
**Nuevo webhook** → nombre `EN VIVO Tycoon` → **Copiar URL del webhook**. Guárdala en el bloc de notas.

| Canal | Variable |
|---|---|
| `📢┃anuncios` | `DISCORD_WEBHOOK_ANUNCIOS` |
| `🎪┃eventos-en-curso` | `DISCORD_WEBHOOK_EVENTOS` |
| `🟢┃estado-del-servidor` | `DISCORD_WEBHOOK_ESTADO` |

(Un webhook también es secreto: quien lo tenga puede publicar en ese canal. Si se filtra, bórralo y crea otro.)

### 9.5 Poner los datos en el VPS

1. Abre **PuTTY** (en la PC) o **Termius** (en el celular) y entra al VPS del juego.
2. Copia y pega:
   ```
   sudo nano /etc/envivo/config.env
   ```
3. Busca cada línea con **Ctrl + W** (escribe `DISCORD_APP_ID` y Enter) y escribe tu dato **después del `=`**, sin espacios ni comillas:
   ```
   DISCORD_APP_ID=el_application_id
   DISCORD_PUBLIC_KEY=la_public_key
   DISCORD_BOT_TOKEN=el_token
   DISCORD_GUILD_ID=el_id_del_servidor
   DISCORD_WEBHOOK_ANUNCIOS=https://discord.com/api/webhooks/...
   DISCORD_WEBHOOK_EVENTOS=https://discord.com/api/webhooks/...
   DISCORD_WEBHOOK_ESTADO=https://discord.com/api/webhooks/...
   DISCORD_INVITACION=https://discord.gg/tu_invitacion
   ```
   Si alguna línea no está en el archivo, escríbela al final. `DISCORD_ROLES_JSON=` déjala vacía.
4. Guarda: **Ctrl + O**, **Enter**, **Ctrl + X**.
5. Recarga PHP:
   ```
   sudo systemctl reload php8.3-fpm
   ```
   **Verás:** no sale nada (eso es bueno).

### 9.6 El botón "Únete a nuestro Discord" en el juego

No hay que hacer nada más: con `DISCORD_INVITACION` puesta (paso 9.5), el juego muestra el botón **Únete a nuestro Discord**
en **Inicio** (debajo de **Ayuda y soporte**) y en **Tienda → Tu cuenta** (junto a **Vincular Discord**).
Si la línea está vacía o no es un enlace de Discord (`https://discord.gg/...` o `https://discord.com/invite/...`), el botón
no sale. **Verás:** recarga el juego y aparece el botón; al tocarlo se abre el Discord.

### 9.7 Decirle a Discord dónde está el bot

1. Primero comprueba que el juego responde. En PuTTY:
   ```
   curl -i https://juego.tukanec.com/discord/interacciones
   ```
   **Verás:** `HTTP/2 405` (o `405 Method Not Allowed`). Eso está bien. Si sale **404**, corre
   `sudo bash /var/www/envivo/server/deploy/actualizar.sh` y vuelve a probar.
2. Developer Portal → **General Information** → **Interactions Endpoint URL**, pega:
   ```
   https://juego.tukanec.com/discord/interacciones
   ```
3. **Save Changes**.
   **Verás:** "All your edits have been carefully recorded" (en verde). Discord acaba de probar la dirección y funcionó.
   Si dice que la dirección no es válida, mira "Si algo sale mal" al final.

### 9.8 Registrar los comandos (una sola vez)

1. En PuTTY:
   ```
   sudo -u www-data php /var/www/envivo/server/bin/discord_comandos.php
   ```
   **Verás:** `Listo: 6 comandos registrados globales: /vincular /desvincular /perfil /ranking /eventos /ayuda`
2. En Discord, cierra y vuelve a abrir la app. Escribe `/` en `🔗┃vincular-cuenta`: deben salir los comandos de **EN VIVO Bot**.

> No uses también `--servidor` (ese es solo para pruebas): si registras de las dos formas, los comandos salen repetidos.

### 9.9 Probar `/vincular`

1. En el juego (con tu cuenta abierta): **Tienda** → **Tu cuenta** → **Vincular Discord**.
   **Verás:** una ventana con un **código de 8 letras**, el comando `/vincular codigo:XXXXXXXX` y "vence en 10:00".
2. Toca **Copiar comando**.
3. En Discord, en `🔗┃vincular-cuenta`, escribe `/vincular`, elige el de **EN VIVO Bot** y pega el código en la casilla **codigo**. Enter.
   **Verás:** un mensaje que **solo tú ves** diciendo que quedó vinculado, y en tu perfil los roles **Jugador verificado** y
   **Servidor 1 · Quito** (y **VIP** / **Comprador verificado** / **Presidente de asociación** si te tocan).
4. Prueba también `/perfil`, `/ranking`, `/eventos` y `/ayuda` en `🤖┃comandos-bot`.
5. Revisa la sincronización en PuTTY:
   ```
   sudo -u www-data php /var/www/envivo/server/bin/discord_sync.php --detalle
   ```
   **Verás:** `discord_sync OK: 1 revisados, ... 0 con problemas`.

¡Listo! Los roles se revisan solos cada 10 minutos (VIP vencido, compras nuevas, cambio de asociación o de servidor).

---

## Parte 10. Lanzamiento

1. Publica el anuncio de `docs/DISCORD_TEXTOS.md`, sección 9, en `📢┃anuncios` y toca **Publicar** (para que llegue a quienes siguen el canal).
2. Publica el primer mensaje de `🎁┃códigos-de-regalo` (sección 10) y de `🏆┃copa-de-servidores` (sección 11).
3. Comparte la invitación en redes (sección 14).
4. Elige a tus primeros Moderadores (jugadores activos y maduros, con 2FA). La guía de moderación y el calendario semanal
   están en `docs/DISCORD.md` (secciones "Guía de moderación" y "Calendario semanal").

---

## Si algo sale mal

| Qué pasa | Qué hacer |
|---|---|
| Discord dice que la **Interactions Endpoint URL** no es válida | Revisa que `DISCORD_PUBLIC_KEY` esté bien copiada (64 letras y números), que recargaste PHP (9.5.5) y que el `curl` del 9.7.1 da 405. Si el dominio pasa por Cloudflare con la nube naranja: Cloudflare → **Security** → **WAF** → regla que **salte** (Skip) los desafíos y Bot Fight Mode para la ruta `/discord/interacciones`. |
| `discord_comandos.php` dice **ERROR ... 401** | El token está mal. Developer Portal → Bot → **Reset Token**, ponlo de nuevo en `DISCORD_BOT_TOKEN` y recarga PHP. |
| Dice **ERROR ... 403** | El bot no está en el servidor o faltó `applications.commands` en la invitación: repite 9.2. |
| No salen los comandos al escribir `/` | Espera unos minutos, cierra y abre Discord. Revisa que el 9.8 dijo "Listo". |
| `/vincular` dice "Ese código no es válido o ya venció" | El código dura 10 minutos y sirve una vez. Pide otro en el juego. |
| Dice "Primero únete al servidor oficial" | Quedaste vinculado; entra al Discord y los roles llegan solos (máximo 1 hora) o usa `/vincular` con un código nuevo. |
| Quedó vinculado pero **no le llegan los roles** | 1) El rol **EN VIVO Bot** debe estar ARRIBA (9.3). 2) Los nombres de los roles deben ser los de la tabla 3.1. 3) Mira el aviso en `/admin.php` o corre `discord_sync.php --detalle`: dice qué rol falta. |
| No sale el botón **Únete a nuestro Discord** | `DISCORD_INVITACION` vacía o mal escrita (debe empezar con `https://discord.gg/`), o falta recargar PHP. Recarga el juego. |
| Se filtró el token o un webhook | Token: **Reset Token** y cámbialo en el VPS. Webhook: bórralo en el canal, crea otro y cámbialo en el VPS. |
| Llegan muchas cuentas nuevas haciendo spam (raid) | Nombre del servidor → **Acciones de seguridad** → **Pausar invitaciones** y **Pausar MD**; sube la verificación a **Alto**. |

Más detalle del bot: `docs/DISCORD_BOT.md`. Del programa del camino A: `docs/DISCORD.md`.

---

## Fuentes (consultadas en octubre de 2026)

- Discord, *Enabling Your Community Server* (pasos de Comunidad, correo verificado, filtro de contenido, canal de reglas y de avisos; la pantalla de bienvenida ya no se edita después de activar Comunidad): https://support.discord.com/hc/articles/360047132851
- Discord, *Community Onboarding FAQ* (Ajustes del servidor → Onboarding; mínimo 7 canales por defecto y 5 donde se pueda escribir; preguntar antes de entrar, obligatoria, varias respuestas; **solo se configura en PC**): https://support.discord.com/hc/en-us/articles/11074987197975
- Discord, *AutoMod FAQ* (Ajustes del servidor → AutoMod; listas de Discord solo en inglés; hasta 1.000 palabras de 60 letras por regla; `*` al principio o al final; bloquear, alertar, aislar; **no se edita en el celular**; requiere Comunidad): https://support.discord.com/hc/articles/4421269296535
- Discord, *Rules Screening FAQ* (Configuración de seguridad → Protección contra MD y spam → "Los miembros deben aceptar las reglas"; hasta 16 reglas): https://support.discord.com/hc/en-us/articles/1500000466882
- Discord Developer Docs, *Application resource* (Install Link: Discord Provided Link, Custom URL o **None**; instalación en servidor por defecto; `interactions_endpoint_url`): https://docs.discord.com/developers/resources/application
- Discord Developer Docs, *Community servers* (qué desbloquea Comunidad: Onboarding, canales de anuncios, AutoMod, estadísticas): https://docs.discord.com/developers/communities/overview
- TechRadar, *How to set up Discord AutoMod* (AutoMod solo en PC, respuestas posibles): https://www.techradar.com/how-to/how-to-set-up-discord-automod
- Diseño del servidor, roles y listas de AutoMod: `discord/estructura.json` (el mismo que usa el programa del camino A). Roles del bot: `server/src/Discord.php` (`ROLES`, `rolesDeseados`, `claveRol`).
