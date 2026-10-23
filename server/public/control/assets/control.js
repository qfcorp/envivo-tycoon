// Centro de Control: confirmaciones antes de acciones delicadas, detalle de los gráficos al pasar o tocar,
// respuestas rápidas del soporte y evitar doble envío de formularios. Sin librerías (la CSP solo permite este archivo).
(() => {
  'use strict';
  document.addEventListener('submit', (ev) => {
    const f = ev.target;
    if (!(f instanceof HTMLFormElement)) return;
    const txt = f.getAttribute('data-confirmar');
    if (txt && !window.confirm(txt)) { ev.preventDefault(); return; }
    if (f.dataset.enviado === '1') { ev.preventDefault(); return; }
    if (f.method.toLowerCase() === 'post') {
      f.dataset.enviado = '1';
      f.querySelectorAll('button[type="submit"]').forEach((b) => { b.disabled = true; });
    }
  });

  // Detalle de los gráficos (data-tip): ratón y toque
  const tip = document.getElementById('tip');
  let foco = null;
  const mostrar = (el, x, y) => {
    if (!tip) return;
    if (foco && foco !== el) foco.classList.remove('foco');
    foco = el; el.classList.add('foco');
    tip.textContent = el.getAttribute('data-tip') || '';
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const izq = Math.max(8, Math.min(x + 12, window.innerWidth - r.width - 8));
    const arr = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
    tip.style.left = izq + 'px';
    tip.style.top = arr + 'px';
  };
  const ocultar = () => { if (tip) tip.hidden = true; if (foco) { foco.classList.remove('foco'); foco = null; } };
  document.addEventListener('pointermove', (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest('[data-tip]') : null;
    if (el) mostrar(el, ev.clientX, ev.clientY); else if (ev.pointerType === 'mouse') ocultar();
  });
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest('[data-tip]') : null;
    if (el) mostrar(el, ev.clientX, ev.clientY); else ocultar();
  });
  window.addEventListener('scroll', ocultar, { passive: true });

  // Respuestas rápidas del soporte
  document.addEventListener('click', (ev) => {
    const b = ev.target instanceof Element ? ev.target.closest('[data-rapida]') : null;
    if (!b) return;
    const ta = document.getElementById('respuesta');
    if (ta) { ta.value = b.getAttribute('data-rapida') || ''; ta.focus(); }
  });

})();
