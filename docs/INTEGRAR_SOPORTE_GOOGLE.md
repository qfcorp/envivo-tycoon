# Soporte y Google Play: lo que falta (parches para quien mantiene el servidor)

Las clases **canónicas** son `server/src/Soporte.php` y `server/src/Google.php` (con sus rutas ya puestas en `api.php`).
Este documento **no** propone clases nuevas: solo los cambios que les faltan, como parches exactos (texto viejo → texto nuevo)
o métodos completos para pegar. Revisado contra estas versiones (md5):

| Archivo | md5 |
|---|---|
| `server/src/Google.php` | `ae83f2f9fba2603120cffe74c02196ce` |
| `server/src/Soporte.php` | `cfe555202efc66ab60afa14f6c99ddcc` |
| `server/public/control/lib/soporte.php` | `e02e965c16ec7dfd4d7efbb8a7829c05` |

Pruebas: `php server/tests/pruebas_soporte_google.php` (base y configuración temporales, Google **falso**
`server/tests/google_falso.php` que verifica la firma RS256 del JWT con la llave pública, y el juego por HTTP con
`tests/router.php`). Hoy: **84 correctas, 0 fallas**, y al final lista cada punto de este documento como `PENDIENTE` o
`YA ESTÁ` (eso no cuenta como falla). Al aplicar un parche, su línea debe pasar a `YA ESTÁ` y las 84 deben seguir en verde.

Recordatorio del dueño: **el soporte es solo dentro del juego y por correo. Nunca WhatsApp.**

---

## 0. Lo que ya está bien (probado, no tocar)

- `GET/POST /api/soporte`, `/api/soporte/responder`, `/api/soporte/leido`, `GET /api/soporte/contacto` (solo `correo` y `horario`).
- `/api/estado` con `soporte_sin_leer` y `compras_recientes`.
- Límites (5 casos sin cerrar, 10 mensajes por hora), diagnóstico limpio (sin correo/tarjeta, máx. 4 KB), compra del mismo jugador.
- Una cuenta suspendida por reembolso **sí** puede abrir casos.
- `POST /api/google/verificar`: JWT RS256 con openssl, `purchases.products.get`, consume / acknowledge (`developerPayload EV-<id>`),
  idempotente por hash del comprobante y por orderId, orderId vacío de la TWA, 3 pedidos a la vez → una sola compra,
  segundo "una sola vez" pagado sin entregar (aviso), `avisosPendientes()`, errores con `codigo`.
- `revisarAnuladas()`: paginación, `type=0`, motivo 7 = contracargo, reversión + suspensión, aviso si la compra no existe.

---

## G1. Crear `server/bin/google_anulados.php` (lo nombran Google.php, instalar.sh y ANDROID_GOOGLE_PLAY.md, pero no existe)

```php
<?php
declare(strict_types=1);

// Revisión de Google Play (la programa deploy/instalar.sh en el cron de www-data, cada 6 horas):
//  - reintenta los avisos a Google (consume/acknowledge) que fallaron: si Google no los recibe en 3 días, devuelve el dinero;
//  - revisa las compras anuladas (reembolsos y contracargos; Google solo guarda 30 días) y las revierte.
// Se puede correr a mano:   sudo -u www-data php /var/www/envivo/server/bin/google_anulados.php

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Db, Google};

try {
    Db::pdo();
    if (!Google::configurado()) { echo date('Y-m-d H:i') . " google: sin configurar (nada que hacer)\n"; exit(0); }
    $avisadas = Google::avisosPendientes();
    [$revisadas, $revertidas] = Google::revisarAnuladas();
    echo date('Y-m-d H:i') . " google OK: $avisadas avisos reintentados, $revisadas anuladas revisadas, $revertidas revertidas\n";
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR en google_anulados: ' . $e->getMessage() . "\n");
    exit(1);
}
```

## G2. Programarlo en `server/deploy/instalar.sh` (junto a la tarea diaria, línea ~159)

