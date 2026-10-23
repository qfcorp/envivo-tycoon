/* =========================================================
   EN VIVO Tycoon — Logros y Libro de combos (estilo Game Dev Tycoon / TV Studio Story)
   - 44 logros en tres niveles (bronce, plata, oro): eventos cubiertos, 5 estrellas, dominio de cada tipo de evento,
     personal, equipos y categorías, nivel de sede, capítulos, fechas especiales, dinero cobrado, rachas sin imprevistos
     que resten, eventos internacionales, duelos, Liga Semanal y combos. Cada uno da un premio chico y fijo (dinero del
     juego, repuestos o materiales de sede; nunca créditos) y una insignia. Se reclaman desde la lista.
   - Libro de combos: por cada tipo de evento, el mejor resultado (estrellas, calidad, personal y cámaras con que se
     logró) y los "combos" = tipo de evento + equipo clave (boxeo + PTZ, concierto + grúa, final + unidad móvil…) que se
     anotan la primera vez que se logran con 4 estrellas o más. Una fila completa (5 estrellas + todos sus combos) da premio.
   - Aviso "¡Logro desbloqueado!": nunca durante el evento en vivo. Se anota en el resultado (result.extras) y el toast
     sale cuando ya no hay ninguna ventana abierta.
   - Partidas viejas: la primera vez se calcula lo que ya se tenía y se entrega en silencio; sale un solo aviso
     "Tienes N logros para reclamar".
   - Extensión de la lógica (Game.registrarExtension): migrar, alNuevoDia, alTerminarEvento. Estado en s.logros.
     Los intentos en línea no aplican extensiones. Todo determinista: sin azar ni reloj (solo s.day).
   - Pantalla: fila de Inicio (window.EnVivoInicio, id 'logros', orden 20) y ventana con pestañas Logros / Combos.
     Ver server/INTEGRAR_LOGROS.md.
   ========================================================= */
