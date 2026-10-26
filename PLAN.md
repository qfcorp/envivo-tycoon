# 📒 PLAN DEL PROYECTO — EN VIVO Tycoon (nombre provisional)

Juego de gestión (tipo "tycoon") de una productora de eventos y transmisiones en vivo.
Inspirado en la idea de Kingshot, pero un solo jugador al inicio.

## 🎯 Idea del juego

Empiezas con una productora pequeña en un garaje. Buscas clientes, contratas
personal (camarógrafos, operador de vMix, sonidista, técnico de streaming),
compras equipos y cubres eventos. Durante cada evento pasan imprevistos
(se rompe un cable, se cae el internet, llueve, el camarógrafo llega tarde)
y tú decides cómo resolverlos. Con el dinero y la fama creces hasta
transmitir finales en estadios.

## 🔁 Ciclo del juego

1. Clientes: llegan ofertas de eventos (pago, requisitos, dificultad).
2. Preparar: eliges qué personal y qué equipos llevar.
3. En vivo: imprevistos aleatorios con decisiones.
4. Resultado: cobras, estrellas del cliente, sube o baja la fama.
5. Crecer: comprar/reparar equipo, contratar mejor personal, capítulos de historia.
6. Día: hasta 3 eventos por día (mañana, tarde y noche). Los gastos fijos se cobran una vez, al "Cerrar el día" (o solos al usar los 3 turnos), y se reparten entre los eventos de ese día.

## 🧱 Tecnología

- HTML + CSS + JavaScript puro (sin instalar nada). Se abre en el navegador del celular.
- `js/logic.js` → reglas del juego (se puede probar con Node sin navegador).
- `js/ui.js` → pantallas.
- Guardado automático en el mismo navegador (localStorage).
- Pruebas: `tests/` (simulación de cientos de partidas + prueba en celular simulado).

## 🗺️ Fases

### Fase 1 — Prototipo jugable ✅ (22 oct 2026)
- [x] Bloc de notas del plan (este archivo)
- [x] Lógica: dinero, fama, días, 6 capítulos de historia (Don Ramiro, rival MegaVisión)
- [x] Clientes: 9 tipos de evento (misa → final de campeonato) con requisitos
- [x] Buscar clientes: redes, anuncio pagado, visitar en persona
- [x] Personal: 4 roles, contratar, despedir, habilidad que sube, moral y renuncias
- [x] Equipos: 12 equipos en tienda, desgaste, reparar, vender, repuestos
- [x] Evento en vivo con 11 tipos de imprevistos y 2-3 decisiones cada uno
- [x] Interfaz para celular (5 pestañas) con consejo de qué falta
- [x] Guardado automático (si cierras en pleno evento, sigue donde quedó)
- [x] Pruebas: 400 partidas simuladas sin errores + celular simulado OK
- [x] Versión de un solo archivo (dist/) y enlace para jugar
- [x] Subido a GitHub: qfcorp/envivo-tycoon

### Pendientes de ajuste (balance)
- [x] Capítulos 4→5→6 se completaban muy seguido (~4 días entre ellos). Rediseñados (ver abajo).
- [ ] Revisar si el inicio es muy difícil para alguien que no contrata personal.
- [x] El bot ganaba todos los duelos contra MegaVisión y el juego era muy fácil. Rebalanceado (ver "Dificultad" abajo).
- [ ] Probar con jugadores reales si el capítulo 4 (crecer sin quebrar) se siente justo.

### Historia (6 capítulos) · ritmo medido con el bot (día mediano en que se completa)
| Cap. | Personaje | Objetivo | Día (antes) | Día (ahora) |
|---|---|---|---|---|
| 1 · El garaje | Don Ramiro | 3 eventos | 4 | 4 |
| 2 · Armando el equipo | Don Ramiro | 2 cámaras, 3 contratados, 15 de fama | 32 | ~50 |
| 3 · El gran lanzamiento | Lucía Mena (marca) | 2 lanzamientos de marca con 4⭐+ | 45 | ~70 |
| 4 · La rival | Germán Vélez (MegaVisión) | 3 duelos ganados + 40 de fama + ganar $6.000 en el capítulo | 60 | ~125 |
| 5 · Al estadio | Don Aurelio (dirigente) | Switcher de producción (calidad 4+) + 2 partidos de LigaPrima con 4⭐+ | 79 | ~160 |
| 6 · La final | Don Ramiro | Final de campeonato con 5⭐ (65 de fama) | ~103 | ~210 |

Reglas nuevas:
- Ofertas de la historia: el evento que pide el capítulo (lanzamiento, LigaPro, final) ya no aparece al azar; llega como oferta especial cada cierto tiempo (cap. 3: cada 6 días; cap. 5: cada 10; cap. 6: la final a los 18 días y luego cada 10). MegaVisión no puede robarlas.
- LigaPro solo aparece desde el capítulo 5 y la final desde el 6 (en modo libre, siempre).
- Contratos disputados (desde el capítulo 4): 20% de las ofertas de dificultad 2+. Pagan 30% más y son 1 punto más difíciles. Cada uno muestra la calidad que promete MegaVisión (entre 45 y 95, sube con el capítulo y la dificultad). Ganas el duelo solo si tu calidad final la supera (+3 fama extra); si no, lo pierdes (-4 fama extra). Ya no hay empates.
- Lo que pide cada capítulo (lanzamientos, partidos, duelos) cuenta desde que empieza ese capítulo.
- Mensajes cortos de los personajes en el registro (Lucía Mena, Germán Vélez, Don Aurelio, Don Ramiro).

### Dificultad (23 oct 2026) · el juego gratis tiene que exigir, pero se puede terminar sin pagar
Todos los números están juntos en `BALANCE`, al inicio de `js/logic.js`, para ajustarlos fácil (y más adelante sumar equipos mejores).

