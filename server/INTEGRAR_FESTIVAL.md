# Integrar el Mega Festival (para quien mantiene `api.php`, `ui.js`, `index.html` y el cron)

Diseño aprobado: **Mega Festival** (inspirado en la Caza del Oso de Kingshot). Cada 2 días, durante 24 h, cada asociación
(hasta 20 productoras) produce junta un festival gigante con **6 escenarios**. Cada miembro manda su mejor personal y
equipos a cubrir un escenario (un **turno**). Los imprevistos del festival le pegan a todos los escenarios a la vez.
Cada turno gasta un **Pase de Prensa**. Premios por aporte personal y por la calidad total del festival (25/50/75/100 %).
Los resultados no se pueden inventar: el servidor reparte semilla + contrato, el juego manda solo sus decisiones y el
validador (`server/validador/`) repite la jugada.

Todo está en archivos nuevos (no tocan nada de lo existente):

| Archivo | Qué es |
|---|---|
| `server/src/Festival.php` | Toda la lógica: calendario, festival por asociación, escenarios, contratos y dificultad por liga/tamaño, pases, registro del equipo, turnos, validación, hitos, cierre y premios |
| `server/src/migraciones/festival.sql` | Tablas `festival_*` (se crean solas con `Festival::preparar()` y también con las migraciones de módulos de `Db`) |
| `server/bin/festival.php` | Tarea programada (cierra festivales, revalida turnos pendientes) |
| `js/festival.js` | Pantalla del festival: `Festival.render(el, ctx)` |
| `server/tests/pruebas_festival.php` | Pruebas del servidor con el validador de verdad (`php server/tests/pruebas_festival.php`) |
| `tests/test_festival.js` | Prueba de la pantalla en un celular 390x844 (`node tests/test_festival.js`) |

Faltan estos cambios pequeños en archivos que mantiene otra persona. **La prueba del servidor aplica el bloque de rutas
de abajo (entre las marcas `prueba:`) sobre una copia de `api.php`** y lo prueba por HTTP: si se cambia aquí, la prueba
usa el nuevo.

## 1. `server/public/api.php`: 4 rutas

Dentro del `match ($ruta) { ... }`, justo antes de `default => Http::error(404, 'No encontrado.'),` (con el nombre
completo `\EnVivo\Festival`, así no hace falta tocar la línea `use`). Los límites por jugador (429) ya van dentro de
`Festival`.

<!-- prueba:rutas -->
```php
        // Mega Festival (server/INTEGRAR_FESTIVAL.md)
        '/festival' => $soloGet() && Http::json(200, \EnVivo\Festival::resumen(requiere_sesion())),
        '/festival/intento/iniciar' => $soloPost() && Http::json(200, \EnVivo\Festival::iniciar(requiere_sesion(), Http::entrada(20000))),
        '/festival/intento/enviar' => $soloPost() && Http::json(200, \EnVivo\Festival::enviar(requiere_sesion(), Http::entrada(20000))),
        '/festival/pases/comprar' => $soloPost() && Http::json(200, \EnVivo\Festival::comprarPases(requiere_sesion(), Http::entrada(10000))),
```

Los errores salen como `Fallo` (el `catch` de `api.php` ya los convierte en `{ "ok": false, "error", "codigo", ... }`).

## 2. Tarea programada (cron de www-data)

```cron
*/10 * * * * php /var/www/envivo/server/bin/festival.php >> /var/log/envivo/festival.log 2>&1
```

(Si `deploy/instalar.sh` arma el cron, agregar esta línea junto a la de `tareas.php`.) Sin el cron también funciona: la
primera vez que alguien abre `/api/festival` después del cierre se reparte todo. Con el cron sale a tiempo aunque nadie entre.

## 3. Configuración (`/etc/envivo/config.env`, todas opcionales)

| Clave | Para qué | Por defecto |
|---|---|---|
| `FESTIVAL_INICIO` | Fecha y hora del primer festival (ISO). De ahí en adelante, uno cada 48 h | `2026-10-01T12:00:00-05:00` (abren a las 12:00 de Ecuador) |
| `VALIDADOR_URL`, `VALIDADOR_CLAVE`, `NODE_BIN` | Las mismas del validador (`server/validador/README.md`). Festival usa `Repeticion::validar()` | servicio en 127.0.0.1:8790; si no, Node por consola |

