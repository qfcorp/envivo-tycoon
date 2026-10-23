# PayPal en la tienda web — guía para el dueño

PayPal es un **segundo botón de pago** en la tienda **web** (juego.tukanec.com), al lado de «Pagar con tarjeta» (Pago Plux).

- **Nunca aparece dentro de la app de Android** (Google Play solo permite su propio cobro) ni en la versión de un solo archivo (`dist/`).
- Solo sale en productos desde **$4,99** (se cambia con `PAYPAL_MINIMO`). Los más baratos se pagan con tarjeta: en una venta de
  $0,99 la comisión de PayPal se llevaría cerca del 35 %.
- Mientras no pongas las llaves, el botón **no aparece** (como Plux sin llaves). No tienes que apagar nada.

Tiempo: unos 30 minutos. Necesitas tu correo, tu celular y acceso al servidor (consola SSH).

---

## 1. Cuánto cobra PayPal (Ecuador)

| Qué | Costo |
|---|---|
| Cada venta | **5,4 % + $0,30** (en una venta de $4,99 son unos $0,57; te quedan unos $4,42) |
| Retirar a tu banco en Ecuador | **0,5 %** del retiro, **mínimo $10 por retiro** |

**Consejo: retira en montos grandes** (por ejemplo, una vez al mes), no de a poco: cada retiro cuesta al menos $10.

Las comisiones las pone PayPal y pueden cambiar: revísalas en tu cuenta (**Configuración > Comisiones**) antes de empezar.

**Riesgo de disputas:** la «protección al vendedor» de PayPal casi nunca cubre productos digitales (créditos de un juego).
Si un comprador abre una disputa o su banco revierte el pago, PayPal normalmente le devuelve el dinero. Por eso el juego, cuando
PayPal avisa una **disputa, reversión o reembolso**, **revierte la compra solo**: quita los créditos, suspende la cuenta (un
contracargo la banea, según tus reglas en Centro de Control > Ajustes > Abuso de reembolsos) y el módulo de facturación crea la
nota de crédito. Si la disputa termina a tu favor, reactiva la cuenta en la ficha del jugador.

---

## 2. Crear la cuenta PayPal Business

1. Entra a **https://www.paypal.com/ec/business** y toca **Registrarse** (o **Abrir cuenta**).
2. Elige **Cuenta Business**. Usa el correo de la empresa (por ejemplo `pagos@tukanec.com`).
3. Datos de la empresa: **QFCORP S.A.S.**, RUC **1793135099001**, dirección de la empresa en Quito.
4. Confirma tu correo (te llega un enlace) y tu celular (te llega un código).
5. **Vincula tu cuenta de banco** de Ecuador (Billetera > Vincular un banco) para poder retirar después.
6. Si ya tienes una cuenta personal, puedes **convertirla a Business** en Configuración > Tipo de cuenta.

---

## 3. Llaves de PRUEBA (sandbox) — primero se prueba sin dinero real

1. Entra a **https://developer.paypal.com** y toca **Log in to Dashboard** con tu cuenta PayPal.
2. Arriba, deja el interruptor en **Sandbox**.
3. Ve a **Apps & Credentials** y toca **Create App**.
   - App Name: `EN VIVO Tycoon`
   - Type: **Merchant**
   - Toca **Create App**.
4. Se abre la app. Copia en un bloc de notas:
   - **Client ID** (una línea larga que empieza con `A`)
   - **Secret** (toca *Show* para verlo). **Es secreto: nunca lo pegues en GitHub, WhatsApp ni correos.**
5. En esa misma página, baja hasta **Webhooks** y toca **Add Webhook**:
   - **Webhook URL:** `https://juego.tukanec.com/api/paypal/webhook`
   - **Event types:** marca estos 6 (usa el buscador):
     - `Checkout order approved` (CHECKOUT.ORDER.APPROVED)
     - `Payment capture completed` (PAYMENT.CAPTURE.COMPLETED)
     - `Payment capture denied` (PAYMENT.CAPTURE.DENIED)
     - `Payment capture refunded` (PAYMENT.CAPTURE.REFUNDED)
     - `Payment capture reversed` (PAYMENT.CAPTURE.REVERSED)
     - `Customer dispute created` (CUSTOMER.DISPUTE.CREATED)
   - Toca **Save**.
6. En la lista de webhooks aparece el tuyo con su **Webhook ID** (algo como `8PT597110X687430LKGECATA`). Cópialo también.

---

## 4. Pegar las 4 líneas en el servidor

1. Entra al servidor por SSH y abre la configuración:

   ```bash
   sudo nano /etc/envivo/config.env
   ```

2. Busca las líneas que empiezan con `PAYPAL_` (las agregó el instalador; si no están, pégalas al final) y déjalas así, con TUS valores:

   ```ini
   PAYPAL_AMBIENTE=sandbox
   PAYPAL_CLIENT_ID=pega_aqui_el_client_id
   PAYPAL_SECRET=pega_aqui_el_secret
   PAYPAL_WEBHOOK_ID=pega_aqui_el_webhook_id
   PAYPAL_MINIMO=4.99
   ```

3. Guarda: **Ctrl+O**, **Enter**, **Ctrl+X**.
4. Recarga PHP para que lea los cambios:

   ```bash
   sudo systemctl reload php8.3-fpm
   ```

5. Revisa en **Centro de Control > Ajustes > PayPal**: debe decir **sandbox (pruebas)**, llaves **puestas** y webhook **puesto**.

---

## 5. Probar con un comprador de prueba (sin dinero real)

