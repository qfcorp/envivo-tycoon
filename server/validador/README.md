# Validador de intentos (eventos en línea sin trampas)

**Regla:** "el servidor tira los dados". En los eventos en línea (Liga Semanal, Mega Festival, Duelo de Productoras,
Copas internacionales) el juego del jugador **no decide el resultado**:

1. El servidor (PHP) entrega una **semilla** y un **contrato**, y guarda junto a ellos el **equipo** (personal y equipos)
   que el jugador registró en el servidor para ese evento. Nada de eso sale de la partida guardada del jugador.
2. El juego juega el evento con esa semilla y manda **solo sus decisiones** (qué opción eligió en cada imprevisto).
3. El servidor llama a este validador, que **repite la jugada** con las mismas reglas (`js/logic.js`) y devuelve la
   calidad y las estrellas de verdad. Esa es la que cuenta para puntos, ranking y premios.

Archivos (todos en `server/validador/`):

| Archivo | Qué es |
|---|---|
| `intento.js` | El núcleo: arma el estado del evento y lo repite. No usa nada de Node, así que el **juego en el navegador puede usar el mismo archivo** para jugar el intento (ver "Lado del juego"). |
| `validador.js` | Carga `js/datos.js` (si existe), `js/logic.js` y `js/premium.js` y expone `validate(intento)`. También funciona por consola: `node validador.js < intento.json`. |
| `servidor.js` | Servicio HTTP mínimo (solo Node, sin paquetes) en `127.0.0.1`, protegido con clave. |
| `envivo-validador.service` | Plantilla del servicio de systemd. |
| `test.js` | Pruebas: `node server/validador/test.js`. |

## El intento (lo que PHP manda)

```json
{
  "seed": 1984263517,
  "contrato": { "type": "concierto", "client": "Festival Sur Sonoro", "cams": 3, "diff": 4,
                "audio": true, "stream": true, "outdoor": true, "pay": 2000,
                "rival": true, "rivalQuality": 72 },
  "equipo": {
    "staff": [ { "role": "cam", "skill": 3, "owner": true },
               { "role": "dir", "skill": 2, "morale": 80, "tier": "senior" } ],
    "equip": [ { "type": "cam_pro", "condition": 90 }, { "type": "switch_basic", "condition": 70 } ]
  },
  "contexto": { "fama": 35, "dinero": 1000, "stock": { "cable": 1, "battery": 1 } },
  "vip": false,
  "decisiones": [0, 2, 1],
  "cliente_resultado": { "quality": 61, "stars": 3 }
}
```

- `seed`, `contrato`, `equipo`, `contexto` y `vip` los pone **PHP desde su base de datos** (lo que el servidor entregó y registró).
  De lo que manda el juego, PHP solo copia `decisiones` y `cliente_resultado`.
- `contrato`: `type` debe existir en `EVENT_TYPES`. Si es disputado (`rival: true`) hace falta `rivalQuality` (la fija el servidor).
  Lo que falte se completa con los valores del tipo de evento.
- `equipo.staff`: `role` de `ROLES`, `skill` 1 a 5, `morale` 0 a 100 (si falta, 80), un solo `owner`. Máximo 12 personas.
- `equipo.equip`: `type` de `CATALOG` (incluye los exclusivos de `premium.js`), `condition` 1 a 100. Máximo 40.
  Un equipo VIP solo vale con `"vip": true`.
- Campos extra (por ejemplo `tier`, `nivel`, `posicion`) pasan tal cual a la lógica: sirve para la versión realista que viene.
- `contexto` (opcional): `fama` (la exigencia del cliente depende de ella), `dinero` (algunas opciones piden plata) y
  `stock` de repuestos. Valores por defecto: fama 0, dinero 1000, 1 cable y 1 batería. **Deben ser iguales para todos los
  jugadores de un evento competitivo** o venir del servidor, nunca del juego.
- `cliente_resultado` (opcional): lo que el juego dice que sacó. Si no viene, vale lo del servidor.

El estado se arma **nuevo**: modo libre (sin historia), fuera del tutorial, con exactamente ese personal y esos equipos.

## La respuesta

```json
{ "valido": true, "calidad": 61, "estrellas": 3, "coincide": true, "version_logica": "0a3fc8f924ad",
  "detalle": { "base": 58, "partes": [["Base", 25], "..."],
               "incidentes": [{ "n": 1, "clave": "lluvia", "eleccion": 0, "q": -3 }],
               "duelo": "won", "calidad_rival": 72, "ms": 0.4 } }
```

- `valido`: la jugada es posible **y** (si el juego mandó `cliente_resultado`) coincide con la repetición.
- `calidad` / `estrellas`: el resultado de verdad (`null` si la jugada es imposible). **Guarda siempre este, nunca el del juego.**
- `coincide`: `true` / `false`, o `null` si el juego no mandó resultado.
- `detalle.motivo` cuando no es válido:

| Motivo | Qué pasó |
|---|---|
| `resultado_no_coincide` | La jugada es posible pero el juego dijo otro resultado (trampa o versión distinta de la lógica) |
| `opcion_invalida` | Una decisión no es un número de opción que exista |
| `opcion_no_disponible` | Eligió una opción bloqueada (por ejemplo "router 4G" sin router) |
| `faltan_decisiones` / `sobran_decisiones` | No hay una decisión por imprevisto |
| `decisiones_invalidas`, `semilla_invalida`, `contrato_invalido`, `equipo_invalido`, `equipo_vip_sin_vip`, `contexto_invalido`, `intento_invalido`, `json_invalido` | Datos mal formados |
| `logica_no_determinista` | `js/logic.js` usó `Math.random` durante el evento (error de la lógica, no del jugador) |
| `logica_no_carga` | `js/logic.js` tiene un error (HTTP 503) |

- `version_logica`: huella de `js/*.js`. Guárdala cuando entregas la semilla; si el juego del jugador tenía otra versión
  (actualización a mitad del evento) un `resultado_no_coincide` no es trampa: dale el resultado del servidor sin castigo.
  El servicio **recarga solo** la lógica cuando cambian los archivos de `js/` (no hace falta reiniciarlo tras `actualizar.sh`).

## Instalar en el VPS (Ubuntu)

1. **Node 22** (Ubuntu trae uno viejo):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource.sh && sudo bash /tmp/nodesource.sh
   sudo apt-get install -y nodejs
   node -v      # debe decir v22...
   ```
2. **Clave** compartida entre PHP y el validador:
   ```bash
   CLAVE=$(openssl rand -hex 32)
   echo "$CLAVE" | sudo tee /etc/envivo/validador.clave > /dev/null
   sudo chmod 600 /etc/envivo/validador.clave && sudo chown root:root /etc/envivo/validador.clave
   echo "VALIDADOR_CLAVE=$CLAVE" | sudo tee -a /etc/envivo/config.env > /dev/null
   echo "VALIDADOR_URL=http://127.0.0.1:8790" | sudo tee -a /etc/envivo/config.env > /dev/null
   ```
3. **Probar** que la lógica carga: `node /var/www/envivo/server/validador/validador.js --version`
4. **Activar el servicio**:
   ```bash
   sudo cp /var/www/envivo/server/validador/envivo-validador.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now envivo-validador
   sudo systemctl status envivo-validador          # debe decir "active (running)"
   curl -s -H "X-Validador-Clave: $(sudo cat /etc/envivo/validador.clave)" http://127.0.0.1:8790/salud
   ```
   Ver errores: `sudo journalctl -u envivo-validador -n 50`. Reiniciar: `sudo systemctl restart envivo-validador`.
5. Nada que tocar en nginx ni en el firewall: el servicio solo escucha en `127.0.0.1`.

Si el servicio está caído, PHP usa el modo consola (más lento, unos 60 ms por intento porque arranca Node cada vez).

## Ayudante para PHP

Copiar a `server/src/` (por ejemplo dentro de una clase `Validador`). Llama al servicio con la clave y 2 segundos de
límite; si no responde, usa la consola. La clave y la dirección salen de `Config` (`VALIDADOR_CLAVE`, `VALIDADOR_URL`).

```php
<?php
/**
 * Repite un intento de evento en el validador (Node). Devuelve el resultado como arreglo, con 'via' => 'http'|'consola'.
 * Si no se pudo validar de ninguna forma devuelve ['valido' => false, 'detalle' => ['motivo' => 'validador_caido', ...]]:
 * en ese caso NO des puntos; guarda el intento y vuelve a validarlo más tarde.
 *
 * $opciones: url (http://127.0.0.1:8790), clave, script (ruta de validador.js), node (/usr/bin/node), timeout_ms (2000)
 */
