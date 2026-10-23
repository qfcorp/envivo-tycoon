/* =========================================================
   EN VIVO Tycoon — Escena animada del evento en vivo (franja de arriba)
   Una franja chica que se mueve mientras transmites: el lugar del evento (misa, boda, graduación, fútbol de barrio,
   fútbol profesional / final, box, lucha libre, concierto, rueda de prensa, lanzamiento, lanzamiento de autos,
   funeral, transmisión en la calle, internacional), el público que se mueve, dos camarógrafos que panean con su luz
   de tally, y el monitor de programa (PGM) con el "EN VIVO", el reloj corriendo y los cortes entre cámara 1 y 2.
   Reacciona: con un imprevisto avisa (la cámara se pone roja, el monitor parpadea); después de elegir, un pulso
   verde (bien) o rojo (mal).

   Escena.html(contrato, estado) → html para poner arriba de la ventana del evento en vivo
       estado = { fase: 'imprevisto' | 'momento' | 'bien' | 'mal' | 'neutro', clave: <clave del imprevisto>, nombre }
   Escena.reaccion(el, 'bien' | 'mal' | 'imprevisto' | 'momento', clave) → repite la reacción en una franja ya puesta
   Escena.tipo(contrato | tipo) → la escena que se dibuja ('misa', 'ligapro', 'concierto'…)

   Todo con SVG + animaciones CSS (solo transform y opacity). Con prefers-reduced-motion queda quieta (y el reloj
   no corre). Pone su propio CSS (<style id="escena-css">). Sin dependencias (usa window.Art.icon si está).
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------- Textos (10 idiomas) ---------- */
  const TEXTOS = {
    es: { aria: 'Escena en vivo', en_vivo: 'EN VIVO', imprevisto: '¡Imprevisto!', momento: '¡Momentazo!', bien: '¡Bien resuelto!', mal: 'Salió mal', sin_senal: 'SIN SEÑAL' },
    en: { aria: 'Live scene', en_vivo: 'LIVE', imprevisto: 'Trouble!', momento: 'Big moment!', bien: 'Nicely done!', mal: 'That went wrong', sin_senal: 'NO SIGNAL' },
    'pt-BR': { aria: 'Cena ao vivo', en_vivo: 'AO VIVO', imprevisto: 'Imprevisto!', momento: 'Momentaço!', bien: 'Bem resolvido!', mal: 'Deu errado', sin_senal: 'SEM SINAL' },
    fr: { aria: 'Scène en direct', en_vivo: 'DIRECT', imprevisto: 'Imprévu !', momento: 'Grand moment !', bien: 'Bien joué !', mal: 'Raté', sin_senal: 'PAS DE SIGNAL' },
    de: { aria: 'Live-Szene', en_vivo: 'LIVE', imprevisto: 'Panne!', momento: 'Großer Moment!', bien: 'Gut gelöst!', mal: 'Ging schief', sin_senal: 'KEIN SIGNAL' },
    it: { aria: 'Scena in diretta', en_vivo: 'DIRETTA', imprevisto: 'Imprevisto!', momento: 'Momentone!', bien: 'Ben risolto!', mal: 'È andata male', sin_senal: 'NESSUN SEGNALE' },
    ru: { aria: 'Сцена в эфире', en_vivo: 'ЭФИР', imprevisto: 'ЧП!', momento: 'Крутой момент!', bien: 'Отлично!', mal: 'Не вышло', sin_senal: 'НЕТ СИГНАЛА' },
    tr: { aria: 'Canlı sahne', en_vivo: 'CANLI', imprevisto: 'Aksilik!', momento: 'Büyük an!', bien: 'İyi çözüldü!', mal: 'Kötü gitti', sin_senal: 'SİNYAL YOK' },
    id: { aria: 'Adegan langsung', en_vivo: 'LIVE', imprevisto: 'Gangguan!', momento: 'Momen besar!', bien: 'Beres!', mal: 'Gagal', sin_senal: 'TANPA SINYAL' },
    'zh-CN': { aria: '直播现场', en_vivo: '直播', imprevisto: '突发状况！', momento: '高光时刻！', bien: '处理得好！', mal: '搞砸了', sin_senal: '无信号' },
  };
  const idioma = () => {
    try { const i = root.I18N && root.I18N.idioma; if (i && TEXTOS[i]) return i; const b = String(i || '').split('-')[0]; if (TEXTOS[b]) return b; } catch (e) { /* abajo */ }
    return 'es';
  };
  const tx = (k) => (TEXTOS[idioma()] || TEXTOS.es)[k] || TEXTOS.es[k] || k;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const doc = () => (root.document && root.document.createElement ? root.document : null);
  const reduce = () => { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  /* ---------- Qué escena va con cada tipo de evento ---------- */
  const FUTBOL = ['barrial', 'ligapro', 'final', 'internacional'];
  const BASE = ['misa', 'boda', 'prensa', 'graduacion', 'lanzamiento', 'concierto', 'barrial', 'ligapro', 'final', 'boxeo', 'lucha', 'funeral', 'autos', 'irl', 'internacional'];
  function tipo(c) {
    const t0 = c && typeof c === 'object' ? c.type : c;
    let t = String(t0 || '').toLowerCase();
    // Tipos de extensiones (temporadas): dicen qué escena base usan
    try { const G = root.Game; const d = G && G.EVENT_TYPES && G.EVENT_TYPES[t0]; if (d && d.escena) t = String(d.escena).toLowerCase(); } catch (e) { /* abajo */ }
    if (t === 'internacional_unilateral') return 'internacional';
    if (t === 'internacional_host') return 'final';
    if (t === 'lanzamiento_autos') return 'autos';
    if (BASE.includes(t)) return t;
    if (/box/.test(t)) return 'boxeo';
    if (/lucha|wrestl/.test(t)) return 'lucha';
    if (/funeral|velorio|sepelio|difunt/.test(t)) return 'funeral';
    if (/auto|carro|vehic|concesion/.test(t)) return 'autos';
    if (/irl|influ|calle|vlog|tiktok/.test(t)) return 'irl';
    if (/final/.test(t)) return 'final';
    if (/futbol|partido|liga|copa|torneo|campeonato/.test(t)) return 'ligapro';
    if (/concierto|festival|show|musica/.test(t)) return 'concierto';
    if (/iglesia|ceremonia|bautizo|comunion|misa/.test(t)) return 'misa';
    if (/matrimonio|boda|quince/.test(t)) return 'boda';
    if (/grad/.test(t)) return 'graduacion';
    if (/lanza/.test(t)) return 'lanzamiento';
    return 'prensa';
  }

  /* ---------- Piezas de dibujo (coordenadas: x -120..360, y 0..80; el centro de la acción es x=120) ---------- */
  const W0 = -120, WW = 480;
  const pick = (a, i) => a[((i % a.length) + a.length) % a.length];
  const rnd = (seed) => { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; };
  const d = (s) => (s ? ` style="animation-delay:${s}s"` : '');
  const dur = (a, s) => ` style="animation-duration:${a}s${s ? `;animation-delay:${s}s` : ''}"`;
  // Persona de pie: pies en (x, y), unos 25 de alto
  function fig(x, y, o) {
    o = o || {};
    const k = o.k || 1, body = o.body || '#2f4f7a', skin = o.skin || '#c98a5e', legs = o.legs || '#14171d';
    return `<g transform="translate(${x} ${y}) scale(${o.flip ? -k : k} ${k})">
      ${o.noLegs ? '' : `<path d="M-2.4 -8.5v8.5M2.4 -8.5v8.5" stroke="${legs}" stroke-width="2.6" stroke-linecap="round"/>`}
      ${o.dress ? `<path d="M-4.6 -17.5q4.6-2.4 9.2 0l4.4 17.5h-18z" fill="${body}"/>` : `<path d="M-5 -17.5q5-2.6 10 0l1 10h-12z" fill="${body}"/>`}
      ${o.arms != null ? o.arms : `<path d="M-5 -16l-2.2 7.5M5 -16l2.2 7.5" stroke="${body}" stroke-width="2.3" stroke-linecap="round"/>`}
      <circle cx="0" cy="-21.6" r="3.5" fill="${skin}"/>${o.hair ? `<path d="M-3.6 -22.4a3.6 3.6 0 0 1 7.2 0q-3.6-2-7.2 0z" fill="${o.hair}"/>` : ''}${o.extra || ''}</g>`;
  }
  const PIEL = ['#c98a5e', '#b97f55', '#e2b48f', '#8a5a3a', '#d9a679'];
  // Haz de luz desde (0,0) hacia abajo
  const haz = (len, ancho, col, op) => `<path d="M0 0L${-ancho} ${len}H${ancho}z" fill="${col}" opacity="${op}"/>`;
  const llama = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k || 1})"><circle r="5" fill="#ffd27a" opacity=".16"/><g class="esc-flick"><path d="M0 -4.4q2.4 2.6 0 4.4q-2.4-1.8 0-4.4z" fill="#ffd27a"/><path d="M0 -2.4q1 1.4 0 2.4q-1-1 0-2.4z" fill="#fff6d8"/></g></g>`;
  const cielo = (u, a, b) => `<linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const fondo = (u) => `<rect x="${W0}" y="-20" width="${WW}" height="120" fill="url(#${u}g)"/>`;
  const piso = (y, col) => `<rect x="${W0}" y="${y}" width="${WW}" height="${100 - y}" fill="${col}"/>`;
  const repetir = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');

  /* ---------- Las escenas: { defs, fondo + acción, foco [x, y] para el plano cerrado del monitor } ---------- */
  function cancha(u, kind) {
    const final = kind === 'final', barrio = kind === 'barrial';
    const r = rnd(kind);
    let s = '';
    if (barrio) {
      s += `${fondo(u)}<path d="M-120 40L-60 26 0 34 60 22 130 32 200 20 260 30 360 24V48H-120z" fill="#1a2238"/>`
        + repetir(9, (i) => { const x = -100 + i * 52 + (i % 2) * 9, h = 9 + (i % 3) * 3; return `<rect x="${x}" y="${44 - h}" width="15" height="${h}" fill="#232c40"/><rect x="${x + 4}" y="${46 - h}" width="3" height="3" fill="#ffd27a" class="${i % 2 ? 'esc-tw' : ''}"${d(i * 0.7)}/>`; })
        + `<path d="M-120 47h480" stroke="#4a5263" stroke-width=".8"/><path d="${repetir(25, (i) => `M${-120 + i * 20} 41v6`)}" stroke="#4a5263" stroke-width=".7"/>`
        + `<rect x="-120" y="47" width="480" height="53" fill="#365a2c"/><ellipse cx="80" cy="66" rx="30" ry="5" fill="#7a6a3a" opacity=".45"/><ellipse cx="170" cy="58" rx="22" ry="3.5" fill="#7a6a3a" opacity=".4"/>`
        + `<path d="M-120 60h480M120 47v40" stroke="#e9edf5" stroke-opacity=".28" stroke-width=".9"/>`
        + `<g transform="translate(206 47)"><path d="M0 0V-12H22V0" stroke="#e9edf5" stroke-width="1.4" fill="none"/><path d="M1 -11l20 0M2 -8h18M2 -5h18M2 -2h18" stroke="#e9edf5" stroke-opacity=".25" stroke-width=".5"/></g>`
        + [-14, 248].map((x) => `<path d="M${x} 46V6" stroke="#3a4150" stroke-width="1.6"/><rect x="${x - 6}" y="3" width="12" height="5" rx="1" fill="#232833"/><path d="M${x - 5} 5h10" stroke="#fffbe0" stroke-width="1.6"/><g transform="translate(${x} 8)" class="esc-glow">${haz(44, 26, '#fffbe0', 0.07)}</g>`).join('');
    } else {
      const cols = final ? ['#ffd34d', '#d42a30', '#e9edf5', '#4da3ff'] : ['#d42a30', '#e9edf5', '#4da3ff', '#ffb020', '#2ecc71'];
      s += `${fondo(u)}<path d="M-120 40V14L-40 6H280L360 14V40z" fill="#141a26"/><path d="M-120 14L-40 6H280L360 14" stroke="#3a4354" stroke-width="1.2" fill="none"/>`
        + repetir(3, (g) => `<g class="esc-tw"${dur(2.4 + g * 0.7, g * 0.6)}>${repetir(70, (i) => { const x = -118 + r() * 476, y = 10 + r() * 28; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.8 + r() * 0.5).toFixed(2)}" fill="${pick(cols, i + g)}" opacity="${(0.45 + r() * 0.4).toFixed(2)}"/>`; })}</g>`)
        + `<clipPath id="${u}led"><rect x="-120" y="38" width="480" height="5"/></clipPath><rect x="-120" y="38" width="480" height="5" fill="#0b0f18"/>`
        + `<g clip-path="url(#${u}led)"><g class="esc-led">${repetir(16, (i) => `<rect x="${-180 + i * 40}" y="38.6" width="34" height="3.8" rx=".6" fill="${pick(final ? ['#d9b44a', '#1d3b5e', '#d42a30', '#1d3b5e'] : ['#d42a30', '#1d3b5e', '#d98a10', '#1d8a4c'], i)}"/>`)}</g></g>`
        + `<path d="M-120 43h480V100H-120z" fill="url(#${u}t)"/><path d="${repetir(12, (i) => `M${-120 + i * 40} 43h20V100h-20z`)}" fill="#fff" opacity=".04"/>`
        + `<g stroke="#e9edf5" stroke-opacity=".5" stroke-width=".9" fill="none"><path d="M-120 44h480M120 43v57"/><ellipse cx="120" cy="64" rx="22" ry="6"/></g>`
        + [-20, 260].map((x, i) => `<path d="M${x} 38V2" stroke="#3a4150" stroke-width="2"/><rect x="${x - 9}" y="-3" width="18" height="7" rx="1" fill="#232833"/><path d="M${x - 7} -.5h14M${x - 7} 2.2h14" stroke="#fffbe0" stroke-width="1.6" stroke-dasharray="2.4 1"/><g transform="translate(${x + (i ? -4 : 4)} 4) rotate(${i ? 24 : -24})" class="esc-glow">${haz(70, 20, '#fffbe0', 0.07)}</g>`).join('');
      if (final) s += repetir(3, (i) => { const [x, y, c] = [[40, 6, '#ffd34d'], [196, 3, '#ff5a8a'], [120, -2, '#5ad1ff']][i]; return `<g transform="translate(${x} ${y})"><g class="esc-burst"${d(i * 1.1)}>${repetir(10, (k) => { const a = k * Math.PI / 5; return `<path d="M${(Math.cos(a) * 3).toFixed(1)} ${(Math.sin(a) * 3).toFixed(1)}L${(Math.cos(a) * 9).toFixed(1)} ${(Math.sin(a) * 9).toFixed(1)}" stroke="${c}" stroke-width="1.2" stroke-linecap="round"/>`; })}</g></g>`; });
    }
    // Jugadores y la pelota: se pasan la pelota entre dos, los demás corren
    const eq = barrio ? ['#d42a30', '#2f6fb3'] : final ? ['#e9edf5', '#d9b44a'] : ['#d42a30', '#e9edf5'];
    const jug = (x, y, t, k, cls, st) => `<g transform="translate(${x} ${y})"><g class="${cls}"${st || ''}><g class="esc-bob"${dur(0.5, (x % 5) * 0.1)}>${fig(0, 0, { k, body: eq[t], legs: t ? '#1d2a44' : '#f2f2f2', skin: pick(PIEL, x), arms: `<path d="M-5 -16l-3 6M5 -16l3 6" stroke="${eq[t]}" stroke-width="2.2" stroke-linecap="round"/>` })}</g></g></g>`;
    s += `<ellipse cx="120" cy="66" rx="70" ry="10" fill="#fffbe0" opacity=".05"/>`
      + jug(58, 56, 1, 0.62, 'esc-run', dur(4.2, -1)) + jug(178, 54, 0, 0.58, 'esc-run', dur(3.6, -2))
      + jug(96, 66, 0, 0.78, 'esc-run2', dur(3, 0)) + jug(146, 64, 1, 0.76, 'esc-run2', dur(3, -1.5))
      + `<g transform="translate(101 65)"><g class="esc-pase"><ellipse cx="0" cy="1.6" rx="2.2" ry=".7" fill="#000" opacity=".35"/><g class="esc-ball-y"><circle r="1.9" fill="#fff"/><path d="M-1 -.6l1-.8 1 .8-.4 1.1h-1.2z" fill="#14171d"/></g></g></g>`;
    const defs = `${barrio ? cielo(u, '#141b33', '#4a3550') : cielo(u, '#03060d', '#121c34')}<linearGradient id="${u}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17532d"/><stop offset="1" stop-color="#2f9150"/></linearGradient>`;
    return { defs, svg: s, foco: [122, 54] };
  }

  const ESCENAS = {
    misa(u) {
      const win = (x, w, h, k) => `<g transform="translate(${x} 42)"><path d="M${-w / 2} 0V${-h + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V0z" fill="#0d0b12"/><g opacity=".85"><path d="M${-w / 2 + 1.5} -1V${-h + w / 2}a${w / 2 - 1.5} ${w / 2 - 1.5} 0 0 1 ${w / 2 - 1.5} ${-(w / 2 - 1.5)}V-1z" fill="${pick(['#2f6fb3', '#7a3fb0', '#b0821f', '#1d8a4c'], k)}"/><path d="M0 -1V${-h + 1.5}a${w / 2 - 1.5} ${w / 2 - 1.5} 0 0 1 ${w / 2 - 1.5} ${w / 2 - 1.5}V-1z" fill="${pick(['#7a3fb0', '#b0821f', '#1d8a4c', '#2f6fb3'], k)}"/></g><path d="M${-w / 2 + 1.5} ${-h / 2}h${w - 3}" stroke="#0d0b12" stroke-width="1.2"/></g>`;
      const svg = `${fondo(u)}<path d="M-120 44h480" stroke="#3a2c28"/>`
        + [-80, -30, 20, 60, 180, 220, 270, 320].map((x, i) => win(x, 12, 26, i)).join('')
        + `<ellipse cx="120" cy="34" rx="34" ry="26" fill="#ffd27a" opacity=".12" class="esc-glow"/>`
        + `<g transform="translate(120 42)"><path d="M-12 0V-24a12 12 0 0 1 24 0V0z" fill="#3a2e3e"/><path d="M-10 -1V-24a10 10 0 0 1 20 0V-1z" fill="#ffe9a3" opacity=".28"/><path d="M0 -31v18M-5 -25h10" stroke="#f0c24a" stroke-width="2.4" stroke-linecap="round"/></g>`
        + piso(44, '#2a2018')
        + `<g transform="translate(120 47)"><g class="esc-sway"${dur(5)}>${fig(0, 0, { body: '#efe9d6', skin: '#d9a679', hair: '#cfd5dd', noLegs: true, arms: '<g class="esc-arms"><path d="M-5 -16l-6 -6M5 -16l6 -6" stroke="#efe9d6" stroke-width="2.4" stroke-linecap="round"/></g>', extra: '<path d="M-2 -18v10M2 -18v10" stroke="#d9b44a" stroke-width="1.2"/>' })}</g></g>`
        + `<rect x="94" y="44" width="52" height="13" rx="1" fill="#e9e2cc"/><rect x="94" y="44" width="52" height="3" fill="#d9b44a"/><path d="M116 50h8M120 47v7" stroke="#d9b44a" stroke-width="1.4"/>`
        + `<rect x="99" y="36" width="2.4" height="8" fill="#f4f1d0"/><rect x="138.6" y="36" width="2.4" height="8" fill="#f4f1d0"/>${llama(100.2, 35.6)}${llama(139.8, 35.6)}`;
      return { defs: cielo(u, '#1b1626', '#2e2335'), svg, foco: [120, 40] };
    },
    funeral(u) {
      const svg = `${fondo(u)}${repetir(24, (i) => `<path d="M${-118 + i * 20} 0v46" stroke="#232838" stroke-width="6" opacity=".55"/>`)}`
        + `<ellipse cx="120" cy="30" rx="60" ry="26" fill="#cfe0ff" opacity=".06" class="esc-glow"${dur(7)}/>`
        + piso(46, '#14161d')
        + `<g transform="translate(78 46)"><path d="M-4 0l4-14 4 14M0 -14v14" stroke="#5c4128" stroke-width="1"/><rect x="-7" y="-27" width="14" height="16" rx="1" fill="#d9b44a"/><rect x="-5.6" y="-25.6" width="11.2" height="13.2" fill="#2a3242"/><circle cx="0" cy="-21" r="2.6" fill="#8b95a8"/><path d="M-4 -12.8q4-5 8 0z" fill="#8b95a8"/><path d="M-7 -27l3 3M7 -27l-3 3" stroke="#14171d" stroke-width="1.2"/></g>`
        + `<g transform="translate(164 46)"><path d="M-6 0l6-12 6 12" stroke="#5c4128" stroke-width="1"/><circle cx="0" cy="-20" r="9" fill="none" stroke="#2f5a3e" stroke-width="4"/>${repetir(12, (i) => { const a = i * Math.PI / 6; return `<circle cx="${(Math.cos(a) * 9).toFixed(1)}" cy="${(-20 + Math.sin(a) * 9).toFixed(1)}" r="1.9" fill="${pick(['#f4f1f6', '#c9b6ff', '#f4f1f6', '#ffd27a'], i)}"/>`; })}<path d="M-2 -11l-3 8M2 -11l3 8" stroke="#7a3fb0" stroke-width="1.6"/></g>`
        + `<path d="M98 56v-6M142 56v-6" stroke="#2a2d35" stroke-width="2"/><rect x="92" y="40" width="56" height="11" rx="5" fill="#4a3222"/><rect x="94" y="38" width="52" height="5" rx="2.5" fill="#5c4128"/><path d="M96 40h48" stroke="#d9b44a" stroke-width=".8" opacity=".7"/>`
        + repetir(9, (i) => `<circle cx="${97 + i * 5.7}" cy="${37.5 - (i % 2)}" r="1.9" fill="${pick(['#f4f1f6', '#ffd27a', '#c9b6ff'], i)}"/>`)
        + [62, 178].map((x) => `<rect x="${x - 1.3}" y="30" width="2.6" height="16" fill="#f4f1d0"/><path d="M${x - 3} 46h6" stroke="#5c4128" stroke-width="1.4"/>${llama(x, 29.6, 1.1)}`).join('');
      return { defs: cielo(u, '#0f1219', '#1a1e28'), svg, foco: [120, 36] };
    },
    boda(u) {
      const svg = `${fondo(u)}<path d="M-120 6q60 12 120 0t120 0 120 0 120 0" stroke="#4a3d5a" fill="none" stroke-width=".7"/>`
        + repetir(24, (i) => `<circle cx="${-115 + i * 20}" cy="${8 + (i % 2) * 2.4}" r="1.4" fill="${pick(['#ffe9a3', '#fff6d8'], i)}" class="esc-tw"${dur(1.8 + (i % 3) * 0.5, (i % 5) * 0.3)}/>`)
        + piso(50, '#2f2430') + `<path d="M60 100L100 50h40l40 50z" fill="#efe9d6" opacity=".12"/>`
        + `<g transform="translate(120 52)"><path d="M-24 0V-24a24 24 0 0 1 48 0V0" stroke="#e8dcc4" stroke-width="2" fill="none"/>${repetir(15, (i) => { const a = Math.PI + i * Math.PI / 14; return `<circle cx="${(Math.cos(a) * 24).toFixed(1)}" cy="${(-24 + Math.sin(a) * 24).toFixed(1)}" r="${i % 2 ? 2.2 : 2.8}" fill="${pick(['#ff8fb1', '#f4f1f6', '#ffd27a', '#f4f1f6'], i)}"/>`; })}${repetir(4, (i) => `<circle cx="${i < 2 ? -24 : 24}" cy="${-4 - (i % 2) * 8}" r="2.4" fill="${pick(['#ff8fb1', '#f4f1f6'], i)}"/>`)}</g>`
        + `<g transform="translate(112 52)"><g class="esc-sway"${dur(4)}>${fig(0, 0, { body: '#1c2230', skin: '#c98a5e', hair: '#2b1e16', extra: '<path d="M-1.6 -17.6l1.6 5 1.6-5" fill="#f2f2f2"/><path d="M-.8 -16.8h1.6" stroke="#d42a30" stroke-width="1"/>' })}</g></g>`
        + `<g transform="translate(128 52)"><g class="esc-sway2"${dur(4)}>${fig(0, 0, { dress: true, body: '#f7f4ee', skin: '#e2b48f', hair: '#5a3a22', legs: '#f7f4ee', arms: '<path d="M-4.6 -16l-3 6M4.6 -16l3 6" stroke="#f7f4ee" stroke-width="2" stroke-linecap="round"/><circle cx="-7.6" cy="-9.6" r="2.2" fill="#ff8fb1"/>', extra: '<path d="M3 -24q4 6 3 20" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" fill="none"/>' })}</g></g>`
        + repetir(4, (i) => `<g transform="translate(${112 + i * 6} 26)"><g class="esc-heart"${d(i * 0.9)}><path d="M0 1.6C-2.4-.8-4 .8-3.2 2.4l3.2 3.2 3.2-3.2C4 .8 2.4-.8 0 1.6z" fill="${pick(['#ff5a8a', '#ff8fb1'], i)}"/></g></g>`);
      return { defs: cielo(u, '#211829', '#3a2433'), svg, foco: [120, 40] };
    },
    graduacion(u) {
      const svg = `${fondo(u)}<rect x="40" y="4" width="160" height="12" rx="1.5" fill="#1d3b5e"/><path d="M40 16l8 5 8-5M184 16l8 5 8-5" fill="#1d3b5e"/>${repetir(9, (i) => `<path transform="translate(${56 + i * 16} 10)" d="M0-3l.9 2h2.2l-1.8 1.3.7 2.1L0 1.1-2 2.4l.7-2.1-1.8-1.3h2.2z" fill="#ffd34d"/>`)}`
        + `<ellipse cx="120" cy="50" rx="80" ry="10" fill="#ffd27a" opacity=".06"/>` + piso(50, '#191624') + `<rect x="${W0}" y="48" width="${WW}" height="4" fill="#2a2433"/>`
        + `<g transform="translate(170 50)"><path d="M-7 0l2-14h10l2 14z" fill="#5a4030"/><rect x="-8" y="-16" width="16" height="3" rx="1" fill="#6b4a2a"/><path d="M0 -16l-2-5" stroke="#8b95a8" stroke-width=".8"/><circle cx="-2.2" cy="-21.6" r="1.2" fill="#14171d"/></g>`
        + [84, 102, 120, 138].map((x, i) => `<g transform="translate(${x} 50)"><g class="esc-bob"${dur(1.4 + i * 0.2, i * 0.3)}>${fig(0, 0, { body: '#1d2a5e', skin: pick(PIEL, i + 1), legs: '#14171d', hair: pick(['#2b1e16', '#5a3a22', '#14151a'], i), extra: i % 2 ? '' : '<path d="M-4.4 -24h8.8l-4.4-2.4z" fill="#14171d"/><path d="M4.4 -24v4" stroke="#ffd34d" stroke-width=".8"/>' })}</g></g>`).join('')
        + repetir(3, (i) => `<g transform="translate(${92 + i * 36} 26)"><g class="esc-toss"${d(i * 0.8)}><path d="M-5 0l5-2.4 5 2.4-5 2.4z" fill="#14171d"/><rect x="-2.6" y=".6" width="5.2" height="2.4" fill="#14171d"/><path d="M5 0v3.6" stroke="#ffd34d" stroke-width=".9"/></g></g>`)
        + repetir(10, (i) => `<g transform="translate(${60 + i * 13} -4)"><rect class="esc-conf" width="2" height="3" fill="${pick(['#ffd34d', '#4da3ff', '#ff5a8a', '#e9edf5'], i)}"${dur(3 + (i % 3) * 0.6, (i % 5) * 0.7)}/></g>`);
      return { defs: cielo(u, '#121a2e', '#1f2a44'), svg, foco: [114, 35] };
    },
    barrial: (u) => cancha(u, 'barrial'),
    ligapro: (u) => cancha(u, 'ligapro'),
    final: (u) => cancha(u, 'final'),
    internacional: (u) => cancha(u, 'ligapro'),
    boxeo: (u) => ring(u, false),
    lucha: (u) => ring(u, true),
    concierto(u) {
      const cols = ['#ff3b3b', '#4da3ff', '#ffb020', '#b04dff', '#2ecc71'];
      const svg = `${fondo(u)}<rect x="68" y="12" width="104" height="30" rx="1.5" fill="#0d0f14"/><g class="esc-screen"><rect x="70" y="14" width="100" height="26" fill="url(#${u}led)"/></g>`
        + `<g class="esc-screen2"><rect x="70" y="14" width="100" height="26" fill="url(#${u}led2)"/></g>${repetir(25, (i) => `<path d="M${70 + i * 4} 14v26" stroke="#000" stroke-opacity=".25" stroke-width=".6"/>`)}`
        + `<rect x="-120" y="4" width="480" height="3" fill="#2a3242"/><path d="${repetir(48, (i) => `M${-120 + i * 10} 4l5 3 5-3`)}" stroke="#4a5263" stroke-width=".5" fill="none"/>`
        + [40, 78, 104, 136, 162, 200].map((x, i) => `<g transform="translate(${x} 7)"><g class="esc-beam"${dur(3.2 + (i % 3) * 0.9, -i * 0.7)}>${haz(54, 9, pick(cols, i), 0.24)}</g><rect x="-2.2" y="-1" width="4.4" height="3.4" rx="1" fill="#14171d"/><circle cy="2.4" r="1.4" fill="${pick(cols, i)}"/></g>`).join('')
        + piso(50, '#120d1c') + `<rect x="40" y="48" width="160" height="4" fill="#2a2433"/>${repetir(16, (i) => `<circle cx="${45 + i * 10}" cy="50" r=".9" fill="${pick(cols, i)}" class="esc-tw"${dur(1.2, (i % 4) * 0.3)}/>`)}`
        + `<g transform="translate(144 48)"><circle cx="0" cy="-8" r="6" fill="#2a2d35"/><ellipse cx="0" cy="-8" rx="6" ry="2" fill="#4a5263"/><g transform="translate(-6 -16)"><g class="esc-cym"><ellipse rx="4.4" ry="1" fill="#d9b44a"/></g></g>${fig(4, -2, { k: 0.8, body: '#3a2c48', skin: '#b97f55', noLegs: true })}</g>`
        + `<g transform="translate(98 49)"><g class="esc-bob"${dur(0.9)}>${fig(0, 0, { body: '#3b2f55', skin: '#e2b48f', hair: '#14151a', arms: '<path d="M-5 -16l3 6M5 -16l-2 7" stroke="#3b2f55" stroke-width="2.2" stroke-linecap="round"/>', extra: '<path d="M-6 -6l12-6" stroke="#b0821f" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="-5" cy="-6" rx="3.4" ry="2.6" fill="#d98a10"/>' })}</g></g>`
        + `<path d="M120 49v-15" stroke="#8b95a8" stroke-width=".8"/><circle cx="120" cy="33" r="1.1" fill="#2a2d35"/>`
        + `<g transform="translate(121 49)"><g class="esc-sway"${dur(1.8)}>${fig(0, 0, { body: '#d42a30', skin: '#c98a5e', hair: '#2b1e16', arms: '<path d="M-5 -16l-1.6 -3.4M5 -16l5 -5" stroke="#d42a30" stroke-width="2.2" stroke-linecap="round"/>' })}</g></g>`;
      const defs = `${cielo(u, '#06040d', '#1a0f2a')}<linearGradient id="${u}led" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3b3b"/><stop offset=".5" stop-color="#b04dff"/><stop offset="1" stop-color="#4da3ff"/></linearGradient><linearGradient id="${u}led2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb020"/><stop offset=".5" stop-color="#ff3b8a"/><stop offset="1" stop-color="#2ecc71"/></linearGradient>`;
      return { defs, svg, foco: [116, 36] };
    },
    prensa(u) {
      const svg = `${fondo(u)}<rect x="30" y="4" width="180" height="44" fill="#16233a"/>${repetir(30, (i) => { const cx = 40 + (i % 10) * 18 + (Math.floor(i / 10) % 2) * 9, cy = 12 + Math.floor(i / 10) * 12; return `<rect x="${cx - 4}" y="${cy - 2.4}" width="8" height="4.8" rx="1.2" fill="${pick(['#4da3ff', '#ffb020'], i)}" opacity=".22"/>`; })}`
        + piso(48, '#141820')
        + [104, 136].map((x, i) => `<g transform="translate(${x} 47)"><g class="${i ? 'esc-sway' : 'esc-talk'}"${dur(i ? 6 : 1.1)}>${fig(0, 0, { body: i ? '#2a3a55' : '#3a2c48', skin: pick(PIEL, i + 2), hair: i ? '#5a3a22' : '#14151a', noLegs: true, arms: i ? '' : '<g class="esc-hand"><path d="M5 -16l5 -4" stroke="#3a2c48" stroke-width="2.2" stroke-linecap="round"/></g>' })}</g></g>`).join('')
        + `<rect x="78" y="42" width="84" height="5" fill="#2a3242"/><rect x="78" y="47" width="84" height="10" fill="#1d3b5e"/><path d="M78 47h84" stroke="#4da3ff" stroke-opacity=".5"/>`
        + repetir(5, (i) => `<path d="M${98 + i * 3} 42l${(i - 2) * 1.2} -7" stroke="#8b95a8" stroke-width=".8"/><rect x="${96.6 + i * 3 + (i - 2) * 1.2}" y="32" width="2.8" height="4" rx="1.2" fill="${pick(['#14171d', '#d42a30', '#14171d', '#4da3ff', '#ffb020'], i)}"/>`)
        + `<rect x="140" y="37" width="2.4" height="5" rx=".6" fill="#4da3ff" opacity=".8"/><rect x="146" y="38" width="2.4" height="4" rx=".6" fill="#4da3ff" opacity=".8"/>`
        + repetir(6, (i) => `<g transform="translate(${[56, 182, 82, 160, 30, 208][i]} ${[44, 40, 54, 52, 32, 30][i]})"><g class="esc-flash"${dur(2.6 + (i % 3) * 0.7, i * 0.55)}><circle r="5" fill="#fff" opacity=".35"/><path d="M-6 0h12M0 -6v12" stroke="#fff" stroke-width=".8"/><circle r="1.6" fill="#fff"/></g></g>`);
      return { defs: cielo(u, '#111622', '#1b2230'), svg, foco: [120, 35] };
    },
    lanzamiento(u) {
      const svg = `${fondo(u)}<rect x="66" y="6" width="108" height="36" rx="2" fill="#0d0f14"/><rect x="68" y="8" width="104" height="32" fill="url(#${u}scr)"/>`
        + `<circle cx="120" cy="24" r="12" fill="#4da3ff" opacity=".25" class="esc-glow"/><g transform="translate(120 24)"><g class="esc-spin3d"><rect x="-6" y="-10" width="12" height="20" rx="2.4" fill="#e9edf5"/><rect x="-4.6" y="-8" width="9.2" height="15" rx="1" fill="#1d4f86"/><circle cy="8.4" r=".9" fill="#8b95a8"/></g></g>`
        + [36, 204].map((x) => `<rect x="${x - 3}" y="6" width="6" height="42" fill="#141a26"/>${repetir(6, (i) => `<circle cx="${x}" cy="${10 + i * 6.4}" r="1.2" fill="#4da3ff" class="esc-tw"${dur(1.6, i * 0.2)}/>`)}`).join('')
        + piso(48, '#0d121e') + `<rect x="50" y="46" width="140" height="4" fill="#1e2a44"/>${repetir(14, (i) => `<circle cx="${56 + i * 10}" cy="48" r=".8" fill="#4da3ff"/>`)}`
        + `<g transform="translate(120 47)"><g class="esc-walk"><g transform="translate(0 -40)" opacity=".9">${haz(42, 14, '#fffbe0', 0.08)}</g><g class="esc-bob"${dur(0.8)}>${fig(0, 0, { body: '#14171d', skin: '#c98a5e', hair: '#2b1e16', arms: '<path d="M-5 -16l-2.2 7.5M5 -16l6 -3" stroke="#14171d" stroke-width="2.2" stroke-linecap="round"/>', extra: '<path d="M-3.4 -21q-1 3 1.6 3.6" stroke="#e9edf5" stroke-width=".6" fill="none"/>' })}</g></g></g>`;
      const defs = `${cielo(u, '#0a0f1c', '#14203a')}<linearGradient id="${u}scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2442"/><stop offset="1" stop-color="#1d4f86"/></linearGradient>`;
      return { defs, svg, foco: [120, 30] };
    },
    autos(u) {
      const car = 'M-34 0q-2-7 4-9l12-2q8-8 20-8h10q8 0 16 8l9 2q5 1 5 7v2h-76z';
      const svg = `${fondo(u)}${repetir(4, (i) => `<rect x="-120" y="${8 + i * 9}" width="480" height="1.2" fill="#4da3ff" opacity="${0.08 + i * 0.03}"/>`)}`
        + [70, 170].map((x, i) => `<g transform="translate(${x} 0)"><rect x="-4" y="-2" width="8" height="5" rx="1" fill="#232833"/><g class="esc-beam"${dur(5, -i * 2.5)}>${haz(60, 16, '#fffbe0', 0.1)}</g></g>`).join('')
        + piso(50, '#10141c') + `<path d="M-120 50h480" stroke="#2a3242"/>`
        + `<ellipse cx="120" cy="58" rx="52" ry="7" fill="#232833"/><ellipse cx="120" cy="57" rx="50" ry="6" fill="#2a3242"/><ellipse cx="120" cy="57" rx="50" ry="6" fill="none" stroke="#4da3ff" stroke-opacity=".5" stroke-width=".8"/>`
        + `<g transform="translate(120 57)"><g class="esc-dot-orbit"><circle cx="0" cy="0" r="1.2" fill="#4da3ff"/></g></g>`
        + `<clipPath id="${u}car"><path transform="translate(120 56)" d="${car}"/></clipPath>`
        + `<g transform="translate(120 56)"><ellipse cx="0" cy="1.6" rx="40" ry="2.6" fill="#000" opacity=".5"/><path d="${car}" fill="#c62f3a"/><path d="M-16 -11q8-7 18-7h8q6 0 12 7z" fill="#1d3b5e"/><path d="M4 -18v7" stroke="#c62f3a" stroke-width="1.4"/><path d="M-30 -6h70" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/><circle cx="38" cy="-6" r="1.4" fill="#fffbe0"/><circle cx="-33" cy="-5" r="1.2" fill="#ff3b3b"/>`
        + `<circle cx="-20" cy="1" r="5.4" fill="#111"/><circle cx="-20" cy="1" r="2.6" fill="#8b95a8"/><circle cx="24" cy="1" r="5.4" fill="#111"/><circle cx="24" cy="1" r="2.6" fill="#8b95a8"/></g>`
        + `<g clip-path="url(#${u}car)"><g class="esc-shine"><path d="M70 30l10 0-14 30h-10z" fill="#fff" opacity=".45"/></g></g>`
        + repetir(4, (i) => `<g transform="translate(${[48, 196, 70, 176][i]} ${[60, 58, 66, 66][i]})"><g class="esc-flash"${dur(3 + i * 0.6, i * 0.8)}><circle r="4" fill="#fff" opacity=".35"/><circle r="1.4" fill="#fff"/></g></g>`);
      return { defs: cielo(u, '#090c13', '#171c28'), svg, foco: [120, 46] };
    },
    irl(u) {
      const svg = `${fondo(u)}${repetir(12, (i) => { const x = -120 + i * 42, h = 22 + ((i * 37) % 26); return `<rect x="${x}" y="${50 - h}" width="34" height="${h}" fill="${pick(['#151c2e', '#1a2236', '#121828'], i)}"/>${repetir(6, (k) => `<rect x="${x + 5 + (k % 3) * 9}" y="${54 - h + Math.floor(k / 3) * 9}" width="4" height="4" fill="#ffd27a" opacity="${(k + i) % 3 ? 0.12 : 0.75}" class="${(k + i) % 4 ? '' : 'esc-tw'}"${dur(3, (k + i) % 5)}/>`)}`; })}`
        + piso(50, '#1a1d24') + `<rect x="${W0}" y="50" width="${WW}" height="3" fill="#2a2d35"/><g class="esc-road">${repetir(14, (i) => `<rect x="${-140 + i * 40}" y="70" width="18" height="1.6" fill="#ffd27a" opacity=".5"/>`)}</g>`
        + [58, 184].map((x) => `<path d="M${x} 52V18q0-3 4-3h6" stroke="#3a4150" stroke-width="1.6" fill="none"/><ellipse cx="${x + 10}" cy="16" rx="3" ry="1.4" fill="#fffbe0"/><g transform="translate(${x + 10} 17)" class="esc-glow">${haz(36, 12, '#fffbe0', 0.07)}</g>`).join('')
        + `<g transform="translate(150 53)"><g class="esc-cross">${fig(0, 0, { k: 0.75, body: '#2f5a3e', skin: '#8a5a3a', hair: '#14151a' })}</g></g>`
        + `<g transform="translate(120 56)"><g class="esc-bob"${dur(0.7)}>${fig(0, 0, { body: '#ff5a8a', skin: '#e2b48f', hair: '#2b1e16', arms: '<path d="M-5 -16l-2.2 7.5M5 -16l6 -9" stroke="#ff5a8a" stroke-width="2.2" stroke-linecap="round"/>', extra: '<path d="M11 -25l2 -6" stroke="#8b95a8" stroke-width=".9"/><rect x="11" y="-36" width="5" height="7.6" rx="1" fill="#14171d"/><rect x="11.8" y="-35.2" width="3.4" height="6" fill="#4da3ff" opacity=".9"/>' })}</g></g>`
        + repetir(3, (i) => `<g transform="translate(${134 + i * 4} 20)"><g class="esc-heart"${d(i * 1.1)}><path d="M0 1.6C-2.4-.8-4 .8-3.2 2.4l3.2 3.2 3.2-3.2C4 .8 2.4-.8 0 1.6z" fill="${pick(['#ff5a8a', '#4da3ff', '#ffd34d'], i)}"/></g></g>`);
      return { defs: cielo(u, '#090e1c', '#1c2338'), svg, foco: [124, 40] };
    },
  };
  function ring(u, lucha) {
    const mat = lucha ? '#d9d2bf' : '#2f5d8f', apron = lucha ? '#a5363a' : '#1d3b5e';
    const ropes = lucha ? ['#ffd34d', '#2ecc71', '#ff3b3b'] : ['#ff3b3b', '#e9edf5', '#4da3ff'];
    let s = `${fondo(u)}${repetir(2, (g) => `<g class="esc-tw"${dur(2 + g, g)}>${repetir(40, (i) => `<circle cx="${-118 + ((i * 97 + g * 31) % 476)}" cy="${30 + ((i * 13 + g * 7) % 14)}" r="1.1" fill="#8b95a8" opacity=".35"/>`)}</g>`)}`
      + `<rect x="80" y="-2" width="80" height="5" rx="1" fill="#232833"/>${repetir(5, (i) => `<circle cx="${88 + i * 16}" cy="3.4" r="1.6" fill="#fffbe0"/>`)}`
      + `<g transform="translate(120 3)" class="esc-glow">${haz(52, 38, lucha ? '#ff8fd0' : '#fffbe0', 0.09)}</g>`;
    if (lucha) s += [30, 210].map((x, i) => `<g transform="translate(${x} 0)"><g class="esc-beam"${dur(4.4, -i * 2)}>${haz(50, 10, i ? '#b04dff' : '#ff3b8a', 0.18)}</g></g>`).join('');
    s += piso(54, '#0b0c12')
      + `<path d="M40 58L62 42H178L200 58z" fill="${mat}"/><path d="M40 58h160v9H40z" fill="${apron}"/><path d="M40 58h160" stroke="#fff" stroke-opacity=".4"/><ellipse cx="120" cy="50" rx="44" ry="6" fill="#fffbe0" opacity=".12"/>`
      + [[40, 58, 18], [200, 58, 18], [62, 42, 13], [178, 42, 13]].map(([x, y, h], i) => `<rect x="${x - 1.6}" y="${y - h}" width="3.2" height="${h}" rx="1" fill="${i % 2 ? '#d42a30' : '#2f6fb3'}"/>`).join('')
      + repetir(3, (k) => { const f = 1 - k * 0.3, y1 = 58 - 16 * f, y2 = 42 - 11 * f; return `<path d="M62 ${y2}H178" stroke="${ropes[k]}" stroke-width=".9" opacity=".8"/>`; });
    // Peleadores
    const glove = lucha ? '' : '<circle cx="9" cy="-15" r="2.6" fill="#d42a30"/><circle cx="6" cy="-12" r="2.6" fill="#d42a30"/>';
    const glove2 = lucha ? '' : '<circle cx="9" cy="-15" r="2.6" fill="#2f6fb3"/><circle cx="6" cy="-12" r="2.6" fill="#2f6fb3"/>';
    const mask = (c1, c2) => `<path d="M-3.5 -22a3.5 3.5 0 0 1 7 0v1.6h-7z" fill="${c1}"/><path d="M-2.6 -22.4l1.6 1M2.6 -22.4l-1.6 1" stroke="${c2}" stroke-width=".9"/>`;
    if (lucha) {
      s += `<g transform="translate(140 55)"><g class="esc-stagger">${fig(0, 0, { k: 1.05, flip: true, body: '#2f6fb3', skin: '#b97f55', legs: '#1d2a44', extra: mask('#2ecc71', '#ffd34d'), arms: '<path d="M-5 -16l-4 5M5 -16l4 5" stroke="#b97f55" stroke-width="2.4" stroke-linecap="round"/>' })}</g></g>`
        + `<g transform="translate(70 44)"><g class="esc-jump">${fig(0, 0, { k: 1.05, body: '#d42a30', skin: '#c98a5e', legs: '#3a1d27', extra: mask('#ffd34d', '#d42a30'), arms: '<path d="M-5 -16l-5 -5M5 -16l5 -5" stroke="#c98a5e" stroke-width="2.4" stroke-linecap="round"/>' })}</g></g>`;
    } else {
      s += `<g transform="translate(106 56)"><g class="esc-bob"${dur(0.9)}>${fig(0, 0, { k: 1.05, body: '#c98a5e', skin: '#c98a5e', legs: '#14171d', arms: '<g class="esc-punch"><path d="M5 -17l4 2" stroke="#c98a5e" stroke-width="2.4" stroke-linecap="round"/><circle cx="9.6" cy="-15" r="2.7" fill="#d42a30"/></g><circle cx="6" cy="-11.6" r="2.6" fill="#d42a30"/>', extra: '<path d="M-5 -9h10v3h-10z" fill="#d42a30"/>' })}</g></g>`
        + `<g transform="translate(136 56)"><g class="esc-bob"${dur(0.9, -0.45)}>${fig(0, 0, { k: 1.05, flip: true, body: '#8a5a3a', skin: '#8a5a3a', legs: '#14171d', arms: glove2, extra: '<path d="M-5 -9h10v3h-10z" fill="#2f6fb3"/>' })}</g></g>`;
      void glove;
    }
    s += `<path d="M40 ${58 - 16}H200" stroke="${ropes[0]}" stroke-width="1.2"/><path d="M40 ${58 - 11.2}H200" stroke="${ropes[1]}" stroke-width="1.1"/><path d="M40 ${58 - 6.4}H200" stroke="${ropes[2]}" stroke-width="1"/>`
      + `<path d="M40 42L62 31M200 42L178 31" stroke="${ropes[0]}" stroke-width=".9"/>`
      + repetir(5, (i) => `<g transform="translate(${[10, 226, 30, 214, 120][i]} ${[40, 38, 50, 50, 34][i]})"><g class="esc-flash"${dur(2.4 + i * 0.5, i * 0.6)}><circle r="3.6" fill="#fff" opacity=".3"/><circle r="1.2" fill="#fff"/></g></g>`);
    return { defs: cielo(u, lucha ? '#150a14' : '#06070c', lucha ? '#2a1424' : '#131526'), svg: s, foco: [122, 42] };
  }

  /* ---------- Público, camarógrafos y extras ---------- */
  const FESTIVO = ['concierto', 'ligapro', 'final', 'barrial', 'lucha', 'boxeo', 'graduacion', 'internacional'];
  function publico(kind) {
    const r = rnd('p' + kind);
    const calmo = kind === 'funeral' || kind === 'misa';
    const fest = FESTIVO.includes(kind);
    const filas = [{ y: 69, rr: 3.4, sh: 6.4, col: ['#10131b', '#141824', '#0e1018'], paso: 9.5, off: 3 }, { y: 76, rr: 4.2, sh: 8, col: ['#07080c', '#0a0b10', '#0c0d13'], paso: 12, off: 0 }];
    let s = '';
    filas.forEach((f, fi) => {
      for (let g = 0; g < 3; g++) {
        let h = '';
        for (let x = W0 + f.off + g * f.paso; x < 360; x += f.paso * 3) {
          const xx = x + (r() - 0.5) * 3, yy = f.y + (r() - 0.5) * 2;
          const brazos = fest && r() < 0.32;
          h += `<path d="M${(xx - f.sh).toFixed(1)} ${(yy + f.rr * 2.6).toFixed(1)}q${f.sh} ${(-f.rr * 2.4).toFixed(1)} ${(f.sh * 2).toFixed(1)} 0z" fill="${pick(f.col, g + fi)}"/><circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="${f.rr}" fill="${pick(f.col, g + fi)}"/>`
            + (brazos ? `<path d="M${(xx - f.sh * 0.7).toFixed(1)} ${(yy + f.rr).toFixed(1)}l-2 ${-f.rr * 2.6}M${(xx + f.sh * 0.7).toFixed(1)} ${(yy + f.rr).toFixed(1)}l2 ${-f.rr * 2.6}" stroke="${pick(f.col, g + fi)}" stroke-width="${f.rr * 0.6}" stroke-linecap="round"/>` : '')
            + (!calmo && r() < 0.16 ? `<path d="M${(xx - 2).toFixed(1)} ${(yy - f.rr + 0.6).toFixed(1)}a${f.rr} ${f.rr} 0 0 1 4 0" stroke="#fff" stroke-opacity=".12" stroke-width=".8" fill="none"/>` : '');
        }
        s += `<g class="esc-crowd ${calmo ? 'esc-crowd-calma' : ''}"${d(-(g * 0.37 + fi * 0.2).toFixed(2))}>${h}</g>`;
      }
    });
    // Brazos arriba (aparecen al celebrar)
    let a = '';
    for (let x = W0 + 6; x < 360; x += 23) { const xx = x + (r() - 0.5) * 6; a += `<path d="M${(xx - 5).toFixed(1)} 76l-3 -10M${(xx + 5).toFixed(1)} 76l3 -10" stroke="#07080c" stroke-width="2.4" stroke-linecap="round"/><circle cx="${(xx - 8).toFixed(1)}" cy="65.6" r="1.6" fill="#07080c"/><circle cx="${(xx + 8).toFixed(1)}" cy="65.6" r="1.6" fill="#07080c"/>`; }
    s += `<g class="esc-hurra">${a}</g>`;
    return s;
  }
  // Camarógrafo en su tarima (n = 1 o 2), mirando al centro
  function camarografo(x, n, flip) {
    return `<g transform="translate(${x} 80) scale(${flip ? -1 : 1} 1)" class="esc-cam esc-cam${n}">
      <rect x="-17" y="-6" width="30" height="6" rx="1" fill="#1a1e27"/><path d="M-17 -6h30" stroke="#3a4354" stroke-width=".8"/>
      <path d="M0 -30L-8 -6M0 -30L8 -6M0 -30V-6" stroke="#5b6476" stroke-width="1.5" stroke-linecap="round"/>
      <g transform="translate(-12 -6)"><path d="M-4.6 0L-3.6 -19q3.6-3 7.2 0L4.6 0z" fill="#1f2a3a"/><circle cx="0" cy="-23" r="3.6" fill="#b97f55"/><path d="M-3.8 -24a3.8 3.8 0 0 1 7.6 0" stroke="#14171d" stroke-width="1.6" fill="none"/><path d="M3.6 -19l7 -5" stroke="#1f2a3a" stroke-width="2.2" stroke-linecap="round"/></g>
      <g transform="translate(0 -31)"><g class="esc-pan"${dur(n === 1 ? 6.5 : 7.5, n === 1 ? 0 : -3)}>
        <rect x="-7" y="-7" width="15" height="8" rx="1.6" fill="#2a303b" class="esc-cbody"/><rect x="-6" y="-6.4" width="13" height="2" rx="1" fill="#fff" opacity=".14"/>
        <rect x="-3" y="-10" width="7" height="3" rx="1" fill="#14171d"/><rect x="8" y="-6" width="6" height="6" rx="1" fill="#14171d"/><ellipse cx="14" cy="-3" rx=".9" ry="2.6" fill="#4da3ff" opacity=".8"/>
        <rect x="-10" y="-6" width="3" height="4.4" rx=".6" fill="#14171d"/><path d="M-6 0l-10 3" stroke="#3a4150" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="-4" cy="-8.6" r="1.6" fill="#4a1015"/><circle cx="-4" cy="-8.6" r="1.6" fill="#ff3b3b" class="esc-tally esc-t${n}"/><circle cx="-4" cy="-8.6" r="3.2" fill="#ff3b3b" opacity=".22" class="esc-tally esc-t${n}"/>
      </g></g>
      <g class="esc-alerta" transform="translate(0 -50)"><path d="M0 -5.6L5.4 4H-5.4z" fill="#ff3b3b" stroke="#0d0f14" stroke-width=".8"/><path d="M0 -2v3" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><circle cy="2.6" r=".7" fill="#fff"/></g>
    </g>`;
  }
  // Mesa de comentaristas (internacional): se pone en el piso, no en el monitor
  const cabina = () => `<g transform="translate(78 80)"><rect x="-22" y="-14" width="44" height="14" fill="#1a2236"/><path d="M-22 -14h44" stroke="#4da3ff" stroke-opacity=".6"/>`
    + [-9, 9].map((x, i) => `<g transform="translate(${x} -13)"><g class="esc-talk"${dur(1 + i * 0.3, i * 0.4)}>${fig(0, 0, { k: 0.72, body: i ? '#2a3a55' : '#3a2c48', skin: pick(PIEL, i), noLegs: true, arms: '', extra: '<path d="M-3.8 -23a3.8 3.8 0 0 1 7.6 0" stroke="#e9edf5" stroke-width="1.1" fill="none"/><path d="M-3.8 -21.4q-1 4 3 4.6" stroke="#e9edf5" stroke-width=".8" fill="none"/>' })}</g></g>`).join('')
    + '</g>';
  const globo = (x, y) => `<g transform="translate(${x} ${y})"><circle r="7" fill="#1d4f86"/><circle r="7" fill="none" stroke="#4da3ff" stroke-width=".8"/><path d="M-7 0h14M-6 -3.6h12M-6 3.6h12" stroke="#4da3ff" stroke-width=".5" opacity=".7"/>`
    + `<g class="esc-globo"><ellipse rx="3.4" ry="7" fill="none" stroke="#8fd0ff" stroke-width=".7"/></g><g class="esc-globo"${d(-1.5)}><ellipse rx="3.4" ry="7" fill="none" stroke="#8fd0ff" stroke-width=".7"/></g>`
    + `<g transform="translate(12 -2)">${repetir(3, (i) => `<path class="esc-onda" d="M${2 + i * 2.6} -3a${3 + i * 2.6} ${3 + i * 2.6} 0 0 1 0 6" stroke="#2ecc71" stroke-width=".9" fill="none"${d(i * 0.35)}/>`)}</g></g>`;

  /* ---------- Íconos de los imprevistos ---------- */
  const ICONO = { luz: 'bolt', internet: 'wifi_off', senal: 'wifi_off', senal_irl: 'wifi_off', lluvia: 'rain', tarde: 'clock', transporte: 'clock', bateria: 'battery',
    cable: 'cable', cable_pisado: 'cable', acople: 'sound', falla: 'wrench', pieza: 'wrench', robo: 'lock', multitud: 'people', permiso: 'log', guion: 'log',
    entrevista: 'mics', logo: 'tip', marcador: 'tip', sin_repeticion: 'replay', colores: 'tip', ptz_fija: 'cam_pro', dron: 'dron', entrada: 'people', vip: 'star', epico: 'sparkle' };
  const SENAL = /^(internet|senal|senal_irl|falla|dron)$/;
  const svgI = (body) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const I_WARN = svgI('<path d="M12 3L2 20h20z"/><path d="M12 9v5M12 17v.1"/>');
  const I_OK = svgI('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
  const I_MAL = svgI('<path d="M6 6l12 12M18 6L6 18"/>');
  const I_STAR = svgI('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>');
  const I_GLOBO = svgI('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>');
  function iconoDe(fase, clave) {
    if (fase === 'bien') return I_OK;
    if (fase === 'mal') return I_MAL;
    if (fase === 'momento') return I_STAR;
    const A = root.Art;
    const n = ICONO[clave];
    try { if (n && A && A.icon && (!A.hasIcon || A.hasIcon(n))) return A.icon(n); } catch (e) { /* abajo */ }
    return I_WARN;
  }

  /* ---------- Reloj del programa (corre desde que empezó el evento) ---------- */
  const T0_KEY = 'envivo_escena_t0';
  let t0s = null;
  function t0De(id) {
    const k = String(id == null ? 'x' : id);
    if (!t0s) { try { t0s = JSON.parse(root.sessionStorage.getItem(T0_KEY) || '{}') || {}; } catch (e) { t0s = {}; } }
    if (!t0s[k]) {
      t0s = { [k]: Date.now() };   // solo el evento actual
      try { root.sessionStorage.setItem(T0_KEY, JSON.stringify(t0s)); } catch (e) { /* modo privado */ }
    }
    return t0s[k];
  }
  const dos = (n) => (n < 10 ? '0' : '') + n;
  const reloj = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${dos(Math.floor(s / 3600))}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}`; };
  let tic = null;
  function tictac() {
    const D = doc();
    if (!D) return;
    const els = D.querySelectorAll('.esc-reloj[data-t0]');
    if (!els.length || reduce()) { clearInterval(tic); tic = null; return; }
    const now = Date.now();
    els.forEach((el) => { el.textContent = reloj(now - Number(el.dataset.t0)); });
  }
  function arrancarReloj() { if (tic || !doc() || reduce()) return; tic = setInterval(tictac, 1000); }

  /* ---------- La franja ---------- */
  let seq = 0;
  const FASES = ['imprevisto', 'momento', 'bien', 'mal'];
  function html(c, e) {
    try {
      c = c || {}; e = e || {};
      const kind = tipo(c);
      const u = 'esc' + (++seq) + '-';
      const sc = (ESCENAS[kind] || ESCENAS.prensa)(u);
      const fase = FASES.includes(e.fase) ? e.fase : '';
      const clave = String(e.clave || '');
      const intl = kind === 'internacional' || !!c.internacional || /^internacional/.test(String(c.type || ''));
      const t0 = t0De(c.id);
      const [fx, fy] = sc.foco;
      const act = `${u}act`;
      const plano = (s, x, y) => `translate(80 45) scale(${s}) translate(${-x} ${-y})`;
      const efectoMon = fase === 'imprevisto' && clave === 'luz' ? 'esc-mon-negro' : fase === 'imprevisto' && SENAL.test(clave) ? 'esc-mon-ruido' : '';
      const lluvia = fase === 'imprevisto' && clave === 'lluvia';
      const textoFase = fase ? tx(fase) : '';
      const nombre = e.nombre ? ': ' + e.nombre : '';
      arrancarReloj();
      return `<div class="esc esc-k-${kind}${fase ? ' esc-r-' + fase : ''}${efectoMon ? ' ' + efectoMon : ''}" data-escena="${kind}" data-fase="${fase || 'neutro'}" data-clave="${esc(clave)}" role="img" aria-label="${esc(tx('aria') + nombre + (textoFase ? ' — ' + textoFase : ''))}">
  <div class="esc-piso"><svg viewBox="${W0} 0 ${WW} 80" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>${sc.defs}</defs>
    <g id="${act}">${sc.svg}</g>
    ${intl ? globo(38, 11) : ''}
    ${publico(kind)}${kind === 'internacional' ? cabina() : ''}
    ${camarografo(33, 1, false)}${camarografo(207, 2, true)}
    ${lluvia ? `<g class="esc-lluvia">${repetir(26, (i) => `<path d="M${-110 + i * 18} ${(i * 23) % 70 - 10}l-3 9" stroke="#9ec9ff" stroke-width=".8" opacity=".6"/>`)}</g>` : ''}
  </svg>
  <div class="esc-wash"></div>
  ${fase ? `<div class="esc-badge"><span class="esc-bi">${iconoDe(fase, clave)}</span><span>${esc(textoFase)}</span></div>` : ''}
  </div>
  <div class="esc-mon"><svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect width="160" height="90" fill="#000"/>
    <g class="esc-c1"><g class="esc-kb"><use href="#${act}" transform="${plano(1.08, 120, 42)}"/></g></g>
    <g class="esc-c2"><g class="esc-kb esc-kb2"><use href="#${act}" transform="${plano(2, fx, fy)}"/></g></g>
    <rect y="72" width="160" height="18" fill="url(#${u}lt)"/>
    <defs><linearGradient id="${u}lt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
  </svg>
  <span class="esc-ruido"></span><span class="esc-negro"><b>${esc(tx('sin_senal'))}</b></span>
  <span class="esc-bug"><i></i>${esc(tx('en_vivo'))}</span>${intl ? `<span class="esc-intl">${I_GLOBO}</span>` : ''}
  <span class="esc-reloj" data-t0="${t0}">${reloj(Date.now() - t0)}</span>
  <span class="esc-camlbl"><b class="esc-l1">CAM 1</b><b class="esc-l2">CAM 2</b></span>
  </div>
