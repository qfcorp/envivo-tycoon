/* =========================================================
   EN VIVO Tycoon — Edad del servidor: calendario de desbloqueos y días temáticos de la Copa (pantalla)
   Contrato: server/INTEGRAR_EDAD_SERVIDOR.md.
     /api/estado.edad_servidor { servidor_id, dia, edad_dias, veterano, ahora, desbloqueos:[{clave, dia, nombre, detalle, icono,
         modo, abierto, abre, faltan_dias, mensaje}], proximos:[...] }   (si no viene, se pide /api/servidor/calendario)
     GET /api/servidor/calendario → { servidor:{id, nombre, dia, edad_dias, veterano}, desbloqueos, proximos, ahora,
         copa_semana:[{n, clave, nombre, cuenta, fecha, hoy, pasado}], recurrentes:[{clave, cada}] }
     POST a un modo cerrado → 403 { codigo:'edad_servidor', desbloqueo, dia, faltan_dias, abre } (el servidor manda).
   Qué hace:
     - Botón "Calendario del servidor" en la tarjeta "Tu servidor" de Inicio (js/servidores.js llama EdadServidor.boton()).
     - Pantalla (ventana) con lo que se abre cada día del servidor, cuenta regresiva y la semana temática de la Copa.
     - En la pestaña "En línea" pone candado a las fichas de los modos que el servidor todavía no abre ("Se abre el día 7
       del servidor (en 3 días)") y, al tocarlas, explica en vez de entrar. Lo mismo con window.EnVivoAbrirOnline(k).
     - EdadServidor.tarjetaTema(datosCopa) → tarjeta "Hoy en la preparación" + semana temática (la usa js/copas.js).
   Textos: ES + TRAD[código] aquí mismo (10 idiomas), elegido por I18N.idioma (respaldo: español).
   API para pruebas: window.EdadServidor = { boton, bloqueo, abrir, tarjetaTema, decorar, recargar, T, ES, TRAD, datos }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'edad_servidor';

  const ES = {
    titulo: 'Calendario del servidor', boton: 'Calendario del servidor', dia: 'Día {n}', dia_corto: 'Día', dia_servidor: 'Día {n} del servidor',
    veterano: 'Tu servidor ya es veterano: todo está abierto.', abierto: 'Abierto', cerrado: 'Día {n}',
    se_abre: 'Se abre el día {d} del servidor ({c}).', en_dias: 'en {n} días', manana: 'mañana',
    cuenta: 'Se abre en', proximo: 'Lo próximo: {n}', todo_abierto: 'Ya está todo abierto en tu servidor.',
    linea_t: 'Lo que se abre con los días', linea_det: 'Los servidores nuevos abren sus modos poco a poco: así todos arrancan parejos y nadie se queda atrás.',
    recurrentes_t: 'Siempre', 'rec.liga': 'Liga Semanal: cada semana.', 'rec.desafio': 'Desafío del Día: todos los días.',
    'rec.festival': 'Mega Festival: cada 2 días.', 'rec.copa': 'Copa de Servidores: preparación de lunes a viernes, batalla el sábado.',
    cerrado_t: '{n} todavía no se abre', cerrado_txt: 'Se abre el día {d} del servidor ({c}).',
    cerrado_extra: 'Tu servidor tiene {n} días. Mientras tanto, mejora tu productora: todo lo que ganes te sirve allí.',
    ver_calendario: 'Ver calendario', entendido: 'Entendido', cerrar: 'Cerrar', cargando: 'Cargando el calendario…', error: 'No se pudo cargar el calendario.',
    'd.apertura': 'Apertura del servidor', 'd.apertura_det': 'Tu productora, la Liga Semanal, el Desafío del Día, el Mercado, el chat, las asociaciones y la sede.',
    'd.duelos': 'Duelo de Productoras', 'd.duelos_det': 'Reta a otras productoras de tu servidor con tu mejor equipo y sube de liga.',
    'd.festival': 'Mega Festival', 'd.festival_det': 'Tu asociación produce junta un festival gigante con 6 escenarios, cada 2 días.',
    'd.copa': 'Copa de Servidores', 'd.copa_det': 'Tu servidor contra los demás servidores del universo: preparación de lunes a viernes y batalla el sábado.',
    'tema.construccion': 'Día de construcción', 'tema.construccion_det': 'Las obras de tu sede oficial que terminan hoy dan puntos dobles. Los eventos de copa suman normal.',
    'tema.personal': 'Día de personal', 'tema.personal_det': 'Eventos de copa con el personal ideal completo (cada puesto cubierto): ×1,5.',
    'tema.equipos': 'Día de equipos', 'tema.equipos_det': 'Eventos de copa con todos los equipos que pide el contrato (cámaras, switcher, audio y transmisión): ×1,5.',
    'tema.en_linea': 'Día de eventos en línea', 'tema.en_linea_det': 'Todos tus eventos de copa validados: ×1,5.',
    'tema.total': 'Día total', 'tema.total_det': 'Todo cuenta: personal ideal +25 %, equipos completos +25 % y las obras de la sede.',
    'tema.hoy': 'Hoy en la preparación', 'tema.sin': 'Hoy no hay preparación: es día de batalla y resultados.',
    'tema.obras': 'Obras de hoy: {n} de {max} · +{p} pts', 'tema.obra_pts': 'Mejora +{m} · Nivel +{l} pts por obra',
    'tema.semana': 'Semana de preparación', 'tema.valida': 'Solo cuenta lo que el servidor valida: la repetición de tu evento y las obras de tu sede oficial.',
    'dsem.1': 'Lun', 'dsem.2': 'Mar', 'dsem.3': 'Mié', 'dsem.4': 'Jue', 'dsem.5': 'Vie',
  };
  const TRAD = {
    en: {
      dia_corto: 'Day', titulo: 'Server calendar', boton: 'Server calendar', dia: 'Day {n}', dia_servidor: 'Server day {n}',
      veterano: 'Your server is a veteran: everything is open.', abierto: 'Open', cerrado: 'Day {n}',
      se_abre: 'Opens on server day {d} ({c}).', en_dias: 'in {n} days', manana: 'tomorrow',
      cuenta: 'Opens in', proximo: 'Next: {n}', todo_abierto: 'Everything is already open on your server.',
      linea_t: 'What opens as days go by', linea_det: 'New servers open their modes little by little, so everyone starts even and nobody falls behind.',
      recurrentes_t: 'Always', 'rec.liga': 'Weekly League: every week.', 'rec.desafio': 'Daily Challenge: every day.',
      'rec.festival': 'Mega Festival: every 2 days.', 'rec.copa': 'Server Cup: prep Monday to Friday, battle on Saturday.',
      cerrado_t: '{n} isn’t open yet', cerrado_txt: 'Opens on server day {d} ({c}).',
      cerrado_extra: 'Your server is {n} days old. Meanwhile, grow your company: everything you earn will help you there.',
      ver_calendario: 'See calendar', entendido: 'Got it', cerrar: 'Close', cargando: 'Loading the calendar…', error: 'The calendar couldn’t load.',
      'd.apertura': 'Server opening', 'd.apertura_det': 'Your company, the Weekly League, the Daily Challenge, the Market, chat, associations and HQ.',
      'd.duelos': 'Production Duel', 'd.duelos_det': 'Challenge other companies on your server with your best crew and climb the leagues.',
      'd.festival': 'Mega Festival', 'd.festival_det': 'Your association produces a giant 6-stage festival together, every 2 days.',
      'd.copa': 'Server Cup', 'd.copa_det': 'Your server against the other servers in the universe: prep Monday to Friday and battle on Saturday.',
      'tema.construccion': 'Build day', 'tema.construccion_det': 'Official HQ works that finish today give double points. Cup events count as usual.',
      'tema.personal': 'Crew day', 'tema.personal_det': 'Cup events with the full ideal crew (every post covered): ×1.5.',
      'tema.equipos': 'Gear day', 'tema.equipos_det': 'Cup events with all the gear the contract asks for (cameras, switcher, audio and streaming): ×1.5.',
      'tema.en_linea': 'Online events day', 'tema.en_linea_det': 'All your validated cup events: ×1.5.',
      'tema.total': 'All-out day', 'tema.total_det': 'Everything counts: ideal crew +25%, complete gear +25% and HQ works.',
      'tema.hoy': 'Today in the prep', 'tema.sin': 'No prep today: it’s battle and results day.',
      'tema.obras': 'Today’s works: {n} of {max} · +{p} pts', 'tema.obra_pts': 'Upgrade +{m} · Level +{l} pts per work',
      'tema.semana': 'Prep week', 'tema.valida': 'Only what the server validates counts: the replay of your event and your official HQ works.',
      'dsem.1': 'Mon', 'dsem.2': 'Tue', 'dsem.3': 'Wed', 'dsem.4': 'Thu', 'dsem.5': 'Fri',
    },
    'pt-BR': {
      dia_corto: 'Dia', titulo: 'Calendário do servidor', boton: 'Calendário do servidor', dia: 'Dia {n}', dia_servidor: 'Dia {n} do servidor',
      veterano: 'Seu servidor já é veterano: está tudo aberto.', abierto: 'Aberto', cerrado: 'Dia {n}',
      se_abre: 'Abre no dia {d} do servidor ({c}).', en_dias: 'em {n} dias', manana: 'amanhã',
      cuenta: 'Abre em', proximo: 'Próximo: {n}', todo_abierto: 'Já está tudo aberto no seu servidor.',
      linea_t: 'O que abre com os dias', linea_det: 'Os servidores novos abrem os modos aos poucos: assim todos começam iguais e ninguém fica para trás.',
      recurrentes_t: 'Sempre', 'rec.liga': 'Liga Semanal: toda semana.', 'rec.desafio': 'Desafio do Dia: todo dia.',
      'rec.festival': 'Mega Festival: a cada 2 dias.', 'rec.copa': 'Copa de Servidores: preparação de segunda a sexta, batalha no sábado.',
      cerrado_t: '{n} ainda não abriu', cerrado_txt: 'Abre no dia {d} do servidor ({c}).',
      cerrado_extra: 'Seu servidor tem {n} dias. Enquanto isso, melhore sua produtora: tudo o que ganhar vai servir lá.',
      ver_calendario: 'Ver calendário', entendido: 'Entendi', cerrar: 'Fechar', cargando: 'Carregando o calendário…', error: 'Não foi possível carregar o calendário.',
      'd.apertura': 'Abertura do servidor', 'd.apertura_det': 'Sua produtora, a Liga Semanal, o Desafio do Dia, o Mercado, o chat, as associações e a sede.',
      'd.duelos': 'Duelo de Produtoras', 'd.duelos_det': 'Desafie outras produtoras do seu servidor com sua melhor equipe e suba de liga.',
      'd.festival': 'Mega Festival', 'd.festival_det': 'Sua associação produz junta um festival gigante com 6 palcos, a cada 2 dias.',
      'd.copa': 'Copa de Servidores', 'd.copa_det': 'Seu servidor contra os outros servidores do universo: preparação de segunda a sexta e batalha no sábado.',
      'tema.construccion': 'Dia de construção', 'tema.construccion_det': 'As obras da sua sede oficial que terminam hoje dão pontos em dobro. Os eventos da copa contam normal.',
      'tema.personal': 'Dia da equipe', 'tema.personal_det': 'Eventos da copa com a equipe ideal completa (cada posto coberto): ×1,5.',
      'tema.equipos': 'Dia dos equipamentos', 'tema.equipos_det': 'Eventos da copa com todos os equipamentos que o contrato pede (câmeras, switcher, áudio e transmissão): ×1,5.',
      'tema.en_linea': 'Dia de eventos online', 'tema.en_linea_det': 'Todos os seus eventos da copa validados: ×1,5.',
      'tema.total': 'Dia total', 'tema.total_det': 'Tudo conta: equipe ideal +25 %, equipamentos completos +25 % e as obras da sede.',
      'tema.hoy': 'Hoje na preparação', 'tema.sin': 'Hoje não há preparação: é dia de batalha e resultados.',
      'tema.obras': 'Obras de hoje: {n} de {max} · +{p} pts', 'tema.obra_pts': 'Melhoria +{m} · Nível +{l} pts por obra',
      'tema.semana': 'Semana de preparação', 'tema.valida': 'Só conta o que o servidor valida: a repetição do seu evento e as obras da sua sede oficial.',
      'dsem.1': 'Seg', 'dsem.2': 'Ter', 'dsem.3': 'Qua', 'dsem.4': 'Qui', 'dsem.5': 'Sex',
    },
    fr: {
      dia_corto: 'Jour', titulo: 'Calendrier du serveur', boton: 'Calendrier du serveur', dia: 'Jour {n}', dia_servidor: 'Jour {n} du serveur',
      veterano: 'Ton serveur est vétéran : tout est ouvert.', abierto: 'Ouvert', cerrado: 'Jour {n}',
      se_abre: 'Ouvre le jour {d} du serveur ({c}).', en_dias: 'dans {n} jours', manana: 'demain',
      cuenta: 'Ouvre dans', proximo: 'Prochain : {n}', todo_abierto: 'Tout est déjà ouvert sur ton serveur.',
      linea_t: 'Ce qui ouvre au fil des jours', linea_det: 'Les nouveaux serveurs ouvrent leurs modes petit à petit : tout le monde part à égalité.',
      recurrentes_t: 'Toujours', 'rec.liga': 'Ligue hebdo : chaque semaine.', 'rec.desafio': 'Défi du jour : tous les jours.',
      'rec.festival': 'Méga Festival : tous les 2 jours.', 'rec.copa': 'Coupe des serveurs : préparation du lundi au vendredi, bataille le samedi.',
      cerrado_t: '{n} n’est pas encore ouvert', cerrado_txt: 'Ouvre le jour {d} du serveur ({c}).',
      cerrado_extra: 'Ton serveur a {n} jours. En attendant, développe ta boîte : tout ce que tu gagnes te servira là-bas.',
      ver_calendario: 'Voir le calendrier', entendido: 'Compris', cerrar: 'Fermer', cargando: 'Chargement du calendrier…', error: 'Impossible de charger le calendrier.',
      'd.apertura': 'Ouverture du serveur', 'd.apertura_det': 'Ta boîte, la Ligue hebdo, le Défi du jour, le Marché, le chat, les associations et le siège.',
      'd.duelos': 'Duel de boîtes de prod', 'd.duelos_det': 'Défie d’autres boîtes de ton serveur avec ta meilleure équipe et monte de ligue.',
      'd.festival': 'Méga Festival', 'd.festival_det': 'Ton association produit ensemble un festival géant à 6 scènes, tous les 2 jours.',
      'd.copa': 'Coupe des serveurs', 'd.copa_det': 'Ton serveur contre les autres serveurs de l’univers : préparation du lundi au vendredi, bataille le samedi.',
      'tema.construccion': 'Jour de construction', 'tema.construccion_det': 'Les travaux de ton siège officiel terminés aujourd’hui rapportent double. Les événements de coupe comptent normalement.',
      'tema.personal': 'Jour de l’équipe', 'tema.personal_det': 'Événements de coupe avec l’équipe idéale complète (chaque poste couvert) : ×1,5.',
      'tema.equipos': 'Jour du matériel', 'tema.equipos_det': 'Événements de coupe avec tout le matériel demandé (caméras, régie, son et diffusion) : ×1,5.',
      'tema.en_linea': 'Jour des événements en ligne', 'tema.en_linea_det': 'Tous tes événements de coupe validés : ×1,5.',
      'tema.total': 'Jour total', 'tema.total_det': 'Tout compte : équipe idéale +25 %, matériel complet +25 % et les travaux du siège.',
      'tema.hoy': 'Aujourd’hui dans la préparation', 'tema.sin': 'Pas de préparation aujourd’hui : c’est jour de bataille et de résultats.',
      'tema.obras': 'Travaux du jour : {n} sur {max} · +{p} pts', 'tema.obra_pts': 'Amélioration +{m} · Niveau +{l} pts par chantier',
      'tema.semana': 'Semaine de préparation', 'tema.valida': 'Seul compte ce que le serveur valide : la relecture de ton événement et les travaux de ton siège officiel.',
      'dsem.1': 'Lun', 'dsem.2': 'Mar', 'dsem.3': 'Mer', 'dsem.4': 'Jeu', 'dsem.5': 'Ven',
    },
    de: {
      dia_corto: 'Tag', titulo: 'Server-Kalender', boton: 'Server-Kalender', dia: 'Tag {n}', dia_servidor: 'Server-Tag {n}',
      veterano: 'Dein Server ist ein Veteran: Alles ist offen.', abierto: 'Offen', cerrado: 'Tag {n}',
      se_abre: 'Öffnet an Server-Tag {d} ({c}).', en_dias: 'in {n} Tagen', manana: 'morgen',
      cuenta: 'Öffnet in', proximo: 'Als Nächstes: {n}', todo_abierto: 'Auf deinem Server ist schon alles offen.',
      linea_t: 'Was mit den Tagen öffnet', linea_det: 'Neue Server öffnen ihre Modi nach und nach: So starten alle gleich und niemand bleibt zurück.',
      recurrentes_t: 'Immer', 'rec.liga': 'Wochenliga: jede Woche.', 'rec.desafio': 'Tages-Challenge: jeden Tag.',
      'rec.festival': 'Mega-Festival: alle 2 Tage.', 'rec.copa': 'Server-Pokal: Vorbereitung Montag bis Freitag, Schlacht am Samstag.',
      cerrado_t: '{n} ist noch nicht offen', cerrado_txt: 'Öffnet an Server-Tag {d} ({c}).',
      cerrado_extra: 'Dein Server ist {n} Tage alt. Bau inzwischen deine Firma aus: Alles, was du verdienst, hilft dir dort.',
      ver_calendario: 'Kalender ansehen', entendido: 'Verstanden', cerrar: 'Schließen', cargando: 'Kalender wird geladen…', error: 'Der Kalender konnte nicht geladen werden.',
      'd.apertura': 'Server-Eröffnung', 'd.apertura_det': 'Deine Firma, die Wochenliga, die Tages-Challenge, der Markt, der Chat, Verbände und das Hauptquartier.',
      'd.duelos': 'Produktionsduell', 'd.duelos_det': 'Fordere andere Firmen deines Servers mit deiner besten Crew heraus und steig in den Ligen auf.',
      'd.festival': 'Mega-Festival', 'd.festival_det': 'Dein Verband produziert gemeinsam ein riesiges Festival mit 6 Bühnen, alle 2 Tage.',
      'd.copa': 'Server-Pokal', 'd.copa_det': 'Dein Server gegen die anderen Server des Universums: Vorbereitung Montag bis Freitag, Schlacht am Samstag.',
      'tema.construccion': 'Bautag', 'tema.construccion_det': 'Arbeiten am offiziellen HQ, die heute fertig werden, bringen doppelte Punkte. Pokal-Events zählen normal.',
      'tema.personal': 'Crew-Tag', 'tema.personal_det': 'Pokal-Events mit vollständiger idealer Crew (jeder Posten besetzt): ×1,5.',
      'tema.equipos': 'Technik-Tag', 'tema.equipos_det': 'Pokal-Events mit aller Technik, die der Auftrag verlangt (Kameras, Bildmischer, Ton und Übertragung): ×1,5.',
      'tema.en_linea': 'Online-Event-Tag', 'tema.en_linea_det': 'Alle deine validierten Pokal-Events: ×1,5.',
      'tema.total': 'Totaler Tag', 'tema.total_det': 'Alles zählt: ideale Crew +25 %, komplette Technik +25 % und HQ-Arbeiten.',
      'tema.hoy': 'Heute in der Vorbereitung', 'tema.sin': 'Heute keine Vorbereitung: Es ist Schlacht- und Ergebnistag.',
      'tema.obras': 'Arbeiten heute: {n} von {max} · +{p} Pkt.', 'tema.obra_pts': 'Ausbau +{m} · Stufe +{l} Pkt. pro Arbeit',
      'tema.semana': 'Vorbereitungswoche', 'tema.valida': 'Es zählt nur, was der Server prüft: die Wiederholung deines Events und die Arbeiten an deinem offiziellen HQ.',
      'dsem.1': 'Mo', 'dsem.2': 'Di', 'dsem.3': 'Mi', 'dsem.4': 'Do', 'dsem.5': 'Fr',
    },
    it: {
      dia_corto: 'Giorno', titulo: 'Calendario del server', boton: 'Calendario del server', dia: 'Giorno {n}', dia_servidor: 'Giorno {n} del server',
      veterano: 'Il tuo server è veterano: è tutto aperto.', abierto: 'Aperto', cerrado: 'Giorno {n}',
      se_abre: 'Apre il giorno {d} del server ({c}).', en_dias: 'tra {n} giorni', manana: 'domani',
      cuenta: 'Apre tra', proximo: 'Prossimo: {n}', todo_abierto: 'Sul tuo server è già tutto aperto.',
      linea_t: 'Cosa si apre con i giorni', linea_det: 'I server nuovi aprono le modalità poco a poco: così tutti partono alla pari e nessuno resta indietro.',
      recurrentes_t: 'Sempre', 'rec.liga': 'Lega settimanale: ogni settimana.', 'rec.desafio': 'Sfida del giorno: ogni giorno.',
      'rec.festival': 'Mega Festival: ogni 2 giorni.', 'rec.copa': 'Coppa dei server: preparazione dal lunedì al venerdì, battaglia il sabato.',
      cerrado_t: '{n} non è ancora aperto', cerrado_txt: 'Apre il giorno {d} del server ({c}).',
      cerrado_extra: 'Il tuo server ha {n} giorni. Intanto fai crescere la tua casa di produzione: tutto quello che guadagni ti servirà lì.',
      ver_calendario: 'Vedi calendario', entendido: 'Capito', cerrar: 'Chiudi', cargando: 'Caricamento del calendario…', error: 'Impossibile caricare il calendario.',
      'd.apertura': 'Apertura del server', 'd.apertura_det': 'La tua casa di produzione, la Lega settimanale, la Sfida del giorno, il Mercato, la chat, le associazioni e la sede.',
      'd.duelos': 'Duello di produzioni', 'd.duelos_det': 'Sfida altre case di produzione del tuo server con la tua squadra migliore e sali di lega.',
      'd.festival': 'Mega Festival', 'd.festival_det': 'La tua associazione produce insieme un festival gigante con 6 palchi, ogni 2 giorni.',
      'd.copa': 'Coppa dei server', 'd.copa_det': 'Il tuo server contro gli altri server dell’universo: preparazione dal lunedì al venerdì e battaglia il sabato.',
      'tema.construccion': 'Giorno dei lavori', 'tema.construccion_det': 'I lavori della sede ufficiale che finiscono oggi danno punti doppi. Gli eventi di coppa contano normalmente.',
      'tema.personal': 'Giorno della squadra', 'tema.personal_det': 'Eventi di coppa con la squadra ideale completa (ogni posto coperto): ×1,5.',
      'tema.equipos': 'Giorno dell’attrezzatura', 'tema.equipos_det': 'Eventi di coppa con tutta l’attrezzatura richiesta (telecamere, regia, audio e trasmissione): ×1,5.',
      'tema.en_linea': 'Giorno degli eventi online', 'tema.en_linea_det': 'Tutti i tuoi eventi di coppa convalidati: ×1,5.',
      'tema.total': 'Giorno totale', 'tema.total_det': 'Conta tutto: squadra ideale +25 %, attrezzatura completa +25 % e i lavori della sede.',
      'tema.hoy': 'Oggi nella preparazione', 'tema.sin': 'Oggi niente preparazione: è giorno di battaglia e risultati.',
      'tema.obras': 'Lavori di oggi: {n} su {max} · +{p} pt', 'tema.obra_pts': 'Miglioria +{m} · Livello +{l} pt per lavoro',
      'tema.semana': 'Settimana di preparazione', 'tema.valida': 'Conta solo ciò che il server convalida: il replay del tuo evento e i lavori della tua sede ufficiale.',
      'dsem.1': 'Lun', 'dsem.2': 'Mar', 'dsem.3': 'Mer', 'dsem.4': 'Gio', 'dsem.5': 'Ven',
    },
    ru: {
      dia_corto: 'День', titulo: 'Календарь сервера', boton: 'Календарь сервера', dia: 'День {n}', dia_servidor: 'День сервера {n}',
      veterano: 'Твой сервер — ветеран: всё открыто.', abierto: 'Открыто', cerrado: 'День {n}',
      se_abre: 'Откроется на {d}-й день сервера ({c}).', en_dias: 'через {n} дн.', manana: 'завтра',
      cuenta: 'Откроется через', proximo: 'Далее: {n}', todo_abierto: 'На твоём сервере уже всё открыто.',
      linea_t: 'Что открывается со временем', linea_det: 'Новые серверы открывают режимы постепенно: так все стартуют на равных.',
      recurrentes_t: 'Всегда', 'rec.liga': 'Недельная лига: каждую неделю.', 'rec.desafio': 'Задание дня: каждый день.',
      'rec.festival': 'Мега-фестиваль: каждые 2 дня.', 'rec.copa': 'Кубок серверов: подготовка с понедельника по пятницу, битва в субботу.',
      cerrado_t: '{n}: ещё не открыто', cerrado_txt: 'Откроется на {d}-й день сервера ({c}).',
      cerrado_extra: 'Твоему серверу {n} дн. А пока развивай свою компанию: всё заработанное пригодится там.',
      ver_calendario: 'Открыть календарь', entendido: 'Понятно', cerrar: 'Закрыть', cargando: 'Загружаем календарь…', error: 'Не удалось загрузить календарь.',
      'd.apertura': 'Открытие сервера', 'd.apertura_det': 'Твоя компания, Недельная лига, Задание дня, Рынок, чат, ассоциации и штаб.',
      'd.duelos': 'Дуэль продакшнов', 'd.duelos_det': 'Бросай вызов другим компаниям сервера с лучшей командой и поднимайся в лигах.',
      'd.festival': 'Мега-фестиваль', 'd.festival_det': 'Твоя ассоциация вместе делает огромный фестиваль на 6 сценах, каждые 2 дня.',
      'd.copa': 'Кубок серверов', 'd.copa_det': 'Твой сервер против других серверов вселенной: подготовка пн–пт и битва в субботу.',
      'tema.construccion': 'День стройки', 'tema.construccion_det': 'Работы в официальном штабе, завершённые сегодня, дают двойные очки. События кубка — как обычно.',
      'tema.personal': 'День команды', 'tema.personal_det': 'События кубка с полной идеальной командой (каждый пост занят): ×1,5.',
      'tema.equipos': 'День техники', 'tema.equipos_det': 'События кубка со всей техникой по контракту (камеры, микшер, звук и трансляция): ×1,5.',
      'tema.en_linea': 'День онлайн-событий', 'tema.en_linea_det': 'Все твои подтверждённые события кубка: ×1,5.',
      'tema.total': 'Тотальный день', 'tema.total_det': 'Считается всё: идеальная команда +25 %, полная техника +25 % и работы в штабе.',
      'tema.hoy': 'Сегодня в подготовке', 'tema.sin': 'Сегодня подготовки нет: день битвы и итогов.',
      'tema.obras': 'Работы сегодня: {n} из {max} · +{p} оч.', 'tema.obra_pts': 'Улучшение +{m} · Уровень +{l} оч. за работу',
      'tema.semana': 'Неделя подготовки', 'tema.valida': 'Считается только то, что проверил сервер: повтор твоего события и работы в официальном штабе.',
      'dsem.1': 'Пн', 'dsem.2': 'Вт', 'dsem.3': 'Ср', 'dsem.4': 'Чт', 'dsem.5': 'Пт',
    },
    tr: {
      dia_corto: 'Gün', titulo: 'Sunucu takvimi', boton: 'Sunucu takvimi', dia: '{n}. gün', dia_servidor: 'Sunucunun {n}. günü',
      veterano: 'Sunucun artık kıdemli: her şey açık.', abierto: 'Açık', cerrado: '{n}. gün',
      se_abre: 'Sunucunun {d}. gününde açılır ({c}).', en_dias: '{n} gün sonra', manana: 'yarın',
      cuenta: 'Açılmasına', proximo: 'Sıradaki: {n}', todo_abierto: 'Sunucunda her şey zaten açık.',
      linea_t: 'Günler geçtikçe açılanlar', linea_det: 'Yeni sunucular modlarını yavaş yavaş açar: böylece herkes eşit başlar.',
      recurrentes_t: 'Her zaman', 'rec.liga': 'Haftalık Lig: her hafta.', 'rec.desafio': 'Günün Görevi: her gün.',
      'rec.festival': 'Mega Festival: 2 günde bir.', 'rec.copa': 'Sunucu Kupası: pazartesi–cuma hazırlık, cumartesi savaş.',
      cerrado_t: '{n} henüz açılmadı', cerrado_txt: 'Sunucunun {d}. gününde açılır ({c}).',
      cerrado_extra: 'Sunucun {n} günlük. Bu arada şirketini büyüt: kazandığın her şey orada işine yarar.',
      ver_calendario: 'Takvimi gör', entendido: 'Anladım', cerrar: 'Kapat', cargando: 'Takvim yükleniyor…', error: 'Takvim yüklenemedi.',
      'd.apertura': 'Sunucu açılışı', 'd.apertura_det': 'Şirketin, Haftalık Lig, Günün Görevi, Pazar, sohbet, birlikler ve merkez.',
      'd.duelos': 'Prodüksiyon Düellosu', 'd.duelos_det': 'Sunucundaki diğer şirketlere en iyi ekibinle meydan oku ve ligde yüksel.',
      'd.festival': 'Mega Festival', 'd.festival_det': 'Birliğin 2 günde bir 6 sahneli dev bir festivali birlikte yapar.',
      'd.copa': 'Sunucu Kupası', 'd.copa_det': 'Sunucun evrendeki diğer sunuculara karşı: pazartesi–cuma hazırlık ve cumartesi savaş.',
      'tema.construccion': 'İnşaat günü', 'tema.construccion_det': 'Resmî merkezinde bugün biten işler çift puan verir. Kupa etkinlikleri normal sayılır.',
      'tema.personal': 'Ekip günü', 'tema.personal_det': 'İdeal ekibi tam olan kupa etkinlikleri (her görev dolu): ×1,5.',
      'tema.equipos': 'Ekipman günü', 'tema.equipos_det': 'Sözleşmenin istediği tüm ekipmanla kupa etkinlikleri (kameralar, switcher, ses ve yayın): ×1,5.',
      'tema.en_linea': 'Çevrim içi etkinlik günü', 'tema.en_linea_det': 'Onaylanan tüm kupa etkinliklerin: ×1,5.',
      'tema.total': 'Topyekûn gün', 'tema.total_det': 'Her şey sayılır: ideal ekip +%25, tam ekipman +%25 ve merkez işleri.',
      'tema.hoy': 'Bugün hazırlıkta', 'tema.sin': 'Bugün hazırlık yok: savaş ve sonuç günü.',
      'tema.obras': 'Bugünkü işler: {max} işten {n} · +{p} puan', 'tema.obra_pts': 'Geliştirme +{m} · Seviye +{l} puan / iş',
      'tema.semana': 'Hazırlık haftası', 'tema.valida': 'Sadece sunucunun doğruladığı sayılır: etkinliğinin tekrarı ve resmî merkezindeki işler.',
      'dsem.1': 'Pzt', 'dsem.2': 'Sal', 'dsem.3': 'Çar', 'dsem.4': 'Per', 'dsem.5': 'Cum',
    },
    id: {
      dia_corto: 'Hari', titulo: 'Kalender server', boton: 'Kalender server', dia: 'Hari {n}', dia_servidor: 'Hari ke-{n} server',
      veterano: 'Servermu sudah veteran: semuanya terbuka.', abierto: 'Terbuka', cerrado: 'Hari {n}',
      se_abre: 'Dibuka pada hari ke-{d} server ({c}).', en_dias: '{n} hari lagi', manana: 'besok',
      cuenta: 'Dibuka dalam', proximo: 'Berikutnya: {n}', todo_abierto: 'Semua sudah terbuka di servermu.',
      linea_t: 'Yang terbuka seiring hari', linea_det: 'Server baru membuka modenya sedikit demi sedikit: jadi semua mulai setara.',
      recurrentes_t: 'Selalu', 'rec.liga': 'Liga Mingguan: setiap minggu.', 'rec.desafio': 'Tantangan Harian: setiap hari.',
      'rec.festival': 'Mega Festival: setiap 2 hari.', 'rec.copa': 'Piala Server: persiapan Senin–Jumat, pertempuran hari Sabtu.',
      cerrado_t: '{n} belum terbuka', cerrado_txt: 'Dibuka pada hari ke-{d} server ({c}).',
      cerrado_extra: 'Servermu berumur {n} hari. Sementara itu, kembangkan perusahaanmu: semua yang kamu dapat akan berguna di sana.',
      ver_calendario: 'Lihat kalender', entendido: 'Mengerti', cerrar: 'Tutup', cargando: 'Memuat kalender…', error: 'Kalender tidak bisa dimuat.',
      'd.apertura': 'Pembukaan server', 'd.apertura_det': 'Perusahaanmu, Liga Mingguan, Tantangan Harian, Pasar, chat, asosiasi, dan markas.',
      'd.duelos': 'Duel Produksi', 'd.duelos_det': 'Tantang perusahaan lain di servermu dengan kru terbaikmu dan naik liga.',
      'd.festival': 'Mega Festival', 'd.festival_det': 'Asosiasimu bersama memproduksi festival raksasa dengan 6 panggung, setiap 2 hari.',
      'd.copa': 'Piala Server', 'd.copa_det': 'Servermu melawan server lain di semesta: persiapan Senin–Jumat dan pertempuran hari Sabtu.',
      'tema.construccion': 'Hari pembangunan', 'tema.construccion_det': 'Pekerjaan markas resmi yang selesai hari ini memberi poin ganda. Acara piala dihitung biasa.',
      'tema.personal': 'Hari kru', 'tema.personal_det': 'Acara piala dengan kru ideal lengkap (setiap posisi terisi): ×1,5.',
      'tema.equipos': 'Hari peralatan', 'tema.equipos_det': 'Acara piala dengan semua peralatan yang diminta kontrak (kamera, switcher, audio, siaran): ×1,5.',
      'tema.en_linea': 'Hari acara daring', 'tema.en_linea_det': 'Semua acara piala yang tervalidasi: ×1,5.',
      'tema.total': 'Hari total', 'tema.total_det': 'Semua dihitung: kru ideal +25%, peralatan lengkap +25%, dan pekerjaan markas.',
      'tema.hoy': 'Hari ini di persiapan', 'tema.sin': 'Hari ini tidak ada persiapan: hari pertempuran dan hasil.',
      'tema.obras': 'Pekerjaan hari ini: {n} dari {max} · +{p} poin', 'tema.obra_pts': 'Peningkatan +{m} · Level +{l} poin per pekerjaan',
      'tema.semana': 'Minggu persiapan', 'tema.valida': 'Hanya yang divalidasi server yang dihitung: ulangan acaramu dan pekerjaan markas resmimu.',
      'dsem.1': 'Sen', 'dsem.2': 'Sel', 'dsem.3': 'Rab', 'dsem.4': 'Kam', 'dsem.5': 'Jum',
    },
    'zh-CN': {
      dia_corto: '天', titulo: '服务器日历', boton: '服务器日历', dia: '第{n}天', dia_servidor: '服务器第{n}天',
      veterano: '你的服务器已是老服：全部开放。', abierto: '已开放', cerrado: '第{n}天',
      se_abre: '服务器第{d}天开放（{c}）。', en_dias: '{n}天后', manana: '明天',
      cuenta: '距离开放', proximo: '下一个：{n}', todo_abierto: '你的服务器已经全部开放。',
      linea_t: '随天数开放的内容', linea_det: '新服务器会逐步开放玩法：大家起点相同，没人掉队。',
      recurrentes_t: '常驻', 'rec.liga': '每周联赛：每周一次。', 'rec.desafio': '每日挑战：每天。',
      'rec.festival': '超级音乐节：每2天一次。', 'rec.copa': '服务器杯：周一至周五备战，周六对决。',
      cerrado_t: '{n}尚未开放', cerrado_txt: '服务器第{d}天开放（{c}）。',
      cerrado_extra: '你的服务器已开服{n}天。先壮大你的制作公司吧：现在赚到的都会派上用场。',
      ver_calendario: '查看日历', entendido: '知道了', cerrar: '关闭', cargando: '正在加载日历…', error: '日历加载失败。',
      'd.apertura': '服务器开服', 'd.apertura_det': '你的制作公司、每周联赛、每日挑战、市场、聊天、协会和总部。',
      'd.duelos': '制作公司对决', 'd.duelos_det': '带上最强团队挑战本服的其他公司，提升联赛段位。',
      'd.festival': '超级音乐节', 'd.festival_det': '你的协会每2天一起制作一场有6个舞台的大型音乐节。',
      'd.copa': '服务器杯', 'd.copa_det': '你的服务器对战同宇宙的其他服务器：周一至周五备战，周六对决。',
      'tema.construccion': '建设日', 'tema.construccion_det': '今天完工的官方总部工程获得双倍积分。杯赛活动正常计分。',
      'tema.personal': '人员日', 'tema.personal_det': '理想人员配齐（每个岗位都有人）的杯赛活动：×1.5。',
      'tema.equipos': '设备日', 'tema.equipos_det': '合同要求的设备齐全（摄像机、切换台、音频和传输）的杯赛活动：×1.5。',
      'tema.en_linea': '在线活动日', 'tema.en_linea_det': '所有通过验证的杯赛活动：×1.5。',
      'tema.total': '全面日', 'tema.total_det': '全部计分：理想人员+25%、设备齐全+25%以及总部工程。',
      'tema.hoy': '今日备战', 'tema.sin': '今天没有备战：是对决与结果日。',
      'tema.obras': '今日工程：{n}/{max} · +{p}分', 'tema.obra_pts': '每项工程：改进+{m} · 升级+{l}分',
      'tema.semana': '备战周', 'tema.valida': '只计服务器验证过的内容：你的活动回放和官方总部工程。',
      'dsem.1': '周一', 'dsem.2': '周二', 'dsem.3': '周三', 'dsem.4': '周四', 'dsem.5': '周五',
    },
  };
  const LOCALES = { es: 'es-EC', en: 'en-US', 'pt-BR': 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', 'zh-CN': 'zh-CN' };
  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { return 'es'; } };
  function T(k, p) {
    const d = TRAD[idioma()] || {};
    const s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : Object.prototype.hasOwnProperty.call(ES, k) ? ES[k] : k;
    return String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined && p[x] !== null ? p[x] : m));
  }
  const tiene = (k) => Object.prototype.hasOwnProperty.call(TRAD[idioma()] || {}, k) || Object.prototype.hasOwnProperty.call(ES, k);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => { try { return Number(n || 0).toLocaleString(LOCALES[idioma()] || 'es-EC'); } catch (e) { return String(n || 0); } };
  function fechaCorta(iso) {
    try { const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString(LOCALES[idioma()] || 'es-EC', { day: 'numeric', month: 'short' }); } catch (e) { return String(iso || ''); }
  }

  /* ---------- Estado ---------- */
  const st = { ctx: null, cal: null, pedido: 0, cargando: false, timer: null, obs: null };
  const Api = () => root.Api || null;
  const logueado = () => { try { const a = Api(); return !!(a && a.disponible !== false && a.logueado && a.logueado()); } catch (e) { return false; } };
  const estadoApi = () => { try { return (Api() && Api().estado) || null; } catch (e) { return null; } };
  // Datos de la edad: /api/estado.edad_servidor o, si no vino ahí, lo último de /api/servidor/calendario
  function datos() {
    const e = estadoApi();
    if (e && e.edad_servidor && typeof e.edad_servidor === 'object') return e.edad_servidor;
    if (st.cal) return { dia: st.cal.servidor && st.cal.servidor.dia, edad_dias: st.cal.servidor && st.cal.servidor.edad_dias, veterano: !!(st.cal.servidor && st.cal.servidor.veterano), desbloqueos: st.cal.desbloqueos || [], proximos: st.cal.proximos || [] };
    return null;
  }
  const nombreD = (d) => (tiene('d.' + d.clave) ? T('d.' + d.clave) : d.nombre || d.clave);
  const detalleD = (d) => (tiene('d.' + d.clave + '_det') ? T('d.' + d.clave + '_det') : d.detalle || '');
  const cuando = (f) => (Number(f) <= 1 ? T('manana') : T('en_dias', { n: num(f) }));
  const textoBloqueo = (b) => T('se_abre', { d: num(b.dia), c: cuando(b.faltan_dias) });

  /** Desbloqueo cerrado de un modo de la pestaña "En línea" (duelos, festival, copa...) o null si se puede entrar. */
  function bloqueo(modo) {
    if (!logueado()) return null;
    const d = datos();
    if (!d || d.veterano) return null;
    const b = (d.desbloqueos || []).find((x) => x && x.modo === modo && !x.abierto);
    if (!b) return null;
    // Si ya pasó la hora de apertura (el estado es de antes), se deja entrar: el servidor decide igual
    const abre = Date.parse(b.abre);
    if (Number.isFinite(abre) && Date.now() >= abre) return null;
    return b;
  }

  async function pedir(method, ruta) {
    const r = await fetch(ruta, { method, headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': idioma() }, credentials: 'same-origin', cache: 'no-store' });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || j.ok === false) { const err = new Error((j && j.error) || T('error')); err.codigo = j && j.codigo; throw err; }
    return j;
  }
  async function recargar() {
    if (st.cargando || !logueado()) return st.cal;
    st.cargando = true;
    try { st.cal = await pedir('GET', '/api/servidor/calendario'); } catch (e) { /* se queda lo de /api/estado */ } finally { st.cargando = false; st.pedido = Date.now(); }
    decorar();
    return st.cal;
  }

  /* ---------- Gráficos ---------- */
  const svg = (body, s) => `<svg class="eds-ico" width="${s || 18}" height="${s || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const icoCal = (s) => svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M16 14h.01M8 17.5h2M12 17.5h2"/>', s);
  const icoLock = (s) => svg('<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/><path d="M12 14.5v2.5"/>', s);
  const icoOk = (s) => svg('<path d="M5 12.5l4 4L19 7"/>', s);
  const ICOS = {
    home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>',
    rival: '<path d="M5 5l7 7M19 5l-7 7M5 19l5-5M19 19l-5-5"/><circle cx="12" cy="12" r="1.6"/>',
    festival: '<path d="M4 20l8-15 8 15z"/><path d="M8.5 13.5h7M12 5v3"/>',
    crown: '<path d="M4 17l-1-10 5 4 4-6 4 6 5-4-1 10z"/><path d="M4 20h16"/>',
  };
  const icoD = (k, s) => svg(ICOS[k] || ICOS.home, s);
  const TEMA_ICO = {
    construccion: '<path d="M3 20h18M5 20V10l7-5 7 5v10"/><path d="M9 20v-6h6v6"/>',
    personal: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.2c2.3.2 4 1.8 4.6 4.3"/>',
    equipos: '<rect x="3" y="7.5" width="12.5" height="10" rx="2"/><path d="M15.5 11l5-3v9l-5-3"/><circle cx="9.2" cy="12.5" r="2.3"/>',
    en_linea: '<path d="M5 12.5a10 10 0 0114 0M8 15.5a6 6 0 018 0"/><circle cx="12" cy="18.5" r="1.3"/><path d="M2 9.5a14.5 14.5 0 0120 0"/>',
    total: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  };
  const icoTema = (k, s) => svg(TEMA_ICO[k] || TEMA_ICO.total, s);
  const COLOR_TEMA = { construccion: '#ffb020', personal: '#4da3ff', equipos: '#2ecc71', en_linea: '#b07bff', total: '#ff5a5a' };

  function css() {
    if (typeof document === 'undefined' || document.getElementById('eds-css')) return;
    const s = document.createElement('style');
    s.id = 'eds-css';
    s.textContent = `
      .eds-ico{flex:none;vertical-align:middle}
      .eds-btn{display:flex;align-items:center;gap:8px;width:100%;margin-top:10px;justify-content:flex-start;text-align:start;line-height:1.25}
      .eds-btn .g{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
      .eds-btn small{display:block;font-size:11.5px;color:var(--muted);font-weight:400;overflow-wrap:anywhere}
      .eds-btn .dia{flex:none;font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:999px;background:#4da3ff1f;border:1px solid #4da3ff55;color:#8cc4ff;white-space:nowrap}
      .onl-tile.eds-lock{filter:saturate(.35);opacity:.78}
      .onl-tile.eds-lock .oi{position:relative}
      .eds-cand{display:inline-flex;align-items:center;gap:5px;margin-top:auto;padding-top:4px;font-size:11.5px;font-weight:700;color:#ffcf6e;overflow-wrap:anywhere}
      .onl-tile.eds-lock .oe{display:none}
      .eds-modal h2{overflow-wrap:anywhere;margin-bottom:2px}
      .eds-modal p{overflow-wrap:anywhere}
      .eds-hero{display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#0f2440,#1a1430);border:1px solid #1c3d66;border-radius:14px;padding:12px;margin:8px 0 10px}
      .eds-hero .num{flex:none;width:58px;height:58px;border-radius:14px;display:grid;place-items:center;background:#08121f;border:1px solid #2b5a90;text-align:center;line-height:1}
      .eds-hero .num b{display:block;font-size:24px;color:#e9edf5;font-family:var(--f-head,inherit)}
      .eds-hero .num small{display:block;font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:#8cc4ff}
      .eds-hero .g{min-width:0;flex:1 1 auto}
      .eds-hero .g b{display:block;overflow-wrap:anywhere}
      .eds-hero .g span{display:block;font-size:12.5px;color:#c9d3e6;overflow-wrap:anywhere;margin-top:2px}
      .eds-cuenta{font-variant-numeric:tabular-nums;font-weight:700;color:#ffcf6e}
      .eds-lin .g b.eds-cuenta{display:inline;font-size:inherit}
      .eds-sec{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:14px 0 6px}
      .eds-lin{position:relative;margin:0;padding:0;list-style:none}
      .eds-lin li{position:relative;display:flex;gap:10px;align-items:flex-start;padding:8px 0 8px 0;min-width:0}
      .eds-lin li+li{border-top:1px dashed var(--line)}
      .eds-lin .marca{flex:none;width:44px;text-align:center}
      .eds-lin .marca b{display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
      .eds-lin .marca i{display:grid;place-items:center;width:34px;height:34px;margin:2px auto 0;border-radius:10px;background:var(--panel2);border:1px solid var(--line);color:#8cc4ff;font-style:normal}
      .eds-lin li.ok .marca i{background:#2ecc7118;border-color:#2ecc7155;color:var(--green)}
      .eds-lin li.prox .marca i{background:#ffb02018;border-color:#ffb02066;color:#ffcf6e}
      .eds-lin .g{flex:1 1 auto;min-width:0}
      .eds-lin .g b{display:block;font-size:14.5px;overflow-wrap:anywhere}
      .eds-lin .g span{display:block;font-size:12.5px;color:var(--muted);overflow-wrap:anywhere;margin-top:1px}
      .eds-lin .g em{display:inline-flex;align-items:center;gap:4px;font-style:normal;font-size:12px;font-weight:700;margin-top:4px;overflow-wrap:anywhere}
      .eds-lin li.ok .g em{color:var(--green)}
      .eds-lin li.cerr .g em{color:#ffcf6e}
      .eds-rec{font-size:13px;margin:4px 0;color:var(--text,#e9edf5);overflow-wrap:anywhere}
      .eds-sem{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:8px 0 2px}
      .eds-sem .d{min-width:0;border:1px solid var(--line);border-radius:10px;padding:7px 4px;text-align:center;background:var(--panel2)}
      .eds-sem .d b{display:block;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:var(--muted)}
      .eds-sem .d .eds-ico{margin:3px auto 2px;display:block}
      .eds-sem .d small{display:block;font-size:10.5px;line-height:1.2;overflow-wrap:anywhere;hyphens:auto}
      .eds-sem .d.hoy{border-width:2px}
      .eds-sem .d.pasado{opacity:.5}
      .eds-tema{border-width:1px}
      .eds-tema .cab{display:flex;gap:10px;align-items:center;min-width:0}
      .eds-tema .cab .t{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center}
      .eds-tema .cab .g{min-width:0;flex:1 1 auto}
      .eds-tema .cab small{display:block;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)}
      .eds-tema .cab b{display:block;font-size:16px;overflow-wrap:anywhere}
      .eds-tema p{overflow-wrap:anywhere}
      .eds-obras{font-size:12.5px;margin:8px 0 0;padding:7px 9px;border-radius:10px;background:#ffb02012;border:1px solid #ffb02044;overflow-wrap:anywhere}`;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- Botón en la tarjeta "Tu servidor" (js/servidores.js) ---------- */
  function boton() {
    if (!logueado()) return '';
    css();
    if (!datos() && !st.cargando && Date.now() - st.pedido > 60e3) setTimeout(recargar, 0);
    const d = datos();
    const prox = d && !d.veterano && (d.proximos || []).find((x) => x && !x.abierto);
    const sub = !d ? '' : prox ? T('proximo', { n: nombreD(prox) }) + ' · ' + cuando(prox.faltan_dias) : T('todo_abierto');
    return `<button class="btn eds-btn" data-ext="${ID}" data-acc="abrir" data-eds="boton">${icoCal(20)}<span class="g">${esc(T('boton'))}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${d && d.dia ? `<span class="dia">${esc(T('dia', { n: num(d.dia) }))}</span>` : ''}</button>`;
  }

  /* ---------- Ventanas ---------- */
  function abrirModal(html) {
    css();
    try { if (st.ctx && st.ctx.openModal) { st.ctx.openModal(html); return; } } catch (e) { /* abajo */ }
    const m = document.getElementById('modal'), o = document.getElementById('overlay');
    if (m && o) { m.innerHTML = html; o.classList.add('on'); m.scrollTop = 0; }
  }
  const cerrarBtn = () => `<button class="btn" data-act="close">${esc(T('cerrar'))}</button>`;

  function restanteTxt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const p2 = (n) => String(n).padStart(2, '0');
    return (d ? d + 'd ' : '') + p2(h) + ':' + p2(m) + ':' + p2(x);
  }
  function tic() {
    if (typeof document === 'undefined') return;
    const els = document.querySelectorAll('[data-eds-cuenta]');
    if (!els.length) { clearInterval(st.timer); st.timer = null; return; }
    els.forEach((el) => { const t = Date.parse(el.getAttribute('data-eds-cuenta')); el.textContent = Number.isFinite(t) ? restanteTxt(t - Date.now()) : ''; });
  }
  function arrancar() { tic(); if (!st.timer) st.timer = setInterval(tic, 1000); }

  function lineaHtml(lista, dia) {
    const prox = lista.find((x) => !x.abierto);
    return `<ul class="eds-lin" data-eds="linea">${lista.map((x) => {
      const cls = x.abierto ? 'ok' : x === prox ? 'cerr prox' : 'cerr';
      const est = x.abierto ? `${icoOk(14)}${esc(T('abierto'))}` : `${icoLock(14)}${esc(textoBloqueo(x))}`;
      return `<li class="${cls}" data-eds-d="${esc(x.clave)}" data-abierto="${x.abierto ? 1 : 0}"><div class="marca"><b>${esc(T('dia', { n: num(x.dia) }))}</b><i>${icoD(x.icono, 18)}</i></div>
        <div class="g"><b>${esc(nombreD(x))}</b><span>${esc(detalleD(x))}</span><em>${est}</em>
        ${x === prox && x.abre ? `<span>${esc(T('cuenta'))} <b class="eds-cuenta" data-eds-cuenta="${esc(x.abre)}">${restanteTxt(Date.parse(x.abre) - Date.now())}</b></span>` : ''}</div></li>`;
    }).join('')}</ul>`;
  }
  function semanaHtml(sem) {
    if (!sem || !sem.length) return '';
    return `<div class="eds-sem" data-eds="semana">${sem.map((x) => {
      const c = COLOR_TEMA[x.clave] || '#8cc4ff';
      return `<div class="d ${x.hoy ? 'hoy' : ''} ${x.pasado ? 'pasado' : ''}" style="${x.hoy ? `border-color:${c};background:${c}18` : ''}" data-tema="${esc(x.clave)}"${x.hoy ? ' data-hoy="1"' : ''}>
        <b>${esc(T('dsem.' + x.n))}</b><span style="color:${c}">${icoTema(x.clave, 20)}</span><small>${esc(tiene('tema.' + x.clave) ? T('tema.' + x.clave) : x.nombre)}</small></div>`;
    }).join('')}</div>`;
  }

  function pintarCalendario(cal) {
    const d = datos() || {};
    const sv = (cal && cal.servidor) || (estadoApi() && estadoApi().servidor) || {};
    const dia = (cal && cal.servidor && cal.servidor.dia) || d.dia || 1;
    const veterano = cal && cal.servidor ? !!cal.servidor.veterano : !!d.veterano;
    const lista = (cal && cal.desbloqueos) || d.desbloqueos || [];
    const prox = lista.find((x) => !x.abierto);
    const sub = veterano ? T('veterano') : prox ? T('proximo', { n: nombreD(prox) }) + ' · ' + cuando(prox.faltan_dias) : T('todo_abierto');
    const rec = ((cal && cal.recurrentes) || []).map((r) => (tiene('rec.' + r.clave) ? `<p class="eds-rec">• ${esc(T('rec.' + r.clave))}</p>` : '')).join('');
    abrirModal(`<div class="eds-modal" data-eds="calendario">
      <div class="row between"><h2>${icoCal(22)} ${esc(T('titulo'))}</h2></div>
      <div class="eds-hero"><div class="num"><small>${esc(T('dia_corto'))}</small><b data-eds-dia>${num(dia)}</b></div>
        <div class="g"><b>${esc(sv.nombre || '')}</b><span>${esc(sub)}</span></div></div>
      ${lista.length ? `<div class="eds-sec">${esc(T('linea_t'))}</div><p class="small muted" style="margin:0 0 4px">${esc(T('linea_det'))}</p>${lineaHtml(lista, dia)}` : `<p class="small muted">${esc(T('cargando'))}</p>`}
      ${cal && cal.copa_semana && cal.copa_semana.length ? `<div class="eds-sec">${esc(T('tema.semana'))}</div>${semanaHtml(cal.copa_semana)}<p class="small muted" style="margin:6px 0 0">${esc(T('tema.valida'))}</p>` : ''}
      ${rec ? `<div class="eds-sec">${esc(T('recurrentes_t'))}</div>${rec}` : ''}
      <div style="margin-top:12px">${cerrarBtn()}</div></div>`);
    arrancar();
  }
  async function abrir(ctx) {
    if (ctx) st.ctx = ctx;
    pintarCalendario(st.cal);
    const cal = await recargar();
    const abierto = typeof document !== 'undefined' && document.querySelector('[data-eds="calendario"]');
    if (abierto && cal) pintarCalendario(cal);
  }
  function abrirBloqueo(b, k) {
    const d = datos() || {};
    abrirModal(`<div class="eds-modal" data-eds="bloqueo" data-modo="${esc(k || b.modo || '')}">
      <h2>${icoLock(22)} ${esc(T('cerrado_t', { n: nombreD(b) }))}</h2>
      <p><b>${esc(textoBloqueo(b))}</b></p>
      <p class="small muted">${esc(detalleD(b))}</p>
      ${b.abre ? `<p class="small">${esc(T('cuenta'))} <b class="eds-cuenta" data-eds-cuenta="${esc(b.abre)}">${restanteTxt(Date.parse(b.abre) - Date.now())}</b></p>` : ''}
      ${d.edad_dias != null ? `<p class="small muted">${esc(T('cerrado_extra', { n: num(Math.max(1, d.dia || 1)) }))}</p>` : ''}
      <button class="btn main" data-ext="${ID}" data-acc="abrir">${icoCal(18)} ${esc(T('ver_calendario'))}</button>
      <button class="btn" data-act="close">${esc(T('entendido'))}</button></div>`);
    arrancar();
  }

  /* ---------- Candados en la pestaña "En línea" ---------- */
  let decorarPend = false;
  function decorar() {
    if (typeof document === 'undefined') return;
    css();
    document.querySelectorAll('.onl-tile[data-k]').forEach((t) => {
      const b = t.disabled ? null : bloqueo(t.getAttribute('data-k'));
      const marca = t.querySelector('.eds-cand');
      if (!b) {
        if (t.classList.contains('eds-lock')) t.classList.remove('eds-lock');
        if (marca) marca.remove();
        if (t.hasAttribute('data-eds-lock')) t.removeAttribute('data-eds-lock');
        return;
      }
      const txt = T('cerrado', { n: num(b.dia) }) + ' · ' + cuando(b.faltan_dias);
      if (!t.classList.contains('eds-lock')) t.classList.add('eds-lock');
      if (t.getAttribute('data-eds-lock') !== String(b.dia)) t.setAttribute('data-eds-lock', String(b.dia));
      if (!marca) t.insertAdjacentHTML('beforeend', `<span class="eds-cand">${icoLock(13)}<span>${esc(txt)}</span></span>`);
      else if (marca.textContent !== txt) marca.innerHTML = `${icoLock(13)}<span>${esc(txt)}</span>`;
    });
  }
  function decorarLuego() {
    if (decorarPend) return;
    decorarPend = true;
    setTimeout(() => { decorarPend = false; decorar(); }, 0);
  }
  function vigilar() {
    if (typeof document === 'undefined' || st.obs || typeof MutationObserver === 'undefined') return;
    const cuerpo = document.getElementById('tab-online') || document.body;
    if (!cuerpo) return;
    st.obs = new MutationObserver((ms) => { if (ms.some((m) => m.addedNodes && m.addedNodes.length && !(m.target && m.target.classList && m.target.classList.contains('eds-cand')))) decorarLuego(); });
    st.obs.observe(document.body, { childList: true, subtree: true });
    // Tocar una ficha cerrada explica en vez de entrar (fase de captura: antes que ui.js)
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest ? e.target.closest('[data-act="online"][data-k]') : null;
      if (!t || t.disabled) return;
      const k = t.getAttribute('data-k');
      const b = bloqueo(k);
      if (!b) return;
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      abrirBloqueo(b, k);
    }, true);
    decorar();
  }
  // window.EnVivoAbrirOnline(k) (Inicio, copas.js...) también respeta el candado
  function envolverAbrirOnline() {
    const f = root.EnVivoAbrirOnline;
    if (typeof f !== 'function' || f.__eds) return;
    const g = function (k) { const b = k ? bloqueo(k) : null; if (b) { abrirBloqueo(b, k); return; } return f.apply(this, arguments); };
    g.__eds = true;
    root.EnVivoAbrirOnline = g;
  }

  /* ---------- Tarjeta del tema del día dentro de la Copa (js/copas.js) ---------- */
  function tarjetaTema(d) {
    const t = d && d.tema;
    if (!t || !d.copa) return '';
    css();
    const h = t.hoy;
    const fase = d.copa.fase;
    const sem = semanaHtml(t.semana || []);
    if (!h || fase !== 'preparacion') {
      return `<div class="card eds-tema" data-copa="tema" data-tema-hoy="">
        <div class="cab"><div class="t" style="background:var(--panel2);color:var(--muted)">${icoCal(22)}</div><div class="g"><small>${esc(T('tema.semana'))}</small><b>${esc(T('tema.sin'))}</b></div></div>${sem}</div>`;
    }
    const c = COLOR_TEMA[h.clave] || '#8cc4ff';
    const nom = tiene('tema.' + h.clave) ? T('tema.' + h.clave) : h.nombre;
    const det = tiene('tema.' + h.clave + '_det') ? T('tema.' + h.clave + '_det') : h.cuenta;
    const o = t.obras || {};
    const obras = h.obras > 0 ? `<p class="eds-obras" data-eds="obras">${icoTema('construccion', 15)} ${esc(T('tema.obras', { n: num(o.cuantas), max: num(o.max), p: num(o.puntos) }))}<br><span class="small muted">${esc(T('tema.obra_pts', { m: num((o.puntos_mejora || 15) * h.obras), l: num((o.puntos_nivel || 40) * h.obras) }))}</span></p>` : '';
    return `<div class="card eds-tema" data-copa="tema" data-tema-hoy="${esc(h.clave)}" style="border-color:${c}66">
      <div class="cab"><div class="t" style="background:${c}1f;color:${c}">${icoTema(h.clave, 24)}</div><div class="g"><small>${esc(T('tema.hoy'))}</small><b style="color:${c}">${esc(nom)}</b></div></div>
      <p class="small" style="margin:8px 0 0">${esc(det)}</p>${obras}
      ${sem}<p class="small muted" style="margin:6px 0 0">${esc(T('tema.valida'))}</p></div>`;
  }

  /* ---------- Registro en Inicio (sin tarjeta propia: el botón vive en "Tu servidor") ---------- */
  const inicio = {
    id: ID, orden: 6,
    tarjeta(ctx) { st.ctx = ctx; envolverAbrirOnline(); vigilar(); return ''; },
    clic(ctx, acc) { st.ctx = ctx; if (acc === 'abrir') abrir(ctx); },
  };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push(inicio);
  if (typeof document !== 'undefined') {
    const listo = () => { envolverAbrirOnline(); vigilar(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', listo); else listo();
  }

  root.EdadServidor = { boton, bloqueo, abrir, abrirBloqueo, tarjetaTema, decorar, recargar, textoBloqueo, T, ES, TRAD, get datos() { return datos(); }, _st: st };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EdadServidor;
})(typeof window !== 'undefined' ? window : globalThis);
