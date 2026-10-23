# API del servidor de EN VIVO Tycoon

Mismo dominio que el juego (`https://juego.tukanec.com`). Todo es JSON. La sesión va en una cookie
`envivo_s` (HttpOnly, Secure, SameSite=Lax). Toda petición POST de la API debe traer la cabecera
`X-Envivo: 1` (protección CSRF simple junto con SameSite); si falta → 403.
Errores: `{ "ok": false, "error": "texto para el jugador" }` con código HTTP 4xx/5xx.

## Estado del jugador
`GET /api/estado` →
```json
{
  "ok": true,
  "logueado": true,
  "jugador": { "id": 7, "email": "a@b.com", "nombre": "Dimitry" },
  "creditos": 250,
  "vip_hasta": "2026-11-22T10:00:00-05:00",   // null si nunca compró
  "vip_activo": true,
  "vip_bono_hoy": false,                        // true si ya reclamó el bono VIP de hoy
  "inicio_comprado": false,
  "entregas": [ { "id": 31, "tipo": "item", "item": "dron4k", "cantidad": 1, "creado": "..." } ],
  "tienda": {
    "productos": [ { "id": "creditos_250", "nombre": "...", "detalle": "...", "precio": 1.99, "creditos": 250, "una_vez": false } ],
    "premium":   [ { "id": "dron4k", "nombre": "...", "detalle": "...", "creditos": 450 } ]
  },
  "plux": { "disponible": true, "ambiente": "sandbox" }
}
```
Sin sesión: `logueado:false`, `creditos:0`, `entregas:[]`, el resto igual (la tienda siempre viene).

`entregas` = TODAS las entregas del jugador (historial). El juego aplica cada `id` una sola vez y guarda
los ids aplicados dentro de su partida (`s.premium.aplicadas`).

### Tipos de entrega
| tipo | item | cantidad | Qué hace el juego |
|---|---|---|---|
| `item` | clave de equipo (`cam_pro`, `dron4k`, `grua`, `unidad_movil`, `generador`) | 1 | Agrega el equipo a la bodega |
| `consumible` | `cable` / `battery` | n | Suma repuestos |
| `personal` | rol (`cam`, `dir`, `audio`, `stream`) | habilidad (3 o 4) | Contrata gratis a una persona con esa habilidad |
| `dinero` | `-` | monto | Suma dinero del juego |
| `reparar_todo` | `-` | 1 | Repara todos los equipos al 100% |

## Cuenta
- `POST /api/registro` `{ "email", "nombre", "clave" }` → mismo JSON que `/api/estado` (ya con sesión).
  Clave mínimo 8 caracteres. Email único.
- `POST /api/entrar` `{ "email", "clave" }` → estado. Límite de intentos por IP y por email.
- `POST /api/salir` → `{ "ok": true }`

## Partida en la nube (requiere sesión) — con versión y un solo dispositivo activo (`src/Partidas.php`)
Una partida por cuenta. Cada guardado sube `rev` en 1. `dispositivo` es un código al azar de la pestaña (8–64 de
`A-Z a-z 0-9 - _`; el juego crea uno nuevo cada vez que se abre). Solo el dispositivo activo de la cuenta puede guardar:
así una pestaña vieja (la computadora que quedó abierta mientras se jugaba en el celular) nunca pisa avance más nuevo.
`nube` / meta = `{ "hay": bool, "rev": n, "actualizado": "ISO"|null, "guardo": "<dispositivo>"|null, "activo": { "dispositivo", "desde": "ISO" }|null }`
(+ `"eres_activo": bool` si se pidió con `dispositivo`).
- `GET /api/partida` → `{ "ok": true, "datos": "<texto JSON>" | null, ...meta }`
- `GET /api/partida/meta?dispositivo=<código>` → `{ "ok": true, ...meta, "eres_activo" }` (sin los datos; el juego la mira al
  volver a la pestaña, al volver internet y cada minuto mientras se ve).
