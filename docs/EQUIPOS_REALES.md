# Equipos reales para EN VIVO Tycoon

> **AVISO INTERNO:** la columna **"referencia real"** y los precios reales son solo para el equipo de desarrollo.
> **Nunca deben aparecer en el juego** (ni marcas ni modelos reales, ni logos). En el juego solo se usan el nombre parodia,
> la marca parodia, el precio del juego y el "dato clave". `equipos_reales.json` no incluye la referencia real.

Investigación: 23 de octubre de 2026. Precios en USD de tiendas de EE.UU./Europa (B&H, Markertek, Sweetwater, Full Compass, Videoguys,
distribuidores y usados). EUR y GBP convertidos aproximadamente (1 EUR ~ 1,08 USD; 1 GBP ~ 1,27 USD). "estimado" = no se abrió una página con el precio exacto:
el número viene de conocimiento del mercado y debe tomarse como rango. Las fuentes F# están al final.

## 0. Cómo se usa este documento

- **Catálogo:** `docs/equipos_reales.json` (115 equipos) con los campos `key, nombre, marca_parodia, categoria, subtipo, calidad, precio_juego, precio_real_usd, eventos_ideales, requiere, acepta, dato, rareza` y, además, `durabilidad` (1-5) y `es_alquiler_por_evento`.
- **Eventos y personal:** `docs/eventos_y_personal.json` (roles, niveles, 16 eventos, contratos internacionales).
- Las categorías del juego reutilizan las actuales (`cam, switcher, audio, mics, encoder, internet, power, rain`) y suman: `lens` (lentes), `support` (trípodes, gimbal, jib), `replay`, `graphics`, `intercom`, `wireless` (video inalámbrico), `cable` (fibra), `monitor`, `case`, `vehicle`, `service` (alquiler por evento) y `consumable`.

### 0.1 Precio en el juego: una sola curva (no un divisor fijo)

Un divisor único no funciona: con ÷20, un micrófono de $98 costaría $5 y una consola de $189 costaría $9 (sin sentido),
y si se elige ÷2 para que lo barato quede bien, una cámara de sistema de $100.000 costaría $50.000, imposible con pagos de $150-$10.000.
Propuesta:

```
precio_juego = min(precio_real, 4,35 × precio_real^0,75)      (redondeado)
alquiler por evento (service) = esa misma fórmula ÷ 3
```

- Hasta ~$360 el precio del juego es el real (micrófonos, cables, baterías, ATEMA Mini). Encima de eso se comprime: el doble de caro en la vida real es ~1,7 veces más caro en el juego.
- **La misma curva convierte los pagos reales de eventos en los pagos actuales del juego** (misa real $150-400 -> juego $150-390; LigaPro real $6.000-15.000 -> juego $3.000-6.000; final real $15.000-40.000 -> juego $5.900-12.500). Por eso la proporción "precio del equipo / lo que se gana" queda realista.
- Ejemplos: camcorder $1.000 -> $770 · XA65 $1.970 -> $1.300 · cámara ENG 4K $40.000 -> $12.500 · cámara de sistema 4K $106.000 -> $25.500 · lente box 100x -> $32.500 · OB 8 cámaras $680.000 -> $105.000.
- Resultado: una cámara de sistema 4K + lente box 4K (~$25.500 + ~$27.000) equivale a 4-9 finales: meta de fin de juego. El camión OB es la aspiración final y el tráiler UHD de 20 cámaras (~$390.000) es un sueño VIP.
- Excepciones sugeridas: (1) los **servicios** son alquiler por evento (÷3, y el cliente puede pagar parte en finales); (2) la suscripción de bonding es un gasto diario/mensual; (3) los equipos **exclusivos** de la tienda de créditos no tienen precio en dinero (se muestra el equivalente como referencia).

### 0.2 Calidad 1-6

| Calidad | Significado | Ejemplo |
|---|---|---|
| 1 | Consumo / arranque | camcorder doméstica, consola analógica 12 canales |
| 2 | Prosumer | camcorder con XLR, PTZ de iglesia, ATEMA Mini Extremo |
| 3 | Profesional | camcorder 1" con SDI, cámara de hombro económica, switcher SDI |
| 4 | Broadcast | PTZ broadcast, ENG 4K de hombro, lentes ENG 4K, 2 M/E |
| 5 | Sistema / TV nacional | cámara de sistema con CCU, box 86-100x HD, EVX Nano |
| 6 | Élite 4K HDR / mundial | cámara de sistema 4K HDR, box 4K 107-122x, súper lenta, EVX VIA, arañacam |

**Durabilidad (1-5)** sugerida como multiplicador de desgaste por evento: 1 = x1,5 · 2 = x1,25 · 3 = x1,0 · 4 = x0,85 · 5 = x0,7. Lo de consumo y los drones son frágiles; lo broadcast aguanta.

**Rareza:** `comun` (calidad 1-2) · `profesional` (3, algunos 4) · `elite` (4-6, pide fama alta) · `exclusivo` (solo con créditos, como los premium actuales) · `vip` (solo con Pase VIP).

### 0.3 Cámaras, lentes y requisitos (`requiere` / `acepta`)

- **Camcorders, PTZ, minicámaras, drones:** lente fijo incluido. La PTZ necesita `operador_ptz` (un operador maneja 3-4 PTZ).
- **Cámaras de hombro con montura B4** (URSO, PXV-Z760): necesitan comprar un **lente ENG** (`lente_eng`). Sin lente no funcionan.
- **Cámaras de sistema** (HDK-3200, HDK-3600, HDK-5600): necesitan **lente B4** (ENG o box), **cable de fibra SMPTE** y un **shader** en el personal (si no hay shader: penalidad de color "cancha radioactiva").
- **Lentes box** (23x a 122x): solo en **cámara de sistema** + **adaptador de lente grande** + **soporte pesado** (Vinter 760). Son la cámara de tribuna; no van al hombro.
- **Cámara de cine** (FZ6, Fantomas): necesita `lente_cine`. **Estudio Cam**: `lente_mft`.
- **Extensores:** casi todos los lentes ENG y box traen duplicador 2x interno (en el juego: botón "duplicar zoom" que oscurece un poco la imagen); no hace falta comprarlo aparte.
- **Servidor de repetición** y **gráficos** necesitan su operador (`operador_repeticion`, `operador_graficos`).
- **Leyenda de `requiere` / `acepta`:** cada valor es (a) una clave de rol de `eventos_y_personal.json` (`shader`, `operador_ptz`, `operador_repeticion`, `operador_graficos`, `microfonista`, `piloto_dron`), (b) un tipo de equipo: `lente_eng`, `lente_box`, `lente_cine`, `lente_mft` (= subtipo de lente), `lente_b4` (= cualquier `lente_eng` o `lente_box`), `montura_b4` (= cámara de hombro o de sistema), `cam_sistema` (= subtipo `sistema`, `sistema_4k` o `super_lenta`), `cam_sistema_4k`, `cable_fibra_smpte`, `adaptador_lente_box`, `soporte_pesado`, `servidor_repeticion` (= categoría `replay`), `generador` (= subtipo `generador_diesel`) o (c) una clave exacta del catálogo.

## Catálogo por categoría

### 1. Cámaras

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| GoPra HÉROE 13 | GoPro HERO13 Black | $380 | $370 | cam / accion | 1 | IRL, lucha libre, autos | Cámara de acción resistente al agua, transmite desde el celular. Vista POV. | comun | 4 | F19 |
| Zony Handicam FDX-AX44 | Sony FDR-AX43A (Handycam 4K) | $850-$1.100 | $750 | cam / camcorder_consumo | 1 | misa, funeral, boda, prensa | 4K, zoom 20x, estabilizador. Solo micro-HDMI y micrófono de 3,5 mm: el cable HDMI se suelta fácil. | comun | 2 | estimado (F9 specs) |
| Celular gama alta + gimbal DGI Osmo Móvil 8 | Teléfono gama alta + DJI Osmo Mobile 8 ($149) | $1.000-$1.500 | $900 | cam / celular | 1 | IRL, funeral, prensa | Cámara, encoder y módem en un solo aparato. Se calienta y se descarga rápido. | comun | 2 | F19 + estimado |
| DGI Osmo Bolsillo 3 | DJI Osmo Pocket 3 | $549 | $490 | cam / gimbal_compacta | 2 | IRL, boda, autos | Cámara de bolsillo con gimbal y sensor 1". La favorita de los streamers IRL. | comun | 2 | F19 |
| Marchall CV513 Minicámara POV | Marshall CV503 | $600-$900 | $610 | cam / pov | 2 | boxeo, lucha libre, concierto, autos, LigaPro | Minicámara fija para el arco, la esquina del ring, la batería o el auto. No necesita camarógrafo. | comun | 4 | F18 + estimado |
| Blackmagia Estudio Cam 4K Plus G3 | Blackmagic Studio Camera 4K Plus G2 | $1.555 | $1.100 | cam / estudio_ligera | 2 | graduación, lanzamiento, misa, prensa, boxeo | 4K60, pantalla 7", tally y talkback por el cable SDI. Necesita lente aparte. Requiere: lente_mft. | comun | 3 | F14 |
| Panasonika AW-UV22 | Panasonic AW-UE20 | $1.786-$2.102 | $1.250 | cam / ptz | 2 | misa, funeral, prensa | Robótica 4K pequeña, 12x, un solo cable de red (PoE). Ideal para iglesias y auditorios. Requiere: operador_ptz. | comun | 3 | F12 |
| Kanon XA65 | Canon XA60 | $1.949-$1.999 | $1.300 | cam / camcorder_pro | 2 | boda, misa, prensa, graduación, barrial | 4K, zoom 20x, 2 entradas XLR. Salida HDMI (sin SDI): cables cortos. | comun | 3 | F7 |
| OptiPTZ Movil 4K 22X | PTZOptics Move 4K 20x | $2.349-$2.589 | $1.500 | cam / ptz | 2 | misa, funeral, prensa, graduación, lanzamiento | Robótica 4K, 20x, seguimiento automático, red NDI/SRT. Solo interiores. Requiere: operador_ptz. | comun | 3 | F11 |
| DGI Micro 4 Pro (dron) | DJI Mini 4 Pro | $800-$1.130 | $740 | cam / dron | 3 | boda, autos, barrial, concierto | Dron liviano 4K. Tomas aéreas de apertura; con viento fuerte no vuela. Requiere: piloto_dron. | comun | 1 | F20 |
| Blackmagia URSO Broadcast G3 | Blackmagic URSA Broadcast G2 | $4.400-$4.900 | $2.450 | cam / eng_hombro | 3 | barrial, concierto, LigaPro, boxeo, lucha libre | Al hombro, montura B4: usa lentes ENG de televisión. 4K/6K, SDI. Requiere: lente_b4. | profesional | 3 | F15 |
| Zony PXV-Z210 | Sony PXW-Z200 | $4.680 | $2.450 | cam / camcorder_pro_sdi | 3 | barrial, lanzamiento, concierto, LigaPro, boxeo | Sensor 1", zoom 20x, 12G-SDI, 4K60 HDR. La de mano típica de cancha. | profesional | 3 | F6 |
| Kanon XF615 | Canon XF605 | $4.799-$5.049 | $2.550 | cam / camcorder_pro_sdi | 3 | graduación, lanzamiento, concierto, barrial, prensa | Sensor 1", zoom 15x, 12G-SDI (cable largo hasta el switcher), 4K60. | profesional | 3 | F8 |
| JVK GY-HK560 Conectada | JVC GY-HC550 | $5.300-$5.700 | $2.800 | cam / camcorder_streaming | 3 | prensa, barrial, IRL, int. unilateral | Sensor 1", 20x y encoder interno: transmite sola por SRT sin switcher. | profesional | 3 | estimado (F10 specs) |
| Zony FZ6 Cine | Sony FX6 | $6.000-$6.998 | $3.150 | cam / cine | 3 | boda, lanzamiento, autos, concierto | Full frame, 4K 120p, fondo desenfocado de cine. Para gimbal o steadicam. Requiere: lente_cine. | profesional | 3 | F16 |
| Panasonika AW-UV170 | Panasonic AW-UE160 | $12.473-$14.674 | $5.450 | cam / ptz_broadcast | 4 | concierto, LigaPro, final, lanzamiento, autos | Robótica broadcast: sensor 1", 20x, 12G-SDI y fibra, 120p en HD. Táctica o detrás del arco. Requiere: operador_ptz. | elite | 4 | F13 |
| Zony PXV-Z760 | Sony PXW-Z750 (cuerpo) | $38.784-$40.810 | $12.500 | cam / eng_hombro | 4 | LigaPro, final, concierto, boxeo, int. unilateral | 3 sensores 2/3" 4K, obturador global (sin "gelatina" con flashes), 120p en HD. Sin lente. Requiere: lente_b4. | elite | 5 | F5 |
| DGI Inspira 3X Cine (dron) | DJI Inspire 3 + Zenmuse X9 | $16.000-$18.000 | $6.450 | cam / dron_cine | 5 | autos, concierto, final, int. host | Dron de cine 8K de doble operador (piloto + cámara). Necesita permiso de vuelo. Requiere: piloto_dron. | exclusivo | 2 | F21 |
| Fantomas VIO 4K Ultra Movimiento | Phantom VEO4K 990S (usada) | $28.000-$32.000 | $9.900 | cam / ultra_movimiento | 5 | final, boxeo, int. host | Graba ráfagas de 1.000 cuadros por segundo: no es en vivo continuo, sirve para repeticiones espectaculares. Requiere: operador_repeticion, lente_cine. | elite | 3 | F17 |
| Zony HDK-3200 (cadena con CCU) | Sony HDC-3100 + HDCU-3100 (+licencia progresivo) | $40.139-$46.188 | $13.000 | cam / sistema | 5 | LigaPro, final, concierto, int. host | Cámara de sistema: viaja por fibra hasta su CCU y el shader le ajusta el color a distancia. 2/3" HD/4K. Requiere: lente_b4, cable_fibra_smpte, shader. | elite | 5 | F4, F2 |
| Zony HDK-3600 4K HDR (cadena con CCU) | Sony HDC-3500 + HDCU-3500 + licencias | $90.029-$125.000 | $25.500 | cam / sistema_4k | 6 | final, LigaPro, int. host | La cámara principal de una final: 4K HDR, 2/3" global shutter. Con lente box 100x+ en la tribuna. Requiere: lente_b4, cable_fibra_smpte, shader. | elite | 5 | F1, F2, F3 |
| Zony HDK-5600 Ultra Lenta (HFR) | Sony HDC-5500 + licencia HFR (estimado) | $150.000-$250.000 | $40.000 | cam / super_lenta | 6 | final, int. host | Súper cámara lenta (hasta 8x en HD) conectada al servidor de repeticiones. Los goles se ven en otra dimensión. Requiere: lente_b4, cable_fibra_smpte, shader, servidor_repeticion. | elite | 5 | estimado |