1. En developer.paypal.com (en **Sandbox**) ve a **Testing Tools > Sandbox Accounts**. Ya hay una cuenta **Personal** de prueba.
   Toca los tres puntos **⋮ > View/Edit account** y copia su **correo** y su **clave** (Password).
2. En el juego **en la web** (no en la app), entra con una cuenta del juego y abre la **Tienda**.
3. En un producto de $4,99 o más verás **«Pagar con tarjeta»** y **«Pagar con PayPal»**. Toca **Pagar con PayPal**.
4. Elige **Consumidor final** (o escribe una cédula), acepta los términos y toca **Pagar con PayPal**.
5. En la página de PayPal entra con el **correo y la clave del comprador de prueba** y toca **Pagar**.
6. Vuelves solo al juego con el mensaje de compra aprobada y los créditos llegan.
7. Revisa en el Centro de Control:
   - **Compras**: la compra con el distintivo **PayPal** (y la comisión de PayPal en el detalle).
   - **Facturación**: la factura pendiente (forma de pago SRI **20**).
   - **Ajustes > PayPal > Últimos avisos de PayPal**: deben aparecer los avisos (por ejemplo `PAYMENT.CAPTURE.COMPLETED`).
8. (Opcional) Prueba un reembolso: en **https://www.sandbox.paypal.com** entra con tu cuenta Business de prueba
   (Sandbox Accounts > la cuenta *Business*), abre el pago y toca **Reembolsar**. La compra debe quedar **revertida** en el Centro de Control.

---

## 6. Pasar a PRODUCCIÓN (dinero real)

1. En developer.paypal.com cambia el interruptor de arriba a **Live**.
2. **Apps & Credentials > Create App** otra vez (mismo nombre, tipo Merchant). Copia el **Client ID** y el **Secret** de Live.
3. En esa app Live, **Add Webhook** con la **misma URL** y los **mismos 6 eventos** del paso 3. Copia su **Webhook ID** (es otro, distinto al de sandbox).
4. En el servidor:

   ```bash
   sudo nano /etc/envivo/config.env
   ```

   Cambia las 4 líneas por las de **Live**:

   ```ini
   PAYPAL_AMBIENTE=produccion
   PAYPAL_CLIENT_ID=client_id_de_live
   PAYPAL_SECRET=secret_de_live
   PAYPAL_WEBHOOK_ID=webhook_id_de_live
   ```

   Guarda (**Ctrl+O**, **Enter**, **Ctrl+X**) y recarga:

   ```bash
   sudo systemctl reload php8.3-fpm
   ```

5. En **Centro de Control > Ajustes > PayPal** debe decir **producción**.
6. Haz una compra real pequeña de $4,99 con tu propia cuenta PayPal personal y luego reembólsala desde PayPal para ver que todo funciona.

---

## 7. Cómo funciona (resumen técnico)

- El valor **siempre sale del catálogo** del servidor. El navegador nunca decide cuánto se cobra ni si se pagó.
- El servidor crea la orden en PayPal, manda al comprador a PayPal y, cuando vuelve, **el servidor captura** el pago y revisa que
  esté **COMPLETED**, en **USD**, por el **valor exacto** y con la referencia **EV-&lt;número de compra&gt;** antes de entregar.
- **Nunca se entrega dos veces**: recargar la página, dos pestañas o el aviso de PayPal que llega después no vuelven a cobrar ni a
  entregar. Si el comprador cerró el navegador después de pagar, el aviso `CHECKOUT.ORDER.APPROVED` termina la compra.
- Los avisos (webhook) se revisan con la firma de PayPal (`verify-webhook-signature`); sin firma válida no se hace nada.
- Si un pago queda **en revisión** en PayPal, se entrega solo cuando PayPal avise que se completó.
- **Reembolso total, reversión o disputa** → se revierte la compra como un reembolso de Plux o Google. Un **reembolso parcial** no se
  revierte solo: queda un aviso en el Centro de Control para que decidas.
- Si algo no coincide (valor, moneda o referencia), **no se entrega** y queda un aviso `paypal_no_coincide`: revisa el pago en
  PayPal y devuelve el dinero.
- **Factura SRI**: forma de pago **20** («otros con utilización del sistema financiero», la misma que Google Play), a consumidor
  final (hasta $50, `FACTURACION_TOPE_CF`) o con la cédula / RUC que escriba el comprador.
- Código: `server/src/PayPal.php` y `server/src/PayPalApi.php`. Pruebas: `server/tests/pruebas_paypal.php` (PayPal falso) y
  `tests/test_paypal.js` (navegador).

## 8. Si algo falla

| Qué pasa | Qué hacer |
|---|---|
| No aparece el botón de PayPal | Faltan `PAYPAL_CLIENT_ID` o `PAYPAL_SECRET`, o no recargaste `php8.3-fpm`. El producto debe costar desde `PAYPAL_MINIMO`. En la app de Android nunca aparece. |
| «No se pudo conectar con PayPal» | Llaves de sandbox con `PAYPAL_AMBIENTE=produccion` (o al revés). Revisa que las 3 llaves sean del mismo ambiente. |
| Los reembolsos no revierten la compra | Falta `PAYPAL_WEBHOOK_ID` o es del otro ambiente. Mira «Últimos avisos de PayPal» en Ajustes y, en developer.paypal.com, *Webhooks > Events*. |
| Aviso `paypal_firma_mala` | Llegó un aviso que PayPal no reconoce (o el Webhook ID está mal copiado). No se aplicó nada. |
| Un cliente pagó y no recibió | Centro de Control > Compras (busca por correo o por el número de captura de PayPal) y los avisos `paypal_*`. |