- `POST /api/partida/activar` `{ "base": n, "dispositivo" }` → `{ "ok": true, ...meta }`: este dispositivo pasa a ser el activo
  (al abrir el juego o al elegir "Usar la partida más nueva"). Solo si `base` = `rev` de la nube; si no → 409 `partida_desactualizada`.
- `POST /api/partida` `{ "datos": "<texto JSON>", "base": n, "dispositivo", "tomar"?: true }` (máx. 300 KB) → `{ "ok": true, "actualizado": "ISO", "rev": n+1 }`
  - `base` ≠ `rev` de la nube (otro dispositivo guardó) → 409 `partida_desactualizada` con `nube` (no se guarda nada).
  - Hay otro dispositivo activo → 409 `otro_dispositivo` con `nube`, salvo `"tomar": true` (el jugador eligió quedarse con la
    partida de este aparato después de ver las dos; igual exige `base` al día).
  - `base` o `dispositivo` no válidos → 400 `partida_invalida`.
  - Juego viejo (sin `base`, en la caché de algún celular): se acepta solo mientras la cuenta nunca usó el juego con versión
    (la partida no tiene `dispositivo` y no hay activo); si no → 409 `partida_desactualizada` (y queda anotado en el registro
    de PHP como "EN VIVO partida: juego viejo sin versión rechazado"). Aceptarlo siempre volvería a abrir el error.

## Gastar créditos (requiere sesión)
`POST /api/gastar` `{ "item": "dron4k" }` → `{ "ok": true, "creditos": 120, "entrega": { ...entrega creada... } }`
Sin créditos suficientes → 402 con error.

## Bono VIP diario (requiere sesión y VIP activo)
`POST /api/vip/bono` → `{ "ok": true, "creditos": 260, "entrega": { "tipo": "dinero", "cantidad": 150, ... } }`
Una vez por día (zona America/Guayaquil). Da $150 del juego (entrega) + 10 créditos.

## Comprar con dinero real (requiere sesión)
1. `POST /api/orden` `{ "producto": "creditos_700" }` → `{ "ok": true, "url": "/pago.php?o=<token>" }`
   (el paquete de inicio solo se puede comprar una vez; si Plux no está configurado → 503).
2. El juego abre esa `url` (misma pestaña). La página muestra el producto, el valor fijo con IVA y el
   formulario de tarjeta. La tarjeta se cifra en el navegador (igual que TuPass) y va a
   `POST /api/plux/pago`.
3. Si el banco pide validación 3DS vuelve a `GET /api/plux/3ds` (sin parámetros propios).
4. Al aprobarse: se entregan los créditos / el paquete / el VIP y se redirige a `/?compra=ok`.
   Si falla vuelve a la página de pago con el mensaje.

## Catálogo inicial (precios finales con IVA 15 % incluido; editable en `server/src/Catalogo.php`)
| id | Qué es | Precio |
|---|---|---|
| `creditos_250` | 250 créditos | $1,99 |
| `creditos_700` | 700 créditos (+40 % extra) | $4,99 |
| `creditos_1500` | 1.500 créditos (+50 % extra) | $9,99 |
| `creditos_3200` | 3.200 créditos (+60 % extra) | $19,99 |
| `inicio` | Paquete de inicio (una sola vez): cámara profesional, 5 cables, 3 baterías, técnico de streaming nivel 3 y 200 créditos | $2,99 |
| `vip30` | Pase VIP 30 días (no se renueva solo): bono diario de $150 + 10 créditos, reparaciones 30 % más baratas, 1 oferta extra al día, distintivo VIP | $4,99 |

