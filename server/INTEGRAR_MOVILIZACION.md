# Integrar la movilización y la flota (js/movilizacion.js)

Pedido del dueño: "más movimiento: que se vea lo que va al evento; el personal carga los equipos en la van con el nombre de
la productora. Sin vehículo vas en taxi (lo pides como en una app, con precios); después compras vehículos y creces tu
flota, que tiene mantenimiento. Precios realistas pero acordes a lo que cobras por el trabajo."

- **Reglas** (ya están en js/logic.js y js/datos.js, no hay que tocarlas): `Game.planTransporte`, `Game.flota`,
  `BALANCE.transporte`, `Datos.FLOTA`, `dailyCostBreakdown(s).vehiculos`, `result.transporte`, registro `log.transporte`.
  Los intentos en línea (`s.intento`) no tienen movilización. Sin `Math.random` ni fecha. Partidas viejas cargan igual.
  También quedó `Game.extSuma` + `gastoFijo` en `dailyCost` (sección 5 de INTEGRAR_DECORACION.md).
- **Pantalla**: js/movilizacion.js (sección "Movilización" en la preparación con la app parodia **Llévame**, escena de
  ~3,6 s al tocar "¡Salir al aire!" que se salta tocando —con prefers-reduced-motion es fija 1 s—, fila "Flota" de Inicio
  registrada sola en `window.EnVivoInicio` con id `flota` y orden 12, y la fila de la movilización en el resultado).
  Sus textos (10 idiomas) van dentro del archivo.

Pruebas: `node tests/test_movilizacion.js` (lógica) y
`NODE_PATH=/opt/npm-tools/node_modules node tests/test_movilizacion.js --navegador` (Chromium 390x844, capturas
`tests/capturas/movil_*.png`). La prueba del navegador **lee este archivo** y aplica en memoria cada cambio de abajo que
todavía no esté (así este documento y la prueba no se separan).

Formato: cada `###` es un archivo. "Buscar / Cambiar por": el primer bloque es el texto que ya está (aparece una sola vez)
y el segundo lo reemplaza. "Agregar después de la línea `X`": el bloque va debajo de la única línea que contiene X.

---

## 1. index.html y sw.js (obligatorio)

### 1a. cargar el módulo (con defer, como los demás que no hacen falta para la primera pantalla) — `index.html` — agregar después de la línea `<script defer src="js/intento.js"></script>`

```html
<script defer src="js/movilizacion.js"></script>
```

### 1b. lista de archivos del service worker — `sw.js` — agregar después de la línea `'./js/plan_evento.js',`

```js
  './js/movilizacion.js', // movilización y flota (taxi, vehículos, escena al salir al aire)
```

Con `defer` (tests/test_browser.js permite 14 scripts síncronos y ya hay 14): la fila Flota aparece en el `render()` de `alConectar`, que corre después de los scripts diferidos; la preparación, la escena y el resultado miran `window.Movilizacion` al usarlos.

Y subir `VERSION` de sw.js (por ejemplo `'envivo-v10'` → `'envivo-v11'`) si nadie más lo subió en esta tanda.

## 2. js/ui.js (obligatorio)

### 2a. preparación: sección Movilización (debajo del plan de cámaras y personal) — `js/ui.js`

Buscar:

```js
      ${planHtml ? `<div class="planev">${planHtml}</div>` : ''}`;
```

Cambiar por:

```js
      ${planHtml ? `<div class="planev">${planHtml}</div>` : ''}
      ${window.Movilizacion ? window.Movilizacion.seccionPrep(ctxInicio(), c, [...prep.staff], [...prep.equip]) : ''}`;
```

### 2b. preparación: "Movilización $X · N% del pago" en la línea de sueldos — `js/ui.js`

Buscar:

```js
${c.internacional && c.travelCost ? ` · ${T('prep.viaje', { m: `<b class="num">${M(c.travelCost)}</b>` })}` : ''} · ${rg ? T('prep.rango_det') : T('prep.imprevistos')}</div></div>
```

Cambiar por:

```js
${c.internacional && c.travelCost ? ` · ${T('prep.viaje', { m: `<b class="num">${M(c.travelCost)}</b>` })}` : ''}${window.Movilizacion ? window.Movilizacion.resumenPrep(S, c, [...prep.staff], [...prep.equip]) : ''} · ${rg ? T('prep.rango_det') : T('prep.imprevistos')}</div></div>
```

