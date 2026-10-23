# Facturación electrónica SRI: puente entre el juego y el ERP

Para el dueño y para quien programe el lado del ERP. El juego (EN VIVO Tycoon) **no** firma XML ni habla con el SRI.
Eso lo hace el ERP del dueño, que es un sistema aparte con su propio sincronizador del SRI. El juego guarda cada
comprobante que hay que emitir y el ERP lo toma, lo autoriza y le devuelve al juego la clave de acceso.

```
compra aprobada (Plux / Google Play) ──► factura "pendiente" ──► ERP: GET /api/facturacion/pendientes (o aviso webhook)
reembolso / contracargo              ──► nota de crédito     ──► ERP firma, envía y autoriza en el SRI
                                                                  ERP: POST /api/facturacion/confirmar {clave_acceso...}
```

## 1. Reglas del SRI que se tuvieron en cuenta (2026)

- **Autorización inmediata.** Desde el 1 de enero de 2026 los comprobantes se transmiten y autorizan en el momento de
  emitirlos. Antes había hasta 4 días hábiles. La norma es la resolución NAC-DGERCGC25-00000017, y la nota de Expreso dice
  que es "sin excepciones". Por eso el juego avisa si algo pasa **más de 1 hora** sin autorizar (§7).
- **Consumidor final: tope de USD 50.** Por encima hay que identificar al comprador. La página de pago no deja elegir
  "Consumidor final" en una compra de más de `FACTURACION_TOPE_CF`, que por defecto es 50.
- **Las facturas a consumidor final no se anulan ni se corrigen con nota de crédito** desde 2026. Si una compra
  facturada a consumidor final se reembolsa (por ejemplo, Google Play), el juego crea la nota de crédito en estado
  `no_aplica` y deja un aviso para el dueño. No se manda al ERP. El dueño decide con su contador qué hacer.
- **Código del IVA 15 %:** `codigoPorcentaje = 4` (tabla 17 de la ficha técnica). El precio del catálogo ya incluye IVA
  y el juego separa el subtotal y el IVA con `Catalogo::desglose`.

