# Ventajas pagadas, VIP 1–10, regalos de asociación, pase de temporada — contrato común

Reglas que no se rompen: **sin cajas sorpresa** (todo pack muestra su contenido), **los créditos nunca se cambian por
dinero**, todo lo pagado que da poder **también se consigue gratis** (más lento), y la ventaja pagada en competencia
tiene **techo**. Los precios en dinero real los fija el Centro de Control (`productos_ajustes`); aquí van valores por defecto.

## 1. Techo de ventaja pagada en competencia (decisión de Dimitry: 20–25 %)

- En Copa de Servidores y Duelos, el servidor suma a la calidad validada un **bono de ventajas** calculado SOLO en el
  servidor: `Ventajas::bono(int $jugador, string $modo): array` → `{total, partes:[{clave, pts}]}`.
- Partes y topes: `sede` (Sede oficial, hasta **+6**), `estrella` (Personal estrella, hasta **+6**), total **máx. +12**
  puntos de calidad (≈ 20–25 % sobre una calidad típica de 50–60). Constante `Ventajas::TOPE = 12`, editable en `ajustes`
  (`ventajas_tope`).
- Los equipos exclusivos/VIP ya cuentan dentro de la jugada (no suman al bono). Desde oct. 2026 los equipos VIP funcionan
  SIEMPRE (con o sin el Pase VIP) y se cobran del bono: `Ventajas::recorteVip($bono, $equip)` resta `Ventajas::PUNTOS_VIP`
  (cámara y switcher VIP 2, satélite 1; todo VIP = 11). Medido: todo VIP + bono máximo recortado = +21,5 % en copa.
- Pase VIP (30 días): ventajas de comodidad según el nivel VIP (`Vip::PASE`, misma tabla en `js/premium.js`): más eventos
  por día en la historia, reparaciones más baratas, obras de la sede más cortas y bono diario más grande. Nada da poder en
  Copa, Duelos, Liga ni Festival.
- Combo con créditos: lo que necesita un equipo canjeado con créditos se completa con créditos (`POST /api/gastar`
  `juego:<clave>` / `personal:<rol>`, `Monedero::gastarCombo`); en línea la pieza sigue pidiendo su fama.
- **Copa**: puntos de preparación = calidad validada + bono (+ estrellas extra como hoy); en los cruces, cada equipo del
  plantel lleva `bono` y `batalla.js` lo suma a la calidad de su partido (campo opcional `bono` por equipo, 0..12).
- **Duelos**: el bono se suma a la calidad del retador y del fantasma; el emparejamiento sugiere rivales con **poder parecido**.
- Liga, Festival y Desafío: **sin bono** (son de esfuerzo).
- `Ventajas.php` es dueño de la clase y su tabla de ajustes; cada módulo de abajo expone su parte:
  `SedeOficial::bonoCompetencia($j): int` (0..6), `Estrellas::bonoCompetencia($j, $modo): int` (0..6).

## 2. Ganchos del servidor (eventos)

`server/src/Ganchos.php`: `Ganchos::en(string $evento, callable $fn)`, `Ganchos::emitir(string $evento, array $datos)`
(cada oyente en try/catch, nunca rompe la compra). Eventos:
- `compra_aprobada` `{compra_id, jugador_id, producto, monto_usd, canal:'plux'|'google'}` — lo emite `Compras` al aprobar.
- `compra_revertida` `{compra_id, jugador_id, motivo}` — al reembolso/contracargo.
- `creditos_gastados` `{jugador_id, cantidad, motivo, ref}` — lo emite `Monedero` al gastar.
Los módulos se registran en `server/src/arranque.php` (una línea cada uno: `\EnVivo\Vip::registrar();` etc.).

## 3. Módulos y archivos (cada ayudante solo toca los suyos)

| Módulo | Servidor | Juego | Pruebas |
|---|---|---|---|
| VIP 1–10 + regalos de asociación + Mecenas + ofertas escalonadas | `src/Vip.php`, `src/Regalos.php`, `src/VipApi.php`, `src/Ganchos.php`, `src/Ventajas.php`, `migraciones/vip.sql` | `js/vip.js` | `tests/pruebas_vip.php`, `tests/test_vip.js` |
| Sede oficial en el servidor + aceleradores | `src/SedeOficial.php`, `src/SedeApi.php`, `migraciones/sede_oficial.sql` | cambios en `js/sede.js` (modo "oficial" cuando hay sesión) | `tests/pruebas_sede_oficial.php`, `tests/test_sede_oficial.js` |
| Pase de temporada | `src/Pase.php`, `src/PaseApi.php`, `migraciones/pase.sql` | `js/pase.js` | `tests/pruebas_pase.php`, `tests/test_pase.js` |
| Personal estrella + intentos extra | `src/Estrellas.php`, `src/EstrellasApi.php`, `migraciones/estrellas.sql` | `js/estrellas.js` | `tests/pruebas_estrellas.php`, `tests/test_estrellas.js` |

