/* =========================================================
   EN VIVO Tycoon — Impulsos: Equipo de obra extra, Fondo de crecimiento y Tarjeta semanal
   Contrato: server/MONETIZACION.md · conexión: server/INTEGRAR_MONETIZACION2.md · servidor: server/src/Impulsos.php
   Todo con contenido FIJO y a la vista (nada al azar), con el precio REAL del canal (ctx.precio: Google Play en la app,
   Pago Plux en la web) y nada de cuentas regresivas inventadas: solo fechas que manda el servidor.
   API: GET /api/impulsos · POST /api/impulsos/alquilar {confirmar_precio} · POST /api/impulsos/fondo {nivel?} ·
        POST /api/impulsos/tarjeta
   Uso desde ui.js (Tienda v2): Impulsos.seccionTienda(ctxModulo(), { log, lista }) → { id, ico, t, html } | null
   Uso desde sede.js (ventana de la sede oficial): Impulsos.avisoCola(sd) → botón discreto "¿Segundo equipo de obra?"
     solo cuando todos los equipos están ocupados y todavía no tiene el extra.
   Inicio: se agrega a window.EnVivoInicio (orden 36): tarjeta solo cuando hay algo para reclamar (tarjeta semanal de hoy,
     premios del fondo). Sus botones llevan data-ext="impulsos" data-acc="…".
   Textos: ES aquí mismo + TRAD[código] (I18N.idioma); lo que falte sale en español.
   ========================================================= */
