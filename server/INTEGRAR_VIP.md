# VIP 1–10, regalos de asociación, Mecenas, ofertas escalonadas, ganchos y techo de ventajas: cómo conectarlo

Contrato común: `server/MONETIZACION.md` (§1 techo de ventajas, §2 ganchos). Este módulo **no toca ningún archivo
compartido**: todo lo de abajo son las líneas exactas para el integrador.

| Archivo | Qué es |
|---|---|
| `server/src/Ganchos.php` | Eventos del servidor (`en`, `emitir`, `hay`, `olvidar`). Cada oyente va aparte: SAVEPOINT si se emite dentro de `Db::tx`, su propia `Db::tx` si no. Un oyente que falla deja un aviso `gancho_fallo` y nunca rompe la compra |
| `server/src/Ventajas.php` | `Ventajas::bono($j, 'copa'\|'duelo')` → `{total, partes:[{clave, pts}], tope}` (sede 0..6 + estrella 0..6, total ≤ ajuste `ventajas_tope`, 12 por defecto, 0..24). Otros modos → 0. `Ventajas::poder($j)` → `{total, equipo, bono}` para sugerir rivales |
| `server/src/Vip.php` | Nivel VIP 1–10, tabla de ventajas, regalo mensual, preferencias, ofertas escalonadas, Mecenas, oyentes de compra |
| `server/src/Regalos.php` | Cofres de asociación ("Regalo de <alias>"): creación por compra, tope diario, reclamar, cancelar al revertir |
| `server/src/VipApi.php` | Rutas `/api/vip*` y `/api/mecenas`, y `VipApi::estado()` para `/api/estado` |
| `server/src/migraciones/vip.sql` | `vip_jugadores`, `vip_mensual`, `vip_regalos`, `vip_ofertas`, `vip_ofertas_compras` + índice `compras_vip_pagadas`. Se aplica sola (`Db::migrarModulos`) |
| `js/vip.js` | Tarjeta de Inicio (`window.EnVivoInicio`, orden 3), ventana VIP (avance, cofres, mes, ofertas, niveles, Mecenas, preferencias), cofre animado, `window.Vip.insignia(n)` para el chat, `Vip.fichaTienda()`. ES + 9 idiomas |
| `server/tests/pruebas_vip.php` · `tests/test_vip.js` | Pruebas PHP (base temporal, compras de verdad, HTTP con copia de api.php) y de navegador (390x844, capturas `tests/capturas/vip_*.png`) |

## Líneas para el integrador

### 1. `server/src/arranque.php` — al final (después de `date_default_timezone_set(...)`):
```php
Vip::registrar();   // VIP 1–10 y regalos de asociación: oyentes de compra_aprobada / compra_revertida / copa_ganada / sede_nivel (INTEGRAR_VIP.md)
```
(El archivo ya está en `namespace EnVivo`. Registrar dos veces no duplica oyentes.)

### 2. `server/src/Compras.php`
**a) `aprobar()`** — reemplazar la última línea `return $r[0];` por:
```php
        if ($r[0]) Ganchos::emitir('compra_aprobada', ['compra_id' => $compraId, 'jugador_id' => (int) $r[1]['jugador_id'], 'producto' => (string) $r[1]['producto'],
            'monto_usd' => (float) $r[1]['total'], 'canal' => ($r[1]['canal'] ?? '') === 'google_play' ? 'google' : 'plux']);
        return $r[0];
```
(Se emite DESPUÉS del commit: si un oyente falla, la compra igual queda pagada y entregada. Si `aprobar()` corre dentro de
otra transacción, `Ganchos` usa un SAVEPOINT por oyente.)

