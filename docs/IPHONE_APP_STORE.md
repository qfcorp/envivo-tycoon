# App de iPhone: compras dentro de la app con el App Store (StoreKit 2)

La app de iPhone es un WKWebView que abre `https://juego.tukanec.com/index.html?origen=ios` con un User-Agent que trae
`TukanIOS/…`. Desde esta versión el juego puede **vender con las compras dentro de la app de Apple** los mismos productos
de dinero real que la app de Android vende con Google Play.

| App de iPhone | Qué ve el jugador |
|---|---|
| **Nueva**, con el puente `tukanAppStore` | La tienda como en la app de Android: precios del App Store, botones de comprar, «Restaurar compras». Paga Apple. |
| **Vieja**, sin el puente | Como antes: nada de dinero real (ni precios, ni comprar). Solo lo que se gana jugando. |

En ningún iPhone aparece Pago Plux, PayPal, Tukán Pagos, Google Play ni un enlace de pago. El servidor sigue respondiendo
`403 no_disponible_ios` a `/api/orden`, `/api/plux/pago`, `/api/paypal/crear`, `/api/tukanpagos/crear` y `/api/google/verificar`
cuando la petición viene del iPhone. Solo acepta `/api/apple/verificar`.

## Archivos

| Archivo | Para qué |
|---|---|
| `js/ios.js` | `TukanIOS.activo()`, `conTienda()` (iPhone con el puente) y `sinTienda()` (iPhone sin el puente: nada de dinero real) |
| `js/appstore.js` | `window.AppStore`: la misma forma que `window.GooglePlay` (`enApp`, `disponible`, `productos`, `comprar`, `restaurar`) más `restaurarCompras` y `escuchar` |
| `js/ui.js` | En el iPhone con el puente usa `AppStore`; en Android, `GooglePlay`; sin ninguno, la web |
| `server/src/Apple.php` | Verifica la transacción firmada (JWS) y entrega (canal `apple`); avisos de Apple (devoluciones) |
| `server/config/apple/AppleRootCA-G3.cer` | La raíz de Apple (Apple Root CA - G3, la de https://www.apple.com/certificateauthority/) |
| `server/bin/apple_productos.php` | La lista de productos para crear en App Store Connect |
| `server/tests/pruebas_apple.php`, `tests/test_appstore.js` | Pruebas (con un «Apple falso» y un puente falso) |

## Puente nativo (lo hace la app de iPhone)

`window.webkit.messageHandlers.tukanAppStore.postMessage(obj)` devuelve una Promise (WKScriptMessageHandlerWithReply):

| Mensaje | Respuesta |
|---|---|
| `{accion:'productos', ids:['envivo.creditos_250', …]}` | `{ok:true, productos:[{id, titulo, descripcion, precio:'US$1.99', moneda:'USD', valor:1.99}]}` |
| `{accion:'comprar', id:'envivo.creditos_250', cuenta:'<uuid>'}` | `{ok:true, estado:'comprado', jws, transaccion, producto}` · `{ok:false, estado:'cancelado'}` · `{ok:false, estado:'pendiente'}` · `{ok:false, estado:'error', mensaje}` |
| `{accion:'terminar', transaccion}` | `{ok:true}`. El juego la llama **solo después** de que el servidor confirmó la entrega |
| `{accion:'pendientes'}` | `{ok:true, transacciones:[{jws, transaccion, producto}]}`: pagadas sin terminar. El juego las entrega y termina al abrir y al entrar a la cuenta |
| `{accion:'restaurar'}` | `{ok:true, transacciones:[…]}`: lo de «una sola vez» del Apple ID (botón «Restaurar compras») |

Además la app dispara `window.dispatchEvent(new CustomEvent('tukanAppStore', {detail:{tipo:'transaccion', jws, transaccion, producto}}))`
cuando llega una compra aprobada más tarde (por ejemplo «Pedir permiso para comprar»).

`cuenta` es el `apple_cuenta` de `/api/estado` (UUID v5 fijo por jugador). La app debe pasarlo como
`Product.PurchaseOption.appAccountToken(UUID(uuidString: cuenta)!)`. Apple lo devuelve dentro de la transacción firmada y el
servidor revisa que sea el de la cuenta que la manda.

### Cuándo se termina una transacción

- El servidor la entregó (o ya estaba entregada): **se termina**.
- El servidor dijo algo que no cambia aunque se reintente (`apple_otra_cuenta`, `apple_no_coincide`, `apple_revocada`,
  `apple_revertido`, `apple_ya_comprado`, `datos_invalidos`): **se termina** (si no, se repetiría siempre).
- Sin internet, servidor caído, sin sesión, firma no aceptada (`apple_invalida`) o producto que no existe: **NO se termina**.
  Apple la vuelve a dar en `pendientes` y se entrega después.

## Servidor: `POST /api/apple/verificar {producto, jws}`

Con sesión de jugador y `X-Envivo: 1`. El servidor nunca le cree al celular; con OpenSSL revisa:

1. Cadena `x5c` (hoja, intermedia, raíz): la raíz es la Apple Root CA - G3 del servidor, la intermedia la firmó la raíz y la
   hoja la intermedia, con las marcas de Apple (OID `1.2.840.113635.100.6.2.1` y `1.2.840.113635.100.6.11.1`) y vigentes.
2. Firma ES256 con la llave de la hoja.
3. `bundleId` = `com.tukanec.envivo`; `productId` = `envivo.<id del catálogo>` (el mismo que pidió el juego); `type` =
   `Non-Consumable` para lo de una sola vez y `Consumable` para lo demás.
4. `environment` = `Production`, o `Sandbox` (revisión de Apple y TestFlight). Lo de Sandbox **se entrega** (Apple lo
   necesita para revisar la app) pero queda como **PRUEBA**: `pagado_por` «App Store (PRUEBA, Sandbox, sin cobro)», sin factura
   del SRI y fuera de las ventas del Panel. Con `APPLE_SANDBOX=0` en `/etc/envivo/config.env` se rechaza.
5. No devuelta (`revocationDate`) y, si trae `appAccountToken`, que sea el de esta cuenta.
6. Una sola entrega por `transactionId` y por `originalTransactionId`: si ya se entregó responde
   `{ok:true, nueva:false, estado_compra:'ya_entregado'}`. La misma compra desde otra cuenta → 409 `apple_otra_cuenta`.
7. Entrega igual que Google Play (`Compras::insertar` + `Compras::aprobar`, canal `apple`): créditos, VIP, pase, packs, ofertas.
   Lo de una sola vez que la cuenta ya tenía (por ejemplo, comprado antes en la web) **no se entrega otra vez**: 409
   `apple_ya_comprado` y aviso para el dueño. Apple no devuelve el dinero solo: el jugador lo pide en reportaproblem.apple.com.

## Avisos de Apple: `POST /api/apple/notificacion`

App Store Server Notifications **versión 2**. En App Store Connect → la app → *App Information* → *App Store Server
Notifications*, poner en **Production** y en **Sandbox**:

```
https://juego.tukanec.com/api/apple/notificacion
```

- `REFUND` y `REVOKE`: la compra se revierte como un reembolso de Google (`Compras::revertir`: se quitan los créditos y lo
  entregado, la cuenta queda suspendida y cuentan las reglas de abuso de reembolsos).
- `REFUND_REVERSED` y `CONSUMPTION_REQUEST`: aviso para el dueño en el Centro de Control.
- Cada aviso se atiende una sola vez (`apple_avisos`); firma que no es de Apple → 400. Funciona también en mantenimiento.

## Productos en App Store Connect

El *Product ID* de cada compra es `envivo.` + el id del catálogo (`server/src/Catalogo.php`). La lista completa, con nombre
(máx. 30 letras), descripción (máx. 45), precio en USD y tipo, sale de:

```bash
php server/bin/apple_productos.php           # JSON
php server/bin/apple_productos.php --tabla   # para leer
```

- `NON_CONSUMABLE` = lo de una sola vez (`una_vez` en el catálogo): bienvenida, inicio, equipo_obra_2, fondo_crecimiento y oferta_novato.
- `CONSUMABLE` = todo lo demás (créditos, Pase VIP, tarjetas, pases, packs, ofertas del VIP y de regreso).
- No se vende `transferencia_cuenta`.
- Precio: elegir en App Store Connect el precio de Apple igual o más parecido al de la lista.
- Un producto que todavía no está en App Store Connect no sale en el iPhone (sin precio de Apple no hay botón), igual que en Google Play.

## Instalar en el servidor

```bash
sudo bash /var/www/envivo/server/deploy/actualizar.sh
```

Aplica la migración (`server/src/migraciones/apple.sql`: columnas `apple_*` en `compras`, canal `apple` y tabla `apple_avisos`),
agrega `APPLE_SANDBOX=1` a `/etc/envivo/config.env` y regenera nginx (el aviso de Apple pasa también en mantenimiento).
No hay llaves que poner: la raíz de Apple va en el repositorio.

## Pruebas

```bash
php server/tests/pruebas_apple.php                                     # servidor (también dentro de server/tests/correr.sh)
NODE_PATH=/opt/npm-tools/node_modules node tests/test_appstore.js      # el módulo y el juego en un iPhone simulado
NODE_PATH=/opt/npm-tools/node_modules node tests/test_iphone.js        # iPhone sin el puente: nada de dinero real
```
