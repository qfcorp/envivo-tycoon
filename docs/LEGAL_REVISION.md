# Revisión legal de EN VIVO Tycoon (para el abogado)

Última actualización de los textos: **23 de octubre de 2026**. Los textos son un **borrador** escrito en español sencillo;
no son asesoría legal. Antes del lanzamiento, un abogado en Ecuador debe revisar cada punto de esta lista.

## Qué hay que revisar

| Página (versión oficial, en español) | URL pública | Traducciones de conveniencia (9 idiomas) |
|---|---|---|
| `server/public/terminos.html` (21 secciones) | `/terminos.html` | `docs/traducciones/legal/terminos_<idioma>.html` |
| `server/public/privacidad.html` (16 secciones) | `/privacidad.html` | `docs/traducciones/legal/privacidad_<idioma>.html` |
| `server/public/borrar-cuenta.html` | `/borrar-cuenta.html` (enlace que pide Google Play) | `docs/traducciones/legal/borrar-cuenta_<idioma>.html` |

Idiomas: en, pt-BR, fr, de, it, ru, tr, id, zh-CN. Cada traducción tiene un aviso visible: "la versión en español es la
única oficial y prevalece". Conviene que un traductor nativo las revise.

**Único dato pendiente del dueño:** `[DIRECCIÓN]` (domicilio de QFCORP S.A.S.), marcado en amarillo con `<mark class="falta">`
en términos §1 y privacidad §1 (también en las traducciones). Datos ya puestos: QFCORP SOCIEDAD POR ACCIONES SIMPLIFICADA
(QF PRODUCCIONES), RUC 1793135099001, soporte@tukanec.com (en creación), edad mínima 16, países de lanzamiento Ecuador,
Colombia y Perú (después México; Brasil no por ahora).

## Puntos que el abogado debe revisar

### Consumidor (Ley Orgánica de Defensa del Consumidor, LODC)
1. **Plazo del derecho de devolución (términos §12).** El texto original del art. 45 LODC da **3 días** desde la recepción
   para compras por internet "siempre y cuando lo permita su naturaleza" (El Telégrafo). Una nota de prensa de abril de 2026
   (El Diario) cita el art. 45 con **15 días** "independientemente del medio". No pudimos confirmar en el Registro Oficial
   cuál es el texto vigente. Usamos **15 días** (lo más favorable al consumidor). Confirmar el texto vigente; si son 3 días,
   decidir si se mantiene 15 como política comercial.
2. **Contenido digital ya usado.** Decimos que lo usado no se devuelve porque "por su naturaleza se consume" y el usuario pidió
   la entrega inmediata (términos §8 y §12). La LODC no tiene una excepción expresa para contenido digital: confirmar que la
   frase "siempre y cuando lo permita su naturaleza" alcanza.
3. **Devolución proporcional** de créditos no usados de una compra (términos §12): es una decisión comercial generosa; confirmar.
4. **Cierre del juego** (términos §5): aviso de 30 días y fin de ventas, sin devolver créditos no usados. Revisar si conviene
   ofrecer devolución de créditos comprados recientemente y no usados.
5. **Límite de responsabilidad** (términos §19): está redactado "en lo que la ley permita" y aclara que nada limita los
   derechos irrenunciables de la LODC. Revisar contra las cláusulas prohibidas de la LODC (art. 43).
6. **Contracargos y saldo negativo** (términos §12 y §15): quitar lo entregado, saldo negativo, suspensión y bloqueo. Revisar
   proporcionalidad.
7. **Reclamos** (términos §21): primero a nosotros (15 días), luego Defensoría del Pueblo o jueces del Ecuador. Confirmar.
8. **Colombia y Perú:** decimos que el usuario conserva los derechos irrenunciables de su país. Revisar el retracto de
   Colombia (Estatuto del Consumidor, Ley 1480 de 2011, art. 47) y el Código de Protección y Defensa del Consumidor del Perú
   (Ley 29571), y si hace falta un texto por país. México: revisar antes de abrir ese mercado.
9. **Factura** (términos §20): web → comprobante electrónico SRI con los datos del pago; Google Play → recibo de Google.
   Que el contador confirme cómo se facturan y declaran (IVA) las ventas hechas por Google Play.

### Datos personales (LOPDP y su reglamento)
10. **Bases legales por finalidad** (privacidad §4, LOPDP art. 7): contrato, obligación legal, interés legítimo (seguridad,
    moderación, estadísticas propias) y consentimiento (Discord, notificaciones). Confirmar que el interés legítimo vale para
    las estadísticas y los reportes de errores del propio juego.
11. **Plazo de respuesta de 15 días** para acceso, rectificación, eliminación y oposición (LOPDP arts. 13 a 16): usado en
    privacidad §9 y borrar-cuenta. La portabilidad (art. 17) no fija días; usamos el mismo plazo.
12. **Transferencia internacional** (privacidad §6, LOPDP arts. 55 a 57): el servidor es un VPS de OVHcloud **fuera del Ecuador**
    (OVHcloud no tiene centros de datos en Ecuador; el país exacto del VPS está en el panel de OVH y conviene confirmarlo y,
    si se quiere, escribirlo). Copia de seguridad cifrada en un servidor propio en Ecuador. Google y Discord: principalmente
    EE. UU. Revisar la **Norma General de Transferencias** de la SPDP (Resolución SPDP-SPD-2026-0004-R, 28 de enero de 2026):
    puede exigir cláusulas contractuales tipo con los proveedores, inscribir las transferencias en el Registro Nacional de
    Transferencias Internacionales (o reporte anual) y notificar transferencias anteriores dentro de 12 meses.
