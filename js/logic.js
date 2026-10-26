/* =========================================================
   EN VIVO Tycoon — Lógica del juego
   Este archivo NO toca la pantalla. Solo reglas.
   Los DATOS (catálogo, roles, eventos, posiciones de cámara, contratos internacionales)
   y TODOS los textos en español viven en js/datos.js (se carga antes que este archivo).
   Se puede probar con Node:  node tests/test_logic.js

   ---------------------------------------------------------
   API PARA LA PANTALLA (además de lo que ya existía)
   ---------------------------------------------------------
   Textos / idiomas
     Game.TEXTOS                       textos en español (clave → plantilla con {parámetros})
     Game.tx(clave, params)            → texto ya armado (usa el traductor si hay uno)
     Game.setTraductor(fn)             fn(clave, params) → texto o null; vuelve a armar nombres
                                       de ROLES, CATALOG, EVENT_TYPES, CATEGORIAS y CHAPTERS.
     Cada entrada del registro (s.log) guarda { day, text, k, p }: k = clave, p = parámetros.
     Los imprevistos y resultados devuelven también k / p para traducir después.

   Datos
     Game.CATEGORIAS   [{ key, nombre, icon }] en el orden de la tienda
     Game.shopByCategory(s) → [{ key, nombre, items: [{ key, ...CATALOG[key], locked, owned }] }]
     Game.CATALOG[k]   { name, desc, uso, icon, cat, subtipo, q (1-6), price, minRep, rareza, durabilidad,
                         requiere: [...], acepta: [...], alquiler (bool, se usa en un evento y se va), eventos: [...] }
                       uso = para qué sirve, en una frase corta y sencilla (item.<clave>.uso, máx. 90 caracteres);
                       desc = el detalle técnico (item.<clave>.desc)
     Game.ROLES[k]     { key, name, desc, siFalta, icon, wageMul, orden }  (14 roles; las claves viejas
                         cam / dir / audio / stream siguen funcionando como alias ocultos)
     Game.TIERS[k]     { key, name, mul, base, bonus, skill: [min, max] }  junior, semi_senior, senior, internacional
     Game.EVENT_TYPES[k] { name, icon, cams, diff, pay, minRep, crew: { rol: [min, ideal] }, crewReal, positions,
                           deporte, sensible, sinDron, soloInternacional, ... }
     Game.INTL_KINDS   tipos de contrato internacional

   Plan del evento
     Game.crewPlan(s, contract, staffIds, equipIds?) →
       { roles: [{ key, nombre, desc, si_falta, min, ideal, asignados (número), personas: [{id,name,skill,tier}],
                   estado: 'falta'|'justo'|'completo', riesgo (0..1), dobleRol (bool), sueldo }],
         wages, idealWages, savings, falta, justo, completo }
     Game.cameraPlan(s, contract, equipIds, staffIds?) →
       { positions: [{ key, nombre, ideal, perfil, opcional, asignado (clave de CATALOG o null), equipId, equipo (nombre),
                       lente (clave o null), q, fit, ajuste (0..1), operado }],
         cubiertas, total, ajusteMedio (0..1), bloqueados: [{ equipId, tipo, motivo, texto }], usados: [ids] }
     Game.requisitosInternacional(s, contract, staffIds, equipIds) → [{ key, texto, ok, obligatorio }]
     startEvent guarda ev.crewPlan y ev.cameraPlan; finishEvent().result trae crewPlan, cameraPlan y type.

   Personal
     persona: { id, name, role, skill, tier, wage, morale, events, eventos_nacionales, eventos_internacionales, owner? }
     Game.searchStaff(s, rol?)  publica una vacante (si das un rol, llegan 2 candidatos de ese rol)

   Movilización y flota (ver la sección MOVILIZACIÓN)
     Game.planTransporte(s, contract, staffIds, equipIds, eleccion?) → { km, personas, bultos, vehiculos, resto, opciones,
       eleccion, app, combustible, total, incluido, soloFlota }   (eleccion: 'economico' | 'xl' | 'carga'; si no, contract.movil)
     contract.movil = clave elegida (la guarda la pantalla); startEvent guarda ev.transporte y finishEvent lo cobra:
     result.transporte = { total, app, combustible, eleccion, km, vehiculos, autos, fletes, ... } (y result.net ya lo descuenta)
     Game.flota(s) → vehículos con capacidad (asientos, carga, mant por día, estado, enTaller)
     dailyCostBreakdown(s).vehiculos = mantenimiento y seguro diario de la flota

   Contratos internacionales (c.internacional === true)
     { pais, mult, travelDays, travelCost, repRisk, kind, requisitos: [{ key, texto, ok, obligatorio }] }
     Si falta un requisito obligatorio (personal con experiencia internacional), startEvent no deja salir.
   ========================================================= */
