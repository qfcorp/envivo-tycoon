# Centro de Control (`/control/`): cómo integrarlo

El Centro de Control es **el** panel del dueño. Reemplaza a `/admin.php` (que ya redirige a `/control/`).
Lee y escribe **solo** con las clases y tablas del servidor. La única tabla propia es `control_sesiones` (las
sesiones de entrada del panel).

## Archivos (todos nuevos)

| Archivo | Qué es |
|---|---|
| `server/public/control/index.php` | Entrada, lista de IPs, TOTP, CSRF, acciones (POST → 303 → GET) y pestañas |
| `server/public/control/lib/*.php` | Una por pestaña: `resumen`, `jugadores`, `compras`, `productos`, `mercado`, `chat`, `soporte`, `ajustes`; `base.php` (sesión, formularios, diseño y gráficos SVG) |
| `server/public/control/assets/control.css`, `control.js` | Estilo oscuro para celular y JavaScript mínimo (confirmaciones, detalle de los gráficos, respuestas rápidas). Sin librerías: la CSP solo permite `'self'` |
| `server/src/Control.php` | Acciones del administrador encima de las clases del servidor (ver la tabla de abajo) + TOTP, lista de IPs y tope de créditos |
| `server/src/migraciones/control.sql` | Solo `control_sesiones` (`CREATE TABLE IF NOT EXISTS`). La aplica sola `Control::preparar()` con `Migraciones::aplicar('control.sql')` |
| `server/bin/control_totp.php` | Crea el secreto del segundo factor y el enlace `otpauth://` |
| `server/tests/pruebas_control.php`, `router_control.php`, `navegador_control.cjs` | Pruebas (ver al final) |

## Qué usa cada pestaña

| Pestaña | Lee | Escribe con |
|---|---|---|
| Resumen | `compras` (pagadas; por producto y por canal), `actividad` (DAU/MAU), `movimientos_creditos` (emitidos vs. quemados, sin contar lo que pasa de un jugador a otro en el mercado), `mercado_publicaciones.comision`, `soporte_*`, `chat_reportes`, `avisos` | — |
| Jugadores | `jugadores` (`estado`, `deuda`, `vip_hasta`, `tarjeta_hasta`), compras, libro, inventario, entregas, `chat_sanciones`, `transferencias`, `soporte_casos`, `Auditoria::ultimas($n, $jugador)` | `Monedero::mover(...,'manual')` + `Auditoria::anotar` · `Cuentas::cambiarEstado` · `Sesiones::revocarTodas` · `Transferencias::cancelar` · sanciones del chat |
| Compras | `compras` (filtros, detalle, `revertida_*`), CSV para el SRI | `Compras::revertir` (suspende y, según las reglas, banea con `Compras::revisarAbuso`) |
| Productos | `Catalogo::producto()` (`productos_ajustes` + `ofertas`), `Catalogo::PREMIUM` (solo lectura) | `productos_ajustes`, `ofertas` + `Catalogo::olvidarAjustes()` + `Auditoria::anotar` |
| Mercado | `mercado_publicaciones` | `Mercado::moderar` (congelar / descongelar / quitar) |
| Chat | `chat_reportes`, `chat_mensajes`, `chat_sanciones`, `chat_palabras` | `Chat::sancionar` / `Chat::levantar` y los cambios de mensajes/palabras, todo con `Auditoria::anotar` |
| Soporte | `soporte_casos`, `soporte_mensajes`, `soporte_respuestas` | `Soporte::responderSoporte`, `Soporte::cambiarEstado`; respuestas rápidas en `soporte_respuestas` + `Auditoria::anotar` |
| Ajustes | `Ajustes` (mantenimiento, anuncio, `abuso_*`), `Google::configurado()`, `auditoria` | `Ajustes::set` + `Auditoria::anotar` · `Google::revisarAnuladas()` · `Google::avisosPendientes()` |

Cada cambio queda en `auditoria` con `quien = "control:<usuario>"`, la IP y el jugador o la compra. Los métodos del
servidor que ya auditan (`Compras::revertir`, `Cuentas::cambiarEstado`, `Mercado::moderar`, `Soporte::*`,
`Transferencias::cancelar`) no se auditan dos veces. Las entradas al panel también quedan registradas
(`control_entrar`, `control_entrar_fallido`, `control_salir`, `control_csrf_rechazado`, `control_csv_compras`).

