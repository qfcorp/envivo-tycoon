/* =========================================================
   EN VIVO Tycoon — /aliados.html (Productores Aliados): manda la postulación a POST /api/aliados/postular
   (server/src/Aliados.php). Sin cuenta. El campo escondido "al-sitio" es una trampa para robots.
   ========================================================= */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const form = $('al-form');
  if (!form) return;
  const val = (id) => (($(id) || {}).value || '').trim();
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('al-error'), btn = $('al-enviar');
    err.textContent = '';
    if (!form.reportValidity()) return;
    btn.disabled = true;
    try {
      const r = await fetch('/api/aliados/postular', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' },
        body: JSON.stringify({ nombre: val('al-nombre'), correo: val('al-correo'), redes: val('al-redes'), pais: val('al-pais'), mensaje: val('al-mensaje'), sitio: val('al-sitio') }),
      });
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      if (!r.ok || !j || j.ok === false) throw new Error((j && j.error) || 'No se pudo enviar. Intenta de nuevo en unos minutos.');
      form.hidden = true;
      $('al-ok').hidden = false;
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  });
})();
