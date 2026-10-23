/* =========================================================
   EN VIVO Tycoon — Guía del primer evento ("toca aquí")
   Solo para una partida nueva: lleva de la mano por el PRIMER evento
   (Clientes → Preparar → Al aire → imprevisto → resultado) y no vuelve a salir.

   API (la usa js/ui.js; ver server/INTEGRAR_GUIA.md):
     Guia.iniciar(ctx)  → empieza si corresponde (partida nueva, nunca vista). Devuelve true si arrancó.
        ctx = {
          estado: () => S,        // estado del juego (si falta: window.__game.state)
          A,                      // js/art.js (si falta: window.Art) — retrato de Don Ramiro
          tab: () => tab,         // pestaña actual (si falta: se lee de <main section.on>)
          idioma: () => código,   // idioma actual (si falta: window.I18N.idioma)
        }
     Guia.terminar()    → la cierra y la marca como vista
     Guia.activa()      → true mientras se ve
     Guia.estado()      → { paso, x, y, visible } (para las pruebas: x, y = punta del dedo)
     Guia.olvidar()     → borra la marca (para probar de nuevo)
   Si js/guia.js carga después de que ui.js llamó (script con defer), ui.js deja el ctx en window.__guiaCtx.
   Nunca bloquea: el botón señalado se puede tocar, "Saltar guía" siempre visible, y si algo falla se cierra sola.
   ========================================================= */
