# Ficha de Google Play y formularios de Play Console · EN VIVO Tycoon

Todo lo que hay que llenar en Play Console para publicar la versión 1.0, en el orden en que lo pide la consola.
Los textos de la ficha están en `ficha_<idioma>.md` (10 idiomas). La prueba `node tests/test_traducciones.js`
mide cada texto y falla si alguno se pasa de los límites o si esta tabla no coincide con las fichas.

- Paso a paso completo para publicar (desde cero hasta producción): **`docs/PUBLICAR_GOOGLE_PLAY.md`**.
- Palabras clave, plan de las 8 capturas y guion del video de 30 s: **`ASO_Y_CAPTURAS.md`** (esta carpeta).
- Lanzamiento limitado en Ecuador, Colombia y Perú: **`docs/LANZAMIENTO_LIMITADO.md`**.

> ⚠️ Estas respuestas describen el juego tal como está en el código al 23 oct 2026. Si cambia algo (anuncios,
> nuevos datos, chat de voz, cajas sorpresa, otra herramienta de analítica, etc.), hay que actualizar los formularios
> **antes** de subir la nueva versión. Google revisa que la ficha y los formularios coincidan con la app.

## 1. Ficha de Play Store (Crecer › Presencia en Play Store › Ficha principal)

| Campo | Límite | Dónde está |
|---|---|---|
| Nombre de la app | 30 caracteres | `## Nombre de la app` → **EN VIVO Tycoon: Productora TV** traducido (máx. 29) |
| Descripción breve | 80 caracteres | `## Descripción breve` |
| Descripción completa | 4.000 caracteres | `## Descripción completa` |
| Novedades de la versión | 500 caracteres | `## Novedades (versión 1.0)` (se pega al crear la versión en Producción) |
| Palabras clave | no es un campo de Play | `## Palabras clave`: ideas para repartir en la descripción y en el título de las capturas (Play no tiene campo de palabras clave) |

Idiomas que hay que agregar en "Administrar traducciones › Agregar tus propias traducciones":

| Archivo | Código en Play Console |
|---|---|
| `ficha_es.md` | **es-419** Español (Latinoamérica) — idioma principal. Se puede copiar igual a es-ES y es-US |
| `ficha_en.md` | en-US (copiar igual a en-GB si se quiere) |
| `ficha_pt-BR.md` | pt-BR |
| `ficha_fr.md` | fr-FR (y fr-CA) |
| `ficha_de.md` | de-DE |
| `ficha_it.md` | it-IT |
| `ficha_ru.md` | ru-RU |
| `ficha_tr.md` | tr-TR |
| `ficha_id.md` | id |
| `ficha_zh-CN.md` | zh-CN |

Gráficos (detalle en `assets/promo/README.md` y plan nuevo en `ASO_Y_CAPTURAS.md`): ícono 512×512
(`assets/promo/icon_512.png`, PNG con alfa ✅), gráfico de funciones 1024×500 (`assets/promo/feature_graphic.png` y
`feature_graphic_en.png`, PNG sin alfa ✅) y de 2 a 8 capturas de teléfono 1080×1920 por idioma.
⚠️ La captura `screens_es/01.png` (y `screens_en/01.png`) muestra el texto **"Partido de LigaPro"** (marca real): hay
que volver a generarla antes de subirla (el juego ya usa la marca inventada; ver `ASO_Y_CAPTURAS.md` §3).

### Verificación de límites (caracteres contados como Play Console, uno por letra/emoji/ideograma)

| Idioma | Nombre (≤30) | Breve (≤80) | Completa (≤4000) | Novedades (≤500) | Estado |
|---|---|---|---|---|---|
| es | 29 | 75 | 2699 | 301 | ✅ |
| en | 27 | 73 | 2538 | 293 | ✅ |
| pt-BR | 28 | 74 | 2643 | 296 | ✅ |
| fr | 29 | 75 | 2915 | 312 | ✅ |
| de | 29 | 74 | 2826 | 288 | ✅ |
| it | 29 | 77 | 2747 | 310 | ✅ |
| ru | 25 | 74 | 2665 | 292 | ✅ |
| tr | 28 | 76 | 2639 | 298 | ✅ |
| id | 27 | 73 | 2726 | 292 | ✅ |
| zh-CN | 22 | 27 | 880 | 117 | ✅ |

Si se edita una ficha, correr `node tests/test_traducciones.js`: imprime las medidas nuevas para copiar a esta tabla.

Reglas que la prueba también revisa en las fichas: el nombre es exactamente "EN VIVO Tycoon", 5 palabras clave,
se mencionan las compras opcionales, no hay precios (cambian por país) y **no aparece ninguna marca real**
(vMix, ATEM, Blackmagic, Sony, Canon, YouTube, LigaPro, Kingshot, WhatsApp…). El juego usa marcas inventadas;
la ficha habla de "fútbol profesional" y "switchers" en general.

