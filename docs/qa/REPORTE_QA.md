# Reporte de QA: EN VIVO Tycoon

**Fecha:** 23 de octubre de 2026
**Probado en:** celular simulado de 390x844 (táctil, Chromium con Playwright) y también 360x740. Se abrió `index.html` como archivo, sin servidor.
**Cómo se probó:** un script juega como una persona cuidadosa: lee las ofertas, compra equipo con criterio, contrata, prepara eventos (a veces con menos gente), elige opciones distintas en los imprevistos, descansa, repara y sigue la historia. También abre todas las pestañas y ventanas y prueba casos límite.

| Partida | Versión del código | Días | Eventos | Resultado |
|---|---|---|---|---|
| Principal (r1) | carpeta de trabajo, ~01:50 | 65 | 64 | Capítulo 4, $2.307, fama 53 |
| Larga (r2) | commit `f91c419` | 106 | 105 | **En el capítulo 4 desde el día 36**, $1.299 |
| Final (r3) | carpeta de trabajo, ~02:25-02:45 | 62 | 61 | Capítulo 4, $10.730, fama 75, con selector de idiomas |
| Casos límite | igual que r1 | - | - | sin dinero, personal lleno (12), bodega llena (30), nada seleccionado, despedir, vender, partida nueva |
| Quiebra | igual que r1 | 13 | 0 | quiebra, recarga y reinicio funcionan |

Las capturas quedaron en la máquina de trabajo (`tests/capturas/qa/`, no se suben a GitHub por tamaño).

---

## 1. Resumen para el CEO

**Lo bueno.** El juego se ve profesional en el celular. No hay errores de JavaScript en las versiones que cargan y nada se sale de la pantalla a lo ancho, ni a 360 px. Ningún botón quedó sin hacer nada. El guardado funciona incluso si se recarga en pleno evento. La quiebra y la partida nueva funcionan. Los primeros ~35 días enganchan: el garaje, Don Ramiro, los primeros imprevistos y la sensación de crecer. El selector de idiomas ya traduce bien los menús y botones.

**Lo que más preocupa:**

1. **Durante el trabajo de la madrugada, la versión en curso dejó de abrir** (pedía `js/datos.js`, que todavía no existía). La versión publicada en GitHub sí abre: solo se sube lo que pasa las pruebas.
2. **El capítulo 4 ("La rival") es un callejón sin salida.** Pide juntar $12.000; en la partida larga (106 días) el máximo fue $6.782. Los gastos diarios del "Centro de producción" (~$370 al día) se comen las ganancias.
3. **La "calidad esperada" engaña en los eventos grandes.** En los conciertos promete unos 56 puntos y el resultado real fue 43,5 (1,9 estrellas). Se pierden duelos que la pantalla daba por ganados.
4. **La economía premia hacer mal los eventos grandes.** Un concierto de 1 estrella deja +$1.040. Una rueda de prensa de 5 estrellas puede dejar el día en negativo, porque la "ganancia del evento" no muestra los gastos fijos.
5. **Detalles que confunden:** el dinero queda en rojo aunque sea positivo, el local tiene dos nombres distintos, el premio de un capítulo a veces llega sin celebración y las renuncias del personal solo se ven en Registro.

---

## 2. Problemas encontrados (por prioridad)

Gravedad: **Crítica** = bloquea el juego · **Alta** = frustra o hace abandonar · **Media** = confunde o se ve mal · **Baja** = detalle.