Viejo:
```bash
( crontab -u www-data -l 2> /dev/null | grep -v "$APP/server/bin/tareas.php"; echo "$TAREA" ) | crontab -u www-data - && echo "   listo (cron de www-data)" || echo "   AVISO: no se pudo programar la tarea diaria (revisa: crontab -u www-data -l)"
```
Nuevo:
```bash
GOOGLE_TAREA="25 */6 * * * ENVIVO_CONFIG=$CONF php $APP/server/bin/google_anulados.php >> /var/log/envivo-tareas.log 2>&1"
( crontab -u www-data -l 2> /dev/null | grep -v "$APP/server/bin/tareas.php" | grep -v "$APP/server/bin/google_anulados.php"; echo "$TAREA"; echo "$GOOGLE_TAREA" ) | crontab -u www-data - && echo "   listo (cron de www-data)" || echo "   AVISO: no se pudo programar la tarea diaria (revisa: crontab -u www-data -l)"
```
(Cada 6 horas: un aviso fallido se reintenta varias veces antes de los 3 días, y la API de anuladas se usa ~4 veces por día,
muy por debajo de su cuota.)

## G3. `Google::avisar()`: "already acknowledged" también cuenta, y no tomar cualquier 400 como "ya consumido"

Hoy un 400 al **consumir** se da por bueno aunque sea otro error (por ejemplo, un comprobante mal escrito), y un 400
"already acknowledged" al **reconocer** nunca se marca, así que se reintenta para siempre.

Viejo:
```php
            [$c] = self::http('POST', self::urlProducto((string) $compra['producto'], (string) $compra['google_token'], $accion), $accion === ':acknowledge' ? ['developerPayload' => 'EV-' . $compra['id']] : null, null, self::token());
            // 2xx = listo. 400/409 al consumir suele ser "ya consumido" (la app también puede consumir): se da por avisado.
            if (($c >= 200 && $c < 300) || ($accion === ':consume' && in_array($c, [400, 409], true))) Db::q('UPDATE compras SET google_ack = ? WHERE id = ?', [time(), $compra['id']]);
```
Nuevo (usa `api()` de G7):
```php
            [$c, $j] = self::api('POST', self::urlProducto((string) $compra['producto'], (string) $compra['google_token'], $accion), $accion === ':acknowledge' ? ['developerPayload' => 'EV-' . $compra['id']] : null);
            // 2xx = listo. 400/409 "already consumed/acknowledged" (la app también puede avisar): ya está avisado.
            $ya = in_array($c, [400, 409], true) && preg_match('/already|consumed|acknowledged/i', (string) json_encode($j));
            if (($c >= 200 && $c < 300) || $ya) Db::q('UPDATE compras SET google_ack = ? WHERE id = ? AND google_ack IS NULL', [time(), $compra['id']]);
```

## G4. `revisarAnuladas()`: margen con el límite de 30 días, 1 hora de solape y sin el comprobante en el aviso

1. `startTime` exactamente "ahora − 30 días" puede llegar a Google unos segundos **más viejo** de lo permitido (400).
2. Seguir desde "la última + 1 ms" pierde una anulada que Google publique tarde con una hora anterior. Con 1 hora de solape
   no hay riesgo de revertir dos veces: `Compras::revertir()` no hace nada con una compra ya revertida.
3. El aviso guardaba el JSON completo, **con el purchaseToken** (en `compras` ya se guarda con hash): basta el orderId.

