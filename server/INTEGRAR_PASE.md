# Integrar el Pase de Temporada

Módulo: `server/src/Pase.php`, `server/src/PaseApi.php`, `server/src/migraciones/pase.sql`, `js/pase.js`.
Pruebas: `php server/tests/pruebas_pase.php` y `NODE_PATH=/opt/npm-tools/node_modules node tests/test_pase.js`
(capturas en `tests/capturas/pase_*.png`). Contrato común: `server/MONETIZACION.md`.

Las tablas (`pase_jugador`, `pase_xp`, `pase_reclamos`, `pase_compras`) las crea sola `Db::migrarModulos` con
`migraciones/pase.sql` (y `Pase::preparar()` por si acaso). Nada de lo de abajo cambia el comportamiento actual hasta que
se aplica; todas las llamadas a `Pase::sumarXp` son seguras dentro de la transacción del intento (usa un SAVEPOINT,
nunca lanza error y es idempotente por `ref`).

## Cómo funciona (resumen)

- **Temporadas** de 28 días que empiezan un lunes 00:00 (America/Guayaquil), contadas desde `Pase::EPOCA` = `2026-10-19`
  (ajuste `pase_epoca`, AAAA-MM-DD, tiene que ser lunes). Nombre "Temporada N · Tema". El tema sale del calendario de
  `js/temporadas.js` (Halloween, Navidad, Pase del Niño, Fin de año, San Valentín, Semana Santa, Carnaval) si al menos 3
  días de su ventana caen dentro, por prioridad y sin repetir el de la anterior; si no, un tema general. Con la época de
  hoy: T1 Noche de Calaveras (19 oct), T2 Luces de Navidad (16 nov), T3 Año Nuevo en vivo (14 dic), T4 Carnaval en vivo,
  T5 Amor en vivo, T6 Semana Santa en vivo…
- **40 niveles** de 400 XP. XP solo por juego en línea validado: liga 40, festival 30, copa 40, duelo 40, desafío 60,
  obra de la asociación 25, registrar el equipo de copa 50 (`Pase::XP`). Tope de 700 XP de juego por día (ajuste
  `pase_xp_tope_dia`; lo que pasa del tope se anota con 0 XP y cuenta igual para las misiones).
- **Misiones** (fijas, rotan por fecha, sin azar, se pagan solas al cumplirse): diarias = "Juega 3 eventos en línea"
  (+150) + 2 que rotan (desafío, duelo, liga, obras, festival, copa; +100/+120); semanales = "Juega 15 eventos en línea"
  (+600), "Registra tu equipo de copa" (+300) + 1 que rota (+400).
- **Pistas**: gratis con premio en 21 niveles (dinero del juego, repuestos, materiales de sede e insignia final);
  premium con premio en los 40 (más materiales, aceleradores de obra, marco de productora, adorno de sede, título de chat,
  420 créditos en total = 60 % de 700 y un contrato de personal estrella en el nivel 35 si existe `Estrellas`). Tabla
  fija y visible: `Pase::RECOMPENSAS`. Quien compra tarde reclama los premios premium de todos los niveles que ya tiene.
- **Saltos**: 150 créditos por nivel (ajuste `pase_salto_creditos`), máximo 10 por temporada. El plus no cuenta.
- **Fin de temporada**: lo no reclamado se puede reclamar 3 días más (sale en `anterior` y entra en `reclamar_todo`); después se pierde.
- **Reversión**: quita el premium (si ninguna otra compra de la temporada lo sostiene) y los 10 niveles del plus. Lo no
  reclamado ya no se puede reclamar; lo ya reclamado que dependía de la compra queda con `revisar = 1`, sus créditos se
  descuentan (como `Compras::revertir`, el saldo puede quedar negativo) y queda un aviso `pase_revertido`.

## 1. Productos (Catalogo.php, `PRODUCTOS`)