Si falta una tabla opcional (chat, soporte, transferencias, actividad, mercado, `google_anuladas`), la pestaña muestra
"aún no disponible" y sus acciones responden con un error claro, sin romperse.

## Seguridad (A-04 de `docs/AUDITORIA_SEGURIDAD.md`)

- **Entrada con formulario**, no Basic Auth. Usa el mismo `ENVIVO_ADMIN_USUARIO` y `ENVIVO_ADMIN_CLAVE_HASH`.
- **Galleta `envivo_control`**: `HttpOnly`, `SameSite=Strict`, `Path=/control/` y `Secure` con https. En la base solo se guarda su sha256.
  La sesión dura como máximo 12 h y se cierra sola tras 2 h sin uso. Cambiar la clave o el secreto TOTP cierra todas las sesiones.
- **Bloqueo**: 5 intentos equivocados por IP (o 30 en total) en 15 minutos bloquean la entrada.
- **CSRF**: cada sesión tiene su propio código, que va en cada formulario POST, y además se revisa `Origin`/`Referer`.
  El formulario de entrada lleva su propio código.
- **Segundo factor (TOTP)**, opcional pero recomendado:
  ```
  php server/bin/control_totp.php dimitry      # imprime ENVIVO_ADMIN_TOTP=... y el enlace otpauth:// para la app
  sudo nano /etc/envivo/config.env              # pegar ENVIVO_ADMIN_TOTP=...
  sudo systemctl reload php8.3-fpm
  ```
  Usa RFC 6238 (SHA1, 30 s, 6 dígitos, ±30 s). Cada código sirve **una sola vez**: el último paso usado se guarda en
  `ajustes.control_totp_ultimo`.
- **Lista de IPs** (opcional): `ENVIVO_CONTROL_IPS=190.12.34.56, 10.0.0.0/8, 2800:bf0::/32`. Acepta IPs o rangos CIDR (IPv4 e IPv6).
  Desde otra IP, `/control/` responde 404. La IP es `REMOTE_ADDR` (con Cloudflare, nginx ya pone la real con `real_ip_header`).
  Mejor todavía: Cloudflare Access sobre `/control/*`.
- **Créditos a mano**: el motivo es obligatorio. Más de 5.000 de una vez pide marcar "Confirmo la cantidad".
  Hay un tope diario (suma de valores absolutos), `ENVIVO_CONTROL_TOPE_CREDITOS` (por defecto 20000; 0 = sin tope).
- Cabeceras: las de `Http::cabecerasPagina()` (CSP `'self'`, `X-Frame-Options DENY`, `no-store`) y `noindex`.

Ya están en `server/config.env.ejemplo` (y `instalar.sh` / `actualizar.sh` las agregan solas a `/etc/envivo/config.env`
si faltan, vacías; `ENVIVO_CONTROL_TOPE_CREDITOS` vacío = 20000):
```
; Centro de Control /control/: segundo factor (php server/bin/control_totp.php), IPs permitidas y tope diario de créditos a mano
ENVIVO_ADMIN_TOTP=
ENVIVO_CONTROL_IPS=
ENVIVO_CONTROL_TOPE_CREDITOS=
```

## nginx (ya está en `server/deploy/nginx-sitio.sh`, dentro de `reglas()`; referencia)

Lista blanca, igual que el resto. Solo se ejecuta `index.php`. Se sirven solo `control.css` y `control.js`. Todo lo
demás bajo `/control/` (incluido `lib/`) da 404.

```nginx
    # ---- Centro de Control (/control/) ----
    location = /control { return 301 /control/; }
    location = /control/ {
        # Opcional (A-04): solo estas IPs. Con Cloudflare, nginx ya tiene la IP real (real_ip_header).
        # allow 190.12.34.56; deny all;
        include /etc/nginx/fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $PUB/control/index.php;
        fastcgi_param SCRIPT_NAME /control/index.php;
        fastcgi_param HTTP_PROXY "";
        fastcgi_pass unix:$SOCK;
        add_header Cache-Control "no-store" always;
    }
    location ~ ^/control/assets/(control\.(css|js))\$ {
        alias $PUB/control/assets/\$1;
        expires 1h;
    }
    location ^~ /control/ { return 404; }
```
(Dentro del heredoc de `nginx-sitio.sh` los `$` de nginx van con `\$`, como ya se hace con `\$uri`. `$PUB` y `$SOCK`
son las variables del script.) Para probarlo: `curl -I https://juego.tukanec.com/control/lib/base.php` debe dar 404.

