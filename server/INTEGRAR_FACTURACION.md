# Facturación SRI: integración

Este módulo es el puente entre el juego y el ERP del dueño, que emite las facturas y notas de crédito en el SRI.
El contrato para el ERP está en `docs/FACTURACION_SRI.md`. Las pruebas están en `server/tests/pruebas_facturacion.php`.

## Archivos nuevos

| Archivo | Qué es |
|---|---|
| `server/src/Facturacion.php` | Ganchos `compra_aprobada` y `compra_revertida` (crean la factura y la nota de crédito pendientes), validación de cédula y RUC, datos de la página de pago, firma HMAC, confirmaciones con reintentos, aviso al ERP, alertas y rellenar. |
| `server/src/FacturacionApi.php` | `/api/facturacion/ping`, `/pendientes`, `/comprobante` y `/confirmar`. Todas firmadas con HMAC; no usan sesión ni `X-Envivo`. |
| `server/src/migraciones/facturacion.sql` | Tablas `facturas`, `facturacion_datos_compra`, `facturacion_nonces` y `facturacion_eventos`. |
| `server/bin/facturacion.php` | Cron cada 5 min (avisos y alerta) y las opciones `--rellenar=AAAA-MM-DD` y `--resumen`. |
| `server/public/assets/factura.js`, `factura.css` | Bloque "Datos para tu factura electrónica" de la página de pago. |
| `server/public/control/lib/facturacion.php` | Pestaña **Facturación** del Centro de Control. |
| `server/tests/pruebas_facturacion.php` | 110 pruebas. |
| `docs/FACTURACION_SRI.md` | Contrato del ERP: JSON, firma HMAC con un fragmento PHP, configuración y reglas del SRI. |
| `docs/traducciones/errores_nuevos/facturacion.json` | Los 16 códigos nuevos en los 10 idiomas, con el mismo formato que `errores.json`. |

**`Compras.php` no se toca.** Escucha los eventos que ya emite (`Ganchos::emitir('compra_aprobada' | 'compra_revertida')`).
Cada oyente corre en su propio SAVEPOINT, así que un error de facturación nunca rompe una compra.

## Líneas en archivos compartidos (ya puestas en esta rama)

`server/src/arranque.php`, después de `$registrar(Estrellas::class);`:

```php
$registrar(Facturacion::class);     // \EnVivo\Facturacion::registrar(); factura / nota de crédito SRI pendiente — INTEGRAR_FACTURACION.md
```

`server/public/api.php`:

```php
    if ($ruta === '/plux/3ds') api_plux_3ds();
    // Facturación SRI para el ERP del dueño (server/INTEGRAR_FACTURACION.md): firmada con HMAC, sin sesión ni X-Envivo
    if (class_exists(\EnVivo\FacturacionApi::class) && \EnVivo\FacturacionApi::esRuta($ruta)) \EnVivo\FacturacionApi::responder($ruta, $metodo);
```

En `api_plux_pago()`, los datos de la factura se revisan **antes de cobrar** y se guardan junto al comprador:

```php
        $comprador = Plux::comprador($in, Cuentas::porId($j));
        // Datos de la factura SRI (titular, otro/RUC o consumidor final): se revisan ANTES de cobrar (INTEGRAR_FACTURACION.md)
        $factura = class_exists(\EnVivo\Facturacion::class) ? \EnVivo\Facturacion::datosDePago($in, $comprador, $c, Cuentas::porId($j)) : null;
        $cuerpo = Plux::cuerpo($c, $comprador, $in);
    } catch (\RuntimeException $e) {
        pago_json(422, ['status' => 'failed', 'message' => $e->getMessage()] + ($e instanceof Fallo && is_string($e->extra['codigo'] ?? null) ? ['codigo' => $e->extra['codigo']] : []));
    }
    ...
    Compras::anotarComprador((int) $c['id'], $comprador);   // para la factura (sin datos de tarjeta)
    if ($factura !== null) \EnVivo\Facturacion::anotarDatos((int) $c['id'], $factura);   // lo que eligió para la factura SRI
```

El `catch` ahora pasa también el `codigo` cuando viene en un `Fallo`. Para Plux no cambia nada: sus errores son
`RuntimeException`.

