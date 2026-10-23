# Integrar las Ayudas de la asociación, la Investigación y la Tienda de fichas (módulo `ayuda_asoc`)

Asociación al estilo Kingshot, todo **gratis** (free-to-play): nada se compra con dinero real ni con créditos.

| Archivo | Qué es |
|---|---|
| `server/src/AyudaAsoc.php` | Reglas y datos: pedidos de ayuda, "Ayudar a todos", fichas, investigación, tienda, bonos |
| `server/src/AyudaAsocApi.php` | Rutas `/api/asoc/...` |
| `server/src/migraciones/ayuda_asoc.sql` | Tablas `ayuda_asoc_*` (se aplica sola con `Db::migrarModulos`) |
| `js/ayuda_asoc.js` | Globo 🤝 con el número, panel Ayudas / Investigación / Tienda, extensión de `logic.js`, textos en 10 idiomas |
| `server/tests/pruebas_ayuda_asoc.php` | Pruebas del servidor (base temporal, reloj congelado, HTTP con `php -S`) |
| `tests/test_ayuda_asoc.js` | Prueba en un celular 390×844 (Playwright, fetch simulado) + capturas `tests/capturas/ayuda_asoc_*.png` |
| `docs/traducciones/errores_nuevos/ayuda_asoc.json` | Códigos de error nuevos en 10 idiomas → copiar a `docs/traducciones/errores.json` |

## Reglas (números en `AyudaAsoc.php`)

- **Una sola regla de ayuda**: la de `SedeOficial::ayudar` (−1 % de la duración de la obra o 5 minutos, lo mayor; 30 ayudas por
  día y persona; las 10 primeras dan 1 material). Este módulo la **unifica**, no la duplica:
  - **Pedir ayuda** (`ayuda_asoc_pedidos`): el dueño muestra una obra (o todas) a su asociación, una vez por obra.
  - **Ayudar a todos (N)**: un toque ayuda en todos los pedidos pendientes (cada uno por `SedeOficial::ayudar`), hasta el tope
    del día. La lista suelta de `GET /api/sede/ayudas` sigue igual (todas las obras activas de la asociación).
  - **Tope por obra de 10 a 20**: `10 + (nivel de la asociación − 1) + nivel de "Refuerzos"`. `SedeOficial::topeAyudas()` lo pide
    a `AyudaAsoc` (sin el módulo: 10).
  - **Fichas de asociación**: 1 por ayuda (también la suelta), máximo 20 por día. No se pierden al cambiar de asociación.
  - **Anti cuentas alternas**: solo cuenta quien lleva **más de 24 h** en la asociación (`asociacion_miembros.desde`): ayudar (las
    dos formas), donar y ganar fichas. Si no, 409 `miembro_nuevo` con `espera` (segundos). Salir y volver reinicia las 24 h.
- **Nivel de la asociación** (1 a 6) por puntos donados: 0 / 600 / 1.800 / 4.000 / 8.000 / 14.000.
- **Investigación** (lo que sobra pasa al nivel siguiente):

  | Tecnología | Efecto por nivel | Niveles | Puntos por nivel |
  |---|---|---|---|
  | `paga_eventos` "Contratos dorados" | +2 % de pago de eventos (socios) | 5 | 400, 900, 1.600, 2.600, 4.000 |
  | `reparacion` "Taller compartido" | −5 % costo de reparar (socios) | 3 | 500, 1.300, 2.600 |
  | `refuerzos` "Refuerzos" | +1 ayuda por obra | 5 | 300, 800, 1.500, 2.500, 4.000 |

- **Donaciones** (paquetes fijos): $2.000 del juego → 10 puntos y 2 fichas (máx. 5 por día; el juego descuenta el dinero y manda
  `pagado_en_juego: true`, como al crear una asociación; el servidor no ve el dinero de la partida, por eso el tope); 10 de un
  material común de la sede oficial → 10 puntos y 2 fichas; 1 chip 4K → 15 puntos y 3 fichas (el servidor los descuenta, libro
  `sede_libro` motivo `donacion_asoc`). Máximo 15 donaciones y 30 fichas por donar al día.
- **Tienda** (fichas, contenido fijo): caja de materiales (3 de cada común) 30 fichas, 3/día · chip 4K 45, 1/día · acelerador
  15 min 15, 4/día · acelerador 1 h 50, 2/día · insignia cosmética "Solidaria" 250, una sola vez. Materiales y aceleradores
  entran a la sede oficial (`sede_libro` motivo `tienda_asoc`).
