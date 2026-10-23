# Integrar la Sede oficial (servidor) — líneas exactas

Módulo: `server/src/SedeOficial.php` (reglas y datos), `server/src/SedeApi.php` (rutas `/api/sede…`),
`server/src/migraciones/sede_oficial.sql` (tablas, se aplica sola con `Db::migrarModulos`), `js/sede.js` (modo "oficial").
Pruebas: `php server/tests/pruebas_sede_oficial.php` y `node tests/test_sede_oficial.js` (Playwright, fetch simulado).
Contrato común: `server/MONETIZACION.md`. **Ningún archivo compartido se editó**: estas son las líneas que faltan.

## 1. `server/public/api.php` (rutas)

Justo **antes** de la línea `    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina`:

```php
    // Sede oficial (server/INTEGRAR_SEDE_OFICIAL.md): /api/sede*
    if (\EnVivo\SedeApi::esRuta($ruta)) \EnVivo\SedeApi::responder($ruta, $metodo, requiere_sesion());
```

(La prueba PHP copia `api.php`, inserta exactamente esa línea en ese lugar y prueba las rutas con `php -S`.)

## 2. `server/src/arranque.php` (ganchos de compras)

Al final, con las otras líneas de módulos de `Ganchos` (MONETIZACION.md §2):

```php
\EnVivo\SedeOficial::registrar();   // packs de obra: compra_aprobada entrega, compra_revertida quita
```

Si el gancho no estuviera, igual funciona: cada `GET /api/sede` concilia las compras `pack_obra_*` pagadas que falten
y revierte las reembolsadas (tabla `sede_packs`, una vez por compra).

## 3. `server/src/Catalogo.php` → `PRODUCTOS` (packs con dinero real, contenido fijo)

Después de `'vip30' => …`:

```php
        // Sede oficial (server/INTEGRAR_SEDE_OFICIAL.md): contenido FIJO, lo entrega SedeOficial (gancho compra_aprobada). Igual a SedeOficial::PACKS.
        'pack_obra_s' => ['tipo' => 'pack_obra', 'nombre' => 'Pack de obra S', 'detalle' => 'Sede oficial: 10 h de aceleradores de obra + 12 cables, 12 placas, 12 paneles LED, 12 credenciales, 12 planos y 1 chip 4K. Contenido fijo.', 'precio' => 1.99, 'creditos' => 0, 'una_vez' => false],
        'pack_obra_m' => ['tipo' => 'pack_obra', 'nombre' => 'Pack de obra M', 'detalle' => 'Sede oficial: 30 h de aceleradores de obra + 32 cables, 32 placas, 32 paneles LED, 32 credenciales, 32 planos y 3 chips 4K. Contenido fijo.', 'precio' => 4.99, 'creditos' => 0, 'una_vez' => false],
        'pack_obra_l' => ['tipo' => 'pack_obra', 'nombre' => 'Pack de obra L', 'detalle' => 'Sede oficial: 80 h de aceleradores de obra + 70 cables, 70 placas, 70 paneles LED, 70 credenciales, 70 planos y 8 chips 4K. Contenido fijo.', 'precio' => 9.99, 'creditos' => 0, 'una_vez' => false],
```

`Compras::entregarCompra` no necesita cambios (tipo `pack_obra` → sin entregas ni créditos; la sede lo entrega).
Los textos `detalle` son los de `SedeOficial::detallePack()`; si se cambia `SedeOficial::PACKS`, cambiar también estos.
El precio lo puede cambiar el Centro de Control (`productos_ajustes`); el contenido no.

## 4. Materiales por intentos en línea validados (`SedeOficial::premioIntento`)

Nunca lanza error (no rompe el intento) y no paga dos veces el mismo `ref`. Va dentro de la transacción de cada módulo.
Una línea en cada archivo, **justo después** de la línea indicada:

`server/src/Liga.php`, en `aplicar()`, después de
`            Universos::marcarActivo((int) $it['jugador_id'], true);   // evento en línea validado (COPAS.md §1: actividad_diaria.eventos)`:
```php
            if ($estado === 'validado' && !$sospechoso) SedeOficial::premioIntento((int) $it['jugador_id'], (int) $res['calidad'], (int) $res['estrellas'], 'liga', 'liga:' . $id);
```

`server/src/Festival.php`, en `aplicar()`, después de
`            Universos::marcarActivo((int) $i['jugador_id'], true);   // evento en línea validado (COPAS.md §1: actividad_diaria.eventos)`:
```php
            if ($valido && !$sospechoso && $est !== null) SedeOficial::premioIntento((int) $i['jugador_id'], $cal, $est, 'festival', 'festival:' . $id);
```

`server/src/Copas.php`, en la validación del intento, después de
`                ['validado', $cal, $est, $puntos, $valido ? 1 : 0, $sospechoso ? 1 : 0, $nota, $ver, $t, $id]);`:
```php
            if ($valido && $aTiempo) SedeOficial::premioIntento((int) $i['jugador_id'], $cal, $est, 'copa', 'copa:' . $id);
```

