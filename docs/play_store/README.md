# Ficha de Google Play y formularios de Play Console · EN VIVO Tycoon

Todo lo que hay que llenar en Play Console para publicar la versión 1.0, en el orden en que lo pide la consola.
Los textos de la ficha están en `ficha_<idioma>.md` (10 idiomas). La prueba `node tests/test_traducciones.js`
mide cada texto y falla si alguno se pasa de los límites o si esta tabla no coincide con las fichas.

> ⚠️ Estas respuestas describen el juego tal como está en el código al 23 oct 2026. Si cambia algo (anuncios,
> nuevos datos, chat de voz, etc.), hay que actualizar los formularios **antes** de subir la nueva versión.

## 1. Ficha de Play Store (Crecer › Presencia en Play Store › Ficha principal)

| Campo | Límite | Dónde está |
|---|---|---|
| Nombre de la app | 30 caracteres | `## Nombre de la app` → siempre **EN VIVO Tycoon** (14) |
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

Gráficos que faltan (no son parte de este trabajo): ícono 512×512 (ya está `icons/icon-512.png`), gráfico de funciones
1024×500, y de 2 a 8 capturas de teléfono por idioma (las de `tests/capturas/` sirven de base, pero están en español).

### Verificación de límites (caracteres contados como Play Console, uno por letra/emoji/ideograma)

| Idioma | Nombre (≤30) | Breve (≤80) | Completa (≤4000) | Novedades (≤500) | Estado |
|---|---|---|---|---|---|
| es | 14 | 75 | 2563 | 301 | ✅ |
| en | 14 | 72 | 2436 | 293 | ✅ |
| pt-BR | 14 | 72 | 2548 | 296 | ✅ |
| fr | 14 | 77 | 2813 | 312 | ✅ |
| de | 14 | 76 | 2733 | 288 | ✅ |
| it | 14 | 73 | 2655 | 310 | ✅ |
| ru | 14 | 70 | 2559 | 292 | ✅ |
| tr | 14 | 69 | 2553 | 298 | ✅ |
| id | 14 | 71 | 2629 | 292 | ✅ |
| zh-CN | 14 | 27 | 851 | 117 | ✅ |

Si se edita una ficha, correr `node tests/test_traducciones.js`: imprime las medidas nuevas para copiar a esta tabla.

Reglas que la prueba también revisa en las fichas: el nombre es exactamente "EN VIVO Tycoon", 5 palabras clave,
se mencionan las compras opcionales, no hay precios (cambian por país) y **no aparece ninguna marca real**
(vMix, ATEM, Blackmagic, Sony, Canon, YouTube, LigaPro, Kingshot, WhatsApp…). El juego usa marcas inventadas;
la ficha habla de "fútbol profesional" y "switchers" en general.

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

### 2.3 Anuncios
- "¿Tu app contiene anuncios?": **No**. El juego no tiene SDK de anuncios ni anuncios propios con recompensa.

### 2.4 Clasificación del contenido (cuestionario IARC)
- Correo de contacto: el de soporte. Categoría: **Juego**.
- Violencia, sangre, miedo, contenido sexual, desnudos, lenguaje soez, drogas, alcohol, tabaco: **No** en todo.
  (El juego es de gestión: cámaras, cables, lluvia, apagones. No hay peleas ni armas; el boxeo/lucha libre planeado en
  `docs/REALISMO.md` se transmite como evento, no se juega. Si se agrega, revisar la pregunta de violencia.)
- Apuestas / juegos de azar simulados: **No**. No hay casino, ruleta ni cajas de premios al azar: todo lo que se
  compra trae un contenido fijo y conocido antes de pagar (verificado en `server/src/Catalogo.php`). Si algún día se
  agregan "cajas sorpresa" pagadas, hay que responder que sí y publicar las probabilidades.
- **Interacción entre usuarios: Sí.** Los jugadores pueden escribirse en el chat (servidor, asociación y coalición).
  Notas para las preguntas que siguen:
  - El chat es **solo texto** (máx. 300 caracteres) y mensajes rápidos; no hay voz, video, fotos ni mensajes privados 1 a 1.
  - Hay moderación: filtro automático de groserías y de datos de contacto (enlaces, correos, teléfonos), botón para
    **reportar** y para **bloquear** a un jugador, y el administrador puede ocultar mensajes y silenciar 1 h / 24 h / 7 días
    o expulsar del chat (`server/src/Chat.php`, `server/src/Filtro.php`). Los mensajes se borran a los 30 días.
- **Comparte la ubicación del usuario: No.**
- **Compras digitales: Sí** (créditos, oferta de bienvenida, paquete de inicio, Tarjeta mensual, Pase VIP, refuerzos,
  transferencia oficial de cuenta). Nada se renueva solo; no hay suscripciones.
- **Acceso sin restricciones a internet (navegador, etc.): No.**
- Resultado esperado: clasificación baja (tipo PEGI 3/7 o ESRB Everyone) con los descriptores **"Los usuarios interactúan"**
  y **"Compras integradas"**.

### 2.5 Público objetivo y contenido
- Edades: marcar solo **16-17 y 18 o más** (decisión del dueño: el juego es para 16+, ver términos §2 y privacidad §12).
  **No** marcar menores de 16 (así no aplica el programa de Familias).
- "¿Puede atraer a niños sin querer?": **No** (tema de oficio profesional, sin personajes infantiles). Si Google lo
  marca igual, habría que reforzar el chat para menores.