### 1b. Cámaras especiales como servicio (alquiler por evento)

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Grúa de 12 m con operador - servicio | Jimmy Jib 12 m (alquiler) | $940-$2.200 /uso | $340 /evento | service / grua | 4 | concierto, autos, final, graduación, lanzamiento | Barridos sobre el público. Necesita espacio y un operador especializado. | profesional | 4 | F35, F22 |
| Cámara en riel / cablecam lineal - servicio | Rail cam / cablecam lineal (alquiler) | $2.000-$4.200 /uso | $570 /evento | service / riel | 4 | LigaPro, final, concierto, autos | Corre por un riel paralelo a la línea de banda o a la valla del escenario. | profesional | 4 | F22 |
| Arañacam (cámara aérea por cables) - servicio | Spidercam (alquiler por partido) | $33.000-$36.000 /uso | $3.650 /evento | service / camara_aerea_cables | 6 | final, int. host, concierto | Cámara colgada de 4 cables que vuela sobre la cancha. Viene con piloto y operador. Requiere: generador. | vip | 4 | F22, F74 |

### 2. Lentes

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Lente kit 14-140 (montura MFT) | Lente zoom MFT tipo 14-140 / 12-35 | $400-$900 | $530 | lens / lente_mft | 1 | misa, graduación, prensa | Zoom corto para cámaras de estudio livianas. Sirve para planos medios, no para lejos. | comun | 3 | estimado |
| Zony Gran Maestro 24-75 II | Sony FE 24-70 GM II | $2.200-$2.400 | $1.450 | lens / lente_cine | 2 | boda, lanzamiento, autos, concierto | Lente luminoso para cámara de cine: fondo desenfocado, poco zoom. | comun | 3 | estimado |
| Kanon KX21x8.2 IRSD (ENG HD 20x) | Canon KJ20x8.2B IRSD | $7.900 | $3.650 | lens / lente_eng | 3 | barrial, concierto, LigaPro, boxeo, lucha libre | ENG 20x con duplicador 2x interno (hasta 328 mm). El lente de hombro clásico. Requiere: montura_b4. | profesional | 4 | F27 |
| Fujinox XA23x7 Box de estudio | Fujinon XA22x7 (box estudio, usado) | $6.000-$18.000 | $4.500 | lens / lente_box | 4 | boxeo, concierto, graduación, lanzamiento | Lente box corto: planos abiertos en estudio, ring o escenario. Requiere: cam_sistema, adaptador_lente_box, soporte_pesado. | profesional | 4 | estimado |
| Adaptador de lente grande para cámara de sistema | Sony HDLA-3500 / Fujinon supporter (estimado) | $8.000-$15.000 | $4.650 | lens / adaptador_lente_box | 4 | LigaPro, final, concierto | Convierte la cámara de sistema portátil en "cámara de tribuna" para montar un lente box. Requiere: cam_sistema. | elite | 5 | estimado |
| Fujinox UX15x4.5 Gran Angular 4K | Fujinon UA14x4.5BERD | $20.000-$30.000 | $8.500 | lens / lente_eng | 4 | concierto, LigaPro, final, boxeo | Angular 4K (93°): ideal en escenario, bancas y ring. Duplicador 2x interno. Requiere: montura_b4. | elite | 4 | estimado (F29 specs) |
| Kanon DIGISUPRA 75 (box 72x) | Canon DIGISUPER 72/75 (usado) | $40.000-$70.000 | $15.000 | lens / lente_box | 4 | LigaPro, concierto, final | Box 72x: cámara cerrada de tribuna en estadios medianos. Requiere: cam_sistema, adaptador_lente_box, soporte_pesado. | elite | 4 | estimado |
| Kanon CX25ex7.5 (ENG 4K 24x) | Canon CJ24ex7.5B / CJ20ex7.8B 4K (usado ~ nuevo) | $12.500-$38.000 | $7.800 | lens / lente_eng | 5 | LigaPro, final, concierto, int. unilateral | ENG 4K largo con 2x interno. En cancha y en tribuna baja. Requiere: montura_b4. | elite | 4 | F17, F28 |
| Kanon DIGISUPRA 88 (box 86x) | Canon DIGISUPER 86 (usado) | $50.000-$90.000 | $18.000 | lens / lente_box | 5 | LigaPro, final, int. host | 9-800 mm con 2x (hasta 1.600 mm). Se usa también en súper lentas. Requiere: cam_sistema, adaptador_lente_box, soporte_pesado. | elite | 4 | F26 + estimado |
| Fujinox XA105x8.9 (box HD 101x) | Fujinon XA101x8.9 (HD) | $90.000-$233.490 | $32.500 | lens / lente_box | 5 | LigaPro, final, int. host | Box 100x HD con asistente de foco: la cara del jugador desde la tribuna opuesta. Requiere: cam_sistema, adaptador_lente_box, soporte_pesado. | elite | 4 | F25 |
| Fujinox UX108x8.4 (box 4K 107x) | Fujinon UA107x8.4 (4K, estabilizado) | $85.000-$150.000 | $27.000 | lens / lente_box | 6 | final, LigaPro, int. host | Box 4K 107x con estabilizador óptico. Lente de final. Requiere: cam_sistema, adaptador_lente_box, soporte_pesado. | elite | 4 | F24 |
| Kanon UHD-DIGISUPRA 125 AF (box 4K 122x) | Canon UHD-DIGISUPER 122 AF | $200.000-$250.000 | $44.500 | lens / lente_box | 6 | final, int. host | 8,2-1.000 mm (2.000 mm con 2x) y autofoco con seguimiento. El lente más grande del juego. Requiere: cam_sistema_4k, adaptador_lente_box, soporte_pesado. | elite | 4 | F23 + estimado |

### 3. Soportes de cámara

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Trípode de video básico Manfrotti Compacto | Trípode de video económico | $100-$250 | $160 | support / tripode | 1 | misa, funeral, boda, prensa | Cabezal de fricción: los paneos salen a saltos. | comun | 2 | estimado |
| DGI RZ 4 Pro (gimbal) | DJI RS 4 Pro | $850-$1.100 | $750 | support / gimbal | 2 | boda, autos, lanzamiento, concierto | Gimbal de mano para cámara de cine: tomas caminando sin temblor. | comun | 3 | estimado |
| Manfrotti 504X con patas gemelas | Manfrotto 504X + 645 Fast Twin | $1.000 | $770 | support / tripode_fluido | 2 | boda, graduación, barrial, prensa, lanzamiento | Cabezal fluido hasta 12 kg: paneos suaves con camcorders y cámaras chicas. | comun | 3 | F30 |
| Jib Proeme 4 m | Proaim 14 ft jib | $1.500-$3.000 | $1.350 | support / jib | 3 | graduación, boda, lanzamiento, concierto, lucha libre | Grúa chica con cabeza remota: tomas desde arriba del público. | profesional | 3 | estimado |
| Dolly con riel de 6 m | Dolly + riel recto 6 m | $1.500-$4.000 | $1.500 | support / dolly | 3 | autos, concierto, lanzamiento | Travelling suave junto al escenario o al auto. | profesional | 4 | estimado |
| Sachtel aktiv8 flowtec75 | Sachtler aktiv8 flowtech75 MS | $2.384-$4.384 | $1.850 | support / tripode_fluido | 3 | concierto, LigaPro, boxeo, lanzamiento | Trípode broadcast de nivelación rápida para cámaras de hombro. | profesional | 4 | F31 |
| Steadikam Aéreo 32 (chaleco y brazo) | Steadicam AERO 30 | $6.000-$8.000 | $3.300 | support / steadicam | 4 | LigaPro, final, boxeo, concierto, boda | Chaleco con brazo para 9 kg: salida de equipos, caminata al ring, festejos. | profesional | 3 | estimado (F34 carga) |
| DGI Ronan 2 (gimbal pesado) | DJI Ronin 2 | $6.999 | $3.350 | support / gimbal | 4 | concierto, autos, final | Gimbal para 13 kg: va en grúa, auto o cablecam. | profesional | 3 | F33 |
| Vinter Vector 760 + trípode pesado | Vinten Vector 750 (cabezal $25.237) + patas pesadas | $28.000-$35.000 | $10.000 | support / soporte_pesado | 5 | LigaPro, final, concierto, int. host | Cabezal para 75 kg: obligatorio para cámaras con lente box. | elite | 5 | F32 + estimado |

### 4. Switchers, repetición, gráficos y multiview

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Blackmagia ATEMA Mini Pro | Blackmagic ATEM Mini Pro | $295 | $300 | switcher / mini_hdmi | 1 | misa, boda, prensa, funeral, barrial | 4 entradas HDMI y streaming directo. Botones físicos, no se cuelga. | comun | 3 | F36 |
| Laptop con vMax Básico HD | vMix Basic HD ($60) + laptop gamer | $860-$1.260 | $800 | switcher / software | 1 | misa, funeral, boda, prensa | Solo 4 entradas (3 cámaras). Mezcla, gráficos simples y transmite. | comun | 2 | F38 + estimado |
| KasparCG (gráficos libres) + PC | CasparCG (gratis) + PC con capturadora | $1.500-$2.500 | $1.250 | graphics / software | 2 | barrial, boxeo, lucha libre, graduación, prensa | Marcador, reloj, nombres y logos. Gratis, pero hay que armar las plantillas. Requiere: operador_graficos. | comun | 3 | F75 + estimado |
| Blackmagia ATEMA Mini Extremo ISO G3 | Blackmagic ATEM Mini Extreme ISO G2 | $2.300-$2.600 | $1.500 | switcher / mini_hdmi | 2 | graduación, lanzamiento, barrial, boxeo | 8 HDMI, graba cada cámara por separado (ISO) y transmite. | comun | 3 | F37 |
| PC de producción con vMax HD | vMix HD ($350) + PC de escritorio | $2.350-$3.350 | $1.700 | switcher / software | 2 | barrial, graduación, lanzamiento, prensa | Entradas ilimitadas por NDI/SRT, gráficos y marcador. Necesita buen operador. | comun | 3 | F38 + estimado |
| Blackmagia MultiVista 16 | Blackmagic MultiView 16 | $900-$1.100 | $770 | monitor / multiviewer | 3 | LigaPro, concierto, final, boxeo | Muestra 16 cámaras en una pantalla: el director ve todo a la vez. | profesional | 4 | estimado |
| Blackmagia ATEMA 1 M/E Constelación HD | Blackmagic ATEM 1 M/E Constellation HD | $1.195 | $880 | switcher / sdi | 3 | barrial, graduación, boxeo, lucha libre | 10 entradas SDI con multiview. Cables de 100 m sin perder señal. | profesional | 4 | F39 |
| Blackmagia ATEMA TV Estudio HD9 ISO | Blackmagic ATEM Television Studio HD8 ISO | $4.409 | $2.350 | switcher / sdi | 3 | barrial, concierto, LigaPro, boxeo | 8 SDI con panel incorporado, talkback y grabación ISO. | profesional | 4 | F40 |
| PC de repetición vMax Pro dedicada | vMix Pro como servidor de repetición dedicado | $4.200-$5.000 | $2.400 | replay / software | 3 | barrial, LigaPro, boxeo, lucha libre | Repeticiones de hasta 8 cámaras en cámara lenta. Se cuelga si la PC es débil. Requiere: operador_repeticion. | profesional | 3 | F38 + estimado |
| Estación vMax Pro (con repetición) | vMix Pro ($1.200) + PC potente con capturadoras | $4.200-$5.700 | $2.550 | switcher / software | 3 | barrial, lanzamiento, concierto, boxeo, lucha libre | Incluye repetición de 8 cámaras y varias salidas. La "TV en una PC". | profesional | 3 | F38 + estimado |
| Blackmagia ATEMA 2 M/E Constelación 4K + panel | Blackmagic ATEM 2 M/E Constellation 4K (+ panel estimado) | $4.969-$12.000 | $3.600 | switcher / sdi_me | 4 | concierto, LigaPro, final, autos | 20 entradas 12G-SDI, 2 bancos de mezcla (M/E). Necesita panel físico. | profesional | 4 | F41 + estimado |
| Rosco XPresión Estudio Go | Ross XPression Studio Go! | $17.425 | $6.600 | graphics / cg_3d | 4 | LigaPro, concierto, lanzamiento, final | Gráficos 3D en vivo con datos (estadísticas, alineaciones). Requiere: operador_graficos. | elite | 4 | F46 |
| TriKaster 3Jugadas | NewTek 3Play / servidor de repetición de arena | $15.000-$40.000 | $8.500 | replay / servidor_medio | 4 | LigaPro, concierto, boxeo | Servidor de repetición de 4-8 canales con control de palanca (T-bar). Requiere: operador_repeticion. | elite | 4 | F45 + estimado |
| Rosco Carbonita Ultra + panel | Ross Carbonite Ultra Solo ($8.744 solo frame) + panel CB9 | $15.000-$30.000 | $7.650 | switcher / sdi_me | 5 | LigaPro, final, int. unilateral | 12 entradas 12G-SDI, 1 M/E + 2 MiniME, mezclador de audio interno. Switcher de canal de TV. | elite | 5 | F42 + estimado |
| EVX XT-Nano | EVS XTnano (HD) | $105.000-$120.000 | $26.500 | replay / servidor_broadcast | 5 | LigaPro, final, int. host | El servidor de repetición de la TV deportiva. Repetición en segundos, cero cuelgues. Requiere: operador_repeticion. | elite | 5 | F43 |
| Vizart Motor 3D + realidad aumentada | Vizrt Viz Engine + tracking (estimado) | $60.000-$150.000 | $23.500 | graphics / cg_ar | 6 | final, int. host, autos | Gráficos sobre la cancha y publicidad virtual. Lo que ve el mundo en una final. Requiere: operador_graficos, cam_sistema. | vip | 4 | estimado |
| EVX XT-VIA 4K (servidor top) | EVS XT-VIA (12-20 canales, 40 TB) | $150.000-$300.000 | $43.000 | replay / servidor_broadcast | 6 | final, int. host | 12-20 canales 4K, conecta súper lentas. Dos operadores trabajan a la vez. Requiere: operador_repeticion. | elite | 5 | F44 + estimado |
| Glass Valley Kayena K-Marco (4 M/E) | Grass Valley Kayenne / K-Frame XP | $150.000-$500.000 | $52.000 | switcher / grande_me | 6 | final, int. host | Switcher de unidad móvil grande: 4 bancos, decenas de cámaras, gráficos por capas. Requiere: vehiculo_ob. | elite | 5 | estimado |

