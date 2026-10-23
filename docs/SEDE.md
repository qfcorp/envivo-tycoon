# Nivel de sede (mejoras tipo Kingshot)

Pedido del dueño (23 oct 2026): "en los niveles altos, como en Kingshot, para subir hay que hacer 4 o 5 mejoras
chicas con materiales que juntas día a día". Es la meta larga después de la historia (que termina hacia el día 105),
junto con las temporadas.

Código: `js/sede.js` (reglas, textos en 10 idiomas, dibujos y tarjeta de Inicio). Pruebas: `tests/test_sede.js`.
Se conecta con la API de extensiones de `js/logic.js` (`Game.registrarExtension`) y con el registro de tarjetas
de Inicio de `js/ui.js` (`window.EnVivoInicio`). No cambia nada del juego si el archivo no se carga.

## Cómo funciona

- **Niveles 1 a 30.** Para pasar del nivel N al N+1:
  1. Terminas **todas** las mejoras chicas del nivel N+1 (4 edificios hasta el nivel 7; 5 desde el nivel 8).
  2. Haces la obra de la **sede principal** (la que sube el nivel). Pide los requisitos de fama/capítulo.
- **Edificios** (cada uno gana un nivel por cada mejora terminada):
  | Edificio | Bono |
  |---|---|
  | Sala de control | + calidad en todos los eventos |
  | Bodega y taller técnico | − gastos fijos, + lugares en la bodega, el taller recupera estado después de cada evento |
  | Estudio y set | + calidad en ruedas de prensa y bodas |
  | Oficina comercial | + % de pago en los contratos nuevos |
  | Unidad móvil y garaje | + calidad en deportes (`EVENT_TYPES[t].deporte`) |
  | Escuela de personal (desde el nivel 8) | + lugares de personal |
  Cada nivel deja fuera a uno de los edificios básicos (rota), así que todos suben parejo.
- **Equipo de obra:** 1 obra a la vez; 2 desde el nivel 5. Cada obra tarda días del juego (se ve "· N días").
  Una obra guarda el día en que termina (`fin`), así que termina bien aunque pasen varios días de golpe
  (viajes internacionales, el día que pasa dentro de `finishEvent`).
- **Materiales** (6, con dibujo propio): Cables y conectores, Placas electrónicas, Paneles LED, Credenciales de prensa,
  Planos técnicos y el raro **Chips de video 4K** (desde el nivel 6 los piden la sala de control, la escuela y la sede principal).
- **De dónde salen**, día a día:
  1. **Entrega del día**: botón en la tarjeta de Inicio, una vez por día del juego. 4 + 0,55 × nivel unidades;
     la mitad va al material que más te falta para el nivel actual. Desde el nivel 4 puede traer un chip (22 % + 1,2 % por nivel).
  2. **Después de cada evento**: (dificultad + 1) × factor por estrellas (0 / 0,3 / 0,6 / 1 / 1,35 / 1,7) × (1 + 3 % por nivel).
     Se muestra en el resultado (`result.extras`).
  3. **Bonos**: 5 estrellas = +2 unidades y 40 % de un chip; **ganarle un duelo a MegaVisión** = +3 unidades y 1 chip;
     contrato internacional con 3+ estrellas = +1 chip.
  4. **Reciclar**: en la ventana "Mejorar sede", un equipo propio roto (estado ≤ 40 %) o viejo (calidad ≤ 2) se desarma
     por materiales (precio / 300 × estado, de 1 a 14, + 1 chip si es de calidad 4 o más). El equipo desaparece.
     Nunca la cámara de Don Ramiro, ni equipos premium/VIP ni alquileres. Pide confirmación.
  - **No hay cajas pagadas ni materiales con dinero real** en esta versión.
- **Azar determinista:** la sede usa su propio hash (semilla de la sede + día + contador) y **no consume `s.seed`**,
  así que reclamar o no la entrega no cambia las ofertas, los imprevistos ni la suerte del resto de la partida.
  Las extensiones no corren en los intentos en línea (`s.intento`), así que el validador del servidor no cambia.

## Números (tabla resumida)

Por nivel objetivo: mejoras, días de cada mejora, días de la sede principal, materiales comunes del nivel completo
(todas las mejoras + sede), chips, dinero del juego y requisitos para la obra de la sede principal.

| Nivel | Mejoras | Días mejora | Días sede | Materiales | Chips | Dinero | Requisito |
|---|---|---|---|---|---|---|---|
| 2 | 4 | 1 | 2 | 48 | 0 | $270 | — |
| 3 | 4 | 1 | 2 | 58 | 0 | $600 | fama 6 |
| 4 | 4 | 1 | 2 | 70 | 0 | $1.050 | capítulo 2 |
| 5 | 4 | 1 | 2 | 83 | 0 | $1.650 | fama 12 + capítulo 2 |
| 6 | 4 | 2 | 2 | 95 | 2 | $2.370 | fama 15 + capítulo 3 |
| 8 | 5 | 2 | 3 | 144 | 3 | $5.000 | fama 22 + capítulo 3 |
| 10 | 5 | 2 | 3 | 184 | 7 | $7.800 | capítulo 5 |
| 12 | 5 | 3 | 3 | 226 | 8 | $11.240 | capítulo 6 |
| 13 | 5 | 3 | 4 | 248 | 6 | $13.190 | fama 32 + historia terminada |
| 15 | 5 | 3 | 4 | 300 | 11 | $17.550 | fama 36 + historia |
| 20 | 5 | 4 | 5 | 471 | 16 | $31.200 | fama 46 + historia |
| 25 | 5 | 5 | 6 | 726 | 20 | $48.750 | fama 55 + historia |
| 30 | 5 | 6 | 6 | 1.119 | 27 | $70.200 | fama 55 + historia |

