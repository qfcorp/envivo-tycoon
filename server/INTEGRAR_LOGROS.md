# Integrar los Logros y el Libro de combos

Módulo: `js/logros.js` (solo cliente, sin servidor). Pruebas: `NODE_PATH=/opt/npm-tools/node_modules node tests/test_logros.js`
(lógica + Playwright; `--sin-navegador` para solo la lógica; capturas en `tests/capturas/logros_*.png`).

## Qué hace

- **44 logros** en tres niveles (16 bronce, 16 plata, 12 oro): eventos cubiertos (10/50/200), eventos de 5 estrellas
  (1/10/50), dominio por tipo de evento (5 estrellas en misa+funeral, boda+graduación, prensa+IRL+barrial, boxeo+lucha,
  lanzamientos, concierto, LigaPrima+final y los 14 tipos), personal (3 y 10 personas, senior, internacional), equipos
  (10 propios, 8/14/todas las categorías, unidad móvil propia), nivel de sede (5/10/20), capítulos (3.º, 5.º, historia
  completa), temporadas (cubrir un evento, un trofeo, trofeos de 3 temporadas), dinero cobrado (10 mil / 100 mil / 1 millón),
  rachas sin imprevistos que resten calidad (3/10/25), internacionales (1/10), 10 duelos ganados, Liga Semanal (si
  `s.liga.registro` tiene algo) y combos del libro (5/15).
- **Premios fijos, nunca créditos**: bronce $250 + 2 cables de repuesto; plata $900 + 8 materiales de sede; oro $3.000 +
  12 materiales + 2 chips 4K + 2 baterías. Sin sede local (o con la sede oficial del servidor, `s.sede.oficial`) los
  materiales se pagan en dinero del juego ($20 c/u, chips $120). Tabla en `Logros.AJUSTE.premio`.
- **Libro de combos**: 16 filas (14 tipos + 2 internacionales) con el mejor resultado de cada tipo (estrellas, calidad,
  día, personas, cámaras cubiertas y la mejor cámara usada) y **23 combos** = tipo de evento + equipo clave (boxeo + PTZ,
  concierto + grúa, final + unidad móvil, boda + dron, LigaPrima + servidor de repeticiones…). Un combo se anota la primera
  vez que se cubre el evento con ese equipo y 4★ o más. Lo no descubierto sale como silueta con "?" y la pista (el
  equipo) aparece cuando ya cubriste ese tipo de evento. Fila completa (5★ + todos sus combos) = $600 + 5 materiales.
- **Avisos**: nunca durante el evento en vivo. Al terminar el evento se agrega una línea en el resultado
  (`result.extras`, la pinta `extrasRes` de ui.js) y el toast "¡Logro desbloqueado! …" sale cuando ya no hay ninguna
  ventana abierta (`#overlay.on`) ni evento en curso.
- **Partidas viejas**: la primera vez (o si una actualización agrega logros) lo ya logrado se entrega **en silencio** y
  sale un solo toast "Tienes N logros para reclamar". El libro toma `stats.best` como "Récord de antes".
- **Determinista**: extensión de la lógica (`migrar`, `alNuevoDia`, `alTerminarEvento`), estado en `s.logros`, sin
  `Math.random` ni `Date`. Los intentos en línea no aplican extensiones (los salta logic.js).

## 1. index.html (ya está en este cambio)

```html
<script defer src="js/logros.js"></script>
<script defer src="js/intento.js"></script>
```

Va con `defer` (test_browser.js permite 14 scripts síncronos como máximo). Como carga después de que ui.js abre la
partida, `s.logros` se crea al primer uso (tarjeta de Inicio, primer evento o primer día) con la misma migración
silenciosa. Con `newGame` y `deserialize` posteriores, `migrar` corre normalmente.

## 2. sw.js (ya está en este cambio)

`'./js/logros.js'` en la lista del shell. **Subir `VERSION`** al integrar (no lo subí para no chocar con los demás).

## 3. ui.js — una línea en `PL_INFO` (fila plegable de Inicio)

```js
    flota: ['unidad_movil', 'inicio.pl.flota'], logros: ['gem', 'inicio.pl.logros'],
```

La clave `inicio.pl.logros` la agrega el módulo a `window.I18N_LANG[código]` si falta ("Logros y combos" y sus 9
traducciones en `Logros.PL_TIT`). Si se prefiere tenerla en `js/lang/*.js`:
es "Logros y combos", en "Achievements & combos", pt-BR "Conquistas e combos", fr "Succès et combos",
de "Erfolge & Combos", it "Obiettivi e combo", ru "Достижения и комбо", tr "Başarımlar ve kombolar",
id "Pencapaian & kombo", zh-CN "成就与组合".

La fila se registra sola: `window.EnVivoInicio.push({ id: 'logros', orden: 20, tarjeta, clic })`. Su resumen sale del
`<h3>`: "23/44 · 5 combos".

## Notas

- Equipo de un evento para los combos: lo propio que fue (`s.currentEvent.equipIds`), las cámaras del plan
  (`result.cameraPlan.positions[].asignado/lente`, incluye grúa/riel/cámara aérea alquiladas) y los vehículos de la
  movilización (`result.transporte.vehiculos`). Los alquileres que no son cámara (unidad móvil o satélite alquilados) ya
  se devolvieron cuando corre `alTerminarEvento`, así que no cuentan; si se quiere, logic.js podría pasar el equipo del
  evento a los ganchos antes de devolver los alquileres.
- API: `window.Logros` (`reclamar`, `reclamarFila`, `reclamarTodo`, `porReclamar`, `resumen`, `tomarAvisos`, `insignia`…).