Reglas de Google para los textos (política de metadatos): sin emojis ni símbolos repetidos en la descripción breve,
sin "el mejor", "#1", "gratis por tiempo limitado", precios ni llamados a la acción; nada de testimonios inventados;
las palabras clave se usan en frases naturales, sin listas repetidas.

## 2. Configuración de la app (Política › Contenido de la app)

### 2.1 Política de privacidad
- URL: `https://juego.tukanec.com/privacidad.html` (versión oficial en español).
- Las traducciones de conveniencia están en `docs/traducciones/legal/privacidad_<idioma>.html`; si se publican, van
  en `/privacidad_<idioma>.html` (los enlaces internos de esas páginas ya apuntan ahí).
- ⚠️ Antes de enviar: llenar [DIRECCIÓN] (RUC, correo soporte@tukanec.com y fecha ya están) y que la revise un abogado
  (lista en `docs/LEGAL_REVISION.md`).
- Enlace web para eliminar la cuenta (Seguridad de los datos): `https://juego.tukanec.com/borrar-cuenta.html` (explica cómo
  pedirlo sin la app, por correo a soporte@tukanec.com).

### 2.2 Acceso a la app
- "Toda la funcionalidad está disponible sin acceso especial": **No**, porque la tienda, el mercado y el chat
  piden cuenta. Dar a Google una **cuenta de prueba** (correo + clave) que ya tenga una compra hecha en sandbox, para
  que el revisor pueda abrir el mercado y el chat. El modo historia se juega sin cuenta.
- Texto para "Instrucciones" (copiar): *"La historia se juega sin cuenta. Para ver la tienda, el mercado, el chat y
  los eventos en línea: Cuenta → Entrar con el correo y la clave de abajo. La cuenta ya tiene créditos y una compra de
  prueba. Las compras dentro de la app usan Google Play Billing."*

### 2.3 Anuncios
- "¿Tu app contiene anuncios?": **No**. El juego no tiene SDK de anuncios, ni anuncios propios, ni videos con recompensa,
  ni promociona otras apps.
- **ID de publicidad** (Política › Contenido de la app › ID de publicidad): "¿Tu app usa el ID de publicidad?" **No**.
  La app de Bubblewrap no incluye el permiso `AD_ID` ni SDK de anuncios o de atribución.

### 2.4 Clasificación del contenido (cuestionario IARC)
- Correo de contacto: el de soporte. Categoría: **Juego** (no "Aplicación de referencia, noticias o educativa").
- Respuestas (todas **No** salvo las marcadas):

| Pregunta del cuestionario | Respuesta | Por qué |
|---|---|---|
| Violencia (cualquier tipo, incluida la caricaturesca o fantástica) | **No** | Juego de gestión: cámaras, cables, lluvia, apagones. El boxeo y la lucha libre se **transmiten** como evento (se ve un ring a lo lejos), no se juegan ni hay golpes animados. Si algún día se muestran peleas, revisar. |
| Sangre, terror, miedo | **No** | |
| Contenido sexual, desnudos, insinuaciones | **No** | |
| Lenguaje soez, humor grosero | **No** | El chat tiene filtro de groserías (ver abajo "Interacción"). |
| Drogas, alcohol, tabaco | **No** | No se muestran ni se mencionan como parte del juego. |
| Apuestas con dinero real | **No** | |
| Juegos de azar simulados (casino, ruleta, tragamonedas) | **No** | No hay casino ni ruleta. |
| Cajas sorpresa / objetos al azar que se compran | **No** | Todo lo que se vende muestra su contenido fijo antes de pagar (`server/src/Catalogo.php`, `server/MONETIZACION.md`). Si algún día se agregan, responder **Sí** y publicar las probabilidades. |
| Discriminación / contenido controversial | **No** | |
| **Los usuarios pueden interactuar o intercambiar contenido** | **Sí** | Chat de servidor y de asociación (solo texto, máx. 300 caracteres) y mercado de equipos con créditos. |
| Comparte la ubicación del usuario con otros usuarios | **No** | |
| **Compras de bienes digitales** | **Sí** | Créditos, ofertas, refuerzos, Tarjeta mensual, pases. Nada se renueva solo. |
| Acceso sin restricciones a internet (navegador) | **No** | La app solo abre juego.tukanec.com. |
| ¿Es una app de "solo navegador" / contenido de terceros? | **No** | |

- Notas sobre el chat para las preguntas que siguen: solo texto y mensajes rápidos; no hay voz, video, fotos ni
  mensajes privados 1 a 1. Moderación: filtro automático de groserías y de datos de contacto (enlaces, correos,
  teléfonos), botón para **reportar** y para **bloquear**, y el administrador puede ocultar mensajes y silenciar
  1 h / 24 h / 7 días o expulsar (`server/src/Chat.php`, `server/src/Filtro.php`). Los mensajes se borran a los 30 días.
