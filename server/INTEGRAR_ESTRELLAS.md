# Personal estrella, fichas de estrella y Pase de Copa — cómo conectarlo

Archivos propios (ya están): `server/src/Estrellas.php`, `server/src/EstrellasApi.php`, `server/src/migraciones/estrellas.sql`
(la aplica sola `Db::pdo()` con las demás migraciones de módulos), `js/estrellas.js`, `server/tests/pruebas_estrellas.php`,
`tests/test_estrellas.js`.

Los parches de abajo tienen un formato fijo: `<!-- parche archivo id marca -->` y luego dos bloques de código, **Buscar**
(aparece una sola vez en el archivo) y **Reemplazar por**. `marca` es un texto corto que solo está cuando el parche ya
se aplicó (el cuerpo puede quedar distinto: lo que cuenta es la marca). `server/tests/pruebas_estrellas.php` lee ESTE archivo, revisa que cada
"Buscar" esté una sola vez, aplica sobre una copia de `server/src` + `api.php` los que todavía no están (si el archivo ya tiene la marca, lo
deja como está y prueba lo integrado), pasa `php -l` y prueba la copia
de verdad (límite 15/18 de la copa, estrella en el plantel del cruce y su partido gastado, rivales parecidos y duelo con
estrella). Si un parche deja de calzar, esa prueba falla.

## 0. Reglas medidas (techo 20–25 %, MONETIZACION.md §1)

Simulación con la lógica real (`server/eventos/batalla.js`, la corre `pruebas_estrellas.php`): equipo de copa gratis bien
armado (8 personas de habilidad 4, 12 equipos de fama ≤ 30) contra el mismo equipo con la estrella de cada rol.

| Estrella (rol) | Solo en el equipo | Bono estrella | Copa: total pagado con sede +6 y `bonoFinal` | Duelos: igual |
|---|---|---|---|---|
| Director | +17,4 % (~+8,5 pts) | 0 | **23,3 %** | 18,6 % |
| Ingeniero de audio | +10,6 % | 0 | 22,3 % | 17,8 % |
| Técnico de transmisión | +10,1 % | 0 | 21,8 % | 19,5 % |
| Camarógrafo | +3,0 % | +3 | 20,5 % | 17,4 % |
| Operador de repeticiones | +2,0 % | +4 | 21,3 % | 17,5 % |

Equipo gratis: calidad 49,2 en copa, 57,1 en duelos (personal de habilidad 4 + kit de duelo, armado con `Duelos::armarIntento`).
Sin el recorte `bonoFinal`, el director con sede llega a 29,1 % (copa). Con el +12 entero encima de la estrella: 40,6 %.

- Con calidad típica de 49–60, **el bono +12 solo ya es ~24 %**. Una estrella director dentro del equipo más sede +6 y
  sin recorte llega a ~29 %; con 3 estrellas en el equipo, 25–40 %. Por eso: **1 estrella por equipo**
  (`Estrellas::MAX_POR_EQUIPO`, ajuste `estrellas_max_equipo`) y el bono de la estrella completa lo que le falta a su
  aporte en el equipo para llegar a +6 (`bonoCompetencia = 6 − PUNTOS_EQUIPO[rol]`).
- **`Estrellas::bonoFinal($j, $modo, $bonoVentajas, $ref)`** recorta el bono total a `TOPE − puntos de la estrella en el
  equipo`: lo pagado nunca pasa de +12 "equivalentes". Úsalo donde se pone el `bono` de cada equipo (parches C4b y D4).
- Los números exactos de cada corrida salen en la sección "Simulación" de `pruebas_estrellas.php`.

## 1. `server/public/api.php` (una línea, después de la de CopasApi)

