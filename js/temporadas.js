/* =========================================================
   EN VIVO Tycoon — Temporadas (eventos especiales por fecha)
   Se registra como extensión de la lógica (Game.registrarExtension) y como tarjeta de Inicio (window.EnVivoInicio).
   La FECHA viene de la pantalla (Temporadas.setFecha(iso, s): fecha del celular o ?fecha=AAAA-MM-DD) y se guarda en
   la partida (s.temporada.fecha): la lógica solo mira esa fecha guardada, nunca el reloj. Sin fecha no hay temporada.
   Los intentos en línea (s.intento) no aplican extensiones (lo controla logic.js).
   Cómo agregar una temporada: docs/TEMPORADAS.md
   ========================================================= */
(function (root) {
  'use strict';
  const G = root.Game || (typeof require === 'function' ? require('./logic.js') : null);
  if (!G || typeof G.registrarExtension !== 'function') return;
  const H = G.incAyuda;

  /* ---------- Calendario (una sola lista) ----------
     key: clave (textos temp.<key>.nombre / .premio / .trofeo en TEXTOS)
     desde / hasta: 'MM-DD' (si hasta < desde, la ventana cruza el año) · o calcular(año) → { desde: 'MM-DD', hasta: 'MM-DD' }
     eventos: { tipo: definición como datos.js EVENTOS + req: [{ t: 'dron' | 'grua' | 'cams', n }] }
     meta: { n } eventos especiales cubiertos · premios: { dinero, fama, cosmetico } · pago: multiplicador del pago
     cada: días de juego entre ofertas · max: ofertas por temporada · overlay: dibujo encima de la escena (art.js) */
  const P = (txt) => txt; // plantilla "rol min/ideal, ..." (la arma Game.registrarTipoEvento)
  const TEMPORADAS = [
    { key: 'halloween', icon: '🎃', desde: '10-24', hasta: '10-31', overlay: 'calabazas', pago: 1.5, cada: 2, max: 6,
      meta: { n: 2 }, premios: { dinero: 2500, fama: 4, cosmetico: 'calabazas' },
      eventos: {
        tmp_calaveras: { icon: '🎃', escena: 'concierto', posDe: 'concierto', cams: [3, 4], audio: true, stream: 1, outdoor: 0.5, diff: 4, pay: [2400, 4800],
          clients: ['Productora Ultratumba', 'Festival Noche de Calaveras', 'Radio Espanto FM'],
          crew: P('director 1/1, productor 1/1, camarografo 3/4, cablero 1/2, sonidista 1/1, shader 0/1, tecnico_transmision 1/1, coordinador_piso 0/1'),
          positions: [['foh', 'tribuna'], ['abierta', 'fija'], ['foso', 'hombro'], ['jib', 'grua'], ['steadicam', 'hombro'], ['dron', 'aerea']],
          req: [{ t: 'cams', n: 3 }, { t: 'grua' }] },
      } },
    { key: 'navidad', icon: '🎄', desde: '12-01', hasta: '12-25', overlay: 'nieve', pago: 1.7, cada: 2, max: 8,
      meta: { n: 3 }, premios: { dinero: 5000, fama: 5, cosmetico: 'arbol' },
      eventos: {
        tmp_arbol_ny: { icon: '🎄', escena: 'concierto', posDe: 'concierto', cams: [4, 5], audio: true, stream: 1, outdoor: 1, diff: 5, pay: [4200, 8000],
          clients: ['Cadena NBX de Nueva York', 'Plaza Tiempos Producciones', 'Canal Latino Manhattan'],
          crew: P('director 1/1, productor 1/1, camarografo 3/4, cablero 1/1, sonidista 1/1, operador_graficos 1/1, piloto_dron 0/1, tecnico_transmision 1/1, coordinador_piso 1/1'),
          positions: [['foh', 'tribuna'], ['abierta', 'fija'], ['jib', 'grua'], ['dron', 'aerea'], ['foso', 'hombro'], ['roboticas', 'robotica'], ['steadicam', 'hombro']],
          req: [{ t: 'cams', n: 4 }, { t: 'dron' }, { t: 'grua' }] },
      } },
    { key: 'pase_nino', icon: '⭐', desde: '12-15', hasta: '12-28', overlay: 'estrellas', pago: 1.3, cada: 3, max: 4,
      meta: { n: 2 }, premios: { dinero: 1500, fama: 3, cosmetico: 'pesebre' },
      eventos: {
        tmp_pase_nino: { icon: '⭐', escena: 'misa', posDe: 'boda', cams: [2, 3], audio: true, stream: 1, outdoor: 1, diff: 3, pay: [900, 2200],
          clients: ['Arquidiócesis de Cuenca', 'Junta del Pase del Niño', 'Parroquia El Sagrario'],
          crew: P('director 1/1, camarografo 2/3, cablero 0/1, sonidista 0/1, piloto_dron 0/1, tecnico_transmision 1/1, runner 0/1'),
          positions: [['frontal_altar', 'fija'], ['gimbal', 'gimbal'], ['contraplano_fondo', 'fija'], ['dron', 'aerea']],
          req: [{ t: 'cams', n: 2 }, { t: 'dron' }] },
      } },
    { key: 'fin_anio', icon: '🎆', desde: '12-26', hasta: '01-01', overlay: 'fuegos', pago: 1.8, cada: 2, max: 8,
      meta: { n: 3 }, premios: { dinero: 6000, fama: 6, cosmetico: 'fuegos' },
      eventos: {
        tmp_reveillon: { icon: '🎆', escena: 'concierto', posDe: 'concierto', cams: [4, 5], audio: true, stream: 1, outdoor: 1, diff: 5, pay: [4800, 9000],
          clients: ['Rede Globito', 'Prefeitura do Río', 'Réveillon Copacabaña Oficial'],
          crew: P('director 1/1, productor 1/1, camarografo 3/4, cablero 1/1, sonidista 1/1, operador_graficos 1/1, piloto_dron 1/1, tecnico_transmision 1/1, coordinador_piso 1/1'),
          positions: [['foh', 'tribuna'], ['abierta', 'fija'], ['dron', 'aerea'], ['jib', 'grua'], ['foso', 'hombro'], ['riel', 'riel'], ['roboticas', 'robotica']],
          req: [{ t: 'cams', n: 4 }, { t: 'dron' }] },
        tmp_anio_viejo: { icon: '🔥', escena: 'concierto', posDe: 'lanzamiento', cams: [2, 3], audio: true, stream: 1, outdoor: 1, diff: 3, pay: [1100, 2600],
          clients: ['Municipio de Guayaquil', 'Concurso de Monigotes del Malecón', 'Radio La Tropical'],
          crew: P('director 1/1, camarografo 2/3, cablero 0/1, sonidista 1/1, tecnico_transmision 1/1, coordinador_piso 0/1'),
          positions: [['frontal', 'fija'], ['abierta', 'fija'], ['gimbal_invitados', 'gimbal'], ['cenital_revelacion', 'grua']],
          req: [{ t: 'cams', n: 2 }] },
      } },
    { key: 'san_valentin', icon: '💘', desde: '02-07', hasta: '02-14', overlay: 'corazones', pago: 1.4, cada: 2, max: 5,
      meta: { n: 2 }, premios: { dinero: 2000, fama: 3, cosmetico: 'corazones' },
      eventos: {
        tmp_bodas: { icon: '💞', escena: 'boda', posDe: 'boda', cams: [2, 3], audio: true, stream: 1, outdoor: 1, diff: 3, pay: [1000, 2400],
          clients: ['Municipio de Quito', 'Registro Civil (bodas colectivas)', 'Parque de los Enamorados'],
          crew: P('director 1/1, productor 0/1, camarografo 2/3, cablero 0/1, sonidista 1/1, piloto_dron 0/1, tecnico_transmision 1/1, runner 0/1'),
          positions: [['frontal_altar', 'fija'], ['contraplano_fondo', 'fija'], ['gimbal', 'gimbal'], ['dron', 'aerea']],
          req: [{ t: 'cams', n: 2 }, { t: 'dron' }] },
        tmp_serenata: { icon: '🎻', escena: 'concierto', posDe: 'concierto', cams: [3, 4], audio: true, stream: 1, outdoor: 0.4, diff: 4, pay: [2000, 4200],
          clients: ['Coliseo Rumiñahui', 'Radio Romántica 98.1', 'Serenatas El Pasillo'],
          crew: P('director 1/1, productor 1/1, camarografo 3/4, cablero 1/2, sonidista 1/1, operador_ptz 0/1, tecnico_transmision 1/1, coordinador_piso 0/1'),
          positions: [['foh', 'tribuna'], ['abierta', 'fija'], ['foso', 'hombro'], ['jib', 'grua'], ['roboticas', 'robotica']],
          req: [{ t: 'cams', n: 3 }, { t: 'grua' }] },
      } },
    { key: 'pascua', icon: '🕊️', calcular: (y) => { const e = pascua(y); return { desde: mmdd(e - 7), hasta: mmdd(e) }; }, overlay: 'velas', pago: 1.5, cada: 2, max: 5,
      meta: { n: 2 }, premios: { dinero: 2500, fama: 4, cosmetico: 'flores' },
      eventos: {
        tmp_procesion: { icon: '🕯️', escena: 'misa', posDe: 'boda', cams: [3, 4], audio: true, stream: 1, outdoor: 1, diff: 4, pay: [1800, 3800],
          clients: ['Hermandad de los Cucuruchos', 'Basílica del Centro Histórico', 'Canal Católico Andino'],
          crew: P('director 1/1, productor 0/1, camarografo 3/4, cablero 1/1, sonidista 1/1, piloto_dron 0/1, tecnico_transmision 1/1, coordinador_piso 1/1'),
          positions: [['frontal_altar', 'fija'], ['gimbal', 'gimbal'], ['contraplano_fondo', 'fija'], ['dron', 'aerea']],
          req: [{ t: 'cams', n: 3 }, { t: 'dron' }] },
      } },
    { key: 'carnaval', icon: '🎭', calcular: (y) => { const e = pascua(y); return { desde: mmdd(e - 51), hasta: mmdd(e - 47) }; }, overlay: 'confeti', pago: 1.5, cada: 2, max: 5,
      meta: { n: 2 }, premios: { dinero: 2500, fama: 4, cosmetico: 'banderines' },
      eventos: {
        tmp_corso: { icon: '🎭', escena: 'concierto', posDe: 'lanzamiento_autos', cams: [3, 4], audio: true, stream: 1, outdoor: 1, diff: 4, pay: [1900, 4000],
          clients: ['Corso del Carnaval Andino', 'Municipio de Guaranda', 'Taita Carnaval Producciones'],
          crew: P('director 1/1, productor 1/1, camarografo 3/4, cablero 1/2, sonidista 1/1, piloto_dron 0/1, tecnico_transmision 1/1, coordinador_piso 1/1'),
          positions: [['frontal', 'fija'], ['jib_revelacion', 'grua'], ['gimbal_auto', 'gimbal'], ['dron', 'aerea'], ['photocall', 'hombro']],
          req: [{ t: 'cams', n: 3 }, { t: 'dron' }] },
      } },
  ];

  /* ---------- Fechas sin reloj (solo aritmética, así la lógica sigue determinista) ---------- */
  // Día absoluto (días desde 1970-01-01) de una fecha civil (algoritmo de H. Hinnant)
  function diaAbs(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    const era = Math.floor(y / 400), yoe = y - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }
  function civil(z) {
    z += 719468;
    const era = Math.floor(z / 146097), doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9);
    return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
  }
  const pad = (n) => String(n).padStart(2, '0');
  const isoDe = (z) => { const c = civil(z); return c.y + '-' + pad(c.m) + '-' + pad(c.d); };
  const mmdd = (z) => { const c = civil(z); return pad(c.m) + '-' + pad(c.d); };
  function leerIso(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, z: diaAbs(y, mo, d) };
  }
  // Domingo de Pascua (algoritmo gregoriano anónimo / Meeus) → día absoluto
  function pascua(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return diaAbs(y, mes, dia);
  }
  // Ventana de una temporada que EMPIEZA en el año y → { desde, hasta } (días absolutos)
  function ventana(def, y) {
    const w = typeof def.calcular === 'function' ? def.calcular(y) : { desde: def.desde, hasta: def.hasta };
    const [m1, d1] = w.desde.split('-').map(Number), [m2, d2] = w.hasta.split('-').map(Number);
    const desde = diaAbs(y, m1, d1);
    let hasta = diaAbs(y, m2, d2);
    if (hasta < desde) hasta = diaAbs(y + 1, m2, d2); // cruza el año (fin de año: 26 dic – 1 ene)
    return { desde, hasta };
  }
  const porKey = (k) => TEMPORADAS.find((t) => t.key === k) || null;

  /* Temporadas activas en una fecha ISO → [{ def, id, desde, hasta, quedan }] (quedan = días que faltan, 0 = último día) */
  function activas(iso) {
    const f = leerIso(iso);
    if (!f) return [];
    const out = [];
    TEMPORADAS.forEach((def) => {
      [f.y - 1, f.y].forEach((y) => {
        const w = ventana(def, y);
        if (f.z >= w.desde && f.z <= w.hasta) out.push({ def, id: def.key + '-' + y, anio: y, desde: w.desde, hasta: w.hasta, quedan: w.hasta - f.z });
      });
    });
    return out;
  }
  /* La próxima temporada que empieza después de esa fecha → { def, dias, desde } */
  function proxima(iso) {
    const f = leerIso(iso);
    if (!f) return null;
    let best = null;
    TEMPORADAS.forEach((def) => {
      [f.y, f.y + 1].forEach((y) => {
        const w = ventana(def, y);
        if (w.desde > f.z && (!best || w.desde < best.desde)) best = { def, dias: w.desde - f.z, desde: w.desde, hasta: w.hasta, id: def.key + '-' + y };
      });
    });
    return best;
  }

  /* ---------- Estado en la partida: s.temporada ---------- */
  function migrar(s) {
    if (!s.temporada || typeof s.temporada !== 'object') s.temporada = {};
    const T = s.temporada;
    if (typeof T.fecha !== 'string') T.fecha = null;
    if (!T.prog || typeof T.prog !== 'object') T.prog = {};
    if (!Array.isArray(T.trofeos)) T.trofeos = [];
    if (!Array.isArray(T.cosmeticos)) T.cosmeticos = [];
    return T;
  }
  function prog(s, id) {
    const T = migrar(s);
    if (!T.prog[id]) T.prog[id] = { n: 0, premio: false, ofertas: 0, prox: 0, visto: false };
    return T.prog[id];
  }
  const activasDe = (s) => (s && s.temporada && s.temporada.fecha ? activas(s.temporada.fecha) : []);
  const pTemp = (key) => ({ k: 'temp.' + key + '.nombre' });

  // Ofertas especiales: una abierta por temporada activa, cada `cada` días de juego, hasta `max` por temporada
  function ofrecer(s) {
    if (!G.extActivas(s) || s.gameOver) return;
    activasDe(s).forEach((a) => {
      const p = prog(s, a.id);
      if (!p.visto) { p.visto = true; G.aviso(s, 'temporada', 'temp.log.empieza', { temporada: pTemp(a.def.key) }); }
      if (s.contracts.some((c) => c.temporadaId === a.id)) return;
      if (p.ofertas >= (a.def.max || 6) || s.day < (p.prox || 0)) return;
      if (s.currentEvent) return;
      const tipos = Object.keys(a.def.eventos).filter((k) => G.EVENT_TYPES[k]);
      if (!tipos.length) return;
      const tipo = tipos[Math.floor(G.rnd(s) * tipos.length)];
      // Hace espacio quitando la oferta normal que vence primero
      if (s.contracts.length >= G.BALANCE.maxContracts) {
        const normal = s.contracts.filter((c) => !c.story && !c.internacional && !c.temporada).sort((x, y) => x.daysLeft - y.daysLeft)[0];
        if (!normal) return;
        s.contracts = s.contracts.filter((c) => c !== normal);
      }
      const c = G.addContract(s, tipo, 1, { noRival: true, especial: { temporada: a.def.key, temporadaId: a.id } });
      if (!c) return;
      c.daysLeft = Math.max(c.daysLeft, 4);
      p.ofertas++;
      p.prox = s.day + (a.def.cada || 2);
      G.aviso(s, 'temporada', 'temp.log.oferta', { temporada: pTemp(a.def.key), evento: { k: 'ev.' + tipo }, cliente: c.client });
    });
  }

  // Requisitos especiales de un tipo de evento con ese equipo
  function cumple(req, equip) {
    const its = (equip || []).map((e) => G.CATALOG[e.type]).filter(Boolean);
    if (req.t === 'cams') return its.filter((it) => it.cat === 'cam' && it.subtipo !== 'dron').length >= (req.n || 1);
    if (req.t === 'dron') return its.some((it) => it.subtipo === 'dron');
    if (req.t === 'grua') return its.some((it) => it.subtipo === 'grua');
    return true;
  }
  const reqP = (r) => ({ k: 'temp.req.' + r.t, p: r.n ? { n: r.n } : null });
  const defTipo = (tipo) => { for (const t of TEMPORADAS) if (t.eventos[tipo]) return { temp: t, ev: t.eventos[tipo] }; return null; };

  function premiar(s, a, result) {
    const p = prog(s, a.id), T = migrar(s), pr = a.def.premios || {};
    if (p.premio) return;
    p.premio = true;
    s.money += pr.dinero || 0;
    s.rep = Math.min(100, (s.rep || 0) + (pr.fama || 0));
    T.trofeos.push({ id: a.id, key: a.def.key, anio: a.anio, dia: s.day, fecha: T.fecha });
    if (pr.cosmetico && !T.cosmeticos.includes(pr.cosmetico)) T.cosmeticos.push(pr.cosmetico);
    const par = { temporada: pTemp(a.def.key), monto: G.money(pr.dinero || 0), fama: pr.fama || 0, trofeo: { k: 'temp.' + a.def.key + '.trofeo' } };
    if (result) (result.extras = result.extras || []).push({ icon: 'gift', k: 'temp.res.premio', p: par, temporada: a.def.key, premio: true });
    G.aviso(s, 'temporada', 'temp.res.premio', par);
  }

  /* ---------- La extensión ---------- */
  const EXT = {
    id: 'temporadas',
    migrar,
    contratosExtra: ofrecer,
    alNuevoDia(s) {
      // Las ofertas especiales de una temporada que ya terminó se retiran
      const ids = activasDe(s).map((a) => a.id);
      s.contracts = s.contracts.filter((c) => !c.temporadaId || ids.includes(c.temporadaId));
    },
    multPago(s, c) { const d = c && c.temporada && porKey(c.temporada); return d ? (d.pago || 1) : 1; },
    bonoCalidad(s, c, staff, equip) {
      const d = c && c.temporada && defTipo(c.type);
      if (!d) return [];
      return (d.ev.req || []).map((r) => (cumple(r, equip)
        ? { k: 'temp.parte.req_ok', p: { req: reqP(r) }, pts: 3 }
        : { k: 'temp.parte.req_falta', p: { req: reqP(r) }, pts: -8 }));
    },
    alTerminarEvento(s, result, c) {
      if (!c || !c.temporadaId) return;
      const def = porKey(c.temporada);
      if (!def) return;
      const p = prog(s, c.temporadaId);
      p.n++;
      const meta = (def.meta && def.meta.n) || 1;
      result.extras = result.extras || [];
      result.temporada = c.temporada;
      result.extras.push({ icon: 'star', k: 'temp.res.progreso', p: { temporada: pTemp(def.key), n: Math.min(p.n, meta), meta }, temporada: def.key });
      if (p.n >= meta && !p.premio) {
        const anio = Number(String(c.temporadaId).split('-').pop()) || 0;
        premiar(s, { def, id: c.temporadaId, anio }, result);
      }
    },
  };

  /* ---------- Tipos de evento e imprevistos de temporada ---------- */
  TEMPORADAS.forEach((t) => Object.keys(t.eventos).forEach((k) => {
    const ev = t.eventos[k];
    G.registrarTipoEvento(k, Object.assign({ minRep: 0, peso: 1, temporada: t.key, overlay: t.overlay, especial: true }, ev));
  }));
  const deTemp = (...keys) => (s, ev) => !!ev.contract.temporada && keys.includes(ev.contract.temporada);
  // Imprevisto con dos salidas: 0 = alguien del equipo (o un equipo) lo resuelve · 1 = aguantar
  function imprevisto(key, o) {
    const ok = o.q[0], mal = o.q[1], aguantar = o.q[2];
    const c0 = o.rol
      ? { need: (s, ev) => (H.bestRole(ev, o.rol) ? null : H.NEED('need.rol', { rol: (G.ROLES[o.rol] || {}).name || o.rol })),
        run: (s, ev) => H.skillCheck(s, H.bestRole(ev, o.rol), (p) => H.R(ok, 'inc.' + key + '.r0', { nombre: H.nm(p) }), (p) => H.R(mal, 'inc.' + key + '.r1', { nombre: H.nm(p) })) }
      : { need: o.need, run: (s, ev) => { if (o.gasta) o.gasta(s, ev); return H.chance(s, 0.8) ? H.R(ok, 'inc.' + key + '.r0') : H.R(mal, 'inc.' + key + '.r1'); } };
    G.registrarImprevisto(key, {
      rol: o.rol, weight: () => o.peso || 4, when: o.when,
      text: () => ['inc.' + key + '.t'],
      choices: [c0, { run: () => H.R(aguantar, 'inc.' + key + '.r2') }],
    });
  }
  imprevisto('tmp_luces', { when: deTemp('navidad'), rol: 'director', peso: 6, q: [2, -6, -12] });
  imprevisto('tmp_frio', { when: deTemp('navidad'), need: (s) => (s.stock.battery > 0 ? null : H.NEED('need.battery')), gasta: (s) => { s.stock.battery--; }, q: [-1, -5, -10] });
  imprevisto('tmp_cuenta', { when: deTemp('navidad', 'fin_anio'), rol: 'operador_graficos', peso: 5, q: [1, -5, -9] });
  imprevisto('tmp_humo', { when: deTemp('fin_anio', 'carnaval', 'pase_nino'), need: (s, ev) => (ev.equip.some((e) => H.itemOf(e).subtipo === 'dron') ? null : H.NEED('temp.need.dron')), peso: 5, q: [3, -5, -11] });
  imprevisto('tmp_multitud', { when: deTemp('pase_nino', 'fin_anio', 'san_valentin', 'pascua', 'carnaval', 'halloween'), rol: 'coordinador_piso', peso: 4, q: [0, -6, -9] });
  imprevisto('tmp_espuma', { when: deTemp('carnaval', 'halloween'), need: (s, ev) => (H.hasCat(ev, 'rain') ? null : H.NEED('need.rain')), peso: 4, q: [-1, -5, -9] });
  imprevisto('tmp_niebla', { when: deTemp('halloween'), rol: 'shader', peso: 6, q: [3, -5, -10] });
  imprevisto('tmp_anillo', { when: deTemp('san_valentin', 'pascua'), rol: 'productor', peso: 4, q: [4, -4, -6] });

  G.registrarExtension(EXT);

  /* ---------- Para la pantalla ---------- */
  let fechaActual = null;
  /* La pantalla pasa la fecha del celular (o ?fecha=) al cargar y cada día. Queda guardada en la partida. */
  function setFecha(iso, s) {
    if (!leerIso(iso)) return false;
    fechaActual = iso;
    if (s && G.extActivas(s)) {
      const T = migrar(s);
      const cambio = T.fecha !== iso;
      T.fecha = iso;
      if (cambio) ofrecer(s); // una temporada que empieza hoy trae su oferta enseguida
    }
    return true;
  }
  function estado(s) {
    const T = s && s.temporada ? s.temporada : { prog: {}, trofeos: [], cosmeticos: [] };
    const fecha = (T && T.fecha) || fechaActual;
    return {
      fecha,
      activas: activas(fecha).map((a) => {
        const p = (T.prog && T.prog[a.id]) || { n: 0, premio: false, ofertas: 0, prox: 0 };
        const oferta = s ? s.contracts.find((c) => c.temporadaId === a.id) || null : null;
        return Object.assign({}, a, { prog: p, meta: (a.def.meta && a.def.meta.n) || 1, oferta,
          agotado: p.ofertas >= (a.def.max || 6) && !oferta, proxOferta: Math.max(0, (p.prox || 0) - (s ? s.day : 0)) });
      }),
      proxima: proxima(fecha),
      trofeos: (T.trofeos || []).slice(),
      cosmeticos: (T.cosmeticos || []).slice(),
    };
  }

  /* Tarjeta de Inicio (registro window.EnVivoInicio de ui.js) */
  function tarjeta(ctx) {
    const s = ctx.S();
    if (!s) return '';
    const e = estado(s);
    const { T, TL, M, esc, I } = ctx;
    const gt = (k, p) => TL(G.tx(k, p));
    const trofeosBtn = (e.trofeos.length || s.storyDone)
      ? `<button class="btn sm" data-ext="temporadas" data-acc="trofeos">${I('star', 'sm')}${T('temp.trofeos')} (${e.trofeos.length})</button>` : '';
    if (!e.activas.length) {
      if (!e.proxima) return trofeosBtn ? `<div class="card temp-card">${trofeosBtn}</div>` : '';
      const pr = e.proxima;
      return `<div class="card temp-card temp-prox" data-temporada="proxima"><div class="row between"><span class="small">${esc(pr.def.icon)} ${pr.dias === 1
        ? T('temp.proximo_manana', { temporada: esc(gt('temp.' + pr.def.key + '.nombre')) })
        : T('temp.proximo', { temporada: esc(gt('temp.' + pr.def.key + '.nombre')), n: pr.dias })}</span>${trofeosBtn}</div></div>`;
    }
    return e.activas.map((a) => {
      const d = a.def, pr = d.premios || {};
      const pct = Math.round(100 * Math.min(a.prog.n, a.meta) / a.meta);
      const tipos = Object.keys(d.eventos);
      const reqs = (d.eventos[tipos[0]].req || []).map((r) => esc(gt('temp.req.' + r.t, r.n ? { n: r.n } : undefined))).join(' · ');
      const estadoTxt = a.prog.premio ? `<p class="small up">${I('gift', 'sm')} ${T('temp.cumplida', { trofeo: esc(gt('temp.' + d.key + '.trofeo')) })}</p>` : '';
      const accion = a.oferta
        ? `<button class="btn main" data-ext="temporadas" data-acc="oferta" data-id="${a.oferta.id}">${esc(d.icon)} ${T('temp.ver_oferta')}</button>`
        : `<p class="small muted">${a.agotado ? T('temp.agotado') : T('temp.sin_oferta', { n: Math.max(1, a.proxOferta) })}</p>`;
      return `<div class="card temp-card temp-${esc(d.key)}" data-temporada="${esc(d.key)}">
        <div class="row between"><div class="story-tag">${T('temp.tag')}</div><span class="small" style="color:var(--amber)">${a.quedan > 1 ? T('temp.termina', { n: a.quedan }) : a.quedan === 1 ? T('temp.termina_manana') : T('temp.ultimo_dia')}</span></div>
        <h2>${esc(d.icon)} ${esc(gt('temp.' + d.key + '.nombre'))}</h2>
        <p class="small muted" style="margin:4px 0">${tipos.map((k) => esc(gt('ev.' + k))).join(' · ')}</p>
        <p class="small" style="margin:4px 0"><b>${T('temp.requisitos')}</b> ${reqs} · ${T('temp.pago_extra', { x: String(d.pago || 1).replace('.', ',') })}</p>
        <div class="row between small" style="margin-top:6px"><span>${T('temp.meta', { meta: a.meta })}</span><b class="num">${Math.min(a.prog.n, a.meta)}/${a.meta}</b></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <p class="small muted" style="margin:6px 0">${T('temp.premios')} <span class="pay" style="font-size:14px">${M(pr.dinero || 0)}</span> · +${pr.fama || 0} ${T('head.fama')} · ${esc(gt('temp.' + d.key + '.trofeo'))} · ${esc(gt('temp.' + d.key + '.premio'))}</p>
        ${estadoTxt}${accion}${trofeosBtn}</div>`;
    }).join('');
  }
  function fechaCorta(z) { const c = civil(z); return pad(c.d) + '/' + pad(c.m); }
  function clic(ctx, acc, el) {
    if (acc === 'oferta') {
      const nav = typeof document !== 'undefined' && document.querySelector('nav button[data-tab="clientes"]');
      if (nav) nav.click();
      return;
    }
    if (acc === 'trofeos') {
      const s = ctx.S(), e = estado(s), { T, TL, esc, I } = ctx;
      const gt = (k, p) => TL(G.tx(k, p));
      const f = leerIso(e.fecha);
      const lista = e.trofeos.length
        ? e.trofeos.map((t) => { const d = porKey(t.key); return `<div class="row between" style="margin:6px 0"><span>${esc(d ? d.icon : '🏆')} <b>${esc(gt('temp.' + t.key + '.trofeo'))}</b></span><span class="small muted">${esc(gt('temp.' + t.key + '.nombre'))} ${t.anio} · ${T('comun.dia_n', { n: t.dia })}</span></div>`; }).join('')
        : `<p class="small muted">${T('temp.trofeos_vacio')}</p>`;
      const cal = f ? TEMPORADAS.map((d) => {
        let w = ventana(d, f.y);
        if (w.hasta < f.z) w = ventana(d, f.y + 1);
        return { d, w };
      }).sort((x, y) => x.w.desde - y.w.desde).map(({ d, w }) => `<div class="row between small" style="margin:4px 0"><span>${esc(d.icon)} ${esc(gt('temp.' + d.key + '.nombre'))}</span><span class="muted num">${fechaCorta(w.desde)} – ${fechaCorta(w.hasta)}</span></div>`).join('') : '';
      ctx.openModal(`<div class="row between"><h2>${I('star')} ${T('temp.trofeos')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
        ${lista}${cal ? `<div class="sectitle">${T('temp.calendario')}</div>${cal}` : ''}`);
    }
  }
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === 'temporadas')) root.EnVivoInicio.push({ id: 'temporadas', orden: 5, tarjeta, clic }); // antes que la sede (orden 10): la temporada dura pocos días

  const API = { TEMPORADAS, EXT, setFecha, estado, activas, proxima, pascua, ventana, diaAbs, isoDe, leerIso, cumple, ofrecer,
    fecha: () => fechaActual, porKey };
  root.Temporadas = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
