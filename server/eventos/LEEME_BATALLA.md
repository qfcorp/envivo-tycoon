# Motor de batalla de la Copa de Servidores (`server/eventos/batalla.js`)

Juega un **cruce** servidor contra servidor (ver `server/COPAS.md`, "Motor de batalla"): 5 partidos. En el partido *n* el
equipo *n* del plantel A juega contra el equipo *n* del plantel B, con el **mismo contrato**, la **misma semilla** y la
**misma lista de imprevistos** (`contrato.imprevistos`, como en los duelos). Gana el partido la mayor calidad; si es igual, empate.

- Reglas: las de verdad (`js/datos.js`, `js/logic.js`, `js/premium.js`) cargadas por `server/validador/validador.js`, con un
  estado de intento (`s.intento = true`, así que la sede y las temporadas **nunca** aplican). Decisiones con la política
  `prudente` de `server/eventos/motor.js`. Cada lado se juega y después **se repite con el validador** (`V.validate`): si
  no coincidiera, el cruce falla en vez de dar un resultado que `Repeticion::validar` no pueda repetir.
- Semilla del partido *n* (1..5): `Motor.variante(seed, n)` (la misma fórmula que el Desafío del Día).
- Imprevistos: los sortea la lógica con esa semilla y el **equipo de la casa** del contrato (neutral: no los decide
  ningún lado). Cada lado juega los de esa lista que le aplican (por ejemplo, el del dron solo si lleva dron), igual que en los duelos.
- Contexto: igual para los dos lados y todos los partidos. Por defecto el de los duelos
  `{fama: 30, dinero: 1000, stock: {cable: 1, battery: 1}}` (la exigencia del cliente depende de la fama).
- Contratos: se toman solo `type, client, cams, audio, stream, outdoor, diff, pay` (nada de internacional, rival ni historia).
  Valores por defecto: los de `intento.js`, salvo que `stream` es `true` (en la copa todo se transmite) y `outdoor` es
  `true` si el tipo de evento tiene `outdoor >= 0.5`.
- Plantel: hasta 5 equipos. Se **ordenan por `poder`** (mayor primero; empate: orden de llegada). Los que faltan se completan
  con el **equipo de la casa** al final. Un equipo que la lógica rechaza (rol o equipo desconocido, sin cámara...) también
  juega como la casa ese partido (`casa_a: true, motivo_casa_a: "equipo_invalido"`): nunca se pierde por no presentarse.
- Determinista: misma entrada → misma salida byte a byte. `Math.random` está prohibido durante todo el cruce (lanza
  `logica_no_determinista`), igual que en el validador. Rápido: ~15-30 ms un cruce de 5 partidos (≈100 ms por consola con el arranque de Node).

## Equipo de la casa (`B.equipoCasa(contrato)`)
Se arma con los datos de la lógica (nada de claves fijas):
- Personal: el **mínimo** de cada rol que pide el contrato (`Game.crewReq(contrato, [])`), y camarógrafos para todas las
  cámaras si caben en el tope de 12 personas. Habilidad **2**, nivel `junior`, ánimo 80, sin dueño.
- Equipos (estado 85 %, como el kit de duelo): solo del catálogo normal (sin VIP, exclusivos ni alquiler; si piden algo,
  solo roles que la casa lleva). Por categoría se elige el que sirve para ese tipo de evento (`eventos`), con calidad cercana
  a 2 (dificultad ≤ 2) o 3 (dificultad ≥ 3), y el más barato. Cámaras normales (no PTZ, POV, acción, dron ni celular) × cams,
  trípode por cámara, switcher (2+ cámaras), consola y micrófono (si hay audio), encoder e internet (si se transmite),
  repeticiones/gráficos si la casa lleva ese operador, intercom (dificultad ≥ 4 y 3+ cámaras), UPS y cobertor de lluvia (exteriores).
- Se valida con la lógica (`Intento.crearEstado` + `Game.startEvent`) y se guarda en memoria por tipo/versión de la lógica.