(function (root) {
  'use strict';

  const ID = 'impulsos';
  const ES = {
    sec: 'Crecer más rápido', nav: 'Crecer', cargando: 'Cargando…', error: 'No se pudo completar. Intenta otra vez.', cerrar: 'Cerrar',
    eq_t: 'Equipo de obra extra', eq_sub: 'Sede oficial · para siempre',
    eq_i1: '+1 equipo de obra en tu Sede oficial, para siempre',
    eq_i2: 'Es tu segundo equipo; si ya tienes dos (nivel 5 o VIP 4), es el tercero. Máximo 3',
    eq_i3: 'Gratis: alquílalo 2 días con dinero del juego, una vez por semana',
    eq_tienes: 'Tienes {n} de {m} equipos de obra', eq_ya: 'Ya es tuyo para siempre',
    alq_btn: 'Alquilar 2 días · {m}', alq_activo: 'Equipo extra trabajando hasta el {f}', alq_premio: 'Equipo extra de premio hasta el {f}',
    alq_espera: 'Lo puedes alquilar otra vez el {f}', alq_q: '¿Alquilar un equipo de obra extra por 2 días? Cuesta {m} del dinero del juego (tienes {t}).',
    alq_si: 'Alquilar', alq_ok: 'Equipo extra contratado por 2 días', alq_falta: 'Te falta dinero del juego: necesitas {m}', alq_cuenta: 'Con tu cuenta puedes alquilarlo gratis con dinero del juego',
    fo_t: 'Fondo de crecimiento', fo_sub: 'Una sola vez · se reclama al subir de nivel tu sede oficial',
    fo_total: 'En total: {n} créditos, {c} materiales y {x} chips 4K', fo_tarde: 'Si ya pasaste algún nivel, lo reclamas al momento',
    fo_nivel: 'Nivel {n}', fo_reclamar: 'Reclamar', fo_reclamado: 'Reclamado', fo_bloq: 'Nivel {n}', fo_todo: 'Reclamar todo ({n})',
    fo_ok: 'Recibiste {n} créditos y materiales para tu sede', fo_mats: '{c} materiales', fo_chips: 'chips 4K ×{n}',
    ts_t: 'Tarjeta semanal', ts_sub: '7 días · no se renueva sola',
    ts_i1: '{n} créditos cada día ({t} en {d} días)', ts_i2: 'Cada día, para tu sede oficial: {mats}', ts_i3: 'Si compras otra, se suman 7 días',
    ts_activa: 'Activa: quedan {n} días', ts_reclamar: 'Reclamar hoy · {n} créditos', ts_ya: 'Ya reclamaste hoy. Vuelve mañana',
    ts_ok: 'Recibiste {n} créditos y materiales', comprar_mas: 'Sumar 7 días',
    cola2: '¿Segundo equipo de obra?', cola3: '¿Tercer equipo de obra?', cola_t: 'Tus equipos de obra están ocupados',
    cola_det: 'Con un equipo extra puedes empezar otra obra ahora mismo.',
    ini_t: 'Para reclamar', ini_fondo: 'Fondo de crecimiento: {n} premios listos',
    'mat.cables': 'Cables y conectores', 'mat.placas': 'Placas electrónicas', 'mat.paneles': 'Paneles LED', 'mat.credenciales': 'Credenciales de prensa', 'mat.planos': 'Planos técnicos', 'mat.chips': 'Chips de video 4K',
    'err.equipo_ya_tienes': 'Ya tienes el equipo de obra extra para siempre.', 'err.equipo_alquilado': 'Ya tienes un equipo de obra extra trabajando.',
    'err.equipo_espera': 'El equipo extra se puede alquilar una vez por semana.', 'err.confirmar_precio': 'Confirma el precio del alquiler.',
    'err.precio_cambio': 'El precio cambió. Revísalo y confirma otra vez.', 'err.fondo_requerido': 'Primero compra el Fondo de crecimiento.',
    'err.fondo_nivel_bajo': 'Tu sede oficial todavía no llega a ese nivel.', 'err.fondo_ya': 'Ya reclamaste ese premio.',
    'err.fondo_nada': 'No tienes premios del fondo por reclamar todavía.', 'err.hito_invalido': 'Ese nivel no tiene premio en el fondo.',
    'err.tarjeta_semanal_requerida': 'No tienes la Tarjeta semanal activa.', 'err.ya_reclamado': 'Ya reclamaste lo de hoy. Vuelve mañana.',
  };
  const TRAD = {
    en: {
      sec: 'Grow faster', nav: 'Grow', cargando: 'Loading…', error: 'Could not complete. Try again.', cerrar: 'Close',
      eq_t: 'Extra build crew', eq_sub: 'Official HQ · forever',
      eq_i1: '+1 build crew in your Official HQ, forever', eq_i2: 'It is your second crew; if you already have two (level 5 or VIP 4), it is the third. Max 3',
      eq_i3: 'Free: rent it for 2 days with in-game money, once a week',
      eq_tienes: 'You have {n} of {m} build crews', eq_ya: 'Yours forever',
      alq_btn: 'Rent 2 days · {m}', alq_activo: 'Extra crew working until {f}', alq_premio: 'Reward crew until {f}',
      alq_espera: 'You can rent it again on {f}', alq_q: 'Rent an extra build crew for 2 days? It costs {m} of in-game money (you have {t}).',
      alq_si: 'Rent', alq_ok: 'Extra crew hired for 2 days', alq_falta: 'Not enough in-game money: you need {m}', alq_cuenta: 'With your account you can rent it for free with in-game money',
      fo_t: 'Growth Fund', fo_sub: 'One time only · claim it as your Official HQ levels up',
      fo_total: 'In total: {n} credits, {c} materials and {x} 4K chips', fo_tarde: 'Levels you already passed can be claimed right away',
      fo_nivel: 'Level {n}', fo_reclamar: 'Claim', fo_reclamado: 'Claimed', fo_bloq: 'Level {n}', fo_todo: 'Claim all ({n})',
      fo_ok: 'You got {n} credits and materials for your HQ', fo_mats: '{c} materials', fo_chips: '4K chips ×{n}',
      ts_t: 'Weekly Card', ts_sub: '7 days · does not renew by itself',
      ts_i1: '{n} credits every day ({t} over {d} days)', ts_i2: 'Every day, for your Official HQ: {mats}', ts_i3: 'Buy another and 7 days are added',
      ts_activa: 'Active: {n} days left', ts_reclamar: 'Claim today · {n} credits', ts_ya: 'Already claimed today. Come back tomorrow',
      ts_ok: 'You got {n} credits and materials', comprar_mas: 'Add 7 days',
      cola2: 'Second build crew?', cola3: 'Third build crew?', cola_t: 'All your build crews are busy', cola_det: 'With an extra crew you can start another build right now.',
      ini_t: 'Ready to claim', ini_fondo: 'Growth Fund: {n} rewards ready',
      'mat.cables': 'Cables & connectors', 'mat.placas': 'Circuit boards', 'mat.paneles': 'LED panels', 'mat.credenciales': 'Press passes', 'mat.planos': 'Blueprints', 'mat.chips': '4K video chips',
      'err.equipo_ya_tienes': 'You already own the extra build crew.', 'err.equipo_alquilado': 'An extra build crew is already working for you.',
      'err.equipo_espera': 'The extra crew can be rented once a week.', 'err.confirmar_precio': 'Confirm the rental price.',
      'err.precio_cambio': 'The price changed. Check it and confirm again.', 'err.fondo_requerido': 'Buy the Growth Fund first.',
      'err.fondo_nivel_bajo': 'Your Official HQ has not reached that level yet.', 'err.fondo_ya': 'You already claimed that reward.',
      'err.fondo_nada': 'No Growth Fund rewards to claim yet.', 'err.hito_invalido': 'That level has no Growth Fund reward.',
      'err.tarjeta_semanal_requerida': 'Your Weekly Card is not active.', 'err.ya_reclamado': 'Already claimed today. Come back tomorrow.',
    },
    'pt-BR': {
      sec: 'Cresça mais rápido', nav: 'Crescer', cargando: 'Carregando…', error: 'Não foi possível concluir. Tente de novo.', cerrar: 'Fechar',
      eq_t: 'Equipe de obra extra', eq_sub: 'Sede oficial · para sempre',
      eq_i1: '+1 equipe de obra na sua Sede oficial, para sempre', eq_i2: 'É sua segunda equipe; se você já tem duas (nível 5 ou VIP 4), é a terceira. Máximo 3',
      eq_i3: 'Grátis: alugue por 2 dias com dinheiro do jogo, uma vez por semana',
      eq_tienes: 'Você tem {n} de {m} equipes de obra', eq_ya: 'Já é sua para sempre',
      alq_btn: 'Alugar 2 dias · {m}', alq_activo: 'Equipe extra trabalhando até {f}', alq_premio: 'Equipe de prêmio até {f}',
      alq_espera: 'Você pode alugar de novo em {f}', alq_q: 'Alugar uma equipe de obra extra por 2 dias? Custa {m} do dinheiro do jogo (você tem {t}).',
      alq_si: 'Alugar', alq_ok: 'Equipe extra contratada por 2 dias', alq_falta: 'Falta dinheiro do jogo: você precisa de {m}', alq_cuenta: 'Com sua conta você pode alugar grátis com dinheiro do jogo',
      fo_t: 'Fundo de crescimento', fo_sub: 'Uma única vez · resgate ao subir o nível da sua sede oficial',
      fo_total: 'No total: {n} créditos, {c} materiais e {x} chips 4K', fo_tarde: 'Os níveis que você já passou são resgatados na hora',
      fo_nivel: 'Nível {n}', fo_reclamar: 'Resgatar', fo_reclamado: 'Resgatado', fo_bloq: 'Nível {n}', fo_todo: 'Resgatar tudo ({n})',
      fo_ok: 'Você recebeu {n} créditos e materiais para sua sede', fo_mats: '{c} materiais', fo_chips: '{n} chips',
      ts_t: 'Cartão semanal', ts_sub: '7 dias · não renova sozinho',
      ts_i1: '{n} créditos por dia ({t} em {d} dias)', ts_i2: 'Todo dia, para sua sede oficial: {mats}', ts_i3: 'Se comprar outro, somam-se 7 dias',
      ts_activa: 'Ativo: faltam {n} dias', ts_reclamar: 'Resgatar hoje · {n} créditos', ts_ya: 'Você já resgatou hoje. Volte amanhã',
      ts_ok: 'Você recebeu {n} créditos e materiais', comprar_mas: 'Somar 7 dias',
      cola2: 'Segunda equipe de obra?', cola3: 'Terceira equipe de obra?', cola_t: 'Suas equipes de obra estão ocupadas', cola_det: 'Com uma equipe extra você começa outra obra agora mesmo.',
      ini_t: 'Para resgatar', ini_fondo: 'Fundo de crescimento: {n} prêmios prontos',
      'mat.cables': 'Cabos e conectores', 'mat.placas': 'Placas eletrônicas', 'mat.paneles': 'Painéis de LED', 'mat.credenciales': 'Credenciais de imprensa', 'mat.planos': 'Plantas técnicas', 'mat.chips': 'Chips de vídeo 4K',
      'err.equipo_ya_tienes': 'Você já tem a equipe de obra extra para sempre.', 'err.equipo_alquilado': 'Você já tem uma equipe extra trabalhando.',
      'err.equipo_espera': 'A equipe extra pode ser alugada uma vez por semana.', 'err.confirmar_precio': 'Confirme o preço do aluguel.',
      'err.precio_cambio': 'O preço mudou. Confira e confirme de novo.', 'err.fondo_requerido': 'Primeiro compre o Fundo de crescimento.',
      'err.fondo_nivel_bajo': 'Sua sede oficial ainda não chegou a esse nível.', 'err.fondo_ya': 'Você já resgatou esse prêmio.',
      'err.fondo_nada': 'Ainda não há prêmios do fundo para resgatar.', 'err.hito_invalido': 'Esse nível não tem prêmio no fundo.',
      'err.tarjeta_semanal_requerida': 'Seu Cartão semanal não está ativo.', 'err.ya_reclamado': 'Você já resgatou hoje. Volte amanhã.',
    },
    fr: {
      sec: 'Grandir plus vite', nav: 'Grandir', cargando: 'Chargement…', error: 'Impossible de terminer. Réessaie.', cerrar: 'Fermer',
      eq_t: 'Équipe de chantier en plus', eq_sub: 'Siège officiel · pour toujours',
      eq_i1: '+1 équipe de chantier dans ton Siège officiel, pour toujours', eq_i2: 'C’est ta deuxième équipe ; si tu en as déjà deux (niveau 5 ou VIP 4), c’est la troisième. 3 maximum',
      eq_i3: 'Gratuit : loue-la 2 jours avec l’argent du jeu, une fois par semaine',
      eq_tienes: 'Tu as {n} équipes de chantier sur {m}', eq_ya: 'À toi pour toujours',
      alq_btn: 'Louer 2 jours · {m}', alq_activo: 'Équipe en plus au travail jusqu’au {f}', alq_premio: 'Équipe de récompense jusqu’au {f}',
      alq_espera: 'Tu pourras la relouer le {f}', alq_q: 'Louer une équipe de chantier en plus pour 2 jours ? Cela coûte {m} d’argent du jeu (tu as {t}).',
      alq_si: 'Louer', alq_ok: 'Équipe en plus engagée pour 2 jours', alq_falta: 'Pas assez d’argent du jeu : il faut {m}', alq_cuenta: 'Avec ton compte, tu peux la louer gratuitement avec l’argent du jeu',
      fo_t: 'Fonds de croissance', fo_sub: 'Une seule fois · à réclamer quand ton siège officiel monte de niveau',
      fo_total: 'Au total : {n} crédits, {c} matériaux et {x} puces 4K', fo_tarde: 'Les niveaux déjà atteints se réclament tout de suite',
      fo_nivel: 'Niveau {n}', fo_reclamar: 'Réclamer', fo_reclamado: 'Réclamé', fo_bloq: 'Niveau {n}', fo_todo: 'Tout réclamer ({n})',
      fo_ok: 'Tu as reçu {n} crédits et des matériaux pour ton siège', fo_mats: '{c} matériaux', fo_chips: '{n} puces',
      ts_t: 'Carte hebdomadaire', ts_sub: '7 jours · sans renouvellement automatique',
      ts_i1: '{n} crédits chaque jour ({t} en {d} jours)', ts_i2: 'Chaque jour, pour ton siège officiel : {mats}', ts_i3: 'Si tu en achètes une autre, 7 jours s’ajoutent',
      ts_activa: 'Active : encore {n} jours', ts_reclamar: 'Réclamer aujourd’hui · {n} crédits', ts_ya: 'Déjà réclamé aujourd’hui. Reviens demain',
      ts_ok: 'Tu as reçu {n} crédits et des matériaux', comprar_mas: 'Ajouter 7 jours',
      cola2: 'Une deuxième équipe de chantier ?', cola3: 'Une troisième équipe de chantier ?', cola_t: 'Toutes tes équipes de chantier sont occupées', cola_det: 'Avec une équipe en plus, tu lances un autre chantier tout de suite.',
      ini_t: 'À réclamer', ini_fondo: 'Fonds de croissance : {n} récompenses prêtes',
      'mat.cables': 'Câbles et connecteurs', 'mat.placas': 'Cartes électroniques', 'mat.paneles': 'Panneaux LED', 'mat.credenciales': 'Accréditations presse', 'mat.planos': 'Plans techniques', 'mat.chips': 'Puces vidéo 4K',
      'err.equipo_ya_tienes': 'Tu as déjà l’équipe de chantier en plus pour toujours.', 'err.equipo_alquilado': 'Une équipe en plus travaille déjà pour toi.',
      'err.equipo_espera': 'L’équipe en plus se loue une fois par semaine.', 'err.confirmar_precio': 'Confirme le prix de la location.',
      'err.precio_cambio': 'Le prix a changé. Vérifie et confirme à nouveau.', 'err.fondo_requerido': 'Achète d’abord le Fonds de croissance.',
      'err.fondo_nivel_bajo': 'Ton siège officiel n’a pas encore ce niveau.', 'err.fondo_ya': 'Tu as déjà réclamé cette récompense.',
      'err.fondo_nada': 'Aucune récompense du fonds à réclamer pour l’instant.', 'err.hito_invalido': 'Ce niveau n’a pas de récompense dans le fonds.',
      'err.tarjeta_semanal_requerida': 'Ta Carte hebdomadaire n’est pas active.', 'err.ya_reclamado': 'Déjà réclamé aujourd’hui. Reviens demain.',
    },
    de: {
      sec: 'Schneller wachsen', nav: 'Wachsen', cargando: 'Lädt…', error: 'Konnte nicht abgeschlossen werden. Versuch es erneut.', cerrar: 'Schließen',
      eq_t: 'Zusätzlicher Bautrupp', eq_sub: 'Offizieller Sitz · für immer',
      eq_i1: '+1 Bautrupp in deinem offiziellen Sitz, für immer', eq_i2: 'Das ist dein zweiter Trupp; hast du schon zwei (Stufe 5 oder VIP 4), der dritte. Maximal 3',
      eq_i3: 'Gratis: 2 Tage mit Spielgeld mieten, einmal pro Woche',
      eq_tienes: 'Du hast {n} von {m} Bautrupps', eq_ya: 'Gehört dir für immer',
      alq_btn: '2 Tage mieten · {m}', alq_activo: 'Zusatztrupp arbeitet bis {f}', alq_premio: 'Belohnungstrupp bis {f}',
      alq_espera: 'Du kannst ihn am {f} wieder mieten', alq_q: 'Einen zusätzlichen Bautrupp für 2 Tage mieten? Kostet {m} Spielgeld (du hast {t}).',
      alq_si: 'Mieten', alq_ok: 'Zusatztrupp für 2 Tage angeheuert', alq_falta: 'Zu wenig Spielgeld: du brauchst {m}', alq_cuenta: 'Mit deinem Konto kannst du ihn gratis mit Spielgeld mieten',
      fo_t: 'Wachstumsfonds', fo_sub: 'Nur einmal · einlösen, wenn dein offizieller Sitz aufsteigt',
      fo_total: 'Insgesamt: {n} Credits, {c} Materialien und {x} 4K-Chips', fo_tarde: 'Bereits erreichte Stufen löst du sofort ein',
      fo_nivel: 'Stufe {n}', fo_reclamar: 'Einlösen', fo_reclamado: 'Eingelöst', fo_bloq: 'Stufe {n}', fo_todo: 'Alles einlösen ({n})',
      fo_ok: 'Du hast {n} Credits und Materialien für deinen Sitz erhalten', fo_mats: '{c} Materialien', fo_chips: '{n} Chips',
      ts_t: 'Wochenkarte', ts_sub: '7 Tage · verlängert sich nicht automatisch',
      ts_i1: '{n} Credits jeden Tag ({t} in {d} Tagen)', ts_i2: 'Jeden Tag für deinen offiziellen Sitz: {mats}', ts_i3: 'Kaufst du noch eine, kommen 7 Tage dazu',
      ts_activa: 'Aktiv: noch {n} Tage', ts_reclamar: 'Heute einlösen · {n} Credits', ts_ya: 'Heute schon eingelöst. Komm morgen wieder',
      ts_ok: 'Du hast {n} Credits und Materialien erhalten', comprar_mas: '7 Tage dazu',
      cola2: 'Zweiter Bautrupp?', cola3: 'Dritter Bautrupp?', cola_t: 'Alle deine Bautrupps sind beschäftigt', cola_det: 'Mit einem Zusatztrupp startest du sofort einen weiteren Bau.',
      ini_t: 'Zum Einlösen', ini_fondo: 'Wachstumsfonds: {n} Belohnungen bereit',
      'mat.cables': 'Kabel & Stecker', 'mat.placas': 'Platinen', 'mat.paneles': 'LED-Panels', 'mat.credenciales': 'Presseausweise', 'mat.planos': 'Baupläne', 'mat.chips': '4K-Videochips',
      'err.equipo_ya_tienes': 'Du hast den Zusatztrupp bereits für immer.', 'err.equipo_alquilado': 'Ein Zusatztrupp arbeitet bereits für dich.',
      'err.equipo_espera': 'Den Zusatztrupp kannst du einmal pro Woche mieten.', 'err.confirmar_precio': 'Bestätige den Mietpreis.',
      'err.precio_cambio': 'Der Preis hat sich geändert. Prüfe ihn und bestätige erneut.', 'err.fondo_requerido': 'Kauf zuerst den Wachstumsfonds.',
      'err.fondo_nivel_bajo': 'Dein offizieller Sitz hat diese Stufe noch nicht erreicht.', 'err.fondo_ya': 'Diese Belohnung hast du schon eingelöst.',
      'err.fondo_nada': 'Noch keine Fondsbelohnungen zum Einlösen.', 'err.hito_invalido': 'Für diese Stufe gibt es keine Fondsbelohnung.',
      'err.tarjeta_semanal_requerida': 'Deine Wochenkarte ist nicht aktiv.', 'err.ya_reclamado': 'Heute schon eingelöst. Komm morgen wieder.',
    },
    it: {
      sec: 'Cresci più in fretta', nav: 'Crescere', cargando: 'Caricamento…', error: 'Impossibile completare. Riprova.', cerrar: 'Chiudi',
      eq_t: 'Squadra di cantiere extra', eq_sub: 'Sede ufficiale · per sempre',
      eq_i1: '+1 squadra di cantiere nella tua Sede ufficiale, per sempre', eq_i2: 'È la tua seconda squadra; se ne hai già due (livello 5 o VIP 4), è la terza. Massimo 3',
      eq_i3: 'Gratis: noleggiala per 2 giorni con i soldi del gioco, una volta a settimana',
      eq_tienes: 'Hai {n} squadre di cantiere su {m}', eq_ya: 'Tua per sempre',
      alq_btn: 'Noleggia 2 giorni · {m}', alq_activo: 'Squadra extra al lavoro fino al {f}', alq_premio: 'Squadra premio fino al {f}',
      alq_espera: 'Potrai noleggiarla di nuovo il {f}', alq_q: 'Noleggiare una squadra di cantiere extra per 2 giorni? Costa {m} di soldi del gioco (hai {t}).',
      alq_si: 'Noleggia', alq_ok: 'Squadra extra ingaggiata per 2 giorni', alq_falta: 'Soldi del gioco insufficienti: servono {m}', alq_cuenta: 'Con il tuo account puoi noleggiarla gratis con i soldi del gioco',
      fo_t: 'Fondo di crescita', fo_sub: 'Una sola volta · si riscatta quando la sede ufficiale sale di livello',
      fo_total: 'In totale: {n} crediti, {c} materiali e {x} chip 4K', fo_tarde: 'I livelli già raggiunti si riscattano subito',
      fo_nivel: 'Livello {n}', fo_reclamar: 'Riscatta', fo_reclamado: 'Riscattato', fo_bloq: 'Livello {n}', fo_todo: 'Riscatta tutto ({n})',
      fo_ok: 'Hai ricevuto {n} crediti e materiali per la tua sede', fo_mats: '{c} materiali', fo_chips: '{n} chip',
      ts_t: 'Carta settimanale', ts_sub: '7 giorni · non si rinnova da sola',
      ts_i1: '{n} crediti ogni giorno ({t} in {d} giorni)', ts_i2: 'Ogni giorno, per la tua sede ufficiale: {mats}', ts_i3: 'Se ne compri un’altra, si aggiungono 7 giorni',
      ts_activa: 'Attiva: mancano {n} giorni', ts_reclamar: 'Riscatta oggi · {n} crediti', ts_ya: 'Già riscattato oggi. Torna domani',
      ts_ok: 'Hai ricevuto {n} crediti e materiali', comprar_mas: 'Aggiungi 7 giorni',
      cola2: 'Una seconda squadra di cantiere?', cola3: 'Una terza squadra di cantiere?', cola_t: 'Tutte le tue squadre di cantiere sono occupate', cola_det: 'Con una squadra extra avvii subito un altro cantiere.',
      ini_t: 'Da riscattare', ini_fondo: 'Fondo di crescita: {n} premi pronti',
      'mat.cables': 'Cavi e connettori', 'mat.placas': 'Schede elettroniche', 'mat.paneles': 'Pannelli LED', 'mat.credenciales': 'Accrediti stampa', 'mat.planos': 'Progetti tecnici', 'mat.chips': 'Chip video 4K',
      'err.equipo_ya_tienes': 'Hai già la squadra di cantiere extra per sempre.', 'err.equipo_alquilado': 'Hai già una squadra extra al lavoro.',
      'err.equipo_espera': 'La squadra extra si noleggia una volta a settimana.', 'err.confirmar_precio': 'Conferma il prezzo del noleggio.',
      'err.precio_cambio': 'Il prezzo è cambiato. Controllalo e conferma di nuovo.', 'err.fondo_requerido': 'Prima compra il Fondo di crescita.',
      'err.fondo_nivel_bajo': 'La tua sede ufficiale non ha ancora quel livello.', 'err.fondo_ya': 'Hai già riscattato quel premio.',
      'err.fondo_nada': 'Ancora nessun premio del fondo da riscattare.', 'err.hito_invalido': 'Quel livello non ha premi nel fondo.',
      'err.tarjeta_semanal_requerida': 'La tua Carta settimanale non è attiva.', 'err.ya_reclamado': 'Già riscattato oggi. Torna domani.',
    },
    ru: {
      sec: 'Расти быстрее', nav: 'Рост', cargando: 'Загрузка…', error: 'Не удалось выполнить. Попробуй ещё раз.', cerrar: 'Закрыть',
      eq_t: 'Дополнительная бригада', eq_sub: 'Официальная база · навсегда',
      eq_i1: '+1 строительная бригада на твоей официальной базе, навсегда', eq_i2: 'Это твоя вторая бригада; если уже есть две (уровень 5 или VIP 4) — третья. Максимум 3',
      eq_i3: 'Бесплатно: арендуй на 2 дня за игровые деньги, раз в неделю',
      eq_tienes: 'У тебя {n} из {m} бригад', eq_ya: 'Твоя навсегда',
      alq_btn: 'Аренда на 2 дня · {m}', alq_activo: 'Доп. бригада работает до {f}', alq_premio: 'Бригада-награда до {f}',
      alq_espera: 'Снова арендовать можно {f}', alq_q: 'Арендовать дополнительную бригаду на 2 дня? Стоит {m} игровых денег (у тебя {t}).',
      alq_si: 'Арендовать', alq_ok: 'Доп. бригада нанята на 2 дня', alq_falta: 'Не хватает игровых денег: нужно {m}', alq_cuenta: 'С аккаунтом её можно арендовать бесплатно за игровые деньги',
      fo_t: 'Фонд роста', fo_sub: 'Один раз · награды по уровням официальной базы',
      fo_total: 'Всего: {n} кредитов, {c} материалов и {x} чипов 4K', fo_tarde: 'Уже пройденные уровни забираешь сразу',
      fo_nivel: 'Уровень {n}', fo_reclamar: 'Забрать', fo_reclamado: 'Получено', fo_bloq: 'Уровень {n}', fo_todo: 'Забрать всё ({n})',
      fo_ok: 'Ты получил {n} кредитов и материалы для базы', fo_mats: '{c} материалов', fo_chips: '{n} чипов',
      ts_t: 'Недельная карта', ts_sub: '7 дней · без автопродления',
      ts_i1: '{n} кредитов каждый день ({t} за {d} дней)', ts_i2: 'Каждый день для официальной базы: {mats}', ts_i3: 'Купишь ещё одну — добавится 7 дней',
      ts_activa: 'Активна: осталось {n} дн.', ts_reclamar: 'Забрать сегодня · {n} кредитов', ts_ya: 'Сегодня уже получено. Возвращайся завтра',
      ts_ok: 'Ты получил {n} кредитов и материалы', comprar_mas: 'Добавить 7 дней',
      cola2: 'Вторая бригада?', cola3: 'Третья бригада?', cola_t: 'Все твои бригады заняты', cola_det: 'С доп. бригадой можно начать ещё одну стройку прямо сейчас.',
      ini_t: 'Можно забрать', ini_fondo: 'Фонд роста: готово наград — {n}',
      'mat.cables': 'Кабели и разъёмы', 'mat.placas': 'Платы', 'mat.paneles': 'LED-панели', 'mat.credenciales': 'Пресс-аккредитации', 'mat.planos': 'Чертежи', 'mat.chips': 'Видеочипы 4K',
      'err.equipo_ya_tienes': 'Дополнительная бригада уже твоя навсегда.', 'err.equipo_alquilado': 'Дополнительная бригада уже работает.',
      'err.equipo_espera': 'Доп. бригаду можно арендовать раз в неделю.', 'err.confirmar_precio': 'Подтверди цену аренды.',
      'err.precio_cambio': 'Цена изменилась. Проверь и подтверди снова.', 'err.fondo_requerido': 'Сначала купи Фонд роста.',
      'err.fondo_nivel_bajo': 'Официальная база ещё не достигла этого уровня.', 'err.fondo_ya': 'Эта награда уже получена.',
      'err.fondo_nada': 'Пока нет наград фонда.', 'err.hito_invalido': 'Для этого уровня нет награды фонда.',
      'err.tarjeta_semanal_requerida': 'Недельная карта не активна.', 'err.ya_reclamado': 'Сегодня уже получено. Возвращайся завтра.',
    },
    tr: {
      sec: 'Daha hızlı büyü', nav: 'Büyü', cargando: 'Yükleniyor…', error: 'Tamamlanamadı. Tekrar dene.', cerrar: 'Kapat',
      eq_t: 'Ek inşaat ekibi', eq_sub: 'Resmi merkez · kalıcı',
      eq_i1: 'Resmi merkezinde +1 inşaat ekibi, kalıcı olarak', eq_i2: 'İkinci ekibin olur; zaten iki ekibin varsa (seviye 5 veya VIP 4) üçüncüsü. En fazla 3',
      eq_i3: 'Ücretsiz: haftada bir, oyun parasıyla 2 günlüğüne kirala',
      eq_tienes: '{m} ekipten {n} tanesi sende', eq_ya: 'Artık kalıcı olarak senin',
      alq_btn: '2 gün kirala · {m}', alq_activo: 'Ek ekip {f} tarihine kadar çalışıyor', alq_premio: 'Ödül ekibi {f} tarihine kadar',
      alq_espera: '{f} tarihinde yeniden kiralayabilirsin', alq_q: '2 günlüğüne ek inşaat ekibi kiralansın mı? Oyun parasıyla {m} tutar ({t} paran var).',
      alq_si: 'Kirala', alq_ok: 'Ek ekip 2 günlüğüne işe alındı', alq_falta: 'Oyun paran yetmiyor: {m} gerekli', alq_cuenta: 'Hesabınla oyun parası ödeyerek ücretsiz kiralayabilirsin',
      fo_t: 'Büyüme Fonu', fo_sub: 'Tek seferlik · resmi merkezin seviye atladıkça alınır',
      fo_total: 'Toplam: {n} kredi, {c} malzeme ve {x} 4K çip', fo_tarde: 'Geçtiğin seviyelerin ödülünü hemen alırsın',
      fo_nivel: 'Seviye {n}', fo_reclamar: 'Al', fo_reclamado: 'Alındı', fo_bloq: 'Seviye {n}', fo_todo: 'Hepsini al ({n})',
      fo_ok: 'Merkezin için {n} kredi ve malzeme aldın', fo_mats: '{c} malzeme', fo_chips: '{n} çip',
      ts_t: 'Haftalık Kart', ts_sub: '7 gün · kendiliğinden yenilenmez',
      ts_i1: 'Her gün {n} kredi ({d} günde {t})', ts_i2: 'Her gün resmi merkezin için: {mats}', ts_i3: 'Bir tane daha alırsan 7 gün eklenir',
      ts_activa: 'Aktif: {n} gün kaldı', ts_reclamar: 'Bugün al · {n} kredi', ts_ya: 'Bugünkünü aldın. Yarın gel',
      ts_ok: '{n} kredi ve malzeme aldın', comprar_mas: '7 gün ekle',
      cola2: 'İkinci inşaat ekibi?', cola3: 'Üçüncü inşaat ekibi?', cola_t: 'Tüm inşaat ekiplerin meşgul', cola_det: 'Ek bir ekiple hemen başka bir inşaata başlarsın.',
      ini_t: 'Alınacaklar', ini_fondo: 'Büyüme Fonu: {n} ödül hazır',
      'mat.cables': 'Kablo ve konnektör', 'mat.placas': 'Elektronik kart', 'mat.paneles': 'LED panel', 'mat.credenciales': 'Basın kartı', 'mat.planos': 'Teknik çizim', 'mat.chips': '4K video çipi',
      'err.equipo_ya_tienes': 'Ek inşaat ekibi zaten kalıcı olarak senin.', 'err.equipo_alquilado': 'Zaten çalışan bir ek ekibin var.',
      'err.equipo_espera': 'Ek ekip haftada bir kiralanabilir.', 'err.confirmar_precio': 'Kira fiyatını onayla.',
      'err.precio_cambio': 'Fiyat değişti. Kontrol edip tekrar onayla.', 'err.fondo_requerido': 'Önce Büyüme Fonu’nu satın al.',
      'err.fondo_nivel_bajo': 'Resmi merkezin henüz o seviyede değil.', 'err.fondo_ya': 'Bu ödülü zaten aldın.',
      'err.fondo_nada': 'Henüz alınacak fon ödülü yok.', 'err.hito_invalido': 'Bu seviyenin fon ödülü yok.',
      'err.tarjeta_semanal_requerida': 'Haftalık Kartın aktif değil.', 'err.ya_reclamado': 'Bugünkünü aldın. Yarın gel.',
    },
    id: {
      sec: 'Tumbuh lebih cepat', nav: 'Tumbuh', cargando: 'Memuat…', error: 'Tidak bisa diselesaikan. Coba lagi.', cerrar: 'Tutup',
      eq_t: 'Tim bangunan tambahan', eq_sub: 'Markas resmi · selamanya',
      eq_i1: '+1 tim bangunan di Markas resmimu, selamanya', eq_i2: 'Ini tim keduamu; kalau sudah punya dua (level 5 atau VIP 4), ini yang ketiga. Maksimal 3',
      eq_i3: 'Gratis: sewa 2 hari dengan uang game, seminggu sekali',
      eq_tienes: 'Kamu punya {n} dari {m} tim bangunan', eq_ya: 'Milikmu selamanya',
      alq_btn: 'Sewa 2 hari · {m}', alq_activo: 'Tim tambahan bekerja sampai {f}', alq_premio: 'Tim hadiah sampai {f}',
      alq_espera: 'Bisa disewa lagi pada {f}', alq_q: 'Sewa tim bangunan tambahan selama 2 hari? Biayanya {m} uang game (kamu punya {t}).',
      alq_si: 'Sewa', alq_ok: 'Tim tambahan disewa selama 2 hari', alq_falta: 'Uang game kurang: perlu {m}', alq_cuenta: 'Dengan akunmu kamu bisa menyewanya gratis pakai uang game',
      fo_t: 'Dana Pertumbuhan', fo_sub: 'Sekali saja · diklaim saat Markas resmimu naik level',
      fo_total: 'Total: {n} kredit, {c} bahan dan {x} chip 4K', fo_tarde: 'Level yang sudah lewat bisa langsung diklaim',
      fo_nivel: 'Level {n}', fo_reclamar: 'Klaim', fo_reclamado: 'Diklaim', fo_bloq: 'Level {n}', fo_todo: 'Klaim semua ({n})',
      fo_ok: 'Kamu dapat {n} kredit dan bahan untuk markasmu', fo_mats: '{c} bahan', fo_chips: '{n} chip',
      ts_t: 'Kartu Mingguan', ts_sub: '7 hari · tidak diperpanjang otomatis',
      ts_i1: '{n} kredit setiap hari ({t} dalam {d} hari)', ts_i2: 'Setiap hari, untuk Markas resmimu: {mats}', ts_i3: 'Beli lagi, tambah 7 hari',
      ts_activa: 'Aktif: sisa {n} hari', ts_reclamar: 'Klaim hari ini · {n} kredit', ts_ya: 'Sudah diklaim hari ini. Kembali besok',
      ts_ok: 'Kamu dapat {n} kredit dan bahan', comprar_mas: 'Tambah 7 hari',
      cola2: 'Tim bangunan kedua?', cola3: 'Tim bangunan ketiga?', cola_t: 'Semua tim bangunanmu sedang sibuk', cola_det: 'Dengan tim tambahan kamu bisa mulai bangunan lain sekarang juga.',
      ini_t: 'Siap diklaim', ini_fondo: 'Dana Pertumbuhan: {n} hadiah siap',
      'mat.cables': 'Kabel & konektor', 'mat.placas': 'Papan sirkuit', 'mat.paneles': 'Panel LED', 'mat.credenciales': 'Kartu pers', 'mat.planos': 'Cetak biru', 'mat.chips': 'Chip video 4K',
      'err.equipo_ya_tienes': 'Kamu sudah punya tim bangunan tambahan selamanya.', 'err.equipo_alquilado': 'Tim tambahan sudah bekerja untukmu.',
      'err.equipo_espera': 'Tim tambahan bisa disewa seminggu sekali.', 'err.confirmar_precio': 'Konfirmasi harga sewa.',
      'err.precio_cambio': 'Harganya berubah. Periksa lalu konfirmasi lagi.', 'err.fondo_requerido': 'Beli Dana Pertumbuhan dulu.',
      'err.fondo_nivel_bajo': 'Markas resmimu belum sampai level itu.', 'err.fondo_ya': 'Hadiah itu sudah kamu klaim.',
      'err.fondo_nada': 'Belum ada hadiah dana untuk diklaim.', 'err.hito_invalido': 'Level itu tidak punya hadiah dana.',
      'err.tarjeta_semanal_requerida': 'Kartu Mingguanmu tidak aktif.', 'err.ya_reclamado': 'Sudah diklaim hari ini. Kembali besok.',
    },
    'zh-CN': {
      sec: '加速成长', nav: '成长', cargando: '加载中…', error: '未能完成，请重试。', cerrar: '关闭',
      eq_t: '额外施工队', eq_sub: '官方总部 · 永久',
      eq_i1: '官方总部永久 +1 支施工队', eq_i2: '这是你的第二支施工队；如果已有两支（5 级或 VIP 4），就是第三支。最多 3 支',
      eq_i3: '免费：每周一次，用游戏币租用 2 天',
      eq_tienes: '你有 {n}/{m} 支施工队', eq_ya: '已永久拥有',
      alq_btn: '租用 2 天 · {m}', alq_activo: '额外施工队工作到 {f}', alq_premio: '奖励施工队到 {f}',
      alq_espera: '{f} 可再次租用', alq_q: '租用一支额外施工队 2 天？需要 {m} 游戏币（你有 {t}）。',
      alq_si: '租用', alq_ok: '已雇用额外施工队 2 天', alq_falta: '游戏币不足：需要 {m}', alq_cuenta: '登录账号后可用游戏币免费租用',
      fo_t: '成长基金', fo_sub: '仅限一次 · 官方总部升级时领取',
      fo_total: '合计：{n} 积分、{c} 份材料和 {x} 个 4K 芯片', fo_tarde: '已达到的等级可立即领取',
      fo_nivel: '{n} 级', fo_reclamar: '领取', fo_reclamado: '已领取', fo_bloq: '{n} 级', fo_todo: '全部领取（{n}）',
      fo_ok: '你获得了 {n} 积分和总部材料', fo_mats: '{c} 份材料', fo_chips: '{n} 个芯片',
      ts_t: '周卡', ts_sub: '7 天 · 不会自动续费',
      ts_i1: '每天 {n} 积分（{d} 天共 {t}）', ts_i2: '每天为官方总部提供：{mats}', ts_i3: '再买一张可增加 7 天',
      ts_activa: '生效中：还剩 {n} 天', ts_reclamar: '今日领取 · {n} 积分', ts_ya: '今天已领取，明天再来',
      ts_ok: '你获得了 {n} 积分和材料', comprar_mas: '增加 7 天',
      cola2: '要第二支施工队吗？', cola3: '要第三支施工队吗？', cola_t: '你的施工队都在忙', cola_det: '有了额外施工队，现在就能开始另一项工程。',
      ini_t: '可领取', ini_fondo: '成长基金：{n} 份奖励可领取',
      'mat.cables': '线缆和接头', 'mat.placas': '电路板', 'mat.paneles': 'LED 面板', 'mat.credenciales': '记者证', 'mat.planos': '技术图纸', 'mat.chips': '4K 视频芯片',
      'err.equipo_ya_tienes': '你已永久拥有额外施工队。', 'err.equipo_alquilado': '已有一支额外施工队在工作。',
      'err.equipo_espera': '额外施工队每周只能租用一次。', 'err.confirmar_precio': '请确认租金。',
      'err.precio_cambio': '价格已变化，请查看后再次确认。', 'err.fondo_requerido': '请先购买成长基金。',
      'err.fondo_nivel_bajo': '你的官方总部还没达到这个等级。', 'err.fondo_ya': '你已领取过这份奖励。',
      'err.fondo_nada': '暂时没有可领取的基金奖励。', 'err.hito_invalido': '这个等级没有基金奖励。',
      'err.tarjeta_semanal_requerida': '你的周卡未生效。', 'err.ya_reclamado': '今天已领取，明天再来。',
    },
  };

  const MATS = ['cables', 'placas', 'paneles', 'credenciales', 'planos', 'chips'];
  const st = { datos: null, cargando: null, pedidoEn: 0, noDisponible: false, ocupado: false };

  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { return 'es'; } };
  const locale = () => { try { return (root.I18N && root.I18N.locale) || (idioma() === 'es' ? 'es-EC' : idioma()); } catch (e) { return 'es-EC'; } };
  function T(k, p) {
    const d = TRAD[idioma()] || {};
    const s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : Object.prototype.hasOwnProperty.call(ES, k) ? ES[k] : k;
    return String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  }
  const tiene = (k) => Object.prototype.hasOwnProperty.call(TRAD[idioma()] || {}, k) || Object.prototype.hasOwnProperty.call(ES, k);
  const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => { try { return Number(n || 0).toLocaleString(locale()); } catch (e) { return String(Number(n || 0)); } };
  const fecha = (iso) => { try { return new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(iso || '').slice(0, 16).replace('T', ' '); } };
  const dinero = (ctx, n) => { try { if (ctx && typeof ctx.M === 'function') return ctx.M(n); } catch (e) { /* abajo */ } return '$' + num(n); };
  const matNombre = (ctx, m) => { try { if (ctx && ctx.T) { const v = ctx.T('tienda.mat.' + m); if (v && v !== 'tienda.mat.' + m) return v; } } catch (e) { /* abajo */ } return T('mat.' + m); };
  const logueado = (ctx) => { try { const A = (ctx && ctx.Api) || root.Api; return !!(A && A.estado && A.estado.logueado); } catch (e) { return false; } };

  // Íconos propios (trazo, heredan el color)
  const svg = (p) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICO_EQUIPO = svg('<path d="M3.5 17a8.5 8.5 0 0 1 17 0"/><path d="M2.5 17h19v2.5h-19z"/><path d="M10 8.7V5.5h4v3.2"/><path d="M8 12v5M16 12v5"/>');
  const ICO_FONDO = svg('<path d="M4 19.5h16"/><path d="M6.5 16v-3M11 16v-6M15.5 16V8"/><path d="M5 9.5l5-4 3.5 2.5L19 4"/><path d="M15.5 4H19v3.5"/>');
  const ICO_TARJETA = svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8 13.5h2M12 13.5h2M16 13.5h.5M8 16.5h2M12 16.5h2"/>');
  const ICO_SEC = svg('<path d="M12 20V9"/><path d="M8 13l4-4 4 4"/><path d="M5 20h14"/><path d="M12 4.5a3 3 0 0 1 3 3"/>');
  const ICO_OK = svg('<path d="M5 12.5l4.5 4.5L19 7"/>');
  const ICO_LOCK = svg('<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>');

  function ponerCss() {
    try {
      if (!root.document || root.document.getElementById('imp-css')) return;
      const s = root.document.createElement('style');
      s.id = 'imp-css';
      s.textContent = `
  .imp-card .tv-badge.t-green{color:var(--green);background:linear-gradient(160deg,#2ecc7126,#2ecc7108);border-color:#2ecc7155}
  .imp-card .tv-badge.t-blue{color:#5aa9ff;background:linear-gradient(160deg,#5aa9ff26,#5aa9ff08);border-color:#5aa9ff55}
  .imp-estado{margin-top:10px;padding:8px 10px;border-radius:10px;background:#ffffff0a;border:1px solid #ffffff14;font-size:13px;line-height:1.35;display:flex;gap:8px;align-items:center;min-width:0}
  .imp-estado .ico{width:15px;height:15px;flex:none;color:var(--green)}
  .imp-estado span{min-width:0;flex:1;overflow-wrap:anywhere}
  .imp-acc{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .imp-acc .btn{flex:1 1 auto;min-width:0}
  .imp-tabla{display:grid;gap:6px;margin-top:10px}
  .imp-hito{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:#ffffff08;border:1px solid #ffffff12;min-width:0}
  .imp-hito.ok{border-color:#2ecc7150;background:#2ecc710d}
  .imp-hito.listo{border-color:var(--amber);background:#ffb0200f}
  .imp-hito .lv{font-family:var(--f-head);font-size:14px;min-width:58px}
  .imp-hito .pr{font-size:12.5px;line-height:1.3;min-width:0;overflow-wrap:anywhere}
  .imp-hito .pr b{font-size:13.5px}
  .imp-hito .pr .sg{white-space:nowrap}
  .imp-hito{padding:6px 10px}
  .imp-hito .ico{width:16px;height:16px}
  .imp-hito .est{display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap}
  .imp-hito .btn.sm{padding:6px 10px;font-size:12.5px}
  .imp-cola{margin-top:10px;padding:10px 12px;border-radius:12px;border:1px dashed #ffb02066;background:#ffb0200a;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .imp-cola .grow{min-width:0;flex:1 1 160px}
  .imp-cola .ico{width:22px;height:22px;color:var(--amber);flex:none}
  .imp-ini .imp-acc .btn{flex:1 1 140px}`;
      (root.document.head || root.document.documentElement).appendChild(s);
    } catch (e) { /* sin documento */ }
  }

  // ------------------------------------------------------------------ servidor
  async function pedir(ctx, metodo, ruta, cuerpo) {
    if (ctx && typeof ctx.pedir === 'function') return ctx.pedir(metodo, ruta, cuerpo);
    const r = await fetch(ruta, { method: metodo, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) { const x = new Error((j && j.error) || T('error')); x.status = r.status; x.codigo = j && j.codigo; x.datos = j || {}; throw x; }
    return j;
  }
  function recibir(j) { if (j && j.equipo && j.fondo && j.tarjeta) st.datos = j; return st.datos; }
  /** Pide /api/impulsos (como mucho una vez por minuto si no se fuerza) y vuelve a pintar. */
  function recargar(ctx, forzar) {
    if (st.noDisponible || !logueado(ctx)) return Promise.resolve(null);
    if (st.cargando) return st.cargando;
    if (!forzar && Date.now() - st.pedidoEn < 60000) return Promise.resolve(st.datos);
    st.pedidoEn = Date.now();
    st.cargando = pedir(ctx, 'GET', '/api/impulsos').then(recibir).catch((e) => {
      if (e && (e.status === 404 || e.codigo === 'no_existe')) st.noDisponible = true;
      return null;
    }).then((d) => { st.cargando = null; try { if (ctx && ctx.render) ctx.render(); } catch (e) { /* nada */ } return d; });
    return st.cargando;
  }
  function textoError(e) {
    const c = e && e.codigo;
    if (c && tiene('err.' + c)) return T('err.' + c);
    return (e && e.message) || T('error');
  }

  // ------------------------------------------------------------------ piezas
  const prodLista = (lista, id) => (Array.isArray(lista) ? lista.find((p) => p && p.id === id) : null) || null;
  function precioDe(ctx, lista, id) {
    const p = prodLista(lista, id) || (st.datos && st.datos.productos && st.datos.productos[id]) || null;
    if (!p || p.activo === false) return null;
    try { return ctx && typeof ctx.precio === 'function' ? ctx.precio(id, p.precio) : null; } catch (e) { return null; }
  }
  const T_UI = (ctx, k, def) => { try { const v = ctx && ctx.T ? ctx.T(k) : null; return v && v !== k ? v : def; } catch (e) { return def; } };
  function pie(ctx, id, valor, hecho, etiqueta) {
    if (!valor) return '';
    return `<div class="tv-foot"><span class="price" data-precio="${esc(id)}">${esc(valor)}</span>
      <button class="btn sm main" data-act="comprar" data-k="${esc(id)}" ${hecho ? 'disabled' : ''}>${esc(hecho ? T_UI(ctx, 'tienda.ya_tienes', 'Ya lo tienes') : etiqueta || T_UI(ctx, 'tienda.comprar', 'Comprar'))}</button></div>`;
  }
  const lista = (items) => `<ul class="tv-inc">${items.map((x) => `<li${x.cls ? ` class="${x.cls}"` : ''}>${ICO_OK}<span>${x.html}</span></li>`).join('')}</ul>`;
  const totalesFondo = (hitos) => {
    let c = 0, x = 0, cr = 0;
    (hitos || []).forEach((h) => { cr += Number(h.creditos) || 0; Object.keys(h.mat || {}).forEach((m) => { if (m === 'chips') x += h.mat[m]; else c += h.mat[m]; }); });
    return { cr, c, x };
  };
  // Tabla fija (igual a Impulsos::HITOS) para mostrar el contenido aunque todavía no haya llegado /api/impulsos
  const HITOS = [[5, 500, 10, 1], [8, 700, 16, 1], [10, 800, 20, 2], [12, 900, 24, 2], [15, 1000, 30, 3], [18, 1200, 36, 3], [20, 1300, 40, 4], [25, 1500, 50, 5], [30, 2100, 60, 6]]
    .map(([nivel, creditos, c, x]) => ({ nivel, creditos, mat: { cables: c, placas: c, paneles: c, credenciales: c, planos: c, chips: x }, alcanzado: false, reclamado: false }));

  function cardEquipo(ctx, lst, enModal) {
    const d = st.datos, eq = d && d.equipo, a = eq && eq.alquiler;
    const valor = precioDe(ctx, lst, 'equipo_obra_2');
    const perm = !!(eq && eq.permanente);
    if (!valor && !perm && !(a && (a.puede || a.activo))) return '';
    let estado = '';
    if (d) estado = `<div class="imp-estado">${ICO_EQUIPO}<span>${esc(T('eq_tienes', { n: d.obreros, m: d.obreros_max || 3 }))}${perm ? ' · ' + esc(T('eq_ya')) : ''}</span></div>`;
    let acc = '';
    if (!perm) {
      if (a && a.activo) acc = `<div class="imp-estado">${ICO_OK}<span>${esc(T(a.origen === 'premio' ? 'alq_premio' : 'alq_activo', { f: fecha(a.hasta) }))}</span></div>`;
      else if (a && a.espera_hasta) acc = `<div class="imp-estado">${ICO_LOCK}<span>${esc(T('alq_espera', { f: fecha(a.espera_hasta) }))}</span></div>`;
      else if (a && a.puede) acc = `<div class="imp-acc"><button class="btn" data-ext="${ID}" data-acc="alquilar" data-precio="${Number(a.precio) || 0}">${esc(T('alq_btn', { m: dinero(ctx, a.precio) }))}</button></div>`;
      else if (!logueado(ctx)) acc = `<p class="small muted tv-nota">${esc(T('alq_cuenta'))}</p>`;
    }
    return `<div class="card tv-prod imp-card" data-prod="equipo_obra_2"${enModal ? ' style="margin-top:10px"' : ''}>
      <div class="tv-head"><div class="tv-badge">${ICO_EQUIPO}<b>+1</b></div><div class="grow"><h3>${esc(T('eq_t'))}</h3><div class="small muted">${esc(T('eq_sub'))}</div></div></div>
      ${lista([{ html: esc(T('eq_i1')) }, { html: esc(T('eq_i2')) }, { html: esc(T('eq_i3')), cls: 'amber' }])}
      ${estado}${acc}${pie(ctx, 'equipo_obra_2', valor, perm)}</div>`;
  }

  function cardFondo(ctx, lst) {
    const d = st.datos, f = d && d.fondo;
    const valor = precioDe(ctx, lst, 'fondo_crecimiento');
    const comprado = !!(f && f.comprado);
    if (!valor && !comprado) return '';
    const hitos = (f && Array.isArray(f.hitos) && f.hitos.length) ? f.hitos : HITOS;
    const tot = totalesFondo(hitos);
    const filas = hitos.map((h) => {
      const mats = Object.keys(h.mat || {}).filter((m) => m !== 'chips').reduce((s, m) => s + (Number(h.mat[m]) || 0), 0);
      const listo = comprado && h.alcanzado && !h.reclamado;
      const est = h.reclamado ? `<span class="est" style="color:var(--green)">${ICO_OK}${esc(T('fo_reclamado'))}</span>`
        : listo ? `<button class="btn sm main" data-ext="${ID}" data-acc="fondo" data-nivel="${h.nivel}">${esc(T('fo_reclamar'))}</button>`
        : h.alcanzado ? `<span class="est" style="color:var(--green)">${ICO_OK}</span>` : `<span class="est muted">${ICO_LOCK}</span>`;
      return `<div class="imp-hito${h.reclamado ? ' ok' : listo ? ' listo' : ''}" data-hito="${h.nivel}"><span class="lv">${esc(T('fo_nivel', { n: h.nivel }))}</span>
        <span class="pr"><span class="sg"><b class="num">${esc(num(h.creditos))}</b> 💎</span> · <span class="sg">${esc(T('fo_mats', { c: num(mats) }))}</span>${h.mat && h.mat.chips ? ' · <span class="sg">' + esc(T('fo_chips', { n: num(h.mat.chips) })) + '</span>' : ''}</span>${est}</div>`;
    }).join('');
    const por = comprado ? Number(f.por_reclamar) || 0 : 0;
    return `<div class="card tv-prod imp-card" data-prod="fondo_crecimiento"><span class="ribbon">${esc(T_UI(ctx, 'tienda.oferta_unica', 'Una sola vez'))}</span>
      <div class="tv-head"><div class="tv-badge t-green">${ICO_FONDO}</div><div class="grow"><h3>${esc(T('fo_t'))}</h3><div class="small muted">${esc(T('fo_sub'))}</div></div></div>
      ${lista([{ html: esc(T('fo_total', { n: num(tot.cr), c: num(tot.c), x: num(tot.x) })) }, { html: esc(T('fo_tarde')) }])}
      <div class="imp-tabla" role="list">${filas}</div>
      ${por > 1 ? `<div class="imp-acc"><button class="btn main" data-ext="${ID}" data-acc="fondo_todo">${esc(T('fo_todo', { n: por }))}</button></div>` : ''}
      ${pie(ctx, 'fondo_crecimiento', valor, comprado)}</div>`;
  }

  function matsTxt(ctx, mats) { return Object.keys(mats || {}).filter((m) => mats[m]).map((m) => `${num(mats[m])} ${matNombre(ctx, m)}`).join(', '); }
  function cardTarjeta(ctx, lst) {
    const d = st.datos, t = d && d.tarjeta;
    const valor = precioDe(ctx, lst, 'tarjeta_semanal');
    const activa = !!(t && t.activa);
    if (!valor && !activa) return '';
    const cd = (t && t.creditos_dia) || 15, dias = (t && t.dias) || 7;
    const mats = (t && t.mat_dia) || { cables: 3, placas: 3, paneles: 3, credenciales: 3, planos: 3 };
    let est = '';
    if (activa) {
      est = `<div class="imp-estado">${ICO_OK}<span>${esc(T('ts_activa', { n: t.dias_restantes }))}</span></div>
        <div class="imp-acc">${t.reclamada_hoy ? `<button class="btn" disabled>${esc(T('ts_ya'))}</button>`
          : `<button class="btn main" data-ext="${ID}" data-acc="tarjeta">${esc(T('ts_reclamar', { n: num(cd) }))}</button>`}</div>`;
    }
    return `<div class="card tv-prod imp-card" data-prod="tarjeta_semanal">
      <div class="tv-head"><div class="tv-badge t-blue">${ICO_TARJETA}<b>7</b></div><div class="grow"><h3>${esc(T('ts_t'))}</h3><div class="small muted">${esc(T('ts_sub'))}</div></div></div>
      ${lista([{ html: esc(T('ts_i1', { n: num(cd), t: num(cd * dias), d: dias })) }, { html: esc(T('ts_i2', { mats: matsTxt(ctx, mats) })) }, { html: esc(T('ts_i3')) }])}
      ${est}${pie(ctx, 'tarjeta_semanal', valor, false, activa ? T('comprar_mas') : '')}</div>`;
  }

  // ------------------------------------------------------------------ API para ui.js y sede.js
  /** Sección de la Tienda v2: { id, ico, t, html } o null si no hay nada que mostrar. */
  function seccionTienda(ctx, o) {
    o = o || {};
    ponerCss();
    if (st.noDisponible) return null;
    if (o.log && !st.datos) recargar(ctx);
    const lst = o.lista || [];
    const html = cardEquipo(ctx, lst) + cardFondo(ctx, lst) + cardTarjeta(ctx, lst);
    return html ? { id: 'tv-crecer', ico: ICO_SEC, t: T('sec'), html } : null;
  }

  /** Botón discreto junto a la cola de obras de la sede oficial: solo si todos los equipos están ocupados y cabe uno más. */
  function avisoCola(sd) {
    try {
      ponerCss();
      if (!sd || sd.max || st.noDisponible || !Array.isArray(sd.obras)) return '';
      const n = Number(sd.obreros) || 1;
      if (n >= 3 || sd.obras.length < n) return '';
      const eq = st.datos && st.datos.equipo;
      if (eq && (eq.permanente || (eq.alquiler && eq.alquiler.activo))) return '';
      if (!st.datos) recargar(null);
      return `<div class="imp-cola" data-imp="cola">${ICO_EQUIPO}<div class="grow"><b class="small">${esc(T('cola_t'))}</b><div class="small muted">${esc(T('cola_det'))}</div></div>
        <button class="btn sm" data-ext="${ID}" data-acc="cola">${esc(T(n >= 2 ? 'cola3' : 'cola2'))}</button></div>`;
    } catch (e) { return ''; }
  }

  /** Tarjeta de Inicio: solo cuando hay algo para reclamar (nada de anuncios). */
  function tarjeta(ctx) {
    ponerCss();
    if (st.noDisponible || !logueado(ctx)) return '';
    if (!st.datos) { recargar(ctx); return ''; }
    const t = st.datos.tarjeta, f = st.datos.fondo;
    const btns = [];
    if (t && t.activa && !t.reclamada_hoy) btns.push(`<button class="btn main" data-ext="${ID}" data-acc="tarjeta">${ICO_TARJETA} ${esc(T('ts_reclamar', { n: num(t.creditos_dia) }))}</button>`);
    if (f && f.comprado && f.por_reclamar > 0) btns.push(`<button class="btn" data-ext="${ID}" data-acc="fondo_todo">${ICO_FONDO} ${esc(T('ini_fondo', { n: f.por_reclamar }))}</button>`);
    if (!btns.length) return '';
    return `<div class="card imp-ini" data-imp="inicio"><div class="small muted">${esc(T('ini_t'))}</div><div class="imp-acc">${btns.join('')}</div></div>`;
  }

  function trasCambio(ctx, j) {
    recibir(j);
    try { if (root.Sede && root.Sede.oficial && root.Sede.oficial.cargar) root.Sede.oficial.cargar(ctx, true); } catch (e) { /* sin sede */ }
    try { if (ctx && typeof ctx.sincronizar === 'function') ctx.sincronizar(); else if (ctx && ctx.render) ctx.render(); } catch (e) { /* nada */ }
  }
  function aviso(ctx, txt, sonido) {
    try { if (ctx && ctx.toast) ctx.toast(txt); } catch (e) { /* nada */ }
    try { if (sonido && ctx && ctx.snd && ctx.snd.play) ctx.snd.play(sonido); } catch (e) { /* nada */ }
  }
  async function hacer(ctx, fn) {
    if (st.ocupado) return;
    st.ocupado = true;
    try { await fn(); } catch (e) {
      if (e && e.datos && e.datos.equipo) recibir(e.datos);
      aviso(ctx, textoError(e), 'error');
      if (e && ['precio_cambio', 'equipo_espera', 'equipo_alquilado', 'equipo_ya_tienes'].includes(e.codigo)) recargar(ctx, true);
    } finally { st.ocupado = false; }
  }

  function alquilar(ctx, precio) {
    const S = ctx && typeof ctx.estado === 'function' ? ctx.estado() : (ctx && typeof ctx.S === 'function' ? ctx.S() : null);
    const tiene$ = S && typeof S.money === 'number' ? S.money : 0;
    if (tiene$ < precio) { aviso(ctx, T('alq_falta', { m: dinero(ctx, precio) }), 'error'); return; }
    const si = () => hacer(ctx, async () => {
      const j = await pedir(ctx, 'POST', '/api/impulsos/alquilar', { confirmar_precio: precio });
      const p = Number(j.precio) || precio;
      const S2 = ctx && typeof ctx.estado === 'function' ? ctx.estado() : S;
      if (S2) { S2.money -= p; try { (ctx.guardar || ctx.save || (() => {}))(); } catch (e) { /* nada */ } }
      try { if (ctx.closeModal) ctx.closeModal(); } catch (e) { /* nada */ }
      aviso(ctx, T('alq_ok'), 'buy');
      trasCambio(ctx, j);
    });
    if (ctx && typeof ctx.ask === 'function') ctx.ask(esc(T('alq_q', { m: dinero(ctx, precio), t: dinero(ctx, tiene$) })), esc(T('alq_si')), si);
    else si();
  }

  function abrirEquipo(ctx) {
    if (!ctx || typeof ctx.openModal !== 'function') return;
    const lst = (() => { try { return ((ctx.Api || root.Api).estado.tienda.productos) || []; } catch (e) { return []; } })();
    const card = cardEquipo(ctx, lst, true) || `<p class="small muted">${esc(T('cargando'))}</p>`;
    ctx.openModal(`<div class="imp-modal"><div class="row between"><h2 style="margin:0">${esc(T('eq_t'))}</h2>
      <button class="btn sm" data-act="close" aria-label="${esc(T('cerrar'))}">✕</button></div>${card}</div>`);
    if (!st.datos) recargar(ctx, true).then(() => { try { if (root.document.querySelector('#modal .imp-modal')) abrirEquipo(ctx); } catch (e) { /* nada */ } });
  }

  function clic(ctx, acc, el) {
    switch (acc) {
      case 'cola': case 'equipo': abrirEquipo(ctx); break;
      case 'alquilar': {
        const p = Number(el && el.dataset && el.dataset.precio) || (st.datos && st.datos.equipo.alquiler.precio) || 0;
        if (p > 0) alquilar(ctx, p);
        break;
      }
      case 'fondo': case 'fondo_todo': {
        const nivel = acc === 'fondo' && el && el.dataset ? Number(el.dataset.nivel) : null;
        hacer(ctx, async () => {
          const j = await pedir(ctx, 'POST', '/api/impulsos/fondo', nivel ? { nivel } : {});
          aviso(ctx, T('fo_ok', { n: num(j.recibido && j.recibido.creditos) }), 'chapter');
          trasCambio(ctx, j);
        });
        break;
      }
      case 'tarjeta':
        hacer(ctx, async () => {
          const j = await pedir(ctx, 'POST', '/api/impulsos/tarjeta', {});
          aviso(ctx, T('ts_ok', { n: num(j.recibido && j.recibido.creditos) }), 'chapter');
          trasCambio(ctx, j);
        });
        break;
      default: break;
    }
  }

  function invalidar() { st.datos = null; st.pedidoEn = 0; }

  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: 36, tarjeta, clic });
  ponerCss();
  root.Impulsos = { seccionTienda, avisoCola, tarjeta, clic, recargar, invalidar, abrirEquipo, T, TRAD, ES, HITOS,
    get datos() { return st.datos; }, _st: st };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Impulsos;
})(typeof window !== 'undefined' ? window : globalThis);