`server/src/Duelos.php`, en `cerrar()`, después de
`            if ($calidad !== null) Universos::marcarActivo($rj, true);   // evento en línea validado (COPAS.md §1: actividad_diaria.eventos)`:
```php
            if ($calidad !== null && $estrellas !== null && !$sospechoso) SedeOficial::premioIntento($rj, $calidad, $estrellas, 'duelo', 'duelo:' . $id);
```

`server/src/Desafio.php`, después de
`            if ($cal !== null) Universos::marcarActivo((int) $f['jugador_id'], true);   // evento en línea validado (COPAS.md §1)`:
```php
            if ($cal !== null && $est !== null && $motivo !== 'resultado_no_coincide') SedeOficial::premioIntento((int) $f['jugador_id'], $cal, $est, 'desafio', 'desafio:' . $id);
```

Fórmula (como los eventos de `js/sede.js`): `(dificultad + 1) × factor por estrellas (0 / 0,3 / 0,6 / 1 / 1,35 / 1,7) × (1 + 3 % × nivel)`,
con dificultad = 1 + calidad / 20 (de 1 a 5); 5 estrellas = +2 y 40 % de un chip. **Tope por día: 60 comunes y 2 chips.**
En el modo "firma" de la Liga (sin validador) no da materiales; se cobran cuando el intento queda `validado`.

## 5. Copa y regalos de asociación (entregas)

Nada que integrar: `Copas::entregasPremio` ya crea entregas `tipo 'materiales'` (`item` = material, `cantidad`), y la sede
oficial las absorbe una vez (tabla `sede_fuentes`) en el próximo `GET /api/sede`.
**Para el ayudante VIP (regalos de asociación):** crear entregas con `Monedero::entregar($j, 'materiales', '<cables|placas|paneles|credenciales|planos|chips>', N, 'regalo:<id>')`
o `Monedero::entregar($j, 'acelerador', 'obra', MINUTOS, 'regalo:<id>')` (el `item` no importa: el Pase usa `'obra'`; la cantidad son minutos). `premium.js` ignora esos tipos (no hace nada en la partida local).
**Segundo equipo de obra por VIP:** si existe `Vip::slotsObra(int $j): int|bool`, la sede usa `max(base, slotsObra)` (tope 3);
`true` = 2 equipos. Sin esa clase: 1 equipo, 2 desde el nivel 5 (como `js/sede.js`).

## 6. Ventajas (techo de competencia)

`Ventajas::bono()` usa `SedeOficial::bonoCompetencia(int $j): int` → **0..6**: +2 desde el nivel 5, +4 desde el 10, +6 desde el 20.
No escribe nada y cuenta una obra de nivel ya terminada aunque nadie haya abierto la sede.

## 7. `server/tests/correr.sh`

En la lista de suites de la sección 3c agregar `sede_oficial`:

```bash
for suite in discord festival liga control control_servidores duelos_desafio universos copas fusiones demo_datos sede_oficial; do
```

y en la lista de tablas de la sección 1 (`for t in actividad ajustes …`) agregar al final:
`sede_oficial sede_mejoras sede_obras sede_ayudas sede_libro sede_fuentes sede_packs`.

## 8. Juego (`js/sede.js`)

Pedidos: **nunca desde el pintado**. Un solo temporizador pide `GET /api/sede` al entrar en modo oficial, cuando termina la
próxima obra y cada 10 minutos; abrir la ventana pide como mucho una vez (y la lista de ayudas, como mucho cada 30 s).
Una respuesta sin la forma esperada (p. ej. `{ok:true}` solo) o un error cuentan como error: espera 1 min y después 5 min.
`tests/test_sede_oficial.js` cuenta los pedidos en 30 s con `{ok:true}` y con 500 mientras repinta ~80 veces (máximo 5; sale 1).

Ya está cargado (`index.html`, `sw.js`). No hace falta nada más: con `Api.disponible` y `Api.logueado()` la tarjeta de Inicio
y la ventana "Mejorar sede" leen y escriben por `/api/sede`. Opcional, en `docs/traducciones/errores.json`: los códigos de
abajo ya tienen texto propio en `js/sede.js` (10 idiomas), así que no hace falta agregarlos.

---

## Cómo funciona (resumen)

| Ruta | Método | Cuerpo | Respuesta |
|---|---|---|---|
| `/api/sede` | GET | — | `{ok, ahora, dia, sede:{nivel, max, materiales, aceleradores_min, mejoras, obreros, etapa, obras[], cofre, bono_competencia, migracion}, creditos, reglas}` |
| `/api/sede/mejorar` | POST | `{clave}` (edificio) | vista |
| `/api/sede/subir` | POST | `{}` | vista |
| `/api/sede/cofre` | POST | `{}` | `{bolsa}` + vista |
| `/api/sede/acelerar` | POST | `{obra_id, confirmar_costo}` o `{obra_id, usar:'aceleradores'}` | `{costo, minutos}` + vista |
| `/api/sede/ayudar` | POST | `{jugador_id, obra_id}` | `{segundos, premio, lista}` |
| `/api/sede/ayudas` | GET | — | `{asociacion, hoy:{ayudas,max,premios,premios_max}, obras[]}` |
| `/api/sede/migrar` | POST | `{local}` (`s.sede` del juego) | `{aceptado, tope, recortado}` + vista |