<!-- parche archivo="server/public/api.php" id="A1" marca="EstrellasApi::esRuta(" -->
```php
    if (\EnVivo\CopasApi::esRuta($ruta)) \EnVivo\CopasApi::responder($ruta, $metodo, requiere_sesion());
```
```php
    if (\EnVivo\CopasApi::esRuta($ruta)) \EnVivo\CopasApi::responder($ruta, $metodo, requiere_sesion());
    // Personal estrella y Pase de Copa (server/INTEGRAR_ESTRELLAS.md): /api/estrellas* y /api/pase_copa/comprar
    if (\EnVivo\EstrellasApi::esRuta($ruta)) \EnVivo\EstrellasApi::responder($ruta, $metodo, requiere_sesion());
```

Rutas (todas con sesión, POST con `X-Envivo: 1`, errores `{ok:false, error, codigo}`):
- `GET /api/estrellas` → `{catalogo:[{clave, nombre, rol, ciudad, habilidad, nivel, precios:[{partidos, creditos}], fichas,
  puntos_equipo, bono, restantes, vence, asignada:{copa, duelo}}], contratos, asignadas:{copa:[], duelo:[]}, fichas,
  fichas_hoy, fichas_dia, creditos, bono:{copa, duelo}, pase_copa:{semana, fase, activo, extra, precio_creditos,
  precio_usd, producto, puede_comprar, intentos_base, intentos_max, vip_extra, tope}, copa:{semana, fase, activa}, reglas}`
- `POST /api/estrellas/contratar {clave, modo:'credito'|'fichas', partidos:1|3|5, peticion?}` — códigos:
  `estrella_desconocida` 404, `modo_invalido` 400, `partidos_invalidos` 400, `sin_creditos` 402, `sin_fichas` 402, `limite` 429.
- `POST /api/estrellas/asignar {clave, equipo:'copa'|'duelo', quitar?:true}` — `equipo_invalido` 400, `sin_partidos` 409.
- `POST /api/pase_copa/comprar {modo?:'credito'}` — `fase` 409, `ya_tienes` 409, `sin_creditos` 402, `usa_tienda` 400
  (con dinero va por la tienda: producto `pase_copa`).

## 2. `server/src/arranque.php` (cuando exista `Ganchos.php`)

Al final, junto a los demás módulos: `\EnVivo\Estrellas::registrar();` (escucha `compra_aprobada` para el pase de $2.99
y `compra_revertida` para quitarlo en un reembolso). Si `Ganchos` no llega, usa la alternativa del punto 3.

## 3. `server/src/Catalogo.php` (producto de dinero real)

En `PRODUCTOS`:
```
'pase_copa' => ['tipo' => 'pase_copa', 'nombre' => 'Pase de Copa', 'detalle' => '+5 eventos de preparación por día durante la Copa de Servidores de esta semana', 'precio' => 2.99, 'creditos' => 0, 'una_vez' => false],
```
`Compras::entregarCompra` no le da nada por sí mismo: lo entrega el gancho (`Estrellas::alComprar`). Sin Ganchos, en
`Compras::entregarCompra`, junto a la línea de `'vip'`:
`if ($p['tipo'] === 'pase_copa') Estrellas::alComprar(['producto' => 'pase_copa', 'jugador_id' => $j, 'compra_id' => $id]);`
(y en la reversión: `Estrellas::alRevertir(['compra_id' => $id]);`). Si se aprueba fuera de la preparación, el pase queda
para la copa de la semana siguiente. `estrella_copa` (por créditos) no necesita fila en el catálogo: lo cobra
`Estrellas::contratar` con `Monedero::mover` (motivo `estrella_copa`, ref `estrella_copa:<clave>x<partidos>:<ref>`); el
pase por créditos usa motivo `pase_copa`.

Pase de temporada / VIP / regalos: `Estrellas::otorgar($j, $clave|null, $partidos, 'pase'|'vip'|'regalo', $ref)`
(idempotente por `$ref`; `null` = estrella de la semana) o una entrega `Monedero::entregar($j, 'estrella', $clave|'comodin',
$partidos, 'pase:...')`, que `GET /api/estrellas` convierte en contrato una sola vez.

## 4. `server/src/Copas.php`

C1 — límite diario de preparación (10 + Pase de Copa 5 + VIP máx. 3, tope 18):

