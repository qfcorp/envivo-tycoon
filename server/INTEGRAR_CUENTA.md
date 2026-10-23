# Integrar: Cuenta (lo que pide Google Play dentro del juego)

1. **Borrar mi cuenta** dentro del juego (Tienda → Tu cuenta, debajo de «Cerrar sesión»): explica qué se pierde
   (cuenta, partida en la nube, créditos y compras sin devolución, perfil/asociación/chat/mercado), pide la clave y
   escribir **BORRAR** (o la palabra del idioma: DELETE, APAGAR…; el juego siempre manda `confirmar: "BORRAR"`),
   llama `POST /api/cuenta/borrar` (ya existía), cierra la sesión y **la partida de este dispositivo se queda**.
   Enlace a `/borrar-cuenta.html` (para quien olvidó la clave).
2. **Aceptar Términos y Privacidad + 16 años o más** al registrarse (dos casillas con enlaces a `/terminos.html` y
   `/privacidad.html`). El servidor **rechaza** `POST /api/registro` sin `acepta_terminos: true` (400
   `terminos_requeridos`) o sin `edad_16: true` (400 `edad_requerida`) y guarda la aceptación (versión + fecha).
3. **Cuentas viejas** (o que cambiaron de dueño por transferencia): antes del **chat**, el **mercado** y los **modos en
   línea** sale UNA ventana «Antes de seguir» (`POST /api/cuenta/terminos`). «Ahora no» no abre nada; aceptar abre lo
   que se tocó y no se vuelve a pedir. El servidor **no deja escribir en el chat** sin aceptar (403 `terminos_pendientes`).

## Archivos nuevos
| archivo | qué es |
|---|---|
| `js/cuenta.js` | `window.Cuenta`: casillas del registro, «Borrar mi cuenta», ventana de aceptar y el «filtro» de clics (fase de captura) antes del chat/mercado/modos en línea. Textos en 10 idiomas |
| `server/src/Terminos.php` | versión (`Terminos::VERSION = '2026-10'` o `ENVIVO_TERMINOS_VERSION` en config.env), `revisar`, `aceptar`, `aceptado`, `exigir`, `estado` |
| `server/src/TerminosApi.php` | `GET/POST /api/cuenta/terminos` (con sesión) |
| `server/src/migraciones/cuenta.sql` | tabla `cuenta_terminos (jugador_id, version, email_hash, edad_minima, origen, aceptado)`; sin IP. `email_hash` = sha256 del correo: si la cuenta cambia de dueño, el nuevo debe aceptar |
| `server/tests/pruebas_cuenta.php` | 55 pruebas (directo + HTTP con el `api.php` de verdad) |
| `tests/test_cuenta.js` | Playwright 390x844: registro, borrar, aceptar antes de en línea/mercado/chat, inglés, 10 idiomas. Capturas `tests/capturas/cuenta_*.png` |
| `docs/traducciones/errores_nuevos/cuenta.json` | textos de `terminos_requeridos`, `edad_requerida`, `terminos_pendientes` en 10 idiomas |

## Cambios en archivos compartidos (todos de una línea o dos, anclados)
| archivo | cambio |
|---|---|
| `server/public/api.php` | 1) línea de ruta antes de la del Pase: `if (class_exists(\EnVivo\TerminosApi::class) && \EnVivo\TerminosApi::esRuta($ruta)) \EnVivo\TerminosApi::responder($ruta, $metodo, requiere_sesion());` 2) `api_registro()`: `\EnVivo\Terminos::revisar($in);` antes de `Cuentas::registrar` y `\EnVivo\Terminos::aceptar($id, 'registro');` después. 3) `api_chat_escribir()`: `\EnVivo\Terminos::exigir($j);` antes de `Chat::escribir` |
| `server/src/Cuentas.php` | `estado()`: `+ Terminos::estado($id)` con sesión y `+ ['terminos' => null]` sin sesión (mismas claves en los dos) |
| `js/ui.js` | 1) tarjeta de la cuenta: `${window.Cuenta ? window.Cuenta.botones() : ''}` después de «Cerrar sesión». 2) `abrirCuenta`: `${reg && window.Cuenta ? window.Cuenta.camposRegistro() : ''}` después de la clave. 3) `enviarCuenta`: revisa `Cuenta.faltaRegistro()` y manda `Cuenta.datosRegistro()` a `Api.registro`. 4) `case 'cuenta-borrar'` en el `switch` de clics (abre `Cuenta.abrirBorrar` y, al borrar, hace lo mismo que «Cerrar sesión») |
| `js/api.js` | `Api.registro(email, nombre, clave, extra)`: `extra` (términos y edad) se suma al cuerpo |
| `index.html` | `<script defer src="js/cuenta.js"></script>` después de `js/googleplay.js` |
| `sw.js` | `'./js/cuenta.js'` en `SHELL` (VERSION sin cambiar: súbela al publicar) |
| `server/API.md` | registro con los campos nuevos, campo `terminos` del estado y la ruta `/api/cuenta/terminos` |

## Pruebas de otros módulos que se tocaron (registro por HTTP ahora manda las casillas)
Toda prueba que registre por HTTP debe mandar `acepta_terminos: true, edad_16: true` (o marcar `#cu-terminos` y
`#cu-edad` en el navegador). Se agregaron en: `server/tests/pruebas.php` (y `$CLAVES_ESTADO` con `terminos`),
`pruebas_tienda_cuenta.php`, `pruebas_soporte_google.php`, `pruebas_duelos_desafio.php`, `pruebas_festival.php`,
`pruebas_discord.php`, `navegador.cjs`, `correr.sh` (registro por nginx y la suite `cuenta` en la lista 3c),
`tests/tienda_e2e.cjs`, `tests/ensayo_vps.cjs`. **Si otro módulo nuevo registra por HTTP sin esos campos, su prueba
dará 400 `terminos_requeridos`.** `Cuentas::registrar()` directo (PHP) no cambia.

## Al integrar
- Copiar `docs/traducciones/errores_nuevos/cuenta.json` dentro de `docs/traducciones/errores.json` (cada idioma y
  `_codigos`). Hasta entonces `tests/test_traducciones.js` falla SOLO por esos 3 códigos.
- Subir `VERSION` de `sw.js` al publicar.

## Para el dueño
- **Términos (sección 9 «Menores de edad»)**: hoy dice que un menor puede jugar con permiso de sus padres; el juego
  ahora pide **16 años o más** para tener cuenta. Conviene cambiar ese texto (y sus traducciones en
  `docs/traducciones/legal/`) y poner la fecha en «Última actualización».
- Cuando cambien los Términos: poner `ENVIVO_TERMINOS_VERSION=AAAA-MM` en `/etc/envivo/config.env` y todos aceptan
  otra vez (una ventana, una sola vez).
- Google Play Console → Seguridad de los datos: «Los usuarios pueden pedir que se borren sus datos» = sí, dentro de la
  app (Tienda → Tu cuenta → Borrar mi cuenta) y en `https://juego.tukanec.com/borrar-cuenta.html`.