### 5. Audio: consolas, micrófonos e intercom

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Shur SM59 de mano (con cable) | Shure SM58 | $98-$109 | $100 | mics / dinamico | 1 | misa, prensa, graduación, boda, funeral | El micrófono indestructible. Con cable XLR. | comun | 5 | F53 |
| Behringa Xenix 1204USB | Behringer Xenyx 1204USB | $189 | $190 | audio / analoga | 1 | misa, funeral, boda, prensa | Consola analógica chica con USB. Sin efectos ni memoria. | comun | 3 | F47 |
| Inalámbrico de mano doble Behringa ULM | Sistema inalámbrico económico (estimado) | $150-$300 | $210 | mics / inalambrico | 1 | boda, graduación, misa | Barato, pero tiene interferencias y cortes. | comun | 2 | estimado |
| Yamaka MG10XV | Yamaha MG10XU | $268 | $270 | audio / analoga | 1 | misa, boda, prensa, graduación | 10 canales con efectos. Más silenciosa que la más barata. | comun | 4 | F47 |
| DGI Mike 2 (solapa inalámbrico) | DJI Mic 2 | $199 | $200 | mics / corbatero | 2 | IRL, funeral, prensa, boda | Micrófono de solapa para celular o cámara, con grabación de respaldo. | comun | 3 | F19 |
| Mydas MR19 (digital 18 canales) | Midas MR18 | $650-$900 | $630 | audio / digital_chica | 2 | boda, graduación, lanzamiento, prensa, barrial | 18 canales digitales controlados por tablet. Guarda escenas. | comun | 3 | estimado |
| Roade NTG6 (shotgun para boom) | Rode NTG5 | $485-$569 | $480 | mics / shotgun | 3 | prensa, autos, boxeo, LigaPro | Micrófono direccional en caña: entrevistas y ambiente de cancha. Requiere: microfonista. | profesional | 4 | F56 |
| Sennhauser HMD 27 diadema de comentarista | Sennheiser HMD 26 | $479-$579 | $480 | mics / diadema_comentarista | 3 | LigaPro, final, boxeo, barrial, int. unilateral | Diadema de narrador: aísla el ruido del estadio. | profesional | 4 | F57 |
| Sennhauser EW-DZ ME3 corbatero | Sennheiser EW-D ME2 set | $749 | $620 | mics / corbatero | 3 | prensa, lanzamiento, autos, funeral, boda | Micrófono de solapa inalámbrico para presentadores y entrevistas. | profesional | 3 | F55 |
| Behringa X33 Rack (40 canales) | Behringer X32 Rack | $745-$980 | $690 | audio / digital | 3 | lanzamiento, concierto, LigaPro, boxeo, lucha libre | 40 canales, 16 envíos, stagebox por cable de red. | profesional | 3 | F48 |
| Behringa ALA Rack (48 canales) | Behringer WING Rack | $1.299-$1.799 | $1.050 | audio / digital | 3 | concierto, lanzamiento, LigaPro, boxeo | 48 canales estéreo, graba 64 pistas en tarjetas SD. | profesional | 3 | F49 |
| Shur SLXD25D doble inalámbrico | Shure SLXD24D/SM58 | $1.379-$1.739 | $1.050 | mics / inalambrico | 3 | graduación, lanzamiento, concierto, prensa | Digital, 2 micrófonos, escaneo automático de frecuencias. | profesional | 4 | F54 |
| Hollyband Solidkom C2 Pro (8 diademas) | Hollyland Solidcom C1 Pro-8S | $3.200-$3.400 | $1.900 | intercom / inalambrico | 3 | graduación, lanzamiento, concierto, barrial, boxeo | Intercom inalámbrico full dúplex para 8 personas, 350-500 m. | profesional | 3 | F58 |
| ClearKom Encora (línea compartida con cable) | Clear-Com Encore party-line (estimado) | $2.500-$5.000 | $2.000 | intercom / cableado | 3 | LigaPro, concierto, final | Intercom con cable: nunca se corta, pero el cable llega a cada posición. | profesional | 5 | estimado |
| Mydas M33 Live (40 canales) | Midas M32 LIVE | $3.295 | $1.900 | audio / digital_superficie | 4 | concierto, LigaPro, final, autos | Superficie con 25 faders y preamplificadores de gama alta. | profesional | 4 | F50 |
| Yamaka KL5 (72 canales) | Yamaha CL5 (usada) | $10.100-$35.081 | $7.000 | audio / digital_grande | 5 | concierto, final, int. host | Consola de gira grande, red digital entre escenario y control. | elite | 4 | F51 |
| ClearKom FreeHabla III (10 petacas) | Clear-Com FreeSpeak II (estimado) | $20.000-$40.000 | $9.500 | intercom / inalambrico_digital | 5 | final, int. host, concierto | Intercom inalámbrico de estadio con varias antenas y canales. | elite | 4 | estimado |
| Kalrek Brío 37 (broadcast) | Calrec Brio 36 | $39.000-$42.000 | $12.500 | audio / broadcast | 6 | final, LigaPro, int. host | Consola de televisión: mezcla narradores, ambiente 5.1 y retornos sin fallas. | elite | 5 | F52 |

### 6. Transmisión y señal

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Hotspot 5G NetGir M7 | Netgear Nighthawk M6/M7 Pro | $210-$295 | $250 | internet / hotspot | 1 | IRL, funeral, misa, prensa | Internet de respaldo por chip celular de otra operadora. | comun | 3 | F19 |
| Blackmagia Web Presentador 4K | Blackmagic Web Presenter 4K | $495-$595 | $490 | encoder / encoder_hw | 1 | misa, boda, graduación, prensa | Encoder de hardware con SDI: transmite aunque la PC se cuelgue. | comun | 4 | estimado |
| Hollyband Marte 4K (video inalámbrico) | Hollyland Mars 4K | $300-$400 | $350 | wireless / tx_video | 2 | boda, graduación, lanzamiento, barrial | La cámara se mueve sin cable hasta 135 m. Retraso de 0,06 s. | comun | 3 | F62 |
| Kilovista P3 (bonding 4 módems) | Kiloview P3 (+ 4 módems estimado) | $1.599-$2.800 | $1.350 | encoder / bonding | 2 | barrial, graduación, lanzamiento, IRL, funeral | Une 4 chips celulares + WiFi + cable. Cuenta como encoder e internet de respaldo. | comun | 3 | F59 |
| Par de conversores SDI-fibra | Mini conversor óptico SDI (estimado) | $200-$450 | $300 | cable / conversor_fibra | 3 | LigaPro, concierto, final | Lleva la señal SDI kilómetros por fibra: cámaras lejos del control. | profesional | 4 | estimado |
| LiveYou Solo PRO (bonding) | LiveU Solo PRO HDMI/SDI (+ servicio $45/mes) | $2.595-$3.200 | $1.700 | encoder / bonding | 3 | IRL, boxeo, lanzamiento, barrial, int. unilateral | Bonding de 6 conexiones en 4K. Necesita suscripción mensual. | profesional | 3 | F60, F19 |
| Cable híbrido de fibra SMPTE 100 m | Cable SMPTE 311 de 100 m | $1.588 | $1.100 | cable / cable_fibra_smpte | 4 | LigaPro, final, int. host | Lleva video, energía e intercom a la cámara de sistema. Si se pisa o se dobla, adiós cámara. | profesional | 2 | F64 |
| Terradek Rayo 6 LT 750 | Teradek Bolt 6 LT 750 | $3.290 | $1.900 | wireless / tx_video | 4 | concierto, LigaPro, boxeo, autos, final | Video inalámbrico sin retraso (<1 ms) hasta 230 m. Para steadicam y cámara de ring. | profesional | 4 | F63 |
| Alquiler de unidad móvil (hasta 4 cámaras) | OB-van 1 a 4 cámaras (alquiler por uso) | $7.500-$12.100 /uso | $1.400 /evento | service / ob_alquiler | 4 | LigaPro, concierto, final | Llega con switcher, audio, repetición y técnico. Caro, pero salva un partido si no tienes OB propia. | profesional | 5 | F22, F81 |
| Enlace satelital SNG - servicio | Camión SNG / flyaway (alquiler por uso) | $2.400-$4.900 /uso | $650 /evento | service / satelite | 5 | final, int. host, int. unilateral | Sube la señal al satélite: no depende del internet del estadio. | profesional | 5 | F22 |
| LiveYou LU900 (8 módems, 4 cámaras) | LiveU LU800 | $21.000 | $7.600 | encoder / bonding_broadcast | 5 | LigaPro, final, int. unilateral, concierto | 8 módems 5G y hasta 4 cámaras a la vez por celular. Calidad de canal de TV. | elite | 4 | F61 |

### 7. Monitoreo y grabación

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Monitor de campo 7" básico | Monitor HDMI 7" económico | $150-$300 | $210 | monitor / monitor_campo | 1 | boda, misa, barrial | Pantalla grande para enfocar bien. | comun | 2 | estimado |
| Atomix Ninja VI (monitor-grabador) | Atomos Ninja V | $500 | $460 | monitor / grabador | 2 | boda, lanzamiento, concierto, graduación | Monitor 5" de 1.000 nits que graba 4K de respaldo. | comun | 3 | F65 |
| Monitor de referencia broadcast 17" (shader) | Monitor de referencia OLED 17" (estimado) | $3.000-$8.000 | $2.550 | monitor / referencia | 5 | LigaPro, final, concierto | Para que el shader iguale el color de todas las cámaras. Requiere: shader. | elite | 4 | estimado |

