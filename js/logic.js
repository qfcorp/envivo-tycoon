/* =========================================================
   EN VIVO Tycoon — Lógica del juego
   Este archivo NO toca la pantalla. Solo reglas y datos.
   Se puede probar con Node:  node tests/test_logic.js
   ========================================================= */
(function (root) {
  'use strict';

  const SAVE_VERSION = 1;

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
    ligapro:     { name: 'Partido de LigaPro',       icon: '🏟️', cams: [4, 4], audio: true,  stream: 1,   outdoor: 1,   diff: 4, pay: [2600, 4500],  minRep: 40,
                   clients: ['Club Atlético del Valle', 'Deportivo Cumbayá FC', 'Sporting Pichincha'] },
    final:       { name: 'Final de campeonato',      icon: '🏆', cams: [5, 6], audio: true,  stream: 1,   outdoor: 1,   diff: 5, pay: [6000, 10000], minRep: 65,
                   clients: ['Liga Nacional de Fútbol', 'Federación del Torneo'] },
  };

  const FIRST_NAMES = ['Kevin', 'Andrea', 'Luis', 'María José', 'Bryan', 'Gaby', 'Carlos', 'Daniela', 'Jonathan', 'Paola',
    'Stalin', 'Mishell', 'Fernando', 'Karla', 'Diego', 'Tania', 'Wilson', 'Jessica', 'Alex', 'Vane'];
  const LAST_NAMES = ['Guamán', 'Chiluisa', 'Pazmiño', 'Andrade', 'Toapanta', 'Morales', 'Cedeño', 'Quishpe',
    'Zambrano', 'Villacís', 'Tenorio', 'Ortiz', 'Lema', 'Salazar'];

  const STARS_PAY = [0, 0.4, 0.7, 1.0, 1.1, 1.25];
  const STARS_REP = [0, -5, -0.5, 2, 4, 6];

  /* ---------- Historia (capítulos) ---------- */
  const CHAPTERS = [
    {
      title: 'Capítulo 1 · El garaje',
      intro: 'Don Ramiro, tu antiguo jefe en el canal, se jubiló y te regaló su vieja cámara: "Con esto empecé yo. Ahora te toca a ti." Tienes un garaje, una cámara y muchas ganas.',
      goal: 'Completa 3 eventos',
      check: (s) => s.stats.events >= 3,
      progress: (s) => `${Math.min(s.stats.events, 3)}/3 eventos`,
      reward: 400,
      done: '"¡Así se empieza!", te escribe Don Ramiro, y te manda $400 para que sigas creciendo.',
    },
    {
      title: 'Capítulo 2 · Armando el equipo',
      intro: 'Solo no vas a llegar lejos. Necesitas gente de confianza y más equipo para cubrir eventos con varias cámaras.',
      goal: 'Ten 2 cámaras, 2 personas contratadas y 12 de fama',
      check: (s) => countCat(s, 'cam') >= 2 && s.staff.length >= 3 && s.rep >= 12,
      progress: (s) => `Cámaras ${Math.min(countCat(s, 'cam'), 2)}/2 · Personal ${Math.min(s.staff.length - 1, 2)}/2 · Fama ${Math.min(Math.floor(s.rep), 12)}/12`,
      reward: 800,
      done: 'Tu productora ya parece una empresa de verdad. Un amigo te recomienda con una marca grande: +$800 de adelanto.',
    },
    {
      title: 'Capítulo 3 · El gran lanzamiento',
      intro: 'Una marca busca productora para el lanzamiento de su nuevo producto. Habrá prensa e influencers. Es tu oportunidad de jugar en grande.',
      goal: 'Cubre un "Lanzamiento de marca" con 4 estrellas o más',
      target: 'lanzamiento',
      check: (s) => (s.stats.best.lanzamiento || 0) >= 4,
      progress: (s) => `Mejor resultado: ${s.stats.best.lanzamiento || 0}⭐ de 4⭐`,
      reward: 1500,
      done: 'El video del lanzamiento se hizo viral. Te llueven mensajes: +$1.500 de bono del cliente.',
    },
    {
      title: 'Capítulo 4 · La rival',
      intro: 'MegaVisión, la productora más grande de la ciudad, se enteró de ti. Empiezan a robarte clientes con precios más bajos. Tienes que ganarte un nombre.',
      goal: 'Llega a 40 de fama y junta $10.000',
      check: (s) => s.rep >= 40 && s.money >= 10000,
      progress: (s) => `Fama ${Math.min(Math.floor(s.rep), 40)}/40 · Dinero ${money(Math.min(s.money, 10000))}/$10.000`,
      reward: 2000,
      done: 'Un club de LigaPro quedó mal con MegaVisión: se les cayó la transmisión en pleno partido. Te llaman a ti. +$2.000 para prepararte.',
    },
    {
      title: 'Capítulo 5 · Al estadio',
      intro: 'Transmitir fútbol profesional es otra liga: 4 cámaras, gráficos, repeticiones y miles de personas mirando en vivo.',
      goal: 'Transmite un "Partido de LigaPro" con 4 estrellas o más',
      target: 'ligapro',
      check: (s) => (s.stats.best.ligapro || 0) >= 4,
      progress: (s) => `Mejor resultado: ${s.stats.best.ligapro || 0}⭐ de 4⭐`,
      reward: 3000,
      done: 'Los dirigentes quedaron felices. Te ofrecen la gran final: +$3.000 de adelanto.',
    },
    {
      title: 'Capítulo 6 · La final',
      intro: 'La final del campeonato. Todo el país estará mirando y MegaVisión hará lo imposible por verte fallar. Don Ramiro estará en primera fila.',
      goal: 'Transmite una "Final de campeonato" con 5 estrellas',
      target: 'final',
      check: (s) => (s.stats.best.final || 0) >= 5,
      progress: (s) => `Mejor resultado: ${s.stats.best.final || 0}⭐ de 5⭐`,
      reward: 5000,
      done: '¡Transmisión perfecta! Don Ramiro te abraza: "Ya no eres mi alumno, eres el mejor." Ganaste el modo historia. Puedes seguir jugando libre.',
    },
  ];

  /* ---------- Ayudantes ---------- */
  function countCat(s, cat) { return s.equip.filter((e) => CATALOG[e.type].cat === cat).length; }
  function nextId(s) { s.idc = (s.idc || 0) + 1; return s.idc; }
  function log(s, text) {
    s.log.unshift({ day: s.day, text });
    if (s.log.length > 80) s.log.length = 80;
  }
  function staffName(s) { return pick(s, FIRST_NAMES) + ' ' + pick(s, LAST_NAMES); }
  function repairCost(e) { return Math.round(CATALOG[e.type].price * 0.4 * (100 - e.condition) / 100); }
  function sellPrice(e) { return Math.round(CATALOG[e.type].price * 0.4 * e.condition / 100); }

  /* ---------- Juego nuevo ---------- */
  function newGame(seed) {
    const s = {
      v: SAVE_VERSION,
      seed: (seed === undefined ? Date.now() : seed) | 0,
      idc: 0,
      day: 1,
      money: 1500,
      rep: 5,
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
      stats: { events: 0, fiveStars: 0, earned: 0, best: {} },
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
    return Object.keys(EVENT_TYPES).filter((k) => EVENT_TYPES[k].minRep <= s.rep);
  }

  function addContract(s, typeKey, payBoost) {
    if (s.contracts.length >= 7) return null;
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
      pay: Math.round(randInt(s, t.pay[0], t.pay[1]) * (1 + s.rep / 250) * (payBoost || 1) / 10) * 10,
      daysLeft: randInt(s, 2, 4),
    };
    s.contracts.push(c);
    return c;
  }

  /* Acciones para conseguir clientes */
  function marketing(s, kind) {
    if (s.currentEvent || s.gameOver) return { ok: false, msg: 'Ahora no se puede.' };
    if (kind === 'redes') {
      if (s.daily.redes >= 1) return { ok: false, msg: 'Ya publicaste hoy. Intenta mañana.' };
      if (s.money < 40) return { ok: false, msg: 'No tienes $40.' };
      if (s.contracts.length >= 7) return { ok: false, msg: 'Ya tienes demasiadas ofertas pendientes.' };
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
        wage: 15 + skill * 15 + randInt(s, 0, 10),
        morale: 80,
        events: 0,
      });
    }
  }

  function hire(s, candId) {
    const i = s.candidates.findIndex((c) => c.id === candId);
    if (i < 0) return { ok: false, msg: 'Esa persona ya no está disponible.' };
    const c = s.candidates[i];
    const fee = c.wage * 2;
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
    const rent = 20 + 4 * (s.staff.length - 1);
    s.money -= rent;
    // Ofertas que vencen
    s.contracts.forEach((c) => { c.daysLeft--; });
    const expired = s.contracts.filter((c) => c.daysLeft <= 0);
    if (expired.length) log(s, `Se vencieron ${expired.length} oferta(s) que no tomaste.`);
    s.contracts = s.contracts.filter((c) => c.daysLeft > 0);
    // Nuevas ofertas según la fama
    const n = randInt(s, 0, 1) + (s.rep >= 25 ? 1 : 0) + (s.contracts.length < 2 ? 1 : 0);
    for (let i = 0; i < n; i++) addContract(s);
    // Si el capítulo pide un evento especial, que aparezca
    const ch = CHAPTERS[s.chapter];
    if (ch && ch.target && !s.storyDone && EVENT_TYPES[ch.target].minRep <= s.rep &&
        !s.contracts.some((c) => c.type === ch.target) && chance(s, 0.5)) {
      addContract(s, ch.target);
    }
    // La rival roba clientes (desde el capítulo 4)
    if (s.chapter >= 3 && s.contracts.length > 1 && chance(s, 0.15)) {
      const i = randInt(s, 0, s.contracts.length - 1);
      const c = s.contracts[i];
      s.contracts.splice(i, 1);
      log(s, `😠 MegaVisión le ofreció un precio más bajo a ${c.client} y te quitó el contrato.`);
    }
    // Moral y renuncias
    s.staff.forEach((p) => { if (!p.owner) p.morale = clamp(p.morale + (p.morale < 60 ? 2 : 0), 0, 100); });
    const quitter = s.staff.find((p) => !p.owner && p.morale < 20 && chance(s, 0.4));
    if (quitter) {
      s.staff = s.staff.filter((p) => p !== quitter);
      log(s, `💔 ${quitter.name} renunció porque estaba desmotivado/a.`);
    }
    if (s.day % 3 === 1) refreshCandidates(s);
    if (s.money < -300) {
      s.gameOver = true;
      log(s, '💸 Quebraste: las deudas superaron los $300.');
    }
  }

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
      if (d && sw) pts = d * 2 + sw * 2;
      else if (sw) pts = 0;
      else pts = -(6 + contract.diff * 3);
      parts.push([d && sw ? 'Director con switcher' : sw ? 'Switcher sin director' : 'Sin switcher para mezclar cámaras', pts]);
      q += pts;
    }
    if (contract.audio) {
      const a = best('audio');
      const cons = equip.filter((e) => CATALOG[e.type].cat === 'audio').reduce((m, e) => Math.max(m, CATALOG[e.type].q), 0);
      let pts;
      if (cons && a) pts = 4 + a * 1.5 + cons * 2;
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
      if (canSend && t) pts = 6 + t * 1.5 + (has('encoder') ? 2 : 0);
      else if (canSend) pts = 3;
      else pts = -(8 + contract.diff * 4);
      parts.push([canSend ? (t ? 'Técnico de streaming con equipo' : 'Equipo de streaming sin técnico') : 'Sin equipo para transmitir', Math.round(pts)]);
      q += pts;
    }
    const avgSkill = staff.length ? staff.reduce((a, p) => a + p.skill, 0) / staff.length : 0;
    const sk = Math.round(avgSkill * 2);
    parts.push(['Experiencia del equipo', sk]); q += sk;
    const dp = -(contract.diff * 4 + Math.max(0, contract.diff - 3) * 4);
    parts.push([`Dificultad del evento (${contract.diff})`, dp]); q += dp;
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
      when: (s, ev) => ev.equip.some((e) => e.condition < 40),
      setup: (s, ev) => ({ eq: pick(s, ev.equip.filter((e) => e.condition < 40)).id }),
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
    const wages = staff.reduce((a, p) => a + p.wage, 0);
    const base = computeQuality(s, contract, staff, equip);
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
    };
    // Elegir imprevistos
    const view = { contract: ev.contract, staff, equip };
    const worn = equip.filter((e) => e.condition < 40).length;
    const nInc = clamp(1 + Math.floor(contract.diff / 2) + (worn ? 1 : 0) + (chance(s, 0.3) ? 1 : 0), 1, 4);
    const pool = Object.keys(INCIDENTS).filter((k) => INCIDENTS[k].when(s, view));
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
    const stars = quality >= 85 ? 5 : quality >= 70 ? 4 : quality >= 55 ? 3 : quality >= 40 ? 2 : 1;
    const pay = Math.round(c.pay * STARS_PAY[stars]);
    const repRaw = STARS_REP[stars] * (0.5 + c.diff * 0.15);
    // Cuanta más fama tienes, más cuesta seguir subiendo
    const repDelta = Math.round(repRaw > 0 ? repRaw * (1 - s.rep / 130) : repRaw);
    s.money += pay - ev.wages;
    s.rep = clamp(s.rep + repDelta, 0, 100);
    // Desgaste de equipos, experiencia y moral del personal
    const view = evView(s);
    view.equip.forEach((e) => { e.condition = clamp(e.condition - randInt(s, 3, 6 + c.diff * 2), 1, 100); });
    const ups = [];
    view.staff.forEach((p) => {
      p.events++;
      if (!p.owner) p.morale = clamp(p.morale + (stars >= 4 ? 6 : stars <= 2 ? -10 : 1), 0, 100);
      if (p.skill < 5 && p.events % (3 + p.skill * 2) === 0) {
        p.skill++;
        if (!p.owner) p.wage += 12;
        ups.push(`${p.name} subió a habilidad ${p.skill}`);
      }
    });
    s.stats.events++;
    if (stars === 5) s.stats.fiveStars++;
    s.stats.earned += pay;
    s.stats.best[c.type] = Math.max(s.stats.best[c.type] || 0, stars);
    const result = {
      title: `${t.icon} ${t.name} — ${c.client}`,
      quality, stars, pay, wages: ev.wages, net: pay - ev.wages, repDelta, ups,
      base: ev.base, parts: ev.parts,
      incidents: ev.incidents.map((i) => ({ text: INCIDENTS[i.key].text(view, i.x), result: i.result })),
    };
    log(s, `${'⭐'.repeat(stars)} ${t.name} para ${c.client}: cobraste ${money(pay)}, sueldos ${money(ev.wages)}, fama ${repDelta >= 0 ? '+' : ''}${repDelta}.`);
    ups.forEach((u) => log(s, `📈 ${u}.`));
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
    else s.chapter++;
    return done;
  }

  /* ---------- Guardar / cargar ---------- */
  function serialize(s) { return JSON.stringify(s); }
  function deserialize(str) {
    try {
      const s = JSON.parse(str);
      if (!s || s.v !== SAVE_VERSION || !Array.isArray(s.staff)) return null;
      return s;
    } catch (e) { return null; }
  }

  const API = {
    ROLES, CATALOG, CONSUMABLES, EVENT_TYPES, CHAPTERS, INCIDENTS,
    newGame, addContract, marketing, refreshCandidates, hire, fire, searchStaff,
    buy, buyConsumable, repair, sell, repairCost, sellPrice, nextDay,
    computeQuality, suggestLoadout, startEvent, currentIncident, resolveIncident, finishEvent,
    checkChapter, countCat, serialize, deserialize, money,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Game = API;
})(typeof window !== 'undefined' ? window : globalThis);
