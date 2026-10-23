# Integrar la decoración del local (js/decoracion.js)

Pedido del dueño: "comprar flores, arreglos, algo para la oficina o el garaje para recibir a los clientes que visitan".

`js/decoracion.js` es una extensión de la lógica (`Game.registrarExtension`, id `decoracion`) y una tarjeta de Inicio
(`window.EnVivoInicio`, id `decoracion`, orden 12). Guarda todo en `s.decor` (el gancho `migrar` arma las partidas viejas).
Los intentos en línea (`s.intento`) no la aplican. No usa `Math.random` ni la fecha: solo `s.day`.

Pruebas: `node tests/test_decoracion.js` (lógica) y `node tests/test_decoracion.js --navegador` (Chromium 390x844,
capturas `tests/capturas/decor_*.png`). Si `index.html` o `art.js` todavía no tienen las líneas de abajo, la prueba
del navegador las agrega en memoria.

---

## 1. index.html (obligatorio): cargar después de sede.js y antes de art.js / ui.js

```html
<script src="js/sede.js"></script>
<script src="js/decoracion.js"></script>
```

## 2. sw.js (obligatorio): agregar a la lista de archivos (junto a sede.js)

```js
  './js/decoracion.js', // decoración del local (extensión)
```

## 3. js/art.js, en `hq(s)` (obligatorio): dibujar la decoración sobre la sede

Cambiar la línea `${building}${roof.join('')}` del `return` de `hq()` por:

```js
      ${building}${root.Decoracion && root.Decoracion.capa ? root.Decoracion.capa(st, stage) : ''}${roof.join('')}
```

Va después del edificio y antes del techo, las cámaras, la unidad móvil y el cartel del nombre (quedan delante).
`capa(s, etapa)` devuelve `''` sin decoración, o un `<g class="decor-capa">` en las mismas coordenadas de `hq()`
(viewBox `0 -20 360 170`, suelo y = 140). Es una vitrina con la sala de espera: en el garaje, la puerta enrollable
queda medio subida; en la oficina, el estudio y el centro es un ventanal en la planta baja. El letrero de neón va
adentro, en la pared, porque los letreros de la fachada de art.js ya llevan el nombre de la productora.

## 4. js/ui.js, `PL_INFO` (obligatorio): ícono y título de la fila plegable

```js
    decoracion: ['planta', 'inicio.pl.decoracion'],
```

Ícono `planta` nuevo para `P` en js/art.js (si no lo agregas, usa `['home', ...]`):

```js
    planta: '<path d="M7.5 15h9l-1.2 6H8.7z"/><path d="M12 15V9"/><path d="M12 12c-4.5 0-6.5-3-6.5-6.5 3.5 0 6.5 2.5 6.5 6.5zM12 10c0-4 2.5-6.5 6.5-6.5 0 3.5-2.5 6.5-6.5 6.5z"/>',
```

