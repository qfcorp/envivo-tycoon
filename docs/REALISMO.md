# Rediseño realista: personal por evento, plan de cámaras, nuevos eventos y contratos internacionales

Pedido del dueño (23 oct 2026). Se implementa sobre la investigación de `docs/EQUIPOS_REALES.md`
y `docs/eventos_y_personal.json` (equipos reales con marcas cambiadas, roles y plantillas por evento).

## 1. Personal por evento (la mecánica central)
Cada tipo de evento pide una **plantilla de personal**: por cada rol, un **mínimo** y un **ideal**.

Roles del juego (además del dueño):
| Rol | Qué hace | Si falta |
|---|---|---|
| Realizador / director | Decide qué cámara sale al aire | Planos tarde, se pierden momentos |
| Productor / coordinador de piso | Organiza tiempos con el cliente | Retrasos, cliente molesto |
| Camarógrafo | Opera una cámara | Cámara fija o apagada |
| Asistente de cámara / cablero | Tiende cables, ayuda a mover cámaras | Cables pisados, cámaras que no se pueden mover |
| Sonidista | Mezcla el audio | Audio saturado o bajo |
| Microfonista / boom | Micrófono boom y corbateros en entrevistas | Entrevistas sin audio claro |
| Técnico de transmisión | Encoder, internet, bonding | Cortes en la transmisión |
| Operador de repeticiones | Repeticiones y cámara lenta | Sin repeticiones en deportes |
| Operador de gráficos | Marcador, nombres, logos | Sin marcador ni cintillos |
| Ingeniero de video (shader) | Iguala color y exposición de cámaras de estudio | Colores distintos entre cámaras |
| Piloto de dron | Tomas aéreas con permiso | No se puede usar el dron |

**Decisión del jugador:** puede ir con menos gente que el ideal para ahorrar sueldos.
- Por debajo del **mínimo** de un rol: suben mucho la probabilidad y el daño de los imprevistos de ese rol
  (por ejemplo, sin cablero aparece "se pisaron los cables y la cámara 3 se quedó sin señal").
- Entre mínimo e ideal: riesgo moderado.
- Con plantilla completa **igual puede salir algo mal**: siempre hay una probabilidad base de imprevistos;
  el personal con más experiencia los resuelve mejor.
- La pantalla de preparar muestra, por rol, "asignados / mínimo / ideal" con un semáforo y el ahorro en sueldos.

## 2. Experiencia del personal
- Niveles: **Junior**, **Semi-senior**, **Senior**, **Internacional** (sueldos relativos según la investigación).
- Cada persona guarda **eventos nacionales** y **eventos internacionales** trabajados; la habilidad sube con la experiencia.
- Los candidatos de mejor nivel aparecen con más fama; el personal internacional es caro y escaso.
- El personal Senior/Internacional resuelve mejor los imprevistos y baja el riesgo de su rol.

## 3. Plan de cámaras por evento
Cada evento tiene **posiciones de cámara** reales, con el tipo de cámara/lente ideal. Ejemplo, partido de LigaPro:
principal en tribuna alta (cámara de sistema con lente box 80-100x), cerrada en tribuna, cámaras detrás de cada arco,
cámara de cancha al hombro, contraplano, y extras (repetición en cámara lenta, dron, cablecam en la final).
- El juego asigna automáticamente la mejor cámara disponible a cada posición y muestra el plan dibujado
  (cancha, ring, escenario o iglesia con las posiciones cubiertas o vacías).
- Una cámara que no es la ideal para su posición rinde menos (por ejemplo, una handycam en la tribuna principal de un estadio).

## 4. Eventos nuevos
| Evento | Lo especial |
|---|---|
| Velada de boxeo | Ring con 4 lados, cámara cenital, repeticiones de golpes, pago medio-alto |
| Lucha libre | Mucho movimiento, cámaras al hombro en el ring, público ruidoso |
| Funeral transmitido | Pocas cámaras, discreción: sin dron, sin gráficos llamativos; el cliente es muy sensible a errores |
| Lanzamiento de autos | Escenario, luces, dron, influencers en sitio; pago alto |
| IRL con influencers | 1 a 3 personas, cámara en gimbal o celular + mochila de bonding + micrófono inalámbrico; muchos problemas de señal; rápido y barato |
| Boda, graduación, lanzamiento de producto | Ya existen: se actualizan con plantilla y plan de cámaras reales |

## 5. Contratos internacionales
- Aparecen **de vez en cuando** (rara vez, más con fama alta y desde el capítulo 4).
- Pagan varias veces más, pero piden: personal con experiencia internacional (al menos el realizador y parte del equipo),
  equipo de nivel broadcast, y días de viaje en los que no puedes tomar otros contratos; tienen gastos de viaje.
- Si sale mal, la caída de fama es grande.

## 6. Equipos reales con marcas cambiadas
Ver `docs/EQUIPOS_REALES.md`: desde handycams baratas hasta cámaras de sistema con lentes box 100x+, PTZ, cámaras
de cámara lenta, drones, switchers, repeticiones, audio, intercom, bonding, fibra, generadores y la unidad móvil (OB van).
Nombres de marca parodia (Zony, Kanon, Panasonika, Blackmagia, Fujinox, Shur...), modelos cambiados, sin logos.
Antes del lanzamiento, revisar la lista con un abogado.

## Orden de construcción
1. Catálogo realista + roles nuevos + plantillas por evento + riesgo por falta de personal (lógica y pruebas).
2. Pantalla de preparar con plantilla por rol y plan de cámaras dibujado.
3. Eventos nuevos y contratos internacionales.
4. Rebalancear con el jugador automático para mantener las metas de dificultad actuales.