```php
        'pase_premium'      => ['tipo' => 'pase', 'nombre' => 'Pase de Temporada Premium', 'detalle' => 'Esta temporada: premio premium en los 40 niveles (materiales, aceleradores de obra, marco de productora, adorno de sede, título de chat, hasta 420 créditos y un contrato de personal estrella). Si ya avanzaste, reclamas los premios de los niveles que ya tienes. No se renueva solo', 'precio' => 4.99, 'creditos' => 0, 'una_vez' => false],
        'pase_premium_plus' => ['tipo' => 'pase', 'nombre' => 'Pase de Temporada Premium Plus', 'detalle' => 'Todo el Pase Premium de esta temporada y 10 niveles ya desbloqueados. No se renueva solo', 'precio' => 9.99, 'creditos' => 0, 'una_vez' => false],
```

`Compras::entregarCompra` no tiene que hacer nada para el tipo `pase` (lista vacía, 0 créditos): lo entrega el gancho.
Si la tienda (`Catalogo::tienda`) no debe mostrarlos en la lista general, saltar `tipo === 'pase'` ahí (el pase tiene su
propia pantalla); Google Play los vende con los mismos ids.

## 2. Una compra por temporada (Compras.php, `exigirComprable`, al final)

```php
        if (($p['tipo'] ?? '') === 'pase') Pase::exigirComprable($jugador, $p['id']);   // 409 pase_ya_premium / sin_temporada
```

## 3. Ganchos (arranque.php, con las demás líneas de registro)

```php
\EnVivo\Pase::registrar();   // compra_aprobada -> premium (y +10 niveles el plus); compra_revertida -> lo quita
```

`Pase::registrar()` no hace nada si todavía no existe `Ganchos.php` y registra con clave `pase` (llamarlo dos veces no duplica). Los oyentes son `Pase::alAprobarCompra(array)` y
`Pase::alRevertirCompra(array)` (idempotentes por `compra_id`; seguros dentro de la transacción de `Compras`).

## 4. Rutas (server/public/api.php)

Justo antes de la línea `// Copa de Servidores (server/INTEGRAR_COPAS.md): /api/copa*`:

<!-- api.php -->
```php
if (\EnVivo\PaseApi::esRuta($ruta)) \EnVivo\PaseApi::responder($ruta, $metodo, requiere_sesion());   // Pase de Temporada (server/INTEGRAR_PASE.md)
```

## 5. XP donde se valida cada intento (una línea en cada uno, dentro de su transacción)

| Archivo | Dónde | Línea |
|---|---|---|
| `src/Liga.php` | `aplicar()`, después de `Universos::marcarActivo((int) $it['jugador_id'], true);` | `Pase::sumarXp((int) $it['jugador_id'], Pase::XP['liga'], 'liga', 'intento:' . $id);` |
| `src/Festival.php` | en la aplicación del resultado, después de `Universos::marcarActivo((int) $i['jugador_id'], true);` | `Pase::sumarXp((int) $i['jugador_id'], Pase::XP['festival'], 'festival', 'intento:' . $id);` |
| `src/Copas.php` | `enviarIntento` → dentro de `if ($puntos > 0) {`, después del `try { ... marcarActivo ... }` | `Pase::sumarXp((int) $i['jugador_id'], Pase::XP['copa'], 'copa', 'intento:' . $id);` |
| `src/Copas.php` | `registrarEquipo()`, después del `INSERT INTO copa_equipos ...` | `Pase::sumarXp($j, Pase::XP['copa_equipo'], 'copa_equipo', 'copa:' . $c['id']);` |
| `src/Duelos.php` | al cerrar el duelo, después de `if ($calidad !== null) Universos::marcarActivo($rj, true);` | `if ($calidad !== null) Pase::sumarXp($rj, Pase::XP['duelo'], 'duelo', 'duelo:' . $id);` |
| `src/Desafio.php` | `finalizar()`, después de `if ($cal !== null) Universos::marcarActivo(...)` | `if ($cal !== null) Pase::sumarXp((int) $f['jugador_id'], Pase::XP['desafio'], 'desafio', 'intento:' . $id);` |
| `src/SedeOficial.php` | `ayudar()`, después del `INSERT INTO sede_ayudas ...` (una ayuda por obra y persona) | `Pase::sumarXp($ayudante, Pase::XP['obra_ayuda'], 'obra_ayuda', 'obra:' . $obraId);` |

(Copas.php y Liga.php ya están en `namespace EnVivo`: `Pase::` sin barra. La `ref` se guarda como `fuente:ref`, así
`intento:5` de la liga y del festival son distintas.)