</div>`;
    } catch (err) {
      try { if (root.console) root.console.warn('Escena:', err); } catch (e2) { /* nada */ }
      return '';
    }
  }

  // Repite una reacción sobre una franja ya puesta (el elemento puede ser la franja o algo que la contenga)
  function reaccion(el, fase, clave) {
    try {
      const D = doc();
      if (!D) return false;
      const box = el && el.classList && el.classList.contains('esc') ? el : (el && el.querySelector ? el.querySelector('.esc') : D.querySelector('.esc'));
      if (!box) return false;
      fase = FASES.includes(fase) ? fase : '';
      FASES.forEach((f) => box.classList.remove('esc-r-' + f));
      box.classList.remove('esc-mon-negro', 'esc-mon-ruido');
      void box.offsetWidth;   // reinicia las animaciones
      box.dataset.fase = fase || 'neutro';
      if (!fase) { const b0 = box.querySelector('.esc-badge'); if (b0) b0.remove(); return true; }
      box.classList.add('esc-r-' + fase);
      if (fase === 'imprevisto' && clave === 'luz') box.classList.add('esc-mon-negro');
      else if (fase === 'imprevisto' && SENAL.test(clave || '')) box.classList.add('esc-mon-ruido');
      let b = box.querySelector('.esc-badge');
      if (b) b.remove();
      b = D.createElement('div');
      b.className = 'esc-badge';
      b.innerHTML = `<span class="esc-bi">${iconoDe(fase, clave)}</span><span>${esc(tx(fase))}</span>`;
      const p = box.querySelector('.esc-piso');
      (p || box).appendChild(b);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- CSS ---------- */
  const CSS = `