- **Auditoría**: libro `ayuda_asoc_libro` (cada ficha), `ayuda_asoc_donaciones`, `ayuda_asoc_compras` y una línea en `auditoria`
  (`quien = jugador:<id>`) por donación (y subida de nivel), compra y "Ayudar a todos".
- Reloj y día: los de `SedeOficial` (`ahora()`, `dia()` de America/Guayaquil).

## API (todas con sesión; POST con `X-Envivo: 1`, 90 acciones cada 10 min)

- `GET /api/asoc/ayuda` → `{ fichas, hoy{ayudas, ayudas_max, fichas_ayuda, fichas_ayuda_max, donaciones, donaciones_max, donaciones_dinero, donaciones_dinero_max, fichas_donar, fichas_donar_max}, tienda[{id, fichas, da, una_vez, tope, usadas, agotado}], insignias[], reglas, bonos{paga_eventos_pct, reparacion_pct, ayudas_extra}, materiales{…}, mis_obras[{obra_id, tipo, ed, nivel, restante, ayudas, ayudas_max, pedida}], pendientes[{obra_id, jugador_id, nombre, tipo, ed, nivel, restante, ayudas, ayudas_max, segundos_ayuda}], asociacion: null | {id, nombre, siglas, color, cargo, nivel, nivel_max, puntos, siguiente, tope_ayudas, espera, investigacion[{id, nivel, max, efecto, total, progreso, costo, costos}]} }`
- `GET /api/asoc/ayuda/resumen` → `{ asociacion, pendientes, fichas, espera, bonos }` (liviano, para el globo).
- `POST /api/asoc/ayuda/pedir` `{ obra_id? }` (sin `obra_id` = todas) → `{ pedidas, …vista }`.
- `POST /api/asoc/ayuda/todos` `{}` → `{ ayudadas, segundos, premio{material: n}, fichas_ganadas, tope_dia, …vista }`.
- `POST /api/asoc/investigacion/donar` `{ tech, tipo: 'dinero'|'material', material?, pagado_en_juego? }` → `{ donacion{tech, tipo, material, cantidad, puntos, fichas, subio, nivel_tech, nivel_asoc, subio_asoc}, …vista }`.
- `POST /api/asoc/tienda/comprar` `{ item }` → `{ compra{item, fichas, da}, …vista }`.
- `POST /api/sede/ayudar` ahora también devuelve `fichas` (0 o 1).

Errores nuevos (`docs/traducciones/errores_nuevos/ayuda_asoc.json`): `miembro_nuevo`, `sin_pedidos`, `ya_pedida`, `sin_obras`,
`tech_invalida`, `tech_max`, `tope_donaciones`, `tope_donaciones_dinero`, `material_invalido`, `item_invalido`, `tope_tienda`.
**Copiarlos a `docs/traducciones/errores.json`** (`_codigos` y los 10 idiomas): sin eso `node tests/test_traducciones.js` marca
11 fallas ("falta el código del servidor …"). Usa también los que ya existen: `sin_asociacion`, `faltan_materiales`,
`tope_ayudas_dia`, `sin_fichas`, `sin_pago`, `ya_comprado`, `obra_no_existe`, `ya_terminada`, `ayudas_completas`, `datos_invalidos`.

## Cambios en archivos compartidos (YA HECHOS en esta rama; si hay conflicto, estas son las líneas)

1. `server/public/api.php` — justo **antes** de `    // Liga Semanal de Productoras (server/INTEGRAR_LIGA.md): responde y termina`:

```php
    // Ayudas de la asociación, Investigación y Tienda de fichas (server/INTEGRAR_AYUDA_ASOC.md): /api/asoc/*
    if (class_exists(\EnVivo\AyudaAsocApi::class) && \EnVivo\AyudaAsocApi::esRuta($ruta)) \EnVivo\AyudaAsocApi::responder($ruta, $metodo, requiere_sesion());
```