El dinero empieza muy bajo (12 × nivel², para no romper la economía de los capítulos 2 a 4, que es justa)
y crece en el modo libre, donde sobra caja. Los materiales y los días son el freno principal.

**Ritmo medido** (bot de `tests/test_sede.js`, que entra todos los días y deja una reserva de 20 días de gastos;
mediana de 16 partidas): nivel **4** el día 50, **8** el día 100, **16** el día 200 y **20** el día 300 (sin llegar al 30).
Metas: 3–5, 8–12, 15–20 y sin el máximo al día 300. Una persona que no entra todos los días va más lento.

**Bonos** (chicos para no romper la historia): calidad = control 0,4 por mejora (todos), estudio 0,45 (prensa/boda),
unidad móvil 0,45 (deportes), redondeado hacia abajo y con **tope total** de 0,6 × nivel hasta el nivel 10 (+6)
y +0,3 por nivel después (+12 al nivel 30). Medido: +2 al nivel 5, +5 al 10, +12 al 30.
Gastos fijos −0,8 % por mejora de bodega (tope −15 %); pago +0,4 % por mejora comercial (tope +8 %);
+1 lugar de personal cada 3 mejoras de la escuela (tope +3); +2 lugares de bodega cada 3 de bodega (tope +12);
taller: +1 % de estado cada 3 mejoras de bodega (tope +4 %) a los 3 equipos más gastados después de cada evento.

## Cómo ajustar

Todo está en `AJUSTE` y `requisito(L)` al principio de `js/sede.js`:
- `mat.base / crec / porNivel`: materiales por mejora (`base × crec^(L-2) + porNivel × (L-2)`); `RECETA` reparte por edificio.
- `dinero / dineroExp`: dinero por mejora (`dinero × L^dineroExp`); la sede principal cuesta 1,5× y 1,2× en materiales.
- `diasMejora(L) / diasNivel(L)`: tiempos; `segundoObrero`: nivel del segundo equipo de obra.
- `chipsMejora(L) / chipsNivel(L)`, `raroDesde`: chips de video 4K.
- `cofre`, `evento`, `reciclar`: lo que entra cada día.
- `bono`: tamaño y topes de los bonos (`topeCalidad(n)` es el tope total de calidad).
- `requisito(L)`: fama y capítulo (desde 0) por nivel; desde el 13 pide la historia terminada.
Después corre `node tests/test_sede.js` (reporta el nivel a los días 50/100/200/300 y falla si sale de las metas)
y `node tests/test_sede.js --navegador` (Playwright, 390×844, capturas `tests/capturas/sede_*.png`).

## Guardado

`s.sede = { nivel, mejoras: { "<nivel>.<edificio>": 1 }, materiales: { cables, placas, paneles, credenciales, planos, chips },
obras: [{ tipo: 'mejora'|'nivel', ed, nivel, inicio, dias, fin }], ultimoCofre, semilla, n }`.
`migrar` arma o limpia el campo (sin azar ni efectos), así que las partidas viejas siguen funcionando.

## Integración

- Script: `<script src="js/sede.js"></script>` **después de `js/logic.js` y `js/temporadas.js`, antes de `js/ui.js`**
  (síncrono: así la extensión ya está registrada cuando ui.js carga la partida guardada y llama a `migrar`).
  Agregarlo también a `sw.js` (lista de archivos) y al build.
- Si `Game.registrarExtension` no existe al cargar, reintenta en `DOMContentLoaded`.
- Tarjeta de Inicio con `orden: 10` (temporadas usa 20). Botones `data-ext="sede" data-acc="abrir|cofre|mejorar|subir|reciclar"`.
- Textos: diccionario propio `TRAD[código][clave]` (es, en, pt-BR, fr, de, it, ru, tr, id, zh-CN, registro "tú"),
  según `I18N.idioma` con respaldo en español. Las claves también se agregan como `sedehq.*` a `Game.TEXTOS` (español)
  y a los diccionarios de juego **ya cargados** de `I18N_JUEGO` (al cargar y en `I18N.onChange`), para que
  `result.extras`, `bonoCalidad` y el registro se lean con `Game.tx(k, p)` en el idioma actual.
  No crea diccionarios de idiomas que todavía no llegaron (si no, i18n.js no los descargaría).
- `window.Sede` expone las reglas (`etapa`, `mejorar`, `subirNivel`, `reclamarCofre`, `reciclar`, `bonos`…) para pruebas.

## Versión con servidor (solo nota, no está hecho)

Si más adelante se quiere vender o regalar materiales desde el servidor:
- Que sea una **entrega** como las de `premium.js` (el servidor manda `{ id, tipo: 'materiales', bolsa }`, se aplica una sola vez
  por id y queda en `s.premium.aplicadas`), nunca un número que el cliente decide.
- Mejor vender **paquetes fijos y a la vista** (sin azar: nada de cajas con premio sorpresa) o un pase de temporada
  que dé materiales por días jugados; poner un tope semanal para no saltarse los requisitos de fama/historia,
  que siguen mandando.
- Opcional: "acelerar obra" con créditos (restar días a `fin`), validado en el servidor.
- Regalos sin pago: premios de eventos en línea, ligas o temporadas como entregas con el mismo mecanismo.
