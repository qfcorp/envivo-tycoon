# Pago con tarjeta por Tukán Pagos (6 nov 2026)

Pedido de Dimitry: «hay que unir los pagos del juego». La tarjeta del juego ahora se puede cobrar por **Tukán Pagos**
(`pagos.tukanec.com`), el portal de cobros de toda la empresa, igual que los demás programas Tukán. Las claves de Plux
viven solo en Tukán Pagos; el juego tiene su propia clave de programa.

Es un **módulo con interruptor** (`TUKAN_PAGOS_ACTIVO` en `/etc/envivo/config.env`):
- **Encendido (1):** la página de pago pide los datos de la factura y lleva al jugador a la página segura de Tukán Pagos.
  El pago directo con Plux del juego (`/api/plux/pago`) queda cerrado: un solo camino.
- **Apagado (0, por defecto):** todo sigue como antes (Plux propio del juego, `src/Plux.php`).

PayPal y Google Play no cambian.

## Cómo funciona

1. El jugador toca **Comprar** → la compra nace igual que siempre (canal `web_plux`, valor fijo del catálogo con IVA).
2. `pago.php` muestra el producto, los **datos para la factura** (consumidor final hasta $50, o cédula / RUC) y
   **Pagar con tarjeta** → `POST /api/tukanpagos/crear`.
3. El servidor crea el cobro en Tukán Pagos: referencia `envivo-compra-<id>`, monto = total de la compra (`con_iva`),
   regreso `https://juego.tukanec.com/api/tukanpagos/volver?o=<token>`. Si se repite (otra pestaña, volver atrás) Tukán
   Pagos devuelve **el mismo cobro**.
4. El jugador pone la tarjeta en la página de Tukán Pagos (el juego nunca la ve) y vuelve.
5. Lo que vale:
   - el **aviso firmado** `cobro.aprobado` → `POST /api/tukanpagos/aviso` (HMAC-SHA256 con el secreto del programa,
     máximo 5 minutos), o
   - la **consulta del servidor** a Tukán Pagos cuando el jugador vuelve (`/api/tukanpagos/volver`).
   Nunca lo que diga el navegador. El monto tiene que ser **exactamente** el de la compra (si no, no se entrega y queda
   un aviso `tukanpagos_monto` en el Centro de Control).
6. `Compras::aprobar()` entrega una sola vez (aviso + regreso, en cualquier orden). La **factura** la hace el **Panel
   Tukán con TuFactura**, igual que en todos los sistemas (sección «Factura» abajo). Tukán Pagos no factura.
7. Tarjeta rechazada: vuelve a la página de pago con «Tu banco no aprobó el pago» y puede intentar otra vez (mismo cobro).

## Encenderlo (Dimitry, una sola vez)

1. En **pagos.tukanec.com** → **Programas → Agregar**:
   - código: `envivo` · nombre: `EN VIVO Tycoon`
   - dirección de aviso: `https://juego.tukanec.com/api/tukanpagos/aviso`
   - inicio de las direcciones de regreso: `https://juego.tukanec.com`
   - Copia la **clave** (`tkp_…`) y el **secreto de avisos** (se ven una sola vez).
2. En el VPS del ERP (149.56.111.193), actualizar el juego y conectarlo:
   ```
   sudo bash /var/www/envivo/server/deploy/actualizar.sh
   sudo bash /var/www/envivo/server/deploy/configurar_tukanpagos.sh
   ```
   El segundo comando pregunta la clave y el secreto (no se ven al pegarlos), enciende el módulo y prueba la conexión.
   Debe terminar en `RESULTADO: todo bien`.
3. En Tukán Pagos, en el programa `envivo`, toca **Mandar un aviso de prueba**: el juego contesta 200.
4. Mientras Plux de Tukán Pagos esté en **sandbox**, la página de pago del juego dice «MODO DE PRUEBAS».