Rutas: cada `XxxApi::esRuta($ruta)` / `XxxApi::responder($ruta, $metodo, $jugador)` como `LigaApi`. Juego: tarjetas en
`window.EnVivoInicio` y/o ficha en la pestaña Tienda/En línea (cada módulo deja las líneas en su `INTEGRAR_*.md`).
**Archivos compartidos** (`api.php`, `Compras.php`, `Monedero.php`, `Catalogo.php`, `Copas.php`, `Duelos.php`,
`batalla.js`, `Cuentas.php`, `arranque.php`, `correr.sh`, `index.html`, `sw.js`, `ui.js`, `js/lang/*`): **nadie los edita**;
cada módulo deja las líneas exactas en `server/INTEGRAR_<MODULO>.md` y el integrador las aplica al final.

## 4. Productos nuevos (para `Catalogo.php`, los agrega el integrador)

- `pase_premium` $4.99 (30 días de la temporada), `pase_premium_plus` $9.99 (premium + 10 niveles ya desbloqueados).
- `pack_obra_s` $1.99 / `pack_obra_m` $4.99 / `pack_obra_l` $9.99: aceleradores de obra + materiales, contenido fijo visible.
- `estrella_copa` (por créditos): contrato de personal estrella por N partidos de copa.
- `pase_copa` (por créditos o $2.99): +5 intentos de preparación por día durante la copa de esa semana.
Las ofertas escalonadas (VIP) son variantes de packs existentes con contenido fijo y un tope de compras.

## 5. Edición Exclusiva: un equipo top por categoría con créditos

Pedido de Dimitry: que en TODAS las categorías haya un equipo top que se pueda canjear con créditos. Las que no tenían
(cámaras, switchers, vehículos y energía ya tienen; alquiler por evento no aplica) llevan uno `ex_*`:

| Categoría | id | Calidad (= mejor normal) | Créditos | Con créditos desde fama | Gratis: dinero del juego / fama |
|---|---|---|---|---|---|
| Lentes | `ex_lente_box` | 6 (= 6) | 900 | 45 | $66.500 / 75 |
| Soportes | `ex_soporte` | 5 (= 5) | 450 | 28 | $15.000 / 55 |
| Repeticiones | `ex_repeticion` | 6 (= 6) | 950 | 45 | $64.500 / 75 |
| Gráficos | `ex_graficos` | 6 (= 6) | 850 | 55 | $35.000 / 85 |
| Monitores | `ex_monitor` | 5 (= 5) | 300 | 28 | $3.800 / 55 |
| Audio | `ex_audio` | 6 (= 6) | 600 | 45 | $18.500 / 75 |
| Micrófonos | `ex_mics` | 3 (= 3) | 250 | 4 | $1.600 / 22 |
| Intercom | `ex_intercom` | 5 (= 5) | 500 | 28 | $14.000 / 55 |
| Encoders | `ex_encoder` | 5 (= 5) | 550 | 28 | $11.500 / 55 |
| Internet | `ex_internet` | 2 (mejor normal 1; máximo de la categoría 5) | 150 | 0 | $400 / 10 |
| Video inalámbrico | `ex_wireless` | 4 (= 4) | 300 | 12 | $2.900 / 38 |
| Fibra y cables | `ex_cable` | 4 (= 4) | 200 | 12 | $1.650 / 38 |
| Lluvia | `ex_lluvia` | 3 (= 3) | 100 | 4 | $700 / 22 |
| Maletas | `ex_maletas` | 2 (= 2) | 120 | 0 | $850 / 14 |

- **Sin ventaja en la competencia**: misma calidad que el mejor normal; en Copa y Festival cuentan como equipo del juego con
  la fama del camino gratis (`minRep`, más alta que la del mejor normal), así que nadie lleva uno antes que lo que se compra
  con dinero del juego. No están en `Duelos::EQUIPOS` (el kit del duelo sigue igual para todos) y no suman al bono de Ventajas.
- **Ventajas que no dan puntos**: se gastan la mitad (`desgaste: 0.5`, durabilidad 5), repararlos cuesta la mitad
  (`repairBase`), ocupan menos bultos en el transporte, acabado dorado, y con créditos se desbloquean antes (`minRepCreditos`).
  El seguro diario se calcula con el valor del mejor normal (`valor`), no con su precio en dinero del juego.
- **Gratis (más lento)**: se compran con dinero del juego (≈1,5 veces el mejor normal) desde más fama, o en el mercado entre
  jugadores (el canjeado con créditos vive en `inventario`, con número de serie; tope 3 veces su costo).