- Resultado esperado: clasificación baja (tipo PEGI 3/7, ESRB Everyone, ClassInd L/10) con los descriptores
  **"Los usuarios interactúan"** y **"Compras integradas"**. La clasificación IARC es independiente del público
  objetivo (2.5): que el juego sea "para todos" en IARC no obliga a dirigirlo a niños.

### 2.5 Público objetivo y contenido (decisión: **16 años o más**)
- Edades del público objetivo: marcar **solo 16-17 y 18 o más**. **No** marcar 13-15 ni menores de 13
  (así no aplica el programa de Familias y el chat y el mercado quedan para un público mayor).
- "¿Puede atraer a niños sin querer?" (atractivo para niños): **No** (tema de oficio profesional, sin personajes
  infantiles, sin dibujos dirigidos a niños). Si Google pregunta por la ficha, explicar: "Simulador de gestión de una
  productora de televisión; público adulto y joven adulto; tiene chat y compras".
- La tienda ya avisa: "Si eres menor de 18, pide permiso a tus padres antes de comprar" (`tienda.aviso` en `js/lang/`)
  y los términos piden permiso de los padres (sección 9). Recomendado para el integrador: que los términos digan
  "16 años o más" para coincidir con este formulario.

### 2.6 Seguridad de los datos (formulario "Data safety")

Preguntas generales:
- ¿Recopila o comparte alguno de los tipos de datos requeridos? **Sí, recopila.**
- ¿Los datos se cifran en tránsito? **Sí** (todo por HTTPS/TLS; `server/deploy/nginx-sitio.sh` agrega HSTS).
- ¿Qué métodos de cuenta tiene? **Nombre de usuario (correo) y contraseña**. (Si se agrega "Entrar con Google", marcar también OAuth.)
- ¿Los usuarios pueden pedir que se borren sus datos? **Sí.**
  - Dentro de la app: **Cuenta → Borrar mi cuenta** (pide la clave y escribir BORRAR).
  - **Enlace web para borrar la cuenta** (campo obligatorio): **`https://juego.tukanec.com/borrar-cuenta.html`**
    (explica cómo borrarla y qué se guarda por ley; `server/public/borrar-cuenta.html`).
  - "¿Pueden pedir que se borren algunos datos sin borrar la cuenta?": **No** (opcional; si se responde Sí, la misma
    página puede explicar cómo pedirlo por soporte).
- ¿Se **comparten** datos con terceros? **No.** Google Play procesa los pagos de la app (eso no es "compartir"); Discord
  solo recibe lo que el propio jugador escribe allí; no hay SDK de terceros de analítica, errores ni anuncios.
  Todo se procesa en nuestro servidor (proveedor de servicio = el VPS), que tampoco cuenta como compartir.
- ¿Se cumple la Política de Familias? No aplica (público 16+).
- Revisión de seguridad independiente (MASA): **No** (opcional).

Tipos de datos **recopilados** (para cada uno: ¿se recopila? Sí · ¿se comparte? No · ¿se procesa de forma efímera? No):

| Categoría › tipo (nombres de Google) | ¿Obligatorio u opcional? | Finalidades que hay que marcar | Qué es en EN VIVO |
|---|---|---|---|
| Información personal › **Dirección de correo electrónico** | Opcional (solo si crea cuenta; la historia se juega sin cuenta) | Funcionalidad de la app · Administración de la cuenta · Prevención de fraudes, seguridad y cumplimiento | Correo de la cuenta |
| Información personal › **Nombre** | Opcional | Funcionalidad de la app · Administración de la cuenta | Nombre de la cuenta y nombre público de la productora / alias |
| Información personal › **ID de usuario** | Opcional | Funcionalidad de la app · Administración de la cuenta · Prevención de fraudes | Número de jugador, alias, asociación y, **si el jugador vincula Discord, su ID de usuario de Discord** (opcional) |
| Información financiera › **Historial de compras** | Opcional (solo si compra) | Funcionalidad de la app · Prevención de fraudes, seguridad y cumplimiento · Administración de la cuenta | Producto, valor, fecha, número de orden de Google Play (para entregar, reembolsos y facturación) |
| Mensajes › **Otros mensajes en la app** | Opcional (solo si usa el chat o soporte) | Funcionalidad de la app · Prevención de fraudes, seguridad y cumplimiento | Chat (se borra a los 30 días), reportes y casos de "Ayuda y soporte" |
| Actividad en la app › **Interacciones con la app** | Obligatorio (si hay cuenta) | **Analíticas** · Funcionalidad de la app | Analítica **propia** (sin terceros): aperturas, pantallas, eventos jugados, avance del tutorial y capítulos, para medir retención y arreglar problemas (pestaña Analítica del Centro de Control) |
| Actividad en la app › **Otro contenido generado por el usuario** | Opcional | Funcionalidad de la app | Publicaciones del mercado, nombre de asociación, textos de soporte |
| Actividad en la app › **Otras acciones** | Opcional (solo si guarda en la nube o juega en línea) | Funcionalidad de la app · Prevención de fraudes (validación de jugadas) | Partida en la nube, jugadas de Liga/Duelos/Festival que el servidor repite para detectar trampas |
| Información y rendimiento de la app › **Registros de fallas** | Obligatorio | **Analíticas** · Funcionalidad de la app | Errores del juego que se envían al servidor propio (mensaje y lugar del error, versión) |
| Información y rendimiento de la app › **Diagnóstico** | Obligatorio | **Analíticas** · Funcionalidad de la app | Versión, idioma, tamaño de pantalla, tiempos de carga; lo que manda el formulario de soporte |
| **Dispositivo u otros identificadores** | Obligatorio | **Prevención de fraudes, seguridad y cumplimiento** | Dirección IP y navegador (user-agent) que guarda el servidor para limitar intentos, detectar cuentas múltiples y abusos de compras. No se usa para saber la ubicación. |