Exclusivos con créditos (nombres de js/datos.js; costo editable en el Centro de Control):
| id | Qué es | Créditos |
|---|---|---|
| `generador` | Kummins 22 kVA diésel insonorizado | 250 |
| `kit_reparacion` | Kit de reparación total (todo al 100 %) | 60 |
| `caja_chica` | $1.000 para tu productora | 120 |
| `estrella` | Camarógrafo estrella nivel 4 (gratis, sin pago inicial) | 300 |
| `dron4k` | DGI Inspira 3X Cine (dron) Exclusivo | 450 |
| `grua` | Grúa telescópica de 12 m con cabeza remota | 650 |
| `unidad_movil` | Sprinto OB equipada (4 a 6 cámaras) | 900 |
| `vip_cam8k`, `vip_switcher`, `vip_satelital` | Equipos VIP (solo con VIP activo) | 800, 1000, 700 |
| `ex_*` (14) | Edición Exclusiva: un equipo top por categoría (lentes, soportes, repeticiones, gráficos, monitor, audio, micrófonos, intercom, encoder, internet, video inalámbrico, fibra, lluvia, maletas). Ver MONETIZACION.md §5 | 100 a 950 |

---

# Agregados (lo de arriba sigue valiendo; esto se SUMA)

## Errores: campo `codigo`
Todo error trae además `"codigo"`: un texto fijo para el juego (el `error` es para mostrar y puede cambiar).
`{ "ok": false, "error": "Tu cuenta está suspendida…", "codigo": "cuenta_suspendida" }`.
Si no hay uno propio, sale del código HTTP (`sesion_requerida` 401, `sin_creditos` 402, `prohibido` 403, `no_encontrado` 404,
`conflicto` 409, `limite_intentos` 429, `no_disponible` 503…). Propios, por ejemplo: `producto_inactivo`, `mantenimiento`,
`cuenta_suspendida`, `cuenta_baneada`, `email_en_uso`, `credenciales_invalidas`, `compra_ajena`, `pago_en_proceso`,
`ya_reclamado`, `google_pendiente`, `google_otra_cuenta`. nginx
responde `429` en JSON (`ok:false`, `error`, `Retry-After: 60`) si una IP abusa de `POST /api/entrar`, `/api/registro`,
`/api/plux/pago` o `/api/chat`.

## `/api/estado`: campos nuevos
Los devuelven también `registro`, `entrar`, `cuenta/transferir/confirmar` y `google/verificar`.
| campo | qué es | detalle en |
|---|---|---|
| `inventario`, `mercado`, `creditos_retenidos` | equipos del servidor y mercado; créditos de ventas aún retenidos (7 días) | `MERCADO.md` |
| `servidor`, `asociacion`, `perfil` | servidor, asociación, alias/fama/sanción del chat | `SOCIAL.md` |
| `tarjeta_hasta`, `tarjeta_activa`, `tarjeta_reclamada_hoy` | Tarjeta mensual (20 créditos por día por 30 días) | abajo |
| `cuenta_estado`, `aviso` | `activo` / `suspendido` / `baneado` y el mensaje para el jugador (con el correo de soporte) | abajo |
| `soporte_sin_leer`, `compras_recientes` | respuestas de soporte sin leer; compras para elegir en un caso | `SOPORTE.md` |
| `transferencia` | transferencia de cuenta en curso o `null` | abajo |
| `anuncio`, `mantenimiento` | anuncio del sistema `{id, texto, tipo, hasta}` o `null`; `{activo, mensaje}` | Centro de Control |
| `duelos`, `desafio` | `{rating, liga, restantes, tiene_equipo, defensas_nuevas, en_curso}` y `{dia, modificador, nombre, icono, restantes, jugado_hoy, pases_prensa}`; `null` sin sesión | `INTEGRAR_DUELOS_DESAFIO.md` |
| `discord_vinculado`, `discord_invitacion` | bot de Discord | `INTEGRAR_DISCORD.md` |
| `universo` | `{id, nombre}` del universo del servidor del jugador (`null` sin sesión). Con sesión, `/api/estado` además anota el día jugado (`actividad_diaria`) | `COPAS.md` §1, `INTEGRAR_UNIVERSOS.md` |
| `aviso_fusion` | `null`, o el aviso de que su servidor se unió a otro (14 días, hasta cerrarlo con `/api/servidor/aviso-visto`) | `INTEGRAR_FUSIONES.md` |
| `vip_nivel`, `regalos_pendientes` | nivel VIP para siempre (0..10; distinto de `vip_activo` del Pase VIP de 30 días) y cofres de asociación por abrir. `0` sin sesión o sin el módulo | `INTEGRAR_VIP.md` |
| `pase` | `{temporada: {numero, nombre, icono, fin} \| null, nivel, premium, por_reclamar}` del Pase de Temporada; `null` sin sesión o sin el módulo | `INTEGRAR_PASE.md` |
| `sede_oficial` | `{nivel, bono}` (nivel oficial y bono de competencia 0..6); `null` sin sesión o sin el módulo | `INTEGRAR_SEDE_OFICIAL.md` |

