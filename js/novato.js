/* =========================================================
   EN VIVO Tycoon — "Tus primeros 7 días": ruta de novato (idea 4 de las propuestas del 13-nov-2026)
   Contrato: server/API.md "Tus primeros 7 días" (GET /api/novato, POST /api/novato/empezar, POST /api/novato/reclamar;
   server/src/RutaNovato.php). Textos: claves nov.* en js/lang/es.js (los demás idiomas usan el español hasta la traducción).
   - Solo partidas NUEVAS: la primera vez que ve la partida (día 1 a 3, 10 eventos o menos, capítulo 0 o 1) guarda s.novato con
     la hora de inicio; una partida vieja queda marcada { no: 1 } y nunca la ve. Con cuenta, además la cuenta debe ser nueva
     (el servidor dice "elegible"): una cuenta vieja no la ve aunque la partida sea nueva.
   - 7 días con 5 o 6 tareas cada uno. Se abre un día por día REAL (calendario del celular desde el inicio; con cuenta, el
     inicio del servidor). Los días anteriores se pueden completar y reclamar después. La ruta se ve VENTANA (14) días.
   - Las tareas miran la partida (eventos, 5★, personal, capítulo, nombre…) o cuentan desde que empezó la ruta (compras,
     reparaciones, publicidad, 4★, misiones, eventos en línea, Duelos): extensión de js/logic.js + envoltorios de G.buy,
     G.repair, G.marketing y EnVivoVivo.terminar (como js/misiones.js, con su propia marca para no chocar).
   - Tareas en línea (cuenta, asociación, evento en línea, Duelo): con cuenta y servidor se muestran con su alternativa
     ("o también: …"); sin cuenta o sin internet solo se ve la alternativa. Cualquiera de las dos completa la tarea.
   - Premios FIJOS y a la vista (PREMIOS y FINAL: la MISMA tabla que RutaNovato.php). Dinero y repuestos en la partida;
     créditos solo con cuenta (los da el servidor). Premio grande al reclamar los 7 días: un camarógrafo internacional de
     habilidad 4 (con cuenta: entrega "personal_intl" validada en el servidor; sin cuenta: se suma a la partida).
   - Oferta de novato ($0,99, producto oferta_novato): solo las primeras 72 horas. Se compra con ctx.onComprar (el mismo
     camino que las demás ofertas: Plux/PayPal en la web, Google Play en la app); en la app solo con el precio de Google Play
     (si Play todavía no tiene el producto, no se muestra). Sin cuenta: "Crea tu cuenta gratis para aprovecharla".
   - Acceso en Inicio (js/hub.js, acceso(ctx)) mientras dure; abre su propia hoja (hub: 'novato'). Nunca durante la guía
     del primer evento (js/guia.js). No toca las misiones (js/misiones.js): solo mira lo que ya se reclamó allí.
   - Analítica (js/analitica.js): "novato_dia" con { dia, accion: inicio | completo | reclamado | final, dia_real, cuenta }.
   Pruebas: window.__ENVIVO_AHORA = <ms> fija el reloj de este módulo.
   API: window.Novato = { tarjeta, acceso, clic, asegurar, estadoDe, tareasDe, hecha, diaActual, reclamar, recargar,
        PREMIOS, FINAL, TAREAS, DIAS, VENTANA, OFERTA_HORAS, PRODUCTO, _st }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'novato';
  const DIAS = 7, VENTANA = 14, OFERTA_HORAS = 72;
  const PRODUCTO = 'oferta_novato';
  const DIA_MS = 86400000;

  /* ---------- Premios (la MISMA tabla que server/src/RutaNovato.php) ---------- */
  const PREMIOS = {
    1: { dinero: 400, cons: { cable: 2 } },
    2: { dinero: 600, cons: { battery: 2 } },
    3: { dinero: 800, cons: { cable: 2 }, creditos: 10 },
    4: { dinero: 1000, cons: { cable: 2, battery: 2 } },
    5: { dinero: 1200, creditos: 15 },
    6: { dinero: 1500, cons: { cable: 3, battery: 3 } },
    7: { dinero: 2000, creditos: 25 },
  };
  const FINAL = { dinero: 5000, creditos: 50, personal: { rol: 'camarografo', habilidad: 4 } };

  /* ---------- Tareas por día ----------
     k: qué se mira · n: meta · r: puesto (k = 'rol') · on: 'red' (necesita el servidor) o 'linea' (cuenta y servidor)
     · alt: tarea que la reemplaza sin cuenta o sin internet (también completa la tarea si se hace). */
  const TAREAS = {
    1: [{ k: 'eventos', n: 3 }, { k: 'rol', r: 'sonidista' }, { k: 'nombre' }, { k: 'cuatro', n: 1 }, { k: 'mision', n: 1 }],
    2: [{ k: 'eventos', n: 8 }, { k: 'compra', n: 1 }, { k: 'reparar', n: 1 }, { k: 'publicidad', n: 1 },
      { k: 'cuenta', on: 'red', alt: { k: 'cinco', n: 1 } }, { k: 'ganar', n: 3000 }],
    3: [{ k: 'eventos', n: 14 }, { k: 'asociacion', on: 'linea', alt: { k: 'rol', r: 'cablero' } }, { k: 'cinco', n: 2 },
      { k: 'rol', r: 'tecnico_transmision' }, { k: 'activo', n: 1 }],
    4: [{ k: 'eventos', n: 20 }, { k: 'en_linea', n: 1, on: 'linea', alt: { k: 'cuatro', n: 5 } }, { k: 'capitulo', n: 1 },
      { k: 'reparar', n: 3 }, { k: 'compra', n: 3 }, { k: 'personal', n: 4 }],
    5: [{ k: 'duelo', n: 1, on: 'linea', alt: { k: 'cinco', n: 4 } }, { k: 'eventos', n: 27 }, { k: 'personal', n: 5 },
      { k: 'ganar', n: 10000 }, { k: 'publicidad', n: 3 }, { k: 'mision', n: 5 }],
    6: [{ k: 'eventos', n: 34 }, { k: 'en_linea', n: 3, on: 'linea', alt: { k: 'cuatro', n: 10 } }, { k: 'cinco', n: 6 },
      { k: 'activo', n: 3 }, { k: 'compra', n: 5 }, { k: 'reparar', n: 6 }],
    7: [{ k: 'eventos', n: 40 }, { k: 'duelo', n: 2, on: 'linea', alt: { k: 'cinco', n: 8 } }, { k: 'ganar', n: 20000 },
      { k: 'personal', n: 6 }, { k: 'activo', n: 4 }],
  };
  const CONTADORES = ['cuatro', 'compra', 'reparar', 'publicidad', 'mision', 'en_linea', 'duelo', 'cuenta', 'asociacion'];

  /* ---------- utilidades ---------- */
  const escH = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = { ctx: null, sel: null, ocupado: false, srv: null, srvEn: 0, srvErrEn: 0, cargando: null, quien: undefined, noDisponible: false, sincronizando: false };
  function T(k, p) {
    try { if (st.ctx && typeof st.ctx.T === 'function') return st.ctx.T(k, p); if (root.I18N) return root.I18N.T(k, p); } catch (e) { /* abajo */ }
    return k;
  }
  const esc = (v) => (st.ctx && typeof st.ctx.esc === 'function' ? st.ctx.esc(v) : escH(v));
  const num = (n) => { try { return Number(n).toLocaleString('es-EC'); } catch (e) { return String(n); } };
  const M = (n) => { try { if (st.ctx && typeof st.ctx.M === 'function') return st.ctx.M(n); } catch (e) { /* abajo */ } return '$' + num(n); };
  const ahora = () => (typeof root.__ENVIVO_AHORA === 'number' && isFinite(root.__ENVIVO_AHORA) ? root.__ENVIVO_AHORA : Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  const fechaDe = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const diaNum = (f) => { const [y, mo, d] = f.split('-').map(Number); return Math.floor(Date.UTC(y, mo - 1, d, 12) / DIA_MS); };
  const Api = () => (st.ctx && st.ctx.Api) || root.Api || {};
  const conServidor = () => { try { return Api().disponible === true; } catch (e) { return false; } };
  const logueado = () => { try { const A = Api(); return !!(A.disponible !== false && typeof A.logueado === 'function' && A.logueado()); } catch (e) { return false; } };
  const cuentaId = () => { try { const e = Api().estado; return e && e.jugador ? e.jugador.id : null; } catch (e) { return null; } };
  const enLinea = () => conServidor() && logueado();
  function esIntento(s) { try { const G = root.Game; return !!(s && (s.intento === true || (G && G.esIntento && G.esIntento(s)))); } catch (e) { return false; } }
  function principal() {
    try { if (st.ctx && typeof st.ctx.S === 'function') return st.ctx.S(); } catch (e) { /* abajo */ }
    try { return root.__game ? root.__game.state : null; } catch (e) { return null; }
  }
  function guardar() { try { if (st.ctx && typeof st.ctx.save === 'function') st.ctx.save(); else if (st.ctx && typeof st.ctx.guardar === 'function') st.ctx.guardar(); } catch (e) { /* nada */ } }
  function repintar() { try { if (st.ctx && typeof st.ctx.render === 'function') st.ctx.render(); } catch (e) { /* nada */ } }
  function aviso(m) { try { if (st.ctx && typeof st.ctx.toast === 'function' && m) st.ctx.toast(m); } catch (e) { /* nada */ } }
  function sonido(n) { try { if (st.ctx && st.ctx.snd && st.ctx.snd.play) st.ctx.snd.play(n); } catch (e) { /* nada */ } }
  function medir(o, clave, datos) {
    if (!o || !o.a || o.a[clave]) return;
    o.a[clave] = 1;
    try { if (root.Analitica && typeof root.Analitica.evento === 'function') root.Analitica.evento('novato_dia', Object.assign({ cuenta: logueado() }, datos)); } catch (e) { /* nada */ }
  }

  async function pedir(metodo, ruta, cuerpo) {
    if (st.ctx && typeof st.ctx.pedir === 'function') return st.ctx.pedir(metodo, ruta, cuerpo);
    const r = await fetch(ruta, { method: metodo, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' },
      body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || 'Error'); e.status = r.status; e.codigo = j && j.codigo; throw e; }
    return j;
  }

  /* ---------- Estado en la partida: s.novato ---------- */
  function demo() { try { return !!root.__ENVIVO_DEMO || /[?&]demo=/.test((root.location && root.location.search) || ''); } catch (e) { return false; } }
  /** Crea s.novato la primera vez (solo si la partida es nueva). Devuelve el objeto o null si esta partida no tiene ruta. */
  function asegurar(s) {
    if (!s || typeof s !== 'object' || esIntento(s)) return null;
    let o = s.novato;
    if (!o || typeof o !== 'object' || o.v !== 1) {
      const st0 = s.stats || {};
      const nueva = !demo() && (Number(s.day) || 1) <= 3 && (Number(st0.events) || 0) <= 10 && !s.storyDone && (Number(s.chapter) || 0) <= 1 && !s.gameOver;
      if (!nueva) { s.novato = { v: 1, no: 1 }; return null; }
      o = s.novato = { v: 1, inicio: ahora(), c: { cuatro: Number(st0.fiveStars) || 0 }, r: {}, a: {}, md: null, fin: null };
      st.nuevo = true;
    }
    if (o.no) return null;
    if (!o.c || typeof o.c !== 'object') o.c = {};
    if (!o.r || typeof o.r !== 'object') o.r = {};
    if (!o.a || typeof o.a !== 'object') o.a = {};
    if (typeof o.inicio !== 'number' || !isFinite(o.inicio)) o.inicio = ahora();
    return o;
  }
  /** Inicio que manda: el del servidor con cuenta (si lo tiene), si no el de la partida. */
  function inicioDe(o) {
    const sv = srvVale();
    return sv && typeof sv.inicio_t === 'number' ? sv.inicio_t * 1000 : o.inicio;
  }
  /** Día de la ruta hoy (1 = el día que empezó). */
  function diaActual(o) { return Math.max(1, diaNum(fechaDe(ahora())) - diaNum(fechaDe(inicioDe(o))) + 1); }
  function sumar(o, k, n) { if (!o || CONTADORES.indexOf(k) < 0) return; o.c[k] = (Number(o.c[k]) || 0) + Math.max(0, Math.round(Number(n) || 0)); }
  function contar(k, n, s) {
    const x = s || principal();
    if (!x || esIntento(x) || x.gameOver) return false;
    const o = asegurar(x);
    if (!o) return false;
    sumar(o, k, n === undefined ? 1 : n);
    return true;
  }
  /** Mira la partida y lo que no se puede envolver (misiones reclamadas, cuenta, asociación). true si cambió algo. */
  function observar(s, o) {
    let cambio = false;
    const fijo = (k) => { if (!o.c[k]) { o.c[k] = 1; cambio = true; } };
    if (logueado()) fijo('cuenta');
    try { const E = Api().estado; if (E && E.asociacion) fijo('asociacion'); } catch (e) { /* nada */ }
    // Misiones del día reclamadas (js/misiones.js): se suman las nuevas de cada día
    const m = s.misiones;
    if (m && m.d && m.d.r && typeof m.d.p === 'string') {
      const n = Object.keys(m.d.r).filter((k) => !/^cofre/.test(k)).length;
      if (!o.md || o.md.p !== m.d.p) { o.md = { p: m.d.p, n: 0 }; cambio = true; }
      if (n > o.md.n) { sumar(o, 'mision', n - o.md.n); o.md.n = n; cambio = true; }
    }
    return cambio;
  }
  function staffDe(s) { return Array.isArray(s.staff) ? s.staff : []; }
  function normRol(r) { try { const G = root.Game; return G && G.normRole ? G.normRole(r) : r; } catch (e) { return r; } }
  /** Avance de una tarea simple: [tiene, meta]. */
  function avanceSimple(s, o, t) {
    const sts = s.stats || {};
    const act = () => { const h = s.misiones && s.misiones.h && typeof s.misiones.h === 'object' ? Object.keys(s.misiones.h).length : 0; return Math.max(h, Number(o.c.activo) || 0); };
    switch (t.k) {
      case 'eventos': return [Number(sts.events) || 0, t.n];
      case 'cinco': return [Number(sts.fiveStars) || 0, t.n];
      case 'ganar': return [Number(sts.earned) || 0, t.n];
      case 'personal': return [staffDe(s).length, t.n];
      case 'capitulo': return [s.storyDone ? 99 : Number(s.chapter) || 0, t.n];
      case 'nombre': return [typeof s.productora === 'string' && s.productora.trim() ? 1 : 0, 1];
      case 'rol': return [staffDe(s).some((p) => p && !p.owner && normRol(p.role) === normRol(t.r)) ? 1 : 0, 1];
      case 'activo': return [act(), t.n];
      default: return [Number(o.c[t.k]) || 0, t.n || 1];
    }
  }
  function cumple(s, o, t) { const [a, n] = avanceSimple(s, o, t); return a >= n; }
  /** ¿Tarea hecha? (la tarea o su alternativa). */
  function hecha(s, o, t) { return cumple(s, o, t) || (!!t.alt && cumple(s, o, t.alt)); }
  /** La tarea que se muestra: la de en línea si se puede, si no la alternativa. */
  function visibleDe(t) {
    if (!t.on || !t.alt) return { t, alt: null };
    const puede = t.on === 'red' ? conServidor() : enLinea();
    return puede ? { t, alt: t.alt } : { t: t.alt, alt: null };
  }
  function tareasDe(s, o, d) { return (TAREAS[d] || []).map((t) => ({ def: t, hecha: hecha(s, o, t), ver: visibleDe(t) })); }
  const completo = (s, o, d) => (TAREAS[d] || []).every((t) => hecha(s, o, t));
  const reclamado = (o, d) => !!o.r[d === 'final' ? 'final' : String(d)];
  const reclamadosN = (o) => Object.keys(PREMIOS).filter((d) => reclamado(o, d)).length;

  /* ---------- Servidor ---------- */
  function mismaCuenta() {
    const id = logueado() ? cuentaId() : null;
    if (id !== st.quien) { st.quien = id; st.srv = null; st.srvEn = 0; st.srvErrEn = 0; st.noDisponible = false; }
  }
  /** Datos del servidor si valen para esta sesión (con cuenta y el módulo instalado). */
  function srvVale() { return logueado() && !st.noDisponible && st.srv && st.srv.ok ? st.srv : null; }
  function cargarServidor() {
    if (st.cargando) return st.cargando;
    st.cargando = pedir('GET', '/api/novato').then((j) => {
      st.srv = j; st.srvEn = Date.now();
      const s = principal();
      const o = s && asegurar(s);
      if (o && fusionar(o, j)) guardar();
      if (o) sincronizar(s, o).catch(() => {});
      repintar();
      return j;
    }).catch((e) => {
      st.srvErrEn = Date.now();
      if (e && e.status === 404) st.noDisponible = true;   // servidor sin la ruta de novato: se juega como sin cuenta
      throw e;
    }).finally(() => { st.cargando = null; });
    return st.cargando;
  }
  function recargar(ctx) { if (ctx) st.ctx = ctx; if (!logueado()) return Promise.resolve(null); st.srvEn = 0; return cargarServidor().catch(() => null); }
  /** Reclamos de otro celular de la misma cuenta. */
  function fusionar(o, j) {
    let cambio = false;
    (j && Array.isArray(j.reclamados) ? j.reclamados : []).forEach((k) => {
      const d = k === 'final' ? 'final' : /^d([1-7])$/.test(k) ? k.slice(1) : null;
      if (d && !o.r[d]) { o.r[d] = 1; cambio = true; }
    });
    return cambio;
  }
  /** Entró a su cuenta: el inicio de la partida (si empezó antes) y los premios que ya se dieron sin cuenta. */
  async function sincronizar(s, o) {
    const sv = srvVale();
    if (!sv || st.sincronizando || !sv.elegible) return;
    st.sincronizando = true;
    try {
      if (!o.empezado && !(sv.reclamados || []).length && o.inicio < sv.inicio_t * 1000 - 60000) {
        o.empezado = 1;
        try { st.srv = await pedir('POST', '/api/novato/empezar', { inicio: Math.floor(o.inicio / 1000) }); } catch (e) { /* queda el del servidor */ }
        guardar();
      }
      const ya = new Set((st.srv && st.srv.reclamados) || []);
      const dia = (st.srv && st.srv.dia) || 1;
      for (const d of Object.keys(PREMIOS).concat('final')) {
        const clave = d === 'final' ? 'final' : 'd' + d;
        if (!o.r[d] || ya.has(clave)) continue;
        if ((d === 'final' ? DIAS : Number(d)) > dia + 1) break;
        try { await pedir('POST', '/api/novato/reclamar', { clave, ya_local: true }); ya.add(clave); }
        catch (e) { if (e && e.codigo === 'ya_reclamado') { ya.add(clave); continue; } break; }
      }
      if (st.srv) st.srv.reclamados = Array.from(ya);
    } finally { st.sincronizando = false; }
  }

  /* ---------- ¿Se ve? ---------- */
  function estadoDe(s) {
    if (!s || esIntento(s)) return null;
    const o = asegurar(s);
    if (!o) return null;
    mismaCuenta();
    if (logueado() && !st.noDisponible) {
      if (!st.cargando && (!st.srv || Date.now() - st.srvEn > 300000) && Date.now() - st.srvErrEn > 60000) cargarServidor().catch(() => {});
      const sv = srvVale();
      if (sv && !sv.elegible) return null;   // cuenta vieja o ruta apagada en el servidor
    }
    const dia = diaActual(o);
    if (dia > VENTANA) return null;
    if (o.r.final && o.fin && o.fin !== fechaDe(ahora())) return null;   // completada: se despide al día siguiente
    return { o, dia };
  }
  function guiaActiva() { try { return !!(root.Guia && typeof root.Guia.activa === 'function' && root.Guia.activa()); } catch (e) { return false; } }

  /* ---------- Premios ---------- */
  function partes(p, conCuenta) {
    const out = [];
    if (p.dinero) out.push('💵 ' + M(p.dinero));
    Object.keys(p.cons || {}).forEach((k) => out.push((k === 'battery' ? '🔋 ' : '🔌 ') + T('nov.c.' + k, { n: p.cons[k] })));
    if (p.creditos) out.push(conCuenta ? '💎 ' + T('nov.creditos', { n: p.creditos }) : '🔒 ' + T('nov.solo_cuenta', { n: p.creditos }));
    return out;
  }
  function aplicar(s, p) {
    if (p.dinero) s.money = (Number(s.money) || 0) + p.dinero;
    if (p.cons) { s.stock = s.stock && typeof s.stock === 'object' ? s.stock : {}; Object.keys(p.cons).forEach((k) => { s.stock[k] = (s.stock[k] || 0) + p.cons[k]; }); }
  }
  /** Sin cuenta: el camarógrafo internacional se suma a la partida (con cuenta llega como entrega "personal_intl"). */
  function darCamarografo(s) {
    const G = root.Game;
    const P = FINAL.personal;
    if (!G || !G.ROLES || !G.ROLES[P.rol]) return '';
    const ids = staffDe(s).map((p) => Number(p.id) || 0);
    const id = Math.max(Number(s.idc) || 0, ids.length ? Math.max.apply(null, ids) : 0) + 1;
    s.idc = id;
    const name = G.nuevoNombre ? G.nuevoNombre(s) : '#' + id;
    const wage = Math.round((G.baseWage ? G.baseWage(P.rol, 'semi_senior', P.habilidad) : 60) * 1.1);
    s.staff.push({ id, name, role: P.rol, tier: 'semi_senior', skill: P.habilidad, wage, morale: 100, events: 0, eventos_nacionales: 0, eventos_internacionales: 1, premium: true, novato: true });
    try { (s.contracts || []).forEach((c) => { if (c.internacional && G.requisitosInternacional) c.requisitos = G.requisitosInternacional(s, c, s.staff.map((x) => x.id), s.equip.map((e) => e.id)); }); } catch (e) { /* nada */ }
    return name;
  }

  /** Reclama el premio del día d (1..7) o 'final'. Devuelve {ok, ...} o {ok:false, motivo}. */
  async function reclamar(d) {
    const s = principal();
    const o = s && asegurar(s);
    if (!o) return { ok: false, motivo: 'sin_ruta' };
    const fin = d === 'final';
    const k = fin ? 'final' : String(d);
    const p = fin ? FINAL : PREMIOS[k];
    if (!p) return { ok: false, motivo: 'no_existe' };
    if (o.r[k]) { aviso(T('nov.ya')); return { ok: false, motivo: 'ya' }; }
    const dia = diaActual(o);
    if ((fin ? DIAS : Number(k)) > dia) { aviso(T('nov.bloqueado')); sonido('error'); return { ok: false, motivo: 'bloqueado' }; }
    if (fin ? reclamadosN(o) < DIAS : !completo(s, o, Number(k))) { aviso(T(fin ? 'nov.final_meta' : 'nov.no_listo')); sonido('error'); return { ok: false, motivo: 'no_listo' }; }
    const diaReal = dia;
    // Con cuenta, el premio se reclama en el servidor: si sus datos todavía no llegan, se esperan (nunca se da sin validar)
    if (logueado() && conServidor() && !st.noDisponible && !srvVale()) {
      try { await cargarServidor(); } catch (e) { /* abajo */ }
      if (!srvVale() && !st.noDisponible) { aviso(T('nov.err')); return { ok: false, motivo: 'sin_servidor' }; }
    }
    if (srvVale()) {
      let j;
      try { j = await pedir('POST', '/api/novato/reclamar', { clave: fin ? 'final' : 'd' + k }); }
      catch (e) {
        if (e && e.codigo === 'ya_reclamado') { o.r[k] = 1; guardar(); aviso(T('nov.ya')); return { ok: false, motivo: 'ya' }; }
        aviso(e && e.message ? e.message : T('nov.err')); sonido('error');
        return { ok: false, motivo: (e && e.codigo) || 'error' };
      }
      const s2 = principal() || s;
      const o2 = asegurar(s2) || o;
      aplicar(s2, p);
      o2.r[k] = 1;
      if (fin) o2.fin = fechaDe(ahora());
      try { if (root.Api && root.Api.estado && typeof j.creditos === 'number') root.Api.estado.creditos = j.creditos; } catch (e) { /* nada */ }
      if (j.estado && j.estado.ok) st.srv = j.estado;
      medir(o2, fin ? 'final' : 'r' + k, { dia: fin ? DIAS : Number(k), accion: fin ? 'final' : 'reclamado', dia_real: diaReal });
      guardar();
      const lista = partes(p, true).join(' · ');
      aviso(fin ? T('nov.final_listo') + ' ' + lista : T('nov.ok', { lista }));
      sonido(fin ? 'chapter' : 'buy');
      // El camarógrafo llega como entrega: traer /api/estado y aplicarla
      if (Array.isArray(j.entregas) && j.entregas.length && st.ctx && typeof st.ctx.alReclamar === 'function') { try { Promise.resolve(st.ctx.alReclamar(j)).catch(() => {}); } catch (e) { /* luego */ } }
      return { ok: true, servidor: j };
    }
    aplicar(s, p);
    let nombre = '';
    if (fin) { nombre = darCamarografo(s); o.fin = fechaDe(ahora()); }
    o.r[k] = 1;
    medir(o, fin ? 'final' : 'r' + k, { dia: fin ? DIAS : Number(k), accion: fin ? 'final' : 'reclamado', dia_real: diaReal });
    guardar();
    const lista = partes(p, false).filter((x) => x.indexOf('🔒') !== 0).join(' · ');
    aviso(fin ? T('nov.final_ok', { nombre: nombre || T('nov.premio_grande') }) + ' ' + lista : T('nov.ok', { lista }));
    sonido(fin ? 'chapter' : 'buy');
    return { ok: true, nombre };
  }

  /* ---------- Oferta de novato ---------- */
  function enApp() { try { return !!(st.ctx && typeof st.ctx.enApp === 'function' && st.ctx.enApp()); } catch (e) { return false; } }
  /** {hasta, comprada, precio} si la oferta se puede mostrar ahora; null si no. */
  function ofertaDe(o) {
    if (!conServidor()) return null;
    const sv = srvVale();
    let hasta, comprada = false, usd = 0.99;
    if (sv && sv.oferta) {
      hasta = Number(sv.oferta.hasta_t) * 1000; comprada = !!sv.oferta.comprada;
      if (isFinite(Number(sv.oferta.precio)) && sv.oferta.precio) usd = Number(sv.oferta.precio);
      if (!sv.oferta.disponible && !comprada) return null;
    } else {
      if (logueado() && !st.noDisponible) return null;   // todavía no llegan los datos de la cuenta
      hasta = o.inicio + OFERTA_HORAS * 3600000;
    }
    if (!comprada && ahora() >= hasta) return null;
    let precio = null;
    try { precio = st.ctx && typeof st.ctx.precio === 'function' ? st.ctx.precio(PRODUCTO, enApp() ? undefined : usd) : null; } catch (e) { precio = null; }
    if (!precio && enApp()) return null;   // en la app solo con el precio de Google Play
    return { hasta, comprada, precio: precio || ('$' + usd.toFixed(2).replace('.', ',')) };
  }
  function tiempo(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.max(1, Math.floor((s % 3600) / 60));
    if (d > 0) return T('nov.t_d', { n: d }) + ' ' + T('nov.t_h', { n: h });
    if (h > 0) return T('nov.t_h', { n: h }) + ' ' + T('nov.t_m', { n: m });
    return T('nov.t_m', { n: m });
  }

  /* ---------- Dibujo ---------- */
  function estilos() {
    const doc = root.document;
    if (!doc || doc.getElementById('nov-css')) return;
    const el = doc.createElement('style');
    el.id = 'nov-css';
    el.textContent = `.hub-nov{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 10px;padding:10px 12px;border-radius:12px;border:1px solid #2ecc7166;
      background:linear-gradient(100deg,#2ecc711c,transparent 65%),var(--panel);color:var(--text);text-align:start;position:relative;min-height:56px}
      .hub-nov .hn-ic{flex:none;width:40px;height:40px;border-radius:10px;display:grid;place-items:center;background:#0b0d12;font-size:22px;line-height:1}
      .hub-nov .hn-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
      .hub-nov small{color:var(--green);font:800 12px/1.2 var(--f-head);letter-spacing:.5px;text-transform:uppercase}
      .hub-nov b{font-size:14px;font-weight:700;line-height:1.25}
      .hub-nov .hn-pr{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .hub-nov .hn-of{display:inline-block;margin-top:2px;font-size:12px;color:#1a1200;background:var(--amber);border-radius:6px;padding:0 6px;font-weight:700;align-self:flex-start}
      .hub-nov .hs-b{position:absolute;right:-4px;top:-6px}
      .hub-nov .ha-fl{font-size:22px;color:var(--muted);line-height:1}
      .nov-card .nov-sub{margin:2px 0 10px;color:var(--muted);font-size:13px}
      .nov-grande{display:flex;gap:10px;align-items:center;padding:10px;border-radius:12px;border:1px solid #ffd27a77;background:linear-gradient(120deg,#ffd27a22,transparent 70%);margin:0 0 10px}
      .nov-grande .ng-ic{flex:none;width:52px;height:52px;border-radius:12px;background:#0b0d12;display:grid;place-items:center;font-size:30px}
      .nov-grande .ng-tx{flex:1;min-width:0}
      .nov-grande .ng-tx b{display:block;font-size:15px;color:#ffd27a}
      .nov-grande .ng-tx span{display:block;font-size:12px;color:var(--muted)}
      .nov-bar{height:7px;border-radius:4px;background:#ffffff14;overflow:hidden;margin:6px 0 2px}
      .nov-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--green),#ffd27a)}
      .nov-dias{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin:0 0 10px}
      .nov-dias button{min-height:48px;padding:4px 0;border-radius:10px;border:1px solid var(--line);background:#0b0d12;color:var(--text);font:700 12px/1.2 var(--f-body);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative}
      .nov-dias button.sel{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}
      .nov-dias button.bloq{opacity:.55}
      .nov-dias button.ok{background:#2ecc7122}
      .nov-dias button .hs-b{position:absolute;right:-3px;top:-6px;min-width:16px;height:16px;line-height:16px;font-size:11px;padding:0 3px}
      .nov-lista{display:flex;flex-direction:column;gap:6px;margin:0 0 10px}
      .nov-t{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:10px;background:#0b0d12;border:1px solid var(--line)}
      .nov-t.ok{border-color:#2ecc7166}
      .nov-t .nt-m{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;border:2px solid var(--line);font-size:12px;font-weight:800}
      .nov-t.ok .nt-m{background:var(--green);border-color:var(--green);color:#06210f}
      .nov-t .nt-tx{flex:1;min-width:0;font-size:14px;line-height:1.3;overflow-wrap:anywhere}
      .nov-t .nt-tx small{display:block;color:var(--muted);font-size:12px}
      .nov-t .nt-n{flex:none;font-size:12px;color:var(--muted);font-family:var(--f-mono)}
      .nov-premio{font-size:13px;margin:0 0 8px;overflow-wrap:anywhere}
      .nov-of{position:relative;margin:12px 0 0;padding:12px;border-radius:12px;border:1px solid #ffb02088;background:linear-gradient(135deg,#1b1406,#0d0f14 60%)}
      .nov-of .nof-tag{display:inline-block;font:800 11px/1.4 var(--f-head);letter-spacing:1px;text-transform:uppercase;color:#1a1205;background:var(--amber);border-radius:6px;padding:0 7px}
      .nov-of h4{margin:6px 0 2px;font-size:17px}
      .nov-of p{margin:0 0 8px;font-size:13px;color:var(--muted);overflow-wrap:anywhere}
      .nov-of .btn{margin-top:0}
      .nov-pie{font-size:12px;color:var(--muted);margin:10px 0 0}`;
    (doc.head || doc.documentElement).appendChild(el);
  }

  function textoTarea(t) {
    if (t.k === 'rol') return T('nov.k.rol.' + t.r);
    if (t.k === 'ganar') return T('nov.k.ganar', { m: M(t.n) });
    return T('nov.k.' + t.k, { n: t.n || 1 });
  }
  function filaTarea(s, o, x) {
    const t = x.ver.t;
    const [a, n] = avanceSimple(s, o, t);
    const alt = x.ver.alt ? `<small>${esc(T('nov.o', { alt: textoTarea(x.ver.alt) }))}</small>` : '';
    const prog = x.hecha || n <= 1 || t.k === 'capitulo' ? '' : `<span class="nt-n">${esc(t.k === 'ganar' ? M(Math.min(a, n)) : num(Math.min(a, n)) + '/' + num(n))}</span>`;
    return `<div class="nov-t${x.hecha ? ' ok' : ''}" data-nov-t="${esc(t.k)}"><span class="nt-m" aria-hidden="true">${x.hecha ? '✓' : ''}</span>
      <span class="nt-tx">${esc(textoTarea(t))}${alt}</span>${prog}</div>`;
  }
  function puedeReclamar(s, o, d, dia) { return !reclamado(o, d) && d <= dia && completo(s, o, d); }
  function porReclamar(s, o, dia) {
    let n = 0;
    for (let d = 1; d <= DIAS; d++) if (puedeReclamar(s, o, d, dia)) n++;
    if (!o.r.final && reclamadosN(o) >= DIAS && dia >= DIAS) n++;
    return n;
  }
  function diaElegido(s, o, dia) {
    if (st.sel && st.sel >= 1 && st.sel <= DIAS) return st.sel;
    for (let d = 1; d <= Math.min(dia, DIAS); d++) if (!reclamado(o, d)) return d;
    return Math.min(dia, DIAS);
  }

  /** Hoja de la ruta (se abre desde el acceso de Inicio; js/hub.js la pone en su propia hoja). */
  function tarjeta(ctx) {
    st.ctx = ctx || st.ctx;
    const s = principal();
    const e = estadoDe(s);
    if (!e) return '';
    const { o, dia } = e;
    estilos();
    if (observar(s, o) || st.nuevo) { st.nuevo = false; guardar(); }
    medir(o, 'inicio', { dia: 1, accion: 'inicio', dia_real: dia });
    const on = !!srvVale();
    const sel = diaElegido(s, o, dia);
    const n = reclamadosN(o);
    const botones = Object.keys(PREMIOS).map((k) => {
      const d = Number(k);
      const bloq = d > dia, ok = reclamado(o, d), listo = puedeReclamar(s, o, d, dia);
      return `<button type="button" class="${d === sel ? 'sel ' : ''}${bloq ? 'bloq ' : ''}${ok ? 'ok' : ''}" data-ext="${ID}" data-acc="dia" data-k="${d}" aria-pressed="${d === sel}"
        aria-label="${esc(T('nov.dia', { n: d }))}">${bloq ? '🔒' : ok ? '✓' : d === dia ? '★' : '·'}<span>${esc(T('nov.dia', { n: d }))}</span>${listo ? '<span class="hs-b amb">!</span>' : ''}</button>`;
    }).join('');
    let cuerpo;
    if (sel > dia) {
      cuerpo = `<p class="small muted" data-nov="bloqueado">🔒 ${esc(sel - dia === 1 ? T('nov.abre_manana') : T('nov.abre_en', { n: sel - dia }))}</p>
        <div class="nov-lista">${tareasDe(s, o, sel).map((x) => filaTarea(s, o, x)).join('')}</div>
        <p class="nov-premio"><b>${esc(T('nov.premio_dia'))}</b> ${esc(partes(PREMIOS[sel], on).join(' · '))}</p>`;
    } else {
      const ts = tareasDe(s, o, sel);
      const faltan = ts.filter((x) => !x.hecha).length;
      const ok = reclamado(o, sel);
      const btn = ok ? `<p class="small" style="color:var(--green);font-weight:700" data-nov="reclamado">✓ ${esc(T('nov.reclamado', { n: sel }))}</p>`
        : faltan ? `<button class="btn" disabled data-nov="faltan">${esc(T('nov.faltan', { n: faltan }))}</button>`
          : `<button class="btn green" data-ext="${ID}" data-acc="reclamar" data-k="${sel}" data-nov="reclamar"${st.ocupado ? ' disabled' : ''}>🎁 ${esc(st.ocupado ? T('nov.espera') : T('nov.reclamar', { n: sel }))}</button>`;
      cuerpo = `<div class="nov-lista" data-nov="tareas">${ts.map((x) => filaTarea(s, o, x)).join('')}</div>
        <p class="nov-premio"><b>${esc(T('nov.premio_dia'))}</b> ${esc(partes(PREMIOS[sel], on).join(' · '))}</p>${btn}`;
    }
    const finalBtn = o.r.final ? `<p class="small" style="color:var(--green);font-weight:700;margin:6px 0 0" data-nov="final_hecho">🏆 ${esc(T('nov.final_listo'))}</p>`
      : n >= DIAS && dia >= DIAS ? `<button class="btn main" data-ext="${ID}" data-acc="final" data-nov="final"${st.ocupado ? ' disabled' : ''} style="margin-top:6px">${esc(T('nov.final_reclamar'))}</button>` : '';
    const extra = partes({ dinero: FINAL.dinero, creditos: FINAL.creditos }, on).join(' · ');
    const grande = `<div class="nov-grande" data-nov="grande"><div class="ng-ic" aria-hidden="true">🎥</div><div class="ng-tx">
        <small class="muted">${esc(T('nov.final_t'))}</small><b>${esc(T('nov.premio_grande'))}</b>
        <span>${esc(T('nov.premio_grande_det', { n: FINAL.personal.habilidad }))}</span><span>${esc(T('nov.premio_grande_mas', { lista: extra }))}</span>
        <div class="nov-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${DIAS}" aria-valuenow="${n}"><i style="width:${Math.round(100 * n / DIAS)}%"></i></div>
        <span>${esc(T('nov.final_progreso', { n, t: DIAS }))}</span>${finalBtn}</div></div>`;
    const of = ofertaDe(o);
    let oferta = '';
    if (of) {
      const lista = partes({ dinero: 3000, cons: { cable: 5, battery: 3 } }, true);
      const cred = srvVale() && srvVale().oferta ? Number(srvVale().oferta.creditos) || 200 : 200;
      const btn = of.comprada ? `<p class="small" style="color:var(--green);font-weight:700;margin:0" data-nov="of_tienes">✓ ${esc(T('nov.of_tienes'))}</p>`
        : logueado() ? `<button class="btn main" data-ext="${ID}" data-acc="oferta" data-nov="of_comprar">${esc(T('nov.of_comprar', { precio: of.precio }))}</button>`
          : `<button class="btn main" data-act="cuenta" data-modo="registro" data-nov="of_cuenta">${esc(T('nov.of_cuenta'))}</button>`;
      oferta = `<div class="nov-of" data-nov="oferta"><span class="nof-tag">${esc(T('nov.of_tag'))}</span><h4>⚡ ${esc(T('nov.of_titulo'))}</h4>
        <p>💎 ${esc(T('nov.creditos', { n: cred }))} · ${esc(lista.join(' · '))}</p>
        ${of.comprada ? '' : `<p data-nov="of_termina">${esc(T('nov.of_termina', { t: tiempo(of.hasta - ahora()) }))} · ${esc(T('nov.of_una'))}</p>`}${btn}</div>`;
    }
    const termina = Math.max(0, VENTANA - dia);
    return `<div class="card nov-card" data-nov="tarjeta">
      <div class="row between"><div class="story-tag">${esc(T('nov.dia_de', { n: Math.min(dia, DIAS), t: DIAS }))}</div><span class="small muted">${esc(termina ? T('nov.termina', { n: termina }) : T('nov.termina_hoy'))}</span></div>
      <p class="nov-sub">${esc(T('nov.sub'))}</p>
      ${grande}
      <div class="nov-dias" role="group" aria-label="${esc(T('nov.titulo'))}">${botones}</div>
      ${cuerpo}${oferta}
      <p class="nov-pie">${esc(T('nov.fijo'))}${on ? '' : ' ' + esc(T('nov.con_cuenta'))}</p></div>`;
  }

  /** Acceso de Inicio (js/hub.js lo pone debajo de "qué hacer ahora"): vacío cuando no hay ruta o durante la guía. */
  function acceso(ctx) {
    st.ctx = ctx || st.ctx;
    const s = principal();
    if (!s || s.gameOver || guiaActiva()) return '';
    const e = estadoDe(s);
    if (!e) return '';
    const { o, dia } = e;
    estilos();
    if (observar(s, o) || st.nuevo) { st.nuevo = false; guardar(); }
    // Día completo (todas sus tareas): se mide una vez por día
    for (let d = 1; d <= Math.min(dia, DIAS); d++) if (completo(s, o, d)) medir(o, 'c' + d, { dia: d, accion: 'completo', dia_real: dia });
    medir(o, 'inicio', { dia: 1, accion: 'inicio', dia_real: dia });
    const claim = porReclamar(s, o, dia);
    const d = Math.min(dia, DIAS);
    const hechas = (TAREAS[d] || []).filter((t) => hecha(s, o, t)).length;
    const of = ofertaDe(o);
    const linea = o.r.final ? T('nov.final_listo') : claim ? T('nov.acceso_listo') : T('nov.acceso_tareas', { h: hechas, t: (TAREAS[d] || []).length });
    return `<button type="button" class="hub-nov" data-hub="${ID}" data-nov="acceso" aria-label="${esc(T('nov.titulo'))}">
      <span class="hn-ic" aria-hidden="true">🎯</span>
      <span class="hn-tx"><small>${esc(T('nov.titulo'))} · ${esc(T('nov.dia_de', { n: d, t: DIAS }))}</small><b>${esc(linea)}</b>
        <span class="hn-pr">🎥 ${esc(T('nov.acceso_premio', { premio: T('nov.premio_grande') }))}</span>
        ${of && !of.comprada ? `<span class="hn-of" data-nov="acceso_oferta">⚡ ${esc(T('nov.of_corto', { t: tiempo(of.hasta - ahora()) }))}</span>` : ''}</span>
      ${claim ? '<span class="hs-b amb">!</span>' : ''}<span class="ha-fl" aria-hidden="true">&#8250;</span></button>`;
  }

  async function clic(ctx, acc, el) {
    st.ctx = ctx || st.ctx;
    const k = el && el.getAttribute ? el.getAttribute('data-k') : null;
    if (acc === 'dia') { const d = Number(k); if (d >= 1 && d <= DIAS) { st.sel = d; repintar(); } return; }
    if (acc === 'oferta') {
      // Directo en el clic (sin await antes): en la app Google Play exige un toque reciente
      try { if (st.ctx && typeof st.ctx.onComprar === 'function') st.ctx.onComprar(PRODUCTO); } catch (e) { aviso(T('nov.err')); }
      st.srvEn = 0;   // al volver, traer el estado (oferta comprada)
      return;
    }
    if (acc === 'reclamar' || acc === 'final') {
      if (st.ocupado) return;
      st.ocupado = true; repintar();
      try { await reclamar(acc === 'final' ? 'final' : Number(k)); } finally { st.ocupado = false; st.sel = null; repintar(); }
    }
  }

  /* ---------- Contadores del juego ---------- */
  const EXT = {
    id: ID,
    alTerminarEvento(s, result) {
      if (!result) return;
      if (result.stars >= 4) contar('cuatro', 1, s);
    },
  };
  const ENVOLVER = { buy: 'compra', repair: 'reparar', marketing: 'publicidad' };
  let puesto = false, vivoPuesto = false, inicioPuesto = false;
  function envolverJuego(G) {
    if (!G || G.__novatoEnvuelto) return;
    Object.keys(ENVOLVER).forEach((fn) => {
      const orig = G[fn];
      if (typeof orig !== 'function') return;
      G[fn] = function (s) {
        const r = orig.apply(this, arguments);
        try { if (r && r.ok && s && typeof s === 'object') contar(ENVOLVER[fn], 1, s); } catch (e) { /* nunca rompe la acción */ }
        return r;
      };
    });
    try { Object.defineProperty(G, '__novatoEnvuelto', { value: true }); } catch (e) { G.__novatoEnvuelto = true; }
  }
  function envolverVivo() {
    const V = root.EnVivoVivo;
    if (!V || vivoPuesto || V.__novatoEnvuelto || typeof V.terminar !== 'function') return;
    const orig = V.terminar;
    V.terminar = function (v) {
      const r = orig.apply(this, arguments);
      try {
        const s = principal();
        if (s && contar('en_linea', 1, s)) {
          if (v && v.intento && v.intento.duelo_id) contar('duelo', 1, s);
          guardar();
        }
      } catch (e) { /* nada */ }
      return r;
    };
    try { Object.defineProperty(V, '__novatoEnvuelto', { value: true }); } catch (e) { V.__novatoEnvuelto = true; }
    vivoPuesto = true;
  }
  function registrar() {
    const G = root.Game;
    if (G && !puesto && typeof G.registrarExtension === 'function') { G.registrarExtension(EXT); envolverJuego(G); puesto = true; }
    envolverVivo();
    if (!inicioPuesto && typeof root.window !== 'undefined') {
      root.EnVivoInicio = root.EnVivoInicio || [];
      if (!root.EnVivoInicio.some((x) => x && x.id === ID)) root.EnVivoInicio.push({ id: ID, orden: 1, hub: ID, tarjeta, acceso, clic });
      inicioPuesto = true;
    }
    return puesto;
  }
  registrar();
  try { if (root.document) { root.document.addEventListener('DOMContentLoaded', registrar); root.addEventListener('load', registrar); } } catch (e) { /* sin documento */ }

  const Novato = { tarjeta, acceso, clic, asegurar, estadoDe, tareasDe, hecha, completo, diaActual, reclamar, recargar, contar, porReclamar, ofertaDe,
    PREMIOS, FINAL, TAREAS, DIAS, VENTANA, OFERTA_HORAS, PRODUCTO, EXT, registrar, _st: st };
  root.Novato = Novato;
  if (typeof module !== 'undefined' && module.exports) module.exports = Novato;
})(typeof window !== 'undefined' ? window : globalThis);
