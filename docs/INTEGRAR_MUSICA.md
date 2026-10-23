# Integrar la música (js/musica.js) en el juego

- index.html: `<script src="js/musica.js"></script>` antes de js/ui.js. sw.js: agregar `'./js/musica.js'` al precache. tools/build_single.js: agregar a la lista.
- ui.js, junto al ayudante `snd`:
```js
const mus = {
  go(t) { try { if (window.Musica) window.Musica.tema(t); } catch (e) {} },
  stinger() { try { if (window.Musica) window.Musica.stinger(); } catch (e) {} },
  init() { try { if (window.Musica) window.Musica.iniciar(); } catch (e) {} },
  muted() { try { return window.Musica ? window.Musica.isMuted() : true; } catch (e) { return true; } },
  toggle() { try { if (window.Musica) window.Musica.setMuted(!window.Musica.isMuted()); } catch (e) {} },
};
const temaDeEvento = (type) => type === 'concierto' ? 'concierto' : 'en_vivo';
const esFuneral = (type) => /funeral|velorio|sepelio/.test(type || '');
```
- Clic global (después de `snd.unlock()`): `mus.init()`.
- Cambio de pestaña: `mus.go('menu')` (opcional `'preparacion'` en bodega y personal).
- Abrir preparar evento: `mus.go(esFuneral(c.type) ? 'funeral' : 'preparacion')`; cerrar sin salir al aire: `if (!S.currentEvent) mus.go('menu')`.
- Salir al aire: `mus.go(esFuneral(ty) ? 'funeral' : temaDeEvento(ty))`; en `final`/`ligapro`: `setTimeout(() => mus.stinger(), 900)`.
- Imprevisto grave (luz, internet, falla, robo…): `mus.go('tension')`; leve: `mus.stinger()` (nunca en funerales). Al resolver bien (`r.q >= 0`) desde tensión: volver a `temaDeEvento`.
- Resultado: funeral → `'funeral'`; 4–5 estrellas → `mus.go('menu')` y luego `mus.go('victoria')` (vuelve al menú sola); si no → `'menu'`.
- Capítulo completado: `'victoria'`. Quiebra: `'tension'`. Después del resultado / historia: `'menu'`.
- Botón de música junto al de sonido (`#musicBtn`, `data-act="music"`), `case 'music': mus.toggle(); render();`. Si el botón general de sonido debe silenciar todo: en `case 'mute'` también `window.Musica.setMuted(window.Sound.isMuted())`.