### 8. Energía, lluvia, maletas y vehículos

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Cobertor de lluvia básico | Cobertor de nylon genérico | $30-$80 | $50 | rain / cobertor | 1 | boda, barrial, IRL | Protege una camcorder de la llovizna. | comun | 1 | estimado |
| Juego de maletas rígidas Pelikano | Maletas rígidas tipo Pelican (estimado) | $300-$1.500 | $570 | case / maletas | 2 | barrial, concierto, LigaPro, int. unilateral | Los equipos se gastan menos en el transporte y en los viajes. | comun | 5 | estimado |
| APZ Smart-UPS 1500 VA | APC Smart-UPS 1500VA | $665-$1.095 | $690 | power / ups | 2 | misa, graduación, prensa, boda, barrial | Unos 10-20 minutos para switcher y encoder si se va la luz. | comun | 4 | F66 |
| Jonda EU2300i (generador inverter 2,2 kW) | Honda EU2200i | $1.100-$1.400 | $910 | power / generador_portatil | 2 | barrial, boda, IRL, lucha libre | Silencioso, para canchas sin luz. No alcanza para luces grandes. | comun | 4 | estimado |
| Camioneta de carga usada | Van/camioneta de carga usada (estimado) | $15.000-$30.000 | $7.650 | vehicle / camioneta | 2 | barrial, graduación, concierto | Llegas a tiempo con todo el equipo; sin ella pagas fletes. | comun | 4 | estimado |
| Cobertor broadcast para cámara y lente box | Rain cover broadcast (estimado) | $300-$800 | $450 | rain / cobertor | 3 | LigaPro, final, concierto | Cubre cámara, lente largo y operador en aguaceros de estadio. | profesional | 3 | estimado |
| Furgoneta Sprinto de producción (usada) | Mercedes Sprinter OB-van usada | $22.296 | $7.950 | vehicle / ob_chica | 3 | barrial, LigaPro, concierto | Una pequeña sala de control con ruedas, lista para armarla. | profesional | 4 | F69 |
| Kummins 22 kVA diésel insonorizado | Generador diésel 22 kVA (Cummins) | $12.000-$14.000 | $5.300 | power / generador_diesel | 4 | LigaPro, concierto, final, autos | Mueve toda la producción si el estadio se queda sin luz. | exclusivo | 5 | F67 |
| Sprinto OB equipada (4-6 cámaras) | Mercedes Sprinter OB VAN equipada | $108.618 | $26.000 | vehicle / ob_chica | 4 | LigaPro, concierto, final | Unidad móvil chica completa: switcher, audio, intercom y monitores. | exclusivo | 4 | F69 |
| Tráiler OB HD 12 cámaras (usado) | Tráiler OB HD 12 cámaras usado | $337.285 | $61.000 | vehicle / ob_grande | 5 | LigaPro, final, int. host | Sala de control de 12 cámaras: es tu canal de televisión sobre ruedas. Requiere: generador. | elite | 5 | F69 |
| Camión OB HD 8 cámaras | Renault HD OB Van 8 cámaras | $680.287 | $105.000 | vehicle / ob_grande | 5 | LigaPro, final, int. host | Camión moderno y ampliable (más nuevo que el tráiler usado de 12 cámaras): switcher grande, repeticiones, audio y control de cámaras. Requiere: generador. | elite | 5 | F69 |
| Tráiler OB UHD 20 cámaras 4K | Tráiler OB UHD 20 cámaras (2022) | $4.001.685 | $390.000 | vehicle / ob_uhd | 6 | final, int. host | La aspiración final: 20 cámaras 4K HDR, como la de un Mundial. Requiere: generador. | vip | 5 | F69 |

### 9. Cables y consumibles

| Nombre parodia | Referencia real (solo interna) | Precio real aprox. USD | Precio sugerido en el juego | Categoría juego | Calidad 1-6 | Para qué eventos | Dato clave | Rareza | Durab. | Fuente |
|---|---|---|---|---|---|---|---|---|---|---|
| Cable XLR 10 m | Cable XLR 10 m | $15-$35 | $20 | consumable / cable_xlr | 1 | misa, boda, graduación, prensa | Cable de micrófono balanceado. Siempre falta uno. | comun | 2 | estimado |
| Cable HDMI 10 m | Cable HDMI 10 m | $20-$40 | $30 | consumable / cable_hdmi | 1 | misa, boda, prensa, funeral | HDMI largo falla más de 10-15 m. Se suelta con un tirón. | comun | 1 | estimado |
| Plan mensual de bonding (servicio) | Servicio de bonding de LiveU ($45/mes) | $45 | $40 | consumable / suscripcion | 1 | IRL, boxeo, barrial | Sin suscripción, la mochila solo usa una conexión. Requiere: enc_liveyou_solo_pro. | comun | 5 | F19 |
| Batería extra de camcorder | Batería NP/BP de camcorder | $50-$90 | $70 | consumable / bateria_chica | 1 | misa, boda, prensa, funeral | Una hora más de grabación. | comun | 2 | estimado |
| Bobina de cable SDI 3G 50 m | Cable coaxial SDI 3G 50 m | $80-$200 | $130 | consumable / cable_sdi | 1 | barrial, graduación, concierto, LigaPro | Con conector BNC de seguro: no se suelta. Hasta ~100 m en HD. | comun | 3 | estimado |
| Batería tipo V 98 Wh Kore | Core SWX Hypercore 98 V-mount | $299 | $300 | consumable / bateria_v | 1 | concierto, LigaPro, boxeo, final | Unas 3 horas de cámara de hombro. Se puede llevar en avión. | comun | 3 | F68 |
| Multipar de audio 16 canales 30 m | Snake de audio 16x4 30 m | $250-$500 | $350 | consumable / multipar | 2 | graduación, concierto, lanzamiento | Lleva todos los micrófonos del escenario a la consola. | comun | 3 | estimado |

### Resumen: cantidad de equipos por categoría y calidad

| Categoría | C1 | C2 | C3 | C4 | C5 | C6 | Total |
|---|---|---|---|---|---|---|---|
| audio | 2 | 1 | 2 | 1 | 1 | 1 | 8 |
| cable |  |  | 1 | 1 |  |  | 2 |
| cam | 3 | 6 | 6 | 2 | 3 | 2 | 22 |
| case |  | 1 |  |  |  |  | 1 |
| consumable | 6 | 1 |  |  |  |  | 7 |
| encoder | 1 | 1 | 1 |  | 1 |  | 4 |
| graphics |  | 1 |  | 1 |  | 1 | 3 |
| intercom |  |  | 2 |  | 1 |  | 3 |
| internet | 1 |  |  |  |  |  | 1 |
| lens | 1 | 1 | 1 | 4 | 3 | 2 | 12 |
| mics | 2 | 1 | 4 |  |  |  | 7 |
| monitor | 1 | 1 | 1 |  | 1 |  | 4 |
| power |  | 2 |  | 1 |  |  | 3 |
| rain | 1 |  | 1 |  |  |  | 2 |
| replay |  |  | 1 | 1 | 1 | 1 | 4 |
| service |  |  |  | 3 | 1 | 1 | 5 |
| support | 1 | 2 | 3 | 2 | 1 |  | 9 |
| switcher | 2 | 2 | 3 | 1 | 1 | 1 | 10 |
| vehicle |  | 1 | 1 | 1 | 2 | 1 | 6 |
| wireless |  | 1 |  | 1 |  |  | 2 |
| **Total** | 21 | 22 | 27 | 19 | 16 | 10 | **115** |

### Premium / exclusivos (créditos) vs normales

- **Regla de diseño:** todo lo necesario para la historia (cámara de sistema, lentes box, servidor de repetición, unidad móvil alquilada) se compra **con dinero del juego**. Si se vende con créditos, el juego se vuelve "pagar para ganar".
- **Exclusivo (créditos)**, coherente con los premium actuales: `dron_dgi_inspira_3x` (= dron4k), `pw_kummins_22kva` (= generador), `veh_sprinto_ob_equipada` (= unidad_movil). La grúa premium actual equivale a `srv_grua_telescopica` comprada en propiedad. Son atajos y espectáculo, no requisitos.
- **VIP:** `srv_aranacam`, `gfx_vizart_ar` (publicidad virtual / realidad aumentada) y `veh_trailer_ob_uhd20` como "trofeo" de fin de juego. Funcionan solo con VIP activo, igual que hoy.
- Sugerencia: el resto de la rareza `elite` se desbloquea por **fama** (por ejemplo calidad 5 con fama 55+, calidad 6 con fama 70+).

## Montajes realistas por tipo de evento

Cámaras mínimas / ideales, posiciones, equipo clave (claves del catálogo) y pago. **Pago Ecuador = estimado** (no hay tarifarios públicos de producción de eventos en Ecuador;
referencias: Chile CLP 200.000 por 4 h de streaming deportivo básico con personal [F83]; contratos públicos de streaming del CNE de $6.327 y $15.325 [F84]; Italia 2016: tope de EUR 9.500-61.000 por partido [F22]).
"Pago juego" aplica la misma curva de precios.

### Misa / ceremonia (`misa`)

- **Cámaras:** mínimo 1, ideal 2.
- **Posiciones:**
  1. Fija al fondo de la nave, plano general del altar (trípode o PTZ)
  2. PTZ lateral para lectores y consagración
- **Equipo clave:** `cam_panasonika_aw_uv22`, `cam_kanon_xa65`, `sw_blackmagia_atema_mini_pro`, `au_yamaka_mg10xv`, `enc_blackmagia_web_presentador_4k`, `net_hotspot_5g`
- **Personal (mín./ideal):** Realizador / director: 0/1, Camarógrafo: 1/1, Operador de cámara robótica (PTZ): 0/1, Sonidista / operador de audio (A1): 0/1, Técnico de transmisión / streaming: 1/1.
- **Pago Ecuador aprox.:** $150-$400 · **pago juego sugerido:** $150-$390.
- **Notas:** Lo más importante es el audio: tomar la señal de la consola de la iglesia. Muchas parroquias instalan PTZ fijas. Pago estimado.

### Funeral / velorio en vivo (`funeral`)

- **Cámaras:** mínimo 1, ideal 2.
- **Posiciones:**
  1. Fija y discreta, ligeramente de costado, plano calmado del ataúd y el atril
  2. Segunda cámara (opcional) para el oficiante
- **Equipo clave:** `cam_celular_gimbal`, `cam_optiptz_movil_22x`, `sop_tripode_basico`, `mic_sennhauser_ewdz_corbatero`, `enc_kilovista_p3`, `net_hotspot_5g`
- **Personal (mín./ideal):** Productor / coordinador: 0/1, Camarógrafo: 1/1, Sonidista / operador de audio (A1): 0/1, Técnico de transmisión / streaming: 1/1.
- **Pago Ecuador aprox.:** $100-$300 · **pago juego sugerido:** $100-$300.
- **Notas:** Sin zooms ni movimientos dramáticos; transmisión privada (link solo para la familia). Una persona vigila el stream y el respaldo de internet (F85). Pago estimado.

### Boda (`boda`)

- **Cámaras:** mínimo 1, ideal 3.
- **Posiciones:**
  1. Frontal en el altar o mesa (trípode, plano de los novios)
  2. Contraplano desde el fondo (entrada de la novia)
  3. Cámara de cine en gimbal para detalles
  4. Dron para la toma del lugar (exterior)
- **Equipo clave:** `cam_zony_fz6_cine`, `sop_gimbal_dgi_rz4_pro`, `cam_kanon_xa65`, `mic_sennhauser_ewdz_corbatero`, `dron_dgi_micro_4_pro`, `sw_blackmagia_atema_mini_pro`
- **Personal (mín./ideal):** Realizador / director: 0/1, Productor / coordinador: 0/1, Camarógrafo: 1/3, Asistente de cámara / cablero: 0/1, Sonidista / operador de audio (A1): 0/1, Técnico de transmisión / streaming: 0/1, Piloto de dron: 0/1, Asistente de producción / runner: 0/1.
- **Pago Ecuador aprox.:** $400-$1.500 · **pago juego sugerido:** $390-$1.050.
- **Notas:** El streaming suele ser un extra para familiares en el exterior; lo que más se vende es el video editado. Pago estimado.

### Rueda de prensa (`prensa`)

- **Cámaras:** mínimo 1, ideal 3.
- **Posiciones:**
  1. Frontal a la mesa (plano medio del vocero)
  2. Abierta de la mesa completa (PTZ)
  3. Cámara de reacción / periodistas preguntando
- **Equipo clave:** `cam_kanon_xa65`, `cam_panasonika_aw_uv22`, `mic_shur_sm59`, `mic_roade_ntg6_boom`, `au_mydas_mr19`, `sw_vmax_hd_pc`, `gfx_kasparcg_pc`
- **Personal (mín./ideal):** Realizador / director: 0/1, Productor / coordinador: 0/1, Camarógrafo: 1/2, Operador de cámara robótica (PTZ): 0/1, Sonidista / operador de audio (A1): 1/1, Microfonista / operador de boom (A2): 0/1, Operador de gráficos (CG): 0/1, Técnico de transmisión / streaming: 1/1.
- **Pago Ecuador aprox.:** $200-$600 · **pago juego sugerido:** $200-$530.
- **Notas:** Los periodistas preguntan sin micrófono: el boom o un micrófono de mano para preguntas evita el "no se escucha". Cintillos con nombre y cargo.

### Partido de liga barrial (`barrial`)

- **Cámaras:** mínimo 2, ideal 4.
- **Posiciones:**
  1. Principal en alto a la altura de la media cancha (andamio, terraza o techo)
  2. Cámara cerrada al lado de la principal
  3. Detrás de un arco o al hombro en la banda
  4. Dron para tomas de apertura
- **Equipo clave:** `cam_kanon_xa65`, `cam_zony_pxv_z210`, `sw_vmax_hd_pc`, `gfx_kasparcg_pc`, `enc_kilovista_p3`, `pw_jonda_eu2300i`, `mic_sennhauser_hmd27`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 0/1, Camarógrafo: 2/3, Asistente de cámara / cablero: 0/1, Sonidista / operador de audio (A1): 0/1, Operador de repeticiones (EVX/replay): 0/1, Operador de gráficos (CG): 0/1, Técnico de transmisión / streaming: 1/1, Piloto de dron: 0/1.
- **Pago Ecuador aprox.:** $200-$600 · **pago juego sugerido:** $200-$530.
- **Notas:** En Chile un streaming deportivo básico con equipo y personal ronda CLP 200.000 por 4 h (F83). Muchas canchas no tienen luz ni internet: generador y bonding.

### Graduación de colegio (`graduacion`)

- **Cámaras:** mínimo 2, ideal 4.
- **Posiciones:**
  1. Frontal al escenario desde el centro del público (lente largo)
  2. Lateral para la entrega de diplomas
  3. Jib o PTZ para tomas del público
  4. Cámara de reacción de familias
