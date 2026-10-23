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
- [ ] Subir a GitHub (pendiente: el acceso de GitHub de esta sesión no funciona; ver bitácora)

### Pendientes de ajuste (balance)
- [ ] Capítulos 4→5→6 se completan muy seguido (el bot tarda ~4 días entre ellos). Hacer más largos.
- [ ] Revisar si el inicio es muy difícil para alguien que no contrata personal.

### Fase 2 — Juego bonito (pendiente)
- [ ] Gráficos y personajes dibujados
- [ ] Sonidos y música
- [ ] Animaciones durante el evento
- [ ] Más imprevistos y más tipos de evento
- [ ] Productora rival con historia propia

### Fase 3 — App en Google Play (pendiente)
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
