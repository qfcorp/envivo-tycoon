/* EN VIVO Tycoon — efectos de sonido y ambiente.
   Todo se sintetiza con la Web Audio API (sin archivos, sin librerías, sin red).

   API (window.Sound):
     Sound.unlock()          crea/reanuda el AudioContext (llamar desde un toque del usuario).
     Sound.play(name, arg)   reproduce un efecto. 'stars' acepta arg = 1..5.
     Sound.ambience(kind)    'crowd' | 'room' | null (detener). Una sola a la vez.
     Sound.setMuted(bool)    silencia / activa (se guarda en localStorage 'envivo_muted').
     Sound.isMuted()         devuelve true/false.
     Sound.names             lista de nombres válidos para play().

   Si no hay AudioContext (Node, navegador viejo) o algo falla, todo es no-op:
   nunca lanza errores. */
(function (root) {
  'use strict';

  var MASTER_VOL = 0.35;
  var STORE_KEY = 'envivo_muted';
  var FADE = 0.5;

  var ctx = null;          // AudioContext real
  var chainIn = null;      // entrada del bus maestro
  var muted = false;
  var wantAmb = null;      // ambiente pedido por el juego
  var amb = null;          // { kind, gain, nodes[] } ambiente sonando
  var lastPlay = {};       // anti-spam por nombre

  // ---------- estado persistido ----------
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      muted = localStorage.getItem(STORE_KEY) === '1';
    }
  } catch (e) { muted = false; }

  function saveMuted() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem(STORE_KEY, muted ? '1' : '0');
      }
    } catch (e) { /* almacenamiento bloqueado: ignorar */ }
  }

  function getCtor() {
    try {
      if (typeof window === 'undefined') return null;
      return window.AudioContext || window.webkitAudioContext || null;
    } catch (e) { return null; }
  }

  // ---------- utilidades ----------
  // Pseudoaleatorio con semilla, para que los sonidos sean siempre iguales.
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  // Bus maestro: ganancia -> compresor suave (evita picos) -> salida.
  function buildChain(c, dest) {
    var g = c.createGain();
    g.gain.value = muted ? 0 : MASTER_VOL;
    var comp = null;
    try {
      comp = c.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
    } catch (e) { comp = null; }
    if (comp) { g.connect(comp); comp.connect(dest || c.destination); }
    else g.connect(dest || c.destination);
    return g;
  }

  function noiseBuffer(c, kind) {
    var cache = c.__envivoNoise || (c.__envivoNoise = {});
    if (cache[kind]) return cache[kind];
    var secs = kind === 'loop' ? 4 : 2;
    var len = Math.floor(c.sampleRate * secs);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    var r = rng(kind === 'loop' ? 777 : 1234);
    if (kind === 'loop') {
      // ruido rosado (Paul Kellet, versión económica): más cálido para el murmullo
      var b0 = 0, b1 = 0, b2 = 0;
      for (var i = 0; i < len; i++) {
        var w = r() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      }
      // fundido de los bordes para que el bucle no haga clic
      var f = Math.floor(c.sampleRate * 0.05);
      for (var j = 0; j < f; j++) {
        var k = j / f;
        d[j] *= k; d[len - 1 - j] *= k;
      }
    } else {
      for (var n = 0; n < len; n++) d[n] = r() * 2 - 1;
    }
    cache[kind] = buf;
    return buf;
  }

  // Envolvente: 0 -> vol (attack) -> 0 (hasta dur). Siempre termina en silencio.
  function env(param, t, vol, attack, dur, curve) {
    var a = Math.max(0.002, attack || 0.005);
    var end = t + Math.max(dur, a + 0.01);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(vol, t + a);
    if (curve === 'lin') param.linearRampToValueAtTime(0.0001, end);
    else param.exponentialRampToValueAtTime(0.0001, end);
    param.setValueAtTime(0, end + 0.005);
    return end;
  }

  // Tono simple. o: {type, attack, to (frecuencia final), lp (filtro), detune, curve, vib, vibRate}
  function tone(c, out, t, freq, dur, vol, o) {
    o = o || {};
    var osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) {
      if (o.toLin) osc.frequency.linearRampToValueAtTime(o.to, t + dur);
      else osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    }
    if (o.detune) osc.detune.value = o.detune;
    var g = c.createGain();
    var node = osc;
    if (o.lp) {
      var f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur);
      f.Q.value = o.q || 0.7;
      osc.connect(f); node = f;
    }
    if (o.vib) {
      var lfo = c.createOscillator();
      var lg = c.createGain();
      lfo.frequency.value = o.vibRate || 6;
      lg.gain.value = o.vib;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    node.connect(g); g.connect(out);
    var end = env(g.gain, t, vol, o.attack, dur, o.curve);
    osc.start(t); osc.stop(end + 0.02);
    return end;
  }

  // Ráfaga de ruido filtrado. o: {ft (tipo filtro), f, fTo, q, attack, curve, hp, offset}
  function noise(c, out, t, dur, vol, o) {
    o = o || {};
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 'white');
    src.loop = true;
    var f = c.createBiquadFilter();
    f.type = o.ft || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    f.Q.value = o.q || 0.8;
    var g = c.createGain();
    src.connect(f);
    var last = f;
    if (o.hp) {
      var h = c.createBiquadFilter();
      h.type = 'highpass'; h.frequency.value = o.hp;
      f.connect(h); last = h;
    }
    last.connect(g); g.connect(out);
    var end = env(g.gain, t, vol, o.attack, dur, o.curve);
    src.start(t, (o.offset || 0) % 1.5); src.stop(end + 0.02);
    return end;
  }

  function hz(semis) { return 440 * Math.pow(2, semis / 12); } // 0 = A4
  var C5 = hz(3), D5 = hz(5), E5 = hz(7), G5 = hz(10), A5 = hz(12), B5 = hz(14),
      C6 = hz(15), E6 = hz(19), G6 = hz(22), G4 = hz(-2), E4 = hz(-5), C4 = hz(-9);

  // ---------- catálogo de efectos ----------
  // Cada uno: function (c, out, t, arg) -> devuelve el tiempo final aproximado.
  var SFX = {
    tap: function (c, o, t) {
      return tone(c, o, t, 880, 0.07, 0.5, { to: 620, attack: 0.003 });
    },

    buy: function (c, o, t) {
      // mecanismo de caja: dos clics + "ka-ching"
      noise(c, o, t, 0.03, 0.35, { f: 3000, q: 1.2, attack: 0.002 });
      noise(c, o, t + 0.07, 0.03, 0.3, { f: 2200, q: 1.2, attack: 0.002 });
      tone(c, o, t + 0.12, 2093, 0.5, 0.22, { attack: 0.003 });
      tone(c, o, t + 0.12, 2637, 0.45, 0.14, { attack: 0.003 });
      tone(c, o, t + 0.2, 3136, 0.55, 0.12, { attack: 0.003 });
      return t + 0.8;
    },

    hire: function (c, o, t) {
      var ns = [C5, E5, G5, C6];
      for (var i = 0; i < ns.length; i++) {
        tone(c, o, t + i * 0.08, ns[i], i === 3 ? 0.5 : 0.22, 0.24, { type: 'triangle', attack: 0.005 });
      }
      return t + 0.8;
    },

    error: function (c, o, t) {
      tone(c, o, t, 150, 0.13, 0.3, { type: 'square', lp: 700, attack: 0.005 });
      tone(c, o, t + 0.16, 130, 0.18, 0.3, { type: 'square', lp: 600, attack: 0.005 });
      return t + 0.4;
    },

    live: function (c, o, t) {
      // barrido ascendente + golpe de acorde: "¡AL AIRE!"
      tone(c, o, t, 180, 0.35, 0.16, { type: 'sawtooth', to: 880, lp: 600, lpTo: 4000, attack: 0.2, curve: 'lin' });
      noise(c, o, t, 0.35, 0.12, { ft: 'highpass', f: 1500, attack: 0.3, curve: 'lin' });
      var hit = t + 0.35;
      noise(c, o, hit, 0.25, 0.28, { f: 2500, q: 0.5, attack: 0.002 });
      tone(c, o, hit, 110, 0.45, 0.4, { to: 55, attack: 0.003 });
      var ch = [hz(0), hz(4), hz(7), hz(12)];
      for (var i = 0; i < ch.length; i++) {
        tone(c, o, hit, ch[i], 0.7, 0.13, { type: 'sawtooth', lp: 2600, lpTo: 900, attack: 0.008, detune: (i % 2 ? 6 : -6) });
      }
      return hit + 0.8;
    },

    incident: function (c, o, t) {
      for (var i = 0; i < 3; i++) {
        tone(c, o, t + i * 0.24, 880, 0.11, 0.2, { type: 'square', lp: 2200, attack: 0.004, curve: 'lin' });
        tone(c, o, t + i * 0.24 + 0.12, 660, 0.11, 0.2, { type: 'square', lp: 2000, attack: 0.004, curve: 'lin' });
      }
      return t + 0.75;
    },

    good: function (c, o, t) {
      tone(c, o, t, E5, 0.14, 0.26, { type: 'triangle' });
      tone(c, o, t + 0.1, A5, 0.35, 0.26, { type: 'triangle' });
      tone(c, o, t + 0.1, hz(16), 0.35, 0.08, { type: 'sine' });
      return t + 0.5;
    },

    bad: function (c, o, t) {
      tone(c, o, t, G4, 0.2, 0.26, { type: 'triangle', detune: -10 });
      tone(c, o, t + 0.18, hz(-6), 0.45, 0.26, { type: 'triangle', to: hz(-7), detune: -15 });
      return t + 0.7;
    },

    stars: function (c, o, t, n) {
      n = Math.max(1, Math.min(5, Math.round(+n || 3)));
      var scale = [C5, E5, G5, C6, E6, G6];
      var step = 0.11;
      var end = t;
      if (n <= 2) {
        // resultado flojo: dos o tres notas tranquilas, quinta abierta
        var low = [C5, D5, E5];
        for (var i = 0; i <= n; i++) end = tone(c, o, t + i * 0.16, low[i], 0.3, 0.2, { type: 'triangle' });
        var tt = t + (n + 1) * 0.16;
        tone(c, o, tt, C5, 0.6, 0.12, { type: 'triangle' });
        end = tone(c, o, tt, G5, 0.6, 0.1, { type: 'triangle' });
        return end;
      }
      for (var k = 0; k <= n; k++) {
        tone(c, o, t + k * step, scale[k], 0.25, 0.2, { type: 'triangle' });
        // "estrellita" brillante encima
        tone(c, o, t + k * step, scale[k] * 2, 0.12, 0.05, { type: 'sine' });
      }
      var ct = t + (n + 1) * step;
      var dur = 0.4 + n * 0.18;
      var chord = n >= 5 ? [C5, E5, G5, C6, E6] : n === 4 ? [C5, E5, G5, C6] : [C5, E5, G5];
      for (var j = 0; j < chord.length; j++) {
        end = tone(c, o, ct, chord[j], dur, 0.11, { type: 'triangle', attack: 0.01, vib: n >= 4 ? 3 : 0, vibRate: 5 });
      }
      if (n >= 4) noise(c, o, ct, dur, 0.06, { ft: 'highpass', f: 6000, attack: 0.01 });
      return end;
    },

    chapter: function (c, o, t) {
      // fanfarria de metales (sierra filtrada)
      var seq = [[G4, 0, 0.12], [G4, 0.14, 0.12], [G4, 0.28, 0.12], [C5, 0.42, 0.5], [E5, 0.9, 0.16], [G5, 1.06, 0.16]];
      for (var i = 0; i < seq.length; i++) {
        tone(c, o, t + seq[i][1], seq[i][0], seq[i][2], 0.2, { type: 'sawtooth', lp: 2200, attack: 0.02, curve: 'lin' });
      }
      var ct = t + 1.24;
      var chord = [C4, C5, E5, G5, C6];
      for (var j = 0; j < chord.length; j++) {
        tone(c, o, ct, chord[j], 1.3, 0.1, { type: 'sawtooth', lp: 2800, lpTo: 1200, attack: 0.03, detune: (j % 2 ? 5 : -5), vib: 2.5, vibRate: 5 });
      }
      noise(c, o, ct - 0.25, 1.4, 0.1, { ft: 'highpass', f: 5000, attack: 0.3 });
      tone(c, o, ct, 65, 0.6, 0.35, { to: 45 });
      return ct + 1.4;
    },

    day: function (c, o, t) {
      tone(c, o, t, C5, 0.7, 0.14, { attack: 0.08 });
      tone(c, o, t + 0.18, G5, 0.8, 0.12, { attack: 0.08 });
      tone(c, o, t + 0.36, E6, 0.9, 0.06, { attack: 0.1 });
      return t + 1.3;
    },

    // ---- imprevistos ----
    cable: function (c, o, t) {
      tone(c, o, t, 2400, 0.16, 0.16, { type: 'sawtooth', to: 90, lp: 5000 });
      var r = rng(42);
      for (var i = 0; i < 7; i++) {
        var tt = t + 0.02 + r() * 0.35;
        noise(c, o, tt, 0.02 + r() * 0.03, 0.25 + r() * 0.2, { f: 2500 + r() * 4000, q: 1.5, attack: 0.001 });
      }
      tone(c, o, t + 0.05, 120, 0.3, 0.1, { type: 'square', lp: 800, curve: 'lin' });
      return t + 0.5;
    },

    internet: function (c, o, t) {
      var fs = [1200, 2400, 1800, 2400, 1200, 980, 2100, 1500, 600];
      var d = 0;
      for (var i = 0; i < fs.length; i++) {
        var len = i % 3 === 2 ? 0.08 : 0.045;
        tone(c, o, t + d, fs[i], len, 0.12, { type: 'square', lp: 3500, attack: 0.002, curve: 'lin' });
        d += len + 0.025;
      }
      // "se cae": tono bajando
      tone(c, o, t + d, 900, 0.3, 0.12, { type: 'square', to: 200, lp: 1500 });
      return t + d + 0.35;
    },

    luz: function (c, o, t) {
      noise(c, o, t, 0.03, 0.35, { f: 1800, q: 1, attack: 0.001 });
      tone(c, o, t, 220, 0.9, 0.22, { type: 'sawtooth', to: 28, lp: 2200, lpTo: 90, attack: 0.01, curve: 'lin' });
      tone(c, o, t, 110, 0.9, 0.2, { to: 20, attack: 0.01, curve: 'lin' });
      noise(c, o, t, 0.8, 0.15, { ft: 'lowpass', f: 3000, fTo: 150, attack: 0.02 });
      return t + 1.0;
    },

    lluvia: function (c, o, t) {
      noise(c, o, t, 2.6, 0.32, { f: 3200, q: 0.4, attack: 0.5, curve: 'lin', hp: 600 });
      noise(c, o, t, 2.6, 0.18, { ft: 'lowpass', f: 900, attack: 0.6, curve: 'lin', offset: 0.7 });
      var r = rng(99);
      for (var i = 0; i < 14; i++) {
        var tt = t + 0.3 + r() * 1.9;
        tone(c, o, tt, 2500 + r() * 2500, 0.03, 0.03 + r() * 0.03, { attack: 0.001, to: 1500 });
      }
      return t + 2.7;
    },

    tarde: function (c, o, t) {
      for (var i = 0; i < 6; i++) {
        var tt = t + i * 0.28;
        noise(c, o, tt, 0.025, 0.4, { f: i % 2 ? 2200 : 3200, q: 4, attack: 0.001 });
        tone(c, o, tt, i % 2 ? 1400 : 1900, 0.03, 0.08, { attack: 0.001 });
      }
      return t + 1.7;
    },

    acople: function (c, o, t) {
      // pitido de retroalimentación: corto y contenido
      var osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2300, t);
      osc.frequency.linearRampToValueAtTime(2650, t + 0.45);
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.42);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.58);
      g.gain.setValueAtTime(0, t + 0.6);
      osc.connect(g); g.connect(o);
      osc.start(t); osc.stop(t + 0.62);
      tone(c, o, t + 0.05, 2300 * 1.5, 0.45, 0.025, { attack: 0.35, curve: 'lin' });
      return t + 0.62;
    },

    bateria: function (c, o, t) {
      tone(c, o, t, 880, 0.12, 0.22, { type: 'square', lp: 2000, attack: 0.004, curve: 'lin' });
      tone(c, o, t + 0.2, 587, 0.2, 0.22, { type: 'square', lp: 1600, attack: 0.004, curve: 'lin' });
      return t + 0.45;
    },

    logo: function (c, o, t) {
      tone(c, o, t, 1568, 0.7, 0.24, { attack: 0.002 });
      tone(c, o, t, 1568 * 2.76, 0.3, 0.05, { attack: 0.002 });
      tone(c, o, t + 0.12, 2093, 0.8, 0.16, { attack: 0.002 });
      return t + 0.95;
    },

    falla: function (c, o, t) {
      var r = rng(7);
      var d = 0;
      for (var i = 0; i < 12; i++) {
        var len = 0.015 + r() * 0.04;
        if (r() < 0.55) noise(c, o, t + d, len, 0.2 + r() * 0.2, { f: 400 + r() * 5000, q: 0.8 + r() * 3, attack: 0.001, curve: 'lin' });
        else tone(c, o, t + d, 80 + r() * 900, len, 0.12, { type: 'square', lp: 3000, attack: 0.001, curve: 'lin' });
        d += len + r() * 0.03;
      }
      return t + d + 0.05;
    },

    epico: function (c, o, t) {
      // ovación del público: ruido que crece y se va
      noise(c, o, t, 2.4, 0.3, { f: 900, q: 0.6, attack: 0.7 });
      noise(c, o, t, 2.4, 0.16, { f: 2400, q: 0.7, attack: 0.9, offset: 0.4 });
      noise(c, o, t, 2.2, 0.12, { ft: 'lowpass', f: 400, attack: 0.6, offset: 0.9 });
      // silbido de dos tonos
      var w = t + 0.5;
      tone(c, o, w, 1900, 0.22, 0.07, { to: 2700, attack: 0.03, curve: 'lin' });
      tone(c, o, w + 0.28, 2700, 0.4, 0.07, { to: 1800, attack: 0.02, vib: 30, vibRate: 9 });
      return t + 2.5;
    },

    vip: function (c, o, t) {
      for (var i = 0; i < 3; i++) {
        var tt = t + i * 0.2;
        noise(c, o, tt, 0.018, 0.4, { ft: 'highpass', f: 2500, attack: 0.001 });
        noise(c, o, tt + 0.05, 0.035, 0.3, { f: 1500, q: 1.2, attack: 0.001 });
      }
      return t + 0.7;
    },
  };

  var NAMES = Object.keys(SFX);

  // Dibuja un efecto en cualquier contexto (real u offline). Uso interno y pruebas.
  function renderInto(c, out, name, arg, t) {
    var fn = SFX[name];
    if (!fn) return 0;
    return fn(c, out, t == null ? c.currentTime + 0.01 : t, arg);
  }

  // ---------- ambiente ----------
  function startAmbience(kind) {
    if (!ctx || !chainIn) return;
    var c = ctx, t = c.currentTime;
    var nodes = [];
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.connect(chainIn);
    var target = kind === 'crowd' ? 0.55 : 0.22;
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 'loop');
    src.loop = true;
    nodes.push(src);
    if (kind === 'crowd') {
      // murmullo de estadio: dos bandas de voz + leve "oleaje"
      var b1 = c.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = 450; b1.Q.value = 0.7;
      var b2 = c.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = 1300; b2.Q.value = 0.9;
      var g1 = c.createGain(); g1.gain.value = 0.7;
      var g2 = c.createGain(); g2.gain.value = 0.3;
      src.connect(b1); b1.connect(g1); g1.connect(g);
      src.connect(b2); b2.connect(g2); g2.connect(g);
      var lfo = c.createOscillator(); lfo.frequency.value = 0.13;
      var lg = c.createGain(); lg.gain.value = 0.25;
      lfo.connect(lg); lg.connect(g1.gain);
      var lfo2 = c.createOscillator(); lfo2.frequency.value = 0.31;
      var lg2 = c.createGain(); lg2.gain.value = 120;
      lfo2.connect(lg2); lg2.connect(b2.frequency);
      lfo.start(t); lfo2.start(t);
      nodes.push(lfo, lfo2);
    } else {
      // sala interior: murmullo muy bajo, grave
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.5;
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
      var gb = c.createGain(); gb.gain.value = 0.25;
      src.connect(lp); lp.connect(g);
      src.connect(bp); bp.connect(gb); gb.connect(g);
      var lfo3 = c.createOscillator(); lfo3.frequency.value = 0.09;
      var lg3 = c.createGain(); lg3.gain.value = 0.12;
      lfo3.connect(lg3); lg3.connect(gb.gain);
      lfo3.start(t);
      nodes.push(lfo3);
    }
    src.start(t);
    g.gain.exponentialRampToValueAtTime(target, t + FADE);
    amb = { kind: kind, gain: g, nodes: nodes };
  }

  function stopAmbience() {
    if (!amb) return;
    var a = amb; amb = null;
    try {
      var t = ctx.currentTime;
      a.gain.gain.cancelScheduledValues(t);
      a.gain.gain.setValueAtTime(Math.max(0.0001, a.gain.gain.value), t);
      a.gain.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
      for (var i = 0; i < a.nodes.length; i++) {
        try { a.nodes[i].stop(t + FADE + 0.05); } catch (e) { /* ya detenido */ }
      }
      setTimeout(function () { try { a.gain.disconnect(); } catch (e) { /* nada */ } }, (FADE + 0.2) * 1000);
    } catch (e) { /* nada */ }
  }

  function syncAmbience() {
    try {
      var desired = muted ? null : wantAmb;
      if (amb && amb.kind === desired) return;
      if (amb) stopAmbience();
      if (desired && ctx) startAmbience(desired);
    } catch (e) { /* silencioso */ }
  }

  // ---------- API pública ----------
  function unlock() {
    try {
      if (!ctx) {
        var Ctor = getCtor();
        if (!Ctor) return;
        ctx = new Ctor();
        chainIn = buildChain(ctx);
        // truco iOS: reproducir un búfer silencioso dentro del gesto
        try {
          var b = ctx.createBuffer(1, 1, 22050);
          var s = ctx.createBufferSource();
          s.buffer = b; s.connect(ctx.destination); s.start(0);
        } catch (e) { /* nada */ }
        try {
          if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', function () {
              try {
                if (!ctx) return;
                if (document.hidden) ctx.suspend();
                else ctx.resume();
              } catch (e) { /* nada */ }
            });
          }
        } catch (e) { /* nada */ }
      }
      if (ctx.state === 'suspended' && ctx.resume) {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
      syncAmbience();
    } catch (e) { ctx = null; chainIn = null; }
  }

  function play(name, arg) {
    try {
      if (muted || !ctx || !chainIn || !SFX[name]) return;
      if (ctx.state === 'suspended' && ctx.resume) {
        var p = ctx.resume();
        if (p && p.catch) p.catch(function () {});
      }
      var now = Date.now();
      if (lastPlay[name] && now - lastPlay[name] < 40) return; // evita amontonar el mismo sonido
      lastPlay[name] = now;
      renderInto(ctx, chainIn, name, arg);
    } catch (e) { /* silencioso */ }
  }

  function ambience(kind) {
    try {
      wantAmb = kind === 'crowd' || kind === 'room' ? kind : null;
      syncAmbience();
    } catch (e) { /* silencioso */ }
  }

  function setMuted(v) {
    try {
      muted = !!v;
      saveMuted();
      if (ctx && chainIn) {
        var t = ctx.currentTime;
        chainIn.gain.cancelScheduledValues(t);
        chainIn.gain.setValueAtTime(chainIn.gain.value, t);
        chainIn.gain.linearRampToValueAtTime(muted ? 0 : MASTER_VOL, t + 0.08);
      }
      syncAmbience();
    } catch (e) { /* silencioso */ }
  }

  function isMuted() { return muted; }

  var Sound = {
    unlock: unlock,
    play: play,
    ambience: ambience,
    setMuted: setMuted,
    isMuted: isMuted,
    names: NAMES.slice(),
    // Solo para pruebas: dibuja un efecto (con el bus maestro) en un contexto dado,
    // p. ej. un OfflineAudioContext. Devuelve el tiempo final.
    _render: function (c, name, arg) {
      try {
        var bus = buildChain(c, c.destination);
        bus.gain.value = MASTER_VOL;
        return renderInto(c, bus, name, arg, 0.01);
      } catch (e) { return 0; }
    },
  };

  try { if (root) root.Sound = Sound; } catch (e) { /* nada */ }
  if (typeof module !== 'undefined' && module && module.exports) module.exports = Sound;
})(typeof window !== 'undefined' ? window : null);
