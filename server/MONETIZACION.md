# Ventajas pagadas, VIP 1–10, regalos de asociación, pase de temporada — contrato común

Reglas que no se rompen: **sin cajas sorpresa** (todo pack muestra su contenido), **los créditos nunca se cambian por
dinero**, todo lo pagado que da poder **también se consigue gratis** (más lento), y la ventaja pagada en competencia
tiene **techo**. Los precios en dinero real los fija el Centro de Control (`productos_ajustes`); aquí van valores por defecto.

## 1. Techo de ventaja pagada en competencia (decisión de Dimitry: 20–25 %)

- En Copa de Servidores y Duelos, el servidor suma a la calidad validada un **bono de ventajas** calculado SOLO en el
  servidor: `Ventajas::bono(int $jugador, string $modo): array` → `{total, partes:[{clave, pts}]}`.
- Partes y topes: `sede` (Sede oficial, hasta **+6**), `estrella` (Personal estrella, hasta **+6**), total **máx. +12**
  puntos de calidad (≈ 20–25 % sobre una calidad típica de 50–60). Constante `Ventajas::TOPE = 12`, editable en `ajustes`
  (`ventajas_tope`).
- Los equipos exclusivos/VIP ya cuentan dentro de la jugada (no suman al bono).
- **Copa**: puntos de preparación = calidad validada + bono (+ estrellas extra como hoy); en los cruces, cada equipo del
  plantel lleva `bono` y `batalla.js` lo suma a la calidad de su partido (campo opcional `bono` por equipo, 0..12).
- **Duelos**: el bono se suma a la calidad del retador y del fantasma; el emparejamiento sugiere rivales con **poder parecido**.
- Liga, Festival y Desafío: **sin bono** (son de esfuerzo).
- `Ventajas.php` es dueño de la clase y su tabla de ajustes; cada módulo de abajo expone su parte:
  `SedeOficial::bonoCompetencia($j): int` (0..6), `Estrellas::bonoCompetencia($j, $modo): int` (0..6).

## 2. Ganchos del servidor (eventos)

`server/src/Ganchos.php`: `Ganchos::en(string $evento, callable $fn)`, `Ganchos::emitir(string $evento, array $datos)`
(cada oyente en try/catch, nunca rompe la compra). Eventos:
- `compra_aprobada` `{compra_id, jugador_id, producto, monto_usd, canal:'plux'|'google'}` — lo emite `Compras` al aprobar.
- `compra_revertida` `{compra_id, jugador_id, motivo}` — al reembolso/contracargo.
- `creditos_gastados` `{jugador_id, cantidad, motivo, ref}` — lo emite `Monedero` al gastar.
Los módulos se registran en `server/src/arranque.php` (una línea cada uno: `\EnVivo\Vip::registrar();` etc.).

## 3. Módulos y archivos (cada ayudante solo toca los suyos)

| Módulo | Servidor | Juego | Pruebas |
|---|---|---|---|
| VIP 1–10 + regalos de asociación + Mecenas + ofertas escalonadas | `src/Vip.php`, `src/Regalos.php`, `src/VipApi.php`, `src/Ganchos.php`, `src/Ventajas.php`, `migraciones/vip.sql` | `js/vip.js` | `tests/pruebas_vip.php`, `tests/test_vip.js` |
| Sede oficial en el servidor + aceleradores | `src/SedeOficial.php`, `src/SedeApi.php`, `migraciones/sede_oficial.sql` | cambios en `js/sede.js` (modo "oficial" cuando hay sesión) | `tests/pruebas_sede_oficial.php`, `tests/test_sede_oficial.js` |
| Pase de temporada | `src/Pase.php`, `src/PaseApi.php`, `migraciones/pase.sql` | `js/pase.js` | `tests/pruebas_pase.php`, `tests/test_pase.js` |
| Personal estrella + intentos extra | `src/Estrellas.php`, `src/EstrellasApi.php`, `migraciones/estrellas.sql` | `js/estrellas.js` | `tests/pruebas_estrellas.php`, `tests/test_estrellas.js` |

Rutas: cada `XxxApi::esRuta($ruta)` / `XxxApi::responder($ruta, $metodo, $jugador)` como `LigaApi`. Juego: tarjetas en
`window.EnVivoInicio` y/o ficha en la pestaña Tienda/En línea (cada módulo deja las líneas en su `INTEGRAR_*.md`).
**Archivos compartidos** (`api.php`, `Compras.php`, `Monedero.php`, `Catalogo.php`, `Copas.php`, `Duelos.php`,
`batalla.js`, `Cuentas.php`, `arranque.php`, `correr.sh`, `index.html`, `sw.js`, `ui.js`, `js/lang/*`): **nadie los edita**;
cada módulo deja las líneas exactas en `server/INTEGRAR_<MODULO>.md` y el integrador las aplica al final.

## 4. Productos nuevos (para `Catalogo.php`, los agrega el integrador)

- `pase_premium` $4.99 (30 días de la temporada), `pase_premium_plus` $9.99 (premium + 10 niveles ya desbloqueados).
- `pack_obra_s` $1.99 / `pack_obra_m` $4.99 / `pack_obra_l` $9.99: aceleradores de obra + materiales, contenido fijo visible.
- `estrella_copa` (por créditos): contrato de personal estrella por N partidos de copa.
- `pase_copa` (por créditos o $2.99): +5 intentos de preparación por día durante la copa de esa semana.
Las ofertas escalonadas (VIP) son variantes de packs existentes con contenido fijo y un tope de compras.
