/* =========================================================
   EN VIVO Tycoon — página /canjear.html (server/INTEGRAR_BUZON.md)
   Entrar con la misma cuenta del juego (/api/entrar) y canjear un código (/api/buzon/canjear, canal "web").
   El premio llega al buzón del juego. Textos: los de js/buzon.js (10 idiomas). ?codigo=XYZ lo deja escrito.
   ========================================================= */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const B = () => window.Buzon;
  const t = (k, p) => (B() ? B().t(k, p) : k);
  const IDIOMAS = [['es', 'Español'], ['en', 'English'], ['pt-BR', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['ru', 'Русский'], ['tr', 'Türkçe'], ['id', 'Bahasa Indonesia'], ['zh-CN', '简体中文']];

  async function pedir(method, ruta, body) {
    let r, j = null;
    try {
      r = await fetch(ruta, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' },
        body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { const er = new Error(t('e_red')); er.codigo = 'red'; throw er; }
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) { const er = new Error((j && j.error) || t('e_red')); er.codigo = (j && j.codigo) || null; throw er; }
    return j;
  }
  const error = (e) => { $('cj-error').textContent = e ? (B() ? B().error(e) : e.message) : ''; };
  function paso(id) { ['cj-cargando', 'cj-entrar', 'cj-canjear', 'cj-listo'].forEach((p) => { $(p).hidden = p !== id; }); }

  function textos() {
    document.documentElement.lang = B() ? B().idioma() : 'es';
    const map = { 'cj-titulo': 'w_titulo', 'cj-intro': 'w_intro', 'cj-t-cargando': 'w_cargando', 'cj-t-correo': 'w_correo', 'cj-t-clave': 'w_clave', 'cj-btn-entrar': 'w_entrar',
      'cj-t-sin-cuenta': 'w_sin_cuenta', 'cj-t-codigo': 'w_codigo', 'cj-btn-canjear': 'canjear_btn', 'cj-salir': 'w_no_soy', 'cj-t-listo': 'w_listo', 'cj-t-listo-txt': 'w_listo_txt',
      'cj-abrir': 'w_abrir', 'cj-otro': 'w_otro', 'cj-t-pie': 'w_pie', 'cj-terminos': 'w_terminos', 'cj-privacidad': 'w_privacidad' };
    Object.keys(map).forEach((id) => { const el = $(id); if (el) el.textContent = t(map[id]); });
    $('cj-codigo').placeholder = t('canjear_ph');
    document.title = t('w_titulo') + ' · EN VIVO Tycoon';
    if (estado && estado.jugador) $('cj-quien').textContent = t('w_conectado', { n: estado.jugador.nombre + ' · ' + estado.jugador.email });
  }

  let estado = null;
  async function revisar() {
    paso('cj-cargando'); error(null);
    try { estado = await pedir('GET', '/api/estado'); } catch (e) { estado = null; error(e); }
    if (estado && estado.logueado) { paso('cj-canjear'); textos(); $('cj-codigo').focus(); }
    else { paso('cj-entrar'); textos(); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sel = $('cj-idioma');
    const actual = B() ? B().idioma() : 'es';
    sel.innerHTML = IDIOMAS.map(([c, n]) => `<option value="${c}"${c === actual ? ' selected' : ''}>${n}</option>`).join('');
    sel.addEventListener('change', () => { try { localStorage.setItem('envivo_lang', sel.value); } catch (e) { /* modo privado */ } textos(); });
    try { const c = new URLSearchParams(location.search).get('codigo'); if (c) $('cj-codigo').value = c.replace(/[^A-Za-z0-9\-\s]/g, '').slice(0, 40); } catch (e) { /* nada */ }
    textos();

    $('cj-form-entrar').addEventListener('submit', async (ev) => {
      ev.preventDefault(); error(null);
      const b = $('cj-btn-entrar'); b.disabled = true;
      try { estado = await pedir('POST', '/api/entrar', { email: $('cj-email').value.trim(), clave: $('cj-clave').value }); $('cj-clave').value = ''; paso('cj-canjear'); textos(); $('cj-codigo').focus(); }
      catch (e) { error(e); }
      b.disabled = false;
    });
    $('cj-form-canjear').addEventListener('submit', async (ev) => {
      ev.preventDefault(); error(null);
      const b = $('cj-btn-canjear'); b.disabled = true;
      try {
        const r = await pedir('POST', '/api/buzon/canjear', { codigo: $('cj-codigo').value, canal: 'web' });
        const adj = (r.mensaje && r.mensaje.adjuntos) || [];
        $('cj-premios').innerHTML = '';
        adj.forEach((a) => { const li = document.createElement('li'); li.textContent = B() ? B().nombreAdjunto(a, null) : a.nombre; $('cj-premios').appendChild(li); });
        $('cj-codigo').value = '';
        paso('cj-listo');
      } catch (e) {
        error(e);
        if (e.codigo === 'sesion_requerida') { estado = null; paso('cj-entrar'); }
      }
      b.disabled = false;
    });
    $('cj-salir').addEventListener('click', async () => { try { await pedir('POST', '/api/salir', {}); } catch (e) { /* nada */ } estado = null; paso('cj-entrar'); textos(); });
    $('cj-otro').addEventListener('click', () => { paso('cj-canjear'); $('cj-codigo').focus(); });
    revisar();
  });
})();
