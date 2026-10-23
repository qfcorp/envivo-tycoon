# 🔴 EN VIVO Tycoon (nombre provisional)

Juego de gestión de una productora de eventos y transmisiones en vivo.
Empiezas en un garaje con la vieja cámara de Don Ramiro y creces hasta
transmitir la final del campeonato. En cada evento pasan imprevistos
(se rompe un cable, se cae el internet, llueve, se va la luz) y tú decides
cómo resolverlos.

## ▶️ Cómo jugar

- **En el celular o PC:** abre `index.html` en el navegador.
- **Versión de un solo archivo:** `dist/envivo-tycoon.html` (funciona sin internet).
- La partida se guarda sola en el navegador.

## 🧪 Pruebas (para verificar que todo funciona)

```bash
node tests/test_logic.js        # simula 400 partidas completas con un bot
node tests/test_browser.js      # juega en un celular simulado (requiere Playwright)
node tools/build_single.js      # vuelve a crear dist/envivo-tycoon.html
```

## 📁 Archivos

| Archivo | Para qué sirve |
|---|---|
| `PLAN.md` | Bloc de notas del proyecto: plan, hecho y pendiente |
| `index.html` | La página del juego y sus estilos |
| `js/logic.js` | Las reglas del juego (dinero, eventos, imprevistos, historia) |
| `js/ui.js` | Las pantallas y botones |
| `tests/` | Pruebas automáticas |
| `tools/build_single.js` | Junta todo en un solo archivo |
