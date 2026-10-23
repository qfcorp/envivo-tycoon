/* =========================================================
   EN VIVO Tycoon — Nivel de sede (mejoras tipo Kingshot)
   - La sede sube de nivel 1 a 30. Para subir, terminas TODAS las mejoras chicas del nivel
     (4 o 5 edificios: sala de control, bodega/taller, estudio, oficina comercial, unidad móvil
     y, desde el nivel 8, la escuela de personal) y después la obra de la sede principal.
   - Cada mejora cuesta materiales + dinero del juego y tarda días; tienes 1 equipo de obra
     (2 desde el nivel 5).
   - Materiales: entrega del día (1 vez por día), lo que dejan los eventos (más con 5 estrellas
     y al ganar un duelo) y reciclar equipos rotos o viejos. Nunca se compran con dinero real.
   - Bonos chicos (calidad, gastos, pago, cupos, taller) por la API de extensiones de logic.js.
   - Todo es determinista: el azar sale de un hash (semilla de la sede + día), sin tocar s.seed.
   Ver docs/SEDE.md.
   ========================================================= */
(function (root) {
  'use strict';
  const G0 = () => root.Game || (typeof require !== 'undefined' ? require('./logic.js') : null);
  let G = G0();

  /* ---------- Números para ajustar (docs/SEDE.md) ---------- */
  const AJUSTE = {
    maxNivel: 30,
    segundoObrero: 5,           // nivel desde el que tienes 2 equipos de obra
    escuelaDesde: 8,            // nivel objetivo desde el que aparece la escuela de personal
    raroDesde: 6,               // las mejoras desde el nivel 6 piden chips de video 4K
    // Mejora chica del nivel L: materiales = base × crec^(L-2) + porNivel × (L-2), dinero = dinero × L^dineroExp
    mat: { base: 9, crec: 1.105, porNivel: 1.2 },
    dinero: 12, dineroExp: 2,
    diasMejora: (L) => Math.ceil(L / 5),          // 1 día en los primeros niveles, 6 en el 30
    diasNivel: (L) => 1 + Math.ceil(L / 6),       // la obra de la sede principal (2 a 6 días)
    chipsMejora: (L) => (L >= 6 ? Math.ceil((L - 5) / 4) : 0), // en la sala de control y la escuela
    chipsNivel: (L) => (L >= 6 ? Math.ceil((L - 5) / 2) : 0),
    // Entrega del día: unidades = base + nivel × porNivel; desde el nivel chipDesde puede traer un chip
    cofre: { base: 4, porNivel: 0.55, chipDesde: 4, chipProb: 0.22, chipPorNivel: 0.012 },
    // Después de un evento: (dificultad + 1) × factor por estrellas × (1 + nivel × porNivel)
    evento: { estrellas: [0, 0.3, 0.6, 1, 1.35, 1.7], porNivel: 0.03, cincoExtra: 2, cincoChip: 0.4, dueloExtra: 3, dueloChip: 1, intlChip: 1 },
    reciclar: { porPrecio: 300, max: 14, min: 1, chipDesdeQ: 4, gastado: 40 },
    // Bonos (chicos): por cada mejora del edificio
    bono: {
      control: 0.4, estudio: 0.45, movil: 0.45,   // puntos de calidad (se redondea hacia abajo)
      topeCalidad: (n) => (n <= 10 ? Math.floor(0.6 * n) : Math.floor(6 + (n - 10) * 0.3)), // +6 al nivel 10, +12 al 30
      gastos: 0.008, gastosMax: 0.15,             // bodega: −0,8 % de gastos fijos por mejora (tope −15 %)
      pago: 0.004, pagoMax: 0.08,                 // oficina comercial: +0,4 % de pago por mejora (tope +8 %)
      staffCada: 3, staffMax: 3,                  // escuela: +1 lugar de personal cada 3 mejoras
      equipCada: 3, equipPor: 2, equipMax: 12,    // bodega: +2 lugares de bodega cada 3 mejoras
      tallerCada: 3, tallerMax: 4, tallerEquipos: 3, // taller: +1 % de estado cada 3 mejoras a los 3 equipos más gastados
    },
  };
  // Requisitos para llegar al nivel L (no saltarse la historia): fama mínima y capítulo (desde 0) o historia terminada
  function requisito(L) {
    const T = { 3: { fama: 6 }, 4: { cap: 1 }, 5: { fama: 12, cap: 1 }, 6: { fama: 15, cap: 2 }, 7: { fama: 18, cap: 2 }, 8: { fama: 22, cap: 2 },
      9: { fama: 25, cap: 3 }, 10: { cap: 4 }, 11: { fama: 32, cap: 4 }, 12: { cap: 5 } };
    if (L <= 12) return T[L] || {};
    return { historia: true, fama: Math.min(55, 30 + 2 * (L - 12)) };
  }

  const MATS = ['cables', 'placas', 'paneles', 'credenciales', 'planos', 'chips'];
  const COMUNES = MATS.slice(0, 5);
  const BASE5 = ['control', 'bodega', 'estudio', 'comercial', 'movil'];
  // Materiales de cada edificio (con su peso en el costo)
  const RECETA = {
    control: [['placas', 0.5], ['cables', 0.5]],
    bodega: [['cables', 0.55], ['planos', 0.45]],
    estudio: [['paneles', 0.6], ['credenciales', 0.4]],
    comercial: [['credenciales', 0.6], ['planos', 0.4]],
    movil: [['placas', 0.4], ['paneles', 0.3], ['cables', 0.3]],
    escuela: [['planos', 0.4], ['credenciales', 0.3], ['paneles', 0.3]],
    sede: [['planos', 0.35], ['placas', 0.35], ['paneles', 0.3]],
  };

  /* ---------- Textos (es + traducciones, registro "tú") ---------- */
  const TRAD = {};
  TRAD.es = {
    titulo: 'Nivel de sede', nivel: 'Nivel {n}', nivel_max: 'Nivel máximo', abrir: 'Mejorar', modal_titulo: 'Mejorar sede',
    modal_intro: 'Para llegar al nivel {n}, termina todas las mejoras de este nivel y después sube la sede.',
    obra: 'Equipo de obra', obra_libre: 'Libre', dias: '{n} días', dia1: '1 día',
    cofre: 'Reclamar entrega del día', cofre_ya: 'Entrega reclamada · vuelve mañana', cofre_ok: 'Entrega del día: {lista}',
    mejorar: 'Mejorar', listo: 'Listo', en_obra: 'En obra · {d}', falta: 'Te falta: {lista}',
    sin_equipo: 'Tu equipo de obra está ocupado', sin_plata: 'Te falta dinero ({m})', empezaste: 'Empezaste: {que} ({d})',
    termino: 'Obra terminada: {que}', subir: 'Subir a nivel {n}', subiendo: 'Sede principal → nivel {n}', subio: '¡Tu sede subió a nivel {n}!',
    req_titulo: 'Requisitos', req_fama: 'Fama {n}', req_cap: 'Capítulo {n} de la historia', req_historia: 'Terminar la historia',
    faltan_mejoras: 'Primero termina las mejoras de este nivel ({h}/{n})', req_no: 'Todavía no cumples los requisitos',
    bonos: 'Bonos de tu sede', sin_bonos: 'Todavía no tienes bonos: mejora tus edificios.',
    b_calidad_todos: '+{n} de calidad en todos los eventos', b_calidad_tipo: '+{n} de calidad en {tipos}',
    b_tipos_estudio: 'ruedas de prensa y bodas', b_tipos_deporte: 'deportes',
    b_gastos: '−{n} % en gastos fijos diarios', b_pago: '+{n} % de pago en los contratos', b_staff: '+{n} lugares de personal',
    b_equip: '+{n} lugares en la bodega', b_taller: 'El taller recupera +{n} % a tus {k} equipos más gastados después de cada evento',
    b_tope: 'Tope de calidad por la sede: +{n}',
    reciclar: 'Reciclar', reciclar_t: 'Reciclar equipos', reciclar_info: 'Desarma un equipo roto o viejo para sacar materiales. El equipo desaparece.',
    reciclar_nada: 'No tienes equipos rotos o viejos para reciclar.', reciclar_ok: 'Reciclaste {item}: {lista}',
    reciclar_q: '¿Reciclar {item}? Te da {lista} y el equipo desaparece.', en_evento: 'Primero termina el evento',
    'mat.cables': 'Cables y conectores', 'mat.placas': 'Placas electrónicas', 'mat.paneles': 'Paneles LED',
    'mat.credenciales': 'Credenciales de prensa', 'mat.planos': 'Planos técnicos', 'mat.chips': 'Chips de video 4K',
    'ed.control': 'Sala de control', 'ed.bodega': 'Bodega y taller técnico', 'ed.estudio': 'Estudio y set', 'ed.comercial': 'Oficina comercial',
    'ed.movil': 'Unidad móvil y garaje', 'ed.escuela': 'Escuela de personal', 'ed.sede': 'Sede principal',
    'desc.control': 'Calidad en todos los eventos', 'desc.bodega': 'Menos gastos fijos, más bodega y mantenimiento',
    'desc.estudio': 'Calidad en prensa y bodas', 'desc.comercial': 'Mejor pago de tus clientes', 'desc.movil': 'Calidad en deportes',
    'desc.escuela': 'Más lugares de personal', 'desc.sede': 'Sube el nivel de tu sede',
    extra_evento: 'Materiales del evento: {lista}', extra_5e: 'Bono 5 estrellas: {lista}', extra_duelo: 'Bono por ganarle a MegaVisión: {lista}',
    q_label: 'Sede: {ed}', segundo: 'Segundo equipo de obra en el nivel {n}', tienes: 'Tienes', max: '¡Tu sede está al máximo!',
    ed_nivel: 'Nv {n}', estado: 'Estado {n} %', obra_n: 'Obra {n}',
    // Plantillas de listas de materiales (sirven en todos los idiomas: cada nombre se traduce aparte)
    l1: '{n1} {m1}', l2: '{n1} {m1}, {n2} {m2}', l3: '{n1} {m1}, {n2} {m2}, {n3} {m3}', l4: '{n1} {m1}, {n2} {m2}, {n3} {m3}, {n4} {m4}',
    l5: '{n1} {m1}, {n2} {m2}, {n3} {m3}, {n4} {m4}, {n5} {m5}', l6: '{n1} {m1}, {n2} {m2}, {n3} {m3}, {n4} {m4}, {n5} {m5}, {n6} {m6}',
  };
  TRAD.en = {
    titulo: 'HQ level', nivel: 'Level {n}', nivel_max: 'Max level', abrir: 'Upgrade', modal_titulo: 'Upgrade HQ',
    modal_intro: 'To reach level {n}, finish every upgrade of this level and then level up your HQ.',
    obra: 'Build crew', obra_libre: 'Free', dias: '{n} days', dia1: '1 day',
    cofre: 'Claim daily delivery', cofre_ya: 'Delivery claimed · come back tomorrow', cofre_ok: 'Daily delivery: {lista}',
    mejorar: 'Upgrade', listo: 'Done', en_obra: 'Building · {d}', falta: 'You still need: {lista}',
    sin_equipo: 'Your build crew is busy', sin_plata: 'You need more money ({m})', empezaste: 'You started: {que} ({d})',
    termino: 'Build finished: {que}', subir: 'Level up to {n}', subiendo: 'Main HQ → level {n}', subio: 'Your HQ reached level {n}!',
    req_titulo: 'Requirements', req_fama: 'Fame {n}', req_cap: 'Story chapter {n}', req_historia: 'Finish the story',
    faltan_mejoras: 'First finish this level\'s upgrades ({h}/{n})', req_no: 'You don\'t meet the requirements yet',
    bonos: 'Your HQ bonuses', sin_bonos: 'No bonuses yet: upgrade your buildings.',
    b_calidad_todos: '+{n} quality on every event', b_calidad_tipo: '+{n} quality on {tipos}',
    b_tipos_estudio: 'press conferences and weddings', b_tipos_deporte: 'sports',
    b_gastos: '−{n}% daily fixed costs', b_pago: '+{n}% contract pay', b_staff: '+{n} staff slots',
    b_equip: '+{n} storage slots', b_taller: 'After each event the workshop restores +{n}% to your {k} most worn items',
    b_tope: 'HQ quality cap: +{n}',
    reciclar: 'Recycle', reciclar_t: 'Recycle gear', reciclar_info: 'Take apart a broken or old item to get materials. The item is gone.',
    reciclar_nada: 'You have no broken or old gear to recycle.', reciclar_ok: 'You recycled {item}: {lista}',
    reciclar_q: 'Recycle {item}? You get {lista} and the item is gone.', en_evento: 'Finish the event first',
    'mat.cables': 'Cables & connectors', 'mat.placas': 'Circuit boards', 'mat.paneles': 'LED panels',
    'mat.credenciales': 'Press passes', 'mat.planos': 'Blueprints', 'mat.chips': '4K video chips',
    'ed.control': 'Control room', 'ed.bodega': 'Storage & tech workshop', 'ed.estudio': 'Studio & set', 'ed.comercial': 'Sales office',
    'ed.movil': 'OB van & garage', 'ed.escuela': 'Staff school', 'ed.sede': 'Main HQ',
    'desc.control': 'Quality on every event', 'desc.bodega': 'Lower fixed costs, more storage and upkeep',
    'desc.estudio': 'Quality on press and weddings', 'desc.comercial': 'Better pay from clients', 'desc.movil': 'Quality on sports',
    'desc.escuela': 'More staff slots', 'desc.sede': 'Raises your HQ level',
    extra_evento: 'Event materials: {lista}', extra_5e: '5-star bonus: {lista}', extra_duelo: 'Bonus for beating MegaVisión: {lista}',
    q_label: 'HQ: {ed}', segundo: 'Second build crew at level {n}', tienes: 'You have', max: 'Your HQ is maxed out!',
    ed_nivel: 'Lv {n}', estado: 'Condition {n}%', obra_n: 'Build {n}',
  };
  TRAD['pt-BR'] = {
    titulo: 'Nível da sede', nivel: 'Nível {n}', nivel_max: 'Nível máximo', abrir: 'Melhorar', modal_titulo: 'Melhorar sede',
    modal_intro: 'Para chegar ao nível {n}, termine todas as melhorias deste nível e depois suba a sede.',
    obra: 'Equipe de obra', obra_libre: 'Livre', dias: '{n} dias', dia1: '1 dia',
    cofre: 'Pegar entrega do dia', cofre_ya: 'Entrega pega · volte amanhã', cofre_ok: 'Entrega do dia: {lista}',
    mejorar: 'Melhorar', listo: 'Pronto', en_obra: 'Em obra · {d}', falta: 'Falta: {lista}',
    sin_equipo: 'Sua equipe de obra está ocupada', sin_plata: 'Falta dinheiro ({m})', empezaste: 'Você começou: {que} ({d})',
    termino: 'Obra concluída: {que}', subir: 'Subir para nível {n}', subiendo: 'Sede principal → nível {n}', subio: 'Sua sede subiu para o nível {n}!',
    req_titulo: 'Requisitos', req_fama: 'Fama {n}', req_cap: 'Capítulo {n} da história', req_historia: 'Terminar a história',
    faltan_mejoras: 'Primeiro termine as melhorias deste nível ({h}/{n})', req_no: 'Você ainda não cumpre os requisitos',
    bonos: 'Bônus da sua sede', sin_bonos: 'Você ainda não tem bônus: melhore seus prédios.',
    b_calidad_todos: '+{n} de qualidade em todos os eventos', b_calidad_tipo: '+{n} de qualidade em {tipos}',
    b_tipos_estudio: 'coletivas de imprensa e casamentos', b_tipos_deporte: 'esportes',
    b_gastos: '−{n}% nos custos fixos diários', b_pago: '+{n}% de pagamento nos contratos', b_staff: '+{n} vagas de equipe',
    b_equip: '+{n} vagas no depósito', b_taller: 'Depois de cada evento a oficina recupera +{n}% dos seus {k} equipamentos mais gastos',
    b_tope: 'Limite de qualidade da sede: +{n}',
    reciclar: 'Reciclar', reciclar_t: 'Reciclar equipamentos', reciclar_info: 'Desmonte um equipamento quebrado ou velho para tirar materiais. Ele some.',
    reciclar_nada: 'Você não tem equipamentos quebrados ou velhos para reciclar.', reciclar_ok: 'Você reciclou {item}: {lista}',
    reciclar_q: 'Reciclar {item}? Você ganha {lista} e o equipamento some.', en_evento: 'Termine o evento primeiro',
    'mat.cables': 'Cabos e conectores', 'mat.placas': 'Placas eletrônicas', 'mat.paneles': 'Painéis de LED',
    'mat.credenciales': 'Credenciais de imprensa', 'mat.planos': 'Plantas técnicas', 'mat.chips': 'Chips de vídeo 4K',
    'ed.control': 'Sala de controle', 'ed.bodega': 'Depósito e oficina técnica', 'ed.estudio': 'Estúdio e set', 'ed.comercial': 'Escritório comercial',
    'ed.movil': 'Unidade móvel e garagem', 'ed.escuela': 'Escola de equipe', 'ed.sede': 'Sede principal',
    'desc.control': 'Qualidade em todos os eventos', 'desc.bodega': 'Menos custos fixos, mais depósito e manutenção',
    'desc.estudio': 'Qualidade em imprensa e casamentos', 'desc.comercial': 'Clientes pagam melhor', 'desc.movil': 'Qualidade em esportes',
    'desc.escuela': 'Mais vagas de equipe', 'desc.sede': 'Sobe o nível da sua sede',
    extra_evento: 'Materiais do evento: {lista}', extra_5e: 'Bônus 5 estrelas: {lista}', extra_duelo: 'Bônus por vencer a MegaVisión: {lista}',
    q_label: 'Sede: {ed}', segundo: 'Segunda equipe de obra no nível {n}', tienes: 'Você tem', max: 'Sua sede está no máximo!',
    ed_nivel: 'Nv {n}', estado: 'Estado {n}%', obra_n: 'Obra {n}',
  };
  TRAD.fr = {
    titulo: 'Niveau du QG', nivel: 'Niveau {n}', nivel_max: 'Niveau max', abrir: 'Améliorer', modal_titulo: 'Améliorer le QG',
    modal_intro: 'Pour atteindre le niveau {n}, termine toutes les améliorations de ce niveau puis fais monter ton QG.',
    obra: 'Équipe de chantier', obra_libre: 'Libre', dias: '{n} jours', dia1: '1 jour',
    cofre: 'Récupérer la livraison du jour', cofre_ya: 'Livraison récupérée · reviens demain', cofre_ok: 'Livraison du jour : {lista}',
    mejorar: 'Améliorer', listo: 'Fini', en_obra: 'En chantier · {d}', falta: 'Il te manque : {lista}',
    sin_equipo: 'Ton équipe de chantier est occupée', sin_plata: 'Il te manque de l\'argent ({m})', empezaste: 'Tu as lancé : {que} ({d})',
    termino: 'Chantier terminé : {que}', subir: 'Passer au niveau {n}', subiendo: 'QG principal → niveau {n}', subio: 'Ton QG passe au niveau {n} !',
    req_titulo: 'Conditions', req_fama: 'Renommée {n}', req_cap: 'Chapitre {n} de l\'histoire', req_historia: 'Finir l\'histoire',
    faltan_mejoras: 'Termine d\'abord les améliorations de ce niveau ({h}/{n})', req_no: 'Tu ne remplis pas encore les conditions',
    bonos: 'Bonus de ton QG', sin_bonos: 'Pas encore de bonus : améliore tes bâtiments.',
    b_calidad_todos: '+{n} de qualité sur tous les événements', b_calidad_tipo: '+{n} de qualité sur {tipos}',
    b_tipos_estudio: 'conférences de presse et mariages', b_tipos_deporte: 'sports',
    b_gastos: '−{n} % de frais fixes par jour', b_pago: '+{n} % de paiement sur les contrats', b_staff: '+{n} places d\'équipe',
    b_equip: '+{n} places d\'entrepôt', b_taller: 'Après chaque événement, l\'atelier rend +{n} % à tes {k} équipements les plus usés',
    b_tope: 'Plafond de qualité du QG : +{n}',
    reciclar: 'Recycler', reciclar_t: 'Recycler du matériel', reciclar_info: 'Démonte un équipement cassé ou vieux pour récupérer des matériaux. Il disparaît.',
    reciclar_nada: 'Tu n\'as pas de matériel cassé ou vieux à recycler.', reciclar_ok: 'Tu as recyclé {item} : {lista}',
    reciclar_q: 'Recycler {item} ? Tu obtiens {lista} et l\'équipement disparaît.', en_evento: 'Termine d\'abord l\'événement',
    'mat.cables': 'Câbles et connecteurs', 'mat.placas': 'Cartes électroniques', 'mat.paneles': 'Panneaux LED',
    'mat.credenciales': 'Accréditations presse', 'mat.planos': 'Plans techniques', 'mat.chips': 'Puces vidéo 4K',
    'ed.control': 'Régie', 'ed.bodega': 'Entrepôt et atelier technique', 'ed.estudio': 'Studio et plateau', 'ed.comercial': 'Bureau commercial',
    'ed.movil': 'Car régie et garage', 'ed.escuela': 'École du personnel', 'ed.sede': 'QG principal',
    'desc.control': 'Qualité sur tous les événements', 'desc.bodega': 'Moins de frais fixes, plus d\'entrepôt et d\'entretien',
    'desc.estudio': 'Qualité en presse et mariages', 'desc.comercial': 'Les clients paient mieux', 'desc.movil': 'Qualité en sports',
    'desc.escuela': 'Plus de places d\'équipe', 'desc.sede': 'Fait monter le niveau de ton QG',
    extra_evento: 'Matériaux de l\'événement : {lista}', extra_5e: 'Bonus 5 étoiles : {lista}', extra_duelo: 'Bonus pour avoir battu MegaVisión : {lista}',
    q_label: 'QG : {ed}', segundo: 'Deuxième équipe de chantier au niveau {n}', tienes: 'Tu as', max: 'Ton QG est au maximum !',
    ed_nivel: 'Nv {n}', estado: 'État {n} %', obra_n: 'Chantier {n}',
  };
  TRAD.de = {
    titulo: 'Zentralen-Stufe', nivel: 'Stufe {n}', nivel_max: 'Höchste Stufe', abrir: 'Ausbauen', modal_titulo: 'Zentrale ausbauen',
    modal_intro: 'Für Stufe {n} schließt du alle Ausbauten dieser Stufe ab und baust dann deine Zentrale aus.',
    obra: 'Bautrupp', obra_libre: 'Frei', dias: '{n} Tage', dia1: '1 Tag',
    cofre: 'Tageslieferung abholen', cofre_ya: 'Lieferung abgeholt · komm morgen wieder', cofre_ok: 'Tageslieferung: {lista}',
    mejorar: 'Ausbauen', listo: 'Fertig', en_obra: 'Im Bau · {d}', falta: 'Dir fehlt: {lista}',
    sin_equipo: 'Dein Bautrupp ist beschäftigt', sin_plata: 'Dir fehlt Geld ({m})', empezaste: 'Du hast gestartet: {que} ({d})',
    termino: 'Bau fertig: {que}', subir: 'Auf Stufe {n}', subiendo: 'Hauptgebäude → Stufe {n}', subio: 'Deine Zentrale ist jetzt Stufe {n}!',
    req_titulo: 'Voraussetzungen', req_fama: 'Ruhm {n}', req_cap: 'Kapitel {n} der Story', req_historia: 'Story abschließen',
    faltan_mejoras: 'Schließ zuerst die Ausbauten dieser Stufe ab ({h}/{n})', req_no: 'Du erfüllst die Voraussetzungen noch nicht',
    bonos: 'Boni deiner Zentrale', sin_bonos: 'Noch keine Boni: bau deine Gebäude aus.',
    b_calidad_todos: '+{n} Qualität bei allen Events', b_calidad_tipo: '+{n} Qualität bei {tipos}',
    b_tipos_estudio: 'Pressekonferenzen und Hochzeiten', b_tipos_deporte: 'Sport',
    b_gastos: '−{n} % tägliche Fixkosten', b_pago: '+{n} % Bezahlung bei Aufträgen', b_staff: '+{n} Plätze fürs Team',
    b_equip: '+{n} Lagerplätze', b_taller: 'Nach jedem Event stellt die Werkstatt +{n} % bei deinen {k} abgenutztesten Geräten wieder her',
    b_tope: 'Qualitätsgrenze der Zentrale: +{n}',
    reciclar: 'Recyceln', reciclar_t: 'Geräte recyceln', reciclar_info: 'Zerleg ein kaputtes oder altes Gerät für Materialien. Das Gerät ist dann weg.',
    reciclar_nada: 'Du hast keine kaputten oder alten Geräte zum Recyceln.', reciclar_ok: 'Du hast {item} recycelt: {lista}',
    reciclar_q: '{item} recyceln? Du bekommst {lista} und das Gerät ist weg.', en_evento: 'Schließ zuerst das Event ab',
    'mat.cables': 'Kabel und Stecker', 'mat.placas': 'Platinen', 'mat.paneles': 'LED-Panels',
    'mat.credenciales': 'Presseausweise', 'mat.planos': 'Baupläne', 'mat.chips': '4K-Videochips',
    'ed.control': 'Regieraum', 'ed.bodega': 'Lager und Technikwerkstatt', 'ed.estudio': 'Studio und Set', 'ed.comercial': 'Vertriebsbüro',
    'ed.movil': 'Ü-Wagen und Garage', 'ed.escuela': 'Teamschule', 'ed.sede': 'Hauptgebäude',
    'desc.control': 'Qualität bei allen Events', 'desc.bodega': 'Weniger Fixkosten, mehr Lager und Wartung',
    'desc.estudio': 'Qualität bei Presse und Hochzeiten', 'desc.comercial': 'Kunden zahlen besser', 'desc.movil': 'Qualität bei Sport',
    'desc.escuela': 'Mehr Plätze fürs Team', 'desc.sede': 'Erhöht die Stufe deiner Zentrale',
    extra_evento: 'Materialien vom Event: {lista}', extra_5e: '5-Sterne-Bonus: {lista}', extra_duelo: 'Bonus für den Sieg gegen MegaVisión: {lista}',
    q_label: 'Zentrale: {ed}', segundo: 'Zweiter Bautrupp ab Stufe {n}', tienes: 'Du hast', max: 'Deine Zentrale ist voll ausgebaut!',
    ed_nivel: 'St. {n}', estado: 'Zustand {n} %', obra_n: 'Bau {n}',
  };
  TRAD.it = {
    titulo: 'Livello della sede', nivel: 'Livello {n}', nivel_max: 'Livello massimo', abrir: 'Migliora', modal_titulo: 'Migliora la sede',
    modal_intro: 'Per arrivare al livello {n}, completa tutti i miglioramenti di questo livello e poi fai salire la sede.',
    obra: 'Squadra di cantiere', obra_libre: 'Libera', dias: '{n} giorni', dia1: '1 giorno',
    cofre: 'Ritira la consegna del giorno', cofre_ya: 'Consegna ritirata · torna domani', cofre_ok: 'Consegna del giorno: {lista}',
    mejorar: 'Migliora', listo: 'Fatto', en_obra: 'In cantiere · {d}', falta: 'Ti manca: {lista}',
    sin_equipo: 'La tua squadra di cantiere è occupata', sin_plata: 'Ti mancano soldi ({m})', empezaste: 'Hai avviato: {que} ({d})',
    termino: 'Cantiere finito: {que}', subir: 'Sali al livello {n}', subiendo: 'Sede principale → livello {n}', subio: 'La tua sede è salita al livello {n}!',
    req_titulo: 'Requisiti', req_fama: 'Fama {n}', req_cap: 'Capitolo {n} della storia', req_historia: 'Finire la storia',
    faltan_mejoras: 'Prima completa i miglioramenti di questo livello ({h}/{n})', req_no: 'Non hai ancora i requisiti',
    bonos: 'Bonus della tua sede', sin_bonos: 'Ancora nessun bonus: migliora i tuoi edifici.',
    b_calidad_todos: '+{n} di qualità in tutti gli eventi', b_calidad_tipo: '+{n} di qualità in {tipos}',
    b_tipos_estudio: 'conferenze stampa e matrimoni', b_tipos_deporte: 'sport',
    b_gastos: '−{n}% di costi fissi giornalieri', b_pago: '+{n}% di paga nei contratti', b_staff: '+{n} posti per lo staff',
    b_equip: '+{n} posti in magazzino', b_taller: 'Dopo ogni evento l\'officina recupera +{n}% ai tuoi {k} apparecchi più usurati',
    b_tope: 'Tetto di qualità della sede: +{n}',
    reciclar: 'Ricicla', reciclar_t: 'Ricicla attrezzatura', reciclar_info: 'Smonta un apparecchio rotto o vecchio per ricavare materiali. L\'apparecchio sparisce.',
    reciclar_nada: 'Non hai attrezzatura rotta o vecchia da riciclare.', reciclar_ok: 'Hai riciclato {item}: {lista}',
    reciclar_q: 'Riciclare {item}? Ottieni {lista} e l\'apparecchio sparisce.', en_evento: 'Prima finisci l\'evento',
    'mat.cables': 'Cavi e connettori', 'mat.placas': 'Schede elettroniche', 'mat.paneles': 'Pannelli LED',
    'mat.credenciales': 'Pass stampa', 'mat.planos': 'Progetti tecnici', 'mat.chips': 'Chip video 4K',
    'ed.control': 'Regia', 'ed.bodega': 'Magazzino e officina tecnica', 'ed.estudio': 'Studio e set', 'ed.comercial': 'Ufficio commerciale',
    'ed.movil': 'Regia mobile e garage', 'ed.escuela': 'Scuola dello staff', 'ed.sede': 'Sede principale',
    'desc.control': 'Qualità in tutti gli eventi', 'desc.bodega': 'Meno costi fissi, più magazzino e manutenzione',
    'desc.estudio': 'Qualità in stampa e matrimoni', 'desc.comercial': 'I clienti pagano meglio', 'desc.movil': 'Qualità negli sport',
    'desc.escuela': 'Più posti per lo staff', 'desc.sede': 'Alza il livello della tua sede',
    extra_evento: 'Materiali dall\'evento: {lista}', extra_5e: 'Bonus 5 stelle: {lista}', extra_duelo: 'Bonus per aver battuto MegaVisión: {lista}',
    q_label: 'Sede: {ed}', segundo: 'Seconda squadra di cantiere al livello {n}', tienes: 'Hai', max: 'La tua sede è al massimo!',
    ed_nivel: 'Lv {n}', estado: 'Stato {n}%', obra_n: 'Cantiere {n}',
  };
  TRAD.ru = {
    titulo: 'Уровень штаба', nivel: 'Уровень {n}', nivel_max: 'Макс. уровень', abrir: 'Улучшить', modal_titulo: 'Улучшить штаб',
    modal_intro: 'Чтобы дойти до уровня {n}, заверши все улучшения этого уровня, а потом повысь штаб.',
    obra: 'Строительная бригада', obra_libre: 'Свободна', dias: 'дн.: {n}', dia1: '1 дн.',
    cofre: 'Забрать поставку дня', cofre_ya: 'Поставка получена · возвращайся завтра', cofre_ok: 'Поставка дня: {lista}',
    mejorar: 'Улучшить', listo: 'Готово', en_obra: 'Строится · {d}', falta: 'Не хватает: {lista}',
    sin_equipo: 'Твоя бригада занята', sin_plata: 'Не хватает денег ({m})', empezaste: 'Ты начал: {que} ({d})',
    termino: 'Стройка завершена: {que}', subir: 'Повысить до уровня {n}', subiendo: 'Главный штаб → уровень {n}', subio: 'Твой штаб достиг уровня {n}!',
    req_titulo: 'Требования', req_fama: 'Слава {n}', req_cap: 'Глава {n} сюжета', req_historia: 'Пройти сюжет',
    faltan_mejoras: 'Сначала заверши улучшения этого уровня ({h}/{n})', req_no: 'Ты пока не выполняешь требования',
    bonos: 'Бонусы твоего штаба', sin_bonos: 'Бонусов пока нет: улучшай здания.',
    b_calidad_todos: '+{n} к качеству на всех событиях', b_calidad_tipo: '+{n} к качеству: {tipos}',
    b_tipos_estudio: 'пресс-конференции и свадьбы', b_tipos_deporte: 'спорт',
    b_gastos: '−{n}% ежедневных расходов', b_pago: '+{n}% к оплате контрактов', b_staff: '+{n} мест для команды',
    b_equip: '+{n} мест на складе', b_taller: 'После каждого события мастерская восстанавливает +{n}% {k} самым изношенным устройствам',
    b_tope: 'Предел качества от штаба: +{n}',
    reciclar: 'Разобрать', reciclar_t: 'Переработка техники', reciclar_info: 'Разбери сломанную или старую технику на материалы. Она исчезнет.',
    reciclar_nada: 'У тебя нет сломанной или старой техники для разборки.', reciclar_ok: 'Ты разобрал {item}: {lista}',
    reciclar_q: 'Разобрать {item}? Ты получишь {lista}, а техника исчезнет.', en_evento: 'Сначала закончи событие',
    'mat.cables': 'Кабели и разъёмы', 'mat.placas': 'Электронные платы', 'mat.paneles': 'LED-панели',
    'mat.credenciales': 'Пресс-аккредитации', 'mat.planos': 'Технические чертежи', 'mat.chips': 'Видеочипы 4K',
    'ed.control': 'Аппаратная', 'ed.bodega': 'Склад и техмастерская', 'ed.estudio': 'Студия и съёмочная площадка', 'ed.comercial': 'Отдел продаж',
    'ed.movil': 'ПТС и гараж', 'ed.escuela': 'Школа персонала', 'ed.sede': 'Главный штаб',
    'desc.control': 'Качество на всех событиях', 'desc.bodega': 'Меньше расходов, больше склада и обслуживания',
    'desc.estudio': 'Качество на пресс-конференциях и свадьбах', 'desc.comercial': 'Клиенты платят больше', 'desc.movil': 'Качество в спорте',
    'desc.escuela': 'Больше мест для команды', 'desc.sede': 'Повышает уровень штаба',
    extra_evento: 'Материалы с события: {lista}', extra_5e: 'Бонус за 5 звёзд: {lista}', extra_duelo: 'Бонус за победу над MegaVisión: {lista}',
    q_label: 'Штаб: {ed}', segundo: 'Вторая бригада на уровне {n}', tienes: 'У тебя', max: 'Твой штаб улучшен до максимума!',
    ed_nivel: 'Ур. {n}', estado: 'Состояние {n}%', obra_n: 'Стройка {n}',
  };
  TRAD.tr = {
    titulo: 'Merkez seviyesi', nivel: 'Seviye {n}', nivel_max: 'En yüksek seviye', abrir: 'Geliştir', modal_titulo: 'Merkezi geliştir',
    modal_intro: 'Seviye {n} için bu seviyedeki tüm geliştirmeleri bitir, sonra merkezini yükselt.',
    obra: 'İnşaat ekibi', obra_libre: 'Boşta', dias: '{n} gün', dia1: '1 gün',
    cofre: 'Günün teslimatını al', cofre_ya: 'Teslimat alındı · yarın tekrar gel', cofre_ok: 'Günün teslimatı: {lista}',
    mejorar: 'Geliştir', listo: 'Tamam', en_obra: 'İnşaatta · {d}', falta: 'Eksiğin: {lista}',
    sin_equipo: 'İnşaat ekibin meşgul', sin_plata: 'Paran yetmiyor ({m})', empezaste: 'Başlattın: {que} ({d})',
    termino: 'İnşaat bitti: {que}', subir: 'Seviye {n} yap', subiendo: 'Ana merkez → seviye {n}', subio: 'Merkezin seviye {n} oldu!',
    req_titulo: 'Gereksinimler', req_fama: 'Ün {n}', req_cap: 'Hikâyenin {n}. bölümü', req_historia: 'Hikâyeyi bitir',
    faltan_mejoras: 'Önce bu seviyenin geliştirmelerini bitir ({h}/{n})', req_no: 'Henüz gereksinimleri karşılamıyorsun',
    bonos: 'Merkezinin bonusları', sin_bonos: 'Henüz bonusun yok: binalarını geliştir.',
    b_calidad_todos: 'Tüm etkinliklerde +{n} kalite', b_calidad_tipo: '{tipos} için +{n} kalite',
    b_tipos_estudio: 'basın toplantıları ve düğünler', b_tipos_deporte: 'spor',
    b_gastos: 'Günlük sabit giderlerde −%{n}', b_pago: 'Sözleşmelerde +%{n} ödeme', b_staff: '+{n} ekip yeri',
    b_equip: '+{n} depo yeri', b_taller: 'Her etkinlikten sonra atölye en yıpranmış {k} ekipmanına +%{n} durum kazandırır',
    b_tope: 'Merkezin kalite sınırı: +{n}',
    reciclar: 'Geri dönüştür', reciclar_t: 'Ekipman geri dönüşümü', reciclar_info: 'Bozuk ya da eski bir ekipmanı sökerek malzeme çıkar. Ekipman yok olur.',
    reciclar_nada: 'Geri dönüştürecek bozuk ya da eski ekipmanın yok.', reciclar_ok: '{item} geri dönüştürüldü: {lista}',
    reciclar_q: '{item} geri dönüştürülsün mü? {lista} alırsın ve ekipman yok olur.', en_evento: 'Önce etkinliği bitir',
    'mat.cables': 'Kablolar ve konektörler', 'mat.placas': 'Elektronik kartlar', 'mat.paneles': 'LED paneller',
    'mat.credenciales': 'Basın kartları', 'mat.planos': 'Teknik planlar', 'mat.chips': '4K video çipleri',
    'ed.control': 'Kontrol odası', 'ed.bodega': 'Depo ve teknik atölye', 'ed.estudio': 'Stüdyo ve set', 'ed.comercial': 'Satış ofisi',
    'ed.movil': 'Yayın aracı ve garaj', 'ed.escuela': 'Personel okulu', 'ed.sede': 'Ana merkez',
    'desc.control': 'Tüm etkinliklerde kalite', 'desc.bodega': 'Daha az sabit gider, daha çok depo ve bakım',
    'desc.estudio': 'Basın ve düğünlerde kalite', 'desc.comercial': 'Müşteriler daha iyi öder', 'desc.movil': 'Sporda kalite',
    'desc.escuela': 'Daha çok ekip yeri', 'desc.sede': 'Merkezinin seviyesini yükseltir',
    extra_evento: 'Etkinlikten malzemeler: {lista}', extra_5e: '5 yıldız bonusu: {lista}', extra_duelo: 'MegaVisión\'ı yenme bonusu: {lista}',
    q_label: 'Merkez: {ed}', segundo: 'Seviye {n}\'de ikinci inşaat ekibi', tienes: 'Sende', max: 'Merkezin en üst seviyede!',
    ed_nivel: 'Sv {n}', estado: 'Durum %{n}', obra_n: 'İnşaat {n}',
  };
  TRAD.id = {
    titulo: 'Level markas', nivel: 'Level {n}', nivel_max: 'Level maksimal', abrir: 'Tingkatkan', modal_titulo: 'Tingkatkan markas',
    modal_intro: 'Untuk mencapai level {n}, selesaikan semua peningkatan di level ini lalu naikkan markasmu.',
    obra: 'Tim bangunan', obra_libre: 'Kosong', dias: '{n} hari', dia1: '1 hari',
    cofre: 'Ambil kiriman hari ini', cofre_ya: 'Kiriman sudah diambil · kembali besok', cofre_ok: 'Kiriman hari ini: {lista}',
    mejorar: 'Tingkatkan', listo: 'Selesai', en_obra: 'Dibangun · {d}', falta: 'Kamu masih kurang: {lista}',
    sin_equipo: 'Tim bangunanmu sedang sibuk', sin_plata: 'Uangmu kurang ({m})', empezaste: 'Kamu mulai: {que} ({d})',
    termino: 'Bangunan selesai: {que}', subir: 'Naik ke level {n}', subiendo: 'Markas utama → level {n}', subio: 'Markasmu naik ke level {n}!',
    req_titulo: 'Syarat', req_fama: 'Ketenaran {n}', req_cap: 'Bab {n} cerita', req_historia: 'Tamatkan cerita',
    faltan_mejoras: 'Selesaikan dulu peningkatan level ini ({h}/{n})', req_no: 'Kamu belum memenuhi syarat',
    bonos: 'Bonus markasmu', sin_bonos: 'Belum ada bonus: tingkatkan bangunanmu.',
    b_calidad_todos: '+{n} kualitas di semua acara', b_calidad_tipo: '+{n} kualitas di {tipos}',
    b_tipos_estudio: 'konferensi pers dan pernikahan', b_tipos_deporte: 'olahraga',
    b_gastos: '−{n}% biaya tetap harian', b_pago: '+{n}% bayaran kontrak', b_staff: '+{n} slot kru',
    b_equip: '+{n} slot gudang', b_taller: 'Setelah tiap acara, bengkel memulihkan +{n}% pada {k} alat paling aus',
    b_tope: 'Batas kualitas markas: +{n}',
    reciclar: 'Daur ulang', reciclar_t: 'Daur ulang alat', reciclar_info: 'Bongkar alat rusak atau tua untuk dapat bahan. Alatnya hilang.',
    reciclar_nada: 'Kamu tidak punya alat rusak atau tua untuk didaur ulang.', reciclar_ok: 'Kamu mendaur ulang {item}: {lista}',
    reciclar_q: 'Daur ulang {item}? Kamu dapat {lista} dan alatnya hilang.', en_evento: 'Selesaikan acaranya dulu',
    'mat.cables': 'Kabel dan konektor', 'mat.placas': 'Papan elektronik', 'mat.paneles': 'Panel LED',
    'mat.credenciales': 'Kartu pers', 'mat.planos': 'Cetak biru teknis', 'mat.chips': 'Cip video 4K',
    'ed.control': 'Ruang kontrol', 'ed.bodega': 'Gudang dan bengkel teknis', 'ed.estudio': 'Studio dan set', 'ed.comercial': 'Kantor penjualan',
    'ed.movil': 'Mobil OB dan garasi', 'ed.escuela': 'Sekolah kru', 'ed.sede': 'Markas utama',
    'desc.control': 'Kualitas di semua acara', 'desc.bodega': 'Biaya tetap turun, gudang dan perawatan naik',
    'desc.estudio': 'Kualitas di pers dan pernikahan', 'desc.comercial': 'Klien membayar lebih baik', 'desc.movil': 'Kualitas di olahraga',
    'desc.escuela': 'Lebih banyak slot kru', 'desc.sede': 'Menaikkan level markasmu',
    extra_evento: 'Bahan dari acara: {lista}', extra_5e: 'Bonus 5 bintang: {lista}', extra_duelo: 'Bonus mengalahkan MegaVisión: {lista}',
    q_label: 'Markas: {ed}', segundo: 'Tim bangunan kedua di level {n}', tienes: 'Kamu punya', max: 'Markasmu sudah maksimal!',
    ed_nivel: 'Lv {n}', estado: 'Kondisi {n}%', obra_n: 'Bangunan {n}',
  };
  TRAD['zh-CN'] = {
    titulo: '总部等级', nivel: '等级 {n}', nivel_max: '最高等级', abrir: '升级', modal_titulo: '升级总部',
    modal_intro: '要升到 {n} 级，先完成本级的所有升级，再升级你的总部。',
    obra: '施工队', obra_libre: '空闲', dias: '{n} 天', dia1: '1 天',
    cofre: '领取今日补给', cofre_ya: '已领取 · 明天再来', cofre_ok: '今日补给：{lista}',
    mejorar: '升级', listo: '完成', en_obra: '施工中 · {d}', falta: '你还缺：{lista}',
    sin_equipo: '你的施工队正忙', sin_plata: '你的钱不够（{m}）', empezaste: '你开始了：{que}（{d}）',
    termino: '施工完成：{que}', subir: '升到 {n} 级', subiendo: '总部主楼 → {n} 级', subio: '你的总部升到了 {n} 级！',
    req_titulo: '条件', req_fama: '名气 {n}', req_cap: '剧情第 {n} 章', req_historia: '通关剧情',
    faltan_mejoras: '先完成本级的升级（{h}/{n}）', req_no: '你还没达到条件',
    bonos: '总部加成', sin_bonos: '还没有加成：去升级你的建筑吧。',
    b_calidad_todos: '所有活动质量 +{n}', b_calidad_tipo: '{tipos}质量 +{n}',
    b_tipos_estudio: '新闻发布会和婚礼', b_tipos_deporte: '体育',
    b_gastos: '每日固定开支 −{n}%', b_pago: '合同报酬 +{n}%', b_staff: '员工名额 +{n}',
    b_equip: '仓库位置 +{n}', b_taller: '每次活动后，车间为你磨损最严重的 {k} 件设备恢复 +{n}%',
    b_tope: '总部质量加成上限：+{n}',
    reciclar: '回收', reciclar_t: '回收设备', reciclar_info: '拆掉坏掉或老旧的设备换取材料。设备会消失。',
    reciclar_nada: '你没有可以回收的坏掉或老旧设备。', reciclar_ok: '你回收了 {item}：{lista}',
    reciclar_q: '回收 {item}？你会得到 {lista}，设备会消失。', en_evento: '先完成活动',
    'mat.cables': '线缆和接头', 'mat.placas': '电路板', 'mat.paneles': 'LED 面板',
    'mat.credenciales': '记者证', 'mat.planos': '技术图纸', 'mat.chips': '4K 视频芯片',
    'ed.control': '导播室', 'ed.bodega': '仓库和技术车间', 'ed.estudio': '演播室和布景', 'ed.comercial': '商务办公室',
    'ed.movil': '转播车和车库', 'ed.escuela': '员工学校', 'ed.sede': '总部主楼',
    'desc.control': '所有活动的质量', 'desc.bodega': '降低固定开支，扩充仓库并保养设备',
    'desc.estudio': '发布会和婚礼的质量', 'desc.comercial': '客户付得更多', 'desc.movil': '体育赛事的质量',
    'desc.escuela': '更多员工名额', 'desc.sede': '提升总部等级',
    extra_evento: '活动材料：{lista}', extra_5e: '五星奖励：{lista}', extra_duelo: '击败 MegaVisión 的奖励：{lista}',
    q_label: '总部：{ed}', segundo: '{n} 级解锁第二支施工队', tienes: '你有', max: '你的总部已满级！',
    ed_nivel: '{n} 级', estado: '状态 {n}%', obra_n: '施工 {n}',
  };
  /* Textos de la sede oficial (servidor: con cuenta y conexión). Mismas claves en los 10 idiomas. */
  const TRAD_OF = {
    es: {
      of_titulo: 'Sede oficial', of_tag: 'Oficial', of_info: 'Cuenta en la Copa y los Duelos: +{n} de calidad', of_conectando: 'Conectando con tu sede oficial…',
      of_fuentes: 'En tu sede oficial los materiales salen de la entrega diaria, los eventos en línea, la Copa, las ayudas y los packs.',
      of_acelerar: 'Terminar ya · {n} créditos', of_acelerar_q: '¿Terminar ya {que}? Cuesta {n} créditos (tienes {c}).', of_acelerar_si: 'Terminar ya',
      of_acelerado: 'Obra terminada: {que}', of_acel: 'Aceleradores: {t}', of_usar_acel: 'Usar aceleradores', of_acel_ok: 'Usaste {t} de aceleradores',
      of_ayudas_t: 'Ayuda a tu asociación', of_ayudas_info: 'Cada ayuda le quita 1 % o 5 minutos a una obra (máximo {m} por obra) y te da 1 material.',
      of_ayudas_nada: 'Nadie de tu asociación tiene obras para ayudar ahora.', of_sin_asoc: 'Únete a una asociación para dar y recibir ayudas.',
      of_ayudar: 'Ayudar', of_ayuda_ok: 'Ayudaste: −{t}', of_ayuda_premio: 'Ayudaste: −{t}. Recibiste {lista}', of_ayudas_hoy: 'Hoy: {n}/{m} ayudas',
      of_ayudas_obra: 'Ayudas {n}/{m}', of_migrado: 'Tu sede pasó a tu cuenta: nivel {n}', of_migrado_tope: 'Tu sede pasó a tu cuenta con tope: nivel {n}',
      of_t_h: '{h} h', of_t_hm: '{h} h {m} min', of_t_m: '{m} min', of_t_0: 'menos de 1 min', of_cofre_vuelve: 'Entrega reclamada · vuelve en {t}',
      of_red: 'No se pudo conectar con tu sede oficial. Intenta de nuevo.', of_costo_cambio: 'El costo cambió: ahora son {n} créditos.',
      of_sin_creditos: 'Te faltan créditos: necesitas {n}.', of_ya_ayudaste: 'Ya ayudaste en esa obra.', of_ayudas_completas: 'Esa obra ya recibió todas las ayudas.',
      of_tope_dia: 'Ya diste todas tus ayudas de hoy. Vuelve mañana.', of_espera: 'Espera a que termine la acción anterior.',
    },
    en: {
      of_titulo: 'Official HQ', of_tag: 'Official', of_info: 'Counts in the Cup and Duels: +{n} quality', of_conectando: 'Connecting to your official HQ…',
      of_fuentes: 'In your official HQ, materials come from the daily delivery, online events, the Cup, helps and packs.',
      of_acelerar: 'Finish now · {n} credits', of_acelerar_q: 'Finish {que} now? It costs {n} credits (you have {c}).', of_acelerar_si: 'Finish now',
      of_acelerado: 'Build finished: {que}', of_acel: 'Speed-ups: {t}', of_usar_acel: 'Use speed-ups', of_acel_ok: 'You used {t} of speed-ups',
      of_ayudas_t: 'Help your association', of_ayudas_info: 'Each help takes 1% or 5 minutes off a build (up to {m} per build) and gives you 1 material.',
      of_ayudas_nada: 'Nobody in your association has builds to help right now.', of_sin_asoc: 'Join an association to give and get helps.',
      of_ayudar: 'Help', of_ayuda_ok: 'You helped: −{t}', of_ayuda_premio: 'You helped: −{t}. You got {lista}', of_ayudas_hoy: 'Today: {n}/{m} helps',
      of_ayudas_obra: 'Helps {n}/{m}', of_migrado: 'Your HQ moved to your account: level {n}', of_migrado_tope: 'Your HQ moved to your account with a cap: level {n}',
      of_t_h: '{h} h', of_t_hm: '{h} h {m} min', of_t_m: '{m} min', of_t_0: 'under 1 min', of_cofre_vuelve: 'Delivery claimed · back in {t}',
      of_red: 'Couldn\'t reach your official HQ. Try again.', of_costo_cambio: 'The cost changed: it\'s now {n} credits.',
      of_sin_creditos: 'Not enough credits: you need {n}.', of_ya_ayudaste: 'You already helped on that build.', of_ayudas_completas: 'That build already got every help.',
      of_tope_dia: 'You gave all your helps for today. Come back tomorrow.', of_espera: 'Wait for the last action to finish.',
    },
    'pt-BR': {
      of_titulo: 'Sede oficial', of_tag: 'Oficial', of_info: 'Conta na Copa e nos Duelos: +{n} de qualidade', of_conectando: 'Conectando com sua sede oficial…',
      of_fuentes: 'Na sede oficial os materiais vêm da entrega do dia, dos eventos online, da Copa, das ajudas e dos pacotes.',
      of_acelerar: 'Terminar já · {n} créditos', of_acelerar_q: 'Terminar {que} agora? Custa {n} créditos (você tem {c}).', of_acelerar_si: 'Terminar já',
      of_acelerado: 'Obra concluída: {que}', of_acel: 'Aceleradores: {t}', of_usar_acel: 'Usar aceleradores', of_acel_ok: 'Você usou {t} de aceleradores',
      of_ayudas_t: 'Ajude sua associação', of_ayudas_info: 'Cada ajuda tira 1% ou 5 minutos de uma obra (até {m} por obra) e te dá 1 material.',
      of_ayudas_nada: 'Ninguém da sua associação tem obras para ajudar agora.', of_sin_asoc: 'Entre numa associação para dar e receber ajudas.',
      of_ayudar: 'Ajudar', of_ayuda_ok: 'Você ajudou: −{t}', of_ayuda_premio: 'Você ajudou: −{t}. Recebeu {lista}', of_ayudas_hoy: 'Hoje: {n}/{m} ajudas',
      of_ayudas_obra: 'Ajudas {n}/{m}', of_migrado: 'Sua sede passou para sua conta: nível {n}', of_migrado_tope: 'Sua sede passou para sua conta com limite: nível {n}',
      of_t_h: '{h} h', of_t_hm: '{h} h {m} min', of_t_m: '{m} min', of_t_0: 'menos de 1 min', of_cofre_vuelve: 'Entrega pega · volte em {t}',
      of_red: 'Não deu para conectar com sua sede oficial. Tente de novo.', of_costo_cambio: 'O custo mudou: agora são {n} créditos.',
      of_sin_creditos: 'Faltam créditos: você precisa de {n}.', of_ya_ayudaste: 'Você já ajudou nessa obra.', of_ayudas_completas: 'Essa obra já recebeu todas as ajudas.',
      of_tope_dia: 'Você já deu todas as ajudas de hoje. Volte amanhã.', of_espera: 'Espere a ação anterior terminar.',
    },
    fr: {
      of_titulo: 'QG officiel', of_tag: 'Officiel', of_info: 'Compte dans la Coupe et les Duels : +{n} de qualité', of_conectando: 'Connexion à ton QG officiel…',
      of_fuentes: 'Dans ton QG officiel, les matériaux viennent de la livraison du jour, des événements en ligne, de la Coupe, des aides et des packs.',
      of_acelerar: 'Finir maintenant · {n} crédits', of_acelerar_q: 'Finir {que} maintenant ? Ça coûte {n} crédits (tu en as {c}).', of_acelerar_si: 'Finir maintenant',
      of_acelerado: 'Chantier terminé : {que}', of_acel: 'Accélérateurs : {t}', of_usar_acel: 'Utiliser les accélérateurs', of_acel_ok: 'Tu as utilisé {t} d\'accélérateurs',
      of_ayudas_t: 'Aide ton association', of_ayudas_info: 'Chaque aide retire 1 % ou 5 minutes à un chantier (jusqu\'à {m} par chantier) et te donne 1 matériau.',
      of_ayudas_nada: 'Personne de ton association n\'a de chantier à aider pour l\'instant.', of_sin_asoc: 'Rejoins une association pour donner et recevoir des aides.',
      of_ayudar: 'Aider', of_ayuda_ok: 'Tu as aidé : −{t}', of_ayuda_premio: 'Tu as aidé : −{t}. Tu as reçu {lista}', of_ayudas_hoy: 'Aujourd\'hui : {n}/{m} aides',
      of_ayudas_obra: 'Aides {n}/{m}', of_migrado: 'Ton QG est passé sur ton compte : niveau {n}', of_migrado_tope: 'Ton QG est passé sur ton compte avec plafond : niveau {n}',
      of_t_h: '{h} h', of_t_hm: '{h} h {m} min', of_t_m: '{m} min', of_t_0: 'moins d\'1 min', of_cofre_vuelve: 'Livraison récupérée · reviens dans {t}',
      of_red: 'Impossible de joindre ton QG officiel. Réessaie.', of_costo_cambio: 'Le coût a changé : c\'est maintenant {n} crédits.',
      of_sin_creditos: 'Pas assez de crédits : il t\'en faut {n}.', of_ya_ayudaste: 'Tu as déjà aidé sur ce chantier.', of_ayudas_completas: 'Ce chantier a déjà reçu toutes les aides.',
      of_tope_dia: 'Tu as donné toutes tes aides du jour. Reviens demain.', of_espera: 'Attends la fin de l\'action précédente.',
    },
    de: {
      of_titulo: 'Offizielle Zentrale', of_tag: 'Offiziell', of_info: 'Zählt im Cup und in den Duellen: +{n} Qualität', of_conectando: 'Verbinde mit deiner offiziellen Zentrale…',
      of_fuentes: 'In der offiziellen Zentrale kommen Materialien aus der Tageslieferung, Online-Events, dem Cup, Hilfen und Paketen.',
      of_acelerar: 'Sofort fertig · {n} Credits', of_acelerar_q: '{que} sofort fertigstellen? Kostet {n} Credits (du hast {c}).', of_acelerar_si: 'Sofort fertig',
      of_acelerado: 'Bau fertig: {que}', of_acel: 'Beschleuniger: {t}', of_usar_acel: 'Beschleuniger nutzen', of_acel_ok: 'Du hast {t} Beschleuniger genutzt',
      of_ayudas_t: 'Hilf deiner Vereinigung', of_ayudas_info: 'Jede Hilfe zieht 1 % oder 5 Minuten von einem Bau ab (bis {m} pro Bau) und gibt dir 1 Material.',
      of_ayudas_nada: 'Gerade hat niemand aus deiner Vereinigung einen Bau zum Helfen.', of_sin_asoc: 'Tritt einer Vereinigung bei, um Hilfen zu geben und zu bekommen.',
      of_ayudar: 'Helfen', of_ayuda_ok: 'Du hast geholfen: −{t}', of_ayuda_premio: 'Du hast geholfen: −{t}. Du bekommst {lista}', of_ayudas_hoy: 'Heute: {n}/{m} Hilfen',
      of_ayudas_obra: 'Hilfen {n}/{m}', of_migrado: 'Deine Zentrale ist jetzt in deinem Konto: Stufe {n}', of_migrado_tope: 'Deine Zentrale ist mit Obergrenze in deinem Konto: Stufe {n}',
      of_t_h: '{h} Std.', of_t_hm: '{h} Std. {m} Min.', of_t_m: '{m} Min.', of_t_0: 'unter 1 Min.', of_cofre_vuelve: 'Lieferung abgeholt · wieder in {t}',
      of_red: 'Deine offizielle Zentrale ist nicht erreichbar. Versuch es nochmal.', of_costo_cambio: 'Der Preis hat sich geändert: jetzt {n} Credits.',
      of_sin_creditos: 'Zu wenig Credits: du brauchst {n}.', of_ya_ayudaste: 'Bei diesem Bau hast du schon geholfen.', of_ayudas_completas: 'Dieser Bau hat schon alle Hilfen.',
      of_tope_dia: 'Du hast heute alle Hilfen gegeben. Komm morgen wieder.', of_espera: 'Warte, bis die letzte Aktion fertig ist.',
    },
    it: {
      of_titulo: 'Sede ufficiale', of_tag: 'Ufficiale', of_info: 'Conta nella Coppa e nei Duelli: +{n} di qualità', of_conectando: 'Connessione alla tua sede ufficiale…',
      of_fuentes: 'Nella sede ufficiale i materiali arrivano dalla consegna del giorno, dagli eventi online, dalla Coppa, dagli aiuti e dai pacchetti.',
      of_acelerar: 'Finisci ora · {n} crediti', of_acelerar_q: 'Finire {que} ora? Costa {n} crediti (ne hai {c}).', of_acelerar_si: 'Finisci ora',
      of_acelerado: 'Cantiere finito: {que}', of_acel: 'Acceleratori: {t}', of_usar_acel: 'Usa acceleratori', of_acel_ok: 'Hai usato {t} di acceleratori',
      of_ayudas_t: 'Aiuta la tua associazione', of_ayudas_info: 'Ogni aiuto toglie l\'1% o 5 minuti a un cantiere (fino a {m} per cantiere) e ti dà 1 materiale.',
      of_ayudas_nada: 'Nessuno della tua associazione ha cantieri da aiutare ora.', of_sin_asoc: 'Entra in un\'associazione per dare e ricevere aiuti.',
      of_ayudar: 'Aiuta', of_ayuda_ok: 'Hai aiutato: −{t}', of_ayuda_premio: 'Hai aiutato: −{t}. Hai ricevuto {lista}', of_ayudas_hoy: 'Oggi: {n}/{m} aiuti',
      of_ayudas_obra: 'Aiuti {n}/{m}', of_migrado: 'La tua sede è passata al tuo account: livello {n}', of_migrado_tope: 'La tua sede è passata al tuo account con limite: livello {n}',
      of_t_h: '{h} h', of_t_hm: '{h} h {m} min', of_t_m: '{m} min', of_t_0: 'meno di 1 min', of_cofre_vuelve: 'Consegna ritirata · torna tra {t}',
      of_red: 'Impossibile collegarsi alla tua sede ufficiale. Riprova.', of_costo_cambio: 'Il costo è cambiato: ora sono {n} crediti.',
      of_sin_creditos: 'Crediti insufficienti: te ne servono {n}.', of_ya_ayudaste: 'Hai già aiutato in quel cantiere.', of_ayudas_completas: 'Quel cantiere ha già ricevuto tutti gli aiuti.',
      of_tope_dia: 'Hai dato tutti gli aiuti di oggi. Torna domani.', of_espera: 'Aspetta che finisca l\'azione precedente.',
    },
    ru: {
      of_titulo: 'Официальный штаб', of_tag: 'Официально', of_info: 'Учитывается в Кубке и Дуэлях: +{n} к качеству', of_conectando: 'Подключаемся к официальному штабу…',
      of_fuentes: 'В официальном штабе материалы дают поставка дня, онлайн-события, Кубок, помощь и наборы.',
      of_acelerar: 'Завершить сейчас · {n} кредитов', of_acelerar_q: 'Завершить {que} сейчас? Стоит {n} кредитов (у тебя {c}).', of_acelerar_si: 'Завершить сейчас',
      of_acelerado: 'Стройка завершена: {que}', of_acel: 'Ускорители: {t}', of_usar_acel: 'Использовать ускорители', of_acel_ok: 'Ты использовал ускорители: {t}',
      of_ayudas_t: 'Помоги своей ассоциации', of_ayudas_info: 'Каждая помощь убирает 1% или 5 минут со стройки (до {m} на стройку) и даёт тебе 1 материал.',
      of_ayudas_nada: 'Сейчас ни у кого в ассоциации нет строек для помощи.', of_sin_asoc: 'Вступи в ассоциацию, чтобы помогать и получать помощь.',
      of_ayudar: 'Помочь', of_ayuda_ok: 'Ты помог: −{t}', of_ayuda_premio: 'Ты помог: −{t}. Получено: {lista}', of_ayudas_hoy: 'Сегодня: {n}/{m} помощи',
      of_ayudas_obra: 'Помощь {n}/{m}', of_migrado: 'Штаб перенесён в аккаунт: уровень {n}', of_migrado_tope: 'Штаб перенесён в аккаунт с ограничением: уровень {n}',
      of_t_h: '{h} ч', of_t_hm: '{h} ч {m} мин', of_t_m: '{m} мин', of_t_0: 'меньше 1 мин', of_cofre_vuelve: 'Поставка получена · снова через {t}',
      of_red: 'Не удалось связаться с официальным штабом. Попробуй ещё раз.', of_costo_cambio: 'Цена изменилась: теперь {n} кредитов.',
      of_sin_creditos: 'Не хватает кредитов: нужно {n}.', of_ya_ayudaste: 'Ты уже помог на этой стройке.', of_ayudas_completas: 'Эта стройка уже получила всю помощь.',
      of_tope_dia: 'Ты уже отдал всю помощь на сегодня. Возвращайся завтра.', of_espera: 'Подожди, пока закончится прошлое действие.',
    },
    tr: {
      of_titulo: 'Resmî merkez', of_tag: 'Resmî', of_info: 'Kupa ve Düellolarda sayılır: +{n} kalite', of_conectando: 'Resmî merkezine bağlanılıyor…',
      of_fuentes: 'Resmî merkezde malzemeler günlük teslimattan, çevrim içi etkinliklerden, Kupadan, yardımlardan ve paketlerden gelir.',
      of_acelerar: 'Hemen bitir · {n} kredi', of_acelerar_q: '{que} hemen bitsin mi? {n} kredi tutar (sende {c} var).', of_acelerar_si: 'Hemen bitir',
      of_acelerado: 'İnşaat bitti: {que}', of_acel: 'Hızlandırıcılar: {t}', of_usar_acel: 'Hızlandırıcı kullan', of_acel_ok: '{t} hızlandırıcı kullandın',
      of_ayudas_t: 'Derneğine yardım et', of_ayudas_info: 'Her yardım bir inşaattan %1 ya da 5 dakika düşer (inşaat başına en çok {m}) ve sana 1 malzeme verir.',
      of_ayudas_nada: 'Şu an derneğinde yardım edilecek inşaat yok.', of_sin_asoc: 'Yardım verip almak için bir derneğe katıl.',
      of_ayudar: 'Yardım et', of_ayuda_ok: 'Yardım ettin: −{t}', of_ayuda_premio: 'Yardım ettin: −{t}. Aldığın: {lista}', of_ayudas_hoy: 'Bugün: {n}/{m} yardım',
      of_ayudas_obra: 'Yardımlar {n}/{m}', of_migrado: 'Merkezin hesabına taşındı: seviye {n}', of_migrado_tope: 'Merkezin sınırla hesabına taşındı: seviye {n}',
      of_t_h: '{h} sa', of_t_hm: '{h} sa {m} dk', of_t_m: '{m} dk', of_t_0: '1 dakikadan az', of_cofre_vuelve: 'Teslimat alındı · {t} sonra gel',
      of_red: 'Resmî merkezine ulaşılamadı. Tekrar dene.', of_costo_cambio: 'Fiyat değişti: şimdi {n} kredi.',
      of_sin_creditos: 'Kredin yetmiyor: {n} gerekiyor.', of_ya_ayudaste: 'Bu inşaata zaten yardım ettin.', of_ayudas_completas: 'Bu inşaat tüm yardımları aldı.',
      of_tope_dia: 'Bugünkü tüm yardımlarını verdin. Yarın tekrar gel.', of_espera: 'Önceki işlemin bitmesini bekle.',
    },
    id: {
      of_titulo: 'Markas resmi', of_tag: 'Resmi', of_info: 'Dihitung di Piala dan Duel: +{n} kualitas', of_conectando: 'Menghubungkan ke markas resmimu…',
      of_fuentes: 'Di markas resmi, bahan datang dari kiriman harian, acara online, Piala, bantuan, dan paket.',
      of_acelerar: 'Selesaikan sekarang · {n} kredit', of_acelerar_q: 'Selesaikan {que} sekarang? Biayanya {n} kredit (kamu punya {c}).', of_acelerar_si: 'Selesaikan sekarang',
      of_acelerado: 'Bangunan selesai: {que}', of_acel: 'Percepatan: {t}', of_usar_acel: 'Pakai percepatan', of_acel_ok: 'Kamu memakai {t} percepatan',
      of_ayudas_t: 'Bantu asosiasimu', of_ayudas_info: 'Tiap bantuan memotong 1% atau 5 menit dari bangunan (maks. {m} per bangunan) dan memberimu 1 bahan.',
      of_ayudas_nada: 'Belum ada bangunan anggota asosiasimu yang bisa dibantu.', of_sin_asoc: 'Gabung ke asosiasi untuk memberi dan menerima bantuan.',
      of_ayudar: 'Bantu', of_ayuda_ok: 'Kamu membantu: −{t}', of_ayuda_premio: 'Kamu membantu: −{t}. Kamu dapat {lista}', of_ayudas_hoy: 'Hari ini: {n}/{m} bantuan',
      of_ayudas_obra: 'Bantuan {n}/{m}', of_migrado: 'Markasmu pindah ke akunmu: level {n}', of_migrado_tope: 'Markasmu pindah ke akunmu dengan batas: level {n}',
      of_t_h: '{h} j', of_t_hm: '{h} j {m} mnt', of_t_m: '{m} mnt', of_t_0: 'kurang dari 1 mnt', of_cofre_vuelve: 'Kiriman sudah diambil · kembali dalam {t}',
      of_red: 'Tidak bisa terhubung ke markas resmimu. Coba lagi.', of_costo_cambio: 'Biayanya berubah: sekarang {n} kredit.',
      of_sin_creditos: 'Kreditmu kurang: perlu {n}.', of_ya_ayudaste: 'Kamu sudah membantu bangunan itu.', of_ayudas_completas: 'Bangunan itu sudah dapat semua bantuan.',
      of_tope_dia: 'Semua bantuan hari ini sudah kamu berikan. Kembali besok.', of_espera: 'Tunggu aksi sebelumnya selesai.',
    },
    'zh-CN': {
      of_titulo: '官方总部', of_tag: '官方', of_info: '计入杯赛和对决：质量 +{n}', of_conectando: '正在连接你的官方总部…',
      of_fuentes: '官方总部的材料来自每日补给、在线活动、杯赛、协助和礼包。',
      of_acelerar: '立即完成 · {n} 积分', of_acelerar_q: '立即完成{que}？需要 {n} 积分（你有 {c}）。', of_acelerar_si: '立即完成',
      of_acelerado: '施工完成：{que}', of_acel: '加速：{t}', of_usar_acel: '使用加速', of_acel_ok: '你使用了 {t} 的加速',
      of_ayudas_t: '帮助你的协会', of_ayudas_info: '每次协助让施工减少 1% 或 5 分钟（每项最多 {m} 次），你还能得到 1 个材料。',
      of_ayudas_nada: '现在协会里没有可以协助的施工。', of_sin_asoc: '加入协会就能协助别人，也能得到协助。',
      of_ayudar: '协助', of_ayuda_ok: '你协助了：−{t}', of_ayuda_premio: '你协助了：−{t}。获得 {lista}', of_ayudas_hoy: '今天：{n}/{m} 次协助',
      of_ayudas_obra: '协助 {n}/{m}', of_migrado: '你的总部已转到账号：{n} 级', of_migrado_tope: '你的总部已按上限转到账号：{n} 级',
      of_t_h: '{h} 小时', of_t_hm: '{h} 小时 {m} 分钟', of_t_m: '{m} 分钟', of_t_0: '不到 1 分钟', of_cofre_vuelve: '已领取 · {t}后再来',
      of_red: '连不上你的官方总部，请再试一次。', of_costo_cambio: '价格变了：现在是 {n} 积分。',
      of_sin_creditos: '积分不够：需要 {n}。', of_ya_ayudaste: '你已经协助过这项施工。', of_ayudas_completas: '这项施工的协助已满。',
      of_tope_dia: '今天的协助次数用完了，明天再来。', of_espera: '请等上一个操作完成。',
    },
  };
  Object.keys(TRAD_OF).forEach((c) => { if (TRAD[c]) Object.assign(TRAD[c], TRAD_OF[c]); });
  const PREF = 'sedehq.';
  function idioma() { try { const c = root.I18N && root.I18N.idioma; return c && TRAD[c] ? c : 'es'; } catch (e) { return 'es'; } }
  function fill(str, p) { return p ? String(str).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined && p[k] !== null ? String(p[k]) : m)) : String(str); }
  function t(key, p) {
    const d = TRAD[idioma()];
    const v = d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : TRAD.es[key];
    return fill(v === undefined ? key : v, p);
  }
  // Las claves también van a los textos del juego (para result.extras y bonoCalidad con { k, p }):
  // español en Game.TEXTOS; los otros idiomas solo se agregan a un diccionario que YA está cargado
  // (si se crea antes, i18n.js creería que el idioma ya llegó y no lo descargaría).
  function registrarTextos() {
    try { if (G && G.TEXTOS) Object.keys(TRAD.es).forEach((k) => { if (!(PREF + k in G.TEXTOS)) G.TEXTOS[PREF + k] = TRAD.es[k]; }); } catch (e) { /* sin textos */ }
    try {
      const J = root.I18N_JUEGO;
      if (!J) return;
      Object.keys(TRAD).forEach((code) => {
        if (code === 'es' || !Object.prototype.hasOwnProperty.call(J, code) || !J[code]) return;
        Object.keys(TRAD[code]).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(J[code], PREF + k)) J[code][PREF + k] = TRAD[code][k]; });
      });
    } catch (e) { /* sin diccionarios */ }
  }

  /* ---------- Azar determinista (no toca s.seed: el resto del juego sigue igual) ---------- */
  function hash(a, b, c) {
    let h = (a | 0) ^ Math.imul(b | 0, 0x9E3779B1) ^ Math.imul(c | 0, 0x85EBCA77);
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function azar(s) { const d = s.sede; d.n = (d.n || 0) + 1; return hash(d.semilla, s.day, d.n); }

  /* ---------- Estado guardado ---------- */
  function nuevo(s) {
    return { nivel: 1, mejoras: {}, materiales: { cables: 0, placas: 0, paneles: 0, credenciales: 0, planos: 0, chips: 0 }, obras: [], ultimoCofre: 0,
      semilla: ((s && s.seed) | 0) ^ 0x5EDE2026, n: 0 };
  }
  function migrar(s) {
    if (!s || typeof s !== 'object') return s;
    const d = s.sede && typeof s.sede === 'object' ? s.sede : (s.sede = nuevo(s));
    if (typeof d.nivel !== 'number' || !(d.nivel >= 1)) d.nivel = 1;
    d.nivel = Math.min(AJUSTE.maxNivel, Math.floor(d.nivel));
    if (!d.mejoras || typeof d.mejoras !== 'object') d.mejoras = {};
    if (!d.materiales || typeof d.materiales !== 'object') d.materiales = {};
    MATS.forEach((m) => { const v = Number(d.materiales[m]); d.materiales[m] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0; });
    if (!Array.isArray(d.obras)) d.obras = [];
    d.obras = d.obras.filter((o) => o && (o.tipo === 'mejora' || o.tipo === 'nivel') && typeof o.fin === 'number');
    if (typeof d.ultimoCofre !== 'number') d.ultimoCofre = 0;
    if (typeof d.semilla !== 'number') d.semilla = ((s.seed | 0) ^ 0x5EDE2026);
    if (typeof d.n !== 'number') d.n = 0;
    return s;
  }
  const est = (s) => { if (!s.sede || typeof s.sede !== 'object' || !s.sede.materiales) migrar(s); return s.sede; };

  /* ---------- Reglas ---------- */
  const r10 = (v) => Math.round(v / 10) * 10;
  function edificiosDe(L) {
    if (L < 2 || L > AJUSTE.maxNivel) return [];
    if (L < AJUSTE.escuelaDesde) { const fuera = BASE5[(L - 2) % 5]; return BASE5.filter((e) => e !== fuera); }
    const fuera = BASE5[(L - AJUSTE.escuelaDesde) % 5];
    return BASE5.filter((e) => e !== fuera).concat(['escuela']);
  }
  function unidades(L) { const M = AJUSTE.mat; return M.base * Math.pow(M.crec, L - 2) + M.porNivel * (L - 2); }
  function repartir(total, receta) {
    const out = {};
    receta.forEach(([m, w]) => { out[m] = Math.max(1, Math.round(total * w)); });
    return out;
  }
  // Costo de una mejora chica (edificio ed) para llegar al nivel L, o de la obra de la sede principal (ed = 'sede')
  function costo(L, ed) {
    if (ed === 'sede') {
      const mat = repartir(unidades(L) * 1.2, RECETA.sede);
      const ch = AJUSTE.chipsNivel(L); if (ch) mat.chips = ch;
      return { mat, dinero: r10(AJUSTE.dinero * Math.pow(L, AJUSTE.dineroExp) * 1.5), dias: AJUSTE.diasNivel(L) };
    }
    const mat = repartir(unidades(L), RECETA[ed] || RECETA.control);
    if (L >= AJUSTE.raroDesde && (ed === 'control' || ed === 'escuela')) mat.chips = AJUSTE.chipsMejora(L);
    return { mat, dinero: r10(AJUSTE.dinero * Math.pow(L, AJUSTE.dineroExp)), dias: AJUSTE.diasMejora(L) };
  }
  const clave = (L, ed) => L + '.' + ed;
  function nivelEdificio(s, ed) { const m = est(s).mejoras; return Object.keys(m).filter((k) => m[k] && k.split('.')[1] === ed).length; }
  function obreros(s) { return est(s).nivel >= AJUSTE.segundoObrero ? 2 : 1; }
  function capituloOk(s, cap) { return s.storyDone || (s.chapter || 0) >= cap; }
  function requisitos(s, L) {
    const r = requisito(L), out = [];
    if (r.fama) out.push({ k: 'req_fama', p: { n: r.fama }, ok: (s.rep || 0) >= r.fama });
    if (r.cap) out.push({ k: 'req_cap', p: { n: r.cap + 1 }, ok: capituloOk(s, r.cap) });
    if (r.historia) out.push({ k: 'req_historia', p: null, ok: !!s.storyDone });
    return out;
  }
  // Termina las obras cuyo día ya llegó (se llama cada día y antes de leer el estado: así no depende de qué día se llamó)
  function actualizar(s) {
    const d = est(s);
    const hechas = d.obras.filter((o) => o.fin <= s.day).sort((a, b) => a.fin - b.fin);
    if (!hechas.length) return [];
    d.obras = d.obras.filter((o) => o.fin > s.day);
    const out = [];
    hechas.forEach((o) => {
      if (o.tipo === 'mejora') { d.mejoras[clave(o.nivel, o.ed)] = 1; anotar(s, 'termino', { que: { k: PREF + 'ed.' + o.ed } }); out.push(o); }
      else if (o.tipo === 'nivel' && d.nivel === o.nivel - 1) { d.nivel = o.nivel; anotar(s, 'subio', { n: o.nivel }); out.push(o); }
    });
    return out;
  }
  function anotar(s, k, p) {
    if (!Array.isArray(s.log)) return;
    s.log.unshift({ day: s.day, text: tx(k, p), k: PREF + k, p: p || null });
    if (s.log.length > 80) s.log.length = 80;
  }
  // Texto con parámetros anidados { k } (claves con prefijo o sin él)
  function tx(k, p) {
    const q = p ? Object.assign({}, p) : null;
    if (q) Object.keys(q).forEach((x) => { const v = q[x]; if (v && typeof v === 'object' && typeof v.k === 'string') q[x] = tx(v.k.indexOf(PREF) === 0 ? v.k.slice(PREF.length) : v.k, v.p); });
    return t(k, q);
  }
  function faltantes(s, mat) {
    const have = est(s).materiales, out = {};
    Object.keys(mat).forEach((m) => { if ((have[m] || 0) < mat[m]) out[m] = mat[m] - (have[m] || 0); });
    return out;
  }
  // Vista de la etapa actual (lo que falta para el próximo nivel)
  function etapa(s) {
    actualizar(s);
    const d = est(s), L = d.nivel + 1;
    if (d.nivel >= AJUSTE.maxNivel) return { max: true, nivel: d.nivel, objetivo: null, mejoras: [], obras: d.obras.slice(), obreros: obreros(s) };
    const mejoras = edificiosDe(L).map((ed) => {
      const c = costo(L, ed);
      const obra = d.obras.find((o) => o.tipo === 'mejora' && o.ed === ed && o.nivel === L) || null;
      const hecha = !!d.mejoras[clave(L, ed)];
      return { ed, costo: c, hecha, obra, diasFalta: obra ? Math.max(0, obra.fin - s.day) : 0,
        avance: hecha ? 1 : obra ? Math.min(0.95, Math.max(0.05, 1 - (obra.fin - s.day) / Math.max(1, obra.dias))) : 0,
        falta: faltantes(s, c.mat), nivelEd: nivelEdificio(s, ed) };
    });
    const sede = costo(L, 'sede');
    const obraNivel = d.obras.find((o) => o.tipo === 'nivel') || null;
    return { max: false, nivel: d.nivel, objetivo: L, mejoras, hechas: mejoras.filter((m) => m.hecha).length,
      sede: { costo: sede, obra: obraNivel, diasFalta: obraNivel ? Math.max(0, obraNivel.fin - s.day) : 0, falta: faltantes(s, sede.mat), req: requisitos(s, L) },
      obras: d.obras.slice(), obreros: obreros(s) };
  }
  function pagar(s, c) {
    const d = est(s);
    Object.keys(c.mat).forEach((m) => { d.materiales[m] -= c.mat[m]; });
    s.money -= c.dinero;
  }
  function puede(s, c) {
    const f = faltantes(s, c.mat);
    if (Object.keys(f).length) return { ok: false, k: 'falta', p: { lista: listaTxt(f) }, falta: f };
    if (s.money < c.dinero) return { ok: false, k: 'sin_plata', p: { m: dinero(c.dinero) } };
    return { ok: true };
  }
  function resp(ok, k, p, extra) { return Object.assign({ ok, k: PREF + k, p: p || null, msg: tx(k, p) }, extra || {}); }
  function mejorar(s, ed) {
    if (s.gameOver) return resp(false, 'req_no');
    const e = etapa(s), d = est(s);
    if (e.max) return resp(false, 'max');
    const m = e.mejoras.find((x) => x.ed === ed);
    if (!m) return resp(false, 'req_no');
    if (m.hecha || m.obra) return resp(false, 'listo');
    if (d.obras.length >= obreros(s)) return resp(false, 'sin_equipo');
    const p = puede(s, m.costo);
    if (!p.ok) return resp(false, p.k, p.p, { falta: p.falta });
    pagar(s, m.costo);
    d.obras.push({ tipo: 'mejora', ed, nivel: e.objetivo, inicio: s.day, dias: m.costo.dias, fin: s.day + m.costo.dias });
    anotar(s, 'empezaste', { que: { k: PREF + 'ed.' + ed }, d: diasRef(m.costo.dias) });
    return resp(true, 'empezaste', { que: t('ed.' + ed), d: diasTxt(m.costo.dias) });
  }
  function subirNivel(s) {
    if (s.gameOver) return resp(false, 'req_no');
    const e = etapa(s), d = est(s);
    if (e.max) return resp(false, 'max');
    if (e.sede.obra) return resp(false, 'listo');
    if (e.hechas < e.mejoras.length) return resp(false, 'faltan_mejoras', { h: e.hechas, n: e.mejoras.length });
    if (e.sede.req.some((r) => !r.ok)) return resp(false, 'req_no');
    if (d.obras.length >= obreros(s)) return resp(false, 'sin_equipo');
    const p = puede(s, e.sede.costo);
    if (!p.ok) return resp(false, p.k, p.p, { falta: p.falta });
    pagar(s, e.sede.costo);
    d.obras.push({ tipo: 'nivel', ed: 'sede', nivel: e.objetivo, inicio: s.day, dias: e.sede.costo.dias, fin: s.day + e.sede.costo.dias });
    anotar(s, 'empezaste', { que: { k: PREF + 'ed.sede' }, d: diasRef(e.sede.costo.dias) });
    return resp(true, 'empezaste', { que: t('ed.sede'), d: diasTxt(e.sede.costo.dias) });
  }
  function sumar(s, bolsa) { const d = est(s); Object.keys(bolsa).forEach((m) => { d.materiales[m] = (d.materiales[m] || 0) + bolsa[m]; }); return bolsa; }
  function sortear(s, n, base) {
    const out = base || {};
    for (let i = 0; i < n; i++) { const m = COMUNES[Math.floor(azar(s) * COMUNES.length)]; out[m] = (out[m] || 0) + 1; }
    return out;
  }
  // Lo que más falta para la etapa actual (la mitad de la entrega del día va ahí)
  function masFalta(s) {
    const e = etapa(s);
    if (e.max) return null;
    const tot = {};
    e.mejoras.filter((m) => !m.hecha && !m.obra).forEach((m) => Object.keys(m.falta).forEach((k) => { tot[k] = (tot[k] || 0) + m.falta[k]; }));
    if (!e.sede.obra) Object.keys(e.sede.falta).forEach((k) => { tot[k] = (tot[k] || 0) + e.sede.falta[k]; });
    const c = COMUNES.filter((m) => tot[m]).sort((a, b) => tot[b] - tot[a]);
    return c[0] || null;
  }
  function cofreDisponible(s) { return !s.gameOver && est(s).ultimoCofre !== s.day; }
  function reclamarCofre(s) {
    const d = est(s);
    if (!cofreDisponible(s)) return resp(false, 'cofre_ya');
    const C = AJUSTE.cofre;
    const n = Math.floor(C.base + d.nivel * C.porNivel);
    const foco = masFalta(s);
    const bolsa = {};
    const fijos = foco ? Math.floor(n / 2) : 0;
    if (fijos) bolsa[foco] = fijos;
    sortear(s, n - fijos, bolsa);
    if (d.nivel >= C.chipDesde && azar(s) < C.chipProb + C.chipPorNivel * d.nivel) bolsa.chips = 1;
    sumar(s, bolsa);
    d.ultimoCofre = s.day;
    return resp(true, 'cofre_ok', { lista: listaTxt(bolsa) }, { bolsa });
  }
  // Materiales que deja un evento (estrellas, dificultad, 5 estrellas y duelos)
  function botinEvento(s, result, contrato) {
    const E = AJUSTE.evento, d = est(s);
    const stars = Math.max(1, Math.min(5, (result && result.stars) | 0));
    const diff = Math.max(1, (contrato && contrato.diff) || 1);
    const n = Math.round((diff + 1) * E.estrellas[stars] * (1 + d.nivel * E.porNivel));
    const base = sortear(s, n, {});
    const extras = [];
    if (n > 0) extras.push({ k: 'extra_evento', bolsa: base });
    if (stars === 5) {
      const b5 = sortear(s, E.cincoExtra, {});
      if (azar(s) < E.cincoChip) b5.chips = 1;
      extras.push({ k: 'extra_5e', bolsa: b5 });
    }
    if (result && result.duel === 'won') {
      const bd = sortear(s, E.dueloExtra, {}); bd.chips = (bd.chips || 0) + E.dueloChip;
      extras.push({ k: 'extra_duelo', bolsa: bd });
    }
    if (contrato && contrato.internacional && stars >= 3 && extras.length) { const b = extras[0].bolsa; b.chips = (b.chips || 0) + E.intlChip; }
    return extras;
  }
  /* Reciclar: equipos propios rotos (estado ≤ 40) o viejos (calidad ≤ 2); no la cámara de Don Ramiro, ni premium ni alquileres */
  function reciclables(s) {
    if (!Array.isArray(s.equip)) return [];
    const R = AJUSTE.reciclar;
    return s.equip.filter((e) => {
      const it = G.CATALOG[e.type];
      if (!it || it.alquiler || it.premium || e.starter) return false;
      return e.condition <= R.gastado || (it.q || 3) <= 2;
    }).map((e) => ({ e, bolsa: botinReciclar(e) }));
  }
  const MAT_CAT = { cam: ['placas', 'paneles'], audio: ['cables', 'placas'], switcher: ['placas', 'cables'], encoder: ['placas', 'cables'], internet: ['cables', 'placas'],
    graphics: ['paneles', 'placas'], replay: ['placas', 'paneles'], power: ['cables', 'planos'], vehicle: ['planos', 'cables'], light: ['paneles', 'cables'] };
  function botinReciclar(e) {
    const it = G.CATALOG[e.type] || {}, R = AJUSTE.reciclar;
    const n = Math.max(R.min, Math.min(R.max, Math.round((it.price || 0) / R.porPrecio * (0.5 + e.condition / 200))));
    const ms = MAT_CAT[it.cat] || ['cables', 'planos'];
    const a = Math.ceil(n * 0.6), out = {};
    out[ms[0]] = a; if (n - a > 0) out[ms[1]] = (out[ms[1]] || 0) + n - a;
    if ((it.q || 0) >= R.chipDesdeQ) out.chips = 1;
    return out;
  }
  function reciclar(s, id) {
    if (s.currentEvent) return resp(false, 'en_evento');
    const r = reciclables(s).find((x) => x.e.id === id);
    if (!r) return resp(false, 'reciclar_nada');
    s.equip = s.equip.filter((e) => e !== r.e);
    sumar(s, r.bolsa);
    const item = nombreEquipo(r.e);
    anotar(s, 'reciclar_ok', { item, lista: listaRef(r.bolsa) });
    return resp(true, 'reciclar_ok', { item, lista: listaTxt(r.bolsa) }, { bolsa: r.bolsa });
  }

  /* ---------- Bonos ---------- */
  function bonos(s) {
    const B = AJUSTE.bono, d = est(s);
    const nv = (ed) => nivelEdificio(s, ed);
    return {
      control: Math.floor(nv('control') * B.control),
      estudio: Math.floor(nv('estudio') * B.estudio),
      movil: Math.floor(nv('movil') * B.movil),
      tope: B.topeCalidad(d.nivel),
      gastos: Math.min(B.gastosMax, nv('bodega') * B.gastos),
      pago: Math.min(B.pagoMax, nv('comercial') * B.pago),
      staff: Math.min(B.staffMax, Math.floor(nv('escuela') / B.staffCada)),
      equip: Math.min(B.equipMax, Math.floor(nv('bodega') / B.equipCada) * B.equipPor),
      taller: Math.min(B.tallerMax, Math.floor(nv('bodega') / B.tallerCada)),
    };
  }
  const ESTUDIO_TIPOS = ['prensa', 'boda'];
  function esDeporte(c) { const T = G.EVENT_TYPES && G.EVENT_TYPES[c && c.type]; return !!(T && T.deporte); }
  function bonoCalidad(s, contrato) {
    if (!s || !s.sede) return [];
    const b = bonos(s);
    const out = [];
    let resto = b.tope;
    const add = (ed, pts) => { const v = Math.min(pts, resto); if (v > 0) { out.push({ k: PREF + 'q_label', p: { ed: { k: PREF + 'ed.' + ed } }, pts: v, ed, texto: tx('q_label', { ed: { k: 'ed.' + ed } }) }); resto -= v; } };
    add('control', b.control);
    if (contrato && ESTUDIO_TIPOS.includes(contrato.type)) add('estudio', b.estudio);
    if (contrato && esDeporte(contrato)) add('movil', b.movil);
    return out;
  }
  function multPago(s) { return s && s.sede ? 1 + bonos(s).pago : 1; }
  function multGastos(s) { return s && s.sede ? 1 - bonos(s).gastos : 1; }
  function limites(s) { if (!s || !s.sede) return { staff: 0, equip: 0 }; const b = bonos(s); return { staff: b.staff, equip: b.equip }; }
  function alNuevoDia(s) { migrar(s); actualizar(s); }
  function alTerminarEvento(s, result, contrato) {
    migrar(s);
    actualizar(s);
    // Sede oficial: los materiales los da el servidor (eventos en línea validados), no los eventos de este celular
    const extras = s.sede.oficial ? [] : botinEvento(s, result, contrato || {});
    if (result) {
      result.extras = Array.isArray(result.extras) ? result.extras : [];
      extras.forEach((x) => {
        sumar(s, x.bolsa);
        result.extras.push({ icon: x.k === 'extra_duelo' ? 'rival' : x.k === 'extra_5e' ? 'star' : 'box', k: PREF + x.k, p: { lista: listaRef(x.bolsa) }, text: tx(x.k, { lista: listaTxt(x.bolsa) }), sede: true, bolsa: x.bolsa });
      });
    } else extras.forEach((x) => sumar(s, x.bolsa));
    // Taller técnico: recupera un poco de estado a los equipos más gastados
    const b = bonos(s);
    if (b.taller > 0 && Array.isArray(s.equip)) {
      s.equip.filter((e) => { const it = G.CATALOG[e.type]; return it && !it.alquiler && e.condition < 100; })
        .sort((a, z) => a.condition - z.condition || a.id - z.id).slice(0, AJUSTE.bono.tallerEquipos)
        .forEach((e) => { e.condition = Math.min(100, e.condition + b.taller); });
    }
    return extras;
  }
  // Para mostrar en la lista de bonos
  function listaBonos(s) {
    const b = bonos(s), out = [];
    if (b.control) out.push({ ed: 'control', txt: t('b_calidad_todos', { n: Math.min(b.control, b.tope) }) });
    if (b.estudio) out.push({ ed: 'estudio', txt: t('b_calidad_tipo', { n: b.estudio, tipos: t('b_tipos_estudio') }) });
    if (b.movil) out.push({ ed: 'movil', txt: t('b_calidad_tipo', { n: b.movil, tipos: t('b_tipos_deporte') }) });
    if (b.control || b.estudio || b.movil) out.push({ ed: 'sede', txt: t('b_tope', { n: b.tope }) });
    if (b.gastos) out.push({ ed: 'bodega', txt: t('b_gastos', { n: pct(b.gastos) }) });
    if (b.equip) out.push({ ed: 'bodega', txt: t('b_equip', { n: b.equip }) });
    if (b.taller) out.push({ ed: 'bodega', txt: t('b_taller', { n: b.taller, k: AJUSTE.bono.tallerEquipos }) });
    if (b.pago) out.push({ ed: 'comercial', txt: t('b_pago', { n: pct(b.pago) }) });
    if (b.staff) out.push({ ed: 'escuela', txt: t('b_staff', { n: b.staff }) });
    return out;
  }
  const pct = (f) => { const v = Math.round(f * 1000) / 10; return String(v).replace('.', idioma() === 'en' || idioma() === 'zh-CN' ? '.' : ','); };

  /* ---------- Textos de apoyo ---------- */
  function dinero(n) { try { return (G && G.money) ? G.money(n) : '$' + n; } catch (e) { return '$' + n; } }
  function diasRef(n) { return n === 1 ? { k: PREF + 'dia1' } : { k: PREF + 'dias', p: { n } }; }
  function diasTxt(n) { return n === 1 ? t('dia1') : t('dias', { n }); }
  function listaTxt(bolsa, lang) {
    const L = lang ? (k) => TRAD.es[k] : (k) => t(k);
    return MATS.filter((m) => bolsa[m]).map((m) => bolsa[m] + ' ' + L('mat.' + m)).join(', ');
  }
  // La misma lista como texto con clave anidada ({ k, p }): Game.tx la arma en el idioma actual
  function listaRef(bolsa) {
    const ms = MATS.filter((m) => bolsa[m]);
    if (!ms.length) return '';
    const p = {};
    ms.forEach((m, i) => { p['n' + (i + 1)] = bolsa[m]; p['m' + (i + 1)] = { k: PREF + 'mat.' + m }; });
    return { k: PREF + 'l' + ms.length, p };
  }
  function nombreEquipo(e) {
    let n = '';
    try { n = G.equipName ? G.equipName(e) : (G.CATALOG[e.type] || {}).name; } catch (x) { n = e.type; }
    try { if (root.I18N && root.I18N.TL) n = root.I18N.TL(n); } catch (x) { /* español */ }
    return n || e.type;
  }

  /* ---------- Dibujos (SVG planos, estilo art.js) ---------- */
  const SVG_MAT = {
    cables: '<path d="M5 16c0-5 4-8 7-8s7 3 7 8" fill="none" stroke="#ff8a3d" stroke-width="2.6" stroke-linecap="round"/><path d="M8 16c0-3 2-5 4-5s4 2 4 5" fill="none" stroke="#d96a22" stroke-width="2.2" stroke-linecap="round"/><rect x="2.5" y="15" width="5" height="6" rx="1.5" fill="#c9d1dc"/><rect x="16.5" y="15" width="5" height="6" rx="1.5" fill="#c9d1dc"/><circle cx="5" cy="18" r="1" fill="#3a4150"/><circle cx="19" cy="18" r="1" fill="#3a4150"/>',
    placas: '<rect x="3" y="4" width="18" height="16" rx="2" fill="#1f8a4c"/><path d="M6 8h5M6 16h4M14 16h4M13 8v4h5" stroke="#9de2b5" stroke-width="1.3" fill="none"/><rect x="8" y="10" width="6" height="4" rx=".6" fill="#16202b"/><circle cx="18" cy="8" r="1.3" fill="#ffd27a"/><circle cx="6" cy="12" r="1" fill="#ffd27a"/>',
    paneles: '<rect x="3" y="4" width="18" height="13" rx="1.5" fill="#203048"/><g fill="#5fd4ff">' + [0, 1, 2, 3].map((i) => [0, 1, 2].map((j) => `<rect x="${5 + i * 4}" y="${6 + j * 3.6}" width="2.6" height="2.4" rx=".5" opacity="${(i + j) % 2 ? 0.6 : 1}"/>`).join('')).join('') + '</g><path d="M9 17l-2 4M15 17l2 4" stroke="#8b95a8" stroke-width="1.6" stroke-linecap="round"/>',
    credenciales: '<path d="M9 2l3 5 3-5" fill="none" stroke="#ff3b3b" stroke-width="1.8"/><rect x="5" y="7" width="14" height="15" rx="2" fill="#e9edf5"/><rect x="5" y="7" width="14" height="4" rx="1.5" fill="#ff3b3b"/><circle cx="12" cy="14.5" r="2.2" fill="#8b95a8"/><path d="M8 19.5h8" stroke="#8b95a8" stroke-width="1.4"/>',
    planos: '<rect x="3" y="5" width="16" height="14" rx="1" fill="#2f6fb3"/><path d="M6 8h7v5H6zM13 10h4M6 16h10" stroke="#cfe3ff" stroke-width="1.1" fill="none"/><rect x="17" y="4" width="4" height="16" rx="2" fill="#4f8fd6"/><circle cx="19" cy="6" r="1" fill="#cfe3ff"/>',
    chips: '<g stroke="#c9b6ff" stroke-width="1.4">' + [7, 10.5, 14, 17.5].map((v) => `<path d="M${v - 0.5} 2v3M${v - 0.5} 19v3M2 ${v - 0.5}h3M19 ${v - 0.5}h3"/>`).join('') + '</g><rect x="5" y="5" width="14" height="14" rx="2" fill="#6a3fd1"/><rect x="7" y="7" width="10" height="10" rx="1" fill="#4b2aa0"/><text x="12" y="14.6" font-size="6" font-weight="800" text-anchor="middle" fill="#fff" font-family="sans-serif">4K</text>',
  };
  const SVG_ED = {
    control: '<rect x="2" y="13" width="20" height="7" rx="1.5" fill="#3a4354"/><rect x="3" y="4" width="8" height="7" rx="1" fill="#16202e" stroke="#5b6476"/><rect x="13" y="4" width="8" height="7" rx="1" fill="#16202e" stroke="#5b6476"/><rect x="4.5" y="5.5" width="5" height="4" fill="#2f6fb3"/><rect x="14.5" y="5.5" width="5" height="4" fill="#b33a3a"/><g fill="#ffd27a"><rect x="5" y="15" width="2" height="1.6"/><rect x="9" y="15" width="2" height="1.6"/><rect x="13" y="15" width="2" height="1.6"/></g><rect x="17" y="15" width="2.5" height="3" rx=".5" fill="#2ecc71"/>',
    bodega: '<rect x="3" y="3" width="18" height="18" rx="1.5" fill="#2b3240"/><path d="M3 9.5h18M3 15.5h18" stroke="#5b6476" stroke-width="1.6"/><rect x="5" y="5" width="5" height="4" fill="#b38a2f"/><rect x="12" y="11" width="6" height="4" fill="#2f6fb3"/><rect x="5" y="17" width="4" height="4" fill="#b33a3a"/><path d="M14 17.5l4 3" stroke="#e9edf5" stroke-width="1.8" stroke-linecap="round"/><circle cx="13.5" cy="17" r="1.6" fill="none" stroke="#e9edf5" stroke-width="1.3"/>',
    estudio: '<path d="M4 21l3-8M10 21l-3-8" stroke="#8b95a8" stroke-width="1.4"/><rect x="3" y="7" width="10" height="6" rx="1" fill="#3a4354"/><circle cx="14.5" cy="10" r="2.6" fill="#16202e" stroke="#8b95a8"/><path d="M17 4l4 -1v6l-4 -1z" fill="#ffd27a"/><path d="M17 5.5l-3 3" stroke="#ffd27a" stroke-width="1" opacity=".6"/><circle cx="5" cy="9" r="1" fill="#ff3b3b"/>',
    comercial: '<rect x="3" y="8" width="18" height="12" rx="2" fill="#7a4b2a"/><path d="M9 8V5.5h6V8" fill="none" stroke="#5a3a20" stroke-width="1.8"/><path d="M3 13h18" stroke="#5a3a20" stroke-width="1.4"/><rect x="10.5" y="11.5" width="3" height="3" rx=".6" fill="#ffd27a"/>',
    movil: '<rect x="2" y="7" width="14" height="10" rx="1.5" fill="#e9edf5"/><path d="M16 10h3l3 3v4h-6z" fill="#c9d1dc"/><rect x="17" y="10.8" width="2.4" height="2" fill="#5fd4ff"/><rect x="2" y="12" width="14" height="2" fill="#ff3b3b"/><circle cx="6" cy="18" r="2" fill="#2b2f38"/><circle cx="18" cy="18" r="2" fill="#2b2f38"/><path d="M8 7V4M8 4l-2 -1M8 4l2 -1" stroke="#8b95a8" stroke-width="1.2"/>',
    escuela: '<path d="M2 9l10-5 10 5-10 5z" fill="#2f8f5b"/><path d="M6 11v5c0 2 3 3 6 3s6-1 6-3v-5l-6 3z" fill="#246e46"/><path d="M20 10v6" stroke="#ffd27a" stroke-width="1.4"/><circle cx="20" cy="17" r="1.2" fill="#ffd27a"/>',
    sede: '<rect x="4" y="8" width="16" height="13" fill="#5a6680"/><path d="M2 9l10-6 10 6z" fill="#3a4354"/><rect x="6" y="11" width="3" height="3" fill="#ffd27a"/><rect x="15" y="11" width="3" height="3" fill="#ffd27a"/><rect x="10" y="15" width="4" height="6" fill="#16202e"/><rect x="8" y="5.5" width="8" height="2.2" rx="1" fill="#ff3b3b"/>',
  };
  const svg = (body, size, label) => `<svg class="sd-ico" width="${size}" height="${size}" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${body}</svg>`;
  const iconoMat = (m, size) => svg(SVG_MAT[m] || '', size || 20, t('mat.' + m));
  const iconoEd = (ed, size) => svg(SVG_ED[ed] || SVG_ED.sede, size || 28, t('ed.' + ed));
  function esc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  /* ---------- Interfaz (registro de tarjetas de Inicio) ---------- */
  const CSS = `
  .sd-card{cursor:pointer}
  .sd-head{display:flex;align-items:center;gap:10px}
  .sd-head .grow{flex:1;min-width:0}
  .sd-lv{font-family:var(--f-head);font-size:22px;font-weight:800;line-height:1}
  .sd-bars{display:grid;gap:6px;margin-top:10px}
  .sd-bar{display:flex;align-items:center;gap:4px;min-width:0}
  .sd-bar .bar{flex:1;margin:0;min-width:0}
  .sd-bar.done .bar i{background:var(--green)}
  .sd-bar.obra .bar i{background:var(--amber)}
  .sd-mats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;margin-top:10px}
  .sd-mat{display:flex;flex-direction:column;align-items:center;gap:1px;background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:4px 2px;min-width:0}
  .sd-mat b{font-family:var(--f-mono);font-size:12px}
  .sd-mat.rare{border-color:#6a3fd1}
  .sd-ico{flex:none;display:block}
  .sd-obra{display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap}
  .sd-obra .tag{display:inline-flex;align-items:center;gap:4px;margin:0}
  .sd-item{border:1px solid var(--line);border-radius:12px;padding:10px;margin-top:8px;background:var(--panel2)}
  .sd-item.done{opacity:.75}
  .sd-cost{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
  .sd-c{display:inline-flex;align-items:center;gap:3px;font-size:12px;border:1px solid var(--line);border-radius:999px;padding:2px 7px 2px 3px;background:var(--panel);font-family:var(--f-mono)}
  .sd-c.no{border-color:#ff3b3b88;color:#ffb3b3}
  .sd-c.ok{border-color:#2ecc7155}
  .sd-req{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
  .sd-bono{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px}
  .sd-btn[disabled]{opacity:.55}
  #modal .sd-item .btn{margin-top:8px}
  .sd-of-tag{display:inline-flex;align-items:center;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;border:1px solid #2ecc7188;color:#7ee2a8;background:#2ecc7114;margin-inline-start:6px;vertical-align:middle;line-height:1.5}
  .sd-of-info{margin-top:6px;color:#7ee2a8}
  .sd-of-obra .bar{margin:6px 0 0}
  .sd-of-obra .bar i{background:var(--amber)}
  .sd-of-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  #modal .sd-of-btns .btn{margin:0;flex:1 1 140px;min-width:0}
  .sd-of-ayuda{display:flex;align-items:center;gap:8px}
  .sd-of-ayuda .grow{flex:1;min-width:0;overflow-wrap:anywhere}
  #modal .sd-of-ayuda .btn{margin:0;flex:none}
  `;
  function ponerCss() {
    try {
      const doc = root.document;
      if (!doc || doc.getElementById('sede-css')) return;
      const st = doc.createElement('style'); st.id = 'sede-css'; st.textContent = CSS; doc.head.appendChild(st);
    } catch (e) { /* sin documento */ }
  }
  const estadoDe = (ctx) => { try { return typeof ctx.S === 'function' ? ctx.S() : ctx.S; } catch (e) { return null; } };
  const plata = (ctx, n) => { try { return ctx && ctx.money ? ctx.money(n) : dinero(n); } catch (e) { return dinero(n); } };
  function tiraMateriales(s) { return tiraMat(est(s).materiales); }
  function tiraMat(m) {
    return `<div class="sd-mats">${MATS.map((k) => `<div class="sd-mat${k === 'chips' ? ' rare' : ''}" title="${esc(t('mat.' + k))}">${iconoMat(k, 20)}<b class="num">${m[k] || 0}</b></div>`).join('')}</div>`;
  }
  function textoObras(s, e) {
    const d = est(s), slots = obreros(s);
    const items = [];
    for (let i = 0; i < slots; i++) {
      const o = d.obras[i];
      items.push(o ? `<span class="tag amber">${iconoEd(o.ed, 14)} ${esc(t('ed.' + o.ed))} · ${esc(diasTxt(Math.max(1, o.fin - s.day)))}</span>`
        : `<span class="tag">${esc(t('obra_libre'))}</span>`);
    }
    return `<div class="sd-obra small"><span class="muted">${esc(t('obra'))}:</span>${items.join('')}</div>`;
  }
  function tarjeta(ctx) {
    const s = estadoDe(ctx);
    if (!s) return '';
    migrar(s);
    if (enOficial(s)) return tarjetaOficial(ctx, s);
    const e = etapa(s);
    const bars = e.max ? '' : `<div class="sd-bars" style="grid-template-columns:repeat(${e.mejoras.length + 1},minmax(0,1fr))">${e.mejoras.map((m) =>
      `<div class="sd-bar${m.hecha ? ' done' : m.obra ? ' obra' : ''}" title="${esc(t('ed.' + m.ed))}">${iconoEd(m.ed, 16)}<div class="bar"><i style="width:${Math.round(m.avance * 100)}%"></i></div></div>`).join('')}
      <div class="sd-bar${e.sede.obra ? ' obra' : ''}" title="${esc(t('ed.sede'))}">${iconoEd('sede', 16)}<div class="bar"><i style="width:${e.sede.obra ? Math.round(100 * Math.min(0.95, Math.max(0.05, 1 - e.sede.diasFalta / Math.max(1, e.sede.obra.dias)))) : 0}%"></i></div></div></div>`;
    const cofre = cofreDisponible(s)
      ? `<button class="btn green sd-btn" data-ext="sede" data-acc="cofre">${iconoMat('planos', 18).replace('class="sd-ico"', 'class="sd-ico" style="display:inline-block;vertical-align:-4px;margin-inline-end:6px"')}${esc(t('cofre'))}</button>`
      : `<button class="btn sd-btn" disabled>${esc(t('cofre_ya'))}</button>`;
    return `<div class="card sd-card" data-ext="sede" data-acc="abrir" role="button" tabindex="0" aria-label="${esc(t('modal_titulo'))}">
      <div class="sd-head">${iconoEd('sede', 40)}<div class="grow"><div class="small muted">${esc(t('titulo'))}</div>
        <div class="sd-lv">${esc(t('nivel', { n: e.nivel }))}</div></div>
        <span class="tag">${esc(e.max ? t('nivel_max') : t('abrir') + ' ›')}</span></div>
      ${bars}
      ${e.max ? '' : textoObras(s, e)}
      ${tiraMateriales(s)}
      ${cofre}
    </div>`;
  }
  function chipsCosto(s, c, ctx) {
    const have = est(s).materiales;
    const parts = Object.keys(c.mat).map((m) => `<span class="sd-c ${have[m] >= c.mat[m] ? 'ok' : 'no'}" title="${esc(t('mat.' + m))}">${iconoMat(m, 16)}${have[m] || 0}/${c.mat[m]}</span>`);
    parts.push(`<span class="sd-c ${s.money >= c.dinero ? 'ok' : 'no'}">${esc(plata(ctx, c.dinero))}</span>`);
    parts.push(`<span class="sd-c">⏱ ${esc(diasTxt(c.dias))}</span>`);
    return `<div class="sd-cost">${parts.join('')}</div>`;
  }
  function modalHtml(ctx) {
    const s = estadoDe(ctx);
    const e = etapa(s), d = est(s);
    const libre = d.obras.length < obreros(s);
    const head = `<div class="row between"><h2 style="margin:0">${esc(t('modal_titulo'))}</h2><button class="btn sm" data-act="close" aria-label="×">✕</button></div>
      <div class="sd-head" style="margin-top:8px">${iconoEd('sede', 34)}<div class="grow"><div class="sd-lv">${esc(t('nivel', { n: e.nivel }))}</div>
      <div class="small muted">${esc(e.max ? t('max') : t('modal_intro', { n: e.objetivo }))}</div></div></div>
      ${tiraMateriales(s)}${e.max ? '' : textoObras(s, e)}
      ${obreros(s) < 2 ? `<div class="small muted" style="margin-top:4px">${esc(t('segundo', { n: AJUSTE.segundoObrero }))}</div>` : ''}`;
    let lista = '';
    if (!e.max) {
      lista = e.mejoras.map((m) => {
        const p = puede(s, m.costo);
        const btn = m.hecha ? `<span class="tag" style="margin-top:8px">✓ ${esc(t('listo'))}</span>`
          : m.obra ? `<span class="tag amber" style="margin-top:8px">${esc(t('en_obra', { d: diasTxt(Math.max(1, m.diasFalta)) }))}</span>`
          : `<button class="btn ${p.ok && libre ? 'main' : ''} sd-btn" data-ext="sede" data-acc="mejorar" data-ed="${m.ed}">${esc(t('mejorar'))}</button>
             ${!libre ? `<div class="small muted">${esc(t('sin_equipo'))}</div>` : ''}`;
        return `<div class="sd-item${m.hecha ? ' done' : ''}"><div class="sd-head">${iconoEd(m.ed, 30)}<div class="grow"><b>${esc(t('ed.' + m.ed))}</b> <span class="small muted">${esc(t('ed_nivel', { n: m.nivelEd }))}${m.hecha ? '' : ' → ' + (m.nivelEd + 1)}</span>
          <div class="small muted">${esc(t('desc.' + m.ed))}</div></div></div>${m.hecha || m.obra ? '' : chipsCosto(s, m.costo, ctx)}${btn}</div>`;
      }).join('');
      const sd = e.sede;
      const reqOk = sd.req.every((r) => r.ok);
      const todas = e.hechas === e.mejoras.length;
      const btn = sd.obra ? `<span class="tag amber" style="margin-top:8px">${esc(t('en_obra', { d: diasTxt(Math.max(1, sd.diasFalta)) }))}</span>`
        : `<button class="btn ${todas && reqOk && libre && puede(s, sd.costo).ok ? 'main' : ''} sd-btn" data-ext="sede" data-acc="subir">${esc(t('subir', { n: e.objetivo }))}</button>
           ${!todas ? `<div class="small muted">${esc(t('faltan_mejoras', { h: e.hechas, n: e.mejoras.length }))}</div>` : ''}`;
      lista += `<div class="sd-item" style="border-color:var(--amber)"><div class="sd-head">${iconoEd('sede', 30)}<div class="grow"><b>${esc(t('ed.sede'))}</b> <span class="small muted">→ ${esc(t('nivel', { n: e.objetivo }))}</span>
        ${sd.req.length ? `<div class="sd-req small"><span class="muted">${esc(t('req_titulo'))}:</span>${sd.req.map((r) => `<span class="tag ${r.ok ? '' : 'red'}">${r.ok ? '✓' : '✗'} ${esc(t(r.k, r.p))}</span>`).join('')}</div>` : ''}
        </div></div>${sd.obra ? '' : chipsCosto(s, sd.costo, ctx)}${btn}</div>`;
    }
    const rec = reciclables(s);
    const recHtml = `<div class="sectitle" style="margin-top:14px">${esc(t('reciclar_t'))}</div><div class="small muted">${esc(t('reciclar_info'))}</div>
      ${rec.length ? rec.slice(0, 8).map((r) => `<div class="sd-item"><div class="row between" style="gap:8px"><div class="grow" style="min-width:0"><b style="overflow-wrap:anywhere">${esc(nombreEquipo(r.e))}</b>
        <div class="small muted">${esc(t('estado', { n: r.e.condition }))}</div></div>
        <button class="btn sm sd-btn" data-ext="sede" data-acc="reciclar" data-id="${r.e.id}">${esc(t('reciclar'))}</button></div>
        <div class="sd-cost">${MATS.filter((m) => r.bolsa[m]).map((m) => `<span class="sd-c ok">${iconoMat(m, 16)}+${r.bolsa[m]}</span>`).join('')}</div></div>`).join('')
        : `<div class="small muted" style="margin-top:6px">${esc(t('reciclar_nada'))}</div>`}`;
    const bl = listaBonos(s);
    const bonosHtml = `<div class="sectitle" style="margin-top:14px">${esc(t('bonos'))}</div>
      ${bl.length ? bl.map((b) => `<div class="sd-bono">${iconoEd(b.ed, 20)}<span>${esc(b.txt)}</span></div>`).join('') : `<div class="small muted">${esc(t('sin_bonos'))}</div>`}`;
    return `<div class="sd-modal">${head}${lista}${bonosHtml}${recHtml}
      <button class="btn" data-act="close" style="margin-top:14px">✕</button></div>`;
  }
  let ultimo = { k: '', t: 0 };
  function clic(ctx, accion, el) {
    const s = estadoDe(ctx);
    if (!s) return;
    // Evita repetir la misma acción si el clic llega por dos caminos a la vez
    const id = accion + ':' + (el && el.getAttribute ? (el.getAttribute('data-ed') || el.getAttribute('data-id') || '') : '');
    const ahora = Date.now ? Date.now() : 0;
    if (ultimo.k === id && ahora - ultimo.t < 350) return;
    ultimo = { k: id, t: ahora };
    const sonar = (ok) => { try { if (!ok && ctx.snd && ctx.snd.play) ctx.snd.play('error'); } catch (e) { /* sin sonido */ } };
    const avisar = (r) => { try { if (r && r.msg && ctx.toast) ctx.toast(r.msg); } catch (e) { /* sin toast */ } sonar(r && r.ok); };
    const guardar = () => { try { if (ctx.save) ctx.save(); } catch (e) { /* sin guardar */ } };
    const abierto = () => { try { const m = root.document && root.document.querySelector('#modal .sd-modal'); return !!m; } catch (e) { return false; } };
    const repintar = () => { try { if (ctx.render) ctx.render(); } catch (e) { /* nada */ } if (abierto()) ctx.openModal(modalHtml(ctx)); };
    // Con cuenta y servidor: todo pasa por /api/sede. Con la copia oficial pero sin saber todavía si hay red: esperar.
    if (enOficial(s)) { accionOficial(ctx, s, accion, el); return; }
    if (s.sede && s.sede.oficial) { avisar(resp(false, 'of_conectando')); return; }
    let r = null;
    switch (accion) {
      case 'abrir': ctx.openModal(modalHtml(ctx)); return;
      case 'cofre': r = reclamarCofre(s); break;
      case 'mejorar': r = mejorar(s, el && el.getAttribute('data-ed')); break;
      case 'subir': r = subirNivel(s); break;
      case 'reciclar': {
        const idn = Number(el && el.getAttribute('data-id'));
        const it = reciclables(s).find((x) => x.e.id === idn);
        if (!it) { avisar(resp(false, 'reciclar_nada')); return; }
        const hacer = () => { const rr = reciclar(s, idn); avisar(rr); guardar(); try { if (ctx.render) ctx.render(); } catch (e) { /* nada */ } ctx.openModal(modalHtml(ctx)); };
        if (ctx.ask) ctx.ask(esc(t('reciclar_q', { item: nombreEquipo(it.e), lista: listaTxt(it.bolsa) })), esc(t('reciclar')), hacer);
        else hacer();
        return;
      }
      default: return;
    }
    avisar(r);
    if (r && r.ok) guardar();
    repintar();
  }

  /* ---------- Sede oficial (servidor: server/src/SedeOficial.php, rutas /api/sede) ----------
     Con cuenta y servidor (Api.disponible y Api.logueado()), la tarjeta y la ventana leen y escriben por /api/sede y
     s.sede queda como COPIA del servidor (s.sede.oficial), así los bonos del juego (bonoCalidad, gastos, pago, cupos)
     salen del nivel oficial. La sede local se guarda aparte en s.sedeLocal y vuelve si no hay cuenta o no hay servidor.
     La primera vez, si la sede oficial está sin usar, se manda la local (POST /api/sede/migrar; el servidor le pone tope). */
  // Pedidos al servidor: NUNCA desde el pintado. Un solo vigilante (un temporizador) pide la sede al entrar en modo oficial,
  // cuando termina la próxima obra y cada 10 minutos; abrir la ventana pide como mucho una vez. Después de un error
  // (o una respuesta sin la forma esperada) espera 1 minuto, después 5 (ESPERAS) antes de volver a pedir.
  const ESPERAS = [60000, 300000];
  const REFRESCO = 600000, FRESCO = 30000;
  const OF_INICIO = () => ({ estado: null, cuenta: null, sync: 0, offset: 0, cargando: null, errorEn: 0, error: '', noDisponible: false,
    ayudas: null, ocupado: false, timer: null, migrado: false, errores: 0, bloqueoHasta: 0, vigilando: false, ayudasEn: 0 });
  const OF = OF_INICIO();
  function red() {
    try {
      const A = root.Api;
      if (!A || OF.noDisponible) return 'no';
      if (A.disponible !== true && A.disponible !== false) return 'espera';   // todavía no se sabe si hay servidor
      return A.disponible === true && typeof A.logueado === 'function' && A.logueado() ? 'si' : 'no';
    } catch (e) { return 'no'; }
  }
  function cuentaId() { try { const j = root.Api.estado.jugador; return j && j.id !== undefined && j.id !== null ? String(j.id) : '?'; } catch (e) { return '?'; } }
  const copia = (o) => JSON.parse(JSON.stringify(o));
  function salirOficial(s) {
    s.sede = s.sedeLocal && typeof s.sedeLocal === 'object' ? s.sedeLocal : nuevo(s);
    delete s.sedeLocal;
    migrar(s);
  }
  /** ¿Modo oficial? (cambia de cuenta o vuelve a la sede local cuando hace falta) */
  function enOficial(s) {
    const r = red();
    if (r === 'si' && OF.cuenta !== cuentaId()) {
      if (OF.timer) clearTimeout(OF.timer);
      Object.assign(OF, { estado: null, ayudas: null, sync: 0, errorEn: 0, error: '', migrado: false, errores: 0, bloqueoHasta: 0, timer: null, vigilando: false, ayudasEn: 0, cuenta: cuentaId() });
    }
    if (r === 'no' && s && s.sede && s.sede.oficial) salirOficial(s);
    return r === 'si';
  }
  function ponerCache(s, j) {
    if (!s || !j || !j.sede) return;
    const d = est(s);
    if (!d.oficial) s.sedeLocal = copia(d);
    const sd = j.sede;
    d.nivel = sd.nivel;
    d.mejoras = Object.assign({}, sd.mejoras || {});
    d.materiales = Object.assign({}, sd.materiales || {});
    d.obras = [];
    d.oficial = { ahora: j.ahora, cuenta: OF.cuenta };
  }
  const ahoraSrv = () => (Date.now() + OF.offset) / 1000;
  const restante = (o) => Math.max(0, Math.round(o.fin - ahoraSrv()));
  function costoAc(seg) {
    const R = (OF.estado && OF.estado.reglas) || { seg_por_credito: 360, costo_min: 5 };
    return seg <= 0 ? 0 : Math.max(R.costo_min, Math.ceil(seg / R.seg_por_credito));
  }
  function fmt(seg) {
    if (seg < 60) return t('of_t_0');
    const min = Math.ceil(seg / 60), h = Math.floor(min / 60);
    return h > 0 ? (min % 60 ? t('of_t_hm', { h, m: min % 60 }) : t('of_t_h', { h })) : t('of_t_m', { m: min });
  }
  // Errores del servidor con su código -> texto en el idioma del juego (si no, el texto del servidor)
  const ERR = {
    sin_obrero: () => t('sin_equipo'), faltan_mejoras: (d) => t('faltan_mejoras', { h: d.hechas, n: d.total }), requisito: () => t('req_no'),
    cofre_ya: () => t('cofre_ya'), max: () => t('max'), ya_hecha: () => t('listo'), en_obra: () => t('listo'),
    faltan_materiales: (d) => (d.falta ? t('falta', { lista: listaTxt(d.falta) }) : null), costo_cambio: (d) => t('of_costo_cambio', { n: d.costo }),
    sin_creditos: (d) => t('of_sin_creditos', { n: d.costo }), ya_ayudaste: () => t('of_ya_ayudaste'), ayudas_completas: () => t('of_ayudas_completas'),
    tope_ayudas_dia: () => t('of_tope_dia'), sin_asociacion: () => t('of_sin_asoc'),
  };
  function textoErr(j) {
    try { const f = j && j.codigo && ERR[j.codigo]; const v = f ? f(j) : null; if (v) return v; } catch (e) { /* texto del servidor */ }
    try { if (j && j.error) return root.I18N && root.I18N.TL ? root.I18N.TL(j.error) : j.error; } catch (e) { /* español */ }
    return (j && j.error) || t('of_red');
  }
  async function pedir(metodo, ruta, cuerpo) {
    let r, j = null;
    try {
      r = await root.fetch(ruta, { method: metodo, credentials: 'same-origin', cache: 'no-store', body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': (root.I18N && root.I18N.idioma) || 'es' } });
    } catch (e) { const x = new Error(t('of_red')); x.status = 0; throw x; }
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || typeof j !== 'object' || !r.ok || j.ok === false) {
      const x = new Error(textoErr(j || {}));
      x.status = r.status; x.codigo = (j && j.codigo) || null; x.datos = j || {};
      throw x;
    }
    return j;
  }
  function modalAbierto() { try { return !!(root.document && root.document.querySelector('#modal .sd-modal.sd-of')); } catch (e) { return false; } }
  function repintarOf(ctx) {
    try { if (ctx && ctx.render) ctx.render(); } catch (e) { /* nada */ }
    try { if (ctx && modalAbierto()) ctx.openModal(modalOficial(ctx)); } catch (e) { /* nada */ }
  }
  /** Guarda la vista del servidor. false si no tiene la forma esperada (no se usa: cuenta como error). */
  function recibir(ctx, j) {
    const sd = j && j.sede;
    if (!sd || typeof sd !== 'object' || typeof sd.nivel !== 'number' || !Array.isArray(sd.obras) || !sd.materiales || !sd.cofre) return false;
    OF.estado = j; OF.sync = Date.now(); OF.error = ''; OF.errorEn = 0;
    if (typeof j.ahora === 'number') OF.offset = j.ahora * 1000 - Date.now();
    const s = estadoDe(ctx);
    if (s && enOficial(s)) ponerCache(s, j);
    if (OF.vigilando) vigilar(ctx);
    return true;
  }
  /** Un solo temporizador: próxima obra que termina, fin de la espera tras un error o 10 minutos. */
  function vigilar(ctx) {
    try {
      if (OF.timer) clearTimeout(OF.timer);
      OF.timer = null; OF.vigilando = true;
      const ahora = Date.now();
      let ms = REFRESCO;
      if (ahora < OF.bloqueoHasta) ms = OF.bloqueoHasta - ahora + 50;
      else if (OF.estado && OF.estado.sede.obras.length) ms = Math.min(REFRESCO, (Math.min.apply(null, OF.estado.sede.obras.map(restante)) + 1) * 1000);
      ms = Math.max(2000, ms);
      OF.timer = setTimeout(() => {
        OF.timer = null;
        const s = estadoDe(ctx);
        if (s && enOficial(s)) cargar(ctx, true); else OF.vigilando = false;
      }, ms);
      if (OF.timer && OF.timer.unref) OF.timer.unref();
    } catch (e) { /* sin reloj */ }
  }
  /** Lo llama la tarjeta: arranca el vigilante UNA vez (el primer pedido va fuera del pintado). */
  function asegurarVigilante(ctx) {
    if (OF.vigilando) return;
    OF.vigilando = true;
    try {
      OF.timer = setTimeout(() => { OF.timer = null; const s = estadoDe(ctx); if (s && enOficial(s)) cargar(ctx, false); else OF.vigilando = false; }, 0);
    } catch (e) { OF.vigilando = false; }
  }
  function tieneProgreso(d) {
    return !!(d && typeof d === 'object' && (d.nivel > 1 || (d.mejoras && Object.keys(d.mejoras).length) || (Array.isArray(d.obras) && d.obras.length)
      || (d.materiales && MATS.some((m) => d.materiales[m] > 0))));
  }
  // Primera vez con cuenta: la sede de este celular pasa a la cuenta (el servidor pone el tope)
  async function quizasMigrar(ctx) {
    const j = OF.estado, s = estadoDe(ctx);
    if (OF.migrado || !j || !j.sede.migracion || !j.sede.migracion.posible || !s) return;
    OF.migrado = true;
    const loc = s.sedeLocal;
    if (!tieneProgreso(loc)) return;
    try {
      const r = await pedir('POST', '/api/sede/migrar', { local: { nivel: loc.nivel, mejoras: loc.mejoras, materiales: loc.materiales, obras: loc.obras } });
      recibir(ctx, r);
      try { if (ctx.toast) ctx.toast(t(r.recortado ? 'of_migrado_tope' : 'of_migrado', { n: r.sede.nivel })); } catch (e) { /* sin aviso */ }
      try { if (ctx.save) ctx.save(); } catch (e) { /* sin guardar */ }
    } catch (e) { /* se queda en nivel 1: la sede local sigue guardada en s.sedeLocal */ }
  }
  function errorCarga(e) {
    // Sin el módulo en el servidor (404/405) o la sesión se cerró (401): la sede local, como siempre
    if (e && (e.status === 404 || e.status === 405 || e.status === 401)) OF.noDisponible = true;
    OF.error = (e && e.message) || t('of_red'); OF.errorEn = Date.now();
    OF.errores += 1;
    OF.bloqueoHasta = Date.now() + ESPERAS[Math.min(OF.errores, ESPERAS.length) - 1];
  }
  /** Pide la vista (GET /api/sede). Nunca durante la espera tras un error; sin forzar, tampoco si se pidió hace menos de 30 s. */
  function cargar(ctx, forzar) {
    if (OF.cargando) return OF.cargando;
    if (Date.now() < OF.bloqueoHasta) { if (!OF.timer) vigilar(ctx); return Promise.resolve(null); }
    if (!forzar && OF.estado && Date.now() - OF.sync < FRESCO) return Promise.resolve(OF.estado);
    OF.cargando = pedir('GET', '/api/sede')
      .then((j) => {
        if (!recibir(ctx, j)) { const x = new Error(t('of_red')); x.status = 200; throw x; }
        OF.errores = 0; OF.bloqueoHasta = 0;
        return quizasMigrar(ctx);
      })
      .catch(errorCarga)
      .then(() => { OF.cargando = null; if (!OF.noDisponible) vigilar(ctx); repintarOf(ctx); });
    return OF.cargando;
  }
  /** Lista de ayudas: al abrir la ventana, como mucho una vez cada 30 s y nunca durante la espera tras un error. */
  function cargarAyudas(ctx) {
    if (Date.now() < OF.bloqueoHasta || (OF.ayudasEn && Date.now() - OF.ayudasEn < FRESCO)) return Promise.resolve(null);
    OF.ayudasEn = Date.now();
    return pedir('GET', '/api/sede/ayudas').then((j) => { if (j && Array.isArray(j.obras) && j.hoy) OF.ayudas = j; else errorCarga(null); })
      .catch(errorCarga).then(() => { if (modalAbierto()) ctx.openModal(modalOficial(ctx)); });
  }

  function tarjetaOficial(ctx, s) {
    const j = OF.estado;
    asegurarVigilante(ctx);   // no pide nada aquí: solo arranca (una vez) el vigilante
    if (j && (!s.sede.oficial || s.sede.oficial.ahora !== j.ahora)) ponerCache(s, j);
    const tit = `<div class="small muted">${esc(t('titulo'))}<span class="sd-of-tag">${esc(t('of_tag'))}</span></div>`;
    if (!j) {
      return `<div class="card sd-card" data-ext="sede" data-acc="abrir" role="button" tabindex="0" aria-label="${esc(t('modal_titulo'))}">
        <div class="sd-head">${iconoEd('sede', 40)}<div class="grow">${tit}<div class="small">${esc(OF.error || t('of_conectando'))}</div></div></div></div>`;
    }
    const sd = j.sede, e = sd.etapa;
    const av = (o) => (o ? Math.min(0.95, Math.max(0.05, 1 - restante(o) / Math.max(1, o.duracion))) : 0);
    const obraDe = (id) => sd.obras.find((o) => o.id === id) || null;
    const bars = !e ? '' : `<div class="sd-bars" style="grid-template-columns:repeat(${e.mejoras.length + 1},minmax(0,1fr))">${e.mejoras.map((m) =>
      `<div class="sd-bar${m.hecha ? ' done' : m.obra_id ? ' obra' : ''}" title="${esc(t('ed.' + m.ed))}">${iconoEd(m.ed, 16)}<div class="bar"><i style="width:${m.hecha ? 100 : Math.round(av(obraDe(m.obra_id)) * 100)}%"></i></div></div>`).join('')}
      <div class="sd-bar${e.sede.obra_id ? ' obra' : ''}" title="${esc(t('ed.sede'))}">${iconoEd('sede', 16)}<div class="bar"><i style="width:${Math.round(av(obraDe(e.sede.obra_id)) * 100)}%"></i></div></div></div>`;
    const items = [];
    for (let i = 0; i < sd.obreros; i++) {
      const o = sd.obras[i];
      items.push(o ? `<span class="tag amber">${iconoEd(o.ed, 14)} ${esc(t('ed.' + o.ed))} · ${esc(fmt(restante(o)))}</span>` : `<span class="tag">${esc(t('obra_libre'))}</span>`);
    }
    const obras = sd.max ? '' : `<div class="sd-obra small"><span class="muted">${esc(t('obra'))}:</span>${items.join('')}</div>`;
    const cofre = sd.cofre.disponible
      ? `<button class="btn green sd-btn" data-ext="sede" data-acc="cofre">${iconoMat('planos', 18).replace('class="sd-ico"', 'class="sd-ico" style="display:inline-block;vertical-align:-4px;margin-inline-end:6px"')}${esc(t('cofre'))}</button>`
      : `<button class="btn sd-btn" disabled>${esc(t('of_cofre_vuelve', { t: fmt(Math.max(0, sd.cofre.proximo - ahoraSrv())) }))}</button>`;
    return `<div class="card sd-card sd-of" data-ext="sede" data-acc="abrir" role="button" tabindex="0" aria-label="${esc(t('modal_titulo'))}">
      <div class="sd-head">${iconoEd('sede', 40)}<div class="grow">${tit}
        <div class="sd-lv">${esc(t('nivel', { n: sd.nivel }))}</div></div>
        <span class="tag">${esc(sd.max ? t('nivel_max') : t('abrir') + ' ›')}</span></div>
      ${bars}${obras}${tiraMat(sd.materiales)}${cofre}
    </div>`;
  }
  function costoOf(mat, have, seg) {
    const parts = Object.keys(mat).map((m) => `<span class="sd-c ${(have[m] || 0) >= mat[m] ? 'ok' : 'no'}" title="${esc(t('mat.' + m))}">${iconoMat(m, 16)}${have[m] || 0}/${mat[m]}</span>`);
    parts.push(`<span class="sd-c">⏱ ${esc(fmt(seg))}</span>`);
    return `<div class="sd-cost">${parts.join('')}</div>`;
  }
  function modalOficial(ctx) {
    const s = estadoDe(ctx), j = OF.estado;
    const cerrar = `<div class="row between"><h2 style="margin:0">${esc(t('modal_titulo'))}</h2><button class="btn sm" data-act="close" aria-label="×">✕</button></div>`;
    if (!j) return `<div class="sd-modal sd-of">${cerrar}<p class="small muted">${esc(OF.error || t('of_conectando'))}</p><button class="btn" data-act="close" style="margin-top:14px">✕</button></div>`;
    const sd = j.sede, e = sd.etapa, have = sd.materiales;
    const libre = sd.obras.length < sd.obreros;
    const head = `${cerrar}
      <div class="sd-head" style="margin-top:8px">${iconoEd('sede', 34)}<div class="grow"><div class="sd-lv">${esc(t('nivel', { n: sd.nivel }))}<span class="sd-of-tag">${esc(t('of_tag'))}</span></div>
      <div class="small muted">${esc(sd.max ? t('max') : t('modal_intro', { n: e.objetivo }))}</div></div></div>
      <div class="small sd-of-info">${esc(t('of_info', { n: sd.bono_competencia }))}</div>
      ${tiraMat(have)}
      ${sd.aceleradores_min > 0 ? `<div class="small" style="margin-top:6px">⏩ ${esc(t('of_acel', { t: fmt(sd.aceleradores_min * 60) }))}</div>` : ''}
      ${sd.obreros < 2 ? `<div class="small muted" style="margin-top:4px">${esc(t('segundo', { n: AJUSTE.segundoObrero }))}</div>` : ''}`;
    // Obras en curso: tiempo real, ayudas y acelerar (el costo se ve antes de confirmar)
    const obras = sd.obras.map((o) => {
      const rest = restante(o), c = costoAc(rest);
      const nom = o.tipo === 'nivel' ? t('subiendo', { n: o.nivel }) : t('ed.' + o.ed);
      return `<div class="sd-item sd-of-obra" style="border-color:var(--amber)"><div class="sd-head">${iconoEd(o.ed, 30)}<div class="grow"><b>${esc(nom)}</b>
        <div class="small muted">${esc(t('en_obra', { d: fmt(rest) }))} · ${esc(t('of_ayudas_obra', { n: o.ayudas, m: o.ayudas_max }))}</div></div></div>
        <div class="bar"><i style="width:${Math.round(100 * Math.min(1, Math.max(0, 1 - rest / Math.max(1, o.duracion))))}%"></i></div>
        <div class="sd-of-btns"><button class="btn main sd-btn" data-ext="sede" data-acc="acelerar" data-obra="${o.id}" data-costo="${c}">⚡ ${esc(t('of_acelerar', { n: c }))}</button>
        ${sd.aceleradores_min > 0 ? `<button class="btn sd-btn" data-ext="sede" data-acc="acel_min" data-obra="${o.id}">⏩ ${esc(t('of_usar_acel'))}</button>` : ''}${root.AyudaAsoc ? root.AyudaAsoc.botonPedir(o) : ''}</div></div>`;
    }).join('');
    let lista = '';
    if (e) {
      lista = e.mejoras.map((m) => {
        const ok = !Object.keys(m.falta || {}).length;
        const o = m.obra_id ? sd.obras.find((x) => x.id === m.obra_id) : null;
        const btn = m.hecha ? `<span class="tag" style="margin-top:8px">✓ ${esc(t('listo'))}</span>`
          : o ? `<span class="tag amber" style="margin-top:8px">${esc(t('en_obra', { d: fmt(restante(o)) }))}</span>`
          : `<button class="btn ${ok && libre ? 'main' : ''} sd-btn" data-ext="sede" data-acc="mejorar" data-ed="${m.ed}">${esc(t('mejorar'))}</button>
             ${!libre ? `<div class="small muted">${esc(t('sin_equipo'))}</div>` : ''}`;
        return `<div class="sd-item${m.hecha ? ' done' : ''}"><div class="sd-head">${iconoEd(m.ed, 30)}<div class="grow"><b>${esc(t('ed.' + m.ed))}</b> <span class="small muted">${esc(t('ed_nivel', { n: m.nivel_ed }))}${m.hecha ? '' : ' → ' + (m.nivel_ed + 1)}</span>
          <div class="small muted">${esc(t('desc.' + m.ed))}</div></div></div>${m.hecha || o ? '' : costoOf(m.mat, have, m.segundos)}${btn}</div>`;
      }).join('');
      const x = e.sede, ox = x.obra_id ? sd.obras.find((y) => y.id === x.obra_id) : null;
      const todas = e.hechas === e.mejoras.length;
      const btn = ox ? `<span class="tag amber" style="margin-top:8px">${esc(t('en_obra', { d: fmt(restante(ox)) }))}</span>`
        : `<button class="btn ${x.listo && libre && !Object.keys(x.falta || {}).length ? 'main' : ''} sd-btn" data-ext="sede" data-acc="subir">${esc(t('subir', { n: e.objetivo }))}</button>
           ${!todas ? `<div class="small muted">${esc(t('faltan_mejoras', { h: e.hechas, n: e.mejoras.length }))}</div>` : ''}`;
      lista += `<div class="sd-item" style="border-color:var(--amber)"><div class="sd-head">${iconoEd('sede', 30)}<div class="grow"><b>${esc(t('ed.sede'))}</b> <span class="small muted">→ ${esc(t('nivel', { n: e.objetivo }))}</span>
        ${x.req.length ? `<div class="sd-req small"><span class="muted">${esc(t('req_titulo'))}:</span>${x.req.map((r) => `<span class="tag ${r.ok ? '' : 'red'}">${r.ok ? '✓' : '✗'} ${esc(t(r.k, r.p))}</span>`).join('')}</div>` : ''}
        </div></div>${ox ? '' : costoOf(x.mat, have, x.segundos)}${btn}</div>`;
    }
    // Ayudas a la asociación
    const A = OF.ayudas;
    let ayudas = `<div class="sectitle" style="margin-top:14px">${esc(t('of_ayudas_t'))}</div><div class="small muted">${esc(t('of_ayudas_info', { m: (j.reglas && j.reglas.ayudas_max) || 10 }))}</div>`;
    if (!A) ayudas += `<div class="small muted" style="margin-top:6px">${esc(t('of_conectando'))}</div>`;
    else if (A.asociacion === null) ayudas += `<div class="small muted" style="margin-top:6px">${esc(t('of_sin_asoc'))}</div>`;
    else {
      ayudas += `<div class="small" style="margin-top:6px">${esc(t('of_ayudas_hoy', { n: A.hoy.ayudas, m: A.hoy.max }))}</div>`;
      ayudas += A.obras.length ? A.obras.slice(0, 20).map((o) => `<div class="sd-item"><div class="sd-of-ayuda">${iconoEd(o.ed, 28)}<div class="grow"><b>${esc(o.nombre)}</b>
          <div class="small muted">${esc(o.tipo === 'nivel' ? t('subiendo', { n: o.nivel }) : t('ed.' + o.ed))} · ${esc(fmt(o.restante))} · ${esc(t('of_ayudas_obra', { n: o.ayudas, m: o.ayudas_max }))}</div></div>
          <button class="btn sm green sd-btn" data-ext="sede" data-acc="ayudar" data-jugador="${o.jugador_id}" data-obra="${o.obra_id}"${A.hoy.ayudas >= A.hoy.max ? ' disabled' : ''}>🤝 ${esc(t('of_ayudar'))}</button></div></div>`).join('')
        : `<div class="small muted" style="margin-top:6px">${esc(t('of_ayudas_nada'))}</div>`;
    }
    const bl = s ? listaBonos(s) : [];
    const bonosHtml = `<div class="sectitle" style="margin-top:14px">${esc(t('bonos'))}</div>
      ${bl.length ? bl.map((b) => `<div class="sd-bono">${iconoEd(b.ed, 20)}<span>${esc(b.txt)}</span></div>`).join('') : `<div class="small muted">${esc(t('sin_bonos'))}</div>`}`;
    // Equipo de obra extra (js/impulsos.js): botón discreto junto a la cola solo si todos los equipos están ocupados
    const colaExtra = (() => { try { return root.Impulsos && root.Impulsos.avisoCola ? root.Impulsos.avisoCola(sd) || '' : ''; } catch (err) { return ''; } })();
    return `<div class="sd-modal sd-of">${head}${obras}${colaExtra}${lista}${ayudas}${bonosHtml}
      <div class="small muted" style="margin-top:14px">${esc(t('of_fuentes'))}</div>
      <button class="btn" data-act="close" style="margin-top:14px">✕</button></div>`;
  }
  function accionOficial(ctx, s, accion, el) {
    const j = OF.estado;
    const aviso = (m) => { try { if (m && ctx.toast) ctx.toast(m); } catch (e) { /* sin aviso */ } };
    const error = () => { try { if (ctx.snd && ctx.snd.play) ctx.snd.play('error'); } catch (e) { /* sin sonido */ } };
    const attr = (k) => (el && el.getAttribute ? el.getAttribute(k) : null);
    if (accion === 'abrir') { ctx.openModal(modalOficial(ctx)); cargarAyudas(ctx); cargar(ctx, false); return; }
    if (!j) { aviso(t('of_conectando')); return; }
    if (OF.ocupado) { aviso(t('of_espera')); return; }
    const abrirDespues = modalAbierto();
    const hacer = (promesa, texto, despues) => {
      OF.ocupado = true;
      promesa.then((r) => {
        if (r && r.sede) recibir(ctx, r);
        aviso(texto ? texto(r) : '');
        try { if (ctx.save) ctx.save(); } catch (e) { /* sin guardar */ }
        return despues ? despues(r) : null;
      }).catch((e) => {
        aviso(e && e.message); error();
        if (e && ['costo_cambio', 'ya_terminada', 'obra_no_existe', 'en_obra', 'ya_hecha', 'cofre_ya'].includes(e.codigo)) return cargar(ctx, true);
        return null;
      }).then(() => {
        OF.ocupado = false;
        try { if (ctx.render) ctx.render(); } catch (e) { /* nada */ }
        if (abrirDespues || modalAbierto()) ctx.openModal(modalOficial(ctx));
      });
    };
    switch (accion) {
      case 'cofre': hacer(pedir('POST', '/api/sede/cofre', {}), (r) => t('cofre_ok', { lista: listaTxt(r.bolsa || {}) })); return;
      case 'mejorar': {
        const ed = attr('data-ed');
        const m = j.sede.etapa && j.sede.etapa.mejoras.find((x) => x.ed === ed);
        hacer(pedir('POST', '/api/sede/mejorar', { clave: ed }), () => t('empezaste', { que: t('ed.' + ed), d: fmt(m ? m.segundos : 0) }));
        return;
      }
      case 'subir': {
        const x = j.sede.etapa && j.sede.etapa.sede;
        hacer(pedir('POST', '/api/sede/subir', {}), () => t('empezaste', { que: t('ed.sede'), d: fmt(x ? x.segundos : 0) }));
        return;
      }
      case 'acelerar': {
        const id = Number(attr('data-obra'));
        const o = j.sede.obras.find((x) => x.id === id);
        if (!o) return;
        const costo = costoAc(restante(o));
        const que = o.tipo === 'nivel' ? t('ed.sede') : t('ed.' + o.ed);
        const ir = () => hacer(pedir('POST', '/api/sede/acelerar', { obra_id: id, confirmar_costo: costo }), () => t('of_acelerado', { que }));
        // Siempre se muestra el costo antes de cobrar
        if (ctx.ask) ctx.ask(esc(t('of_acelerar_q', { que, n: costo, c: j.creditos })), esc(t('of_acelerar_si')), () => { ir(); });
        else ir();
        return;
      }
      case 'acel_min': {
        const id = Number(attr('data-obra'));
        hacer(pedir('POST', '/api/sede/acelerar', { obra_id: id, usar: 'aceleradores' }), (r) => t('of_acel_ok', { t: fmt((r.minutos || 0) * 60) }));
        return;
      }
      case 'ayudar': {
        const jid = Number(attr('data-jugador')), oid = Number(attr('data-obra'));
        hacer(pedir('POST', '/api/sede/ayudar', { jugador_id: jid, obra_id: oid }),
          (r) => (r.premio ? t('of_ayuda_premio', { t: fmt(r.segundos), lista: listaTxt(r.premio) }) : t('of_ayuda_ok', { t: fmt(r.segundos) })),
          (r) => { if (r && r.lista) { OF.ayudas = r.lista; OF.ayudasEn = Date.now(); } return cargar(ctx, true); });
        return;
      }
      default: return;
    }
  }

  /* ---------- Registro ---------- */
  const EXT ={ id: 'sede', migrar, alNuevoDia, alTerminarEvento, bonoCalidad, multPago, multGastos, limites };
  const TARJETA = { id: 'sede', orden: 10, tarjeta, clic };
  let registrada = false, tarjetaPuesta = false;
  function registrar() {
    G = G0() || G;
    if (!G) return false;
    registrarTextos();
    if (!registrada && typeof G.registrarExtension === 'function') { G.registrarExtension(EXT); registrada = true; }
    if (!tarjetaPuesta && typeof root.window !== 'undefined') {
      root.EnVivoInicio = root.EnVivoInicio || [];
      if (!root.EnVivoInicio.some((x) => x && x.id === 'sede')) root.EnVivoInicio.push(TARJETA);
      tarjetaPuesta = true;
    }
    return registrada;
  }
  registrar();
  ponerCss();
  try {
    if (root.document && !registrada) root.document.addEventListener('DOMContentLoaded', () => { registrar(); ponerCss(); });
    if (root.I18N && root.I18N.onChange) root.I18N.onChange(registrarTextos);
  } catch (e) { /* sin documento */ }

  const Sede = { AJUSTE, MATS, TRAD, EXT, TARJETA, requisito, edificiosDe, costo, etapa, mejorar, subirNivel, reclamarCofre, cofreDisponible,
    reciclar, reciclables, bonos, listaBonos, nivelEdificio, actualizar, migrar, nuevo, tarjeta, modalHtml, clic, registrar, t, iconoMat, iconoEd,
    // Sede oficial (servidor)
    oficial: { enOficial, cargar, modalOficial, costoAc, fmt, ponerCache, salirOficial, get estado() { return OF.estado; }, get ayudas() { return OF.ayudas; },
      reiniciar() { if (OF.timer) clearTimeout(OF.timer); Object.assign(OF, OF_INICIO()); } },
    get registrada() { return registrada; } };
  root.Sede = Sede;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sede;
})(typeof window !== 'undefined' ? window : globalThis);