Qué cambió:
- **Los 3 primeros eventos siguen suaves:** 1 solo imprevisto, sin "suerte del día", sin imprevistos que cuestan plata, sin pagos atrasados ni pérdida de fama.
- **MegaVisión es una rival de verdad:** su calidad aparece en el contrato disputado y hay que superarla (ver arriba).
- **Más imprevistos en eventos grandes:** dificultad 1-2: 1; dificultad 3: 2; dificultad 4-5: 3 (más 1 si llevas equipo gastado y 35% de chance de 1 extra; máximo 5). Los errores pesan más en eventos grandes (+15% por punto de dificultad).
- **Imprevistos nuevos:** permiso del local y flete urgente (cuestan entre 8% y 10% del pago del evento), robo de un equipo, señal que se traba, cambio de guion y gente tapando la cámara. Los tres últimos dependen del nivel de tu técnico, director o camarógrafo.
- **Gastos diarios que crecen con la empresa** (`dailyCost`): local según el tamaño (personas + equipos): garaje $20, oficina $60 (13+), estudio $160 (16+), centro de producción $310 (19+). Más $2 por persona, 3% de los sueldos y 0,3% del valor de los equipos cada día. Crecer muy rápido puede quebrarte.
- **Sueldos:** cada nivel que sube una persona le sube $15 el sueldo; en eventos grandes cobran más (+15% por punto de dificultad sobre 1); a veces piden aumento y, si el equipo está desmotivado, hay reclamo y baja la moral de todos.
- **Ánimo del equipo:** los eventos grandes cansan; un día sin evento lo recupera. Un equipo cansado resta hasta 5 puntos de calidad.
- **Clientes:** a veces cancelan una oferta (5% al día) o pagan la mitad ahora y la otra mitad a los 3 días (25% de los eventos de dificultad 2+).
- **Fama:** -1 cada 3 días sin trabajar. Los clientes exigen más cuanto más famoso eres (-0,18 puntos por cada punto de fama).
- **Equipos:** se gastan más en eventos grandes y fallan con menos de 40% de estado.
- **Habilidad:** cuesta más subir (4, 7, 11 y 16 eventos para cada nivel).
- **Ofertas de la historia:** vienen con apoyo del personaje (lanzamiento +6, LigaPro +9, final +24 de calidad) para que la historia se pueda terminar.

Resultado con el bot (400 partidas, 400 días, 4 semillas):
| Medida | Antes | Ahora | Meta |
|---|---|---|---|
| Quiebras | 0% | 7% a 10,5% | 6% a 15% |
| Termina la historia | 100% | 75% a 83% | 60% a 85% |
| Día mediano de la final | 103 | 202 a 214 | 150 a 220 |
| Duelos perdidos | 0% | ~61% | 25% o más |
| Estrellas promedio cap. 3 a 6 | ~4,8 | ~3,5 (3,8 / 3,7 / 3,8 / 3,2) | 3,0 a 3,8 |

Nota: el bot es "razonable" pero no muy fino. Un bot que solo acepta duelos con más margen pierde ~36%. Una persona que repara, descansa al equipo y elige bien sus duelos debería ir mejor que el bot.

### Fase 2 — Juego bonito (en curso)
- [x] Íconos propios dibujados (equipos, roles, eventos, menú)
- [x] Retratos de personajes: Don Ramiro, Germán Vélez (MegaVisión), Lucía Mena, Don Aurelio
- [x] Sede que crece: garaje → oficina → estudio → centro de producción (con cámaras y unidad móvil)
- [x] Escena animada del evento en vivo con efectos por imprevisto (lluvia, apagón, chispa, gol, acople...)
- [x] 22 efectos de sonido hechos por código + ambiente de público, con botón para silenciar
- [x] Música de fondo (7 temas, botón propio)
- [x] Más imprevistos y más tipos de evento (16 eventos)
- [ ] Productora rival con historia propia

### Fase 3 — App en Google Play (lista para generar y subir)
- [x] Paso previo: app instalable desde el navegador (ícono, modo sin internet, botón Instalar)
- [x] Empaquetar como app Android (TWA con pagos de Google: `android/`, guía `docs/ANDROID_GOOGLE_PLAY.md`); falta generarla en qfone y subirla
- [x] Ícono, capturas y fichas en 10 idiomas (`assets/promo/`, `docs/play_store/`); falta llenar Play Console

### Fase 4 — Venta con dinero real y servidor (en curso)
Decisiones (23 oct 2026): VPS de OVH, dirección **juego.tukanec.com** (luego un dominio propio), cobro con **Pago Plux**
(portado de TuPass), venta de paquetes de créditos, paquete de inicio, Pase VIP 30 días y equipos exclusivos.
- [x] Contrato juego ↔ servidor: `server/API.md`
- [x] Servidor PHP 8.3 + SQLite: cuentas, sesiones, partida en la nube, monedero de créditos con libro, entregas, VIP con bono diario (`server/`)
- [x] Cobro con Pago Plux: pago normal, OTP, 3DS, webhook opcional; nunca se guarda la tarjeta; idempotente
- [x] Panel de ventas `admin.php` (totales, CSV para facturar, dar créditos a mano) y páginas legales (borrador para abogado)
- [x] Instalador para el VPS (`server/deploy/instalar.sh`) y guía paso a paso `docs/DESPLIEGUE.md`
- [x] En el juego: pestaña Tienda, crear cuenta / entrar, comprar, canjear, bono VIP, elegir partida nube vs celular
- [x] Equipos exclusivos (Dron 4K, grúa, unidad móvil, generador) y equipos solo VIP (guardados si se vence el VIP)
- [x] Pruebas: `bash server/tests/correr.sh` (230 + 32) y `bash tests/tienda_e2e.sh` (compra de punta a punta desde el juego)
- [ ] Publicar en el VPS (lo hace Dimitry con `docs/DESPLIEGUE.md`) y agregar `/var/lib/envivo` y `/etc/envivo` al respaldo restic
- [ ] **Pendiente para salir en vivo:** poner las claves de PRODUCCIÓN de Plux (Paso 4 de `docs/PASOS_DEMO_VPS.md`). El demo arranca SIN Plux (decisión de Dimitry 2026-10-23: que nadie pague por error). Sin claves el servidor rechaza todo pago (`plux_no_disponible`). Para demos: créditos a mano desde el Centro de Control.
- [ ] Completar RUC/correo/dirección en las páginas legales (sin WhatsApp: soporte solo por correo y en el juego) y revisión de abogado (también de los nombres de marcas)

### Fase 5 — Mercado entre jugadores (listo)
Reglas: `server/MERCADO.md`. Comisión 5% (se quema), solo quien compró créditos, máx. 10 publicaciones, vencen a los 7 días,
equipos con número de serie, los créditos nunca se convierten en dinero real.
- [x] En el juego: inventario del servidor sincronizado con la bodega (`js/premium.js`, `tests/test_premium.js`)
- [x] Servidor: inventario, publicar / comprar / retirar, ganancias retenidas 7 días, moderación en el Centro de Control
- [x] Pantalla del mercado en el juego