## 4. En el juego (`index.html`, `sw.js`, `ui.js`)

1. `index.html`: `<script src="js/festival.js"></script>` después de `js/art.js` (y antes de `js/ui.js`).
   El juego necesita también `intento.js` del validador para jugar el turno igual que lo repite el servidor:
   servir `server/validador/intento.js` como `js/intento.js` (copiarlo en el despliegue o con un enlace) y cargarlo
   después de `js/logic.js`.
2. `sw.js`: agregar `js/festival.js` y `js/intento.js` a la lista de archivos del juego (nunca cachear `/api/`).
3. `ui.js`: un botón "Mega Festival" (por ejemplo en la pestaña Comunidad/Asociación) que abra un contenedor y llame:

```js
Festival.render(document.getElementById('festival-cont'), {
  A: Art,
  estado: () => S,                              // la partida: de aquí sale el mejor personal y equipos (dentro de los topes)
  vip: Pm.vipActivo && Pm.vipActivo(),
  toast, snd,
  // Juega el turno en un estado APARTE (no toca dinero ni equipos de la partida) y devuelve las decisiones.
  // Devolver null si el jugador lo deja para después (el turno sigue abierto 30 min).
  jugarIntento: (seed, contrato, intento) => jugarTurnoFestival(intento),
});
// al salir de la pantalla: Festival.detener()
```

`jugarTurnoFestival(intento)` usa las mismas pantallas del evento en vivo pero sobre el estado que arma `intento.js`:

```js
async function jugarTurnoFestival(intento) {
  const { s, contractId, staffIds, equipIds } = Intento.crearEstado(Game, intento);   // estado nuevo y mínimo
  Game.startEvent(s, contractId, staffIds, equipIds);
  const decisiones = [];
  for (let inc = Game.currentIncident(s); inc; inc = Game.currentIncident(s)) {
    const i = await elegirOpcion(inc);          // la misma ventana de imprevisto de siempre; null = salir
    if (i === null) return null;
    Game.resolveIncident(s, i);
    decisiones.push(i);
  }
  const fin = Game.finishEvent(s);
  mostrarResultado(fin.result);                 // calidad y estrellas (el servidor confirma las suyas)
  return { decisiones, resultado: { quality: fin.result.quality, stars: fin.result.stars } };
}
```

Para probar sin servidor, `ctx.pedir(method, ruta, body)` reemplaza a `fetch` (lo usa `tests/test_festival.js`).
Textos: `I18N.T('festival.…')` con respaldo en español (claves en `ES` al inicio de `js/festival.js`).

## 5. Misiones del día → Pases de Prensa

- **Pasar lista**: 1 pase por día (zona del juego) al abrir el festival o pedir un turno, si estás en una asociación.
- **VIP**: +1 pase por día con VIP activo.
- **Otras misiones**: cuando el servidor confirme que se cumplió una misión del día, llamar
  `\EnVivo\Festival::ganarPaseMision($jugadorId, 'clave_de_la_mision')` → `true` si dio el pase. Máximo 2 por día;
  la misma misión cuenta una vez por día. (Es un gancho PHP: no hay ruta pública, así nadie se regala pases.)
- **Compra**: 30 créditos por pase, máximo 3 por día (`POST /api/festival/pases/comprar`). Pasa por `Monedero::mover`
  (queda en `movimientos_creditos` con motivo `festival_pases`). Cuenta suspendida → 403.
- Se pueden guardar hasta 10 pases. Los pases no vencen (se acumulan durante el descanso).

## 6. Contrato de la API

Todo con sesión; POST con `X-Envivo: 1`. Errores: `{ ok:false, error, codigo }`.