## Torneos (`B.TORNEOS`)
| clave | nombre | deporte | cadena parodia | tipos de los 5 partidos |
|---|---|---|---|---|
| `copa_planeta_balompie` | Copa Planeta de Balompié | futbol | Red Mundovisión Planeta | ligapro, ligapro, final, ligapro, final |
| `copa_libertadores_sur` | Copa de los Libertadores del Sur | futbol | Señal Cóndor Continental | ligapro ×4, final |
| `liga_estelar_clubes` | Liga Estelar de Clubes | futbol | Canal Galaxia Deportiva | ligapro, final, ligapro, final, final |
| `mundial_aro_tablero` | Mundial de Aro y Tablero | basquet | Aro y Red Televisión Global | concierto ×5 (arena) |
| `juegos_cinco_continentes` | Juegos de los Cinco Continentes | multideporte | Antorcha Mundial TV | concierto (inauguración), boxeo, lucha_libre, ligapro, final |
| `gran_premio_formula_veloz` | Gran Premio Fórmula Veloz | autos | Bandera a Cuadros Network | lanzamiento_autos ×5 |
| `la_pelea_del_siglo` | La Pelea del Siglo | boxeo | Cuadrilátero Mundial Pago por Ver | lucha_libre, lucha_libre, boxeo, boxeo, boxeo |
| `el_gran_tazon` | El Gran Tazón | futbol_americano | Cadena Ovalada Intercontinental | ligapro, final, concierto (medio tiempo), final, final |

`copas.torneo_key` guarda la clave. `B.contratosDe(clave)` da los 5 contratos estándar (los que se usan si no se mandan `contratos`).

## Contrato JSON

Entrada (stdin o `jugarCruce(x)`):
```json
{ "seed": 123456789,
  "torneo": "copa_planeta_balompie",
  "contratos": [ {"type":"ligapro","cams":4,"diff":4}, "...5 en total (opcional: si falta, los del torneo)" ],
  "planA": [ {"staff":[{"role":"director","skill":3,"tier":"senior","morale":80,"owner":true}], "equip":[{"type":"cam_cine","condition":90}], "vip":false} ],
  "planB": [],
  "contexto": {"fama":30} }
```
- `seed`: entero de 32 bits (o texto de dígitos). `torneo`: una clave de `TORNEOS`.
- Equipo: `{staff, equip}` en el formato de la lógica (como `Duelos::armarIntento()['equipo']`), o `{equipo:{staff, equip}}`,
  o el resumen de duelo `{personal:[{rol, habilidad, nivel, dueno}], inventario:[{item}]}` (estado 100). `vip: true` deja
  usar equipos VIP (lo decide PHP). `null` en la lista = equipo de la casa.

Salida (una línea JSON):
```json
{ "ok": true,
  "partidos": [ { "n": 1, "tipo": "ligapro", "calidad_a": 61, "calidad_b": 35, "ganador": "a",
                  "incidentes_a": [{"clave":"lluvia","eleccion":0,"q":-3}], "incidentes_b": [{"clave":"lluvia","eleccion":0,"q":-3}],
                  "estrellas_a": 3, "estrellas_b": 1, "casa_a": false, "casa_b": true, "motivo_casa_a": null, "motivo_casa_b": null,
                  "poder_a": 412, "poder_b": null, "orden_a": 0, "orden_b": null,
                  "seed": -1640519189, "imprevistos": ["internet","lluvia"], "cams": 4, "diff": 4 } ],
  "calidad_total_a": 290, "calidad_total_b": 201, "ganados_a": 4, "ganados_b": 1, "empates": 0,
  "torneo": {"clave":"copa_planeta_balompie","nombre":"Copa Planeta de Balompié","cadena":"Red Mundovisión Planeta","deporte":"futbol"},
  "politica": "prudente", "version_logica": "a1b2c3d4e5f6" }
```
`orden_a` = posición del equipo en `planA` tal como llegó (null = casa). Los puntos de tabla y el bono de preparación los
calcula PHP (`Copas.php`) con `ganados_*`, `empates` y `calidad_total_*`.