function envivo_validar_intento(array $intento, array $opciones = []): array
{
    $url = rtrim((string) ($opciones['url'] ?? 'http://127.0.0.1:8790'), '/');
    $clave = (string) ($opciones['clave'] ?? '');
    $script = (string) ($opciones['script'] ?? '/var/www/envivo/server/validador/validador.js');
    $node = (string) ($opciones['node'] ?? '/usr/bin/node');
    $limite = (int) ($opciones['timeout_ms'] ?? 2000);
    $json = json_encode($intento, JSON_UNESCAPED_UNICODE);
    if ($json === false) return ['valido' => false, 'detalle' => ['motivo' => 'json_invalido']];

    // 1) Servicio HTTP en 127.0.0.1
    if ($clave !== '' && function_exists('curl_init')) {
        $ch = curl_init($url . '/validar');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Validador-Clave: ' . $clave],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT_MS => 500,
            CURLOPT_TIMEOUT_MS => $limite,
            CURLOPT_PROXY => '',            // nunca pasar por un proxy
            CURLOPT_NOSIGNAL => true,
        ]);
        $cuerpo = curl_exec($ch);
        $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (is_string($cuerpo) && ($codigo === 200 || $codigo === 400)) {
            $r = json_decode($cuerpo, true);
            if (is_array($r)) { $r['via'] = 'http'; return $r; }
        }
        if ($codigo === 401) error_log('envivo: la clave del validador no coincide (VALIDADOR_CLAVE)');
    }

    // 2) Respaldo: node validador.js < intento.json
    $proc = proc_open([$node, $script], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
    if (!is_resource($proc)) return ['valido' => false, 'detalle' => ['motivo' => 'validador_caido']];
    fwrite($tubos[0], $json);
    fclose($tubos[0]);
    stream_set_blocking($tubos[1], false);
    $salida = '';
    $fin = microtime(true) + max(3.0, $limite / 1000 * 2);   // arrancar Node toma su tiempo
    while (microtime(true) < $fin) {
        $leer = [$tubos[1]]; $nada = null;
        if (stream_select($leer, $nada, $nada, 0, 100000)) {
            $trozo = fread($tubos[1], 65536);
            if ($trozo !== false) $salida .= $trozo;
        }
        if (feof($tubos[1])) break;
    }
    $terminado = feof($tubos[1]);
    fclose($tubos[1]); fclose($tubos[2]);
    if (!$terminado) { proc_terminate($proc, 9); proc_close($proc); return ['valido' => false, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => 'tiempo agotado']]; }
    proc_close($proc);
    $r = json_decode(trim($salida), true);
    if (!is_array($r)) return ['valido' => false, 'detalle' => ['motivo' => 'validador_caido', 'mensaje' => 'respuesta inválida']];
    $r['via'] = 'consola';
    return $r;
}
```

Uso desde la API (ejemplo):

```text
$intento = [
  'seed' => $fila['semilla'], 'contrato' => json_decode($fila['contrato_json'], true),
  'equipo' => json_decode($fila['equipo_json'], true), 'contexto' => json_decode($fila['contexto_json'], true),
  'vip' => $vipActivo,
  'decisiones' => $entrada['decisiones'] ?? null,            // lo único que viene del juego
  'cliente_resultado' => $entrada['resultado'] ?? null,
];
$r = envivo_validar_intento($intento, ['url' => Config::get('VALIDADOR_URL', 'http://127.0.0.1:8790'), 'clave' => Config::get('VALIDADOR_CLAVE')]);
if (($r['detalle']['motivo'] ?? '') === 'validador_caido') { /* guardar como pendiente y reintentar */ }
elseif ($r['calidad'] !== null) { /* guardar $r['calidad'] y $r['estrellas'] (del servidor); marcar sospechoso si !$r['valido'] */ }
```

Reglas del lado de PHP:
- **Una semilla, un intento.** Marca la semilla como usada al recibir el intento (aunque falle) para que nadie la pruebe
  varias veces. La semilla debe salir de `random_int()`, nunca de algo que el jugador conozca antes.
- Guarda el intento completo (para revisar reclamos) y `version_logica`.
- Si `valido` es `false` por `resultado_no_coincide` muchas veces seguidas para el mismo jugador, es candidato a revisión.

## Lado del juego

El juego tiene que jugar el intento **exactamente igual** que el validador lo repite: mismo estado inicial y misma semilla.
La forma más segura es usar el mismo `intento.js` en el navegador (copiarlo a `js/intento.js` o servirlo) y jugar con
`Intento.crearEstado(Game, intento)`: devuelve `{ s, contractId, staffIds, equipIds }` listo para
`Game.startEvent(s, contractId, staffIds, equipIds)`, y después `currentIncident` / `resolveIncident` / `finishEvent` como
en un evento normal, guardando el número de opción de cada imprevisto. Ese estado es aparte de la partida del jugador
(no toca su dinero ni sus equipos).

## Pruebas

```bash
node server/validador/test.js            # 300 intentos (N=1000 para más)
```

Juega intentos con la lógica cargada como en el navegador (en un contexto aparte), los repite en el validador y revisa
que todos coincidan; prueba trampas (calidad inventada, decisión cambiada, otro equipo, otra semilla, opciones inválidas o
bloqueadas, decisiones de más o de menos, datos mal formados), el tiempo por validación, el modo consola, el servicio HTTP
y el ayudante PHP de arriba.