(function (root) {
  'use strict';

  const D = (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('./datos.js') : root.Datos;
  if (!D) throw new Error('Falta js/datos.js: cárgalo antes que js/logic.js');

  // v3: catálogo realista, 14 roles, niveles de experiencia, plan de personal y de cámaras, contratos internacionales.
  // v4: varios eventos por día (turnos mañana / tarde / noche: s.hoy) y resumen al cerrar el día (s.resumenDia).
  // Las partidas v1, v2 y v3 se siguen cargando (los roles viejos se convierten; s.hoy se arma solo).
  const SAVE_VERSION = 4;

  /* =========================================================
     BALANCE: todos los números de la economía en un solo lugar.
     Para ajustar la dificultad, cambia estos valores y corre
     node tests/test_logic.js para ver cómo queda el ritmo.
     ========================================================= */
  const BALANCE = {
    start: { money: 1500, rep: 5 },
    bankruptAt: -300,            // límite de deuda de una productora chica (ver bankruptLimit: crece con los gastos diarios)
    // Quiebra: el límite es -(máx(300, gastos diarios × perDailyCost)); cuentan los cobros pendientes que llegan pronto
    // y hay unos días de gracia en rojo (con aviso) antes de quebrar.
    bankrupt: { perDailyCost: 3, pendingDays: 4, graceDays: 2 },
    tutorialEvents: 3,           // los 3 primeros eventos son suaves (1 imprevisto, sin sorpresas)
    maxContracts: 7,
    // Varios eventos por día (v4): hasta 3 (mañana, tarde y noche) si te alcanza el personal y los equipos.
    // Los gastos fijos del día se cobran UNA vez, al cerrar el día (botón "Cerrar el día", o solo al usar los 3 turnos).
    // En el resultado se muestra la parte de esos gastos que le toca a cada evento (repartidos entre los eventos de hoy).
    dia: {
      franjas: 3,                // turnos por día: mañana, tarde y noche
      jornadaDesde: 4,           // eventos de dificultad 4 o más (concierto, LigaPrima, final...) e internacionales ocupan el día entero
      ofertas: [0, 1],           // ofertas nuevas cada día (al azar entre estos dos) + 1 con 25 de fama + 1 si tienes pocas
      pocas: 2,                  // "pocas ofertas": menos que esto
      llamada: { si: 2, chance: 0.5 }, // al terminar un evento (sin cerrar el día) y con menos de `si` ofertas: a veces llama un cliente
    },
    maxStaff: 18,                // personas en la productora (contándote a ti)
    maxEquip: 80,                // equipos en la bodega
    candidates: 5,
    // Gastos fijos de cada día (ver dailyCost)
    daily: {
      // Local según el tamaño (personas + equipos, sin contar alquileres): [tamaño mínimo, costo por día, clave del nombre]
      rent: [[0, 20, 'sede.garaje'], [15, 55, 'sede.oficina'], [23, 100, 'sede.estudio'], [31, 160, 'sede.centro']],
      perStaff: 5,               // por cada persona contratada (sin contarte a ti)
      equipShare: 0.002,         // seguro y bodega: 0,2% del valor de tus equipos cada día
      payrollShare: 0.03,        // parte del sueldo de cada persona que se paga aunque no haya evento
    },
    // Personal: sueldo = base del nivel × peso del rol + (habilidad - 1) × perSkill + azar
    wage: { perSkill: 5, random: 8, raisePerLevel: 10, hireFeeDays: 2,
            perDiff: 0.18 },     // en eventos grandes el personal cobra más: +18% por punto de dificultad sobre 1 (jornadas largas, viáticos)
    skillUp: [0, 4, 7, 11, 16],  // eventos para pasar del nivel 1 al 2, del 2 al 3, etc.
    // Ascensos de nivel: eventos trabajados y habilidad mínima
    promote: { semi_senior: { events: 15, skill: 2 }, senior: { events: 45, skill: 3 }, internacional: { intl: 3, skill: 4 }, wageShare: 0.35 },
    // Candidatos: probabilidad de cada nivel según la fama
    hiring: { semiBase: 0.15, semiPerRep: 1 / 120, seniorFrom: 18, seniorPerRep: 1 / 110, intlFrom: 45, intlBase: 0.04, intlPerRep: 1 / 600 },
    // Ánimo del equipo: los eventos grandes cansan (por punto de dificultad sobre 2); descansar un día lo recupera
    morale: { fatigue: 3, rest: 6, neutral: 60, perPoint: 8, min: -5, max: 3 },
    raise: { chance: 0.025, minStaff: 3, minDay: 25, pct: 0.1 }, // el equipo pide aumento
    // Equipos
    wear: { min: 2, perDiffMin: 0, max: 5, perDiffMax: 1.5 }, // desgaste por evento según dificultad
    wearByDurability: [1, 1.5, 1.25, 1, 0.85, 0.7],            // durabilidad 1..5 del equipo
    repairFactor: 0.3, sellFactor: 0.4, rentalRefund: 0.8,
    worn: 40,                    // con menos de esto, el equipo puede fallar en vivo
    // Calidad del evento
    stars: [85, 70, 55, 40],     // calidad mínima para 5, 4, 3 y 2 estrellas
    starsPay: [0, 0.1, 0.7, 1.0, 1.15, 1.3],
    starsPayBig: [0, 0.15, 0.5, 1.0, 1.15, 1.35], // dificultad 3 o más: un evento grande mal hecho casi no se cobra
    bigFrom: 3,
    learn: { events: 10, pay1: 0.4 },   // los primeros 10 eventos: 1 estrella en un evento chico paga como antes (40%)
    starsRep: [0, -5, -0.5, 2, 4, 6],
    diffPenalty: [0, 4, 8, 32, 42, 44], // puntos que resta la dificultad 1..5 del evento
    quality: {
      base: 25, cover: 25,       // plan de cámaras: hasta 25 puntos si cada posición tiene la cámara ideal y operador
      camPerQ: 3,              // calidad de las cámaras (calidad efectiva 1-6 × esto)
      extraPos: 2, extraMax: 2,  // tomas extra (dron, súper lenta...) cubiertas
      dirSkill: 3, swPerQ: 1.1, noSwitcher: [6, 3],
      audioBase: 4, audioSkill: 2, consPerQ: 1.1, consOnly: 3, noConsole: [6, 3], micBase: 1, micPerQ: 1,
      streamBase: 6, streamSkill: 2, encoderBonus: 2, streamOnly: 3, noStream: [8, 4],
      replayBase: 1, replayPerQ: 0.7, gfxBase: 1, gfxPerQ: 0.6, missingSpecial: [2, 1], gearNoOp: 2,
      shader: 3, shaderPerCam: 1, shaderOk: 1, // cámaras de sistema sin shader: -(shader + cámaras × shaderPerCam)
      intercom: 2,
      intlReq: 5,                // cada requisito (no obligatorio) de un contrato internacional que no cumples
    },
    skillPts: { dir: 3, audio: 2, stream: 2, team: 3 },
    // Falta de personal (plantilla mínima / ideal por rol)
    crew: { falta: 3, faltaDiff: 1, faltaCap: 2, justo: 1, justoMinDiff: 3 },
    // Riesgo de los imprevistos de cada rol: completo = base; entre mínimo e ideal = justo; bajo el mínimo = falta
    risk: { base: 0.08, justo: 0.2, falta: 0.45, perSkill: 0.06, perTier: 0.08, minFactor: 0.45,
            sevFalta: 1.5, sevJusto: 1.15, extraIncident: 1 },
    sensible: 1.6,               // en eventos sensibles (funeral) los errores pesan más
    expectPerRep: 0.16,          // cuanto más famoso eres, más te exige el cliente: -(fama * (esto + expectSmall * (5 - dificultad))) puntos
    expectSmall: 0.05,           // a una productora famosa no le perdonan nada en un evento chico
    // La exigencia deja de crecer desde esta fama (v4: con varios eventos por día la fama sube más rápido y, sin tope,
    // una productora muy famosa ya no podía cumplirle a nadie y quebraba en el modo libre)
    expectMaxRep: 90,
    // Las ofertas de la historia vienen con apoyo del personaje (escenario, fibra, luz del estadio...)
    storySupport: { lanzamiento: 14, ligapro: 10, final: 10 },
    expectStoryCap: 4,           // en las ofertas de la historia, lo que exige tu fama resta como mucho esto
    luck: [-2, 2],               // "suerte del día": entre -(a + b * dif) y +(a + b * dif) puntos (más en eventos grandes)
    // Imprevistos
    incidents: { byDiff: [1, 1, 1, 2, 3, 3], extraChance: 0.35, max: 5, severityPerDiff: 0.15,
                 skillBase: 0.3, skillPer: 0.12 }, // imprevistos de habilidad: éxito = base + (nivel + bono del nivel) * per
    // Clientes
    // Pago: precio × factor de fama × (1 + perDiff × (dificultad - 1)). Factor de fama: repMin con 0 de fama, 1 con repFull
    // (la fama inicial) y después 1 + (fama - repFull) / repBonus
    pay: { repMin: 0.85, repFull: 5, repBonus: 300, perDiff: 0 },
    // Confianza de los clientes: si tus últimos eventos salen casi todos con 1 estrella, pagan menos y llaman menos
    trust: { last: 6, minEvents: 10, badAvg: 1.6, payMul: 0.5 },
    latePay: { chance: 0.25, minDiff: 2, share: 0.5, days: 3 },
    cancelChance: 0.05,          // un cliente cancela una oferta pendiente
    // Fama
    fameDecay: { every: 3 },     // -1 de fama cada 3 días sin trabajar
    // MegaVisión
    rival: {
      fromChapter: 3,            // capítulo 4 (se cuenta desde 0)
      contestedChance: 0.2, payBoost: 1.3, diffBoost: 1,
      contestedChapter: 0.4,     // en el capítulo 4 (el de la rival) MegaVisión pelea más contratos
      stealChance: 0.15,
      // calidad de MegaVisión = base + capítulo * perChapter + dificultad * perDiff + azar (entre spread)
      quality: { base: 38, perChapter: 3, perDiff: 3, spread: [-6, 8], min: 45, max: 95 },
      winRep: 3, loseRep: 4,
    },
    // Contratos internacionales: llegan cada cierto tiempo desde el capítulo 4
    // Movilización: cómo llegan el personal y los equipos al evento (ver planTransporte). Precios en USD de Ecuador:
    // carreras por aplicación ($3-12 un auto, $8-20 una XL) y flete con chofer ($25-60 por viaje). Ida y vuelta = 2 viajes.
    // No usa números al azar: la distancia sale del cliente (cada cliente queda siempre a la misma distancia).
    transporte: {
      km: { misa: [3, 8], funeral: [3, 8], boda: [4, 14], prensa: [3, 9], irl: [3, 10], barrial: [4, 12], graduacion: [4, 11],
        lucha_libre: [5, 12], lanzamiento: [5, 13], boxeo: [5, 14], lanzamiento_autos: [6, 18], concierto: [6, 20], ligapro: [6, 18],
        final: [8, 22], def: [4, 12] },
      kmTutorial: 3,             // los primeros eventos quedan cerca del garaje (un taxi de ~$5 ida y vuelta)
      viajes: 2,
      // Opciones de la aplicación (por auto y por viaje: base + km × precio, mínimo min). asientos sin contar al chofer.
      // max: autos como mucho. carga: un flete (camioneta con chofer) y autos económicos para el resto de la gente.
      app: {
        economico: { asientos: 4, carga: 5, maxBulto: 2, base: 1.8, km: 0.42, min: 2.5, max: 4, eta: 3 },
        xl: { asientos: 6, carga: 10, maxBulto: 3, base: 3.5, km: 0.7, min: 5, max: 4, eta: 6 },
        carga: { asientos: 2, carga: 30, maxBulto: 99, base: 20, km: 1.6, min: 25, max: 4, eta: 14 },
      },
      // Bultos (cajas, maletas, trípodes) de cada equipo: por subtipo y, si no está, por categoría
      bultosCat: { cam: 1, lens: 0.5, support: 1, switcher: 1, replay: 2, graphics: 1, monitor: 1, audio: 1, mics: 0.5, intercom: 1,
        encoder: 0.5, internet: 0.5, wireless: 0.5, cable: 1, power: 2, rain: 0.5, case: 2, vehicle: 0, service: 0 },
      bultosSub: { eng_hombro: 2, ptz_broadcast: 2, sistema: 3, sistema_4k: 3, super_lenta: 3, ultra_movimiento: 2, dron_cine: 2, grua: 4,
        lente_eng: 1, lente_box: 3, adaptador_lente_box: 2, soporte_pesado: 3, steadicam: 2, jib: 4, dolly: 4,
        sdi: 2, sdi_me: 3, grande_me: 6, servidor_medio: 2, servidor_broadcast: 3, cg_3d: 2, cg_ar: 2,
        digital: 2, digital_superficie: 3, digital_grande: 4, broadcast: 4, inalambrico_digital: 2, bonding_broadcast: 1,
        cable_fibra_smpte: 2, generador_portatil: 3, generador_diesel: 8, satelite: 3, maletas: 2 },
      // Las cotizaciones incluyen la movilización: los clientes pagan un 3% más (así la movilización queda en proporción a lo
      // que cobras: ~2-5% del pago). Lo que ahorras con tu flota es ganancia.
      cotiza: 0.03,
      // Nunca un evento sale en pérdida solo por la movilización: se cobra como mucho el 10% del pago acordado y nunca más
      // de lo que te deja el evento (pago - sueldos - viaje); lo demás lo cubre el cliente como "movilización extra".
      topePago: 0.1,
      // Vehículos rotulados con el nombre de la productora: publicidad en la calle, los clientes pagan un poco más
      // (por vehículo de la flota con mantenimiento propio; el sedán la mitad). Tope: +3%.
      publicidad: { porVehiculo: 0.01, sedan: 0.005, max: 0.03 },
      taller: 20,                // un vehículo con menos estado que esto está en el taller (no sale)
      desgaste: { base: 1, porKm: 1 / 15 }, // estado que pierde un vehículo por evento (ida y vuelta)
      repairFactor: 0.12,        // reparar un vehículo (mecánico) cuesta menos que un equipo de video
    },
    chapter4Earn: 6000,          // capítulo 4: ganancia neta de eventos durante el capítulo
    intl: { fromChapter: 3, first: [10, 20], every: [18, 30], daysLeft: 5, latePayDays: 10 },
  };

  /* ---------- Números aleatorios (con semilla, para poder probar y repetir en el servidor) ---------- */
  function rnd(s) {
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const randInt = (s, a, b) => a + Math.floor(rnd(s) * (b - a + 1));

  /* ---------- Extensiones (temporadas, sede...) ----------
     Un módulo se registra con registrarExtension({ id, migrar, alNuevoDia, alTerminarEvento, bonoCalidad, multPago,
     multGastos, limites, contratosExtra }). Todo es opcional. Los intentos en línea (estado armado por intento.js:
     s.intento = true) NUNCA aplican extensiones: el servidor repite el intento sin ellas y tiene que dar lo mismo. */
  const extensiones = [];
  function registrarExtension(ext) {
    if (!ext || typeof ext !== 'object') return false;
    if (ext.id) { const i = extensiones.findIndex((e) => e.id === ext.id); if (i >= 0) { extensiones[i] = ext; return true; } }
    extensiones.push(ext);
    return true;
  }
  // Estado de un intento en línea: lo marca intento.js; por si acaso también se reconoce su forma (día 1, historia
  // terminada, 100 eventos y nada ganado: una partida real nunca está así)
  function esIntento(s) {
    if (!s) return false;
    if (s.intento === true) return true;
    return s.day === 1 && s.storyDone === true && !!s.stats && s.stats.events === 100 && s.stats.earned === 0;
  }
  let armando = 0; // > 0 mientras newGame arma la partida: los ganchos esperan a migrar() al final
  function extActivas(s) { return extensiones.length > 0 && !!s && !armando && !esIntento(s); }
  // Llama al gancho `nombre` de cada extensión (los errores de una extensión no rompen el juego)
  function cadaExt(s, nombre, fn) {
    if (!extActivas(s)) return;
    extensiones.forEach((e) => {
      if (typeof e[nombre] !== 'function') return;
      try { fn(e[nombre].bind(e)); } catch (err) { if (typeof console !== 'undefined') console.error('[extension ' + (e.id || '?') + '] ' + nombre, err); }
    });
  }
  function extMult(s, nombre, arg) {
    let f = 1;
    cadaExt(s, nombre, (h) => { const v = Number(h(s, arg)); if (isFinite(v) && v > 0) f *= v; });
    return f;
  }
  function extLimite(s, campo) {
    let n = 0;
    cadaExt(s, 'limites', (h) => { const l = h(s) || {}; const v = Number(l[campo]); if (isFinite(v)) n += Math.round(v); });
    return n;
  }
  // Gastos fijos en dólares de las extensiones (decoración: café, agua, luz). No los toca multGastos.
  function extSuma(s, nombre) { let n = 0; cadaExt(s, nombre, (h) => { const v = Number(h(s)); if (isFinite(v) && v > 0) n += v; }); return Math.round(n); }
  function maxStaff(s) { return BALANCE.maxStaff + extLimite(s, 'staff'); }
  function maxEquip(s) { return BALANCE.maxEquip + extLimite(s, 'equip'); }
  function migrarExt(s) { cadaExt(s, 'migrar', (h) => h(s)); return s; }
  const pick = (s, arr) => arr[Math.floor(rnd(s) * arr.length)];
  const chance = (s, p) => rnd(s) < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const money = (n) => '$' + Math.round(n).toLocaleString('es-EC');
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------- Textos ---------- */
  const TEXTOS = D.TEXTOS;
  let traductor = null;
  // Un parámetro puede ser otro texto con clave: { k, p } (se arma en el idioma actual)
  function subParams(p) {
    if (!p || typeof p !== 'object') return p;
    let out = null;
    Object.keys(p).forEach((x) => {
      const v = p[x];
      if (v && typeof v === 'object' && typeof v.k === 'string') { out = out || Object.assign({}, p); out[x] = tx(v.k, v.p || undefined); }
    });
    return out || p;
  }
  function tx(key, p) {
    p = subParams(p);
    let t = null;
    if (traductor) { try { t = traductor(key, p); } catch (e) { t = null; } }
    if (typeof t !== 'string') t = Object.prototype.hasOwnProperty.call(TEXTOS, key) ? TEXTOS[key] : key;
    return p ? t.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined && p[k] !== null ? String(p[k]) : m)) : t;
  }

  /* ---------- Datos (se arman desde js/datos.js) ---------- */
  const ROLE_ALIAS = D.ROLE_ALIAS; // claves viejas → nuevas
  const normRole = (r) => (ROLE_ALIAS[r] || r);
  const ROLES = {};
  D.ROLES_DATA.forEach((r, i) => { ROLES[r.key] = Object.assign({ key: r.key, orden: i }, r); });
  // Alias ocultos (no salen en Object.keys) para que las claves viejas sigan funcionando
  Object.keys(ROLE_ALIAS).forEach((old) => Object.defineProperty(ROLES, old, { value: ROLES[ROLE_ALIAS[old]], enumerable: false, configurable: true }));
  const ROLE_KEYS = D.ROLES_DATA.map((r) => r.key);

  const TIERS = {};
  D.TIERS_DATA.forEach((t, i) => { TIERS[t.key] = Object.assign({ orden: i }, t); });
  const TIER_KEYS = D.TIERS_DATA.map((t) => t.key);
  const tierOf = (p) => TIERS[p && p.tier] || TIERS.junior;
  const tierBonus = (p) => tierOf(p).bonus;

  const CATALOG = {};
  Object.keys(D.CATALOGO).forEach((k) => { CATALOG[k] = Object.assign({ key: k }, D.CATALOGO[k]); });
  const CATEGORIAS = D.CATEGORIAS.map((c) => ({ key: c.key, icon: c.icon }));
  const CONSUMABLES = {};
  Object.keys(D.CONSUMIBLES).forEach((k) => { CONSUMABLES[k] = Object.assign({ key: k }, D.CONSUMIBLES[k]); });
  const EVENT_TYPES = {};
  Object.keys(D.EVENTOS).forEach((k) => { EVENT_TYPES[k] = Object.assign({ key: k }, D.EVENTOS[k]); });
  const INTL_KINDS = D.INTERNACIONALES;
  const CLASE = D.CLASE_CAMARA;
  const FIT = D.AJUSTE;

  function aplicarTextos() {
    ROLE_KEYS.forEach((k) => {
      const r = ROLES[k];
      r.name = tx('rol.' + k + '.nombre'); r.desc = tx('rol.' + k + '.desc'); r.siFalta = tx('rol.' + k + '.falta');
    });
    TIER_KEYS.forEach((k) => { TIERS[k].name = tx('nivel.' + k); });
    Object.keys(CATALOG).forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(TEXTOS, 'item.' + k + '.nombre')) return; // los de premium.js traen su propio nombre
      CATALOG[k].name = tx('item.' + k + '.nombre'); CATALOG[k].desc = tx('item.' + k + '.desc');
      if (Object.prototype.hasOwnProperty.call(TEXTOS, 'item.' + k + '.uso')) CATALOG[k].uso = tx('item.' + k + '.uso');
    });
    CATEGORIAS.forEach((c) => { c.nombre = tx('cat.' + c.key); c.name = c.nombre; });
    Object.keys(CONSUMABLES).forEach((k) => { CONSUMABLES[k].name = tx('cons.' + k + '.nombre'); CONSUMABLES[k].desc = tx('cons.' + k + '.desc'); });
    Object.keys(EVENT_TYPES).forEach((k) => { if (!EVENT_TYPES[k].nombre || Object.prototype.hasOwnProperty.call(TEXTOS, 'ev.' + k)) EVENT_TYPES[k].name = tx('ev.' + k); });
    CHAPTERS.forEach((ch, i) => {
      ['title', 'intro', 'goal', 'done'].forEach((f) => { ch[f] = tx('cap.' + i + '.' + f); });
    });
  }
  /* Tipo de evento que trae una extensión (por ejemplo, los de temporada). def como en datos.js EVENTOS;
     con temporada: '<clave>' no sale entre las ofertas normales. El nombre sale de TEXTOS 'ev.<clave>'
     (o de def.nombre si la extensión trae su propio texto, por ejemplo una temporada que manda el servidor). */
  function registrarTipoEvento(key, def) {
    if (!key || !def || D.EVENTOS[key]) return null; // nunca pisa un evento del juego base
    const t = Object.assign({ key, peso: 1, minRep: 0, clients: [def.cliente || key] }, def);
    if (typeof t.crew === 'string') t.crew = plantillaDe(t.crew);
    if (typeof t.crewReal === 'string') t.crewReal = plantillaDe(t.crewReal);
    if (!t.crewReal) t.crewReal = t.crew;
    EVENT_TYPES[key] = t;
    t.name = Object.prototype.hasOwnProperty.call(TEXTOS, 'ev.' + key) || !def.nombre ? tx('ev.' + key) : def.nombre;
    return t;
  }
  function plantillaDe(txt) {
    const o = {};
    String(txt).split(',').forEach((p) => { const m = p.trim().match(/^(\w+) (\d+)\/(\d+)$/); if (m) o[m[1]] = [Number(m[2]), Number(m[3])]; });
    return o;
  }
  function setTraductor(fn) { traductor = typeof fn === 'function' ? fn : null; aplicarTextos(); }

  const FIRST_NAMES = D.NOMBRES;
  const LAST_NAMES = D.APELLIDOS;
  const STARS_PAY = BALANCE.starsPay;
  const STARS_REP = BALANCE.starsRep;

  /* ---------- Historia (capítulos) ---------- */
  // character: quién habla en el capítulo (la pantalla dibuja su retrato)
  //   'ramiro' = Don Ramiro (mentor) · 'mega' = Germán Vélez, dueño de MegaVisión (rival)
  //   'marca' = Lucía Mena (gerente de marketing) · 'dirigente' = Don Aurelio (dirigente de club)
  // target: tipo de evento que pide el capítulo. offer: cada cuántos días llega una oferta
  //   "de la historia" de ese tipo (first = días hasta la primera, every = días entre ofertas).
  // Los textos están en datos.js (claves cap.N.title / intro / goal / done / prog).
  const good = (s, type) => (s.chapterStats && s.chapterStats.good[type]) || 0;
  const duelsWon = (s) => (s.chapterStats && s.chapterStats.duels) || 0;
  const earnedCh = (s) => (s.chapterStats && s.chapterStats.earned) || 0; // ganancia neta de eventos en el capítulo
  // Capítulo 5: un switcher de producción de calidad 4 o más (el ATOM 2 M/E o mejor, o una unidad móvil)
  const hasProSwitcher = (s) => s.equip.some((e) => CATALOG[e.type] && ((CATALOG[e.type].cat === 'switcher' && CATALOG[e.type].q >= 4) || (CATALOG[e.type].cat === 'vehicle' && /^ob/.test(CATALOG[e.type].subtipo))));
  const CHAPTERS = [
    {
      character: 'ramiro',
      check: (s) => s.stats.events >= 3,
      progress: (s) => tx('cap.0.prog', { n: Math.min(s.stats.events, 3) }),
      reward: 400,
    },
    {
      character: 'ramiro',
      check: (s) => countCat(s, 'cam') >= 2 && s.staff.length >= 4 && s.rep >= 15,
      progress: (s) => tx('cap.1.prog', { cams: Math.min(countCat(s, 'cam'), 2), staff: Math.min(s.staff.length - 1, 3), fama: Math.min(Math.floor(s.rep), 15) }),
      reward: 800,
    },
    {
      character: 'marca',
      target: 'lanzamiento',
      offer: { first: 3, every: 5 },
      check: (s) => good(s, 'lanzamiento') >= 2,
      progress: (s) => tx('cap.2.prog', { n: Math.min(good(s, 'lanzamiento'), 2) }),
      reward: 1500,
    },
    {
      character: 'mega',
      check: (s) => duelsWon(s) >= 3 && s.rep >= 40 && earnedCh(s) >= BALANCE.chapter4Earn,
      progress: (s) => tx('cap.3.prog', { duelos: Math.min(duelsWon(s), 3), fama: Math.min(Math.floor(s.rep), 40), dinero: money(clamp(earnedCh(s), 0, BALANCE.chapter4Earn)), meta: money(BALANCE.chapter4Earn) }),
      reward: 2000,
    },
    {
      character: 'dirigente',
      target: 'ligapro',
      offer: { first: 8, every: 12 },
      check: (s) => hasProSwitcher(s) && good(s, 'ligapro') >= 2,
      progress: (s) => tx('cap.4.prog', { sw: hasProSwitcher(s) ? '✅' : '❌', n: Math.min(good(s, 'ligapro'), 2) }),
      reward: 3000,
    },
    {
      character: 'ramiro',
      target: 'final',
      offer: { first: 18, every: 12 },
      check: (s) => (s.stats.best.final || 0) >= 5,
      progress: (s) => {
        const best = s.stats.best.final || 0;
        const offered = s.contracts.some((c) => c.type === 'final');
        const left = Math.max(0, (s.storyNext || 0) - s.day);
        const when = offered ? tx('cap.5.llego') : s.rep < EVENT_TYPES.final.minRep ? tx('cap.5.fama', { fama: Math.floor(s.rep), min: EVENT_TYPES.final.minRep })
          : left > 0 ? tx(left > 1 ? 'cap.5.dias' : 'cap.5.dia', { n: left }) : tx('cap.5.pronto');
        return tx('cap.5.prog', { best, when });
      },
      reward: 5000,
    },
  ];

  /* ---------- Ayudantes ---------- */
  function countCat(s, cat) { return s.equip.filter((e) => CATALOG[e.type] && CATALOG[e.type].cat === cat).length; }
  function nextId(s) { s.idc = (s.idc || 0) + 1; return s.idc; }
  /* Nombres que se muestran: el dueño y la cámara de Don Ramiro se arman con su clave (así cambian con el idioma,
     también en partidas viejas que guardaron el nombre en español). Para los parámetros de los textos se usa
     nm(p): el dueño va como { k } (tx lo traduce al armar el texto, también después en la pantalla). */
  function nombrePersona(p) { return p && p.owner ? tx('persona.duenio') : (p && p.name) || ''; }
  const nm = (p) => (p && p.owner ? { k: 'persona.duenio' } : (p && p.name) || '');
  const itemP = (type) => (Object.prototype.hasOwnProperty.call(TEXTOS, 'item.' + type + '.nombre') ? { k: 'item.' + type + '.nombre' } : (CATALOG[type] || {}).name || type);
  function equipName(e) { return e && e.starter ? tx('equipo.camara_ramiro') : e ? (e.nick || itemOf(e).name) : ''; }
  /* País de un contrato internacional: clave pais.<slug> (si existe) para traducirlo */
  const paisSlug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const paisKey = (t) => { const k = 'pais.' + paisSlug(t); return Object.prototype.hasOwnProperty.call(TEXTOS, k) ? k : null; };
  function paisNombre(c) { const k = c && (c.paisK || paisKey(c.pais)); return k ? tx(k) : (c && c.pais) || ''; }
  const paisP = (c) => { const k = c && (c.paisK || paisKey(c.pais)); return k ? { k } : (c && c.pais) || ''; };
  function log(s, key, p) {
    s.log.unshift({ day: s.day, text: tx(key, p), k: key, p: p || null });
    if (s.log.length > 80) s.log.length = 80;
  }
  /* Avisos: cosas importantes que pasaron (para mostrar un resumen del día). También van al registro. */
  function aviso(s, tipo, key, p) {
    log(s, key, p);
    if (!Array.isArray(s.avisos)) s.avisos = [];
    s.avisos.push({ day: s.day, tipo, k: key, p: p || null, text: s.log[0].text });
    if (s.avisos.length > 40) s.avisos.splice(0, s.avisos.length - 40);
  }
  /* Devuelve los avisos pendientes y los borra */
  function takeAvisos(s) { const a = Array.isArray(s.avisos) ? s.avisos : []; s.avisos = []; return a; }
  /* Capítulos completados que la pantalla todavía no mostró (por evento, compra o contratación) */
  function takeChapterDone(s) { const a = Array.isArray(s.capCompletados) ? s.capCompletados : []; s.capCompletados = []; return a; }
  function staffName(s) { return pick(s, FIRST_NAMES) + ' ' + pick(s, LAST_NAMES); }
  function itemOf(e) { return CATALOG[e.type] || CATALOG.cam_basic; }
  function repairCost(e) {
    const it = itemOf(e);
    const f = typeof it.mant === 'number' ? BALANCE.transporte.repairFactor : BALANCE.repairFactor;
    // repairBase: los de Edición Exclusiva se reparan más barato que lo que cuestan
    return it.alquiler ? 0 : Math.round((typeof it.repairBase === 'number' ? it.repairBase : it.price) * f * (100 - e.condition) / 100);
  }
  function sellPrice(e) {
    const it = itemOf(e);
    if (it.alquiler) return Math.round(it.price * BALANCE.rentalRefund);
    return Math.round(it.price * BALANCE.sellFactor * e.condition / 100);
  }
  const owned = (s) => s.equip.filter((e) => !itemOf(e).alquiler);

  /* Gastos fijos de cada día: local, personal (aunque no haya evento) y equipos.
     Cuanto más grande la productora, más cuesta mantenerla. Los alquileres por evento no cuentan. */
  // Vehículos de la flota con mantenimiento propio (mant por día): no pagan el 0,2% de seguro de equipos
  const conMant = (e) => typeof itemOf(e).mant === 'number';
  // valor: lo que vale para el seguro (Edición Exclusiva: el del mejor equipo normal de su categoría, no su precio en dinero del juego)
  const equipValueOf = (s) => owned(s).filter((e) => !conMant(e)).reduce((a, e) => a + (typeof itemOf(e).valor === 'number' ? itemOf(e).valor : itemOf(e).price), 0);
  function vehiclesDaily(s) { return owned(s).filter(conMant).reduce((a, e) => a + itemOf(e).mant, 0); }
  /* Publicidad de la flota rotulada: cuánto más pagan los clientes (0 a 0,06) */
  function publicidadFlota(s) {
    const P = BALANCE.transporte.publicidad;
    if (!s || !Array.isArray(s.equip)) return 0;
    const v = owned(s).filter(conMant).reduce((a, e) => a + (itemOf(e).subtipo === 'sedan' ? P.sedan : P.porVehiculo), 0);
    return Math.min(P.max, Math.round(v * 1000) / 1000);
  }
  function dailyCost(s) {
    const d = BALANCE.daily;
    const hired = s.staff.filter((p) => !p.owner);
    const payroll = hired.reduce((a, p) => a + p.wage, 0) * d.payrollShare;
    return Math.round((rentFor(s) + d.perStaff * hired.length + equipValueOf(s) * d.equipShare + vehiclesDaily(s) + payroll) * extMult(s, 'multGastos')) + extSuma(s, 'gastoFijo');
  }
  function rentTier(s) {
    const size = s.staff.length + owned(s).length;
    return BALANCE.daily.rent.reduce((r, t) => (size >= t[0] ? t : r), BALANCE.daily.rent[0]);
  }
  function rentFor(s) { return rentTier(s)[1]; }
  /* El local de la productora: un solo nombre para toda la pantalla (dibujo y gastos) */
  function venue(s) {
    const t = rentTier(s);
    return { key: t[2], name: tx(t[2]), rent: t[1], size: s.staff.length + owned(s).length, nivel: BALANCE.daily.rent.indexOf(t) };
  }
  function venueName(s) { return venue(s).name; }
  /* Detalle de los gastos diarios (para mostrar en pantalla) */
  function dailyCostBreakdown(s) {
    const d = BALANCE.daily;
    const hired = s.staff.filter((p) => !p.owner);
    const tier = rentTier(s);
    const all = d.rent;
    const next = all[all.indexOf(tier) + 1] || null;
    const size = s.staff.length + owned(s).length;
    const out = {
      place: tx(tier[2]), placeKey: tier[2], rent: tier[1], size,
      nextPlace: next ? tx(next[2]) : null, nextAt: next ? next[0] : null, nextRent: next ? next[1] : null,
      staff: d.perStaff * hired.length,
      payroll: Math.round(hired.reduce((a, p) => a + p.wage, 0) * d.payrollShare),
      equip: Math.round(equipValueOf(s) * d.equipShare),
      vehiculos: Math.round(vehiclesDaily(s)), // mantenimiento, seguro y matrícula de la flota
    };
    out.total = dailyCost(s);
    out.fijoExt = extSuma(s, 'gastoFijo');
    const fx = extMult(s, 'multGastos');
    if (fx !== 1) { const base = out.total - out.fijoExt; out.ext = { mult: r2(fx), monto: base - Math.round(base / fx) }; } // lo que suman o ahorran las extensiones
    return out;
  }
  /* Sueldo de una persona en un evento (cobra más en eventos grandes) */
  function eventWage(p, diff) {
    return Math.round(p.wage * (1 + BALANCE.wage.perDiff * Math.max(0, diff - 1)));
  }
  /* Sueldo base de alguien nuevo según rol, nivel y habilidad */
  function baseWage(role, tier, skill) {
    const r = ROLES[normRole(role)] || ROLES.camarografo;
    const t = TIERS[tier] || TIERS.junior;
    return Math.round(t.base * r.wageMul + (skill - 1) * BALANCE.wage.perSkill);
  }

  /* Cuánto paga un cliente según tu fama y el tamaño del evento:
     con poca fama (menos de la inicial) pagan menos; los eventos grandes pagan más por punto de dificultad */
  function payFactor(s, diff) {
    const P = BALANCE.pay;
    const rep = s.rep || 0;
    const f = rep >= P.repFull ? 1 + (rep - P.repFull) / P.repBonus : P.repMin + (1 - P.repMin) * rep / P.repFull;
    return f * (1 + P.perDiff * Math.max(0, (diff || 1) - 1)) * (badStreak(s) ? BALANCE.trust.payMul : 1)
      * (1 + BALANCE.transporte.cotiza + publicidadFlota(s));
  }
  /* Tus últimos eventos salieron casi todos con 1 estrella: los clientes desconfían */
  function badStreak(s) {
    const T = BALANCE.trust, r = s.recentStars;
    if (!Array.isArray(r) || r.length < T.last || (s.stats && s.stats.events) < T.minEvents) return false;
    return r.reduce((a, b) => a + b, 0) / r.length < T.badAvg;
  }
  /* Parte del pago que cobras según las estrellas (los eventos grandes mal hechos casi no se cobran) */
  function payMult(c, stars, s) {
    const m = (c.diff >= BALANCE.bigFrom ? BALANCE.starsPayBig : STARS_PAY)[clamp(stars, 0, 5)];
    // Mientras aprendes (primeros eventos), un evento chico con 1 estrella todavía se cobra un poco más
    if (stars === 1 && s && s.stats && s.stats.events < BALANCE.learn.events && c.diff < BALANCE.bigFrom) return Math.max(m, BALANCE.learn.pay1);
    return m;
  }

  /* Calidad que promete MegaVisión en un contrato disputado (sube con el capítulo y la dificultad) */
  function rivalQualityFor(s, c) {
    const r = BALANCE.rival.quality;
    const ch = s.storyDone ? CHAPTERS.length - 1 : s.chapter;
    return clamp(Math.round(r.base + r.perChapter * ch + r.perDiff * c.diff + randInt(s, r.spread[0], r.spread[1])), r.min, r.max);
  }
  function inTutorial(s) { return s.stats.events < BALANCE.tutorialEvents; }

  /* ---------- Juego nuevo ---------- */
  function newGame(seed) {
    armando++;
    try { return newGame0(seed); } finally { armando--; }
  }
  function newGame0(seed) {
    const s = {
      v: SAVE_VERSION,
      seed: (seed === undefined ? Date.now() : seed) | 0,
      idc: 0,
      day: 1,
      money: BALANCE.start.money,
      rep: BALANCE.start.rep,
      chapter: 0,
      chapterSeen: -1,
      storyDone: false,
      gameOver: false,
      staff: [],
      candidates: [],
      equip: [],
      stock: { cable: 1, battery: 0 },
      contracts: [],
      currentEvent: null,
      lastResult: null,
      daily: { redes: 0, anuncio: 0 },
      stats: { events: 0, fiveStars: 0, earned: 0, best: {}, good: {}, duels: { won: 0, lost: 0 }, intl: 0 },
      storyNext: 0, // día en que llega la próxima oferta de la historia (si el capítulo tiene target)
      chapterStats: { good: {}, duels: 0 }, // avance dentro del capítulo actual
      pending: [], // cobros que llegan después: { day, amount, client }
      avisos: [], // cosas importantes que pasaron (Game.takeAvisos)
      capCompletados: [], // capítulos completados que falta mostrar (Game.takeChapterDone)
      lastWorkDay: 1, // último día con evento (para el desgaste de fama)
      hoy: { dia: 1, n: 0, pagos: 0, ganancia: 0, eventos: [] }, // turnos de hoy (varios eventos por día)
      resumenDia: null, // resumen del último día cerrado (Game.takeResumenDia)
      intlNext: 0, // día de la próxima oferta internacional (0 = todavía no se programa)
      log: [],
    };
    s.staff.push({ id: nextId(s), name: tx('persona.duenio'), role: 'camarografo', tier: 'semi_senior', skill: 2, wage: 0, morale: 100, events: 0,
      eventos_nacionales: 0, eventos_internacionales: 0, owner: true });
    s.equip.push({ id: nextId(s), type: 'cam_basic', condition: 75, nick: tx('equipo.camara_ramiro'), starter: true });
    // Las 3 primeras ofertas son fáciles: sin transmisión por internet
    ['misa', 'boda', 'misa'].forEach((k) => { const c = addContract(s, k); c.stream = false; c.outdoor = false; c.cams = 1; c.daysLeft = 4; });
    refreshCandidates(s);
    log(s, 'log.inicio');
    armando--;
    try { migrarExt(s); } finally { armando++; }
    return s;
  }

  /* ---------- Clientes / contratos ---------- */
  function availableTypes(s) {
    const ch = !s.storyDone && CHAPTERS[s.chapter];
    return Object.keys(EVENT_TYPES).filter((k) => {
      const t = EVENT_TYPES[k];
      if (t.soloInternacional) return false;
      if (t.temporada) return false; // los eventos de temporada solo llegan por su extensión
      if (t.minRep > s.rep) return false;
      if (!s.storyDone && t.minChapter && s.chapter < t.minChapter) return false;
      // El evento que pide el capítulo solo llega como oferta de la historia
      if (ch && ch.target === k) return false;
      return true;
    });
  }

  // La rival pelea contratos desde el capítulo 4 (y en modo libre)
  function rivalActive(s) { return s.storyDone || s.chapter >= BALANCE.rival.fromChapter; }

  function addContract(s, typeKey, payBoost, opts) {
    opts = opts || {};
    if (s.contracts.length >= BALANCE.maxContracts) return null;
    const types = availableTypes(s);
    if (!typeKey) {
      // Un poco más de probabilidad de los eventos más grandes que ya desbloqueaste (las finales y LigaPrima son raras: ver peso)
      const weights = types.map((k, i) => (1 + i * 0.4) * (EVENT_TYPES[k].peso || 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rnd(s) * total;
      typeKey = types[types.length - 1];
      for (let i = 0; i < types.length; i++) { r -= weights[i]; if (r <= 0) { typeKey = types[i]; break; } }
    }
    const t = EVENT_TYPES[typeKey];
    const c = {
      id: nextId(s),
      type: typeKey,
      client: pick(s, t.clients),
      cams: randInt(s, t.cams[0], t.cams[1]),
      audio: t.audio,
      stream: chance(s, t.stream),
      outdoor: chance(s, t.outdoor),
      diff: t.diff,
      pay: Math.round(randInt(s, t.pay[0], t.pay[1]) * payFactor(s, t.diff) * (payBoost || 1) / 10) * 10,
      daysLeft: randInt(s, 2, 4),
      rival: false, // true = "disputado": MegaVisión también lo quiere
      story: !!opts.story, // true = oferta de la historia (la pide el capítulo)
    };
    if (c.story) c.daysLeft = randInt(s, 4, 5);
    if (opts.especial) Object.assign(c, opts.especial); // campos extra de una extensión (temporada, etc.)
    const fp = extMult(s, 'multPago', c);
    if (fp !== 1) c.pay = Math.round(c.pay * fp / 10) * 10;
    // Disputado: MegaVisión también lo quiere, así que el cliente exige más (dificultad +1) y paga más
    const R = BALANCE.rival;
    const pc = !s.storyDone && s.chapter === R.fromChapter ? R.contestedChapter : R.contestedChance;
    if (!c.story && !opts.noRival && t.diff >= 2 && rivalActive(s) && (opts.rival || chance(s, pc))) {
      c.rival = true;
      c.diff = Math.min(5, c.diff + R.diffBoost);
      c.pay = Math.round(c.pay * R.payBoost / 10) * 10;
      c.rivalQuality = rivalQualityFor(s, c); // la calidad que tienes que superar
    }
    s.contracts.push(c);
    return c;
  }

  /* Oferta especial que pide el capítulo actual (llega cada cierto tiempo) */
  function storyOffer(s) {
    const ch = CHAPTERS[s.chapter];
    if (s.storyDone || !ch || !ch.target || !ch.offer) return;
    if (s.day < (s.storyNext || 0)) return;
    if (EVENT_TYPES[ch.target].minRep > s.rep) return;
    if (s.contracts.some((c) => c.type === ch.target && c.story)) return;
    if (s.contracts.length >= BALANCE.maxContracts) {
      // Hace espacio quitando la oferta normal que vence primero
      const normal = s.contracts.filter((c) => !c.story && !c.internacional).sort((a, b) => a.daysLeft - b.daysLeft)[0];
      if (!normal) return;
      s.contracts = s.contracts.filter((c) => c !== normal);
    }
    const c = addContract(s, ch.target, 1, { story: true });
    if (!c) return;
    s.storyNext = s.day + ch.offer.every;
    log(s, 'historia.llamada.' + ch.target, { cliente: c.client });
  }

  /* ---------- Contratos internacionales ---------- */
  function intlEligible(s) {
    const ch = s.storyDone ? CHAPTERS.length : s.chapter;
    return Object.keys(INTL_KINDS).filter((k) => {
      const K = INTL_KINDS[k];
      if (K.storyDone && !s.storyDone) return false;
      return ch >= K.fromChapter && s.rep >= K.minRep;
    });
  }
  function addIntlContract(s, kindKey) {
    if (s.contracts.length >= BALANCE.maxContracts) return null;
    const keys = kindKey ? [kindKey] : intlEligible(s);
    if (!keys.length) return null;
    if (!kindKey) {
      const ws = keys.map((k) => INTL_KINDS[k].peso);
      let r = rnd(s) * ws.reduce((a, b) => a + b, 0);
      kindKey = keys[keys.length - 1];
      for (let i = 0; i < keys.length; i++) { r -= ws[i]; if (r <= 0) { kindKey = keys[i]; break; } }
    }
    const K = INTL_KINDS[kindKey];
    const t = EVENT_TYPES[K.type];
    const ref = EVENT_TYPES[K.ref];
    const opt = pick(s, K.clientes);
    const c = {
      id: nextId(s),
      type: K.type,
      client: opt[0],
      pais: opt[1],
      paisK: paisKey(opt[1]) || undefined,
      cams: randInt(s, t.cams[0], t.cams[1]),
      audio: t.audio,
      stream: true,
      outdoor: chance(s, t.outdoor),
      diff: Math.min(5, t.diff + (K.diffBoost || 0)),
      pay: Math.round(randInt(s, ref.pay[0], ref.pay[1]) * K.mult * payFactor(s, ref.diff) / 10) * 10,
      daysLeft: BALANCE.intl.daysLeft,
      rival: false,
      story: false,
      internacional: true,
      kind: kindKey,
      mult: K.mult,
      travelDays: K.travelDays,
      repRisk: K.repRisk,
      payLaterShare: K.payLater || 0,
    };
    const fpi = extMult(s, 'multPago', c);
    if (fpi !== 1) c.pay = Math.round(c.pay * fpi / 10) * 10;
    c.travelCost = Math.round(c.pay * K.travelShare / 10) * 10;
    c.requisitos = requisitosInternacional(s, c, s.staff.map((p) => p.id), s.equip.map((e) => e.id));
    s.contracts.push(c);
    aviso(s, 'internacional', 'log.intl_oferta', { cliente: c.client, pais: paisP(c), monto: money(c.pay) });
    return c;
  }
  function intlTick(s) {
    const I = BALANCE.intl;
    const ch = s.storyDone ? CHAPTERS.length : s.chapter;
    if (ch < I.fromChapter) return;
    if (!s.intlNext) { s.intlNext = s.day + randInt(s, I.first[0], I.first[1]); return; }
    if (s.day < s.intlNext) return;
    if (s.contracts.some((c) => c.internacional)) return;
    const c = addIntlContract(s);
    if (c) s.intlNext = s.day + randInt(s, I.every[0], I.every[1]);
  }

  /* Requisitos de un contrato internacional con ese personal y esos equipos */
  function requisitosInternacional(s, c, staffIds, equipIds) {
    const K = c && INTL_KINDS[c.kind];
    if (!K) return [];
    const staff = s.staff.filter((p) => (staffIds || []).includes(p.id));
    const equip = s.equip.filter((e) => (equipIds || []).includes(e.id));
    const ctx = { s, c, staff, equip };
    return K.requisitos.map((key) => {
      const R = REQUISITOS[key];
      const p = R.params ? R.params(K) : null;
      return { key, texto: tx('req.' + key, p), ok: !!R.ok(ctx, K), obligatorio: !!R.obligatorio };
    });
  }
  const isIntlExp = (p) => p.tier === 'internacional' || (p.eventos_internacionales || 0) > 0;
  const eqOf = (ctx, f) => ctx.equip.filter((e) => CATALOG[e.type] && f(CATALOG[e.type], e));
  const REQUISITOS = {
    dir_intl: { obligatorio: true, ok: (x) => x.staff.some((p) => normRole(p.role) === 'director' && isIntlExp(p)) },
    equipo_intl: { obligatorio: true, params: (K) => ({ n: K.intlExtra }),
      ok: (x, K) => x.staff.filter((p) => normRole(p.role) !== 'director' && isIntlExp(p)).length >= K.intlExtra },
    senior3: { ok: (x) => x.staff.filter((p) => tierOf(p).orden >= 2).length >= 3 },
    hombro4k: { ok: (x) => eqOf(x, (it) => it.cat === 'cam' && it.q >= 4).length >= 2 },
    cams4k: { ok: (x) => eqOf(x, (it) => it.cat === 'cam' && it.q >= 4).length >= 3 },
    cams3: { ok: (x) => eqOf(x, (it) => it.cat === 'cam' && it.q >= 3).length >= 3 },
    sistema3: { ok: (x) => eqOf(x, (it) => it.cat === 'cam' && CLASE[it.subtipo] === 'sistema').length >= 3 },
    box2: { ok: (x) => eqOf(x, (it) => it.cat === 'lens' && it.subtipo === 'lente_box').length >= 2 },
    replay5: { ok: (x) => eqOf(x, (it) => it.cat === 'replay' && it.q >= 5).length >= 1 },
    ob: { ok: (x) => eqOf(x, (it) => (it.cat === 'vehicle' && /^ob/.test(it.subtipo)) || it.subtipo === 'ob_alquiler').length >= 1 },
    generador: { ok: (x) => eqOf(x, (it) => it.subtipo === 'generador_diesel').length >= 1 },
    enlace: { ok: (x) => eqOf(x, (it) => (it.cat === 'encoder' && it.q >= 5) || it.subtipo === 'satelite').length >= 1 },
    satelite: { ok: (x) => eqOf(x, (it) => it.subtipo === 'satelite').length >= 1 },
    diadema: { ok: (x) => eqOf(x, (it) => it.subtipo === 'diadema_comentarista').length >= 1 },
    grua: { ok: (x) => eqOf(x, (it) => it.subtipo === 'grua' || it.subtipo === 'jib').length >= 1 },
    ptz: { ok: (x) => eqOf(x, (it) => CLASE[it.subtipo] === 'ptz').length >= 1 },
    encoder2: { ok: (x) => eqOf(x, (it) => it.cat === 'encoder').length >= 2 },
    graficos: { ok: (x) => eqOf(x, (it) => it.cat === 'graphics').length >= 1 && x.staff.some((p) => normRole(p.role) === 'operador_graficos') },
    intercom: { ok: (x) => eqOf(x, (it) => it.cat === 'intercom' || (it.cat === 'vehicle' && /^ob/.test(it.subtipo))).length >= 1 },
    maletas: { ok: (x) => eqOf(x, (it) => it.cat === 'case').length >= 1 },
    bonding: { ok: (x) => eqOf(x, (it) => it.cat === 'encoder' && /bonding/.test(it.subtipo)).length >= 1 },
    iso: { ok: (x) => eqOf(x, (it) => it.cat === 'switcher' && it.q >= 2).length >= 1 },
  };

  /* Acciones para conseguir clientes */
  function marketing(s, kind) {
    if (s.currentEvent || s.gameOver) return { ok: false, msg: tx('msg.ahora_no') };
    if (kind === 'redes') {
      if (s.daily.redes >= 1) return { ok: false, msg: tx('msg.redes_hoy') };
      if (s.money < 40) return { ok: false, msg: tx('msg.no_tienes', { monto: money(40) }) };
      if (s.contracts.length >= BALANCE.maxContracts) return { ok: false, msg: tx('msg.muchas_ofertas') };
      s.money -= 40; s.daily.redes++;
      const c = addContract(s);
      log(s, 'log.redes', { cliente: c.client });
      return { ok: true, msg: tx('msg.redes', { cliente: c.client }) };
    }
    if (kind === 'anuncio') {
      if (s.daily.anuncio >= 1) return { ok: false, msg: tx('msg.anuncio_hoy') };
      if (s.money < 200) return { ok: false, msg: tx('msg.no_tienes', { monto: money(200) }) };
      if (s.contracts.length >= 6) return { ok: false, msg: tx('msg.muchas_ofertas') };
      s.money -= 200; s.daily.anuncio++;
      addContract(s, null, 1.15); addContract(s, null, 1.15);
      log(s, 'log.anuncio');
      return { ok: true, msg: tx('msg.anuncio') };
    }
    if (kind === 'visitar') {
      if (s.contracts.length >= 6) return { ok: false, msg: tx('msg.muchas_ofertas') };
      log(s, 'log.visitar');
      nextDay(s);
      addContract(s); addContract(s);
      return { ok: true, msg: tx('msg.visitar') };
    }
    return { ok: false, msg: tx('msg.desconocida') };
  }

  /* ---------- Personal ---------- */
  function rollTier(s) {
    const H = BALANCE.hiring;
    const rep = s.rep;
    const pIntl = rep >= H.intlFrom ? H.intlBase + (rep - H.intlFrom) * H.intlPerRep : 0;
    const pSenior = rep >= H.seniorFrom ? (rep - H.seniorFrom) * H.seniorPerRep : 0;
    const pSemi = H.semiBase + rep * H.semiPerRep;
    const r = rnd(s);
    if (r < pIntl) return 'internacional';
    if (r < pIntl + pSenior) return 'senior';
    if (r < pIntl + pSenior + pSemi) return 'semi_senior';
    return 'junior';
  }
  function makeCandidate(s, role) {
    const tier = rollTier(s);
    const T = TIERS[tier];
    const skill = randInt(s, T.skill[0], T.skill[1]);
    return {
      id: nextId(s),
      name: staffName(s),
      role,
      tier,
      skill,
      wage: baseWage(role, tier, skill) + randInt(s, 0, BALANCE.wage.random),
      morale: 80,
      events: 0,
      eventos_nacionales: 0,
      eventos_internacionales: tier === 'internacional' ? randInt(s, 3, 12) : 0,
    };
  }
  // Los roles especializados aparecen cuando la productora ya tiene algo de fama
  function candidateRoles(s) {
    return D.ROLES_DATA.filter((r) => s.rep >= (r.fama || 0)).map((r) => [r.key, r.peso || 1]);
  }
  function refreshCandidates(s, wantRole) {
    s.candidates = [];
    const pool = candidateRoles(s);
    const tot = pool.reduce((a, b) => a + b[1], 0);
    for (let i = 0; i < BALANCE.candidates; i++) {
      let role;
      if (wantRole && i < 2) role = wantRole;
      else if (i === 0) role = 'camarografo';
      else {
        let r = rnd(s) * tot;
        role = pool[pool.length - 1][0];
        for (const [k, w] of pool) { r -= w; if (r <= 0) { role = k; break; } }
      }
      s.candidates.push(makeCandidate(s, role));
    }
  }

  function hire(s, candId) {
    const i = s.candidates.findIndex((c) => c.id === candId);
    if (i < 0) return { ok: false, msg: tx('msg.ya_no_esta') };
    const c = s.candidates[i];
    const fee = c.wage * BALANCE.wage.hireFeeDays;
    if (s.staff.length >= maxStaff(s)) return { ok: false, msg: tx('msg.oficina_llena', { n: maxStaff(s) }) };
    if (s.money < fee) return { ok: false, msg: tx('msg.necesitas_contratar', { monto: money(fee) }) };
    s.money -= fee;
    s.candidates.splice(i, 1);
    s.staff.push(c);
    log(s, 'log.contrataste', { nombre: c.name, rol: { k: 'rol.' + normRole(c.role) + '.nombre' }, nivel: { k: 'nivel.' + (c.tier || 'junior') }, monto: money(fee) });
    const chapterDone = checkChapter(s);
    return { ok: true, msg: tx('msg.se_unio', { nombre: nm(c) }), chapterDone };
  }

  function fire(s, staffId) {
    const i = s.staff.findIndex((p) => p.id === staffId);
    if (i < 0 || s.staff[i].owner) return { ok: false, msg: tx('msg.no_se_puede') };
    const p = s.staff[i];
    s.staff.splice(i, 1);
    log(s, 'log.despediste', { nombre: nm(p) });
    return { ok: true, msg: tx('msg.despediste', { nombre: nm(p) }) };
  }

  function searchStaff(s, role) {
    if (s.money < 30) return { ok: false, msg: tx('msg.vacante_plata') };
    s.money -= 30;
    refreshCandidates(s, role && ROLES[normRole(role)] ? normRole(role) : null);
    return { ok: true, msg: tx('msg.candidatos') };
  }

  /* ---------- Tienda / bodega ---------- */
  function shopByCategory(s) {
    return CATEGORIAS.map((c) => ({
      key: c.key, nombre: c.nombre, icon: c.icon,
      items: Object.keys(CATALOG).filter((k) => CATALOG[k].cat === c.key && !CATALOG[k].premium)
        .sort((a, b) => CATALOG[a].price - CATALOG[b].price)
        .map((k) => Object.assign({}, CATALOG[k], { key: k, locked: CATALOG[k].minRep > s.rep, owned: s.equip.filter((e) => e.type === k).length })),
    })).filter((c) => c.items.length);
  }
  function buy(s, type) {
    const it = CATALOG[type];
    if (!it) return { ok: false, msg: tx('msg.no_existe') };
    if (it.minRep > s.rep) return { ok: false, msg: tx('msg.fama_para_comprar', { n: it.minRep }) };
    if (s.money < it.price) return { ok: false, msg: tx('msg.falta_dinero', { monto: money(it.price) }) };
    if (s.equip.length >= maxEquip(s)) return { ok: false, msg: tx('msg.bodega_llena') };
    s.money -= it.price;
    s.equip.push({ id: nextId(s), type, condition: 100 });
    log(s, it.alquiler ? 'log.alquilaste' : 'log.compraste', { item: itemP(type), monto: money(it.price) });
    const chapterDone = checkChapter(s);
    return { ok: true, msg: tx(it.alquiler ? 'msg.alquilaste' : 'msg.compraste', { item: it.name }), chapterDone };
  }

  function buyConsumable(s, key, qty) {
    const it = CONSUMABLES[key];
    qty = qty || 1;
    if (!it) return { ok: false, msg: tx('msg.no_existe') };
    if (s.money < it.price * qty) return { ok: false, msg: tx('msg.falta_dinero', { monto: money(it.price * qty) }) };
    s.money -= it.price * qty;
    s.stock[key] = (s.stock[key] || 0) + qty;
    return { ok: true, msg: tx('msg.compraste_n', { n: qty, item: it.name }) };
  }

  function repair(s, equipId) {
    const e = s.equip.find((x) => x.id === equipId);
    if (!e) return { ok: false, msg: tx('msg.no_existe') };
    const cost = repairCost(e);
    if (cost <= 0) return { ok: false, msg: tx('msg.como_nuevo') };
    if (s.money < cost) return { ok: false, msg: tx('msg.reparar_cuesta', { monto: money(cost) }) };
    s.money -= cost;
    e.condition = 100;
    log(s, 'log.reparaste', { item: itemP(e.type), monto: money(cost) });
    return { ok: true, msg: tx('msg.quedo_nuevo') };
  }

  function sell(s, equipId) {
    const i = s.equip.findIndex((x) => x.id === equipId);
    if (i < 0) return { ok: false, msg: tx('msg.no_existe') };
    const e = s.equip[i];
    const p = sellPrice(e);
    s.money += p;
    s.equip.splice(i, 1);
    log(s, itemOf(e).alquiler ? 'log.cancelaste_alquiler' : 'log.vendiste', { item: itemP(e.type), monto: money(p) });
    return { ok: true, msg: tx('msg.vendido', { monto: money(p) }) };
  }

  /* ---------- Turnos del día (v4: varios eventos por día) ----------
     s.hoy = { dia, n (eventos hechos hoy), pagos, ganancia (suma de lo que dejó cada evento), eventos: [{ t, e, g }] }
     Se arma solo si falta o es de otro día (partidas viejas, pruebas que cambian s.day a mano). */
  function hoyDe(s) {
    if (!s.hoy || typeof s.hoy !== 'object' || s.hoy.dia !== s.day || !Array.isArray(s.hoy.eventos)) {
      s.hoy = { dia: s.day, n: 0, pagos: 0, ganancia: 0, eventos: [] };
    }
    return s.hoy;
  }
  // Ocupa el día entero: los internacionales (viajas) y los eventos grandes (dificultad del tipo 4 o más)
  function jornadaCompleta(c) {
    if (!c) return false;
    if (c.internacional) return true;
    const t = EVENT_TYPES[c.type];
    return !!t && (t.jornada === true || (t.jornada !== false && (t.diff || 1) >= BALANCE.dia.jornadaDesde));
  }
  /* Turno del día para la pantalla: { n (eventos hechos hoy), max, libres, turno (0 mañana, 1 tarde, 2 noche),
     gastos (gastos fijos de hoy, se cobran al cerrar el día), parte (lo que le toca a cada evento de hoy, null sin eventos),
     conOtro (lo que le tocaría a cada uno con un evento más; null si ya no quedan turnos), pagos, ganancia } */
  function turnoDia(s) {
    const H = hoyDe(s), max = BALANCE.dia.franjas;
    const g = dailyCost(s), n = H.n;
    return { n, max, libres: Math.max(0, max - n), turno: Math.min(n, max - 1), gastos: g,
      parte: n ? Math.round(g / n) : null, conOtro: n < max ? Math.round(g / (n + 1)) : null, pagos: H.pagos, ganancia: H.ganancia };
  }
  /* Resumen del último día cerrado (la pantalla lo muestra una vez):
     { dia, eventos, pagos, ganancia, gastos (gastos fijos cobrados; con días de viaje, todos), dias, resultado, lista } */
  function takeResumenDia(s) { const r = s && s.resumenDia ? s.resumenDia : null; if (s) s.resumenDia = null; return r; }

  /* ---------- Pasar el día (cerrar el día) ---------- */
  function nextDay(s, opts) {
    if (s.gameOver) return;
    opts = opts || {};
    const intento = esIntento(s);
    const H = intento ? null : hoyDe(s);
    const cerrado = s.day;
    s.day++;
    s.daily = { redes: 0, anuncio: 0 };
    const gasto = dailyCost(s);
    s.money -= gasto;
    if (!intento) {
      // Resumen del día que se cierra (los días de viaje de un internacional se suman al mismo resumen)
      const R0 = s.resumenDia;
      if (opts.travel && R0 && typeof R0 === 'object') { R0.gastos += gasto; R0.dias = (R0.dias || 1) + 1; R0.resultado = R0.ganancia - R0.gastos; }
      else {
        s.resumenDia = { dia: cerrado, eventos: H.n, pagos: H.pagos, ganancia: H.ganancia, gastos: gasto, dias: 1,
          resultado: H.ganancia - gasto, lista: H.eventos.slice(0, BALANCE.dia.franjas) };
      }
      s.hoy = { dia: s.day, n: 0, pagos: 0, ganancia: 0, eventos: [] };
    }
    // Cobros pendientes que llegan hoy
    s.pending = s.pending || [];
    const due = s.pending.filter((p) => p.day <= s.day);
    if (due.length) {
      due.forEach((p) => { s.money += p.amount; aviso(s, 'pago', 'log.pago_pendiente', { cliente: p.client, monto: money(p.amount) }); });
      s.pending = s.pending.filter((p) => p.day > s.day);
    }
    // Fama: si pasas días sin trabajar, la gente se olvida de ti
    const idle = s.day - (s.lastWorkDay || s.day);
    if (idle > 0 && idle % BALANCE.fameDecay.every === 0 && s.rep > 0 && !inTutorial(s)) {
      s.rep = clamp(s.rep - 1, 0, 100);
      aviso(s, 'fama', 'log.olvido', { n: idle });
    }
    // Ofertas que vencen
    s.contracts.forEach((c) => { c.daysLeft--; });
    const expired = s.contracts.filter((c) => c.daysLeft <= 0);
    if (expired.length) aviso(s, 'vencidas', 'log.vencieron', { n: expired.length });
    s.contracts = s.contracts.filter((c) => c.daysLeft > 0);
    if (!opts.travel) {
      // Nuevas ofertas según la fama
      // (con muy poca fama, por hacer mal los eventos, los clientes dejan de buscarte)
      // (los intentos en línea usan los números de siempre: el servidor los repite igual que antes)
      const OF = intento ? [0, 1] : BALANCE.dia.ofertas, pocas = intento ? 2 : BALANCE.dia.pocas;
      const n = randInt(s, OF[0], OF[1]) + (s.rep >= 25 ? 1 : 0) + (s.contracts.length < pocas && !badStreak(s) ? 1 : 0);
      for (let i = 0; i < n; i++) addContract(s);
      cadaExt(s, 'contratosExtra', (h) => h(s));
      // A veces un cliente cancela (nunca las ofertas de la historia ni las internacionales)
      const cancelable = s.contracts.filter((c) => !c.story && !c.internacional);
      if (!inTutorial(s) && cancelable.length && chance(s, BALANCE.cancelChance)) {
        const c = pick(s, cancelable);
        s.contracts = s.contracts.filter((x) => x !== c);
        aviso(s, 'cancelacion', 'log.cancelo', { cliente: c.client });
      }
      // Si el capítulo pide un evento especial, llega cada cierto tiempo
      storyOffer(s);
      // De vez en cuando, un contrato internacional
      intlTick(s);
      // La rival roba clientes (desde el capítulo 4), nunca las ofertas de la historia ni las internacionales
      const stealable = s.contracts.filter((c) => !c.story && !c.internacional);
      if (rivalActive(s) && stealable.length > 1 && chance(s, BALANCE.rival.stealChance)) {
        const c = pick(s, stealable);
        s.contracts = s.contracts.filter((x) => x !== c);
        aviso(s, 'rival', 'log.robo_rival', { cliente: c.client });
        if (chance(s, 0.3)) log(s, pick(s, D.TAUNTS.stolen));
      }
    }
    // Requisitos internacionales al día (con todo tu personal y tus equipos)
    s.contracts.forEach((c) => { if (c.internacional) c.requisitos = requisitosInternacional(s, c, s.staff.map((p) => p.id), s.equip.map((e) => e.id)); });
    // Moral y renuncias: descansar un día (sin evento) recupera el ánimo
    const rested = s.lastWorkDay !== s.day && !opts.travel;
    s.staff.forEach((p) => { if (!p.owner) p.morale = clamp(p.morale + (p.morale < 60 ? 2 : 0) + (rested ? BALANCE.morale.rest : 0), 0, 100); });
    s.staff.forEach((p) => {
      if (!p.owner && p.morale < 30 && (p.avisoMoral || -99) < s.day - 3) { p.avisoMoral = s.day; aviso(s, 'animo', 'log.animo_bajo', { nombre: nm(p), n: p.morale }); }
    });
    const quitter = s.staff.find((p) => !p.owner && p.morale < 20 && chance(s, 0.4));
    if (quitter) {
      s.staff = s.staff.filter((p) => p !== quitter);
      aviso(s, 'renuncia', 'log.renuncio', { nombre: nm(quitter) });
    }
    // El personal pide aumento: si no se lo das, se desmotiva
    const R = BALANCE.raise;
    const hired = s.staff.filter((p) => !p.owner);
    if (hired.length >= R.minStaff && s.day >= R.minDay && chance(s, R.chance)) {
      const p = pick(s, hired);
      const more = Math.max(5, Math.round(p.wage * R.pct));
      if (p.morale >= 50) {
        p.wage += more;
        aviso(s, 'sueldo', 'log.aumento', { nombre: nm(p), monto: money(p.wage) });
      } else {
        hired.forEach((x) => { x.morale = clamp(x.morale - 12, 0, 100); });
        p.wage += more;
        aviso(s, 'sueldo', 'log.reclamo', { nombre: nm(p), monto: money(p.wage) });
      }
    }
    if (s.day % 3 === 1) refreshCandidates(s);
    // Quiebra: cuentan los cobros que llegan pronto y hay días de gracia en rojo (con aviso cada día)
    const bk = bankruptInfo(s);
    if (bk.enPeligro) {
      s.redDays = (s.redDays || 0) + 1;
      if (s.redDays > BALANCE.bankrupt.graceDays) {
        s.gameOver = true;
        aviso(s, 'quiebra', 'log.quiebra', { monto: money(-bk.limit) });
      } else {
        const left = BALANCE.bankrupt.graceDays - s.redDays + 1;
        aviso(s, 'quiebra_aviso', left > 1 ? 'log.quiebra_aviso' : 'log.quiebra_aviso1', { monto: money(-bk.limit), n: left });
      }
    } else s.redDays = 0;
    if (!s.gameOver) cadaExt(s, 'alNuevoDia', (h) => h(s));
  }

  /* Límite de quiebra: crece con los gastos diarios (una productora grande aguanta más deuda) */
  function bankruptLimit(s) {
    return -Math.max(-BALANCE.bankruptAt, Math.round(BALANCE.bankrupt.perDailyCost * dailyCost(s)));
  }
  /* Estado de la caja frente a la quiebra:
     { limit, pending (cobros que llegan en los próximos días), efectivo (caja + esos cobros), enPeligro,
       redDays (días seguidos en peligro), graceLeft (días que quedan antes de quebrar),
       manana (caja después de los gastos de mañana + cobros que llegan mañana), mananaPeligro } */
  function bankruptInfo(s) {
    const B = BALANCE.bankrupt;
    const limit = bankruptLimit(s);
    const pend = (s.pending || []);
    const pending = pend.filter((p) => p.day <= s.day + B.pendingDays).reduce((a, p) => a + p.amount, 0);
    const efectivo = s.money + pending;
    const manana = s.money - dailyCost(s) + pend.filter((p) => p.day <= s.day + 1).reduce((a, p) => a + p.amount, 0);
    const mananaEfectivo = s.money - dailyCost(s) + pend.filter((p) => p.day <= s.day + 1 + B.pendingDays).reduce((a, p) => a + p.amount, 0);
    const redDays = s.redDays || 0;
    return { limit, pending, efectivo, enPeligro: efectivo < limit, redDays,
      graceLeft: Math.max(0, B.graceDays - redDays + 1), manana, mananaPeligro: mananaEfectivo < limit };
  }

  /* =========================================================
     PLAN DEL EVENTO: personal por rol y plan de cámaras
     ========================================================= */
  const staffOf = (s, ids) => s.staff.filter((p) => (ids || []).includes(p.id));
  const equipOf = (s, ids) => s.equip.filter((e) => (ids || []).includes(e.id) && CATALOG[e.type]);
  const roleCount = (staff, role) => staff.filter((p) => normRole(p.role) === role).length;
  const bestOf = (staff, role) => staff.filter((p) => normRole(p.role) === role)
    .sort((a, b) => (b.skill + tierBonus(b)) - (a.skill + tierBonus(a)))[0] || null;
  const isCamLike = (it) => (it.cat === 'cam' || it.cat === 'service') && !!CLASE[it.subtipo];
  const isSystem = (it) => CLASE[it.subtipo] === 'sistema' || it.subtipo === 'super_lenta';
  const isOB = (it) => (it.cat === 'vehicle' && /^ob/.test(it.subtipo)) || it.subtipo === 'ob_alquiler';
  const hasReplayGear = (equip) => equip.some((e) => itemOf(e).cat === 'replay') || equip.some((e) => itemOf(e).cat === 'switcher' && itemOf(e).subtipo === 'software' && itemOf(e).q >= 3);
  const hasGfxGear = (equip) => equip.some((e) => itemOf(e).cat === 'graphics') || equip.some((e) => itemOf(e).cat === 'switcher' && itemOf(e).q >= 3);

  /* Plantilla de personal del contrato: { rol: [min, ideal] } (depende de lo que pide y de lo que llevas) */
  function crewReq(c, equip) {
    const t = EVENT_TYPES[c.type] || EVENT_TYPES.misa;
    const req = {};
    Object.keys(t.crew).forEach((r) => { req[r] = t.crew[r].slice(); });
    const set = (r, min, ideal) => { req[r] = [min, Math.max(min, ideal)]; };
    const cap = (r, n) => { if (req[r]) set(r, Math.min(req[r][0], n), Math.min(req[r][1], n)); };
    cap('camarografo', Math.max(1, c.cams));
    if (c.cams < 2) cap('director', 0);
    if (!c.audio) { cap('sonidista', 0); cap('microfonista', 0); }
    if (!c.stream) cap('tecnico_transmision', 0);
    equip = equip || [];
    const n = (f) => equip.filter((e) => f(itemOf(e))).length;
    const ptz = n((it) => CLASE[it.subtipo] === 'ptz');
    const sys = n((it) => isSystem(it));
    const drones = n((it) => CLASE[it.subtipo] === 'dron');
    const shot = n((it) => (it.requiere || []).includes('microfonista'));
    // Lo que llevas pide su operador (sube el ideal: sin él rinde menos o sale el imprevisto de ese rol)
    const raise = (r, m) => { const cur = req[r] || [0, 0]; set(r, cur[0], Math.max(cur[1], m)); };
    if (ptz) raise('operador_ptz', Math.ceil(ptz / 4));
    if (sys) raise('shader', 1);
    if (drones) raise('piloto_dron', 1);
    if (shot) raise('microfonista', 1);
    if (equip.some((e) => itemOf(e).cat === 'replay')) raise('operador_repeticion', 1);
    if (equip.some((e) => itemOf(e).cat === 'graphics')) raise('operador_graficos', 1);
    return req;
  }

  /* Riesgo (0..1) de los imprevistos de un rol según cuánta gente llevas y su experiencia */
  function roleRisk(estado, best) {
    const K = BALANCE.risk;
    const base = estado === 'falta' ? K.falta : estado === 'justo' ? K.justo : K.base;
    if (!best) return base;
    const f = clamp(1 - K.perSkill * (best.skill - 1) - K.perTier * tierOf(best).bonus, K.minFactor, 1);
    return r2(base * f);
  }

  function refWage(role, diff) {
    return Math.round(baseWage(role, 'junior', 2) * (1 + BALANCE.wage.perDiff * Math.max(0, diff - 1)));
  }

  function crewPlan(s, c, staffIds, equipIds) {
    if (!c) return { roles: [], wages: 0, idealWages: 0, savings: 0, falta: 0, justo: 0, completo: 0 };
    return crewPlanOf(c, staffOf(s, staffIds), equipIds ? equipOf(s, equipIds) : []);
  }
  function crewPlanOf(c, staff, equip) {
    const req = crewReq(c, equip);
    const diff = c.diff || 1;
    const roles = [];
    let idealWages = 0;
    const wages = staff.reduce((a, p) => a + eventWage(p, diff), 0);
    ROLE_KEYS.forEach((key) => {
      const rq = req[key] || [0, 0];
      const people = staff.filter((p) => normRole(p.role) === key);
      let a = people.length;
      let dobleRol = false;
      // El dueño hace de productor cuando no llevas uno (doble rol)
      if (key === 'productor' && !a && rq[1] > 0 && staff.some((p) => p.owner)) { a = 1; dobleRol = true; }
      if (!rq[1] && !a) return;
      const estado = a < rq[0] ? 'falta' : a < rq[1] ? 'justo' : 'completo';
      const best = people.sort((x, y) => (y.skill + tierBonus(y)) - (x.skill + tierBonus(x)))[0] || null;
      const sueldo = people.reduce((acc, p) => acc + eventWage(p, diff), 0);
      idealWages += Math.max(0, rq[1] - a) * refWage(key, diff);
      roles.push({
        key, nombre: ROLES[key].name, desc: ROLES[key].desc, si_falta: ROLES[key].siFalta,
        min: rq[0], ideal: rq[1], asignados: a,
        personas: people.map((p) => ({ id: p.id, name: nombrePersona(p), skill: p.skill, tier: p.tier || 'junior', owner: !!p.owner })),
        estado, riesgo: roleRisk(estado, best || (dobleRol ? staff.find((p) => p.owner) : null)), dobleRol, sueldo,
      });
    });
    idealWages += wages;
    const cnt = (e) => roles.filter((r) => r.estado === e && (r.ideal > 0 || r.min > 0)).length;
    return { roles, wages, idealWages, savings: Math.max(0, idealWages - wages), falta: cnt('falta'), justo: cnt('justo'), completo: cnt('completo') };
  }

  /* Posiciones de cámara del contrato: las primeras `cams` son obligatorias; hasta 2 más son tomas extra */
  function positionsFor(c) {
    const t = EVENT_TYPES[c.type] || EVENT_TYPES.misa;
    const list = t.positions.slice();
    const out = [];
    const N = Math.max(1, c.cams || 1);
    for (let i = 0; i < N + BALANCE.quality.extraMax; i++) {
      let p = list[i];
      if (!p && i >= N) break;
      if (!p) p = ['extra_' + (i + 1), 'fija'];
      if (t.sinDron && p[1] === 'aerea') continue;
      const nk = 'pos.' + (t.posDe || c.type) + '.' + p[0]; // posDe: usa los nombres de posición de otro evento
      const has = Object.prototype.hasOwnProperty.call(TEXTOS, nk);
      out.push({ key: p[0], perfil: p[1], opcional: i >= N,
        nombre: has ? tx(nk) : tx('pos.extra', { n: i + 1 }), ideal: has ? tx(nk + '.ideal') : tx('pos.extra.ideal') });
    }
    return out;
  }

  /* Prepara las cámaras usables con sus lentes y accesorios */
  function readyCams(equip, staff) {
    const pool = (f) => equip.filter((e) => f(itemOf(e))).sort((a, b) => (itemOf(b).q * 100 + b.condition) - (itemOf(a).q * 100 + a.condition));
    const lenses = pool((it) => it.cat === 'lens' && it.subtipo !== 'adaptador_lente_box');
    let adapters = pool((it) => it.subtipo === 'adaptador_lente_box').length;
    let heavy = pool((it) => it.subtipo === 'soporte_pesado').length;
    let fiberCap = pool((it) => it.subtipo === 'cable_fibra_smpte').length * 2; // un cable híbrido atiende 2 cámaras
    let pilots = roleCount(staff, 'piloto_dron');
    const hasReplay = equip.some((e) => itemOf(e).cat === 'replay');
    const hasRepOp = roleCount(staff, 'operador_repeticion') > 0;
    const hasGen = equip.some((e) => itemOf(e).subtipo === 'generador_diesel');
    const usedLens = new Set();
    const ready = [], blocked = [];
    const takeLens = (f) => { const L = lenses.find((l) => !usedLens.has(l.id) && f(itemOf(l))); if (L) usedLens.add(L.id); return L || null; };
    pool((it) => isCamLike(it)).forEach((e) => {
      const it = itemOf(e);
      const rq = it.requiere || [];
      let clase = CLASE[it.subtipo];
      let lens = null, box = false, motivo = null;
      if (it.incluyeLente) {
        box = isSystem(it); // trae su propio lente (edición VIP)
      } else if (rq.includes('lente_b4')) {
        if (isSystem(it) && adapters > 0 && heavy > 0) {
          lens = takeLens((L) => L.subtipo === 'lente_box' && (!(L.requiere || []).includes('cam_sistema_4k') || it.subtipo === 'sistema_4k' || it.subtipo === 'super_lenta'));
          if (lens) { box = true; adapters--; heavy--; }
        }
        if (!lens) lens = takeLens((L) => L.subtipo === 'lente_eng');
        if (!lens) motivo = 'sin_lente';
      } else if (rq.includes('lente_cine')) {
        lens = takeLens((L) => L.subtipo === 'lente_cine'); if (!lens) motivo = 'sin_lente';
      } else if (rq.includes('lente_mft')) {
        lens = takeLens((L) => L.subtipo === 'lente_mft'); if (!lens) motivo = 'sin_lente';
      }
      if (!motivo && rq.includes('cable_fibra_smpte') && !it.incluyeFibra) { if (fiberCap > 0) fiberCap--; else motivo = 'sin_fibra'; }
      if (!motivo && rq.includes('piloto_dron')) { if (pilots > 0) pilots--; else motivo = 'sin_piloto'; }
      if (!motivo && rq.includes('generador') && !hasGen) motivo = 'sin_generador';
      if (!motivo && rq.includes('operador_repeticion') && !hasRepOp) motivo = 'sin_operador_repeticion';
      if (!motivo && rq.includes('servidor_repeticion') && !hasReplay) clase = 'sistema'; // sin servidor la súper lenta es una cámara de sistema normal
      if (motivo) {
        if (lens) usedLens.delete(lens.id);
        blocked.push({ equipId: e.id, tipo: e.type, motivo, texto: tx('bloq.' + motivo, { item: it.name }) });
        return;
      }
      const effQ = lens ? Math.min(it.q, itemOf(lens).q + 1) : it.q;
      ready.push({ e, it, clase, lens, box, effQ, cond: 0.5 + e.condition / 200,
        needs: it.alquiler || clase === 'pov' || (clase === 'accion') ? null : clase === 'ptz' ? 'operador_ptz' : clase === 'dron' ? 'piloto_dron' : 'camarografo' });
    });
    const usados = [];
    ready.forEach((r) => { usados.push(r.e.id); if (r.lens) usados.push(r.lens.id); });
    return { ready, blocked, usedLens };
  }

  function fitOf(perfil, r) {
    const row = FIT[perfil] || FIT.fija;
    let f = row[r.clase] !== undefined ? row[r.clase] : 0.3;
    if (r.box && (perfil === 'tribuna' || perfil === 'cerrada' || perfil === 'lenta')) f = 1;
    return f;
  }

  function cameraPlan(s, c, equipIds, staffIds) {
    if (!c) return { positions: [], cubiertas: 0, total: 0, ajusteMedio: 0, bloqueados: [], usados: [] };
    const equip = equipOf(s, equipIds);
    const staff = staffIds ? staffOf(s, staffIds) : s.staff.slice();
    return planCams(c, equip, staff);
  }

  function planCams(c, equip, staff) {
    const pos = positionsFor(c);
    const { ready, blocked } = readyCams(equip, staff);
    const left = ready.slice();
    const usados = [];
    // Operadores: se reparten mientras se eligen las cámaras, así una cámara que se quedaría sin nadie que la maneje
    // (una PTZ sin operador de robóticas, una segunda cámara sin segundo camarógrafo) no le quita el puesto a otra que sí rinde.
    let camOps = roleCount(staff, 'camarografo');
    let ptzCap = roleCount(staff, 'operador_ptz') * 4;
    const canOp = (r) => (r.needs === 'camarografo' ? camOps > 0 : r.needs === 'operador_ptz' ? ptzCap > 0 : true);
    // Puntaje de una cámara en una posición: cuánto encaja, su calidad y su estado; si nadie la puede manejar vale
    // mucho menos (rinde la mitad y además deja sin puesto a una que sí tendría operador)
    const score = (p, r) => fitOf(p.perfil, r) * (2 + r.effQ) * r.cond * (canOp(r) ? 1 : 0.25);
    const asg = new Map();
    const tomar = (p, r) => {
      left.splice(left.indexOf(r), 1);
      const operado = canOp(r);
      if (operado && r.needs === 'camarografo') camOps--;
      else if (operado && r.needs === 'operador_ptz') ptzCap--;
      asg.set(p, { r, operado });
    };
    // Posiciones obligatorias: cada vez la mejor pareja posición-cámara de todas (así la cámara de hombro va a la
    // posición al hombro y no a la fija, donde cualquier otra sirve)
    const pend = pos.filter((p) => !p.opcional);
    while (pend.length && left.length) {
      let bp = null, br = null, bs = -1;
      pend.forEach((p) => left.forEach((r) => { const sc = score(p, r); if (sc > bs) { bs = sc; bp = p; br = r; } }));
      if (!br) break;
      tomar(bp, br);
      pend.splice(pend.indexOf(bp), 1);
    }
    // Tomas extra (opcionales), en orden: con una cámara que encaje y que alguien maneje; sin nadie que la maneje, solo
    // si encaja casi perfecto (con su trípode o soporte llega a 1: una cámara "dejada" en su sitio rinde la mitad, pero suma como toma extra)
    pos.filter((p) => p.opcional).forEach((p) => {
      let best = null, bs = -1;
      left.forEach((r) => { const sc = score(p, r); if (sc > bs) { bs = sc; best = r; } });
      const f = best ? fitOf(p.perfil, best) : 0;
      if (best && (canOp(best) ? f >= 0.5 : f >= 0.85)) tomar(p, best);
    });
    const assigned = pos.map((p) => { const a = asg.get(p); return { p, r: a ? a.r : null, operado: a ? a.operado : false }; });
    // Accesorios: trípodes, gimbal, steadicam, jib y dolly mejoran el ajuste de su posición
    const sup = (f) => equip.filter((e) => f(itemOf(e))).length;
    const S = { tripode: sup((it) => /^tripode/.test(it.subtipo)), gimbal: sup((it) => it.subtipo === 'gimbal'), steadicam: sup((it) => it.subtipo === 'steadicam'),
      jib: sup((it) => it.subtipo === 'jib'), dolly: sup((it) => it.subtipo === 'dolly') };
    let sysCams = 0;
    const out = assigned.map(({ p, r, operado }) => {
      const o = { key: p.key, nombre: p.nombre, ideal: p.ideal, perfil: p.perfil, opcional: p.opcional,
        asignado: null, equipId: null, equipo: null, lente: null, q: 0, fit: 0, ajuste: 0, operado: false };
      if (!r) return o;
      let fit = fitOf(p.perfil, r);
      const supOk = !['ptz', 'pov', 'dron', 'grua', 'aerea_cables', 'riel'].includes(r.clase);
      if (supOk && ['fija', 'tribuna', 'cerrada'].includes(p.perfil) && !r.box && S.tripode > 0) { S.tripode--; fit = Math.min(1, fit + 0.1); }
      else if (supOk && ['gimbal', 'movil'].includes(p.perfil) && S.gimbal > 0) { S.gimbal--; fit = Math.min(1, fit + 0.15); }
      else if (supOk && p.perfil === 'hombro' && S.steadicam > 0) { S.steadicam--; fit = Math.min(1, fit + 0.15); }
      else if (supOk && p.perfil === 'grua' && S.jib > 0) { S.jib--; fit = Math.max(fit, 0.85); }
      else if (supOk && p.perfil === 'riel' && S.dolly > 0) { S.dolly--; fit = Math.max(fit, 0.85); }
      if (isSystem(r.it)) sysCams++;
      usados.push(r.e.id); if (r.lens) usados.push(r.lens.id);
      return Object.assign(o, { asignado: r.e.type, equipId: r.e.id, equipo: equipName(r.e), lente: r.lens ? r.lens.type : null,
        q: r.effQ, cond: r.cond, fit: r2(fit), ajuste: r2(fit * (operado ? 1 : 0.5)), operado, box: r.box });
    });
    const req = out.filter((p) => !p.opcional);
    const cubiertas = req.filter((p) => p.asignado).length;
    return {
      positions: out, cubiertas, total: req.length,
      ajusteMedio: req.length ? r2(req.reduce((a, p) => a + p.ajuste, 0) / req.length) : 0,
      bloqueados: blocked, usados, sistema: sysCams, sinOperador: req.filter((p) => p.asignado && !p.operado).length,
    };
  }

  /* ---------- Ayudas para el jugador: qué cámara o qué lente le falta y dónde conseguirlo ---------- */
  const LENTE_DE = { lente_b4: 'lente_eng', lente_cine: 'lente_cine', lente_mft: 'lente_mft' };
  const enTienda = (k) => { const it = CATALOG[k]; return it && !it.premium && !it.exclusivo && !it.alquiler; };
  // El lente que necesita una cámara de ese tipo y que todavía no tienes (o null si no necesita o ya hay uno libre).
  // extra = 1 cuando la cámara aún no es tuya (antes de comprarla). Devuelve { subtipo, key (el más barato de la tienda),
  // bloqueado (falta fama), precio }.
  function lenteFaltante(s, type, extra) {
    const it = CATALOG[type];
    if (!it || it.incluyeLente) return null;
    const rq = (it.requiere || []).find((r) => LENTE_DE[r]);
    if (!rq) return null;
    const sub = LENTE_DE[rq];
    const lentes = s.equip.filter((e) => CATALOG[e.type] && CATALOG[e.type].subtipo === sub).length;
    const camaras = s.equip.filter((e) => { const c = CATALOG[e.type]; return c && !c.incluyeLente && (c.requiere || []).includes(rq); }).length + (extra || 0);
    if (lentes >= camaras) return null;
    const ops = Object.keys(CATALOG).filter((k) => enTienda(k) && CATALOG[k].subtipo === sub)
      .sort((a, b) => ((CATALOG[a].minRep > s.rep) - (CATALOG[b].minRep > s.rep)) || CATALOG[a].price - CATALOG[b].price);
    const key = ops[0] || null;
    return { subtipo: sub, key, bloqueado: key ? CATALOG[key].minRep > s.rep : true, precio: key ? CATALOG[key].price : 0, minRep: key ? CATALOG[key].minRep : 0 };
  }
  // La cámara de la tienda que mejor cubre una posición de ese perfil y que ya puedes comprar (fama), sin lentes ni
  // accesorios aparte: la que mejor encaja y, entre iguales, la más barata. null si ninguna encaja mejor que `minFit`.
  function camaraParaPerfil(s, perfil, minFit) {
    const row = FIT[perfil] || FIT.fija;
    let best = null, bf = typeof minFit === 'number' ? minFit : 0;
    Object.keys(CATALOG).filter((k) => enTienda(k) && CATALOG[k].cat === 'cam' && CATALOG[k].minRep <= s.rep && !(CATALOG[k].requiere || []).length)
      .sort((a, b) => CATALOG[a].price - CATALOG[b].price)
      .forEach((k) => { const f = row[CLASE[CATALOG[k].subtipo]] || 0; if (f > bf + 1e-9) { bf = f; best = k; } });
    return best ? { key: best, fit: bf, precio: CATALOG[best].price } : null;
  }

  /* ---------- Calidad base del evento ---------- */
  const STORY_SUPPORT_KEY = { lanzamiento: 'parte.apoyo.lanzamiento', ligapro: 'parte.apoyo.ligapro', final: 'parte.apoyo.final' };
  function computeQuality(s, contract, staff, equip) {
    const Q = BALANCE.quality;
    const parts = [];
    const add = (key, pts, p) => { parts.push([tx(key, p), pts, key]); return pts; };
    let q = add('parte.base', Q.base);
    staff = staff.filter((p) => p);
    equip = equip.filter((e) => CATALOG[e.type]);
    const diff = contract.diff || 1;
    const t = EVENT_TYPES[contract.type] || EVENT_TYPES.misa;
    // Plan de cámaras
    const plan = planCams(contract, equip, staff);
    const req = plan.positions.filter((p) => !p.opcional);
    const N = Math.max(1, req.length);
    const cover = Math.round(Q.cover * req.reduce((a, p) => a + p.ajuste, 0) / N);
    q += add('parte.camaras', cover, { a: plan.cubiertas, n: N, p: Math.round(plan.ajusteMedio * 100) });
    if (plan.sinOperador) parts.push([tx('parte.sin_operador', { n: plan.sinOperador }), 0, 'parte.sin_operador']);
    plan.bloqueados.slice(0, 3).forEach((b) => parts.push([b.texto, 0, 'bloq.' + b.motivo]));
    const asg = req.filter((p) => p.asignado);
    const camQ = asg.length ? asg.reduce((a, p) => a + p.q * p.cond, 0) / asg.length : 0;
    q += add('parte.calidad_camaras', Math.round(camQ * Q.camPerQ));
    const extras = plan.positions.filter((p) => p.opcional && p.asignado && p.ajuste >= 0.5).length;
    if (extras) q += add('parte.extras', Math.min(Q.extraMax, extras) * Q.extraPos, { n: extras });

    const maxQ = (f) => equip.filter((e) => f(itemOf(e))).reduce((m, e) => Math.max(m, itemOf(e).q), 0);
    const ob = maxQ((it) => isOB(it));
    if (contract.cams >= 2) {
      const d = bestOf(staff, 'director');
      const sw = Math.max(maxQ((it) => it.cat === 'switcher'), ob);
      let pts, key;
      if (d && sw) { pts = Math.round((d.skill + tierBonus(d)) * Q.dirSkill + sw * Q.swPerQ); key = 'parte.director_switcher'; }
      else if (sw) { pts = 0; key = 'parte.switcher_sin_director'; }
      else { pts = -(Q.noSwitcher[0] + diff * Q.noSwitcher[1]); key = 'parte.sin_switcher'; }
      q += add(key, pts);
    }
    if (contract.audio) {
      const a = bestOf(staff, 'sonidista');
      const cons = Math.max(maxQ((it) => it.cat === 'audio'), ob ? ob - 1 : 0);
      let pts, key;
      if (cons && a) { pts = Q.audioBase + (a.skill + tierBonus(a)) * Q.audioSkill + cons * Q.consPerQ; key = 'parte.sonidista_consola'; }
      else if (cons) { pts = Q.consOnly; key = 'parte.consola_sin_sonidista'; }
      else { pts = -(Q.noConsole[0] + diff * Q.noConsole[1]); key = 'parte.sin_consola'; }
      const mic = maxQ((it) => it.cat === 'mics');
      if (mic) pts += Q.micBase + mic * Q.micPerQ;
      q += add(key, Math.round(pts));
    }
    if (contract.stream) {
      const tt = bestOf(staff, 'tecnico_transmision');
      const enc = equip.some((e) => itemOf(e).cat === 'encoder' || itemOf(e).subtipo === 'satelite');
      const canSend = enc || equip.some((e) => itemOf(e).cat === 'switcher') || ob > 0;
      let pts, key;
      if (canSend && tt) { pts = Q.streamBase + (tt.skill + tierBonus(tt)) * Q.streamSkill + (enc ? Q.encoderBonus : 0); key = 'parte.tecnico_equipo'; }
      else if (canSend) { pts = Q.streamOnly; key = 'parte.equipo_sin_tecnico'; }
      else { pts = -(Q.noStream[0] + diff * Q.noStream[1]); key = 'parte.sin_equipo_transmision'; }
      q += add(key, Math.round(pts));
    }
    // Repeticiones y gráficos (lo piden los deportes y los eventos con marcador)
    const rq = crewReq(contract, equip);
    const special = (role, has, gearQ, kOk, kNoOp, kNone, base, perQ) => {
      const need = (rq[role] || [0, 0]);
      const op = bestOf(staff, role);
      if (!need[1] && !has) return;
      if (has && op) q += add(kOk, Math.round(base + Math.max(1, gearQ) * perQ + tierBonus(op)));
      else if (has && !op) q += add(kNoOp, -Q.gearNoOp);
      else if (need[0] >= 1) q += add(kNone, -(Q.missingSpecial[0] + diff * Q.missingSpecial[1]));
    };
    special('operador_repeticion', hasReplayGear(equip), maxQ((it) => it.cat === 'replay'), 'parte.repeticiones', 'parte.repeticiones_sin_operador', 'parte.sin_repeticiones', Q.replayBase, Q.replayPerQ);
    special('operador_graficos', hasGfxGear(equip), maxQ((it) => it.cat === 'graphics'), 'parte.graficos', 'parte.graficos_sin_operador', 'parte.sin_graficos', Q.gfxBase, Q.gfxPerQ);
    // Cámaras de sistema: sin shader se ven con colores distintos
    if (plan.sistema) {
      if (bestOf(staff, 'shader')) q += add('parte.shader', Q.shaderOk);
      else q += add('parte.sin_shader', -(Q.shader + plan.sistema * Q.shaderPerCam), { n: plan.sistema });
    }
    // Intercom en eventos grandes
    if (diff >= 4 && contract.cams >= 3) {
      const ic = equip.some((e) => itemOf(e).cat === 'intercom') || ob > 0;
      q += add(ic ? 'parte.intercom' : 'parte.sin_intercom', ic ? Q.intercom : -Q.intercom);
    }
    // Falta de personal (roles que no se cuentan arriba)
    const C = BALANCE.crew;
    const counted = ['camarografo', 'director', 'sonidista', 'tecnico_transmision', 'operador_repeticion', 'operador_graficos', 'shader', 'operador_ptz', 'piloto_dron'];
    ROLE_KEYS.forEach((role) => {
      if (counted.includes(role)) return;
      const need = rq[role];
      if (!need || !need[1]) return;
      let a = roleCount(staff, role);
      if (role === 'productor' && !a && staff.some((p) => p.owner)) a = 1; // el dueño hace de productor
      if (a < need[0]) {
        const miss = Math.min(C.faltaCap, need[0] - a);
        q += add('parte.falta_rol', -Math.round(miss * (C.falta + diff * C.faltaDiff)), { rol: ROLES[role].name, a, min: need[0] });
      } else if (a < need[1] && diff >= C.justoMinDiff) {
        q += add('parte.justo_rol', -C.justo, { rol: ROLES[role].name, a, ideal: need[1] });
      }
    });
    // Contrato internacional: lo que no cumples (sin contar lo obligatorio) resta
    if (contract.internacional && INTL_KINDS[contract.kind]) {
      const ctx = { c: contract, staff, equip };
      INTL_KINDS[contract.kind].requisitos.forEach((k) => {
        const R = REQUISITOS[k];
        if (!R.obligatorio && !R.ok(ctx, INTL_KINDS[contract.kind])) q += add('parte.req_intl', -Q.intlReq, { req: tx('req.' + k, R.params ? R.params(INTL_KINDS[contract.kind]) : null) });
      });
    }
    const avgSkill = staff.length ? staff.reduce((a, p) => a + p.skill, 0) / staff.length : 0;
    q += add('parte.experiencia', Math.round(avgSkill * BALANCE.skillPts.team));
    // Ánimo: un equipo cansado o molesto trabaja peor (el dueño no cuenta)
    const hiredStaff = staff.filter((p) => !p.owner);
    if (hiredStaff.length) {
      const M = BALANCE.morale;
      const avgMorale = hiredStaff.reduce((a, p) => a + p.morale, 0) / hiredStaff.length;
      const mp = clamp(Math.round((avgMorale - M.neutral) / M.perPoint), M.min, M.max);
      if (mp) q += add(mp < 0 ? 'parte.cansado' : 'parte.animo', mp);
    }
    q += add('parte.dificultad', -BALANCE.diffPenalty[clamp(diff, 1, 5)], { n: diff });
    const sup = contract.story ? (BALANCE.storySupport[contract.type] || 0) : 0;
    if (sup) q += add(STORY_SUPPORT_KEY[contract.type] || 'parte.apoyo', sup);
    let ex = -Math.round(Math.min(s.rep || 0, BALANCE.expectMaxRep || 100) * (BALANCE.expectPerRep + BALANCE.expectSmall * (5 - clamp(diff, 1, 5))));
    // En las ofertas de la historia el cliente te buscó a ti: la fama casi no suma exigencia (si no, ser famoso lo haría más difícil)
    if (contract.story) ex = Math.max(ex, -BALANCE.expectStoryCap);
    if (ex) q += add('parte.fama', ex);
    if (t.sensible) parts.push([tx('parte.sensible'), 0, 'parte.sensible']);
    cadaExt(s, 'bonoCalidad', (h) => {
      (h(s, contract, staff, equip) || []).forEach((b) => {
        const pts = Math.round(Number(b && b.pts) || 0);
        if (!b || !b.k) return;
        parts.push([tx(b.k, b.p || undefined), pts, b.k]);
        q += pts;
      });
    });
    const qq = clamp(Math.round(q), 0, 100);
    return { q: qq, parts, cameraPlan: plan, rango: qualityRange(s, contract, qq, equip, staff) };
  }

  /* Rango esperado de la calidad final: la base más lo que suelen restar los imprevistos y la suerte.
     { min, max, esperado, imprevistos } (imprevistos = cuántos se esperan) */
  function qualityRange(s, c, q, equip, staff) {
    const BI = BALANCE.incidents, K = BALANCE.risk;
    const diff = clamp(c.diff || 1, 1, 5);
    if (inTutorial(s)) return { min: clamp(q - 12, 0, 100), max: clamp(q + 5, 0, 100), esperado: clamp(q - 3, 0, 100), imprevistos: 1 };
    const crew = crewPlanOf(c, staff, equip);
    const falta = crew.roles.filter((r) => r.estado === 'falta' && r.min > 0).length;
    const worn = equip.some((e) => e.condition < BALANCE.worn) ? 1 : 0;
    const n = Math.min(BI.max, BI.byDiff[diff] + worn + BI.extraChance + (falta ? K.extraIncident : 0));
    let sev = 1 + BI.severityPerDiff * (diff - 1);
    if ((EVENT_TYPES[c.type] || {}).sensible) sev *= BALANCE.sensible;
    const riskAvg = crew.roles.length ? crew.roles.reduce((a, r) => a + r.riesgo, 0) / crew.roles.length : K.base;
    const per = -(2.2 + 10 * riskAvg) * sev; // lo que suele restar cada imprevisto (medido con el bot)
    const L = Math.max(0, Math.round(BALANCE.luck[0] + BALANCE.luck[1] * diff));
    return {
      min: clamp(Math.round(q + n * -12 * sev - L), 0, 100),
      max: clamp(Math.round(q + Math.min(2, n) * 5 + L), 0, 100),
      esperado: clamp(Math.round(q + n * per), 0, 100),
      imprevistos: Math.round(n * 10) / 10,
    };
  }

  /* Elegir automáticamente lo mejor para un evento: la plantilla ideal y lo que pide el plan de cámaras */
  function suggestLoadout(s, contractId) {
    const c = s.contracts.find((x) => x.id === contractId);
    if (!c) return { staffIds: [], equipIds: [] };
    // Sin operador de robóticas, las PTZ se quedan en la bodega (salvo que no haya otra cámara)
    const hasR = (r) => s.staff.some((p) => normRole(p.role) === r);
    const skip = (it) => CLASE[it.subtipo] === 'ptz' && !hasR('operador_ptz');
    let avail = s.equip.filter((e) => CATALOG[e.type]);
    const camsOk = avail.filter((e) => isCamLike(itemOf(e)) && !skip(itemOf(e)));
    if (camsOk.length) avail = avail.filter((e) => !isCamLike(itemOf(e)) || !skip(itemOf(e)));
    // Equipos: primero las cámaras (con lentes, fibra y soportes), luego el resto
    const req0 = crewReq(c, []);
    const staffAll = s.staff.slice();
    const plan = planCams(c, avail, staffAll);
    const equipIds = plan.usados.slice();
    const byCat = (f) => avail.filter((e) => !equipIds.includes(e.id) && f(itemOf(e)))
      .sort((a, b) => (itemOf(b).q * 100 + b.condition) - (itemOf(a).q * 100 + a.condition));
    const take = (f, n) => byCat(f).slice(0, n || 1).forEach((e) => equipIds.push(e.id));
    const usedEq = () => avail.filter((e) => equipIds.includes(e.id));
    // Accesorios de las cámaras usadas
    const cams = usedEq().filter((e) => isCamLike(itemOf(e)));
    const sys = cams.filter((e) => isSystem(itemOf(e)) && !itemOf(e).incluyeFibra).length;
    if (sys) take((it) => it.subtipo === 'cable_fibra_smpte', Math.ceil(sys / 2));
    const boxes = plan.positions.filter((p) => p.box && p.lente).length;
    if (boxes) { take((it) => it.subtipo === 'adaptador_lente_box', boxes); take((it) => it.subtipo === 'soporte_pesado', boxes); }
    const perf = (k) => plan.positions.filter((p) => p.asignado && p.perfil === k).length;
    take((it) => /^tripode/.test(it.subtipo), perf('fija') + perf('tribuna') + perf('cerrada'));
    take((it) => it.subtipo === 'gimbal', perf('gimbal') + perf('movil'));
    take((it) => it.subtipo === 'steadicam', perf('hombro'));
    take((it) => it.subtipo === 'jib', perf('grua'));
    take((it) => it.subtipo === 'dolly', perf('riel'));
    if (c.cams >= 2 || c.stream) take((it) => it.cat === 'switcher');
    if (c.diff >= 3) take((it) => isOB(it));
    if (c.audio) { take((it) => it.cat === 'audio'); take((it) => it.cat === 'mics' && !(it.requiere || []).length); }
    if (c.audio && (req0.microfonista || [0, 0])[1] > 0 && s.staff.some((p) => normRole(p.role) === 'microfonista')) take((it) => it.cat === 'mics' && (it.requiere || []).includes('microfonista'));
    if (c.stream) { take((it) => it.cat === 'encoder'); take((it) => it.cat === 'internet'); }
    if (c.stream && c.diff >= 4) take((it) => it.subtipo === 'satelite');
    const has = (r) => s.staff.some((p) => normRole(p.role) === r);
    if ((req0.operador_repeticion || [0, 0])[1] > 0 && has('operador_repeticion')) take((it) => it.cat === 'replay');
    if ((req0.operador_graficos || [0, 0])[1] > 0 && has('operador_graficos')) take((it) => it.cat === 'graphics');
    if (c.diff >= 3 && c.cams >= 3) take((it) => it.cat === 'intercom');
    if (c.diff >= 3 && cams.length >= 3) take((it) => it.subtipo === 'multiviewer');
    if (sys && has('shader')) take((it) => it.subtipo === 'referencia');
    if (perf('hombro') && c.diff >= 3) take((it) => it.cat === 'wireless');
    take((it) => it.cat === 'power' && (c.outdoor ? it.subtipo !== 'ups' : true));
    if (c.outdoor) take((it) => it.cat === 'rain');
    if (c.internacional && c.travelDays) take((it) => it.cat === 'case');
    if (c.internacional) {
      const K = INTL_KINDS[c.kind];
      if (K && K.requisitos.includes('encoder2')) take((it) => it.cat === 'encoder');
      if (K && K.requisitos.includes('diadema')) take((it) => it.subtipo === 'diadema_comentarista');
    }
    // Personal: la plantilla ideal con lo que llevas (los mejores de cada rol)
    const req = crewReq(c, usedEq());
    const staffIds = [];
    const owner = s.staff.find((p) => p.owner);
    if (owner) staffIds.push(owner.id);
    ROLE_KEYS.forEach((role) => {
      const need = (req[role] || [0, 0])[1];
      if (!need) return;
      const already = staffIds.filter((id) => normRole(s.staff.find((p) => p.id === id).role) === role).length;
      s.staff.filter((p) => !p.owner && normRole(p.role) === role)
        .sort((a, b) => (b.skill + tierBonus(b)) - (a.skill + tierBonus(a)))
        .slice(0, Math.max(0, need - already)).forEach((p) => staffIds.push(p.id));
    });
    return { staffIds, equipIds };
  }

  /* =========================================================
     MOVILIZACIÓN: cómo llegan el personal y los equipos al evento
     - Tu flota (todos tus vehículos con capacidad: sedán, camioneta, van, furgón, unidades OB) se usa sola: se elige la
       combinación más barata (combustible) y cada vehículo necesita a alguien del personal que maneje.
     - Lo que no entra va por la aplicación de transporte: Económico (autos), XL o Carga (flete con chofer + autos).
       El jugador puede elegir (contrato.movil = 'economico' | 'xl' | 'carga'); si no, va la opción válida más barata.
     - Se calcula al salir al aire (startEvent → ev.transporte) y se cobra al terminar (finishEvent → result.transporte).
     - Contratos internacionales: el transporte va incluido en los gastos de viaje (no se cobra dos veces).
     - Los intentos en línea (s.intento) no tienen movilización: el servidor repite el evento sin ella.
     Nunca usa números al azar (no cambia los imprevistos ni la calidad).
     ========================================================= */
  const TRP = () => BALANCE.transporte;
  // Número fijo de 0 a 1 a partir de un texto (así cada cliente queda siempre a la misma distancia)
  function hashTxt(t) {
    let h = 2166136261;
    const str = String(t || '');
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  /* Distancia (km) del garaje al lugar del evento */
  function distanciaKm(s, c) {
    if (!c) return 0;
    if (typeof c.km === 'number' && isFinite(c.km) && c.km > 0) return c.km;
    const T = TRP();
    const r = T.km[c.type] || T.km.def;
    let km = Math.round((r[0] + hashTxt(c.type + '|' + c.client) * (r[1] - r[0])) * 2) / 2;
    if (s && s.stats && inTutorial(s)) km = Math.min(km, T.kmTutorial);
    return Math.max(1, km);
  }
  /* Bultos que ocupa un equipo (los alquileres los lleva la empresa que alquila) */
  function bultosDe(it) {
    if (!it || it.alquiler) return 0;
    const T = TRP();
    if (typeof it.bultos === 'number' && it.bultos >= 0) return it.bultos;   // propio del equipo (Edición Exclusiva: más compacto)
    if (Object.prototype.hasOwnProperty.call(T.bultosSub, it.subtipo)) return T.bultosSub[it.subtipo];
    if (Object.prototype.hasOwnProperty.call(T.bultosCat, it.cat)) return T.bultosCat[it.cat];
    return 1;
  }
  /* Capacidad de un vehículo (o null si no es de la flota) */
  function flotaDe(it) {
    if (!it || it.cat !== 'vehicle' || it.alquiler) return null;
    const f = (D.FLOTA || {})[it.subtipo];
    return f ? Object.assign({}, f, it.flota || {}) : null;
  }
  const esVehiculoFlota = (e) => !!(e && CATALOG[e.type] && flotaDe(itemOf(e)));
  /* Tu flota: [{ id, type, nombre, asientos, carga, maxBulto, km (combustible por km), mant (por día), condition,
     enTaller, reparar (costo para sacarlo del taller) }] */
  function flota(s) {
    return (s.equip || []).filter(esVehiculoFlota).map((e) => {
      const it = itemOf(e), f = flotaDe(it);
      return { id: e.id, type: e.type, nombre: equipName(e), asientos: f.asientos, carga: f.carga, maxBulto: f.maxBulto, km: f.km,
        mant: typeof it.mant === 'number' ? it.mant : Math.round(it.price * BALANCE.daily.equipShare), condition: e.condition,
        enTaller: e.condition < TRP().taller, reparar: repairCost(e) };
    });
  }
  /* Precio de un auto de la aplicación en un viaje */
  function tarifaApp(op, km) { const t = TRP().app[op]; return Math.round(Math.max(t.min, t.base + t.km * km) * 10) / 10; }
  /* Opciones de la aplicación para llevar P personas y U bultos (el más grande: big) a km kilómetros */
  function opcionesApp(P, U, big, km, seed) {
    const T = TRP(), A = T.app, V = T.viajes;
    if (P <= 0 && U <= 0) return [];
    const out = [];
    const eta = (k) => A[k].eta + Math.floor(hashTxt(seed + '|' + k) * 6);
    const mk = (key, autos, fletes, ok, motivo) => {
      const porViaje = Math.round((autos * tarifaApp(key === 'carga' ? 'economico' : key, km) + fletes * tarifaApp('carga', km)) * 10) / 10;
      const asientos = key === 'carga' ? fletes * A.carga.asientos + autos * A.economico.asientos : autos * A[key].asientos;
      const carga = key === 'carga' ? fletes * A.carga.carga : autos * A[key].carga;
      out.push({ key, autos, fletes, asientos, carga, porViaje, precio: Math.round(porViaje * V), eta: eta(key), ok, motivo: ok ? null : motivo });
    };
    // Autos: los asientos que quedan libres también llevan bultos (una maleta en el asiento de atrás)
    const autos = (o) => Math.max(1, Math.ceil(P / o.asientos), Math.ceil((P + U) / (o.asientos + o.carga)));
    const nE = autos(A.economico);
    mk('economico', nE, 0, big <= A.economico.maxBulto && nE <= A.economico.max, big > A.economico.maxBulto ? 'grande' : 'muchos');
    const nX = autos(A.xl);
    mk('xl', nX, 0, big <= A.xl.maxBulto && nX <= A.xl.max, big > A.xl.maxBulto ? 'grande' : 'muchos');
    if (U > 0) {
      const f = Math.max(1, Math.ceil(U / A.carga.carga));
      const resto = Math.max(0, P - f * A.carga.asientos);
      mk('carga', Math.ceil(resto / A.economico.asientos), f, true, null);
    }
    return out;
  }
  /* Plan de movilización para ese personal y esos equipos.
     { km, personas, bultos, grande, vehiculos: [{ id, type, nombre, asientos, carga, combustible }], resto: { personas, bultos, grande },
       opciones: [{ key, autos, fletes, asientos, carga, porViaje, precio (ida y vuelta), eta (min), ok, motivo }],
       eleccion (clave de la opción que va) , app (lo de la aplicación), combustible, total, incluido ('viaje' si va en el viaje
       internacional), soloFlota (todo va en tus vehículos) } */
  function planTransporte(s, c, staffIds, equipIds, eleccion) {
    const T = TRP();
    const staff = staffOf(s, staffIds);
    const equip = equipOf(s, equipIds);
    const km = distanciaKm(s, c);
    const bultosArr = equip.map((e) => bultosDe(itemOf(e))).filter((b) => b > 0);
    const personas = staff.length;
    const bultos = Math.round(bultosArr.reduce((a, b) => a + b, 0) * 10) / 10;
    const grande = bultosArr.reduce((m, b) => Math.max(m, b), 0);
    const out = { km, personas, bultos, grande, vehiculos: [], resto: { personas, bultos, grande }, opciones: [], eleccion: null,
      app: 0, combustible: 0, total: 0, incluido: null, soloFlota: false, tutorial: !!(s && s.stats && inTutorial(s)) };
    if (!c) return out;
    if (c.internacional && c.travelCost) { out.incluido = 'viaje'; out.resto = { personas: 0, bultos: 0, grande: 0 }; return out; }
    // Combinación de tu flota más barata (los que vas a llevar como equipo, por ejemplo la unidad móvil, van siempre)
    const cand = flota(s).filter((v) => !v.enTaller).sort((a, b) => (b.carga + b.asientos) - (a.carga + a.asientos)).slice(0, 8);
    const forced = cand.filter((v) => (equipIds || []).includes(v.id));
    const libres = cand.filter((v) => !forced.includes(v));
    let mejor = null;
    const prueba = (sub) => {
      if (sub.length > personas) return; // cada vehículo necesita quien lo maneje
      const asientos = sub.reduce((a, v) => a + v.asientos, 0);
      // Los asientos que sobran también llevan bultos
      const carga = sub.reduce((a, v) => a + v.carga, 0) + Math.max(0, asientos - personas);
      const maxB = sub.reduce((m, v) => Math.max(m, v.maxBulto), 0);
      // Lo que no entra en la flota: los bultos más grandes que cualquier vehículo y lo que sobra de carga
      // (la flota se llena primero con los bultos grandes; los chicos son los que van en la aplicación)
      let cap = carga;
      const app = bultosArr.filter((b) => b > maxB);
      bultosArr.filter((b) => b <= maxB).sort((a, b) => b - a).forEach((b) => { if (b <= cap + 1e-9) cap -= b; else app.push(b); });
      const U = Math.round(app.reduce((a, b) => a + b, 0) * 10) / 10;
      const P = Math.max(0, personas - asientos);
      const big = app.reduce((m, b) => Math.max(m, b), 0);
      const comb = Math.round(sub.reduce((a, v) => a + v.km * km * T.viajes, 0) * 100) / 100;
      const ops = opcionesApp(P, U, big, km, c.client);
      const val = ops.filter((o) => o.ok);
      const barata = val.length ? val.reduce((a, o) => (o.precio < a.precio ? o : a)) : null;
      if (ops.length && !barata) return;
      const costo = comb + (barata ? barata.precio : 0);
      if (!mejor || costo < mejor.costo - 0.001 || (Math.abs(costo - mejor.costo) <= 0.001 && sub.length < mejor.sub.length)) {
        mejor = { sub, costo, comb, ops, barata, resto: { personas: P, bultos: U, grande: big } };
      }
    };
    for (let m = 0; m < (1 << libres.length); m++) prueba(forced.concat(libres.filter((v, i) => m & (1 << i))));
    if (!mejor) { // ni con toda la flota (muchísima gente): todo por la aplicación
      const ops = opcionesApp(personas, bultos, grande, km, c.client);
      mejor = { sub: [], comb: 0, ops, barata: ops.find((o) => o.ok) || ops[ops.length - 1] || null, resto: { personas, bultos, grande } };
    }
    out.vehiculos = mejor.sub.map((v) => ({ id: v.id, type: v.type, nombre: v.nombre, asientos: v.asientos, carga: v.carga,
      combustible: Math.round(v.km * km * T.viajes * 100) / 100 }));
    out.resto = mejor.resto;
    out.opciones = mejor.ops;
    out.combustible = Math.round(mejor.comb);
    const elegida = mejor.ops.find((o) => o.ok && o.key === (eleccion !== undefined ? eleccion : c.movil)) || mejor.barata;
    out.eleccion = elegida ? elegida.key : null;
    out.app = elegida ? elegida.precio : 0;
    out.total = out.app + out.combustible;
    out.tope = topeTransporte(c);
    out.cobro = Math.min(out.total, out.tope); // lo que se cobra (si el evento deja ganancia)
    out.pctPago = c.pay > 0 ? Math.round(out.cobro / c.pay * 1000) / 10 : 0;
    out.soloFlota = !mejor.ops.length && out.vehiculos.length > 0;
    return out;
  }
  /* Lo más que se cobra de movilización en un evento (parte del pago acordado) */
  function topeTransporte(c) { return Math.max(0, Math.round((c && c.pay || 0) * TRP().topePago)); }
  /* Desgaste de un vehículo por evento (ida y vuelta) */
  function desgasteVehiculo(km) { const W = TRP().desgaste; return Math.max(1, Math.round(W.base + km * TRP().viajes * W.porKm)); }
  /* Lo que se guarda en el resultado del evento (chico: el resultado se guarda en la partida) */
  function resumenTransporte(tp, total, cubre) {
    const op = (tp.opciones || []).find((o) => o.key === tp.eleccion) || null;
    return { total, costo: tp.total || 0, cubreCliente: cubre || 0, app: tp.app || 0, combustible: tp.combustible || 0, eleccion: tp.eleccion || null, km: tp.km, personas: tp.personas, bultos: tp.bultos,
      vehiculos: (tp.vehiculos || []).map((v) => ({ id: v.id, type: v.type, nombre: v.nombre })), autos: op ? op.autos : 0, fletes: op ? op.fletes : 0,
      incluido: tp.incluido || null, soloFlota: !!tp.soloFlota };
  }

  /* =========================================================
     IMPREVISTOS
     Cada imprevisto: rol (de quién depende), cuándo puede pasar, peso y opciones.
     Los textos están en datos.js: inc.<clave>.t (y variantes), inc.<clave>.o<n> (opciones), inc.<clave>.r.<x> (resultados).
     "need" devuelve null si la opción se puede usar, o [clave, params] con el motivo.
     ========================================================= */
  const camsOf = (ev) => ev.equip.filter((e) => isCamLike(itemOf(e)));
  const hasCat = (ev, cat) => ev.equip.some((e) => itemOf(e).cat === cat);
  const hasSub = (ev, f) => ev.equip.some((e) => f(itemOf(e)));
  const bestRole = (ev, role) => bestOf(ev.staff, normRole(role));
  const R = (q, k, p) => ({ q, k, p: p || null, msg: tx(k, p) });
  const NEED = (k, p) => [k, p || null];
  const isSport = (ev) => !!(EVENT_TYPES[ev.contract.type] || {}).deporte;
  const isFutbol = (ev) => ['barrial', 'ligapro', 'final', 'internacional_host'].includes(ev.contract.type);
  const isRing = (ev) => ['boxeo', 'lucha_libre'].includes(ev.contract.type);
  const isFuneral = (ev) => !!(EVENT_TYPES[ev.contract.type] || {}).sensible;
  const isIRL = (ev) => ev.contract.type === 'irl';
  const tplHas = (ev, role) => ((crewReq(ev.contract, ev.equip)[role] || [0, 0])[1] > 0);
  const canReplay = (s, ev) => (bestRole(ev, 'operador_repeticion') && hasReplayGear(ev.equip)) || (bestRole(ev, 'director') && hasSub(ev, (it) => it.cat === 'switcher' && it.q >= 3));

  const INCIDENTS = {
    cable: {
      rol: 'cablero',
      weight: (s, ev) => 3 + camsOf(ev).length * 0.5,
      when: (s, ev) => camsOf(ev).length > 0 && !isIRL(ev),
      setup: (s, ev) => ({ cam: randInt(s, 1, camsOf(ev).length) }),
      text: (ev, x) => ['inc.cable.t', { cam: x.cam }],
      choices: [
        { need: (s) => (s.stock.cable > 0 ? null : NEED('need.cable')), run: (s) => { s.stock.cable--; return R(-1, 'inc.cable.r0'); } },
        { need: (s) => (s.money >= 60 ? null : NEED('need.dinero', { monto: money(60) })), run: (s) => { s.money -= 60; return R(-8, 'inc.cable.r1'); } },
        { run: () => R(-12, 'inc.cable.r2') },
      ],
    },
    cable_pisado: {
      rol: 'cablero',
      weight: (s, ev) => 2 + camsOf(ev).length * 0.4,
      when: (s, ev) => camsOf(ev).length >= 2 && ev.contract.diff >= 2,
      setup: (s, ev) => ({ cam: randInt(s, 1, camsOf(ev).length) }),
      text: (ev, x) => ['inc.cable_pisado.t', { cam: x.cam }],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'cablero') ? null : NEED('need.rol', { rol: ROLES.cablero.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'cablero'), (p) => R(-1, 'inc.cable_pisado.r0', { nombre: nm(p) }), (p) => R(-6, 'inc.cable_pisado.r1', { nombre: nm(p) })) },
        { need: (s) => (s.stock.cable > 0 ? null : NEED('need.cable')), run: (s) => { s.stock.cable--; return R(-4, 'inc.cable_pisado.r2'); } },
        { run: () => R(-11, 'inc.cable_pisado.r3') },
      ],
    },
    internet: {
      rol: 'tecnico_transmision',
      weight: () => 4,
      when: (s, ev) => ev.contract.stream && !isIRL(ev),
      text: () => ['inc.internet.t'],
      choices: [
        { need: (s, ev) => (hasCat(ev, 'internet') || hasSub(ev, (it) => /bonding/.test(it.subtipo)) ? null : NEED('need.internet')),
          run: (s) => { s.money -= 30; return R(-2, 'inc.internet.r0', { monto: money(30) }); } },
        { run: (s) => { const r = rnd(s); return r < 0.2 ? R(0, 'inc.internet.r4') : r < 0.5 ? R(-5, 'inc.internet.r1') : R(-15, 'inc.internet.r2'); } },
        { run: () => R(-18, 'inc.internet.r3') },
      ],
    },
    cobertura: { // IRL: en la calle la señal del celular va y viene
      rol: 'tecnico_transmision',
      weight: () => 7,
      when: (s, ev) => isIRL(ev),
      text: () => ['inc.cobertura.t'],
      choices: [
        { need: (s, ev) => (hasSub(ev, (it) => /bonding/.test(it.subtipo)) ? null : NEED('need.bonding')), run: () => R(-1, 'inc.cobertura.r0') },
        { need: (s, ev) => (hasCat(ev, 'internet') ? null : NEED('need.internet')), run: (s) => (chance(s, 0.6) ? R(-4, 'inc.cobertura.r1') : R(-9, 'inc.cobertura.r2')) },
        { run: () => R(-12, 'inc.cobertura.r3') },
      ],
    },
    senal_irl: {
      rol: 'tecnico_transmision',
      weight: () => 5,
      when: (s, ev) => isIRL(ev),
      text: () => ['inc.senal_irl.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'tecnico_transmision') ? null : NEED('need.rol', { rol: ROLES.tecnico_transmision.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'tecnico_transmision'), (p) => R(1, 'inc.senal_irl.r0', { nombre: nm(p) }), (p) => R(-7, 'inc.senal_irl.r1', { nombre: nm(p) })) },
        { run: () => R(-8, 'inc.senal_irl.r2') },
      ],
    },
    luz: {
      rol: 'runner',
      weight: () => 2,
      when: (s, ev) => !isIRL(ev),
      text: () => ['inc.luz.t'],
      choices: [
        { need: (s, ev) => (hasCat(ev, 'power') ? null : NEED('need.power')), run: (s, ev) => {
          const u = ev.equip.find((e) => itemOf(e).cat === 'power'); const real = u && s.equip.find((e) => e.id === u.id);
          if (real) real.condition = clamp(real.condition - 15, 1, 100);
          return R(-1, 'inc.luz.r0'); } },
        { need: (s) => (s.money >= 150 ? null : NEED('need.dinero', { monto: money(150) })), run: (s) => { s.money -= 150; return R(-5, 'inc.luz.r1'); } },
        { run: (s) => { const r = rnd(s); return r < 0.15 ? R(1, 'inc.luz.r4') : r < 0.4 ? R(-6, 'inc.luz.r2') : R(-16, 'inc.luz.r3'); } },
      ],
    },
    lluvia: {
      weight: () => 5,
      when: (s, ev) => ev.contract.outdoor,
      text: () => ['inc.lluvia.t'],
      choices: [
        { need: (s, ev) => (hasCat(ev, 'rain') ? null : NEED('need.rain')), run: (s, ev) => {
          const u = ev.equip.find((e) => itemOf(e).cat === 'rain'); const real = u && s.equip.find((e) => e.id === u.id);
          if (real) real.condition = clamp(real.condition - 20, 1, 100);
          return R(-2, 'inc.lluvia.r0'); } },
        { run: (s, ev) => {
          const cs = camsOf(ev);
          if (cs.length && chance(s, 0.4)) {
            const c = pick(s, cs);
            c.condition = clamp(c.condition - 30, 5, 100);
            return R(-8, 'inc.lluvia.r1', { item: itemOf(c).name });
          }
          return R(-5, 'inc.lluvia.r2');
        } },
        { run: () => R(-12, 'inc.lluvia.r3') },
      ],
    },
    tarde: {
      rol: 'camarografo',
      weight: () => 2.5,
      when: (s, ev) => ev.staff.some((p) => normRole(p.role) === 'camarografo' && !p.owner),
      setup: (s, ev) => ({ who: pick(s, ev.staff.filter((p) => normRole(p.role) === 'camarografo' && !p.owner)).id }),
      text: (ev, x) => ['inc.tarde.t', { nombre: x.who && ev.staff.find((p) => p.id === x.who) ? nm(ev.staff.find((p) => p.id === x.who)) : { k: 'persona.tu_camarografo' } }],
      choices: [
        { run: () => R(-6, 'inc.tarde.r0') },
        { run: (s) => { const r = rnd(s); return r < 0.15 ? R(2, 'inc.tarde.r4') : r < 0.5 ? R(-2, 'inc.tarde.r1') : R(-8, 'inc.tarde.r2'); } },
        { run: (s, ev, x) => {
          const p = s.staff.find((y) => y.id === x.who);
          if (p) p.morale = clamp(p.morale - 15, 0, 100);
          return R(-3, 'inc.tarde.r3');
        } },
      ],
    },
    acople: {
      rol: 'sonidista',
      weight: () => 3,
      when: (s, ev) => ev.contract.audio,
      text: () => ['inc.acople.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'sonidista') ? null : NEED('need.rol', { rol: ROLES.sonidista.name })),
          run: (s, ev) => { const p = bestRole(ev, 'sonidista'); return R(Math.round(-8 + (p.skill + tierBonus(p)) * 1.8), 'inc.acople.r0', { nombre: nm(p) }); } },
        { run: () => R(-6, 'inc.acople.r1') },
        { run: () => R(-14, 'inc.acople.r2') },
      ],
    },
    entrevista: {
      rol: 'microfonista',
      weight: () => 2.5,
      when: (s, ev) => ev.contract.audio && !!(EVENT_TYPES[ev.contract.type] || {}).entrevistas,
      text: () => ['inc.entrevista.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'microfonista') ? null : NEED('need.rol', { rol: ROLES.microfonista.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'microfonista'), (p) => R(3, 'inc.entrevista.r0', { nombre: nm(p) }), (p) => R(-4, 'inc.entrevista.r1', { nombre: nm(p) })) },
        { need: (s, ev) => (hasCat(ev, 'mics') ? null : NEED('need.mics')), run: () => R(-4, 'inc.entrevista.r2') },
        { run: () => R(-10, 'inc.entrevista.r3') },
      ],
    },
    bateria: {
      rol: 'cablero',
      weight: () => 2.5,
      when: (s, ev) => camsOf(ev).length > 0,
      text: () => ['inc.bateria.t'],
      choices: [
        { need: (s) => (s.stock.battery > 0 ? null : NEED('need.battery')), run: (s) => { s.stock.battery--; return R(-1, 'inc.bateria.r0'); } },
        { run: () => R(-5, 'inc.bateria.r1') },
        { run: () => R(-10, 'inc.bateria.r2') },
      ],
    },
    logo: {
      rol: 'operador_graficos',
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 2 && !isFuneral(ev),
      text: () => ['inc.logo.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'operador_graficos') && hasGfxGear(ev.equip) ? null : NEED('need.graficos')),
          run: (s, ev) => { const p = bestRole(ev, 'operador_graficos'); return p.skill + tierBonus(p) >= 2.5 ? R(6, 'inc.logo.r0', { nombre: nm(p) }) : R(-2, 'inc.logo.r1', { nombre: nm(p) }); } },
        { need: (s, ev) => (bestRole(ev, 'director') && hasCat(ev, 'switcher') ? null : NEED('need.director_switcher')),
          run: (s, ev) => { const p = bestRole(ev, 'director'); return p.skill >= 3 ? R(4, 'inc.logo.r2', { nombre: nm(p) }) : R(-3, 'inc.logo.r3', { nombre: nm(p) }); } },
        { run: (s) => (chance(s, 0.4) ? R(3, 'inc.logo.r5') : R(-8, 'inc.logo.r6')) },
      ],
    },
    marcador: {
      rol: 'operador_graficos',
      weight: () => 2.5,
      when: (s, ev) => isSport(ev) && ev.contract.diff >= 2,
      text: (ev) => [isRing(ev) ? 'inc.marcador.t.ring' : 'inc.marcador.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'operador_graficos') && hasGfxGear(ev.equip) ? null : NEED('need.graficos')),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'operador_graficos'), (p) => R(1, 'inc.marcador.r0', { nombre: nm(p) }), (p) => R(-5, 'inc.marcador.r1', { nombre: nm(p) })) },
        { run: () => R(-9, 'inc.marcador.r2') },
      ],
    },
    falla: {
      weight: () => 6,
      when: (s, ev) => ev.equip.some((e) => e.condition < BALANCE.worn),
      setup: (s, ev) => ({ eq: pick(s, ev.equip.filter((e) => e.condition < BALANCE.worn)).id }),
      text: (ev, x) => ['inc.falla.t', { item: itemOf(ev.equip.find((e) => e.id === x.eq) || { type: 'cam_basic' }).name }],
      choices: [
        { run: (s) => (chance(s, 0.5) ? R(-2, 'inc.falla.r0') : R(-14, 'inc.falla.r1')) },
        { run: (s, ev, x) => {
          const e = s.equip.find((y) => y.id === x.eq);
          if (e) e.condition = clamp(e.condition - 10, 1, 100);
          return chance(s, 0.3) ? R(-3, 'inc.falla.r2') : R(-12, 'inc.falla.r3');
        } },
        { run: () => R(-9, 'inc.falla.r4') },
      ],
    },
    epico: {
      rol: 'operador_repeticion',
      weight: () => 2.5,
      when: (s, ev) => !isFuneral(ev),
      text: (ev) => [isFutbol(ev) ? 'inc.epico.t.futbol' : isRing(ev) ? 'inc.epico.t.ring' : ev.contract.type === 'concierto' ? 'inc.epico.t.concierto'
        : ev.contract.type === 'boda' ? 'inc.epico.t.boda' : isIRL(ev) ? 'inc.epico.t.irl' : 'inc.epico.t'],
      choices: [
        { need: (s, ev) => (canReplay(s, ev) ? null : NEED('need.repeticion')), run: () => R(9, 'inc.epico.r0') },
        { need: (s, ev) => (camsOf(ev).length >= 2 ? null : NEED('need.dos_camaras')), run: () => R(5, 'inc.epico.r1') },
        { run: () => R(2, 'inc.epico.r2') },
      ],
    },
    sin_repeticion: {
      rol: 'operador_repeticion',
      weight: () => 3,
      when: (s, ev) => isSport(ev) && ev.contract.diff >= 2,
      text: (ev) => [isRing(ev) ? 'inc.sin_repeticion.t.ring' : 'inc.sin_repeticion.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'operador_repeticion') && hasReplayGear(ev.equip) ? null : NEED('need.operador_repeticion')),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'operador_repeticion'), (p) => R(4, 'inc.sin_repeticion.r0', { nombre: nm(p) }), (p) => R(-3, 'inc.sin_repeticion.r1', { nombre: nm(p) })) },
        { need: (s, ev) => (bestRole(ev, 'director') && hasCat(ev, 'switcher') ? null : NEED('need.director_switcher')), run: () => R(-4, 'inc.sin_repeticion.r2') },
        { run: () => R(-10, 'inc.sin_repeticion.r3') },
      ],
    },
    colores: {
      rol: 'shader',
      weight: (s, ev) => 1.5 + ev.equip.filter((e) => isSystem(itemOf(e))).length,
      when: (s, ev) => camsOf(ev).length >= 2 && ev.contract.diff >= 2,
      text: () => ['inc.colores.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'shader') ? null : NEED('need.rol', { rol: ROLES.shader.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'shader'), (p) => R(1, 'inc.colores.r0', { nombre: nm(p) }), (p) => R(-4, 'inc.colores.r1', { nombre: nm(p) })) },
        { need: (s, ev) => (bestRole(ev, 'director') ? null : NEED('need.rol', { rol: ROLES.director.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'director'), (p) => R(-3, 'inc.colores.r2', { nombre: nm(p) }), (p) => R(-8, 'inc.colores.r3', { nombre: nm(p) })) },
        { run: () => R(-10, 'inc.colores.r4') },
      ],
    },
    ptz_fija: {
      rol: 'operador_ptz',
      weight: () => 3,
      when: (s, ev) => ev.equip.some((e) => CLASE[itemOf(e).subtipo] === 'ptz'),
      text: () => ['inc.ptz_fija.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'operador_ptz') ? null : NEED('need.rol', { rol: ROLES.operador_ptz.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'operador_ptz'), (p) => R(1, 'inc.ptz_fija.r0', { nombre: nm(p) }), (p) => R(-5, 'inc.ptz_fija.r1', { nombre: nm(p) })) },
        { run: () => R(-7, 'inc.ptz_fija.r2') },
      ],
    },
    dron: {
      rol: 'piloto_dron',
      weight: () => 3,
      when: (s, ev) => ev.equip.some((e) => CLASE[itemOf(e).subtipo] === 'dron') && !!bestRole(ev, 'piloto_dron'),
      text: () => ['inc.dron.t'],
      choices: [
        { run: (s, ev) => skillCheck(s, bestRole(ev, 'piloto_dron'), (p) => R(4, 'inc.dron.r0', { nombre: nm(p) }), (p) => {
          const d = ev.equip.find((e) => CLASE[itemOf(e).subtipo] === 'dron');
          const real = d && s.equip.find((e) => e.id === d.id);
          if (real) real.condition = clamp(real.condition - 35, 1, 100);
          return R(-9, 'inc.dron.r1', { nombre: nm(p) });
        }) },
        { run: () => R(-2, 'inc.dron.r2') },
      ],
    },
    entrada: {
      rol: 'coordinador_piso',
      weight: () => 2.5,
      when: (s, ev) => !!(EVENT_TYPES[ev.contract.type] || {}).escenario,
      text: () => ['inc.entrada.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'coordinador_piso') ? null : NEED('need.rol', { rol: ROLES.coordinador_piso.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'coordinador_piso'), (p) => R(2, 'inc.entrada.r0', { nombre: nm(p) }), (p) => R(-5, 'inc.entrada.r1', { nombre: nm(p) })) },
        { run: () => R(-8, 'inc.entrada.r2') },
      ],
    },
    pieza: {
      rol: 'runner',
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 2,
      text: () => ['inc.pieza.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'runner') ? null : NEED('need.rol', { rol: ROLES.runner.name })), run: (s, ev) => R(-1, 'inc.pieza.r0', { nombre: nm(bestRole(ev, 'runner')) }) },
        { need: (s) => (s.money >= 40 ? null : NEED('need.dinero', { monto: money(40) })), run: (s) => { s.money -= 40; return R(-5, 'inc.pieza.r1'); } },
        { run: () => R(-8, 'inc.pieza.r2') },
      ],
    },
    // Imprevistos que cuestan plata: el monto crece con el tamaño del evento
    permiso: {
      rol: 'productor',
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 2,
      setup: (s, ev) => ({ cost: Math.max(50, Math.round(ev.contract.pay * 0.1 / 10) * 10) }),
      text: (ev, x) => ['inc.permiso.t', { monto: money(x.cost) }],
      choices: [
        { need: (s, ev, x) => (s.money >= x.cost ? null : NEED('need.dinero', { monto: money(x.cost) })),
          run: (s, ev, x) => { s.money -= x.cost; return R(0, 'inc.permiso.r0', { monto: money(x.cost) }); } },
        { run: (s, ev, x) => {
          const pr = ev.staff.find((p) => normRole(p.role) === 'productor');
          if (chance(s, 0.45 + (pr ? 0.08 * (pr.skill + tierBonus(pr)) : 0))) return R(-2, 'inc.permiso.r1');
          const half = Math.round(x.cost / 2);
          s.money -= half;
          return R(-6, 'inc.permiso.r2', { monto: money(half) });
        } },
        { run: () => R(-12, 'inc.permiso.r3') },
      ],
    },
    transporte: {
      rol: 'productor',
      weight: (s, ev) => 1 + ev.contract.diff * 0.4,
      when: (s, ev) => ev.contract.diff >= 3,
      setup: (s, ev) => ({ cost: Math.max(80, Math.round(ev.contract.pay * 0.08 / 10) * 10) }),
      text: () => ['inc.transporte.t'],
      choices: [
        { need: (s, ev, x) => (s.money >= x.cost ? null : NEED('need.dinero', { monto: money(x.cost) })),
          run: (s, ev, x) => { s.money -= x.cost; return R(-2, 'inc.transporte.r0', { monto: money(x.cost) }); } },
        { run: (s) => (chance(s, 0.35) ? R(-4, 'inc.transporte.r1') : R(-14, 'inc.transporte.r2')) },
      ],
    },
    robo: {
      weight: () => 1.2,
      when: (s, ev) => ev.contract.diff >= 3 && ev.equip.some((e) => ['mics', 'encoder', 'internet', 'wireless'].includes(itemOf(e).cat)),
      setup: (s, ev) => ({ eq: pick(s, ev.equip.filter((e) => ['mics', 'encoder', 'internet', 'wireless'].includes(itemOf(e).cat))).id }),
      text: (ev, x) => ['inc.robo.t', { item: itemOf(ev.equip.find((e) => e.id === x.eq) || { type: 'mics' }).name }],
      choices: [
        { run: (s, ev, x) => {
          if (chance(s, 0.5)) return R(-3, 'inc.robo.r0');
          s.equip = s.equip.filter((e) => e.id !== x.eq);
          return R(-6, 'inc.robo.r1');
        } },
        { run: () => R(-9, 'inc.robo.r2') },
      ],
    },
    // Imprevistos de habilidad: salir bien depende del nivel de tu gente
    senal: {
      rol: 'tecnico_transmision',
      weight: () => 2.5,
      when: (s, ev) => ev.contract.stream && ev.contract.diff >= 3,
      text: () => ['inc.senal.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'tecnico_transmision') ? null : NEED('need.rol', { rol: ROLES.tecnico_transmision.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'tecnico_transmision'), (p) => R(2, 'inc.senal.r0', { nombre: nm(p) }), (p) => R(-10, 'inc.senal.r1', { nombre: nm(p) })) },
        { run: () => R(-9, 'inc.senal.r2') },
      ],
    },
    guion: {
      rol: 'productor',
      weight: () => 2.5,
      when: (s, ev) => ev.contract.diff >= 3,
      text: () => ['inc.guion.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'productor') ? null : NEED('need.rol', { rol: ROLES.productor.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'productor'), (p) => R(3, 'inc.guion.r0', { nombre: nm(p) }), (p) => R(-7, 'inc.guion.r1', { nombre: nm(p) })) },
        { need: (s, ev) => (bestRole(ev, 'director') ? null : NEED('need.rol', { rol: ROLES.director.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'director'), (p) => R(2, 'inc.guion.r2', { nombre: nm(p) }), (p) => R(-9, 'inc.guion.r3', { nombre: nm(p) })) },
        { run: () => R(-8, 'inc.guion.r4') },
      ],
    },
    multitud: {
      rol: 'camarografo',
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 3 && camsOf(ev).length >= 2,
      text: () => ['inc.multitud.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'camarografo') ? null : NEED('need.rol', { rol: ROLES.camarografo.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'camarografo'), (p) => R(2, 'inc.multitud.r0', { nombre: nm(p) }), (p) => R(-9, 'inc.multitud.r1', { nombre: nm(p) })) },
        { run: (s) => { const r = rnd(s); return r < 0.15 ? R(2, 'inc.multitud.r4') : r < 0.4 ? R(-3, 'inc.multitud.r2') : R(-10, 'inc.multitud.r3'); } },
      ],
    },
    vip: {
      rol: 'coordinador_piso',
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 2 && !isIRL(ev),
      text: () => ['inc.vip.t'],
      choices: [
        { run: (s, ev) => {
          const p = bestRole(ev, 'camarografo');
          if (!p) return R(-4, 'inc.vip.r0');
          const lv = p.skill + tierBonus(p);
          return R(Math.round((lv - 2) * 3), lv >= 3 ? 'inc.vip.r1' : 'inc.vip.r2', { nombre: nm(p) });
        } },
        { run: () => R(-2, 'inc.vip.r3') },
      ],
    },
    ring: { // lucha libre y boxeo: la pelea se va fuera del ring
      rol: 'cablero',
      weight: () => 3,
      when: (s, ev) => isRing(ev),
      text: () => ['inc.ring.t'],
      choices: [
        { need: (s, ev) => (bestRole(ev, 'cablero') ? null : NEED('need.rol', { rol: ROLES.cablero.name })),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'cablero'), (p) => R(4, 'inc.ring.r0', { nombre: nm(p) }), (p) => R(-4, 'inc.ring.r1', { nombre: nm(p) })) },
        { run: () => R(-7, 'inc.ring.r2') },
      ],
    },
    // Funeral: todo con calma y respeto. Los errores pesan más.
    funeral_familia: {
      rol: 'productor',
      weight: () => 4,
      when: (s, ev) => isFuneral(ev),
      text: () => ['inc.funeral_familia.t'],
      choices: [
        { run: () => R(3, 'inc.funeral_familia.r0') },
        { run: () => R(-10, 'inc.funeral_familia.r1') },
      ],
    },
    funeral_emotivo: {
      rol: 'camarografo',
      weight: () => 3,
      when: (s, ev) => isFuneral(ev),
      text: () => ['inc.funeral_emotivo.t'],
      choices: [
        { run: () => R(4, 'inc.funeral_emotivo.r0') },
        { run: () => R(-9, 'inc.funeral_emotivo.r1') },
        { run: () => R(1, 'inc.funeral_emotivo.r2') },
      ],
    },
  };
  // Etiquetas de las opciones (inc.<clave>.o<n>)
  Object.keys(INCIDENTS).forEach((k) => INCIDENTS[k].choices.forEach((c, i) => { c.k = 'inc.' + k + '.o' + i; Object.defineProperty(c, 'label', { get: () => tx(c.k), enumerable: true }); }));

  /* Prueba de habilidad: cuanto más nivel y experiencia tiene la persona, más probable que salga bien */
  /* Imprevisto que trae una extensión (mismo formato que INCIDENTS; textos inc.<clave>.t / .o<i> / .r<i>).
     Su when() debe mirar un campo que solo tienen los contratos de la extensión (por ejemplo contract.temporada):
     así nunca entra en el sorteo de un intento en línea. */
  function registrarImprevisto(key, def) {
    if (!key || !def || INCIDENTS[key] || !Array.isArray(def.choices)) return false;
    def.weight = def.weight || (() => 3);
    INCIDENTS[key] = def;
    def.choices.forEach((c, i) => { c.k = 'inc.' + key + '.o' + i; Object.defineProperty(c, 'label', { get: () => tx(c.k), enumerable: true }); });
    return true;
  }
  const incAyuda = { R: (q, k, p) => R(q, k, p), NEED: (k, p) => NEED(k, p), skillCheck: (s, p, ok, bad) => skillCheck(s, p, ok, bad),
    bestRole: (ev, role) => bestRole(ev, role), hasCat: (ev, cat) => hasCat(ev, cat), camsOf: (ev) => camsOf(ev), itemOf: (e) => itemOf(e),
    randInt: (s, a, b) => randInt(s, a, b), chance: (s, p) => chance(s, p), pick: (s, a) => pick(s, a), clamp, money, nm: (p) => nm(p) };
  function skillCheck(s, p, ok, bad) {
    const I = BALANCE.incidents;
    return chance(s, I.skillBase + I.skillPer * (p.skill + tierBonus(p))) ? ok(p) : bad(p);
  }

  /* ---------- Evento en vivo ---------- */
  function startEvent(s, contractId, staffIds, equipIds) {
    if (s.currentEvent) return { ok: false, msg: tx('msg.evento_en_curso') };
    if (s.gameOver) return { ok: false, msg: tx('msg.juego_terminado') };
    const contract = s.contracts.find((c) => c.id === contractId);
    if (!contract) return { ok: false, msg: tx('msg.oferta_no_existe') };
    staffIds = staffIds || []; equipIds = equipIds || [];
    const staff = s.staff.filter((p) => staffIds.includes(p.id));
    const equip = s.equip.filter((e) => equipIds.includes(e.id) && CATALOG[e.type]);
    if (!staff.length) return { ok: false, msg: tx('msg.lleva_persona') };
    if (!equip.some((e) => itemOf(e).cat === 'cam')) return { ok: false, msg: tx('msg.lleva_camara') };
    // Ya usaste los turnos de hoy (no debería pasar: el día se cierra solo al usar el último)
    if (!esIntento(s) && hoyDe(s).n >= BALANCE.dia.franjas) return { ok: false, msg: tx('msg.dia_lleno', { n: BALANCE.dia.franjas }) };
    staff.forEach((p) => { p.role = normRole(p.role); if (!p.tier) p.tier = 'junior'; });
    if (esIntento(s)) s.intento = true; // se queda marcado para todo el intento (finishEvent cambia stats y día)
    if (contract.internacional) {
      const reqs = requisitosInternacional(s, contract, staffIds, equipIds);
      const falta = reqs.find((r) => r.obligatorio && !r.ok);
      if (falta) return { ok: false, msg: tx('msg.intl_falta', { req: falta.texto }) };
      if (s.money < (contract.travelCost || 0)) return { ok: false, msg: tx('msg.intl_viaje', { monto: money(contract.travelCost) }) };
    }
    const wages = staff.reduce((a, p) => a + eventWage(p, contract.diff), 0);
    const base = computeQuality(s, contract, staff, equip);
    const tutorial = inTutorial(s);
    // Suerte del día: el público, el clima, el lugar... (no en los primeros eventos)
    if (!tutorial && BALANCE.luck) {
      const L = Math.max(0, Math.round(BALANCE.luck[0] + BALANCE.luck[1] * contract.diff));
      const luck = randInt(s, -L, L);
      base.parts.push([tx('parte.suerte'), luck, 'parte.suerte']);
      base.q = clamp(base.q + luck, 0, 100);
    }
    const crew = crewPlan(s, contract, staffIds, equipIds);
    const ev = {
      contract: Object.assign({}, contract),
      staffIds: staff.map((p) => p.id),
      equipIds: equip.map((e) => e.id),
      base: base.q,
      parts: base.parts,
      wages,
      deltas: [],
      incidents: [],
      step: 0,
      tutorial,
      crewPlan: crew,
      cameraPlan: base.cameraPlan,
    };
    // Movilización (se cobra al terminar). Los intentos en línea no la tienen: el servidor los repite sin ella.
    if (!esIntento(s)) ev.transporte = planTransporte(s, contract, ev.staffIds, ev.equipIds);
    if (contract.internacional && contract.travelCost) {
      s.money -= contract.travelCost;
      ev.travelCost = contract.travelCost;
      log(s, 'log.intl_viaje', { monto: money(contract.travelCost), pais: paisP(contract) });
    }
    // Elegir imprevistos
    const view = { contract: ev.contract, staff, equip };
    const worn = equip.filter((e) => e.condition < BALANCE.worn).length;
    const BI = BALANCE.incidents;
    const faltan = crew.roles.filter((r) => r.estado === 'falta' && r.min > 0).length;
    const nInc = tutorial ? 1
      : clamp(BI.byDiff[contract.diff] + (worn ? 1 : 0) + (chance(s, BI.extraChance) ? 1 : 0) + (faltan ? BALANCE.risk.extraIncident : 0), 1, BI.max);
    // En los primeros eventos no hay imprevistos que cuestan plata
    const gentle = ['permiso', 'transporte', 'robo'];
    const pool = Object.keys(INCIDENTS).filter((k) => INCIDENTS[k].when(s, view) && !(tutorial && gentle.includes(k)));
    const roleW = (k) => {
      const rol = INCIDENTS[k].rol;
      const r = rol && crew.roles.find((x) => x.key === rol);
      return r && !tutorial ? r.riesgo / BALANCE.risk.base : 1;
    };
    // Duelos y desafío diario: el servidor manda la lista de imprevistos ya sorteada (los dos lados tienen los mismos)
    if (Array.isArray(contract.imprevistos)) {
      contract.imprevistos.filter((k, i, a) => INCIDENTS[k] && pool.includes(k) && a.indexOf(k) === i)
        .forEach((key) => { const def = INCIDENTS[key]; ev.incidents.push({ key, x: def.setup ? def.setup(s, view) : {}, done: false, result: null }); });
    } else {
    for (let i = 0; i < nInc && pool.length; i++) {
      const ws = pool.map((k) => INCIDENTS[k].weight(s, view) * roleW(k));
      const tot = ws.reduce((a, b) => a + b, 0);
      let r = rnd(s) * tot, idx = pool.length - 1;
      for (let j = 0; j < pool.length; j++) { r -= ws[j]; if (r <= 0) { idx = j; break; } }
      const key = pool.splice(idx, 1)[0];
      const def = INCIDENTS[key];
      ev.incidents.push({ key, x: def.setup ? def.setup(s, view) : {}, done: false, result: null });
    }
    }
    s.contracts = s.contracts.filter((c) => c.id !== contractId);
    s.currentEvent = ev;
    return { ok: true, msg: tx('msg.evento_iniciado') };
  }

  function evView(s) {
    const ev = s.currentEvent;
    return {
      contract: ev.contract,
      staff: s.staff.filter((p) => ev.staffIds.includes(p.id)),
      equip: s.equip.filter((e) => ev.equipIds.includes(e.id) && CATALOG[e.type]),
    };
  }
  const textOf = (def, view, x) => { const t = def.text(view, x); return { text: tx(t[0], t[1]), k: t[0], p: t[1] || null }; };

  function currentIncident(s) {
    const ev = s.currentEvent;
    if (!ev || ev.step >= ev.incidents.length) return null;
    const inc = ev.incidents[ev.step];
    const def = INCIDENTS[inc.key];
    const view = evView(s);
    const t = textOf(def, view, inc.x);
    const r = def.rol && ev.crewPlan && ev.crewPlan.roles.find((x) => x.key === def.rol);
    return {
      n: ev.step + 1,
      total: ev.incidents.length,
      key: inc.key,
      rol: def.rol || null,
      estadoRol: r ? r.estado : null, // 'falta' | 'justo' | 'completo' | null
      text: t.text, k: t.k, p: t.p,
      choices: def.choices.map((c, i) => {
        const w = c.need ? c.need(s, view, inc.x) : null;
        return { i, label: tx(c.k), k: c.k, ok: !w, why: w ? tx(w[0], w[1]) : null, whyK: w ? w[0] : null, whyP: w ? w[1] : null };
      }),
    };
  }

  function resolveIncident(s, choiceIndex) {
    const ev = s.currentEvent;
    if (!ev || ev.step >= ev.incidents.length) return { ok: false, msg: tx('msg.no_imprevisto') };
    const inc = ev.incidents[ev.step];
    const def = INCIDENTS[inc.key];
    const ch = def.choices[choiceIndex];
    if (!ch) return { ok: false, msg: tx('msg.opcion_invalida') };
    const view = evView(s);
    const w = ch.need ? ch.need(s, view, inc.x) : null;
    if (w) return { ok: false, msg: tx(w[0], w[1]) };
    const r = ch.run(s, view, inc.x);
    if (r.q < 0 && !ev.tutorial) {
      // En eventos grandes los errores pesan más (salvo en los primeros eventos)
      let mult = 1 + BALANCE.incidents.severityPerDiff * (ev.contract.diff - 1);
      // Si fuiste con menos gente de la que pide el rol, el daño es mayor
      const rr = def.rol && ev.crewPlan && ev.crewPlan.roles.find((x) => x.key === def.rol);
      if (rr && rr.estado === 'falta') mult *= BALANCE.risk.sevFalta;
      else if (rr && rr.estado === 'justo') mult *= BALANCE.risk.sevJusto;
      // Eventos sensibles (funeral): el cliente perdona menos
      if ((EVENT_TYPES[ev.contract.type] || {}).sensible) mult *= BALANCE.sensible;
      r.q = Math.round(r.q * mult);
    }
    inc.done = true;
    inc.result = r;
    ev.deltas.push(r.q);
    ev.step++;
    return { ok: true, q: r.q, msg: r.msg, k: r.k, p: r.p };
  }

  /* Subidas de habilidad y ascensos: { k, p, text } (la pantalla los vuelve a armar en el idioma elegido) */
  const upTxt = (k, p) => ({ k, p, text: tx(k, p), toString() { return this.text; } });
  /* Experiencia y ascensos de nivel después de un evento */
  function gainExperience(s, p, intl, ups) {
    if (intl) p.eventos_internacionales = (p.eventos_internacionales || 0) + 1;
    else p.eventos_nacionales = (p.eventos_nacionales || 0) + 1;
    const P = BALANCE.promote;
    const tot = (p.eventos_nacionales || 0) + (p.eventos_internacionales || 0);
    const cur = p.tier || 'junior';
    let next = null;
    if (cur === 'junior' && tot >= P.semi_senior.events && p.skill >= P.semi_senior.skill) next = 'semi_senior';
    else if (cur === 'semi_senior' && tot >= P.senior.events && p.skill >= P.senior.skill) next = 'senior';
    else if (cur === 'senior' && (p.eventos_internacionales || 0) >= P.internacional.intl && p.skill >= P.internacional.skill) next = 'internacional';
    if (!next) return;
    p.tier = next;
    if (!p.owner) {
      const r = ROLES[normRole(p.role)] || ROLES.camarografo;
      p.wage += Math.round((TIERS[next].base - TIERS[cur].base) * r.wageMul * P.wageShare);
      ups.push(upTxt('up.nivel', { nombre: p.name, nivel: { k: 'nivel.' + next }, monto: money(p.wage) }));
    } else ups.push(upTxt('up.nivel_duenio', { nivel: { k: 'nivel.' + next } }));
  }

  function finishEvent(s) {
    const ev = s.currentEvent;
    const avisos0 = Array.isArray(s.avisos) ? s.avisos.length : 0;
    if (!ev) return { ok: false, msg: tx('msg.no_evento') };
    if (ev.step < ev.incidents.length) return { ok: false, msg: tx('msg.faltan_imprevistos') };
    const c = ev.contract;
    const t = EVENT_TYPES[c.type];
    const famaAntes = s.rep;
    const quality = clamp(ev.base + ev.deltas.reduce((a, b) => a + b, 0), 0, 100);
    const B = BALANCE.stars;
    const stars = quality >= B[0] ? 5 : quality >= B[1] ? 4 : quality >= B[2] ? 3 : quality >= B[3] ? 2 : 1;
    const pay = Math.round(c.pay * payMult(c, stars, s));
    const repRaw = STARS_REP[stars] * (0.5 + c.diff * 0.15);
    // Cuanta más fama tienes, más cuesta seguir subiendo
    let repDelta = Math.round(repRaw > 0 ? repRaw * (1 - s.rep / 130) : repRaw);
    // Contrato internacional que sale mal: la caída de fama es grande
    let intlFail = false;
    if (c.internacional && stars <= 2) { repDelta -= (c.repRisk || 10); intlFail = true; }
    // Contrato disputado: ganas el duelo solo si tu calidad final supera la de MegaVisión
    let duel = null, rivalQuality = null;
    if (c.rival) {
      rivalQuality = typeof c.rivalQuality === 'number' ? c.rivalQuality : rivalQualityFor(s, c);
      if (quality > rivalQuality) { duel = 'won'; repDelta += BALANCE.rival.winRep; }
      else { duel = 'lost'; repDelta -= BALANCE.rival.loseRep; }
    }
    // Algunos clientes pagan la mitad ahora y el resto unos días después
    const LP = BALANCE.latePay;
    let payNow = pay, payLater = 0, laterDays = 0;
    if (c.internacional && c.payLaterShare && pay > 0) {
      payLater = Math.round(pay * c.payLaterShare); payNow = pay - payLater; laterDays = BALANCE.intl.latePayDays;
    } else if (!ev.tutorial && !c.story && !c.internacional && c.diff >= LP.minDiff && pay > 0 && chance(s, LP.chance)) {
      payLater = Math.round(pay * (1 - LP.share));
      payNow = pay - payLater;
      laterDays = LP.days;
    }
    if (payLater) { s.pending = s.pending || []; s.pending.push({ day: s.day + laterDays, amount: payLater, client: c.client }); }
    // Movilización: aplicación de transporte + combustible de tu flota (ida y vuelta)
    const tp = ev.transporte && !esIntento(s) ? ev.transporte : null;
    const tpTotal = tp ? Math.max(0, Math.round(tp.total || 0)) : 0;
    const transporte = Math.min(tpTotal, topeTransporte(c), Math.max(0, pay - ev.wages - (ev.travelCost || 0)));
    const cubreCliente = tpTotal - transporte;
    s.money += payNow - ev.wages - transporte;
    s.rep = clamp(s.rep + repDelta, 0, 100);
    s.lastWorkDay = s.day + 1; // hoy se trabajó (al cerrar el día, el día nuevo cuenta como el siguiente a un día con evento)
    // Desgaste de equipos (más en eventos grandes y en equipos frágiles), experiencia y moral del personal
    const view = evView(s);
    const W = BALANCE.wear;
    view.equip.forEach((e) => {
      const it = itemOf(e);
      if (it.alquiler) return;
      // desgaste: multiplicador propio (Edición Exclusiva: 0,5 = se gasta la mitad)
      const k = BALANCE.wearByDurability[clamp(it.durabilidad || 3, 1, 5)] * (typeof it.desgaste === 'number' ? clamp(it.desgaste, 0.1, 1) : 1);
      e.condition = clamp(Math.round(e.condition - randInt(s, W.min + c.diff * W.perDiffMin, W.max + c.diff * W.perDiffMax) * k), 1, 100);
    });
    // Los alquileres por evento se devuelven
    const rented = view.equip.filter((e) => itemOf(e).alquiler);
    if (rented.length) s.equip = s.equip.filter((e) => !rented.includes(e));
    // Los vehículos de la flota que fueron (y no se llevaron como equipo) también se gastan, según la distancia
    if (tp) (tp.vehiculos || []).forEach((v) => {
      if (view.equip.some((e) => e.id === v.id)) return;
      const e = s.equip.find((x) => x.id === v.id);
      if (e) e.condition = clamp(e.condition - desgasteVehiculo(tp.km), 1, 100);
    });
    const ups = [];
    view.staff.forEach((p) => {
      p.events++;
      const tired = BALANCE.morale.fatigue * Math.max(0, c.diff - 2);
      if (!p.owner) p.morale = clamp(p.morale + (stars >= 4 ? 6 : stars <= 2 ? -10 : 1) - tired, 0, 100);
      p.xp = (p.xp || 0) + 1;
      if (p.skill < 5 && p.xp >= BALANCE.skillUp[p.skill]) {
        p.skill++;
        p.xp = 0;
        if (!p.owner) p.wage += BALANCE.wage.raisePerLevel;
        ups.push(p.owner ? upTxt('up.habilidad_duenio', { n: p.skill }) : upTxt('up.habilidad', { nombre: p.name, n: p.skill, monto: money(p.wage) }));
      }
      gainExperience(s, p, !!c.internacional, ups);
    });
    s.stats.events++;
    s.recentStars = (Array.isArray(s.recentStars) ? s.recentStars : []).concat([stars]).slice(-BALANCE.trust.last);
    if (stars === 5) s.stats.fiveStars++;
    s.stats.earned += pay;
    s.stats.best[c.type] = Math.max(s.stats.best[c.type] || 0, stars);
    s.stats.good = s.stats.good || {};
    if (stars >= 4) s.stats.good[c.type] = (s.stats.good[c.type] || 0) + 1;
    s.stats.duels = s.stats.duels || { won: 0, lost: 0 };
    if (duel === 'won') s.stats.duels.won++;
    if (duel === 'lost') s.stats.duels.lost++;
    if (c.internacional) s.stats.intl = (s.stats.intl || 0) + 1;
    s.chapterStats = s.chapterStats || { good: {}, duels: 0 };
    if (stars >= 4) s.chapterStats.good[c.type] = (s.chapterStats.good[c.type] || 0) + 1;
    if (duel === 'won') s.chapterStats.duels++;
    s.chapterStats.earned = (s.chapterStats.earned || 0) + pay - ev.wages - (ev.travelCost || 0) - transporte;
    const title = tx('res.titulo', { icon: t.icon, evento: t.name, cliente: c.client });
    const result = {
      title, type: c.type,
      quality, stars, pay, wages: ev.wages, net: pay - ev.wages - (ev.travelCost || 0) - transporte, repDelta, ups,
      // Movilización: { total, app, combustible, eleccion ('economico' | 'xl' | 'carga' | null), km, personas, bultos,
      //   vehiculos: [{ id, type, nombre }], autos, fletes, incluido ('viaje' en un internacional), soloFlota } o null
      transporte: tp ? resumenTransporte(tp, transporte, cubreCliente) : null,
      rival: !!c.rival, duel, // duel: 'won' | 'lost' | null
      rivalQuality, // calidad de MegaVisión en un contrato disputado (o null)
      payNow, payLater, payLaterDays: laterDays, // cobro en dos partes
      dailyCost: dailyCost(s),
      base: ev.base, parts: ev.parts,
      incidents: ev.incidents.map((i) => { const tt = textOf(INCIDENTS[i.key], view, i.x); return { key: i.key, text: tt.text, k: tt.k, p: tt.p, result: i.result }; }),
      crewPlan: ev.crewPlan || null, cameraPlan: ev.cameraPlan || null,
      internacional: !!c.internacional, travelCost: ev.travelCost || 0, travelDays: c.internacional ? (c.travelDays || 0) : 0, intlFail,
    };
    log(s, 'log.resultado', { estrellas: '⭐'.repeat(stars), evento: { k: 'ev.' + c.type }, cliente: c.client, monto: money(payNow),
      despues: payLater ? { k: 'log.resultado_despues', p: { monto: money(payLater), n: laterDays } } : '', sueldos: money(ev.wages), fama: (repDelta >= 0 ? '+' : '') + repDelta });
    if (payLater) log(s, 'log.pago_mitad', { cliente: c.client, n: laterDays });
    if (transporte > 0) log(s, 'log.transporte', { cliente: c.client, km: tp.km, monto: money(transporte) });
    ups.forEach((u) => log(s, 'log.subio', { texto: { k: u.k, p: u.p } }));
    if (intlFail) log(s, 'log.intl_fallo', { cliente: c.client, n: c.repRisk || 10 });
    else if (c.internacional) log(s, 'log.intl_ok', { cliente: c.client, pais: paisP(c) });
    if (duel === 'won') log(s, 'log.duelo_ganado', { q: quality, rq: rivalQuality, n: BALANCE.rival.winRep, frase: { k: pick(s, D.TAUNTS.duelWin) } });
    if (duel === 'lost') log(s, 'log.duelo_perdido', { q: quality, rq: rivalQuality, n: BALANCE.rival.loseRep, frase: { k: pick(s, D.TAUNTS.duelLose) } });
    storyMilestone(s, c.type, stars, duel);
    cadaExt(s, 'alTerminarEvento', (h) => h(s, result, c));
    s.currentEvent = null;
    s.lastResult = result;
    // El premio del capítulo entra antes de pasar el día (así cuenta para la caja frente a la quiebra)
    result.chapterDone = checkChapter(s);
    if (esIntento(s)) {
      // Intentos en línea: igual que siempre (el evento ocupa el día; el servidor lo repite así)
      nextDay(s);
      for (let i = 0; i < result.travelDays && !s.gameOver; i++) { log(s, 'log.viajando', { pais: paisP(c) }); nextDay(s, { travel: true }); }
    } else {
      // Varios eventos por día: este evento usa un turno (mañana, tarde o noche). El día se cierra solo al usar el
      // último turno o con un evento que ocupa el día entero; si no, sigue el mismo día (los gastos fijos se cobran al cerrar).
      const H = hoyDe(s), DIA = BALANCE.dia;
      H.n++; H.pagos += pay; H.ganancia += result.net;
      H.eventos.push({ t: c.type, e: stars, g: result.net });
      const jornada = jornadaCompleta(c);
      const cierra = jornada || H.n >= DIA.franjas;
      result.dia = { turno: H.n - 1, n: H.n, max: DIA.franjas, jornada, cerrado: cierra, gastos: dailyCost(s), parte: 0, conOtro: null };
      if (cierra) {
        if (jornada && !c.internacional) log(s, 'log.dia_completo', { evento: { k: 'ev.' + c.type } });
        nextDay(s);
        if (s.resumenDia) result.dia.gastos = s.resumenDia.gastos; // lo que se cobró de verdad al cerrar
        // Días de viaje: no puedes tomar otros contratos (los días pasan solos)
        for (let i = 0; i < result.travelDays && !s.gameOver; i++) { log(s, 'log.viajando', { pais: paisP(c) }); nextDay(s, { travel: true }); }
      } else {
        result.dia.conOtro = Math.round(result.dia.gastos / (H.n + 1));
        // Con pocas ofertas, a veces llama un cliente con un evento para más tarde
        const L = DIA.llamada;
        if (L && s.contracts.length < L.si && !inTutorial(s) && chance(s, L.chance)) {
          const k = addContract(s);
          if (k) log(s, 'log.llamada', { cliente: k.client, evento: { k: 'ev.' + k.type } });
        }
      }
      result.dia.parte = Math.round(result.dia.gastos / H.n);
    }
    if (!result.chapterDone) result.chapterDone = checkChapter(s);
    result.avisos = (s.avisos || []).slice(Math.min(avisos0, (s.avisos || []).length));
    // Fama antes y la que queda de verdad (con lo que sumaron las extensiones y el día que pasó): la que muestra el resultado
    result.famaAntes = famaAntes;
    result.fama = s.rep;
    return { ok: true, result };
  }

  /* ---------- Historia ---------- */
  function checkChapter(s) {
    if (s.storyDone) return null;
    const ch = CHAPTERS[s.chapter];
    if (!ch || !ch.check(s)) return null;
    s.money += ch.reward;
    aviso(s, 'capitulo', 'log.capitulo', { titulo: { k: 'cap.' + s.chapter + '.title' }, texto: { k: 'cap.' + s.chapter + '.done' } });
    const done = { chapter: s.chapter, title: ch.title, text: ch.done, reward: ch.reward, day: s.day };
    if (!Array.isArray(s.capCompletados)) s.capCompletados = [];
    s.capCompletados.push(done);
    if (s.chapter >= CHAPTERS.length - 1) s.storyDone = true;
    else {
      s.chapter++;
      s.chapterStats = { good: {}, duels: 0 };
      const next = CHAPTERS[s.chapter];
      s.storyNext = next.offer ? s.day + next.offer.first : 0;
    }
    return done;
  }

  /* Mensajes cortos de la historia a mitad de capítulo */
  function storyMilestone(s, type, stars, duel) {
    if (s.storyDone) return;
    const g = good(s, type);
    if (s.chapter === 2 && type === 'lanzamiento') {
      if (stars >= 4 && g === 1) log(s, 'historia.lucia_bien');
      else if (stars < 4) log(s, 'historia.lucia_regular');
    }
    if (s.chapter === 3 && duel === 'won' && duelsWon(s) === 1) log(s, 'historia.ramiro_duelo');
    if (s.chapter === 4 && type === 'ligapro') {
      if (stars >= 4 && g === 1) log(s, 'historia.aurelio_bien');
      else if (stars < 4) log(s, 'historia.aurelio_mal');
    }
    if (s.chapter === 5 && type === 'final' && stars < 5) log(s, 'historia.ramiro_final');
  }

  /* ---------- Guardar / cargar ---------- */
  function migrateStaff(p) {
    p.role = normRole(p.role);
    if (!ROLES[p.role]) p.role = 'camarografo';
    if (!p.tier) p.tier = p.owner ? 'semi_senior' : p.skill >= 4 ? 'senior' : p.skill >= 3 ? 'semi_senior' : 'junior';
    if (typeof p.eventos_nacionales !== 'number') p.eventos_nacionales = p.events || 0;
    if (typeof p.eventos_internacionales !== 'number') p.eventos_internacionales = 0;
  }
  function serialize(s) { return JSON.stringify(s); }
  function deserialize(str) {
    try {
      const s = JSON.parse(str);
      if (!s || !(s.v === 1 || s.v === 2 || s.v === 3 || s.v === SAVE_VERSION) || !Array.isArray(s.staff)) return null;
      // Rellenar campos nuevos en partidas guardadas antes
      s.stats = s.stats || { events: 0, fiveStars: 0, earned: 0, best: {} };
      s.stats.best = s.stats.best || {};
      if (!s.stats.good) {
        s.stats.good = {};
        Object.keys(s.stats.best).forEach((k) => { if (s.stats.best[k] >= 4) s.stats.good[k] = 1; });
      }
      s.stats.duels = s.stats.duels || { won: 0, lost: 0 };
      if (typeof s.stats.intl !== 'number') s.stats.intl = 0;
      if (!s.chapterStats) {
        // Partida vieja: lo mejor que se sabe es el mejor resultado de cada tipo
        s.chapterStats = { good: {}, duels: 0 };
        const ch = CHAPTERS[s.chapter];
        if (ch && ch.target && (s.stats.best[ch.target] || 0) >= 4) s.chapterStats.good[ch.target] = 1;
      }
      if (typeof s.storyNext !== 'number') {
        const ch = CHAPTERS[s.chapter];
        s.storyNext = ch && ch.offer ? s.day + 1 : 0;
      }
      (s.contracts || []).forEach((c) => {
        c.rival = !!c.rival; c.story = !!c.story;
        if (c.rival && typeof c.rivalQuality !== 'number') c.rivalQuality = rivalQualityFor(s, c);
      });
      if (s.currentEvent && s.currentEvent.contract && s.currentEvent.contract.rival && typeof s.currentEvent.contract.rivalQuality !== 'number') {
        s.currentEvent.contract.rivalQuality = rivalQualityFor(s, s.currentEvent.contract);
      }
      if (!Array.isArray(s.pending)) s.pending = [];
      if (typeof s.lastWorkDay !== 'number') s.lastWorkDay = s.day;
      // v3: roles nuevos, niveles de experiencia, equipos que ya no existen
      s.staff.forEach(migrateStaff);
      (s.candidates || []).forEach(migrateStaff);
      s.equip = (s.equip || []).filter((e) => e && typeof e.type === 'string');
      s.equip.forEach((e) => { if (D.ITEM_ALIAS[e.type]) e.type = D.ITEM_ALIAS[e.type]; });
      // La cámara de Don Ramiro (partidas de antes de la marca starter): el nombre se arma con su clave al mostrarla
      s.equip.forEach((e) => { if (e.nick && !e.starter && (e.nick === TEXTOS['equipo.camara_ramiro'] || (e.id === 2 && e.type === 'cam_basic'))) e.starter = true; });
      if (typeof s.redDays !== 'number') s.redDays = 0;
      if (!Array.isArray(s.recentStars)) s.recentStars = [];
      if (typeof s.intlNext !== 'number') s.intlNext = 0;
      if (!Array.isArray(s.avisos)) s.avisos = [];
      if (!Array.isArray(s.capCompletados)) s.capCompletados = [];
      // v4: turnos del día (una partida vieja empieza el día de hoy sin eventos hechos)
      hoyDe(s);
      if (s.resumenDia && typeof s.resumenDia !== 'object') s.resumenDia = null;
      if (s.currentEvent && !s.currentEvent.crewPlan) {
        s.currentEvent.crewPlan = crewPlan(s, s.currentEvent.contract, s.currentEvent.staffIds, s.currentEvent.equipIds);
        s.currentEvent.cameraPlan = cameraPlan(s, s.currentEvent.contract, s.currentEvent.equipIds, s.currentEvent.staffIds);
      }
      if (s.currentEvent) s.currentEvent.incidents = s.currentEvent.incidents.filter((i) => INCIDENTS[i.key]);
      s.log = (s.log || []).filter((l) => l && typeof l.text === 'string');
      s.v = SAVE_VERSION;
      migrarExt(s);
      return s;
    } catch (e) { return null; }
  }

  /* ---------- Partida de demostración (?demo=cap4) ----------
     Se arma jugando con las mismas reglas (un bot sencillo compra, contrata y cubre eventos) hasta llegar al
     capítulo 4; después se agregan con las funciones de la lógica un contrato disputado por MegaVisión y una
     oferta internacional para mostrarlos. Siempre sale igual (semilla fija). */
  const DEMO_COMPRAS = ['audio_basic', 'cam_basic', 'switch_basic', 'encoder', 'mics', 'sop_tripode_basico', 'router4g', 'raincover', 'ups',
    'cam_pro', 'audio_pro', 'sop_tripode_basico', 'cam_cine', 'ic_hollyband_solidkom_c2', 'gfx_kasparcg_pc', 'sw_vmax_pro_pc', 'enc_kilovista_p3', 'cam_cine'];
  function demoTurn(s) {
    const dc = dailyCost(s);
    if (s.stock.cable < 2 && s.money > 300) buyConsumable(s, 'cable', 1);
    s.equip.filter((e) => e.condition < 45).forEach((e) => { if (s.money > repairCost(e) + 400) repair(s, e.id); });
    const owned = {};
    s.equip.forEach((e) => { owned[e.type] = (owned[e.type] || 0) + 1; });
    const want = {};
    for (const k of DEMO_COMPRAS) {
      want[k] = (want[k] || 0) + 1;
      if ((owned[k] || 0) >= want[k]) continue;
      const it = CATALOG[k];
      if (it.minRep <= s.rep && s.money > it.price + 900 + 6 * dc) buy(s, k);
      break;
    }
    const cams = countCat(s, 'cam');
    const need = { camarografo: Math.min(cams - 1, s.rep < 10 ? 1 : 2), director: cams >= 2 ? 1 : 0, sonidista: 1, tecnico_transmision: countCat(s, 'encoder') ? 1 : 0,
      cablero: cams >= 3 ? 1 : 0, coordinador_piso: s.rep >= 12 ? 1 : 0, productor: s.rep >= 14 ? 1 : 0, operador_graficos: countCat(s, 'graphics') ? 1 : 0 };
    s.candidates.slice().sort((a, b) => b.skill - a.skill).forEach((c) => {
      const r = normRole(c.role);
      const have = s.staff.filter((p) => !p.owner && normRole(p.role) === r).length;
      if (have < (need[r] || 0) && c.tier !== 'internacional' && s.staff.length < 10 && s.money > c.wage * 2 + 500 + 3 * dc) hire(s, c.id);
    });
    if (s.contracts.length < 2 && s.money > 600) marketing(s, 'redes');
    let best = null;
    s.contracts.forEach((c) => {
      if (c.internacional) return;
      const lo = suggestLoadout(s, c.id);
      const staff = s.staff.filter((p) => lo.staffIds.includes(p.id));
      const equip = s.equip.filter((e) => lo.equipIds.includes(e.id));
      if (!equip.some((e) => itemOf(e).cat === 'cam')) return;
      const cq = computeQuality(s, c, staff, equip);
      const q = cq.rango.esperado, B = BALANCE.stars;
      const st = q >= B[0] ? 5 : q >= B[1] ? 4 : q >= B[2] ? 3 : q >= B[3] ? 2 : 1;
      const net = c.pay * payMult(c, st, s) - staff.reduce((a, p) => a + eventWage(p, c.diff), 0);
      if (net <= 0 && !c.story) return;
      if (c.rival && q < c.rivalQuality + 8) return;
      const score = net * (c.story ? 2 : 1) * (st >= 3 ? 1 : 0.4);
      if (!best || score > best.score) best = { c, lo, score };
    });
    if (!best) { nextDay(s); return; }
    startEvent(s, best.c.id, best.lo.staffIds, best.lo.equipIds);
    let inc, guard = 0;
    while ((inc = currentIncident(s)) && guard++ < 10) resolveIncident(s, inc.choices.find((x) => x.ok).i);
    finishEvent(s);
  }
  function demoGame(kind, seed) {
    if (kind !== 'cap4') return null;
    const s = newGame(seed === undefined ? 56 : seed);
    for (let i = 0; i < 400 && !s.gameOver && !s.storyDone && s.chapter < 3; i++) demoTurn(s);
    if (s.gameOver || s.chapter !== 3) return null;
    // Lo que se quiere mostrar: un duelo con MegaVisión y una oferta internacional
    s.contracts = s.contracts.filter((c) => !c.internacional).slice(0, BALANCE.maxContracts - 3);
    // El duelo: de varias ofertas disputadas posibles se queda la que mejor se puede pelear con lo que tienes
    const cands = ['lucha_libre', 'graduacion', 'barrial', 'boxeo'].filter((k) => EVENT_TYPES[k].minRep <= s.rep)
      .map((k) => addContract(s, k, 1, { rival: true })).filter(Boolean).map((c) => {
        const lo = suggestLoadout(s, c.id);
        const q = computeQuality(s, c, s.staff.filter((p) => lo.staffIds.includes(p.id)), s.equip.filter((e) => lo.equipIds.includes(e.id))).rango.esperado;
        return { c, m: q - c.rivalQuality };
      }).sort((x, y) => y.m - x.m);
    cands.slice(1).forEach((x) => { s.contracts = s.contracts.filter((c) => c !== x.c); });
    const kinds = intlEligible(s);
    addIntlContract(s, kinds.length ? null : 'regional');
    s.intlNext = s.day + BALANCE.intl.every[0];
    s.avisos = []; s.capCompletados = []; s.lastResult = null;
    s.chapterSeen = s.chapter - 1; // se muestra la presentación del capítulo 4
    s.demo = kind;
    return s;
  }

  aplicarTextos();

  const API = {
    ROLES, CATALOG, CONSUMABLES, EVENT_TYPES, CHAPTERS, INCIDENTS, CATEGORIAS, TIERS, INTL_KINDS, TEXTOS,
    ROLE_ALIAS, ROLE_KEYS, TIER_KEYS,
    newGame, addContract, addIntlContract, marketing, refreshCandidates, hire, fire, searchStaff,
    buy, buyConsumable, repair, sell, repairCost, sellPrice, nextDay, shopByCategory,
    computeQuality, suggestLoadout, lenteFaltante, camaraParaPerfil, startEvent, currentIncident, resolveIncident, finishEvent,
    crewPlan, cameraPlan, crewReq, requisitosInternacional, normRole, baseWage,
    canonRole: normRole, // nombre anterior (lo usan premium.js y duelos.js)
    checkChapter, countCat, serialize, deserialize, money, tx, setTraductor,
    takeAvisos, takeChapterDone, venue, venueName, qualityRange,
    // Varios eventos por día
    turnoDia, jornadaCompleta, takeResumenDia,
    BALANCE, dailyCost, dailyCostBreakdown, eventWage, rivalQualityFor, SAVE_VERSION,
    staffName: nombrePersona, equipName, paisNombre, bankruptLimit, bankruptInfo, payFactor, payMult, demoGame,
    // Extensiones
    registrarExtension, extensiones, esIntento, extActivas, extSuma, maxStaff, maxEquip, rnd, log, aviso, registrarTipoEvento,
    registrarImprevisto, incAyuda, itemOf,
    // Movilización y flota
    planTransporte, distanciaKm, bultosDe, flota, flotaDe, esVehiculoFlota, tarifaApp, desgasteVehiculo, vehiclesDaily, publicidadFlota, topeTransporte,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Game = API;
})(typeof window !== 'undefined' ? window : globalThis);
