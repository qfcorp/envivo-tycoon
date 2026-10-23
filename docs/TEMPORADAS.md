# Temporadas: eventos especiales por fecha

Pedido del dueño (23 oct 2026): "el juego nunca debe simplemente terminar". Las temporadas traen eventos especiales
en fechas reales (Halloween, Navidad, Pase del Niño, Fin de año, San Valentín, Semana Santa y Carnaval). Funcionan
durante la historia y también en el modo libre, después del día ~105.

Código: `js/temporadas.js`, con los textos en `js/datos.js` (TEXTOS `temp.*`, `ev.tmp_*`, `inc.tmp_*`), en `js/lang/juego/*.js`
y en `js/lang/*.js` (pantalla). Pruebas: `tests/test_temporadas.js`.

## Cómo funciona

- **La fecha la pone la pantalla, nunca la lógica.** `ui.js` llama a `Temporadas.setFecha(isoFecha, S)` al cargar,
  al empezar una partida y cada vez que pasa el día. Usa la fecha del celular, o `?fecha=AAAA-MM-DD` en la URL para
  demos. La fecha queda en la partida (`s.temporada.fecha`), y la lógica solo mira ese valor. Con la misma semilla y la misma fecha,
  la partida sale igual. Las fechas se calculan con aritmética: no hay `Date`, `Date.now` ni `Math.random`.
- **Con una temporada activa** llega una oferta especial cada `cada` días de juego, hasta `max` ofertas por temporada.
  Las ofertas especiales nunca son disputadas. Si las ofertas están llenas, la oferta especial reemplaza a la oferta
  normal que vence primero. Cuando la temporada termina, sus ofertas se retiran.
- **Eventos especiales:** son grandes y difíciles, pagan más (`pago`) y tienen requisitos especiales (`req`: cámaras, dron,
  grúa). Cada requisito suma +3 a la calidad si se cumple y resta −8 si falta, y sale en "Ver cómo se calcula". También tienen
  imprevistos propios (luces del árbol, frío, cuenta regresiva, humo de los fuegos, multitud, espuma, niebla, anillos)
  y un dibujo encima de la escena (nieve y árbol, fuegos, corazones, calabazas, estrellas, velas, confeti).
- **Meta de la temporada:** cubre `meta.n` eventos especiales. El premio se entrega **una sola vez** por temporada y año
  (`s.temporada.prog['navidad-2026'].premio`). Trae dinero, fama, un trofeo (`s.temporada.trofeos`) y un adorno
  para la sede (`s.temporada.cosmeticos`), que `Art.hq()` dibuja.
- **Inicio:** con una temporada activa se ve una tarjeta con la cuenta regresiva, el avance y los premios. Sin temporada,
  se ve un aviso ("Próximo evento especial: Navidad en N días"). El botón "Trofeos de temporada" (en modo libre o con
  trofeos) abre la lista de trofeos y el calendario.
- **Intentos en línea** (duelos, desafío, liga, festival): no aplican extensiones (`s.intento`), así el servidor
  repite el intento igual.

## Cómo agregar una temporada

Todo está en un solo arreglo, `TEMPORADAS`, en `js/temporadas.js`:

```js
{ key: 'dia_madre', icon: '💐', desde: '05-03', hasta: '05-10',      // o calcular: (año) => ({ desde: 'MM-DD', hasta: 'MM-DD' })
  overlay: 'corazones', pago: 1.4, cada: 2, max: 5,
  meta: { n: 2 }, premios: { dinero: 2000, fama: 3, cosmetico: 'corazones' },
  eventos: {
    tmp_serenata_madre: { icon: '💐', escena: 'concierto', posDe: 'concierto', cams: [3, 4], audio: true, stream: 1, outdoor: 0.3,
      diff: 4, pay: [1800, 3800], clients: ['...'], crew: 'director 1/1, camarografo 3/4, sonidista 1/1, tecnico_transmision 1/1',
      positions: [['foh', 'tribuna'], ['abierta', 'fija'], ['foso', 'hombro']], req: [{ t: 'cams', n: 3 }, { t: 'grua' }] },
  } },
```

1. Agrega los textos en `js/datos.js` TEXTOS: `temp.<key>.nombre`, `temp.<key>.premio` y `temp.<key>.trofeo`, y
   `ev.<tipo>` por cada evento. Tradúcelos en `js/lang/juego/<idioma>.js`. `tests/test_traduccion_juego.js` avisa si falta alguno.
2. `escena` es la escena base de `art.js`. `posDe` reutiliza los nombres de las posiciones de cámara de otro evento.
   `overlay` y `cosmetico` usan los dibujos que ya existen en `art.js` (`overlayTemporada` y `cosmeticosSede`). Para uno
   nuevo, agrega su caso ahí.
3. Para un imprevisto propio, usa `imprevisto('tmp_x', { when: deTemp('dia_madre'), rol: 'productor', q: [bien, mal, aguantar] })`
   y sus textos `inc.tmp_x.t/.o0/.o1/.r0/.r1/.r2`.
4. Agrega la fecha a `tests/test_temporadas.js`.

## Temporadas desde el servidor (más adelante)

Las temporadas son datos, así que el servidor podría mandarlas en JSON, por ejemplo en `/api/estado`. Cada una tendría
la forma de arriba, con `desde`/`hasta` en lugar de `calcular`, plantillas `crew` como texto y los textos ya traducidos
(`nombre`, `premio`, `trofeo` y `def.nombre` de cada evento por idioma). Al recibirla, la pantalla haría `Temporadas.TEMPORADAS.push(def)`
y llamaría a `Game.registrarTipoEvento(tipo, def)` por cada evento: un tipo nuevo nunca pisa un evento del juego base, y su
`def.nombre` se usa cuando no hay clave en TEXTOS. Los imprevistos y dibujos se elegirían de los que ya existen. Como la fecha
y el progreso viven en la partida, la temporada sigue siendo determinista. Los duelos y desafíos no se ven afectados,
porque los intentos en línea nunca aplican extensiones.