Error: `{ "ok": false, "motivo": "...", "mensaje": "..." }`. Motivos: `json_invalido`, `muy_grande` (> 512 KB),
`entrada_invalida`, `semilla_invalida`, `torneo_invalido`, `contratos_invalidos` (no son 5), `contrato_invalido`,
`plantel_invalido` (no es lista, más de 5, o un equipo sin forma `{staff, equip}`), `contexto_invalido`,
`logica_no_determinista`, `logica_no_carga`, `error_logica`.

Otras acciones por consola: `{"accion":"poder","equipo":{...}}` → `{ok, poder}` · `{"accion":"torneos"}` → `{ok, torneos}` ·
`{"accion":"contratos","torneo":"..."}` → `{ok, contratos}` · `{"accion":"casa","contrato":{...}}` → `{ok, equipo}` ·
`{"accion":"version"}` → `{ok, version_logica}`.

## Poder (`B.poder(equipo)`)
Entero, no depende del contrato: por persona `(habilidad + bono del nivel) × 4`, `+3` por rol distinto, cámaras (las 8
mejores) `q × (0,5 + estado/200) × 10`, el resto de equipos `q × (0,5 + estado/200) × 3`. Lo que no es equipo vale 0.
Sirve para `copa_equipos.poder` y para elegir los 5 mejores (el motor igual vuelve a ordenar).

## Uso desde PHP (consola, como `Repeticion::motor`)
`Repeticion::consola` es privado; en `Copas.php` (o con un método público nuevo en `Repeticion`, lo decide su dueño):
```php
$json = json_encode(['seed' => $seed, 'torneo' => $copa['torneo_key'], 'planA' => $equiposA, 'planB' => $equiposB],
                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$proc = proc_open([Repeticion::node(), dirname(__DIR__) . '/eventos/batalla.js'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $t);
fwrite($t[0], $json); fclose($t[0]);
$r = json_decode(trim(stream_get_contents($t[1])), true); fclose($t[1]); fclose($t[2]); proc_close($proc);
// $r['ok'] === true → $r['partidos'], $r['calidad_total_a'], ...  (poner un tiempo límite como Repeticion::consola: ~5 s sobra)
```
La semilla del cruce: `random_int(0, 2147483647)` al jugar el cruce, guardada en `copa_cruces.detalle_json` junto con la
salida (así se puede repetir y auditar: misma semilla + mismos equipos → mismo resultado).

## Ruta HTTP opcional (en `server/validador/servidor.js`; lo hace el coordinador, este módulo no lo toca)
El servicio del validador solo tiene `/validar` y `/salud`. Para `POST /batalla` (misma clave `X-Validador-Clave`):
1. Arriba, después de `const V = require('./validador.js');`:
   ```js
   const B = require('../eventos/batalla.js');
   ```
2. Cambiar `if (url !== '/validar') return responder(res, 404, { error: 'ruta' });` por:
   ```js
   if (url !== '/validar' && url !== '/batalla') return responder(res, 404, { error: 'ruta' });
   ```
3. En `req.on('end', ...)`, cambiar las dos líneas `const r = V.validate(intento);` y `responder(res, r.detalle && ...)` por:
   ```js
   if (url === '/batalla') return responder(res, 200, B.atender(intento));
   const r = V.validate(intento);
   responder(res, r.detalle && r.detalle.motivo === 'logica_no_carga' ? 503 : 200, r);
   ```
El cuerpo de un cruce (10 equipos) pesa unos pocos KB: el límite de 256 KB del servicio sobra.

## Pruebas
`node server/eventos/test_batalla.js` — torneos, determinismo (módulo y consola byte a byte), fuerte contra débil,
equipo de la casa (relleno, orden por poder, casa contra casa = empate exacto, equipo rechazado → casa), entradas
inválidas, los 16 tipos de evento, poder y rapidez (< 300 ms).