.esc{--esc-c:#ff3b3b;position:relative;display:flex;gap:5px;height:78px;margin:0 0 10px;padding:4px;border-radius:12px;background:#07090d;border:1px solid var(--line,#2a3242);box-shadow:0 6px 18px -12px #000;contain:layout paint;isolation:isolate;user-select:none;-webkit-user-select:none}
.esc::after{content:"";position:absolute;inset:-1px;border-radius:12px;border:2px solid var(--esc-c);opacity:0;pointer-events:none}
.esc-piso{position:relative;flex:1 1 auto;min-width:0;border-radius:8px;overflow:hidden;background:#0d0f14}
.esc-piso>svg{display:block;width:100%;height:100%}
.esc-mon{position:relative;flex:0 0 auto;height:100%;aspect-ratio:16/9;border-radius:6px;overflow:hidden;background:#000;border:1.5px solid #ff3b3b;box-shadow:0 0 10px -3px #ff3b3b88}
.esc-mon>svg{display:block;width:100%;height:100%}
.esc-bug{position:absolute;left:4px;top:4px;display:inline-flex;align-items:center;gap:3px;background:#ff3b3b;color:#fff;font:800 9px/1 var(--f-head,"Barlow Condensed","Arial Narrow",sans-serif);letter-spacing:.6px;padding:2px 4px 2px 3px;border-radius:3px;max-width:62%;overflow:hidden;white-space:nowrap}
.esc-bug i{width:5px;height:5px;border-radius:50%;background:#fff;flex:none;animation:escBlink 1s steps(1,end) infinite}
.esc-reloj{position:absolute;right:4px;top:4px;font:600 8.5px/1 var(--f-mono,ui-monospace,Menlo,monospace);font-variant-numeric:tabular-nums;color:#fff;background:#000a;padding:2px 3px;border-radius:3px;letter-spacing:.2px}
.esc-intl{position:absolute;right:4px;top:17px;color:#8fd0ff;line-height:0}.esc-intl .ico{width:11px;height:11px}
.esc-camlbl{position:absolute;left:4px;bottom:3px;font:700 8px/1 var(--f-head,"Barlow Condensed",sans-serif);letter-spacing:.6px;color:#e9edf5}
.esc-camlbl b{display:inline-block;background:#0d0f14cc;padding:1.5px 3px;border-radius:2px;border-left:2px solid #ff3b3b}
.esc-l2{position:absolute;left:0;bottom:0;opacity:0}
.esc-ruido,.esc-negro{position:absolute;inset:0;opacity:0;pointer-events:none}
.esc-ruido{background:repeating-linear-gradient(0deg,#fff1 0 1px,transparent 1px 3px),linear-gradient(180deg,transparent 30%,#ff3b3b33 30% 36%,transparent 36% 64%,#4da3ff33 64% 68%,transparent 68%)}
.esc-negro{background:#000;display:flex;align-items:center;justify-content:center}
.esc-negro b{font:800 9px/1 var(--f-head,"Barlow Condensed",sans-serif);color:#ffb020;letter-spacing:.6px;border:1px solid #ffb020;padding:3px 5px;border-radius:3px}
.esc-wash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 40%,var(--esc-c),transparent 75%)}
.esc-badge{position:absolute;left:50%;bottom:5px;transform:translateX(-50%);display:inline-flex;align-items:center;gap:4px;max-width:calc(100% - 10px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:800 11px/1 var(--f-head,"Barlow Condensed",sans-serif);letter-spacing:.4px;color:#1a1205;background:var(--esc-c);padding:3px 7px 3px 5px;border-radius:999px;box-shadow:0 2px 8px #000a;pointer-events:none}
.esc-bi{line-height:0}.esc-bi .ico{width:12px;height:12px;margin:0}
.esc-alerta{opacity:0}
.esc-t2,.esc-l2,.esc-c2,.esc-hurra{opacity:0}
.esc-c2,.esc-l2,.esc-t1,.esc-t2{animation:escCut 9s steps(1,end) infinite}
.esc-t1,.esc-l1{animation-name:escCutA}
.esc-l1{animation:escCutA 9s steps(1,end) infinite}
.esc-kb{transform-origin:80px 45px;animation:escKB 9s ease-in-out infinite}
.esc-kb2{animation-name:escKB2}
.esc-crowd{animation:escBob 1.8s ease-in-out infinite}
.esc-crowd-calma{animation-duration:6s}
.esc-k-concierto .esc-crowd,.esc-k-final .esc-crowd,.esc-k-lucha .esc-crowd{animation-name:escBobFuerte;animation-duration:.9s}
.esc-bob{animation:escBob 1.4s ease-in-out infinite}
.esc-sway{animation:escSway 4s ease-in-out infinite}
.esc-sway2{animation:escSway 4s ease-in-out infinite reverse}
.esc-arms{transform-origin:0 -16px;animation:escArms 5s ease-in-out infinite}
.esc-talk{animation:escTalk 1.1s ease-in-out infinite}
.esc-hand{transform-origin:5px -16px;animation:escHand 2.2s ease-in-out infinite}
.esc-flick{transform-box:fill-box;transform-origin:50% 100%;animation:escFlick .9s ease-in-out infinite alternate}
.esc-k-funeral .esc-flick{animation-duration:1.8s}
.esc-glow{animation:escGlow 4s ease-in-out infinite}
.esc-tw{animation:escTw 2.2s ease-in-out infinite}
.esc-heart{animation:escHeart 3.6s ease-out infinite;opacity:0}
.esc-toss{animation:escToss 2.6s ease-in-out infinite;opacity:0}
.esc-conf{animation:escConf 3.4s linear infinite;opacity:0}
.esc-flash{opacity:0;animation:escFlash 2.8s linear infinite}
.esc-burst{opacity:0;animation:escBurst 3.3s ease-out infinite}
.esc-beam{animation:escBeam 4s ease-in-out infinite alternate}
.esc-screen2{animation:escFade 5s ease-in-out infinite alternate}
.esc-cym{animation:escCym .45s ease-in-out infinite alternate}
.esc-led{animation:escLed 6s linear infinite}
.esc-run{animation:escRun 4s ease-in-out infinite alternate}
.esc-run2{animation:escRun2 3s ease-in-out infinite}
.esc-pase{animation:escPase 3s ease-in-out infinite}
.esc-ball-y{animation:escBallY 1.5s ease-in-out infinite}
.esc-punch{animation:escPunch 1.8s ease-in-out infinite}
.esc-jump{animation:escJump 3.2s ease-in-out infinite}
.esc-stagger{animation:escStagger 3.2s ease-in-out infinite}
.esc-spin3d{animation:escSpin3d 3s ease-in-out infinite}
.esc-walk{animation:escWalk 8s ease-in-out infinite alternate}
.esc-shine{animation:escShine 3.5s ease-in-out infinite}
.esc-dot-orbit{animation:escOrbit 4s linear infinite}
.esc-road{animation:escRoad 1.6s linear infinite}
.esc-cross{animation:escCross 9s linear infinite}
.esc-globo{transform-origin:0 0;animation:escGlobo 3s linear infinite}
.esc-onda{animation:escOnda 1.4s ease-out infinite;opacity:0}
.esc-pan{animation:escPan 6.5s ease-in-out infinite alternate}
.esc-lluvia{animation:escLluvia .5s linear infinite}
/* Reacciones */
.esc-r-imprevisto{--esc-c:#ffb020}
.esc-r-imprevisto::after{animation:escAlerta .7s steps(1,end) 4 forwards}
.esc-r-imprevisto .esc-badge{animation:escBadgeIn .3s ease-out both,escBadgeTit .7s steps(1,end) .3s 3}
.esc-r-imprevisto .esc-cam2 .esc-cbody{fill:#d42a30;animation:escBlink .7s steps(1,end) infinite}
.esc-r-imprevisto .esc-cam2 .esc-alerta{opacity:1;animation:escBlink .7s steps(1,end) infinite}
.esc-r-imprevisto .esc-mon{border-color:#ffb020;animation:escMonAl .7s steps(1,end) 4}
.esc-r-imprevisto .esc-wash{animation:escWash 1.4s ease-out 1}
.esc-mon-ruido .esc-ruido{opacity:1;animation:escRuido .25s steps(2,end) infinite}
.esc-mon-negro .esc-negro{opacity:1}
.esc-mon-negro .esc-bug,.esc-mon-negro .esc-camlbl{opacity:.25}
.esc-r-bien{--esc-c:#2ecc71}.esc-r-mal{--esc-c:#ff3b3b}.esc-r-momento{--esc-c:#ffd34d}
.esc-r-bien::after,.esc-r-mal::after,.esc-r-momento::after{opacity:1;animation:escPulso 1.1s ease-out 2 forwards}
.esc-r-bien .esc-wash,.esc-r-mal .esc-wash,.esc-r-momento .esc-wash{opacity:.3;animation:escWash 1.6s ease-out forwards}
.esc-r-bien .esc-badge,.esc-r-mal .esc-badge,.esc-r-momento .esc-badge{animation:escBadgeIn .3s ease-out both,escBadgeOut .5s ease-in 2.4s forwards}
.esc-r-mal .esc-badge{color:#fff}
.esc-r-bien .esc-hurra,.esc-r-momento .esc-hurra{opacity:1;animation:escHurra .6s ease-in-out 4 alternate,escFadeOut .4s 2.4s forwards}
.esc-r-mal .esc-mon{animation:escGlitch .18s steps(2,end) 5}
.esc-r-mal .esc-crowd{animation-duration:3.2s}
@keyframes escBlink{50%{opacity:.25}}
@keyframes escCut{0%{opacity:0}50%{opacity:1}}
@keyframes escCutA{0%{opacity:1}50%{opacity:0}}
@keyframes escKB{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}
@keyframes escKB2{0%{transform:translateX(3px)}50%{transform:translateX(-3px)}100%{transform:translateX(3px)}}
@keyframes escBob{50%{transform:translateY(-1.2px)}}
@keyframes escBobFuerte{50%{transform:translateY(-2.6px)}}
@keyframes escSway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}
@keyframes escArms{0%,100%{transform:rotate(0)}45%,60%{transform:rotate(-8deg) scaleY(1.08)}}
@keyframes escTalk{0%,100%{transform:translateY(0)}30%{transform:translateY(-.8px)}60%{transform:translateY(.3px)}}
@keyframes escHand{0%,100%{transform:rotate(0)}50%{transform:rotate(-30deg)}}
@keyframes escFlick{0%{transform:scale(1,1);opacity:1}100%{transform:scale(.85,1.18);opacity:.8}}
@keyframes escGlow{50%{opacity:.6}}
@keyframes escTw{50%{opacity:.25}}
@keyframes escHeart{0%{opacity:0;transform:translateY(6px) scale(.6)}20%{opacity:1}100%{opacity:0;transform:translateY(-22px) scale(1.1)}}
@keyframes escToss{0%,100%{opacity:0;transform:translateY(18px) rotate(0)}15%{opacity:1}50%{opacity:1;transform:translateY(-18px) rotate(200deg)}85%{opacity:0;transform:translateY(14px) rotate(360deg)}}
@keyframes escConf{0%{opacity:0;transform:translateY(0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(56px) rotate(320deg)}}
@keyframes escFlash{0%,86%,100%{opacity:0;transform:scale(.4)}90%{opacity:1;transform:scale(1.1)}95%{opacity:.2;transform:scale(1)}}
@keyframes escBurst{0%{opacity:0;transform:scale(.2)}15%{opacity:1}70%{opacity:.6;transform:scale(1.2)}100%{opacity:0;transform:scale(1.4)}}
@keyframes escBeam{0%{transform:rotate(-24deg)}100%{transform:rotate(24deg)}}
@keyframes escFade{0%{opacity:0}100%{opacity:1}}
@keyframes escCym{0%{transform:rotate(-8deg)}100%{transform:rotate(8deg)}}
@keyframes escLed{0%{transform:translateX(0)}100%{transform:translateX(160px)}}
@keyframes escRun{0%{transform:translateX(-14px)}100%{transform:translateX(16px)}}
@keyframes escRun2{0%,100%{transform:translateX(0)}50%{transform:translateX(6px)}}
@keyframes escPase{0%,100%{transform:translateX(0)}50%{transform:translateX(48px)}}
@keyframes escBallY{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes escPunch{0%,60%,100%{transform:translateX(0)}70%{transform:translateX(7px)}78%{transform:translateX(0)}}
@keyframes escJump{0%,20%{transform:translate(0,0) rotate(0)}50%{transform:translate(30px,-12px) rotate(20deg)}70%,100%{transform:translate(52px,8px) rotate(0)}}
@keyframes escStagger{0%,60%{transform:rotate(0)}70%{transform:rotate(-14deg) translateX(-2px)}85%{transform:rotate(6deg)}100%{transform:rotate(0)}}
@keyframes escSpin3d{0%,100%{transform:scaleX(1)}25%{transform:scaleX(.15)}50%{transform:scaleX(-1)}75%{transform:scaleX(.15)}}
@keyframes escWalk{0%{transform:translateX(-26px)}100%{transform:translateX(26px)}}
@keyframes escShine{0%,30%{transform:translateX(-10px)}80%,100%{transform:translateX(120px)}}
@keyframes escOrbit{0%{transform:translate(-50px,0)}25%{transform:translate(0,6px)}50%{transform:translate(50px,0)}75%{transform:translate(0,-6px)}100%{transform:translate(-50px,0)}}
@keyframes escRoad{0%{transform:translateX(0)}100%{transform:translateX(-40px)}}
@keyframes escCross{0%{transform:translateX(-200px)}100%{transform:translateX(200px)}}
@keyframes escGlobo{0%{transform:scaleX(1)}50%{transform:scaleX(-1)}100%{transform:scaleX(1)}}
@keyframes escOnda{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
@keyframes escPan{0%{transform:rotate(-7deg)}100%{transform:rotate(7deg)}}
@keyframes escLluvia{0%{transform:translateY(-10px)}100%{transform:translateY(10px)}}
@keyframes escAlerta{0%{opacity:1}50%{opacity:.15}100%{opacity:.7}}
@keyframes escMonAl{50%{border-color:#ff3b3b}}
@keyframes escBadgeIn{0%{opacity:0;transform:translate(-50%,8px) scale(.9)}100%{opacity:1;transform:translate(-50%,0) scale(1)}}
@keyframes escBadgeTit{50%{opacity:.55}}
@keyframes escBadgeOut{to{opacity:0;transform:translate(-50%,6px)}}
@keyframes escWash{0%{opacity:.4}100%{opacity:0}}
@keyframes escPulso{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.03)}}
@keyframes escHurra{0%{transform:translateY(2px)}100%{transform:translateY(-2px)}}
@keyframes escFadeOut{to{opacity:0}}
@keyframes escRuido{0%{transform:translateY(0)}100%{transform:translateY(3px)}}
@keyframes escGlitch{0%{transform:translateX(0)}50%{transform:translateX(-1.5px)}100%{transform:translateX(1px)}}
@media (prefers-reduced-motion:reduce){.esc,.esc *,.esc::after{animation:none!important;transition:none!important}
  .esc-r-bien::after,.esc-r-mal::after,.esc-r-momento::after,.esc-r-imprevisto::after{opacity:.9}
  .esc-r-bien .esc-wash,.esc-r-mal .esc-wash,.esc-r-momento .esc-wash,.esc-r-imprevisto .esc-wash{opacity:.18}
  .esc-heart,.esc-conf,.esc-flash,.esc-burst,.esc-onda{opacity:0}.esc-toss{opacity:1}.esc-screen2{opacity:0}}
`;
  function ponerCSS() {
    const D = doc();
    if (!D || D.getElementById('escena-css')) return;
    const st = D.createElement('style');
    st.id = 'escena-css';
    st.textContent = CSS;
    (D.head || D.documentElement).appendChild(st);
  }

  // Si la app se recargó en pleno evento, js/ui.js abrió la ventana antes de que cargara este archivo (defer):
  // se pone la franja en esa ventana (solo en la partida; un intento en línea no sobrevive a una recarga)
  function completarVentana() {
    try {
      const D = doc();
      const m = D && D.querySelector('#overlay.on #modal');
      if (!m || m.querySelector('.esc') || !m.querySelector('.incident')) return;
      const s = root.__game && root.__game.state;
      const ev = s && s.currentEvent;
      if (!ev || !ev.contract) return;
      const inc = ev.incidents && ev.incidents[ev.step];
      const enImprevisto = !!m.querySelector('[data-act="choose"]');
      const h = html(ev.contract, enImprevisto && inc ? { fase: inc.key === 'epico' ? 'momento' : 'imprevisto', clave: inc.key } : {});
      if (h) m.insertAdjacentHTML('afterbegin', h);
    } catch (e) { /* nada */ }
  }

  ponerCSS();
  if (doc()) {
    const D = doc();
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', () => { ponerCSS(); completarVentana(); }, { once: true });
    else setTimeout(completarVentana, 0);
  }

  root.Escena = { html, reaccion, tipo, TEXTOS, ESCENAS: Object.keys(ESCENAS), version: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
