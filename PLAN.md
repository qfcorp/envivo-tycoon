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
