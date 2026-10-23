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
