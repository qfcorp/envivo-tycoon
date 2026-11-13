/* =========================================================
   EN VIVO Tycoon — "Jugada del día" en video vertical (window.ClipVideo)
   Idea 9 de propuestas: después de un evento de 5 estrellas o de un imprevisto salvado, el resultado ofrece
   "Compartir video". El juego arma en un canvas vertical (1080x1920, o 720x1280 si el aparato es lento) un clip de
   10 s con la escena del evento (la misma de js/escena.js, como imagen fija con paneo, cortes de cámara, lluvia,
   apagón, golazo o público dibujados encima), el tipo de evento, el imprevisto, las estrellas, el nombre de la
   productora y el enlace de invitación con ?ref= (js/compartir.js), y lo graba con MediaRecorder (mp4 si el
   navegador lo permite, si no webm).

   - Se graba en segundo plano: una pastilla arriba (no tapa "Continuar" ni la barra de abajo) muestra el avance y "Cancelar"; se puede seguir jugando.
   - Al terminar: "Compartir video" (Web Share con archivo → estados de WhatsApp, TikTok, Reels) o, si el aparato
     no comparte archivos, "Descargar video".
   - Sin MediaRecorder / captureStream (o si la grabación falla): se comparte la imagen de siempre (Compartir), sin
     errores.
   - Textos en js/lang/es.js (claves clip.*), con I18N.T: el video sale en el idioma del jugador.

   Uso desde ui.js (resultado del evento):
     ${window.ClipVideo ? window.ClipVideo.resultado(r, fresh, ctxInicio()) : ''}
   Los botones llevan data-ext="clip" data-acc="…" (los reparte ui.js a window.EnVivoInicio).
   API: ClipVideo.merece(r), datosDe(r), soporta(), grabar(datos, { alAvanzar }) → Promise<{ blob, mime, w, h, ms }>,
        empezar(r), cancelar(), compartir(), DUR_MS.
   ========================================================= */
