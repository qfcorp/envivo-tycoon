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

## Partida en la nube (requiere sesión)
- `GET /api/partida` → `{ "ok": true, "datos": "<texto JSON de la partida>" | null, "actualizado": "ISO" | null }`
- `POST /api/partida` `{ "datos": "<texto JSON>" }` (máx. 300 KB) → `{ "ok": true, "actualizado": "ISO" }`

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

Exclusivos con créditos:
| id | Qué es | Créditos |
|---|---|---|
| `generador` | Generador diésel (la luz nunca te deja sin señal) | 250 |
| `kit_reparacion` | Kit de reparación total (todo al 100 %) | 60 |
| `caja_chica` | $1.000 para tu productora | 120 |
| `estrella` | Camarógrafo estrella nivel 4 (gratis, sin pago inicial) | 300 |
| `dron4k` | Dron 4K (cuenta como cámara de calidad 4) | 450 |
| `grua` | Cámara en grúa telescópica (cámara de calidad 4) | 650 |
| `unidad_movil` | Unidad móvil de transmisión (switcher de calidad 3) | 900 |