### Fase 6 — Comunidad y eventos en línea (primera parte lista)
Diseño completo: documento "Eventos en línea entre productoras" (Claude Docs). Contrato técnico: `server/SOCIAL.md`.
- [x] Servidores (reinos), asociaciones, chat de servidor y de asociación con moderación, reportes y bloqueo
- [x] Liga Semanal y Desafío Técnico del Día
- [x] Mega Festival y Duelo de Productoras (el servidor repite cada jugada con `server/validador/`)
- [ ] Productor del Año, Switcher en Vivo (minijuego) y Pase de Temporada
- [ ] Gran Licitación en coalición (tiempo real), Copas internacionales servidor contra servidor, Desafío de Cadenas Internacionales

### Fase 7 — Realismo (listo)
Plan: `docs/REALISMO.md`. Investigación: `docs/EQUIPOS_REALES.md`. Datos y textos: `js/datos.js`. Reglas: `js/logic.js`.
- [x] Catálogo de equipos reales con marcas cambiadas: 90 equipos en 19 categorías (de handycam a cámara de sistema con lente box 122x, PTZ, cámara lenta, drones, grúa, steadicam, switchers hasta la unidad móvil, repeticiones, gráficos, audio, boom y diademas de comentarista, intercom, bonding, video inalámbrico, fibra, energía, lluvia, maletas, vehículos y alquileres por evento). Requisitos reales: lentes, fibra, adaptador y soporte pesado para el lente box, shader, piloto de dron, operadores.
- [x] Personal por evento (mínimo / ideal por rol, 14 roles) con semáforo, ahorro en sueldos y riesgo al ir con menos gente (más imprevistos de ese rol, más graves y menos calidad); con la plantilla completa igual puede salir algo mal
- [x] Niveles de experiencia del personal (Junior, Semi-senior, Senior, Internacional) con ascensos, eventos nacionales e internacionales
- [x] Plan de cámaras por evento (tribuna principal con lente box, cerrada, detrás de cada arco, al hombro, contraplano, súper lenta, dron y arañacam en la final; ring con 4 lados y cenital...) con ajuste de cada cámara a su posición
- [x] Eventos nuevos: boxeo, lucha libre, funeral (sin dron, errores más caros), lanzamiento de autos, IRL con influencers; contratos internacionales (6 tipos, con requisitos, viaje y caída de fama)
- [x] Todos los textos en `js/datos.js` con claves y {parámetros} (listos para los 10 idiomas)
- [x] Pantalla: preparar evento con semáforo por rol y plan de cámaras dibujado, tienda por categorías, contratos internacionales (la lógica ya expone `crewPlan`, `cameraPlan`, `CATEGORIAS`, `shopByCategory`, `requisitosInternacional`, `takeAvisos`, `venue`)
- [x] Gráficos semirrealistas y rápidos; íconos de los 14 puestos y eventos nuevos

## 📝 Bitácora