- **Equipo clave:** `cam_kanon_xf615`, `cam_blackmagia_estudio_4k_g3`, `sop_jib_proeme_4m`, `sw_blackmagia_atema_mini_extremo_iso_g3`, `mic_shur_slxd25_doble`, `gfx_kasparcg_pc`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 0/1, Camarógrafo: 2/3, Operador de cámara robótica (PTZ): 0/1, Asistente de cámara / cablero: 0/1, Sonidista / operador de audio (A1): 1/1, Operador de gráficos (CG): 0/1, Técnico de transmisión / streaming: 1/1, Coordinador de piso / stage manager: 0/1, Asistente de producción / runner: 0/1.
- **Pago Ecuador aprox.:** $300-$900 · **pago juego sugerido:** $300-$710.
- **Notas:** Los nombres de los graduados en pantalla son lo que más valoran las familias. Eventos largos: baterías y UPS.

### Lanzamiento de marca / producto (`lanzamiento`)

- **Cámaras:** mínimo 2, ideal 5.
- **Posiciones:**
  1. Frontal al escenario (plano del presentador)
  2. Abierta del escenario y pantalla LED
  3. Gimbal / steadicam entre invitados e influencers
  4. PTZ cenital o jib para la revelación
  5. Cámara de entrevistas en el photocall
- **Equipo clave:** `cam_kanon_xf615`, `cam_zony_fz6_cine`, `sop_gimbal_dgi_rz4_pro`, `sw_blackmagia_atema_2me_constelacion_4k`, `mic_sennhauser_ewdz_corbatero`, `ic_hollyband_solidkom_c2`, `enc_liveyou_solo_pro`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 1/1, Camarógrafo: 2/4, Operador de cámara robótica (PTZ): 0/1, Asistente de cámara / cablero: 1/2, Sonidista / operador de audio (A1): 1/1, Microfonista / operador de boom (A2): 0/1, Operador de gráficos (CG): 0/1, Técnico de transmisión / streaming: 1/1, Coordinador de piso / stage manager: 1/1, Asistente de producción / runner: 0/1.
- **Pago Ecuador aprox.:** $1.500-$5.000 · **pago juego sugerido:** $1.050-$2.600.
- **Notas:** La señal va a la pantalla LED del evento (IMAG) y al streaming a la vez. Escaleta al minuto; el coordinador de piso da las entradas.

### Lanzamiento de autos (`lanzamiento_autos`)

- **Cámaras:** mínimo 3, ideal 7.
- **Posiciones:**
  1. Frontal al escenario (presentador y auto)
  2. Grúa o jib para la revelación del auto
  3. Dolly/riel en paralelo al auto
  4. Gimbal con cámara de cine alrededor del auto (detalles)
  5. Minicámaras POV dentro del auto
  6. Dron en exteriores (prueba de manejo)
  7. Cámara de entrevistas con influencers
- **Equipo clave:** `cam_zony_fz6_cine`, `sop_gimbal_dgi_ronan_2`, `srv_grua_telescopica`, `sop_dolly_riel_6m`, `cam_marchall_cv513_pov`, `dron_dgi_inspira_3x`, `tx_terradek_rayo_6`, `mic_roade_ntg6_boom`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 1/1, Camarógrafo: 3/5, Operador de cámara robótica (PTZ): 0/1, Asistente de cámara / cablero: 1/2, Sonidista / operador de audio (A1): 1/1, Microfonista / operador de boom (A2): 1/1, Operador de gráficos (CG): 0/1, Ingeniero de video / shader (CCU): 0/1, Técnico de transmisión / streaming: 1/1, Piloto de dron: 0/1, Coordinador de piso / stage manager: 1/1, Asistente de producción / runner: 1/2.
- **Pago Ecuador aprox.:** $3.000-$12.000 · **pago juego sugerido:** $1.750-$5.000.
- **Notas:** Estilo de comercial: la marca exige look de cine, luces y reflejos controlados sobre la carrocería. Influencers con corbatero. Pago estimado.

### Concierto (`concierto`)

- **Cámaras:** mínimo 4, ideal 8.
- **Posiciones:**
  1. Desde la torre de sonido (FOH) con lente largo: primeros planos del cantante
  2. Abierta del escenario
  3. Al hombro en el foso frente a la valla
  4. Jib o grúa sobre el público
  5. Riel en la valla
  6. Robóticas / POV en batería y teclados
  7. Steadicam en el escenario
  8. Dron (al aire libre)
- **Equipo clave:** `cam_zony_pxv_z210`, `cam_blackmagia_urso_broadcast_g3`, `lente_kanon_kx21x8_2`, `sop_jib_proeme_4m`, `cam_marchall_cv513_pov`, `sw_blackmagia_atema_2me_constelacion_4k`, `au_mydas_m33_live`, `tx_terradek_rayo_6`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 1/1, Camarógrafo: 3/6, Operador de cámara robótica (PTZ): 0/2, Asistente de cámara / cablero: 1/3, Sonidista / operador de audio (A1): 1/2, Operador de repeticiones (EVX/replay): 0/1, Operador de gráficos (CG): 0/1, Ingeniero de video / shader (CCU): 0/1, Técnico de transmisión / streaming: 1/1, Piloto de dron: 0/1, Coordinador de piso / stage manager: 1/1, Asistente de producción / runner: 0/1.
- **Pago Ecuador aprox.:** $3.000-$10.000 · **pago juego sugerido:** $1.750-$4.350.
- **Notas:** El audio del streaming es una mezcla aparte de la del público (FOH). Las cámaras alimentan las pantallas gigantes (IMAG). Pago estimado.

### Velada de boxeo (`boxeo`)

- **Cámaras:** mínimo 4, ideal 6.
- **Posiciones:**
  1. Principal en alto (balcón o tarima) con trípode: plano abierto del ring
  2. Cerrada junto a la principal
  3. Al hombro inalámbrica en esquina neutral 1
  4. Al hombro inalámbrica en esquina neutral 2 (entrevistas entre peleas)
  5. Abierta fija "beauty" del recinto
  6. Minicámaras en postes del ring / steadicam en la caminata
- **Equipo clave:** `cam_zony_pxv_z210`, `cam_blackmagia_urso_broadcast_g3`, `tx_terradek_rayo_6`, `cam_marchall_cv513_pov`, `sw_blackmagia_atema_1me_constelacion`, `rep_vmax_repeticion`, `gfx_kasparcg_pc`, `enc_liveyou_solo_pro`, `mic_sennhauser_hmd27`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 1/1, Camarógrafo: 3/5, Operador de cámara robótica (PTZ): 0/1, Asistente de cámara / cablero: 1/2, Sonidista / operador de audio (A1): 1/1, Microfonista / operador de boom (A2): 0/1, Operador de repeticiones (EVX/replay): 1/1, Operador de gráficos (CG): 1/1, Ingeniero de video / shader (CCU): 0/1, Técnico de transmisión / streaming: 1/1, Coordinador de piso / stage manager: 1/1, Asistente de producción / runner: 0/1.
- **Pago Ecuador aprox.:** $800-$4.000 · **pago juego sugerido:** $650-$2.200.
- **Notas:** Caso real en streaming: 5 cámaras (2 en balcón, 2 inalámbricas en esquinas neutrales, 1 beauty), mezcla en 1 M/E, shading, gráficos y lenta por software y salida por bonding de 4 chips + WiFi + cable (F75). Gráficos: reloj de round y tarjetas de puntuación. Pago estimado.

### Lucha libre (`lucha_libre`)

- **Cámaras:** mínimo 3, ideal 5.
- **Posiciones:**
  1. Cámara principal fija ("hard cam") frente al ring
  2. Al hombro en el ring (lado izquierdo)
  3. Al hombro en el ring (lado derecho)
  4. Rampa de entrada / escenario de entrada
  5. POV en esquinas y público
- **Equipo clave:** `cam_kanon_xf615`, `cam_blackmagia_urso_broadcast_g3`, `cam_gopra_heroe13`, `sw_vmax_pro_pc`, `au_behringa_x33_rack`, `enc_kilovista_p3`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 0/1, Camarógrafo: 2/4, Operador de cámara robótica (PTZ): 0/1, Asistente de cámara / cablero: 1/1, Sonidista / operador de audio (A1): 1/1, Operador de repeticiones (EVX/replay): 0/1, Operador de gráficos (CG): 0/1, Técnico de transmisión / streaming: 1/1, Coordinador de piso / stage manager: 0/1, Asistente de producción / runner: 0/1.
- **Pago Ecuador aprox.:** $400-$1.500 · **pago juego sugerido:** $390-$1.050.
- **Notas:** Más espectáculo que deporte: entradas con música y luces, caídas fuera del ring (hay que mover la cámara rápido: el cablero es clave). Pago estimado.

### Partido de LigaPro (`ligapro`)

- **Cámaras:** mínimo 6, ideal 10.
- **Posiciones:**
  1. Cam 1 principal abierta en tribuna alta a la altura de la media cancha (cámara de sistema, lente box angular o ENG largo)
  2. Cam 2 principal cerrada junto a la 1 (lente box 80-100x)
  3. Cam 3 y 4 en línea con cada área (16 m / offside) en tribuna
  4. Cam 5 y 6 detrás de cada arco, en alto (que el punto penal se vea sobre el travesaño)
  5. Cam 7 al hombro en la banda (bancas, festejos, cambios)
  6. Cam 8 contraplano en la tribuna opuesta, alineada con el centro
  7. Cam 9 súper lenta en un área / robótica táctica
  8. Cam 10 steadicam o inalámbrica en la salida de los equipos y entrevistas
- **Equipo clave:** `cam_zony_hdk_3200`, `lente_box_kanon_digisupra_88`, `sop_vinter_vector_760`, `cam_zony_pxv_z210`, `lente_kanon_kx21x8_2`, `rep_evx_xt_nano`, `gfx_rosco_xpresion_go`, `au_mydas_m33_live`, `fib_cable_smpte_100m`, `srv_unidad_movil_4cam`, `mic_sennhauser_hmd27`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 1/2, Camarógrafo: 4/7, Operador de cámara robótica (PTZ): 0/2, Asistente de cámara / cablero: 2/4, Sonidista / operador de audio (A1): 1/2, Microfonista / operador de boom (A2): 0/1, Operador de repeticiones (EVX/replay): 1/2, Operador de gráficos (CG): 1/1, Ingeniero de video / shader (CCU): 1/1, Técnico de transmisión / streaming: 1/1, Piloto de dron: 0/1, Coordinador de piso / stage manager: 1/1, Asistente de producción / runner: 1/2.
- **Pago Ecuador aprox.:** $6.000-$15.000 · **pago juego sugerido:** $2.950-$5.900.
- **Notas:** Plan según normas de transmisión de fútbol (F70, F71, F72): plataforma principal, offside, alto detrás de cada arco, bajas detrás de la línea de fondo, contraplano y súper lentas. En 2026 LigaPro asumió su propia producción con aliados internacionales (F80); hubo robo de una unidad móvil (F81) y críticas por mala calibración de cámaras (F82) = el shader importa. Pago por partido estimado (Italia 2016: tope EUR 9.500-61.000 según categoría, F22).

### Final de campeonato (`final`)

- **Cámaras:** mínimo 8, ideal 16.
- **Posiciones:**
  1. Todo lo de LigaPro, más:
  2. Cam principal cerrada con lente box 4K 100x+
  3. Segunda cámara súper lenta en la otra área
  4. Bajas detrás de cada línea de fondo (2)
  5. Robóticas dentro de los arcos (2)
  6. Cámara táctica alta
  7. Arañacam o cablecam sobre la cancha
  8. Dron para la apertura y la premiación
  9. Steadicam en la premiación y el túnel
- **Equipo clave:** `cam_zony_hdk_3600`, `lente_box_fujinox_ux108x`, `cam_zony_hdk_5600_hfr`, `rep_evx_xt_via`, `srv_aranacam`, `veh_trailer_ob_hd12`, `au_kalrek_brio_37`, `ic_clearkom_freehabla_3`, `srv_sng_satelital`, `pw_kummins_22kva`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 1/2, Camarógrafo: 6/12, Operador de cámara robótica (PTZ): 1/3, Asistente de cámara / cablero: 3/6, Sonidista / operador de audio (A1): 1/2, Microfonista / operador de boom (A2): 1/1, Operador de repeticiones (EVX/replay): 2/3, Operador de gráficos (CG): 1/2, Ingeniero de video / shader (CCU): 1/2, Técnico de transmisión / streaming: 1/2, Piloto de dron: 0/1, Coordinador de piso / stage manager: 1/2, Asistente de producción / runner: 1/3.
- **Pago Ecuador aprox.:** $15.000-$40.000 · **pago juego sugerido:** $5.900-$12.500.
- **Notas:** Las finales internacionales usan 11-21 cámaras (Copa Libertadores Femenina, F73) y hasta 34 en un Mundial (F72). Doble enlace (fibra + satélite o bonding) y generador redundante. Pago estimado.

### Stream IRL con influencer (`irl`)

- **Cámaras:** mínimo 1, ideal 2.
- **Posiciones:**
  1. Celular o cámara de bolsillo en gimbal / soporte de pecho (en movimiento)
  2. Segunda cámara de acción (opcional) para otro ángulo
- **Equipo clave:** `cam_dgi_osmo_bolsillo_3`, `cam_celular_gimbal`, `enc_liveyou_solo_pro`, `net_hotspot_5g`, `mic_dgi_mike_2`, `cons_plan_bonding_mes`
- **Personal (mín./ideal):** Productor / coordinador: 0/1, Camarógrafo: 1/1, Técnico de transmisión / streaming: 0/1, Asistente de producción / runner: 0/1.
- **Pago Ecuador aprox.:** $150-$600 · **pago juego sugerido:** $150-$530.
- **Notas:** Mochila: bonding (o app en el celular + hotspot de otra operadora), batería grande, micrófono inalámbrico. Equipo de 1-3: camarógrafo/streamer, productor que modera el chat y vigila desde la base, y un asistente de seguridad (F19). Pago estimado por día.