## 6. Personal estrella

El nivel 35 premium es una entrega `{tipo: 'estrella', item: 'comodin', cantidad: 5}` (5 partidos con la estrella de la
semana), justo lo que consume `Estrellas::reclamarEntregas`. Al reclamarlo, `Pase` además llama a
`Estrellas::otorgar($j, null, 5, 'pase', 'entrega:<id>')` para que el contrato salga ya (misma ref: no se duplica).
Sin la clase `Estrellas`, ese premio se cambia por 8 chips de video 4K (`Pase::ESTRELLA_SUSTITUTO`). Nada que integrar.

## 7. Juego (index.html, sw.js y js/ui.js)

`index.html`, junto a los demás módulos (después de `js/api.js` y antes de `js/ui.js`):

```html
<script src="js/pase.js"></script>
```

`sw.js`: agregar `'js/pase.js'` a la lista de archivos que se guardan (y subir la versión de la caché).

`js/ui.js`, en `ctxInicio()` agregar al objeto (el pase usa `onComprar` para el botón de comprar y `alReclamar` para
aplicar las entregas nuevas):

```js
      onComprar: (id) => comprar(id),   // el mismo flujo del botón de la Tienda (Google Play en la app, Plux en la web)
      alReclamar: async () => { try { await Api.refrescar(); aplicarEntregas(); save(); render(); } catch (e) { /* se aplica la próxima vez */ } },
```

Al volver de pagar (en ui.js, donde se maneja `volvioDePago`, y después de una compra de Google Play entregada), para que el
premium se vea al momento (si no, la tarjeta se refresca sola al minuto):

```js
      try { if (window.Pase) window.Pase.recargar(ctxInicio()); } catch (e) { /* sin pase */ }
```

La tarjeta de Inicio se registra sola (`window.EnVivoInicio`, orden 7, id `pase`) y abre la pantalla completa.
Opcional, en `renderTienda()` (pestaña Tienda), una ficha que abre el pase:

```js
      ${window.Pase ? window.Pase.fichaTienda(ctxInicio()) : ''}
```

y en el `click` global, antes de `const el = e.target.closest('[data-act]');` no hace falta nada: la ficha usa
`data-ext="pase" data-acc="abrir"`, que ya despacha el registro de Inicio.

## 8. Tipos de entrega nuevos (el juego ignora los que no conoce)

| tipo | item | cantidad | qué es |
|---|---|---|---|
| `materiales` | `cables` `placas` `paneles` `credenciales` `planos` `chips` | n | materiales de la sede (`SedeOficial::MATS`, js/sede.js) |
| `acelerador` | `obra` | minutos | aceleradores de obra (los suma `SedeOficial::absorberEntregas`) |
| `cosmetico` | `pase_marco_t<N>` `pase_deco_t<N>` `pase_titulo_t<N>` `pase_insignia_t<N>` | 1 | marco de productora, adorno de sede, título de chat, insignia |
| `estrella` | `comodin` | partidos | contrato de personal estrella (`Estrellas::reclamarEntregas`) |

Los créditos del pase no son entregas: van al monedero (`movimientos_creditos.motivo = 'pase'`, ref
`pase:<temporada>:<nivel>:premium`). `Pase::cosmeticos($jugador)` da las claves de cosméticos (para chat o sede).

## API

Todas con sesión; POST con `X-Envivo: 1`. Errores `{ok:false, error, codigo}`.

- `GET /api/pase` → `{ok, ahora, temporada:{numero, tema, icono, nombre, nombre_tema, inicio, fin, quedan_seg}, nivel,
  niveles: 40, xp, xp_nivel, xp_por_nivel: 400, premium, plus, pistas:{gratis:[{nivel, recompensa:{tipo, item, cantidad,
  nombre, clase?}, estado}], premium:[...]}, por_reclamar:{gratis, premium, total, premium_esperando}, creditos_dados,
  creditos_tope, saltos:{usados, max, precio, max_ahora}, xp_hoy, xp_tope_dia, xp_fuentes, misiones:{diarias:[{id, texto,
  n, avance, xp, hecha}], diarias_fin, semanales:[...], semanales_fin}, productos:{pase_premium:{id, precio, activo, plus,
  niveles}, pase_premium_plus:{...}}, gracia_dias: 3, anterior: null | {temporada, nivel, pistas, por_reclamar, gracia_hasta, ...}}`.
  `estado` de cada premio: `reclamado`, `disponible`, `bloqueado` (nivel no alcanzado), `requiere_premium`. Antes de la
  Temporada 1: `temporada: null` y `proxima`.