(function (root) {
  'use strict';
  const G = root.Game || (typeof require === 'function' ? require('./logic.js') : null);
  if (!G || typeof G.registrarExtension !== 'function') return;

  /* ---------- Premios (fijos) ---------- */
  const MATS5 = ['cables', 'placas', 'paneles', 'credenciales', 'planos'];
  const AJUSTE = {
    premio: {
      bronce: (i) => ({ dinero: 250, stock: { cable: 2 } }),
      plata: (i) => ({ dinero: 900, mat: { [MATS5[i % 5]]: 8 } }),
      oro: (i) => ({ dinero: 3000, mat: { [MATS5[i % 5]]: 12, chips: 2 }, stock: { battery: 2 } }),
      fila: (i) => ({ dinero: 600, mat: { [MATS5[i % 5]]: 5 } }),
    },
    // Sin sede local (o con la sede oficial del servidor) los materiales se pagan en dinero del juego
    matDinero: { cables: 20, placas: 20, paneles: 20, credenciales: 20, planos: 20, chips: 120 },
    estrellasCombo: 4,
  };

  /* ---------- Logros ----------
     g: dibujo de la insignia · val(s, L) → número · meta. Desbloqueado cuando val >= meta. */
  const st = (s) => s.stats || {};
  const best = (s) => st(s).best || {};
  const cinco = (s, tipos) => tipos.filter((k) => (best(s)[k] || 0) >= 5).length;
  const noDuenio = (s) => (s.staff || []).filter((p) => p && !p.owner);
  const propios = (s) => (s.equip || []).filter((e) => e && G.CATALOG[e.type] && !G.CATALOG[e.type].alquiler);
  const catsDe = (s) => new Set(propios(s).map((e) => G.CATALOG[e.type].cat)).size;
  const nCats = () => new Set(Object.keys(G.CATALOG).filter((k) => !G.CATALOG[k].alquiler).map((k) => G.CATALOG[k].cat)).size;
  const capitulo = (s) => (s.storyDone ? 99 : Number(s.chapter) || 0);
  const trofeos = (s) => (s.temporada && Array.isArray(s.temporada.trofeos) ? s.temporada.trofeos : []);
  const TIPOS_FIJOS = ['misa', 'funeral', 'boda', 'prensa', 'irl', 'barrial', 'graduacion', 'lucha_libre', 'lanzamiento', 'boxeo',
    'lanzamiento_autos', 'concierto', 'ligapro', 'final'];
  const DOM = {
    dom_iglesia: ['misa', 'funeral'], dom_social: ['boda', 'graduacion'], dom_calle: ['prensa', 'irl', 'barrial'],
    dom_ring: ['boxeo', 'lucha_libre'], dom_marca: ['lanzamiento', 'lanzamiento_autos'], dom_escenario: ['concierto'],
    dom_estadio: ['ligapro', 'final'], dom_todo: TIPOS_FIJOS,
  };
  const L_ = (id, tier, g, d, meta, val, p) => ({ id, tier, g, d, meta, val, p: p || null });
  const LOGROS = [
    L_('ev_10', 'bronce', 'claqueta', 'd_eventos', 10, (s) => st(s).events || 0),
    L_('ev_50', 'plata', 'claqueta', 'd_eventos', 50, (s) => st(s).events || 0),
    L_('ev_200', 'oro', 'claqueta', 'd_eventos', 200, (s) => st(s).events || 0),
    L_('cinco_1', 'bronce', 'estrella', 'd_cinco1', 1, (s) => st(s).fiveStars || 0),
    L_('cinco_10', 'plata', 'estrella', 'd_cinco', 10, (s) => st(s).fiveStars || 0),
    L_('cinco_50', 'oro', 'estrella', 'd_cinco', 50, (s) => st(s).fiveStars || 0),
  ];
  [['dom_iglesia', 'bronce'], ['dom_social', 'bronce'], ['dom_calle', 'bronce'], ['dom_ring', 'plata'], ['dom_marca', 'plata'],
    ['dom_escenario', 'plata'], ['dom_estadio', 'oro'], ['dom_todo', 'oro']].forEach(([id, tier]) => {
    LOGROS.push(L_(id, tier, 'corona', id === 'dom_todo' ? 'd_dom_todo' : 'd_dom', DOM[id].length, (s) => cinco(s, DOM[id]), { tipos: DOM[id] }));
  });
  LOGROS.push(
    L_('staff_3', 'bronce', 'persona', 'd_staff', 3, (s) => noDuenio(s).length),
    L_('staff_10', 'plata', 'persona', 'd_staff', 10, (s) => noDuenio(s).length),
    L_('senior_1', 'bronce', 'persona', 'd_senior', 1, (s) => noDuenio(s).filter((p) => p.tier === 'senior' || p.tier === 'internacional').length),
    L_('intl_staff', 'oro', 'persona', 'd_intl_staff', 1, (s) => noDuenio(s).filter((p) => p.tier === 'internacional').length),
    L_('eq_10', 'bronce', 'caja', 'd_eq', 10, (s) => propios(s).length),
    L_('cat_8', 'bronce', 'caja', 'd_cat', 8, catsDe),
    L_('cat_14', 'plata', 'caja', 'd_cat', 14, catsDe),
    L_('cat_todas', 'oro', 'caja', 'd_cat', nCats(), catsDe),
    L_('ob_propia', 'plata', 'camion', 'd_ob', 1, (s) => propios(s).filter((e) => /^ob_/.test(G.CATALOG[e.type].subtipo || '')).length),
    L_('sede_5', 'bronce', 'edificio', 'd_sede', 5, (s) => (s.sede && Number(s.sede.nivel)) || 0),
    L_('sede_10', 'plata', 'edificio', 'd_sede', 10, (s) => (s.sede && Number(s.sede.nivel)) || 0),
    L_('sede_20', 'oro', 'edificio', 'd_sede', 20, (s) => (s.sede && Number(s.sede.nivel)) || 0),
    L_('cap_2', 'bronce', 'bandera', 'd_cap', 2, capitulo),
    L_('cap_4', 'plata', 'bandera', 'd_cap', 4, capitulo),
    L_('historia', 'oro', 'bandera', 'd_historia', 1, (s) => (s.storyDone ? 1 : 0)),
    L_('temp_1', 'bronce', 'calendario', 'd_temp', 1, (s, L) => (L.c.temp || 0)),
    L_('temp_trofeo', 'plata', 'calendario', 'd_trofeo', 1, (s) => trofeos(s).length),
    L_('temp_3', 'oro', 'calendario', 'd_trofeos', 3, (s) => new Set(trofeos(s).map((t) => t && t.key)).size),
    L_('gana_10k', 'bronce', 'moneda', 'd_gana', 10000, (s) => st(s).earned || 0),
    L_('gana_100k', 'plata', 'moneda', 'd_gana', 100000, (s) => st(s).earned || 0),
    L_('gana_1m', 'oro', 'moneda', 'd_gana', 1000000, (s) => st(s).earned || 0),
    L_('limpio_3', 'bronce', 'escudo', 'd_limpio', 3, (s, L) => L.c.rachaMax || 0),
    L_('limpio_10', 'plata', 'escudo', 'd_limpio', 10, (s, L) => L.c.rachaMax || 0),
    L_('limpio_25', 'oro', 'escudo', 'd_limpio', 25, (s, L) => L.c.rachaMax || 0),
    L_('intl_1', 'bronce', 'globo', 'd_intl1', 1, (s) => st(s).intl || 0),
    L_('intl_10', 'plata', 'globo', 'd_intl', 10, (s) => st(s).intl || 0),
    L_('duelo_10', 'plata', 'rayo', 'd_duelo', 10, (s) => (st(s).duels && st(s).duels.won) || 0),
    L_('liga_1', 'bronce', 'copa', 'd_liga', 1, (s) => (s.liga && Array.isArray(s.liga.registro) ? s.liga.registro.length : 0)),
    L_('combo_5', 'plata', 'libro', 'd_combo', 5, (s, L) => Object.keys(L.combos).length),
    L_('combo_15', 'oro', 'libro', 'd_combo', 15, (s, L) => Object.keys(L.combos).length),
  );
  const POR_ID = {};
  LOGROS.forEach((d, i) => { d.i = i; POR_ID[d.id] = d; });

  /* ---------- Libro de combos ----------
     Equipo clave: lista de subtipos (o "categoría:subtipo" cuando el subtipo se repite en otra categoría) */
  const EQUIPO = {
    ptz: { ic: 'cam_basic', sub: ['ptz', 'ptz_broadcast'] },
    encoder: { ic: 'encoder', sub: ['encoder_hw', 'bonding', 'bonding_broadcast'] },
    fluido: { ic: 'grua', sub: ['tripode_fluido'] },
    dron: { ic: 'dron', sub: ['dron', 'dron_cine'] },
    estab: { ic: 'cam_pro', sub: ['gimbal', 'steadicam'] },
    inal: { ic: 'mics', sub: ['mics:inalambrico', 'mics:corbatero'] },
    bonding: { ic: 'encoder', sub: ['bonding', 'bonding_broadcast'] },
    generador: { ic: 'generador', sub: ['generador_portatil'] },
    grua: { ic: 'grua', sub: ['jib', 'grua'] },
    pov: { ic: 'cam_basic', sub: ['pov', 'accion'] },
    gfx3d: { ic: 'switch_basic', sub: ['graphics:cg_3d', 'graphics:cg_ar'] },
    lenta: { ic: 'cam_cine', sub: ['super_lenta', 'ultra_movimiento'] },
    riel: { ic: 'grua', sub: ['dolly', 'riel'] },
    cine: { ic: 'cam_cine', sub: ['cam:cine'] },
    repeticion: { ic: 'switch_pro', sub: ['replay:servidor_medio', 'replay:servidor_broadcast'] },
    aerea: { ic: 'cam_cine', sub: ['camara_aerea_cables'] },
    movil: { ic: 'unidad_movil', sub: ['ob_chica', 'ob_grande', 'ob_uhd', 'ob_alquiler'] },
    cam4k: { ic: 'cam_cine', sub: ['sistema_4k'] },
  };
  const LIBRO = [
    ['misa', ['ptz', 'encoder']], ['funeral', ['fluido']], ['boda', ['dron', 'estab']], ['prensa', ['inal']], ['irl', ['bonding']],
    ['barrial', ['generador']], ['graduacion', ['grua']], ['lucha_libre', ['pov']], ['lanzamiento', ['gfx3d']], ['boxeo', ['ptz', 'lenta']],
    ['lanzamiento_autos', ['dron', 'riel']], ['concierto', ['grua', 'cine']], ['ligapro', ['repeticion', 'aerea']], ['final', ['movil', 'lenta']],
    ['internacional_unilateral', ['bonding']], ['internacional_host', ['cam4k']],
  ].map(([tipo, eqs], i) => ({ tipo, i, combos: eqs.map((eq) => ({ id: tipo + '.' + eq, tipo, eq })) }));
  const COMBOS = [];
  LIBRO.forEach((f) => f.combos.forEach((c) => COMBOS.push(c)));
  const COMBO = {};
  COMBOS.forEach((c) => { COMBO[c.id] = c; });

  /* ---------- Textos (10 idiomas) ---------- */
  const TRAD = {
    es: {
      tit: 'Logros', h_resumen: '{n}/{m} · {c} combos', tab_logros: 'Logros', tab_combos: 'Libro de combos', ver: 'Ver logros',
      reclamar: 'Reclamar', reclamar_todo: 'Reclamar todo ({n})', reclamado: 'Reclamado', por_reclamar: '{n} por reclamar',
      toast_uno: '¡Logro desbloqueado! {nombre}', toast_varios: '¡{n} logros desbloqueados!', toast_resumen: 'Tienes {n} logros para reclamar',
      toast_combo: '¡Combo nuevo en el libro! {nombre}', res: '¡Logro desbloqueado! {nombre}', res_combo: 'Combo nuevo en el libro: {nombre}', res_mas: 'Y {n} logros más',
      ok_reclamo: 'Reclamaste: {premio}', ok_todo: 'Reclamaste {n} premios', no_listo: 'Todavía no lo consigues', ya: 'Ya lo reclamaste', no_hay: 'No existe',
      t_bronce: 'Bronce', t_plata: 'Plata', t_oro: 'Oro', resumen_modal: '{n}/{m} logros · {c}/{k} combos', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Sin jugar', mejor: 'Mejor: {q}/100 · día {d}', armado: '{p} personas · {c}/{t} cámaras', con_cam: 'Cámara: {cam}', viejo: 'Récord de antes',
      pista: 'Pista: {equipo}', secreto: 'Cubre este evento para ver la pista', fila_ok: 'Fila completa', fila_premio: 'Fila completa: {premio}',
      fila_falta: '5 estrellas y todos sus combos: {premio}', combos_info: 'Un combo se anota la primera vez que cubres el evento con su equipo clave y logras 4 estrellas o más.',
      log_reclamo: 'Premio de logro: {nombre} ({premio})', log_fila: 'Premio del libro de combos: {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (por materiales)',
      n_ev_10: 'Primeras transmisiones', n_ev_50: 'Productora curtida', n_ev_200: 'Maratón en vivo', n_cinco_1: 'Cinco estrellas', n_cinco_10: 'Racha dorada',
      n_cinco_50: 'Leyenda del aire', n_dom_iglesia: 'Paz y silencio', n_dom_social: 'Días inolvidables', n_dom_calle: 'Reportero de calle', n_dom_ring: 'Rey del ring',
      n_dom_marca: 'Lanzamiento perfecto', n_dom_escenario: 'Sold out', n_dom_estadio: 'Estadio lleno', n_dom_todo: 'Maestro de todo', n_staff_3: 'Primer equipo',
      n_staff_10: 'Gran plantilla', n_senior_1: 'Talento senior', n_intl_staff: 'Nivel internacional', n_eq_10: 'Bodega llena', n_cat_8: 'Todoterreno',
      n_cat_14: 'Kit completo', n_cat_todas: 'Catálogo entero', n_ob_propia: 'Sobre ruedas', n_sede_5: 'Obra en marcha', n_sede_10: 'Sede moderna',
      n_sede_20: 'Cuartel general', n_cap_2: 'La historia sigue', n_cap_4: 'Rival a la vista', n_historia: 'Historia completa', n_temp_1: 'Fecha especial',
      n_temp_trofeo: 'Trofeo de temporada', n_temp_3: 'Todo el calendario', n_gana_10k: 'Primeros miles', n_gana_100k: 'Caja fuerte', n_gana_1m: 'Millonario',
      n_limpio_3: 'Sin sustos', n_limpio_10: 'Mano firme', n_limpio_25: 'Cero fallas', n_intl_1: 'Pasaporte', n_intl_10: 'Trotamundos',
      n_duelo_10: 'Pesadilla de MegaVisión', n_liga_1: 'En la liga', n_combo_5: 'Coleccionista', n_combo_15: 'Libro casi lleno',
      d_eventos: 'Cubre {n} eventos', d_cinco: 'Logra {n} eventos de 5 estrellas', d_dom: '5 estrellas en: {lista}',d_dom_todo: '5 estrellas en los {n} tipos de evento',d_cinco1: 'Logra un evento de 5 estrellas', d_intl1: 'Cubre un evento internacional',   d_staff: 'Ten {n} personas en tu equipo (sin contarte)',
      d_senior: 'Ten a alguien de nivel senior', d_intl_staff: 'Ten a alguien de nivel internacional', d_eq: 'Ten {n} equipos propios',
      d_cat: 'Ten equipos de {n} categorías distintas', d_ob: 'Ten tu propia unidad móvil', d_sede: 'Sube tu sede al nivel {n}', d_cap: 'Llega al capítulo {n} de la historia',
      d_historia: 'Termina la historia', d_temp: 'Cubre un evento de temporada', d_trofeo: 'Gana un trofeo de temporada', d_trofeos: 'Gana trofeos de {n} temporadas distintas',
      d_gana: 'Cobra {m} en total', d_limpio: '{n} eventos seguidos sin imprevistos que resten calidad', d_intl: 'Cubre {n} eventos internacionales',
      d_duelo: 'Gana {n} duelos contra MegaVisión', d_liga: 'Juega un evento de la Liga Semanal', d_combo: 'Descubre {n} combos del libro',
      e_ptz: 'cámara PTZ', e_encoder: 'encoder', e_fluido: 'trípode fluido', e_dron: 'dron', e_estab: 'gimbal o estabilizador corporal', e_inal: 'micrófono inalámbrico',
      e_bonding: 'mochila bonding', e_generador: 'generador', e_grua: 'grúa o jib', e_pov: 'cámara POV', e_gfx3d: 'gráficos 3D o AR', e_lenta: 'cámara súper lenta',
      e_riel: 'riel o dolly', e_cine: 'cámara de cine', e_repeticion: 'servidor de repeticiones', e_aerea: 'cámara aérea por cables', e_movil: 'unidad móvil', e_cam4k: 'cámara de sistema 4K',
    },
    en: {
      tit: 'Achievements', h_resumen: '{n}/{m} · {c} combos', tab_logros: 'Achievements', tab_combos: 'Combo book', ver: 'View achievements',
      reclamar: 'Claim', reclamar_todo: 'Claim all ({n})', reclamado: 'Claimed', por_reclamar: '{n} to claim',
      toast_uno: 'Achievement unlocked! {nombre}', toast_varios: '{n} achievements unlocked!', toast_resumen: 'You have {n} achievements to claim',
      toast_combo: 'New combo in the book! {nombre}', res: 'Achievement unlocked! {nombre}', res_combo: 'New combo in the book: {nombre}', res_mas: 'And {n} more achievements',
      ok_reclamo: 'Claimed: {premio}', ok_todo: 'Claimed {n} rewards', no_listo: 'Not unlocked yet', ya: 'Already claimed', no_hay: 'Does not exist',
      t_bronce: 'Bronze', t_plata: 'Silver', t_oro: 'Gold', resumen_modal: '{n}/{m} achievements · {c}/{k} combos', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Not played', mejor: 'Best: {q}/100 · day {d}', armado: '{p} crew · {c}/{t} cameras', con_cam: 'Camera: {cam}', viejo: 'Earlier record',
      pista: 'Hint: {equipo}', secreto: 'Cover this event to see the hint', fila_ok: 'Row complete', fila_premio: 'Row complete: {premio}',
      fila_falta: '5 stars and all its combos: {premio}', combos_info: 'A combo is recorded the first time you cover the event with its key gear and get 4 stars or more.',
      log_reclamo: 'Achievement reward: {nombre} ({premio})', log_fila: 'Combo book reward: {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (for materials)',
      n_ev_10: 'First broadcasts', n_ev_50: 'Seasoned crew', n_ev_200: 'Live marathon', n_cinco_1: 'Five stars', n_cinco_10: 'Golden streak',
      n_cinco_50: 'On-air legend', n_dom_iglesia: 'Peace and quiet', n_dom_social: 'Unforgettable days', n_dom_calle: 'Street reporter', n_dom_ring: 'King of the ring',
      n_dom_marca: 'Perfect launch', n_dom_escenario: 'Sold out', n_dom_estadio: 'Packed stadium', n_dom_todo: 'Master of all', n_staff_3: 'First crew',
      n_staff_10: 'Big roster', n_senior_1: 'Senior talent', n_intl_staff: 'International level', n_eq_10: 'Full warehouse', n_cat_8: 'All-rounder',
      n_cat_14: 'Complete kit', n_cat_todas: 'Whole catalog', n_ob_propia: 'On wheels', n_sede_5: 'Under construction', n_sede_10: 'Modern HQ',
      n_sede_20: 'Headquarters', n_cap_2: 'The story goes on', n_cap_4: 'Rival in sight', n_historia: 'Story complete', n_temp_1: 'Special date',
      n_temp_trofeo: 'Season trophy', n_temp_3: 'Whole calendar', n_gana_10k: 'First thousands', n_gana_100k: 'Safe box', n_gana_1m: 'Millionaire',
      n_limpio_3: 'No scares', n_limpio_10: 'Steady hand', n_limpio_25: 'Zero faults', n_intl_1: 'Passport', n_intl_10: 'Globetrotter',
      n_duelo_10: "MegaVisión's nightmare", n_liga_1: 'In the league', n_combo_5: 'Collector', n_combo_15: 'Book almost full',
      d_eventos: 'Cover {n} events', d_cinco: 'Get {n} five-star events', d_dom: '5 stars in: {lista}',d_dom_todo: '5 stars in all {n} event types',d_cinco1: 'Get a five-star event', d_intl1: 'Cover an international event',   d_staff: 'Have {n} people on your crew (not counting you)',
      d_senior: 'Have someone at senior level', d_intl_staff: 'Have someone at international level', d_eq: 'Own {n} pieces of gear',
      d_cat: 'Own gear from {n} different categories', d_ob: 'Own your own OB van', d_sede: 'Raise your HQ to level {n}', d_cap: 'Reach chapter {n} of the story',
      d_historia: 'Finish the story', d_temp: 'Cover a seasonal event', d_trofeo: 'Win a season trophy', d_trofeos: 'Win trophies from {n} different seasons',
      d_gana: 'Earn {m} in total', d_limpio: '{n} events in a row with no incidents that cost quality', d_intl: 'Cover {n} international events',
      d_duelo: 'Win {n} duels against MegaVisión', d_liga: 'Play a Weekly League event', d_combo: 'Discover {n} combos in the book',
      e_ptz: 'PTZ camera', e_encoder: 'encoder', e_fluido: 'fluid-head tripod', e_dron: 'drone', e_estab: 'gimbal or body-mounted stabilizer', e_inal: 'wireless mic',
      e_bonding: 'bonding backpack', e_generador: 'generator', e_grua: 'crane or jib', e_pov: 'POV camera', e_gfx3d: '3D or AR graphics', e_lenta: 'super slow-mo camera',
      e_riel: 'rail or dolly', e_cine: 'cinema camera', e_repeticion: 'replay server', e_aerea: 'cable-cam', e_movil: 'OB van', e_cam4k: '4K system camera',
    },
    'pt-BR': {
      tit: 'Conquistas', h_resumen: '{n}/{m} · {c} combos', tab_logros: 'Conquistas', tab_combos: 'Livro de combos', ver: 'Ver conquistas',
      reclamar: 'Resgatar', reclamar_todo: 'Resgatar tudo ({n})', reclamado: 'Resgatado', por_reclamar: '{n} para resgatar',
      toast_uno: 'Conquista desbloqueada! {nombre}', toast_varios: '{n} conquistas desbloqueadas!', toast_resumen: 'Você tem {n} conquistas para resgatar',
      toast_combo: 'Combo novo no livro! {nombre}', res: 'Conquista desbloqueada! {nombre}', res_combo: 'Combo novo no livro: {nombre}', res_mas: 'E mais {n} conquistas',
      ok_reclamo: 'Você resgatou: {premio}', ok_todo: 'Você resgatou {n} prêmios', no_listo: 'Ainda não conseguiu', ya: 'Já resgatado', no_hay: 'Não existe',
      t_bronce: 'Bronze', t_plata: 'Prata', t_oro: 'Ouro', resumen_modal: '{n}/{m} conquistas · {c}/{k} combos', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Não jogado', mejor: 'Melhor: {q}/100 · dia {d}', armado: '{p} pessoas · {c}/{t} câmeras', con_cam: 'Câmera: {cam}', viejo: 'Recorde anterior',
      pista: 'Dica: {equipo}', secreto: 'Cubra este evento para ver a dica', fila_ok: 'Linha completa', fila_premio: 'Linha completa: {premio}',
      fila_falta: '5 estrelas e todos os combos: {premio}', combos_info: 'Um combo é anotado na primeira vez que você cobre o evento com o equipamento-chave e tira 4 estrelas ou mais.',
      log_reclamo: 'Prêmio de conquista: {nombre} ({premio})', log_fila: 'Prêmio do livro de combos: {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (pelos materiais)',
      n_ev_10: 'Primeiras transmissões', n_ev_50: 'Produtora experiente', n_ev_200: 'Maratona ao vivo', n_cinco_1: 'Cinco estrelas', n_cinco_10: 'Sequência dourada',
      n_cinco_50: 'Lenda do ar', n_dom_iglesia: 'Paz e silêncio', n_dom_social: 'Dias inesquecíveis', n_dom_calle: 'Repórter de rua', n_dom_ring: 'Rei do ringue',
      n_dom_marca: 'Lançamento perfeito', n_dom_escenario: 'Esgotado', n_dom_estadio: 'Estádio lotado', n_dom_todo: 'Mestre de tudo', n_staff_3: 'Primeira equipe',
      n_staff_10: 'Grande elenco', n_senior_1: 'Talento sênior', n_intl_staff: 'Nível internacional', n_eq_10: 'Depósito cheio', n_cat_8: 'Faz-tudo',
      n_cat_14: 'Kit completo', n_cat_todas: 'Catálogo inteiro', n_ob_propia: 'Sobre rodas', n_sede_5: 'Obra em andamento', n_sede_10: 'Sede moderna',
      n_sede_20: 'Quartel-general', n_cap_2: 'A história continua', n_cap_4: 'Rival à vista', n_historia: 'História completa', n_temp_1: 'Data especial',
      n_temp_trofeo: 'Troféu de temporada', n_temp_3: 'Calendário inteiro', n_gana_10k: 'Primeiros milhares', n_gana_100k: 'Cofre forte', n_gana_1m: 'Milionário',
      n_limpio_3: 'Sem sustos', n_limpio_10: 'Mão firme', n_limpio_25: 'Zero falhas', n_intl_1: 'Passaporte', n_intl_10: 'Globetrotter',
      n_duelo_10: 'Pesadelo da MegaVisión', n_liga_1: 'Na liga', n_combo_5: 'Colecionador', n_combo_15: 'Livro quase cheio',
      d_eventos: 'Cubra {n} eventos', d_cinco: 'Consiga {n} eventos de 5 estrelas', d_dom: '5 estrelas em: {lista}',d_dom_todo: '5 estrelas nos {n} tipos de evento',d_cinco1: 'Consiga um evento de 5 estrelas', d_intl1: 'Cubra um evento internacional',   d_staff: 'Tenha {n} pessoas na equipe (sem contar você)',
      d_senior: 'Tenha alguém de nível sênior', d_intl_staff: 'Tenha alguém de nível internacional', d_eq: 'Tenha {n} equipamentos próprios',
      d_cat: 'Tenha equipamentos de {n} categorias diferentes', d_ob: 'Tenha sua própria unidade móvel', d_sede: 'Suba sua sede ao nível {n}', d_cap: 'Chegue ao capítulo {n} da história',
      d_historia: 'Termine a história', d_temp: 'Cubra um evento de temporada', d_trofeo: 'Ganhe um troféu de temporada', d_trofeos: 'Ganhe troféus de {n} temporadas diferentes',
      d_gana: 'Receba {m} no total', d_limpio: '{n} eventos seguidos sem imprevistos que tirem qualidade', d_intl: 'Cubra {n} eventos internacionais',
      d_duelo: 'Vença {n} duelos contra a MegaVisión', d_liga: 'Jogue um evento da Liga Semanal', d_combo: 'Descubra {n} combos do livro',
      e_ptz: 'câmera PTZ', e_encoder: 'encoder', e_fluido: 'tripé de cabeça fluida', e_dron: 'drone', e_estab: 'gimbal ou estabilizador corporal', e_inal: 'microfone sem fio',
      e_bonding: 'mochila bonding', e_generador: 'gerador', e_grua: 'grua ou jib', e_pov: 'câmera POV', e_gfx3d: 'gráficos 3D ou AR', e_lenta: 'câmera super lenta',
      e_riel: 'trilho ou dolly', e_cine: 'câmera de cinema', e_repeticion: 'servidor de replay', e_aerea: 'câmera aérea por cabos', e_movil: 'unidade móvel', e_cam4k: 'câmera de sistema 4K',
    },
    fr: {
      tit: 'Succès', h_resumen: '{n}/{m} · {c} combos', tab_logros: 'Succès', tab_combos: 'Livre des combos', ver: 'Voir les succès',
      reclamar: 'Récupérer', reclamar_todo: 'Tout récupérer ({n})', reclamado: 'Récupéré', por_reclamar: '{n} à récupérer',
      toast_uno: 'Succès débloqué ! {nombre}', toast_varios: '{n} succès débloqués !', toast_resumen: 'Vous avez {n} succès à récupérer',
      toast_combo: 'Nouveau combo dans le livre ! {nombre}', res: 'Succès débloqué ! {nombre}', res_combo: 'Nouveau combo dans le livre : {nombre}', res_mas: 'Et {n} succès de plus',
      ok_reclamo: 'Récupéré : {premio}', ok_todo: '{n} récompenses récupérées', no_listo: 'Pas encore débloqué', ya: 'Déjà récupéré', no_hay: "N'existe pas",
      t_bronce: 'Bronze', t_plata: 'Argent', t_oro: 'Or', resumen_modal: '{n}/{m} succès · {c}/{k} combos', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Pas joué', mejor: 'Meilleur : {q}/100 · jour {d}', armado: '{p} personnes · {c}/{t} caméras', con_cam: 'Caméra : {cam}', viejo: 'Ancien record',
      pista: 'Indice : {equipo}', secreto: "Couvrez cet événement pour voir l'indice", fila_ok: 'Ligne complète', fila_premio: 'Ligne complète : {premio}',
      fila_falta: '5 étoiles et tous ses combos : {premio}', combos_info: "Un combo est noté la première fois que vous couvrez l'événement avec son matériel clé et obtenez 4 étoiles ou plus.",
      log_reclamo: 'Récompense de succès : {nombre} ({premio})', log_fila: 'Récompense du livre des combos : {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (pour les matériaux)',
      n_ev_10: 'Premières diffusions', n_ev_50: 'Équipe aguerrie', n_ev_200: 'Marathon en direct', n_cinco_1: 'Cinq étoiles', n_cinco_10: 'Série dorée',
      n_cinco_50: "Légende de l'antenne", n_dom_iglesia: 'Paix et silence', n_dom_social: 'Jours inoubliables', n_dom_calle: 'Reporter de terrain', n_dom_ring: 'Roi du ring',
      n_dom_marca: 'Lancement parfait', n_dom_escenario: 'Complet', n_dom_estadio: 'Stade plein', n_dom_todo: 'Maître de tout', n_staff_3: 'Première équipe',
      n_staff_10: 'Grand effectif', n_senior_1: 'Talent senior', n_intl_staff: 'Niveau international', n_eq_10: 'Entrepôt plein', n_cat_8: 'Polyvalent',
      n_cat_14: 'Kit complet', n_cat_todas: 'Catalogue entier', n_ob_propia: 'Sur roues', n_sede_5: 'Chantier en cours', n_sede_10: 'Siège moderne',
      n_sede_20: 'Quartier général', n_cap_2: "L'histoire continue", n_cap_4: 'Rival en vue', n_historia: 'Histoire terminée', n_temp_1: 'Date spéciale',
      n_temp_trofeo: 'Trophée de saison', n_temp_3: 'Tout le calendrier', n_gana_10k: 'Premiers milliers', n_gana_100k: 'Coffre-fort', n_gana_1m: 'Millionnaire',
      n_limpio_3: 'Sans frayeur', n_limpio_10: 'Main sûre', n_limpio_25: 'Zéro faute', n_intl_1: 'Passeport', n_intl_10: 'Globe-trotter',
      n_duelo_10: 'Cauchemar de MegaVisión', n_liga_1: 'Dans la ligue', n_combo_5: 'Collectionneur', n_combo_15: 'Livre presque plein',
      d_eventos: 'Couvrez {n} événements', d_cinco: 'Obtenez {n} événements 5 étoiles', d_dom: '5 étoiles en : {lista}',d_dom_todo: '5 étoiles dans les {n} types d’événement',d_cinco1: 'Obtenez un événement 5 étoiles', d_intl1: 'Couvrez un événement international',   d_staff: 'Ayez {n} personnes dans votre équipe (sans vous)',
      d_senior: "Ayez quelqu'un de niveau senior", d_intl_staff: "Ayez quelqu'un de niveau international", d_eq: 'Possédez {n} équipements',
      d_cat: 'Possédez du matériel de {n} catégories différentes', d_ob: 'Possédez votre propre car régie', d_sede: 'Montez votre siège au niveau {n}', d_cap: "Atteignez le chapitre {n} de l'histoire",
      d_historia: "Terminez l'histoire", d_temp: 'Couvrez un événement de saison', d_trofeo: 'Gagnez un trophée de saison', d_trofeos: 'Gagnez des trophées de {n} saisons différentes',
      d_gana: 'Encaissez {m} au total', d_limpio: '{n} événements de suite sans imprévu qui coûte de la qualité', d_intl: 'Couvrez {n} événements internationaux',
      d_duelo: 'Gagnez {n} duels contre MegaVisión', d_liga: 'Jouez un événement de la Ligue hebdomadaire', d_combo: 'Découvrez {n} combos du livre',
      e_ptz: 'caméra PTZ', e_encoder: 'encodeur', e_fluido: 'trépied à tête fluide', e_dron: 'drone', e_estab: 'gimbal ou stabilisateur porté', e_inal: 'micro sans fil',
      e_bonding: 'sac à dos bonding', e_generador: 'générateur', e_grua: 'grue ou jib', e_pov: 'caméra POV', e_gfx3d: 'graphismes 3D ou AR', e_lenta: 'caméra super ralenti',
      e_riel: 'rail ou dolly', e_cine: 'caméra cinéma', e_repeticion: 'serveur de ralentis', e_aerea: 'caméra sur câbles', e_movil: 'car régie', e_cam4k: 'caméra système 4K',
    },
    de: {
      tit: 'Erfolge', h_resumen: '{n}/{m} · {c} Combos', tab_logros: 'Erfolge', tab_combos: 'Combo-Buch', ver: 'Erfolge ansehen',
      reclamar: 'Abholen', reclamar_todo: 'Alle abholen ({n})', reclamado: 'Abgeholt', por_reclamar: '{n} zum Abholen',
      toast_uno: 'Erfolg freigeschaltet! {nombre}', toast_varios: '{n} Erfolge freigeschaltet!', toast_resumen: 'Du hast {n} Erfolge zum Abholen',
      toast_combo: 'Neues Combo im Buch! {nombre}', res: 'Erfolg freigeschaltet! {nombre}', res_combo: 'Neues Combo im Buch: {nombre}', res_mas: 'Und {n} weitere Erfolge',
      ok_reclamo: 'Abgeholt: {premio}', ok_todo: '{n} Belohnungen abgeholt', no_listo: 'Noch nicht geschafft', ya: 'Schon abgeholt', no_hay: 'Gibt es nicht',
      t_bronce: 'Bronze', t_plata: 'Silber', t_oro: 'Gold', resumen_modal: '{n}/{m} Erfolge · {c}/{k} Combos', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Nicht gespielt', mejor: 'Bestwert: {q}/100 · Tag {d}', armado: '{p} Leute · {c}/{t} Kameras', con_cam: 'Kamera: {cam}', viejo: 'Früherer Rekord',
      pista: 'Tipp: {equipo}', secreto: 'Übertrage dieses Event, um den Tipp zu sehen', fila_ok: 'Reihe komplett', fila_premio: 'Reihe komplett: {premio}',
      fila_falta: '5 Sterne und alle Combos: {premio}', combos_info: 'Ein Combo wird eingetragen, wenn du das Event zum ersten Mal mit dem Schlüssel-Equipment überträgst und 4 Sterne oder mehr holst.',
      log_reclamo: 'Erfolgsbelohnung: {nombre} ({premio})', log_fila: 'Belohnung aus dem Combo-Buch: {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (für Material)',
      n_ev_10: 'Erste Übertragungen', n_ev_50: 'Erfahrene Crew', n_ev_200: 'Live-Marathon', n_cinco_1: 'Fünf Sterne', n_cinco_10: 'Goldene Serie',
      n_cinco_50: 'Legende auf Sendung', n_dom_iglesia: 'Ruhe und Frieden', n_dom_social: 'Unvergessliche Tage', n_dom_calle: 'Straßenreporter', n_dom_ring: 'König des Rings',
      n_dom_marca: 'Perfekter Launch', n_dom_escenario: 'Ausverkauft', n_dom_estadio: 'Volles Stadion', n_dom_todo: 'Meister von allem', n_staff_3: 'Erste Crew',
      n_staff_10: 'Großer Kader', n_senior_1: 'Senior-Talent', n_intl_staff: 'Internationales Niveau', n_eq_10: 'Volles Lager', n_cat_8: 'Allrounder',
      n_cat_14: 'Komplettes Kit', n_cat_todas: 'Ganzer Katalog', n_ob_propia: 'Auf Rädern', n_sede_5: 'Baustelle läuft', n_sede_10: 'Moderne Zentrale',
      n_sede_20: 'Hauptquartier', n_cap_2: 'Die Geschichte geht weiter', n_cap_4: 'Rivale in Sicht', n_historia: 'Geschichte beendet', n_temp_1: 'Besonderes Datum',
      n_temp_trofeo: 'Saisontrophäe', n_temp_3: 'Ganzer Kalender', n_gana_10k: 'Erste Tausender', n_gana_100k: 'Tresor', n_gana_1m: 'Millionär',
      n_limpio_3: 'Kein Schreck', n_limpio_10: 'Ruhige Hand', n_limpio_25: 'Null Fehler', n_intl_1: 'Reisepass', n_intl_10: 'Weltenbummler',
      n_duelo_10: 'Albtraum von MegaVisión', n_liga_1: 'In der Liga', n_combo_5: 'Sammler', n_combo_15: 'Buch fast voll',
      d_eventos: 'Übertrage {n} Events', d_cinco: 'Hol {n} Events mit 5 Sternen', d_dom: '5 Sterne bei: {lista}',d_dom_todo: '5 Sterne in allen {n} Eventarten',d_cinco1: 'Hol ein Event mit 5 Sternen', d_intl1: 'Übertrage ein internationales Event',   d_staff: 'Hab {n} Leute in deiner Crew (ohne dich)',
      d_senior: 'Hab jemanden auf Senior-Niveau', d_intl_staff: 'Hab jemanden auf internationalem Niveau', d_eq: 'Besitze {n} Geräte',
      d_cat: 'Besitze Geräte aus {n} verschiedenen Kategorien', d_ob: 'Besitze deinen eigenen Ü-Wagen', d_sede: 'Bring deine Zentrale auf Stufe {n}', d_cap: 'Erreiche Kapitel {n} der Geschichte',
      d_historia: 'Beende die Geschichte', d_temp: 'Übertrage ein Saison-Event', d_trofeo: 'Gewinne eine Saisontrophäe', d_trofeos: 'Gewinne Trophäen aus {n} verschiedenen Saisons',
      d_gana: 'Kassiere insgesamt {m}', d_limpio: '{n} Events in Folge ohne Zwischenfälle, die Qualität kosten', d_intl: 'Übertrage {n} internationale Events',
      d_duelo: 'Gewinne {n} Duelle gegen MegaVisión', d_liga: 'Spiel ein Event der Wochenliga', d_combo: 'Entdecke {n} Combos im Buch',
      e_ptz: 'PTZ-Kamera', e_encoder: 'Encoder', e_fluido: 'Stativ mit Fluidkopf', e_dron: 'Drohne', e_estab: 'Gimbal oder Schwebestativ', e_inal: 'Funkmikrofon',
      e_bonding: 'Bonding-Rucksack', e_generador: 'Generator', e_grua: 'Kran oder Jib', e_pov: 'POV-Kamera', e_gfx3d: '3D- oder AR-Grafik', e_lenta: 'Super-Zeitlupenkamera',
      e_riel: 'Schiene oder Dolly', e_cine: 'Kinokamera', e_repeticion: 'Replay-Server', e_aerea: 'Seilkamera', e_movil: 'Ü-Wagen', e_cam4k: '4K-Systemkamera',
    },
    it: {
      tit: 'Obiettivi', h_resumen: '{n}/{m} · {c} combo', tab_logros: 'Obiettivi', tab_combos: 'Libro delle combo', ver: 'Vedi obiettivi',
      reclamar: 'Riscatta', reclamar_todo: 'Riscatta tutto ({n})', reclamado: 'Riscattato', por_reclamar: '{n} da riscattare',
      toast_uno: 'Obiettivo sbloccato! {nombre}', toast_varios: '{n} obiettivi sbloccati!', toast_resumen: 'Hai {n} obiettivi da riscattare',
      toast_combo: 'Nuova combo nel libro! {nombre}', res: 'Obiettivo sbloccato! {nombre}', res_combo: 'Nuova combo nel libro: {nombre}', res_mas: 'E altri {n} obiettivi',
      ok_reclamo: 'Hai riscattato: {premio}', ok_todo: 'Hai riscattato {n} premi', no_listo: 'Non ancora raggiunto', ya: 'Già riscattato', no_hay: 'Non esiste',
      t_bronce: 'Bronzo', t_plata: 'Argento', t_oro: 'Oro', resumen_modal: '{n}/{m} obiettivi · {c}/{k} combo', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Non giocato', mejor: 'Migliore: {q}/100 · giorno {d}', armado: '{p} persone · {c}/{t} telecamere', con_cam: 'Telecamera: {cam}', viejo: 'Record precedente',
      pista: 'Indizio: {equipo}', secreto: "Copri questo evento per vedere l'indizio", fila_ok: 'Riga completa', fila_premio: 'Riga completa: {premio}',
      fila_falta: '5 stelle e tutte le sue combo: {premio}', combos_info: "Una combo si registra la prima volta che copri l'evento con la sua attrezzatura chiave e ottieni 4 stelle o più.",
      log_reclamo: 'Premio obiettivo: {nombre} ({premio})', log_fila: 'Premio del libro delle combo: {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (per i materiali)',
      n_ev_10: 'Prime dirette', n_ev_50: 'Troupe navigata', n_ev_200: 'Maratona in diretta', n_cinco_1: 'Cinque stelle', n_cinco_10: 'Serie dorata',
      n_cinco_50: "Leggenda dell'etere", n_dom_iglesia: 'Pace e silenzio', n_dom_social: 'Giorni indimenticabili', n_dom_calle: 'Reporter di strada', n_dom_ring: 'Re del ring',
      n_dom_marca: 'Lancio perfetto', n_dom_escenario: 'Tutto esaurito', n_dom_estadio: 'Stadio pieno', n_dom_todo: 'Maestro di tutto', n_staff_3: 'Prima squadra',
      n_staff_10: 'Grande organico', n_senior_1: 'Talento senior', n_intl_staff: 'Livello internazionale', n_eq_10: 'Magazzino pieno', n_cat_8: 'Tuttofare',
      n_cat_14: 'Kit completo', n_cat_todas: 'Catalogo intero', n_ob_propia: 'Su ruote', n_sede_5: 'Lavori in corso', n_sede_10: 'Sede moderna',
      n_sede_20: 'Quartier generale', n_cap_2: 'La storia continua', n_cap_4: "Rivale all'orizzonte", n_historia: 'Storia completata', n_temp_1: 'Data speciale',
      n_temp_trofeo: 'Trofeo di stagione', n_temp_3: 'Tutto il calendario', n_gana_10k: 'Prime migliaia', n_gana_100k: 'Cassaforte', n_gana_1m: 'Milionario',
      n_limpio_3: 'Niente spaventi', n_limpio_10: 'Mano ferma', n_limpio_25: 'Zero errori', n_intl_1: 'Passaporto', n_intl_10: 'Giramondo',
      n_duelo_10: 'Incubo di MegaVisión', n_liga_1: 'In campionato', n_combo_5: 'Collezionista', n_combo_15: 'Libro quasi pieno',
      d_eventos: 'Copri {n} eventi', d_cinco: 'Ottieni {n} eventi a 5 stelle', d_dom: '5 stelle in: {lista}',d_dom_todo: '5 stelle in tutti i {n} tipi di evento',d_cinco1: 'Ottieni un evento a 5 stelle', d_intl1: 'Copri un evento internazionale',   d_staff: 'Abbi {n} persone nella squadra (senza contarti)',
      d_senior: 'Abbi qualcuno di livello senior', d_intl_staff: 'Abbi qualcuno di livello internazionale', d_eq: 'Possiedi {n} attrezzature',
      d_cat: 'Possiedi attrezzature di {n} categorie diverse', d_ob: 'Possiedi il tuo regia mobile', d_sede: 'Porta la sede al livello {n}', d_cap: 'Arriva al capitolo {n} della storia',
      d_historia: 'Completa la storia', d_temp: 'Copri un evento stagionale', d_trofeo: 'Vinci un trofeo di stagione', d_trofeos: 'Vinci trofei di {n} stagioni diverse',
      d_gana: 'Incassa {m} in totale', d_limpio: '{n} eventi di fila senza imprevisti che tolgono qualità', d_intl: 'Copri {n} eventi internazionali',
      d_duelo: 'Vinci {n} duelli contro MegaVisión', d_liga: 'Gioca un evento della Lega settimanale', d_combo: 'Scopri {n} combo del libro',
      e_ptz: 'telecamera PTZ', e_encoder: 'encoder', e_fluido: 'treppiede a testa fluida', e_dron: 'drone', e_estab: 'gimbal o stabilizzatore indossabile', e_inal: 'microfono wireless',
      e_bonding: 'zaino bonding', e_generador: 'generatore', e_grua: 'gru o jib', e_pov: 'telecamera POV', e_gfx3d: 'grafica 3D o AR', e_lenta: 'telecamera super slow',
      e_riel: 'binario o dolly', e_cine: 'cinepresa', e_repeticion: 'server replay', e_aerea: 'telecamera su cavi', e_movil: 'regia mobile', e_cam4k: 'telecamera di sistema 4K',
    },
    ru: {
      tit: 'Достижения', h_resumen: '{n}/{m} · комбо: {c}', tab_logros: 'Достижения', tab_combos: 'Книга комбо', ver: 'Открыть достижения',
      reclamar: 'Забрать', reclamar_todo: 'Забрать всё ({n})', reclamado: 'Получено', por_reclamar: 'Можно забрать: {n}',
      toast_uno: 'Достижение открыто! {nombre}', toast_varios: 'Открыто достижений: {n}!', toast_resumen: 'Можно забрать награды за достижения: {n}',
      toast_combo: 'Новое комбо в книге! {nombre}', res: 'Достижение открыто! {nombre}', res_combo: 'Новое комбо в книге: {nombre}', res_mas: 'И ещё достижений: {n}',
      ok_reclamo: 'Получено: {premio}', ok_todo: 'Получено наград: {n}', no_listo: 'Ещё не выполнено', ya: 'Уже получено', no_hay: 'Не существует',
      t_bronce: 'Бронза', t_plata: 'Серебро', t_oro: 'Золото', resumen_modal: 'Достижения {n}/{m} · комбо {c}/{k}', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Не сыграно', mejor: 'Лучшее: {q}/100 · день {d}', armado: 'Людей: {p} · камер {c}/{t}', con_cam: 'Камера: {cam}', viejo: 'Прежний рекорд',
      pista: 'Подсказка: {equipo}', secreto: 'Проведите это событие, чтобы увидеть подсказку', fila_ok: 'Ряд собран', fila_premio: 'Ряд собран: {premio}',
      fila_falta: '5 звёзд и все комбо: {premio}', combos_info: 'Комбо записывается, когда вы впервые проводите событие с ключевым оборудованием и получаете 4 звезды или больше.',
      log_reclamo: 'Награда за достижение: {nombre} ({premio})', log_fila: 'Награда книги комбо: {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (за материалы)',
      n_ev_10: 'Первые трансляции', n_ev_50: 'Опытная команда', n_ev_200: 'Прямой марафон', n_cinco_1: 'Пять звёзд', n_cinco_10: 'Золотая серия',
      n_cinco_50: 'Легенда эфира', n_dom_iglesia: 'Тишина и покой', n_dom_social: 'Незабываемые дни', n_dom_calle: 'Уличный репортёр', n_dom_ring: 'Король ринга',
      n_dom_marca: 'Идеальный запуск', n_dom_escenario: 'Аншлаг', n_dom_estadio: 'Полный стадион', n_dom_todo: 'Мастер на все руки', n_staff_3: 'Первая команда',
      n_staff_10: 'Большой штат', n_senior_1: 'Сеньор в команде', n_intl_staff: 'Международный уровень', n_eq_10: 'Полный склад', n_cat_8: 'Универсал',
      n_cat_14: 'Полный комплект', n_cat_todas: 'Весь каталог', n_ob_propia: 'На колёсах', n_sede_5: 'Стройка идёт', n_sede_10: 'Современная база',
      n_sede_20: 'Штаб-квартира', n_cap_2: 'История продолжается', n_cap_4: 'Соперник на горизонте', n_historia: 'История пройдена', n_temp_1: 'Особая дата',
      n_temp_trofeo: 'Трофей сезона', n_temp_3: 'Весь календарь', n_gana_10k: 'Первые тысячи', n_gana_100k: 'Сейф', n_gana_1m: 'Миллионер',
      n_limpio_3: 'Без сюрпризов', n_limpio_10: 'Твёрдая рука', n_limpio_25: 'Ноль ошибок', n_intl_1: 'Паспорт', n_intl_10: 'Путешественник',
      n_duelo_10: 'Кошмар MegaVisión', n_liga_1: 'В лиге', n_combo_5: 'Коллекционер', n_combo_15: 'Книга почти полна',
      d_eventos: 'Проведите событий: {n}', d_cinco: 'Получите 5 звёзд на событиях: {n}', d_dom: '5 звёзд в: {lista}',d_dom_todo: '5 звёзд во всех типах событий: {n}',d_cinco1: 'Получите 5 звёзд на событии', d_intl1: 'Проведите международное событие',   d_staff: 'Людей в команде (без вас): {n}',
      d_senior: 'Наймите кого-то уровня сеньор', d_intl_staff: 'Наймите кого-то международного уровня', d_eq: 'Своего оборудования: {n}',
      d_cat: 'Оборудование из разных категорий: {n}', d_ob: 'Купите свою ПТС', d_sede: 'Поднимите базу до уровня {n}', d_cap: 'Дойдите до главы {n} истории',
      d_historia: 'Пройдите историю', d_temp: 'Проведите сезонное событие', d_trofeo: 'Выиграйте трофей сезона', d_trofeos: 'Трофеи разных сезонов: {n}',
      d_gana: 'Заработайте всего {m}', d_limpio: 'Событий подряд без происшествий, снижающих качество: {n}', d_intl: 'Международных событий: {n}',
      d_duelo: 'Побед в дуэлях с MegaVisión: {n}', d_liga: 'Сыграйте событие Недельной лиги', d_combo: 'Откройте комбо в книге: {n}',
      e_ptz: 'PTZ-камера', e_encoder: 'энкодер', e_fluido: 'штатив с жидкостной головкой', e_dron: 'дрон', e_estab: 'гимбал или носимый стабилизатор', e_inal: 'радиомикрофон',
      e_bonding: 'бондинг-рюкзак', e_generador: 'генератор', e_grua: 'кран или джиб', e_pov: 'POV-камера', e_gfx3d: '3D- или AR-графика', e_lenta: 'камера суперзамедления',
      e_riel: 'рельсы или долли', e_cine: 'кинокамера', e_repeticion: 'сервер повторов', e_aerea: 'тросовая камера', e_movil: 'ПТС', e_cam4k: 'системная 4K-камера',
    },
    tr: {
      tit: 'Başarımlar', h_resumen: '{n}/{m} · {c} kombo', tab_logros: 'Başarımlar', tab_combos: 'Kombo kitabı', ver: 'Başarımları gör',
      reclamar: 'Al', reclamar_todo: 'Hepsini al ({n})', reclamado: 'Alındı', por_reclamar: 'Alınacak: {n}',
      toast_uno: 'Başarım açıldı! {nombre}', toast_varios: '{n} başarım açıldı!', toast_resumen: 'Alınacak {n} başarım ödülün var',
      toast_combo: 'Kitapta yeni kombo! {nombre}', res: 'Başarım açıldı! {nombre}', res_combo: 'Kitapta yeni kombo: {nombre}', res_mas: 've {n} başarım daha',
      ok_reclamo: 'Aldın: {premio}', ok_todo: '{n} ödül aldın', no_listo: 'Henüz açılmadı', ya: 'Zaten alındı', no_hay: 'Yok',
      t_bronce: 'Bronz', t_plata: 'Gümüş', t_oro: 'Altın', resumen_modal: '{n}/{m} başarım · {c}/{k} kombo', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Oynanmadı', mejor: 'En iyi: {q}/100 · gün {d}', armado: '{p} kişi · {c}/{t} kamera', con_cam: 'Kamera: {cam}', viejo: 'Önceki rekor',
      pista: 'İpucu: {equipo}', secreto: 'İpucunu görmek için bu etkinliği yap', fila_ok: 'Satır tamam', fila_premio: 'Satır tamam: {premio}',
      fila_falta: '5 yıldız ve tüm kombolar: {premio}', combos_info: 'Etkinliği anahtar ekipmanıyla ilk kez yapıp 4 veya daha fazla yıldız aldığında kombo kaydedilir.',
      log_reclamo: 'Başarım ödülü: {nombre} ({premio})', log_fila: 'Kombo kitabı ödülü: {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (malzemeler için)',
      n_ev_10: 'İlk yayınlar', n_ev_50: 'Deneyimli ekip', n_ev_200: 'Canlı maraton', n_cinco_1: 'Beş yıldız', n_cinco_10: 'Altın seri',
      n_cinco_50: 'Yayın efsanesi', n_dom_iglesia: 'Huzur ve sessizlik', n_dom_social: 'Unutulmaz günler', n_dom_calle: 'Sokak muhabiri', n_dom_ring: 'Ringin kralı',
      n_dom_marca: 'Kusursuz lansman', n_dom_escenario: 'Kapalı gişe', n_dom_estadio: 'Dolu stadyum', n_dom_todo: 'Her işin ustası', n_staff_3: 'İlk ekip',
      n_staff_10: 'Büyük kadro', n_senior_1: 'Kıdemli yetenek', n_intl_staff: 'Uluslararası seviye', n_eq_10: 'Dolu depo', n_cat_8: 'Çok yönlü',
      n_cat_14: 'Tam set', n_cat_todas: 'Tüm katalog', n_ob_propia: 'Tekerlekler üstünde', n_sede_5: 'İnşaat sürüyor', n_sede_10: 'Modern merkez',
      n_sede_20: 'Genel merkez', n_cap_2: 'Hikâye sürüyor', n_cap_4: 'Rakip ufukta', n_historia: 'Hikâye tamam', n_temp_1: 'Özel gün',
      n_temp_trofeo: 'Sezon kupası', n_temp_3: 'Tüm takvim', n_gana_10k: 'İlk binler', n_gana_100k: 'Kasa', n_gana_1m: 'Milyoner',
      n_limpio_3: 'Sürprizsiz', n_limpio_10: 'Sağlam el', n_limpio_25: 'Sıfır hata', n_intl_1: 'Pasaport', n_intl_10: 'Dünya gezgini',
      n_duelo_10: "MegaVisión'un kâbusu", n_liga_1: 'Ligde', n_combo_5: 'Koleksiyoncu', n_combo_15: 'Kitap neredeyse dolu',
      d_eventos: '{n} etkinlik yap', d_cinco: '{n} etkinlikte 5 yıldız al', d_dom: 'Şunlarda 5 yıldız: {lista}',d_dom_todo: '{n} etkinlik türünün hepsinde 5 yıldız',d_cinco1: 'Bir etkinlikte 5 yıldız al', d_intl1: 'Bir uluslararası etkinlik yap',   d_staff: 'Ekibinde {n} kişi olsun (sen hariç)',
      d_senior: 'Kıdemli seviyede biri olsun', d_intl_staff: 'Uluslararası seviyede biri olsun', d_eq: '{n} kendi ekipmanın olsun',
      d_cat: '{n} farklı kategoriden ekipmanın olsun', d_ob: 'Kendi yayın aracın olsun', d_sede: 'Merkezini {n}. seviyeye çıkar', d_cap: 'Hikâyenin {n}. bölümüne ulaş',
      d_historia: 'Hikâyeyi bitir', d_temp: 'Bir sezon etkinliği yap', d_trofeo: 'Bir sezon kupası kazan', d_trofeos: '{n} farklı sezondan kupa kazan',
      d_gana: 'Toplam {m} kazan', d_limpio: 'Kaliteyi düşüren aksilik olmadan art arda {n} etkinlik', d_intl: '{n} uluslararası etkinlik yap',
      d_duelo: "MegaVisión'a karşı {n} düello kazan", d_liga: 'Haftalık Lig etkinliği oyna', d_combo: 'Kitapta {n} kombo keşfet',
      e_ptz: 'PTZ kamera', e_encoder: 'encoder', e_fluido: 'sıvı kafalı tripod', e_dron: 'drone', e_estab: 'gimbal veya yelekli stabilizatör', e_inal: 'kablosuz mikrofon',
      e_bonding: 'bonding sırt çantası', e_generador: 'jeneratör', e_grua: 'vinç veya jib', e_pov: 'POV kamera', e_gfx3d: '3D veya AR grafik', e_lenta: 'süper yavaş çekim kamera',
      e_riel: 'ray veya dolly', e_cine: 'sinema kamerası', e_repeticion: 'tekrar sunucusu', e_aerea: 'halatlı kamera', e_movil: 'yayın aracı', e_cam4k: '4K sistem kamerası',
    },
    id: {
      tit: 'Pencapaian', h_resumen: '{n}/{m} · {c} kombo', tab_logros: 'Pencapaian', tab_combos: 'Buku kombo', ver: 'Lihat pencapaian',
      reclamar: 'Klaim', reclamar_todo: 'Klaim semua ({n})', reclamado: 'Diklaim', por_reclamar: '{n} bisa diklaim',
      toast_uno: 'Pencapaian terbuka! {nombre}', toast_varios: '{n} pencapaian terbuka!', toast_resumen: 'Ada {n} pencapaian yang bisa diklaim',
      toast_combo: 'Kombo baru di buku! {nombre}', res: 'Pencapaian terbuka! {nombre}', res_combo: 'Kombo baru di buku: {nombre}', res_mas: 'Dan {n} pencapaian lagi',
      ok_reclamo: 'Kamu klaim: {premio}', ok_todo: 'Kamu klaim {n} hadiah', no_listo: 'Belum tercapai', ya: 'Sudah diklaim', no_hay: 'Tidak ada',
      t_bronce: 'Perunggu', t_plata: 'Perak', t_oro: 'Emas', resumen_modal: '{n}/{m} pencapaian · {c}/{k} kombo', combo_n: '{evento} + {equipo}',
      sin_jugar: 'Belum dimainkan', mejor: 'Terbaik: {q}/100 · hari {d}', armado: '{p} orang · {c}/{t} kamera', con_cam: 'Kamera: {cam}', viejo: 'Rekor lama',
      pista: 'Petunjuk: {equipo}', secreto: 'Liput acara ini untuk melihat petunjuk', fila_ok: 'Baris lengkap', fila_premio: 'Baris lengkap: {premio}',
      fila_falta: '5 bintang dan semua kombonya: {premio}', combos_info: 'Kombo dicatat saat pertama kali kamu meliput acara dengan peralatan kuncinya dan dapat 4 bintang atau lebih.',
      log_reclamo: 'Hadiah pencapaian: {nombre} ({premio})', log_fila: 'Hadiah buku kombo: {evento} ({premio})', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m} (untuk bahan)',
      n_ev_10: 'Siaran pertama', n_ev_50: 'Kru berpengalaman', n_ev_200: 'Maraton langsung', n_cinco_1: 'Lima bintang', n_cinco_10: 'Rentetan emas',
      n_cinco_50: 'Legenda siaran', n_dom_iglesia: 'Damai dan hening', n_dom_social: 'Hari tak terlupakan', n_dom_calle: 'Reporter jalanan', n_dom_ring: 'Raja ring',
      n_dom_marca: 'Peluncuran sempurna', n_dom_escenario: 'Tiket habis', n_dom_estadio: 'Stadion penuh', n_dom_todo: 'Ahli segalanya', n_staff_3: 'Kru pertama',
      n_staff_10: 'Tim besar', n_senior_1: 'Talenta senior', n_intl_staff: 'Level internasional', n_eq_10: 'Gudang penuh', n_cat_8: 'Serba bisa',
      n_cat_14: 'Kit lengkap', n_cat_todas: 'Seluruh katalog', n_ob_propia: 'Di atas roda', n_sede_5: 'Pembangunan berjalan', n_sede_10: 'Markas modern',
      n_sede_20: 'Kantor pusat', n_cap_2: 'Cerita berlanjut', n_cap_4: 'Rival terlihat', n_historia: 'Cerita tamat', n_temp_1: 'Tanggal spesial',
      n_temp_trofeo: 'Trofi musim', n_temp_3: 'Seluruh kalender', n_gana_10k: 'Ribuan pertama', n_gana_100k: 'Brankas', n_gana_1m: 'Jutawan',
      n_limpio_3: 'Tanpa kaget', n_limpio_10: 'Tangan mantap', n_limpio_25: 'Nol kesalahan', n_intl_1: 'Paspor', n_intl_10: 'Penjelajah dunia',
      n_duelo_10: 'Mimpi buruk MegaVisión', n_liga_1: 'Di liga', n_combo_5: 'Kolektor', n_combo_15: 'Buku hampir penuh',
      d_eventos: 'Liput {n} acara', d_cinco: 'Dapat {n} acara bintang 5', d_dom: '5 bintang di: {lista}',d_dom_todo: '5 bintang di semua {n} jenis acara',d_cinco1: 'Dapat satu acara bintang 5', d_intl1: 'Liput satu acara internasional',   d_staff: 'Punya {n} orang di kru (tanpa kamu)',
      d_senior: 'Punya seseorang level senior', d_intl_staff: 'Punya seseorang level internasional', d_eq: 'Punya {n} peralatan sendiri',
      d_cat: 'Punya peralatan dari {n} kategori berbeda', d_ob: 'Punya mobil OB sendiri', d_sede: 'Naikkan markas ke level {n}', d_cap: 'Capai bab {n} cerita',
      d_historia: 'Selesaikan cerita', d_temp: 'Liput acara musiman', d_trofeo: 'Menangkan trofi musim', d_trofeos: 'Menangkan trofi dari {n} musim berbeda',
      d_gana: 'Hasilkan total {m}', d_limpio: '{n} acara berturut-turut tanpa insiden yang menurunkan kualitas', d_intl: 'Liput {n} acara internasional',
      d_duelo: 'Menangkan {n} duel melawan MegaVisión', d_liga: 'Mainkan acara Liga Mingguan', d_combo: 'Temukan {n} kombo di buku',
      e_ptz: 'kamera PTZ', e_encoder: 'encoder', e_fluido: 'tripod fluid head', e_dron: 'drone', e_estab: 'gimbal atau stabilizer rompi', e_inal: 'mikrofon nirkabel',
      e_bonding: 'ransel bonding', e_generador: 'generator', e_grua: 'crane atau jib', e_pov: 'kamera POV', e_gfx3d: 'grafis 3D atau AR', e_lenta: 'kamera super lambat',
      e_riel: 'rel atau dolly', e_cine: 'kamera sinema', e_repeticion: 'server tayangan ulang', e_aerea: 'kamera kabel udara', e_movil: 'mobil OB', e_cam4k: 'kamera sistem 4K',
    },
    'zh-CN': {
      tit: '成就', h_resumen: '{n}/{m} · {c} 个组合', tab_logros: '成就', tab_combos: '组合图鉴', ver: '查看成就',
      reclamar: '领取', reclamar_todo: '全部领取（{n}）', reclamado: '已领取', por_reclamar: '{n} 个可领取',
      toast_uno: '成就解锁！{nombre}', toast_varios: '解锁了 {n} 个成就！', toast_resumen: '你有 {n} 个成就奖励可领取',
      toast_combo: '图鉴新组合！{nombre}', res: '成就解锁！{nombre}', res_combo: '图鉴新组合：{nombre}', res_mas: '还有 {n} 个成就',
      ok_reclamo: '已领取：{premio}', ok_todo: '已领取 {n} 份奖励', no_listo: '尚未达成', ya: '已经领取过了', no_hay: '不存在',
      t_bronce: '铜', t_plata: '银', t_oro: '金', resumen_modal: '{n}/{m} 个成就 · {c}/{k} 个组合', combo_n: '{evento} + {equipo}',
      sin_jugar: '未进行', mejor: '最佳：{q}/100 · 第 {d} 天', armado: '{p} 人 · {c}/{t} 台摄像机', con_cam: '摄像机：{cam}', viejo: '旧纪录',
      pista: '提示：{equipo}', secreto: '承接一次这个活动即可看到提示', fila_ok: '本行完成', fila_premio: '本行完成：{premio}',
      fila_falta: '5 星并集齐所有组合：{premio}', combos_info: '第一次带着关键设备承接该活动并获得 4 星或以上时，组合就会记入图鉴。',
      log_reclamo: '成就奖励：{nombre}（{premio}）', log_fila: '组合图鉴奖励：{evento}（{premio}）', progreso: '{v}/{m}',
      r_dinero: '{m}', r_conv: '{m}（材料折算）',
      n_ev_10: '初次转播', n_ev_50: '老练团队', n_ev_200: '直播马拉松', n_cinco_1: '五星好评', n_cinco_10: '黄金连胜',
      n_cinco_50: '直播传奇', n_dom_iglesia: '宁静致远', n_dom_social: '难忘的日子', n_dom_calle: '街头记者', n_dom_ring: '擂台之王',
      n_dom_marca: '完美发布', n_dom_escenario: '门票售罄', n_dom_estadio: '座无虚席', n_dom_todo: '全能大师', n_staff_3: '第一支团队',
      n_staff_10: '庞大阵容', n_senior_1: '资深人才', n_intl_staff: '国际水准', n_eq_10: '仓库满满', n_cat_8: '多面手',
      n_cat_14: '全套装备', n_cat_todas: '全目录', n_ob_propia: '车轮上的演播室', n_sede_5: '施工中', n_sede_10: '现代化基地',
      n_sede_20: '总部', n_cap_2: '故事继续', n_cap_4: '对手现身', n_historia: '故事完结', n_temp_1: '特别的日子',
      n_temp_trofeo: '季节奖杯', n_temp_3: '全年日历', n_gana_10k: '第一桶金', n_gana_100k: '保险箱', n_gana_1m: '百万富翁',
      n_limpio_3: '有惊无险', n_limpio_10: '稳如泰山', n_limpio_25: '零失误', n_intl_1: '护照', n_intl_10: '环球旅行者',
      n_duelo_10: 'MegaVisión 的噩梦', n_liga_1: '加入联赛', n_combo_5: '收藏家', n_combo_15: '图鉴快满了',
      d_eventos: '承接 {n} 场活动', d_cinco: '获得 {n} 场 5 星活动', d_dom: '以下活动获得 5 星：{lista}',d_dom_todo: '在全部 {n} 种活动中获得 5 星',d_cinco1: '获得一场 5 星活动', d_intl1: '承接一场国际活动',   d_staff: '团队有 {n} 人（不含你自己）',
      d_senior: '拥有一名资深级员工', d_intl_staff: '拥有一名国际级员工', d_eq: '拥有 {n} 件自有设备',
      d_cat: '拥有 {n} 个不同类别的设备', d_ob: '拥有自己的转播车', d_sede: '把基地升到 {n} 级', d_cap: '到达故事第 {n} 章',
      d_historia: '完成故事', d_temp: '承接一场季节活动', d_trofeo: '赢得一座季节奖杯', d_trofeos: '赢得 {n} 个不同季节的奖杯',
      d_gana: '累计收入 {m}', d_limpio: '连续 {n} 场活动没有降低质量的意外', d_intl: '承接 {n} 场国际活动',
      d_duelo: '对 MegaVisión 赢得 {n} 场对决', d_liga: '参加一场每周联赛活动', d_combo: '在图鉴中发现 {n} 个组合',
      e_ptz: 'PTZ 摄像机', e_encoder: '编码器', e_fluido: '液压云台三脚架', e_dron: '无人机', e_estab: '手持稳定器或穿戴式稳定器', e_inal: '无线麦克风',
      e_bonding: '聚合背包', e_generador: '发电机', e_grua: '摇臂或吊臂', e_pov: 'POV 摄像机', e_gfx3d: '3D 或 AR 图文', e_lenta: '超高速摄像机',
      e_riel: '轨道或移动车', e_cine: '电影摄影机', e_repeticion: '回放服务器', e_aerea: '索道摄像机', e_movil: '转播车', e_cam4k: '4K 系统摄像机',
    },
  };
  // Título de la fila plegable de Inicio (ui.js PL_INFO.logros → 'inicio.pl.logros'): se agrega a los diccionarios si falta
  const PL_TIT = { es: 'Logros y combos', en: 'Achievements & combos', 'pt-BR': 'Conquistas e combos', fr: 'Succès et combos', de: 'Erfolge & Combos',
    it: 'Obiettivi e combo', ru: 'Достижения и комбо', tr: 'Başarımlar ve kombolar', id: 'Pencapaian & kombo', 'zh-CN': '成就与组合' };
  const PREF = 'logros.';
  function idioma() { try { const c = root.I18N && root.I18N.idioma; return c && TRAD[c] ? c : 'es'; } catch (e) { return 'es'; } }
  function fill(str, p) { return p ? String(str).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined && p[k] !== null ? String(p[k]) : m)) : String(str); }
  function t(key, p) {
    const d = TRAD[idioma()];
    const v = d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : TRAD.es[key];
    return fill(v === undefined ? key : v, p);
  }
  // Para el registro del juego y result.extras ({ k, p }): español en Game.TEXTOS y los otros idiomas en los diccionarios del juego
  function registrarTextos() {
    try { if (G.TEXTOS) Object.keys(TRAD.es).forEach((k) => { if (!(PREF + k in G.TEXTOS)) G.TEXTOS[PREF + k] = TRAD.es[k]; }); } catch (e) { /* sin textos */ }
    try {
      const J = root.I18N_JUEGO;
      if (J) Object.keys(TRAD).forEach((code) => {
        if (code === 'es' || !Object.prototype.hasOwnProperty.call(J, code) || !J[code]) return;
        Object.keys(TRAD[code]).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(J[code], PREF + k)) J[code][PREF + k] = TRAD[code][k]; });
      });
    } catch (e) { /* sin diccionarios */ }
    try {
      const D = root.I18N_LANG;
      if (D) Object.keys(PL_TIT).forEach((code) => { if (D[code] && !Object.prototype.hasOwnProperty.call(D[code], 'inicio.pl.logros')) D[code]['inicio.pl.logros'] = PL_TIT[code]; });
    } catch (e) { /* sin diccionarios */ }
  }
  registrarTextos();
  const kN = (id) => ({ k: PREF + 'n_' + id });
  const nombre = (id) => t('n_' + id);
  const nombreEvento = (tipo) => { try { const v = G.tx('ev.' + tipo); if (v && v !== 'ev.' + tipo) return v; } catch (e) { /* abajo */ } return (G.EVENT_TYPES[tipo] && G.EVENT_TYPES[tipo].name) || tipo; };
  const nombreCombo = (c) => t('combo_n', { evento: nombreEvento(c.tipo), equipo: t('e_' + c.eq) });
  const nombreMat = (m) => { try { if (root.Sede && typeof root.Sede.t === 'function') { const v = root.Sede.t('mat.' + m); if (v && v !== 'mat.' + m) return v; } } catch (e) { /* abajo */ } return m; };
  const nombreCons = (k) => { try { const v = G.tx('cons.' + k + '.nombre'); if (v && v !== 'cons.' + k + '.nombre') return v; } catch (e) { /* abajo */ } return k; };
  const nombreItem = (type) => { const it = G.CATALOG[type]; return (it && (it.name || it.nombre)) || type; };

  /* ---------- Estado guardado: s.logros ---------- */
  const entero = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  function migrar(s) {
    if (!s || typeof s !== 'object') return s;
    const nueva = !s.logros || typeof s.logros !== 'object' || Array.isArray(s.logros);
    const L = nueva ? (s.logros = {}) : s.logros;
    L.v = 1;
    L.hechos = objeto(L.hechos);
    L.reclamados = objeto(L.reclamados);
    L.combos = objeto(L.combos);
    L.libro = objeto(L.libro);
    L.filas = objeto(L.filas);
    L.c = objeto(L.c);
    ['racha', 'rachaMax', 'temp'].forEach((k) => { L.c[k] = entero(L.c[k]); });
    L.porMostrar = (Array.isArray(L.porMostrar) ? L.porMostrar : []).filter((x) => typeof x === 'string' && (POR_ID[x] || (x.slice(0, 2) === 'c:' && COMBO[x.slice(2)])));
    L.resumen = entero(L.resumen);
    Object.keys(L.hechos).forEach((k) => { if (!POR_ID[k]) delete L.hechos[k]; });
    Object.keys(L.reclamados).forEach((k) => { if (!L.hechos[k]) delete L.reclamados[k]; });
    Object.keys(L.combos).forEach((k) => { if (!COMBO[k]) delete L.combos[k]; });
    if (nueva) {
      // Partida de antes de los logros: lo que se sabe de cada tipo es su mejor resultado; las temporadas, sus trofeos
      const b = best(s);
      Object.keys(b).forEach((tipo) => { if (b[tipo] > 0 && !L.libro[tipo]) L.libro[tipo] = { e: Math.min(5, entero(b[tipo])), viejo: true }; });
      const tempJugadas = Object.keys(b).filter((k) => G.EVENT_TYPES[k] && G.EVENT_TYPES[k].temporada && b[k] > 0).length;
      L.c.temp = Math.max(L.c.temp, tempJugadas, trofeos(s).length ? 1 : 0);
    }
    // Lo ya logrado (partida vieja o logros nuevos de una actualización) se entrega en silencio, con un solo aviso
    revisar(s, true);
    return s;
  }
  const est = (s) => { if (!s.logros || !s.logros.hechos || !s.logros.c) migrar(s); return s.logros; };

  /* ---------- Reglas ---------- */
  function valor(s, d) { try { const v = Number(d.val(s, est(s))); return Number.isFinite(v) ? v : 0; } catch (e) { return 0; } }
  // Revisa todos los logros. silencioso = partida vieja (sin toasts: suma al aviso único). Devuelve los ids nuevos.
  function revisar(s, silencioso) {
    const L = s.logros;
    if (!L || !L.hechos) return [];
    const nuevos = [];
    LOGROS.forEach((d) => {
      if (L.hechos[d.id]) return;
      if (valor(s, d) >= d.meta) { L.hechos[d.id] = entero(s.day) || 1; nuevos.push(d.id); }
    });
    if (silencioso) L.resumen += nuevos.length;
    else nuevos.forEach((id) => { if (!L.porMostrar.includes(id)) L.porMostrar.push(id); });
    if (L.porMostrar.length > 60) L.porMostrar.splice(0, L.porMostrar.length - 60);
    return nuevos;
  }
  // Subtipos del equipo que se usó en el evento (lo propio que fue, las cámaras del plan con alquileres y los vehículos)
  function equipoDelEvento(s, result) {
    const ev = s.currentEvent;
    const tipos = [];
    if (ev && Array.isArray(ev.equipIds)) (s.equip || []).forEach((e) => { if (e && ev.equipIds.includes(e.id)) tipos.push(e.type); });
    const plan = (result && result.cameraPlan) || (ev && ev.cameraPlan);
    if (plan && Array.isArray(plan.positions)) plan.positions.forEach((p) => { if (p && p.asignado) tipos.push(p.asignado); if (p && p.lente) tipos.push(p.lente); });
    const tp = result && result.transporte;
    if (tp && Array.isArray(tp.vehiculos)) tp.vehiculos.forEach((v) => { if (v && v.type) tipos.push(v.type); });
    const set = new Set();
    tipos.forEach((k) => { const it = G.CATALOG[k]; if (!it) return; set.add(it.subtipo); set.add(it.cat + ':' + it.subtipo); });
    return set;
  }
  const tieneEquipo = (set, eq) => EQUIPO[eq].sub.some((x) => set.has(x));
  function mejorCamara(result) {
    const plan = result && result.cameraPlan;
    if (!plan || !Array.isArray(plan.positions)) return null;
    let mejor = null;
    plan.positions.forEach((p) => { if (p && p.asignado && (!mejor || (p.q || 0) > (mejor.q || 0))) mejor = p; });
    return mejor ? mejor.asignado : null;
  }
  /* Después de cada evento (lo llama la lógica). Anota racha, libro y combos; los avisos van al resultado y a la cola. */
  function alTerminarEvento(s, result, c) {
    if (!s || !result || !c) return;
    const L = est(s);
    const ev = s.currentEvent;
    const incs = ev && Array.isArray(ev.incidents) ? ev.incidents : (result.incidents || []);
    const limpio = incs.every((i) => !(i && i.result && Number(i.result.q) < 0));
    L.c.racha = limpio ? L.c.racha + 1 : 0;
    L.c.rachaMax = Math.max(L.c.rachaMax, L.c.racha);
    const tipo = c.type;
    if (G.EVENT_TYPES[tipo] && G.EVENT_TYPES[tipo].temporada) L.c.temp++;
    const stars = entero(result.stars), q = entero(result.quality);
    const prev = L.libro[tipo];
    if (!prev || stars > (prev.e || 0) || (stars === prev.e && (prev.viejo || q > (prev.q || 0)))) {
      const plan = result.cameraPlan || {};
      L.libro[tipo] = { e: stars, q, dia: entero(s.day), cams: entero(plan.cubiertas), total: entero(plan.total),
        personas: ev && Array.isArray(ev.staffIds) ? ev.staffIds.length : 0, cam: mejorCamara(result) };
    }
    const combosNuevos = [];
    if (stars >= AJUSTE.estrellasCombo) {
      const set = equipoDelEvento(s, result);
      COMBOS.forEach((cb) => {
        if (cb.tipo !== tipo || L.combos[cb.id] || !tieneEquipo(set, cb.eq)) return;
        L.combos[cb.id] = { dia: entero(s.day), e: stars };
        combosNuevos.push(cb.id);
        L.porMostrar.push('c:' + cb.id);
      });
    }
    const nuevos = revisar(s, false);
    // Líneas en la pantalla del resultado (después del evento en vivo)
    if (!Array.isArray(result.extras)) result.extras = [];
    combosNuevos.forEach((id) => {
      const cb = COMBO[id];
      result.extras.push({ icon: EQUIPO[cb.eq].ic, k: PREF + 'res_combo', p: { nombre: { k: PREF + 'combo_n', p: { evento: { k: 'ev.' + cb.tipo }, equipo: { k: PREF + 'e_' + cb.eq } } } }, text: t('res_combo', { nombre: nombreCombo(cb) }) });
    });
    nuevos.slice(0, 3).forEach((id) => result.extras.push({ icon: 'gem', k: PREF + 'res', p: { nombre: kN(id) }, text: t('res', { nombre: nombre(id) }) }));
    if (nuevos.length > 3) result.extras.push({ icon: 'gem', k: PREF + 'res_mas', p: { n: nuevos.length - 3 }, text: t('res_mas', { n: nuevos.length - 3 }) });
  }

  /* ---------- Premios ---------- */
  function premioDe(id) { const d = POR_ID[id]; return d ? AJUSTE.premio[d.tier](d.i) : null; }
  const filaDe = (tipo) => LIBRO.find((f) => f.tipo === tipo) || null;
  function premioFila(tipo) { const f = filaDe(tipo); return f ? AJUSTE.premio.fila(f.i) : null; }
  const sedeLocal = (s) => !!(s && s.sede && typeof s.sede === 'object' && s.sede.materiales && typeof s.sede.materiales === 'object' && !s.sede.oficial);
  function aplicar(s, p) {
    let conv = 0;
    if (p.dinero) s.money += p.dinero;
    Object.keys(p.stock || {}).forEach((k) => { s.stock = s.stock || {}; s.stock[k] = (s.stock[k] || 0) + p.stock[k]; });
    Object.keys(p.mat || {}).forEach((m) => {
      if (sedeLocal(s)) s.sede.materiales[m] = (Number(s.sede.materiales[m]) || 0) + p.mat[m];
      else conv += p.mat[m] * (AJUSTE.matDinero[m] || 20);
    });
    if (conv) s.money += conv;
    return conv;
  }
  // Texto del premio (para la lista y los mensajes). conv: dinero que se dio en lugar de materiales
  function textoPremio(p, s, M) {
    const mon = M || G.money;
    const xs = [];
    if (p.dinero) xs.push(mon(p.dinero));
    Object.keys(p.stock || {}).forEach((k) => xs.push(p.stock[k] + ' × ' + nombreCons(k)));
    const mats = Object.keys(p.mat || {});
    if (mats.length) {
      if (!s || sedeLocal(s)) mats.forEach((m) => xs.push(p.mat[m] + ' × ' + nombreMat(m)));
      else xs.push(t('r_conv', { m: mon(mats.reduce((a, m) => a + p.mat[m] * (AJUSTE.matDinero[m] || 20), 0)) }));
    }
    return xs.join(' · ');
  }
  const resp = (ok, key, p) => ({ ok, msg: t(key, p) });
  function reclamar(s, id) {
    if (!s || !POR_ID[id]) return resp(false, 'no_hay');
    const L = est(s);
    if (!L.hechos[id]) return resp(false, 'no_listo');
    if (L.reclamados[id]) return resp(false, 'ya');
    const p = premioDe(id), txt = textoPremio(p, s);
    aplicar(s, p);
    L.reclamados[id] = entero(s.day) || 1;
    G.log(s, PREF + 'log_reclamo', { nombre: kN(id), premio: txt });
    return Object.assign(resp(true, 'ok_reclamo', { premio: txt }), { id });
  }
  function filaCompleta(s, tipo) {
    const f = filaDe(tipo), L = est(s);
    return !!f && ((L.libro[tipo] && L.libro[tipo].e) || 0) >= 5 && f.combos.every((c) => !!L.combos[c.id]);
  }
  function reclamarFila(s, tipo) {
    const f = filaDe(tipo);
    if (!s || !f) return resp(false, 'no_hay');
    const L = est(s);
    if (L.filas[tipo]) return resp(false, 'ya');
    if (!filaCompleta(s, tipo)) return resp(false, 'no_listo');
    const p = premioFila(tipo), txt = textoPremio(p, s);
    aplicar(s, p);
    L.filas[tipo] = entero(s.day) || 1;
    G.log(s, PREF + 'log_fila', { evento: { k: 'ev.' + tipo }, premio: txt });
    return Object.assign(resp(true, 'ok_reclamo', { premio: txt }), { tipo });
  }
  function porReclamar(s) {
    const L = est(s);
    return {
      logros: LOGROS.filter((d) => L.hechos[d.id] && !L.reclamados[d.id]).map((d) => d.id),
      filas: LIBRO.filter((f) => !L.filas[f.tipo] && filaCompleta(s, f.tipo)).map((f) => f.tipo),
    };
  }
  function reclamarTodo(s) {
    if (!s) return resp(false, 'no_hay');
    const pr = porReclamar(s);
    let n = 0;
    pr.logros.forEach((id) => { if (reclamar(s, id).ok) n++; });
    pr.filas.forEach((tipo) => { if (reclamarFila(s, tipo).ok) n++; });
    return n ? Object.assign(resp(true, 'ok_todo', { n }), { n }) : resp(false, 'no_listo');
  }
  function resumen(s) {
    const L = est(s), pr = porReclamar(s);
    return { hechos: Object.keys(L.hechos).length, total: LOGROS.length, combos: Object.keys(L.combos).length, totalCombos: COMBOS.length,
      reclamar: pr.logros.length + pr.filas.length };
  }
  // La pantalla toma lo que falta avisar (y lo borra)
  function tomarAvisos(s) {
    const L = est(s);
    const out = { logros: L.porMostrar.filter((x) => POR_ID[x]), combos: L.porMostrar.filter((x) => x.slice(0, 2) === 'c:').map((x) => x.slice(2)), resumen: L.resumen };
    L.porMostrar = []; L.resumen = 0;
    return out;
  }

  /* ---------- La extensión ---------- */
  const EXT = {
    id: 'logros',
    migrar,
    alNuevoDia(s) { if (s) { est(s); revisar(s, false); } },
    alTerminarEvento,
  };
  G.registrarExtension(EXT);

  /* =========================================================
     Insignias (SVG, mismo estilo del juego: formas planas, paleta oscura)
     ========================================================= */
  const GLIFO = {
    claqueta: '<path d="M4 10h16v9H4z"/><path d="M4 10l1.5-5h14L18 10M9.5 5L8 10M14.5 5L13 10"/>',
    estrella: '<path d="M12 3.5l2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.3 6.9 19.1 8 13.4 3.8 9.5l5.7-.7z"/>',
    corona: '<path d="M3.5 8.5l4 3.5 4.5-6.5 4.5 6.5 4-3.5-2 10h-13z"/><path d="M6 19h12"/>',
    persona: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0114 0"/>',
    caja: '<rect x="3.5" y="8" width="11.5" height="9" rx="2"/><path d="M15 11l5-3v9l-5-3"/><circle cx="7.5" cy="12.5" r="1.4"/>',
    camion: '<rect x="2.5" y="8" width="12.5" height="8.5" rx="1.3"/><path d="M15 10.5h3.5l3 3v3h-6.5z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
    edificio: '<path d="M4 20V9.5L12 4l8 5.5V20"/><path d="M9.5 20v-5h5v5M8 11.5h2M14 11.5h2"/>',
    bandera: '<path d="M6 21V4"/><path d="M6 4.5h11l-2.3 4 2.3 4H6"/>',
    calendario: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/><path d="M8.5 13.5h3v3h-3z"/>',
    moneda: '<circle cx="12" cy="12" r="8"/><path d="M14.6 9.4c-.6-.9-1.5-1.3-2.6-1.3-1.5 0-2.5.8-2.5 1.9 0 2.8 5.2 1.4 5.2 4.2 0 1.1-1.1 1.9-2.7 1.9-1.1 0-2.1-.5-2.7-1.4M12 6.5v11"/>',
    escudo: '<path d="M12 3.5l7 2.8v5.5c0 4.3-2.9 7.3-7 8.7-4.1-1.4-7-4.4-7-8.7V6.3z"/><path d="M8.7 12l2.3 2.3 4.3-4.6"/>',
    globo: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 2.6 2.8 14.4 0 17M12 3.5c-2.8 2.6-2.8 14.4 0 17"/>',
    rayo: '<path d="M13.5 2.5L5.5 14h6l-1 7.5 8-11.5h-6z"/>',
    copa: '<path d="M7.5 4h9v4.5a4.5 4.5 0 01-9 0z"/><path d="M7.5 6H4.5v1a3 3 0 003 3M16.5 6h3v1a3 3 0 01-3 3M12 13v4M8.5 20.5h7M9.5 17h5"/>',
    libro: '<path d="M4.5 5.5a2 2 0 012-2h12.5v15H6.5a2 2 0 00-2 2z"/><path d="M4.5 20.5v-15M8.5 7.5h7M8.5 11h7"/>',
  };
  const TONO = {
    bronce: { a: '#f0b27a', b: '#b0642f', c: '#5e2f12', cinta: '#8a3b1c' },
    plata: { a: '#f2f6fb', b: '#9aa8b8', c: '#4b5768', cinta: '#3f6fb3' },
    oro: { a: '#ffe58a', b: '#e0a425', c: '#7a520c', cinta: '#c0262d' },
  };
  // Forma del medallón: bronce = círculo, plata = octágono, oro = estrella de 12 puntas
  function forma(tier) {
    if (tier === 'bronce') return { d: 'M32 9a19 19 0 110 38a19 19 0 110-38z', r: 15.5 };
    const pts = [];
    if (tier === 'plata') { for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; pts.push([32 + 20 * Math.cos(a), 28 + 20 * Math.sin(a)]); } }
    else { for (let i = 0; i < 24; i++) { const a = -Math.PI / 2 + i * Math.PI / 12, r = i % 2 ? 17.5 : 21.5; pts.push([32 + r * Math.cos(a), 28 + r * Math.sin(a)]); } }
    return { d: 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'z', r: 14.5 };
  }
  /* estado: 'bloq' (silueta gris con candado) · 'listo' (brilla: por reclamar) · 'ok' (reclamado) */
  function insignia(id, estado, size) {
    const d = POR_ID[id];
    if (!d) return '';
    const T0 = TONO[d.tier], f = forma(d.tier), bloq = estado === 'bloq';
    const g = 'lo-g-' + d.tier + (bloq ? '-b' : '');
    const cuerpo = bloq ? '#2a3140' : `url(#${g})`;
    const borde = bloq ? '#3a4356' : T0.c;
    const cinta = bloq ? '#232a37' : T0.cinta;
    const glifo = GLIFO[d.g] || GLIFO.estrella;
    const s = size || 56;
    return `<svg class="lo-ins e-${estado}" viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true" focusable="false">
      ${bloq ? '' : `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T0.a}"/><stop offset=".55" stop-color="${T0.b}"/><stop offset="1" stop-color="${T0.c}"/></linearGradient></defs>`}
      <path d="M22 40l-5 20 8-4 5 6 4-18zM42 40l5 20-8-4-5 6-4-18z" fill="${cinta}" stroke="#0d0f14" stroke-width="1.2" stroke-linejoin="round"/>
      <g transform="translate(0 -1)"><path d="${f.d}" transform="translate(0 ${d.tier === 'bronce' ? -1 : 0})" fill="${cuerpo}" stroke="${borde}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="32" cy="28" r="${f.r}" fill="${bloq ? '#202634' : '#0d0f14'}" fill-opacity="${bloq ? 1 : 0.28}" stroke="${bloq ? '#363f52' : '#ffffff'}" stroke-opacity="${bloq ? 1 : 0.35}" stroke-width="1.2"/>
      <g transform="translate(20.5 16.5) scale(.96)" fill="none" stroke="${bloq ? '#4a5468' : '#fff'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glifo}</g>
      ${bloq ? '' : `<path d="M19 18a16 16 0 0110-7" stroke="#fff" stroke-opacity=".55" stroke-width="2" fill="none" stroke-linecap="round"/>`}</g>
      ${bloq ? '<g transform="translate(42 38)"><rect x="0" y="5" width="13" height="10" rx="2" fill="#4a5468" stroke="#0d0f14" stroke-width="1.2"/><path d="M3 5V3.2a3.5 3.5 0 017 0V5" fill="none" stroke="#4a5468" stroke-width="2"/></g>' : ''}
    </svg>`;
  }

  /* =========================================================
     Pantalla: fila de Inicio y ventana con pestañas
     ========================================================= */
  const CSS = `
  .lo-card .lo-tira{display:flex;gap:6px;align-items:flex-end;margin-bottom:6px;min-height:46px}
  .lo-card .lo-tira .lo-ins{flex:0 0 auto}
  .lo-card h3{font-size:17px;margin:4px 0 0;line-height:1.2}
  .lo-card .lo-sub{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px}
  .lo-am{color:var(--amber)}
  .lo-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.lo-btns .btn{flex:1 1 140px}
  .lo-modal h2{font-size:22px;display:flex;align-items:center;gap:6px}
  .lo-tabs{display:flex;gap:6px;margin:10px 0 6px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:4px}
  .lo-tabs button{flex:1;border:0;background:none;border-radius:9px;padding:9px 6px;font-weight:700;color:var(--muted);min-width:0}
  .lo-tabs button.on{background:var(--panel);color:var(--text);box-shadow:0 0 0 1px var(--line) inset}
  .lo-tabs button b{font-family:var(--f-mono);font-size:12px;color:var(--amber);margin-inline-start:4px}
  .lo-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
  .lo-it{display:flex;gap:10px;align-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:8px 10px;min-width:0}
  .lo-it.e-listo{border-color:#ffd27a88;background:linear-gradient(90deg,#3a2c0c55,var(--panel2) 60%)}
  .lo-it.e-ok{opacity:.78}
  .lo-it .grow{flex:1;min-width:0}
  .lo-it b{display:block;font-size:14.5px;line-height:1.2}
  .lo-it .lo-d{font-size:12.5px;color:var(--muted);line-height:1.3;margin-top:2px;overflow-wrap:anywhere}
  .lo-it .lo-p{font-size:12px;margin-top:3px;color:var(--text);opacity:.9;overflow-wrap:anywhere}
  .lo-it .bar{height:5px;margin-top:5px}
  .lo-it .btn.sm{flex:0 0 auto;white-space:nowrap}
  .lo-tier{display:inline-block;white-space:nowrap;font-family:var(--f-head);font-size:11px;letter-spacing:.8px;text-transform:uppercase;margin-inline-start:4px;padding:1px 6px;border-radius:99px;vertical-align:1px}
  .lo-tier.bronce{background:#5e2f1255;color:#f0b27a}.lo-tier.plata{background:#4b576855;color:#dfe6ee}.lo-tier.oro{background:#7a520c55;color:#ffd66b}
  .lo-ins.e-listo{filter:drop-shadow(0 0 6px #ffd27a99);animation:lo-brilla 1.8s ease-in-out infinite}
  @keyframes lo-brilla{50%{filter:drop-shadow(0 0 2px #ffd27a44)}}
  @media (prefers-reduced-motion:reduce){.lo-ins.e-listo{animation:none}}
  .lo-ok-chk{color:var(--green);font-size:12px;font-weight:700;white-space:nowrap}
  .lo-info{font-size:12.5px;color:var(--muted);margin:4px 0 0}
  .lo-fila{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px;margin-top:8px}
  .lo-fila.comp{border-color:#2ecc7188}
  .lo-fh{display:flex;align-items:center;gap:8px;min-width:0}
  .lo-fh .ico{flex:0 0 auto}
  .lo-fh .grow{flex:1;min-width:0}
  .lo-fh b{display:block;font-size:14.5px;line-height:1.2}
  .lo-est{font-size:13px;letter-spacing:1px;color:var(--amber);white-space:nowrap}
  .lo-est i{font-style:normal;color:#3a4356}
  .lo-set{font-size:12px;color:var(--muted);overflow-wrap:anywhere}
  .lo-cells{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:6px;margin-top:8px}
  .lo-cell{display:flex;gap:8px;align-items:center;border:1px dashed var(--line);border-radius:10px;padding:7px 8px;min-width:0;background:#10131a}
  .lo-cell.si{border-style:solid;border-color:#ffd27a66;background:linear-gradient(135deg,#3a2c0c66,#10131a)}
  .lo-cell .lo-ci{position:relative;flex:0 0 34px;height:34px;border-radius:9px;display:grid;place-items:center;background:#1e2430;color:var(--amber)}
  .lo-cell.si .lo-ci{background:#2b210a;box-shadow:0 0 0 1px #ffd27a55 inset}
  .lo-cell.no .lo-ci{color:#3a4356}
  .lo-cell.no .lo-ci .ico{filter:brightness(.35)}
  .lo-cell.no .lo-ci::after{content:"?";position:absolute;inset:0;display:grid;place-items:center;font-family:var(--f-head);font-weight:800;font-size:18px;color:#8b95a8}
  .lo-cell small{display:block;font-size:11.5px;line-height:1.25;overflow-wrap:anywhere}
  .lo-cell.no small{color:var(--muted)}
  .lo-fp{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:12px;flex-wrap:wrap}
  .lo-fp span{min-width:0;overflow-wrap:anywhere}
  `;
  function ponerCss() {
    try {
      const doc = root.document;
      if (!doc || !doc.head || doc.getElementById('logros-css')) return;
      const el = doc.createElement('style'); el.id = 'logros-css'; el.textContent = CSS; doc.head.appendChild(el);
    } catch (e) { /* sin documento */ }
  }
  const escX = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const Mx = (ctx, n) => (ctx && typeof ctx.M === 'function' ? ctx.M(n) : G.money(n));
  const ic = (ctx, n) => { try { return ctx && typeof ctx.I === 'function' ? ctx.I(n, 'sm') : ''; } catch (e) { return ''; } };
  const nfmt = (ctx, n) => (ctx && typeof ctx.N === 'function' ? ctx.N(n) : String(n));
  function descripcion(d, ctx) {
    const p = { n: nfmt(ctx, d.meta), m: Mx(ctx, d.meta) };
    if (d.id === 'cap_2' || d.id === 'cap_4') p.n = d.meta + 1;
    if (d.p && d.p.tipos) p.lista = d.p.tipos.map(nombreEvento).join(', ');
    return t(d.d, p);
  }
  function estadoDe(L, id) { return L.reclamados[id] ? 'ok' : L.hechos[id] ? 'listo' : 'bloq'; }

  function tarjeta(ctx) {
    const s = ctx && ctx.S ? ctx.S() : null;
    if (!s) return '';
    ponerCss();
    vigilar(ctx);
    const L = est(s), r = resumen(s);
    // Tira: las últimas insignias logradas (o siluetas de lo que viene)
    const hechos = LOGROS.filter((d) => L.hechos[d.id]).sort((a, b) => (L.hechos[b.id] - L.hechos[a.id]) || (b.i - a.i));
    const siguientes = LOGROS.filter((d) => !L.hechos[d.id]).map((d) => ({ d, pct: Math.min(1, valor(s, d) / d.meta) })).sort((a, b) => b.pct - a.pct || a.d.i - b.d.i);
    const tira = hechos.slice(0, 5).map((d) => insignia(d.id, estadoDe(L, d.id), 44))
      .concat(siguientes.slice(0, Math.max(0, 6 - Math.min(5, hechos.length))).map((x) => insignia(x.d.id, 'bloq', 36))).join('');
    const pct = Math.round((r.hechos / r.total) * 100);
    return `<div class="card lo-card" data-logros="tarjeta">
      <div class="lo-tira" data-ext="logros" data-acc="abrir">${tira}</div>
      <h3>${escX(t('h_resumen', { n: r.hechos, m: r.total, c: r.combos }))}</h3>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="lo-sub small muted"><span>${escX(t('resumen_modal', { n: r.hechos, m: r.total, c: r.combos, k: r.totalCombos }))}</span>
        ${r.reclamar ? `<span class="lo-am">${escX(t('por_reclamar', { n: r.reclamar }))}</span>` : ''}</div>
      <div class="lo-btns">
        ${r.reclamar ? `<button class="btn green" data-ext="logros" data-acc="todo">${escX(t('reclamar_todo', { n: r.reclamar }))}</button>` : ''}
        <button class="btn main" data-ext="logros" data-acc="abrir">${ic(ctx, 'gem')} ${escX(t('ver'))}</button>
      </div></div>`;
  }

  let pestana = 'logros';
  function listaLogros(s, ctx) {
    const L = est(s);
    const orden = { listo: 0, bloq: 1, ok: 2 };
    const filas = LOGROS.map((d) => ({ d, e: estadoDe(L, d.id), v: Math.min(d.meta, valor(s, d)) }))
      .sort((a, b) => orden[a.e] - orden[b.e] || (a.e === 'bloq' ? (b.v / b.d.meta) - (a.v / a.d.meta) : 0) || a.d.i - b.d.i);
    return `<div class="lo-list">${filas.map(({ d, e, v }) => {
      const prem = textoPremio(premioDe(d.id), s, (n) => Mx(ctx, n));
      const btn = e === 'listo' ? `<button class="btn sm green" data-ext="logros" data-acc="reclamar" data-id="${d.id}">${escX(t('reclamar'))}</button>`
        : e === 'ok' ? `<span class="lo-ok-chk">${ic(ctx, 'check')} ${escX(t('reclamado'))}</span>` : '';
      const prog = e === 'bloq' ? `<div class="bar ${v / d.meta >= 0.5 ? 'amber' : ''}"><i style="width:${Math.round((v / d.meta) * 100)}%"></i></div>
        <div class="lo-d">${escX(t('progreso', { v: d.d === 'd_gana' ? Mx(ctx, v) : nfmt(ctx, Math.floor(v)), m: d.d === 'd_gana' ? Mx(ctx, d.meta) : nfmt(ctx, d.meta) }))}</div>` : '';
      return `<div class="lo-it e-${e}" data-logro="${d.id}">${insignia(d.id, e, 52)}
        <div class="grow"><b>${escX(nombre(d.id))}<span class="lo-tier ${d.tier}">${escX(t('t_' + d.tier))}</span></b>
          <div class="lo-d">${escX(descripcion(d, ctx))}</div>${prog}
          <div class="lo-p">${ic(ctx, 'gift')} ${escX(prem)}</div></div>${btn}</div>`;
    }).join('')}</div>`;
  }
  function estrellas(n) { let h = ''; for (let i = 1; i <= 5; i++) h += i <= n ? '★' : '<i>★</i>'; return h; }
  function listaCombos(s, ctx) {
    const L = est(s);
    return `<p class="lo-info">${escX(t('combos_info'))}</p>${LIBRO.map((f) => {
      const b = L.libro[f.tipo];
      const comp = filaCompleta(s, f.tipo), cobrada = !!L.filas[f.tipo];
      const set = !b ? t('sin_jugar') : b.viejo ? t('viejo')
        : [t('mejor', { q: b.q, d: b.dia }), t('armado', { p: b.personas, c: b.cams, t: b.total }), b.cam ? t('con_cam', { cam: nombreItem(b.cam) }) : ''].filter(Boolean).join(' · ');
      const cells = f.combos.map((c) => {
        const si = !!L.combos[c.id];
        const txt = si ? nombreCombo(c) : b ? t('pista', { equipo: t('e_' + c.eq) }) : t('secreto');
        return `<div class="lo-cell ${si ? 'si' : 'no'}" data-combo="${c.id}"><span class="lo-ci">${ic(ctx, EQUIPO[c.eq].ic)}</span><small>${escX(txt)}</small></div>`;
      }).join('');
      const prem = textoPremio(premioFila(f.tipo), s, (n) => Mx(ctx, n));
      const pie = cobrada ? `<span class="lo-ok-chk">${ic(ctx, 'check')} ${escX(t('fila_ok'))}</span>`
        : comp ? `<span class="lo-am">${escX(t('fila_premio', { premio: prem }))}</span><button class="btn sm green" data-ext="logros" data-acc="fila" data-tipo="${f.tipo}">${escX(t('reclamar'))}</button>`
          : `<span class="muted">${escX(t('fila_falta', { premio: prem }))}</span>`;
      return `<div class="lo-fila ${comp ? 'comp' : ''}" data-fila="${f.tipo}">
        <div class="lo-fh">${ic(ctx, f.tipo)}<div class="grow"><b>${escX(nombreEvento(f.tipo))}</b><div class="lo-set">${escX(set)}</div></div>
          <span class="lo-est" aria-label="${b ? b.e : 0}/5">${estrellas(b ? b.e : 0)}</span></div>
        <div class="lo-cells">${cells}</div><div class="lo-fp">${pie}</div></div>`;
    }).join('')}`;
  }
  function modalHtml(ctx) {
    const s = ctx.S();
    const r = resumen(s), L = est(s);
    const cerrar = ctx.T ? escX(ctx.T('comun.cerrar')) : 'X';
    const nL = LOGROS.filter((d) => L.hechos[d.id] && !L.reclamados[d.id]).length, nC = r.reclamar - nL;
    return `<div class="lo-modal">
      <div class="row between"><h2>${ic(ctx, 'gem')} ${escX(t('tit'))}</h2><button class="btn sm" data-act="close" aria-label="${cerrar}">${ic(ctx, 'close') || 'X'}</button></div>
      <p class="small muted" style="margin:4px 0 0">${escX(t('resumen_modal', { n: r.hechos, m: r.total, c: r.combos, k: r.totalCombos }))}</p>
      <div class="lo-tabs" role="tablist">
        <button role="tab" class="${pestana === 'logros' ? 'on' : ''}" aria-selected="${pestana === 'logros'}" data-ext="logros" data-acc="tab" data-t="logros">${escX(t('tab_logros'))}${nL ? `<b>${nL}</b>` : ''}</button>
        <button role="tab" class="${pestana === 'combos' ? 'on' : ''}" aria-selected="${pestana === 'combos'}" data-ext="logros" data-acc="tab" data-t="combos">${escX(t('tab_combos'))}${nC ? `<b>${nC}</b>` : ''}</button>
      </div>
      ${r.reclamar ? `<button class="btn green" data-ext="logros" data-acc="todo">${escX(t('reclamar_todo', { n: r.reclamar }))}</button>` : ''}
      ${pestana === 'combos' ? listaCombos(s, ctx) : listaLogros(s, ctx)}
    </div>`;
  }

  /* ---------- Avisos (toast) fuera del evento en vivo ---------- */
  let ctxV = null, reloj = null;
  function hayVentana() {
    try {
      const d = root.document;
      if (!d) return true;
      const ov = d.getElementById('overlay');
      return !!(ov && ov.classList.contains('on')) || !!d.querySelector('[aria-modal="true"]:not(#overlay)');
    } catch (e) { return true; }
  }
  function avisar() {
    const ctx = ctxV;
    const s = ctx && ctx.S ? ctx.S() : null;
    if (!s || !s.logros || s.currentEvent || s.gameOver) return;
    const L = s.logros;
    if (!L.porMostrar.length && !L.resumen) return;
    if (hayVentana()) return;
    const a = tomarAvisos(s);
    let msg = '';
    if (a.logros.length === 1) msg = t('toast_uno', { nombre: nombre(a.logros[0]) });
    else if (a.logros.length > 1) msg = t('toast_varios', { n: a.logros.length });
    else if (a.combos.length) msg = t('toast_combo', { nombre: nombreCombo(COMBO[a.combos[0]]) });
    if (a.resumen) msg = msg ? msg + ' · ' + t('toast_resumen', { n: resumen(s).reclamar }) : t('toast_resumen', { n: resumen(s).reclamar });
    if (!msg) return;
    try { if (ctx.toast) ctx.toast(msg); } catch (e) { /* sin toast */ }
    try { if (ctx.snd && ctx.snd.play) ctx.snd.play('good'); } catch (e) { /* sin sonido */ }
    try { if (ctx.save) ctx.save(); } catch (e) { /* sin guardar */ }
  }
  function vigilar(ctx) {
    ctxV = ctx;
    if (reloj || typeof setInterval !== 'function' || !root.document) return;
    reloj = setInterval(avisar, 700);
    setTimeout(avisar, 0);
  }

  let ultimo = { k: '', t: 0 };
  function clic(ctx, accion, el) {
    const s = ctx && ctx.S ? ctx.S() : null;
    if (!s) return;
    const attr = (n) => (el && el.getAttribute ? el.getAttribute(n) : null);
    const id = accion + ':' + (attr('data-id') || attr('data-tipo') || attr('data-t') || '');
    const ahora = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    if (ultimo.k === id && ahora - ultimo.t < 300) return;
    ultimo = { k: id, t: ahora };
    const abierto = () => { try { return !!(root.document && root.document.querySelector('#modal .lo-modal')); } catch (e) { return false; } };
    const reabrir = () => { const m = root.document.getElementById('modal'); const y = m ? m.scrollTop : 0; ctx.openModal(modalHtml(ctx)); if (m) m.scrollTop = y; };
    if (accion === 'abrir') { ponerCss(); est(s); revisar(s, false); ctx.openModal(modalHtml(ctx)); return; }
    if (accion === 'tab') { pestana = attr('data-t') === 'combos' ? 'combos' : 'logros'; ctx.openModal(modalHtml(ctx)); return; }
    let r = null;
    if (accion === 'reclamar') r = reclamar(s, attr('data-id'));
    else if (accion === 'fila') r = reclamarFila(s, attr('data-tipo'));
    else if (accion === 'todo') r = reclamarTodo(s);
    else return;
    try { if (r && r.msg && ctx.toast) ctx.toast(r.msg); } catch (e) { /* sin toast */ }
    try { if (ctx.snd && ctx.snd.play) ctx.snd.play(r && r.ok ? 'buy' : 'error'); } catch (e) { /* sin sonido */ }
    if (r && r.ok) { try { if (ctx.save) ctx.save(); } catch (e) { /* sin guardar */ } }
    const seguir = abierto();
    try { if (ctx.render) ctx.render(); } catch (e) { /* nada */ }
    if (seguir) reabrir();
  }

  const TARJETA = { id: 'logros', orden: 20, tarjeta, clic };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === 'logros')) root.EnVivoInicio.push(TARJETA);
  ponerCss();
  try {
    if (root.document && !(root.document.head)) root.document.addEventListener('DOMContentLoaded', ponerCss);
    if (root.I18N && root.I18N.onChange) root.I18N.onChange(registrarTextos);
  } catch (e) { /* sin documento */ }

  const API = { AJUSTE, LOGROS, POR_ID, LIBRO, COMBOS, COMBO, EQUIPO, TRAD, PL_TIT, EXT, TARJETA, t, migrar, revisar, alTerminarEvento,
    premioDe, premioFila, textoPremio, reclamar, reclamarFila, reclamarTodo, porReclamar, filaCompleta, resumen, tomarAvisos, valor,
    equipoDelEvento, insignia, tarjeta, modalHtml, clic, avisar, registrarTextos, nombre, nombreCombo };
  root.Logros = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