Las 4 claves de monetización salen SIEMPRE (lo arma `Cuentas::estado`, así llegan en `/api/estado` y en todas las respuestas
con el estado completo); un módulo que falla nunca rompe `/api/estado`.

`creditos` es el saldo real (`creditos - deuda`): puede ser NEGATIVO después de un reembolso o contracargo.
`tienda.premium[]` trae `tipo` (`equipo`, `vip`, `consumo`, `refuerzo`) y `vip`; un exclusivo apagado en el Centro de
Control no sale, y su costo puede cambiar desde ahí (siempre usar el `creditos` que manda el servidor).

## Endpoints nuevos (todos POST con `X-Envivo: 1`, salvo que diga GET)
| ruta | cuerpo | respuesta |
|---|---|---|
| `/api/tarjeta/reclamar` | — | `{creditos, recibidos: 20, tarjeta_reclamada_hoy: true}`; 403 `tarjeta_requerida`, 409 `ya_reclamado` |
| `/api/cuenta/borrar` | `{confirmar: "BORRAR", clave}` | `{borrada: true}`; anonimiza la cuenta, conserva las compras (SRI). Página pública: `/borrar-cuenta.html` |
| `/api/cuenta/transferir/iniciar` | `{email_nuevo}` | crea la orden de `transferencia_cuenta` ($9,99) para pagar con `/pago.php` |
| `/api/cuenta/transferir/confirmar` | `{email, codigo, clave, nombre}` | el nuevo dueño entra con sesión (estado completo) |
| `/api/cuenta/transferir/cancelar` | — | cancela la pendiente |
| `/api/google/verificar` | `{producto, purchaseToken, orderId?}` | `{nueva, compra:{id, producto, estado, canal}}` + estado. `orderId` opcional (TWA): se toma de Google; un token se acepta una sola vez (409 si es de otra cuenta). Ver `GOOGLE_PLAY.md` |
| `/api/mercado/*`, `/api/perfil`, `/api/asociaciones/*`, `/api/chat*` | | `MERCADO.md`, `SOCIAL.md` |
| `/api/soporte` (GET y POST), `/api/soporte/responder`, `/api/soporte/leido`, GET `/api/soporte/contacto` | | `SOPORTE.md` (solo dentro del juego y por correo) |
| `/api/discord/codigo`, `/api/discord/desvincular` | — | `INTEGRAR_DISCORD.md` |
| GET `/api/festival`, `/api/festival/intento/iniciar`, `/api/festival/intento/enviar`, `/api/festival/pases/comprar` | | `INTEGRAR_FESTIVAL.md` |
| `/api/liga`, `/api/liga/tomar`, `/abandonar`, `/descartar`, `/intento`, `/completar`, `/tienda` | | `INTEGRAR_LIGA.md` |
| `/api/duelos*`, `/api/desafio*` | | `INTEGRAR_DUELOS_DESAFIO.md` |
| GET `/api/copa`, `/api/copa/equipo`, `/api/copa/intento/iniciar`, `/api/copa/intento/enviar` | | `COPAS.md` §2, `INTEGRAR_COPAS.md` |
| GET `/api/servidor/opciones`, `/api/servidor/trasladar`, `/api/servidor/aviso-visto` | | `COPAS.md` §3, `INTEGRAR_FUSIONES.md` |
| GET `/api/vip`, `/api/vip/regalo/reclamar {id}`, `/api/vip/mensual`, GET `/api/mecenas`, `/api/vip/ajustes {anonimo?, ocultar_mecenas?}` | | `INTEGRAR_VIP.md` |
| GET `/api/pase`, `/api/pase/reclamar {nivel, pista, temporada?}`, `/api/pase/reclamar_todo`, `/api/pase/saltar {niveles}` | | `INTEGRAR_PASE.md` |
| GET `/api/sede`, `/api/sede/mejorar`, `/subir`, `/cofre`, `/acelerar`, `/ayudar`, GET `/ayudas`, `/migrar` | | `INTEGRAR_SEDE_OFICIAL.md` |
| GET `/api/estrellas`, `/api/estrellas/contratar`, `/api/estrellas/asignar`, `/api/pase_copa/comprar` | | `INTEGRAR_ESTRELLAS.md` |