- 2026-10-22: se crea el proyecto y el plan.
- 2026-10-22: publicada versión jugable en Claude: https://claude.ai/artifact/3Sr6tCaVc7Yg3DyYfpPq47
- 2026-10-22: prototipo completo y probado. Balance medido con bot: gana la historia en ~53 días de juego (mediana), 0 quiebras en 400 partidas.
- 2026-10-23: rediseño del ritmo de la historia. Cada capítulo tiene personaje (retrato en la pantalla), ofertas de la historia espaciadas y la rival MegaVisión con contratos disputados. Bot: capítulos en días 4 / 32 / 45 / 60 / 79 / 103 (mediana), 0% quiebras, 100% termina la historia en 400 días. La prueba ahora falla si el ritmo se rompe.
- 2026-10-23: parte gráfica (íconos, retratos, sede, escena animada), sonidos y app instalable. Todo subido a GitHub.
- 2026-10-23: juego más difícil (para que luego tenga sentido comprar mejor equipo). MegaVisión con calidad propia en los duelos, más imprevistos y algunos que cuestan plata, gastos que crecen con la empresa, sueldos más altos, pagos atrasados, cancelaciones y pérdida de fama sin trabajar. Los 3 primeros eventos siguen suaves. Bot: capítulos en días 4 / 50 / 70 / 126 / 160 / 212, 8% quiebras, 79,5% termina la historia, pierde el 61% de los duelos, 3,5⭐ promedio en los capítulos 3 a 6. Números en `BALANCE` (js/logic.js). Guardado v2 (las partidas v1 cargan bien).
- 2026-10-23: servidor de venta terminado (cuentas, nube, créditos, VIP, Plux en sandbox, panel, instalador) y probado de punta a punta desde el juego. Diseño de eventos en línea, chat, copas entre servidores y cadenas internacionales. Plan de realismo (personal por evento, equipos reales). Demo previsto para las ~09:00.
- 2026-10-23 (madrugada): mercado y chat (pantallas), soporte solo por correo y dentro del juego, música (7 temas), validador anti-trampas en el servidor (repite cada evento con la misma lógica; 3660 comprobaciones, 100% de resultados falsos detectados) y módulo visual del plan de personal y cámaras por recinto (17 tipos de lugar). Falta conectarlos a la pantalla principal cuando termine la traducción a 10 idiomas.
- 2026-10-23: realismo en la lógica: catálogo de 90 equipos con marcas parodia (vMax, Blackmagia ATOM, LigaPrima...), 14 roles con plantilla mínima e ideal por evento, niveles Junior a Internacional, plan de cámaras, 5 eventos nuevos y contratos internacionales. Capítulo 4 ahora pide ganar $6.000 en el capítulo (antes juntar $12.000); locales más suaves ($20 / $60 / $120 / $200); un evento grande con 1-2⭐ casi no se cobra; las opciones seguras de los imprevistos cuestan algo. Bot con personal y equipos realistas (400 partidas, 3 semillas): capítulos en días 4 / 21 / 53 / 77 / 108 / 165-176, 6,8% a 8,3% quiebras, 65% a 67,5% termina la historia, pierde el 29,5% a 31% de los duelos, 3,5⭐ promedio en los capítulos 3 a 6. Guardado v3 (las v1 y v2 cargan bien).
- 2026-10-23 (04:00): todo conectado en la pantalla v6: tienda por categorías, plan de cuadrilla y cámaras, resumen del día, pestaña En línea (Liga, Festival, Duelos, Desafío, vincular Discord), juego completo en 10 idiomas con carga solo del idioma en uso, arreglos de rendimiento y de QA. Servidor v2 con Centro de Control (`/control/`), Discord, Google Play, borrar cuenta, arreglos de la auditoría de seguridad, límites de nginx, respaldos y alertas por Telegram. Pruebas del servidor: más de 1.300 en verde.
- 2026-10-26: **varios eventos por día** (decisión de Dimitry: "todavía incomoda eso"; antes 1 evento = 1 día y cada evento cargaba todos los gastos fijos, casi todos se veían en pérdida).
  - Hasta 3 eventos por día (mañana, tarde y noche) con el mismo personal y equipos. Los eventos grandes (dificultad 4 o más: lanzamiento de autos, concierto, LigaPrima, final) y los internacionales cierran el día al terminar (los internacionales además pasan sus días de viaje). Se avisa en Clientes ("Todo el día") y en la preparación.
  - "Cerrar el día" (antes "Descansar") funciona siempre; los gastos fijos se cobran una sola vez al cerrarlo (también sin eventos). El 3er evento cierra el día solo.
  - Resultado: la cifra grande es lo que dejó el evento (pago − sueldos − movilización − viaje). Aparte: "Gastos fijos del día $X: se cobran al cerrar el día. Repartidos entre los N eventos de hoy, a este le tocan $Y", cuánto bajaría con un evento más y la ganancia con su parte. La fama ("+N → ahora X") sigue igual; el olvido de fama solo corre al cerrar el día.
  - Al cerrar el día sale UNA ventana "Resumen del día": eventos, lo que dejaron, gastos fijos, resultado del día y los avisos (temporadas, pagos, renuncias...). Día sin eventos y sin avisos: solo un aviso corto.
  - Lo diario sigue una vez por día (olvido de fama, ofertas que vencen, cobros pendientes, ánimo, aumentos, quiebra, `alNuevoDia` de sede, decoración, movilización, logros, misiones, temporadas); lo de cada evento sigue por evento. Los intentos en línea (liga, festival, duelos) y el validador del servidor no cambian (el evento ocupa el día y usan la exigencia de antes).
  - Guardado v4 (`s.hoy`, `s.resumenDia`); las partidas v1-v3 cargan y empiezan el día con 0 eventos.
  - Balance (bot de `tests/test_logic.js`, 400 partidas; main = antes, semillas 1000 / 5000 / 9000):
    - Quiebras en la historia: antes 4,5 / 5,3 / 4,5 % → ahora 3,0 / 3,3 / 2,8 %. Modo libre: antes 27,8 / 32,0 / 23,5 % → ahora 8,3 / 10,3 / 10,3 %. Historia completada 97 % (antes 95,5 %).
    - Solo partir los gastos no alcanzaba: la fama sube más rápido (1,7 eventos por día) y, con la exigencia de la fama, una productora famosa sacaba 1-2⭐ en los eventos chicos y se quedaba sin trabajo (historia 5,5-6,8 %). Cambios: 1 oferta nueva segura cada día (`dia.ofertas` 0-1 → 1), exigencia en eventos chicos `expectSmall` 0,05 → 0,035 y tope `expectMaxRep` 85. Los intentos en línea usan los números de antes (`expectIntento`).
    - Eventos que se ven en pérdida (ganancia del evento − su parte de los gastos): inicio 4,8 % (antes 5,6 %), historia 8,9 % (antes 10,7 %), libre 17,0 % (antes 27,8 %). Con todo el gasto del día en el evento (como se veía antes) serían 6,0 / 17,7 / 25,4 %.
    - Días: la historia dura ~79 días (antes ~105; los eventos son los mismos). Estrellas: capítulos 5 y 6 ~4,0⭐ (antes 3,8 / 3,7), capítulos 3-6 3,84⭐; la rival gana el 26,7 % de los duelos.
    - Jugador "humano" simple (contrata 6 personas, lleva todo lo sugerido, toma lo que sale con 2⭐ o más; 1000 partidas de 60 días): quiebras 21,6 % → 13,6 %.
    - Topes de la prueba cambiados a propósito: quiebras historia 1-7 % (antes 1-11 %), modo libre máx. 15 % (antes 30 %), estrellas por capítulo hasta 4,1 (antes 3,9) y capítulos 3-6 hasta 3,95 (antes 3,8), historia 70-130 días (antes 90-150), mínimos entre capítulos [0, 6, 10, 10, 15, 15]; nuevo: eventos en pérdida con su parte máx. 8 % al inicio y 15 % en la historia. Sin cambios en las ventajas pagadas.
  - Textos nuevos solo en español (los otros idiomas los muestran en español hasta la traducción final). Cambiaron de sentido en español y hay que retraducir: ayuda `dia`, `gastos` y `ganancia` (js/ayuda.js). Prueba nueva `tests/test_varios_eventos.js` (capturas `varios_resultado.png` y `varios_resumen.png`).
