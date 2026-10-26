/* =========================================================
   EN VIVO Tycoon — Mega Festival (pantalla)
   Contrato: server/INTEGRAR_FESTIVAL.md. Cada 2 días, 24 h: tu asociación produce un festival con 6 escenarios.
   Cada turno gasta 1 Pase de Prensa. El servidor da la semilla y el contrato; el juego juega y manda SOLO sus
   decisiones; el servidor repite la jugada y guarda la calidad de verdad.
   Uso desde ui.js:
     Festival.render(elemento, ctx)
       ctx = {
         A: window.Art,                                  // íconos y escenas (Art.icon, Art.scene)
         estado(): partida actual (para elegir el mejor personal y equipos) — opcional si hay ctx.equipo()
         equipo(datos)?: { staff: [...], equip: [...] }  // si quieres elegirlo tú
         jugarIntento(seed, contrato, intento): Promise<decisiones[] | {decisiones, resultado}>  // null = lo dejó para luego
         toast?(texto), snd?(nombre), vip?: bool, pedir?(method, ruta, body)  // pedir: para pruebas o para usar Api
       }
     Festival.detener()  → para el contador (al salir de la pantalla)
   Textos: window.I18N.T si existe (claves festival.*); si no, el español de aquí.
   ========================================================= */
(function (root) {
  'use strict';
  const ES = {
    'festival.titulo': 'Mega Festival', 'festival.cargando': 'Abriendo el festival…', 'festival.reintentar': 'Intentar de nuevo',
    'festival.sin_asociacion': 'El Mega Festival se produce en equipo. Únete a una asociación (o crea una) para participar.',
    'festival.cierra_en': 'Cierra en', 'festival.abre_en': 'El próximo abre en', 'festival.descanso': 'Descanso entre festivales',
    'festival.cada': 'Cada {h} h · dura {d} h · 6 escenarios', 'festival.liga': 'Liga {liga}',
    'festival.calidad': 'Calidad del festival', 'festival.calidad_esc': 'Calidad del escenario', 'festival.hitos': 'Premios de la asociación',
    'festival.hito_ok': '¡Logrado!', 'festival.pases': 'Pases de Prensa', 'festival.pases_detalle': 'Cada turno gasta 1 pase.',
    'festival.pase_diario': 'Pasar lista hoy', 'festival.pase_vip': 'Bono VIP', 'festival.pase_misiones': 'Misiones del día {n}/{max}',
    'festival.comprar': 'Comprar pase · {precio}', 'festival.comprados': '{n}/{max} hoy', 'festival.creditos': 'créditos',
    'festival.cubrir': 'Cubrir escenario', 'festival.continuar': 'Seguir mi turno', 'festival.completo': 'Cubierto',
    'festival.completo_por': 'Lo cerró {nombre}', 'festival.sin_cubrir': 'Nadie lo ha cubierto todavía.', 'festival.cubrieron': 'Cubrieron',
    'festival.dificultad': 'Dificultad {n}', 'festival.camaras': '{n} cámaras', 'festival.aire_libre': 'Aire libre', 'festival.techo': 'Bajo techo',
    'festival.ranking': 'Aporte personal', 'festival.ranking_vacio': 'Todavía nadie cubre un escenario. ¡Sé el primero!',
    'festival.puntos': '{n} pts', 'festival.turnos': '{n} turnos', 'festival.tu': 'Tú',
    'festival.imprevistos': 'Imprevistos del festival', 'festival.ahora': 'Ahora', 'festival.imprevisto_ahora': 'Le pega a todos los escenarios',
    'festival.preparando': 'Preparando tu turno…', 'festival.validando': 'El servidor está revisando tu transmisión…',
    'festival.resultado': 'Turno en {escenario}: calidad {calidad} · +{aporte} al escenario',
    'festival.invalido': 'Ese turno no se pudo validar ({motivo}). No sumó.',
    'festival.pendiente': 'Tu turno quedó guardado: el servidor lo revisará en unos minutos.',
    'festival.sospechoso': 'El resultado de tu juego no coincide con la repetición del servidor: vale el del servidor.',
    'festival.pausado': 'Tu turno sigue abierto. Puedes seguirlo en los próximos minutos.',
    'festival.sin_pases': 'No tienes Pases de Prensa. Gánalos con las misiones del día o cómpralos.',
    'festival.compra_ok': '¡Listo! Tienes {n} pases.', 'festival.anterior': 'Último festival', 'festival.mis_premios': 'Tus premios',
    'festival.sin_premios': 'No participaste en ese festival.', 'festival.fichas': '{n} fichas', 'festival.mi_aporte': 'Tu aporte',
    'festival.puesto': 'Puesto {n}', 'festival.como': '¿Cómo funciona?',
    'festival.como_texto': 'Manda a tu mejor personal y equipos a cubrir un escenario. Cada turno suma su calidad hasta llenar el escenario. Entre todos llenen los 6 para ganar los premios de la asociación. Los imprevistos del festival cambian cada 6 horas.',
    'festival.premio_aporte': 'Desde {min} pts: {nombre}', 'festival.sin_juego': 'No se puede jugar el turno en este momento.',
    'festival.reanudado': 'Seguimos con tu turno de {escenario}.', 'festival.mapa': 'Mapa del festival',
  };
  const T = (k, p) => {
    try { if (root.I18N && root.I18N.T && (!root.I18N.T.has || root.I18N.T.has(k))) return root.I18N.T(k, p); } catch (e) { /* español */ }
    return String(ES[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  };
  const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString((root.I18N && root.I18N.idioma) || 'es-EC');

  /* Lo que el servidor deja llevar (server/src/Festival.php: equipoJuego() y EQUIPOS_SERVIDOR).
     Equipos del juego: todo el catálogo (js/datos.js); máximo por tipo según su categoría (lo que no está: 1) y fama mínima. */
  const MAX_CAT = { cam: 4, lens: 4, support: 4, wireless: 4, mics: 4, cable: 2, power: 2, rain: 2 };
  const SRV_CAT = { dron4k: 'cam', grua: 'cam', vip_cam8k: 'cam', unidad_movil: 'switcher', vip_switcher: 'switcher', generador: 'power', vip_satelital: 'internet' };
  const itemDe = (t) => { const G = root.Game; return (G && G.CATALOG && G.CATALOG[t]) || null; };
  const CAT = new Proxy({}, { get: (o, t) => SRV_CAT[t] || (itemDe(t) || {}).cat });
  const MAX_TIPO = new Proxy({}, { get: (o, t) => (SRV_CAT[t] ? 9 : itemDe(t) ? (MAX_CAT[itemDe(t).cat] || 1) : 0) });
  const SERVIDOR = ['dron4k', 'grua', 'vip_cam8k', 'unidad_movil', 'vip_switcher', 'generador', 'vip_satelital'];
  // Posiciones de los 6 escenarios en el mapa (viewBox 360x240)
  const POS = { 1: [180, 50], 2: [64, 92], 3: [296, 92], 4: [74, 176], 5: [286, 176], 6: [180, 128] };

  const st = { el: null, ctx: null, datos: null, error: '', cargando: false, ocupado: false, timer: null, desfase: 0, ultimo: null, estadoTurno: '' };

  function css() {
    if (typeof document === 'undefined' || document.getElementById('festival-css')) return;
    const s = document.createElement('style');
    s.id = 'festival-css';
    s.textContent = `
      .fest{display:flex;flex-direction:column;gap:12px;min-width:0}
      .fest .card{margin:0;min-width:0}
      .fest-top{position:relative;overflow:hidden;background:radial-gradient(120% 140% at 0% 0%,#3a1424 0%,#161a22 55%) ,var(--panel);border-color:#4a2228}
      .fest-top h2{font-size:26px;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:8px}
      .fest-top .sub{color:var(--muted);font-size:12px;margin-top:2px}
      .fest-cuenta{display:flex;align-items:baseline;gap:8px;margin-top:10px;flex-wrap:wrap}
      .fest-cuenta b{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:28px;letter-spacing:1px;color:#fff;font-variant-numeric:tabular-nums}
      .fest-cuenta span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
      .fest-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      .fest-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:3px 8px;border-radius:999px;border:1px solid var(--line);background:#0d0f14aa;white-space:nowrap}
      .fest-chip .ico{width:14px;height:14px}
      .fest-chip.liga{border-color:#a8742f;color:#ffcf7a}
      .fest-inc{display:flex;gap:10px;align-items:flex-start;margin-top:10px;padding:8px 10px;border-radius:10px;background:#ffb02014;border:1px solid #ffb02055}
      .fest-inc .ico{width:22px;height:22px;flex:none;color:var(--amber)}
      .fest-inc b{display:block;font-size:13px}.fest-inc small{color:var(--muted);font-size:12px}
      .fest-mapa svg{display:block;width:100%;height:auto;border-radius:10px}
      .fest-mapa .nodo{cursor:pointer}
      .fest-pct{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
      .fest-pct b{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:40px;line-height:1}
      .fest-barra{position:relative;height:14px;border-radius:7px;background:var(--panel2);margin:14px 0 30px;border:1px solid var(--line)}
      .fest-barra>i{position:absolute;inset:0 auto 0 0;border-radius:7px;background:linear-gradient(90deg,#ff3b3b,#ffb020)}
      .fest-hito{position:absolute;top:-6px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--muted)}
      .fest-hito .dot{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--panel);border:2px solid var(--line)}
      .fest-hito .dot .ico{width:13px;height:13px}
      .fest-hito.ok{color:var(--green)}.fest-hito.ok .dot{border-color:var(--green);background:#123222;color:var(--green)}
      .fest-premios{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:4px}
      .fest-premios div{font-size:12px;background:var(--panel2);border-radius:8px;padding:6px 8px;border:1px solid var(--line);min-width:0}
      .fest-premios div.ok{border-color:#2ecc7166}
      .fest-pases{display:flex;align-items:center;gap:12px}
      .fest-tickets{display:flex;gap:4px;flex-wrap:wrap;flex:1;min-width:0}
      .fest-ticket{width:22px;height:30px;border-radius:4px;background:var(--panel2);border:1px dashed var(--line)}
      .fest-ticket.on{background:linear-gradient(180deg,#ffb020,#e0841a);border:0;box-shadow:0 2px 6px #ffb02044}
      .fest-big{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:34px;font-weight:800;line-height:1}
      .fest-fuentes{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
      .fest-fuentes span{font-size:12px;padding:3px 8px;border-radius:999px;background:var(--panel2);color:var(--muted)}
      .fest-fuentes span.ok{color:var(--green);background:#12322244}
      .fest-esc{padding:0;overflow:hidden}
      .fest-esc .thumb{position:relative;height:118px;overflow:hidden;background:#0d0f14}
      .fest-esc .thumb svg.scene{width:100%;height:auto;display:block;margin-top:-6px}
      .fest-esc .tnum{position:absolute;left:10px;top:10px;width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#0d0f14d9;border:1px solid var(--line);font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:800;font-size:18px}
      .fest-esc .badge-ok{position:absolute;right:10px;top:10px;display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:999px;background:#123222e6;color:var(--green);font-size:12px;font-weight:700}
      .fest-esc .badge-ok .ico{width:14px;height:14px}
      .fest-esc .in{padding:10px 12px 12px}
      .fest-esc h3{font-size:19px;display:flex;align-items:center;gap:6px}
      .fest-esc h3 .ico{width:18px;height:18px;color:var(--amber)}
      .fest-q{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:8px}
      .fest-q b{color:var(--text);font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px}
      .fest-bar{height:8px;border-radius:4px;background:var(--panel2);overflow:hidden;margin-top:4px}
      .fest-bar i{display:block;height:100%;background:var(--amber);border-radius:4px}
      .fest-bar.ok i{background:var(--green)}
      .fest-quienes{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--muted);align-items:center}
      .fest-quien{display:inline-flex;gap:4px;align-items:center;padding:2px 8px;border-radius:999px;background:var(--panel2);color:var(--text);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fest-quien.yo{background:#3a1424;border:1px solid #6a2a36}
      .fest-quien b{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;color:var(--amber)}
      .fest-esc .btn{margin-top:10px;width:100%}
      .fest-rank{display:flex;flex-direction:column;gap:6px;margin-top:8px}
      .fest-rank div{display:flex;align-items:center;gap:8px;font-size:14px;min-width:0}
      .fest-rank .p{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--panel2);font-size:12px;font-weight:700;flex:none}
      .fest-rank .p.p1{background:#ffb020;color:#1a1205}.fest-rank .p.p2{background:#c5ccd6;color:#111}.fest-rank .p.p3{background:#b0703a;color:#fff}
      .fest-rank .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fest-rank .yo .n{color:var(--amber);font-weight:700}
      .fest-rank .v{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;color:var(--muted)}
      .fest-tl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}
      .fest-tl div{border-radius:8px;padding:6px;background:var(--panel2);border:1px solid var(--line);font-size:11px;color:var(--muted);text-align:center;min-width:0}
      .fest-tl div .ico{width:18px;height:18px;display:block;margin:0 auto 2px}
      .fest-tl div.on{border-color:var(--amber);color:var(--text);background:#ffb02014}
      .fest-tl div.pas{opacity:.5}
      .fest-res{border-color:var(--green)}
      .fest-res.mal{border-color:var(--red)}
      .fest .neg{color:var(--red)}
    `;
    document.head.appendChild(s);
  }

  /* ---------- servidor ---------- */
  async function pedir(method, ruta, body) {
    if (st.ctx && typeof st.ctx.pedir === 'function') return st.ctx.pedir(method, ruta, body);
    const h = { 'Content-Type': 'application/json', 'X-Envivo': '1' };
    try { if (root.I18N && root.I18N.idioma) h['X-Envivo-Idioma'] = root.I18N.idioma; } catch (e) { /* nada */ }
    const r = await fetch(ruta, { method, headers: h, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) {
      const err = new Error((j && j.error) || 'No se pudo completar. Intenta de nuevo.');
      err.status = r.status; err.codigo = j && j.codigo; err.datos = j || {};
      throw err;
    }
    return j;
  }

  function aviso(t) {
    try { if (st.ctx && st.ctx.toast) return st.ctx.toast(t); } catch (e) { /* nada */ }
    return undefined;
  }
  function sonido(n) { try { if (st.ctx && st.ctx.snd) st.ctx.snd(n); } catch (e) { /* nada */ } }
  function icon(n, cls) { try { return st.ctx.A.icon(n, cls || 'sm'); } catch (e) { return ''; } }

  async function cargar() {
    if (st.cargando) return;
    st.cargando = true;
    try {
      const d = await pedir('GET', '/api/festival');
      usar(d);
      st.error = '';
    } catch (e) { st.error = e.message || String(e); }
    st.cargando = false;
    pintar();
  }
  function usar(d) {
    if (!d) return;
    st.datos = d;
    const t = Date.parse(d.ahora);
    if (Number.isFinite(t)) st.desfase = t - Date.now();
  }

  /* ---------- elegir personal y equipos (lo mejor que tienes, dentro de los topes del servidor) ---------- */
  function elegirEquipo() {
    const d = st.datos || {};
    if (st.ctx && typeof st.ctx.equipo === 'function') return st.ctx.equipo(d);
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    if (!s) return { staff: [], equip: [] };
    const G = root.Game || {};
    const topes = (d.yo && d.yo.topes) || { habilidad_max: 5, personas_max: 8, equipos_max: 12 };
    const vip = !!(st.ctx.vip || (d.yo && d.yo.vip));
    const fama = Number(topes.fama !== undefined ? topes.fama : (s.rep || 0)) || 0;
    const staff = (s.staff || []).filter((p) => p && p.role && (p.premium || (p.skill || 1) <= topes.habilidad_max))
      .sort((a, b) => (b.skill || 1) - (a.skill || 1)).slice(0, topes.personas_max)
      .map((p) => { const o = { role: p.role, skill: Math.max(1, Math.min(5, p.skill | 0 || 1)) }; if (p.owner) o.owner = true; if (p.name) o.name = String(p.name).slice(0, 40); return o; });
    const q = (t) => ((G.CATALOG && G.CATALOG[t] && G.CATALOG[t].q) || 1);
    const cuenta = {};
    const equip = [];
    (s.equip || []).filter((e) => e && MAX_TIPO[e.type] && (SRV_CAT[e.type] || ((itemDe(e.type) || {}).minRep || 0) <= fama) && (e.condition === undefined || e.condition >= 40) && (!SERVIDOR.includes(e.type) || e.srvId !== undefined) && (vip || !/^vip_/.test(e.type)))
      .sort((a, b) => (CAT[a.type] === 'cam' ? 0 : 1) - (CAT[b.type] === 'cam' ? 0 : 1) || q(b.type) - q(a.type))
      .forEach((e) => {
        if (equip.length >= topes.equipos_max) return;
        cuenta[e.type] = (cuenta[e.type] || 0) + 1;
        if (cuenta[e.type] > MAX_TIPO[e.type]) return;
        // Un solo switcher/consola: el mejor (ya vienen ordenados por calidad)
        if (['switcher', 'audio', 'internet', 'power', 'encoder', 'rain'].includes(CAT[e.type]) && equip.some((x) => CAT[x.type] === CAT[e.type])) return;
        equip.push({ type: e.type });
      });
    return { staff, equip };
  }

  /* ---------- turnos ---------- */
  async function cubrir(n) {
    if (st.ocupado) return;
    const d = st.datos;
    const abierto = d && d.yo && d.yo.intento_abierto;
    st.ocupado = true; st.estadoTurno = T('festival.preparando'); pintar();
    try {
      let it = abierto && abierto.escenario === n ? abierto : null;
      if (!it) {
        try {
          it = (await pedir('POST', '/api/festival/intento/iniciar', { escenario: n, equipo: elegirEquipo() })).intento;
        } catch (e) {
          if (e.codigo === 'intento_abierto' && e.datos && e.datos.intento) { it = e.datos.intento; aviso(T('festival.reanudado', { escenario: nombreEsc(it.escenario) })); }
          else throw e;
        }
      }
      await jugarYEnviar(it);
    } catch (e) {
      aviso(e.message || String(e));
      if (e.status && e.status !== 0) await cargar();
    } finally {
      st.ocupado = false; st.estadoTurno = '';
      pintar();
    }
  }

  async function jugarYEnviar(it) {
    if (!st.ctx || typeof st.ctx.jugarIntento !== 'function') throw new Error(T('festival.sin_juego'));
    sonido('click');
    const out = await st.ctx.jugarIntento(it.seed, it.contrato, it);
    if (out === null || out === undefined) { aviso(T('festival.pausado')); await cargar(); return; }
    const decisiones = Array.isArray(out) ? out : out.decisiones;
    if (!Array.isArray(decisiones)) { aviso(T('festival.pausado')); await cargar(); return; }
    const cuerpo = { intento_id: it.id, decisiones };
    if (!Array.isArray(out) && out.resultado && Number.isInteger(out.resultado.quality)) cuerpo.resultado = { quality: out.resultado.quality, stars: out.resultado.stars };
    st.estadoTurno = T('festival.validando'); pintar();
    const r = await pedir('POST', '/api/festival/intento/enviar', cuerpo);
    if (r.estado) usar(r.estado);
    st.ultimo = r.resultado || null;
    const x = st.ultimo || {};
    if (x.estado === 'validado') { sonido(x.estrellas >= 4 ? 'stars' : 'cash'); aviso(T('festival.resultado', { escenario: nombreEsc(x.escenario), calidad: x.calidad, aporte: x.aporte })); }
    else if (x.estado === 'pendiente') aviso(T('festival.pendiente'));
    else aviso(T('festival.invalido', { motivo: x.motivo || '?' }));
  }

  async function comprar() {
    if (st.ocupado) return;
    st.ocupado = true; pintar();
    try {
      const r = await pedir('POST', '/api/festival/pases/comprar', { cantidad: 1 });
      if (r.estado) usar(r.estado);
      sonido('cash');
      aviso(T('festival.compra_ok', { n: r.compra ? r.compra.pases : (st.datos.yo.pases) }));
    } catch (e) { aviso(e.message || String(e)); }
    st.ocupado = false;
    pintar();
  }

  function nombreEsc(n) {
    const f = st.datos && st.datos.festival;
    const e = f && f.escenarios.find((x) => x.n === n);
    return e ? e.nombre : '#' + n;
  }

  /* ---------- contador ---------- */
  function restante(iso) {
    const ms = Date.parse(iso) - (Date.now() + st.desfase);
    return Number.isFinite(ms) ? Math.max(0, ms) : 0;
  }
  function hms(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h >= 24 ? Math.floor(h / 24) + 'd ' + String(h % 24).padStart(2, '0') : String(h).padStart(2, '0')) + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  }
  function tic() {
    // Si la pantalla se volvió a pintar (otro módulo repinta), se busca la cuenta nueva en vez de detenerse
    const c = (st.el && st.el.isConnected ? st.el : document).querySelector('[data-fest-cuenta]');
    if (!c) { if (!st.el || !st.el.isConnected) detener(); return; }
    const ms = restante(c.getAttribute('data-fest-cuenta'));
    c.textContent = hms(ms);
    if (ms <= 0 && !st.cargando && !st.ocupado) { st.datos = null; cargar(); }
  }
  function detener() { if (st.timer) clearInterval(st.timer); st.timer = null; }

  /* ---------- dibujo ---------- */
  function escena(e) {
    try {
      const c = e.contrato || {};
      return st.ctx.A.scene(e.tipo, null, c.cams || 3, e.completado, null, { client: e.nombre, seed: e.semilla });
    } catch (x) { return `<div class="tile t-amber">${icon(e.icono, 'lg')}</div>`; }
  }

  function mapa(f) {
    const color = (e) => (e.completado ? '#2ecc71' : e.porcentaje > 0 ? '#ffb020' : '#5b6476');
    const caminos = [2, 3, 4, 5, 6, 1].map((n) => `M180 222 Q ${(180 + POS[n][0]) / 2} ${(222 + POS[n][1]) / 2 + 18} ${POS[n][0]} ${POS[n][1] + 18}`).join(' ');
    const nodo = (e) => {
      const [x, y] = POS[e.n];
      const big = e.n === 1;
      const w = big ? 64 : 46, h = big ? 26 : 18;
      const r = 13, cir = 2 * Math.PI * r, p = Math.max(0, Math.min(100, e.porcentaje));
      const col = color(e);
      return `<g class="nodo" data-fest-ir="${e.n}" role="button" aria-label="${esc(e.nombre)}">
        ${big ? `<path d="M${x - 40} ${y - 30}L${x - 18} ${y + 8}M${x + 40} ${y - 30}L${x + 18} ${y + 8}" stroke="#ffffff" stroke-opacity=".16" stroke-width="10" stroke-linecap="round"/>` : ''}
        <ellipse cx="${x}" cy="${y + h / 2 + 10}" rx="${w / 2 + 8}" ry="6" fill="#000" opacity=".35"/>
        <path d="M${x - w / 2} ${y + h / 2}L${x - w / 2 + 6} ${y - h / 2}H${x + w / 2 - 6}L${x + w / 2} ${y + h / 2}z" fill="#1d2129" stroke="${col}" stroke-width="2"/>
        <rect x="${x - w / 2 - 4}" y="${y + h / 2}" width="${w + 8}" height="7" rx="2" fill="${col}" opacity=".85"/>
        ${[0, 1, 2].map((k) => `<circle cx="${x - w / 4 + k * w / 4}" cy="${y - h / 2 + 4}" r="2" fill="${k === 1 ? '#ff3b3b' : '#ffd36b'}" class="${e.completado ? '' : 'blink'}"/>`).join('')}
        <g transform="translate(${x + w / 2 + 2} ${y - h / 2 - 4})"><circle r="${r}" fill="#0d0f14" stroke="#2a3242" stroke-width="3"/>
          <circle r="${r}" fill="none" stroke="${col}" stroke-width="3" stroke-dasharray="${(cir * p / 100).toFixed(1)} ${cir.toFixed(1)}" transform="rotate(-90)" stroke-linecap="round"/>
          <text y="4.5" font-size="12" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#e9edf5" text-anchor="middle">${e.n}</text></g>
        <text x="${x}" y="${y + h / 2 + 22}" font-size="9.5" font-family="IBM Plex Sans,system-ui,sans-serif" font-weight="600" fill="#e9edf5" text-anchor="middle">${esc(e.nombre.length > 22 ? e.nombre.slice(0, 21) + '…' : e.nombre)}</text>
      </g>`;
    };
    const gente = Array.from({ length: 70 }, (_, i) => { const a = (i * 137.5) % 360, rr = 18 + (i * 7) % 26, x = 180 + Math.cos(a) * rr * 1.6, y = 186 + Math.sin(a) * rr * 0.5; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${['#ff3b3b', '#ffb020', '#4da3ff', '#e9edf5'][i % 4]}" opacity=".55"/>`; }).join('');
    return `<svg viewBox="0 0 360 240" role="img" aria-label="${esc(T('festival.mapa'))}">
      <defs><radialGradient id="fest-pasto" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#1f3a2a"/><stop offset="1" stop-color="#0e1a14"/></radialGradient>
        <pattern id="fest-luz" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r=".8" fill="#ffffff" opacity=".08"/></pattern></defs>
      <rect width="360" height="240" fill="url(#fest-pasto)"/><rect width="360" height="240" fill="url(#fest-luz)"/>
      <path d="${caminos}" stroke="#c9b48a" stroke-opacity=".35" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="${caminos}" stroke="#e9d9b0" stroke-opacity=".35" stroke-width="1" stroke-dasharray="3 5" fill="none"/>
      ${gente}
      ${[[22, 30], [338, 30], [20, 222], [340, 222], [120, 20], [240, 20]].map(([x, y]) => `<path d="M${x - 8} ${y + 6}L${x} ${y - 8}L${x + 8} ${y + 6}z" fill="#2c4a36"/>`).join('')}
      ${f.escenarios.map(nodo).join('')}
      <g transform="translate(180 226)"><path d="M-30 10V-6a30 14 0 0160 0v16" fill="none" stroke="#ff3b3b" stroke-width="4"/>
        <text y="-1" font-size="8" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="1.5">ENTRADA</text></g>
    </svg>`;
  }

  function entregaTxt(e) {
    if (!e) return '';
    if (e.tipo === 'dinero') return '$' + num(e.cantidad);
    if (e.tipo === 'consumible') return e.cantidad + ' × ' + (e.item === 'cable' ? 'cables' : e.item === 'battery' ? 'baterías' : e.item);
    if (e.tipo === 'reparar_todo') return 'Taller (todo al 100 %)';
    if (e.tipo === 'personal') return 'Personal nivel ' + e.cantidad;
    return e.item || e.tipo;
  }
  function premioTxt(p) {
    return [p.fichas ? T('festival.fichas', { n: p.fichas }) : ''].concat((p.entregas || []).map(entregaTxt)).filter(Boolean).join(' · ');
  }

  function tarjetaPases(d) {
    const y = d.yo;
    const tickets = Array.from({ length: Math.max(y.pases_tope || 10, y.pases) }, (_, i) => `<i class="fest-ticket ${i < y.pases ? 'on' : ''}"></i>`).join('');
    const c = y.compra || {};
    return `<div class="card" data-fest="pases">
      <div class="row between"><h3>${esc(T('festival.pases'))}</h3><span class="small muted">${esc(T('festival.fichas', { n: num(y.fichas) }))}</span></div>
      <div class="fest-pases" style="margin-top:8px"><span class="fest-big" data-fest-pases>${y.pases}</span><div class="fest-tickets">${tickets}</div></div>
      <div class="fest-fuentes">
        <span class="${y.hoy && y.hoy.diario ? 'ok' : ''}">${y.hoy && y.hoy.diario ? icon('check') : ''} ${esc(T('festival.pase_diario'))}</span>
        <span class="${y.hoy && y.hoy.vip ? 'ok' : ''}">${icon('crown')} ${esc(T('festival.pase_vip'))}</span>
        <span class="${y.hoy && y.hoy.misiones ? 'ok' : ''}">${esc(T('festival.pase_misiones', { n: (y.hoy && y.hoy.misiones) || 0, max: (y.hoy && y.hoy.misiones_max) || 2 }))}</span>
      </div>
      <div class="row between" style="gap:8px"><span class="small muted">${esc(T('festival.pases_detalle'))} ${esc(T('festival.comprados', { n: c.comprados_hoy || 0, max: c.max_dia || 3 }))}</span>
        <button class="btn sm" data-fest="comprar" ${c.puede && !st.ocupado ? '' : 'disabled'}>${icon('gem')} ${esc(T('festival.comprar', { precio: (c.precio || 30) + ' ' + T('festival.creditos') }))}</button></div>
    </div>`;
  }

  function tarjetaEscenario(e, d) {
    const y = d.yo;
    const abierto = y.intento_abierto;
    const mio = abierto && abierto.escenario === e.n;
    const c = e.contrato || {};
    const quienes = (e.cubierto_por || []).slice(0, 4).map((q) => `<span class="fest-quien ${q.yo ? 'yo' : ''}">${esc(q.yo ? T('festival.tu') : q.nombre)} <b>+${num(q.aporte)}</b></span>`).join('');
    let boton;
    if (e.completado) boton = `<button class="btn sm" disabled>${icon('check')} ${esc(T('festival.completo'))}</button>`;
    else if (mio) boton = `<button class="btn sm main" data-fest="cubrir" data-n="${e.n}" ${st.ocupado ? 'disabled' : ''}>${icon('play')} ${esc(T('festival.continuar'))}</button>`;
    else boton = `<button class="btn sm main" data-fest="cubrir" data-n="${e.n}" ${(y.puede_jugar && !abierto && !st.ocupado) ? '' : 'disabled'}>${icon('rec')} ${esc(T('festival.cubrir'))}</button>`;
    return `<div class="card fest-esc" id="fest-esc-${e.n}" data-escenario="${e.n}">
      <div class="thumb">${escena(e)}<span class="tnum">${e.n}</span>${e.completado ? `<span class="badge-ok">${icon('check')} ${esc(T('festival.completo'))}</span>` : ''}</div>
      <div class="in">
        <h3>${icon(e.icono)} ${esc(e.nombre)}</h3>
        <div class="fest-chips">
          <span class="fest-chip">${icon('trend')} ${esc(T('festival.dificultad', { n: c.diff }))}</span>
          <span class="fest-chip">${icon('cam_pro')} ${esc(T('festival.camaras', { n: c.cams }))}</span>
          <span class="fest-chip">${icon(c.outdoor ? 'outdoor' : 'home')} ${esc(T(c.outdoor ? 'festival.aire_libre' : 'festival.techo'))}</span>
        </div>
        <div class="fest-q"><span>${esc(T('festival.calidad_esc'))}</span><b>${num(e.acumulado)} / ${num(e.meta)}</b></div>
        <div class="fest-bar ${e.completado ? 'ok' : ''}"><i style="width:${Math.max(0, Math.min(100, e.porcentaje))}%"></i></div>
        <div class="fest-quienes">${quienes ? esc(T('festival.cubrieron')) + ': ' + quienes : esc(T('festival.sin_cubrir'))}</div>
        ${e.completado && e.completado_por ? `<div class="small muted" style="margin-top:4px">${esc(T('festival.completo_por', { nombre: e.completado_por }))}</div>` : ''}
        ${boton}
      </div></div>`;
  }

  function tarjetaHitos(f) {
    const marcas = f.hitos.map((h) => `<div class="fest-hito ${h.alcanzado ? 'ok' : ''}" style="left:${h.pct}%"><span class="dot">${icon(h.alcanzado ? 'check' : 'gift')}</span><span>${h.pct}%</span></div>`).join('');
    return `<div class="card" data-fest="hitos">
      <div class="fest-pct"><h3>${esc(T('festival.calidad'))}</h3><b>${f.porcentaje}%</b></div>
      <div class="small muted">${num(f.calidad_total)} / ${num(f.meta_total)}</div>
      <div class="fest-barra"><i style="width:${Math.max(0, Math.min(100, f.porcentaje))}%"></i>${marcas}</div>
      <div class="small muted">${esc(T('festival.hitos'))}</div>
      <div class="fest-premios">${f.hitos.map((h) => `<div class="${h.alcanzado ? 'ok' : ''}"><b>${h.pct}%</b> ${h.alcanzado ? '· ' + esc(T('festival.hito_ok')) : ''}<br><span class="muted">${esc(premioTxt(h.premio))}</span></div>`).join('')}</div>
    </div>`;
  }

  function tarjetaRanking(f, d) {
    const filas = (f.ranking || []).slice(0, 20).map((r) => `<div class="${r.yo ? 'yo' : ''}"><span class="p p${r.puesto}">${r.puesto}</span><span class="n">${esc(r.yo ? r.nombre + ' (' + T('festival.tu') + ')' : r.nombre)}</span>
      <span class="v">${esc(T('festival.puntos', { n: num(r.puntos) }))} · ${esc(T('festival.turnos', { n: r.intentos }))}</span></div>`).join('');
    const tiers = (d.premios && d.premios.aporte || []).map((p) => `<div>${esc(T('festival.premio_aporte', { min: p.min, nombre: p.nombre }))}<br><span class="muted">${esc(premioTxt(p))}</span></div>`).join('');
    return `<div class="card" data-fest="ranking"><div class="row between"><h3>${esc(T('festival.ranking'))}</h3>
        <span class="small muted">${esc(T('festival.mi_aporte'))}: <b>${num(d.yo.puntos)}</b>${d.yo.puesto ? ' · ' + esc(T('festival.puesto', { n: d.yo.puesto })) : ''}</span></div>
      <div class="fest-rank">${filas || `<p class="small muted">${esc(T('festival.ranking_vacio'))}</p>`}</div>
      <div class="fest-premios" style="margin-top:10px">${tiers}</div></div>`;
  }

  function tarjetaImprevistos(f) {
    const hora = (iso) => { try { return new Date(iso).toLocaleTimeString((root.I18N && root.I18N.idioma) || 'es-EC', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    return `<div class="card"><h3>${esc(T('festival.imprevistos'))}</h3>
      <div class="fest-tl">${f.incidentes.map((i) => `<div class="${i.activo ? 'on' : ''} ${i.pasado ? 'pas' : ''}" title="${esc(i.detalle)}">${icon(i.icono)}${esc(i.activo ? T('festival.ahora') : hora(i.desde))}<br><b style="color:var(--text)">${esc(i.nombre)}</b></div>`).join('')}</div></div>`;
  }

  function tarjetaAnterior(a) {
    if (!a) return '';
    const p = a.mis_premios || [];
    return `<div class="card"><div class="row between"><h3>${esc(T('festival.anterior'))}</h3><span class="fest-chip liga">${esc(T('festival.liga', { liga: a.liga.nombre }))}</span></div>
      <div class="fest-pct" style="margin-top:6px"><span class="small muted">${esc(a.nombre)}</span><b style="font-size:28px">${a.porcentaje}%</b></div>
      <div class="small muted" style="margin-top:6px">${esc(T('festival.mis_premios'))}</div>
      <div class="fest-premios">${p.length ? p.map((x) => `<div class="ok"><b>${esc(x.tipo === 'hito' ? x.clave + '%' : x.tipo === 'puesto' ? T('festival.puesto', { n: x.clave }) : x.tipo === 'escenario' ? '#' + x.clave : x.tipo)}</b><br><span class="muted">${esc(premioTxt(x))}</span></div>`).join('') : `<div>${esc(T('festival.sin_premios'))}</div>`}</div></div>`;
  }

  function tarjetaUltimo() {
    const x = st.ultimo;
    if (!x) return '';
    const ok = x.estado === 'validado';
    const txt = ok ? T('festival.resultado', { escenario: nombreEsc(x.escenario), calidad: x.calidad, aporte: x.aporte })
      : x.estado === 'pendiente' ? T('festival.pendiente') : T('festival.invalido', { motivo: x.motivo || '?' });
    const estrellas = ok && x.estrellas ? ' ' + '★'.repeat(x.estrellas) + '☆'.repeat(Math.max(0, 5 - x.estrellas)) : '';
    return `<div class="card fest-res ${ok ? '' : 'mal'}" data-fest="ultimo"><b>${esc(txt)}</b><span style="color:var(--amber)">${estrellas}</span>
      ${ok && x.valido === false ? `<p class="small muted" style="margin:4px 0 0">${esc(T('festival.sospechoso'))}</p>` : ''}</div>`;
  }

  function pintar() {
    const el = st.el;
    if (!el) return;
    css();
    if (!st.datos && st.error) {
      el.innerHTML = `<div class="fest"><div class="card"><p class="small neg">${esc(st.error)}</p><button class="btn sm" data-fest="recargar">${esc(T('festival.reintentar'))}</button></div></div>`;
      return;
    }
    if (!st.datos) { el.innerHTML = `<div class="fest"><div class="card muted">${esc(T('festival.cargando'))}</div></div>`; return; }
    const d = st.datos, f = d.festival, c = d.ciclo, a = d.asociacion;
    const cab = `<div class="card fest-top">
        <h2>${icon('concierto', '')} ${esc(f ? f.nombre : T('festival.titulo'))}</h2>
        <div class="sub">${esc(T('festival.cada', { h: c.cada_h, d: c.duracion_h }))}</div>
        <div class="fest-chips">${a ? `<span class="fest-chip" style="border-color:${esc(a.color)}">${esc(a.siglas)} · ${esc(a.nombre)}</span><span class="fest-chip liga">${icon('crown')} ${esc(T('festival.liga', { liga: (f ? f.liga : a.liga).nombre }))}</span>` : ''}</div>
        <div class="fest-cuenta"><span>${esc(T(c.abierto ? 'festival.cierra_en' : 'festival.abre_en'))}</span><b data-fest-cuenta="${esc(c.abierto ? c.cierra : c.siguiente)}">${hms(restante(c.abierto ? c.cierra : c.siguiente))}</b></div>
        ${f && f.incidente ? `<div class="fest-inc">${icon(f.incidente.icono, '')}<div><b>${esc(f.incidente.nombre)}</b><small>${esc(f.incidente.detalle)} · ${esc(T('festival.imprevisto_ahora'))}</small></div></div>` : ''}
        ${!c.abierto ? `<p class="small muted" style="margin:10px 0 0">${esc(T('festival.descanso'))}</p>` : ''}
      </div>`;
    let cuerpo = '';
    if (!a) {
      cuerpo = `<div class="card"><p class="small">${icon('people')} ${esc(T('festival.sin_asociacion'))}</p></div>
        <div class="card"><h3>${esc(T('festival.como'))}</h3><p class="small muted">${esc(T('festival.como_texto'))}</p></div>`;
    } else if (f) {
      cuerpo = `${st.estadoTurno ? `<div class="card" data-fest="trabajando"><p class="small">${icon('clock')} ${esc(st.estadoTurno)}</p></div>` : ''}
        ${tarjetaUltimo()}
        ${d.yo.motivo && d.yo.codigo !== 'sin_pases' ? `<div class="card" style="border-color:var(--amber)"><p class="small">${icon('lock')} ${esc(d.yo.motivo)}</p></div>` : ''}
        <div class="card fest-mapa" style="padding:8px">${mapa(f)}</div>
        ${tarjetaHitos(f)}
        ${tarjetaPases(d)}
        ${d.yo.pases < 1 && !d.yo.intento_abierto ? `<p class="small muted" style="margin:0">${esc(T('festival.sin_pases'))}</p>` : ''}
        <div class="sectitle">${esc(T('festival.titulo'))} · 6</div>
        ${f.escenarios.map((e) => tarjetaEscenario(e, d)).join('')}
        ${tarjetaRanking(f, d)}
        ${tarjetaImprevistos(f)}`;
    } else {
      cuerpo = `${tarjetaAnterior(d.anterior)}${tarjetaPases(d)}
        <div class="card"><h3>${esc(T('festival.como'))}</h3><p class="small muted">${esc(T('festival.como_texto'))}</p></div>`;
    }
    el.innerHTML = `<div class="fest">${cab}${cuerpo}</div>`;
  }

  function alTocar(ev) {
    const t = ev.target.closest('[data-fest], [data-fest-ir]');
    if (!t || !st.el || !st.el.contains(t)) return;
    if (t.hasAttribute('data-fest-ir')) {
      const c = st.el.querySelector('#fest-esc-' + t.getAttribute('data-fest-ir'));
      if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const a = t.getAttribute('data-fest');
    if (a === 'cubrir' && !t.disabled) cubrir(Number(t.getAttribute('data-n')));
    else if (a === 'comprar' && !t.disabled) comprar();
    else if (a === 'recargar') { st.error = ''; pintar(); cargar(); }
  }

  function render(el, ctx) {
    if (st.el && st.el !== el) st.el.removeEventListener('click', alTocar);
    if (st.el !== el) el.addEventListener('click', alTocar);
    st.el = el; st.ctx = ctx || {};
    detener();
    st.timer = setInterval(tic, 1000);
    pintar();
    return cargar();
  }

  root.Festival = { render, detener, recargar: cargar, elegirEquipo: () => elegirEquipo(), T, _st: st };
})(typeof window !== 'undefined' ? window : globalThis);
