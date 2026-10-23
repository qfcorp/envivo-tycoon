/* EN VIVO Tycoon — música de fondo.
   Todo se sintetiza con la Web Audio API (sin archivos, sin librerías, sin red).
   Un secuenciador por pasos (semicorcheas) programa batería, bajo, acordes y melodía
   con un planificador "lookahead" (setInterval de 25 ms + reloj del AudioContext).

   API (window.Musica):
     Musica.iniciar()          crea/reanuda el AudioContext (llamar desde un toque). Se puede
                               llamar muchas veces. Si no se eligió tema, arranca 'menu'.
     Musica.tema(nombre)       cambia de tema con fundido cruzado (~1.5 s):
                               'menu' | 'preparacion' | 'en_vivo' | 'concierto' | 'tension' |
                               'victoria' (4 compases y vuelve al tema anterior) | 'funeral'.
     Musica.stinger()          golpe de "última hora" (breaking news) encima de lo que suene.
     Musica.parar()            detiene la música (fundido).
     Musica.setVolumen(0..1)   volumen de la música (por defecto 0.18), aparte de los efectos.
     Musica.getVolumen()
     Musica.setMuted(bool)     silencia / activa (localStorage 'envivo_musica_muted').
     Musica.isMuted()          si nunca se tocó, sigue a Sound.isMuted().
     Musica.temaActual()       nombre del tema pedido (o null).
     Musica.temas              lista de temas válidos.

   Si no hay AudioContext (Node, navegador viejo) o algo falla, todo es no-op:
   nunca lanza errores. */