### 2c. "¡Salir al aire!": la escena del equipo cargando el vehículo y después el evento en vivo — `js/ui.js`

Buscar:

```js
        if (ty === 'final' || ty === 'ligapro') setTimeout(() => mus.stinger(), 900);
        prep = null;
        showIncident();
```

Cambiar por:

```js
        if (ty === 'final' || ty === 'ligapro') setTimeout(() => mus.stinger(), 900);
        prep = null;
        if (window.Movilizacion && window.Movilizacion.animar) window.Movilizacion.animar(ctxInicio(), () => showIncident()); else showIncident();
```

### 2d. resultado: fila de la movilización (debajo de la del viaje) — `js/ui.js`

Buscar:

```js
        ${r.travelCost ? `<tr><td>${T('res.viaje')}</td><td class="down">-${M(r.travelCost)}</td></tr>` : ''}
```

Cambiar por:

```js
        ${r.travelCost ? `<tr><td>${T('res.viaje')}</td><td class="down">-${M(r.travelCost)}</td></tr>` : ''}
        ${window.Movilizacion ? window.Movilizacion.filaResultado(r, M) : ''}
```

### 2e. Inicio, gastos de hoy: "Vehículos $X" (mantenimiento y seguro de la flota) — `js/ui.js`

Buscar:

```js
${cb.fijoExt && window.Decoracion ? ` · ${esc(window.Decoracion.t('c_decor', { m: M(cb.fijoExt) }))}` : ''}</div>
```

Cambiar por:

```js
${cb.fijoExt && window.Decoracion ? ` · ${esc(window.Decoracion.t('c_decor', { m: M(cb.fijoExt) }))}` : ''}${cb.vehiculos && window.Movilizacion ? ` · ${esc(window.Movilizacion.t('gasto', { m: M(cb.vehiculos) }))}` : ''}</div>
```

### 2f. resultado, detalle de los gastos del día: lo mismo — `js/ui.js`

Buscar:

```js
b.fijoExt && window.Decoracion ? window.Decoracion.t('c_decor', { m: M(b.fijoExt) }) : ''].filter(Boolean).join(' · ');
```

Cambiar por:

```js
b.fijoExt && window.Decoracion ? window.Decoracion.t('c_decor', { m: M(b.fijoExt) }) : '', b.vehiculos && window.Movilizacion ? window.Movilizacion.t('gasto', { m: M(b.vehiculos) }) : ''].filter(Boolean).join(' · ');
```

### 2g. Inicio plegable: ícono y título de la fila "flota" (PL_INFO) — `js/ui.js`

Buscar:

```js
    ultimo: ['log', 'inicio.ultimo'], ayuda: ['tip', 'inicio.ayuda'],
```

Cambiar por:

```js
    flota: ['unidad_movil', 'inicio.pl.flota'],
    ultimo: ['log', 'inicio.ultimo'], ayuda: ['tip', 'inicio.ayuda'],
```

El ícono `unidad_movil` ya existe en js/art.js. El resumen de la fila sale del `<h3>` de la tarjeta:
"Sin vehículos: vas en taxi" o "2 vehículos · $9/día". El botón "Ver vehículos" abre Bodega en la categoría `vehicle`.

## 3. Textos de la pantalla: `inicio.pl.flota` en js/lang/*.js (obligatorio)

### es — `js/lang/es.js` — agregar después de la línea `'inicio.pl.decoracion'`

```js
    'inicio.pl.flota': 'Flota y movilización',
```

### en — `js/lang/en.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "Fleet & transport",
```

### pt-BR — `js/lang/pt-BR.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "Frota e transporte",
```

### fr — `js/lang/fr.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "Flotte et transport",
```

### de — `js/lang/de.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "Fuhrpark & Transport",
```

### it — `js/lang/it.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "Flotta e trasporti",
```

### ru — `js/lang/ru.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "Автопарк и транспорт",
```

### tr — `js/lang/tr.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "Filo ve ulaşım",
```

### id — `js/lang/id.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "Armada & transportasi",
```

### zh-CN — `js/lang/zh-CN.js` — agregar después de la línea `"inicio.pl.decoracion"`

```js
    "inicio.pl.flota": "车队与交通",
