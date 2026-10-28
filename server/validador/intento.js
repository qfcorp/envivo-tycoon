/* =========================================================
   EN VIVO Tycoon — Núcleo del validador de intentos (eventos en línea)
   "El servidor tira los dados": el servidor entrega una semilla y un contrato, el jugador juega
   el evento con esa semilla y manda solo sus decisiones; aquí se REPITE la jugada con las mismas
   reglas (js/logic.js) para obtener el resultado de verdad.

   Este archivo NO usa Node (no lee archivos ni hace require): recibe el motor del juego (Game)
   como parámetro. Así el juego en el navegador puede usar EXACTAMENTE el mismo armado del
   estado para jugar el intento (copiándolo a js/ o sirviéndolo), y el resultado coincide.

   Uso:  const I = require('./intento.js');  I.repetir(Game, intento)  → resultado
         I.jugar(Game, intento, elegir)  → { decisiones, resultado }  (para el cliente / pruebas)
   ========================================================= */
(function (root) {
  'use strict';

  const LIMITES = { staff: 12, equip: 40, decisiones: 20, texto: 80, colocacion: 16 };
  const DEFECTO = { fama: 0, dinero: 1000, stock: { cable: 1, battery: 1 }, moral: 80 };
  const NOMBRE_OK = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
  const PROHIBIDAS = ['__proto__', 'constructor', 'prototype'];

  class ErrorIntento extends Error {
    constructor(motivo, mensaje) { super(mensaje || motivo); this.motivo = motivo; }
  }
  const falla = (motivo, mensaje) => { throw new ErrorIntento(motivo, mensaje); };
  const esObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const entero = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  const tiene = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /* Campos extra (tier, nivel, xp, serie...) que el servidor registró: se copian tal cual si son simples,
     para que la lógica nueva (personal y equipos realistas) los pueda usar sin cambiar el validador. */
  // Copia segura de un valor JSON pequeño (listas y objetos hasta 4 niveles, 64 elementos por nivel)
  function copiar(v, nivel) {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') return v.length <= LIMITES.texto ? v : undefined;
    if (nivel >= 4) return undefined;
    if (Array.isArray(v)) return v.length <= 64 ? v.map((x) => copiar(x, nivel + 1)).filter((x) => x !== undefined) : undefined;
    if (esObj(v)) {
      const ks = Object.keys(v);
      if (ks.length > 64) return undefined;
      const o = {};
      ks.forEach((k) => { if (!PROHIBIDAS.includes(k) && NOMBRE_OK.test(k)) { const x = copiar(v[k], nivel + 1); if (x !== undefined) o[k] = x; } });
      return o;
    }
    return undefined;
  }
  function extras(src, reservadas) {
    const o = {};
    Object.keys(src).forEach((k) => {
      if (reservadas.includes(k) || PROHIBIDAS.includes(k) || !NOMBRE_OK.test(k)) return;
      const v = copiar(src[k], 0);
      if (v !== undefined) o[k] = v;
    });
    return o;
  }

  function semillaDe(v) {
    if (typeof v === 'string' && /^-?\d{1,10}$/.test(v)) v = Number(v);
    if (!Number.isSafeInteger(v) || v < -2147483648 || v > 4294967295) falla('semilla_invalida', 'La semilla debe ser un entero de 32 bits.');
    return v | 0;
  }

  function maxSkill(G) { return (G.BALANCE && Array.isArray(G.BALANCE.skillUp) && G.BALANCE.skillUp.length) || 5; }

  function limpiarStaff(G, lista) {
    if (!Array.isArray(lista) || !lista.length) falla('equipo_invalido', 'Falta el personal (equipo.staff).');
    if (lista.length > LIMITES.staff) falla('equipo_invalido', `Máximo ${LIMITES.staff} personas.`);
    let duenos = 0;
    const top = maxSkill(G);
    return lista.map((p, i) => {
      if (!esObj(p)) falla('equipo_invalido', `Persona ${i + 1}: formato inválido.`);
      if (typeof p.role !== 'string' || !tiene(G.ROLES, p.role)) falla('equipo_invalido', `Persona ${i + 1}: rol desconocido (${String(p.role)}).`);
      if (!entero(p.skill, 1, top)) falla('equipo_invalido', `Persona ${i + 1}: habilidad debe ser entera de 1 a ${top}.`);
      const morale = p.morale === undefined ? DEFECTO.moral : p.morale;
      if (!entero(morale, 0, 100)) falla('equipo_invalido', `Persona ${i + 1}: ánimo debe ser entero de 0 a 100.`);
      const wage = p.wage === undefined ? 0 : p.wage;
      if (typeof wage !== 'number' || !Number.isFinite(wage) || wage < 0 || wage > 1e6) falla('equipo_invalido', `Persona ${i + 1}: sueldo inválido.`);
      if (p.owner) duenos++;
      if (duenos > 1) falla('equipo_invalido', 'Solo puede haber un dueño.');
      const name = typeof p.name === 'string' && p.name.length && p.name.length <= LIMITES.texto ? p.name : `Persona ${i + 1}`;
      const o = Object.assign(extras(p, ['id', 'name', 'role', 'skill', 'morale', 'wage', 'owner', 'events']),
        { name, role: p.role, skill: p.skill, wage, morale, events: entero(p.events, 0, 1e6) ? p.events : 0 });
      if (p.owner) o.owner = true;
      return o;
    });
  }

  function limpiarEquip(G, lista, vip) {
    if (!Array.isArray(lista) || !lista.length) falla('equipo_invalido', 'Faltan los equipos (equipo.equip).');
    if (lista.length > LIMITES.equip) falla('equipo_invalido', `Máximo ${LIMITES.equip} equipos.`);
    return lista.map((e, i) => {
      if (!esObj(e)) falla('equipo_invalido', `Equipo ${i + 1}: formato inválido.`);
      if (typeof e.type !== 'string' || !tiene(G.CATALOG, e.type)) falla('equipo_invalido', `Equipo ${i + 1}: tipo desconocido (${String(e.type)}).`);
      if (!entero(e.condition, 1, 100)) falla('equipo_invalido', `Equipo ${i + 1}: estado debe ser entero de 1 a 100.`);
      // Los equipos VIP valen siempre (lo comprado con créditos es tuyo, con o sin Pase VIP): ya no hay equipo_vip_sin_vip
      return Object.assign(extras(e, ['id', 'type', 'condition']), { type: e.type, condition: e.condition });
    });
  }

  function limpiarContrato(G, c) {
    if (!esObj(c)) falla('contrato_invalido', 'Falta el contrato.');
    if (typeof c.type !== 'string' || !tiene(G.EVENT_TYPES, c.type)) falla('contrato_invalido', `Tipo de evento desconocido (${String(c.type)}).`);
    const t = G.EVENT_TYPES[c.type];
    const cams = c.cams === undefined ? t.cams[1] : c.cams;
    const diff = c.diff === undefined ? t.diff : c.diff;
    if (!entero(cams, 1, 12)) falla('contrato_invalido', 'cams debe ser entero de 1 a 12.');
    if (!entero(diff, 1, 5)) falla('contrato_invalido', 'diff debe ser entero de 1 a 5.');
    const pay = c.pay === undefined ? t.pay[0] : c.pay;
    if (typeof pay !== 'number' || !Number.isFinite(pay) || pay < 0 || pay > 1e7) falla('contrato_invalido', 'pay inválido.');
    const o = Object.assign(extras(c, ['id', 'type', 'client', 'cams', 'audio', 'stream', 'outdoor', 'diff', 'pay', 'daysLeft', 'rival', 'rivalQuality', 'story']), {
      type: c.type,
      client: typeof c.client === 'string' && c.client.length && c.client.length <= LIMITES.texto ? c.client : t.clients[0],
      cams, diff, pay,
      audio: c.audio === undefined ? !!t.audio : !!c.audio,
      stream: !!c.stream, outdoor: !!c.outdoor,
      daysLeft: 3, rival: !!c.rival, story: !!c.story,
    });
    if (o.rival) {
      // La calidad de la rival la fija el servidor (si no, la lógica la sortearía con otra tirada)
      if (!entero(c.rivalQuality, 0, 100)) falla('contrato_invalido', 'Un contrato disputado necesita rivalQuality (0 a 100).');
      o.rivalQuality = c.rivalQuality;
    }
    return o;
  }

  function limpiarContexto(G, x) {
    x = esObj(x) ? x : {};
    const fama = x.fama === undefined ? DEFECTO.fama : x.fama;
    if (typeof fama !== 'number' || !Number.isFinite(fama) || fama < 0 || fama > 100) falla('contexto_invalido', 'fama debe ser de 0 a 100.');
    const dinero = x.dinero === undefined ? DEFECTO.dinero : x.dinero;
    if (typeof dinero !== 'number' || !Number.isFinite(dinero) || Math.abs(dinero) > 1e9) falla('contexto_invalido', 'dinero inválido.');
    const stock = Object.assign({}, DEFECTO.stock);
    if (esObj(x.stock)) {
      Object.keys(x.stock).forEach((k) => {
        if (!G.CONSUMABLES || !tiene(G.CONSUMABLES, k)) falla('contexto_invalido', `Repuesto desconocido (${k}).`);
        if (!entero(x.stock[k], 0, 99)) falla('contexto_invalido', `Repuesto ${k}: entero de 0 a 99.`);
        stock[k] = x.stock[k];
      });
    }
    return { fama, dinero, stock };
  }

  /* Arma un estado de juego NUEVO y mínimo con exactamente ese personal, esos equipos y ese contrato.
     Nada viene de la partida guardada del jugador. Modo libre (sin historia) y fuera del tutorial. */
  function crearEstado(G, intento) {
    if (!esObj(intento)) falla('intento_invalido', 'El intento debe ser un objeto JSON.');
    const seed = semillaDe(intento.seed);
    const eq = esObj(intento.equipo) ? intento.equipo : falla('equipo_invalido', 'Falta equipo.');
    const vip = intento.vip === true;
    const staff = limpiarStaff(G, eq.staff);
    const equip = limpiarEquip(G, eq.equip, vip);
    const contrato = limpiarContrato(G, intento.contrato);
    const ctx = limpiarContexto(G, intento.contexto);

    // newGame deja todos los campos que la lógica espera (también los que agregue la versión nueva);
    // después se reemplaza lo que importa y se vuelve a poner la semilla.
    const s = G.newGame(seed);
    let id = 0;
    s.staff = staff.map((p) => Object.assign({ id: ++id }, p));
    s.equip = equip.map((e) => Object.assign({ id: ++id }, e));
    contrato.id = ++id;
    s.idc = id;
    s.contracts = [contrato];
    s.candidates = [];
    s.log = [];
    s.pending = [];
    s.currentEvent = null;
    s.lastResult = null;
    s.gameOver = false;
    s.money = ctx.dinero;
    s.rep = ctx.fama;
    s.stock = ctx.stock;
    s.day = 1;
    s.lastWorkDay = 1;
    s.storyDone = true;
    if (Array.isArray(G.CHAPTERS)) s.chapter = Math.max(0, G.CHAPTERS.length - 1);
    s.chapterStats = { good: {}, duels: 0 };
    s.stats = { events: 100, fiveStars: 0, earned: 0, best: {}, good: {}, duels: { won: 0, lost: 0 } }; // fuera del tutorial
    s.seed = seed;
    s.intento = true; // la lógica no aplica extensiones (temporadas, sede...) a un intento en línea
    return { s, contractId: contrato.id, staffIds: s.staff.map((p) => p.id), equipIds: s.equip.map((e) => e.id), vip };
  }

  /* Plan de cámaras a mano (opcional): intento.colocacion = [{ p: clave de la posición, e: índice en equipo.equip,
     o?: índice en equipo.staff (null = nadie la maneja; si falta, el mejor camarógrafo libre) }].
     Sin colocacion (o null) el evento usa el plan automático, como siempre. Devuelve la colocación con los ids del
     estado armado por crearEstado (staff 1..n, equipos n+1..) o null; si no se entiende, falla con colocacion_invalida. */
  function colocacionDe(intento, estado) {
    const c = intento && intento.colocacion;
    if (c === undefined || c === null) return null;
    if (!Array.isArray(c) || c.length > LIMITES.colocacion) falla('colocacion_invalida', `colocacion debe ser una lista (máximo ${LIMITES.colocacion}).`);
    return c.map((x, i) => {
      if (!esObj(x) || typeof x.p !== 'string' || !x.p.length || x.p.length > 40 || !NOMBRE_OK.test(x.p)) falla('colocacion_invalida', `Colocación ${i + 1}: posición inválida.`);
      if (!entero(x.e, 0, estado.equipIds.length - 1)) falla('colocacion_invalida', `Colocación ${i + 1}: la cámara debe ser un índice de equipo.equip (0 a ${estado.equipIds.length - 1}).`);
      const o = { p: x.p, e: estado.equipIds[x.e] };
      if (x.o === null) o.o = 0;
      else if (x.o !== undefined) {
        if (!entero(x.o, 0, estado.staffIds.length - 1)) falla('colocacion_invalida', `Colocación ${i + 1}: el operador debe ser un índice de equipo.staff o null.`);
        o.o = estado.staffIds[x.o];
      }
      return o;
    });
  }

  /* Juega el intento. elegir(incidente, n) devuelve el índice de la opción.
     Devuelve { ok, motivo?, mensaje?, decisiones, resultado?, pasos, base, partes } */
  function correr(G, intento, elegir) {
    const est = crearEstado(G, intento);
    const { s, contractId, staffIds, equipIds } = est;
    // Plan de cámaras a mano: solo cámaras que el jugador registró y que funcionan, en posiciones posibles
    const col = colocacionDe(intento, est);
    if (col && typeof G.validarColocacion === 'function') {
      const vc = G.validarColocacion(s, s.contracts[0], equipIds, staffIds, col);
      if (!vc.ok) return { ok: false, motivo: 'colocacion_invalida', mensaje: `${vc.msg} (${vc.motivo})`, decisiones: [], pasos: [] };
    }
    const r0 = col ? G.startEvent(s, contractId, staffIds, equipIds, col) : G.startEvent(s, contractId, staffIds, equipIds);
    if (!r0 || !r0.ok) return { ok: false, motivo: 'evento_no_inicia', mensaje: (r0 && r0.msg) || 'No se pudo iniciar.', decisiones: [], pasos: [] };
    const ev = s.currentEvent;
    const out = { ok: true, decisiones: [], pasos: [], base: ev.base, partes: ev.parts };
    for (let n = 0; n <= LIMITES.decisiones; n++) {
      const inc = G.currentIncident(s);
      if (!inc) break;
      if (n === LIMITES.decisiones) return Object.assign(out, { ok: false, motivo: 'demasiados_imprevistos', mensaje: 'La lógica generó demasiados imprevistos.' });
      const d = elegir(inc, n);
      if (d && d.motivo) return Object.assign(out, { ok: false, motivo: d.motivo, mensaje: d.mensaje });
      if (!Number.isInteger(d) || d < 0 || d >= inc.choices.length) {
        return Object.assign(out, { ok: false, motivo: 'opcion_invalida', mensaje: `Imprevisto ${n + 1}: la opción ${JSON.stringify(d)} no existe (hay ${inc.choices.length}).` });
      }
      if (!inc.choices[d].ok) {
        return Object.assign(out, { ok: false, motivo: 'opcion_no_disponible', mensaje: `Imprevisto ${n + 1}: "${inc.choices[d].label}" no estaba disponible (${inc.choices[d].why}).` });
      }
      const clave = ev.incidents[ev.step] && ev.incidents[ev.step].key;
      const r = G.resolveIncident(s, d);
      if (!r || !r.ok) return Object.assign(out, { ok: false, motivo: 'opcion_no_disponible', mensaje: `Imprevisto ${n + 1}: ${(r && r.msg) || 'rechazada'}.` });
      out.decisiones.push(d);
      out.pasos.push({ n: n + 1, clave, eleccion: d, q: r.q });
    }
    const fin = G.finishEvent(s);
    if (!fin || !fin.ok) return Object.assign(out, { ok: false, motivo: 'evento_no_termina', mensaje: (fin && fin.msg) || 'No se pudo terminar.' });
    out.resultado = fin.result;
    return out;
  }

  /* Para el cliente (y las pruebas): juega eligiendo con una función y devuelve lo que hay que mandar. */
  function jugar(G, intento, elegir) {
    const r = correr(G, intento, elegir);
    if (!r.ok) throw new ErrorIntento(r.motivo, r.mensaje);
    return { decisiones: r.decisiones, resultado: { quality: r.resultado.quality, stars: r.resultado.stars }, completo: r.resultado };
  }

  /* Repite el intento con las decisiones del jugador y compara con lo que dijo el cliente. */
  function repetir(G, intento) {
    const res = { valido: false, calidad: null, estrellas: null, coincide: false, detalle: {} };
    try {
      if (!esObj(intento)) falla('intento_invalido', 'El intento debe ser un objeto JSON.');
      const dec = intento.decisiones;
      if (!Array.isArray(dec)) falla('decisiones_invalidas', 'decisiones debe ser una lista de números.');
      if (dec.length > LIMITES.decisiones) falla('decisiones_invalidas', `Máximo ${LIMITES.decisiones} decisiones.`);
      const r = correr(G, intento, (inc, n) => (n < dec.length ? dec[n]
        : { motivo: 'faltan_decisiones', mensaje: `Faltan decisiones: hay al menos ${n + 1} imprevistos y llegaron ${dec.length}.` }));
      res.detalle.base = r.base === undefined ? null : r.base;
      res.detalle.partes = r.partes || [];
      res.detalle.incidentes = r.pasos;
      if (!r.ok) { res.detalle.motivo = r.motivo; res.detalle.mensaje = r.mensaje; return res; }
      if (dec.length > r.decisiones.length) {
        res.detalle.motivo = 'sobran_decisiones';
        res.detalle.mensaje = `Hubo ${r.decisiones.length} imprevistos y llegaron ${dec.length} decisiones.`;
        return res;
      }
      const f = r.resultado;
      res.calidad = f.quality;
      res.estrellas = f.stars;
      res.detalle.duelo = f.duel || null;
      res.detalle.calidad_rival = f.rivalQuality === undefined ? null : f.rivalQuality;
      const cr = intento.cliente_resultado;
      if (cr === undefined || cr === null) {
        res.coincide = null; // el cliente no dijo nada: vale el resultado del servidor
        res.valido = true;
      } else {
        res.coincide = esObj(cr) && cr.quality === f.quality && cr.stars === f.stars;
        res.valido = res.coincide;
        if (!res.coincide) {
          res.detalle.motivo = 'resultado_no_coincide';
          res.detalle.mensaje = `El cliente dijo ${esObj(cr) ? `${cr.quality} (${cr.stars}⭐)` : 'algo inválido'} y la repetición da ${f.quality} (${f.stars}⭐).`;
        }
      }
      return res;
    } catch (e) {
      res.detalle.motivo = e instanceof ErrorIntento ? e.motivo : 'error_logica';
      res.detalle.mensaje = String(e && e.message || e);
      return res;
    }
  }

  const API = { repetir, jugar, crearEstado, colocacionDe, ErrorIntento, LIMITES, DEFECTO };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Intento = API;
})(typeof window !== 'undefined' ? window : globalThis);