Apagarlo (volver al Plux propio): `sudo bash /var/www/envivo/server/deploy/configurar_tukanpagos.sh --apagar`
Revisar: `sudo -u www-data php /var/www/envivo/server/bin/tukanpagos.php probar`

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/TukanPagos.php` | Interruptor, cliente de la API, aplicar un cobro a su compra, firma de los avisos |
| `src/TukanPagosApi.php` | Rutas `/api/tukanpagos/crear`, `/volver`, `/aviso` |
| `public/pago.php` | Caja «Pagar con tarjeta» por Tukán Pagos (con el módulo encendido) |
| `public/assets/tukanpagos.js` | Botón de la página de pago (igual que `paypal.js`) |
| `public/api.php` | Las rutas van antes de la cabecera X-Envivo; `/api/plux/pago` se cierra con el módulo encendido |
| `src/Compras.php`, `src/Cuentas.php` | La tienda ofrece tarjeta si hay Plux propio **o** Tukán Pagos |
| `deploy/configurar_tukanpagos.sh`, `bin/tukanpagos.php` | Conectar y revisar |
| `deploy/nginx-sitio.sh` | `/api/tukanpagos/aviso` y `/volver` funcionan aunque la tienda esté en mantenimiento |
| `tests/pruebas_tukanpagos.php`, `tests/tukanpagos_falso.php` | 46 pruebas con un Tukán Pagos falso (y el botón en un navegador de verdad) |

## Factura: igual que en todos los sistemas (Panel Tukán + TuFactura)

Pedido de Dimitry (6 nov 2026): «la factura debe hacerla igual que todos los sistemas, debemos igualar todos los sistemas».
Con el juego conectado al Panel (`FACTURACION_POR_PANEL=1`, `src/PanelVentas.php`):

- **Cada venta aprobada**, de cualquier canal (tarjeta por Tukán Pagos o Plux propio, PayPal, Google Play), se manda
  firmada al Panel (`POST https://panel.tukanec.com/ventas_api.php`, token v2 de tipo «venta» con el secreto del juego).
- El Panel la anota en **Más → Cobros y facturas** (programa «EN VIVO Tycoon», monto sin IVA, como los cobros con Plux) y
  emite la **factura con TuFactura** sola: con la cédula / RUC que el comprador puso en la página de pago, o a
  **consumidor final** (solo hasta $50; si pasa, queda «por decidir»). Si TuFactura está apagado queda «por decidir».
- **Ventas de prueba** (Plux / Tukán Pagos / PayPal en sandbox, compra de prueba de Google): el Panel no las factura ni
  las suma en Finanzas.
- **Reembolso o contracargo**: el cobro queda anulado en el Panel; si ya tenía factura, el Panel avisa que falta la nota
  de crédito en TuFactura.
- La facturación propia del juego (`src/Facturacion.php`, el ERP) **se apaga sola**: una sola factura por venta.
- Si el Panel no contesta, la venta queda en la cola (`panel_ventas`) y `bin/tareas.php` la vuelve a mandar. El Panel
  nunca anota dos veces la misma venta (referencia `envivo-compra-<id>`).

### Conectar el juego al Panel (Dimitry, una sola vez)
1. En el Panel: **Programas → Agregar → EN VIVO Tycoon** (dirección `https://juego.tukanec.com`). El Panel muestra un comando.
2. Pega ese comando en el VPS del ERP (149.56.111.193). Es así (el Panel pone el ID y el SECRETO):
   `sudo bash /var/www/envivo/server/deploy/conectar_central.sh ID SECRETO https://panel.tukanec.com`
   Debe terminar en `RESULTADO: todo bien`.
3. En el Panel deben estar encendidos la facturación y el local de TuFactura (Ajustes → Facturación), como para los demás.

Revisar: `sudo -u www-data php /var/www/envivo/server/bin/panel_ventas.php estado` (enviadas, pendientes, rechazadas).
Desconectar: `sudo bash /var/www/envivo/server/deploy/conectar_central.sh --quitar`.

### La tarjeta del juego en el Panel (7 nov 2026)
El Panel revisa cada programa cada 15 minutos por `/tukan_central.php` (Protocolo Tukán v1). Antes el juego no lo tenía y la
tarjeta decía «Sin conexión: el conector está apagado o no existe (404)». Ahora (`src/ConectorCentral.php`,
`public/tukan_central.php`, mismo ID y secreto que las ventas):
- **estado**: la tarjeta muestra jugadores, nuevos en 30 días, ventas del mes y del mes anterior (sin IVA y sin las de prueba),
  VIP activos, ventas por mandar al Panel y casos de soporte abiertos.
- **Entrar a EN VIVO Tycoon** (sso): abre el Centro de Control sin pedir clave ni código (el Panel ya pidió los dos pasos) y queda
  en la auditoría («Entró desde el Panel Tukán Central»). Respeta `ENVIVO_CONTROL_IPS`.
- Tokens de un solo uso (tabla `tukan_central_nonces`), 30 pedidos por minuto por conexión, y 404 si el juego no está conectado.
- nginx: `location = /tukan_central.php` (deploy/nginx-sitio.sh). Después de actualizar: `sudo bash /var/www/envivo/server/deploy/instalar.sh`.
- Pruebas: `tests/pruebas_conector_central.php` (25: rechazos del protocolo, sso y el Panel de verdad viendo el juego «En línea»).

| Archivo | Qué hace |
|---|---|
| `src/PanelVentas.php`, `src/migraciones/panel_ventas.sql` | Cola de ventas y reversos, firma y envío al Panel |
| `bin/panel_ventas.php`, `deploy/conectar_central.sh` | Revisar, mandar a mano, conectar |
| `tests/pruebas_panel_ventas.php` | 25 pruebas de punta a punta: juego → Panel de verdad → TuFactura de mentira |