```

## 4. Textos del juego: vehículos nuevos y registro en js/lang/juego/*.js (obligatorio, tests/test_traduccion_juego.js)

El español ya está en `TEXTOS` de js/datos.js (`log.transporte` y `item.veh_sedan_usado`, `item.veh_van_pasajeros_usada`,
`item.veh_furgon_carga`). El orden de las claves no importa: van todas juntas debajo de la camioneta.

### en — `js/lang/juego/en.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 Transport to {cliente} (round trip, {km} km): {monto}.",
    "item.veh_sedan_usado.nombre": "Used sedan (2009)",
    "item.veh_sedan_usado.desc": "Fits 4 people and small gear in the trunk. Cheap to keep, but no big cases.",
    "item.veh_van_pasajeros_usada.nombre": "Used 12-seat van",
    "item.veh_van_pasajeros_usada.desc": "Takes the whole crew together plus some cargo in the back. Ideal as your staff grows.",
    "item.veh_furgon_carga.nombre": "Cargo box van (new)",
    "item.veh_furgon_carga.desc": "Closed box for 40 cases: cranes, rails and consoles ride along with no delivery fees.",
```

### pt-BR — `js/lang/juego/pt-BR.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 Transporte até {cliente} (ida e volta, {km} km): {monto}.",
    "item.veh_sedan_usado.nombre": "Sedã usado (2009)",
    "item.veh_sedan_usado.desc": "Leva 4 pessoas e equipamento pequeno no porta-malas. Barato de manter, mas não leva volumes grandes.",
    "item.veh_van_pasajeros_usada.nombre": "Van de 12 passageiros (usada)",
    "item.veh_van_pasajeros_usada.desc": "Leva a equipe toda junta e um pouco de carga atrás. Ideal quando a equipe cresce.",
    "item.veh_furgon_carga.nombre": "Furgão de carga (novo)",
    "item.veh_furgon_carga.desc": "Baú fechado para 40 volumes: gruas, trilhos e mesas vão sem pagar frete.",
```

### fr — `js/lang/juego/fr.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 Transport vers {cliente} (aller-retour, {km} km) : {monto}.",
    "item.veh_sedan_usado.nombre": "Berline d’occasion (2009)",
    "item.veh_sedan_usado.desc": "Pour 4 personnes et du petit matériel dans le coffre. Peu chère à entretenir, mais pas de grosses caisses.",
    "item.veh_van_pasajeros_usada.nombre": "Minibus 12 places (occasion)",
    "item.veh_van_pasajeros_usada.desc": "Emmène toute l’équipe ensemble avec un peu de charge à l’arrière. Idéal quand l’équipe grandit.",
    "item.veh_furgon_carga.nombre": "Fourgon de transport (neuf)",
    "item.veh_furgon_carga.desc": "Caisse fermée pour 40 colis : grues, rails et consoles voyagent sans frais de fret.",
```

### de — `js/lang/juego/de.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 Fahrt zu {cliente} (hin und zurück, {km} km): {monto}.",
    "item.veh_sedan_usado.nombre": "Gebrauchte Limousine (2009)",
    "item.veh_sedan_usado.desc": "Für 4 Personen und kleines Equipment im Kofferraum. Günstig im Unterhalt, aber keine großen Kisten.",
    "item.veh_van_pasajeros_usada.nombre": "Gebrauchter 12-Sitzer-Bus",
    "item.veh_van_pasajeros_usada.desc": "Bringt das ganze Team zusammen hin, mit etwas Ladung hinten. Ideal, wenn das Team wächst.",
    "item.veh_furgon_carga.nombre": "Kastenwagen (neu)",
    "item.veh_furgon_carga.desc": "Geschlossener Laderaum für 40 Kisten: Kräne, Schienen und Pulte fahren ohne Frachtkosten mit.",