Viejo:
```php
        $desde = (int) (Ajustes::get('google_anulados_desde') ?: (string) ((time() - 30 * 86400) * 1000));
```
Nuevo:
```php
        $min = (time() - 30 * 86400 + 300) * 1000;   // Google no acepta más de 30 días atrás: 5 minutos de margen
        $guardado = Ajustes::get('google_anulados_desde');
        $desde = max($min, $guardado === '' ? $min : (int) $guardado - 3600 * 1000);   // 1 hora de solape (revertir es idempotente)
```
Viejo:
```php
                if (!$compra) { Db::aviso('google_anulada_sin_compra', 'Google anuló una compra que no está en el juego: ' . json_encode($v)); continue; }
```
Nuevo:
```php
                if (!$compra) {
                    $o = (string) ($v['orderId'] ?? '?');
                    if (!Db::valor("SELECT 1 FROM avisos WHERE tipo = 'google_anulada_sin_compra' AND detalle LIKE ?", ['%' . $o . '%'])) {
                        Db::aviso('google_anulada_sin_compra', 'Google anuló la orden ' . $o . ' (motivo ' . ($v['voidedReason'] ?? '?') . ') que no está en el juego.');
                    }
                    continue;
                }
```
Viejo:
```php
        Ajustes::set('google_anulados_desde', (string) ($hasta > $desde ? $hasta + 1 : $desde));
```
Nuevo:
```php
        Ajustes::set('google_anulados_desde', (string) max($hasta, (int) Ajustes::get('google_anulados_desde', '0')));
```

## G5. Compras de PRUEBA (cuentas de "Pruebas de licencias": Google no cobra)

Se entregan igual (así el dueño prueba), pero deben quedar marcadas para que no cuenten como ventas.
En `verificar()`, después de `if (isset($r['ya'])) return ...;`:
```php
        if ((int) ($g['purchaseType'] ?? -1) === 0) {
            Db::aviso('google_compra_prueba', 'La compra N° ' . $r['nueva']['id'] . ' es de PRUEBA (cuenta de pruebas de licencias de Google Play): Google no cobró.', (int) $r['nueva']['id']);
        }
```
(Opcional en el Centro de Control: excluir de los totales de ventas las compras con ese aviso.)

## G6. Abuso de reembolsos: un contracargo, o 2 reembolsos en 180 días → baneo

Hoy cada anulada revierte y **suspende**, pero quien pide reembolso una y otra vez nunca pasa de suspendido.
En `Google.php`:
```php
    /** Abuso de reembolsos (las reglas se cambian aquí). */
    public const ABUSO_REEMBOLSOS = 2;        // reembolsos en ABUSO_DIAS días -> baneo
    public const ABUSO_DIAS = 180;
    public const CONTRACARGO_BANEA = true;    // un contracargo (motivo 7) -> baneo directo

    /** Después de revertir: banea si ya es abuso. El dueño lo puede levantar en el Centro de Control. */
    private static function revisarAbuso(int $jugador, string $tipo): void
    {
        $n = (int) Db::valor("SELECT COUNT(*) FROM compras WHERE jugador_id = ? AND estado = 'revertido' AND revertida_en > ?", [$jugador, time() - self::ABUSO_DIAS * 86400]);
        if (!($tipo === 'contracargo' && self::CONTRACARGO_BANEA) && $n < self::ABUSO_REEMBOLSOS) return;
        if (Cuentas::estadoCuenta($jugador) === 'baneado') return;
        Cuentas::cambiarEstado($jugador, 'baneado', $tipo === 'contracargo' ? 'Contracargo en Google Play' : $n . ' reembolsos de Google Play en ' . self::ABUSO_DIAS . ' días', 'Google Play');
        Db::aviso('abuso_reembolsos', 'La cuenta ' . $jugador . ' quedó baneada: ' . ($tipo === 'contracargo' ? 'contracargo' : $n . ' reembolsos') . '.');
    }
```
Y en `revisarAnuladas()`, viejo:
```php
                if (Compras::revertir((int) $compra['id'], $tipo, 'Google Play anuló la compra (motivo ' . ($v['voidedReason'] ?? '?') . ')', 'Google Play')) $revertidas++;
```
Nuevo:
```php
                if (Compras::revertir((int) $compra['id'], $tipo, 'Google Play anuló la compra (motivo ' . ($v['voidedReason'] ?? '?') . ')', 'Google Play')) {
                    $revertidas++;
                    self::revisarAbuso((int) $compra['jugador_id'], $tipo);
                }
```
(Si se quiere lo mismo para los reembolsos de Plux, el mismo método puede ir al final de `Compras::revertir()`.)
Un baneado que vuelve a comprar en Google recibe `403 cuenta_baneada` y la compra **no** se avisa: Google devuelve el dinero
solo a los 3 días. La app debe mirar `cuenta_estado` de `/api/estado` y no abrir la ventana de pago si no es `activo`.