- 2026-10-26: **lo comprado con diamantes funciona siempre + nuevas ventajas del Pase VIP + combo completo con diamantes** (rama `vip-siempre`). Decisión de Dimitry: "Que funcione siempre: lo comprado con diamantes se debe quedar. Busca otros incentivos para el VIP" y "si permites comprar cosas con diamantes, deberías poder comprar todo el combo que se necesita".
  - Equipos VIP (`vip_cam8k`, `vip_switcher`, `vip_satelital`): se **canjean** con el Pase VIP activo, pero después son tuyos y **funcionan siempre** (historia, preparación, "Elegir lo mejor", al aire y en línea: Festival, Copa, Duelos, Liga, validador). Se quitó todo el bloqueo (`Premium.bloqueado` siempre false, sin "Necesita el Pase VIP", sin `equipo_vip_sin_vip` en el validador, sin `vip_requerido` en `Festival::revisarEquipo`, Duelos los lleva siempre).
  - Techo de ventaja pagada (MONETIZACION.md §1) intacto: los equipos VIP que lleva un equipo se cobran del bono de ventajas en Copa y Duelos (`Ventajas::recorteVip`, 2 puntos por cámara/switcher VIP, 1 el satélite; 4 cámaras + switcher + satélite = 11 de 12). Simulación con `batalla.js`: todo VIP solo +19,5 %; todo VIP + bono máximo recortado +21,5 % (≤ 25 %). Ojo: una estrella DENTRO del equipo además de todo lo VIP puede pasar el techo (ya pasaba antes con el Pase activo).
  - **Ventajas del Pase VIP según el nivel VIP** (solo mientras el Pase está activo; con nivel 0 cuenta como VIP 1; tabla en `js/premium.js PASE_VIP` = `server/src/Vip.php Vip::PASE`, la prueba revisa que sean iguales):
    - VIP 1–2: 4 eventos por día · reparaciones −30 % · obras de la Sede oficial −10 % de tiempo · bono diario $150 + 10 créditos + 1 cable
    - VIP 3–4: 4 eventos · −35 % · obras −15 % · $250 + 10 créditos + 2 cables + 1 batería
    - VIP 5–6: 5 eventos · −40 % · obras −20 % · $400 + 15 créditos + 2 cables + 2 baterías
    - VIP 7–8: 5 eventos · −45 % · obras −25 % · $600 + 15 créditos + 3 cables + 3 baterías
    - VIP 9–10: 5 eventos · −50 % · obras −30 % · $800 + 20 créditos + 4 cables + 4 baterías + todo el equipo al 100 %
    - Siguen: 1 oferta extra al día, +1 intento en Desafío y Duelos, +1 pase de Festival, asociación gratis, distintivo. Las reparaciones son instantáneas, así que "más rápido" se aplicó a las obras de la Sede oficial (servidor, al empezar la obra). Más eventos por día es solo modo historia (los intentos en línea no usan extensiones). Bono y obras: en el servidor.
    - La Tienda muestra la tabla "Con el Pase VIP (según tu nivel VIP)" en la tarjeta del Pase con tu fila marcada.
  - **Combo completo con diamantes**: a un equipo canjeado con créditos (ej. Vizart Motor 3D AR Oro con fama 33) le falta algo que con dinero pide más fama (Zony HDK-3200, 45): cada pieza tiene precio en 💎 (su Edición Exclusiva si existe; si no, la pieza normal a 4 × raíz del precio, ej. HDK-3200 = 460 💎) y un botón "Canjear todo el combo (N 💎)" en el aviso de canje, en "Ya es tuyo" y en la preparación ("Les falta algo para funcionar"). Personal que con tu fama aún no aparece (ej. piloto de dron con fama < 10): contratar uno ya por 150 💎 (habilidad 2, junior); si ya aparece, "Contratar …" abre Personal con el rol elegido. Servidor: `POST /api/gastar` con `juego:<clave>` / `personal:<rol>` (`Monedero::gastarCombo`): solo piezas del combo (`CatalogoJuego::COMBOS`, generado de `Game.comboDe`) de un equipo de crédito que está en tu bodega, tope 4 por pieza / 2 por rol. Llega como entrega `equipo` (vuelve en partida nueva). En línea sigue la regla de fama de siempre (Festival y Copa revisan la fama pública).
  - Textos nuevos solo en español.

## ⏭️ Pendiente (después del demo)
- [ ] Dimitry: subir al VPS (`docs/DESPLIEGUE.md`), instalar respaldos y alertas (`docs/OPERACION.md`), proteger `/control/` con 2FA y lista de IPs
- [ ] Dimitry: crear el correo de soporte y completar RUC/correo/dirección en las páginas legales; revisión de abogado (también nombres parodia)
- [ ] Dimitry: certificación de Plux para el dominio; Discord (`docs/DISCORD.md` y `docs/DISCORD_BOT.md`); Google Play (`docs/ANDROID_GOOGLE_PLAY.md`)
- [ ] Unificar el trato en francés y ruso (menús con "vous/вы", historia con "tu/ты")
- [ ] Copas internacionales servidor contra servidor, Gran Licitación en coalición, cadenas internacionales, Pase de Temporada
- [ ] Borrar la rama de respaldo `wip-dificultad` en GitHub (todo ya está en main; desde aquí no se pudo borrar)

- 2026-10-23 (06:00): balance final para el demo (capítulo 3 en ~19 días, quiebra con aviso y contando lo que te deben, trabajar bien rinde más), textos del juego traducidos, enlace de demo con partida del capítulo 4. Guías `docs/DEMO.md` y `docs/DESPLIEGUE.md`. Economía del final ajustada (bot: caja al día 120 de $149k a $56k).
- 2026-10-23 (07:30): fechas especiales (Halloween, Navidad, Pase del Niño, Fin de año, San Valentín, Semana Santa, Carnaval), mejoras de la sede estilo Kingshot (30 niveles con materiales), 3 servidores por universo con reparto parejo, Copa de Servidores semanal (motor determinista, equipo de la casa = mediano del universo, bono mixto), salud diaria y fusión de servidores abandonados (solo con aprobación), mudanza voluntaria, pestaña Servidores en el Centro de Control, datos de demo que se borran con un comando.
- Pendiente menor: si se recarga la página justo después de contratar y completar un capítulo, a veces no vuelve a salir la ventana "Capítulo completado" (el premio sí se cobra). La prueba del navegador lo detecta a veces.