```

### it — `js/lang/juego/it.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 Trasporto da {cliente} (andata e ritorno, {km} km): {monto}.",
    "item.veh_sedan_usado.nombre": "Berlina usata (2009)",
    "item.veh_sedan_usado.desc": "Per 4 persone e attrezzatura piccola nel bagagliaio. Costa poco da mantenere, ma niente colli grandi.",
    "item.veh_van_pasajeros_usada.nombre": "Minibus 12 posti (usato)",
    "item.veh_van_pasajeros_usada.desc": "Porta tutta la squadra insieme e un po’ di carico dietro. Ideale quando il personale cresce.",
    "item.veh_furgon_carga.nombre": "Furgone da carico (nuovo)",
    "item.veh_furgon_carga.desc": "Cassone chiuso per 40 colli: gru, binari e mixer viaggiano senza pagare noli.",
```

### ru — `js/lang/juego/ru.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 Дорога к {cliente} (туда и обратно, {km} км): {monto}.",
    "item.veh_sedan_usado.nombre": "Подержанный седан (2009)",
    "item.veh_sedan_usado.desc": "4 человека и небольшое оборудование в багажнике. Дёшев в содержании, но крупные кейсы не влезут.",
    "item.veh_van_pasajeros_usada.nombre": "Подержанный микроавтобус на 12 мест",
    "item.veh_van_pasajeros_usada.desc": "Везёт всю команду вместе и немного груза сзади. Идеален, когда штат растёт.",
    "item.veh_furgon_carga.nombre": "Грузовой фургон (новый)",
    "item.veh_furgon_carga.desc": "Закрытый кузов на 40 мест: краны, рельсы и пульты едут без оплаты грузоперевозок.",
```

### tr — `js/lang/juego/tr.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 {cliente} ulaşımı (gidiş-dönüş, {km} km): {monto}.",
    "item.veh_sedan_usado.nombre": "İkinci el sedan (2009)",
    "item.veh_sedan_usado.desc": "4 kişi ve bagajda küçük ekipman alır. Bakımı ucuz ama büyük kasalar sığmaz.",
    "item.veh_van_pasajeros_usada.nombre": "İkinci el 12 kişilik minibüs",
    "item.veh_van_pasajeros_usada.desc": "Tüm ekibi bir arada, arkada biraz yükle taşır. Kadro büyüdükçe ideal.",
    "item.veh_furgon_carga.nombre": "Kapalı kasa kamyonet (sıfır)",
    "item.veh_furgon_carga.desc": "40 koli için kapalı kasa: vinçler, raylar ve mikserler nakliye ücreti ödemeden gider.",
```

### id — `js/lang/juego/id.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 Transportasi ke {cliente} (pulang-pergi, {km} km): {monto}.",
    "item.veh_sedan_usado.nombre": "Sedan bekas (2009)",
    "item.veh_sedan_usado.desc": "Muat 4 orang dan peralatan kecil di bagasi. Murah perawatannya, tapi tidak muat koper besar.",
    "item.veh_van_pasajeros_usada.nombre": "Van 12 penumpang (bekas)",
    "item.veh_van_pasajeros_usada.desc": "Membawa seluruh kru bersama dan sedikit muatan di belakang. Ideal saat tim bertambah.",
    "item.veh_furgon_carga.nombre": "Mobil boks barang (baru)",
    "item.veh_furgon_carga.desc": "Boks tertutup untuk 40 koli: crane, rel, dan konsol ikut tanpa bayar ongkos angkut.",
```

### zh-CN — `js/lang/juego/zh-CN.js` — agregar después de la línea `"item.veh_camioneta_carga.desc"`

```js
    "log.transporte": "🚐 前往 {cliente} 的交通（往返 {km} 公里）：{monto}。",
    "item.veh_sedan_usado.nombre": "二手轿车（2009）",
    "item.veh_sedan_usado.desc": "可坐 4 人，后备箱放小设备。养车便宜，但放不下大箱子。",
    "item.veh_van_pasajeros_usada.nombre": "二手 12 座面包车",
    "item.veh_van_pasajeros_usada.desc": "全队一起出发，后面还能放些货。团队变大时最合适。",
    "item.veh_furgon_carga.nombre": "厢式货车（新）",
    "item.veh_furgon_carga.desc": "封闭货厢可装 40 件：摇臂、轨道和调音台都不用付运费。",