2. `server/src/SedeOficial.php` (extender, no duplicar):
   - nuevo `public static function topeAyudas(int $duenio): int` (pide `AyudaAsoc::topeAyudas`, si no 10) y se usa en lugar de
     `self::AYUDAS_MAX` en `vista()` (`reglas.ayudas_max` y cada obra), `obraJson()` (nuevo 3.er parámetro `$tope`), `ayudas()` y `ayudar()`;
   - nuevo `public static function moverMateriales(int $j, array $bolsa, string $motivo, ?string $ref)` (como `sumar()`, con la fila creada);
   - `ayudar(int $ayudante, int $duenio, int $obraId, bool $conLista = true)`: tras el chequeo `otra_asociacion` llama
     `AyudaAsoc::exigirAntiguo($ayudante)`; tras guardar la ayuda, `$fichas = AyudaAsoc::alAyudar($ayudante, $obraId)`; devuelve `fichas`.
     Todo con `class_exists(AyudaAsoc::class)`: sin el módulo se porta igual que antes.
3. `server/tests/pruebas_sede_oficial.php` — por la regla de 24 h, dos líneas que ponen a los socios de la prueba como antiguos:
   después del `for (...) { $soc[$k] = ...; Social::unirse(...); }` → `Db::q('UPDATE asociacion_miembros SET desde = ?', [$T0]);`
   y después de `Social::unirse($H2, ...)` → `Db::q('UPDATE asociacion_miembros SET desde = desde - 2 * 86400 WHERE jugador_id IN (?, ?)', [$H, $H2]);`
4. `server/tests/correr.sh` — en el bloque "3d": `for par in vip:Vip sede_oficial:SedeOficial pase:Pase estrellas:Estrellas ayuda_asoc:AyudaAsoc; do`
5. `index.html` — antes de `<script defer src="js/chat.js"></script>`: `<script defer src="js/ayuda_asoc.js"></script>`
6. `sw.js` — en `SHELL`, después de `'./js/chat.js',`: `'./js/ayuda_asoc.js',` (**subir `VERSION`** al integrar; no se subió aquí para no chocar con otros módulos).
7. `js/chat.js` — pestaña "Asociación":
   - en `construir()`, entre `.chat-top` y `#chat-lista`: `<div id="chat-asoc-barra" hidden></div>`;
   - en `abrir()`, después de `p.querySelector('.chat-rapidos').hidden = !conChat;`:
     ```js
     const barra = p.querySelector('#chat-asoc-barra');
     if (barra) { barra.hidden = !(root.AyudaAsoc && st.canal === 'asociacion' && (st.ctx.Api.estado || {}).asociacion); if (!barra.hidden) root.AyudaAsoc.barra(barra); }
     ```
   - primera línea de `Chat.iniciar(ctx)`: `if (root.AyudaAsoc) root.AyudaAsoc.iniciar(ctx); else root.AyudaAsocCtx = ctx;`
   - al final de `Chat.refrescar()`: `if (root.AyudaAsoc) root.AyudaAsoc.refrescar();`
8. `js/sede.js` — en cada obra oficial (botones `.sd-of-btns`), después del botón `acel_min`: `${root.AyudaAsoc ? root.AyudaAsoc.botonPedir(o) : ''}`
   (el clic lo atiende `js/ayuda_asoc.js` con su propio oyente: `data-aa="pedir"`).
9. `js/ui.js` — `ctxChat()` suma `dinero: () => S.money, gastarDinero: (m) => { S.money = Math.max(0, S.money - m); save(); render(); }`
   (sin esto el panel no ofrece donar dinero del juego, solo materiales).

## Pendiente opcional (no hecho: toca `js/logic.js`)

El bono de pago (+2 % por nivel) ya entra solo como extensión (`Game.registrarExtension({ id: 'ayuda_asoc', multPago })`).
Para el **−5 % de reparación** `logic.js` no tiene gancho (y `repairCost(e)` no recibe el estado). Línea propuesta en
`repairCost`, al final del cálculo: `* (root.AyudaAsoc && root.AyudaAsoc.multReparar ? root.AyudaAsoc.multReparar() : 1)`
(solo en la partida local; los intentos en línea no usan extensiones). La insignia (`AyudaAsoc::insignias($j)`) se puede mostrar
en el chat junto al nombre (Chat.php → `insignias`); hoy solo se ve en el panel.

## Pruebas

- `php server/tests/pruebas_ayuda_asoc.php` (también la corre `bash server/tests/correr.sh`, bloque 3d)
- `php server/tests/pruebas_sede_oficial.php` (sigue en 0 fallas)
- `node tests/test_ayuda_asoc.js` (capturas en `tests/capturas/ayuda_asoc_*.png`) y `node tests/test_sede_oficial.js`
