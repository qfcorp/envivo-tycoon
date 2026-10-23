/* =========================================================
   EN VIVO Tycoon — Idiomas (motor de traducción)
   - Cada idioma vive en js/lang/<código>.js y se registra en window.I18N_LANG[código].
   - I18N.T('clave', { n: 3, nombre: 'Ana' })  → texto con {parámetros} y plurales
     (una clave puede ser { one: '…', other: '…' }; se elige con Intl.PluralRules usando { n }).
   - I18N.TL('texto en español de la lógica') → busca en la sección `logica` del idioma;
     si no hay traducción, devuelve el mismo texto (así la lógica se puede traducir después).
   - Respaldo: idioma actual → español → la clave.
   - Formatos con Intl: I18N.money(), I18N.num(), I18N.fecha(), I18N.hora().
   - I18N.setIdioma('de') guarda la elección (localStorage 'envivo_lang') y avisa a quien
     se haya suscrito con I18N.onChange(fn) para volver a pintar todo.
   ========================================================= */
(function (root) {
  'use strict';

  const IDIOMAS = [
    { code: 'es', nombre: 'Español', dir: 'ltr', locale: 'es-EC' },
    { code: 'en', nombre: 'English', dir: 'ltr', locale: 'en-US' },
    { code: 'pt-BR', nombre: 'Português (Brasil)', dir: 'ltr', locale: 'pt-BR' },
    { code: 'fr', nombre: 'Français', dir: 'ltr', locale: 'fr-FR' },
    { code: 'de', nombre: 'Deutsch', dir: 'ltr', locale: 'de-DE' },
    { code: 'it', nombre: 'Italiano', dir: 'ltr', locale: 'it-IT' },
    { code: 'ru', nombre: 'Русский', dir: 'ltr', locale: 'ru-RU' },
    { code: 'tr', nombre: 'Türkçe', dir: 'ltr', locale: 'tr-TR' },
    { code: 'id', nombre: 'Bahasa Indonesia', dir: 'ltr', locale: 'id-ID' },
    { code: 'zh-CN', nombre: '简体中文', dir: 'ltr', locale: 'zh-CN' },
    // Para agregar un idioma de derecha a izquierda (árabe…): { code: 'ar', nombre: 'العربية', dir: 'rtl', locale: 'ar-u-nu-latn' } y js/lang/ar.js
  ];
  const KEY = 'envivo_lang';
  const BASE = 'es';
  const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const dicts = () => root.I18N_LANG || {};
  const info = (code) => IDIOMAS.find((x) => x.code === code) || null;

  // Mejor idioma disponible para una etiqueta del navegador ('pt-PT' → 'pt-BR', 'zh-TW' → 'zh-CN')
  function mejor(tag) {
    if (!tag) return null;
    const t = String(tag).toLowerCase().replace('_', '-');
    const exacto = IDIOMAS.find((x) => x.code.toLowerCase() === t);
    if (exacto) return exacto.code;
    const base = t.split('-')[0];
    const parecido = IDIOMAS.find((x) => x.code.toLowerCase().split('-')[0] === base);
    return parecido ? parecido.code : null;
  }

  function detectar() {
    // 1) ?lang=de en la dirección (útil para compartir o probar)
    try {
      const m = root.location && /[?&]lang=([\w-]+)/.exec(root.location.search || '');
      if (m && mejor(m[1])) return mejor(m[1]);
    } catch (e) { /* sin dirección */ }
    // 2) lo que eligió antes
    try {
      const g = root.localStorage && root.localStorage.getItem(KEY);
      if (g && info(g)) return g;
    } catch (e) { /* modo privado */ }
    // 3) idioma del navegador
    try {
      const nav = root.navigator;
      const lista = nav ? (nav.languages && nav.languages.length ? nav.languages : [nav.language]) : [];
      for (const l of lista) { const c = mejor(l); if (c) return c; }
    } catch (e) { /* nada */ }
    return BASE;
  }

  let cur = detectar();
  const listeners = [];
  const cache = { plural: {}, num: {}, money: {} };
  const localeOf = (code) => (info(code) || info(BASE)).locale;

  function pluralCat(n, code) {
    const loc = localeOf(code || cur);
    try {
      if (!cache.plural[loc]) cache.plural[loc] = new Intl.PluralRules(loc);
      return cache.plural[loc].select(Number(n) || 0);
    } catch (e) { return Number(n) === 1 ? 'one' : 'other'; }
  }

  function num(n, opts) {
    const v = Number(n || 0);
    const loc = localeOf(cur);
    try {
      if (opts) return new Intl.NumberFormat(loc, opts).format(v);
      if (!cache.num[loc]) cache.num[loc] = new Intl.NumberFormat(loc);
      return cache.num[loc].format(v);
    } catch (e) { return String(v); }
  }

  // Dinero del juego (dólares). Por defecto sin centavos: igual que antes en español ("$1.500").
  function money(n, opts) {
    const dec = opts && opts.dec ? opts.dec : 0;
    const v = dec ? Number(n || 0) : (Math.round(Number(n || 0)) || 0);
    const loc = localeOf(cur);
    const k = loc + '|' + dec;
    try {
      if (!cache.money[k]) {
        cache.money[k] = new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: dec, maximumFractionDigits: dec });
      }
      return cache.money[k].format(v);
    } catch (e) { return '$' + v.toFixed(dec); }
  }

  function fecha(d, opts) {
    try { return new Date(d).toLocaleDateString(localeOf(cur), opts || { day: 'numeric', month: 'long' }); } catch (e) { return ''; }
  }
  function hora(d) {
    try { return new Date(d).toLocaleTimeString(localeOf(cur), { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }

  function look(code, key) {
    const d = dicts()[code];
    if (key === 'logica' || !hasOwn(d, key)) return undefined;
    const v = d[key];
    if (v === '' || v === null || v === undefined) return undefined;
    return v;
  }

  function fill(s, p) {
    if (!p) return s;
    return s.replace(/\{(\w+)\}/g, (m, x) => {
      if (!hasOwn(p, x) || p[x] === undefined || p[x] === null) return m;
      return typeof p[x] === 'number' ? num(p[x]) : String(p[x]);
    });
  }

  function T(key, p) {
    let code = cur;
    let v = look(cur, key);
    if (v === undefined && cur !== BASE) { v = look(BASE, key); code = BASE; }
    if (v === undefined) return String(key);
    if (typeof v === 'object') {
      const n = p && p.n !== undefined ? Number(p.n) : 0;
      const cat = pluralCat(n, code);
      v = hasOwn(v, cat) && v[cat] ? v[cat] : (v.other || v.one || Object.keys(v).map((k) => v[k])[0] || '');
    }
    return fill(String(v), p);
  }
  T.has = (key) => look(cur, key) !== undefined || look(BASE, key) !== undefined;

  // Textos que vienen de la lógica del juego o del servidor (en español)
  function TL(text) {
    if (typeof text !== 'string' || !text) return text === undefined || text === null ? '' : text;
    if (cur === BASE) return text;
    const d = dicts()[cur];
    const L = d && d.logica;
    if (!L) return text;
    if (hasOwn(L, text) && L[text]) return L[text];
    // "Dron 4K #0007" → traduce el nombre y deja el número de serie
    const m = /^(.*\S)(\s+#\d+)$/.exec(text);
    if (m && hasOwn(L, m[1]) && L[m[1]]) return L[m[1]] + m[2];
    return text;
  }

  function aplicarHtml() {
    try {
      const doc = root.document;
      if (!doc || !doc.documentElement) return;
      const i = info(cur) || info(BASE);
      doc.documentElement.setAttribute('lang', i.code);
      doc.documentElement.setAttribute('dir', i.dir);
    } catch (e) { /* sin documento */ }
  }

  // Textos fijos del HTML: data-i18n (texto), data-i18n-aria (aria-label), data-i18n-ph (placeholder), data-i18n-title
  function aplicar(el) {
    const base = el || root.document;
    if (!base || !base.querySelectorAll) return;
    base.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = T(n.getAttribute('data-i18n')); });
    base.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', T(n.getAttribute('data-i18n-aria'))); });
    base.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.setAttribute('placeholder', T(n.getAttribute('data-i18n-ph'))); });
    base.querySelectorAll('[data-i18n-title]').forEach((n) => { n.setAttribute('title', T(n.getAttribute('data-i18n-title'))); });
  }

  function setIdioma(code) {
    const c = info(code) ? code : mejor(code);
    if (!c) return false;
    try { if (root.localStorage) root.localStorage.setItem(KEY, c); } catch (e) { /* modo privado */ }
    if (c === cur) return true;
    cur = c;
    aplicarHtml();
    listeners.slice().forEach((fn) => { try { fn(cur); } catch (e) { if (root.console) root.console.error(e); } });
    return true;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  aplicarHtml();

  const I18N = {
    idiomas: IDIOMAS,
    get idioma() { return cur; },
    get locale() { return localeOf(cur); },
    get dir() { return (info(cur) || info(BASE)).dir; },
    T, TL, setIdioma, onChange, aplicar, mejor, detectar,
    plural: pluralCat, num, money, fecha, hora,
  };
  root.I18N = I18N;
  if (typeof module !== 'undefined' && module.exports) module.exports = I18N;
})(typeof window !== 'undefined' ? window : globalThis);
