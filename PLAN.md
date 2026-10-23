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
- [ ] El bot gana casi todos los duelos contra MegaVisión: probar con jugadores reales si son muy fáciles.

### Historia (6 capítulos) · ritmo medido con el bot (día mediano en que se completa)
| Cap. | Personaje | Objetivo | Día |
|---|---|---|---|
| 1 · El garaje | Don Ramiro | 3 eventos | 4 |
| 2 · Armando el equipo | Don Ramiro | 2 cámaras, 2 contratados, 12 de fama | 32 |
| 3 · El gran lanzamiento | Lucía Mena (marca) | 2 lanzamientos de marca con 4⭐+ | 45 |
| 4 · La rival | Germán Vélez (MegaVisión) | 3 duelos ganados + 40 de fama + $12.000 | 60 |
| 5 · Al estadio | Don Aurelio (dirigente) | Switcher ATEM + 2 partidos de LigaPro con 4⭐+ | 79 |
| 6 · La final | Don Ramiro | Final de campeonato con 5⭐ (65 de fama) | ~103 |

Reglas nuevas:
- Ofertas de la historia: el evento que pide el capítulo (lanzamiento, LigaPro, final) ya no aparece al azar; llega como oferta especial cada cierto tiempo (cap. 3: cada 6 días; cap. 5: cada 10; cap. 6: la final a los 18 días y luego cada 10). MegaVisión no puede robarlas.
- LigaPro solo aparece desde el capítulo 5 y la final desde el 6 (en modo libre, siempre).
- Contratos disputados (desde el capítulo 4): 20% de las ofertas de dificultad 2+. Pagan 30% más y son 1 punto más difíciles. 4⭐+ = duelo ganado (+3 fama extra); 2⭐ o menos = duelo perdido (-3 fama extra).
- Lo que pide cada capítulo (lanzamientos, partidos, duelos) cuenta desde que empieza ese capítulo.
- Mensajes cortos de los personajes en el registro (Lucía Mena, Germán Vélez, Don Aurelio, Don Ramiro).

### Fase 2 — Juego bonito (en curso)
- [x] Íconos propios dibujados (equipos, roles, eventos, menú)
- [x] Retratos de personajes: Don Ramiro, Germán Vélez (MegaVisión), Lucía Mena, Don Aurelio
- [x] Sede que crece: garaje → oficina → estudio → centro de producción (con cámaras y unidad móvil)
- [x] Escena animada del evento en vivo con efectos por imprevisto (lluvia, apagón, chispa, gol, acople...)
- [x] 22 efectos de sonido hechos por código + ambiente de público, con botón para silenciar
- [ ] Música de fondo
- [ ] Más imprevistos y más tipos de evento
- [ ] Productora rival con historia propia

### Fase 3 — App en Google Play (pendiente)
- [x] Paso previo: app instalable desde el navegador (ícono, modo sin internet, botón Instalar)
- [ ] Empaquetar como app Android
- [ ] Ícono, capturas, ficha en Play Console

### Fase 4 — En línea tipo Kingshot (pendiente, opcional)
- [ ] Cuentas de jugador y guardado en servidor
- [ ] Ranking de productoras
- [ ] Alianzas / competir por contratos

## 📝 Bitácora

- 2026-10-22: se crea el proyecto y el plan.
- 2026-10-22: publicada versión jugable en Claude: https://claude.ai/artifact/3Sr6tCaVc7Yg3DyYfpPq47
- 2026-10-22: prototipo completo y probado. Balance medido con bot: gana la historia en ~53 días de juego (mediana), 0 quiebras en 400 partidas.
- 2026-10-23: rediseño del ritmo de la historia. Cada capítulo tiene personaje (retrato en la pantalla), ofertas de la historia espaciadas y la rival MegaVisión con contratos disputados. Bot: capítulos en días 4 / 32 / 45 / 60 / 79 / 103 (mediana), 0% quiebras, 100% termina la historia en 400 días. La prueba ahora falla si el ritmo se rompe.
- 2026-10-23: parte gráfica (íconos, retratos, sede, escena animada), sonidos y app instalable. Todo subido a GitHub.