Las rutas de monetización solo responden si su módulo está instalado (si no, 404 como cualquier ruta que no existe).

## Monetización (server/MONETIZACION.md)
- **Ganchos** (`src/Ganchos.php`): `Compras::aprobar` emite `compra_aprobada {compra_id, jugador_id, producto, monto_usd,
  canal: 'plux'|'google'}` (dentro de su transacción, cada oyente en un SAVEPOINT; no se emite si no se entregó nada: producto
  desconocido o "una sola vez" pagado dos veces); `Compras::revertir` emite `compra_revertida {compra_id, jugador_id, motivo:
  'reembolso'|'contracargo', detalle, producto}`; `Monedero::mover` emite `creditos_gastados {jugador_id, cantidad, motivo, ref}`
  en cada débito que no es reversión, ajuste del Centro de Control ni cuenta borrada. Un oyente que falla nunca rompe la compra
  (queda un aviso `gancho_fallo`). Los módulos se registran en `src/arranque.php` (una línea cada uno, solo si están).
- **Techo de ventaja pagada** (`Ventajas::bono`, +12 por defecto): Copa = puntos de preparación (calidad + bono + estrellas extra)
  y `bono` por equipo en cada cruce (lo suma `server/eventos/batalla.js` a la calidad ya validada, 0..12, recortado con
  `Estrellas::bonoFinal`); Duelos = bono del retador y del fantasma fijado al retar (`bono_mio`/`bono_rival` en cada duelo cerrado).
  Liga, Festival y Desafío: sin bono.
- **Copa: intentos por día** = 10 + Pase de Copa (+5) + VIP 3/6/9 (+1 cada uno), nunca más de 18 (`intentos_max`; 429 `limite_dia` con `max`).
- **Pase de temporada / Sede oficial**: cada intento validado de Liga, Festival, Copa, Duelos y Desafío suma XP
  (`Pase::sumarXp`) y materiales (`SedeOficial::premioIntento`), idempotente por intento.

**Pases de Prensa: UN solo saldo.** Los que da el Desafío del Día y los del Mega Festival (diarios, VIP, misiones, compra)
son el mismo saldo: libro `festival_pases` (idempotente por `ref`, tope 10; lo que pase del tope no se suma).
`Desafio::pases/sumarPases/gastarPases` escriben ahí; `desafio.pases_prensa` y el `pases` del festival dan lo mismo.