- `POST /api/pase/reclamar {nivel, pista: 'gratis'|'premium', temporada?}` → `{ok, reclamado, entregas, creditos, pase}`.
  Códigos: `ya_reclamado` 409, `nivel_bloqueado` 409, `premium_requerido` 403, `sin_recompensa` 404, `pista_invalida` 400,
  `nivel_invalido` 400, `falta_nivel` 400, `temporada_invalida` 400, `gracia_terminada` 410, `sin_temporada` 409,
  `cuenta_suspendida` / `cuenta_baneada` 403.
- `POST /api/pase/reclamar_todo` → `{ok, reclamados:[{temporada, nivel, pista, recompensa, creditos}], entregas, creditos, pase}`
  (la temporada actual y la anterior si sigue en gracia).
- `POST /api/pase/saltar {niveles}` → `{ok, creditos, pase}`. Códigos: `niveles_invalidos` 400, `saltos_tope` 409
  (con `quedan`), `nivel_max` 409, `sin_creditos` 402 (con `necesitas`).
- Compra: `POST /api/orden {producto: 'pase_premium' | 'pase_premium_plus'}` como cualquier producto; con el premium ya
  activo → 409 `pase_ya_premium`.

## Ajustes (tabla `ajustes`, Centro de Control)

`pase_epoca` (lunes AAAA-MM-DD de la Temporada 1), `pase_salto_creditos` (150), `pase_creditos_tope` (420),
`pase_xp_tope_dia` (700). Vacío = valor por defecto.

## Pruebas en correr.sh

En `server/tests/correr.sh`, sección 3c, agregar `pase` a la lista de suites:
`for suite in discord festival liga control control_servidores duelos_desafio universos copas fusiones demo_datos pase; do`
y la tabla `pase_xp` (y las otras tres) a la lista `for t in ...` de "Tablas del servidor creadas" si se quiere revisar.

## Mejoras (rama `pase-mejoras`, 13-nov-2026) — ya integradas

Archivos: `server/src/Pase.php`, `PaseApi.php`, `migraciones/pase_mejoras.sql` (tablas `pase_mini`, `pase_mini_usos`,
`pase_banco`), `js/pase.js`, textos nuevos en `js/lang/es.js` (bloque `// pase_mejoras`, claves `pasem.*`, solo español).
Pruebas: `php server/tests/pruebas_pase_mejoras.php` (en `correr.sh` §3d) y `node tests/test_pase_mejoras.js`.
Ganchos de una línea ya puestos: `AyudaAsoc::donar` (XP `asoc_donar`), `js/ui.js` (`PLAY_EXTRA` con `pase_semanal` y
`Pase.aplicarCosmeticos` en `aplicarEntregas`), `js/art.js` (`cosmeticosSede` dibuja el ícono de sede).
Todo lo que da premios lo decide y valida el servidor, igual que antes.

- **Candado en la fila gratis** (solo pantalla): sin premium, cada nivel sin premio gratis muestra el premio premium con 🔒
  (celda `.tz`), y cada premio gratis lleva un sello 🔒 con el ícono del premium de ese nivel. Tocar explica cómo conseguirlo.