- 2026-10-23 (09:00): parte pagada para competencia con techo de ventaja 20–25 % (medido: Copa 23 %, Duelos 19,5 %): VIP 1–10 por compras acumuladas, regalos para toda la asociación, Mecenas, ofertas por logros, pase de temporada (gratis + $4.99 / $9.99), sede oficial en el servidor con aceleradores y ayudas, personal estrella (créditos o fichas gratis), Pase de Copa. Tienda nueva con precios reales por canal. Ensayo de instalación completo `tests/ensayo_vps.sh` 55/55. Servidor `correr.sh` 75/0.
- 2026-10-23: Paso 1 del demo hecho: en Cloudflare quedó `juego.tukanec.com` → A `149.56.111.193` (Solo DNS, nube gris). Comprobado: la dirección ya responde con esa IP. Siguiente: Paso 2 (instalar en el VPS, `docs/PASOS_DEMO_VPS.md`).
- 2026-10-23 (10:00): Paso 2 hecho en el VPS (RESULTADO todo bien: API 200, código protegido 404, HTTPS sí, validador activo). Decisión de Dimitry: **Plux directo en PRODUCCIÓN** (misma integración certificada de TuPass; comparado línea por línea: mismas direcciones y pasos). `instalar.sh` y `config.env.ejemplo` ahora dejan `PLUX_AMBIENTE=produccion`; guías actualizadas; prueba real con la Oferta de bienvenida ($0,99). Ensayo del VPS 58/58.
- 2026-10-23 (10:02): el demo arranca SIN claves de Plux (se salta el Paso 4; queda pendiente para salir en vivo). En el VPS `PLUX_AMBIENTE` quedó en sandbox y vacío: al poner las claves, cambiar también a `produccion`.
- 2026-10-23 (10:30): por lo que Dimitry vio jugando el demo: **guía "toca aquí"** del primer evento (`js/guia.js`, mano animada + Don Ramiro, se puede saltar, solo partida nueva; prueba 41/41); **aviso de cuenta** (tarjeta en Inicio + ventana 3 veces en todo el juego: fin del tutorial, día 15, capítulo 4; prueba 48/48 con flechas); **botones "?"** con explicaciones (`js/ayuda.js`: dinero, fama, día, gastos, personal, calidad, ganancia; los números de arriba se pueden tocar); tabla de personal con "Llevas / Mínimo / Ideal" y leyenda del semáforo; detalle de los **gastos del día** en el resultado; **flechas ‹ ›** en la fila de categorías de la tienda de equipos.
- Pendiente menor: 145 códigos de error del servidor (módulos nuevos) sin traducir en `errores.json` (`tests/test_traducciones.js`): en español se ven bien; en otros idiomas salen en español.
- En curso: dibujos distintos para cada tipo de equipo (cámara de acción, de bolsillo con gimbal, minicámara POV, etc.).
- 2026-10-23 (10:50): Inicio **plegable** (filas con resumen y etiqueta "Nuevo"); **créditos 💎 arriba** (con cuenta; tocarlos abre la Tienda); **nombre de la productora** (botón en Inicio; sale en el letrero del local); Centro de Control → Jugadores → **"Dar dinero del juego"** (para demos; llega al abrir/recargar). Pruebas: servidor 75/0, juego todo verde.
- En curso (ayudantes): **movilización** (taxi tipo app con precios, comprar vehículos, flota con mantenimiento, animación del personal cargando la furgoneta con el nombre de la productora) y **decoración** del local (flores que se marchitan, sillón, cafetera, letrero de neón… mejoran las ofertas de clientes).
- 2026-10-23 (13:30): con 6 ayudantes: **movilización y flota** (app parodia "Llévame" con Económico/XL/Carga; transporte ≈3–6 % del pago en eventos chicos, tope 10 %, el tutorial nunca pierde; 4 vehículos con mantenimiento diario y combustible; animación del personal cargando la furgoneta con el nombre de la productora; las cotizaciones suben 3 % para compensar el transporte), **vida en el local** (gente, taxi, nubes, estrellas, antena, vapor), **escena animada del evento en vivo** (por tipo de evento, monitor EN VIVO, reacciones), **Liga para nuevos** (Unirme de un toque, barra para crear asociación), **mensajes de error en 10 idiomas** (147 códigos), prueba del navegador estable (por http). Todas las pruebas: servidor 75/0 y 26 pruebas del juego en verde.
- 2026-10-23 (12:50): Dimitry aprobó que las cotizaciones suban 3 % para compensar el transporte (BALANCE.transporte.cotiza).
- 2026-10-23 (14:10): **Edición Exclusiva** en cada categoría (14 equipos nuevos con créditos 💎, de 100 a 950): misma calidad que el mejor normal + se gasta la mitad, reparar a mitad, menos bultos, acabado dorado; también se consiguen gratis (dinero del juego con más fama, o en el mercado). Salen primero en cada categoría de Bodega. Tope de ventaja en la Copa sin cambios. Pruebas: servidor 75/0, 28 pruebas del juego en verde.
- 2026-10-23 (14:30): la barra de arriba (dinero, fama, créditos, día) ahora SÍ queda fija al bajar (overflow-x:hidden en body rompía position:sticky) y queda encima de las ventanas abiertas, para ver cuánto tienes al comprar.
- 2026-10-23 (14:40): decisión de Dimitry: el juego arranca en el idioma del celular/navegador (como estaba); el jugador puede cambiarlo con 🌐.
- 2026-10-23 (16:30): **avisos de equipos dañados** (resultado, Inicio, Bodega, preparación) y **partida en la nube con versión + un solo dispositivo activo** (una pestaña vieja ya no pisa el progreso; 'Tu partida se abrió en otro dispositivo'). Servidor 77/0, pruebas del juego y de dos dispositivos en verde. En curso: 20 ayudantes con las fases 1–4 del documento de lanzamiento (RUC 1793135099001, edad 16+, sin Brasil al inicio, Discord sí).
- 2026-10-23 (17:30): **fases 1–4 del lanzamiento, con 20 ayudantes**, ya unidas en main:
  - Cuenta: borrar cuenta, términos y edad mínima de 16 años.
  - Facturación SRI de cada venta, para el ERP (HMAC, `docs/FACTURACION_SRI.md`).
  - Reporte de errores y analítica propia (retención, embudo), cada una con su pestaña en el Centro de Control.
  - Notificaciones push, correo para recuperar la contraseña (`docs/CORREO.md`), misiones del día y de la semana, premio diario de 7 días.
  - Logros y libro de combos, buzón con códigos de regalo para influencers (`/canjear.html`).
  - Impulsos: equipo de obra extra, Fondo de crecimiento y Tarjeta semanal.
  - Visitar la productora de otros jugadores y aplaudirla.
  - Ayuda de asociación con un toque, investigación y tienda de fichas.
  - Contenido por edad del servidor (Duelos día 3, Festival día 5, Copa día 7) y Copa con tema por día.
  - Guías por sección, páginas legales completas (RUC, 16+, 27 traducciones, `docs/LEGAL_REVISION.md`).
  - Operación: pool PHP propio, Cloudflare, simulacro de respaldo, `/api/salud`, modo mantenimiento, prueba de carga.
  - Nombre en Google Play: **"EN VIVO Tycoon: Productora TV"**. Marca "Tycoon" revisada: riesgo bajo, salvo México (`docs/MARCA_NOMBRE.md`).
- Herramienta nueva: `python3 tools/fusionar_errores.py` copia `docs/traducciones/errores_nuevos/*.json` a `errores.json` y a `js/lang`.

