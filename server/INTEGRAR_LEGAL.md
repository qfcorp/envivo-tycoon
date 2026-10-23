# Integrar el módulo LEGAL (términos, privacidad, borrar cuenta)

Rama del helper `legal`. Lista para el coordinador: qué cambió, qué toca archivos compartidos y qué falta conectar.
Revisión del abogado: `docs/LEGAL_REVISION.md`.

## Archivos propios (sin conflicto esperado)
| Archivo | Qué es |
|---|---|
| `server/public/terminos.html` | Términos y condiciones (21 secciones). Oficial, en español. |
| `server/public/privacidad.html` | Política de privacidad LOPDP (16 secciones). Oficial, en español. |
| `server/public/borrar-cuenta.html` | Borrar la cuenta en el juego **o sin la app** (correo a soporte@tukanec.com con botón `mailto:`; la CSP legal tiene `form-action 'none'` y `script-src 'none'`, por eso no es un formulario). |
| `docs/traducciones/legal/{terminos,privacidad,borrar-cuenta}_<idioma>.html` | 27 traducciones (en, pt-BR, fr, de, it, ru, tr, id, zh-CN), mismas secciones y viñetas. Las de borrar-cuenta son nuevas. |
| `docs/LEGAL_REVISION.md` | Lista para el abogado, con fuentes. |

Datos puestos: RUC 1793135099001, soporte@tukanec.com, "Última actualización: 23 de octubre de 2026", edad mínima 16.
Único pendiente del dueño: `[DIRECCIÓN]` (con `<mark class="falta">`).

## Ediciones en archivos compartidos (mínimas)
1. **`server/src/Cuentas.php` → `Cuentas::borrar()`**: al final (fuera de la transacción) quita el vínculo con Discord y sus
   roles si el módulo de Discord está (`Discord::desvincular(null, $jugador)` + borrar `discord_vinculos` / `discord_codigos`).
   Antes el vínculo quedaba guardado al borrar la cuenta (la fila de `jugadores` se anonimiza, no se borra, así que el
   `ON DELETE CASCADE` no actuaba). Bloque de 7 líneas, con comentario.
2. **`server/tests/pruebas_tienda_cuenta.php`** (sección "Borrar la cuenta"): 2 comprobaciones nuevas
   (borrar-cuenta.html explica cómo pedirlo sin la app con `mailto:`; al borrar la cuenta se borra el vínculo de Discord).
3. **`tests/test_traducciones.js`** (sección `legal/`): ahora revisa las 3 páginas × 9 idiomas, exige los datos reales (sin
   `[RUC]`, `[CORREO DE SOPORTE]`, `[FECHA]`), `[DIRECCIÓN]` visible, el correo de soporte, Pago Plux y Google Play, y revisa
   también las 3 páginas en español (fecha, `<mark class="falta">` solo para `[DIRECCIÓN]`, sin WhatsApp).
4. **`docs/play_store/README.md`**: edades 16-17 y 18+ (antes decía 13-15), enlace `/borrar-cuenta.html`, datos legales pendientes.
5. **`docs/DESPLIEGUE.md`** y **`server/deploy/instalar.sh`** (un `echo`): el único dato legal pendiente es la dirección.

## Falta conectar (otros módulos / coordinador)
1. **OBLIGATORIO — botón "Cuenta → Borrar mi cuenta" en el juego.** El servidor ya lo tiene (`POST /api/cuenta/borrar`
   con `{clave, confirmar: "BORRAR"}`, responde `{borrada: true}` y cierra la sesión), pero `js/` no lo muestra. Lo exigen
   Google Play y las tres páginas. Sugerencia:
   - `js/api.js`: `Api.borrarCuenta = async (clave) => { const r = await req('POST', '/api/cuenta/borrar', { clave, confirmar: 'BORRAR' }); await Api.refrescar(); return r; };`
   - `js/ui.js`, en la ventana de cuenta (junto a "Salir"): botón "Borrar mi cuenta" → pide la clave y que escriba BORRAR,
     avisa que no se puede deshacer, y enlaza `/borrar-cuenta.html`. Textos en `js/lang/*.js` con la misma etiqueta que
     usan las páginas ("Cuenta → Borrar mi cuenta"; en inglés "Account → Delete my account", etc.).
2. **Casilla de edad y términos al crear la cuenta** ("Tengo 16 años o más y acepto los términos y la política de
   privacidad", con enlaces). Hoy el registro no la pide.
3. **Lo que la privacidad describe y otros módulos deben cumplir** (si un módulo no sale al lanzar, quitar su línea de
   `privacidad.html` y de las 9 traducciones):
   - estadísticas y reportes de errores del propio juego: solo a nuestro servidor, máximo 90 días con el número de jugador
     y después solo totales;
   - notificaciones push: solo si el jugador las activa, con forma de desactivarlas en el juego;
   - recuperación de clave por correo (hoy `cuenta.olvido` manda a soporte).
4. **Google Fonts** (`index.html` carga letras de fonts.googleapis.com): está declarado en privacidad §5. Si se sirven las
   letras desde el propio servidor, quitar esa frase.
5. **Publicar las traducciones (opcional):** hoy nginx (`server/deploy/nginx-sitio.sh`) y `server/tests/router.php` solo
   sirven las 3 páginas en español. Las traducciones enlazan entre sí como `/terminos_en.html`, `/privacidad_en.html`,
   `/borrar-cuenta_en.html`. Para publicarlas: copiarlas a `server/public/` y cambiar las 3 `location =` por una sola
   `location ~ ^/(terminos|privacidad|borrar-cuenta)(_(en|pt-BR|fr|de|it|ru|tr|id|zh-CN))?\.html$` con las mismas cabeceras
   (`cab_legal`), y lo mismo en `router.php`.
6. **Registro de seguridad** (`auditoria.ip`): recomendado borrar la IP a los 12 meses en `bin/tareas.php` (la privacidad hoy
   dice "mientras tu cuenta exista").

## Pruebas
- `node tests/test_traducciones.js` → todas OK (incluye las 27 páginas legales).
- `bash server/tests/correr.sh` → pruebas.php y correr.sh sin fallas (incluye las 2 comprobaciones nuevas de borrar cuenta).