(function (root) {
  'use strict';
  const KEY = 'envivo_guia_v1';
  const ID = 'guia';

  /* ---------- Textos (cortos: una línea) ---------- */
  const TEXTOS = {
    es: { intro: 'Toca aquí para empezar', clientes: 'Toca aquí para ver tus clientes', evento: 'Elige este evento, es fácil', auto: 'Toca para elegir lo mejor',
      aire: '¡Todo listo! Sal al aire', elegir: '¡Imprevisto! Toca esta solución', seguir: 'Toca para seguir', terminar: 'Termina la transmisión',
      resultado: '¡Primer evento listo! Toca aquí', fin: '¡Bien! Repite esto con más clientes', saltar: 'Saltar guía' },
    en: { intro: 'Tap here to start', clientes: 'Tap here to see your clients', evento: 'Pick this event, it’s easy', auto: 'Tap to pick the best',
      aire: 'All set! Go live', elegir: 'Trouble! Tap this fix', seguir: 'Tap to continue', terminar: 'End the broadcast',
      resultado: 'First event done! Tap here', fin: 'Great! Repeat this with more clients', saltar: 'Skip guide' },
    'pt-BR': { intro: 'Toque aqui para começar', clientes: 'Toque aqui para ver seus clientes', evento: 'Escolha este evento, é fácil', auto: 'Toque para escolher o melhor',
      aire: 'Tudo pronto! Entre ao vivo', elegir: 'Imprevisto! Toque nesta solução', seguir: 'Toque para continuar', terminar: 'Encerre a transmissão',
      resultado: 'Primeiro evento feito! Toque aqui', fin: 'Muito bem! Repita com mais clientes', saltar: 'Pular guia' },
    fr: { intro: 'Touche ici pour commencer', clientes: 'Touche ici pour voir tes clients', evento: 'Choisis cet événement, il est facile', auto: 'Touche pour choisir le meilleur',
      aire: 'Tout est prêt ! Passe à l’antenne', elegir: 'Imprévu ! Touche cette solution', seguir: 'Touche pour continuer', terminar: 'Termine la diffusion',
      resultado: 'Premier événement réussi ! Touche ici', fin: 'Bravo ! Recommence avec d’autres clients', saltar: 'Passer le guide' },
    de: { intro: 'Tippe hier, um zu starten', clientes: 'Tippe hier für deine Kunden', evento: 'Wähle dieses Event, es ist leicht', auto: 'Tippe, um das Beste zu wählen',
      aire: 'Alles bereit! Geh auf Sendung', elegir: 'Panne! Tippe auf diese Lösung', seguir: 'Tippe zum Weitermachen', terminar: 'Beende die Übertragung',
      resultado: 'Erstes Event geschafft! Tippe hier', fin: 'Super! Wiederhole das mit mehr Kunden', saltar: 'Anleitung überspringen' },
    it: { intro: 'Tocca qui per iniziare', clientes: 'Tocca qui per vedere i clienti', evento: 'Scegli questo evento, è facile', auto: 'Tocca per scegliere il meglio',
      aire: 'Tutto pronto! Vai in diretta', elegir: 'Imprevisto! Tocca questa soluzione', seguir: 'Tocca per continuare', terminar: 'Chiudi la trasmissione',
      resultado: 'Primo evento fatto! Tocca qui', fin: 'Bravo! Ripeti con altri clienti', saltar: 'Salta la guida' },
    ru: { intro: 'Нажми здесь, чтобы начать', clientes: 'Нажми, чтобы увидеть клиентов', evento: 'Выбери это событие, оно лёгкое', auto: 'Нажми, чтобы выбрать лучшее',
      aire: 'Всё готово! Выходи в эфир', elegir: 'ЧП! Нажми на это решение', seguir: 'Нажми, чтобы продолжить', terminar: 'Заверши трансляцию',
      resultado: 'Первое событие готово! Нажми здесь', fin: 'Отлично! Повтори с другими клиентами', saltar: 'Пропустить обучение' },
    tr: { intro: 'Başlamak için buraya dokun', clientes: 'Müşterilerini görmek için dokun', evento: 'Bu etkinliği seç, kolay', auto: 'En iyisini seçmek için dokun',
      aire: 'Her şey hazır! Yayına geç', elegir: 'Aksilik! Bu çözüme dokun', seguir: 'Devam etmek için dokun', terminar: 'Yayını bitir',
      resultado: 'İlk etkinlik tamam! Buraya dokun', fin: 'Harika! Daha çok müşteriyle tekrarla', saltar: 'Rehberi geç' },
    id: { intro: 'Ketuk di sini untuk mulai', clientes: 'Ketuk di sini untuk lihat klien', evento: 'Pilih acara ini, mudah kok', auto: 'Ketuk untuk pilih yang terbaik',
      aire: 'Semua siap! Mulai siaran langsung', elegir: 'Ada masalah! Ketuk solusi ini', seguir: 'Ketuk untuk lanjut', terminar: 'Akhiri siaran',
      resultado: 'Acara pertama selesai! Ketuk di sini', fin: 'Hebat! Ulangi dengan klien lain', saltar: 'Lewati panduan' },
    'zh-CN': { intro: '点这里开始', clientes: '点这里查看客户', evento: '选这个活动，很简单', auto: '点这里选最佳配置',
      aire: '准备好了！开始直播', elegir: '出状况了！点这个办法', seguir: '点这里继续', terminar: '结束直播',
      resultado: '第一场活动完成！点这里', fin: '很好！接更多客户重复这样做', saltar: '跳过引导' },
  };

  /* ---------- Estilos (se inyectan una sola vez) ---------- */
  const CSS = `
#guia{position:fixed;inset:0;z-index:25;pointer-events:none;font-family:var(--f-body,system-ui,sans-serif)}
#guia [hidden]{display:none!important}
#guia .g-blk{position:fixed;pointer-events:auto;background:transparent;touch-action:pan-y}
#guia .g-ring{position:fixed;border-radius:14px;pointer-events:none;box-shadow:0 0 0 3px var(--amber,#ffb020),0 0 22px 2px #ffb020aa,0 0 0 200vmax #000000a8;transition:top .18s,left .18s,width .18s,height .18s}
#guia .g-ring::after{content:"";position:absolute;inset:-4px;border-radius:17px;border:3px solid var(--amber,#ffb020);animation:gPulse 1.2s ease-out infinite}
#guia .g-ring.nudge{animation:gNudge .35s}
#guia .g-hand{position:fixed;width:58px;height:72px;pointer-events:none;z-index:2;transform-origin:20px 2px;filter:drop-shadow(0 4px 8px #000c)}
#guia .g-hand.flip{transform:scaleY(-1)}
#guia .g-hand svg{display:block;width:58px;height:72px;animation:gTap 1.1s ease-in-out infinite}
#guia .g-bub{position:fixed;display:flex;align-items:center;gap:10px;max-width:min(340px,calc(100vw - 24px));background:var(--panel,#161a22);border:1.5px solid var(--amber,#ffb020);border-radius:14px;padding:8px 14px 8px 8px;color:var(--text,#e9edf5);font-size:16px;font-weight:700;line-height:1.25;box-shadow:0 8px 24px #000b;pointer-events:none;z-index:1}
#guia .g-bub .g-por{flex:none;width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--panel2,#1e2430);display:grid;place-items:center}
#guia .g-bub .g-por svg{width:42px;height:42px}
#guia .g-bub.fin{left:0!important;right:0;margin:0 auto;width:max-content;top:38%!important;font-size:17px;padding:12px 16px 12px 10px}
#guia .g-skip{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);inset-inline-start:max(10px,env(safe-area-inset-left,0px));pointer-events:auto;z-index:3;background:#000d;color:var(--text,#e9edf5);border:1px solid var(--line,#2a3242);border-radius:999px;padding:7px 13px;font:600 13px/1 var(--f-body,system-ui,sans-serif);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
#guia .g-skip:focus-visible{outline:2px solid var(--amber,#ffb020);outline-offset:2px}
@keyframes gPulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.12)}}
@keyframes gTap{0%,100%{transform:translate(4px,14px)}45%,55%{transform:translate(0,0)}}
@keyframes gNudge{0%,100%{transform:none}30%{transform:translateX(-5px)}70%{transform:translateX(5px)}}
@keyframes gIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
#guia .g-bub.in{animation:gIn .22s ease-out}
@media (prefers-reduced-motion:reduce){#guia .g-ring::after,#guia .g-hand svg,#guia .g-ring.nudge,#guia .g-bub.in{animation:none}#guia .g-ring{transition:none}}
`;
  // Mano con el índice hacia arriba: la punta del dedo está en (20, 2) px del dibujo de 58x72
  const MANO = (() => {
    const formas = '<rect x="15" y="1" width="12" height="40" rx="6"/><rect x="11" y="32" width="38" height="36" rx="12"/>'
      + '<rect x="26" y="27" width="9.5" height="18" rx="4.75"/><rect x="34.5" y="29" width="9.5" height="18" rx="4.75"/><rect x="42" y="33" width="8" height="16" rx="4"/>'
      + '<rect x="3" y="38" width="12" height="22" rx="6" transform="rotate(-28 9 49)"/>';
    return `<svg viewBox="0 0 58 72" aria-hidden="true"><g fill="#1a1205" stroke="#1a1205" stroke-width="4.5" stroke-linejoin="round">${formas}</g>`
      + `<g fill="#fff7e6">${formas}</g><path d="M17 12h8M29 36v5M37.5 38v5" stroke="#d9c7a3" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  })();
  const TIP = { x: 20, y: 2 };   // punta del dedo dentro del dibujo
  const HAND_H = 72, HAND_W = 58;

  /* ---------- Estado ---------- */
  let ctx = null, el = null, timer = null, obs = null, raf = 0, finT = null;
  let paso = null, target = null, ultimoPaso = null, desplazado = null, perdidoDesde = 0, fin = false;
  let tip = null, visible = false, S0 = null, inicio = 0;
  const lsGet = (k) => { try { return root.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { root.localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const reduce = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const $ = (s, r) => (r || document).querySelector(s);

  function estadoJuego() {
    try { if (ctx && typeof ctx.estado === 'function') return ctx.estado(); } catch (e) { /* abajo */ }
    try { return root.__game ? root.__game.state : null; } catch (e) { return null; }
  }
  function idioma() {
    let c = null;
    try { c = ctx && typeof ctx.idioma === 'function' ? ctx.idioma() : null; } catch (e) { c = null; }
    if (!c) { try { c = root.I18N ? root.I18N.idioma : null; } catch (e) { c = null; } }
    c = String(c || 'es');
    if (TEXTOS[c]) return c;
    const base = c.toLowerCase().split('-')[0];
    return Object.keys(TEXTOS).find((k) => k.toLowerCase().split('-')[0] === base) || 'es';
  }
  const tx = (k) => (TEXTOS[idioma()] || TEXTOS.es)[k] || TEXTOS.es[k] || '';
  function tabActual() {
    try { if (ctx && typeof ctx.tab === 'function') { const t = ctx.tab(); if (t) return t; } } catch (e) { /* abajo */ }
    const s = $('main section.on');
    return s ? s.id.replace(/^tab-/, '') : '';
  }
  const usable = (n) => !!(n && n.isConnected && n.getClientRects().length);

  /* ---------- ¿Qué toca ahora? (se calcula siempre desde la pantalla y el estado: sirve aunque se salte pasos) ---------- */
  function contratoFacil(s) {
    const cs = Array.isArray(s.contracts) ? s.contracts.slice() : [];
    if (!cs.length) return null;
    // El primero entre los más fáciles (las 3 primeras ofertas de una partida nueva ya son fáciles)
    let mejor = cs[0];
    cs.forEach((c) => { if ((c.diff || 1) < (mejor.diff || 1) && !c.internacional) mejor = c; });
    return mejor;
  }
  function calcular() {
    const s = estadoJuego();
    if (!s || !s.stats) return { paso: 'espera' };
    const ov = $('#overlay.on');
    if (ov) {
      const q = (sel) => { const n = ov.querySelector(sel); return usable(n) ? n : null; };
      let n;
      if ((n = q('[data-act="after-result"]'))) return { paso: 'resultado', el: n };
      if ((n = q('[data-act="finish"]'))) return { paso: 'terminar', el: n };
      if ((n = q('[data-act="next-inc"]'))) return { paso: 'seguir', el: n };
      if ((n = q('[data-act="choose"]:not([disabled])'))) return { paso: 'elegir', el: n };   // la primera opción posible es la recomendada
      if ((n = q('[data-act="go-live"]'))) {
        if (!n.disabled) return { paso: 'aire', el: n };
        const a = q('[data-act="auto"]');
        return a ? { paso: 'auto', el: a } : { paso: 'espera' };
      }
      if (s.stats.events >= 1) return { paso: 'fin' };
      if ((n = q('.btn.main[data-act="close"]'))) return { paso: 'intro', el: n };   // intro del capítulo
      if ((n = q('[data-act="close-dia"]') || q('[data-act="close-story"]'))) return { paso: 'seguir', el: n };
      return { paso: 'espera' };   // otra ventana (idioma, confirmar…): no se señala nada
    }
    if (s.stats.events >= 1) return { paso: 'fin' };
    if (s.currentEvent) return { paso: 'espera' };
    if (tabActual() === 'clientes') {
      const c = contratoFacil(s);
      let n = c ? $(`#tab-clientes [data-act="prep"][data-id="${c.id}"]`) : null;
      if (!usable(n)) n = $('#tab-clientes [data-act="prep"]');
      return usable(n) ? { paso: 'evento', el: n } : { paso: 'espera' };
    }
    const nav = $('nav button[data-tab="clientes"]');
    return usable(nav) ? { paso: 'clientes', el: nav } : { paso: 'espera' };
  }

  /* ---------- Dibujo ---------- */
  function montar() {
    if (!$('#guia-css')) {
      const st = document.createElement('style');
      st.id = 'guia-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.id = ID;
    el.setAttribute('data-paso', '');
    el.innerHTML = `<div class="g-blk" data-b="t"></div><div class="g-blk" data-b="b"></div><div class="g-blk" data-b="l"></div><div class="g-blk" data-b="r"></div>
      <div class="g-ring" hidden></div><div class="g-hand" hidden>${MANO}</div>
      <div class="g-bub" role="status" aria-live="polite" hidden><span class="g-por"></span><span class="g-tx"></span></div>
      <button type="button" class="g-skip" data-guia="saltar"></button>`;
    document.body.appendChild(el);
    const A = (ctx && ctx.A) || root.Art;
    try { if (A && A.portrait) el.querySelector('.g-por').innerHTML = A.portrait('ramiro', 42); else el.querySelector('.g-por').hidden = true; } catch (e) { el.querySelector('.g-por').hidden = true; }
    el.querySelector('.g-skip').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); terminar(); });
    el.querySelectorAll('.g-blk').forEach((b) => b.addEventListener('click', (e) => {
      // Tocar fuera no hace nada (solo un pequeño aviso en el anillo)
      e.preventDefault(); e.stopPropagation();
      const r = el && el.querySelector('.g-ring');
      if (r && !reduce()) { r.classList.remove('nudge'); void r.offsetWidth; r.classList.add('nudge'); }
    }));
  }
  function blk(k, x, y, w, h) {
    const b = el.querySelector(`.g-blk[data-b="${k}"]`);
    b.hidden = !(w > 0 && h > 0);
    Object.assign(b.style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' });
  }
  function ocultarSeñal() {
    ['.g-ring', '.g-hand', '.g-bub'].forEach((s) => { el.querySelector(s).hidden = true; });
    el.querySelectorAll('.g-blk').forEach((b) => { b.hidden = true; });
    tip = null; visible = false;
  }
  function textoBurbuja(k) {
    const t = el.querySelector('.g-tx');
    if (t.textContent !== tx(k)) t.textContent = tx(k);
    const sk = el.querySelector('.g-skip');
    const st = tx('saltar') + ' ✕';
    if (sk.textContent !== st) sk.textContent = st;
  }
  // Zona visible para el objetivo (la cabecera fija y la barra de abajo tapan)
  function zonaVisible(n) {
    const vh = root.innerHeight;
    if (n.closest('#modal') || n.closest('nav')) return { top: 0, bottom: vh };
    const h = $('header'), nv = $('nav');
    return { top: h ? h.getBoundingClientRect().bottom : 0, bottom: nv ? nv.getBoundingClientRect().top : vh };
  }
  function layout() {
    if (!el) return;
    if (fin) return;
    const n = target;
    if (!usable(n)) {
      // Se rehízo la pantalla: se espera un momento; si no vuelve, se esconde la mano y se espera
      if (!perdidoDesde) perdidoDesde = Date.now();
      if (Date.now() - perdidoDesde > 700) ocultarSeñal();
      return;
    }
    perdidoDesde = 0;
    const vw = root.innerWidth, vh = root.innerHeight;
    const r = n.getBoundingClientRect();
    // Si está tapado o fuera de la pantalla, se lleva al centro (una vez por paso)
    const z = zonaVisible(n);
    if (desplazado !== paso && (r.top < z.top + 4 || r.bottom > z.bottom - 4)) {
      desplazado = paso;
      try { n.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); } catch (e) { n.scrollIntoView(); }
    }
    desplazado = paso;
    const pad = 5;
    const x0 = Math.max(0, r.left - pad), y0 = Math.max(0, r.top - pad);
    const x1 = Math.min(vw, r.right + pad), y1 = Math.min(vh, r.bottom + pad);
    // Bloqueos alrededor del hueco (lo de adentro se puede tocar)
    blk('t', 0, 0, vw, y0); blk('b', 0, y1, vw, vh - y1); blk('l', 0, y0, x0, y1 - y0); blk('r', x1, y0, vw - x1, y1 - y0);
    const ring = el.querySelector('.g-ring');
    ring.hidden = false;
    Object.assign(ring.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
    // Punta del dedo: en el centro del objetivo (un poco abajo); si no cabe debajo, la mano viene de arriba
    const cx = Math.round(Math.max(x0 + 4, Math.min(x1 - 4, (r.left + r.right) / 2)));
    const cy = Math.round(Math.max(y0 + 2, Math.min(y1 - 2, r.top + r.height * 0.6)));
    const flip = cy + HAND_H + 6 > vh;
    const hand = el.querySelector('.g-hand');
    hand.hidden = false;
    hand.classList.toggle('flip', flip);
    hand.style.left = (cx - TIP.x) + 'px';
    hand.style.top = (cy - TIP.y) + 'px';
    tip = { x: cx, y: cy };
    // Burbuja: del lado de la mano, sin tapar el objetivo
    const bub = el.querySelector('.g-bub');
    bub.classList.remove('fin');
    const nuevo = bub.hidden;
    bub.hidden = false;
    if (nuevo && !reduce()) { bub.classList.remove('in'); void bub.offsetWidth; bub.classList.add('in'); }
    const bw = bub.offsetWidth, bh = bub.offsetHeight;
    const arribaMin = 48;   // debajo de "Saltar guía"
    let top;
    if (!flip) {
      top = Math.max(y1, cy + HAND_H - 8) + 8;
      if (top + bh > vh - 8) top = y0 - bh - 10;
    } else {
      top = Math.min(y0, cy - HAND_H + 8) - bh - 8;
      if (top < arribaMin) top = y1 + 10;
    }
    top = Math.max(arribaMin, Math.min(vh - bh - 8, top));
    const left = Math.max(12, Math.min(vw - bw - 12, cx - bw / 2));
    bub.style.left = Math.round(left) + 'px';
    bub.style.top = Math.round(top) + 'px';
    visible = true;
  }
  function mostrarFin() {
    fin = true;
    lsSet(KEY, '1');
    ocultarSeñal();
    textoBurbuja('fin');
    const bub = el.querySelector('.g-bub');
    bub.classList.add('fin');
    bub.hidden = false;
    if (!reduce()) { bub.classList.remove('in'); void bub.offsetWidth; bub.classList.add('in'); }
    el.querySelector('.g-skip').hidden = true;
    el.setAttribute('data-paso', 'fin');
    // Pasivo: no bloquea nada y se va solo
    finT = setTimeout(() => cerrar(), 2800);
  }

  /* ---------- Ciclo ---------- */
  function tick() {
    if (!el || fin) return;
    try {
      const s = estadoJuego();
      // Se cambió la partida (p. ej. llegó la de la nube con eventos): ya no es un jugador nuevo
      if (s && S0 && s !== S0 && s.stats && s.stats.events > 0 && !s.currentEvent && !$('#overlay.on [data-act="after-result"]')) { terminar(); return; }
      S0 = s || S0;
      if (Date.now() - inicio > 20 * 60 * 1000) { terminar(); return; }   // por si acaso: nunca queda pegada
      const c = calcular();
      if (c.paso === 'fin') { mostrarFin(); return; }
      if (c.paso !== paso) { paso = c.paso; el.setAttribute('data-paso', paso); }
      target = c.el || null;
      if (paso === 'espera' || !target) { if (!perdidoDesde) perdidoDesde = Date.now(); if (Date.now() - perdidoDesde > 700 || paso === 'espera') ocultarSeñal(); return; }
      textoBurbuja(paso);
      layout();
      ultimoPaso = paso;
    } catch (e) { cerrarPorError(e); }
  }
  function pedir() {
    if (raf) return;
    raf = (root.requestAnimationFrame || ((f) => setTimeout(f, 16)))(() => { raf = 0; tick(); });
  }
  const alMover = () => { if (el && !fin) { try { layout(); } catch (e) { cerrarPorError(e); } } };

  function puedeEmpezar(s) {
    if (lsGet(KEY)) return false;
    if (root.__ENVIVO_DEMO) return false;
    try { if (/[?&]demo=/.test(location.search || '')) return false; } catch (e) { /* nada */ }
    // Pruebas automáticas de otras partes del juego: sin guía (salvo que se pida con ?guia=1 o window.__ENVIVO_GUIA)
    let forzar = !!root.__ENVIVO_GUIA;
    try { forzar = forzar || /[?&]guia=1\b/.test(location.search || ''); } catch (e) { /* nada */ }
    try { if (root.navigator && root.navigator.webdriver && !forzar) return false; } catch (e) { /* nada */ }
    if (!s || !s.stats) return false;
    // Jugador que ya jugó: nunca (y queda marcado para no mostrarla en una partida nueva)
    if (s.stats.events > 0 || s.storyDone || (s.chapter || 0) > 0) { lsSet(KEY, '1'); return false; }
    return s.day === 1;
  }

  function iniciar(c) {
    try {
      if (el) return true;
      ctx = c || ctx || {};
      const s = estadoJuego();
      if (!puedeEmpezar(s)) return false;
      if (!document.body) return false;
      S0 = s; inicio = Date.now(); fin = false; paso = null; ultimoPaso = null; desplazado = null; perdidoDesde = 0;
      montar();
      textoBurbuja('clientes');
      obs = new MutationObserver((muts) => {
        for (let i = 0; i < muts.length; i++) { if (!el || !el.contains(muts[i].target)) { pedir(); return; } }
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
      root.addEventListener('scroll', alMover, true);
      root.addEventListener('resize', alMover);
      timer = setInterval(tick, 400);
      tick();
      return true;
    } catch (e) { cerrarPorError(e); return false; }
  }
  function cerrar() {
    clearInterval(timer); timer = null;
    clearTimeout(finT); finT = null;
    if (obs) { try { obs.disconnect(); } catch (e) { /* nada */ } obs = null; }
    try { root.removeEventListener('scroll', alMover, true); root.removeEventListener('resize', alMover); } catch (e) { /* nada */ }
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null; target = null; paso = null; tip = null; visible = false;
  }
  function terminar() { lsSet(KEY, '1'); cerrar(); }
  function cerrarPorError(e) {
    try { if (root.console) console.warn('[guia]', e); } catch (x) { /* nada */ }
    terminar();
  }

  root.Guia = {
    iniciar,
    terminar,
    activa: () => !!el,
    estado: () => ({ activa: !!el, paso: el ? (fin ? 'fin' : paso) : null, x: tip ? tip.x : null, y: tip ? tip.y : null, visible }),
    olvidar: () => { try { root.localStorage.removeItem(KEY); } catch (e) { /* nada */ } },
    TEXTOS,
    KEY,
  };
  // ui.js llamó antes de que este archivo cargara (script con defer): se arranca ahora
  try { if (root.__guiaCtx) { const c = root.__guiaCtx; root.__guiaCtx = null; iniciar(c); } } catch (e) { /* nada */ }
})(typeof window !== 'undefined' ? window : globalThis);