Errores `{ok:false, error, codigo}`: `edificio_invalido` 400, `ya_hecha` / `en_obra` / `sin_obrero` / `faltan_materiales` (+`falta`) /
`faltan_mejoras` (+`hechas`,`total`) / `requisito` (+`fama`) / `max` / `cofre_ya` (+`proximo`) 409, `obra_no_existe` 404,
`ya_terminada` 409, `confirmar_costo` 400 (+`costo`), `costo_cambio` 409 (+`costo`), `sin_creditos` 402 (+`costo`,`creditos`),
`sin_aceleradores` 409, `misma_cuenta` / `sin_asociacion` 409, `otra_asociacion` 403, `ya_ayudaste` / `ayudas_completas` /
`tope_ayudas_dia` 409, `ya_migrado` 409, `migracion_invalida` 400, `falta_obra_id` / `falta_jugador_id` 400, `limite_intentos` 429.

**Tiempo real.** Un "día del juego" de `js/sede.js` dura `2 + 22 × ((L − 2) / 28)^1,5` horas reales (2 h en el nivel 2,
~5 h en el 10, ~13 h en el 20, 24 h en el 30). Tiempos en segundos Unix (UTC); la entrega diaria es por día de America/Guayaquil.

| Nivel | h por día | mejora | sede principal | nivel completo* | créditos para acelerar todo | bono competencia |
|---|---|---|---|---|---|---|
| 2 | 2,0 | 2 h | 4 h | 12 h | 120 | 0 |
| 5 | 2,8 | 2,8 h | 5,6 h | 16,6 h | 167 | +2 |
| 8 | 4,2 | 8,4 h | 12,6 h | 37,7 h | 377 | +2 |
| 10 | 5,4 | 10,7 h | 16,1 h | 48,2 h | 483 | +4 |
| 15 | 9,0 | 26,9 h | 35,8 h | 116,5 h | 1.165 | +4 |
| 20 | 13,3 | 53,4 h | 66,7 h | 226,8 h | 2.268 | +6 |
| 30 | 24,0 | 144 h | 144 h | 576 h | 5.760 | +6 |

\* mejoras con los equipos de obra que hay (1, o 2 desde el nivel 5) + sede principal, sin ayudas. Solo por tiempo
(los materiales frenan más): nivel 10 en ~10 días, 20 en ~69 días, 30 en ~246 días. Las 10 ayudas quitan ~10 % por obra.

**Costos:** materiales iguales a `js/sede.js` (la prueba los compara nivel por nivel con node). El dinero del juego vive en la
partida y el servidor no lo ve: en la sede oficial no se cobra. Requisito: la **fama pública** (`jugadores.fama_publica`);
los de capítulo/historia son del juego local.

**Acelerar:** `max(5, ceil(segundos que faltan / 360))` créditos (1 cada 6 min). La vista y la ventana muestran el costo;
el juego manda `confirmar_costo` y el servidor cobra el costo de ese momento (si subió: 409 `costo_cambio`). Débito con
`Monedero::mover($j, -costo, 'sede_acelerar', 'sede_obra:<id>')` (libro de créditos).

**Ayudas:** −1 % de la obra o 5 min (lo mayor), máximo 10 por obra, una por persona y obra, 30 por persona y día;
las primeras 10 del día le dan 1 material común al que ayuda. Cada ayuda suma XP del Pase (`Pase::sumarXp($ayudante, Pase::XP['obra_ayuda'], 'obra_ayuda', 'obra:<id>')`,
ya está en `SedeOficial::ayudar`, protegida con `class_exists`).

**Migración:** solo con la sede oficial sin usar y una vez. Tope = `min(8, 2 + 2 × días de la cuenta, nivel que permite su fama)`;
si se recorta el nivel no pasan las mejoras del siguiente; materiales ≤ `40 + 20 × nivel` (chips ≤ nivel / 2). Lo pedido y lo
aceptado queda en `sede_oficial.migrado_json`.

**Juego:** en modo oficial `s.sede` es una copia del servidor (`s.sede.oficial`) y la sede local se guarda en `s.sedeLocal`
(vuelve si no hay cuenta o no hay servidor). Los bonos del juego (`bonoCalidad`, gastos, pago, cupos, taller) salen de esa copia,
o sea del nivel oficial. En modo oficial los eventos de este celular no dan materiales ni se recicla (los materiales salen del servidor).