Texto `inicio.pl.decoracion` para js/lang/*.js:

| idioma | texto |
|---|---|
| es | `'inicio.pl.decoracion': 'Decoración del local'` |
| en | `"inicio.pl.decoracion": "Venue decor"` |
| pt-BR | `"inicio.pl.decoracion": "Decoração do local"` |
| fr | `"inicio.pl.decoracion": "Décoration du local"` |
| de | `"inicio.pl.decoracion": "Einrichtung"` |
| it | `"inicio.pl.decoracion": "Arredamento della sede"` |
| ru | `"inicio.pl.decoracion": "Декор офиса"` |
| tr | `"inicio.pl.decoracion": "Mekân dekorasyonu"` |
| id | `"inicio.pl.decoracion": "Dekorasi kantor"` |
| zh-CN | `"inicio.pl.decoracion": "场地装饰"` |

El resumen de la fila sale solo del `<h3>` de la tarjeta: "Imagen del local 21/100 · ofertas +2%".

`ctxInicio()` ya pasa `nombreProductora`. La tarjeta y el letrero de neón lo usan (si falta, `s.productora` o "MI PRODUCTORA").

---

## 5. Recomendado: mantenimiento dentro de los gastos del día (js/logic.js + js/ui.js)

Sin esto todo funciona igual: el mantenimiento (café, botellones, luz del neón, TV y aire: de $1 a $8 por día) se
descuenta en `alNuevoDia` y lleva su cuenta en `s.decor.gastado`, pero no aparece en "gastos de hoy". Con estas líneas
entra en `dailyCost` (la quiebra, el resumen del evento y "Descansar (gastos $X)" lo cuentan). decoracion.js se da cuenta
sola: si existe `Game.extSuma`, deja de descontarlo en `alNuevoDia`, así que nunca se cobra dos veces.

**js/logic.js**, debajo de `function extLimite(...)`:

```js
  // Gastos fijos en dólares de las extensiones (decoración: café, agua, luz). No los toca multGastos.
  function extSuma(s, nombre) { let n = 0; cadaExt(s, nombre, (h) => { const v = Number(h(s)); if (isFinite(v) && v > 0) n += v; }); return Math.round(n); }
```

**js/logic.js**, `dailyCost(s)`: agregar `+ extSuma(s, 'gastoFijo')` al final del `return`, FUERA del `Math.round(... * extMult(s, 'multGastos'))`:

```js
    return Math.round((rentFor(s) + d.perStaff * hired.length + equipValueOf(s) * d.equipShare + vehiclesDaily(s) + payroll) * extMult(s, 'multGastos')) + extSuma(s, 'gastoFijo');
```

**js/logic.js**, `dailyCostBreakdown(s)`: cambiar las dos líneas que siguen a `out.total = dailyCost(s);` por:

```js
    out.fijoExt = extSuma(s, 'gastoFijo');
    const fx = extMult(s, 'multGastos');
    if (fx !== 1) { const base = out.total - out.fijoExt; out.ext = { mult: r2(fx), monto: base - Math.round(base / fx) }; } // lo que suman o ahorran las extensiones
```

**js/logic.js**, en el objeto `API` (línea `// Extensiones`): agregar `extSuma,` después de `extActivas,`.

**js/ui.js**, `renderInicio()`, en la línea de detalle del `costBox` (la que termina en
`` ${cb.equip ? ` · ${T('inicio.c_seguro', { m: M(cb.equip) })}` : ''}</div> ``): agregar antes del `</div>`:

```js
${cb.fijoExt && window.Decoracion ? ` · ${esc(window.Decoracion.t('c_decor', { m: M(cb.fijoExt) }))}` : ''}
```

(Muestra "Decoración $3". El texto está en decoracion.js para los 10 idiomas.)

---

## Qué hace (para el registro de cambios)

- Catálogo (USD, precios de Ecuador): flores frescas $30 (+9, duran 5 días; marchitas −4 hasta cambiarlas o quitarlas),
  planta $25 (+5, hasta 2), alfombra $45 (+4), cuadros de tus eventos $60 (+4, +1 cada 10 eventos, hasta +8),
  dispensador de agua $60 (+4, $1/día), cafetera $120 (+8, $2/día), letrero de neón con tu nombre $180 (+10, $1/día),
  sofá para clientes $280 (+12); desde la oficina: repisa de trofeos $90 (+3, +1 por trofeo, hasta +9) y TV con tu reel
  $380 (+11, $1/día); desde el estudio: recepción $520 (+14) y aire acondicionado $650 (+9, $3/día).
- Lugares: garaje 3, oficina 5, estudio 7, centro 9. Si el local se achica, lo que no cabe queda guardado (no suma ni gasta).
- Imagen del local 0-100 = suma de lo puesto → ofertas +1 % cada 10 puntos (tope +8 %; las internacionales no cambian).
  Con imagen 30+ un cliente pasa a visitarte cada 6 días y deja una oferta (60+: cada 4 días). No hay visitas durante
  el tutorial, y la oferta queda marcada `c.visita = true`.
- Quitar devuelve el 30 % (las flores, nada). Avisos (`G.aviso`, tipo `decoracion`): flores marchitas y visita de un cliente.
- API: `window.Decoracion` = `{ imagen(s), gastoDiario(s), comprar(s,k), quitar(s,i), cambiarFlores(s,i), capa(s,etapa),
  interior(s), migrar(s), t(clave,p), CATALOGO, AJUSTE, EXT, ... }`.