```

## 5. server/src/CatalogoJuego.php (ya hecho)

Se regeneró con `php server/bin/catalogo_juego.php` porque datos.js tiene 3 vehículos nuevos (sin esto
`server/tests/correr.sh` falla en "CatalogoJuego.php al dia con js/datos.js").

---

## Qué hace (para el registro de cambios)

**Movilización en cada evento** (se calcula al salir al aire y se cobra al terminar; `result.transporte`, `result.net` ya lo
descuenta, línea en el registro). Distancia fija por cliente (3-22 km según el tipo de evento; en el tutorial, 3 km).
Personas + bultos (cada equipo ocupa 0,5 a 8 bultos; los alquileres los lleva la rental). Primero va tu flota (cada
vehículo necesita alguien del personal que maneje; el del taller no sale) y lo que no entra va por **Llévame**:

| opción | por viaje | capacidad por auto | llega en |
|---|---|---|---|
| Económico | $1,80 + $0,42/km (mín. $2,50) | 4 asientos, 5 bultos chicos | 3-8 min |
| XL | $3,50 + $0,70/km (mín. $5) | 6 asientos, 10 bultos medianos | 6-11 min |
| Carga (camioneta con chofer) | $20 + $1,60/km (mín. $25) | 2 asientos, 30 bultos de cualquier tamaño | 14-19 min |

Ida y vuelta = 2 viajes. La más barata que sirve ya viene elegida (cero toques extra); tocar otra la guarda en el contrato.
Nunca deja un evento en pérdida: se cobra como mucho el 10% del pago acordado y nunca más de lo que deja el evento (el
resto lo cubre el cliente). Internacionales: va dentro de los gastos de viaje (no se cobra dos veces). Las cotizaciones
incluyen un 3% por movilización.

**Lo que cuesta** (simulación de 10 partidas de 250 días; "propia" = con la van de 12 pasajeros, combustible + lo que no entra):

| evento | pago típico | taxi (ida y vuelta) | % del pago | con van propia |
|---|---|---|---|---|
| tutorial (cap. 0, 3 km) | $160-400 | $6 | 1,5-4% | — |
| misa | $330 | $14 | 4,2% | $2 |
| funeral | $270 | $13 | 4,6% | $1 |
| IRL | $350 | $12 | 3,4% | $2 |
| prensa | $565 | $21 | 3,6% | $2 |
| barrial | $620 | $21 | 3,4% | $1 |
| graduación | $780 | $22 | 2,9% | $7 |
| boda | $960 | $25 | 2,6% | $3 |
| lucha libre | $1.260 | $30 | 2,4% | $12 |
| boxeo | $2.590 | $39 | 1,5% | $12 |
| lanzamiento | $2.720 | $35 | 1,3% | $12 |
| concierto | $4.600 | $52 | 1,1% | $18 |
| liga profesional | $4.900 | $58 | 1,2% | $18 |
| final | $8.500 | $89 | 1,0% | $27 |

**Flota** (Bodega → Vehículos). Mantenimiento + seguro + matrícula por día en "gastos de hoy" (`dailyCostBreakdown(s).vehiculos`,
fuera del 0,2% de seguro de equipos); combustible por km en cada evento; se gastan con los km (1 + km×2/15 por evento) y
con menos de 20% de estado van al taller (reparar cuesta 12% del precio por el daño, no 30%). Rotulados con el nombre de
la productora: +1% en las cotizaciones por vehículo (sedán +0,5%; tope +3%).

| vehículo | precio | fama | asientos | bultos | mant./día | combustible | se paga en (simulación) |
|---|---|---|---|---|---|---|---|
| Sedán usado (2009) | $2.400 | 2 | 5 | 5 chicos | $2 | $0,06/km | ~120 días |
| Camioneta de carga usada | $5.300 | 4 | 5 | 14 | $4 | $0,10/km | ~100 días |
| Van de 12 pasajeros (usada) | $7.300 | 12 | 12 | 12 medianos | $5 | $0,12/km | ~125 días |
| Furgón de carga (nuevo) | $9.400 | 20 | 3 | 40 | $6 | $0,13/km | ~190 días |
| Unidades móviles OB (ya estaban) | — | — | 3-4 | 24-80 | 0,2% del valor | $0,14-0,40/km | — |

Partidas viejas: sin `ev.transporte` el evento en curso termina sin cobrar movilización; sin `contract.movil` va la más
barata; los vehículos que ya tenías entran solos a la flota.
