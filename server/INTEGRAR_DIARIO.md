# Integrar el Premio diario (calendario de 7 días)

Módulo: `server/src/Diario.php`, `server/src/DiarioApi.php`, `server/src/migraciones/diario.sql`, `js/diario.js`.
Pruebas: `php server/tests/pruebas_diario.php` y `NODE_PATH=/opt/npm-tools/node_modules node tests/test_diario.js`
(capturas en `tests/capturas/diario_*.png`).

Las tablas (`diario_jugador`, `diario_reclamos`) las crea sola `Db::migrarModulos` con `migraciones/diario.sql`
(y `Diario::preparar()` por si acaso). No hay códigos de error nuevos: usa `ya_reclamado` (409), `cuenta_suspendida` /
`cuenta_baneada` (403), `sesion_requerida` (401) y `limite_intentos` (429), que ya están en `docs/traducciones/errores.json`.

## Cómo funciona

- **7 días fijos y a la vista** (`Diario::PREMIOS` = `PREMIOS` de js/diario.js; las pruebas revisan que sean iguales):

  | Día | Dinero | Repuestos | Materiales de sede | Créditos (solo cuenta) |
  |---|---|---|---|---|
  | 1 | $300 | — | — | — |
  | 2 (grande) | $600 | 2 cables | 4 cables y conectores | 5 |
  | 3 | $350 | 1 batería | — | — |
  | 4 | $400 | — | 3 cables, 2 placas | — |
  | 5 | $450 | 2 baterías | — | — |
  | 6 | $500 | — | 2 paneles, 1 chip | — |
  | 7 (grande) | $1.000 | 2 cables, 2 baterías | 5 cables, 4 placas, 3 paneles, 2 chips | 20 |

  Total de la semana: $3.600 de juego y 25 créditos (cuentas). Los créditos nunca se pueden cambiar por dinero.
- **Un reclamo por día.** Con cuenta: día de Ecuador (America/Guayaquil) del reloj del SERVIDOR; la fecha del celular no
  cuenta (`UNIQUE (jugador_id, dia)` frena dos peticiones a la vez). Invitado: día del calendario del celular, en este
  celular (`localStorage envivo_diario_v1`), sin créditos.
- **Faltar no castiga**: el avance se pausa (sigue "Día 3 de 7"). Tras el día 7 empieza un ciclo nuevo en el día 1.
- **VIP 3 o más** (`Vip::nivel`): el dinero del día sale doble. Sin la clase `Vip`, nada.
- **Entregas**: dinero (`dinero`), repuestos (`consumible`) y materiales (`materiales`, los absorbe `SedeOficial`; sin esa
  clase no se entregan) con origen `diario:<día>`. Créditos: `Monedero::mover(..., 'diario', 'diario:<día>')`.
- Invitado: dinero y repuestos a la partida, materiales a la sede local (si está js/sede.js), una línea en el registro.

## 1. Rutas (server/public/api.php) — YA APLICADO en esta rama

Justo antes de la línea `// Copa de Servidores (server/INTEGRAR_COPAS.md): /api/copa*`:

<!-- api.php -->
```php
if (class_exists(\EnVivo\DiarioApi::class) && \EnVivo\DiarioApi::esRuta($ruta)) \EnVivo\DiarioApi::responder($ruta, $metodo, requiere_sesion());
```

## 2. Juego — index.html y sw.js — YA APLICADO en esta rama

`index.html`, después de `<script defer src="js/pase.js"></script>`:

```html
<script defer src="js/diario.js"></script>
```

`sw.js`, después de `'./js/pase.js',       // Pase de Temporada`: `'./js/diario.js',     // Premio diario (7 días)`.
**No** se subió `VERSION` (lo sube el coordinador una vez por tanda).

## 3. js/ui.js — PENDIENTE (lo hace el coordinador)

La fila de Inicio se registra sola (`window.EnVivoInicio`, id `diario`, orden 2). Falta su ícono y título en `PL_INFO`:

```js
    diario: ['gift', 'inicio.pl.diario'],
```

y la clave en los 10 `js/lang/*.js` (o, si se prefiere no tocar los idiomas, que `fila()` use `m.titulo(ctx)` cuando el
módulo lo trae: `window.Diario.titulo()` ya devuelve el título traducido):

| idioma | `inicio.pl.diario` |
|---|---|
| es | Premio diario |
| en | Daily reward |
| pt-BR | Prêmio diário |
| fr | Cadeau du jour |
| de | Tagesbelohnung |
| it | Premio del giorno |
| ru | Ежедневная награда |
| tr | Günlük ödül |
| id | Hadiah harian |
| zh-CN | 每日奖励 |

El módulo usa del ctx de Inicio: `S`, `G`, `A`, `M`, `Api`, `pedir`, `alReclamar` (refresca /api/estado y aplica las
entregas), `openModal`, `toast`, `save`, `render`, `snd`. Nada más que integrar.

## 4. Aviso automático (sin integrar nada)

Una vez por día, al abrir el juego: solo en la pestaña Inicio, con `#overlay` cerrado, después de la guía (marca
`envivo_guia_v1` o ya hay eventos), sin guía activa, sin evento en vivo (`S.currentEvent`), sin el pase ni el chat abiertos
y cuando ya se sabe si hay cuenta (`Api.disponible`). En pruebas automáticas (`navigator.webdriver`) no sale salvo
`window.__ENVIVO_DIARIO_AVISO = true`, así no estorba a las otras pruebas.

## 5. Pruebas en correr.sh — YA APLICADO en esta rama

Sección 3d: `for par in vip:Vip sede_oficial:SedeOficial pase:Pase estrellas:Estrellas diario:Diario; do`.

## API

Con sesión; POST con `X-Envivo: 1`. Errores `{ok:false, error, codigo}`.

- `GET /api/diario` → `{ok, hoy, reclamado_hoy, dia, dias: 7, ciclo, total, racha, ultimo_dia, vip_nivel, vip_doble,
  vip_doble_desde: 3, premios:[{dia, dinero, dinero_base, consumibles:{cable?, battery?}, materiales:{...}, creditos,
  grande, vip_doble, estado: reclamado|hoy|siguiente|bloqueado}], proximo (ISO, medianoche de Ecuador), quedan_seg}`.
- `POST /api/diario/reclamar` → `{ok, reclamado:{dia, dinero, consumibles, materiales, creditos, ...}, entregas:[...],
  creditos (saldo), diario:{...como GET}}`. 409 `ya_reclamado`, 403 `cuenta_suspendida`/`cuenta_baneada`, 429 `limite_intentos`.

## Archivos compartidos tocados en esta rama

- `server/public/api.php`: 2 líneas (comentario + ruta) antes de la Copa de Servidores.
- `index.html`: 1 línea `<script defer src="js/diario.js"></script>` después de la de js/pase.js.
- `sw.js`: 1 línea en la lista de archivos (sin subir VERSION).
- `server/tests/correr.sh`: `diario:Diario` en la lista de la sección 3d.