### Unilateral para canal extranjero (Copa en Ecuador) (`internacional_unilateral`)

- **Cámaras:** mínimo 2, ideal 3.
- **Posiciones:**
  1. Posición del presentador con el estadio de fondo
  2. Cámara al hombro para zona mixta y entrevista flash
  3. Cámara de comentaristas (opcional)
- **Equipo clave:** `cam_zony_pxv_z760`, `lente_kanon_cx25ex7_5`, `mic_sennhauser_hmd27`, `enc_liveyou_lu900`, `srv_sng_satelital`, `case_maletas_pelikano`
- **Personal (mín./ideal):** Realizador / director: 0/1, Productor / coordinador: 1/1, Camarógrafo: 2/3, Asistente de cámara / cablero: 0/1, Sonidista / operador de audio (A1): 1/1, Microfonista / operador de boom (A2): 0/1, Técnico de transmisión / streaming: 1/1, Coordinador de piso / stage manager: 0/1.
- **Pago Ecuador aprox.:** $3.000-$10.000 · **pago juego sugerido:** $1.750-$4.350.
- **Notas:** El canal extranjero recibe la señal internacional del host y contrata aparte su propia cobertura (unilateral). Pide experiencia internacional, acreditación del torneo e idioma. Pago estimado.

### Producción host de partido internacional (subcontrato) (`internacional_host`)

- **Cámaras:** mínimo 11, ideal 21.
- **Posiciones:**
  1. Plan completo de final (ver "final")
  2. Súper lentas en ambas áreas
  3. Cámaras de comentaristas (ComCams)
  4. Cámara de túnel y beauty
  5. Contraplano y bajas detrás de las líneas de fondo
- **Equipo clave:** `veh_ob_hd8_camion`, `cam_zony_hdk_3600`, `lente_box_kanon_uhd_digisupra_125`, `cam_zony_hdk_5600_hfr`, `rep_evx_xt_via`, `gfx_vizart_ar`, `srv_sng_satelital`, `pw_kummins_22kva`
- **Personal (mín./ideal):** Realizador / director: 1/1, Productor / coordinador: 2/2, Camarógrafo: 10/16, Operador de cámara robótica (PTZ): 2/4, Asistente de cámara / cablero: 4/8, Sonidista / operador de audio (A1): 2/3, Microfonista / operador de boom (A2): 1/2, Operador de repeticiones (EVX/replay): 2/4, Operador de gráficos (CG): 1/2, Ingeniero de video / shader (CCU): 2/3, Técnico de transmisión / streaming: 1/2, Piloto de dron: 0/1, Coordinador de piso / stage manager: 2/3, Asistente de producción / runner: 2/4.
- **Pago Ecuador aprox.:** $40.000-$120.000 · **pago juego sugerido:** $12.500-$28.000.
- **Notas:** Real: 11-21 cámaras, 2 OB HD, flyaways y más de 100 profesionales para un torneo continental (F73). En el juego, evento muy raro y de máximo nivel. Pago estimado.

### Plan de cámaras de fútbol (confirmación)

Según las normas de transmisión de fútbol y rugby de la TV australiana (OP-32, F70), la UEFA (F71) y el Mundial (F72, F74), un partido profesional incluye:

1. **Plataforma principal** en tribuna, a la altura de la media cancha, 30-40 m de la línea, ángulo de 12-16° al centro: **cámara 1 abierta** y **cámara 2 cerrada** (aquí va el **lente box 80-100x+**).
2. **Cámaras de offside** alineadas con cada área (16 m), a la misma altura de la principal.
3. **Detrás de cada arco, en alto** (sobre el eje largo de la cancha; el punto penal debe verse sobre el travesaño, 12-15°). **Sí: hay una detrás de cada arco.**
4. **Bajas detrás de la línea de fondo** (2 trípodes a 3-5 m de la línea, entre el área y el arco).
5. **Cámaras de cancha al hombro** (o inalámbricas/steadicam) para bancas, festejos y entrevistas.
6. **Contraplano**: una cámara en la tribuna opuesta alineada con el centro (obligatoria para UEFA) y hasta 3 de borde de cancha en ese lado.
7. **Súper lentas** en las áreas (lentes de 86x o más), **robóticas** (táctica alta, dentro de los arcos, túnel, beauty), **arañacam/cablecam** y **dron** en finales.

Escala: barrial 2-4 · LigaPro 6-10 · final nacional 8-16 · final continental 11-21 (F73) · Mundial 34 (F72).

## Roles del personal en una producción real

| Clave | Rol | Qué hace | Qué pasa si falta | Rol actual del juego |
|---|---|---|---|---|
| `director` | Realizador / director | Elige en vivo qué cámara sale al aire, pide planos y marca el ritmo. | Planos que llegan tarde, se pierden goles y momentos clave; cada camarógrafo hace lo que cree. | dir |
| `productor` | Productor / coordinador | Habla con el cliente, arma la escaleta (guion por minutos), contrata y resuelve permisos. | Retrasos, el cliente cambia todo a última hora y nadie avisa; se pierde el inicio o el discurso. | nuevo |
| `camarografo` | Camarógrafo | Opera una cámara: encuadre, foco y zoom. | La cámara queda fija o apagada; un plano menos para el director. | cam |
| `operador_ptz` | Operador de cámara robótica (PTZ) | Maneja varias cámaras robóticas desde un joystick. | Las robóticas quedan en un solo plano fijo; no siguen a quien habla. | nuevo |
| `cablero` | Asistente de cámara / cablero | Tiende y recoge cables, sigue al camarógrafo con el cable, cambia baterías y cuida el equipo. | Cables enredados o pisados, gente que se tropieza, la cámara de mano no puede moverse; un conector se arranca y se pierde la señal. | nuevo |
| `sonidista` | Sonidista / operador de audio (A1) | Mezcla micrófonos, música y ambiente para la transmisión. | Audio saturado, micrófono abierto a destiempo, acoples; el streaming se escucha mal aunque la imagen sea buena. | audio |
| `microfonista` | Microfonista / operador de boom (A2) | Pone corbateros, lleva la caña con shotgun en entrevistas y revisa pilas. | Entrevistas con audio lejano o con viento; corbateros mal puestos que rozan la ropa; pilas que se acaban en vivo. | nuevo |
| `operador_repeticion` | Operador de repeticiones (EVX/replay) | Marca jugadas y lanza repeticiones en cámara lenta. | No hay repeticiones en deportes: el gol se ve una sola vez y el cliente reclama. | nuevo |
| `operador_graficos` | Operador de gráficos (CG) | Marcador, reloj, nombres, alineaciones, logos de auspiciantes. | Sin marcador ni cintillos; nombres mal escritos; los auspiciantes no salen y se quejan. | nuevo |
| `shader` | Ingeniero de video / shader (CCU) | Ajusta a distancia iris, color y negros de las cámaras de sistema para que todas se vean iguales. | Cámaras con colores distintos ("cancha radioactiva"), imagen quemada al salir el sol o oscura al caer la noche. | nuevo |
| `tecnico_transmision` | Técnico de transmisión / streaming | Encoder, internet, bonding, satélite o fibra; vigila que la señal llegue. | Cortes de la transmisión sin que nadie lo note; nadie cambia al internet de respaldo. | stream |
| `piloto_dron` | Piloto de dron | Vuela el dron con permiso y seguridad. | No se puede usar el dron (o se vuela sin permiso: multa y riesgo de accidente). | nuevo |
| `coordinador_piso` | Coordinador de piso / stage manager | Es el contacto del director en el escenario o la cancha: da entradas a presentadores, controla tiempos. | Presentadores que entran tarde, artistas que no saben cuándo empezar, entrevistas que no ocurren. | nuevo |
| `runner` | Asistente de producción / runner | Lleva y trae cosas, compra pilas, guía a invitados, comida del equipo. | Nadie va por la pieza que falta; el equipo trabaja con hambre y cansado. | nuevo |

### Personal por evento (mínimo / ideal)

| Evento | Dir | Prod | Cam | PTZ | Cabl | A1 | A2/boom | Rep | CG | Shader | TX | Dron | Piso | Runner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Misa / ceremonia | 0/1 | - | 1/1 | 0/1 | - | 0/1 | - | - | - | - | 1/1 | - | - | - |
| Funeral / velorio en vivo | - | 0/1 | 1/1 | - | - | 0/1 | - | - | - | - | 1/1 | - | - | - |
| Boda | 0/1 | 0/1 | 1/3 | - | 0/1 | 0/1 | - | - | - | - | 0/1 | 0/1 | - | 0/1 |
| Rueda de prensa | 0/1 | 0/1 | 1/2 | 0/1 | - | 1/1 | 0/1 | - | 0/1 | - | 1/1 | - | - | - |
| Partido de liga barrial | 1/1 | 0/1 | 2/3 | - | 0/1 | 0/1 | - | 0/1 | 0/1 | - | 1/1 | 0/1 | - | - |
| Graduación de colegio | 1/1 | 0/1 | 2/3 | 0/1 | 0/1 | 1/1 | - | - | 0/1 | - | 1/1 | - | 0/1 | 0/1 |
| Lanzamiento de marca / producto | 1/1 | 1/1 | 2/4 | 0/1 | 1/2 | 1/1 | 0/1 | - | 0/1 | - | 1/1 | - | 1/1 | 0/1 |
| Lanzamiento de autos | 1/1 | 1/1 | 3/5 | 0/1 | 1/2 | 1/1 | 1/1 | - | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 1/2 |
| Concierto | 1/1 | 1/1 | 3/6 | 0/2 | 1/3 | 1/2 | - | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 1/1 | 0/1 |
| Velada de boxeo | 1/1 | 1/1 | 3/5 | 0/1 | 1/2 | 1/1 | 0/1 | 1/1 | 1/1 | 0/1 | 1/1 | - | 1/1 | 0/1 |
| Lucha libre | 1/1 | 0/1 | 2/4 | 0/1 | 1/1 | 1/1 | - | 0/1 | 0/1 | - | 1/1 | - | 0/1 | 0/1 |
| Partido de LigaPro | 1/1 | 1/2 | 4/7 | 0/2 | 2/4 | 1/2 | 0/1 | 1/2 | 1/1 | 1/1 | 1/1 | 0/1 | 1/1 | 1/2 |
| Final de campeonato | 1/1 | 1/2 | 6/12 | 1/3 | 3/6 | 1/2 | 1/1 | 2/3 | 1/2 | 1/2 | 1/2 | 0/1 | 1/2 | 1/3 |
| Stream IRL con influencer | - | 0/1 | 1/1 | - | - | - | - | - | - | - | 0/1 | - | - | 0/1 |
| Unilateral para canal extranjero (Copa en Ecuador) | 0/1 | 1/1 | 2/3 | - | 0/1 | 1/1 | 0/1 | - | - | - | 1/1 | - | 0/1 | - |
| Producción host de partido internacional (subcontrato) | 1/1 | 2/2 | 10/16 | 2/4 | 4/8 | 2/3 | 1/2 | 2/4 | 1/2 | 2/3 | 1/2 | 0/1 | 2/3 | 2/4 |

Notas de diseño:
- En eventos chicos (misa, funeral, IRL) una persona hace varios roles (camarógrafo + streaming). Se puede permitir "doble rol" con penalidad (por ejemplo -30% de la habilidad en el segundo rol).
- Bajo el **mínimo** de un rol: suben la probabilidad y la gravedad de los imprevistos de ese rol (ver "Qué pasa si falta"). Entre mínimo e ideal: riesgo moderado. Con plantilla ideal igual hay imprevistos, pero se resuelven mejor.
- Un **operador PTZ** maneja 3-4 robóticas; un **cablero** atiende 2-3 cámaras con cable; un **shader** controla 6-8 cámaras de sistema.

## Niveles de experiencia y sueldos

Referencias abiertas: salario básico Ecuador 2026 $482/mes [F77]; sueldo promedio Ecuador ~$540-555/mes [F78]; tarifas OB Reino Unido (Bectu, abril 2023, jornada de 10 h) [F76];
Italia 2016: camarógrafo EUR 450 por uso [F22]; agencia de EE.UU. que cobra a clientes extranjeros en Quito: camarógrafo $106-406 por hora [F88] (precio "gringo", no local).
**Las tarifas locales de Ecuador son estimadas** (no se encontró tarifario publicado): se basan en la relación sueldo básico / jornada freelance típica de la región.

| Nivel | Sueldo/día camarógrafo (USD) | Multiplicador sugerido en el juego | Multiplicador real aprox. | Nota |
|---|---|---|---|---|
| Junior | $40-$60 | x1.0 | x1.0 | Recién salido o menos de 2 años. En Ecuador el salario básico 2026 es $482/mes (~$22 por día laborable, F77); un freelance de eventos cobra 2-3 veces eso por jornada. (estimado) |
| Semi-senior | $70-$110 | x1.7 | x1.7 | 2-5 años, ya hizo deportes y conciertos. (estimado) |
| Senior | $120-$200 | x3.0 | x3.0 | Más de 5 años, trabajó con canales nacionales; resuelve imprevistos solo. (estimado) |
| Internacional | $500-$750 | x5.0 | x11.0 | Ha trabajado con transmisiones host / extranjeras. Referencia Reino Unido (Bectu 2023): camarógrafo GBP 400-500, operador de repeticiones GBP 400-575, ingeniero de visión GBP 410-480 por 10 h (F76). En la vida real es 10-12 veces un junior local; en el juego se sugiere x5 para que sea jugable, más viáticos. |