**b) `revertir()`** — cambiar `return Db::tx(function () use ($compraId, $tipo, $motivo, $quien): ?array {` por
`$res = Db::tx(function () use ($compraId, $tipo, $motivo, $quien): ?array {` y, después del `});` que cierra esa función, agregar:
```php
        if ($res !== null) Ganchos::emitir('compra_revertida', ['compra_id' => $compraId, 'jugador_id' => (int) (self::porId($compraId)['jugador_id'] ?? 0),
            'motivo' => $tipo . ($motivo !== '' ? ': ' . $motivo : '')]);
        return $res;
```

**c) `entregarCompra()`** — en el `match ($p['tipo'])` de `$lista`, agregar una línea (las ofertas VIP entregan su contenido fijo; sus créditos ya los da la línea de `$cred`):
```php
            'oferta' => $p['entregas'] ?? [],
```

**d) `exigirComprable()`** — al final de la función:
```php
        Vip::exigirOferta($jugador, $p);   // ofertas VIP: solo desbloqueadas, vigentes y sin llegar al tope (409 oferta_no_disponible)
```

### 3. `server/src/Catalogo.php`
**a)** Cerrar la constante de productos sumando las ofertas (cambia `];` del final de `PRODUCTOS` por):
```php
    ] + Vip::PRODUCTOS_OFERTA;   // ofertas escalonadas del VIP (contenido fijo a la vista; no salen en la tienda normal)
```
**b) `tienda()`** — la condición del primer `foreach` queda:
```php
            if (!$x['activo'] || !empty($x['oculto']) || !empty($x['oferta_vip'])) continue;
```
Productos (los define `Vip::PRODUCTOS_OFERTA`; precio, créditos y activo se pueden cambiar en el Centro de Control como cualquier producto):

| id | precio | créditos (paquete del mismo precio) | contenido extra fijo | se desbloquea con | tope | dura |
|---|---|---|---|---|---|---|
| `oferta_vip_s` | $1,99 | 300 (250) | $2.000 del juego, 5 cables | subir a VIP 1–3 | 1 | 72 h |
| `oferta_vip_m` | $4,99 | 900 (700) | $5.000, 5 cables, 5 baterías | subir a VIP 4–6 | 1 | 72 h |
| `oferta_vip_l` | $9,99 | 2.000 (1.500) | $12.000, 10 cables, 10 baterías, reparar todo | subir a VIP 7–10 | 2 | 72 h |
| `oferta_campeon` | $4,99 | 1.000 (700) | $8.000, 5 cables, 5 baterías, reparar todo | primera Copa ganada | 1 | 7 días |
| `oferta_sede_5` | $4,99 | 800 (700) | $10.000, 5 cables, 5 baterías | Sede oficial nivel 5 | 1 | 7 días |
| `oferta_sede_10` | $9,99 | 1.800 (1.500) | $25.000, 10 cables, 10 baterías, reparar todo | Sede oficial nivel 10 | 1 | 7 días |

Al subir de nivel solo se desbloquea la oferta del nivel nuevo (una por hito: `vip:N`, `copa`, `sede:5`, `sede:10`).
En Google Play hay que crear esos mismos ids como productos administrados.

### 4. `server/src/Monedero.php` — `mover()`, justo después del `INSERT INTO movimientos_creditos ...` (antes de `return $nuevo;`):
```php
            if ($cambio < 0 && !in_array($motivo, ['reversion', 'cuenta_borrada', 'manual'], true)) Ganchos::emitir('creditos_gastados', ['jugador_id' => $jugador, 'cantidad' => -$cambio, 'motivo' => $motivo, 'ref' => $ref]);
```
(Cubre todo gasto de créditos: tienda, mercado, festival, liga, duelos... Corre dentro de la transacción: SAVEPOINT por oyente.)