<!-- parche archivo="server/src/Copas.php" id="C1" marca="self::intentosMax($j, (int) $c['id'])" -->
```php
        $n = (int) Db::valor('SELECT COUNT(*) FROM copa_intentos WHERE jugador_id = ? AND creado >= ?', [$j, $hoy]);
        Fallo::si($n >= self::INTENTOS_DIA, 'Ya jugaste tus ' . self::INTENTOS_DIA . ' eventos de copa de hoy. Vuelve mañana.', 429, ['codigo' => 'limite_dia']);
```
```php
        $n = (int) Db::valor('SELECT COUNT(*) FROM copa_intentos WHERE jugador_id = ? AND creado >= ?', [$j, $hoy]);
        $max = self::intentosMax($j, (int) $c['id']);
        Fallo::si($n >= $max, 'Ya jugaste tus ' . $max . ' eventos de copa de hoy. Vuelve mañana.', 429, ['codigo' => 'limite_dia', 'max' => $max]);
```

C2 — la función del límite (antes de `iniciarIntento`):

<!-- parche archivo="server/src/Copas.php" id="C2" marca="function intentosMax(" -->
```php
    /** POST /api/copa/intento/iniciar {} → {id, seed, contrato, equipo, contexto, vip, firma, vence} (si ya hay uno abierto, el mismo). */
```
```php
    /** Intentos de preparación por día: 10 + Pase de Copa (+5) + VIP (máx. 3), nunca más de 18 (server/INTEGRAR_ESTRELLAS.md). */
    public static function intentosMax(int $j, int $copa): int
    {
        return class_exists(Estrellas::class) ? Estrellas::limiteIntentos($j, $copa) : self::INTENTOS_DIA;
    }

    /** POST /api/copa/intento/iniciar {} → {id, seed, contrato, equipo, contexto, vip, firma, vence} (si ya hay uno abierto, el mismo). */
```

C3 — `GET /api/copa` muestra el límite de cada jugador:

<!-- parche archivo="server/src/Copas.php" id="C3" marca="'intentos_max' => self::intentosMax(" -->
```php
                     'intentos_max' => self::INTENTOS_DIA, 'trofeos' => $trofeos,
```
```php
                     'intentos_max' => self::intentosMax($j, $cid), 'trofeos' => $trofeos,
```

C4 — la estrella juega en el plantel del cruce (Internacional, habilidad 5). Va DESPUÉS de revisar el equipo: la revisión
(Festival::revisarEquipo) rechazaría la habilidad 5 por la fama y borra el nivel. El equipo se guarda sin la estrella y se
le pone al armar cada cruce (así un contrato vencido no sigue jugando):

<!-- parche archivo="server/src/Copas.php" id="C4" marca="Estrellas::aplicarAEquipo((int) $e['jugador_id']" -->
```php
        $plan = function (int $sid) use ($copa, $casa): array {
            $p = self::plantel((int) $copa['id'], $sid);
```
```php
        $plan = function (int $sid) use ($copa, $casa, $cruce): array {
            $p = self::plantel((int) $copa['id'], $sid);
            if (class_exists(Estrellas::class)) {   // personal estrella (server/INTEGRAR_ESTRELLAS.md)
                $ref = 'copa_cruce:' . $cruce['id'];
                foreach ($p as &$e) {
                    $e['staff'] = Estrellas::aplicarAEquipo((int) $e['jugador_id'], ['staff' => $e['staff'], 'equip' => $e['equip']], 'copa', $ref)['staff'];
                    $e['estrellas'] = Estrellas::activas((int) $e['jugador_id'], 'copa', $ref);
                }
                unset($e);
            }
```

C4b — cuando Ventajas ponga el `bono` de cada equipo del plantel (su propio INTEGRAR), envolverlo con el recorte, dentro
del mismo `foreach` de C4: `$e['bono'] = Estrellas::bonoFinal((int) $e['jugador_id'], 'copa', (int) Ventajas::bono((int) $e['jugador_id'], 'copa')['total'], $ref);`