### Tarifa diaria por rol (USD por jornada de 10-12 h)

| Rol | Junior (Ecuador, est.) | Semi-senior (est.) | Senior (est.) | Internacional (Reino Unido, Bectu 2023) |
|---|---|---|---|---|
| Camarógrafo | $40-$60 | $70-$110 | $120-$200 | $510-$635 |
| Asistente de cámara / cablero | $25-$40 | $40-$60 | $60-$90 | $380-$415 |
| Realizador / director | $80-$120 | $150-$250 | $300-$600 | $700-$1.200 |
| Productor | $60-$100 | $120-$200 | $250-$450 | $600-$1.000 |
| Operador de repeticiones | $50-$80 | $100-$150 | $180-$300 | $510-$730 |
| Ingeniero de video / shader | $60-$90 | $110-$160 | $200-$320 | $520-$610 |
| Sonidista (A1) | $40-$70 | $80-$120 | $150-$250 | $545-$710 |
| Microfonista (A2) | $30-$50 | $50-$80 | $80-$120 | $545-$570 |
| Operador de gráficos | $40-$60 | $70-$100 | $120-$180 | $450-$600 |
| Técnico de transmisión | $40-$70 | $80-$120 | $150-$250 | $545-$635 |
| Piloto de dron (con equipo propio) | $80-$150 | $150-$250 | $250-$400 | $600-$1.000 |

En el juego actual el sueldo es `15 + 15 × habilidad + azar` (~$30-90 por día): encaja con Junior/Semi-senior. Para Senior se sugiere x3 y para Internacional x5 (el real es x10-12, pero haría injugable el capítulo 6). El personal internacional debería venir con **viáticos** (hotel/vuelo) y estar disponible solo en algunos días.

## Contratos internacionales

Lo que una productora latinoamericana puede ganar a veces. Multiplicador = pago respecto a un evento nacional de tamaño parecido.

| Contrato | Requisitos | Pago | Frecuencia sugerida |
|---|---|---|---|
| Unilateral para canal extranjero en un partido de Copa (Libertadores / Sudamericana / Eliminatorias) en Ecuador | Acreditación del torneo para cada persona; 2-3 cámaras broadcast de hombro con lente 4K; Diademas de comentarista; Enlace propio: bonding de 8 módems o satélite; Al menos 1 productor y 1 camarógrafo de nivel Internacional; Factura al exterior y pago en 30 días | x2.5 | 1 oferta cada 20-30 días desde el capítulo 5, con fama 55 o más |
| Producción host (subcontrato) de un partido internacional para la confederación | 11-21 cámaras, varias de sistema con fibra; Lentes box 80-100x+ y 2 súper lentas; Servidor de repetición broadcast con 2 operadores; Unidad móvil HD propia o alquilada + generador redundante; Doble enlace (fibra + satélite); Shader y personal internacional en puestos clave; Seguro de equipos y responsabilidad civil | x5.0 | Muy rara: 1 por temporada (60-90 días) con fama 80 o más, después de la final |
| Fecha de gira de un artista internacional (pantallas IMAG + streaming) | Cumplir el rider técnico de la gira (formatos 4K, lentes largos desde FOH); Jib o grúa y cámaras robóticas en escenario; Personal Senior; contrato de confidencialidad; Ensayo técnico el día anterior; Anticipo del 50% | x3.0 | 1 cada 30-40 días con fama 45 o más |
| Lanzamiento regional de marca (varios países a la vez) | Señal SRT a la agencia en otro país con encoder de respaldo; Gráficos en dos idiomas; Intercom y escaleta al minuto; Prueba de enlace con 24 h de anticipación; Pago a 30-60 días (riesgo de caja) | x2.0 | 1 cada 25 días después del capítulo 3 |
| Evento en país vecino (Colombia / Perú) con equipo propio | Permiso aduanero de exportación/importación temporal: Ecuador no usa carnet ATA (F79); Flete y seguro del equipo en tránsito; Viáticos, hotel y vuelos del personal; 1-2 días de viaje: el equipo no puede tomar otros eventos; Personal con pasaporte; nivel Internacional en jefaturas | x4.0 | 1 cada 40-50 días con fama 60 o más; con gastos altos |
| Velada de boxeo/MMA para una plataforma de streaming extranjera | Paquete gráfico del cliente; Grabación ISO de cada cámara; Mezcla de audio internacional (sin narración) por canales separados (F75); Bonding con respaldo; Pago en dólares por transferencia | x2.0 | 1 cada 20-30 días con fama 35 o más |

Notas: (1) el **host broadcaster** produce la señal internacional (Copa Libertadores Femenina 2023: 11-21 cámaras, 2 OB, más de 100 personas, F73); los canales extranjeros compran esa señal y suman **unilaterales** con su presentador, entrevistas y comentaristas.
(2) Para viajar con equipo, **Ecuador no está en el sistema de carnet ATA**: se necesita un permiso aduanero de importación temporal y el equipo extra suele traerse de Chile o Argentina (F79). En el juego: costo de trámite + 1-2 días de espera + riesgo de retención en aduana.
(3) Seguro de equipo y de responsabilidad civil, facturación al exterior y pagos a 30-60 días son parte de la dificultad.

## Propuestas para el diseño del juego

1. **Calidad de cámara efectiva** = calidad de la cámara, limitada por su lente: `min(cam.q, lente.q + 1)` en cámaras B4/sistema. Una cámara de sistema con lente ENG barato no rinde como con un box.
2. **Posiciones de cámara**: cada evento tiene posiciones (ver arriba). Si la posición pide "lente largo" (tribuna, FOH) y llevas una camcorder, ese plano vale la mitad.
3. **Cámaras fijas sin operador**: minicámaras POV, PTZ con operador PTZ y cámaras "beauty" no cuentan como "cámara sin operador" (no se castigan a la mitad).
4. **Shader**: con 2 o más cámaras de sistema y sin shader, -6 de calidad e imprevisto "colores distintos entre cámaras".
5. **Cablero**: por cada 3 cámaras con cable sin cablero, sube el imprevisto "cable pisado". El video inalámbrico (`wireless`) baja ese riesgo.
6. **Bonding** (`encoder/bonding`) cuenta como encoder + internet de respaldo en uno.
7. **Servicios** (arañacam, grúa, riel, OB y satélite alquilados): se contratan para un evento, no se desgastan ni se pueden vender.
8. **Vehículos** = la "base" que crece: camioneta -> Sprinto -> Sprinto equipada -> tráiler/camión OB. Una OB propia reemplaza al switcher + audio + intercom en eventos grandes.

## Fuentes (páginas abiertas el 23 oct 2026)