### 5. `server/public/api.php`
**a)** Una línea, justo ANTES de la línea de `LigaApi` (junto a las de los otros módulos):
```php
    if (\EnVivo\VipApi::esRuta($ruta)) \EnVivo\VipApi::responder($ruta, $metodo, requiere_sesion());
```
**b)** En la ruta `/estado`, sumar los campos nuevos (primer sumando dentro de `Http::json(200, ...`):
```php
        '/estado' => $soloGet() && Http::json(200, \EnVivo\VipApi::estado(Sesiones::jugadorId()) + \EnVivo\Universos::estado(Sesiones::jugadorId()) + ...
```
(Son exactamente las que inserta `pruebas_vip.php` en su copia de api.php. `/api/vip/bono` sigue siendo el bono del Pase VIP de 30 días.)

### 6. `server/src/Copas.php` (techo de ventajas §1 y +1 intento en VIP 3/6/9)
**a) Intentos de preparación por día** — en `iniciarIntento()` cambiar la línea del límite por:
```php
        $max = self::INTENTOS_DIA + Vip::intentosExtra($j);   // +1 en VIP 3, 6 y 9
        Fallo::si($n >= $max, 'Ya jugaste tus ' . $max . ' eventos de copa de hoy. Vuelve mañana.', 429, ['codigo' => 'limite_dia']);
```
y en `estado()` cambiar `'intentos_max' => self::INTENTOS_DIA,` por `'intentos_max' => self::INTENTOS_DIA + Vip::intentosExtra($j),`.
**b) Puntos de preparación con bono** — en `aplicar()`:
```php
            $puntos = $aTiempo ? self::puntosIntento($cal, $est) + Ventajas::bono((int) $i['jugador_id'], 'copa')['total'] : 0;
```
**c) Bono por equipo en los cruces** — en `plantel()`, dentro del `$o[] = [...]`, agregar:
```php
                    'bono' => Ventajas::bono((int) $f['jugador_id'], 'copa')['total'],
```
y en `server/eventos/batalla.js`: en `plantel()` → `reales.push({ eq, poder: poder(eq), i, bono: Math.max(0, Math.min(12, Math.floor(Number(x.bono) || 0))) });`
y `reales.push({ eq: null, poder: null, i: null, bono: 0 });`; en `cruce()`, después de `const b = lado(s, contrato, B[n].eq, ctx);`:
```js
    a.calidad = Math.min(100, a.calidad + (A[n].bono || 0)); b.calidad = Math.min(100, b.calidad + (B[n].bono || 0));
```

### 7. `server/src/Duelos.php` (techo §1 y emparejamiento por poder parecido)
**a)** En `cerrar()`, después de `$cd = (int) $d['calidad_defensor'];`:
```php
            if ($calidad !== null) $calidad = min(100, $calidad + Ventajas::bono($rj, 'duelo')['total']);
            $cd = min(100, $cd + Ventajas::bono($dj, 'duelo')['total']);
```
**b)** En la lista de rivales, después del `Db::todas(...)` de `$rivales` (antes de `$dia = Monedero::diaLocal();`):
```php
        $miPoder = Ventajas::poder($j)['total'];
        $clave = fn($f) => [intdiv(abs((int) $f['rt'] - (int) $mio['rating']), 50), abs(Ventajas::poder((int) $f['id'])['total'] - $miPoder)];
        usort($rivales, fn($a, $b) => $clave($a) <=> $clave($b));   // mismo tramo de puntaje primero, y dentro, poder parecido
```

### 8. `server/src/Chat.php` (insignia VIP en el chat)
En `leer()` (variable `$base`) y en `escribir()` (el `SELECT m.*, ...` del final), agregar `, COALESCE(vj.nivel, 0) AS vip_nivel` a la lista
de columnas y `LEFT JOIN vip_jugadores vj ON vj.jugador_id = m.jugador_id` junto a los otros `LEFT JOIN`. En `mensajeJson()`,
después de `'vip' => $vip,`:
```php
                'vip_nivel' => (int) ($m['vip_nivel'] ?? 0),
```
`js/chat.js` (línea del nombre, `.quien`): después de `${m.vip ? ' ⭐' : ''}` agregar
```js
${window.Vip && m.vip_nivel ? ' ' + window.Vip.insignia(m.vip_nivel) : ''}
```