13. **Registro y delegado de protección de datos:** revisar si QFCORP debe inscribirse en el Registro Nacional de Protección
    de Datos y si debe nombrar un delegado de protección de datos.
14. **Vulneraciones de seguridad** (privacidad §11): aviso a la Superintendencia en máximo 5 días (art. 43) y al titular en
    máximo 3 días si hay riesgo (art. 46). Confirmar si son días hábiles ("término") y la norma técnica de la SPDP sobre
    notificación de vulneraciones.
15. **Menores** (privacidad §12, términos §2): edad mínima 16 (decisión del dueño). La LOPDP (art. 21) permite el
    consentimiento propio desde los 15 años. Para comprar, 16-17 años necesitan permiso de los padres.
16. **Decisiones automatizadas** (privacidad §10): el filtro del chat y el bloqueo automático por contracargos o reembolsos
    repetidos. Ofrecemos revisión por una persona. Confirmar que basta.
17. **Retención** (privacidad §7): compras y facturas **7 años** (confirmar el plazo tributario exacto con el contador);
    chat 30 días; sesión 60 días; intentos de clave 24 h; estadísticas 90 días; copias de seguridad hasta 6 meses.
18. **Reclamo ante la autoridad** (privacidad §9): Superintendencia de Protección de Datos Personales, formulario
    `servicios.spdp.gob.ec/denuncia`, después de reclamar primero al responsable y esperar 15 días. Colombia: SIC (Ley 1581
    de 2012). Perú: Autoridad Nacional de Protección de Datos Personales (Ley 29733; revisar si hay que inscribir el banco de
    datos en el Perú).
19. **Brasil:** no se lanza por ahora. La traducción pt-BR existe solo como cortesía; si se abre Brasil hará falta revisar la LGPD.

### Contenido de los jugadores y marcas
20. **Chat y contenido de los jugadores** (términos §13 a §15, privacidad §15): permiso para mostrar lo que escriben, reglas,
    reporte, bloqueo y sanciones (silencio 1 h / 24 h / 7 días, expulsión, suspensión, bloqueo).
21. **Nombres de parodia** (términos §17). Ojo: `js/logic.js` todavía nombra marcas reales (ver `docs/play_store/README.md`, §3).
    Que lo vea un abogado de marcas.

## Lo que los textos prometen y el juego debe cumplir (para el equipo técnico)

Los textos describen el juego como debe quedar al lanzar. Antes de publicar, confirmar cada punto
(detalle en `server/INTEGRAR_LEGAL.md`):

- **Botón "Cuenta → Borrar mi cuenta" en el juego:** el servidor ya lo tiene (`POST /api/cuenta/borrar`), pero hoy el juego
  (js/) **no muestra el botón**. Es obligatorio para Google Play y para lo que dicen las tres páginas.
- **Casilla de edad al crear la cuenta** ("Tengo 16 años o más y acepto los términos"): hoy no existe.
- **Estadísticas y reportes de errores propios** (90 días con el número de jugador), **notificaciones push** (solo si el
  jugador las activa) y **recuperación de clave por correo**: si esos módulos no salen en el lanzamiento, quitar esas líneas de
  la privacidad; si salen, deben cumplir lo escrito (sin herramientas de otras empresas).
- **Google Fonts:** el juego carga las letras desde Google (lo dice privacidad §5). Recomendado: servir las letras desde el
  propio servidor y quitar esa línea.
- **Registro de seguridad** (`auditoria`, con IP): hoy se guarda mientras exista la cuenta. Recomendado: borrar la IP a los 12 meses.
- **Discord al borrar la cuenta:** arreglado en esta rama (se quita el vínculo y los roles).
- **Portabilidad (JSON):** hoy se atiende a mano desde soporte.

## Fuentes consultadas (octubre de 2026)
- LOPDP, texto publicado (arts. 7, 13 a 17, 21, 43, 46, 55 a 58): https://consejodecomunicacion.gob.ec/wp-content/uploads/downloads/2021/07/lotaip/Ley%20Org%C3%A1nica%20de%20Protecci%C3%B3n%20de%20Datos%20Personales.pdf
- Reglamento General de la LOPDP: https://www.lexis.com.ec/noticias/reglamento-general-de-ley-organica-de-proteccion-de-datos-personales
- Norma General de Transferencias de la SPDP (Res. SPDP-SPD-2026-0004-R): https://nmslaw.com.ec/blog/2026/02/02/spdp-transferencias-comunicaciones-datos-personales-ecuador-internacionales/
- Denuncias ante la SPDP (formulario en línea, reclamo previo de 15 días): https://www.elcomercio.com/actualidad/asi-puedes-denunciar-en-linea-el-uso-indebido-de-tus-datos-personales-en-ecuador/
- Norma técnica de notificación de vulneraciones: https://www.ecija.com/actualidad-insights/nueva-norma-tecnica-de-notificacion-de-vulneraciones-de-seguridad-de-datos-personales/
- LODC art. 45 (3 días en compras por internet): https://www.eltelegrafo.com.ec/noticias/sociedad/6/ley-ampara-devolucion-compra-virtual-ecuador
- LODC art. 45 citado con 15 días (abril de 2026): https://www.eldiario.ec/negocios/compraste-algo-y-ya-no-te-gusto-en-ecuador-hay-una-ley-que-te-da-15-dias-para-arrepentirte-y-proceder-con-la-devolucion-02042026/
- Centros de datos de OVHcloud: https://www.ovhcloud.com/fr/datacenters-ovhcloud/