- **Mini Pase Semanal** — producto nuevo `pase_semanal`, **$1,49**, tipo `pase` (Catalogo.php; no sale en la lista general).
  - Vale la **semana del pase** en que se compra (lunes 00:00 a lunes 00:00, America/Guayaquil; 4 semanas por temporada).
  - Desbloquea el premio **premium** de hasta **8 niveles** que subas **desde que lo compras** hasta que termina esa semana
    (`nivel_desde` = tu nivel al comprar). Lo cubierto se puede reclamar toda la temporada (+3 días de gracia).
  - **No da**: créditos, cosméticos (marco, adorno, título, ícono de sede), el contrato de personal estrella, ni niveles que
    ya tenías (`Pase::MINI_EXCLUYE`, `Pase::miniPermite`). Esos siguen con candado "solo Pase Premium".
  - Uno por semana (`409 mini_ya_activo`); con el premium activo no se vende (`409 pase_ya_premium`); sin temporada
    `409 sin_temporada`. El premium se puede comprar después (trae todo). Pago duplicado → `pase_mini.estado = duplicada` y aviso.
  - No canibaliza: 4 Mini ($5,96) cuestan más que el premium ($4,99) y dan como mucho 32 niveles sin los 420 créditos, sin
    cosméticos, sin estrella y sin lo retroactivo.
  - Reversión: deja de cubrir; lo reclamado con él queda `revisar = 1` + aviso `pase_revertido` (no hay créditos que
    descontar). Revertir el premium NO marca lo que sostiene un Mini vigente.
- **Misiones de jugar con otros**: nuevas diarias `d_asoc` (dona 1 vez a la investigación de tu asociación, +100) y
  `d_juntos` (3 veces con otros: duelos, liga u obras/donaciones de la asociación, +120); semanales `s_asoc` (4 donaciones,
  +400) y `s_juntos` (12 veces con otros, +450). Rotan con las demás (siguen 3 diarias y 3 semanales). Fuente nueva de XP
  `asoc_donar` = 20 (gancho en `AyudaAsoc::donar`, ref `donacion:<id>`).
- **Alternativa sin conexión** para TODAS las misiones del pase (`Pase::ALT`): reclamar misiones del juego (las de la partida,
  `Misiones::reclamar` → fuente `misiones`) cumple la misión con la **mitad** de XP: 2 en el día para las diarias, 6 en la
  semana para las semanales. Si después la cumples en línea, recibes lo que faltaba (ref `…:alt` y la normal; nunca más que
  la XP completa). En `GET /api/pase` cada misión trae `alt {n, avance, xp, hecha}`, `via` (`en_linea`|`sin_conexion`|null)
  y `juntos`.
- **Ponerse al día** (`Pase::alDia`): si tu **primera XP de juego** de la temporada es del **día 8 en adelante**, durante
  **3 días (72 h) desde esa primera partida** la XP de juego vale **el doble** y el tope diario también (1.400). No cuentan
  como "empezar" los saltos, el plus ni ajustes. `al_dia {estado: activo|disponible|terminado|no, activo, factor, desde_dia,
  dias, hasta}`.
- **Banco de premios** (`Pase::BANCO*`): después del nivel 40, cada **2.000 XP** un cofre **fijo**, hasta **10** por
  temporada: $1.000 del juego, 6 cables, 6 placas y 2 baterías; con premium además 6 paneles LED y 1 chip 4K. El contenido se
  ve antes de abrir (`banco.contenido`, `banco.contenido_premium`). `POST /api/pase/banco {temporada?}` →
  `{ok, cofres:[{temporada, n, premium, contenido}], entregas, creditos, pase}`; sin cofre `409 banco_vacio`. "Reclamar todo"
  también los abre (`cofres` en la respuesta) y cuentan en `por_reclamar.banco`/`total`. Revertir el plus marca `revisar` los
  cofres abiertos con XP que ya no tiene.
- **Tema visual por temporada**: `temporada.visual {colores:[c1, c2], adornos}` (cabecera y barras de la pantalla). Tema nuevo
  `copa_femenina` («Copa Global Femenina», 24 jun – 25 jul 2027; nombre inventado). **Nivel 40 premium** = ícono exclusivo de
  sede (`cosmetico`, clase `sede`, item `pase_sede_t<N>_<tema>`); el **título de chat** pasa al nivel 30 y los 60 créditos
  del 30 al 32 (antes acelerador de 5 h). Los créditos de la pista premium siguen sumando 420.
- `productos.pase_semanal {id, precio, activo, mini: true, max_niveles}` y `mini {producto, max_niveles, excluye, semana,
  semana_fin, quedan_seg, activo, nivel_desde, nivel_hasta, puede_comprar, niveles}` en `GET /api/pase`. Celdas premium que
  se pueden reclamar con el Mini llevan `mini: true`; las que solo da el premium, `solo_premium: true`.