### 9. `server/src/Cuentas.php` — `borrar()`, dentro de la transacción (antes del `UPDATE jugadores SET email = ...`):
```php
            Db::q('DELETE FROM vip_regalos WHERE receptor_id = ?', [$jugador]);
            Db::q('UPDATE vip_regalos SET de_nombre = NULL WHERE comprador_id = ?', [$jugador]);   // su nombre ya no sale en cofres ajenos
            Db::q('UPDATE vip_jugadores SET ocultar_mecenas = 1 WHERE jugador_id = ?', [$jugador]);
```

### 10. Juego
- `index.html`: `<script defer src="js/vip.js"></script>` después de `js/servidores.js`.
- `sw.js`: `'./js/vip.js', // Nivel VIP 1–10, regalos de asociación y Mecenas` en la lista de archivos (sube la versión de la caché).
- `js/ui.js` (Tienda, opcional): en `renderTienda()`, después de `<div class="sectitle">${T('tienda.tu_cuenta')}</div>${cuenta}` agregar
  `${log && window.Vip ? window.Vip.fichaTienda() : ''}` (ficha corta con el nivel y la oferta vigente; su botón abre la ventana VIP).
- Las ofertas de la ventana VIP usan `data-act="comprar" data-k="<producto>"`: las compra el `comprar()` de ui.js (Pago Plux o Google Play).

### 11. `server/tests/correr.sh` — sumar `vip` a la lista de suites de la sección 3c:
```bash
for suite in discord festival liga control control_servidores duelos_desafio universos copas fusiones demo_datos vip; do
```
Y en la lista `for t in actividad ajustes ...` de tablas esperadas se pueden sumar `vip_jugadores vip_mensual vip_regalos vip_ofertas`.

### 12. Para los otros ayudantes (si existen sus clases)
- **Sede oficial**: `SedeOficial::bonoCompetencia($j): int` (0..6) lo lee `Ventajas`. Espacios de obra a la vez: `Vip::slotsObra($j)` (2 desde VIP 4).
  Para la oferta de Sede 5/10: exponer `SedeOficial::nivel($j): int` (Vip lo revisa al abrir `/api/vip`) o emitir
  `Ganchos::emitir('sede_nivel', ['jugador_id' => $j, 'nivel' => $n])` al subir de nivel.
- **Personal estrella**: `Estrellas::bonoCompetencia($j, $modo): int` (0..6).
- **Copa**: la oferta del campeón se desbloquea sola al ver `copa_premios.clave = 'campeon'`; opcional `Ganchos::emitir('copa_ganada', ['jugador_id' => $j, 'copa_id' => $c])`.
- **Pase de temporada**: puede escuchar `creditos_gastados` / `compra_aprobada` con `Ganchos::en(...)` desde su `registrar()`.

### 13. `server/API.md` — en la tabla de endpoints nuevos:
`GET /api/vip`, `/api/vip/regalo/reclamar {id}`, `/api/vip/mensual`, GET `/api/mecenas`, `/api/vip/ajustes {anonimo, ocultar_mecenas}` → `INTEGRAR_VIP.md`;
y en "campos nuevos de /api/estado": `vip_nivel` (0..10, nivel VIP para siempre; distinto de `vip_activo` del Pase) y `regalos_pendientes` (cofres por abrir).

## Ajustes (tabla `ajustes`, se cambian en el Centro de Control)
| clave | por defecto | qué es |
|---|---|---|
| `vip_umbrales` | `1,5,15,30,50,100,200,350,600,1000` | dólares acumulados para VIP 1..10 (10 valores crecientes; si está mal escrito se usan los de por defecto). Subirlos no le baja el nivel a nadie |
| `vip_excluir` | `transferencia_cuenta` | productos que no suman al VIP, a Mecenas ni dan cofres |
| `vip_regalos_dia` | `5` | cofres nuevos que puede recibir cada miembro por día (lo que pase no se crea) |
| `vip_regalo_dias` | `7` | días para abrir un cofre |
| `ventajas_tope` | `12` | techo del bono pagado en Copa y Duelos (0..24) |