## G7. Token vencido o revocado: 401 → token nuevo y un reintento

Agregar en `Google.php`:
```php
    /** Pedido a la API con el token; si Google responde 401 (token vencido o revocado) pide otro y reintenta una vez. */
    private static function api(string $metodo, string $url, ?array $json = null): array
    {
        $r = self::http($metodo, $url, $json, null, self::token());
        if ($r[0] === 401) { self::$token = null; $r = self::http($metodo, $url, $json, null, self::token()); }
        return $r;
    }
```
y cambiar las 3 llamadas `self::http(..., null, null, self::token())` (líneas 109, 166 y 186) por `self::api($metodo, $url, $json)`:
- línea 109: `[$c, $g] = self::api('GET', self::urlProducto($producto, $purchaseToken));`
- línea 166: ver G3.
- línea 186: `[$c, $j] = self::api('GET', self::base() . 'androidpublisher/v3/applications/' . self::paquete() . '/purchases/voidedpurchases?' . http_build_query($q));`

## G8. No mandar el JWT firmado a la dirección que diga el .json

`token()` usa `token_uri` del archivo como destino y como `aud`. Si alguien cambia ese archivo, el servidor manda una
prueba firmada a otro lado. Usar la dirección fija de Google (y `GOOGLE_TOKEN_URL` solo para pruebas, como `GOOGLE_API_BASE`).

Viejo:
```php
        $uri = (string) ($sa['token_uri'] ?? 'https://oauth2.googleapis.com/token');
```
Nuevo:
```php
        $u = Config::get('GOOGLE_TOKEN_URL');   // SOLO PRUEBAS (Google falso); en el servidor va vacío
        $uri = $u !== '' && preg_match('#^https?://[^\s?#]+$#', $u) ? $u : 'https://oauth2.googleapis.com/token';
```
Y en `server/config.env.ejemplo`, junto a `; GOOGLE_API_BASE=`, agregar `; GOOGLE_TOKEN_URL=`.
(La prueba ya pone `GOOGLE_TOKEN_URL` en su configuración: sigue en verde antes y después del cambio.)

---

## S1. Respuestas rápidas editables (SOPORTE.md: "con respuestas rápidas editables")