C5 — cada equipo que jugó el cruce gasta 1 partido de su estrella (idempotente: rejugar el cruce no gasta otra vez):

<!-- parche archivo="server/src/Copas.php" id="C5" marca="Estrellas::consumir((int) $e['jugador_id'], 'copa'" -->
```php
                [$batA + $bA, $batB + $bB, self::json($d), $x['id']]);
            self::recalcularTabla($cid);
```
```php
                [$batA + $bA, $batB + $bB, self::json($d), $x['id']]);
            if (class_exists(Estrellas::class)) foreach (array_merge($pet['planA'], $pet['planB']) as $e) {   // 1 partido de su estrella
                if (empty($e['casa']) && !empty($e['jugador_id'])) Estrellas::consumir((int) $e['jugador_id'], 'copa', 'copa_cruce:' . $x['id']);
            }
            self::recalcularTabla($cid);
```

C6 — el orden del plantel (poder) cuenta la estrella; el equipo se guarda sin ella:

<!-- parche archivo="server/src/Copas.php" id="C6" marca="Estrellas::aplicarAEquipo($j, $eq, 'copa')" -->
```php
        $poder = self::poder($eq);
        Db::q('INSERT INTO copa_equipos
```
```php
        $poder = self::poder(class_exists(Estrellas::class) ? Estrellas::aplicarAEquipo($j, $eq, 'copa') : $eq);   // con su estrella (se guarda sin ella)
        Db::q('INSERT INTO copa_equipos
```

C7 — fichas de estrella (ruta gratis): +1 por evento de preparación validado (tope de fichas por día: 12):

<!-- parche archivo="server/src/Copas.php" id="C7" marca="'copa_intento:' . $id" -->
```php
                self::recalcularPrep((int) $i['copa_id']);
                try {
```
```php
                self::recalcularPrep((int) $i['copa_id']);
                if (class_exists(Estrellas::class)) Estrellas::ganarFichas((int) $i['jugador_id'], 1, 'copa_intento:' . $id);
                try {
```

C8 — +4 fichas por participar en la copa (al cerrar, a cada aportante):

<!-- parche archivo="server/src/Copas.php" id="C8" marca="'copa_cierre:' . $id" -->
```php
                    $premiados[] = [$j, $sid, $pts];
```
```php
                    $premiados[] = [$j, $sid, $pts];
                    if (class_exists(Estrellas::class)) Estrellas::ganarFichas($j, 4, 'copa_cierre:' . $id);
```

## 5. `server/src/Duelos.php`

D1 — la estrella entra en el equipo del retador y en el del fantasma (Internacional, habilidad 5):

<!-- parche archivo="server/src/Duelos.php" id="D1" marca="Estrellas::aplicarAEquipo($j, $miEq, 'duelo')" -->
```php
        $intR = self::armarIntento($miEq, $contrato, $seed, Monedero::vipActivo($j), $j);
```
```php
        if (class_exists(Estrellas::class)) {   // personal estrella (server/INTEGRAR_ESTRELLAS.md): retar gasta 1 partido, defender no
            $miEq = Estrellas::aplicarAEquipo($j, $miEq, 'duelo');
            $suEq = Estrellas::aplicarAEquipo($rival, $suEq, 'duelo');
        }
        $intR = self::armarIntento($miEq, $contrato, $seed, Monedero::vipActivo($j), $j);
```

D2 — el retador gasta 1 partido de su estrella al abrir el duelo (en la misma transacción):

<!-- parche archivo="server/src/Duelos.php" id="D2" marca="Estrellas::consumir($j, 'duelo'" -->
```php
            $id = Db::ultimoId();
```
```php
            $id = Db::ultimoId();
            if (class_exists(Estrellas::class)) Estrellas::consumir($j, 'duelo', 'duelo:' . $id);
```

D3 — rivales sugeridos con poder parecido (±20 %, con estrellas) y luego puntaje cercano (tabla `duelo_ratings`):