- La tienda ya avisa: "Si eres menor de 18, pide permiso a tus padres antes de comprar" (`tienda.aviso` en `js/lang/`)
  y los términos piden permiso de los padres (sección 9).

### 2.6 Seguridad de los datos (formulario "Data safety")
Preguntas generales:
- ¿Recopila o comparte datos de usuario? **Sí, recopila.**
- ¿Los datos se cifran en tránsito? **Sí** (todo por HTTPS).
- ¿Los usuarios pueden pedir que se borren sus datos? **Sí**: en el juego (Cuenta → Borrar mi cuenta) o, sin la app,
  escribiendo desde el correo de su cuenta a soporte@tukanec.com (política de privacidad §9 y `/borrar-cuenta.html`).
  Ver el pendiente de borrado de cuenta abajo.
- ¿Se comparten datos con terceros? Para la versión de Play: **No** en el sentido de Google (los pagos los procesa
  Google Play y eso no cuenta como "compartir"). En la web, Pago Plux procesa la tarjeta como proveedor de servicio.

| Tipo de dato (categoría de Google) | ¿Se recopila? | ¿Obligatorio? | Para qué | Notas |
|---|---|---|---|---|
| Información personal › **Dirección de correo** | Sí | Sí, si crea cuenta (opcional para jugar la historia) | Funcionalidad de la app, administración de la cuenta, prevención de fraude | Correo de la cuenta |
| Información personal › **Nombre** | Sí | Sí, si crea cuenta | Administración de la cuenta | Nombre de la cuenta y nombre público de la productora |
| Información personal › **ID de usuario** | Sí | Sí, si crea cuenta | Funcionalidad, administración de la cuenta | Número de jugador, alias, asociación |
| Información financiera › **Historial de compras** | Sí | No (solo si compra) | Funcionalidad (entregar lo comprado), prevención de fraude, facturación | Producto, valor, fecha, número de orden de Google Play |
| Información financiera › Datos de tarjeta de pago | **No** | — | — | **Nunca guardamos datos de tarjeta.** En Play paga Google; en la web la tarjeta se cifra en el navegador y va directo a Pago Plux |
| Mensajes › **Otros mensajes en la app** | Sí | No (solo si usa chat o soporte) | Funcionalidad (chat y soporte), seguridad (moderación y reportes) | Chat (se borra a los 30 días), casos de "Ayuda y soporte" |
| Actividad en la app › **Otras acciones / contenido generado** | Sí | No (solo si guarda en la nube) | Funcionalidad | Partida en la nube, publicaciones y ventas del mercado |
| Información y rendimiento de la app › **Diagnóstico** | Sí | No (solo si escribe a soporte) | Funcionalidad (soporte) | Versión, idioma, tamaño de pantalla, día de la partida que manda el formulario de soporte |
| Dispositivo u otros identificadores | Revisar | — | Seguridad | El servidor guarda la **dirección IP** y el navegador para limitar intentos y evitar fraude. Revisar la guía de Google al llenar: si se declara, hacerlo como "Prevención de fraude, seguridad y cumplimiento" |
| Ubicación, contactos, fotos, audio, archivos, calendario, salud | **No** | — | — | — |

Datos que **solo existen en la web** (no en la app de Play, si la app usa Google Play Billing): cédula/pasaporte y
celular del titular de la tarjeta, que pide el formulario de Pago Plux para la factura del SRI. Si la app de Android
llegara a abrir `pago.php`, habría que declararlos también (Información personal › Otra info / Número de teléfono).

### 2.7 Otras declaraciones
- **Apps financieras**, **salud**, **gobierno**, **VPN**: no aplica.
- **Actividad de noticias**: No.
- **Juegos con dinero real**: No (los créditos nunca se cambian por dinero; el mercado es solo con créditos).

## 3. Pendientes que encontré al preparar esto (revisar antes de enviar a revisión)

1. **Borrado de cuenta.** Google exige, para apps que permiten crear cuenta, que el usuario pueda pedir el borrado
   **dentro de la app** y también desde un **enlace web** que se pone en el formulario de Seguridad de los datos.
   Hoy solo se puede pidiéndolo por correo (no hay endpoint de borrado en `server/public/api.php`). Mínimo: un botón
   "Borrar mi cuenta" en la pantalla de cuenta que abra un caso de soporte categoría "cuenta", y una página web
   (por ejemplo `/borrar-cuenta.html`) que explique cómo pedirlo.
2. **Pagos en la app de Play.** En la app de Android los bienes digitales se deben cobrar con **Google Play Billing**
   (`server/src/Google.php` ya lo verifica). La app de Play no debe mostrar ni enlazar el pago con tarjeta de Pago Plux.
3. **Marcas reales en el juego.** La ficha no nombra marcas, pero `js/logic.js` todavía dice "Laptop con vMix",
   "Switcher ATEM", "Director / vMix" y "Partido de LigaPro". Las capturas de pantalla no deben mostrarlas; mejor
   cambiarlas por marcas inventadas antes de publicar (ya está pendiente en `PLAN.md`, revisión de abogado de marcas).
4. **Datos legales.** Completar [DIRECCIÓN] en los términos y la privacidad (lo demás ya está; ver `docs/LEGAL_REVISION.md`),
   y crear el correo de soporte (`SOPORTE_CORREO`).
5. **Cuenta de prueba para el revisor** con una compra de sandbox (para que vea mercado y chat).
