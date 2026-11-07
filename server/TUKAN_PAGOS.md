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
6. `Compras::aprobar()` entrega una sola vez (aviso + regreso, en cualquier orden). La **factura SRI** se crea igual que
   antes (TuFactura, `INTEGRAR_FACTURACION.md`). Tukán Pagos no factura: no hay factura doble.
7. Tarjeta rechazada: vuelve a la página de pago con «Tu banco no aprobó el pago» y puede intentar otra vez (mismo cobro).

## Encenderlo (Dimitry, una sola vez)

1. En **pagos.tukanec.com** → **Programas → Agregar**:
   - código: `envivo` · nombre: `EN VIVO Tycoon`
   - dirección de aviso: `https://juego.tukanec.com/api/tukanpagos/aviso`
   - inicio de las direcciones de regreso: `https://juego.tukanec.com`
   - Copia la **clave** (`tkp_…`) y el **secreto de avisos** (se ven una sola vez).
2. En el VPS-1, actualizar el juego y conectarlo:
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