**Service worker (A-16):** `sw.js` ya excluye `control/` (igual que `api/`, `pago.php`, `admin.php`), así el panel nunca
queda guardado en un celular.

## `/control/` reemplazó a `/admin.php` (hecho)

`/control/` ya cubre todo lo de `admin.php`: ventas, CSV para el SRI, créditos a mano, estado de la cuenta, cerrar sesiones,
revertir compras, productos y ofertas, mercado, chat y palabras, soporte y respuestas rápidas, transferencias, mantenimiento,
anuncio y auditoría. Además tiene gráficos, TOTP, lista de IPs, tope de créditos y reglas contra el abuso de reembolsos.
`admin.php` ya redirige al inicio (`header('Location: /control/', true, 302)`), sin leer nada de lo que mande el navegador.

## Métodos que convendría tener en el servidor

Hoy `Control.php` hace estas escrituras directamente sobre las tablas canónicas (igual que lo hacía `admin.php`). Si se
agregan estos métodos, `Control.php` solo los llamaría:

```php
// Catalogo.php (tablas productos_ajustes y ofertas; que auditen y llamen a olvidarAjustes())
public static function guardarAjuste(string $producto, float $precio, int $creditos, bool $activo, string $quien): void;
public static function restaurarAjuste(string $producto, string $quien): bool;
public static function crearOferta(string $producto, int $bonoPct, int $inicio, int $fin, string $quien): int;
public static function terminarOferta(int $ofertaId, string $quien): void;
// Pedido nuevo: que premium() también lea productos_ajustes (costo en créditos y activo de los exclusivos). Hoy la
// pestaña Productos los muestra solo para leer.

// Monedero.php: créditos a mano con auditoría y tope (hoy en Control::darCreditos)
public static function ajusteManual(int $jugador, int $cambio, string $motivo, string $quien): int;

// Chat.php: moderación desde el panel (hoy en Control::moderarMensaje / sancionChat / palabra)
public static function moderarMensaje(int $mensajeId, string $accion /* ocultar|mostrar|resolver|descartar */, string $quien): void;
public static function palabra(string $palabra, bool $agregar, string $quien): string;
//  y que sancionar()/levantar() reciban $quien y auditen.

// Soporte.php: respuestas rápidas (SoporteBandeja.php ya no existe; hoy en Control::guardarRespuesta / borrarRespuesta / plantilla)
public static function guardarRespuesta(?int $id, string $titulo, string $texto, string $quien): array;
public static function borrarRespuesta(int $id, string $quien): void;
public static function plantilla(string $texto, int $caso): string;   // {nombre}, {caso}, {compra}

// Ajustes.php: guardar varios valores y auditar en un paso
public static function guardar(array $valores, string $quien, string $accion): void;
```

Notas para el equipo del servidor:
- `Mercado::comprar()` cambia `inventario.ref` a `mercado:<id>`. Por eso `Compras::revertir()` ya no reconoce los equipos
  de una compra que el jugador **vendió** (`equipos_ya_vendidos` queda en 0). Convendría guardar el origen en otra
  columna (por ejemplo `ref_original`).
- `Cuentas` no tiene suspensiones con fecha de fin (`bloqueo_hasta` se usa para las transferencias). El panel ofrece
  activo / suspendido / baneado, y se reactiva a mano.

## Pruebas

```
php server/tests/pruebas_control.php                 # base temporal, 5 servidores php -S (puertos libres desde el 18391)
GUARDAR_TMP=1 CAPTURAS=/tmp/capturas php server/tests/pruebas_control.php
```
Prueban la entrada, el bloqueo, la galleta, TOTP (con los vectores del RFC 6238 y que un código no se repita), la lista de
IPs, CSRF, cada pestaña (también con una base sin las tablas opcionales), la auditoría de cada acción, los reembolsos y
contracargos con `Compras::revertir`, las columnas del CSV, que la tienda de `/api/estado` vea los precios y las ofertas,
y el mantenimiento y el anuncio. Si hay Playwright (`NODE_PATH=/opt/npm-tools/node_modules`), también un celular de
390x844: sin desplazamiento horizontal, sin errores de consola y con capturas.

Ya corren dentro de `server/tests/correr.sh` (paso 3c, junto con Discord, Festival, Liga y Duelos). Referencia de cómo se suman:
```bash
echo
echo "== 7. Centro de Control (/control/)"
php "$SRV/tests/pruebas_control.php" | tail -3
check "pruebas_control.php sin fallas" 0 "${PIPESTATUS[0]}"
```