## Catálogo actual (reemplaza la tabla de arriba; se puede cambiar precio/créditos/activo en el Centro de Control)
`creditos_250` $1,99 · `creditos_700` $4,99 · `creditos_1500` $9,99 · `creditos_3200` $19,99 · `bienvenida` $0,99 (una vez:
150 créditos + camarógrafo senior por 3 eventos + 3 cables) · `inicio` $2,99 (una vez) · `tarjeta_mensual` $4,99 (30 días,
20 créditos/día; otra compra suma días) · `vip30` $9,99 · `transferencia_cuenta` $9,99 (no sale en la tienda).
Monetización (los mismos ids en Google Play; cada uno lleva `modulo` y queda apagado y oculto mientras su módulo no esté):
`pase_premium` $4,99 y `pase_premium_plus` $9,99 (pase de temporada; pantalla propia, no salen en la lista general) ·
`pack_obra_s` $1,99 / `pack_obra_m` $4,99 / `pack_obra_l` $9,99 (Sede oficial: aceleradores de obra + materiales, contenido
fijo) · `pase_copa` $2,99 (+5 eventos de preparación por día en la copa de esa semana; también por 300 créditos en
`/api/pase_copa/comprar`; pantalla propia) · ofertas escalonadas del VIP `oferta_vip_s` $1,99, `oferta_vip_m` $4,99,
`oferta_vip_l` $9,99, `oferta_campeon` $4,99, `oferta_sede_5` $4,99, `oferta_sede_10` $9,99 (contenido fijo, solo en la ficha
VIP de quien la desbloqueó, con tope). El personal estrella (`estrella_copa`) es solo por créditos (`/api/estrellas/contratar`).
Las ofertas por tiempo (`oferta: {bono_pct, fin, creditos_extra}`) suman % de créditos; lo pagado con oferta se entrega
aunque la oferta termine. Refuerzos y equipos VIP: `MERCADO.md` y `Catalogo::PREMIUM`. Roles, equipos y tipos de evento que revisa el servidor
(Festival, Liga) salen de `js/datos.js` en `src/CatalogoJuego.php` (generado con `php server/bin/catalogo_juego.php`).

## Reembolsos, contracargos y abuso
Un reembolso o contracargo (Centro de Control, o anulación en Google Play) quita lo que dio la compra (créditos, aunque el
saldo quede negativo; equipos que todavía tenga; días de VIP o tarjeta), sigue el rastro en el mercado (lo retenido al
vendedor no se libera) y suspende la cuenta. Se BANEA con cualquier contracargo o con 2 reembolsos en 180 días (ajustes
`abuso_contracargo_banea`, `abuso_reembolsos`, `abuso_dias`). El mensaje (`aviso`) trae el correo de soporte.

## Pago con tarjeta (cambios de seguridad, auditoría A-02 / A-03)
Cada respuesta 3DS se usa una sola vez, debe ser de la misma transacción y por el mismo monto. Un pago en curso queda
"procesando": un segundo `POST /api/plux/pago` de la misma orden responde 409 `pago_en_proceso` sin volver a llamar a Plux.

## Centro de Control
`/admin.php` redirige (302) a `/control/` (formulario de entrada, TOTP opcional, lista de IPs; ver
`docs/INTEGRAR_CONTROL.md`). `/control/` usa solo métodos del servidor, que auditan en la tabla `auditoria`:
`Catalogo::guardarAjuste / restaurarAjuste / crearOferta / terminarOferta` (y `premium()` lee los ajustes),
`Monedero::ajusteManual` (motivo obligatorio, máx. 100.000 por vez, tope diario `ENVIVO_CONTROL_TOPE_CREDITOS`, 20.000 si
está vacío, 0 = sin tope), `Chat::moderarMensaje / palabra / sancionar(..., $quien) / levantar(..., $quien)`,
`Soporte::guardarRespuesta / borrarRespuesta / plantilla`, `Ajustes::guardar`, `Compras::revertir`,
`Cuentas::cambiarEstado`, `Mercado::moderar`, `Transferencias::cancelar`, `Google::revisarAnuladas / avisosPendientes`.