| ID | Gravedad | Pantalla | Qué pasa | Qué debería pasar | Estado |
|---|---|---|---|---|---|
| QA-00 | **Crítica** | Todo el juego (versión de trabajo) | Pantalla vacía: `js/logic.js` exige `js/datos.js`, que no existe todavía. | El juego abre siempre. Se sube a GitHub solo lo que pasa `tests/test_browser.js`. | Pedido al ayudante de realismo |
| QA-01 | **Alta** | Historia, capítulo 4 | Las metas de duelos y fama se cumplen, pero **$12.000 no llega** (máx. $6.782 en 106 días). | Meta de ~$6.000 o "gana $8.000 durante el capítulo"; máximo ~20 días. | Pedido al ayudante de realismo |
| QA-02 | **Alta** | Inicio, gastos diarios | Al pasar de 16 a 19 personas+equipos el gasto diario salta $98 → $208 → $363. | Tramos más suaves y aviso al contratar: "Tus gastos suben de $98 a $208 al día". | Pedido |
| QA-03 | **Alta** | Preparar evento y resultado | Concierto: esperado 59 contra 55 ("Vas ganando"), final 22/100. Promedio: esperado 55,8, real 43,5. | Mostrar un rango ("45-62") o restar el riesgo promedio de imprevistos. | Pedido |
| QA-04 | **Alta** | Resultado | Concierto de 1★: "+$1.040". Prensa de 5★: "+$146" pero el día cerró en -$233. | Mostrar "Gastos del día" y "Te quedó en caja"; 1-2★ en eventos grandes pagan mucho menos. | Pedido |
| QA-05 | **Media** | Historia | Si el capítulo se cumple comprando o contratando, el premio llega sin la ventana "Capítulo completado". | Mostrar siempre "Capítulo completado" con el premio. | Pedido |
| QA-06 | **Media** | Cabecera | El dinero y la fama quedan **en rojo** aunque sean positivos (la animación usa la clase `down`, que también es el texto rojo global). | Rojo solo durante la animación o si es negativo. | Por arreglar en la pantalla |
| QA-07 | **Media** | Inicio | El dibujo dice "Garaje"/"Estudio propio" y la tarjeta "Oficina"/"Centro de producción". | Un solo nombre de local. | Pedido |
| QA-08 | **Media** | Registro e Inicio | Renuncias, contratos robados por MegaVisión y pagos atrasados solo quedan en Registro. | Resumen del día al descansar y aviso con moral baja. | Pedido |
| QA-09 | **Media** | Resultado | Recargar en la pantalla de resultado pierde el resultado y la ventana del capítulo. | Guardar el resultado pendiente y mostrarlo al volver. | Por arreglar |
| QA-10 | **Media** | Inicio | El dinero baja a negativo sin aviso hasta "Quebraste". | Franja: "Estás en rojo. A -$300 quiebras". | Por arreglar |
| QA-11 | **Media** | Idiomas | La interfaz está traducida, pero los textos de la lógica (capítulos, eventos, equipos, imprevistos) siguen en español. En pt-BR "0 evento". | Traducir la sección `logica` de cada idioma. | Segunda pasada de traducción |
| QA-12 | **Baja** | Cabecera, resultado | Se escribe "$-24". | "-$24". | Por arreglar |
| QA-13 | **Baja** | Textos | "8 de 5 estrellas", "Se vencieron 1 oferta(s)", "Tú (dueño) consiguió…", sueldo en dos formatos, "Momento épico" sale como "Imprevisto". | Textos corregidos. | Por arreglar |
| QA-14 | **Baja** | Personal y Bodega llenos | "Contratar"/"Comprar" activos que solo dan error. | Botones desactivados con "Equipo completo (12/12)". | Por arreglar |
| QA-15 | **Baja** | Preparar evento | Sin nada seleccionado, el consejo habla de la consola de audio. | Desactivar "Salir al aire" y pedir al menos una persona y una cámara. | Por arreglar |
| QA-16 | **Baja** | Personal | Nombres largos se cortan. | Que bajen a una segunda línea. | Por arreglar |
| QA-17 | **Baja** | Preparar y resultado | "Ver cómo se calcula" tiene 16 px de alto. | Área táctil de al menos 40 px. | Por arreglar |

**Revisado y sin problemas:** sin desplazamiento horizontal (390 y 360 px); sin NaN, `undefined` ni sueldos negativos; ningún botón sin efecto; todas las ventanas se cierran; el silencio del sonido se recuerda; despedir, vender y partida nueva piden confirmación; la quiebra sobrevive a la recarga; el menú inferior no tapa botones; el selector de idiomas no muestra claves sin traducir.

---

## 3. Sensación de juego

- **Días 1 a 35: muy bien.** Progresión clara; cada compra se nota en la escena y en la calidad.
- **Los imprevistos se vuelven automáticos.** Con repuestos, UPS, router 4G y cobertores, la primera opción siempre gana. Sugerencia: que la opción segura cueste algo y que a veces la arriesgada valga más.
- **Los "Momentos épicos" son lo mejor.** Deberían salir más en eventos grandes y celebrarse con sonido.
- **Ritmo:** capítulo 1 en el día 4; 2 entre los días 21 y 25; 3 entre los días 36 y 46; 4 nunca o muy tarde.
- **Moral:** encadenar conciertos desgasta y media plantilla renuncia sin aviso. Sugerencia: ícono de "cansado" y botón "Dar el día libre".
- **Visitar clientes** gasta un día entero por ofertas pequeñas; casi nunca conviene.

### Mejoras concretas (por impacto)
1. Capítulo 4: meta de $6.000 o "gana $8.000 durante el capítulo". Tramos del local $20 / $60 / $120 / $200.
2. Resultado con pago del cliente, sueldos y gastos del día; la cifra grande, lo que cambió en caja.
3. Calidad esperada como rango en dificultad 3 o más.
4. Pago casi nulo con 1 estrella en eventos grandes.
5. Resumen del día al descansar y aviso de dinero negativo.
6. Ventana de "Capítulo completado" siempre.
7. La animación `down` no debe dejar el texto rojo.

---

## 4. Datos para el balance (partida larga r2, 105 eventos)

| Dificultad | Eventos | Calidad esperada | Calidad real | Estrellas | Ganancia mostrada | Cambio real en caja ese día |
|---|---|---|---|---|---|---|
| 1 (misa, boda, prensa) | 27 | 74,9 | 68,0 | 3,3 | $287 | **$116** |
| 2 (barrial, graduación) | 33 | 77,9 | 71,5 | 3,6 | $424 | $226 |
| 3 (lanzamiento) | 24 | 70,4 | 57,5 | 2,7 | $875 | $408 |
| 4 (concierto) | 13 | 55,8 | 43,5 | **1,9** | $1.404 | **$1.135** |
| 2 disputado con MegaVisión | 4 | 67,5 | 51,0 | 2,5 | $316 | **-$78** |

Duelos contra MegaVisión: r1 0 ganados y 3 perdidos; r2 3 y 5; r3 2 y 3.
Gasto diario en r3: $26 el día 1, $43 el día 20, $98 el día 30, $361 el día 34 y $400 el día 60.