Hoy el Centro de Control solo **muestra** las de `soporte_respuestas`; no se pueden crear, editar ni borrar.
Métodos para `Soporte.php` (sección Centro de Control):
```php
    public const MAX_TITULO_RAPIDA = 60;

    public static function respuestasRapidas(): array
    {
        return array_map(fn(array $r) => ['id' => (int) $r['id'], 'titulo' => $r['titulo'], 'texto' => $r['texto']],
            Db::todas('SELECT * FROM soporte_respuestas ORDER BY titulo COLLATE NOCASE, id'));
    }

    /** Crea ($id null) o edita una respuesta rápida. */
    public static function guardarRespuestaRapida(?int $id, string $titulo, string $texto, string $quien): array
    {
        $titulo = Social::limpiarTexto($titulo);
        $texto = trim(str_replace("\r\n", "\n", $texto));
        Fallo::si($titulo === '' || mb_strlen($titulo) > self::MAX_TITULO_RAPIDA, 'El título tiene de 1 a ' . self::MAX_TITULO_RAPIDA . ' caracteres.', 400, ['codigo' => 'titulo_invalido']);
        Fallo::si($texto === '' || mb_strlen($texto) > self::MAX_TEXTO, 'El texto tiene de 1 a ' . self::MAX_TEXTO . ' caracteres.', 400, ['codigo' => 'texto_invalido']);
        return Db::tx(function () use ($id, $titulo, $texto, $quien): array {
            if ($id === null) {
                Fallo::si((int) Db::valor('SELECT COUNT(*) FROM soporte_respuestas') >= 100, 'Ya hay 100 respuestas rápidas. Borra alguna.', 409, ['codigo' => 'maximo']);
                Db::q('INSERT INTO soporte_respuestas (titulo, texto, creado) VALUES (?, ?, ?)', [$titulo, $texto, time()]);
                $id = Db::ultimoId();
                Auditoria::anotar($quien, 'soporte_rapida_crear', 'Respuesta rápida N° ' . $id . ': ' . $titulo);
            } else {
                $antes = Db::fila('SELECT * FROM soporte_respuestas WHERE id = ?', [$id]);
                Fallo::si(!$antes, 'Esa respuesta rápida no existe.', 404, ['codigo' => 'respuesta_no_existe']);
                Db::q('UPDATE soporte_respuestas SET titulo = ?, texto = ? WHERE id = ?', [$titulo, $texto, $id]);
                Auditoria::anotar($quien, 'soporte_rapida_editar', 'Respuesta rápida N° ' . $id . ': "' . $antes['titulo'] . '" -> "' . $titulo . '"');
            }
            return ['id' => $id, 'titulo' => $titulo, 'texto' => $texto];
        });
    }

    public static function borrarRespuestaRapida(int $id, string $quien): void
    {
        $r = Db::fila('SELECT * FROM soporte_respuestas WHERE id = ?', [$id]);
        Fallo::si(!$r, 'Esa respuesta rápida no existe.', 404, ['codigo' => 'respuesta_no_existe']);
        Db::q('DELETE FROM soporte_respuestas WHERE id = ?', [$id]);
        Auditoria::anotar($quien, 'soporte_rapida_borrar', 'Respuesta rápida N° ' . $id . ': ' . $r['titulo']);
    }

    /** {nombre}, {caso} y {compra} de una respuesta rápida -> datos del caso (se usa antes de guardar la respuesta). */
    public static function plantilla(string $texto, int $caso): string
    {
        if (!str_contains($texto, '{')) return $texto;
        $c = Db::fila('SELECT c.id, c.compra_id, j.nombre FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id WHERE c.id = ?', [$caso]);
        return $c ? strtr($texto, ['{nombre}' => (string) $c['nombre'], '{caso}' => (string) $c['id'], '{compra}' => (string) ($c['compra_id'] ?? '')]) : $texto;
    }
```
En `public/control/lib/soporte.php`: un bloque "Respuestas rápidas" en la bandeja (lista con Editar / Borrar y un formulario
título + texto), y en `cc_a_soporte()` dos acciones más que llamen a esos métodos (`soporte_rapida_guardar` con
`id` opcional, `soporte_rapida_borrar` con `id`). En `soporte_responder`, pasar el texto por `Soporte::plantilla($txt, $id)`.

## S2. `codigo` estable también en los errores de soporte del Centro de Control

`api.php` ya rellena `codigo` (por ejemplo `no_encontrado`), pero `Soporte.php` lo deja vacío en 6 lugares. Cambiar:

| Línea | Viejo | Nuevo (agregar el 4.º argumento) |
|---|---|---|
| 109 (`casoDe`) | `Fallo::si(!$c, 'Ese caso no existe.', 404);` | `Fallo::si(!$c, 'Ese caso no existe.', 404, ['codigo' => 'caso_no_existe']);` |
| 141 | `... 'Escribe la respuesta (máximo 2000 caracteres).', 400);` | `..., 400, ['codigo' => $texto === '' ? 'vacio' : 'largo']);` |
| 144 | `Fallo::si(!$c, 'Ese caso no existe.', 404);` | `..., 404, ['codigo' => 'caso_no_existe']);` |
| 153 | `Fallo::si(!in_array($estado, ['abierto', 'cerrado'], true), 'Estado no válido.', 400);` | `..., 400, ['codigo' => 'estado_invalido']);` |
| 155 | `Fallo::si(!$c, 'Ese caso no existe.', 404);` | `..., 404, ['codigo' => 'caso_no_existe']);` |