**No** se recopila: ubicación (aproximada ni precisa), contactos, fotos y videos, audio, archivos y documentos,
calendario, salud y actividad física, navegación web, apps instaladas, historial de búsqueda, SMS, correos, teléfono,
dirección postal, datos de pago (tarjeta). **Nunca guardamos datos de tarjeta**: en Play paga Google.

Datos que **solo existen en la web** (no en la app de Play, porque la app usa Google Play Billing): cédula/pasaporte y
celular del titular de la tarjeta, que pide el formulario de Pago Plux para la factura del SRI. Si la app de Android
llegara a abrir `pago.php`, habría que declararlos también (Información personal › Otra info / Número de teléfono).
El pago con **PayPal** (docs/PAYPAL.md) también es **solo web**: la app nunca lo muestra (`js/ui.js` lo oculta dentro de
la app), así que no cambia este formulario.

> Las filas de **Interacciones con la app**, **Registros de fallas** y **Diagnóstico** describen la analítica y el
> registro de errores **propios** que otro ayudante está construyendo (pestaña Analítica del Centro de Control). Al
> 23 oct 2026 el juego todavía no los manda. Igual conviene declararlos desde la primera versión: declarar algo que
> todavía no se recoge no rompe ninguna regla, y lo que sí está prohibido es recoger datos sin declararlos.
>
> Si el integrador agrega un SDK de terceros (Firebase, Sentry, Google Analytics, un SDK de atribución), el dato pasa a
> "compartido" o cambia de finalidad: **actualizar este formulario el mismo día**.

### 2.7 Otras declaraciones
- **Apps financieras**, **salud**, **gobierno**, **VPN**, **préstamos**: no aplica.
- **Actividad de noticias**: No.
- **Juegos con dinero real / apuestas**: No (los créditos nunca se cambian por dinero; el mercado es solo con créditos).
- **Permisos sensibles** (ubicación en segundo plano, SMS, todos los archivos): ninguno. Notificaciones: la TWA pide el
  permiso de notificaciones porque Bubblewrap lo exige junto con Play Billing; el juego no manda notificaciones push hoy.

## 3. Pendientes antes de enviar a revisión

1. ~~Borrado de cuenta~~ **Listo**: botón en el juego (Cuenta → Borrar mi cuenta) y página `borrar-cuenta.html`.
   Falta llenar [CORREO DE SOPORTE] en esa página.
2. **Pagos en la app de Play.** En la app de Android los bienes digitales se cobran con **Google Play Billing**
   (`server/src/Google.php` ya lo verifica). La app de Play no debe mostrar ni enlazar el pago con tarjeta de Pago Plux
   ni el de PayPal (los dos se ocultan dentro de la app; lo prueba `tests/test_paypal.js`).
3. ~~Capturas sin marcas reales~~ **Listo**: 8 capturas por idioma (10 idiomas) en `assets/promo/screens_<idioma>/01..08.png`,
   sin marcas reales (el generador revisa ~55 marcas). Antes de subir: que un nativo revise los títulos de las capturas que no están en español.
4. **Datos legales.** Completar [DIRECCIÓN] en los términos y la privacidad (lo demás ya está; ver `docs/LEGAL_REVISION.md`),
   y crear el correo de soporte (`SOPORTE_CORREO`).
5. **Cuenta de prueba para el revisor** con una compra de sandbox (para que vea mercado y chat).
6. **Público 16+**: que los términos y la privacidad digan la misma edad que el formulario 2.5.
