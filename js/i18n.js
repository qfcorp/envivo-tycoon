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
   - Textos del juego (TEXTOS de js/datos.js): cada idioma vive en js/lang/juego/<código>.js y se
     registra con I18N.registrarJuego(código, dict) (o en window.I18N_JUEGO[código] si carga antes).
     I18N.juego(clave, params) → texto traducido con {parámetros} y plurales, o null en español o si
     falta la clave (así la lógica usa el español). Uso: Game.setTraductor(I18N.juego), y otra vez
     después de cada cambio de idioma para que se rearmen los nombres.
   - Carga perezosa: la página solo trae js/lang/es.js. I18N.setIdioma('de') carga con <script>
     js/lang/de.js y js/lang/juego/de.js y recién cuando terminan (bien o mal) cambia el idioma y
     avisa a onChange; si el diccionario de la interfaz no llegó, se queda en español. Al arrancar,
     si el idioma guardado/detectado no es español, se muestra español y se avisa cuando llega.
     Si los diccionarios ya están (build de un solo archivo, pruebas), no se descarga nada.
     I18N.listo → Promise que se resuelve (con el código del idioma) cuando termina la última carga.
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

  const inicial = detectar();
  let cur = inicial; // en el navegador, si falta el diccionario, arranca en español (ver abajo)
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

  // Una clave puede ser { one: '…', other: '…' }: se elige la forma según { n } y el idioma
  function variante(v, p, code) {
    if (!v || typeof v !== 'object') return v;
    const n = p && p.n !== undefined ? Number(p.n) : 0;
    const cat = pluralCat(n, code);
    return hasOwn(v, cat) && v[cat] ? v[cat] : (v.other || v.one || Object.keys(v).map((k) => v[k])[0] || '');
  }

  function T(key, p) {
    let code = cur;
    let v = look(cur, key);
    if (v === undefined && cur !== BASE) { v = look(BASE, key); code = BASE; }
    if (v === undefined) return String(key);
    if (typeof v === 'object') v = variante(v, p, code);
    return fill(String(v), p);
  }
  T.has = (key) => look(cur, key) !== undefined || look(BASE, key) !== undefined;

  /* ---------- Textos del juego (js/lang/juego/<código>.js) ---------- */
  const juegoDicts = () => root.I18N_JUEGO || {};
  function registrarJuego(code, dict) {
    if (!code || !dict || typeof dict !== 'object') return false;
    root.I18N_JUEGO = root.I18N_JUEGO || {};
    root.I18N_JUEGO[code] = Object.assign(root.I18N_JUEGO[code] || {}, dict);
    return true;
  }
  // null = usa el español de TEXTOS (idioma base, clave que falta o texto vacío)
  function juego(key, p) {
    if (cur === BASE) return null;
    const d = juegoDicts()[cur];
    if (!hasOwn(d, key)) return null;
    let v = d[key];
    if (v && typeof v === 'object') v = variante(v, p, cur);
    if (typeof v !== 'string' || v === '') return null;
    return fill(v, p);
  }
  juego.has = (key, code) => {
    const d = juegoDicts()[code || cur];
    return hasOwn(d, key) && !!d[key];
  };

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

  /* ---------- Carga perezosa de diccionarios ---------- */
  // Carpeta de este archivo (…/js/), para pedir lang/<código>.js aunque la página esté en otra ruta
  const RAIZ = (() => {
    try {
      const s = root.document && root.document.currentScript;
      if (s && s.src) return s.src.replace(/[^/]*$/, '');
    } catch (e) { /* sin documento */ }
    return 'js/';
  })();
  const puedeCargar = () => !!(root.document && root.document.createElement && (root.document.head || root.document.documentElement));
  const tieneUI = (c) => c === BASE || hasOwn(dicts(), c);
  const tieneJuego = (c) => c === BASE || hasOwn(juegoDicts(), c);
  const cargas = {}; // url → Promise<boolean>
  function cargarScript(url) {
    if (cargas[url]) return cargas[url];
    cargas[url] = new Promise((res) => {
      try {
        const doc = root.document;
        const s = doc.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = () => res(true);
        s.onerror = () => { delete cargas[url]; res(false); }; // se puede reintentar más tarde
        (doc.head || doc.documentElement).appendChild(s);
      } catch (e) { delete cargas[url]; res(false); }
    });
    return cargas[url];
  }
  // Trae lo que falte del idioma; resuelve true si quedó el diccionario de la interfaz
  function asegurar(c) {
    const p = [];
    if (!tieneUI(c)) p.push(cargarScript(RAIZ + 'lang/' + c + '.js'));
    if (!tieneJuego(c)) p.push(cargarScript(RAIZ + 'lang/juego/' + c + '.js'));
    return Promise.all(p).then(() => tieneUI(c));
  }

  function aplicarIdioma(c) {
    if (c === cur) return;
    cur = c;
    aplicarHtml();
    listeners.slice().forEach((fn) => { try { fn(cur); } catch (e) { if (root.console) root.console.error(e); } });
  }

  let pedido = 0; // la última petición gana
  let listo = Promise.resolve(cur);
  function cambiar(c) {
    const yo = ++pedido;
    if ((tieneUI(c) && tieneJuego(c)) || !puedeCargar()) {
      aplicarIdioma(c);
      listo = Promise.resolve(cur);
    } else {
      listo = asegurar(c).then((ok) => {
        if (yo === pedido) aplicarIdioma(ok ? c : BASE);
        return cur;
      });
    }
    return listo;
  }

  function setIdioma(code) {
    const c = info(code) ? code : mejor(code);
    if (!c) return false;
    try { if (root.localStorage) root.localStorage.setItem(KEY, c); } catch (e) { /* modo privado */ }
    cambiar(c);
    return true;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  // Arranque: si el idioma elegido aún no está cargado, se muestra español y se cambia al llegar
  if (inicial !== BASE && puedeCargar() && !(tieneUI(inicial) && tieneJuego(inicial))) {
    cur = BASE;
    cambiar(inicial);
  }
  aplicarHtml();

  const I18N = {
    idiomas: IDIOMAS,
    get idioma() { return cur; },
    get locale() { return localeOf(cur); },
    get dir() { return (info(cur) || info(BASE)).dir; },
    get listo() { return listo; },
    // Precarga sin cambiar de idioma: Promise<boolean> (true si quedó el diccionario de la interfaz)
    cargarIdioma: (code) => { const c = info(code) ? code : mejor(code); return c ? (puedeCargar() ? asegurar(c) : Promise.resolve(tieneUI(c))) : Promise.resolve(false); },
    T, TL, setIdioma, onChange, aplicar, mejor, detectar, juego, registrarJuego,
    plural: pluralCat, num, money, fecha, hora,
  };
  root.I18N = I18N;
  if (typeof module !== 'undefined' && module.exports) module.exports = I18N;
})(typeof window !== 'undefined' ? window : globalThis);