(En `public/control/lib/soporte.php`, los `Fallo` de `cc_a_soporte()` también pueden llevar esos mismos códigos.)

## S3. Una sola forma de responder y una sola auditoría (recomendado)

`public/control/lib/soporte.php` repite la lógica de `Soporte::responderSoporte()` / `cambiarEstado()` con SQL propio y
anota en `control_auditoria`, mientras que `Soporte.php` anota en `auditoria`. Para que todo caso tenga un solo historial:
en `cc_a_soporte()`, `soporte_responder` → `Soporte::responderSoporte($id, Soporte::plantilla($txt, $id), $q, cc_post('cerrar') === '1')`,
`soporte_cerrar` / `soporte_reabrir` → `Soporte::cambiarEstado($id, 'cerrado'|'abierto', $q)`, y que `Soporte` anote con
`Control::auditar()` (o al revés: elegir una de las dos tablas).

## S4. La bandeja: primero los que esperan respuesta, y buscar (opcional, útil con muchos casos)

En `cc_t_soporte()`, agregar al `SELECT` la columna
`(SELECT autor FROM soporte_mensajes m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_autor` y ordenar con
`ORDER BY CASE WHEN c.estado <> 'cerrado' AND ultimo_autor = 'jugador' THEN 0 ELSE 1 END, c.actualizado DESC`.
Buscar (`?buscar=`): `(c.asunto LIKE ? ESCAPE '\' OR j.email LIKE ? ESCAPE '\' OR j.nombre LIKE ? ESCAPE '\' OR c.id = ?)` con
`%`, `_` y `\` escapados, y `#123` → `c.id = 123`.

## S5. Sin WhatsApp también en `dist/`

`dist/envivo-tycoon.html` y `dist/artifact.html` todavía dicen "¿Olvidaste tu contraseña? Escríbenos por WhatsApp y te
ayudamos." (son archivos generados: el código fuente ya no lo dice). Volver a generarlos con `node tools/build_single.js`.
El texto correcto es por "Ayuda y soporte" del juego o por el correo de `SOPORTE_CORREO`.

---

## Configuración (resumen)

| Clave en `/etc/envivo/config.env` | Para qué | En el servidor |
|---|---|---|
| `SOPORTE_CORREO` | Correo que muestra "Ayuda y soporte" (`GET /api/soporte/contacto`) | El correo de soporte (vacío hasta que exista) |
| `SOPORTE_HORARIO` | Horario de atención que se muestra | Ej. `Lunes a viernes 9:00-18:00` |
| `GOOGLE_PACKAGE_NAME` | Paquete de la app Android | `com.tukanec.envivo` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Ruta del .json de la cuenta de servicio | `/etc/envivo/google-play.json` (640, root:www-data) |
| `GOOGLE_API_BASE`, `GOOGLE_TOKEN_URL` | Solo pruebas (Google falso) | Vacíos o sin poner |

Pasos del dueño para Google Cloud / Play Console / el .json: `server/GOOGLE_PLAY.md`.

## Agregar la prueba a `server/tests/correr.sh` (opcional)

Después de la sección 3 (`pruebas.php`):
```bash
echo
echo "== 3b. Soporte y Google Play (pruebas_soporte_google.php, con Google falso)"
php "$SRV/tests/pruebas_soporte_google.php"
check "pruebas_soporte_google.php sin fallas" 0 "$?"
```
(Usa sus propios puertos libres y su propia carpeta temporal: no choca con los servidores de `correr.sh`.)