## ⏭️ Pendiente para salir (lanzamiento)
- [ ] Dimitry: dirección de la empresa para [DIRECCIÓN] en los términos y la privacidad; revisión de abogado (`docs/LEGAL_REVISION.md`).
- [ ] Dimitry: crear el servidor de Discord (`docs/DISCORD_CREAR_SERVIDOR.md`).
- [ ] Dimitry: correo (Cloudflare Email Routing + Brevo, `docs/CORREO.md`).
- [ ] Dimitry: claves push (`sudo php server/bin/push_claves.php --escribir`).
- [ ] Dimitry: clave de facturación para el ERP (`FACTURACION_CLAVE`).
- [ ] Dimitry: Cloudflare naranja (`docs/CLOUDFLARE_PRODUCCION.md`).
- [ ] Dimitry: UptimeRobot y Healthchecks (`docs/MONITOREO.md`).
- [ ] Dimitry: Google Play (`docs/PUBLICAR_GOOGLE_PLAY.md`), con productos nuevos `equipo_obra_2`, `fondo_crecimiento` y `tarjeta_semanal`.
- [ ] Dimitry: registrar la marca en SENADI (clases 9 y 41).
- [ ] Dimitry: claves de Plux de producción al salir en vivo.
- [ ] Preguntar al contador: ¿las ventas de Google Play se facturan al jugador (consumidor final) o a Google? ¿Cómo se devuelven las de consumidor final?
- [ ] Capturas de la tienda sin marcas reales (en curso); cambiar "Steadicam" por un término genérico en los textos (en curso).
- [ ] Publicar las traducciones legales (`/terminos_en.html`, etc.: falta su `location` en nginx).
- [ ] Hook de `repairCost` en `logic.js` para la investigación "Taller compartido" de la asociación (hoy no tiene efecto).
- 2026-10-23 (17:45): todo probado junto: servidor `correr.sh` 104/0, 48 pruebas del juego en verde, ensayo del VPS 87/0. Esta vez se actualiza con `instalar.sh` (agrega las tareas programadas nuevas, las páginas `/recuperar.html` y `/canjear.html` en nginx, el grupo PHP propio y los límites). Capturas nuevas de Google Play (8 × 10 idiomas).
- 2026-10-23 (18:10): sin marcas reales en textos visibles: Steadicam → estabilizador corporal (10 idiomas); Osmo → Ozmo; Steadikam Aéreo → Estabilio Aéreo; Smart-UPS → VoltGuard; Rosco → Rozz. dist/ reconstruido.
- 2026-10-25: **para qué sirve cada equipo** (pedido de Dimitry): frase corta y sencilla (máx. 90 caracteres, `item.<clave>.uso` en `js/datos.js`) en las tarjetas de la tienda, tus equipos de la Bodega y la preparación del evento; el botón "?" de cada equipo abre la frase, el detalle técnico, la calidad y lo que necesita. Solo en español (los demás idiomas la muestran en español hasta la traducción final). Prueba `tests/test_descripciones.js`.
- 2026-10-23 (19:00): **PayPal** en la tienda web (no en la app de Google Play): redirección a PayPal, captura y verificación en el servidor, webhook firmado (reembolso, reverso o disputa → se revierte la compra), mínimo $4.99 (PAYPAL_MINIMO), factura SRI con forma de pago 20. Guía `docs/PAYPAL.md`. Servidor 106/0, ensayo VPS 87/0.
- 2026-10-23 (18:50): arreglo: en 'Equipos dañados' del resultado, al reparar, la barra y el número ahora muestran cómo quedó (p. ej. 81% → 100%).
- 2026-10-25: arreglo (reporte del dueño en el celular, con cuenta): la fama del resultado se "reiniciaba" al cerrarlo y las reparaciones volvían a verse dañadas. Causa: la partida en la nube confundía el guardado propio (lento o sin respuesta, al volver a la app o en la revisión de cada minuto) con "otro dispositivo", dejaba de guardar y "Usar la partida más nueva" abría una versión vieja. Ahora reconoce su propio guardado, espera a que termine antes de revisar y, si hay avance aquí, pregunta antes de reemplazar. El resultado dice "Fama +10 → ahora 23" y arriba se actualiza al instante. Prueba `tests/test_fama.js`.

## ⏸️ EN PAUSA (viernes 23-oct-2026, 19:40) — seguir el lunes
**Regla de Dimitry (23-oct): los textos nuevos se escriben SOLO en español mientras se desarrolla; la traducción a los otros 9 idiomas se hace una sola vez al final, con la versión aprobada. Las pruebas de traducción deben avisar "pendiente de traducir" en vez de fallar hasta esa fase (ajustarlo el lunes).**
- Hecho: lo que falta en otro idioma sale en español (nunca la clave) y las pruebas `test_i18n`, `test_traducciones` y `test_traduccion_juego` lo avisan como "pendiente de traducir" sin fallar. Fase final: `TRADUCCION_ESTRICTA=1` vuelve falla lo pendiente; la lista completa para traducir de una vez sale con `node tools/pendientes_traduccion.js` (`--json=archivo` para pasarla a traducir).
**Regla de Dimitry (23-oct): primero terminar el JUEGO para poder probarlo y publicarlo; manuales, guías y trámites van después. El lunes: 1) varios eventos por día, 2) lo que salga al probarlo.**
**Lo que está en main y en el servidor:** todo lo de arriba, ya probado.
- Servidor 106/0, ensayo del VPS 87/0.
- PayPal listo pero sin claves.
- Arreglo de la barra de equipos reparados.

**Hecho (26-oct): "Varios eventos por día"** — rama `varios-eventos` (ver Bitácora del 26-oct). Falta que Dimitry lo pruebe en el celular.

**Pendientes de Dimitry (no dependen de programar):**
- Crear el Discord (`docs/DISCORD_CREAR_SERVIDOR.md`).
- Correo de soporte y SMTP (`docs/CORREO.md`).
- PayPal Business y claves (`docs/PAYPAL.md`).
- Marca en SENADI (`docs/MARCA_NOMBRE.md`).
- Abogado (`docs/LEGAL_REVISION.md`).
- Contador: cómo facturar las ventas de Google Play.
- Claves de producción de Plux al salir en vivo.