- **F1** — Sony HDC-3500L cabeza: $60.540 (Markertek, oct 2026). <https://www.markertek.com/product/sny-hdc3500l/sony-hdc-3500l-2-3-inch-4k-cmos-lemo-portable-broadcast-studio-camera-head-only>
- **F2** — CCU HDCU-3500: $23.440; HDCU-3100: $12.999; licencia HZC-PRV50: $6.049; MSU-3500: $14.260. <https://www.markertek.com/product/sny-hdcu3500l/sony-hdcu3500l-next-generation-lemo-camera-control-unit-for-hdc-3500-hdc-3100-hdc-2500-system-cameras>
- **F3** — Sistema HDC-3500 completo usado $59.000 (precio original $125.000). <https://enhancedviewhd.com/product/sony-hdc-3500-4k-global-shutter-studio-camera-system-used/>
- **F4** — Sony HDC-3100L cabeza: $27.140. <https://www.markertek.com/product/sny-hdc3100l/sony-hdc-3100l-2-3-inch-4k-cmos-lemo-portable-broadcast-studio-camera-head-only>
- **F5** — Sony PXW-Z750 cuerpo: $38.784 (lista $40.810). <https://www.markertek.com/product/sny-pxwz750/sony-pxw-z750-xdcam-4k-hdr-2-3-type-3-chip-cmos-shoulder-mount-camcorder-120p-hfr-in-hd-body-only>
- **F6** — Sony PXW-Z200: $4.679,99, 20x, 1", 12G-SDI. <https://markertek.com/product/SNY-PXWZ200>
- **F7** — Canon XA60: $1.949 (lista $1.999), 20x, HDMI, 2 XLR. <https://videoguys.com/products/canon-xa60-camcorder>
- **F8** — Canon XF605: $4.799 (antes $5.049), 15x, 12G-SDI. <https://www.sweetwater.com/store/detail/XF605>
- **F9** — Sony FDR-AX43A: specs (20x, micro-HDMI); sin precio en la página. <https://fullcompass.com/prod/636385-sony-fdrax43a-b-uhd-4k-handycam-camcorder>
- **F10** — JVC GY-HC550: specs (1", 20x, streaming interno); sin precio. <https://www.fullcompass.com/prod/618638-jvc-gy-hc550un-4k-handheld-eng-camcorder-with-ndi-hx-mode-capability>
- **F11** — PTZOptics Move 4K 20x: $2.349 (lista $2.589). <https://www.markertek.com/product/ptz-move4k20x-we/ptzoptics-move-4k-20x-auto-tracking-ptz-camera-with-sdi-hdmi-usb-and-ip-white>
- **F12** — Panasonic AW-UE20: $1.786 (antes $2.102), 12x. <https://videoguys.com/products/panasonic-aw-ue20-4k-ptz-camera-with-3g-sdi-hdmi-ip-usb-output-black>
- **F13** — Panasonic AW-UE160: $12.473 (lista $14.674). <https://www.markertek.com/product/pan-aw-ue160kpj/panasonic-aw-ue160-uhd-4k-20x-zoom-ptz-camera-with-hdmi-and-3g-sdi-smpte-st2110-standard-compatible-black>
- **F14** — Blackmagic Studio Camera 4K Plus G2: $1.555. <https://www.sweetwater.com/store/detail/Studio4KG2d2>
- **F15** — Blackmagic URSA Broadcast G2: EUR 4.111 con IVA, montura B4. <https://en.vocas.nl/blackmagic-ursa-broadcast-g2.html>
- **F16** — Sony FX6: $6.998 en B&H (ago 2026). <https://www.newsshooter.com/2026/08/18/sony-increases-the-prices-of-the-fx3-fx6/>
- **F17** — Usados: Phantom VEO4K EUR 26.500; Canon CJ24ex7.5B EUR 11.500; Panasonic AW-UE100 EUR 6.500. <https://www.exapro.com/sony-hdc-3500-p260612133/>
- **F18** — Marshall CV503 / predecesora CV502 ~ $600. <https://www.newsshooter.com/2020/09/27/marshall-cv503-u3-miniature-pov-camera-for-usb/>
- **F19** — Kit IRL: GoPro ~$380, Osmo Pocket 3 ~$549, Osmo Mobile 8 ~$149, hotspot 5G ~$210-295, DJI Mic 2 ~$199, LiveU Solo PRO ~$2.595 + servicio $45/mes (sep 2026). <https://streamer.guide/guides/irl-streaming-gear>
- **F20** — DJI Mini 4 Pro: EUR 799-1.129. <https://dronedj.com/2023/09/11/leaker-shares-rumored-dji-mini-4-pro-drone-prices/>
- **F21** — DJI Inspire 3: desde EUR 14.999 (may 2023). <https://mynewsdesk.com/uk/dji/pressreleases/the-worlds-ultimate-cinema-drone-dji-inspire-3-goes-on-sale-globally-3255908>
- **F22** — Italia (AGCOM 2016) costos máx. por uso: spidercam EUR 30.000 (+3.000 cableado), ultra-motion EUR 10.000, Jimmy Jib con operador EUR 2.000, rail cam EUR 1.800-3.800, minicam EUR 1.000, OB 1-4 cámaras EUR 6.800-11.000, SNG EUR 2.200-4.450, camarógrafo EUR 450; producción por partido EUR 9.500-61.000. <https://www.agcom.it/sites/default/files/migration/attachment/Allegato%206-12-2016%201481035150663.pdf>
- **F23** — Canon UHD-DIGISUPER 122 AF: 8,2-1.000 mm, 2x interno (hasta 2.000 mm); sin precio. <https://www.newsshooter.com/2022/04/12/canon-announces-new-field-zoom-lens-for-4k-broadcast-with-122x-zoom-and-autofocus/>
- **F24** — Fujinon UA107x8.4 4K nuevo: $85.000 (vendedor de EE.UU.). <https://www.ebay.com/itm/304588045290>
- **F25** — Fujinon XA101x8.9 HD nuevo: $233.490 (precio pedido). <https://ebay.com/itm/NEW-Fujinon-XA101X8-9BESM-TK-2-3-Precision-Focus-Assist-HD-Lens-Finance-w-AC/391022761494>
- **F26** — Canon DIGISUPER 86 usado: precio a consultar; 9,3-800 mm + 2x. <https://www.exapro.com/canon-uj86x93b-digisuper-86-p240619317/>
- **F27** — Canon KJ20x8.2B IRSD (HD ENG 20x): $7.900. <https://www.fullcompass.com/prod/212544-canon-kj20x8-2b-irsd-portable-20x-hd-lens-with-2x-zoom-extender>
- **F28** — Canon CJ20ex7.8B (4K ENG 20x): usado desde $21.354. <https://www.adorama.com/canon-cj20ex7-8b-2-3-inch-4k-uhd-portable-eng-lens/p/cacj20ex78b>
- **F29** — Fujinon UA14x4.5 (4K ENG angular): specs; precio a consultar. <https://www.lemac.com.au/Products/FujinonUA14x45BERD4KENGBroadcastPortableZoomLens.aspx>
- **F30** — Manfrotto 504X + 645 Twin: $999,95, hasta 12 kg. <https://www.markertek.com/product/man-mvk504twinfa/manfrotto-mvk504twinfa-504x-fluid-video-head-with-645-aluminum-fast-twin-leg-tripod>
- **F31** — Sachtler aktiv8 flowtech75: $2.384 en oferta (-$2.000). <https://www.newsshooter.com/2025/07/30/sachtler-aktiv8-flowtech75-ms-tripod-system-on-sale-for-2384-25-usd/>
- **F32** — Vinten Vector 750 (cabezal): $25.237, carga 75 kg. <https://www.fullcompass.com/prod/215678-vinten-v4034-0001-vector-750-head-165-3-lbs-capacity>
- **F33** — DJI Ronin 2: $6.999, carga 30 lb. <https://www.newsshooter.com/2017/06/29/want-dji-ronin-2-going-cost-6999us/>
- **F34** — Steadicam AERO A-30: carga 20 lb (sin precio). <https://fullcompass.com/prod/533622-steadicam-aero-a30-aero-sled-with-monitor-a-30-arm-and-zephyr-vest>
- **F35** — Alquiler Jimmy Jib 12 m: EUR 850/día. <https://www.lightyshare.com/en/location-materiel/grues/jimmy-jib/12m-3-axes/3972>
- **F36** — ATEM Mini Pro $295, Mini Pro ISO $495. <https://www.sportsvideo.org/2022/10/06/blackmagic-design-announces-new-lower-price-for-atem-mini-pro/>
- **F37** — ATEM Mini Extreme ISO G2: GBP 1.850, 8 HDMI. <https://www.wexphotovideo.com/blackmagic-atem-mini-extreme-iso-g2-3242156>
- **F38** — vMix: Basic HD $60, HD $350, 4K $700, Pro $1.200 (licencia de por vida). <https://vmix.com/purchase>
- **F39** — ATEM 1 M/E Constellation HD: $1.195, 10 SDI. <https://soundpro.com/products/blackmagic-design-atem-1-m-e-constellation-hd>
- **F40** — ATEM Television Studio HD8 ISO: $4.409, 8 SDI. <https://soundpro.com/products/blackmagic-design-atem-television-studio-hd8-iso>
- **F41** — ATEM 2 M/E Constellation 4K: $4.969, 20 x 12G-SDI. <https://www.soundpro.com/blackmagic-design-atem-2-m-e-constellation-4k>
- **F42** — Ross Carbonite Ultra Solo (solo frame): $8.744. <https://www.bhphotovideo.com/c/product/1880126-REG/ross_video_cuf_112_carbonite_ultra_solo_1ru.html>
- **F43** — EVS XTnano HD/SD: $105.000 (2010). <https://www.sportsvideo.org/2010/03/25/evs-eyes-collegemid-level-market-with-xtnano-server/>
- **F44** — EVS XT-VIA usado: precio a consultar; 20 canales LSM, 40 TB. <https://www.exapro.com/evs-xt-via-p240402730/>
- **F45** — Sistema de repetición de arena: más de $50.000; productores independientes: menos de $10.000. <https://videoguys.com/blogs/news-and-sales/tips-buying-instant-replay-system-budget>
- **F46** — Ross XPression Studio Go!: $17.425 (software). <https://store.ear.net/products/xpression-studio-go-xst1-go-0001>
- **F47** — Behringer Xenyx 1204USB $189; Yamaha MG10XU $268. <https://reviewfinder.com/top-audio-mixers/behringer-xenyx-1204usb-vs-yamaha-mg10xu/>
- **F48** — Behringer X32 Rack: $745-980, 40 canales. <https://equipboard.com/items/behringer-x32-rack>
- **F49** — Behringer WING Rack: $1.299-1.799, 48 canales. <https://equipboard.com/items/behringer-wing-rack-48-channel-digital-mixer>
- **F50** — Midas M32 LIVE: $3.295, 40 canales. <https://www.sweetwater.com/store/detail/M32>
- **F51** — Yamaha CL5 usada: $10.100-35.081 (mediana $15.843). <https://www.10kused.com/used/yamaha-cl5/>
- **F52** — Calrec Brio 36: EUR 36.599. <https://bigbearsound.com/products/calrec-brio-36-compact-broadcast-digital-mixing-desk>
- **F53** — Shure SM58: $98 (lista $109). <https://www.sweetwater.com/store/detail/SM58>
- **F54** — Shure SLXD24D/SM58 doble: $1.379 (MSRP $1.739). <https://soundpro.com/shure-slxd24d-sm58-dual-wireless-handheld-microphone-system>
- **F55** — Sennheiser EW-D ME2 set corbatero: desde $749. <https://www.trewaudio.com/?p=189303>
- **F56** — Rode NTG5 kit: $485-569. <https://equipboard.com/items/rode-ntg5-shotgun-condenser-microphone-kit>
- **F57** — Sennheiser HMD 26S: $479 (lista $579). <https://www.fullcompass.com/prod/648189-sennheiser-hmd-26s-single-ear-closed-on-ear-headset-supercardioid-dynamic-mic>
- **F58** — Hollyland Solidcom C1 Pro 8 diademas: GBP 2.543. <https://www.wexphotovideo.com/hollyland-solidcom-c1-pro-wireless-intercom-system-with-8-enc-headsets-3094100>
- **F59** — Kiloview P3: $1.599 (módems aparte), 4 canales celulares. <https://www.markertek.com/product/kv-p3/kiloview-p3-4-channel-4g-5g-cellular-network-bonding-video-encoder>
- **F60** — LiveU Solo PRO HDMI/SDI: $2.595. <https://videoguys.com/products/liveu-solo-pro-hdmi-sdi>
- **F61** — LiveU LU800 8 módems: $21.000, hasta 4 cámaras. <https://shop.ear.net/products/liveu-lu800-8-modem-multi-camera-bonded-cellular-video-streaming-encoder>
- **F62** — Hollyland Mars 4K: $299,99 en oferta (normal ~$399), 450 pies. <https://www.newsshooter.com/2025/09/28/hollyland-mars-4k-wireless-video-transmission-system-on-sale-for-299-99-usd/>
- **F63** — Teradek Bolt 6 LT 750: $3.290, <1 ms, 750 pies. <https://videoguys.com/products/teradek-bolt-6-lt-750-tx-rx>
- **F64** — Cable fibra SMPTE 311 100 m: $1.588. <https://www.avendor.com/products/100-meter-smpte-311-fibre-cable>
- **F65** — Atomos Ninja V: $499,99. <https://prophotosupply.com/products/ninja-v>
- **F66** — APC Smart-UPS 1500VA: $664,99 (lista $1.095). <https://www.cdw.com/product/APC-Smart-UPS-1500VA-LCD-UPS/1934415>
- **F67** — Generador diésel 22 kVA insonorizado: NZ$20.900 (~US$12.000). <https://riequip.co.nz/products/cummins-powered-22kva-silent-diesel-generator>
- **F68** — Core SWX Hypercore Slim 98 Wh V-mount: $299. <https://www.glazerscamera.com/collections/vendors/products/coreswx-v-lock-hypercore-slim>
- **F69** — OB usadas: Sprinter $22.296 y $108.618; tráiler HD 12 cám. $337.285; Renault HD 8 cám. $680.287; tráiler UHD 20 cám. (2022) $4.001.685. <https://second-broadcast.com/en-us/collections/obvan>
- **F70** — Plan de cámaras fútbol: plataforma principal (4 cámaras), 2 de offside/16 m, 1 detrás de cada arco en alto (punto penal visible sobre el travesaño, 12-15°), 2 bajas detrás de la línea de fondo, contraplano en el centro opuesto, cámara al hombro, súper lentas en áreas; lentes súper lenta 86x o más. <https://www.freetv.com.au/wp-content/uploads/2019/08/OP-32-Outside-broadcast-requirements-for-rugby-league-rugby-union-and-soccer-Issue-4-January-2015..pdf>
- **F71** — UEFA: contraplano obligatorio en tribuna alineado con el centro; hasta 3 cámaras de borde de cancha en el lado opuesto. <https://documents.uefa.com/r/Regulations-of-the-UEFA-Champions-League-2025/26/E.2.8-Reverse-angle-cameras-Online>
- **F72** — Mundial 2014: plan de 34 cámaras por estadio; robóticas: táctica alta detrás del arco, 2 BoxCam alineadas con cada arco, 2 dentro de los arcos, beauty, túnel. <https://www.live-production.tv/news/sports/robotic-cameras-fifa-world-cup-stadiums.html>
- **F73** — Copa Libertadores Femenina 2023 (host): 11-21 cámaras, 2 OB HD, flyaways, más de 100 profesionales. <https://www.sportsvideo.org/2023/10/11/grup-mediapro-serves-as-host-broadcaster-for-2023-copa-libertadores-femenina/>
- **F74** — Mundial 2026: spidercam en juego, cablecam lineal, RefCam, cámaras de cine en túnel y tribuna. <https://www.lensrentals.com/blog/2026/07/camera-innovations-used-in-the-2026-world-cup/>
- **F75** — Boxeo en streaming: 5 cámaras (2 trípode en balcón, 2 inalámbricas al hombro en esquinas neutrales, 1 beauty fija), ATEM 1 M/E, shading, gráficos y lenta en CasparCG, LiveU Solo+. <https://www.svgeurope.org/blog/headlines/oxyfire-media-on-live-streaming-two-jacks-and-two-english-titles-in-british-boxing/>
- **F76** — Bectu (Reino Unido) tarifas OB abril 2023, 10 h: camarógrafo GBP 400-500, asistente GBP 300-325, jib GBP 575-650, remotas GBP 440-580, EVS GBP 400-575, sonido GBP 430-450, supervisor sonido GBP 530-560, ingeniero de visión GBP 410-480, ingeniero uplink GBP 430-500. <https://union.bectu.org.uk/asset/83BC9675%2D444F%2D4AA7%2D901C9652250842B5/>
- **F77** — Ecuador: salario básico unificado 2026 = $482/mes. <https://www.eluniverso.com/noticias/economia/salario-basico-unificado-2026-482-ecuador-servicio-incrementos-multas-nota/>
- **F78** — Ecuador: sueldo promedio ~$540-555/mes, mediana $469. <https://www.paylab.com/ec/salarios-en-el-pais?lang=es>
- **F79** — Ecuador NO es país del carnet ATA: se necesita permiso aduanero de importación temporal; IVA 15%; equipo extra suele venir de Chile o Argentina. <https://www.pact.co.uk/resource-hub/international-production-exploitation/country-intel/ecuador.html>
- **F80** — LigaPro asume la producción audiovisual 2026 con aliados internacionales; distribución por Zapping. <https://www.eldiario.ec/deportes/ecuador-ligapro-asume-produccion-audiovisual-y-define-fixture-inicial-de-la-temporada-2026-13022026/>
- **F81** — Robo de una unidad móvil de LigaPro en El Triunfo; se consiguió reemplazo desde Latacunga. <https://www.primicias.ec/deportes/ligapro/asalto-triunfo-tecnico-universitario-deportivo-cuenca-unidad-movil-105152/>
- **F82** — Críticas a la calidad de LigaPro ("cancha radioactiva" por mala calibración de cámaras). <https://www.expreso.ec/deportes/iphone-cancha-radioactiva-hizo-famosa-ligapro-283926.html>
- **F83** — Chile: streaming deportivo básico CLP 200.000 por 4 h con equipo y personal; plan avanzado 2-3 cámaras con operador y marcador. <https://www.2x3.cl/servicios/articulo/ST6xygB-transmision-vivo-eventos-deportivos>
- **F84** — Ecuador CNE: contratos de streaming y circuito cerrado de $6.327 (34 días) y $15.325 (171 días). <https://delegaciones.cne.gob.ec/wp-content/uploads/2026/04/8.-DIFUSION-Y-COMUNICACION-DE-LA-GESTION-INSTITUCIONAL-1.pdf>
- **F85** — Funeral en vivo: trípode fijo, el audio es lo más importante (corbatero o señal de la consola), respaldo de internet, una persona vigilando. <https://funeral.com/es/blogs/the-journal/how-to-livestream-a-funeral-recommended-hardware-internet-options-and-audio-basics>
- **F86** — OB grandes: hasta 30 personas; roles A1/A2, V1/V2, EVS, TD, gráficos. <https://en.wikipedia.org/wiki/Production_truck>
- **F87** — OB moderna: 3 servidores de repetición, switcher con 2 paneles, router 288x288, gráficos en tiempo real. <https://www.sportsvideo.org/2024/02/13/ross-production-services-rps-unveils-new-ob-truck-for-larger-scale-sports-productions/>
- **F88** — Precios para clientes extranjeros en Quito (agencia de EE.UU.): camarógrafo $106-406/h (referencia "internacional", no local). <https://beverlyboy.com/videographer/quito-freelance-videographer-prices-in-2026/>
- **F89** — Tesis UPS: percepción de transmisiones de LigaPro; "móviles de producción, todo eso cuesta dinero". <https://dspace.ups.edu.ec/bitstream/123456789/31339/1/UPS-CT012321.pdf>
- **F90** — Sony HXC-FZ90: estudio 4K con lente 20x (descontinuada, sin precio). <https://www.adorama.com/SOHXCFZ90SN.html>
- **F91** — Sony HDC-F5500 S35: pedido especial, sin precio. <https://www.bhphotovideo.com/c/product/1859582-REG/sony_hdc_f5500_super_35mm_4k.html>