## Reglas
- **Nivel**: dólares (total con IVA) de compras `pagado` (Plux y Google Play); `$1 = 10 puntos VIP` en pantalla. Se guarda el
  máximo alcanzado en `vip_jugadores`; solo baja cuando hay una compra revertida nueva (`revisado` = cuántas revertidas ya se
  vieron), al nivel de lo que sigue pagado (queda en `auditoria`, acción `vip_baja`). Sin el gancho igual se pone al día al leerlo.
  Al subir: la oferta del nivel (sin mensaje en el canal del sistema: no tapa los avisos de moderación). Es aparte del Pase VIP de 30 días (`vip_hasta`).
- **Ventajas por nivel**: insignia (Bronce, Plata, Oro, Jade, Zafiro, Amatista, Rubí, Fuego, Diamante, Leyenda; brillo desde 7),
  color de marco, título cosmético, +1 intento diario de preparación en VIP 3, 6 y 9 (`intentosExtra` 0..3), 2.º espacio de obra
  desde VIP 4 (`slotsObra`), regalo mensual fijo por nivel (`Vip::MENSUAL`, dinero del juego, repuestos y reparación; sin créditos).
- **Cofres de asociación**: con cada compra aprobada (menos las excluidas), CADA miembro de la asociación del comprador (también
  él) recibe un cofre de tamaño 1..5 según el monto ($0 / $2 / $5 / $10 / $20): $250..$2.500 del juego y 1..5 cables/baterías
  (`Regalos::COFRES`). Nunca créditos ni equipos (al reclamar solo se entregan `dinero`, `consumible`, `reparar_todo`).
  Anónimo si el comprador lo pide. Aviso en el chat de la asociación. Un cofre por compra y miembro (UNIQUE). Vence a los 7 días.
  Compra revertida → los cofres sin abrir de esa compra quedan `cancelado` (los abiertos no se pueden quitar).
- **Mecenas**: por servidor, semana (lunes 00:00, hora del juego) y siempre; orden por dólares aprobados, pero la respuesta solo
  trae `posicion, nombre, nivel, insignia, yo` (nunca montos). Sin cuentas baneadas/suspendidas ni quien eligió `ocultar_mecenas`.
- **Ganchos**: los oyentes NUNCA rompen la compra; los fallos quedan en `avisos` (`gancho_fallo`).

## Rutas
| ruta | cuerpo | respuesta |
|---|---|---|
| GET `/api/vip` | — | `{nivel, insignia, progreso:{puntos, siguiente, siguiente_puntos, faltan, pct}, intentos_extra, slots_obra, niveles[10], mensual:{disponible, reclamado, contenido, proximo}, regalos[], regalos_tope_dia, ofertas[], ajustes:{anonimo, ocultar_mecenas}, pase_vip_activo}` |
| POST `/api/vip/regalo/reclamar` | `{id}` | `{regalo, entregas, pendientes}`; 404 `regalo_no_existe`, 409 `ya_reclamado`, 410 `regalo_vencido` / `regalo_cancelado` |
| POST `/api/vip/mensual` | — | `{entregas, mensual}`; 403 `vip_requerido`, 409 `ya_reclamado` |
| GET `/api/mecenas` | — | `{servidor, oculto, semana:{inicio, fin}, lista_semana[], lista_siempre[], yo:{semana, siempre}}` (top 20) |
| POST `/api/vip/ajustes` | `{anonimo?: bool, ocultar_mecenas?: bool}` | `{ajustes}`; 400 `datos_invalidos` |
Todas con sesión (401 `sesion_requerida`), POST con `X-Envivo: 1` (403), 60 POST cada 10 min por jugador (429).