<!-- parche archivo="server/src/Duelos.php" id="D3" marca="Estrellas::rivalesSugeridos(" -->
```php
        $rivales = Db::todas('SELECT j.id, j.alias, j.nombre, j.fama_publica, j.vip_hasta, e.resumen_json, e.poder, COALESCE(r.rating, ?) AS rt
```
```php
        $rivales = class_exists(Estrellas::class) ? Estrellas::rivalesSugeridos($j, 12) : Db::todas('SELECT j.id, j.alias, j.nombre, j.fama_publica, j.vip_hasta, e.resumen_json, e.poder, COALESCE(r.rating, ?) AS rt
```

<!-- parche archivo="server/src/Duelos.php" id="D3b" marca="$o['parecido']" -->
```php
            $o['retos_hoy'] = (int) Db::valor('SELECT COUNT(*) FROM duelos WHERE retador_id = ? AND defensor_id = ? AND dia = ?', [$j, (int) $f['id'], $dia]);
```
```php
            $o['retos_hoy'] = (int) Db::valor('SELECT COUNT(*) FROM duelos WHERE retador_id = ? AND defensor_id = ? AND dia = ?', [$j, (int) $f['id'], $dia]);
            $o['parecido'] = (bool) ($f['parecido'] ?? false);   // poder parecido (±20 %): el juego lo marca como "rival parejo"
```

D4 — cuando Ventajas sume el bono al retador y al fantasma (su INTEGRAR), recortarlo igual:
`$bonoR = Estrellas::bonoFinal($j, 'duelo', $bonoR);` y `$bonoD = Estrellas::bonoFinal($rival, 'duelo', $bonoD);`

## 6. `server/src/Desafio.php` — fichas por el Desafío del día (+3, una vez por día)

<!-- parche archivo="server/src/Desafio.php" id="F1" marca="Estrellas::ganarFichas($j, 3" -->
```php
        if ($pas) self::sumarPases($j, $pas, 'desafio', $ref);
```
```php
        if ($pas) self::sumarPases($j, $pas, 'desafio', $ref);
        if (class_exists(Estrellas::class)) Estrellas::ganarFichas($j, 3, 'desafio:' . $dia);
```

## 7. Ventajas

`Ventajas::bono($j, $modo)` usa `Estrellas::bonoCompetencia($j, $modo)` (0..6) como parte `estrella`. Recomendado además en
`Ventajas::bono`: `total = min(total, TOPE − Estrellas::puntosEnEquipo($j, $modo))` (es lo mismo que `bonoFinal`, así no
hace falta C4b ni D4).

## 8. El juego (`index.html`, `sw.js`, `ui.js`)

- `<script src="js/estrellas.js"></script>` después de `js/art.js` y de `js/copas.js` (y en la lista de `sw.js`).
- Pantalla: `Estrellas.render(elemento, ctx)` con `ctx = { Api, A: Art, toast(t), ask?(html, boton, fn), snd?,
  pedir?(method, ruta, body), comprar?(producto) }` (comprar = flujo de la tienda con dinero: si no viene, el botón de $2.99
  no sale). Ficha sugerida en la pestaña "En línea" junto a la Copa (`data-k="estrellas"`).
- Inicio: la tarjeta entra sola en `window.EnVivoInicio` (orden 35) mientras haya copa en preparación o batalla y sesión.
  Su botón llama `window.EnVivoAbrirOnline('estrellas')` si existe.
- Textos: español + 9 idiomas dentro de `js/estrellas.js` (`TRAD[código]`); los códigos de error se traducen con `err.<codigo>`.

## 9. `server/tests/correr.sh`

Agregar `estrellas` a la lista de suites de 3c (`for suite in ... copas fusiones demo_datos estrellas; do`) y, en la parte de
Playwright de cada módulo, `NODE_PATH=/opt/npm-tools/node_modules node tests/test_estrellas.js` (capturas en
`tests/capturas/estrellas_*.png`).
