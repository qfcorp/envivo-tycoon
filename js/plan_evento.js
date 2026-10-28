/* =========================================================
   EN VIVO Tycoon — Plan del evento (personal por rol, plan de cámaras,
   contrato internacional y resumen de riesgos).
   Funciones puras que devuelven HTML (SVG en línea). No tocan el estado del juego.

     PlanEvento.personal(crewPlan, opts)            → tabla de personal por rol con semáforo
     PlanEvento.camaras(cameraPlan, tipo, opts)     → plano visto desde arriba con las cámaras
     PlanEvento.internacional(contrato, opts)       → tarjeta de contrato internacional
     PlanEvento.resumenRiesgo(crewPlan, opts)       → chips de una línea para el resultado
     PlanEvento.posiciones(tipo)                    → posiciones de cámara por defecto de un evento
     PlanEvento.lugar(tipo)                         → 'futbol' | 'ring' | 'concierto' | 'iglesia' | 'salon' | 'escenario' | 'calle'

   Tolera datos incompletos: lo que falta no se muestra.
   Textos: usa I18N si existe (claves pe.*) y si no, el español de aquí.
   Usa Art (js/art.js) si está cargado para avatares e íconos; si no, dibuja lo suyo.
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------- Textos (español) ---------- */
  const ES = {
    'pe.personal': 'Personal del evento',
    'pe.col.asig': 'Llevas', 'pe.col.min': 'Mínimo', 'pe.col.ideal': 'Ideal',
    'pe.ley.completo': 'Cubierto', 'pe.ley.justo': 'Puedes ir, con riesgo', 'pe.ley.falta': 'Falta el mínimo',
    'pe.est.falta': 'Falta', 'pe.est.justo': 'Justo', 'pe.est.completo': 'Completo',
    'pe.res.falta': '{n} en falta', 'pe.res.justo': '{n} justo', 'pe.res.completo': '{n} completo',
    'pe.sifalta': 'Si falta: {t}',
    'pe.riesgo.pct': 'riesgo {p}%',
    'pe.sueldos': 'Sueldos', 'pe.ahorro': 'Ahorras {m} vs equipo ideal', 'pe.ahorro.riesgo': 'a cambio de más riesgo',
    'pe.ideal.sueldos': 'Equipo ideal: {m}',
    'pe.sinroles': 'Este evento no pide personal extra.',
    'pe.asignados': '{a} asignados de {min} mínimo y {ideal} ideal',

    'pe.cams': 'Plan de cámaras', 'pe.cubiertas': '{a}/{t} cubiertas', 'pe.ajuste.medio': 'ajuste {p}%',
    'pe.leg.ok': 'Ideal', 'pe.leg.mid': 'Sirve', 'pe.leg.bad': 'No es la ideal', 'pe.leg.off': 'Vacía', 'pe.leg.na': 'Asignada',
    'pe.forma.fija': 'Fija', 'pe.forma.mano': 'Al hombro', 'pe.forma.robot': 'Robótica', 'pe.forma.aerea': 'Aérea',
    'pe.vacia': 'Sin cámara', 'pe.opcional': 'Opcional', 'pe.idealp': 'Ideal: {t}', 'pe.ajuste': 'Ajuste {p}%', 'pe.tocar': 'Toca una cámara para ver cuál va',
    'pe.sinop': 'sin camarógrafo: rinde menos', 'pe.cam.n': 'Cámara {n}', 'pe.um': 'UM', 'pe.control': 'CONTROL',

    // Plan de cámaras a mano (el jugador mueve las cámaras)
    'pe.ed.auto': 'Automático', 'pe.ed.manual': 'Tu plan', 'pe.ed.modo': 'Quién arma el plan de cámaras',
    'pe.ed.delta': '{n} vs. automático', 'pe.ed.igual': 'igual que el automático',
    'pe.ed.tip': 'Toca una cámara y después cualquier sitio libre del plano o una marca de piso. Toca una toma para ver por qué rinde así.',
    'pe.ed.tip_cam': 'Ahora toca dónde va {cam}: un sitio libre del plano o una marca de piso (los números dicen cuánto cambia la calidad). Lo rojo no se puede usar.',
    'pe.ed.tip_pos': 'Toca una cámara de abajo para ponerla en «{pos}».',
    'pe.ed.tray': 'Tus cámaras', 'pe.ed.libre': 'Sin posición', 'pe.ed.en': 'En la {n}',
    'pe.ed.quitar': 'Quitar la cámara', 'pe.ed.operador': 'Quién la maneja', 'pe.ed.nadie': 'Nadie',
    'pe.ed.sin_cam': 'Sin cámara. Toca una de tus cámaras para ponerla aquí.', 'pe.ed.cerrar': 'Cerrar',
    'pe.ed.encaje': 'Tipo de cámara en esta posición', 'pe.ed.encaje_ideal': 'Tipo de cámara (ideal: {t})', 'pe.ed.ajuste': 'Rinde {p}%', 'pe.ed.pts': 'puntos de calidad',
    'pe.ed.combos': 'Combos y fallas del plan', 'pe.ed.sin_combos': 'Todavía sin combos: prueba otras posiciones.',
    'pe.ed.tutorial': 'Desde tu próximo evento podrás mover las cámaras tú mismo y armar combos.',
    'pe.ed.no_va': 'no va', 'pe.ed.arrastra': 'También puedes arrastrar una cámara hasta su posición.',
    'pe.ed.ninguna': 'No llevas cámaras que funcionen en este evento.',
    'pe.ed.cliente.bien': 'El cliente notó las tomas: {t}', 'pe.ed.cliente.mal': 'El cliente notó: {t}',
    // Cámaras libres: mover cada cámara a cualquier sitio del plano
    'pe.ed.tip_mover': 'Ahora toca dónde va {cam}: otro sitio libre del plano, o una marca de piso para cambiarla de toma.',
    'pe.ed.mapa': 'Plano del lugar: toca un sitio libre para mover la cámara elegida',
    'pe.ed.marca': 'Marca de piso {n}: {toma}', 'pe.ed.cam_en': 'Cámara {n}: {cam} en «{toma}»',
    'pe.ed.a_marca': 'Volver a la marca', 'pe.ed.lleno': 'Todas las tomas tienen cámara: toca una cámara del plano para moverla o cambiarla.',
    'pe.ed.elige': 'Primero toca una cámara (en el plano o abajo) y después el sitio.',
    'pe.ed.movida': 'Fuera de su marca', 'pe.ed.cubre': 'Cubre: {toma}', 'pe.ed.comprar': 'Comprar en la Bodega',
    'pe.tk.t': 'Tomas clave', 'pe.tk.n': '{a} de {t} bien cubiertas', 'pe.tk.bien': 'Bien cubierta', 'pe.tk.extra': 'Extra',
    'pe.ley.marca': 'Marca sugerida', 'pe.ley.bloq': 'No se puede', 'pe.ley.alto': 'Zona alta', 'pe.v.alto': 'Alto', 'pe.v.no': 'No',

    'pe.intl': 'Contrato internacional', 'pe.intl.pago': '×{m} pago', 'pe.intl.dias': '{n} días de viaje', 'pe.intl.dia': '1 día de viaje',
    'pe.intl.gastos': 'Gastos de viaje {m}', 'pe.intl.bloqueo': 'Mientras viajas no puedes tomar otros contratos.',
    'pe.intl.req': 'Requisitos', 'pe.intl.cumples': '{a} de {t} listos', 'pe.intl.riesgo': 'Si sale mal, la caída de fama es grande.',
    'pe.intl.riesgo.n': 'Si sale mal: {n} de fama.', 'pe.intl.paga': 'Paga {m}',

    'pe.chip.sin': 'Fuiste sin {rol}: +riesgo de {efecto}',
    'pe.chip.pocos': 'Pocos {rolp} ({a} de {min}): +riesgo de {efecto}',
    'pe.chip.justo': 'Justo en {rolp}: riesgo moderado de {efecto}',
    'pe.chip.ok': 'Equipo completo: solo el riesgo de siempre',
    'pe.chip.cam': 'Cámara {n} sin cubrir: {pos}',
    'pe.chip.mas': '+{n} más',
  };

  /* Roles: nombre corto (tabla), singular y plural en minúscula (chips), riesgo corto y efecto */
  const ROLE_ROWS = [
    // key, tabla, singular, plural, riesgo corto, efecto (chip), ícono Art, rol para avatar
    ['director', 'Realizador / director', 'director', 'directores', 'Planos tarde; se pierden goles y momentos clave', 'planos tarde', 'role_dir', 'dir'],
    ['productor', 'Productor / coordinador', 'productor', 'productores', 'Retrasos y cambios de última hora sin aviso', 'retrasos con el cliente', 'clients', 'productor'],
    ['camarografo', 'Camarógrafo', 'camarógrafo', 'camarógrafos', 'Cámara fija o apagada: un plano menos', 'cámaras fijas o apagadas', 'role_cam', 'cam'],
    ['operador_ptz', 'Operador de robóticas', 'operador de robóticas', 'operadores de robóticas', 'Las robóticas quedan en un solo plano', 'robóticas sin mover', 'pe_ptz', 'cam'],
    ['cablero', 'Asistente / cablero', 'cablero', 'cableros', 'Cables pisados; la cámara de mano no se mueve', 'cables pisados', 'cable', 'cablero'],
    ['sonidista', 'Sonidista (A1)', 'sonidista', 'sonidistas', 'Audio saturado, acoples o micrófonos a destiempo', 'audio saturado', 'role_audio', 'audio'],
    ['microfonista', 'Microfonista / boom (A2)', 'microfonista', 'microfonistas', 'Entrevistas con audio lejano; pilas que se acaban', 'entrevistas sin audio claro', 'mics', 'boom'],
    ['operador_repeticion', 'Operador de repeticiones', 'operador de repeticiones', 'operadores de repeticiones', 'Sin repeticiones: la jugada se ve una sola vez', 'quedarte sin repeticiones', 'pe_replay', 'replay'],
    ['operador_graficos', 'Operador de gráficos', 'operador de gráficos', 'operadores de gráficos', 'Sin marcador ni cintillos; auspiciantes molestos', 'salir sin marcador', 'ad', 'graficos'],
    ['shader', 'Ingeniero de video (shader)', 'shader', 'shaders', 'Cámaras con colores distintos; imagen quemada', 'colores distintos entre cámaras', 'pe_shader', 'shader'],
    ['tecnico_transmision', 'Técnico de transmisión', 'técnico de transmisión', 'técnicos de transmisión', 'Cortes de señal sin que nadie lo note', 'cortes en la transmisión', 'role_stream', 'stream'],
    ['piloto_dron', 'Piloto de dron', 'piloto de dron', 'pilotos de dron', 'No se puede usar el dron (o multa si vuela sin permiso)', 'no poder volar el dron', 'dron', 'dron'],
    ['coordinador_piso', 'Coordinador de piso', 'coordinador de piso', 'coordinadores de piso', 'Presentadores y artistas entran tarde', 'entradas tarde', 'pe_headset', 'productor'],
    ['runner', 'Runner / asistente', 'runner', 'runners', 'Nadie va por la pieza que falta', 'que nadie resuelva lo urgente', 'walk', 'cablero'],
  ];
  const ROLE = {};
  ROLE_ROWS.forEach((r, i) => {
    ROLE[r[0]] = { orden: i, icon: r[6], av: r[7] };
    ES['pe.rol.' + r[0]] = r[1]; ES['pe.rols.' + r[0]] = r[2]; ES['pe.rolp.' + r[0]] = r[3];
    ES['pe.riesgo.' + r[0]] = r[4]; ES['pe.efecto.' + r[0]] = r[5];
  });
  const ROLE_ALIAS = { cam: 'camarografo', camara: 'camarografo', camarografos: 'camarografo', dir: 'director', realizador: 'director', vmix: 'director',
    audio: 'sonidista', sonido: 'sonidista', a1: 'sonidista', stream: 'tecnico_transmision', streaming: 'tecnico_transmision', tecnico: 'tecnico_transmision', transmision: 'tecnico_transmision',
    boom: 'microfonista', a2: 'microfonista', replay: 'operador_repeticion', repeticion: 'operador_repeticion', repeticiones: 'operador_repeticion', evs: 'operador_repeticion',
    graficos: 'operador_graficos', cg: 'operador_graficos', ptz: 'operador_ptz', roboticas: 'operador_ptz', ccu: 'shader', vision: 'shader',
    dron: 'piloto_dron', piloto: 'piloto_dron', piso: 'coordinador_piso', stage_manager: 'coordinador_piso', asistente: 'cablero', asistente_camara: 'cablero',
    produccion: 'productor', coordinador: 'productor' };

  /* ---------- Posiciones de cámara por evento (de docs/eventos_y_personal.json) ---------- */
  // [key, nombre, cámara ideal]
  const F = { // fútbol, reutilizable
    principal: ['principal', 'Principal abierta en tribuna alta, a la altura de la media cancha', 'Cámara de sistema con lente box angular'],
    cerrada: ['cerrada', 'Principal cerrada junto a la 1', 'Cámara de sistema con lente box 80-100x'],
    area_izq: ['area_izq', 'En línea con el área izquierda (16 m / fuera de juego)', 'Cámara de sistema con lente largo'],
    area_der: ['area_der', 'En línea con el área derecha (16 m / fuera de juego)', 'Cámara de sistema con lente largo'],
    arco_izq_alto: ['arco_izq_alto', 'Detrás del arco izquierdo, en alto', 'Cámara de hombro con lente largo'],
    arco_der_alto: ['arco_der_alto', 'Detrás del arco derecho, en alto', 'Cámara de hombro con lente largo'],
    cancha: ['cancha', 'Al hombro en la banda (bancas, festejos, cambios)', 'Cámara de hombro inalámbrica o con cable'],
    contraplano: ['contraplano', 'Contraplano en la tribuna opuesta, al centro', 'Cámara de sistema o de hombro'],
    superlenta: ['superlenta', 'Súper lenta en un área', 'Cámara de cámara lenta (3x-6x)'],
    steadicam: ['steadicam', 'Estabilizador corporal en la salida de los equipos y entrevistas', 'Estabilizador corporal o cámara inalámbrica'],
    cerrada2: ['cerrada2', 'Cerrada con lente box 4K 100x+', 'Cámara de sistema 4K con lente box 100x+'],
    superlenta2: ['superlenta2', 'Segunda súper lenta en la otra área', 'Cámara de cámara lenta (3x-6x)'],
    baja_izq: ['baja_izq', 'Baja detrás de la línea de fondo izquierda', 'Cámara de hombro'],
    baja_der: ['baja_der', 'Baja detrás de la línea de fondo derecha', 'Cámara de hombro'],
    tactica: ['tactica', 'Táctica alta', 'Cámara fija con lente angular'],
    cablecam: ['cablecam', 'Arañacam / cablecam sobre la cancha', 'Sistema de cablecam'],
    dron: ['dron', 'Dron para la apertura y la premiación', 'Dron con cámara 4K'],
    steadicam2: ['steadicam2', 'Estabilizador corporal en la premiación y el túnel', 'Cámara con estabilizador corporal'],
    robotica_arco_izq: ['robotica_arco_izq', 'Robótica dentro del arco izquierdo', 'Minicámara robótica'],
    robotica_arco_der: ['robotica_arco_der', 'Robótica dentro del arco derecho', 'Minicámara robótica'],
    comcam: ['comcam', 'Cámara de comentaristas (ComCam)', 'PTZ o cámara pequeña'],
    beauty: ['beauty', 'Beauty: vista abierta del estadio', 'PTZ o cámara fija angular'],
    presentador: ['presentador', 'Presentador con el estadio de fondo', 'Cámara de hombro 4K'],
    zona_mixta: ['zona_mixta', 'Al hombro en zona mixta y entrevista flash', 'Cámara de hombro'],
  };
  const LIGAPRO = ['principal', 'cerrada', 'area_izq', 'area_der', 'arco_izq_alto', 'arco_der_alto', 'cancha', 'contraplano', 'superlenta', 'steadicam'];
  const FINAL = LIGAPRO.concat(['cerrada2', 'superlenta2', 'baja_izq', 'baja_der', 'cablecam', 'dron']);
  const POS_DEF = {
    misa: [['fondo', 'Fija al fondo de la nave: plano general del altar', 'PTZ o cámara en trípode'], ['ptz_lateral', 'PTZ lateral para lectores y consagración', 'Cámara robótica PTZ']],
    funeral: [['discreta', 'Fija y discreta, de costado: plano calmado del féretro y el atril', 'Cámara en trípode o PTZ'], ['oficiante', 'Segunda cámara para el oficiante', 'PTZ o cámara pequeña']],
    boda: [['frontal_altar', 'Frontal en el altar: plano de los novios', 'Cámara en trípode'], ['contraplano_fondo', 'Contraplano desde el fondo (entrada de la novia)', 'Cámara con lente largo'],
      ['gimbal', 'Cámara de cine en gimbal para detalles', 'Cámara de cine en gimbal'], ['dron', 'Dron para la toma del lugar (exterior)', 'Dron con cámara 4K']],
    prensa: [['frontal_mesa', 'Frontal a la mesa: plano medio del vocero', 'Cámara con lente largo en trípode'], ['abierta_ptz', 'Abierta de la mesa completa', 'PTZ'],
      ['reaccion', 'Reacción de periodistas preguntando', 'Cámara de hombro']],
    barrial: [['principal', 'Principal en alto a la media cancha (andamio o terraza)', 'Cámara de hombro con lente largo'], ['cerrada', 'Cerrada al lado de la principal', 'Cámara con zoom largo'],
      ['cancha', 'Al hombro en la banda o detrás de un arco', 'Cámara de hombro'], ['dron', 'Dron para tomas de apertura', 'Dron']],
    graduacion: [['frontal', 'Frontal al escenario desde el centro del público', 'Cámara con lente largo'], ['lateral_diplomas', 'Lateral para la entrega de diplomas', 'Cámara en trípode'],
      ['jib_publico', 'Jib o PTZ para tomas del público', 'Jib o PTZ'], ['reaccion_familias', 'Reacción de las familias', 'Cámara de hombro']],
    lanzamiento: [['frontal', 'Frontal al escenario: plano del presentador', 'Cámara con lente largo'], ['abierta', 'Abierta del escenario y la pantalla LED', 'Cámara angular'],
      ['gimbal_invitados', 'Gimbal entre invitados e influencers', 'Cámara de cine en gimbal'], ['cenital_revelacion', 'PTZ cenital o jib para la revelación', 'PTZ o jib'],
      ['photocall', 'Entrevistas en el photocall', 'Cámara de hombro + micrófono']],
    lanzamiento_autos: [['frontal', 'Frontal al escenario: presentador y auto', 'Cámara con lente largo'], ['jib_revelacion', 'Grúa o jib para la revelación del auto', 'Grúa / jib'],
      ['dolly', 'Dolly en riel, en paralelo al auto', 'Cámara en dolly'], ['gimbal_auto', 'Gimbal con cámara de cine alrededor del auto', 'Cámara de cine en gimbal'],
      ['pov_auto', 'Minicámaras POV dentro del auto', 'Minicámara POV'], ['dron', 'Dron en exteriores (prueba de manejo)', 'Dron con cámara 4K'],
      ['photocall', 'Entrevistas con influencers', 'Cámara de hombro + micrófono']],
    concierto: [['foh', 'Desde la torre de sonido (FOH): primeros planos del cantante', 'Cámara de sistema con lente largo'], ['abierta', 'Abierta del escenario', 'Cámara angular'],
      ['foso', 'Al hombro en el foso frente a la valla', 'Cámara de hombro'], ['jib', 'Jib o grúa sobre el público', 'Grúa / jib'], ['riel', 'Riel en la valla', 'Cámara en dolly'],
      ['roboticas', 'Robóticas en batería y teclados', 'Minicámaras robóticas'], ['steadicam', 'Estabilizador corporal en el escenario', 'Cámara con estabilizador corporal'], ['dron', 'Dron (al aire libre)', 'Dron']],
    boxeo: [['principal', 'Principal en alto: plano abierto del ring', 'Cámara en trípode con lente angular'], ['cerrada', 'Cerrada junto a la principal', 'Cámara con lente largo'],
      ['esquina1', 'Al hombro inalámbrica en esquina neutral 1', 'Cámara de hombro inalámbrica'], ['esquina2', 'Al hombro inalámbrica en esquina neutral 2 (entrevistas)', 'Cámara de hombro inalámbrica'],
      ['beauty', 'Abierta fija "beauty" del recinto', 'PTZ o cámara angular'], ['postes', 'Minicámaras en postes / estabilizador corporal en la caminata', 'Minicámara o estabilizador corporal']],
    lucha_libre: [['hardcam', 'Principal fija ("hard cam") frente al ring', 'Cámara en trípode'], ['hombro_izq', 'Al hombro en el ring (lado izquierdo)', 'Cámara de hombro'],
      ['hombro_der', 'Al hombro en el ring (lado derecho)', 'Cámara de hombro'], ['rampa', 'Rampa y escenario de entrada', 'Cámara con lente largo'], ['pov', 'POV en esquinas y público', 'Minicámara POV']],
    irl: [['gimbal', 'Celular o cámara de bolsillo en gimbal (en movimiento)', 'Cámara de bolsillo en gimbal'], ['accion', 'Cámara de acción para otro ángulo', 'Cámara de acción']],
    ligapro: LIGAPRO.map((k) => F[k]),
    final: FINAL.map((k) => F[k]),
    internacional_unilateral: [F.presentador, F.zona_mixta, F.comcam],
    internacional_host: FINAL.concat(['robotica_arco_izq', 'robotica_arco_der', 'comcam', 'beauty', 'steadicam2']).map((k) => F[k]),
  };
  Object.keys(POS_DEF).forEach((ev) => POS_DEF[ev].forEach((p) => { ES['pe.pos.' + ev + '.' + p[0]] = p[1]; ES['pe.idealcam.' + ev + '.' + p[0]] = p[2]; }));

  /* Nombre del evento por si Game no lo tiene */
  const EV_NAMES = { misa: 'Misa / ceremonia', funeral: 'Funeral en vivo', boda: 'Boda', prensa: 'Rueda de prensa', barrial: 'Partido de liga barrial',
    graduacion: 'Graduación', lanzamiento: 'Lanzamiento de marca', lanzamiento_autos: 'Lanzamiento de autos', concierto: 'Concierto', boxeo: 'Velada de boxeo',
    lucha_libre: 'Lucha libre', ligapro: 'Partido de LigaPrima', final: 'Final de campeonato', irl: 'Stream IRL', internacional_unilateral: 'Unilateral para canal extranjero',
    internacional_host: 'Producción host internacional' };
  Object.keys(EV_NAMES).forEach((k) => { ES['pe.ev.' + k] = EV_NAMES[k]; });

  /* Rótulos del plano */
  Object.assign(ES, {
    'pe.v.tribuna': 'Tribuna', 'pe.v.preferencia': 'Preferencia', 'pe.v.gen_sur': 'General sur', 'pe.v.gen_norte': 'General norte',
    'pe.v.graderio': 'Graderío', 'pe.v.malla': 'Malla', 'pe.v.bancas': 'Bancas', 'pe.v.cabinas': 'Cabinas',
    'pe.v.mesa_jueces': 'Mesa / jueces', 'pe.v.esquina_roja': 'Roja', 'pe.v.esquina_azul': 'Azul', 'pe.v.entrada': 'Escenario de entrada', 'pe.v.publico': 'Público',
    'pe.v.pantalla': 'Pantalla LED', 'pe.v.bateria': 'Batería', 'pe.v.teclados': 'Teclados', 'pe.v.foso': 'Foso', 'pe.v.foh': 'FOH', 'pe.v.voz': 'Voz',
    'pe.v.altar': 'Altar', 'pe.v.ambon': 'Ambón', 'pe.v.nave': 'Nave', 'pe.v.feretro': 'Féretro', 'pe.v.puerta': 'Entrada',
    'pe.v.novios': 'Novios', 'pe.v.jardin': 'Jardín', 'pe.v.escenario': 'Escenario', 'pe.v.diplomas': 'Diplomas', 'pe.v.atril': 'Atril',
    'pe.v.graduados': 'Graduados', 'pe.v.familias': 'Familias', 'pe.v.tarima': 'Tarima de cámaras', 'pe.v.mesa': 'Mesa principal', 'pe.v.backing': 'Backing',
    'pe.v.periodistas': 'Periodistas', 'pe.v.photocall': 'Photocall', 'pe.v.prueba': 'Prueba de manejo', 'pe.v.invitados': 'Invitados', 'pe.v.vip': 'Zona VIP',
    'pe.v.producto': 'Producto', 'pe.v.talento': 'Talento', 'pe.v.ruta': 'Ruta', 'pe.v.poca_senal': 'Poca señal', 'pe.v.antena': '4G / 5G',
  });

  /* ---------- Utilidades ---------- */
  const T = (k, p) => {
    try { if (root.I18N && root.I18N.T && (!root.I18N.T.has || root.I18N.T.has(k))) return root.I18N.T(k, p); } catch (e) { /* español */ }
    return String(ES[k] != null ? ES[k] : k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  };
  const has = (k) => { try { if (root.I18N && root.I18N.T && root.I18N.T.has && root.I18N.T.has(k)) return true; } catch (e) { /* nada */ } return ES[k] != null; };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null));
  const G = () => root.Game || {};
  const A = () => root.Art || null;
  const TLx = (t) => { try { return root.I18N && root.I18N.TL ? root.I18N.TL(t) : t; } catch (e) { return t; } };   // textos de la lógica
  // Dinero en el formato del idioma elegido (I18N.money); sin js/i18n.js, el de la lógica
  const money = (n) => {
    try { if (root.I18N && root.I18N.money) { const v = Math.round(Number(n) || 0); return v < 0 ? '-' + root.I18N.money(-v) : root.I18N.money(v); } } catch (e) { /* abajo */ }
    try { if (G().money) return G().money(n); } catch (e) { /* abajo */ }
    return '$' + Math.round(n).toLocaleString('es-EC');
  };
  const f1 = (n) => Math.round(n * 10) / 10;
  let UID = 0;

  function roleKey(k) {
    const n = norm(k).replace(/[\s/-]+/g, '_');
    if (ROLE[n]) return n;
    if (ROLE_ALIAS[n]) return ROLE_ALIAS[n];
    for (const r in ROLE) if (n.indexOf(r) === 0) return r;
    return n;
  }

  /* Íconos propios para roles que Art no tiene (24x24, trazo) */
  const OWN = {
    pe_ptz: '<rect x="7" y="13" width="10" height="7" rx="2"/><circle cx="12" cy="9" r="4.5"/><circle cx="12" cy="9" r="1.6"/><path d="M5 20h14"/>',
    pe_replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/><path d="M10.5 9v6l4.5-3z"/>',
    pe_shader: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="12" r="3"/><path d="M8.5 9v3"/><path d="M15 8v8M18 8v8M15 11h-1.5M18 14h1.5"/>',
    pe_headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13" width="4" height="6" rx="1.5"/><rect x="17.5" y="13" width="4" height="6" rx="1.5"/><path d="M19.5 19c0 1.5-2 2.5-5 2.5"/>',
    pe_globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/><path d="M5 7.5h14M5 16.5h14"/>',
    pe_plane: '<path d="M2.5 13.5l19-8-5.5 15-3.5-6z"/><path d="M12.5 14.5l9-9"/>',
    pe_bag: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M4 12h16"/>',
    pe_warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
    pe_users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0 1 21.5 19"/>',
  };
  function ico(name, size, cls) {
    const s = size || 18;
    if (OWN[name]) return `<svg class="pe-i ${cls || ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${OWN[name]}</svg>`;
    try { if (A() && A().icon) return A().icon(name, 'pe-i ' + (cls || ''), s); } catch (e) { /* abajo */ }
    return `<svg class="pe-i ${cls || ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${OWN.pe_users}</svg>`;
  }
  const CHECK = (ok) => ok === true
    ? '<svg class="pe-ck pe-ck-ok" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2"/><path d="M4.6 8.3l2.3 2.3 4.6-4.9"/></svg>'
    : ok === false
      ? '<svg class="pe-ck pe-ck-no" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2"/><path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2"/></svg>'
      : '<svg class="pe-ck pe-ck-na" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.2"/><path d="M5 8h6"/></svg>';

  /* ---------- Estilos (se inyectan una vez) ---------- */
  const CSS = `
.pe-crew,.pe-cams,.pe-intl{--pe-ok:var(--green,#2ecc71);--pe-mid:var(--amber,#ffb020);--pe-bad:var(--red,#ff3b3b);--pe-off:var(--muted,#8b95a8);--pe-na:var(--blue,#4da3ff);color:var(--text,#e9edf5);max-width:100%;min-width:0}
.pe-crew *,.pe-cams *,.pe-intl *{box-sizing:border-box}
.pe-hd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 6px;flex-wrap:wrap}
.pe-ttl{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:15px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted,#8b95a8)}
.pe-sub{font-size:12px;color:var(--muted,#8b95a8)}
.pe-sub b{color:var(--text,#e9edf5);font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:600}
.pe-box{background:var(--panel,#161a22);border:1px solid var(--line,#2a3242);border-radius:12px;overflow:hidden}
.pe-ch,.pe-row{display:grid;grid-template-columns:34px minmax(0,1fr) 114px 12px;align-items:center;gap:8px;padding:0 10px}
.pe-ch{font-size:10.5px;color:var(--muted,#8b95a8);text-transform:uppercase;letter-spacing:.6px;padding-top:7px;padding-bottom:5px;background:var(--panel2,#1e2430);border-bottom:1px solid var(--line,#2a3242)}
.pe-ch .pe-cnt i{color:var(--muted,#8b95a8)}
.pe-row{padding-top:7px;padding-bottom:7px;border-bottom:1px solid var(--line,#2a3242);position:relative}
.pe-row:last-child{border-bottom:0}
.pe-row::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:3px;border-radius:0 3px 3px 0;background:var(--pe-c)}
.pe-e-falta{--pe-c:var(--pe-bad);background:linear-gradient(90deg,rgba(255,59,59,.09),transparent 60%)}
.pe-e-justo{--pe-c:var(--pe-mid)}
.pe-e-completo{--pe-c:var(--pe-ok)}
.pe-av{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--panel2,#1e2430);border:1px solid var(--line,#2a3242);color:var(--text,#e9edf5);position:relative;flex:none}
.pe-av svg.avatar{width:32px;height:32px;border-radius:9px}
.pe-av .pe-more{position:absolute;right:-5px;bottom:-5px;font:600 9.5px "JetBrains Mono",ui-monospace,monospace;background:var(--bg,#0d0f14);border:1px solid var(--line,#2a3242);border-radius:6px;padding:0 3px;line-height:13px}
.pe-e-falta .pe-av{color:#ff8f8f}
.pe-rt{min-width:0}
.pe-rt b{display:block;font-size:13.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pe-rt small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11.5px;line-height:1.3;color:var(--muted,#8b95a8);margin-top:1px}
.pe-e-falta .pe-rt small{color:#ff9d9d}
.pe-e-justo .pe-rt small{color:#ffcf7a}
.pe-rt .pe-rk{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10.5px;color:var(--pe-c);margin-left:4px}
.pe-cnt{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;font-family:"JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:13px}
.pe-cnt b{color:var(--pe-c);font-weight:600}
.pe-cnt i{font-style:normal;color:var(--text,#e9edf5);opacity:.75}
.pe-ch .pe-cnt{font-family:inherit;font-size:9.5px;letter-spacing:0}
.pe-sem{display:flex;flex-direction:column;gap:2px;padding:2px;background:#07080b;border:1px solid var(--line,#2a3242);border-radius:4px;width:12px;align-items:center}
.pe-sem i{width:6px;height:6px;border-radius:50%;background:#262b36}
.pe-e-falta .pe-sem i:nth-child(1){background:var(--pe-bad);box-shadow:0 0 6px var(--pe-bad)}
.pe-e-justo .pe-sem i:nth-child(2){background:var(--pe-mid);box-shadow:0 0 6px var(--pe-mid)}
.pe-e-completo .pe-sem i:nth-child(3){background:var(--pe-ok);box-shadow:0 0 6px var(--pe-ok)}
.pe-sum{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 6px}
.pe-pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;border:1px solid var(--line,#2a3242);border-radius:999px;padding:1px 8px;background:var(--panel,#161a22);color:var(--text,#e9edf5);white-space:nowrap}
.pe-pill::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--pe-c,var(--pe-off))}
.pe-ft{display:flex;justify-content:space-between;align-items:center;gap:6px 10px;flex-wrap:wrap;padding:8px 10px;background:var(--panel2,#1e2430);border-top:1px solid var(--line,#2a3242);font-size:12.5px}
.pe-ft b{font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:600}
.pe-save{color:var(--pe-ok)}
.pe-ley{display:flex;flex-wrap:wrap;gap:4px 12px;padding:6px 10px;font-size:11.5px;color:var(--muted,#8b95a8);border-top:1px solid var(--line,#2a3242)}
.pe-ley span{display:inline-flex;align-items:center;gap:5px}
.pe-ley i{width:8px;height:8px;border-radius:50%;background:var(--pe-c);display:inline-block}
.pe-save small{display:block;color:var(--pe-mid);font-size:11px}
.pe-empty{padding:10px;font-size:12.5px;color:var(--muted,#8b95a8)}

.pe-dia{display:block;width:100%;height:auto;background:#0a0d13;border-bottom:1px solid var(--line,#2a3242);touch-action:manipulation}
.pe-dia text{font-family:"IBM Plex Sans",system-ui,sans-serif}
.pe-vl{font-size:7px;font-weight:600;letter-spacing:.7px;fill:#ffffff66}
.pe-vl.pe-dk{fill:#00000080}
.pe-cam{cursor:pointer;outline:none}
.pe-k-ok{--pe-c:var(--pe-ok)}.pe-k-mid{--pe-c:var(--pe-mid)}.pe-k-bad{--pe-c:var(--pe-bad)}.pe-k-off{--pe-c:var(--pe-off)}.pe-k-opt{--pe-c:var(--pe-off)}.pe-k-na{--pe-c:var(--pe-na)}
.pe-k-opt .pe-cone{fill-opacity:.03;stroke-dasharray:2 2;stroke-opacity:.3}.pe-k-opt .pe-dot{stroke-dasharray:2.2 1.6;opacity:.6}.pe-k-opt .pe-n{border-style:dashed;opacity:.7}
.pe-cone{fill:var(--pe-c);fill-opacity:.2;stroke:var(--pe-c);stroke-opacity:.5;stroke-width:.6}
.pe-k-off .pe-cone{fill-opacity:.05;stroke-dasharray:2 2;stroke-opacity:.45}
.pe-trav,.pe-arm{fill:none;stroke:var(--pe-c);stroke-width:1.2;stroke-linecap:round}
.pe-trav{stroke-dasharray:3 2.5;stroke-opacity:.8}
.pe-arm{stroke-width:2.2;stroke-opacity:.65}
.pe-aer{fill:none;stroke:var(--pe-c);stroke-width:.8;stroke-dasharray:2 2;stroke-opacity:.7}
.pe-wire{stroke:var(--pe-c);stroke-width:.6;stroke-opacity:.45}
.pe-dot{fill:#0b0e14;stroke:var(--pe-c);stroke-width:1.8}
.pe-k-off .pe-dot{stroke-dasharray:2.2 1.6}
.pe-num{fill:var(--pe-c);font:700 8.5px "JetBrains Mono",ui-monospace,monospace;text-anchor:middle;dominant-baseline:central;pointer-events:none}
.pe-cam.pe-sel .pe-dot,.pe-cam:focus-visible .pe-dot{fill:var(--pe-c)}
.pe-cam.pe-sel .pe-num,.pe-cam:focus-visible .pe-num{fill:#0b0e14}
.pe-cam.pe-sel .pe-cone{fill-opacity:.42}
.pe-cable{fill:none;stroke:#8b95a8;stroke-width:.7;stroke-opacity:.28;stroke-dasharray:1.5 1.5}
.pe-leg{display:flex;flex-wrap:wrap;gap:4px 10px;padding:7px 10px;font-size:11px;color:var(--muted,#8b95a8);border-bottom:1px solid var(--line,#2a3242)}
.pe-leg span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
.pe-leg svg{flex:none}
.pe-leg .pe-sep{width:1px;height:12px;background:var(--line,#2a3242)}
.pe-det{min-height:0;padding:0 10px;font-size:12px;color:var(--text,#e9edf5)}
.pe-det:not(:empty){padding:7px 10px;background:var(--panel2,#1e2430);border-bottom:1px solid var(--line,#2a3242)}
.pe-cl{display:grid}
.pe-clr{display:grid;grid-template-columns:22px minmax(0,1fr) 50px;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--line,#2a3242);cursor:pointer}
.pe-clr:last-child{border-bottom:0}
.pe-clr.pe-sel{background:var(--panel2,#1e2430)}
.pe-n{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font:700 10.5px "JetBrains Mono",ui-monospace,monospace;color:var(--pe-c);border:1.6px solid var(--pe-c);background:#0b0e14}
.pe-k-off .pe-n{border-style:dashed}
.pe-clt{min-width:0}
.pe-clt span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12.5px;line-height:1.25;overflow:hidden;overflow-wrap:anywhere}
.pe-clt small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:11px;line-height:1.3;color:var(--muted,#8b95a8);overflow:hidden;overflow-wrap:anywhere}
.pe-k-off .pe-clt small{color:var(--pe-bad)}
.pe-k-opt .pe-clt small{color:var(--pe-off)}
.pe-fit{display:grid;gap:2px;justify-items:end;font:600 10.5px "JetBrains Mono",ui-monospace,monospace;color:var(--pe-c)}
.pe-fit u{display:block;width:44px;height:4px;border-radius:2px;background:#262b36;overflow:hidden;text-decoration:none}
.pe-fit u i{display:block;height:100%;background:var(--pe-c)}

.pe-intl{border-color:#1c3d66;background:linear-gradient(160deg,#0f1c30,var(--panel,#161a22) 55%)}
.pe-ih{display:flex;gap:10px;align-items:center;padding:12px 12px 8px}
.pe-gl{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#0f2440;border:1px solid #1c3d66;color:#8cc4ff;flex:none}
.pe-tag{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:800;font-size:11.5px;letter-spacing:1px;text-transform:uppercase;color:#8cc4ff}
.pe-ih h3{font-size:17px;line-height:1.15;margin:1px 0 0;font-family:"Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.3px}
.pe-ih .pe-sub{margin-top:2px}
.pe-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 10px}
.pe-chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;border-radius:8px;padding:3px 8px;background:var(--panel2,#1e2430);border:1px solid var(--line,#2a3242);white-space:nowrap}
.pe-chip b{font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:600}
.pe-chip.pe-cg{color:var(--pe-ok);border-color:#1f5a3a;background:#0f2a1c}
.pe-chip.pe-ca{color:#ffcf6e;border-color:#5a4214;background:#2a1f0b}
.pe-chip.pe-cr{color:#ff9d9d;border-color:#5a2026;background:#2a1013}
.pe-note{font-size:11.5px;color:var(--muted,#8b95a8);padding:0 12px 8px}
.pe-rq{border-top:1px solid var(--line,#2a3242);padding:8px 12px 10px}
.pe-rq .pe-hd{margin-bottom:4px}
.pe-rq ul{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.pe-rq li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:7px;align-items:start;font-size:12.5px;line-height:1.3}
.pe-rq li small{display:block;color:var(--muted,#8b95a8);font-size:11px}
.pe-ck{margin-top:.5px}
.pe-ck circle{fill:none;stroke-width:1.4}
.pe-ck path{fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.pe-ck-ok circle{stroke:var(--pe-ok);fill:rgba(46,204,113,.14)}.pe-ck-ok path{stroke:var(--pe-ok)}
.pe-ck-no circle{stroke:var(--pe-bad);fill:rgba(255,59,59,.12)}.pe-ck-no path{stroke:var(--pe-bad)}
.pe-ck-na circle{stroke:var(--pe-off)}.pe-ck-na path{stroke:var(--pe-off)}
.pe-li-no{color:#ffc4c4}
.pe-warn{display:flex;gap:6px;align-items:center;font-size:11.5px;color:#ffcf6e;padding:8px 12px;border-top:1px solid var(--line,#2a3242);background:#1d1608}

.pe-risk{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;max-width:100%}
.pe-rc{display:inline-flex;align-items:center;gap:6px;max-width:100%;font-size:12px;line-height:1.25;border-radius:8px;padding:4px 9px;border:1px solid var(--line,#2a3242);background:var(--panel2,#1e2430);color:var(--text,#e9edf5)}
.pe-rc .pe-i{flex:none}
.pe-rc span{min-width:0}
.pe-rc.pe-cr{color:#ffb0b0;border-color:#5a2026;background:#2a1013}
.pe-rc.pe-ca{color:#ffd58a;border-color:#5a4214;background:#2a1f0b}
.pe-rc.pe-cg{color:#8fe8b5;border-color:#1f5a3a;background:#0f2a1c}
.pe-rc.pe-cm{color:var(--muted,#8b95a8)}

/* Plan de cámaras a mano: tocar una cámara (luz de tally roja = elegida) y luego su posición */
.pe-ed{display:grid;gap:8px;padding:8px 10px 10px;border-bottom:1px solid var(--line,#2a3242);background:var(--panel,#161a22)}
.pe-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.pe-seg{display:inline-grid;grid-template-columns:1fr 1fr;border:1px solid var(--line,#2a3242);border-radius:10px;overflow:hidden;background:#0b0e14}
.pe-seg button{appearance:none;border:0;background:none;color:var(--muted,#8b95a8);font:700 13px var(--f-head,"Barlow Condensed",sans-serif);letter-spacing:.4px;min-height:40px;padding:0 14px;cursor:pointer}
.pe-seg button[aria-pressed="true"]{background:var(--panel2,#1e2430);color:var(--text,#e9edf5);box-shadow:inset 0 -2px 0 var(--red,#ff3b3b)}
.pe-dq{font:600 12px var(--f-mono,"JetBrains Mono",monospace);padding:3px 8px;border-radius:8px;border:1px solid var(--line,#2a3242);color:var(--muted,#8b95a8);white-space:nowrap}
.pe-dq.up{color:#8fe8b5;border-color:#1f5a3a;background:#0f2a1c}.pe-dq.dn{color:#ffb0b0;border-color:#5a2026;background:#2a1013}
.pe-tip{font-size:12px;line-height:1.35;color:var(--muted,#8b95a8);margin:0}
.pe-tip b{color:var(--text,#e9edf5)}
.pe-hit{fill:transparent;stroke:none}
.pe-ed-on .pe-cam{cursor:pointer}
.pe-cam.pe-on .pe-dot{stroke-width:2.6;filter:drop-shadow(0 0 4px var(--pe-c))}
.pe-ring{fill:none;stroke:var(--text,#e9edf5);stroke-width:1.4;stroke-dasharray:3 2;opacity:0;pointer-events:none}
.pe-cam.pe-on .pe-ring{opacity:.9}
.pe-cam.pe-src .pe-ring{opacity:1;stroke:var(--red,#ff3b3b);stroke-dasharray:none}
.pe-pv rect{stroke-width:.8}
.pe-pv text{font:700 8.6px "JetBrains Mono",ui-monospace,monospace;text-anchor:middle;dominant-baseline:central;pointer-events:none}
.pe-pv{pointer-events:none}
.pe-pv.up rect{fill:#0f2a1c;stroke:#2ecc71}.pe-pv.up text{fill:#8fe8b5}
.pe-pv.dn rect{fill:#2a1013;stroke:#ff3b3b}.pe-pv.dn text{fill:#ffb0b0}
.pe-pv.eq rect{fill:#1e2430;stroke:#8b95a8}.pe-pv.eq text{fill:#c4ccd9}
.pe-pv.no rect{fill:#0b0e14;stroke:#3a4150}.pe-pv.no text{fill:#8b95a8}
.pe-tray{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.pe-cc{appearance:none;display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:7px;min-height:56px;padding:6px 8px 6px 6px;border-radius:12px;border:1px solid var(--line,#2a3242);background:var(--panel2,#1e2430);color:var(--text,#e9edf5);text-align:start;cursor:pointer;position:relative;touch-action:manipulation;font:inherit}
.pe-cc .itemart,.pe-cc svg.itemart{width:34px;height:34px}
.pe-cc b{display:block;font-size:12.5px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.pe-cc small{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted,#8b95a8);margin-top:2px;min-width:0}
.pe-cc small span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pe-tl{width:8px;height:8px;border-radius:50%;background:#3a4150;flex:none}
.pe-cc.pe-puesta .pe-tl{background:var(--green,#2ecc71)}
.pe-cc.pe-on{border-color:var(--red,#ff3b3b);background:#2a1a1f;box-shadow:0 0 0 1px var(--red,#ff3b3b),0 0 16px rgba(255,59,59,.35)}
.pe-cc.pe-on .pe-tl{background:var(--red,#ff3b3b);box-shadow:0 0 8px var(--red,#ff3b3b)}
.pe-cc.pe-arr{opacity:.45}
.pe-cc:focus-visible,.pe-seg button:focus-visible,.pe-clr:focus-visible,.pe-op:focus-visible,.pe-qt:focus-visible{outline:2px solid var(--blue,#4da3ff);outline-offset:2px}
.pe-dt{border:1px solid var(--line,#2a3242);border-radius:12px;background:#11151d;padding:9px 10px;display:grid;gap:7px}
.pe-dth{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.pe-dth b{font-size:13.5px;line-height:1.25}
.pe-dth small{display:block;font-size:11.5px;color:var(--muted,#8b95a8);margin-top:2px}
.pe-x{appearance:none;border:1px solid var(--line,#2a3242);background:none;color:var(--muted,#8b95a8);border-radius:8px;min-width:36px;min-height:36px;cursor:pointer;font-size:16px;line-height:1}
.pe-rz{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.pe-rz li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;font-size:12px;line-height:1.3}
.pe-v{font:600 11.5px var(--f-mono,"JetBrains Mono",monospace);padding:1px 6px;border-radius:6px;white-space:nowrap;border:1px solid var(--line,#2a3242);color:var(--muted,#8b95a8)}
.pe-v.up{color:#8fe8b5;border-color:#1f5a3a;background:#0f2a1c}.pe-v.dn{color:#ffb0b0;border-color:#5a2026;background:#2a1013}
.pe-v.pct{border-style:dashed}
.pe-ops{display:flex;flex-wrap:wrap;gap:5px}
.pe-ops-t{font-size:11.5px;color:var(--muted,#8b95a8)}
.pe-op{appearance:none;min-height:38px;padding:0 10px;border-radius:999px;border:1px solid var(--line,#2a3242);background:var(--panel2,#1e2430);color:var(--text,#e9edf5);font-size:12px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pe-op[aria-pressed="true"]{border-color:var(--green,#2ecc71);background:#0f2a1c;color:#c9f5dc}
.pe-op i{font-style:normal;font-family:var(--f-mono,"JetBrains Mono",monospace);color:var(--amber,#ffb020);margin-inline-start:4px}
.pe-qt{appearance:none;justify-self:start;min-height:38px;padding:0 12px;border-radius:10px;border:1px solid #5a2026;background:#2a1013;color:#ffb0b0;font-size:12.5px;cursor:pointer}
.pe-cb{display:flex;flex-wrap:wrap;gap:5px}
.pe-cb span{display:inline-flex;align-items:center;gap:6px;max-width:100%;font-size:11.5px;line-height:1.25;border-radius:8px;padding:3px 7px;border:1px solid var(--line,#2a3242);background:var(--panel2,#1e2430)}
.pe-cb span.up{border-color:#1f5a3a;background:#0f2a1c;color:#c9f5dc}.pe-cb span.dn{border-color:#5a2026;background:#2a1013;color:#ffd0d0}
.pe-cb b{font-family:var(--f-mono,"JetBrains Mono",monospace);font-weight:600}
.pe-cbt{font-size:11px;color:var(--muted,#8b95a8)}
button.pe-clr{appearance:none;width:100%;border:0;border-bottom:1px solid var(--line,#2a3242);background:none;color:inherit;font:inherit;text-align:start;min-height:48px}
button.pe-clr.pe-on{background:#1d2230;box-shadow:inset 3px 0 0 var(--text,#e9edf5)}
.pe-clr .pe-pvl{font:700 11px var(--f-mono,"JetBrains Mono",monospace)}
.pe-pvl.up{color:#8fe8b5}.pe-pvl.dn{color:#ffb0b0}.pe-pvl.no{color:var(--muted,#8b95a8)}
.pe-drag{position:fixed;z-index:99;pointer-events:none;padding:6px 10px;border-radius:10px;background:#2a1a1f;border:1px solid var(--red,#ff3b3b);color:var(--text,#e9edf5);font-size:12px;box-shadow:0 0 16px rgba(255,59,59,.4);transform:translate(-50%,-120%)}
/* Cámaras libres: marcas de piso (cinta), zonas y campo de visión */
.pe-mapa{fill:transparent;cursor:crosshair}
.pe-zonas{pointer-events:none}
.pe-zalto{fill:#ffb020;fill-opacity:.05;stroke:#ffb020;stroke-opacity:.5;stroke-width:.8;stroke-dasharray:1 2.2}
.pe-zat{font:700 6px "JetBrains Mono",ui-monospace,monospace;fill:#ffcf6e;fill-opacity:.75;letter-spacing:.5px}
.pe-zno{stroke:#ff3b3b;stroke-opacity:.55;stroke-width:.8}
.pe-zno-s{fill:none;stroke:#ff3b3b;stroke-opacity:.35}
.pe-gh{cursor:pointer;outline:none}
.pe-tape{fill:none;stroke:#e8d27a;stroke-width:2.4;stroke-linecap:butt;opacity:.55}
.pe-gh .pe-tape{stroke:var(--pe-c)}
.pe-ghn{font:700 7.5px "JetBrains Mono",ui-monospace,monospace;fill:var(--pe-c);opacity:.85;pointer-events:none}
.pe-k-off .pe-tape,.pe-k-opt .pe-tape{stroke:#e8d27a;opacity:.75}
.pe-k-off .pe-ghn,.pe-k-opt .pe-ghn{fill:#e8d27a}
.pe-gh:focus-visible .pe-tape,.pe-gh.pe-on .pe-tape{opacity:1;stroke-width:3}
.pe-gh:focus-visible .pe-hit{stroke:var(--blue,#4da3ff);stroke-width:1.2;stroke-dasharray:2 2}
.pe-ed-on.pe-moviendo .pe-gh .pe-tape{opacity:.95}
.pe-cone.pe-tap{stroke:var(--pe-bad);stroke-dasharray:2.5 2;fill-opacity:.1}
.pe-nol{fill:none;stroke:var(--pe-c);stroke-width:.9;stroke-dasharray:1.5 2.5;stroke-opacity:.7}
.pe-real .pe-dot{stroke-width:2}
.pe-mal{pointer-events:none}
.pe-mal path{stroke:#ff3b3b;stroke-width:2.6;stroke-linecap:round}
.pe-mal circle{fill:#ff3b3b;fill-opacity:.18;stroke:#ff3b3b;stroke-width:1}
@media (prefers-reduced-motion:no-preference){.pe-mal{animation:peMal .9s ease-out forwards}@keyframes peMal{0%{opacity:1}70%{opacity:1}100%{opacity:0}}}
.pe-tkh{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:8px 10px 4px;border-top:1px solid var(--line,#2a3242)}
.pe-tkh b{font:800 13px var(--f-head,"Barlow Condensed",sans-serif);letter-spacing:.5px;text-transform:uppercase;color:var(--muted,#8b95a8)}
.pe-tkh span{font:600 11.5px var(--f-mono,"JetBrains Mono",monospace);color:var(--text,#e9edf5)}
.pe-tkh span.pe-tk-mal{color:#ffcf6e}
.pe-clt .pe-tkt{display:flex;align-items:center;gap:5px}
.pe-clt .pe-tkt .pe-ck{flex:none;margin:0}
.pe-clt small.pe-pista{color:#ffb0b0}
.pe-clt small.pe-pista.pe-pmov{color:var(--muted,#8b95a8)}
.pe-clt .pe-tkt em{font-style:normal;font-size:12.5px;line-height:1.25;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pe-tkx{font:600 9.5px var(--f-mono,"JetBrains Mono",monospace);color:var(--muted,#8b95a8);border:1px solid var(--line,#2a3242);border-radius:5px;padding:0 4px;margin-inline-start:4px;font-style:normal}
.pe-ed-top{background:var(--panel,#161a22)}
.pe-tkl{display:flex;align-items:flex-start;gap:7px;margin:0;padding:7px 10px;font-size:12px;line-height:1.35;border-bottom:1px solid var(--line,#2a3242);background:#0f131b}
.pe-tkl .pe-ck{flex:none;margin-top:1px}
.pe-tkl b{font-family:var(--f-mono,"JetBrains Mono",monospace);font-weight:600}
.pe-ed-det{border-bottom:1px solid var(--line,#2a3242)}
.pe-dt .pe-am{appearance:none;justify-self:start;min-height:38px;padding:0 12px;border-radius:10px;border:1px solid #5a4214;background:#2a1f0b;color:#ffd58a;font-size:12.5px;cursor:pointer}
.pe-dt .pe-acc{display:flex;flex-wrap:wrap;gap:6px}
.pe-zsi{fill:rgba(46,204,113,.16);stroke:#2ecc71;stroke-width:1.2;stroke-dasharray:3 2}
.pe-dt .pe-nota{margin:0;font-size:12px;line-height:1.35;color:#ffd58a}
.pe-dt .pe-buy{appearance:none;justify-self:start;min-height:38px;padding:0 12px;border-radius:10px;border:1px solid #1f4f86;background:#0e2440;color:#8cc4ff;font-size:12.5px;cursor:pointer}
.pe-am:focus-visible{outline:2px solid var(--blue,#4da3ff);outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.pe-cc,.pe-op,.pe-seg button{transition:background-color .12s,border-color .12s,box-shadow .12s}}
`;
  function ensureCss() {
    try {
      if (typeof document === 'undefined' || document.getElementById('plan-evento-css')) return;
      const st = document.createElement('style');
      st.id = 'plan-evento-css';
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { /* sin estilos */ }
  }

  /* Tocar una cámara (en el plano o en la lista) la resalta y muestra qué cámara va */
  function bindTap() {
    if (typeof document === 'undefined' || root.__peTap) return;
    root.__peTap = true;
    const pick = (ev) => {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-pe-cam]') : null;
      if (!t) return;
      const box = t.closest('.pe-cams');
      if (!box) return;
      const n = t.getAttribute('data-pe-cam');
      const was = t.classList.contains('pe-sel');
      box.querySelectorAll('.pe-sel').forEach((x) => x.classList.remove('pe-sel'));
      const det = box.querySelector('.pe-det');
      if (was) { if (det) det.textContent = ''; return; }
      box.querySelectorAll('[data-pe-cam="' + n + '"]').forEach((x) => x.classList.add('pe-sel'));
      if (det) det.textContent = t.getAttribute('data-pe-info') || (box.querySelector('[data-pe-cam="' + n + '"][data-pe-info]') || { getAttribute: () => '' }).getAttribute('data-pe-info');
    };
    document.addEventListener('click', pick);
    document.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target && ev.target.closest && ev.target.closest('.pe-cam')) { ev.preventDefault(); pick(ev); } });
  }

  /* =========================================================
     1. Personal por rol
     ========================================================= */
  function rolesOf(plan) {
    if (!plan) return [];
    let src = plan.roles || plan.porRol || plan.rows || plan.personal || plan.plantilla;
    if (!src && typeof plan === 'object' && !Array.isArray(plan)) {
      // objeto plano { cablero: {min, ideal, asignados}, ... }
      const ks = Object.keys(plan).filter((k) => plan[k] && typeof plan[k] === 'object' && ('min' in plan[k] || 'ideal' in plan[k]));
      if (ks.length) { src = {}; ks.forEach((k) => { src[k] = plan[k]; }); }
    }
    if (Array.isArray(plan)) src = plan;
    if (!src) return [];
    const list = Array.isArray(src) ? src : Object.keys(src).map((k) => Object.assign({ key: k }, src[k]));
    return list.map((r, i) => {
      if (!r || typeof r !== 'object') return null;
      const key = roleKey(r.key || r.rol || r.role || r.id || ('rol' + i));
      const people = Array.isArray(r.personas) ? r.personas : Array.isArray(r.staff) ? r.staff : Array.isArray(r.asignados) ? r.asignados : Array.isArray(r.assigned) ? r.assigned : null;
      let a = num(r.asignados); if (a == null) a = num(r.assigned); if (a == null) a = num(r.n); if (a == null && people) a = people.length; if (a == null) a = 0;
      const min = num(r.min) != null ? num(r.min) : 0;
      const ideal = num(r.ideal) != null ? Math.max(num(r.ideal), min) : min;
      let estado = String(r.estado || r.state || '').toLowerCase();
      if (!/^(falta|justo|completo)$/.test(estado)) estado = a < min ? 'falta' : a < ideal ? 'justo' : 'completo';
      const rk = r.riesgo != null ? r.riesgo : r.risk;
      return {
        key, i, a, min, ideal, estado, people: people && people.filter((p) => p && typeof p === 'object'),
        nombre: r.nombre || r.name || (has('pe.rol.' + key) ? T('pe.rol.' + key) : String(r.key || key).replace(/_/g, ' ')),
        riesgoTxt: typeof rk === 'string' && rk.trim() && !/^(alto|medio|bajo|high|low|medium|ninguno|none)$/i.test(rk.trim()) ? rk : (r.si_falta || r.siFalta || (has('pe.riesgo.' + key) ? T('pe.riesgo.' + key) : '')),
        riesgoNum: typeof rk === 'number' ? rk : null,
        sueldo: num(r.sueldo != null ? r.sueldo : r.wage != null ? r.wage : r.wages),
        orden: ROLE[key] ? ROLE[key].orden : 50 + i,
      };
    }).filter(Boolean);
  }

  function roleAvatar(r) {
    const art = A();
    const meta = ROLE[r.key] || {};
    if (r.people && r.people.length && art && art.avatar) {
      try {
        const p = r.people[0];
        const more = r.people.length > 1 ? `<span class="pe-more">+${r.people.length - 1}</span>` : '';
        return `<span class="pe-av">${art.avatar(p, meta.av || p.role || r.key, 32)}${more}</span>`;
      } catch (e) { /* ícono */ }
    }
    return `<span class="pe-av">${ico(meta.icon || 'pe_users', 18)}</span>`;
  }

  function moneyOf(v) {
    if (v == null) return null;
    if (typeof v === 'object') return num(v.total != null ? v.total : v.usd != null ? v.usd : v.monto);
    return num(v);
  }

  function personal(plan, opts) {
    ensureCss();
    try {
      const o = opts || {};
      const all = rolesOf(plan).sort((x, y) => x.orden - y.orden);
      const rows = o.todos ? all : all.filter((r) => r.ideal > 0 || r.min > 0 || r.a > 0);
      const cnt = { falta: 0, justo: 0, completo: 0 };
      rows.forEach((r) => { cnt[r.estado]++; });
      const titulo = o.titulo === false ? '' : `<div class="pe-hd"><span class="pe-ttl">${esc(o.titulo || T('pe.personal'))}</span>
        <span class="pe-sum">${['falta', 'justo', 'completo'].filter((k) => cnt[k]).map((k) => `<span class="pe-pill pe-e-${k}">${esc(T('pe.res.' + k, { n: cnt[k] }))}</span>`).join('')}</span></div>`;
      const body = rows.map((r) => {
        let txt = r.riesgoTxt ? (r.estado === 'completo' ? T('pe.sifalta', { t: r.riesgoTxt }) : r.riesgoTxt) : '';
        const pct = r.riesgoNum != null && r.estado !== 'completo' ? `<span class="pe-rk">${esc(T('pe.riesgo.pct', { p: Math.round(r.riesgoNum <= 1 ? r.riesgoNum * 100 : r.riesgoNum) }))}</span>` : '';
        const tip = `${r.nombre} · ${T('pe.est.' + r.estado)} · ${T('pe.asignados', { a: r.a, min: r.min, ideal: r.ideal })}${r.sueldo != null ? ' · ' + money(r.sueldo) : ''}${r.people && r.people.length ? ' · ' + r.people.map((p) => p.name || '').filter(Boolean).join(', ') : ''}`;
        return `<div class="pe-row pe-e-${r.estado}" title="${esc(tip)}" data-pe-rol="${esc(r.key)}">
          ${o.avatares === false ? `<span class="pe-av">${ico((ROLE[r.key] || {}).icon || 'pe_users', 18)}</span>` : roleAvatar(r)}
          <div class="pe-rt"><b>${esc(r.nombre)}</b>${txt || pct ? `<small>${esc(txt)}${pct}</small>` : ''}</div>
          <span class="pe-cnt" aria-label="${esc(T('pe.asignados', { a: r.a, min: r.min, ideal: r.ideal }))}"><b>${r.a}</b><i>${r.min}</i><i>${r.ideal}</i></span>
          <span class="pe-sem" role="img" aria-label="${esc(T('pe.est.' + r.estado))}"><i></i><i></i><i></i></span></div>`;
      }).join('');
      const p = plan || {};
      let wages = moneyOf(p.wages != null ? p.wages : p.sueldos != null ? p.sueldos : p.totalWages != null ? p.totalWages : p.sueldosTotal);
      if (wages == null && rows.some((r) => r.sueldo != null)) wages = rows.reduce((s, r) => s + (r.sueldo || 0), 0);
      const idealW = moneyOf(p.idealWages != null ? p.idealWages : p.sueldosIdeal != null ? p.sueldosIdeal : p.wagesIdeal);
      let save = moneyOf(p.savings != null ? p.savings : p.ahorro != null ? p.ahorro : p.ahorroVsIdeal != null ? p.ahorroVsIdeal : p.saving);
      if (save == null && idealW != null && wages != null) save = idealW - wages;
      const under = cnt.falta + cnt.justo > 0;
      const ft = wages != null || (save != null && save > 0)
        ? `<div class="pe-ft"><span>${esc(T('pe.sueldos'))} <b>${money(wages || 0)}</b></span>${save != null && save > 0 && under
          ? `<span class="pe-save">${esc(T('pe.ahorro', { m: money(save) }))}${cnt.falta ? `<small>${esc(T('pe.ahorro.riesgo'))}</small>` : ''}</span>`
          : idealW != null && o.mostrarIdeal ? `<span class="muted">${esc(T('pe.ideal.sueldos', { m: money(idealW) }))}</span>` : ''}</div>` : '';
      const head = rows.length ? `<div class="pe-ch"><span>${root.Ayuda ? root.Ayuda.btn('personal') : ''}</span><span></span><span class="pe-cnt"><i>${esc(T('pe.col.asig'))}</i><i>${esc(T('pe.col.min'))}</i><i>${esc(T('pe.col.ideal'))}</i></span><span></span></div>` : '';
      const ley = rows.length ? `<div class="pe-ley">${['completo', 'justo', 'falta'].map((k) => `<span class="pe-e-${k}" style="background:none"><i></i>${esc(T('pe.ley.' + k))}</span>`).join('')}</div>` : '';
      return `<div class="pe-crew ${esc(o.clase || '')}">${titulo}<div class="pe-box">${head}${body || `<div class="pe-empty">${esc(T('pe.sinroles'))}</div>`}${ley}${ft}</div></div>`;
    } catch (e) { return ''; }
  }

  /* =========================================================
     2. Plan de cámaras (vista desde arriba)
     ========================================================= */
  const VENUE_OF = {
    barrial: 'futbol', ligapro: 'futbol', final: 'futbol', internacional_unilateral: 'futbol', internacional_host: 'futbol',
    boxeo: 'ring', lucha_libre: 'ring', concierto: 'concierto', misa: 'iglesia', funeral: 'iglesia',
    boda: 'salon', graduacion: 'salon', prensa: 'salon', lanzamiento: 'escenario', lanzamiento_autos: 'escenario', irl: 'calle',
  };
  function tipoKey(tipo) {
    if (tipo && typeof tipo === 'object') tipo = tipo.type || tipo.tipo || tipo.key || '';
    return norm(tipo).replace(/[\s-]+/g, '_');
  }
  function lugar(tipo) {
    const t = tipoKey(tipo);
    if (VENUE_OF[t]) return VENUE_OF[t];
    if (/box|mma|ufc|pelea/.test(t)) return 'ring';
    if (/lucha|wrestl/.test(t)) return 'ring';
    if (/futbol|partido|liga|copa|torneo|campeonato|estadio|host|unilateral/.test(t)) return 'futbol';
    if (/concierto|festival|show|musica|gira/.test(t)) return 'concierto';
    if (/funeral|velorio|misa|iglesia|ceremonia|bautizo|comunion/.test(t)) return 'iglesia';
    if (/auto|carro|lanzamiento|marca|producto/.test(t)) return 'escenario';
    if (/irl|influ|calle|vlog|tiktok/.test(t)) return 'calle';
    return 'salon';
  }
  // Variante del dibujo dentro de un mismo lugar
  function variante(t, v) {
    if (v === 'futbol') return t === 'barrial' ? 'barrial' : 'estadio';
    if (v === 'ring') return /lucha|wrestl/.test(t) ? 'lucha' : 'boxeo';
    if (v === 'iglesia') return /funeral|velorio/.test(t) ? 'funeral' : 'misa';
    if (v === 'salon') return /gradu/.test(t) ? 'graduacion' : /prensa/.test(t) ? 'prensa' : 'boda';
    if (v === 'escenario') return /auto|carro/.test(t) ? 'autos' : 'marca';
    return v;
  }

  function posiciones(tipo) {
    const t = tipoKey(tipo);
    const list = POS_DEF[t] || POS_DEF[{ futbol: 'ligapro', ring: 'boxeo', concierto: 'concierto', iglesia: 'misa', salon: 'boda', escenario: 'lanzamiento', calle: 'irl' }[lugar(t)]] || [];
    return list.map((p) => ({ key: p[0], nombre: T('pe.pos.' + t + '.' + p[0]) === 'pe.pos.' + t + '.' + p[0] ? p[1] : T('pe.pos.' + t + '.' + p[0]), ideal: has('pe.idealcam.' + t + '.' + p[0]) ? T('pe.idealcam.' + t + '.' + p[0]) : p[2], asignado: null, ajuste: null }));
  }

  /* Puntos de cada lugar. viewBox 360x264. Cada punto:
     k: clave, at: [x,y], aim: [x,y] hacia dónde mira, fov: apertura (grados), len: largo del cono,
     f: forma ('fija' | 'mano' | 'robot' | 'aerea'), re: palabras que lo identifican,
     path: recorrido (al hombro), arm: base del brazo (jib), wires: cables del cablecam */
  const W = 360, H = 264;
  const C = [180, 124];
  const SPOTS = {
    futbol: [
      { k: 'robotica_arco_izq', at: [52, 116], aim: [110, 124], fov: 60, len: 22, f: 'robot', re: /robot.*(izq|arco)|dentro.*arco|goal ?cam/ },
      { k: 'robotica_arco_der', at: [308, 132], aim: [250, 124], fov: 60, len: 22, f: 'robot', re: /robot.*(der|arco)|dentro.*arco|goal ?cam/ },
      { k: 'superlenta', at: [118, 222], aim: [78, 124], fov: 18, len: 72, f: 'fija', re: /lent|slow|hi.?motion|ultra/ },
      { k: 'superlenta2', at: [242, 222], aim: [282, 124], fov: 18, len: 72, f: 'fija', re: /lent|slow|hi.?motion|ultra/ },
      { k: 'cerrada', at: [197, 236], aim: C, fov: 12, len: 92, f: 'fija', re: /cerrad|tight|box|100x/ },
      { k: 'cerrada2', at: [163, 236], aim: C, fov: 10, len: 96, f: 'fija', re: /cerrad|tight|box|100x/ },
      { k: 'principal', at: [180, 236], aim: C, fov: 52, len: 66, f: 'fija', re: /principal|abierta|master|cam ?1\b|alto.*media/ },
      { k: 'baja_izq', at: [52, 160], aim: [100, 124], fov: 34, len: 36, f: 'fija', re: /baja|linea de fondo|low/ },
      { k: 'baja_der', at: [308, 88], aim: [260, 124], fov: 34, len: 36, f: 'fija', re: /baja|linea de fondo|low/ },
      { k: 'arco_izq_alto', at: [26, 124], aim: [110, 124], fov: 30, len: 58, f: 'fija', re: /arco|goal|porter/ },
      { k: 'arco_der_alto', at: [334, 124], aim: [250, 124], fov: 30, len: 58, f: 'fija', re: /arco|goal|porter/ },
      { k: 'area_izq', at: [97, 236], aim: [78, 124], fov: 26, len: 62, f: 'fija', re: /area|16 ?m|offside|fuera de juego/ },
      { k: 'area_der', at: [263, 236], aim: [282, 124], fov: 26, len: 62, f: 'fija', re: /area|16 ?m|offside|fuera de juego/ },
      { k: 'tactica', at: [140, 250], aim: C, fov: 64, len: 50, f: 'fija', re: /tactic/ },
      { k: 'contraplano', at: [180, 22], aim: C, fov: 46, len: 56, f: 'fija', re: /contra|reverse|opuesta/ },
      { k: 'cablecam', at: C, f: 'aerea', re: /cable|arana|spider|sky ?cam/, wires: [[44, 40], [316, 40], [44, 208], [316, 208]] },
      { k: 'dron', at: [292, 30], aim: C, f: 'aerea', re: /dron|aere/ },
      { k: 'steadicam', at: [168, 214], aim: [150, 170], fov: 44, len: 28, f: 'mano', re: /steadi|tunel|salida|premiaci/, path: [[180, 214], [168, 198], [146, 188]] },
      { k: 'steadicam2', at: [212, 196], aim: [212, 160], fov: 44, len: 26, f: 'mano', re: /steadi|tunel|salida|premiaci/, path: [[188, 212], [212, 196], [232, 180]] },
      { k: 'cancha', at: [236, 207], aim: [236, 150], fov: 40, len: 32, f: 'mano', re: /hombro|banda|cancha|festejo|bancas|mano/, path: [[200, 207], [296, 207]] },
      { k: 'zona_mixta', at: [154, 210], aim: [130, 214], fov: 50, len: 18, f: 'mano', re: /zona mixta|flash|entrevista/, path: [[176, 213], [140, 213]] },
      { k: 'presentador', at: [64, 230], aim: [80, 212], fov: 40, len: 20, f: 'fija', re: /presentador|stand ?up|host/ },
      { k: 'comcam', at: [242, 247], aim: [242, 258], fov: 60, len: 10, f: 'robot', re: /coment|comcam|narrador|cabina/ },
      { k: 'beauty', at: [342, 18], aim: C, fov: 60, len: 40, f: 'robot', re: /beauty|bella|panoram|estadio de fondo/ },
    ],
    ring: [
      { k: 'cenital', at: C, f: 'aerea', re: /cenital|overhead|techo|top/ },
      { k: 'beauty', at: [340, 20], aim: C, fov: 56, len: 46, f: 'robot', re: /beauty|recinto|panoram/ },
      { k: 'cerrada', at: [198, 238], aim: C, fov: 14, len: 88, f: 'fija', re: /cerrad|tight/ },
      { k: 'principal', at: [180, 238], aim: C, fov: 50, len: 66, f: 'fija', re: /principal|hard|alto|balcon|tarima|frente/ },
      { k: 'esquina1', at: [244, 60], aim: [200, 104], fov: 50, len: 30, f: 'mano', re: /esquina|neutral|inalambric/, path: [[204, 58], [244, 60], [246, 100]] },
      { k: 'esquina2', at: [116, 188], aim: [160, 144], fov: 50, len: 30, f: 'mano', re: /esquina|neutral|inalambric/, path: [[114, 148], [116, 188], [156, 190]] },
      { k: 'hombro_izq', at: [112, 120], aim: [150, 124], fov: 50, len: 30, f: 'mano', re: /izq|hombro|ring/, path: [[113, 82], [112, 166]] },
      { k: 'hombro_der', at: [248, 128], aim: [210, 124], fov: 50, len: 30, f: 'mano', re: /der|hombro|ring/, path: [[247, 82], [248, 166]] },
      { k: 'rampa', at: [196, 66], aim: [180, 24], fov: 30, len: 34, f: 'fija', re: /rampa|entrada|escenario/ },
      { k: 'postes', at: [132, 76], aim: C, fov: 60, len: 24, f: 'robot', re: /poste|minic|pov|esquinas/ },
      { k: 'pov', at: [228, 172], aim: C, fov: 60, len: 24, f: 'robot', re: /pov|minic|publico|poste/ },
      { k: 'steadicam', at: [292, 52], aim: [330, 20], fov: 40, len: 22, f: 'mano', re: /steadi|caminata|walk/, path: [[330, 22], [292, 52], [240, 74]] },
    ],
    concierto: [
      { k: 'roboticas', at: [214, 40], aim: [192, 40], fov: 50, len: 18, f: 'robot', re: /robot|bateri|pov/ },
      { k: 'roboticas2', at: [266, 54], aim: [245, 46], fov: 50, len: 16, f: 'robot', re: /robot|teclad|pov/ },
      { k: 'riel', at: [180, 104], aim: [180, 60], fov: 40, len: 34, f: 'mano', re: /riel|dolly|track/, path: [[112, 104], [248, 104]] },
      { k: 'foh', at: [180, 192], aim: [180, 66], fov: 10, len: 112, f: 'fija', re: /foh|torre|lente largo|primeros/ },
      { k: 'abierta', at: [200, 196], aim: [180, 52], fov: 46, len: 78, f: 'fija', re: /abiert|general|wide/ },
      { k: 'foso', at: [118, 93], aim: [130, 66], fov: 46, len: 24, f: 'mano', re: /foso|valla|hombro/, path: [[86, 93], [274, 93]] },
      { k: 'jib', at: [254, 132], aim: [200, 74], fov: 36, len: 40, f: 'fija', re: /jib|grua|telescop/, arm: [292, 168] },
      { k: 'steadicam', at: [100, 64], aim: [150, 66], fov: 46, len: 26, f: 'mano', re: /steadi|escenario|gimbal/, path: [[86, 78], [100, 64], [132, 46]] },
      { k: 'dron', at: [322, 126], aim: C, f: 'aerea', re: /dron|aere/ },
    ],
    iglesia: [
      { k: 'ptz_lateral', at: [266, 94], aim: [228, 50], fov: 26, len: 40, f: 'robot', re: /lateral|ptz|lector|consagra/ },
      { k: 'discreta', at: [264, 140], aim: [182, 82], fov: 22, len: 70, f: 'fija', re: /discret|costado|feretro|ataud/ },
      { k: 'oficiante', at: [98, 94], aim: [176, 40], fov: 22, len: 54, f: 'robot', re: /oficiante|sacerdote|segunda|cura/ },
      { k: 'fondo', at: [180, 244], aim: [180, 30], fov: 22, len: 100, f: 'fija', re: /fondo|nave|general|altar/ },
    ],
    salon: [
      { k: 'contraplano_fondo', at: [180, 246], aim: [180, 52], fov: 20, len: 100, f: 'fija', re: /contraplano|fondo|entrada/ },
      { k: 'frontal_altar', at: [222, 28], aim: [184, 54], fov: 36, len: 32, f: 'fija', re: /altar|novios/ },
      { k: 'gimbal', at: [122, 150], aim: [150, 120], fov: 46, len: 26, f: 'mano', re: /gimbal|cine|detalle/, path: [[122, 238], [122, 150], [150, 74]] },
      { k: 'dron', at: [324, 62], aim: C, f: 'aerea', re: /dron|exterior/ },
      { k: 'reaccion_familias', at: [312, 196], aim: [240, 196], fov: 40, len: 44, f: 'mano', re: /familia|reaccion de las/ },
      { k: 'lateral_diplomas', at: [310, 44], aim: [148, 34], fov: 20, len: 62, f: 'fija', re: /lateral|diplom|entrega/ },
      { k: 'jib_publico', at: [64, 132], aim: [130, 168], fov: 40, len: 36, f: 'fija', re: /jib|publico/, arm: [26, 108] },
      { k: 'frontal', at: [180, 204], aim: [180, 36], fov: 14, len: 120, f: 'fija', re: /frontal|centro del publico|vocero|mesa/ },
      { k: 'abierta_ptz', at: [146, 216], aim: [180, 30], fov: 44, len: 80, f: 'robot', re: /abierta|ptz|completa/ },
      { k: 'reaccion', at: [318, 84], aim: [200, 130], fov: 40, len: 46, f: 'mano', re: /reaccion|periodist|pregunt/ },
    ],
    escenario: [
      { k: 'pov_auto', at: [174, 56], aim: [200, 56], fov: 50, len: 14, f: 'robot', re: /pov|minic|dentro/ },
      { k: 'cenital_revelacion', at: [180, 52], aim: [180, 60], f: 'aerea', re: /cenital|revelacion/ },
      { k: 'jib_revelacion', at: [86, 108], aim: [160, 62], fov: 34, len: 42, f: 'fija', re: /grua|jib|revelaci/, arm: [42, 140] },
      { k: 'dolly', at: [180, 110], aim: [180, 64], fov: 40, len: 34, f: 'mano', re: /dolly|riel/, path: [[112, 110], [248, 110]] },
      { k: 'gimbal_auto', at: [234, 82], aim: [204, 62], fov: 46, len: 22, f: 'mano', re: /alrededor|auto|detalle/, path: [[150, 92], [234, 82], [236, 32]] },
      { k: 'gimbal_invitados', at: [236, 172], aim: [200, 150], fov: 46, len: 26, f: 'mano', re: /gimbal|steadi|invitad|influencer/, path: [[150, 206], [236, 172], [276, 138]] },
      { k: 'dron', at: [334, 160], aim: [334, 220], f: 'aerea', re: /dron|exterior|manejo/ },
      { k: 'photocall', at: [44, 216], aim: [18, 216], fov: 40, len: 20, f: 'fija', re: /photocall|entrevist/ },
      { k: 'abierta', at: [148, 244], aim: [180, 44], fov: 46, len: 90, f: 'fija', re: /abierta|pantalla/ },
      { k: 'frontal', at: [180, 240], aim: [180, 58], fov: 16, len: 120, f: 'fija', re: /frontal|presentador/ },
    ],
    calle: [
      { k: 'gimbal', at: [134, 90], aim: [154, 90], fov: 50, len: 16, f: 'mano', re: /gimbal|celular|bolsillo|pecho|movimiento/ },
      { k: 'accion', at: [166, 103], aim: [154, 91], fov: 60, len: 14, f: 'mano', re: /accion|segunda|angulo/ },
    ],
  };
  // Si una posición no coincide con ninguna, va a uno de estos (y mira al centro)
  const SPARE = {
    futbol: [[60, 250], [300, 250], [118, 250], [242, 250], [26, 60], [334, 188], [26, 188], [334, 60], [120, 22], [240, 22]],
    ring: [[100, 236], [260, 236], [24, 124], [336, 124], [100, 18], [260, 18], [24, 236], [24, 18]],
    concierto: [[140, 200], [220, 200], [60, 150], [300, 200], [40, 110], [320, 96]],
    iglesia: [[100, 200], [260, 200], [100, 150], [266, 50], [96, 52]],
    salon: [[40, 230], [320, 240], [40, 60], [320, 140], [100, 246], [260, 246]],
    escenario: [[300, 240], [60, 244], [300, 110], [20, 120], [110, 160]],
    calle: [[60, 112], [250, 156], [300, 92], [40, 172], [200, 178]],
  };
  // Dónde está el control (unidad móvil o mesa) para dibujar los cables
  const CONTROL = { estadio: [337, 236], barrial: [337, 236], boxeo: [338, 236], lucha: [338, 236], concierto: [338, 18], misa: [326, 240], funeral: [326, 240],
    boda: [316, 236], graduacion: [24, 236], prensa: [24, 236], autos: [300, 240], marca: [300, 240] };

  /* --- Dibujos de los lugares --- */
  const vt = (x, y, s, o) => `<text class="pe-vl${o && o.dk ? ' pe-dk' : ''}" x="${x}" y="${y}" text-anchor="${(o && o.a) || 'middle'}"${o && o.r ? ` transform="rotate(${o.r} ${x} ${y})"` : ''}>${esc(String(T(s)).toUpperCase())}</text>`;
  const seats = (u) => `<pattern id="${u}s" width="6" height="5" patternUnits="userSpaceOnUse"><rect width="6" height="5" fill="#161c29"/><path d="M0 4.5h6" stroke="#222b3d" stroke-width="1"/></pattern>`;
  const crowd = (u) => `<pattern id="${u}c" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#14121c"/><circle cx="2" cy="2" r="1.3" fill="#2b2739"/><circle cx="5.5" cy="5.5" r="1.3" fill="#2b2739"/></pattern>`;
  const rows = (x, y0, w, h, n, step) => { let d = ''; for (let i = 0; i < n; i++) d += `M${x} ${f1(y0 + i * step)}h${w}v${h}h-${w}z`; return d; };
  const control = (v) => {
    const p = CONTROL[v]; if (!p) return '';
    const van = /estadio|boxeo|lucha|concierto|misa|funeral/.test(v);
    return van
      ? `<g><rect x="${p[0] - 13}" y="${p[1] - 9}" width="26" height="18" rx="2.5" fill="#232a38" stroke="#4da3ff" stroke-opacity=".6"/><text class="pe-vl" x="${p[0]}" y="${p[1] + 2.6}" text-anchor="middle" style="fill:#8cc4ff">${esc(T('pe.um'))}</text></g>`
      : `<g><rect x="${p[0] - 18}" y="${p[1] - 7}" width="36" height="14" rx="2.5" fill="#232a38" stroke="#4da3ff" stroke-opacity=".6"/><text class="pe-vl" x="${p[0]}" y="${p[1] + 2.5}" text-anchor="middle" style="fill:#8cc4ff">${esc(T('pe.control'))}</text></g>`;
  };

  function bgFutbol(u, v) {
    const x0 = 59, x1 = 301, y0 = 46, y1 = 202, cy = 124;
    let g = `<defs>${seats(u)}</defs><rect width="${W}" height="${H}" fill="#0a0d13"/>`;
    if (v === 'barrial') {
      g += `<rect x="120" y="212" width="120" height="30" rx="3" fill="url(#${u}s)"/>${vt(180, 254, 'pe.v.graderio')}
        <rect x="44" y="34" width="272" height="180" rx="2" fill="none" stroke="#3a4150" stroke-dasharray="1 2.5"/>${vt(180, 28, 'pe.v.malla')}`;
    } else {
      g += `<rect x="40" y="210" width="280" height="50" rx="4" fill="url(#${u}s)"/><rect x="40" y="4" width="280" height="34" rx="4" fill="url(#${u}s)"/>
        <rect x="4" y="44" width="42" height="160" rx="4" fill="url(#${u}s)"/><rect x="314" y="44" width="42" height="160" rx="4" fill="url(#${u}s)"/>
        <rect x="188" y="250" width="64" height="8" rx="1.5" fill="#2a3242"/>
        ${vt(110, 258, 'pe.v.tribuna')}${vt(110, 14, 'pe.v.preferencia')}${vt(12, 124, 'pe.v.gen_sur', { r: -90 })}${vt(350, 124, 'pe.v.gen_norte', { r: 90 })}`;
    }
    // césped con franjas
    g += `<rect x="${x0 - 9}" y="${y0 - 8}" width="${x1 - x0 + 18}" height="${y1 - y0 + 16}" rx="3" fill="#173d26"/>
      <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#1d4b2e"/>`;
    let st = ''; const sw = (x1 - x0) / 12; for (let i = 1; i < 12; i += 2) st += `M${f1(x0 + i * sw)} ${y0}h${f1(sw)}v${y1 - y0}h-${f1(sw)}z`;
    g += `<path d="${st}" fill="#21542f"/>`;
    // líneas reglamentarias (escala 2.3 px por metro)
    const pa = 38, ph = 46.4, ga = 12.6, gh = 21, sp = 25.3, r = 21;
    const L = `M${x0} ${y0}H${x1}V${y1}H${x0}Z M180 ${y0}V${y1}
      M${x0} ${cy - ph}h${pa}v${ph * 2}h-${pa} M${x1} ${cy - ph}h-${pa}v${ph * 2}h${pa}
      M${x0} ${cy - gh}h${ga}v${gh * 2}h-${ga} M${x1} ${cy - gh}h-${ga}v${gh * 2}h${ga}
      M${x0 + pa} ${cy - 16.7}A${r} ${r} 0 0 1 ${x0 + pa} ${cy + 16.7} M${x1 - pa} ${cy - 16.7}A${r} ${r} 0 0 0 ${x1 - pa} ${cy + 16.7}
      M${180 - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 -${r * 2} 0`;
    g += `<path d="${L}" fill="none" stroke="#e9f5ec" stroke-opacity=".62" stroke-width="1.1"/>
      <path d="M${x0 + sp} ${cy}h.1M${x1 - sp} ${cy}h.1M180 ${cy}h.1" stroke="#e9f5ec" stroke-opacity=".8" stroke-width="2.6" stroke-linecap="round"/>
      <rect x="${x0 - 4.6}" y="${cy - 8.4}" width="4.6" height="16.8" fill="#e9edf5" fill-opacity=".85"/><rect x="${x1}" y="${cy - 8.4}" width="4.6" height="16.8" fill="#e9edf5" fill-opacity=".85"/>
      <path d="M146 205h14M200 205h14" stroke="#4da3ff" stroke-opacity=".7" stroke-width="3"/>${vt(142, 207.5, 'pe.v.bancas', { a: 'end' })}`;
    if (v !== 'barrial') g += `<rect x="174" y="210" width="12" height="7" fill="#05070a"/>${vt(206, 256.5, 'pe.v.cabinas')}`;
    return g;
  }

  function bgRing(u, v) {
    let g = `<defs>${seats(u)}</defs><rect width="${W}" height="${H}" fill="#0b0c12"/><rect x="60" y="34" width="240" height="180" rx="6" fill="#12141d"/>`;
    if (v === 'lucha') {
      g += `<rect x="70" y="4" width="78" height="30" rx="4" fill="url(#${u}s)"/><rect x="212" y="4" width="78" height="30" rx="4" fill="url(#${u}s)"/>
        <rect x="150" y="4" width="60" height="22" rx="3" fill="#2a2142" stroke="#7a5ab8" stroke-opacity=".6"/><rect x="172" y="26" width="16" height="42" fill="#231c36"/>
        ${vt(180, 17, 'pe.v.entrada')}`;
    } else {
      g += `<rect x="70" y="4" width="220" height="30" rx="4" fill="url(#${u}s)"/><path d="M330 22L236 72" stroke="#3a3446" stroke-width="7" stroke-linecap="round"/>`;
    }
    g += `<rect x="70" y="214" width="220" height="44" rx="4" fill="url(#${u}s)"/><rect x="4" y="44" width="54" height="160" rx="4" fill="url(#${u}s)"/><rect x="302" y="44" width="54" height="160" rx="4" fill="url(#${u}s)"/>
      ${vt(180, 254, 'pe.v.publico')}
      <rect x="122" y="66" width="116" height="116" rx="2" fill="#1d2433"/>
      <rect x="130" y="74" width="100" height="100" fill="${v === 'lucha' ? '#2c3a5c' : '#c8cdd6'}"/>
      <rect x="131.5" y="75.5" width="97" height="97" fill="none" stroke="${v === 'lucha' ? '#e9edf5' : '#c62f3a'}" stroke-width="1.6"/>
      <rect x="134.5" y="78.5" width="91" height="91" fill="none" stroke="${v === 'lucha' ? '#ff3b3b' : '#e9edf5'}" stroke-opacity=".7" stroke-width="1"/>
      <circle cx="131" cy="75" r="3.2" fill="#ff3b3b"/><circle cx="229" cy="173" r="3.2" fill="#4da3ff"/><circle cx="229" cy="75" r="3.2" fill="#e9edf5"/><circle cx="131" cy="173" r="3.2" fill="#e9edf5"/>
      ${v === 'lucha' ? '' : `${vt(124, 62, 'pe.v.esquina_roja', { a: 'end' })}${vt(236, 192, 'pe.v.esquina_azul', { a: 'start' })}`}
      <rect x="128" y="190" width="104" height="9" rx="1.5" fill="#2a3242"/>${vt(180, 207, 'pe.v.mesa_jueces')}`;
    return g;
  }

  function bgConcierto(u) {
    return `<defs>${crowd(u)}</defs><rect width="${W}" height="${H}" fill="#0b0a10"/>
      <rect x="14" y="100" width="332" height="160" rx="6" fill="url(#${u}c)"/>
      <rect x="58" y="6" width="244" height="80" rx="3" fill="#1b1825" stroke="#3a3446"/>
      <rect x="84" y="9" width="192" height="7" rx="1" fill="#4da3ff" fill-opacity=".35"/>${vt(180, 25, 'pe.v.pantalla')}
      <rect x="156" y="30" width="48" height="24" rx="2" fill="#2a2536"/>${vt(180, 45, 'pe.v.bateria')}
      <rect x="230" y="40" width="30" height="13" rx="2" fill="#2a2536"/>${vt(245, 62, 'pe.v.teclados')}
      <circle cx="180" cy="72" r="3.2" fill="#ffb020"/>${vt(192, 75, 'pe.v.voz', { a: 'start' })}
      <path d="M118 80l8-4M242 80l-8-4M160 82l6-3M200 82l-6-3" stroke="#3a4150" stroke-width="3"/>
      <rect x="44" y="30" width="10" height="36" rx="2" fill="#232a38"/><rect x="306" y="30" width="10" height="36" rx="2" fill="#232a38"/>
      <rect x="58" y="86" width="244" height="12" fill="#0f1016"/>${vt(316, 95, 'pe.v.foso', { a: 'start' })}
      <path d="M58 98.5H302" stroke="#8b95a8" stroke-width="2" stroke-dasharray="4 1.5"/>
      <rect x="160" y="184" width="40" height="26" rx="2" fill="#232a38" stroke="#4da3ff" stroke-opacity=".5"/>${vt(180, 220, 'pe.v.foh')}
      ${vt(70, 250, 'pe.v.publico', { a: 'start' })}`;
  }

  function bgIglesia(u, v) {
    let g = `<rect width="${W}" height="${H}" fill="#0b0c11"/>
      <rect x="84" y="6" width="192" height="252" rx="3" fill="#18161f" stroke="#3a3446"/>
      <rect x="85" y="7" width="190" height="56" fill="#211d2a"/><path d="M85 63h190" stroke="#4a4256" stroke-width="2"/>
      <rect x="158" y="24" width="44" height="13" rx="1.5" fill="#e6dfca"/>${vt(180, 46, 'pe.v.altar')}
      <path d="M180 10v10M176 13.5h8" stroke="#ffb020" stroke-opacity=".8" stroke-width="1.4"/>
      <rect x="224" y="46" width="13" height="10" rx="1.5" fill="#5a4a3a"/>${vt(231, 41, 'pe.v.ambon')}
      <path d="${rows(96, 78, 68, 7, 12, 13.5)}${rows(196, 78, 68, 7, 12, 13.5)}" fill="#3a2c22"/>
      <rect x="166" y="254" width="28" height="6" fill="#0b0c11"/>${vt(200, 252, 'pe.v.puerta', { a: 'start' })}
      <path d="M91 107a5 5 0 1 0 .1 0M91 167a5 5 0 1 0 .1 0M269 107a5 5 0 1 0 .1 0M269 167a5 5 0 1 0 .1 0" fill="#4a4256" stroke="#6a6076" stroke-width=".8"/>`;
    if (v === 'funeral') g += `<rect x="171" y="68" width="18" height="34" rx="4" fill="#5a3a22" stroke="#8a5a2b"/><circle cx="165" cy="70" r="3" fill="#e9edf5" fill-opacity=".8"/><circle cx="195" cy="70" r="3" fill="#e9edf5" fill-opacity=".8"/>${vt(180, 112, 'pe.v.feretro')}`;
    return g;
  }

  function bgSalon(u, v) {
    let g = `<rect width="${W}" height="${H}" fill="#0b0c11"/>`;
    if (v === 'boda') {
      g += `<rect x="290" y="6" width="66" height="252" rx="4" fill="#12301d"/><path d="M306 36a8 8 0 1 0 .1 0M340 110a9 9 0 1 0 .1 0M310 190a8 8 0 1 0 .1 0M342 236a7 7 0 1 0 .1 0" fill="#1d4a2c"/>${vt(323, 252, 'pe.v.jardin')}
        <rect x="6" y="6" width="280" height="252" rx="3" fill="#18171f" stroke="#3a3446"/>
        <path d="M160 46a20 20 0 0 1 40 0" fill="none" stroke="#ff8fb0" stroke-opacity=".7" stroke-width="3"/>
        <rect x="172" y="62" width="16" height="190" fill="#4a2228"/>
        <circle cx="173" cy="54" r="4" fill="#e9edf5"/><circle cx="187" cy="54" r="4" fill="#2a2d35" stroke="#e9edf5" stroke-opacity=".6"/>${vt(150, 58, 'pe.v.novios', { a: 'end' })}
        <path d="${rows(92, 74, 74, 6, 12, 14)}${rows(194, 74, 74, 6, 12, 14)}" fill="#3a3442"/>`;
    } else if (v === 'graduacion') {
      g += `<rect x="6" y="6" width="348" height="252" rx="3" fill="#18171f" stroke="#3a3446"/>
        <rect x="64" y="8" width="232" height="52" rx="3" fill="#1f2433" stroke="#3a4150"/>
        <rect x="118" y="28" width="56" height="10" rx="1.5" fill="#5a4a3a"/>${vt(146, 48, 'pe.v.diplomas')}<rect x="236" y="30" width="12" height="12" rx="1.5" fill="#5a4a3a"/>${vt(242, 52, 'pe.v.atril')}${vt(180, 18, 'pe.v.escenario')}
        <path d="${rows(86, 72, 84, 6, 5, 12)}${rows(190, 72, 84, 6, 5, 12)}" fill="#24375a"/>${vt(330, 100, 'pe.v.graduados', { r: 90 })}
        <path d="${rows(86, 140, 84, 6, 4, 12)}${rows(190, 140, 84, 6, 4, 12)}${rows(86, 222, 64, 6, 2, 12)}${rows(210, 222, 64, 6, 2, 12)}" fill="#3a3442"/>${vt(330, 176, 'pe.v.familias', { r: 90 })}
        <rect x="158" y="194" width="44" height="20" rx="2" fill="#232a38" stroke="#3a4150"/>
        <path d="M72 106a6 6 0 1 0 .1 0M288 106a6 6 0 1 0 .1 0" fill="#4a4256" stroke="#6a6076" stroke-width=".8"/>`;
    } else {
      g += `<rect x="6" y="6" width="348" height="252" rx="3" fill="#18171f" stroke="#3a3446"/>
        <rect x="80" y="10" width="200" height="6" rx="1" fill="#4da3ff" fill-opacity=".35"/>${vt(180, 9, 'pe.v.backing')}
        <rect x="104" y="22" width="152" height="14" rx="2" fill="#5a4a3a"/><path d="M128 29h.1M160 29h.1M200 29h.1M232 29h.1" stroke="#e9edf5" stroke-width="7" stroke-linecap="round"/>${vt(180, 46, 'pe.v.mesa')}
        <path d="${rows(70, 70, 96, 6, 8, 14)}${rows(194, 70, 96, 6, 8, 14)}" fill="#3a3442"/>${vt(32, 120, 'pe.v.periodistas', { r: -90 })}
        <rect x="96" y="194" width="168" height="40" rx="3" fill="#232a38" stroke="#3a4150"/>${vt(180, 246, 'pe.v.tarima')}`;
    }
    return g;
  }

  function bgEscenario(u, v) {
    let g = `<defs>${crowd(u)}</defs><rect width="${W}" height="${H}" fill="#0b0b11"/>
      <rect x="6" y="6" width="${v === 'autos' ? 306 : 348}" height="252" rx="3" fill="#16151d" stroke="#3a3446"/>
      <rect x="48" y="8" width="264" height="88" rx="3" fill="#1d1a27" stroke="#3a3446"/>
      <rect x="66" y="10" width="228" height="8" rx="1" fill="#4da3ff" fill-opacity=".4"/>${vt(180, 27, 'pe.v.pantalla')}
      <path d="M48 96H312" stroke="#ffb020" stroke-opacity=".35" stroke-width="1.4"/>
      <path d="M86 150a6 6 0 1 0 .1 0M140 136a6 6 0 1 0 .1 0M204 140a6 6 0 1 0 .1 0M262 150a6 6 0 1 0 .1 0M110 196a6 6 0 1 0 .1 0M180 186a6 6 0 1 0 .1 0M250 206a6 6 0 1 0 .1 0M84 236a6 6 0 1 0 .1 0M220 238a6 6 0 1 0 .1 0" fill="#2c2838"/>
      ${vt(180, 168, 'pe.v.invitados')}
      <rect x="8" y="182" width="8" height="70" fill="#c62f3a" fill-opacity=".7"/>${vt(22, 176, 'pe.v.photocall', { a: 'start' })}
      <rect x="110" y="70" width="12" height="14" rx="1.5" fill="#5a4a3a"/>${vt(116, 92, 'pe.v.atril')}`;
    if (v === 'autos') {
      g += `<circle cx="180" cy="56" r="30" fill="#232a38" stroke="#4a5263"/><circle cx="180" cy="56" r="26" fill="none" stroke="#4a5263" stroke-dasharray="2 3"/>
        <rect x="166" y="38" width="28" height="44" rx="9" fill="#c62f3a" transform="rotate(90 180 60) translate(0 -4)"/>
        <rect x="174" y="48" width="12" height="22" rx="3" fill="#0d0f14" fill-opacity=".55" transform="rotate(90 180 60) translate(0 -4)"/>
        <rect x="316" y="6" width="38" height="252" rx="3" fill="#191c24"/><path d="M335 12V252" stroke="#e9edf5" stroke-opacity=".4" stroke-dasharray="6 6"/>${vt(330, 130, 'pe.v.prueba', { r: 90 })}`;
    } else {
      g += `<rect x="168" y="46" width="24" height="24" rx="3" fill="#2a3a5a" stroke="#4da3ff" stroke-opacity=".6"/>${vt(180, 80, 'pe.v.producto')}
        <rect x="290" y="120" width="60" height="70" rx="3" fill="#221c10" stroke="#5a4214"/>${vt(320, 158, 'pe.v.vip')}`;
    }
    return g;
  }

  function bgCalle(u) {
    return `<defs><pattern id="${u}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#0d0f14"/><path d="M0 0v6" stroke="#ff3b3b" stroke-opacity=".22" stroke-width="2"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="#0b0d12"/>
      <path d="M6 6h70v72H6zM82 6h86v72H82zM174 6h58v72h-58zM238 6h116v72H238z" fill="#1b1f2a"/>
      <path d="M6 186h96v72H6zM108 186h74v72h-74zM188 186h166v72H188z" fill="#1b1f2a"/>
      <rect x="188" y="186" width="166" height="72" fill="url(#${u}h)"/>${vt(272, 226, 'pe.v.poca_senal')}
      <rect x="0" y="82" width="${W}" height="18" fill="#262b36"/><rect x="0" y="166" width="${W}" height="18" fill="#262b36"/>
      <rect x="0" y="100" width="${W}" height="66" fill="#15181f"/>
      <path d="M0 133H360" stroke="#ffb020" stroke-opacity=".55" stroke-dasharray="10 8" stroke-width="1.2"/>
      <path d="M240 103h4v60h-4zM250 103h4v60h-4zM260 103h4v60h-4zM270 103h4v60h-4z" fill="#e9edf5" fill-opacity=".45"/>
      <path d="M40 91a4 4 0 1 0 .1 0M200 91a4 4 0 1 0 .1 0M320 175a4 4 0 1 0 .1 0M90 175a4 4 0 1 0 .1 0" fill="#1d4a2c"/>
      <path d="M18 92H222Q256 92 256 120V175H344" fill="none" stroke="#ff3b3b" stroke-opacity=".7" stroke-width="1.4" stroke-dasharray="1 4" stroke-linecap="round"/>
      <path d="M338 171l7 4-7 4" fill="none" stroke="#ff3b3b" stroke-opacity=".8" stroke-width="1.4"/>${vt(20, 112, 'pe.v.ruta', { a: 'start' })}
      <circle cx="154" cy="90" r="5" fill="#e9edf5"/><circle cx="154" cy="90" r="9" fill="none" stroke="#e9edf5" stroke-opacity=".35"/>${vt(154, 75, 'pe.v.talento')}
      <path d="M300 46l-6 20M300 46l6 20M296 58h8M300 46v-6M292 38a11 11 0 0 1 16 0M288 33a17 17 0 0 1 24 0" fill="none" stroke="#8cc4ff" stroke-opacity=".7" stroke-width="1.2"/>${vt(300, 74, 'pe.v.antena')}`;
  }

  const BG = { futbol: bgFutbol, ring: bgRing, concierto: bgConcierto, iglesia: bgIglesia, salon: bgSalon, escenario: bgEscenario, calle: bgCalle };

  /* --- Posiciones del plan --- */
  function posList(plan, t) {
    let src = null;
    if (Array.isArray(plan)) src = plan;
    else if (plan && typeof plan === 'object') src = plan.positions || plan.posiciones || plan.camaras || plan.cams || null;
    if (!src || !src.length) src = posiciones(t);
    return src.map((p, i) => {
      if (!p || typeof p !== 'object') p = { key: String(p) };
      const key = String(p.key || p.id || p.pos || p.k || 'p' + i);
      const nkey = norm(key);
      let nombre = p.nombre || p.name || p.label || '';
      if (!nombre) { const d = 'pe.pos.' + t + '.' + key; nombre = has(d) ? T(d) : key.replace(/_/g, ' '); }
      let ideal = p.ideal != null ? p.ideal : p.idealNombre != null ? p.idealNombre : p.idealCam;
      if (ideal && typeof ideal === 'object') ideal = ideal.nombre || ideal.name || ideal.type || '';
      if (ideal && /^[a-z0-9_]+$/.test(ideal)) { const c = (G().CATALOG || {})[ideal]; ideal = c ? c.name : ideal.replace(/_/g, ' '); }
      if (!ideal) { const d = 'pe.idealcam.' + t + '.' + key; if (has(d)) ideal = T(d); }
      const asg = p.asignado !== undefined ? p.asignado : p.camara !== undefined ? p.camara : p.equip !== undefined ? p.equip : p.assigned;
      let aj = num(p.ajuste != null ? p.ajuste : p.fit != null ? p.fit : p.score);
      if (aj != null && aj > 1.5) aj = aj / 100;
      // fit = qué tan bien encaja la cámara (sin contar si hay quien la maneje); operado === false: nadie la maneja
      let fit = num(p.fit);
      if (fit != null && fit > 1.5) fit = fit / 100;
      return { i, key, nkey, nombre, ideal: ideal || '', asg, aj, fit, sinOp: p.operado === false, eid: p.equipId != null ? p.equipId : null, n: num(p.n != null ? p.n : p.num) || i + 1, opcional: !!p.opcional, raw: p };
    });
  }
  function camName(a, o) {
    if (a == null || a === false || a === '') return '';
    if (typeof a === 'object') {
      const c = (G().CATALOG || {})[a.type];
      return a.nick || a.nombre || a.name || (c && c.name) || a.type || '';
    }
    if (typeof a === 'number') { try { if (o && o.nombreEquipo) return o.nombreEquipo(a) || '#' + a; } catch (e) { /* abajo */ } return '#' + a; }
    const c = (G().CATALOG || {})[a];
    if (c) return c.name;
    try { if (o && o.nombreEquipo) { const r = o.nombreEquipo(a); if (r) return r; } } catch (e) { /* abajo */ }
    return String(a);
  }
  // 'opt' = toma extra (opcional) sin cámara: en gris, no cuenta como que falta
  const fitK = (p) => (!p.asgName ? (p.opcional ? 'opt' : 'off') : p.aj == null ? 'na' : p.aj >= 0.8 ? 'ok' : p.aj >= 0.5 ? 'mid' : 'bad');
  const vacioTxt = (p) => (p.opcional ? T('pe.opcional') : T('pe.vacia'));

  // Asigna cada posición a un punto del dibujo
  function placeAll(list, v) {
    const spots = SPOTS[v] || [];
    const used = new Set();
    const spare = (SPARE[v] || []).slice();
    const hits = {};
    list.forEach((p) => {
      let s = spots.find((x) => x.k === p.key && !used.has(x.k)) || spots.find((x) => x.k === p.nkey && !used.has(x.k));
      if (!s) {
        const txt = norm(p.key.replace(/_/g, ' ') + ' ' + p.nombre);
        const m = spots.filter((x) => x.re && x.re.test(txt));
        s = m.find((x) => !used.has(x.k));
        if (!s && m.length) { // ya ocupado: al lado del mismo punto
          const b = m[0]; hits[b.k] = (hits[b.k] || 0) + 1;
          const d = 15 * hits[b.k];
          s = Object.assign({}, b, { k: b.k + '_' + hits[b.k], at: [Math.max(10, Math.min(W - 10, b.at[0] + (b.at[0] > W / 2 ? -d : d))), b.at[1]], path: null, wires: null });
        }
      }
      if (!s) {
        const at = spare.shift() || [20 + (p.i * 23) % 320, H - 12];
        s = { k: 'spare' + p.i, at, aim: C, fov: 40, len: 36, f: 'fija' };
      }
      used.add(s.k);
      p.spot = s;
      // Cámaras libres: la lógica dice dónde está la cámara (x, y en % del plano) y hacia dónde filma (tx, ty)
      const r = p.raw || {};
      if (typeof r.x === 'number' && typeof r.y === 'number') {
        const at = [f1(r.x * W / 100), f1(r.y * H / 100)];
        const aim = typeof r.tx === 'number' ? [r.tx * W / 100, r.ty * H / 100] : s.aim;
        const mov = !!r.movida;
        p.spot = Object.assign({}, s, { at, aim, path: mov ? null : s.path, arm: mov ? null : s.arm, wires: mov ? null : s.wires, libre: true });
        if (typeof r.nx === 'number') p.marca = [f1(r.nx * W / 100), f1(r.ny * H / 100)];
      }
    });
  }

  function cone(x, y, ax, ay, fov, len) {
    const a = Math.atan2(ay - y, ax - x), h = (fov || 40) * Math.PI / 360;
    const L = len || Math.min(90, Math.hypot(ax - x, ay - y));
    const p1 = [x + L * Math.cos(a - h), y + L * Math.sin(a - h)], p2 = [x + L * Math.cos(a + h), y + L * Math.sin(a + h)];
    return `M${f1(x)} ${f1(y)}L${f1(p1[0])} ${f1(p1[1])}A${f1(L)} ${f1(L)} 0 0 1 ${f1(p2[0])} ${f1(p2[1])}Z`;
  }

  // Lo que se ve sobre cada posición cuando hay una cámara elegida: cuánto cambia la calidad si va ahí
  const pvTxt = (pv) => (!pv ? '' : pv.ok === false ? T('pe.ed.no_va') : pv.dq > 0 ? '+' + pv.dq : pv.dq < 0 ? String(pv.dq).replace('-', '−') : '±0');
  const pvCls = (pv) => (!pv ? '' : pv.ok === false ? 'no' : pv.dq > 0 ? 'up' : pv.dq < 0 ? 'dn' : 'eq');
  function marker(p, ed) {
    const s = p.spot, [x, y] = s.at, k = fitK(p);
    const info = `${T('pe.cam.n', { n: p.n })} · ${p.nombre} — ${p.asgName || vacioTxt(p)}${p.aj != null && p.asgName ? ' · ' + T('pe.ajuste', { p: Math.round(p.aj * 100) }) : ''}${p.ideal ? ' · ' + T('pe.idealp', { t: p.ideal }) : ''}`;
    // En el plan a mano la posición se toca para colocar (data-pe-act); si no, solo se resalta (data-pe-cam)
    const sel = ed && ed.selPos === p.key ? ' pe-on' : '';
    const src = ed && ed.selCam != null && p.eid === ed.selCam ? ' pe-src' : '';
    // Plan a mano con cámaras libres: la cámara puesta se toca para elegirla y moverla (data-pe-act="sel"); una toma sin
    // cámara solo tiene su marca de piso (ghost). Sin cámaras libres, la posición se toca para colocar (data-pe-act="pos").
    const libre = ed && ed.libre && s.libre;
    if (libre && !p.asgName) return '';
    let g = libre
      ? `<g class="pe-cam pe-real pe-k-${k}${sel}${src}" data-pe-act="sel" data-k="${esc(p.key)}" data-id="${p.eid}" tabindex="0" role="button" aria-pressed="${src ? 'true' : 'false'}" aria-label="${esc(T('pe.ed.cam_en', { n: p.n, cam: p.asgName, toma: (p.raw && p.raw.toma) || p.nombre }))}"><title>${esc(info)}</title><circle class="pe-hit" cx="${x}" cy="${y}" r="23"/><circle class="pe-ring" cx="${x}" cy="${y}" r="11.5"/>`
      : ed
      ? `<g class="pe-cam pe-k-${k}${sel}${src}" data-pe-act="pos" data-k="${esc(p.key)}" tabindex="0" role="button" aria-pressed="${sel ? 'true' : 'false'}" aria-label="${esc(info)}"><title>${esc(info)}</title><circle class="pe-hit" cx="${x}" cy="${y}" r="23"/><circle class="pe-ring" cx="${x}" cy="${y}" r="11.5"/>`
      : `<g class="pe-cam pe-k-${k}" data-pe-cam="${p.n}" tabindex="0" role="button" aria-label="${esc(info)}"><title>${esc(info)}</title>`;
    if (s.wires) g += `<path class="pe-wire" d="${s.wires.map((w) => `M${w[0]} ${w[1]}L${x} ${y}`).join('')}"/>`;
    if (s.arm) g += `<path class="pe-arm" d="M${s.arm[0]} ${s.arm[1]}L${x} ${y}"/>`;
    if (s.path) g += `<path class="pe-trav" d="M${s.path.map((q) => q.join(' ')).join('L')}"/>`;
    if (s.f !== 'aerea' && s.aim) {
      const r = p.raw || {};
      if (s.libre && p.asgName && r.kind && r.kind !== 'aereo') {
        // Campo de visión real: hacia lo que filma, más angosto con lente largo; si el lente no llega, se corta antes
        const d = Math.hypot(s.aim[0] - x, s.aim[1] - y);
        const al = typeof r.alcance === 'number' ? Math.max(0, Math.min(3, r.alcance)) : 1;
        const fov = r.kind === 'general' ? 54 : r.kind === 'cerrado' ? [40, 26, 16, 10][al] : r.kind === 'reaccion' ? 46 : 40;
        const len = Math.max(14, Math.min(170, r.lenteFalta ? d * 0.55 : d));
        g += `<path class="pe-cone${r.tapada ? ' pe-tap' : ''}" d="${cone(x, y, s.aim[0], s.aim[1], fov, len)}"/>`;
        if (r.lenteFalta && d > 20) { const a = Math.atan2(s.aim[1] - y, s.aim[0] - x); g += `<path class="pe-nol" d="M${f1(x + len * Math.cos(a))} ${f1(y + len * Math.sin(a))}L${f1(s.aim[0])} ${f1(s.aim[1])}"/>`; }
      } else g += `<path class="pe-cone" d="${cone(x, y, s.aim[0], s.aim[1], s.fov, s.len)}"/>`;
    }
    if (s.f === 'aerea') g += `<circle class="pe-aer" cx="${x}" cy="${y}" r="13"/><rect class="pe-dot" x="-6.4" y="-6.4" width="12.8" height="12.8" rx="2" transform="translate(${x} ${y}) rotate(45)"/>`;
    else if (s.f === 'robot') g += `<rect class="pe-dot" x="${x - 6.6}" y="${y - 6.6}" width="13.2" height="13.2" rx="2.5"/>`;
    else g += `<circle class="pe-dot" cx="${x}" cy="${y}" r="7.2"/>`;
    g += `<text class="pe-num" x="${x}" y="${y + 0.3}">${p.n}</text>`;
    const pv = ed && ed.preview && !libre ? ed.preview[p.key] : null;
    if (pv) {
      const t = pvTxt(pv), w = Math.max(18, t.length * 5.6 + 8);
      const by = y < 26 ? y + 17 : y - 17, bx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, x));
      g += `<g class="pe-pv ${pvCls(pv)}"><rect x="${f1(bx - w / 2)}" y="${by - 6.5}" width="${f1(w)}" height="13" rx="6.5"/><text x="${f1(bx)}" y="${by + 0.4}">${esc(t)}</text></g>`;
    }
    return g + '</g>';
  }

  /* Cámaras libres: marca de piso (cinta en X) de cada toma, en su sitio sugerido. Tocarla pone ahí la cámara elegida. */
  function ghost(p, ed) {
    if (!p.marca) return '';
    const [x, y] = p.marca, k = fitK(p);
    const toma = (p.raw && p.raw.toma) || p.nombre;
    const lbl = T('pe.ed.marca', { n: p.n, toma });
    let g = `<g class="pe-gh pe-k-${k}${ed.selPos === p.key ? ' pe-on' : ''}" data-pe-act="pos" data-k="${esc(p.key)}" tabindex="0" role="button" aria-label="${esc(lbl)}"><title>${esc(lbl)}</title>
      <circle class="pe-hit" cx="${x}" cy="${y}" r="23"/><path class="pe-tape" d="M${f1(x - 6)} ${f1(y - 6)}L${f1(x + 6)} ${f1(y + 6)}M${f1(x + 6)} ${f1(y - 6)}L${f1(x - 6)} ${f1(y + 6)}"/>
      <text class="pe-ghn" x="${f1(x + 9)}" y="${f1(y - 7)}">${p.n}</text>`;
    const pv = ed.preview ? ed.preview[p.key] : null;
    if (pv) {
      const t = pvTxt(pv), w = Math.max(18, t.length * 5.6 + 8);
      const by = y < 26 ? y + 19 : y - 19, bx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, x));
      g += `<g class="pe-pv ${pvCls(pv)}"><rect x="${f1(bx - w / 2)}" y="${f1(by - 6.5)}" width="${f1(w)}" height="13" rx="6.5"/><text x="${f1(bx)}" y="${f1(by + 0.4)}">${esc(t)}</text></g>`;
    }
    return g + '</g>';
  }
  // Zonas del lugar: las altas (tribuna, tarima) siempre; con una cámara elegida, en rojo donde esa cámara no puede ir
  function zonaForma(z, attrs) {
    if (z.r) return `<rect x="${z.r[0]}" y="${z.r[1]}" width="${z.r[2]}" height="${z.r[3]}" rx="2" ${attrs}/>`;
    if (z.c) return `<circle cx="${z.c[0]}" cy="${z.c[1]}" r="${z.c[2]}" ${attrs}/>`;
    if (z.s) { const [x1, y1, x2, y2, w] = z.s; return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke-width="${w * 2}" stroke-linecap="round" ${attrs.replace(/fill=/, 'data-f=')}/>`; }
    return '';
  }
  function zonasSvg(geo, cuerpo, u) {
    if (!geo || !Array.isArray(geo.zonas)) return '';
    let g = '';
    const altas = geo.zonas.filter((z) => z.t === 'alto' && z.r);
    g += altas.map((z) => `${zonaForma(z, 'class="pe-zalto"')}${z.r[2] >= 60 && z.r[3] >= 26 ? `<text class="pe-zat" x="${z.r[0] + 3}" y="${z.r[1] + 8}">▲ ${esc(String(T('pe.v.alto')).toUpperCase())}</text>` : ''}`).join('');
    if (cuerpo) {
      const malas = geo.zonas.filter((z) => (z.t === 'bloqueo' && !(z.deja || []).includes(cuerpo)) || (z.t === 'alto' && cuerpo === 'grua'));
      g += `<defs><pattern id="${u}x" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ff3b3b" fill-opacity=".08"/><path d="M0 0v6" stroke="#ff3b3b" stroke-opacity=".38" stroke-width="1.3"/></pattern></defs>`;
      g += malas.map((z) => (z.s ? zonaForma(z, `class="pe-zno-s"`) : zonaForma(z, `class="pe-zno" fill="url(#${u}x)"`))).join('');
      // Huecos que esa cámara sí puede usar dentro de un bloqueo (la red de cada arco para una minicámara): en verde
      g += geo.zonas.filter((z) => z.abre && (z.deja || []).includes(cuerpo)).map((z) => zonaForma(z, 'class="pe-zsi"')).join('');
    }
    return `<g class="pe-zonas" aria-hidden="true">${g}</g>`;
  }

  function cable(p, v) {
    const c = CONTROL[v]; const s = p.spot;
    if (!c || s.f === 'aerea' || !p.asgName) return '';
    const [x, y] = s.at;
    // recorrido tipo "manguera": baja/sube hasta la fila del control y luego va de lado
    const midY = Math.abs(y - c[1]) < 4 ? y : c[1];
    return `M${x} ${y}V${midY}H${c[0]}`;
  }

  const shapeIco = (f) => `<svg width="12" height="12" viewBox="-7 -7 14 14" aria-hidden="true">${f === 'aerea' ? '<rect x="-4.3" y="-4.3" width="8.6" height="8.6" rx="1.5" transform="rotate(45)" fill="none" stroke="currentColor" stroke-width="1.6"/>' : f === 'robot' ? '<rect x="-5" y="-5" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>' : f === 'mano' ? '<circle r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M-7 6.2H7" stroke="currentColor" stroke-dasharray="2 1.5"/>' : '<circle r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>'}</svg>`;
  const colorIco = (k) => `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class="pe-k-${k}"><circle cx="5" cy="5" r="4" style="fill:var(--pe-c)"${k === 'off' || k === 'opt' ? ' fill-opacity=".35"' : ''}/></svg>`;

  /* ---------- Plan de cámaras a mano: barra (automático / tu plan), cámaras, detalle de la posición y combos ----------
     o.editable, o.modo ('auto' | 'manual'), o.delta (calidad de tu plan - automático), o.selCam (id del equipo),
     o.selPos (clave), o.preview ({ clave: { dq, ok } }), o.arte(tipo) → html, o.operadores ({ rol: [{ id, name, skill }] }),
     o.tutorial (solo se mira). Los toques llevan data-pe-act: modo | cam | pos | op | quitar | cerrar.
     Cámaras libres (o.geo = Game.camGeo(contrato), y la lógica da x, y de cada cámara): sel (tocar una cámara del plano),
     mapa (tocar un sitio del plano), marca (devolver la cámara a su marca); o.malPunto { x, y } marca un toque inválido. */
  const valor = (x) => {
    if (typeof x.pts === 'number') return x.pts ? `<span class="pe-v ${x.pts > 0 ? 'up' : 'dn'}" title="${esc(T('pe.ed.pts'))}">${x.pts > 0 ? '+' : '−'}${Math.abs(x.pts)}</span>` : '';
    if (typeof x.pct === 'number' && x.pct) return `<span class="pe-v pct ${x.pct > 0 ? 'up' : 'dn'}">${x.pct > 0 ? '+' : '−'}${Math.abs(x.pct)}%</span>`;
    return '';
  };
  function detalle(p, plan, o) {
    const r = p.raw || {};
    const toma = r.toma && r.toma !== p.nombre ? `<small>${esc(T('pe.ed.cubre', { toma: r.toma }))}</small>` : '';
    const head = `<div class="pe-dth"><div style="min-width:0"><b>${p.n} · ${esc(p.nombre)}</b>${toma}<small>${esc(p.asgName || T('pe.vacia'))}${p.asgName && p.aj != null ? ' · ' + esc(T('pe.ed.ajuste', { p: Math.round(p.aj * 100) })) : ''}${r.movida ? ' · ' + esc(T('pe.ed.movida')) : ''}</small></div>
      <button type="button" class="pe-x" data-pe-act="cerrar" aria-label="${esc(T('pe.ed.cerrar'))}">×</button></div>`;
    // Tomas a mano del fútbol: para qué sirve (lado contrario: solo repeticiones/VAR o bancos) y, sin minicámara, dónde comprarla
    const nota = r.nota ? `<p class="pe-nota">${esc(TLx(r.nota))}</p>` : '';
    const compra = r.compra && !o.tutorial ? `<p class="pe-tip">${esc(TLx(r.compraTexto || ''))}</p><button type="button" class="pe-buy" data-act="ir-bodega" data-k="cam" data-item="${esc(r.compra)}">${esc(T('pe.ed.comprar'))}</button>` : '';
    if (!p.asgName) return `<div class="pe-dt" aria-live="polite">${head}${nota}<p class="pe-tip">${esc(T('pe.ed.sin_cam'))}${p.ideal ? ' ' + esc(T('pe.idealp', { t: p.ideal })) : ''}</p>${compra}</div>`;
    const base = typeof r.base === 'number' ? `<li><span>${esc(p.ideal && r.base < 0.8 ? T('pe.ed.encaje_ideal', { t: p.ideal }) : T('pe.ed.encaje'))}</span><span class="pe-v pct">${Math.round(r.base * 100)}%</span></li>` : '';
    const rz = (Array.isArray(r.razones) ? r.razones : []).filter((x) => x && (x.texto || x.k) && (x.pts !== 0 || x.par)).map((x) => `<li><span>${esc(TLx(x.texto || x.k))}</span>${valor(x)}</li>`).join('');
    const lista = (o.operadores && r.needs && o.operadores[r.needs]) || null;
    const opId = r.operador ? r.operador.id : 0;
    const ops = lista && !o.tutorial ? `<div class="pe-ops-t">${esc(T('pe.ed.operador'))}</div><div class="pe-ops" role="group" aria-label="${esc(T('pe.ed.operador'))}">
      ${lista.map((q) => `<button type="button" class="pe-op" data-pe-act="op" data-k="${esc(p.key)}" data-id="${q.id}" aria-pressed="${q.id === opId ? 'true' : 'false'}">${esc(q.name)}<i>${q.skill}</i></button>`).join('')}
      <button type="button" class="pe-op" data-pe-act="op" data-k="${esc(p.key)}" data-id="0" aria-pressed="${opId ? 'false' : 'true'}">${esc(T('pe.ed.nadie'))}</button></div>` : '';
    const marca = !o.tutorial && r.movida ? `<button type="button" class="pe-am" data-pe-act="marca" data-k="${esc(p.key)}">${esc(T('pe.ed.a_marca'))}</button>` : '';
    const quitar = o.tutorial ? '' : `<button type="button" class="pe-qt" data-pe-act="quitar" data-k="${esc(p.key)}">${esc(T('pe.ed.quitar'))}</button>`;
    return `<div class="pe-dt" aria-live="polite">${head}${nota}<ul class="pe-rz">${base}${rz}</ul>${ops}${marca || quitar ? `<div class="pe-acc">${marca}${quitar}</div>` : ''}</div>`;
  }
  // Partes del plan a mano: barra (automático / tu plan), aviso, bandeja de cámaras, detalle y combos
  function editor(list, plan, o) {
    const cams = (plan && Array.isArray(plan.camaras)) ? plan.camaras : [];
    const porPos = {}; list.forEach((p) => { porPos[p.key] = p; });
    const manual = o.modo === 'manual';
    const d = typeof o.delta === 'number' ? o.delta : null;
    const top = o.tutorial ? '' : `<div class="pe-top"><div class="pe-seg" role="group" aria-label="${esc(T('pe.ed.modo'))}">
        <button type="button" data-pe-act="modo" data-k="auto" aria-pressed="${manual ? 'false' : 'true'}">${esc(T('pe.ed.auto'))}</button>
        <button type="button" data-pe-act="modo" data-k="manual" aria-pressed="${manual ? 'true' : 'false'}">${esc(T('pe.ed.manual'))}</button></div>
        ${manual && d !== null ? `<span class="pe-dq ${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${esc(d ? T('pe.ed.delta', { n: (d > 0 ? '+' : '−') + Math.abs(d) }) : T('pe.ed.igual'))}</span>` : ''}</div>`;
    const selC = o.selCam != null ? cams.find((c) => c.equipId === o.selCam) : null;
    const selP = o.selPos ? porPos[o.selPos] : null;
    const tipT = o.tutorial ? T('pe.ed.tutorial') : !cams.length ? T('pe.ed.ninguna')
      : selC ? (o.libre && selC.en ? T('pe.ed.tip_mover', { cam: '«' + selC.nombre + '»' }) : T('pe.ed.tip_cam', { cam: '«' + selC.nombre + '»' }))
      : selP && !selP.asgName ? T('pe.ed.tip_pos', { pos: selP.nombre }) : T('pe.ed.tip');
    const tip = `<p class="pe-tip" aria-live="polite">${esc(tipT)}</p>`;
    const tray = o.tutorial || !cams.length ? '' : `<div class="pe-tray" role="group" aria-label="${esc(T('pe.ed.tray'))}">${cams.map((c) => {
      const en = c.en ? porPos[c.en] : null;
      const on = o.selCam === c.equipId;
      let arte = '';
      try { arte = o.arte ? o.arte(c.tipo) : ''; } catch (e) { arte = ''; }
      const dnd = en ? ((en.raw && en.raw.toma) || en.nombre) : '';
      return `<button type="button" class="pe-cc${en ? ' pe-puesta' : ''}${on ? ' pe-on' : ''}" data-pe-act="cam" data-id="${c.equipId}" aria-pressed="${on ? 'true' : 'false'}">${arte || ico('cam_basic', 26)}
        <span style="min-width:0"><b>${esc(c.nombre)}</b><small><i class="pe-tl" aria-hidden="true"></i><span>${esc(en ? T('pe.ed.en', { n: en.n }) + ' · ' + dnd : T('pe.ed.libre'))}</span></small></span></button>`;
    }).join('')}</div>`;
    const det = selP ? detalle(selP, plan, o) : '';
    const combos = (plan && Array.isArray(plan.combos)) ? plan.combos.filter((cb) => cb.pts) : [];
    const cb = o.tutorial ? '' : `<div><div class="pe-cbt">${esc(T('pe.ed.combos'))}</div><div class="pe-cb">${combos.length ? combos.map((x) => `<span class="${x.pts > 0 ? 'up' : 'dn'}">${esc(TLx(x.texto || x.k))}<b>${x.pts > 0 ? '+' : '−'}${Math.abs(x.pts)}</b></span>`).join('') : `<span>${esc(T('pe.ed.sin_combos'))}</span>`}</div></div>`;
    return { top, tip, tray, det, cb, selC };
  }

  function camaras(plan, tipoEvento, opts) {
    ensureCss(); bindTap();
    try {
      const o = opts || {};
      const t = tipoKey(tipoEvento || (plan && (plan.tipo || plan.type)));
      const v = lugar(t), vr = variante(t, v);
      // Las tomas a mano (fútbol: contracampo VAR, bancos, minicámaras en la red) sin cámara solo se ven al armar el plan
      const list = posList(plan, t).filter((p) => o.editable || !(p.raw && p.raw.aMano && (p.asg == null || p.asg === false || p.asg === '')));
      // Con el id del equipo se usa el nombre que el jugador ve en su bodega (p. ej. "Cámara de Don Ramiro")
      list.forEach((p) => {
        let n = '';
        if (p.asg != null && p.asg !== false && p.asg !== '' && p.eid != null && o.nombreEquipo) { try { n = o.nombreEquipo(p.eid) || ''; } catch (e) { n = ''; } }
        p.asgName = n || camName(p.asg, o);
      });
      placeAll(list, v);
      const u = 'pe' + (++UID).toString(36);
      const editando = !!(o.editable && !o.tutorial);
      // Cámaras libres: la lógica da dónde está cada cámara y el lugar (zonas); entonces se mueven por todo el plano
      const libre = editando && !!o.geo && list.some((p) => p.spot && p.spot.libre);
      const ed = editando ? Object.assign({}, o, { libre }) : null;
      const parts = o.editable ? editor(list, plan, ed || o) : null;
      const cuerpo = libre && parts && parts.selC ? parts.selC.cuerpo : null;
      const cables = o.cables === false || v === 'calle' ? '' : list.map((p) => cable(p, vr)).filter(Boolean).join('');
      const mal = libre && o.malPunto ? (() => { const x = f1(o.malPunto.x * W / 100), y = f1(o.malPunto.y * H / 100); return `<g class="pe-mal"><circle cx="${x}" cy="${y}" r="9"/><path d="M${x - 4.5} ${y - 4.5}L${x + 4.5} ${y + 4.5}M${x + 4.5} ${y - 4.5}L${x - 4.5} ${y + 4.5}"/></g>`; })() : '';
      const svg = `<svg class="pe-dia${libre ? ' pe-libre' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" ${libre ? `role="group" aria-label="${esc(T('pe.ed.mapa'))}"` : `role="img" aria-label="${esc(T('pe.cams'))}"`}>
        ${(BG[v] || bgSalon)(u, vr)}
        ${libre ? zonasSvg(o.geo, cuerpo, u) : ''}
        ${cables ? `<path class="pe-cable" d="${cables}"/>` : ''}${control(vr)}
        ${libre ? `<rect class="pe-mapa" data-pe-act="mapa" x="0" y="0" width="${W}" height="${H}"/>` + list.map((p) => ghost(p, ed)).join('') : ''}
        ${list.map((p) => marker(p, ed)).join('')}${mal}</svg>`;
      // Solo las posiciones obligatorias cuentan para "cubiertas" (las tomas extra son opcionales)
      const reqList = list.filter((p) => !p.opcional);
      const covered = reqList.filter((p) => p.asgName).length;
      const fits = list.filter((p) => p.asgName && p.aj != null);
      const avg = fits.length ? Math.min(100, Math.round(fits.reduce((s, p) => s + p.aj, 0) / fits.length * 100)) : null;
      const evName = (() => { const e = (G().EVENT_TYPES || {})[t]; return (e && TLx(e.name)) || (has('pe.ev.' + t) ? T('pe.ev.' + t) : ''); })();
      const head = o.titulo === false ? '' : `<div class="pe-hd"><span class="pe-ttl">${esc(o.titulo || T('pe.cams'))}</span>
        <span class="pe-sub">${evName ? esc(evName) + ' · ' : ''}<b>${esc(T('pe.cubiertas', { a: covered, t: reqList.length }))}</b>${avg != null ? ' · ' + esc(T('pe.ajuste.medio', { p: avg })) : ''}</span></div>`;
      const ks = new Set(list.map(fitK)); const fs = new Set(list.map((p) => p.spot.f));
      const tape = '<svg width="12" height="12" viewBox="-7 -7 14 14" aria-hidden="true"><path d="M-5 -5L5 5M5 -5L-5 5" stroke="#e8d27a" stroke-width="2.4"/></svg>';
      const hatch = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x=".5" y=".5" width="11" height="11" rx="2" fill="rgba(255,59,59,.15)" stroke="#ff3b3b" stroke-width=".9"/><path d="M0 8L8 0M4 12L12 4" stroke="#ff3b3b" stroke-width="1.3"/></svg>';
      const altoI = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x=".5" y=".5" width="11" height="11" rx="2" fill="rgba(255,176,32,.08)" stroke="#ffb020" stroke-width=".9" stroke-dasharray="1 2"/></svg>';
      const legend = `<div class="pe-leg">${['ok', 'mid', 'bad', 'na', 'off', 'opt'].filter((k) => (k !== 'na' && k !== 'opt') || ks.has(k)).map((k) => `<span>${colorIco(k)}${esc(k === 'opt' ? T('pe.opcional') : T('pe.leg.' + k))}</span>`).join('')}
        <span class="pe-sep"></span>${['fija', 'mano', 'robot', 'aerea'].filter((f) => fs.has(f)).map((f) => `<span>${shapeIco(f)}${esc(T('pe.forma.' + f))}</span>`).join('')}
        ${libre ? `<span class="pe-sep"></span><span>${tape}${esc(T('pe.ley.marca'))}</span>${(o.geo.zonas || []).some((z) => z.t === 'alto') ? `<span>${altoI}${esc(T('pe.ley.alto'))}</span>` : ''}<span>${hatch}${esc(T('pe.ley.bloq'))}</span>` : ''}</div>`;
      const conToma = editando && list.some((p) => p.raw && p.raw.toma);
      const rowsHtml = o.lista === false ? '' : `<div class="pe-cl">${list.map((p) => {
        const k = fitK(p);
        const info = `${T('pe.cam.n', { n: p.n })} · ${p.asgName || vacioTxt(p)}${p.ideal ? ' · ' + T('pe.idealp', { t: p.ideal }) : ''}`;
        // "Ideal: ..." solo si la cámara no es la adecuada; si es la adecuada pero nadie la maneja, se dice eso
        const camMal = p.asgName && p.fit != null ? p.fit < 0.8 : k !== 'ok';
        const extra = p.asgName && p.sinOp && !camMal ? ' · ' + esc(T('pe.sinop')) : p.ideal && camMal ? ' · ' + esc(T('pe.idealp', { t: p.ideal })) : '';
        const fitHtml = p.asgName && p.aj != null ? `${Math.min(100, Math.round(p.aj * 100))}%<u><i style="width:${Math.min(100, Math.round(p.aj * 100))}%"></i></u>` : p.asgName ? '' : '—';
        if (editando) {
          // Plan a mano: la fila es un botón grande; con una cámara elegida dice cuánto cambia la calidad. Con cámaras
          // libres la fila es la toma clave: ✓ si está bien cubierta, ✗ con lo que conviene arreglar
          const pv = o.preview ? o.preview[p.key] : null;
          const r = p.raw || {};
          const op = r.operador ? ' · ' + r.operador.name : '';
          const right = `<span class="pe-fit">${pv ? `<span class="pe-pvl ${pvCls(pv)}">${esc(pvTxt(pv))}</span>` : fitHtml}</span>`;
          if (conToma) {
            const ok = p.opcional && !p.asgName ? null : !!r.ok;
            const pista = r.pistaTexto && !(p.opcional && !p.asgName) ? r.pistaTexto : '';
            const sub = p.asgName ? `${p.asgName + op}${pista ? ' · ' + pista : r.movida ? ' · ' + T('pe.ed.movida') : ''}` : pista || vacioTxt(p);
            return `<button type="button" class="pe-clr pe-k-${k}${o.selPos === p.key ? ' pe-on' : ''}" data-pe-act="pos" data-k="${esc(p.key)}" data-ok="${ok === null ? '' : ok ? '1' : '0'}" aria-pressed="${o.selPos === p.key ? 'true' : 'false'}" aria-label="${esc(`${p.n} · ${r.toma || p.nombre}: ${ok ? T('pe.tk.bien') : pista || vacioTxt(p)}`)}"><b class="pe-n">${p.n}</b>
              <span class="pe-clt"><span class="pe-tkt">${CHECK(ok === null ? undefined : ok)}<em>${esc(r.toma || p.nombre)}${p.opcional ? ` <i class="pe-tkx">${esc(T('pe.tk.extra'))}</i>` : ''}</em></span><small class="${pista && !ok ? 'pe-pista' : ''}">${esc(sub)}</small></span>${right}</button>`;
          }
          return `<button type="button" class="pe-clr pe-k-${k}${o.selPos === p.key ? ' pe-on' : ''}" data-pe-act="pos" data-k="${esc(p.key)}" aria-pressed="${o.selPos === p.key ? 'true' : 'false'}"><b class="pe-n">${p.n}</b>
          <span class="pe-clt"><span>${esc(p.nombre)}</span><small>${esc(p.asgName ? p.asgName + op : vacioTxt(p))}${p.asgName ? extra : ''}</small></span>${right}</button>`;
        }
        return `<div class="pe-clr pe-k-${k}" data-pe-cam="${p.n}" data-pe-info="${esc(info)}"><b class="pe-n">${p.n}</b>
          <div class="pe-clt"><span>${esc(p.nombre)}</span><small>${esc(p.asgName || vacioTxt(p))}${extra}</small></div>
          <span class="pe-fit">${fitHtml}</span></div>`;
      }).join('')}</div>`;
      const nOk = reqList.filter((p) => p.raw && p.raw.ok).length;
      const tk = conToma ? `<div class="pe-tkh"><b>${esc(T('pe.tk.t'))}</b><span class="${nOk < reqList.length ? 'pe-tk-mal' : ''}">${esc(T('pe.tk.n', { a: nOk, t: reqList.length }))}</span></div>` : '';
      const cls = `pe-cams ${esc(o.clase || '')}${editando ? ' pe-ed-on' : ''}${libre && parts.selC ? ' pe-moviendo' : ''}`;
      if (editando) {
        // Plan a mano: arriba el modo y qué hacer; el plano grande; el detalle de lo tocado; las tomas clave; las cámaras
        // Debajo del plano, en una línea: cuántas tomas clave están bien y la primera que conviene arreglar
        const mala = conToma ? reqList.find((p) => p.raw && !p.raw.ok) : null;
        const tkl = conToma ? `<p class="pe-tkl" aria-live="polite">${CHECK(!mala)}<span><b>${esc(T('pe.tk.n', { a: nOk, t: reqList.length }))}</b>${mala ? ` · ${esc((mala.raw.toma || mala.nombre) + ': ' + (mala.raw.pistaTexto || vacioTxt(mala)))}` : ''}</span></p>` : '';
        return `<div class="${cls}" data-pe-lugar="${v}">${head}<div class="pe-box"><div class="pe-ed pe-ed-top">${parts.top}${parts.tip}</div>${svg}${tkl}${parts.det ? `<div class="pe-ed pe-ed-det">${parts.det}</div>` : ''}${parts.tray ? `<div class="pe-ed pe-ed-tray">${parts.tray}</div>` : ''}${tk}${rowsHtml}<div class="pe-ed">${parts.cb}</div>${legend}</div></div>`;
      }
      const edHtml = parts ? `<div class="pe-ed">${parts.top}${parts.tip}${parts.tray}${parts.det}${parts.cb}</div>` : '';
      return `<div class="${cls}" data-pe-lugar="${v}">${head}<div class="pe-box">${svg}${edHtml}${legend}${o.editable ? '' : '<div class="pe-det" aria-live="polite"></div>'}${rowsHtml}</div></div>`;
    } catch (e) { return ''; }
  }

  /* =========================================================
     3. Contrato internacional
     ========================================================= */
  function esInternacional(c) {
    return !!(c && (c.internacional || c.intl || c.international || c.pais || c.country || c.requisitos || /internacional|intl/.test(String(c.type || c.tipo || ''))));
  }
  function internacional(contract, opts) {
    ensureCss();
    try {
      const c = contract;
      if (!esInternacional(c)) return '';
      const o = opts || {};
      const x = c.internacional && typeof c.internacional === 'object' ? Object.assign({}, c, c.internacional) : c.intl && typeof c.intl === 'object' ? Object.assign({}, c, c.intl) : c;
      // País traducido (clave pais.* de la lógica) si se puede
      let pais = x.pais || x.country || x.lugar || x.ciudad || '';
      try { if (c.pais && G().paisNombre) pais = G().paisNombre(c) || pais; } catch (e) { /* español */ }
      const mult = num(x.mult != null ? x.mult : x.payMult != null ? x.payMult : x.pago_multiplicador != null ? x.pago_multiplicador : x.multiplicador);
      const dias = num(x.travelDays != null ? x.travelDays : x.diasViaje != null ? x.diasViaje : x.dias_viaje != null ? x.dias_viaje : x.viaje);
      const gastos = num(x.travelCost != null ? x.travelCost : x.gastosViaje != null ? x.gastosViaje : x.gastos);
      const famaN = num(x.repRisk != null ? x.repRisk : x.famaRiesgo != null ? x.famaRiesgo : x.caidaFama);
      const et = (G().EVENT_TYPES || {})[c.type];
      const nombre = x.nombre || x.titulo || x.name || (et && TLx(et.name)) || (has('pe.ev.' + tipoKey(c.type)) ? T('pe.ev.' + tipoKey(c.type)) : '');
      const reqsSrc = x.requisitos || x.reqs || x.requirements || [];
      const reqs = (Array.isArray(reqsSrc) ? reqsSrc : Object.keys(reqsSrc).map((k) => ({ texto: k, ok: reqsSrc[k] }))).map((r) => {
        if (typeof r === 'string') return { texto: r, ok: undefined };
        if (!r || typeof r !== 'object') return null;
        const ok = r.ok !== undefined ? r.ok : r.cumple !== undefined ? r.cumple : r.met !== undefined ? r.met : r.listo;
        return { texto: r.texto || r.nombre || r.label || r.text || r.name || r.key || '', ok: ok === true || ok === false ? ok : undefined, detalle: r.detalle || r.detail || r.falta || '' };
      }).filter((r) => r && r.texto);
      const okN = reqs.filter((r) => r.ok === true).length, known = reqs.some((r) => r.ok !== undefined);
      const chips = [
        mult != null ? `<span class="pe-chip pe-cg">${ico('money', 14)}<b>${esc(T('pe.intl.pago', { m: String(f1(mult)).replace('.', ',') }))}</b></span>` : '',
        num(c.pay) != null ? `<span class="pe-chip pe-cg">${esc(T('pe.intl.paga', { m: money(c.pay) }))}</span>` : '',
        dias != null && dias > 0 ? `<span class="pe-chip pe-ca">${ico('pe_plane', 14)}${esc(dias === 1 ? T('pe.intl.dia') : T('pe.intl.dias', { n: dias }))}</span>` : '',
        gastos != null && gastos > 0 ? `<span class="pe-chip pe-cr">${ico('pe_bag', 14)}${esc(T('pe.intl.gastos', { m: money(gastos) }))}</span>` : '',
      ].join('');
      const req = reqs.length ? `<div class="pe-rq"><div class="pe-hd"><span class="pe-ttl">${esc(T('pe.intl.req'))}</span>${known ? `<span class="pe-sub"><b>${esc(T('pe.intl.cumples', { a: okN, t: reqs.length }))}</b></span>` : ''}</div>
        <ul>${reqs.map((r) => `<li class="${r.ok === false ? 'pe-li-no' : ''}">${CHECK(r.ok)}<span>${esc(r.texto)}${r.detalle ? `<small>${esc(r.detalle)}</small>` : ''}</span></li>`).join('')}</ul></div>` : '';
      return `<div class="pe-intl pe-box ${esc(o.clase || '')}">
        <div class="pe-ih"><span class="pe-gl">${ico('pe_globe', 24)}</span><div style="min-width:0"><div class="pe-tag">${esc(T('pe.intl'))}${pais ? ' · ' + esc(pais) : ''}</div>
          ${nombre ? `<h3>${esc(nombre)}</h3>` : ''}${c.client ? `<div class="pe-sub">${esc(c.client)}</div>` : ''}</div></div>
        ${chips ? `<div class="pe-chips">${chips}</div>` : ''}
        ${dias != null && dias > 0 ? `<div class="pe-note">${esc(T('pe.intl.bloqueo'))}</div>` : ''}
        ${req}
        <div class="pe-warn">${ico('pe_warn', 14)}<span>${esc(famaN != null ? T('pe.intl.riesgo.n', { n: famaN > 0 ? '-' + famaN : famaN }) : T('pe.intl.riesgo'))}</span></div></div>`;
    } catch (e) { return ''; }
  }

  /* =========================================================
     4. Resumen de riesgos (pantalla de resultado)
     ========================================================= */
  function resumenRiesgo(plan, opts) {
    ensureCss();
    try {
      const o = opts || {};
      const max = o.max || 4;
      const rs = rolesOf(plan).sort((x, y) => (x.estado === y.estado ? x.orden - y.orden : x.estado === 'falta' ? -1 : 1));
      const chips = [];
      rs.forEach((r) => {
        const efecto = has('pe.efecto.' + r.key) ? T('pe.efecto.' + r.key) : (r.riesgoTxt || '').toLowerCase();
        const rol = has('pe.rols.' + r.key) ? T('pe.rols.' + r.key) : r.nombre.toLowerCase();
        const rolp = has('pe.rolp.' + r.key) ? T('pe.rolp.' + r.key) : rol;
        if (r.estado === 'falta') chips.push(['r', r.a === 0 ? T('pe.chip.sin', { rol, efecto }) : T('pe.chip.pocos', { rolp, a: r.a, min: r.min, efecto })]);
        else if (r.estado === 'justo' && o.justo !== false) chips.push(['a', T('pe.chip.justo', { rolp, efecto })]);
      });
      // Posiciones de cámara vacías (si vienen en el mismo plan u opts.camaras)
      const cp = o.camaras || (plan && (plan.positions || plan.posiciones));
      if (cp) {
        const t = tipoKey(o.tipo || (plan && (plan.tipo || plan.type)));
        posList(cp, t).filter((p) => !camName(p.asg, o) && !p.opcional).slice(0, 2).forEach((p) => chips.push(['a', T('pe.chip.cam', { n: p.n, pos: p.nombre })]));
      }
      if (!chips.length) {
        if (!rs.length && !(o.camaras && Array.isArray(o.camaras.combos) && o.camaras.combos.length)) return '';
        if (rs.length) chips.push(['g', T('pe.chip.ok')]);
      }
      // Lo que el cliente notó del plan de cámaras: el mejor combo y la peor falla (con sus puntos de calidad)
      const cbs = o.camaras && Array.isArray(o.camaras.combos) ? o.camaras.combos.filter((x) => x && x.pts) : [];
      const mejor = cbs.filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts)[0];
      const peor = cbs.filter((x) => x.pts < 0).sort((a, b) => a.pts - b.pts)[0];
      const pts = (n) => (n > 0 ? '+' : '−') + Math.abs(n);
      if (mejor) chips.unshift(['g', T('pe.ed.cliente.bien', { t: TLx(mejor.texto || mejor.k) }) + ' ' + pts(mejor.pts)]);
      if (peor) chips.splice(mejor ? 1 : 0, 0, ['r', T('pe.ed.cliente.mal', { t: TLx(peor.texto || peor.k) }) + ' ' + pts(peor.pts)]);
      const shown = chips.slice(0, max + (mejor ? 1 : 0) + (peor ? 1 : 0));
      const extra = chips.length - shown.length;
      const icon = { r: 'pe_warn', a: 'pe_warn', g: 'check' };
      return `<div class="pe-risk ${esc(o.clase || '')}">${shown.map((c) => `<span class="pe-rc pe-c${c[0]}">${ico(icon[c[0]], 14)}<span>${esc(c[1])}</span></span>`).join('')}${extra > 0 ? `<span class="pe-rc pe-cm"><span>${esc(T('pe.chip.mas', { n: extra }))}</span></span>` : ''}</div>`;
    } catch (e) { return ''; }
  }

  const API = { personal, camaras, internacional, resumenRiesgo, posiciones, lugar, esInternacional, T, ES, CSS, ensureCss, ROLES: ROLE, SPOTS };
  root.PlanEvento = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  ensureCss();
})(typeof window !== 'undefined' ? window : globalThis);