Fuentes (revisadas el 23-oct-2026):
[Primicias, transmisión obligatoria desde enero 2026](https://www.primicias.ec/economia/transmision-facturas-electronicas-sri-obligatoria-enero2026-112780/) ·
[Expreso, modificaciones y restricciones (NAC-DGERCGC25-00000017)](https://www.expreso.ec/servicios/modificaciones-en-la-facturacion-electronica-del-sri-plazos-y-restricciones-257557.html) ·
[Siigo, transmisión inmediata y consumidor final USD 50](https://www.siigo.com/ec/blog/obligaciones-fiscales/transmision-inmediata-comprobantes-electronicos/) ·
[Expreso, factura electrónica 2026](https://www.expreso.ec/actualidad/economia/factura-electronica-2026-el-cambio-obligatorio-del-sri-que-rige-desde-enero-269991.html).
Son resúmenes de prensa. **Lo que vale es el texto de la resolución en sri.gob.ec y lo que diga el contador.**

> **Para consultar con el contador: Google Play.** En las compras dentro de la app Android, Google cobra al jugador y
> le paga al desarrollador. Puede que lo que corresponda sea facturar a Google y no al jugador. Por ahora, y tal como se
> pidió, se facturan a **consumidor final** con el correo de la cuenta. Con `FACTURACION_GOOGLE=0` el juego deja de
> crear facturas para Google Play.

## 2. Configuración

En el juego (`/etc/envivo/config.env`; las líneas están en `server/config.env.ejemplo`):

```ini
; Secreto compartido para la firma HMAC: el MISMO en el ERP. 32 caracteres o más. Para crearlo: openssl rand -hex 32
FACTURACION_CLAVE=
; Opcional: IPs o redes (CIDR) del ERP. Vacío = cualquiera con firma válida.
; OJO: detrás de un túnel (cloudflared) la IP que ve PHP es 127.0.0.1; en ese caso déjalo vacío y confía en la firma.
FACTURACION_IPS=
; Opcional: dirección del ERP para avisarle cada comprobante nuevo (https; http solo para 127.0.0.1)
FACTURACION_WEBHOOK_URL=
; Opcional: programa que recibe la alerta de atrasos como texto (ej. el ayudante de Telegram del dueño)
FACTURACION_ALERTA_CMD=/usr/local/bin/alerta-telegram.sh
; Tope de consumidor final (vacío = 50) · facturar Google Play (1/0) · apagar el módulo (0)
FACTURACION_TOPE_CF=
FACTURACION_GOOGLE=1
FACTURACION_ACTIVA=
```

Después: `sudo systemctl reload php8.3-fpm`. El cron (`bin/facturacion.php` cada 5 minutos) lo deja `deploy/instalar.sh`.

En el ERP basta con guardar dos datos: la dirección del juego (`https://juego.tukanec.com`) y la misma `FACTURACION_CLAVE`.

## 3. Firma HMAC (todas las peticiones a `/api/facturacion/*` y el aviso webhook)

Cabeceras:

| Cabecera | Valor |
|---|---|
| `X-Factura-Fecha` | Hora actual en segundos Unix. Se acepta hasta ±5 minutos de diferencia; el ERP debe tener la hora bien (NTP). |
| `X-Factura-Nonce` | Texto al azar, de 16 a 64 caracteres `[A-Za-z0-9_-]`, distinto en cada petición. Una petición repetida se rechaza. |
| `X-Factura-Firma` | `hex(HMAC-SHA256(texto, FACTURACION_CLAVE))` |

El `texto` que se firma son cinco líneas unidas con `\n`:

```
MÉTODO            GET o POST, en mayúsculas
RUTA              tal cual va en la petición, con los ?parámetros:  /api/facturacion/pendientes?limite=50
FECHA             el mismo valor de X-Factura-Fecha
NONCE             el mismo valor de X-Factura-Nonce
sha256(cuerpo)    en hexadecimal; con GET el cuerpo es vacío ("") -> e3b0c442...b855
```

### Fragmento PHP para el ERP

```php
<?php
// Lado del ERP (PHP 7.4 o más nuevo, con curl).
const JUEGO_URL   = 'https://juego.tukanec.com';
const JUEGO_CLAVE = 'la-misma-FACTURACION_CLAVE-del-juego';

/** Petición firmada al juego. Devuelve [http, respuesta JSON]. */
function juego_pedir(string $metodo, string $ruta, ?array $datos = null): array
{
    $cuerpo = $datos === null ? '' : json_encode($datos, JSON_UNESCAPED_UNICODE);
    $fecha  = (string) time();
    $nonce  = bin2hex(random_bytes(16));
    $texto  = strtoupper($metodo) . "\n" . $ruta . "\n" . $fecha . "\n" . $nonce . "\n" . hash('sha256', $cuerpo);
    $firma  = hash_hmac('sha256', $texto, JUEGO_CLAVE);
    $ch = curl_init(JUEGO_URL . $ruta);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $metodo,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'X-Factura-Fecha: ' . $fecha,
                                   'X-Factura-Nonce: ' . $nonce, 'X-Factura-Firma: ' . $firma],
    ] + ($metodo === 'POST' ? [CURLOPT_POSTFIELDS => $cuerpo] : []));
    $r = curl_exec($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$http, json_decode((string) $r, true)];
}

/** Recibir el aviso (webhook) del juego: verificar la firma. Devuelve el JSON o termina con 401. */
function juego_recibir_aviso(): array
{
    $cuerpo = (string) file_get_contents('php://input');
    $f = $_SERVER['HTTP_X_FACTURA_FECHA'] ?? '';
    $n = $_SERVER['HTTP_X_FACTURA_NONCE'] ?? '';
    $s = $_SERVER['HTTP_X_FACTURA_FIRMA'] ?? '';
    // REQUEST_URI = ruta + ?parámetros de FACTURACION_WEBHOOK_URL (si un proxy cambia la ruta, usa la configurada)
    $texto = "POST\n" . $_SERVER['REQUEST_URI'] . "\n" . $f . "\n" . $n . "\n" . hash('sha256', $cuerpo);
    if (abs(time() - (int) $f) > 300 || !hash_equals(hash_hmac('sha256', $texto, JUEGO_CLAVE), $s)) {
        http_response_code(401);
        exit;
    }
    return json_decode($cuerpo, true) ?: [];
}
```

Para probar la conexión: `juego_pedir('GET', '/api/facturacion/ping')` debe devolver `200 {"ok": true, ...}`.

## 4. API

Todas responden JSON. Si hay un error: `{ "ok": false, "error": "texto", "codigo": "..." }`.

### `GET /api/facturacion/pendientes?limite=50&desde_id=0`

Devuelve los comprobantes por emitir, del más antiguo al más nuevo. `limite` va de 1 a 200. `desde_id` sirve para
paginar (pide los de id mayor). Entran las facturas en `pendiente` o `en_proceso` que ya pasaron su espera de
reintento, y las notas de crédito cuya factura **ya está autorizada**. El mismo comprobante sigue saliendo hasta que el
ERP lo confirma: **el ERP debe ser idempotente** y usar `referencia` (o `id`) como clave única (§6).

```json
{
  "ok": true,
  "ahora": "2026-10-23T10:00:05-05:00",
  "hay_mas": false,
  "comprobantes": [
    {
      "id": 123,
      "referencia": "EVF-000123",
      "tipo": "factura",
      "estado": "pendiente",
      "intentos": 0,
      "ultimo_error": null,
      "compra": { "id": 456, "canal": "web_plux", "producto": "creditos_250", "transaccion": "PLX-998877", "pagado_en": "2026-10-23T09:59:58-05:00" },
      "fecha_venta": "2026-10-23",
      "comprador": {
        "tipo_identificacion": "05",
        "tipo_identificacion_nombre": "cedula",
        "identificacion": "1710034065",
        "razon_social": "ANA PÉREZ",
        "email": "ana@correo.ec",
        "telefono": "0991234567",
        "direccion": null,
        "consumidor_final": false
      },
      "items": [
        { "codigo": "creditos_250", "descripcion": "250 créditos", "cantidad": 1, "precio_unitario": 1.73, "descuento": 0,
          "subtotal": 1.73, "iva_codigo": "4", "iva_tarifa": 15, "iva": 0.26, "total": 1.99 }
      ],
      "subtotal": 1.73, "iva": 0.26, "iva_tarifa": 15, "iva_codigo": "4", "total": 1.99, "moneda": "USD",
      "forma_pago": { "codigo": "19", "nombre": "Tarjeta de crédito", "total": 1.99 },
      "motivo": null,
      "factura_modificada": null,
      "advertencia": null,
      "sri": { "numero_autorizacion": null, "clave_acceso": null, "numero_comprobante": null, "autorizada_en": null },
      "creado": "2026-10-23T09:59:58-05:00"
    }
  ]
}
```

- `comprador.tipo_identificacion` usa la tabla 6 del SRI: `04` RUC, `05` cédula, `06` pasaporte, `07` consumidor final.
  Con `07`, `identificacion = "9999999999999"` y `razon_social = "CONSUMIDOR FINAL"`. El correo se manda igual, por si
  el ERP quiere enviar el RIDE.
- `forma_pago.codigo` (tabla 24): `19` tarjeta de crédito (Plux), `20` otros con utilización del sistema financiero
  (Google Play). El ERP puede cambiarlo si su contador lo indica.
- `fecha_venta` es el día del pago. La **fecha de emisión** del comprobante la pone el ERP: es el día en que lo emite,
  que debería ser el mismo día.
- `advertencia`: algo que conviene revisar antes de emitir y que no frena el envío. Por ejemplo, una identificación
  que no pasa la validación, o un consumidor final por encima del tope en una compra vieja.
- **Nota de crédito** (`"tipo": "nota_credito"`, `"referencia": "EVN-000124"`): trae los mismos datos y además
  `motivo` ("Reembolso de la compra N° 456 (...)" o "Contracargo ...") y la factura que modifica:

```json
"factura_modificada": { "id": 123, "referencia": "EVF-000123", "estado": "autorizada",
  "numero_autorizacion": "2310202601179001234500110010010000000011234567813",
  "clave_acceso": "2310202601179001234500110010010000000011234567813",
  "numero_comprobante": "001-001-000000001", "fecha_emision": "2026-10-23" }
```

### `POST /api/facturacion/confirmar`

```json
{ "id": 123, "estado": "autorizada",
  "clave_acceso": "2310202601179001234500110010010000000011234567813",
  "numero_autorizacion": "2310202601179001234500110010010000000011234567813",
  "numero_comprobante": "001-001-000000001",
  "fecha_autorizacion": "2026-10-23T10:00:07-05:00",
  "mensaje": "" }
```

Respuesta: `{ "ok": true, "id": 123, "referencia": "EVF-000123", "estado": "autorizada", "resultado": "actualizado" }`.
Si la misma confirmación llega dos veces, la respuesta es `"resultado": "sin_cambios"`. Repetir es seguro.

| `estado` que manda el ERP | Qué hace el juego |
|---|---|
| `autorizada` | Final. Exige `clave_acceso` de 49 dígitos. `numero_autorizacion` es opcional (si falta, se usa la clave) y `numero_comprobante` es opcional (`001-001-000000001`). |
| `en_proceso` (o `recibida`) | El ERP ya lo mandó al SRI y espera respuesta. Sigue apareciendo en pendientes hasta que llegue `autorizada`. |
| `rechazada` (o `no_autorizada`, `devuelta`) | El SRI no lo aceptó. Queda **fallida**, con el `mensaje` y un aviso al dueño. Se corrige y se reintenta desde el Centro de Control. |
| `error` | Falla pasajera (sin internet, SRI caído, firma vencida...). Se reintenta con espera creciente: 1, 2, 4, 8... minutos, hasta 6 h. A los 8 errores queda **fallida**. |
| `no_aplica` | No se emite (por ejemplo, una venta de prueba). Final. |

Errores: `400 falta_id` · `422 facturacion_estado_invalido` · `422 facturacion_autorizacion_invalida` ·
`404 facturacion_no_existe` · `409 facturacion_ya_autorizada` (llegó otra clave, y se devuelve la que está guardada) ·
`409 facturacion_estado_final` · `409 facturacion_factura_sin_autorizar` (nota de crédito antes que su factura) ·
`409 facturacion_clave_repetida`.

**En lote** (hasta 100): `{ "confirmaciones": [ {...}, {...} ] }` responde
`{ "ok": true, "resultados": [ {ok, id, resultado | error, codigo, http}, ... ] }`. Si una falla, las demás se procesan igual.

### Otras rutas

- `GET /api/facturacion/comprobante?id=123`: devuelve un comprobante, `{ "ok": true, "comprobante": {...} }`.
- `GET /api/facturacion/ping`: sirve para probar la firma. Devuelve `{ok, ahora, activa, webhook, tope_consumidor_final}`.

Errores de acceso: `401 facturacion_firma_invalida | facturacion_fecha_invalida | facturacion_nonce_repetido` ·
`403 facturacion_ip_no_permitida` · `429 limite_intentos` (20 firmas malas en 10 minutos desde una IP) ·
`503 facturacion_no_configurada`.

## 5. Aviso (webhook) opcional

Con `FACTURACION_WEBHOOK_URL`, el juego hace un `POST` a esa dirección por cada comprobante nuevo, firmado como en §3
(con la ruta y los parámetros de esa URL). Lo manda justo después de responderle al jugador. Cabecera
`X-Factura-Evento: factura_pendiente | nota_credito_pendiente`. Cuerpo:

```json
{ "evento": "factura_pendiente", "enviado": "2026-10-23T10:00:00-05:00", "comprobante": { ...igual que en pendientes... } }
```

- Si responde **2xx**, el aviso cuenta como entregado. Si el ERP **ya autorizó** en ese momento, puede responder en el
  mismo cuerpo `{"estado": "autorizada", "clave_acceso": "...", "numero_comprobante": "..."}` y el juego lo aplica como
  una confirmación. Si solo responde `{"recibido": true}`, después tiene que confirmar con `/confirmar`.
- Si no responde 2xx, el juego reintenta después de 1 min, 5 min, 15 min, 1 h, 3 h y 6 h (cron cada 5 minutos). A los
  10 intentos deja de avisar (queda `agotado`), pero el comprobante sigue en `/pendientes`.
- El aviso es un atajo para que el ERP se entere antes. **La fuente de verdad es `/pendientes`**: conviene que el ERP
  la consulte igual, por ejemplo cada minuto.

## 6. Flujo recomendado en el ERP

```php
// Cron del ERP cada minuto (o al recibir el aviso)
[$http, $r] = juego_pedir('GET', '/api/facturacion/pendientes?limite=50');
foreach ($r['comprobantes'] ?? [] as $c) {
    // 1) Idempotencia: si esta referencia ya se emitió, solo se vuelve a confirmar con la clave guardada
    $ya = erp_buscar_por_referencia($c['referencia']);
    if ($ya && $ya['autorizado']) {
        juego_pedir('POST', '/api/facturacion/confirmar', ['id' => $c['id'], 'estado' => 'autorizada', 'clave_acceso' => $ya['clave_acceso']]);
        continue;
    }
    try {
        // 2) Factura o nota de crédito (con $c['factura_modificada']) por el sincronizador SRI del ERP
        $a = erp_emitir_y_autorizar($c);   // XML, firma XAdES-BES, recepción y autorización
        juego_pedir('POST', '/api/facturacion/confirmar', ['id' => $c['id'], 'estado' => 'autorizada',
            'clave_acceso' => $a['clave_acceso'], 'numero_autorizacion' => $a['numero_autorizacion'],
            'numero_comprobante' => $a['numero'], 'fecha_autorizacion' => $a['fecha']]);
    } catch (SriRechazo $e) {        // DEVUELTA / NO AUTORIZADO
        juego_pedir('POST', '/api/facturacion/confirmar', ['id' => $c['id'], 'estado' => 'rechazada', 'mensaje' => $e->getMessage()]);
    } catch (Throwable $e) {         // sin conexión, SRI caído, firma...
        juego_pedir('POST', '/api/facturacion/confirmar', ['id' => $c['id'], 'estado' => 'error', 'mensaje' => $e->getMessage()]);
    }
}
```

- Guarda `referencia` como campo único en el ERP. Si el juego no recibió la confirmación (por ejemplo, se cortó la
  red), el comprobante vuelve a aparecer en pendientes y no debe emitirse dos veces.
- Las notas de crédito solo aparecen cuando su factura ya está autorizada en el juego. Usa los datos de
  `factura_modificada` (número y fecha de emisión) para el documento modificado.
- Si la compra se reembolsa **antes** de que el ERP reciba la factura, el juego la marca `no_aplica` y no hay nada
  que emitir.

## 7. Centro de Control y alertas

- **Centro de Control > Facturación** (`/control/?t=facturacion`) muestra:
  - La conexión: si la clave está puesta, las IPs, el webhook y el último contacto del ERP.
  - Contadores de pendientes, en proceso, atrasadas (más de 1 h), fallidas y autorizadas hoy.
  - Filtros, la lista y el detalle de cada comprobante (el JSON que ve el ERP y su historial).
  - Acciones: **Reintentar** (vuelve a pendiente desde cero), **Reintentar todas las fallidas**, **No aplica** (con
    motivo), **Reenviar avisos al ERP** y **Exportar CSV**. Todas quedan en la auditoría.
  - La insignia de la pestaña cuenta atrasadas más fallidas.
- El CSV de **Compras** de siempre sigue igual.
- **Alerta** (`bin/facturacion.php`, cada 5 minutos): si hay comprobantes con más de 1 hora sin autorizar, o fallidos,
  deja un aviso `factura_atrasada` en el Centro de Control y, si está configurado, lo manda con
  `FACTURACION_ALERTA_CMD` (Telegram). Avisa como máximo una vez al día, salvo que aparezcan atrasados nuevos (entonces
  como máximo cada hora).
- Lo vendido **antes** de instalar este módulo:
  `sudo -u www-data php /var/www/envivo/server/bin/facturacion.php --rellenar=2026-01-01` crea las facturas que falten.
  No duplica. Ojo: esas ventas ya no se pueden autorizar "de inmediato"; consulta al contador antes de emitirlas.

## 8. Datos del comprador en la página de pago

La página de pago (Plux) ya pedía nombres, apellidos, cédula, correo y celular del titular. Ahora también tiene
**"Datos para tu factura electrónica"**, con tres opciones:

1. **A nombre del titular de la tarjeta** (por defecto). Usa la cédula de arriba: 10 dígitos válidos son cédula (`05`),
   13 son RUC (`04`) y otro formato se toma como pasaporte (`06`).
2. **A otro nombre o con RUC**: cédula, RUC o pasaporte, nombre o razón social, y correo.
3. **Consumidor final**, solo hasta USD 50.

En todas hay un campo de dirección opcional. El servidor revisa los datos **antes de cobrar** (cédula con módulo 10;
RUC con su estructura y, si es de persona natural, la cédula). Así nunca queda un cobro sin una factura posible.

Google Play no manda datos del comprador. Esas compras van a consumidor final con el correo de la cuenta.
