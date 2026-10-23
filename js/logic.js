/* =========================================================
   EN VIVO Tycoon — Lógica del juego
   Este archivo NO toca la pantalla. Solo reglas y datos.
   Se puede probar con Node:  node tests/test_logic.js
   ========================================================= */
(function (root) {
  'use strict';

  // v2: cobros pendientes, duelos con calidad de la rival, desgaste de fama. Las partidas v1 se siguen cargando.
  const SAVE_VERSION = 2;

  /* =========================================================
     BALANCE: todos los números de la economía en un solo lugar.
     Para ajustar la dificultad, cambia estos valores y corre
     node tests/test_logic.js para ver cómo queda el ritmo.
     ========================================================= */
  const BALANCE = {
    start: { money: 1500, rep: 5 },
    bankruptAt: -300,            // si el dinero baja de esto, quiebras
    tutorialEvents: 3,           // los 3 primeros eventos son suaves (1 imprevisto, sin sorpresas)
    maxContracts: 7,
    // Gastos fijos de cada día (ver dailyCost)
    daily: {
      // Local según el tamaño (personas + equipos): garaje, oficina, estudio, centro de producción
      // [tamaño mínimo, costo por día, nombre]. Tamaño = personas + equipos.
      rent: [[0, 20, 'Garaje'], [13, 60, 'Oficina'], [16, 160, 'Estudio'], [19, 310, 'Centro de producción']],
      perStaff: 2,               // por cada persona contratada (sin contarte a ti)
      equipShare: 0.003,         // seguro y bodega: 0,3% del valor de tus equipos cada día
      payrollShare: 0.03,        // parte del sueldo de cada persona que se paga aunque no haya evento
    },
    // Personal
    wage: { base: 15, perSkill: 15, random: 10, raisePerLevel: 15, hireFeeDays: 2,
            perDiff: 0.15 },     // en eventos grandes el personal cobra más: +15% por punto de dificultad sobre 1
    skillUp: [0, 4, 7, 11, 16],  // eventos para pasar del nivel 1 al 2, del 2 al 3, etc.
    // Ánimo del equipo: los eventos grandes cansan (por punto de dificultad sobre 2); descansar un día lo recupera
    morale: { fatigue: 3, rest: 6, neutral: 60, perPoint: 8, min: -5, max: 3 },
    raise: { chance: 0.025, minStaff: 3, minDay: 25, pct: 0.1 }, // el equipo pide aumento
    // Equipos
    wear: { min: 3, perDiffMin: 0, max: 6, perDiffMax: 2.5 }, // desgaste por evento según dificultad
    repairFactor: 0.45, sellFactor: 0.4,
    worn: 40,                    // con menos de esto, el equipo puede fallar en vivo
    // Calidad del evento
    stars: [85, 70, 55, 40],     // calidad mínima para 5, 4, 3 y 2 estrellas
    starsPay: [0, 0.4, 0.7, 1.0, 1.1, 1.25],
    starsRep: [0, -5, -0.5, 2, 4, 6],
    diffPenalty: [0, 4, 8, 34, 50, 50], // puntos que resta la dificultad 1..5 del evento
    skillPts: { dir: 3, audio: 2, stream: 2, team: 3 }, // cuánto vale cada nivel de habilidad
    expectPerRep: 0.18,          // cuanto más famoso eres, más te exige el cliente: -(fama * esto) puntos
    // Las ofertas de la historia vienen con apoyo del personaje (escenario, fibra, luz del estadio...)
    storySupport: { lanzamiento: 6, ligapro: 9, final: 24 },
    luck: [-2, 2],               // "suerte del día": entre -(a + b * dif) y +(a + b * dif) puntos (más en eventos grandes)
    // Imprevistos
    incidents: { byDiff: [1, 1, 1, 2, 3, 3], extraChance: 0.35, max: 5, severityPerDiff: 0.15,
                 skillBase: 0.3, skillPer: 0.12 }, // imprevistos de habilidad: éxito = base + nivel * per
    // Clientes
    payRepBonus: 250,            // pago * (1 + fama / payRepBonus)
    latePay: { chance: 0.25, minDiff: 2, share: 0.5, days: 3 },
    cancelChance: 0.05,          // un cliente cancela una oferta pendiente
    // Fama
    fameDecay: { every: 3 },     // -1 de fama cada 3 días sin trabajar
    // MegaVisión
    rival: {
      fromChapter: 3,            // capítulo 4 (se cuenta desde 0)
      contestedChance: 0.2, payBoost: 1.3, diffBoost: 1,
      stealChance: 0.15,
      // calidad de MegaVisión = base + capítulo * perChapter + dificultad * perDiff + azar (entre spread)
      quality: { base: 36, perChapter: 3, perDiff: 3, spread: [-6, 8], min: 45, max: 95 },
      winRep: 3, loseRep: 4,
    },
  };

  /* ---------- Números aleatorios (con semilla, para poder probar) ---------- */
  function rnd(s) {
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const randInt = (s, a, b) => a + Math.floor(rnd(s) * (b - a + 1));
  const pick = (s, arr) => arr[Math.floor(rnd(s) * arr.length)];
  const chance = (s, p) => rnd(s) < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const money = (n) => '$' + Math.round(n).toLocaleString('es-EC');

  /* ---------- Datos ---------- */
  const ROLES = {
    cam: { name: 'Camarógrafo', icon: '🎥' },
    dir: { name: 'Director / vMix', icon: '🎬' },
    audio: { name: 'Sonidista', icon: '🎧' },
    stream: { name: 'Técnico de streaming', icon: '📡' },
  };

  const CATALOG = {
    cam_basic:    { name: 'Cámara básica',              icon: '📹', cat: 'cam',      price: 600,  q: 1, minRep: 0,  desc: 'Camcorder sencilla. Sirve para empezar.' },
    cam_pro:      { name: 'Cámara profesional',         icon: '🎥', cat: 'cam',      price: 1800, q: 2, minRep: 10, desc: 'Mejor imagen y zoom. Los clientes lo notan.' },
    cam_cine:     { name: 'Cámara broadcast 4K',        icon: '🎞️', cat: 'cam',      price: 4500, q: 3, minRep: 35, desc: 'Calidad de televisión. Para eventos grandes.' },
    switch_basic: { name: 'Laptop con vMix',            icon: '💻', cat: 'switcher', price: 900,  q: 1, minRep: 0,  desc: 'Mezcla varias cámaras y transmite.' },
    switch_pro:   { name: 'Switcher ATEM + PC potente', icon: '🎛️', cat: 'switcher', price: 3200, q: 2, minRep: 30, desc: 'Repeticiones, gráficos y muchas cámaras.' },
    audio_basic:  { name: 'Consola de audio 8 canales', icon: '🎚️', cat: 'audio',    price: 400,  q: 1, minRep: 0,  desc: 'Para micrófonos y música.' },
    audio_pro:    { name: 'Consola digital 18 canales', icon: '🎛️', cat: 'audio',    price: 1400, q: 2, minRep: 20, desc: 'Sonido limpio en eventos grandes.' },
    mics:         { name: 'Micrófonos inalámbricos',    icon: '🎤', cat: 'mics',     price: 350,  q: 1, minRep: 0,  desc: 'Mejoran el sonido en eventos con audio.' },
    encoder:      { name: 'Encoder SRT portátil',       icon: '📶', cat: 'encoder',  price: 700,  q: 1, minRep: 0,  desc: 'Envía la señal por internet de forma estable.' },
    router4g:     { name: 'Router 4G de respaldo',      icon: '🛜', cat: 'internet', price: 500,  q: 1, minRep: 0,  desc: 'Salva la transmisión si se cae el internet.' },
    ups:          { name: 'UPS / batería de respaldo',  icon: '🔋', cat: 'power',    price: 450,  q: 1, minRep: 0,  desc: 'Salva el evento si se va la luz.' },
    raincover:    { name: 'Cobertores de lluvia',       icon: '☂️', cat: 'rain',     price: 150,  q: 1, minRep: 0,  desc: 'Protege las cámaras en eventos al aire libre.' },
  };

  const CONSUMABLES = {
    cable:   { name: 'Cable de repuesto', icon: '🔌', price: 40, desc: 'Si se rompe un cable, lo cambias al instante.' },
    battery: { name: 'Batería extra',     icon: '🪫', price: 60, desc: 'Si una cámara se queda sin batería.' },
  };

  const EVENT_TYPES = {
    misa:        { name: 'Misa / ceremonia',        icon: '⛪', cams: [1, 1], audio: true,  stream: 0.3, outdoor: 0,   diff: 1, pay: [150, 280],    minRep: 0,
                   clients: ['Parroquia San José', 'Iglesia El Buen Pastor', 'Parroquia La Merced'] },
    boda:        { name: 'Boda',                     icon: '💍', cams: [1, 2], audio: true,  stream: 0.2, outdoor: 0.4, diff: 1, pay: [250, 480],    minRep: 0,
                   clients: ['Familia Andrade', 'Carla y Andrés', 'Familia Paredes', 'Familia Cevallos'] },
    prensa:      { name: 'Rueda de prensa',          icon: '🎙️', cams: [1, 2], audio: true,  stream: 1,   outdoor: 0,   diff: 1, pay: [200, 380],    minRep: 0,
                   clients: ['Municipio', 'Prefectura', 'Club Deportivo Los Andes'] },
    barrial:     { name: 'Partido de liga barrial',  icon: '⚽', cams: [2, 2], audio: false, stream: 1,   outdoor: 1,   diff: 2, pay: [300, 600],    minRep: 3,
                   clients: ['Liga Barrial La Floresta', 'Liga Parroquial Conocoto', 'Liga Barrial El Inca'] },
    graduacion:  { name: 'Graduación de colegio',    icon: '🎓', cams: [2, 2], audio: true,  stream: 0.6, outdoor: 0.2, diff: 2, pay: [350, 650],    minRep: 5,
                   clients: ['Colegio Nacional Mejía', 'Unidad Educativa Santa Ana', 'Colegio San Gabriel'] },
    lanzamiento: { name: 'Lanzamiento de marca',     icon: '🚀', cams: [2, 3], audio: true,  stream: 1,   outdoor: 0.2, diff: 3, pay: [900, 1600],   minRep: 12,
                   clients: ['Cervecería Montaña', 'Bebidas Volcán', 'Motos Kawa-Andes', 'Celulares Nébula'] },
    concierto:   { name: 'Concierto',                icon: '🎸', cams: [3, 4], audio: true,  stream: 1,   outdoor: 0.6, diff: 4, pay: [1600, 3000],  minRep: 28,
                   clients: ['Festival Sur Sonoro', 'Productora Tarima Viva', 'Coliseo Rumiñahui'] },
    // minChapter: el cliente solo aparece desde ese capítulo (o en modo libre)
    ligapro:     { name: 'Partido de LigaPro',       icon: '🏟️', cams: [4, 4], audio: true,  stream: 1,   outdoor: 1,   diff: 4, pay: [2600, 4500],  minRep: 40, minChapter: 4,
                   clients: ['Club Atlético del Valle', 'Deportivo Cumbayá FC', 'Sporting Pichincha'] },
    final:       { name: 'Final de campeonato',      icon: '🏆', cams: [5, 6], audio: true,  stream: 1,   outdoor: 1,   diff: 5, pay: [6000, 10000], minRep: 65, minChapter: 5,
                   clients: ['Liga Nacional de Fútbol', 'Federación del Torneo'] },
  };

  const FIRST_NAMES = ['Kevin', 'Andrea', 'Luis', 'María José', 'Bryan', 'Gaby', 'Carlos', 'Daniela', 'Jonathan', 'Paola',
    'Stalin', 'Mishell', 'Fernando', 'Karla', 'Diego', 'Tania', 'Wilson', 'Jessica', 'Alex', 'Vane'];
  const LAST_NAMES = ['Guamán', 'Chiluisa', 'Pazmiño', 'Andrade', 'Toapanta', 'Morales', 'Cedeño', 'Quishpe',
    'Zambrano', 'Villacís', 'Tenorio', 'Ortiz', 'Lema', 'Salazar'];

  const STARS_PAY = BALANCE.starsPay;
  const STARS_REP = BALANCE.starsRep;

  /* ---------- Historia (capítulos) ---------- */
  // character: quién habla en el capítulo (la pantalla dibuja su retrato)
  //   'ramiro' = Don Ramiro (mentor) · 'mega' = Germán Vélez, dueño de MegaVisión (rival)
  //   'marca' = Lucía Mena (gerente de marketing) · 'dirigente' = Don Aurelio (dirigente de club)
  // target: tipo de evento que pide el capítulo. offer: cada cuántos días llega una oferta
  //   "de la historia" de ese tipo (first = días hasta la primera, every = días entre ofertas).
  // Lo que cuenta para el capítulo actual (se reinicia al empezar cada capítulo)
  const good = (s, type) => (s.chapterStats && s.chapterStats.good[type]) || 0;
  const duelsWon = (s) => (s.chapterStats && s.chapterStats.duels) || 0;
  const hasType = (s, type) => s.equip.some((e) => e.type === type);
  const CHAPTERS = [
    {
      title: 'Capítulo 1 · El garaje',
      character: 'ramiro',
      intro: 'Don Ramiro, tu antiguo jefe en el canal, se jubiló y te regaló su vieja cámara: "Con esto empecé yo. Ahora te toca a ti." Tienes un garaje, una cámara y muchas ganas.',
      goal: 'Completa 3 eventos',
      check: (s) => s.stats.events >= 3,
      progress: (s) => `${Math.min(s.stats.events, 3)}/3 eventos`,
      reward: 400,
      done: '"¡Así se empieza!", te escribe Don Ramiro, y te manda $400 para que sigas creciendo.',
    },
    {
      title: 'Capítulo 2 · Armando el equipo',
      character: 'ramiro',
      intro: 'Don Ramiro te visita en el garaje: "Solo no vas a llegar lejos, mijo. Necesitas gente de confianza y más equipo para cubrir eventos con varias cámaras."',
      goal: 'Ten 2 cámaras, 2 personas contratadas y 12 de fama',
      check: (s) => countCat(s, 'cam') >= 2 && s.staff.length >= 3 && s.rep >= 12,
      progress: (s) => `Cámaras ${Math.min(countCat(s, 'cam'), 2)}/2 · Personal ${Math.min(s.staff.length - 1, 2)}/2 · Fama ${Math.min(Math.floor(s.rep), 12)}/12`,
      reward: 800,
      done: 'Tu productora ya parece una empresa de verdad. Don Ramiro te recomienda con una marca grande: +$800 de adelanto.',
    },
    {
      title: 'Capítulo 3 · El gran lanzamiento',
      character: 'marca',
      intro: 'Lucía Mena, gerente de marketing, te llama: "Tenemos varios lanzamientos este año, con prensa e influencers. Si me haces quedar bien dos veces, te recomiendo con todas las marcas."',
      goal: 'Cubre 2 "Lanzamientos de marca" con 4 estrellas o más',
      target: 'lanzamiento',
      offer: { first: 3, every: 6 },
      check: (s) => good(s, 'lanzamiento') >= 2,
      progress: (s) => `Lanzamientos con 4⭐ o más: ${Math.min(good(s, 'lanzamiento'), 2)}/2`,
      reward: 1500,
      done: 'Lucía Mena quedó encantada: "Los videos se hicieron virales." Te manda un bono de $1.500.',
    },
    {
      title: 'Capítulo 4 · La rival',
      character: 'mega',
      intro: 'Germán Vélez, dueño de MegaVisión, se enteró de ti: "Esta ciudad tiene una sola productora grande, y es la mía." Ahora pelea contigo algunos contratos. Los verás marcados como DISPUTADOS, con la calidad que promete MegaVisión: para ganarlo tienes que superarla.',
      goal: 'Gana 3 duelos contra MegaVisión (tu calidad final debe superar la de ellos), llega a 40 de fama y junta $12.000',
      check: (s) => duelsWon(s) >= 3 && s.rep >= 40 && s.money >= 12000,
      progress: (s) => `Duelos ${Math.min(duelsWon(s), 3)}/3 · Fama ${Math.min(Math.floor(s.rep), 40)}/40 · Dinero ${money(Math.min(s.money, 12000))}/$12.000`,
      reward: 2000,
      done: 'A MegaVisión se le cayó la transmisión en pleno partido de LigaPro. Don Aurelio, dirigente del club, te llama a ti. +$2.000 para prepararte.',
    },
    {
      title: 'Capítulo 5 · Al estadio',
      character: 'dirigente',
      intro: 'Don Aurelio te recibe en el estadio: "Aquí no se perdona nada. Cuatro cámaras, repeticiones y miles mirando. Necesito un switcher de verdad y dos partidos impecables."',
      goal: 'Compra un "Switcher ATEM" y transmite 2 "Partidos de LigaPro" con 4 estrellas o más',
      target: 'ligapro',
      offer: { first: 8, every: 10 },
      check: (s) => hasType(s, 'switch_pro') && good(s, 'ligapro') >= 2,
      progress: (s) => `Switcher ATEM ${hasType(s, 'switch_pro') ? '✅' : '❌'} · Partidos con 4⭐ o más ${Math.min(good(s, 'ligapro'), 2)}/2`,
      reward: 3000,
      done: 'Don Aurelio quedó feliz: "Ustedes son los nuestros." Te ofrecen transmitir la gran final: +$3.000 de adelanto.',
    },
    {
      title: 'Capítulo 6 · La final',
      character: 'ramiro',
      intro: 'La final del campeonato se juega en unas tres semanas. Todo el país estará mirando y MegaVisión hará lo imposible por verte fallar. Don Ramiro estará en primera fila. Prepara a tu mejor equipo.',
      goal: 'Transmite una "Final de campeonato" con 5 estrellas (necesitas 65 de fama)',
      target: 'final',
      offer: { first: 18, every: 10 },
      check: (s) => (s.stats.best.final || 0) >= 5,
      progress: (s) => {
        const best = s.stats.best.final || 0;
        const offered = s.contracts.some((c) => c.type === 'final');
        const left = Math.max(0, (s.storyNext || 0) - s.day);
        const when = offered ? 'la oferta ya llegó' : s.rep < EVENT_TYPES.final.minRep ? `fama ${Math.floor(s.rep)}/${EVENT_TYPES.final.minRep}`
          : left > 0 ? `la final se juega en ${left} día${left > 1 ? 's' : ''}` : 'la oferta llega pronto';
        return `Mejor resultado ${best}⭐ de 5⭐ · ${when}`;
      },
      reward: 5000,
      done: '¡Transmisión perfecta! Don Ramiro te abraza: "Ya no eres mi alumno, eres el mejor." Ganaste el modo historia. Puedes seguir jugando libre.',
    },
  ];

  /* Frases cortas que aparecen en el registro cuando pasan cosas */
  const TAUNTS = {
    duelWin: [
      'Germán Vélez (MegaVisión): "Fue suerte. La próxima no te va a pasar."',
      'Germán Vélez (MegaVisión): "Disfruta mientras puedas, garajero."',
      'Don Ramiro: "¡Le ganaste en su propia cancha! Así se hace."',
    ],
    duelLose: [
      'Germán Vélez (MegaVisión): "¿Viste? El cliente ya me está llamando a mí."',
      'Germán Vélez (MegaVisión): "Esto es para grandes. Vuelve a tus misas."',
      'Germán Vélez (MegaVisión): "Bonito intento. Mi gente lo hizo mejor."',
    ],
    stolen: [
      'Germán Vélez (MegaVisión): "Nada personal, solo negocios."',
    ],
  };

  /* ---------- Ayudantes ---------- */
  function countCat(s, cat) { return s.equip.filter((e) => CATALOG[e.type].cat === cat).length; }
  function nextId(s) { s.idc = (s.idc || 0) + 1; return s.idc; }
  function log(s, text) {
    s.log.unshift({ day: s.day, text });
    if (s.log.length > 80) s.log.length = 80;
  }
  function staffName(s) { return pick(s, FIRST_NAMES) + ' ' + pick(s, LAST_NAMES); }
  function repairCost(e) { return Math.round(CATALOG[e.type].price * BALANCE.repairFactor * (100 - e.condition) / 100); }
  function sellPrice(e) { return Math.round(CATALOG[e.type].price * BALANCE.sellFactor * e.condition / 100); }

  /* Gastos fijos de cada día: local, personal (aunque no haya evento) y equipos.
     Cuanto más grande la productora, más cuesta mantenerla. */
  function dailyCost(s) {
    const d = BALANCE.daily;
    const hired = s.staff.filter((p) => !p.owner);
    const payroll = hired.reduce((a, p) => a + p.wage, 0) * d.payrollShare;
    const equipValue = s.equip.reduce((a, e) => a + CATALOG[e.type].price, 0);
    return Math.round(rentFor(s) + d.perStaff * hired.length + equipValue * d.equipShare + payroll);
  }
  function rentTier(s) {
    const size = s.staff.length + s.equip.length;
    return BALANCE.daily.rent.reduce((r, t) => (size >= t[0] ? t : r), BALANCE.daily.rent[0]);
  }
  function rentFor(s) { return rentTier(s)[1]; }
  /* Detalle de los gastos diarios (para mostrar en pantalla) */
  function dailyCostBreakdown(s) {
    const d = BALANCE.daily;
    const hired = s.staff.filter((p) => !p.owner);
    const tier = rentTier(s);
    const all = d.rent;
    const next = all[all.indexOf(tier) + 1] || null;
    const size = s.staff.length + s.equip.length;
    const out = {
      place: tier[2], rent: tier[1], size,
      nextPlace: next ? next[2] : null, nextAt: next ? next[0] : null, nextRent: next ? next[1] : null,
      staff: d.perStaff * hired.length,
      payroll: Math.round(hired.reduce((a, p) => a + p.wage, 0) * d.payrollShare),
      equip: Math.round(s.equip.reduce((a, e) => a + CATALOG[e.type].price, 0) * d.equipShare),
    };
    out.total = dailyCost(s);
    return out;
  }
  /* Sueldo de una persona en un evento (cobra más en eventos grandes) */
  function eventWage(p, diff) {
    return Math.round(p.wage * (1 + BALANCE.wage.perDiff * Math.max(0, diff - 1)));
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
      stats: { events: 0, fiveStars: 0, earned: 0, best: {}, good: {}, duels: { won: 0, lost: 0 } },
      storyNext: 0, // día en que llega la próxima oferta de la historia (si el capítulo tiene target)
      chapterStats: { good: {}, duels: 0 }, // avance dentro del capítulo actual
      pending: [], // cobros que llegan después: { day, amount, client }
      lastWorkDay: 1, // último día con evento (para el desgaste de fama)
      log: [],
    };
    s.staff.push({ id: nextId(s), name: 'Tú (dueño)', role: 'cam', skill: 2, wage: 0, morale: 100, events: 0, owner: true });
    s.equip.push({ id: nextId(s), type: 'cam_basic', condition: 75, nick: 'Cámara de Don Ramiro' });
    // Las 3 primeras ofertas son fáciles: sin transmisión por internet
    ['misa', 'boda', 'misa'].forEach((k) => { const c = addContract(s, k); c.stream = false; c.outdoor = false; c.cams = 1; c.daysLeft = 4; });
    refreshCandidates(s);
    log(s, 'Abriste tu productora en el garaje. ¡Mucha suerte!');
    return s;
  }

  /* ---------- Clientes / contratos ---------- */
  function availableTypes(s) {
    const ch = !s.storyDone && CHAPTERS[s.chapter];
    return Object.keys(EVENT_TYPES).filter((k) => {
      const t = EVENT_TYPES[k];
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
      // Más probabilidad de los eventos más grandes que ya desbloqueaste
      const weights = types.map((k, i) => 1 + i * 0.6);
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
      pay: Math.round(randInt(s, t.pay[0], t.pay[1]) * (1 + s.rep / BALANCE.payRepBonus) * (payBoost || 1) / 10) * 10,
      daysLeft: randInt(s, 2, 4),
      rival: false, // true = "disputado": MegaVisión también lo quiere
      story: !!opts.story, // true = oferta de la historia (la pide el capítulo)
    };
    if (c.story) c.daysLeft = randInt(s, 4, 5);
    // Disputado: MegaVisión también lo quiere, así que el cliente exige más (dificultad +1) y paga más
    const R = BALANCE.rival;
    if (!c.story && t.diff >= 2 && rivalActive(s) && chance(s, R.contestedChance)) {
      c.rival = true;
      c.diff = Math.min(5, c.diff + R.diffBoost);
      c.pay = Math.round(c.pay * R.payBoost / 10) * 10;
      c.rivalQuality = rivalQualityFor(s, c); // la calidad que tienes que superar
    }
    s.contracts.push(c);
    return c;
  }

  /* Oferta especial que pide el capítulo actual (llega cada cierto tiempo) */
  const STORY_CALLS = {
    lanzamiento: (c) => `📞 Lucía Mena te recomendó: ${c.client} quiere que cubras su lanzamiento.`,
    ligapro: (c) => `📞 Don Aurelio te consiguió un partido: ${c.client} quiere su transmisión.`,
    final: () => '📞 ¡Llegó la oferta para transmitir la Final de campeonato! Revisa tus ofertas.',
  };
  function storyOffer(s) {
    const ch = CHAPTERS[s.chapter];
    if (s.storyDone || !ch || !ch.target || !ch.offer) return;
    if (s.day < (s.storyNext || 0)) return;
    if (EVENT_TYPES[ch.target].minRep > s.rep) return;
    if (s.contracts.some((c) => c.type === ch.target && c.story)) return;
    if (s.contracts.length >= BALANCE.maxContracts) {
      // Hace espacio quitando la oferta normal que vence primero
      const normal = s.contracts.filter((c) => !c.story).sort((a, b) => a.daysLeft - b.daysLeft)[0];
      if (!normal) return;
      s.contracts = s.contracts.filter((c) => c !== normal);
    }
    const c = addContract(s, ch.target, 1, { story: true });
    if (!c) return;
    s.storyNext = s.day + ch.offer.every;
    log(s, (STORY_CALLS[ch.target] || (() => '📞 Llegó una oferta especial de la historia.'))(c));
  }

  /* Acciones para conseguir clientes */
  function marketing(s, kind) {
    if (s.currentEvent || s.gameOver) return { ok: false, msg: 'Ahora no se puede.' };
    if (kind === 'redes') {
      if (s.daily.redes >= 1) return { ok: false, msg: 'Ya publicaste hoy. Intenta mañana.' };
      if (s.money < 40) return { ok: false, msg: 'No tienes $40.' };
      if (s.contracts.length >= BALANCE.maxContracts) return { ok: false, msg: 'Ya tienes demasiadas ofertas pendientes.' };
      s.money -= 40; s.daily.redes++;
      const c = addContract(s);
      log(s, `Publicaste en redes (-$40). Te escribió ${c.client}.`);
      return { ok: true, msg: `Publicaste en redes. Nueva oferta de ${c.client}.` };
    }
    if (kind === 'anuncio') {
      if (s.daily.anuncio >= 1) return { ok: false, msg: 'Ya pagaste un anuncio hoy.' };
      if (s.money < 200) return { ok: false, msg: 'No tienes $200.' };
      if (s.contracts.length >= 6) return { ok: false, msg: 'Ya tienes demasiadas ofertas pendientes.' };
      s.money -= 200; s.daily.anuncio++;
      addContract(s, null, 1.15); addContract(s, null, 1.15);
      log(s, 'Pagaste un anuncio (-$200). Llegaron 2 ofertas mejor pagadas.');
      return { ok: true, msg: 'Llegaron 2 ofertas mejor pagadas.' };
    }
    if (kind === 'visitar') {
      if (s.contracts.length >= 6) return { ok: false, msg: 'Ya tienes demasiadas ofertas pendientes.' };
      log(s, 'Pasaste el día visitando clientes en persona.');
      nextDay(s);
      addContract(s); addContract(s);
      return { ok: true, msg: 'Visitaste clientes todo el día. Conseguiste 2 ofertas.' };
    }
    return { ok: false, msg: 'Acción desconocida.' };
  }

  /* ---------- Personal ---------- */
  function refreshCandidates(s) {
    s.candidates = [];
    const roles = Object.keys(ROLES);
    for (let i = 0; i < 4; i++) {
      const maxSkill = clamp(1 + Math.floor(s.rep / 18), 1, 5);
      const skill = randInt(s, 1, maxSkill);
      s.candidates.push({
        id: nextId(s),
        name: staffName(s),
        role: i < roles.length ? roles[(i + s.day) % roles.length] : pick(s, roles),
        skill,
        wage: BALANCE.wage.base + skill * BALANCE.wage.perSkill + randInt(s, 0, BALANCE.wage.random),
        morale: 80,
        events: 0,
      });
    }
  }

  function hire(s, candId) {
    const i = s.candidates.findIndex((c) => c.id === candId);
    if (i < 0) return { ok: false, msg: 'Esa persona ya no está disponible.' };
    const c = s.candidates[i];
    const fee = c.wage * BALANCE.wage.hireFeeDays;
    if (s.staff.length >= 12) return { ok: false, msg: 'Tu oficina está llena (máximo 12 personas).' };
    if (s.money < fee) return { ok: false, msg: `Necesitas ${money(fee)} para contratarle.` };
    s.money -= fee;
    s.candidates.splice(i, 1);
    s.staff.push(c);
    log(s, `Contrataste a ${c.name} (${ROLES[c.role].name}). Pago inicial ${money(fee)}.`);
    checkChapter(s);
    return { ok: true, msg: `${c.name} se unió al equipo.` };
  }

  function fire(s, staffId) {
    const i = s.staff.findIndex((p) => p.id === staffId);
    if (i < 0 || s.staff[i].owner) return { ok: false, msg: 'No se puede.' };
    const p = s.staff[i];
    s.staff.splice(i, 1);
    log(s, `Despediste a ${p.name}.`);
    return { ok: true, msg: `${p.name} ya no trabaja contigo.` };
  }

  function searchStaff(s) {
    if (s.money < 30) return { ok: false, msg: 'Necesitas $30 para publicar la vacante.' };
    s.money -= 30;
    refreshCandidates(s);
    return { ok: true, msg: 'Llegaron nuevos candidatos.' };
  }

  /* ---------- Tienda / bodega ---------- */
  function buy(s, type) {
    const it = CATALOG[type];
    if (!it) return { ok: false, msg: 'No existe.' };
    if (it.minRep > s.rep) return { ok: false, msg: `Necesitas ${it.minRep} de fama para que te lo vendan.` };
    if (s.money < it.price) return { ok: false, msg: `Te falta dinero (${money(it.price)}).` };
    if (s.equip.length >= 30) return { ok: false, msg: 'Tu bodega está llena.' };
    s.money -= it.price;
    s.equip.push({ id: nextId(s), type, condition: 100 });
    log(s, `Compraste: ${it.name} (${money(it.price)}).`);
    checkChapter(s);
    return { ok: true, msg: `Compraste ${it.name}.` };
  }

  function buyConsumable(s, key, qty) {
    const it = CONSUMABLES[key];
    qty = qty || 1;
    if (!it) return { ok: false, msg: 'No existe.' };
    if (s.money < it.price * qty) return { ok: false, msg: 'Te falta dinero.' };
    s.money -= it.price * qty;
    s.stock[key] = (s.stock[key] || 0) + qty;
    return { ok: true, msg: `Compraste ${qty} × ${it.name}.` };
  }

  function repair(s, equipId) {
    const e = s.equip.find((x) => x.id === equipId);
    if (!e) return { ok: false, msg: 'No existe.' };
    const cost = repairCost(e);
    if (cost <= 0) return { ok: false, msg: 'Está como nuevo.' };
    if (s.money < cost) return { ok: false, msg: `Reparar cuesta ${money(cost)}.` };
    s.money -= cost;
    e.condition = 100;
    log(s, `Reparaste ${CATALOG[e.type].name} (${money(cost)}).`);
    return { ok: true, msg: 'Quedó como nuevo.' };
  }

  function sell(s, equipId) {
    const i = s.equip.findIndex((x) => x.id === equipId);
    if (i < 0) return { ok: false, msg: 'No existe.' };
    const e = s.equip[i];
    const p = sellPrice(e);
    s.money += p;
    s.equip.splice(i, 1);
    log(s, `Vendiste ${CATALOG[e.type].name} por ${money(p)}.`);
    return { ok: true, msg: `Vendido por ${money(p)}.` };
  }

  /* ---------- Pasar el día ---------- */
  function nextDay(s) {
    if (s.gameOver) return;
    s.day++;
    s.daily = { redes: 0, anuncio: 0 };
    s.money -= dailyCost(s);
    // Cobros pendientes que llegan hoy
    s.pending = s.pending || [];
    const due = s.pending.filter((p) => p.day <= s.day);
    if (due.length) {
      due.forEach((p) => { s.money += p.amount; log(s, `💵 ${p.client} te pagó lo que faltaba: ${money(p.amount)}.`); });
      s.pending = s.pending.filter((p) => p.day > s.day);
    }
    // Fama: si pasas días sin trabajar, la gente se olvida de ti
    const idle = s.day - (s.lastWorkDay || s.day);
    if (idle > 0 && idle % BALANCE.fameDecay.every === 0 && s.rep > 0 && !inTutorial(s)) {
      s.rep = clamp(s.rep - 1, 0, 100);
      log(s, `📉 Llevas ${idle} días sin eventos y la gente se está olvidando de ti (fama -1).`);
    }
    // Ofertas que vencen
    s.contracts.forEach((c) => { c.daysLeft--; });
    const expired = s.contracts.filter((c) => c.daysLeft <= 0);
    if (expired.length) log(s, `Se vencieron ${expired.length} oferta(s) que no tomaste.`);
    s.contracts = s.contracts.filter((c) => c.daysLeft > 0);
    // Nuevas ofertas según la fama
    const n = randInt(s, 0, 1) + (s.rep >= 25 ? 1 : 0) + (s.contracts.length < 2 ? 1 : 0);
    for (let i = 0; i < n; i++) addContract(s);
    // A veces un cliente cancela (nunca las ofertas de la historia)
    const cancelable = s.contracts.filter((c) => !c.story);
    if (!inTutorial(s) && cancelable.length && chance(s, BALANCE.cancelChance)) {
      const c = pick(s, cancelable);
      s.contracts = s.contracts.filter((x) => x !== c);
      log(s, `❌ ${c.client} canceló su evento. Se quedaron sin presupuesto.`);
    }
    // Si el capítulo pide un evento especial, llega cada cierto tiempo
    storyOffer(s);
    // La rival roba clientes (desde el capítulo 4), nunca las ofertas de la historia
    const stealable = s.contracts.filter((c) => !c.story);
    if (rivalActive(s) && stealable.length > 1 && chance(s, BALANCE.rival.stealChance)) {
      const c = pick(s, stealable);
      s.contracts = s.contracts.filter((x) => x !== c);
      log(s, `😠 MegaVisión le ofreció un precio más bajo a ${c.client} y te quitó el contrato.`);
      if (chance(s, 0.3)) log(s, pick(s, TAUNTS.stolen));
    }
    // Moral y renuncias: descansar un día (sin evento) recupera el ánimo
    const rested = s.lastWorkDay !== s.day;
    s.staff.forEach((p) => { if (!p.owner) p.morale = clamp(p.morale + (p.morale < 60 ? 2 : 0) + (rested ? BALANCE.morale.rest : 0), 0, 100); });
    const quitter = s.staff.find((p) => !p.owner && p.morale < 20 && chance(s, 0.4));
    if (quitter) {
      s.staff = s.staff.filter((p) => p !== quitter);
      log(s, `💔 ${quitter.name} renunció porque estaba desmotivado/a.`);
    }
    // El personal pide aumento: si no se lo das, se desmotiva
    const R = BALANCE.raise;
    const hired = s.staff.filter((p) => !p.owner);
    if (hired.length >= R.minStaff && s.day >= R.minDay && chance(s, R.chance)) {
      const p = pick(s, hired);
      const more = Math.max(5, Math.round(p.wage * R.pct));
      if (p.morale >= 50) {
        p.wage += more;
        log(s, `🤝 ${p.name} pidió un aumento y aceptaste: ahora cobra ${money(p.wage)} por evento.`);
      } else {
        hired.forEach((x) => { x.morale = clamp(x.morale - 12, 0, 100); });
        p.wage += more;
        log(s, `✊ El equipo está molesto y ${p.name} encabezó un reclamo. Le subiste el sueldo (${money(p.wage)}) y la moral de todos bajó.`);
      }
    }
    if (s.day % 3 === 1) refreshCandidates(s);
    if (s.money < BALANCE.bankruptAt) {
      s.gameOver = true;
      log(s, `💸 Quebraste: las deudas superaron los ${money(-BALANCE.bankruptAt)}.`);
    }
  }

  const STORY_SUPPORT_TEXT = {
    lanzamiento: 'Apoyo de Lucía Mena (la marca pone luces y escenario)',
    ligapro: 'Apoyo de Don Aurelio (el estadio pone fibra y luz)',
    final: 'Apoyo del estadio y de la federación',
  };

  /* ---------- Calidad base del evento ---------- */
  function computeQuality(s, contract, staff, equip) {
    const parts = [];
    let q = 25;
    parts.push(['Base', 25]);
    const cams = equip.filter((e) => CATALOG[e.type].cat === 'cam');
    const camOps = staff.filter((p) => p.role === 'cam');
    const operated = Math.min(cams.length, camOps.length) + 0.5 * Math.max(0, cams.length - camOps.length);
    const cover = Math.round(25 * Math.min(1, operated / contract.cams));
    parts.push([`Cámaras cubiertas (${cams.length}/${contract.cams}, ${camOps.length} con operador)`, cover]);
    q += cover;
    if (cams.length > camOps.length) parts.push(['Cámaras fijas sin operador (valen la mitad)', 0]);

    const camQ = cams.length ? cams.reduce((a, e) => a + CATALOG[e.type].q * (0.5 + e.condition / 200), 0) / cams.length : 0;
    const camPts = Math.round(camQ * 4);
    parts.push(['Calidad de las cámaras', camPts]); q += camPts;

    const has = (cat) => equip.some((e) => CATALOG[e.type].cat === cat);
    const best = (role) => staff.filter((p) => p.role === role).reduce((m, p) => Math.max(m, p.skill), 0);

    if (contract.cams >= 2) {
      const d = best('dir');
      const sw = equip.filter((e) => CATALOG[e.type].cat === 'switcher').reduce((m, e) => Math.max(m, CATALOG[e.type].q), 0);
      let pts;
      if (d && sw) pts = d * BALANCE.skillPts.dir + sw * 2;
      else if (sw) pts = 0;
      else pts = -(6 + contract.diff * 3);
      parts.push([d && sw ? 'Director con switcher' : sw ? 'Switcher sin director' : 'Sin switcher para mezclar cámaras', pts]);
      q += pts;
    }
    if (contract.audio) {
      const a = best('audio');
      const cons = equip.filter((e) => CATALOG[e.type].cat === 'audio').reduce((m, e) => Math.max(m, CATALOG[e.type].q), 0);
      let pts;
      if (cons && a) pts = 4 + a * BALANCE.skillPts.audio + cons * 2;
      else if (cons) pts = 3;
      else pts = -(6 + contract.diff * 3);
      if (has('mics')) pts += 3;
      parts.push([cons ? (a ? 'Sonidista con consola' : 'Consola sin sonidista') : 'Sin consola de audio', Math.round(pts)]);
      q += pts;
    }
    if (contract.stream) {
      const t = best('stream');
      const canSend = has('encoder') || has('switcher');
      let pts;
      if (canSend && t) pts = 6 + t * BALANCE.skillPts.stream + (has('encoder') ? 2 : 0);
      else if (canSend) pts = 3;
      else pts = -(8 + contract.diff * 4);
      parts.push([canSend ? (t ? 'Técnico de streaming con equipo' : 'Equipo de streaming sin técnico') : 'Sin equipo para transmitir', Math.round(pts)]);
      q += pts;
    }
    const avgSkill = staff.length ? staff.reduce((a, p) => a + p.skill, 0) / staff.length : 0;
    const sk = Math.round(avgSkill * BALANCE.skillPts.team);
    parts.push(['Experiencia del equipo', sk]); q += sk;
    // Ánimo: un equipo cansado o molesto trabaja peor (el dueño no cuenta)
    const hiredStaff = staff.filter((p) => !p.owner);
    if (hiredStaff.length) {
      const M = BALANCE.morale;
      const avgMorale = hiredStaff.reduce((a, p) => a + p.morale, 0) / hiredStaff.length;
      const mp = clamp(Math.round((avgMorale - M.neutral) / M.perPoint), M.min, M.max);
      if (mp) { parts.push([mp < 0 ? 'Equipo cansado o desmotivado' : 'Equipo con buen ánimo', mp]); q += mp; }
    }
    const dp = -BALANCE.diffPenalty[clamp(contract.diff, 1, 5)];
    parts.push([`Dificultad del evento (${contract.diff})`, dp]); q += dp;
    const sup = contract.story ? (BALANCE.storySupport[contract.type] || 0) : 0;
    if (sup) { parts.push([STORY_SUPPORT_TEXT[contract.type] || 'Apoyo especial del cliente', sup]); q += sup; }
    const ex = -Math.round((s.rep || 0) * BALANCE.expectPerRep);
    if (ex) { parts.push(['Lo que esperan de una productora con tu fama', ex]); q += ex; }
    return { q: clamp(Math.round(q), 0, 100), parts };
  }

  /* Elegir automáticamente lo mejor para un evento */
  function suggestLoadout(s, contractId) {
    const c = s.contracts.find((x) => x.id === contractId);
    if (!c) return { staffIds: [], equipIds: [] };
    const sortedStaff = (role) => s.staff.filter((p) => p.role === role).sort((a, b) => b.skill - a.skill);
    const staffIds = [];
    sortedStaff('cam').slice(0, c.cams).forEach((p) => staffIds.push(p.id));
    if (c.cams >= 2) sortedStaff('dir').slice(0, 1).forEach((p) => staffIds.push(p.id));
    if (c.audio) sortedStaff('audio').slice(0, 1).forEach((p) => staffIds.push(p.id));
    if (c.stream) sortedStaff('stream').slice(0, 1).forEach((p) => staffIds.push(p.id));
    const byCat = (cat) => s.equip.filter((e) => CATALOG[e.type].cat === cat)
      .sort((a, b) => (CATALOG[b.type].q * 100 + b.condition) - (CATALOG[a.type].q * 100 + a.condition));
    const equipIds = [];
    byCat('cam').slice(0, c.cams).forEach((e) => equipIds.push(e.id));
    if (c.cams >= 2 || c.stream) byCat('switcher').slice(0, 1).forEach((e) => equipIds.push(e.id));
    if (c.audio) { byCat('audio').slice(0, 1).forEach((e) => equipIds.push(e.id)); byCat('mics').slice(0, 1).forEach((e) => equipIds.push(e.id)); }
    if (c.stream) { byCat('encoder').slice(0, 1).forEach((e) => equipIds.push(e.id)); byCat('internet').slice(0, 1).forEach((e) => equipIds.push(e.id)); }
    byCat('power').slice(0, 1).forEach((e) => equipIds.push(e.id));
    if (c.outdoor) byCat('rain').slice(0, 1).forEach((e) => equipIds.push(e.id));
    return { staffIds, equipIds };
  }

  /* ---------- Imprevistos ---------- */
  // Cada imprevisto: cuándo puede pasar, qué texto muestra y qué opciones hay.
  // "need" devuelve null si la opción se puede usar, o el motivo si no.
  const camsOf = (ev) => ev.equip.filter((e) => CATALOG[e.type].cat === 'cam');
  const hasCat = (ev, cat) => ev.equip.some((e) => CATALOG[e.type].cat === cat);
  const bestRole = (ev, role) => ev.staff.filter((p) => p.role === role).sort((a, b) => b.skill - a.skill)[0];

  const INCIDENTS = {
    cable: {
      weight: (s, ev) => 3 + camsOf(ev).length * 0.5,
      when: (s, ev) => camsOf(ev).length > 0,
      setup: (s, ev) => ({ cam: randInt(s, 1, camsOf(ev).length) }),
      text: (ev, x) => `🔌 ¡Se rompió el cable de la Cámara ${x.cam}! Esa cámara se quedó sin señal.`,
      choices: [
        { label: 'Cambiarlo por un cable de repuesto', need: (s) => (s.stock.cable > 0 ? null : 'No tienes cables de repuesto'),
          run: (s) => { s.stock.cable--; return { q: -1, msg: 'Cambiaste el cable en 30 segundos. Casi nadie lo notó.' }; } },
        { label: 'Mandar a alguien a comprar uno ($60)', need: (s) => (s.money >= 60 ? null : 'No tienes $60'),
          run: (s) => { s.money -= 60; return { q: -8, msg: 'Tardaron 20 minutos en volver. Se perdió parte del evento.' }; } },
        { label: 'Seguir sin esa cámara', run: () => ({ q: -12, msg: 'El resto del evento se vio con menos ángulos. El cliente lo notó.' }) },
      ],
    },
    internet: {
      weight: () => 4,
      when: (s, ev) => ev.contract.stream,
      text: () => '📡 ¡Se cayó el internet del lugar en plena transmisión!',
      choices: [
        { label: 'Pasar al router 4G de respaldo', need: (s, ev) => (hasCat(ev, 'internet') ? null : 'No trajiste router 4G'),
          run: () => ({ q: -2, msg: 'La transmisión siguió con un pequeño corte de 5 segundos. ¡Bien preparado!' }) },
        { label: 'Compartir datos del celular', run: (s) => (chance(s, 0.5)
          ? { q: -5, msg: 'Funcionó, aunque la imagen se pixeló un rato.' }
          : { q: -15, msg: 'La señal del celular no aguantó. La transmisión se cortó varias veces.' }) },
        { label: 'Grabar y subir el video después', run: () => ({ q: -18, msg: 'El cliente quería en vivo. Quedó molesto.' }) },
      ],
    },
    luz: {
      weight: () => 2,
      when: () => true,
      text: () => '⚡ ¡Se fue la luz en el lugar!',
      choices: [
        { label: 'Usar la UPS de respaldo', need: (s, ev) => (hasCat(ev, 'power') ? null : 'No trajiste UPS'),
          run: () => ({ q: -1, msg: 'Tus equipos ni se apagaron. El cliente quedó impresionado.' }) },
        { label: 'Alquilar un generador ($150)', need: (s) => (s.money >= 150 ? null : 'No tienes $150'),
          run: (s) => { s.money -= 150; return { q: -5, msg: 'En 15 minutos estabas otra vez al aire.' }; } },
        { label: 'Esperar que regrese la luz', run: (s) => (chance(s, 0.4)
          ? { q: -6, msg: 'Volvió rápido. Tuviste suerte.' }
          : { q: -16, msg: 'Pasó media hora sin luz. Se perdió una parte importante.' }) },
      ],
    },
    lluvia: {
      weight: () => 5,
      when: (s, ev) => ev.contract.outdoor,
      text: () => '🌧️ ¡Empezó a llover fuerte y las cámaras están al aire libre!',
      choices: [
        { label: 'Poner los cobertores de lluvia', need: (s, ev) => (hasCat(ev, 'rain') ? null : 'No trajiste cobertores'),
          run: () => ({ q: -2, msg: 'Las cámaras siguieron grabando sin problema.' }) },
        { label: 'Cubrirlas con fundas de plástico', run: (s, ev) => {
          if (chance(s, 0.4)) {
            const c = pick(s, camsOf(ev));
            c.condition = clamp(c.condition - 30, 5, 100);
            return { q: -8, msg: `Entró agua a una cámara (${CATALOG[c.type].name}). Quedó dañada.` };
          }
          return { q: -5, msg: 'Las fundas aguantaron, aunque la imagen salió con gotas.' };
        } },
        { label: 'Mover las cámaras bajo techo', run: () => ({ q: -12, msg: 'Desde el techo no se veía bien la acción.' }) },
      ],
    },
    tarde: {
      weight: () => 2.5,
      when: (s, ev) => ev.staff.some((p) => p.role === 'cam' && !p.owner),
      setup: (s, ev) => ({ who: pick(s, ev.staff.filter((p) => p.role === 'cam' && !p.owner)).id }),
      text: (ev, x) => `⏰ ${(ev.staff.find((p) => p.id === x.who) || { name: 'Tu camarógrafo' }).name} llegó tarde y el evento ya empieza.`,
      choices: [
        { label: 'Empezar con una cámara menos', run: () => ({ q: -6, msg: 'Los primeros minutos se cubrieron con menos ángulos.' }) },
        { label: 'Pedir al cliente esperar 10 minutos', run: (s) => (chance(s, 0.5)
          ? { q: -2, msg: 'El cliente aceptó de buena gana.' }
          : { q: -8, msg: 'El cliente se molestó por el retraso.' }) },
        { label: 'Tú cubres su cámara y le llamas la atención', run: (s, ev, x) => {
          const p = s.staff.find((y) => y.id === x.who);
          if (p) p.morale = clamp(p.morale - 15, 0, 100);
          return { q: -3, msg: 'Salvaste el inicio, pero tu camarógrafo quedó resentido (moral -15).' };
        } },
      ],
    },
    acople: {
      weight: () => 3,
      when: (s, ev) => ev.contract.audio,
      text: () => '🔊 ¡Un acople! Un pitido fuerte sale por los parlantes y la transmisión.',
      choices: [
        { label: 'Que el sonidista lo arregle', need: (s, ev) => (bestRole(ev, 'audio') ? null : 'No trajiste sonidista'),
          run: (s, ev) => { const p = bestRole(ev, 'audio'); return { q: Math.round(-8 + p.skill * 1.8), msg: `${p.name} ajustó la ecualización en segundos.` }; } },
        { label: 'Bajar todo el volumen', run: () => ({ q: -6, msg: 'Se quitó el pitido, pero el audio quedó muy bajo.' }) },
        { label: 'Ignorarlo y seguir', run: () => ({ q: -14, msg: 'El pitido volvió varias veces. Se quejaron en los comentarios.' }) },
      ],
    },
    bateria: {
      weight: () => 2.5,
      when: (s, ev) => camsOf(ev).length > 0,
      text: () => '🪫 Una cámara se quedó sin batería en el mejor momento.',
      choices: [
        { label: 'Poner una batería extra', need: (s) => (s.stock.battery > 0 ? null : 'No tienes baterías extra'),
          run: (s) => { s.stock.battery--; return { q: -1, msg: 'Cambio rápido. ¡Nadie se dio cuenta!' }; } },
        { label: 'Conectarla con una extensión', run: () => ({ q: -5, msg: 'Funcionó, pero la cámara quedó sin poder moverse.' }) },
        { label: 'Seguir sin esa cámara', run: () => ({ q: -10, msg: 'Se perdieron tomas importantes.' }) },
      ],
    },
    logo: {
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 2,
      text: () => '📣 El cliente pide a última hora poner su logo en pantalla y pasar un video publicitario.',
      choices: [
        { label: 'Que el director lo haga en vMix', need: (s, ev) => (bestRole(ev, 'dir') && hasCat(ev, 'switcher') ? null : 'Necesitas director y switcher'),
          run: (s, ev) => { const p = bestRole(ev, 'dir'); return p.skill >= 3
            ? { q: 6, msg: `${p.name} lo montó en 2 minutos. ¡El cliente feliz!` }
            : { q: -2, msg: `${p.name} lo hizo, pero el logo quedó mal ubicado.` }; } },
        { label: 'Decir amablemente que no se puede', run: () => ({ q: -4, msg: 'El cliente entendió, pero no le gustó.' }) },
        { label: 'Improvisar como se pueda', run: (s) => (chance(s, 0.4)
          ? { q: 3, msg: 'Salió mejor de lo esperado.' }
          : { q: -8, msg: 'El video se vio sin audio. Momento incómodo.' }) },
      ],
    },
    falla: {
      weight: (s, ev) => 6,
      when: (s, ev) => ev.equip.some((e) => e.condition < BALANCE.worn),
      setup: (s, ev) => ({ eq: pick(s, ev.equip.filter((e) => e.condition < BALANCE.worn)).id }),
      text: (ev, x) => `🛠️ ¡${CATALOG[(ev.equip.find((e) => e.id === x.eq) || { type: 'cam_basic' }).type].name} empezó a fallar! Está muy gastada.`,
      choices: [
        { label: 'Reiniciarla y cruzar los dedos', run: (s) => (chance(s, 0.5)
          ? { q: -2, msg: 'Volvió a funcionar. Uf.' }
          : { q: -14, msg: 'No volvió a prender. Perdiste ese equipo para el resto del evento.' }) },
        { label: 'Darle unos golpecitos', run: (s, ev, x) => {
          const e = s.equip.find((y) => y.id === x.eq);
          if (e) e.condition = clamp(e.condition - 10, 1, 100);
          return chance(s, 0.3) ? { q: -3, msg: '¡Funcionó! Pero quedó más dañada.' } : { q: -12, msg: 'Empeoró. Lección: hay que reparar el equipo.' };
        } },
        { label: 'Apagarla y seguir sin ella', run: () => ({ q: -9, msg: 'Seguiste con lo que quedaba.' }) },
      ],
    },
    epico: {
      weight: () => 2.5,
      when: () => true,
      text: (ev) => (['barrial', 'ligapro', 'final'].includes(ev.contract.type)
        ? '⚽ ¡GOLAZO de media cancha! Es el momento más épico del partido.'
        : '✨ ¡Momento épico! Todos lloran de emoción y tus cámaras lo captaron.'),
      choices: [
        { label: 'Repetición en cámara lenta', need: (s, ev) => (bestRole(ev, 'dir') && hasCat(ev, 'switcher') ? null : 'Necesitas director y switcher'),
          run: () => ({ q: 9, msg: '¡La repetición se volvió viral en redes!' }) },
        { label: 'Hacer zoom al rostro de la gente', need: (s, ev) => (camsOf(ev).length >= 2 ? null : 'Necesitas 2 cámaras o más'),
          run: () => ({ q: 5, msg: 'Toma emotiva. El cliente la va a usar en sus redes.' }) },
        { label: 'Seguir normal', run: () => ({ q: 2, msg: 'Quedó bien grabado.' }) },
      ],
    },
    // Imprevistos que cuestan plata: el monto crece con el tamaño del evento
    permiso: {
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 2,
      setup: (s, ev) => ({ cost: Math.max(50, Math.round(ev.contract.pay * 0.1 / 10) * 10) }),
      text: (ev, x) => `📋 El administrador del local dice que falta un permiso para el cableado y te cobra ${money(x.cost)}.`,
      choices: [
        { label: 'Pagar el permiso', need: (s, ev, x) => (s.money >= x.cost ? null : `No tienes ${money(x.cost)}`),
          run: (s, ev, x) => { s.money -= x.cost; return { q: 0, msg: `Pagaste ${money(x.cost)} y siguieron trabajando tranquilos.` }; } },
        { label: 'Negociar con el administrador', run: (s, ev, x) => {
          if (chance(s, 0.45)) return { q: -2, msg: 'Lo convenciste de dejarlo para otro día.' };
          const half = Math.round(x.cost / 2);
          s.money -= half;
          return { q: -6, msg: `Tardó media hora la discusión y igual pagaste ${money(half)}.` };
        } },
        { label: 'Quitar el cableado y usar menos equipos', run: () => ({ q: -12, msg: 'Desarmaste parte del montaje. La transmisión perdió calidad.' }) },
      ],
    },
    transporte: {
      weight: (s, ev) => 1 + ev.contract.diff * 0.4,
      when: (s, ev) => ev.contract.diff >= 3,
      setup: (s, ev) => ({ cost: Math.max(80, Math.round(ev.contract.pay * 0.08 / 10) * 10) }),
      text: () => '🚐 El carro con los equipos se quedó varado en el tráfico y falta poco para empezar.',
      choices: [
        { label: 'Pagar un flete urgente', need: (s, ev, x) => (s.money >= x.cost ? null : `No tienes ${money(x.cost)}`),
          run: (s, ev, x) => { s.money -= x.cost; return { q: -2, msg: `El flete llegó a tiempo (${money(x.cost)}).` }; } },
        { label: 'Esperar y montar a la carrera', run: (s) => (chance(s, 0.35)
          ? { q: -4, msg: 'Llegaron justito. Montaron todo en tiempo récord.' }
          : { q: -14, msg: 'Empezaste tarde y sin probar nada. Se notó en la transmisión.' }) },
      ],
    },
    robo: {
      weight: () => 1.2,
      when: (s, ev) => ev.contract.diff >= 3 && ev.equip.some((e) => ['mics', 'encoder', 'internet'].includes(CATALOG[e.type].cat)),
      setup: (s, ev) => ({ eq: pick(s, ev.equip.filter((e) => ['mics', 'encoder', 'internet'].includes(CATALOG[e.type].cat))).id }),
      text: (ev, x) => `🕵️ Entre tanta gente, alguien se llevó tu ${CATALOG[(ev.equip.find((e) => e.id === x.eq) || { type: 'mics' }).type].name}.`,
      choices: [
        { label: 'Avisar a seguridad y seguir', run: (s, ev, x) => {
          if (chance(s, 0.5)) return { q: -3, msg: 'Seguridad lo encontró en la puerta. ¡Lo recuperaste!' };
          s.equip = s.equip.filter((e) => e.id !== x.eq);
          return { q: -6, msg: 'No apareció. Lo perdiste para siempre.' };
        } },
        { label: 'Dejar a alguien cuidando los equipos', run: () => ({ q: -9, msg: 'No te robaron más, pero trabajaste con una persona menos.' }) },
      ],
    },
    // Imprevistos de habilidad: salir bien depende del nivel de tu gente
    senal: {
      weight: () => 2.5,
      when: (s, ev) => ev.contract.stream && ev.contract.diff >= 3,
      text: () => '📶 La plataforma avisa que tu transmisión se está trabando para muchos espectadores.',
      choices: [
        { label: 'Que el técnico de streaming lo arregle', need: (s, ev) => (bestRole(ev, 'stream') ? null : 'No trajiste técnico de streaming'),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'stream'),
            (p) => ({ q: 2, msg: `${p.name} bajó la tasa de bits a tiempo. Casi nadie lo notó.` }),
            (p) => ({ q: -10, msg: `${p.name} probó varias cosas, pero la imagen se congeló varios minutos.` })) },
        { label: 'Reiniciar la transmisión', run: () => ({ q: -9, msg: 'Volviste al aire, pero perdiste espectadores en el corte.' }) },
      ],
    },
    guion: {
      weight: () => 2.5,
      when: (s, ev) => ev.contract.diff >= 3,
      text: () => '📝 El cliente cambió el orden del programa a último momento y nadie avisó a tu equipo.',
      choices: [
        { label: 'Que el director reorganice todo', need: (s, ev) => (bestRole(ev, 'dir') ? null : 'No trajiste director'),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'dir'),
            (p) => ({ q: 3, msg: `${p.name} reorganizó las cámaras al vuelo. ¡Ni se notó!` }),
            (p) => ({ q: -9, msg: `${p.name} se enredó con los cambios y se perdieron varias entradas.` })) },
        { label: 'Seguir el guion original', run: () => ({ q: -8, msg: 'Las cámaras apuntaban al lugar equivocado varias veces.' }) },
      ],
    },
    multitud: {
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 3 && camsOf(ev).length >= 2,
      text: () => '👥 La gente se paró frente a tu cámara principal y tapa todo.',
      choices: [
        { label: 'Que tu mejor camarógrafo busque otro ángulo', need: (s, ev) => (bestRole(ev, 'cam') ? null : 'No hay camarógrafo'),
          run: (s, ev) => skillCheck(s, bestRole(ev, 'cam'),
            (p) => ({ q: 2, msg: `${p.name} se subió a una silla y consiguió una toma mejor.` }),
            (p) => ({ q: -9, msg: `${p.name} no encontró buen ángulo. Media transmisión se vio tapada.` })) },
        { label: 'Pedir a seguridad que despeje', run: (s) => (chance(s, 0.4)
          ? { q: -3, msg: 'Seguridad despejó rápido.' }
          : { q: -10, msg: 'Seguridad tardó muchísimo.' }) },
      ],
    },
    vip: {
      weight: () => 2,
      when: (s, ev) => ev.contract.diff >= 2,
      text: () => '🕴️ Llegó un invitado muy importante y el cliente quiere una toma especial.',
      choices: [
        { label: 'Mandar a tu mejor camarógrafo', run: (s, ev) => {
          const p = bestRole(ev, 'cam');
          if (!p) return { q: -4, msg: 'No había quién.' };
          return { q: (p.skill - 2) * 3, msg: p.skill >= 3 ? `${p.name} consiguió una toma perfecta.` : `${p.name} hizo lo que pudo; la toma quedó regular.` };
        } },
        { label: 'Usar una cámara fija', run: () => ({ q: -2, msg: 'Toma aceptable, pero sin emoción.' }) },
      ],
    },
  };

  /* Prueba de habilidad: cuanto más nivel tiene la persona, más probable que salga bien */
  function skillCheck(s, p, ok, bad) {
    const I = BALANCE.incidents;
    return chance(s, I.skillBase + I.skillPer * p.skill) ? ok(p) : bad(p);
  }

  /* ---------- Evento en vivo ---------- */
  function startEvent(s, contractId, staffIds, equipIds) {
    if (s.currentEvent) return { ok: false, msg: 'Ya hay un evento en curso.' };
    if (s.gameOver) return { ok: false, msg: 'Juego terminado.' };
    const contract = s.contracts.find((c) => c.id === contractId);
    if (!contract) return { ok: false, msg: 'Esa oferta ya no existe.' };
    const staff = s.staff.filter((p) => staffIds.includes(p.id));
    const equip = s.equip.filter((e) => equipIds.includes(e.id));
    if (!staff.length) return { ok: false, msg: 'Lleva al menos una persona.' };
    if (!equip.some((e) => CATALOG[e.type].cat === 'cam')) return { ok: false, msg: 'Lleva al menos una cámara.' };
    const wages = staff.reduce((a, p) => a + eventWage(p, contract.diff), 0);
    const base = computeQuality(s, contract, staff, equip);
    const tutorial = inTutorial(s);
    // Suerte del día: el público, el clima, el lugar... (no en los primeros eventos)
    if (!tutorial && BALANCE.luck) {
      const L = Math.max(0, Math.round(BALANCE.luck[0] + BALANCE.luck[1] * contract.diff));
      const luck = randInt(s, -L, L);
      base.parts.push(['Cómo estuvo el día (suerte)', luck]);
      base.q = clamp(base.q + luck, 0, 100);
    }
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
    };
    // Elegir imprevistos
    const view = { contract: ev.contract, staff, equip };
    const worn = equip.filter((e) => e.condition < BALANCE.worn).length;
    const BI = BALANCE.incidents;
    const nInc = tutorial ? 1
      : clamp(BI.byDiff[contract.diff] + (worn ? 1 : 0) + (chance(s, BI.extraChance) ? 1 : 0), 1, BI.max);
    // En los primeros eventos no hay imprevistos que cuestan plata
    const gentle = ['permiso', 'transporte', 'robo'];
    const pool = Object.keys(INCIDENTS).filter((k) => INCIDENTS[k].when(s, view) && !(tutorial && gentle.includes(k)));
    for (let i = 0; i < nInc && pool.length; i++) {
      const ws = pool.map((k) => INCIDENTS[k].weight(s, view));
      const tot = ws.reduce((a, b) => a + b, 0);
      let r = rnd(s) * tot, idx = pool.length - 1;
      for (let j = 0; j < pool.length; j++) { r -= ws[j]; if (r <= 0) { idx = j; break; } }
      const key = pool.splice(idx, 1)[0];
      const def = INCIDENTS[key];
      ev.incidents.push({ key, x: def.setup ? def.setup(s, view) : {}, done: false, result: null });
    }
    s.contracts = s.contracts.filter((c) => c.id !== contractId);
    s.currentEvent = ev;
    return { ok: true, msg: 'Evento iniciado.' };
  }

  function evView(s) {
    const ev = s.currentEvent;
    return {
      contract: ev.contract,
      staff: s.staff.filter((p) => ev.staffIds.includes(p.id)),
      equip: s.equip.filter((e) => ev.equipIds.includes(e.id)),
    };
  }

  function currentIncident(s) {
    const ev = s.currentEvent;
    if (!ev || ev.step >= ev.incidents.length) return null;
    const inc = ev.incidents[ev.step];
    const def = INCIDENTS[inc.key];
    const view = evView(s);
    return {
      n: ev.step + 1,
      total: ev.incidents.length,
      text: def.text(view, inc.x),
      choices: def.choices.map((c, i) => {
        const why = c.need ? c.need(s, view, inc.x) : null;
        return { i, label: c.label, ok: !why, why };
      }),
    };
  }

  function resolveIncident(s, choiceIndex) {
    const ev = s.currentEvent;
    if (!ev || ev.step >= ev.incidents.length) return { ok: false, msg: 'No hay imprevisto.' };
    const inc = ev.incidents[ev.step];
    const def = INCIDENTS[inc.key];
    const ch = def.choices[choiceIndex];
    if (!ch) return { ok: false, msg: 'Opción inválida.' };
    const view = evView(s);
    const why = ch.need ? ch.need(s, view, inc.x) : null;
    if (why) return { ok: false, msg: why };
    const r = ch.run(s, view, inc.x);
    // En eventos grandes los errores pesan más (salvo en los primeros eventos)
    if (r.q < 0 && !ev.tutorial) r.q = Math.round(r.q * (1 + BALANCE.incidents.severityPerDiff * (ev.contract.diff - 1)));
    inc.done = true;
    inc.result = r;
    ev.deltas.push(r.q);
    ev.step++;
    return { ok: true, q: r.q, msg: r.msg };
  }

  function finishEvent(s) {
    const ev = s.currentEvent;
    if (!ev) return { ok: false, msg: 'No hay evento.' };
    if (ev.step < ev.incidents.length) return { ok: false, msg: 'Faltan imprevistos por resolver.' };
    const c = ev.contract;
    const t = EVENT_TYPES[c.type];
    const quality = clamp(ev.base + ev.deltas.reduce((a, b) => a + b, 0), 0, 100);
    const B = BALANCE.stars;
    const stars = quality >= B[0] ? 5 : quality >= B[1] ? 4 : quality >= B[2] ? 3 : quality >= B[3] ? 2 : 1;
    const pay = Math.round(c.pay * STARS_PAY[stars]);
    const repRaw = STARS_REP[stars] * (0.5 + c.diff * 0.15);
    // Cuanta más fama tienes, más cuesta seguir subiendo
    let repDelta = Math.round(repRaw > 0 ? repRaw * (1 - s.rep / 130) : repRaw);
    // Contrato disputado: ganas el duelo solo si tu calidad final supera la de MegaVisión
    let duel = null, rivalQuality = null;
    if (c.rival) {
      rivalQuality = typeof c.rivalQuality === 'number' ? c.rivalQuality : rivalQualityFor(s, c);
      if (quality > rivalQuality) { duel = 'won'; repDelta += BALANCE.rival.winRep; }
      else { duel = 'lost'; repDelta -= BALANCE.rival.loseRep; }
    }
    // Algunos clientes pagan la mitad ahora y el resto unos días después
    const LP = BALANCE.latePay;
    let payNow = pay, payLater = 0;
    if (!ev.tutorial && !c.story && c.diff >= LP.minDiff && pay > 0 && chance(s, LP.chance)) {
      payLater = Math.round(pay * (1 - LP.share));
      payNow = pay - payLater;
      s.pending = s.pending || [];
      s.pending.push({ day: s.day + LP.days, amount: payLater, client: c.client });
    }
    s.money += payNow - ev.wages;
    s.rep = clamp(s.rep + repDelta, 0, 100);
    s.lastWorkDay = s.day + 1; // el evento ocupa el día
    // Desgaste de equipos (más en eventos grandes), experiencia y moral del personal
    const view = evView(s);
    const W = BALANCE.wear;
    view.equip.forEach((e) => { e.condition = clamp(e.condition - randInt(s, W.min + c.diff * W.perDiffMin, W.max + c.diff * W.perDiffMax), 1, 100); });
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
        ups.push(p.owner ? `${p.name} subió a habilidad ${p.skill}` : `${p.name} subió a habilidad ${p.skill} y ahora cobra ${money(p.wage)}`);
      }
    });
    s.stats.events++;
    if (stars === 5) s.stats.fiveStars++;
    s.stats.earned += pay;
    s.stats.best[c.type] = Math.max(s.stats.best[c.type] || 0, stars);
    s.stats.good = s.stats.good || {};
    if (stars >= 4) s.stats.good[c.type] = (s.stats.good[c.type] || 0) + 1;
    s.stats.duels = s.stats.duels || { won: 0, lost: 0 };
    if (duel === 'won') s.stats.duels.won++;
    if (duel === 'lost') s.stats.duels.lost++;
    s.chapterStats = s.chapterStats || { good: {}, duels: 0 };
    if (stars >= 4) s.chapterStats.good[c.type] = (s.chapterStats.good[c.type] || 0) + 1;
    if (duel === 'won') s.chapterStats.duels++;
    const result = {
      title: `${t.icon} ${t.name} · ${c.client}`,
      quality, stars, pay, wages: ev.wages, net: pay - ev.wages, repDelta, ups,
      rival: !!c.rival, duel, // duel: 'won' | 'lost' | null
      rivalQuality, // calidad de MegaVisión en un contrato disputado (o null)
      payNow, payLater, payLaterDays: payLater ? LP.days : 0, // cobro en dos partes
      dailyCost: dailyCost(s),
      base: ev.base, parts: ev.parts,
      incidents: ev.incidents.map((i) => ({ text: INCIDENTS[i.key].text(view, i.x), result: i.result })),
    };
    log(s, `${'⭐'.repeat(stars)} ${t.name} para ${c.client}: cobraste ${money(payNow)}${payLater ? ` (y ${money(payLater)} en ${LP.days} días)` : ''}, sueldos ${money(ev.wages)}, fama ${repDelta >= 0 ? '+' : ''}${repDelta}.`);
    if (payLater) log(s, `🧾 ${c.client} pagó la mitad y dice que el resto llega en ${LP.days} días.`);
    ups.forEach((u) => log(s, `📈 ${u}.`));
    if (duel === 'won') log(s, `⚔️ ¡Duelo ganado contra MegaVisión! Tu calidad ${quality} contra ${rivalQuality} de ellos (+${BALANCE.rival.winRep} de fama extra). ${pick(s, TAUNTS.duelWin)}`);
    if (duel === 'lost') log(s, `⚔️ MegaVisión ganó el duelo: su calidad ${rivalQuality} contra tu ${quality} (-${BALANCE.rival.loseRep} de fama extra). ${pick(s, TAUNTS.duelLose)}`);
    storyMilestone(s, c.type, stars, duel);
    s.currentEvent = null;
    s.lastResult = result;
    nextDay(s);
    result.chapterDone = checkChapter(s);
    return { ok: true, result };
  }

  /* ---------- Historia ---------- */
  function checkChapter(s) {
    if (s.storyDone) return null;
    const ch = CHAPTERS[s.chapter];
    if (!ch || !ch.check(s)) return null;
    s.money += ch.reward;
    log(s, `🏅 ¡${ch.title} completado! ${ch.done}`);
    const done = { title: ch.title, text: ch.done, reward: ch.reward };
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
      if (stars >= 4 && g === 1) log(s, 'Lucía Mena: "¡Excelente trabajo! Uno más así y te recomiendo con todas las marcas."');
      else if (stars < 4) log(s, 'Lucía Mena: "Estuvo regular. El próximo tiene que salir mejor."');
    }
    if (s.chapter === 3 && duel === 'won' && duelsWon(s) === 1) {
      log(s, 'Don Ramiro: "Primera victoria contra MegaVisión. Sigue así, junta plata y fama, que el estadio te espera."');
    }
    if (s.chapter === 4 && type === 'ligapro') {
      if (stars >= 4 && g === 1) log(s, 'Don Aurelio: "Buen partido. Si el próximo sale igual, la final es tuya."');
      else if (stars < 4) log(s, 'Don Aurelio: "Así no, joven. La hinchada se quejó en redes."');
    }
    if (s.chapter === 5 && type === 'final' && stars < 5) {
      log(s, 'Don Ramiro: "Casi, mijo. Habrá otra final en unos días. Repara el equipo y descansa al personal."');
    }
  }

  /* ---------- Guardar / cargar ---------- */
  function serialize(s) { return JSON.stringify(s); }
  function deserialize(str) {
    try {
      const s = JSON.parse(str);
      if (!s || !(s.v === 1 || s.v === SAVE_VERSION) || !Array.isArray(s.staff)) return null;
      // Rellenar campos nuevos en partidas guardadas antes
      s.stats = s.stats || { events: 0, fiveStars: 0, earned: 0, best: {} };
      s.stats.best = s.stats.best || {};
      if (!s.stats.good) {
        s.stats.good = {};
        Object.keys(s.stats.best).forEach((k) => { if (s.stats.best[k] >= 4) s.stats.good[k] = 1; });
      }
      s.stats.duels = s.stats.duels || { won: 0, lost: 0 };
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
      s.v = SAVE_VERSION;
      return s;
    } catch (e) { return null; }
  }

  const API = {
    ROLES, CATALOG, CONSUMABLES, EVENT_TYPES, CHAPTERS, INCIDENTS,
    newGame, addContract, marketing, refreshCandidates, hire, fire, searchStaff,
    buy, buyConsumable, repair, sell, repairCost, sellPrice, nextDay,
    computeQuality, suggestLoadout, startEvent, currentIncident, resolveIncident, finishEvent,
    checkChapter, countCat, serialize, deserialize, money,
    BALANCE, dailyCost, dailyCostBreakdown, eventWage, rivalQualityFor, SAVE_VERSION,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Game = API;
})(typeof window !== 'undefined' ? window : globalThis);