- **Contenido fijo y visible**: 1 equipo; el canjeado con créditos no se vende al desarmadero (se revende en el mercado).
- Datos: `js/datos.js` (CATALOGO, `exclusivo: true`), `server/src/Catalogo.php` (PREMIUM, EQUIPOS, MERCADO_PRECIO_MAX),
  `server/src/CatalogoJuego.php` (generado). El costo y "activo" se cambian en el Centro de Control como cualquier exclusivo.
- Juego: Bodega → Tienda de equipos muestra arriba de cada categoría sus equipos con créditos (tarjeta dorada, botón 💎);
  sin cuenta, el botón pide crearla. Prueba: `tests/test_exclusivos.js`.


## 6. Premios por constancia en las misiones (F2P) — pedido de Dimitry, 26 oct. 2026

"A los F2P demos regalos si hacen misiones; eso casi no les gusta a las ballenas porque compran, pero sí a los F2P; así
consiguen algunas cosas." Diseño (tabla fija, igual en `server/src/Misiones.php` y `js/misiones.js`; pruebas
`server/tests/pruebas_misiones.php` y `tests/test_misiones_f2p.js`):

- **Día activo** = un día en que abriste el cofre de 60 puntos de las misiones del día (3 misiones). Con cuenta lo cuenta el
  servidor con sus propios reclamos (`misiones_reclamos`, clave `cofre60`); sin cuenta, la partida (`s.misiones.h`).
- **Cofre de la semana** (5 de 7 días activos): $2.000 del juego, 10 cables, 10 placas, 10 paneles LED, 1 chip 4K y, con
  cuenta, **25 créditos + el premio de la semana**, que rota cada lunes:
  1. equipo de obra extra de la sede oficial por 24 h (`Impulsos::darHoras`),
  2. personal estrella de la semana por 2 partidos de Copa o Duelos (`Estrellas::otorgar`, origen `regalo`; cuenta dentro
     del techo de ventajas de siempre, no lo sube),
  3. prueba del Pase VIP por 1 día (`Monedero::sumarVip`; se suma al que ya tengas).
- **Ruta del mes** (días activos en el mes): 7 días → $1.500, 8 planos, 8 credenciales, 20 créditos; 14 días → $2.500,
  12 paneles LED, 2 chips 4K, 30 créditos; 21 días → $3.000 y **un equipo de Edición Exclusiva permanente** (con cuenta),
  que rota cada mes entre los 6 más baratos: cobertor de lluvia, maletas, fibra SMPTE, micrófonos, monitor OLED y video
  inalámbrico (100–300 créditos en la tienda). Va al inventario del servidor (origen `misiones`), con número de serie.
- **Sin cuenta**: solo el dinero del juego y los materiales (a la sede local); créditos, premio de la semana y exclusivo se
  muestran con candado ("con cuenta").
- **Topes de créditos** (servidor): `misiones_creditos_dia` = 10 (solo los cofres del día, sin cambios) y nuevo
  `misiones_creditos_semana` = 120 para todo lo de misiones. Un F2P legal nunca llega al tope semanal (máximo ≈ 81 + hitos);
  solo frena a quien juegue con la fecha del celular.
- **Validación**: igual de modesta que el resto de misiones (el servidor no ve la partida), pero el conteo de días es del
  servidor y cada premio se da una sola vez por semana / mes (UNIQUE). Las ventajas en línea **no cambian**
  (`Ventajas.php` intacto; el exclusivo tiene la misma calidad que el mejor normal).

### Economía (créditos)

| Jugador gratis | Por semana | Por mes (≈4,3 semanas) |
|---|---|---|
| Antes: cofres 60 + 100 todos los días | 56 | ≈ 240 |
| Ahora, mínimo para la constancia (5 días, solo cofre 60) | 15 + 25 = 40 (+ hitos ≈ 12) | ≈ 220 |
| Ahora, constante (7 días, cofres 60 + 100) | 56 + 25 = 81 (+ hitos ≈ 12) | ≈ 400 |

- Paquete más barato: 250 créditos a $1,99 (≈ $0,008 por crédito). El F2P más constante junta ≈ 400 créditos al mes
  (≈ $3,20 en créditos): el paquete más barato cada ~2,7 semanas (antes ~4,5).
- Quien paga sigue muy arriba: Tarjeta mensual $4,99 = 600 créditos; Tarjeta semanal $1,99 = 105 créditos + materiales en
  7 días; Pase VIP $9,99 = 30 días (el F2P prueba 1 día cada 3 semanas); un exclusivo al mes contra todo el catálogo
  (los caros de 450–950 créditos siguen siendo de pago o de ahorro largo).
- Valor aproximado de lo no-crédito al mes para un F2P constante: 1 exclusivo barato (100–300 créditos de catálogo) +
  ~1,4 de cada premio de la semana (24 h de obra, 2 partidos de estrella ≈ 60–120 créditos, 1 día VIP).