## 🐞 Correcciones de jugabilidad reportadas por Dimitry (domingo 25-oct-2026) — PRIORIDAD
1. Selección de cámaras: por defecto siempre sale la cámara de "Don Ramiro"; al cambiarla por una mejor, el juego no lo registra y baja la probabilidad.
2. Descripciones de equipos: cada aparato debe tener una descripción corta que diga para qué sirve.
3. Bloqueo por "cámara al hombro": el juego la exige siempre, pero no está en el inventario y al inicio (sin fama) no se puede desbloquear ni comprar.
4. Marcador de estado/batería: después de reparar tras un evento, el porcentaje no se actualiza y sigue como dañado.
5. Fama: al terminar el evento dice +10, pero al cerrar la pantalla vuelve a 3 o 0.
- 2026-10-25: arreglados los 5 puntos de Dimitry:
  - Cámaras: la mejor va primero, el cambio se respeta y la probabilidad sube; aviso de lente que falta con "cámara + lente"; cámara al hombro Zony HXR-MK2500 desde fama 0.
  - Descripciones "para qué sirve" en los 115 equipos, con botón "?".
  - Fama y equipos reparados: la partida en la nube creía que su propio guardado era de otro dispositivo y recargaba una versión vieja. El resultado dice "Fama +N → ahora X".
  - Temporada de Halloween: ya no tapa el inicio con "Resumen del día"; las pruebas usan una fecha fija.
  - El precio de reparación cobrado ahora es igual al mostrado (equipos un 25 % más baratos de reparar).
  - Textos nuevos solo en español; `node tools/pendientes_traduccion.js` lista lo que falta traducir.
  - Pruebas: servidor 106/0 y 53 pruebas del juego en verde.
- 2026-10-26: decisión de Dimitry: bodega al doble (40 → 80 equipos) y personal +50 % (12 → 18 personas). Bot sin cambios (4,5 % quiebras en historia).
- 2026-10-26: pedido de Dimitry ("no me gusta ir abriendo cada cosa"): **Inicio es la productora por dentro** (`js/hub.js`). El edificio cortado muestra 9 cuartos + antena, letrero y buzón; cada uno se toca y abre lo mismo que abría su fila (Clientes, Personal, Bodega, Registro como pestaña; Logros, Historia, Misiones/premio diario/temporadas, Sala/decoración/visitas, Flota, En línea, Tu sede, Buzón como hoja de abajo). Avisos en cada lugar (ofertas, equipos por reparar, "!" para reclamar, punto de novedades) en vez de "Nuevo". Cambia con el local (garaje → oficina → estudio → centro): fachada, letrero, antena, muebles, vehículo propio, trofeos y la sala de control "en obra" hasta el Estudio. Debajo: qué hacer ahora, el capítulo y pasar el día. Un módulo nuevo elige su lugar con `{ hub: '<lugar>' }`; si no, va a "Más". Prueba `tests/test_sede_hub.js`.
- 2026-10-26: unidos en main (todo en verde: servidor 106/0 y las 56 pruebas del juego):
  - Varios eventos por día con gastos prorrateados.
  - Inicio nuevo: la productora por dentro (js/hub.js).
  - Cámara VIP y combos de compra: lo que falta se ofrece en combo y en la preparación; el equipo VIP funciona solo con el Pase VIP activo, y la preparación lo explica.
  - Pruebas del servidor con reloj fijo.
  - La cuenta regresiva del Festival ya no se detiene cuando la pantalla se repinta.
- PREGUNTA ABIERTA para Dimitry: el equipo VIP comprado con diamantes funciona solo mientras el Pase VIP de 30 días está activo. ¿Se queda así o debe funcionar siempre?
- 2026-10-26: VIP: lo comprado con diamantes funciona siempre; el Pase VIP da beneficios por nivel (4-5 eventos por día, descuento de reparación 30-50 %, obras más rápidas, bono diario); combos completos con diamantes aunque falte fama; contratar personal con diamantes. Bodega: botón 'Reparar todo' con el costo total.
- 2026-10-26: decisión de Dimitry: lo pagado vale, pero con punto medio: todo VIP + ventaja pagada máxima ≈ +30 % en la Copa (Ventajas::RECORTE_VIP_PARTE = 0.6; medido +29,2 %).
- 2026-10-26: lo comprado con diamantes (exclusivo, VIP, premium) no ocupa cupo en la bodega (Game.cuentaBodega).
- 2026-10-26: pedido de Dimitry ("a los F2P demos regalos si hacen misiones"): **premios por constancia** en la hoja de Misiones (la pizarra de Inicio). Un día cuenta cuando abres el cofre de 60 puntos. **Cofre de la semana** con 5 de 7 días: $2.000 + materiales y, con cuenta, 25 créditos + el **premio de la semana** (rota cada lunes: equipo de obra extra 24 h → personal estrella 2 partidos → prueba del Pase VIP 1 día). **Ruta del mes**: 7 días (20 créditos + materiales), 14 días (30 créditos + materiales), 21 días (un **equipo de Edición Exclusiva permanente**, rota cada mes entre los 6 más baratos). Sin cuenta: dinero y materiales. Barras de avance de la semana y del mes. Topes: 10 créditos/día (cofres del día, igual) y nuevo 120/semana (`misiones_creditos_semana`). Economía: un F2P constante pasa de ~240 a ~400 créditos/mes (≈ $3,20; el paquete más barato es 250 por $1,99; la Tarjeta mensual da 600 por $4,99). Ventajas en línea sin cambios. Detalle en `server/MONETIZACION.md` §6. Pruebas: `server/tests/pruebas_misiones.php` y `tests/test_misiones_f2p.js`.

## ⏸️ FIN DEL DÍA (lunes 26-oct-2026, 17:15)
Todo está en main y probado (servidor 106/0, 56 pruebas del juego).
- Hecho hoy:
  - Varios eventos por día con gastos prorrateados.
  - Inicio nuevo (la productora por dentro).
  - Bodega 80, personal 18.
  - Botón "Reparar todo".
  - Lo de diamantes funciona siempre y no ocupa bodega.
  - Combos completos con diamantes.
  - Pase VIP por niveles.
  - Ventaja pagada ≈ +30 %.
  - Regalos F2P por misiones (cofre semanal, premio de la semana, ruta del mes).
- Próximo: lo que Dimitry encuentre al probar en el celular. Después, la traducción final (`node tools/pendientes_traduccion.js`) y la publicación.