### `GET /api/festival`
```json
{
  "ok": true, "ahora": "ISO",
  "ciclo": { "n": 11, "abierto": true, "abre": "ISO", "cierra": "ISO", "siguiente": "ISO", "duracion_h": 24, "cada_h": 48 },
  "asociacion": { "id": 4, "nombre": "...", "siglas": "QFP", "color": "#ff3b3b", "cargo": "socio", "liga": { "n": 1, "nombre": "Plata" } } | null,
  "festival": {                                    // null si no hay asociación o la ventana está cerrada
    "id": 31, "ciclo": 11, "nombre": "Mega Festival QFP", "estado": "abierto", "liga": { "n": 1, "nombre": "Plata" }, "miembros": 9,
    "abre": "ISO", "cierra": "ISO", "meta_total": 1710, "calidad_total": 1011, "porcentaje": 59,
    "incidente": { "clave": "tormenta", "nombre": "...", "detalle": "...", "icono": "rain", "hasta": "ISO" },
    "incidentes": [ { "bloque": 0, "clave": "calma", "nombre", "detalle", "icono", "desde", "hasta", "activo": true, "pasado": false }, ... 4 ],
    "escenarios": [ { "n": 1, "nombre": "Escenario Principal", "tipo": "concierto", "icono": "concierto", "semilla": 123,
                      "contrato": { "type", "client", "cams", "diff", "audio", "stream", "outdoor", "pay", "rival": false, "festival": true, "escenario": 1 },
                      "meta": 390, "acumulado": 214, "porcentaje": 54, "completado": false, "completado_en": null, "completado_por": null,
                      "cubierto_por": [ { "jugador_id", "nombre", "aporte", "puntos", "intentos", "mejor", "yo" } ] }, ... 6 ],
    "hitos": [ { "pct": 25, "alcanzado": true, "alcanzado_en": "ISO", "alcanzado_por": "Beto Live", "premio": { "fichas": 10, "entregas": [ ... ] } }, ... 4 ],
    "ranking": [ { "puesto": 1, "jugador_id", "nombre", "puntos", "aporte", "intentos", "mejor", "yo" } ]
  },
  "yo": { "pases": 3, "pases_tope": 10, "fichas": 45, "creditos": 120, "vip": false,
          "hoy": { "diario": true, "vip": false, "misiones": 1, "misiones_max": 2 },
          "compra": { "precio": 30, "max_dia": 3, "comprados_hoy": 0, "puede": true },
          "puntos": 402, "intentos": 5, "puesto": 2, "puede_jugar": true, "motivo": null, "codigo": null,
          "intento_abierto": { ...turno pedido y no enviado, con seed/contrato/equipo/contexto... } | null,
          "topes": { "habilidad_max": 5, "personas_max": 8, "equipos_max": 12, "fama": 52 } },
  "premios": { "aporte": [ { "min": 50, "nombre": "Colaborador", "fichas": 10, "entregas": [...] }, ... ], "puesto": { "1": 30, "2": 15, "3": 15 }, "cerrar_escenario": 5 },
  "anterior": { "id", "ciclo", "nombre", "porcentaje", "liga", "cerrado", "mis_premios": [ { "tipo": "aporte|puesto|hito|escenario", "clave", "fichas", "entregas": [ entrega ] } ] } | null
}
```
`yo.codigo` cuando no puede jugar: `sin_asociacion`, `cerrado`, `otra_asociacion` (ya produjo con otra asociación en
este festival), `sin_pases`.

### `POST /api/festival/intento/iniciar` `{ "escenario": 1..6, "equipo": { "staff": [...], "equip": [...] } }`
→ `{ ok, reanudado: false, intento: { id, escenario, estado: "jugando", seed, contrato, equipo, contexto, vip, incidente, creado, expira }, pases }`

- Gasta 1 pase. La semilla sale de `random_int()` y es única. El contrato lleva la liga y el imprevisto del festival del momento.
- `equipo.staff`: `{ role: cam|dir|audio|stream, skill: 1..5, owner?: true, name? }` (máx. 8). `equipo.equip`: `{ type }` (máx. 12, al menos una cámara).
  El servidor fija ánimo 80 y estado 90 (iguales para todos) y revisa topes: habilidad según la fama pública (<15 → 3,
  <40 → 4, si no 5; las personas premium recibidas por entrega pueden pasar el tope), equipos del juego según su fama
  mínima y con máximo por tipo, exclusivos solo si están en la bodega del servidor (`inventario`), `vip_*` solo con VIP.