`server/public/pago.php`: el bloque va antes de la casilla de términos, y el script antes de `pago.js`
(que pasa a `?v=2` para no usar la versión vieja del caché):

```php
<?= class_exists(\EnVivo\Facturacion::class) ? \EnVivo\Facturacion::htmlPago($c, $jug) : '' /* datos para la factura SRI (INTEGRAR_FACTURACION.md) */ ?>
<script src="/pago-assets/factura.js?v=1"></script>
<script src="/pago-assets/pago.js?v=2"></script>
```

`server/public/assets/pago.js`, en `preparar()`, después de revisar los términos, y en el cuerpo que se manda:

```js
    var factura = window.EnVivoFactura ? window.EnVivoFactura.leer(msg) : null;
    if (factura === false) return null;
    ...  simetricKeyCifrada: kc, factura: factura };
    ...  if (estado.factura) body.factura = estado.factura;
```

Si una página vieja quedó en caché y no manda `factura`, el servidor factura a nombre del titular.

`server/public/control/index.php`:

```php
foreach ([..., 'servidores', 'facturacion'] as $f) require __DIR__ . '/lib/' . $f . '.php';
        'facturacion' => cc_t_facturacion(),                                    // en el match de pestañas
            str_starts_with($accion, 'facturacion_') => cc_a_facturacion($accion, $q),   // en cc_post_accion
```

`server/public/control/lib/base.php`:

```php
    'servidores' => 'Servidores', 'facturacion' => 'Facturación',              // en CC_PESTANAS
        if (function_exists('cc_facturacion_insignia')) $o['facturacion'] = cc_facturacion_insignia();   // en cc_insignias
```

El CSV de la pestaña sale de `cc_t_facturacion()` con `?csv=1`, así que en `index.php` no hace falta otra línea.

`server/config.env.ejemplo`: las líneas `FACTURACION_*`. Todas van vacías salvo `FACTURACION_GOOGLE=1`.

`server/deploy/instalar.sh`: una línea en el cron de www-data, y el log en la lista de `touch` y `chown`:

```
*/5 * * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/facturacion.php >> /var/log/envivo-facturacion.log 2>&1
```

`server/deploy/ops/envivo.logrotate`: se agrega `/var/log/envivo-facturacion.log`.

`server/tests/correr.sh`: `facturacion` en el bucle de la sección 3c, y las 4 tablas en la lista de tablas.

## Para el coordinador

- Sumar `docs/traducciones/errores_nuevos/facturacion.json` a `docs/traducciones/errores.json` (`_codigos` y los 10 idiomas).
- Si otra rama también cambia la lista de pestañas o las líneas de arriba, se suman; ninguna reemplaza a otra.

## Pasos del dueño

1. `openssl rand -hex 32` y pegar el resultado en `FACTURACION_CLAVE=` de `/etc/envivo/config.env`. Poner **la misma**
   clave en el ERP. Después: `sudo systemctl reload php8.3-fpm`.
2. Opcional: `FACTURACION_WEBHOOK_URL=https://<erp>/...` y `FACTURACION_ALERTA_CMD=/usr/local/bin/alerta-telegram.sh`.
   No conviene usar `FACTURACION_IPS` si el juego está detrás del túnel, porque PHP ve 127.0.0.1.
3. Actualizar el servidor (`deploy/actualizar.sh` o `instalar.sh`). Las tablas se crean solas y queda el cron.
4. El programador del ERP sigue `docs/FACTURACION_SRI.md`: consulta `/pendientes` cada minuto, emite y confirma.
   Para probar la conexión usa `GET /api/facturacion/ping`.
5. Ver Centro de Control > Facturación: debe decir "Clave compartida: configurada" y mostrar el último contacto del ERP.
6. Lo vendido desde enero 2026 sin factura: `sudo -u www-data php /var/www/envivo/server/bin/facturacion.php --rellenar=2026-01-01`.
   Antes de emitirlo, hablar con el contador.
7. Consultar con el contador:
   - ¿Las compras de Google Play se facturan al jugador (consumidor final, como está ahora) o a Google?
     `FACTURACION_GOOGLE=0` las apaga.
   - ¿Qué hacer con los reembolsos de ventas a consumidor final? Desde 2026 no se permite nota de crédito; el juego las
     deja como `no_aplica` y avisa.