(function (root) {
  'use strict';
  const DUR_MS = 10000;              // 8 a 12 s: 10 s
  const JUEGO = 'juego.tukanec.com';
  const FUTBOL = ['barrial', 'ligapro', 'final', 'internacional'];
  // Imprevisto → categoría del texto del video (clip.imp.<cat>) y del efecto que se dibuja
  const CAT = {
    lluvia: 'lluvia', luz: 'luz', bateria: 'bateria', internet: 'senal', senal: 'senal', senal_irl: 'senal', falla: 'senal', dron: 'senal',
    multitud: 'publico', entrada: 'publico', vip: 'publico', cable: 'cable', cable_pisado: 'cable', acople: 'sonido',
    tarde: 'retraso', transporte: 'retraso', epico: 'epico',
  };

  /* ---------- Ayudantes ---------- */
  const T = (k, p) => {
    try { if (root.I18N && typeof root.I18N.T === 'function') return root.I18N.T(k, p); } catch (e) { /* abajo */ }
    try { const d = root.I18N_LANG && root.I18N_LANG.es; const s = d && d[k]; if (typeof s === 'string') return s.replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m)); } catch (e) { /* abajo */ }
    return k;
  };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const noEmoji = (s) => String(s || '').replace(/^(\p{Extended_Pictographic}|️|‍|\s)+/u, '').trim();
  const estado = () => { try { return root.__game && root.__game.state; } catch (e) { return null; } };
  const icono = (n, cls) => { try { return root.Art ? root.Art.icon(n, cls || 'sm') : ''; } catch (e) { return ''; } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (x) => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
  const prog = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  let ctx = null;          // último contexto de ui.js
  let ultimo = null;       // datos del último resultado que merece video
  let tarea = null;        // grabación en curso { cancelar() }
  let hecho = null;        // { blob, mime, ext, datos } listo para compartir

  /* ---------- ¿Merece video? ---------- */
  // Imprevisto salvado: uno malo que se resolvió casi sin perder calidad (o una jugada arriesgada que salió bien)
  function salvado(i) {
    const x = i && i.result;
    if (!x || i.bueno) return false;
    const q = Number(x.q) || 0;
    return q > 0 || (q >= -2 && x.salio !== false);
  }
  function jugada(r) {
    const l = (r && r.incidents) || [];
    const malos = l.filter(salvado).sort((a, b) => (Number(b.result.q) || 0) - (Number(a.result.q) || 0));
    // Lo más vistoso primero: los que tienen efecto propio (lluvia, apagón, señal, público)
    const vistoso = malos.find((i) => ['lluvia', 'luz', 'senal', 'publico'].includes(CAT[i.key]));
    if (vistoso || malos[0]) return { inc: vistoso || malos[0], salvado: true };
    const bueno = l.find((i) => i.bueno && i.result);
    return bueno ? { inc: bueno, salvado: false } : null;
  }
  function merece(r) {
    if (!r || r.intlFail) return false;
    const n = Number(r.stars) || 0;
    if (n === 5) return true;
    const j = jugada(r);
    return !!(j && j.salvado && n >= 3);
  }

  /* ---------- Datos del clip ---------- */
  function escenaDe(type) {
    try { if (root.Escena && root.Escena.tipo) return root.Escena.tipo(type); } catch (e) { /* abajo */ }
    return String(type || 'prensa');
  }
  function enlace() {
    try { if (root.Compartir && root.Compartir.enlace) return root.Compartir.enlace(); } catch (e) { /* abajo */ }
    return 'https://' + JUEGO + '/';
  }
  function datosDe(r, c) {
    const S = estado() || {};
    let titulo = (r && r.title) || '';
    try { if (c && c.TL) titulo = c.TL(titulo); else if (root.I18N && root.I18N.TL) titulo = root.I18N.TL(titulo); } catch (e) { /* tal cual */ }
    const tipo = escenaDe(r && r.type);
    const j = jugada(r);
    let imp = null;
    if (j) {
      const key = j.inc.key;
      let cat = CAT[key] || 'otro';
      if (cat === 'epico' && FUTBOL.includes(tipo)) cat = 'gol';
      imp = { clave: key, cat, salvado: j.salvado };
    }
    return {
      type: r && r.type, tipo, titulo: noEmoji(titulo),
      estrellas: clamp(Math.round(Number(r && r.stars) || 1), 1, 5), calidad: clamp(Math.round(Number(r && r.quality) || 0), 0, 100),
      imp, productora: (typeof S.productora === 'string' && S.productora.trim()) || '', enlace: enlace(),
    };
  }

  /* ---------- Soporte del aparato ---------- */
  function mimeVideo() {
    try {
      if (typeof root.MediaRecorder !== 'function') return null;
      const lista = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      const f = root.MediaRecorder.isTypeSupported;
      if (typeof f !== 'function') return '';
      return lista.find((m) => { try { return f.call(root.MediaRecorder, m); } catch (e) { return false; } }) || null;
    } catch (e) { return null; }
  }
  function soporta() {
    try {
      if (root.__CLIP_SIN_GRABADOR) return false;   // pruebas: simula un aparato sin MediaRecorder
      const D = root.document;
      if (!D || typeof root.MediaRecorder !== 'function') return false;
      const cv = D.createElement('canvas');
      return typeof cv.captureStream === 'function' && mimeVideo() !== null;
    } catch (e) { return false; }
  }
  function lento() {
    try {
      if (typeof root.__CLIP_LENTO === 'boolean') return root.__CLIP_LENTO;   // pruebas
      const n = root.navigator || {};
      return (typeof n.deviceMemory === 'number' && n.deviceMemory <= 3) || (typeof n.hardwareConcurrency === 'number' && n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 4);
    } catch (e) { return false; }
  }

  /* ---------- La escena (js/escena.js) como imagen ---------- */
  function cssEscena() {
    let s = '';
    try { const el = root.document.getElementById('escena-css'); s = el ? el.textContent : ''; } catch (e) { s = ''; }
    // Sin animaciones (en una imagen no corren): quedan las reglas que esconden piezas (opacity:0) y los colores
    return s.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/animation[\w-]*\s*:[^;}]*;?/g, '');
  }
  function imagenEscena(d, w, h) {
    return new Promise((res) => {
      try {
        if (!root.Escena || !root.Escena.html) return res(null);
        const html = root.Escena.html({ type: d.type, id: 'clip-video' }, {});
        const i = html.indexOf('<svg'), f = html.indexOf('</svg>');
        if (i < 0 || f < 0) return res(null);
        let s = html.slice(i, f + 6).replace(/^<svg\b([^>]*)>/, (m, at) => {
          let a = at.replace(/\s(width|height|preserveAspectRatio)="[^"]*"/g, '');
          if (!/xmlns=/.test(a)) a += ' xmlns="http://www.w3.org/2000/svg"';
          if (!/xmlns:xlink=/.test(a)) a += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
          return `<svg${a} width="${w}" height="${h}" preserveAspectRatio="xMidYMax slice"><style>${cssEscena().replace(/<\/?style/g, '')}</style>`;
        });
        // La escena se dibuja con clases .esc-k-<tipo> de la franja: se envuelve para que las reglas calcen
        s = s.replace(/(<style>[\s\S]*?<\/style>)/, `$1<g class="esc esc-k-${d.tipo}">`).replace(/<\/svg>$/, '</g></svg>');
        const img = new Image();
        const to = setTimeout(() => res(null), 3000);
        img.onload = () => { clearTimeout(to); res(img); };
        img.onerror = () => { clearTimeout(to); res(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      } catch (e) { res(null); }
    });
  }

  /* ---------- Dibujo de cada cuadro ---------- */
  const CAB = '"Barlow Condensed","Roboto Condensed","Arial Narrow",system-ui,sans-serif';
  const CUE = '"IBM Plex Sans","Noto Sans",system-ui,"PingFang SC","Noto Sans CJK SC",sans-serif';
  function redondo(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function estrella(c, cx, cy, R, relleno) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.45 : R; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = relleno; c.fill();
  }
  function ajustar(c, txt, max, px, peso, fam) {
    let s = px;
    c.font = `${peso} ${s}px ${fam}`;
    while (c.measureText(txt).width > max && s > px * 0.45) { s -= 2; c.font = `${peso} ${s}px ${fam}`; }
    let out = txt;
    while (c.measureText(out).width > max && out.length > 4) out = out.slice(0, -2) + '…';
    return out;
  }
  // Números "al azar" pero fijos (el mismo video siempre se ve igual)
  const fijo = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

  function pintor(cv, d, escenaImg) {
    const c = cv.getContext('2d');
    const W = cv.width, H = cv.height, k = W / 1080;
    const X = (v) => v * k;
    // Fondo fijo (se pinta una vez y se copia en cada cuadro)
    const fondo = root.document.createElement('canvas'); fondo.width = W; fondo.height = H;
    const f = fondo.getContext('2d');
    const g = f.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d0f14'); g.addColorStop(0.55, '#141026'); g.addColorStop(1, '#1a1030');
    f.fillStyle = g; f.fillRect(0, 0, W, H);
    const gl = f.createRadialGradient(W / 2, X(560), X(40), W / 2, X(560), X(900)); gl.addColorStop(0, 'rgba(255,59,59,.22)'); gl.addColorStop(1, 'rgba(255,59,59,0)');
    f.fillStyle = gl; f.fillRect(0, 0, W, H);
    // Monitor de programa (16:9) arriba
    const MX = X(40), MY = X(250), MW = W - X(80), MH = Math.round(MW * 9 / 16);
    const cat = d.imp ? d.imp.cat : '';
    const textoImp = d.imp ? T('clip.imp.' + d.imp.cat) : '';
    const titImp = !d.imp ? '' : d.imp.salvado ? T('clip.imprevisto', { imp: textoImp }) : textoImp;
    const fin = d.imp ? (d.imp.salvado ? T('clip.salvado') : T('clip.momentazo')) : T('clip.cinco');
    const linkCorto = String(d.enlace || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const nombre = d.productora || T('clip.productora');
    const T_IMP = 2600, T_OK = 4800, T_EST = 6000, T_CTA = 8200;

    function monitor(t) {
      c.save(); redondo(c, MX, MY, MW, MH, X(28)); c.clip();
      c.fillStyle = '#05070a'; c.fillRect(MX, MY, MW, MH);
      if (escenaImg) {
        // La escena mide 6:1: se recorta un 16:9 que panea; cada 3 s corte entre CAM 1 (abierta) y CAM 2 (cerrada)
        const iw = escenaImg.width || 2400, ih = escenaImg.height || 400;
        const cam2 = Math.floor(t / 3000) % 2 === 1;
        const zoom = (cam2 ? 1.7 : 1.08) + (t % 3000) / 3000 * 0.12;
        const sh = ih / zoom, sw = sh * 16 / 9;
        // El centro de la acción de la escena está en la mitad (x = 120 de -120..360)
        const cx = iw / 2 + Math.sin(t / 2200) * (iw - sw) * (cam2 ? 0.04 : 0.16);
        const sx = clamp(cx - sw / 2, 0, iw - sw), sy = cam2 ? clamp(ih * 0.5 - sh / 2, 0, ih - sh) : ih - sh;
        // Golazo / momento: la cámara tiembla
        const tiembla = (cat === 'gol' || cat === 'epico') && t > T_IMP && t < T_IMP + 900 ? Math.sin(t / 25) * X(6) : 0;
        try { c.drawImage(escenaImg, sx, sy, sw, sh, MX + tiembla, MY, MW, MH); } catch (e) { /* sin escena */ }
      } else {
        const gg = c.createLinearGradient(0, MY, 0, MY + MH); gg.addColorStop(0, '#1b2a44'); gg.addColorStop(1, '#0b0f17');
        c.fillStyle = gg; c.fillRect(MX, MY, MW, MH);
      }
      // Público que salta abajo del monitor
      const fuerte = cat === 'gol' || cat === 'publico' || cat === 'epico' || d.estrellas === 5;
      for (let i = 0; i < 22; i++) {
        const px = MX + (i + 0.5) * MW / 22, sal = Math.abs(Math.sin(t / (fuerte ? 180 : 420) + i * 1.7)) * X(fuerte ? 22 : 8);
        const py = MY + MH + X(18) - sal;
        c.fillStyle = ['#1c2333', '#232b3d', '#18202e'][i % 3];
        c.beginPath(); c.arc(px, py - X(54), X(17), 0, Math.PI * 2); c.fill();
        redondo(c, px - X(22), py - X(38), X(44), X(60), X(16)); c.fill();
      }
      // Efectos del imprevisto
      const enImp = t > T_IMP && t < T_OK;
      if (cat === 'lluvia' && t > T_IMP - 400) {
        c.strokeStyle = 'rgba(158,201,255,.65)'; c.lineWidth = X(3);
        const n = t < T_OK ? 70 : 30;
        for (let i = 0; i < n; i++) {
          const x = MX + fijo(i) * MW, y = MY + ((fijo(i + 99) * MH + t * 0.9 * k) % MH);
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - X(8), y + X(26)); c.stroke();
        }
      }
      if ((cat === 'luz' || cat === 'bateria') && enImp) {
        const neg = t < T_IMP + 1300 || (t < T_OK && Math.floor(t / 140) % 3 === 0);
        if (neg) { c.fillStyle = '#000'; c.fillRect(MX, MY, MW, MH); textoCentro(T('clip.sin_senal'), MX + MW / 2, MY + MH / 2, X(54), '#ffb020'); }
      }
      if (cat === 'senal' && enImp) {
        c.fillStyle = 'rgba(255,255,255,.08)';
        for (let y = MY + ((t / 8) % X(9)); y < MY + MH; y += X(9)) c.fillRect(MX, y, MW, X(3));
        c.fillStyle = 'rgba(255,59,59,.22)'; c.fillRect(MX, MY + MH * (0.3 + 0.05 * Math.sin(t / 60)), MW, X(26));
        c.fillStyle = 'rgba(77,163,255,.22)'; c.fillRect(MX, MY + MH * (0.62 + 0.05 * Math.cos(t / 70)), MW, X(18));
      }
      if ((cat === 'gol' || cat === 'epico') && t > T_IMP && t < T_IMP + 700) {
        c.fillStyle = `rgba(255,255,255,${0.65 * (1 - (t - T_IMP) / 700)})`; c.fillRect(MX, MY, MW, MH);
      }
      // Pulso de color: rojo con el imprevisto, verde cuando se salvó
      if (d.imp && t > T_IMP && t < T_OK) { c.fillStyle = `rgba(255,59,59,${0.10 + 0.08 * Math.sin(t / 120)})`; c.fillRect(MX, MY, MW, MH); }
      if (t > T_OK && t < T_OK + 900) { c.fillStyle = `rgba(37,211,102,${0.28 * (1 - (t - T_OK) / 900)})`; c.fillRect(MX, MY, MW, MH); }
      // Rótulos del monitor: EN VIVO + reloj + CAM
      redondo(c, MX + X(22), MY + X(22), X(170), X(50), X(8)); c.fillStyle = '#ff3b3b'; c.fill();
      if (Math.floor(t / 500) % 2 === 0) { c.beginPath(); c.arc(MX + X(48), MY + X(47), X(9), 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
      c.fillStyle = '#fff'; c.font = `800 ${X(34)}px ${CAB}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(ajustar(c, T('clip.en_vivo'), X(110), X(34), 800, CAB), MX + X(66), MY + X(49));
      const s = Math.floor(t / 1000) + 754;
      const reloj = `00:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      c.font = `600 ${X(30)}px ui-monospace,Menlo,monospace`; c.textAlign = 'right';
      redondo(c, MX + MW - X(190), MY + X(22), X(168), X(50), X(8)); c.fillStyle = 'rgba(0,0,0,.6)'; c.fill();
      c.fillStyle = '#fff'; c.fillText(reloj, MX + MW - X(36), MY + X(49));
      c.textAlign = 'left'; c.font = `700 ${X(28)}px ${CAB}`;
      redondo(c, MX + X(22), MY + MH - X(66), X(110), X(44), X(6)); c.fillStyle = 'rgba(13,15,20,.8)'; c.fill();
      c.fillStyle = '#ff3b3b'; c.fillRect(MX + X(22), MY + MH - X(66), X(6), X(44));
      c.fillStyle = '#e9edf5'; c.fillText(Math.floor(t / 3000) % 2 === 1 ? 'CAM 2' : 'CAM 1', MX + X(40), MY + MH - X(43));
      c.restore();
      redondo(c, MX, MY, MW, MH, X(28)); c.strokeStyle = t > T_IMP && t < T_OK && d.imp ? '#ff3b3b' : t >= T_OK ? '#25d366' : 'rgba(255,59,59,.7)'; c.lineWidth = X(5); c.stroke();
    }
    function textoCentro(txt, x, y, px, color) {
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color;
      c.fillText(ajustar(c, txt, W - X(120), px, 800, CAB), x, y);
    }
    function pastilla(txt, y, fondoCol, textoCol, a, escala) {
      c.save(); c.globalAlpha = a;
      c.font = `800 ${X(52)}px ${CAB}`;
      const t2 = ajustar(c, txt, W - X(200), X(52), 800, CAB);
      const w = Math.min(W - X(120), c.measureText(t2).width + X(90)), h = X(96);
      c.translate(W / 2, y); c.scale(escala, escala);
      redondo(c, -w / 2, -h / 2, w, h, h / 2); c.fillStyle = fondoCol; c.fill();
      c.fillStyle = textoCol; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t2, 0, X(3));
      c.restore();
    }

    return function cuadro(t) {
      c.drawImage(fondo, 0, 0);
      // Cabecera
      const a0 = ease(prog(t, 0, 500));
      c.globalAlpha = a0;
      redondo(c, X(60), X(70), X(232), X(64), X(32)); c.fillStyle = '#ff3b3b'; c.fill();
      c.beginPath(); c.arc(X(100), X(102), X(11), 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(ajustar(c, T('clip.en_vivo'), X(150), X(40), 800, CAB), X(124), X(104));
      c.textAlign = 'right'; c.fillStyle = '#e9edf5'; c.font = `800 ${X(52)}px ${CAB}`; c.fillText('EN VIVO Tycoon', W - X(60), X(104));
      c.globalAlpha = 1;
      monitor(t);
      const base = MY + MH + X(40);
      // Imprevisto y desenlace
      if (d.imp && t > T_IMP) {
        const a = ease(prog(t, T_IMP, T_IMP + 350));
        pastilla(titImp, base + X(80), '#3a1418', '#ffb0a8', a, 0.8 + 0.2 * a);
      }
      if (t > T_OK) {
        const a = ease(prog(t, T_OK, T_OK + 350));
        pastilla(fin, base + X(200), d.imp && !d.imp.salvado ? '#ffb020' : '#25d366', '#08200f', a, 0.7 + 0.3 * a);
      }
      // Productora y evento
      const aN = ease(prog(t, 400, 1200));
      c.globalAlpha = aN; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      if (d.productora) { c.fillStyle = '#8b95a8'; c.font = `600 ${X(34)}px ${CUE}`; c.fillText(T('clip.productora').toUpperCase(), W / 2, base + X(330)); }
      c.fillStyle = '#fff'; c.fillText(ajustar(c, nombre, W - X(120), X(100), 800, CAB), W / 2 - (1 - aN) * X(80), base + X(420));
      c.fillStyle = '#c9d2e3'; c.fillText(ajustar(c, d.titulo, W - X(140), X(46), 600, CUE), W / 2, base + X(495));
      c.globalAlpha = 1;
      // Estrellas una por una
      for (let i = 0; i < 5; i++) {
        const ti = T_EST + i * 220, a = ease(prog(t, ti, ti + 260));
        const R = X(52) * (i < d.estrellas ? 0.6 + 0.4 * a + (a < 1 ? 0.25 * Math.sin(a * Math.PI) : 0) : 1);
        estrella(c, W / 2 + (i - 2) * X(122), base + X(615), R, i < d.estrellas && a > 0 ? '#ffc83d' : '#3a4252');
      }
      if (t > T_EST + 1100) {
        c.globalAlpha = ease(prog(t, T_EST + 1100, T_EST + 1500));
        c.fillStyle = '#8b95a8'; c.font = `600 ${X(36)}px ${CUE}`; c.textAlign = 'center'; c.fillText(T('clip.calidad', { q: d.calidad }), W / 2, base + X(715));
        c.globalAlpha = 1;
      }
      // Confeti con 5 estrellas
      if (d.estrellas === 5 && t > T_EST + 1000) {
        for (let i = 0; i < 60; i++) {
          const x = fijo(i + 7) * W, y = ((t - T_EST - 1000) * (0.35 + fijo(i + 3) * 0.5) * k + fijo(i + 11) * X(300)) - X(300);
          if (y > H) continue;
          c.save(); c.translate(x + Math.sin(t / 300 + i) * X(20), y); c.rotate(t / 200 + i);
          c.fillStyle = ['#ffc83d', '#ff3b3b', '#25d366', '#4da3ff', '#ffffff'][i % 5]; c.fillRect(-X(8), -X(4), X(16), X(8)); c.restore();
        }
      }
      // Llamado final: juega gratis + enlace con ?ref=
      const aC = t > T_CTA ? ease(prog(t, T_CTA, T_CTA + 400)) : 0;
      if (aC > 0) {
        c.globalAlpha = aC;
        const y = H - X(250) + (1 - aC) * X(60);
        c.fillStyle = '#e9edf5'; c.font = `700 ${X(44)}px ${CAB}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(ajustar(c, T('clip.reto'), W - X(120), X(44), 700, CAB), W / 2, y - X(40));
        redondo(c, X(60), y + X(20), W - X(120), X(100), X(50)); c.fillStyle = '#25d366'; c.fill();
        c.fillStyle = '#06210f'; c.fillText(ajustar(c, T('clip.juega') + ' · ' + JUEGO, W - X(180), X(50), 800, CAB), W / 2, y + X(72));
        c.fillStyle = '#c9d2e3'; c.font = `600 ${X(32)}px ${CUE}`;
        c.fillText(ajustar(c, linkCorto, W - X(140), X(32), 600, CUE), W / 2, y + X(170));
        c.globalAlpha = 1;
      }
    };
  }

  /* ---------- Grabar ---------- */
  // Arma el clip y lo graba. alAvanzar(0..1). Devuelve una promesa con { blob, mime, w, h, ms } y .cancelar()
  function grabar(d, op) {
    op = op || {};
    let cancelado = false, rec = null, timer = null, rechazar = null;
    const p = new Promise((resolve, reject) => {
      rechazar = reject;
      if (!soporta()) { reject(new Error('sin-grabador')); return; }
      const peq = lento();
      const W = peq ? 720 : 1080, H = peq ? 1280 : 1920, FPS = peq ? 24 : 30;
      const dur = typeof root.__CLIP_DUR_MS === 'number' ? root.__CLIP_DUR_MS : DUR_MS;
      const cv = root.document.createElement('canvas'); cv.width = W; cv.height = H;
      const fuentes = root.document.fonts && root.document.fonts.ready ? Promise.race([root.document.fonts.ready, new Promise((r) => setTimeout(r, 800))]) : Promise.resolve();
      fuentes.then(() => imagenEscena(d, 2400, 400)).then((img) => {
        if (cancelado) return;
        const cuadro = pintor(cv, d, img);
        cuadro(0);
        const stream = cv.captureStream(FPS);
        const mime = mimeVideo() || '';
        try { rec = new root.MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: peq ? 2500000 : 4500000 } : {}); }
        catch (e) { rec = new root.MediaRecorder(stream); }
        const trozos = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };
        rec.onerror = (e) => { clearTimeout(timer); reject(e && e.error ? e.error : new Error('grabador')); };
        rec.onstop = () => {
          clearTimeout(timer);
          try { stream.getTracks().forEach((tr) => tr.stop()); } catch (e) { /* nada */ }
          if (cancelado) return;
          const tipo = (rec.mimeType || mime || 'video/webm').split(';')[0];
          const blob = new Blob(trozos, { type: tipo });
          if (!blob.size) { reject(new Error('vacio')); return; }
          resolve({ blob, mime: tipo, w: W, h: H, ms: dur });
        };
        const t0 = performance.now();
        rec.start(1000);
        // Un cuadro cada 1/FPS s (con setTimeout y no requestAnimationFrame: sigue aunque la pestaña quede atrás);
        // el dibujo depende del tiempo real, así un cuadro perdido no alarga el video
        const paso = () => {
          if (cancelado) return;
          const t = performance.now() - t0;
          try { cuadro(Math.min(t, dur)); } catch (e) { /* un cuadro malo no corta el video */ }
          try { if (op.alAvanzar) op.alAvanzar(Math.min(1, t / dur)); } catch (e) { /* nada */ }
          if (t >= dur) { try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { reject(e); } return; }
          timer = setTimeout(paso, 1000 / FPS);
        };
        paso();
      }).catch((e) => { if (!cancelado) reject(e); });
    });
    p.cancelar = () => {
      cancelado = true; clearTimeout(timer);
      try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) { /* nada */ }
      if (rechazar) rechazar(Object.assign(new Error('cancelado'), { name: 'AbortError' }));
    };
    return p;
  }

  /* ---------- Pastilla de avance (no tapa el juego) ---------- */
  function pastillaEl() {
    const D = root.document;
    let el = D.getElementById('clip-prog');
    if (!el) { el = D.createElement('div'); el.id = 'clip-prog'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); D.body.appendChild(el); }
    return el;
  }
  function quitarPastilla() { const el = root.document.getElementById('clip-prog'); if (el) el.remove(); }
  function pintarAvance(n) {
    const el = pastillaEl();
    const pct = Math.round(n * 100);
    if (!el.querySelector('.clip-barra')) {
      el.className = 'clip-p';
      el.innerHTML = `<div class="clip-fila">${icono('cam_pro')}<span class="clip-txt"></span>
        <button class="btn sm clip-x" data-ext="clip" data-acc="cancelar">${esc(T('clip.cancelar'))}</button></div>
        <div class="clip-barra"><i></i></div>`;
    }
    el.querySelector('.clip-txt').textContent = T('clip.armando', { n: pct });
    el.querySelector('.clip-barra i').style.width = pct + '%';
    el.dataset.pct = String(pct);
  }
  function puedeArchivo(f) { try { return !!(f && root.navigator.canShare && root.navigator.canShare({ files: [f] })); } catch (e) { return false; } }
  function archivoDe(h) {
    try { return typeof File === 'function' ? new File([h.blob], 'envivo-tycoon.' + h.ext, { type: h.mime }) : null; } catch (e) { return null; }
  }
  function pintarListo() {
    const el = pastillaEl();
    const comparte = puedeArchivo(archivoDe(hecho));
    el.className = 'clip-p clip-ok';
    el.dataset.listo = '1';
    el.innerHTML = `<div class="clip-fila">${icono('star')}<span class="clip-txt">${esc(T('clip.listo'))}</span>
      <button class="btn sm clip-x" data-ext="clip" data-acc="cerrar" aria-label="${esc(T('clip.cerrar'))}">${icono('close') || '×'}</button></div>
      <button class="btn main clip-sh" data-ext="clip" data-acc="${comparte ? 'compartir' : 'descargar'}">${esc(T(comparte ? 'clip.compartir' : 'clip.descargar'))}</button>`;
  }

  /* ---------- Flujo ---------- */
  const toast = (m) => { try { if (ctx && ctx.toast) ctx.toast(m); } catch (e) { /* nada */ } };
  function imagenDeRespaldo() {
    // Lo de siempre: la imagen (Compartir) o, sin ella, WhatsApp
    try { if (root.Compartir && root.Compartir.clic) { root.Compartir.clic(ctx, 'img-res'); root.__clipRespaldo = (root.__clipRespaldo || 0) + 1; return true; } } catch (e) { /* nada */ }
    return false;
  }
  function empezar(d) {
    d = d || ultimo;
    if (!d) return null;
    if (tarea) return tarea;    // ya se está armando uno
    if (!soporta()) { imagenDeRespaldo(); return null; }
    hecho = null;
    pintarAvance(0);
    const p = grabar(d, { alAvanzar: pintarAvance });
    tarea = p;
    p.then((h) => {
      tarea = null;
      hecho = { blob: h.blob, mime: h.mime, ext: /mp4/.test(h.mime) ? 'mp4' : 'webm', datos: d, w: h.w, h: h.h };
      root.__clipUltimo = { size: h.blob.size, mime: h.mime, w: h.w, h: h.h, ms: h.ms };
      pintarListo();
    }).catch((e) => {
      tarea = null;
      if (e && e.name === 'AbortError') { quitarPastilla(); toast(T('clip.cancelado')); return; }
      try { console.warn('[clip]', e); } catch (e2) { /* nada */ }
      quitarPastilla();
      toast(T('clip.fallo'));
      imagenDeRespaldo();
    });
    return p;
  }
  function cancelar() { if (tarea && tarea.cancelar) tarea.cancelar(); else quitarPastilla(); }
  function mensaje(d) {
    const p = d && d.productora ? '«' + d.productora + '»' : '';
    return T('clip.msg', { p }).replace(/\s{2,}/g, ' ').replace(/\s+([,.:!?])/g, '$1');
  }
  function descargar() {
    if (!hecho) return false;
    try {
      const D = root.document, url = URL.createObjectURL(hecho.blob);
      const a = D.createElement('a'); a.href = url; a.download = 'envivo-tycoon.' + hecho.ext; a.rel = 'noopener';
      D.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* nada */ } }, 60000);
      root.__clipDescargado = (root.__clipDescargado || 0) + 1;
      toast(T('clip.descargado'));
      return true;
    } catch (e) { return false; }
  }
  async function compartir() {
    if (!hecho) return false;
    const f = archivoDe(hecho);
    if (puedeArchivo(f)) {
      try {
        await root.navigator.share({ files: [f], title: 'EN VIVO Tycoon', text: mensaje(hecho.datos) + ' ' + (hecho.datos.enlace || '') });
        root.__clipCompartido = (root.__clipCompartido || 0) + 1;
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;   // el jugador cerró el menú
      }
    }
    return descargar();
  }

  /* ---------- Bloque del resultado ---------- */
  function resultado(r, fresh, c) {
    if (c) ctx = c;
    if (!merece(r)) { ultimo = null; return ''; }
    ultimo = datosDe(r, c);
    return `<div class="clip-res" data-clip="bloque"><div class="clip-tit">${icono('cam_pro')} ${esc(T('clip.titulo'))}</div>
      <button class="btn clip-btn" data-ext="clip" data-acc="grabar">${icono('play')}${esc(T('clip.boton'))}</button></div>`;
  }
  function clic(c, acc) {
    if (c) ctx = c;
    switch (acc) {
      case 'grabar': empezar(ultimo); break;
      case 'cancelar': cancelar(); break;
      case 'compartir': compartir(); break;
      case 'descargar': descargar(); break;
      case 'cerrar': quitarPastilla(); hecho = null; break;
      default: break;
    }
  }

  /* ---------- CSS ---------- */
  function css() {
    const D = root.document;
    if (!D || D.getElementById('clip-css')) return;
    const st = D.createElement('style');
    st.id = 'clip-css';
    st.textContent = '.clip-res{margin:10px 0;padding:10px;border:1px solid #ff3b3b55;border-radius:12px;background:#ff3b3b12}'
      + '.clip-tit{font-weight:700;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:6px}'
      + '.clip-btn{margin:0;width:100%;justify-content:center;font-weight:700}'
      + '#clip-prog{position:fixed;left:50%;transform:translateX(-50%);top:calc(8px + env(safe-area-inset-top,0px));z-index:10050;'
      + 'width:min(420px,calc(100vw - 32px));box-sizing:border-box;padding:10px 12px;border-radius:14px;background:var(--panel,#161a22);'
      + 'border:1px solid var(--line,#2a3242);box-shadow:0 10px 30px -10px #000;color:var(--text,#e9edf5)}'
      + '.clip-fila{display:flex;align-items:center;gap:8px}.clip-fila .btn{margin:0;width:auto}.clip-txt{flex:1;font-size:14px;font-weight:600;min-width:0}'
      + '.clip-barra{margin-top:8px;height:6px;border-radius:3px;background:#2a3242;overflow:hidden}'
      + '.clip-barra i{display:block;height:100%;width:0;background:#ff3b3b;transition:width .3s linear}'
      + '.clip-ok{border-color:#25d36688}.clip-sh{margin:8px 0 0;width:100%}';
    (D.head || D.documentElement).appendChild(st);
  }

  /* ---------- Arranque ---------- */
  root.EnVivoInicio = root.EnVivoInicio || [];
  root.EnVivoInicio.push({ id: 'clip', orden: 999, tarjeta: () => '', clic: (c, acc, el) => clic(c, acc, el) });
  root.ClipVideo = { DUR_MS, merece, jugada, datosDe, soporta, lento, mimeVideo, grabar, empezar, cancelar, compartir, descargar, resultado, clic,
    listo: () => hecho, enCurso: () => !!tarea };
  if (root.document && root.document.createElement) css();
})(typeof window !== 'undefined' ? window : globalThis);