- Si ya tiene un turno abierto en ese escenario, lo devuelve (`reanudado: true`) sin gastar otro pase; en otro escenario → 409 `intento_abierto` (trae `intento`).
- Errores: 400 `escenario`/`equipo`/`habilidad`/`fama_equipo`/`sin_camara` · 402 `sin_pases` · 403 `sin_asociacion`/`no_es_tuyo`/`vip_requerido`
  · 409 `cerrado`/`otra_asociacion`/`escenario_completo`/`intento_abierto` · 429.

### `POST /api/festival/intento/enviar` `{ "intento_id", "decisiones": [0, 2, 1], "resultado"?: { "quality", "stars" } }`
→ `{ ok, resultado: { id, escenario, estado, calidad, estrellas, aporte, valido, coincide, motivo }, estado: <GET /api/festival> }`

- El turno queda usado ANTES de validar (una semilla, un intento). Luego el validador repite la jugada con lo que guardó
  el servidor (`seed`, `contrato`, `equipo`, `contexto`, `vip`) + las `decisiones`.
- `estado`: `validado` (suma la calidad **del servidor** al escenario, con tope en su meta; si el juego dijo otro resultado
  queda `valido: false` y marcado como sospechoso, salvo que la versión de la lógica sea otra) · `invalido` (jugada
  imposible: no suma) · `pendiente` (validador caído: se revalida solo con la tarea; todavía no suma).
- Hay 30 min para enviarlo (y hasta 15 min después del cierre si empezó antes). Errores: 409 `ya_enviado`/`vencido` · 404 · 400 `decisiones`.

### `POST /api/festival/pases/comprar` `{ "cantidad"?: 1..3 }`
→ `{ ok, compra: { creditos, comprados, pases }, estado: <GET /api/festival> }` · 402 `sin_creditos` · 409 `limite_compra`/`tope_pases` · 403.

## 7. Reglas (todo editable al inicio de `Festival.php`)

- **Calendario**: ventana de 24 h cada 48 h. Imprevistos del festival por bloques de 6 h (el primero en calma):
  tormenta (todos al aire libre), público desbordado (+1 cámara), baja de tensión (+1 dificultad).
- **Dificultad por liga** (Bronce, Plata, Oro, Diamante): +1 dificultad por liga (tope 5), +1 cámara desde Oro, más fama
  exigida en el contexto (20 + 15 × liga). La liga sube con 75 % o más y baja con menos de 25 %.
- **Metas por tamaño**: puntos por miembro según la liga (150 / 190 / 230 / 270, mínimo 3 miembros), repartidos entre
  los 6 escenarios por peso. Si entra gente durante el festival, las metas suben (nunca bajan).
- **Un festival por persona**: quien ya produjo en una asociación no puede producir en otra en el mismo ciclo.
- **Premios al cerrar** (20 min después del cierre): por aporte personal (desde 50 / 150 / 300 puntos), por puesto
  (1.º 30 fichas, 2.º y 3.º 15), por cada hito alcanzado (a todos los que tuvieron un turno validado) y 5 fichas a quien
  cierra un escenario. Las entregas usan tipos que el juego ya aplica (`dinero`, `consumible`, `reparar_todo`); el dinero
  sube 25 % por liga. Repartir dos veces no duplica nada (`festival_premios`). Aviso por el chat de sistema.
- **Fichas**: si está la Liga Semanal (`Liga::moverFichas`), el festival paga en esas mismas fichas (se gastan en la
  tienda de la liga); si no, quedan en `festival_fichas`.
- **Catálogo realista (Fase 7)**: si `js/logic.js` agrega equipos o roles nuevos, sumarlos a `EQUIPOS_JUEGO` /
  `EQUIPOS_SERVIDOR` / `ROLES` de `Festival.php` (y `MAX_TIPO` / `CAT` de `js/festival.js`); lo que no está en la lista se rechaza.

## 8. Pruebas

```bash
php server/tests/pruebas_festival.php      # base temporal + validador de verdad (Node) + rutas HTTP con este bloque
node tests/test_festival.js                # pantalla 390x844 con servidor falso; capturas en tests/capturas/festival*.png
```