(function (root) {
  'use strict';

  var VOL_DEF = 0.18;
  var STORE_KEY = 'envivo_musica_muted';
  var XF = 1.5;            // fundido cruzado entre temas (s)
  var AHEAD = 0.15;        // cuánto adelante se programa (s)
  var TICK_MS = 25;
  var MAX_VOCES = 30;      // límite de voces simultáneas por tema

  var ctx = null;          // AudioContext real
  var bus = null;          // ganancia de la música (volumen × silencio)
  var volumen = VOL_DEF;
  var guardado = null;     // '1' silenciada, '0' activada a propósito, null = sigue a Sound
  var actual = null;       // jugador sonando
  var saliente = null;     // jugador que se está apagando
  var deseado = null;      // tema que pidió el juego
  var previo = null;       // tema al que vuelve 'victoria'
  var parado = false;      // se llamó parar(): iniciar() no arranca 'menu'
  var timer = null;
  var oculto = false;
  var mutedAplicado = null;
  var ultimoStinger = -10;

  // ---------- estado persistido ----------
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      var g0 = localStorage.getItem(STORE_KEY);
      guardado = g0 === '1' || g0 === '0' ? g0 : null;
    }
  } catch (e) { guardado = null; }

  function saveMuted() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) localStorage.setItem(STORE_KEY, guardado);
    } catch (e) { /* almacenamiento bloqueado: ignorar */ }
  }

  function soundMuted() {
    try {
      var S = root && root.Sound;
      return !!(S && typeof S.isMuted === 'function' && S.isMuted());
    } catch (e) { return false; }
  }

  function isMuted() {
    if (guardado === '1') return true;
    if (guardado === '0') return false;
    return soundMuted();
  }

  function getCtor() {
    try {
      if (typeof window === 'undefined') return null;
      return window.AudioContext || window.webkitAudioContext || null;
    } catch (e) { return null; }
  }

  // ---------- utilidades ----------
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function buildChain(c, dest, vol) {
    var g = c.createGain();
    g.gain.value = vol;
    var comp = null;
    try {
      comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 3;
      comp.attack.value = 0.008;
      comp.release.value = 0.25;
    } catch (e) { comp = null; }
    if (comp) { g.connect(comp); comp.connect(dest); } else g.connect(dest);
    return g;
  }

  function noiseBuffer(c) {
    if (c.__musicaNoise) return c.__musicaNoise;
    var len = Math.floor(c.sampleRate * 1.5);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    var r = rng(4321);
    for (var i = 0; i < len; i++) d[i] = r() * 2 - 1;
    c.__musicaNoise = buf;
    return buf;
  }

  function distCurve(c) {
    if (c.__musicaDist) return c.__musicaDist;
    var n = 1024, cur = new Float32Array(n), k = 3.2, nk = Math.tanh(k);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; cur[i] = Math.tanh(k * x) / nk; }
    c.__musicaDist = cur;
    return cur;
  }

  // ---------- voces ----------
  // Límite de voces: P.voces guarda el tiempo final de cada nota activa.
  function permitir(P, t, n, prio) {
    var v = P.voces;
    for (var i = v.length - 1; i >= 0; i--) if (v[i] <= t) v.splice(i, 1);
    var lim = MAX_VOCES - (prio === 2 ? 0 : prio === 1 ? 4 : 8);
    return v.length + n <= lim;
  }
  function ocupar(P, end) { P.voces.push(end); }

  // Oscilador con envolvente. o: {type, a, sus, r, lp, lpTo, q, to, toT, det, dest}
  function voz(P, t, f, dur, vol, o) {
    o = o || {};
    var c = P.c;
    var osc = c.createOscillator();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.toT || dur));
    if (o.det) osc.detune.value = o.det;
    var node = osc;
    if (o.lp) {
      var fl = c.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) fl.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur);
      fl.Q.value = o.q || 0.7;
      osc.connect(fl); node = fl;
    }
    var g = c.createGain();
    var a = Math.max(0.002, o.a || 0.005);
    var end;
    if (o.sus) {
      var r = o.r || 0.3;
      var hold = Math.max(t + a, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + a);
      g.gain.setValueAtTime(vol, hold);
      g.gain.linearRampToValueAtTime(0, hold + r);
      end = hold + r;
    } else {
      end = t + Math.max(dur, a + 0.02);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      g.gain.setValueAtTime(0, end + 0.005);
    }
    node.connect(g); g.connect(o.dest || P.out);
    osc.start(t); osc.stop(end + 0.03);
    ocupar(P, end);
    return end;
  }

  // Ruido filtrado. o: {ft, f, fTo, q, a}
  function ruido(P, t, dur, vol, o) {
    o = o || {};
    var c = P.c;
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    var fl = c.createBiquadFilter();
    fl.type = o.ft || 'bandpass';
    fl.frequency.setValueAtTime(o.f || 1000, t);
    if (o.fTo) fl.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    fl.Q.value = o.q || 0.8;
    var g = c.createGain();
    var a = Math.max(0.001, o.a || 0.002);
    var end = t + Math.max(dur, a + 0.01);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.gain.setValueAtTime(0, end + 0.005);
    src.connect(fl); fl.connect(g); g.connect(o.dest || P.out);
    src.start(t, (P.noff = ((P.noff || 0) + 0.37) % 1.2)); src.stop(end + 0.03);
    ocupar(P, end);
    return end;
  }

  // ---------- instrumentos ----------
  function kick(P, t, v) { if (permitir(P, t, 1, 2)) voz(P, t, 150, 0.32, v, { type: 'sine', to: 44, toT: 0.09, a: 0.002 }); }
  function snare(P, t, v) {
    if (!permitir(P, t, 2, 2)) return;
    ruido(P, t, 0.17, v, { ft: 'bandpass', f: 1900, q: 0.6 });
    voz(P, t, 200, 0.09, v * 0.55, { type: 'triangle', to: 150, a: 0.002 });
  }
  function rim(P, t, v) { if (permitir(P, t, 1, 1)) ruido(P, t, 0.04, v, { ft: 'bandpass', f: 3300, q: 3 }); }
  function clap(P, t, v) {
    if (!permitir(P, t, 2, 2)) return;
    ruido(P, t, 0.03, v * 0.7, { ft: 'bandpass', f: 1400, q: 1 });
    ruido(P, t + 0.014, 0.14, v, { ft: 'bandpass', f: 1200, q: 0.9 });
  }
  function hat(P, t, v, abierto) { if (permitir(P, t, 1, 1)) ruido(P, t, abierto ? 0.2 : 0.035, v, { ft: 'highpass', f: 7200, q: 0.7, a: 0.001 }); }
  function tom(P, t, f, v) { if (permitir(P, t, 1, 2)) voz(P, t, f, 0.38, v, { type: 'sine', to: f * 0.62, toT: 0.25, a: 0.002 }); }
  function crash(P, t, v) { if (permitir(P, t, 1, 1)) ruido(P, t, 1.5, v, { ft: 'highpass', f: 5200, q: 0.5, a: 0.002 }); }
  function bajo(P, t, m, dur, v, o) {
    o = o || {};
    if (permitir(P, t, 1, 2)) voz(P, t, mtof(m), dur, v, { type: o.type || 'triangle', lp: o.lp || 900, q: o.q, a: 0.006 });
  }
  function acorde(P, t, notas, dur, v, o) {
    o = o || {};
    if (!permitir(P, t, notas.length, 1)) return;
    for (var i = 0; i < notas.length; i++) {
      voz(P, t, mtof(notas[i]), dur, v, {
        type: o.type || 'triangle', sus: o.sus, a: o.a, r: o.r, lp: o.lp, lpTo: o.lpTo, q: o.q,
        det: o.det ? (i % 2 ? o.det : -o.det) : 0, dest: o.dest,
      });
    }
  }
  function nota(P, t, m, dur, v, o) {
    o = o || {};
    if (permitir(P, t, 1, o.prio == null ? 0 : o.prio)) {
      voz(P, t, mtof(m), dur, v, { type: o.type || 'square', lp: o.lp || 2400, a: o.a || 0.01, sus: o.sus, r: o.r, dest: o.dest, det: o.det });
    }
  }
  function campana(P, t, m, dur, v) {
    if (!permitir(P, t, 2, 0)) return;
    voz(P, t, mtof(m), dur, v, { type: 'sine', a: 0.004 });
    voz(P, t, mtof(m) * 2.0, dur * 0.4, v * 0.25, { type: 'sine', a: 0.003 });
  }
  // Bus de guitarra distorsionada (uno por tema, creado al primer uso).
  function dist(P) {
    if (P.dist) return P.dist;
    var c = P.c;
    var pre = c.createGain(); pre.gain.value = 1.6;
    var ws = c.createWaveShaper(); ws.curve = distCurve(c); ws.oversample = 'none';
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.6;
    var post = c.createGain(); post.gain.value = 0.16;
    pre.connect(ws); ws.connect(lp); lp.connect(post); post.connect(P.out);
    P.dist = pre;
    return pre;
  }

  // Melodía procedural: por compás elige una plantilla rítmica y notas de la escala,
  // con notas del acorde en tiempos fuertes y movimiento por grados.
  function melodia(r, compases, plantillas, escala, acordeDe, pSilencio, desde) {
    var out = [];
    var idx = Math.floor(escala.length / 2);
    for (var b = 0; b < compases; b++) {
      var bar = {};
      out.push(bar);
      if (b < (desde || 0) || r() < pSilencio) continue;
      var tpl = plantillas[Math.floor(r() * plantillas.length)];
      var pcs = acordeDe(b);
      for (var k = 0; k < tpl.length; k++) {
        var s = tpl[k];
        var mov = Math.floor(r() * 5) - 2;
        if (mov === 0 && r() < 0.5) mov = r() < 0.5 ? -1 : 1;
        idx = Math.max(0, Math.min(escala.length - 1, idx + mov));
        if (s % 4 === 0) {
          // nota del acorde más cercana
          var best = idx, bd = 99;
          for (var j = 0; j < escala.length; j++) {
            if (pcs.indexOf(escala[j] % 12) >= 0 && Math.abs(j - idx) < bd) { bd = Math.abs(j - idx); best = j; }
          }
          idx = best;
        }
        var sig = k + 1 < tpl.length ? tpl[k + 1] : 16;
        bar[s] = [escala[idx], Math.max(1, Math.min(6, sig - s))];
      }
    }
    return out;
  }
  function pcsDe(notas) { var o = []; for (var i = 0; i < notas.length; i++) o.push(notas[i] % 12); return o; }

  // ---------- temas ----------
  // Cada tema: bpm, compases, swing, semilla, alLoop(P) al inicio de cada vuelta, paso(P, s, t).
  // P.bar = compás, P.s = semicorchea (0..15), P.loop = vuelta, P.rnd = azar de la vuelta, P.d = semicorchea (s).

  // menú: lo-fi alegre en Do
  var MENU_A = [[41, [53, 57, 60, 64]], [40, [52, 55, 59, 62]], [38, [50, 53, 57, 60]], [36, [48, 52, 55, 59]]];
  var MENU_B = [[45, [52, 55, 57, 60]], [38, [53, 57, 60, 64]], [43, [53, 57, 59, 64]], [36, [52, 55, 59, 62]]];
  function menuCh(bar) { return (bar < 8 ? MENU_A : MENU_B)[bar % 4]; }

  // preparación: Re menor, tic-tac de reloj
  var PREP_A = [[38, [53, 57, 62]], [34, [53, 58, 62]], [41, [53, 57, 60]], [36, [52, 55, 60]]];
  var PREP_B = [[43, [55, 58, 62]], [34, [53, 58, 62]], [38, [53, 57, 62]], [33, [52, 57, 61]]];
  function prepCh(bar) { return (bar < 8 ? PREP_A : PREP_B)[bar % 4]; }

  // en vivo: Si menor heroico, estilo noticiero deportivo
  var VIVO_A = [[35, [54, 59, 62]], [31, [55, 59, 62]], [38, [54, 57, 62]], [33, [52, 57, 61]]];
  var VIVO_B = [[31, [55, 59, 62]], [33, [52, 57, 61]], [35, [54, 59, 62]], [35, [54, 59, 62]],
                [31, [55, 59, 62]], [33, [52, 57, 61]], [38, [54, 57, 62]], [33, [52, 57, 61]]];
  function vivoCh(bar) { return bar < 8 ? VIVO_A[bar % 4] : VIVO_B[bar - 8]; }
  var VIVO_HOOK = [
    { 0: [66, 3], 3: [69, 3], 6: [71, 2], 8: [74, 4], 12: [73, 4] },
    { 0: [71, 3], 3: [69, 3], 6: [66, 2], 8: [69, 8] },
    { 0: [66, 3], 3: [69, 3], 6: [71, 2], 8: [74, 4], 12: [76, 4] },
    { 0: [78, 3], 3: [76, 3], 6: [74, 2], 8: [71, 8] },
  ];

  // concierto: rock en Mi menor
  var ROCK_A = [[40, [52, 59, 64]], [36, [48, 55, 60]], [43, [43, 50, 55]], [38, [50, 57, 62]]];
  var ROCK_B = [[36, [48, 55, 60]], [38, [50, 57, 62]], [40, [52, 59, 64]], [40, [52, 59, 64]],
                [36, [48, 55, 60]], [38, [50, 57, 62]], [35, [47, 54, 59]], [35, [47, 54, 59]]];
  function rockCh(bar) { return bar < 8 ? ROCK_A[bar % 4] : ROCK_B[bar - 8]; }

  // tensión: Do menor, pulso grave
  var TENS = [[36, [55, 60, 63]], [32, [56, 60, 63]], [29, [56, 60, 65]], [31, [55, 59, 62]]];
  function tensCh(bar) { return TENS[Math.floor(bar / 2) % 4]; }

  // funeral: La menor, solo pads
  var FUN = [[45, [57, 60, 64]], [41, [57, 60, 65]], [36, [55, 60, 64]], [43, [55, 59, 62]],
             [45, [57, 60, 64]], [38, [57, 62, 65]], [40, [56, 59, 64]], [45, [57, 60, 64]]];
  function funCh(bar) { return FUN[Math.floor(bar / 2) % 8]; }

  // victoria: fanfarria en Do, 4 compases
  var VIC_MEL = [[0, 67, 2], [2, 67, 1], [3, 67, 1], [4, 72, 4], [8, 76, 2], [10, 79, 6],
                 [16, 77, 3], [19, 76, 1], [20, 74, 4], [24, 76, 2], [26, 77, 2], [28, 79, 4],
                 [32, 81, 4], [36, 79, 2], [38, 77, 2], [40, 76, 4], [44, 74, 4], [48, 72, 14]];
  var VIC_CH = [[36, [55, 60, 64]], [41, [57, 60, 65]], [43, [55, 59, 62]], [36, [55, 60, 64, 67]]];

  var TEMAS = {
    menu: {
      bpm: 92, compases: 16, swing: 0.16, semilla: 11,
      alLoop: function (P) {
        var r = P.rnd;
        P.v = { k7: r() < 0.5, antic: r() < 0.6, ghost: 0.08 + r() * 0.12 };
        P.mel = melodia(r, 16, [[0, 3, 6, 10], [2, 6, 8, 12], [0, 4, 7], [0, 6, 10, 14], [4, 8, 11]],
          [60, 62, 64, 67, 69, 72, 74, 76, 79],
          function (b) { return pcsDe(menuCh(b)[1]); }, P.loop === 0 ? 0.35 : 0.25, P.loop === 0 ? 8 : 0);
      },
      paso: function (P, s, t) {
        var r = P.rnd, d = P.d, ch = menuCh(P.bar);
        if (s === 0 || s === 10 || (s === 7 && P.v.k7)) kick(P, t, s === 0 ? 0.6 : 0.45);
        if (s === 4 || s === 12) snare(P, t, 0.3);
        if (s % 2 === 0) hat(P, t, s % 4 === 0 ? 0.12 : 0.08);
        else if (r() < P.v.ghost) hat(P, t, 0.045);
        if (P.bar % 8 === 7 && s >= 13 && r() < 0.6) snare(P, t, 0.1);
        if (s === 0) bajo(P, t, ch[0], d * 6, 0.42, { lp: 700 });
        if (s === 10) bajo(P, t, ch[0] + (r() < 0.5 ? 7 : 12), d * 4, 0.32, { lp: 700 });
        if (s === 14 && r() < 0.35) bajo(P, t, ch[0] + 12, d * 2, 0.24, { lp: 700 });
        if (s === 0) acorde(P, t, ch[1], 2.2, 0.065, { type: 'triangle', lp: 1900, a: 0.01 });
        if (s === 11 && P.v.antic && r() < 0.5) acorde(P, t, ch[1], 0.9, 0.035, { type: 'triangle', lp: 1500, a: 0.01 });
        var ev = P.mel && P.mel[P.bar] && P.mel[P.bar][s];
        if (ev) campana(P, t, ev[0], ev[1] * d + 0.35, 0.075);
      },
    },

    preparacion: {
      bpm: 100, compases: 16, swing: 0, semilla: 23,
      alLoop: function (P) {
        var r = P.rnd;
        var pats = [[0, 1, 2, 1], [0, 2, 1, 2], [2, 1, 0, 1], [0, 1, 2, 3]];
        P.v = { arp: pats[Math.floor(r() * pats.length)], k10: r() < 0.5 + P.loop * 0.2 };
        P.mel = melodia(r, 16, [[0, 8], [0, 6, 12], [4, 12], [0]], [62, 64, 65, 67, 69, 70, 72, 74],
          function (b) { return pcsDe(prepCh(b)[1]); }, 0.3, 8);
      },
      paso: function (P, s, t) {
        var r = P.rnd, d = P.d, ch = prepCh(P.bar);
        if (s === 0 || s === 8 || (s === 10 && P.v.k10)) kick(P, t, s === 0 ? 0.5 : 0.38);
        if (s === 12) rim(P, t, 0.22);
        if (s === 4 && P.bar % 2 === 1) rim(P, t, 0.14);
        hat(P, t, s % 4 === 0 ? 0.09 : 0.045, P.bar % 4 === 3 && s === 14);
        if (s % 2 === 0) {
          var up = (s === 6 || s === 14) && r() < 0.4 ? 12 : 0;
          bajo(P, t, ch[0] + up, d * 1.6, s === 0 ? 0.34 : 0.26, { type: 'sawtooth', lp: 420 });
        } else {
          var notas = ch[1];
          var k = P.v.arp[((s - 1) / 2) % 4];
          var m = k === 3 ? notas[0] + 24 : notas[k] + 12;
          nota(P, t, m, d * 1.8, 0.06, { type: 'triangle', lp: 2600, a: 0.003, prio: 0 });
        }
        if (s === 0) acorde(P, t, [ch[1][0] - 12, ch[1][1] - 12, ch[1][2] - 12], 16 * d, 0.035,
          { type: 'sawtooth', sus: true, a: 0.5, r: 0.5, lp: 700 });
        var ev = P.mel && P.mel[P.bar] && P.mel[P.bar][s];
        if (ev) nota(P, t, ev[0], ev[1] * d, 0.06, { type: 'triangle', lp: 2000, a: 0.04, sus: true, r: 0.25 });
      },
    },

    en_vivo: {
      bpm: 124, compases: 16, swing: 0, semilla: 37,
      alLoop: function (P) {
        var r = P.rnd;
        P.v = { k14: r() < 0.5, pad: r() < 0.7 };
        P.mel = melodia(r, 16, [[0, 3, 6, 8, 12], [0, 2, 4, 8], [0, 6, 8, 10, 12], [0, 4, 8, 12]],
          [62, 64, 66, 69, 71, 73, 74, 76, 78],
          function (b) { return pcsDe(vivoCh(b)[1]); }, 0.2, 8);
      },
      paso: function (P, s, t) {
        var r = P.rnd, d = P.d, ch = vivoCh(P.bar), bar = P.bar;
        var fill = bar % 8 === 7 && s >= 8;
        if (!fill && (s % 4 === 0 || (s === 14 && P.v.k14))) kick(P, t, 0.55);
        if (!fill && (s === 4 || s === 12)) clap(P, t, 0.3);
        if (fill && s % 2 === 0) tom(P, t, [220, 180, 150, 120][(s - 8) / 2], 0.32);
        if (fill && s === 15) snare(P, t, 0.25);
        if (s % 4 === 2) hat(P, t, 0.1, true); else hat(P, t, s % 2 ? 0.05 : 0.07);
        if (s === 0 && (bar === 0 || bar === 8)) crash(P, t, 0.13);
        if (s === 0 && bar % 4 === 0) tom(P, t, 75, 0.35);
        if (s % 2 === 0) bajo(P, t, ch[0] + (s % 4 === 2 ? 12 : 0), d * 1.7, 0.28, { type: 'sawtooth', lp: 650 });
        var stabs = bar % 2 === 0 ? { 0: 3, 6: 2, 10: 4 } : { 0: 6, 12: 2, 14: 2 };
        if (stabs[s] && (s === 0 || r() < 0.85)) acorde(P, t, ch[1], stabs[s] * d, 0.065, { type: 'sawtooth', lp: 2400, lpTo: 900, a: 0.01, det: 6 });
        if (bar >= 8 && P.v.pad && s === 0) acorde(P, t, [ch[1][0] - 12, ch[1][2] - 12], 16 * d, 0.03, { type: 'sawtooth', sus: true, a: 0.3, r: 0.3, lp: 1100 });
        var ev = null;
        if (bar < 8) {
          var hb = bar % 4;
          if (hb < 2) ev = VIVO_HOOK[(bar < 4 ? 0 : 2) + hb][s];
        } else ev = P.mel && P.mel[bar] && P.mel[bar][s];
        if (ev) nota(P, t, ev[0], ev[1] * d * 0.92, 0.06, { type: 'square', lp: 2600, a: 0.008, sus: true, r: 0.08, prio: 1 });
      },
    },

    concierto: {
      bpm: 112, compases: 16, swing: 0, semilla: 41,
      alLoop: function (P) {
        var r = P.rnd;
        P.v = { k10: r() < 0.6 };
        P.mel = melodia(r, 16, [[0, 3, 6, 8, 12], [0, 4, 6, 8], [0, 8, 10], [2, 4, 8, 12, 14]],
          [64, 67, 69, 71, 74, 76, 79, 81],
          function (b) { return pcsDe(rockCh(b)[1]); }, 0.25, P.loop === 0 ? 12 : 8);
      },
      paso: function (P, s, t) {
        var r = P.rnd, d = P.d, ch = rockCh(P.bar), bar = P.bar;
        var fill = bar % 8 === 7 && s >= 12;
        if (s === 0 || s === 8 || s === 6 || (s === 10 && P.v.k10)) kick(P, t, 0.55);
        if (s === 4 || s === 12 || (fill && s > 12)) snare(P, t, fill && s > 12 ? 0.26 : 0.36);
        if (s % 2 === 0 && !fill) hat(P, t, s % 4 === 0 ? 0.11 : 0.08, bar % 4 === 3 && s === 14);
        if (s === 0 && bar % 4 === 0) crash(P, t, 0.14);
        if (s % 2 === 0) bajo(P, t, ch[0], d * 1.7, 0.3, { type: 'sawtooth', lp: 520 });
        var g = dist(P);
        var acento = s === 0 || (bar < 8 && s === 6) || (bar >= 8 && s === 8);
        if (acento) acorde(P, t, ch[1], d * (bar >= 8 ? 7 : 5), 0.45, { type: 'sawtooth', lp: 3200, a: 0.004, dest: g });
        else if (s % 2 === 0 && !(bar >= 8 && s > 0 && s < 8) && !(bar < 8 && s > 6 && s < 8))
          acorde(P, t, [ch[1][0], ch[1][1]], d * 1.2, 0.32, { type: 'sawtooth', lp: 1300, a: 0.003, dest: g });
        var ev = P.mel && P.mel[bar] && P.mel[bar][s];
        if (ev) nota(P, t, ev[0], ev[1] * d, 0.055, { type: 'sawtooth', lp: 2200, a: 0.01, sus: true, r: 0.12, det: 4, prio: 1 });
      },
    },

    tension: {
      bpm: 96, compases: 16, swing: 0, semilla: 53,
      alLoop: function (P) {
        var r = P.rnd;
        P.v = { doble: P.loop > 0 || r() < 0.4 };
      },
      paso: function (P, s, t) {
        var r = P.rnd, d = P.d, ch = tensCh(P.bar), bar = P.bar;
        if (s === 0) kick(P, t, 0.55);
        if (s === 3) kick(P, t, 0.32);
        if (P.v.doble && bar >= 8 && s === 8) kick(P, t, 0.45);
        if (P.v.doble && bar >= 8 && s === 11) kick(P, t, 0.26);
        if (s % 4 === 0) hat(P, t, 0.06);
        if (s === 12 && bar % 2 === 1) rim(P, t, 0.12);
        if (s % 2 === 0) bajo(P, t, ch[0] + (s === 0 ? 0 : 12), d * 1.5, s === 0 ? 0.36 : 0.24, { type: 'sawtooth', lp: 300 });
        if (s === 0 && bar % 2 === 0) {
          acorde(P, t, ch[1], 32 * d, 0.03, { type: 'sawtooth', sus: true, a: 0.8, r: 0.6, lp: 900, det: 8 });
          if (bar % 4 === 0) acorde(P, t, [ch[0] + 12, ch[0] + 24], d * 6, 0.09, { type: 'sawtooth', lp: 600, lpTo: 200, a: 0.01 });
        }
        if (bar >= 8 && s === 0 && bar % 2 === 1) nota(P, t, 79, 16 * d, 0.025, { type: 'triangle', sus: true, a: 1, r: 0.6, lp: 3000 });
        if (s === 8 && r() < 0.22) campana(P, t, [72, 71, 75, 68][Math.floor(r() * 4)], 1.2, 0.05);
      },
    },

    victoria: {
      bpm: 120, compases: 4, swing: 0, semilla: 61, once: true, cola: 2.0,
      paso: function (P, s, t) {
        var d = P.d, bar = P.bar, i = bar * 16 + s;
        for (var k = 0; k < VIC_MEL.length; k++) {
          if (VIC_MEL[k][0] === i) {
            var m = VIC_MEL[k];
            var dur = m[2] * d * (m[2] > 8 ? 1 : 0.9);
            acorde(P, t, [m[1], m[1] - 12], dur, 0.085, { type: 'sawtooth', sus: true, a: 0.02, r: m[2] > 8 ? 0.9 : 0.08, lp: 2600, det: 5 });
          }
        }
        var ch = VIC_CH[bar];
        if (s === 0) {
          acorde(P, t, ch[1], bar === 3 ? 14 * d : 16 * d, 0.04, { type: 'sawtooth', sus: true, a: 0.05, r: bar === 3 ? 1.2 : 0.2, lp: 1800 });
          bajo(P, t, ch[0], bar === 3 ? 3.0 : 16 * d, 0.36, { lp: 600 });
        }
        if (s % 4 === 0 && bar < 3) tom(P, t, s === 0 ? 90 : 70, s === 0 ? 0.42 : 0.28);
        if (bar === 2 && s >= 8) snare(P, t, 0.08 + (s - 8) * 0.025);
        if (bar === 0 && s === 0) crash(P, t, 0.12);
        if (bar === 3 && s === 0) { crash(P, t, 0.16); kick(P, t, 0.6); tom(P, t, 65, 0.45); }
        if (bar < 3 && (s === 4 || s === 12)) snare(P, t, 0.2);
      },
    },

    funeral: {
      bpm: 60, compases: 16, swing: 0, semilla: 71,
      alLoop: function (P) {
        P.mel = melodia(P.rnd, 16, [[0], [0, 8], [4], [8]], [69, 72, 74, 76, 79],
          function (b) { return pcsDe(funCh(b)[1]); }, 0.45, P.loop === 0 ? 4 : 0);
      },
      paso: function (P, s, t) {
        var d = P.d, ch = funCh(P.bar);
        if (s === 0 && P.bar % 2 === 0) {
          acorde(P, t, ch[1], 32 * d - 0.4, 0.06, { type: 'triangle', sus: true, a: 1.4, r: 1.6, lp: 1100 });
          bajo(P, t, ch[0] - 12, 32 * d, 0.22, { type: 'sine', lp: 400 });
          if (P.rnd() < 0.5) acorde(P, t, [ch[1][1] + 12], 32 * d - 0.4, 0.025, { type: 'sine', sus: true, a: 2, r: 1.6 });
        }
        var ev = P.mel && P.mel[P.bar] && P.mel[P.bar][s];
        if (ev) campana(P, t, ev[0], 2.2, 0.05);
      },
    },
  };

  var NOMBRES = Object.keys(TEMAS);

  // "Última hora": barrido + tres golpes de metales y timbal (≈1.6 s)
  function dibujarStinger(P, t) {
    ruido(P, t, 0.4, 0.12, { ft: 'bandpass', f: 600, fTo: 6000, q: 1.2, a: 0.35 });
    voz(P, t, 220, 0.4, 0.06, { type: 'sawtooth', to: 880, lp: 3000, a: 0.3 });
    var hits = [[0.4, 0.12, [62, 66, 69, 74]], [0.58, 0.12, [62, 66, 69, 74]], [0.76, 0.9, [61, 66, 69, 73]]];
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i], th = t + h[0];
      for (var j = 0; j < h[2].length; j++) {
        voz(P, th, mtof(h[2][j]), h[1], 0.08, { type: 'sawtooth', lp: 3200, lpTo: 1000, a: 0.006, det: j % 2 ? 7 : -7 });
      }
      voz(P, th, mtof(h[2][0] - 24), h[1] + 0.2, 0.3, { type: 'triangle', lp: 700, a: 0.004 });
      voz(P, th, 110, 0.35, 0.45, { type: 'sine', to: 50, toT: 0.15, a: 0.002 });
    }
    ruido(P, t + 0.76, 1.2, 0.12, { ft: 'highpass', f: 5000, q: 0.5 });
    return t + 1.9;
  }

  // ---------- jugador (un tema sonando) ----------
  function crearJugador(c, dest, nombre, t0, fade) {
    var def = TEMAS[nombre];
    var out = c.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.linearRampToValueAtTime(1, t0 + Math.max(0.05, fade || 0.05));
    out.connect(dest);
    return {
      c: c, nombre: nombre, def: def, out: out, voces: [], dist: null,
      d: 60 / def.bpm / 4, i: 0, next: t0, loop: 0, bar: 0, s: 0,
      rnd: rng(1), sem: (Math.floor(Math.random() * 65536) + 1) >>> 0,
      v: {}, mel: null, terminado: false, finT: 0, stopAt: 0,
    };
  }

  function pasoJugador(P) {
    var def = P.def;
    var total = def.compases * 16;
    var idx = P.i;
    if (def.once && idx >= total) { P.terminado = true; P.finT = P.next + (def.cola || 1.5); return; }
    var enLoop = idx % total;
    if (enLoop === 0) {
      P.loop = Math.floor(idx / total);
      P.rnd = rng(def.semilla * 7919 + P.loop * 104729 + P.sem);
      P.v = {};
      if (def.alLoop) { try { def.alLoop(P); } catch (e) { /* tema sigue sin variación */ } }
    }
    P.bar = Math.floor(enLoop / 16);
    P.s = enLoop % 16;
    var t = P.next + ((P.s & 1) ? def.swing * P.d : 0);
    try { def.paso(P, P.s, t); } catch (e) { /* un paso fallido no detiene la música */ }
    P.i++;
    P.next += P.d;
  }

  function programar(P, hasta, ahora) {
    var guard = 0;
    while (P.next < hasta && !P.terminado && guard++ < 512) {
      if (ahora != null && P.next < ahora) P.next = ahora + 0.03; // tras un tirón: realinear, no ráfaga
      pasoJugador(P);
    }
  }

  function soltar(P, despues) {
    if (!P) return;
    var f = function () { try { P.out.disconnect(); } catch (e) { /* nada */ } };
    if (despues > 0 && typeof setTimeout === 'function') setTimeout(f, despues * 1000); else f();
  }

  function apagar(P, t, dur) {
    try {
      var g = P.out.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(0.0001, t + dur);
      P.stopAt = t + dur;
    } catch (e) { /* nada */ }
  }

  // ---------- motor en tiempo real ----------
  function asegurarTimer() {
    try {
      if (!timer && ctx && !oculto && typeof setInterval === 'function') timer = setInterval(tick, TICK_MS);
    } catch (e) { /* nada */ }
  }
  function pararTimer() { try { if (timer) clearInterval(timer); } catch (e) { /* nada */ } timer = null; }

  function aplicarMute(m) {
    mutedAplicado = m;
    if (!ctx || !bus) return;
    var t = ctx.currentTime;
    try {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(m ? 0 : volumen, t + 0.3);
    } catch (e) { /* nada */ }
    if (m) {
      // silenciada: deja de programar (ahorra CPU); al activar vuelve a empezar el tema
      if (actual) { apagar(actual, t, 0.3); soltar(actual, 0.4); actual = null; }
      if (saliente) { soltar(saliente, 0.4); saliente = null; }
      if (deseado === 'victoria') deseado = previo;
    }
  }

  function arrancar(nombre, fade) {
    if (!ctx || !bus || !TEMAS[nombre]) return;
    actual = crearJugador(ctx, bus, nombre, ctx.currentTime + 0.06, fade);
  }

  function cambiar(nombre) {
    deseado = nombre || null;
    if (!ctx || !bus || isMuted() || oculto) return;
    if (actual && actual.nombre === deseado) return;
    var t = ctx.currentTime;
    if (saliente) { apagar(saliente, t, 0.08); soltar(saliente, 0.15); saliente = null; }
    if (actual) { apagar(actual, t, XF); saliente = actual; actual = null; }
    if (deseado) arrancar(deseado, XF);
    asegurarTimer();
  }

  function tick() {
    try {
      if (!ctx || oculto) return;
      var m = isMuted();
      if (m !== mutedAplicado) aplicarMute(m);
      if (m) { if (!deseado) pararTimer(); return; }
      if (!actual && deseado) arrancar(deseado, 0.6);
      var ahora = ctx.currentTime;
      var hasta = ahora + AHEAD;
      if (actual) programar(actual, hasta, ahora);
      if (saliente) {
        if (ahora >= saliente.stopAt) { soltar(saliente, 0.1); saliente = null; }
        else programar(saliente, Math.min(hasta, saliente.stopAt), ahora);
      }
      if (actual && actual.def.once && actual.terminado && ahora >= actual.finT - 1.2) {
        var v = previo && previo !== actual.nombre ? previo : 'menu';
        previo = null;
        cambiar(v);
      }
      if (!actual && !saliente && !deseado) pararTimer();
    } catch (e) { /* silencioso */ }
  }

  function onVisibility() {
    try {
      if (!ctx) return;
      if (document.hidden) {
        oculto = true;
        pararTimer();
        var p = ctx.suspend && ctx.suspend();
        if (p && p.catch) p.catch(function () {});
      } else {
        oculto = false;
        var q = ctx.resume && ctx.resume();
        if (q && q.catch) q.catch(function () {});
        asegurarTimer();
      }
    } catch (e) { /* nada */ }
  }

  // ---------- API pública ----------
  function iniciar() {
    try {
      if (!ctx) {
        var Ctor = getCtor();
        if (!Ctor) return;
        ctx = new Ctor();
        mutedAplicado = isMuted();
        bus = buildChain(ctx, ctx.destination, mutedAplicado ? 0 : volumen);
        try {
          if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', onVisibility);
            oculto = !!document.hidden;
          }
        } catch (e) { /* nada */ }
      }
      if (ctx.state === 'suspended' && ctx.resume && !oculto) {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
      if (!deseado && !parado) deseado = 'menu';
      if (deseado) asegurarTimer();
      tick();
    } catch (e) { ctx = null; bus = null; }
  }

  function tema(nombre) {
    try {
      if (nombre == null) { parar(); return; }
      if (!TEMAS[nombre]) return;
      parado = false;
      if (nombre === 'victoria') {
        if (!ctx || isMuted() || oculto) return; // no se oiría: no cambia el tema pedido
        if (deseado !== 'victoria') previo = deseado;
      }
      cambiar(nombre);
      if (ctx) asegurarTimer();
    } catch (e) { /* silencioso */ }
  }

  function parar() {
    try {
      parado = true;
      previo = null;
      cambiar(null);
    } catch (e) { /* silencioso */ }
  }

  function stinger() {
    try {
      if (!ctx || !bus || isMuted() || oculto) return;
      var t = ctx.currentTime;
      if (t - ultimoStinger < 1.2) return;
      ultimoStinger = t;
      var g = ctx.createGain();
      g.gain.value = 1;
      g.connect(bus);
      var P = { c: ctx, out: g, voces: [] };
      var end = dibujarStinger(P, t + 0.03);
      soltar({ out: g }, end - t + 0.3);
      if (actual) {
        // baja el tema mientras suena el golpe
        var ag = actual.out.gain;
        ag.cancelScheduledValues(t);
        ag.setValueAtTime(Math.max(0.0001, ag.value), t);
        ag.linearRampToValueAtTime(0.4, t + 0.08);
        ag.setValueAtTime(0.4, t + 1.1);
        ag.linearRampToValueAtTime(1, t + 1.9);
      }
    } catch (e) { /* silencioso */ }
  }

  function setVolumen(v) {
    try {
      v = Number(v);
      if (!isFinite(v)) return;
      volumen = Math.max(0, Math.min(1, v));
      if (ctx && bus && !isMuted()) {
        var t = ctx.currentTime;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(bus.gain.value, t);
        bus.gain.linearRampToValueAtTime(volumen, t + 0.1);
      }
    } catch (e) { /* silencioso */ }
  }

  function setMuted(v) {
    try {
      guardado = v ? '1' : '0';
      saveMuted();
      if (ctx) {
        aplicarMute(isMuted());
        if (!isMuted() && deseado) { asegurarTimer(); tick(); }
      }
    } catch (e) { /* silencioso */ }
  }

  var Musica = {
    iniciar: iniciar,
    tema: tema,
    stinger: stinger,
    parar: parar,
    setVolumen: setVolumen,
    getVolumen: function () { return volumen; },
    setMuted: setMuted,
    isMuted: function () { try { return isMuted(); } catch (e) { return false; } },
    temaActual: function () { return deseado; },
    temas: NOMBRES.slice(),
    // Solo para pruebas: dibuja `segundos` de un tema (o 'stinger') en un contexto dado,
    // p. ej. un OfflineAudioContext, con el mismo bus maestro. Devuelve el tiempo final.
    _render: function (c, nombre, segundos, vol) {
      try {
        var g = buildChain(c, c.destination, vol == null ? volumen : vol);
        if (nombre === 'stinger') return dibujarStinger({ c: c, out: g, voces: [] }, 0.05);
        if (!TEMAS[nombre]) return 0;
        var P = crearJugador(c, g, nombre, 0.05, 0.05);
        programar(P, P.def.once ? 120 : (segundos || 8), null); // un tema 'once' se dibuja completo
        return P.terminado ? P.finT : (segundos || 8);
      } catch (e) { return 0; }
    },
  };

  try { if (root) root.Musica = Musica; } catch (e) { /* nada */ }
  if (typeof module !== 'undefined' && module && module.exports) module.exports = Musica;
})(typeof window !== 'undefined' ? window : null);
