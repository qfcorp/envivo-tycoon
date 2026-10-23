/* =========================================================
   EN VIVO Tycoon — Visitas a otras productoras (como las visitas de amigos de Pocket City)
   Contrato: server/src/VisitasApi.php (server/INTEGRAR_VISITAS.md).
     GET  /api/visitas/vitrina?jugador_id=N · POST /api/visitas/aplaudir {jugador_id}
     GET  /api/visitas/sugeridas · GET/POST /api/visitas/ajustes {permitir}
   Pantalla "Visitar": la sede de la otra productora con el arte de verdad (Art.hq con SU vitrina: local, decoración
   Decoracion.capa, letrero con su nombre), sus números, la vitrina de trofeos, el aplauso 👏 (1 por día; premio chico
   a los dos) y "Enviar mensaje" (solo si el chat tiene mensajes privados: Chat.abrirPrivado / Chat.abrirDM).
   Uso:
     Visitas.boton(jugadorId)        → html de un botón "Visitar" (vacío si no hay sesión, no hay id o eres tú)
     Visitas.abrir(jugadorId)        → abre la pantalla (cualquier [data-visitar="<id>"] también la abre)
     Visitas.ajusteCuenta()          → html del interruptor de privacidad (para la tarjeta de la cuenta)
     Visitas.estadoVisita(vitrina)   → partida "de mentira" para dibujar su sede con Art.hq (sin tocar la tuya)
   Inicio: se agrega a window.EnVivoInicio (id "visitas", orden 62) con productoras para visitar.
   Textos: ES aquí mismo + TRAD[código] (I18N.idioma), 10 idiomas; lo que falte sale en español.
   ========================================================= */
(function (root) {
  'use strict';

  const ES = {
    'titulo': 'Visitas', 'visitar': 'Visitar', 'visita_de': 'De visita en {nombre}', 'volver': 'Volver', 'cargando': 'Llegando a la productora…',
    'error': 'No se pudo abrir la visita.', 'reintentar': 'Intentar de nuevo', 'sin_sesion': 'Entra con tu cuenta para visitar otras productoras.',
    'cerrada': 'Esta productora no recibe visitas por ahora.', 'no_existe': 'Esa productora no existe.', 'sin_partida': 'Esta productora todavía no guardó su partida en la nube.',
    'aplaudir': 'Dejar un aplauso 👏', 'ya_hoy': 'Ya aplaudiste hoy 👏', 'aplausos': '{n} aplausos', 'hoy': '{n} hoy',
    'premio_nota': 'Los dos ganan {m} (hasta {n} premios por día).', 'aplaudido': '¡Aplauso enviado! +{m} para ti y para {nombre}.',
    'aplaudido_tope': '¡Aplauso enviado! Hoy ya cobraste el máximo de premios por aplausos.', 'mensaje': 'Enviar mensaje',
    'fama': 'Fama {n}', 'dia': 'Día {n}', 'sede': 'Sede oficial nivel {n}',
    'numeros': 'Sus números', 'st_eventos': 'Eventos', 'st_cinco': 'Con 5 estrellas', 'st_intl': 'Internacionales', 'st_duelos': 'Duelos ganados',
    'st_personal': 'Personal', 'st_equipos': 'Equipos', 'st_logros': 'Logros',
    'trofeos': 'Vitrina de trofeos', 'trofeos_vacio': 'Todavía sin trofeos.', 'tr_campeon': 'Campeón', 'tr_subcampeon': 'Subcampeón', 'tr_top10': 'Top 10',
    'tr_duelo': 'Duelos: puesto {n}', 'tr_historia': 'Historia completa', 'tr_temporada': 'Fecha especial',
    'mejores': 'Mejores eventos', 'mejores_vacio': 'Todavía no hay eventos.', 'veces': '{n}× con 4-5 ⭐',
    'equipo': 'Personal destacado', 'estrellas': 'Personal estrella', 'flota': 'Flota', 'flota_vacia': 'Sin vehículos propios.',
    'propia': 'Así ven tu productora los demás.', 'mi_vitrina': 'Ver mi vitrina',
    'privacidad': 'Permitir visitas a mi productora', 'privacidad_det': 'Si lo apagas, nadie más puede ver tu sede ni dejarte aplausos.',
    'guardado_on': 'Listo: otros jugadores pueden visitarte.', 'guardado_off': 'Listo: nadie más puede visitar tu productora.',
    'inicio_t': 'Visita otras productoras', 'inicio_det': 'Mira cómo trabajan otros jugadores de tu servidor y déjales un aplauso: los dos ganan {m}.',
    'inicio_vacio': 'Todavía no hay otras productoras para visitar.', 'mis_aplausos': 'Tu productora tiene {n} aplausos ({h} hoy).',
    'err.aplauso_ya': 'Ya le diste un aplauso hoy a esta productora. Vuelve mañana.', 'err.aplauso_propio': 'No puedes aplaudirte a ti mismo.',
    'err.limite': 'Demasiadas visitas seguidas. Espera un momento.', 'err.red': 'Sin conexión. Revisa tu internet e intenta de nuevo.',
  };
  const TRAD = {
    'en': {
      'titulo': 'Visits', 'visitar': 'Visit', 'visita_de': 'Visiting {nombre}', 'volver': 'Back', 'cargando': 'Arriving at the company…',
      'error': 'Could not open the visit.', 'reintentar': 'Try again', 'sin_sesion': 'Sign in to your account to visit other companies.',
      'cerrada': 'This company is not receiving visits right now.', 'no_existe': 'That company does not exist.', 'sin_partida': 'This company has not saved its game to the cloud yet.',
      'aplaudir': 'Leave a round of applause 👏', 'ya_hoy': 'You already applauded today 👏', 'aplausos': '{n} applause', 'hoy': '{n} today',
      'premio_nota': 'You both earn {m} (up to {n} rewards per day).', 'aplaudido': 'Applause sent! +{m} for you and for {nombre}.',
      'aplaudido_tope': 'Applause sent! You already collected today’s maximum applause rewards.', 'mensaje': 'Send message',
      'fama': 'Fame {n}', 'dia': 'Day {n}', 'sede': 'Official HQ level {n}',
      'numeros': 'Their numbers', 'st_eventos': 'Events', 'st_cinco': '5-star events', 'st_intl': 'International', 'st_duelos': 'Duels won',
      'st_personal': 'Staff', 'st_equipos': 'Equipment', 'st_logros': 'Achievements',
      'trofeos': 'Trophy shelf', 'trofeos_vacio': 'No trophies yet.', 'tr_campeon': 'Champion', 'tr_subcampeon': 'Runner-up', 'tr_top10': 'Top 10',
      'tr_duelo': 'Duels: rank {n}', 'tr_historia': 'Story completed', 'tr_temporada': 'Special date',
      'mejores': 'Best events', 'mejores_vacio': 'No events yet.', 'veces': '{n}× with 4-5 ⭐',
      'equipo': 'Top staff', 'estrellas': 'Star staff', 'flota': 'Fleet', 'flota_vacia': 'No vehicles of their own.',
      'propia': 'This is how others see your company.', 'mi_vitrina': 'See my showcase',
      'privacidad': 'Allow visits to my company', 'privacidad_det': 'If you turn it off, nobody else can see your HQ or leave you applause.',
      'guardado_on': 'Done: other players can visit you.', 'guardado_off': 'Done: nobody else can visit your company.',
      'inicio_t': 'Visit other companies', 'inicio_det': 'See how other players on your server work and leave them applause: you both earn {m}.',
      'inicio_vacio': 'There are no other companies to visit yet.', 'mis_aplausos': 'Your company has {n} applause ({h} today).',
      'err.aplauso_ya': 'You already applauded this company today. Come back tomorrow.', 'err.aplauso_propio': 'You cannot applaud yourself.',
      'err.limite': 'Too many visits in a row. Wait a moment.', 'err.red': 'No connection. Check your internet and try again.',
    },
    'pt-BR': {
      'titulo': 'Visitas', 'visitar': 'Visitar', 'visita_de': 'Visitando {nombre}', 'volver': 'Voltar', 'cargando': 'Chegando na produtora…',
      'error': 'Não foi possível abrir a visita.', 'reintentar': 'Tentar de novo', 'sin_sesion': 'Entre na sua conta para visitar outras produtoras.',
      'cerrada': 'Esta produtora não está recebendo visitas agora.', 'no_existe': 'Essa produtora não existe.', 'sin_partida': 'Esta produtora ainda não salvou o jogo na nuvem.',
      'aplaudir': 'Deixar um aplauso 👏', 'ya_hoy': 'Você já aplaudiu hoje 👏', 'aplausos': '{n} aplausos', 'hoy': '{n} hoje',
      'premio_nota': 'Os dois ganham {m} (até {n} prêmios por dia).', 'aplaudido': 'Aplauso enviado! +{m} para você e para {nombre}.',
      'aplaudido_tope': 'Aplauso enviado! Hoje você já recebeu o máximo de prêmios por aplausos.', 'mensaje': 'Enviar mensagem',
      'fama': 'Fama {n}', 'dia': 'Dia {n}', 'sede': 'Sede oficial nível {n}',
      'numeros': 'Os números dela', 'st_eventos': 'Eventos', 'st_cinco': 'Com 5 estrelas', 'st_intl': 'Internacionais', 'st_duelos': 'Duelos vencidos',
      'st_personal': 'Equipe', 'st_equipos': 'Equipamentos', 'st_logros': 'Conquistas',
      'trofeos': 'Estante de troféus', 'trofeos_vacio': 'Ainda sem troféus.', 'tr_campeon': 'Campeã', 'tr_subcampeon': 'Vice-campeã', 'tr_top10': 'Top 10',
      'tr_duelo': 'Duelos: posição {n}', 'tr_historia': 'História completa', 'tr_temporada': 'Data especial',
      'mejores': 'Melhores eventos', 'mejores_vacio': 'Ainda não há eventos.', 'veces': '{n}× com 4-5 ⭐',
      'equipo': 'Equipe em destaque', 'estrellas': 'Equipe estrela', 'flota': 'Frota', 'flota_vacia': 'Sem veículos próprios.',
      'propia': 'É assim que os outros veem sua produtora.', 'mi_vitrina': 'Ver minha vitrine',
      'privacidad': 'Permitir visitas à minha produtora', 'privacidad_det': 'Se desligar, ninguém mais pode ver sua sede nem deixar aplausos.',
      'guardado_on': 'Pronto: outros jogadores podem visitar você.', 'guardado_off': 'Pronto: ninguém mais pode visitar sua produtora.',
      'inicio_t': 'Visite outras produtoras', 'inicio_det': 'Veja como trabalham outros jogadores do seu servidor e deixe um aplauso: os dois ganham {m}.',
      'inicio_vacio': 'Ainda não há outras produtoras para visitar.', 'mis_aplausos': 'Sua produtora tem {n} aplausos ({h} hoje).',
      'err.aplauso_ya': 'Você já aplaudiu esta produtora hoje. Volte amanhã.', 'err.aplauso_propio': 'Você não pode aplaudir a si mesmo.',
      'err.limite': 'Visitas demais seguidas. Espere um momento.', 'err.red': 'Sem conexão. Verifique sua internet e tente de novo.',
    },
    'fr': {
      'titulo': 'Visites', 'visitar': 'Visiter', 'visita_de': 'En visite chez {nombre}', 'volver': 'Retour', 'cargando': 'Arrivée à la société de production…',
      'error': 'Impossible d’ouvrir la visite.', 'reintentar': 'Réessayer', 'sin_sesion': 'Connectez-vous pour visiter d’autres sociétés de production.',
      'cerrada': 'Cette société ne reçoit pas de visites pour le moment.', 'no_existe': 'Cette société n’existe pas.', 'sin_partida': 'Cette société n’a pas encore sauvegardé sa partie dans le cloud.',
      'aplaudir': 'Laisser des applaudissements 👏', 'ya_hoy': 'Vous avez déjà applaudi aujourd’hui 👏', 'aplausos': '{n} applaudissements', 'hoy': '{n} aujourd’hui',
      'premio_nota': 'Vous gagnez tous les deux {m} (jusqu’à {n} récompenses par jour).', 'aplaudido': 'Applaudissements envoyés ! +{m} pour vous et pour {nombre}.',
      'aplaudido_tope': 'Applaudissements envoyés ! Vous avez déjà reçu le maximum de récompenses aujourd’hui.', 'mensaje': 'Envoyer un message',
      'fama': 'Renommée {n}', 'dia': 'Jour {n}', 'sede': 'Siège officiel niveau {n}',
      'numeros': 'Ses chiffres', 'st_eventos': 'Événements', 'st_cinco': 'À 5 étoiles', 'st_intl': 'Internationaux', 'st_duelos': 'Duels gagnés',
      'st_personal': 'Équipe', 'st_equipos': 'Matériel', 'st_logros': 'Succès',
      'trofeos': 'Vitrine des trophées', 'trofeos_vacio': 'Pas encore de trophées.', 'tr_campeon': 'Champion', 'tr_subcampeon': 'Vice-champion', 'tr_top10': 'Top 10',
      'tr_duelo': 'Duels : {n}e place', 'tr_historia': 'Histoire terminée', 'tr_temporada': 'Date spéciale',
      'mejores': 'Meilleurs événements', 'mejores_vacio': 'Pas encore d’événements.', 'veces': '{n}× à 4-5 ⭐',
      'equipo': 'Équipe à la une', 'estrellas': 'Équipe vedette', 'flota': 'Flotte', 'flota_vacia': 'Aucun véhicule à elle.',
      'propia': 'Voici comment les autres voient votre société.', 'mi_vitrina': 'Voir ma vitrine',
      'privacidad': 'Autoriser les visites de ma société', 'privacidad_det': 'Si vous désactivez, personne ne pourra voir votre siège ni vous applaudir.',
      'guardado_on': 'C’est fait : les autres joueurs peuvent vous rendre visite.', 'guardado_off': 'C’est fait : personne ne peut visiter votre société.',
      'inicio_t': 'Visitez d’autres sociétés', 'inicio_det': 'Découvrez comment travaillent les autres joueurs de votre serveur et applaudissez-les : vous gagnez tous les deux {m}.',
      'inicio_vacio': 'Il n’y a pas encore d’autres sociétés à visiter.', 'mis_aplausos': 'Votre société a {n} applaudissements ({h} aujourd’hui).',
      'err.aplauso_ya': 'Vous avez déjà applaudi cette société aujourd’hui. Revenez demain.', 'err.aplauso_propio': 'Vous ne pouvez pas vous applaudir vous-même.',
      'err.limite': 'Trop de visites d’affilée. Attendez un instant.', 'err.red': 'Pas de connexion. Vérifiez votre internet et réessayez.',
    },
    'de': {
      'titulo': 'Besuche', 'visitar': 'Besuchen', 'visita_de': 'Zu Besuch bei {nombre}', 'volver': 'Zurück', 'cargando': 'Ankunft bei der Produktionsfirma…',
      'error': 'Der Besuch konnte nicht geöffnet werden.', 'reintentar': 'Erneut versuchen', 'sin_sesion': 'Melde dich an, um andere Produktionsfirmen zu besuchen.',
      'cerrada': 'Diese Firma empfängt gerade keine Besuche.', 'no_existe': 'Diese Firma gibt es nicht.', 'sin_partida': 'Diese Firma hat ihren Spielstand noch nicht in der Cloud gespeichert.',
      'aplaudir': 'Applaus dalassen 👏', 'ya_hoy': 'Heute schon applaudiert 👏', 'aplausos': '{n} Applaus', 'hoy': '{n} heute',
      'premio_nota': 'Ihr bekommt beide {m} (bis zu {n} Belohnungen pro Tag).', 'aplaudido': 'Applaus gesendet! +{m} für dich und für {nombre}.',
      'aplaudido_tope': 'Applaus gesendet! Du hast heute schon die maximalen Applaus-Belohnungen erhalten.', 'mensaje': 'Nachricht senden',
      'fama': 'Ruhm {n}', 'dia': 'Tag {n}', 'sede': 'Offizieller Sitz Stufe {n}',
      'numeros': 'Ihre Zahlen', 'st_eventos': 'Events', 'st_cinco': 'Mit 5 Sternen', 'st_intl': 'International', 'st_duelos': 'Gewonnene Duelle',
      'st_personal': 'Personal', 'st_equipos': 'Ausrüstung', 'st_logros': 'Erfolge',
      'trofeos': 'Trophäenregal', 'trofeos_vacio': 'Noch keine Trophäen.', 'tr_campeon': 'Meister', 'tr_subcampeon': 'Vizemeister', 'tr_top10': 'Top 10',
      'tr_duelo': 'Duelle: Platz {n}', 'tr_historia': 'Geschichte abgeschlossen', 'tr_temporada': 'Besonderer Tag',
      'mejores': 'Beste Events', 'mejores_vacio': 'Noch keine Events.', 'veces': '{n}× mit 4-5 ⭐',
      'equipo': 'Top-Personal', 'estrellas': 'Star-Personal', 'flota': 'Fuhrpark', 'flota_vacia': 'Keine eigenen Fahrzeuge.',
      'propia': 'So sehen andere deine Firma.', 'mi_vitrina': 'Mein Schaufenster ansehen',
      'privacidad': 'Besuche meiner Firma erlauben', 'privacidad_det': 'Wenn du es ausschaltest, kann niemand sonst deinen Sitz sehen oder dir Applaus geben.',
      'guardado_on': 'Fertig: Andere Spieler können dich besuchen.', 'guardado_off': 'Fertig: Niemand sonst kann deine Firma besuchen.',
      'inicio_t': 'Andere Firmen besuchen', 'inicio_det': 'Sieh dir an, wie andere Spieler deines Servers arbeiten, und gib ihnen Applaus: Ihr bekommt beide {m}.',
      'inicio_vacio': 'Es gibt noch keine anderen Firmen zum Besuchen.', 'mis_aplausos': 'Deine Firma hat {n} Applaus ({h} heute).',
      'err.aplauso_ya': 'Du hast dieser Firma heute schon applaudiert. Komm morgen wieder.', 'err.aplauso_propio': 'Du kannst dir nicht selbst applaudieren.',
      'err.limite': 'Zu viele Besuche hintereinander. Warte einen Moment.', 'err.red': 'Keine Verbindung. Prüfe dein Internet und versuche es erneut.',
    },
    'it': {
      'titulo': 'Visite', 'visitar': 'Visita', 'visita_de': 'In visita da {nombre}', 'volver': 'Indietro', 'cargando': 'Arrivo alla casa di produzione…',
      'error': 'Impossibile aprire la visita.', 'reintentar': 'Riprova', 'sin_sesion': 'Accedi al tuo account per visitare altre case di produzione.',
      'cerrada': 'Questa casa di produzione non riceve visite al momento.', 'no_existe': 'Questa casa di produzione non esiste.', 'sin_partida': 'Questa casa di produzione non ha ancora salvato la partita nel cloud.',
      'aplaudir': 'Lascia un applauso 👏', 'ya_hoy': 'Hai già applaudito oggi 👏', 'aplausos': '{n} applausi', 'hoy': '{n} oggi',
      'premio_nota': 'Guadagnate entrambi {m} (fino a {n} premi al giorno).', 'aplaudido': 'Applauso inviato! +{m} per te e per {nombre}.',
      'aplaudido_tope': 'Applauso inviato! Oggi hai già ricevuto il massimo dei premi per applausi.', 'mensaje': 'Invia messaggio',
      'fama': 'Fama {n}', 'dia': 'Giorno {n}', 'sede': 'Sede ufficiale livello {n}',
      'numeros': 'I suoi numeri', 'st_eventos': 'Eventi', 'st_cinco': 'A 5 stelle', 'st_intl': 'Internazionali', 'st_duelos': 'Duelli vinti',
      'st_personal': 'Personale', 'st_equipos': 'Attrezzatura', 'st_logros': 'Obiettivi',
      'trofeos': 'Vetrina dei trofei', 'trofeos_vacio': 'Ancora nessun trofeo.', 'tr_campeon': 'Campione', 'tr_subcampeon': 'Vicecampione', 'tr_top10': 'Top 10',
      'tr_duelo': 'Duelli: posto {n}', 'tr_historia': 'Storia completata', 'tr_temporada': 'Data speciale',
      'mejores': 'Migliori eventi', 'mejores_vacio': 'Ancora nessun evento.', 'veces': '{n}× con 4-5 ⭐',
      'equipo': 'Personale in evidenza', 'estrellas': 'Personale stella', 'flota': 'Flotta', 'flota_vacia': 'Nessun veicolo proprio.',
      'propia': 'Così gli altri vedono la tua casa di produzione.', 'mi_vitrina': 'Vedi la mia vetrina',
      'privacidad': 'Consenti visite alla mia casa di produzione', 'privacidad_det': 'Se lo disattivi, nessun altro potrà vedere la tua sede né lasciarti applausi.',
      'guardado_on': 'Fatto: gli altri giocatori possono visitarti.', 'guardado_off': 'Fatto: nessun altro può visitare la tua casa di produzione.',
      'inicio_t': 'Visita altre case di produzione', 'inicio_det': 'Guarda come lavorano gli altri giocatori del tuo server e lascia un applauso: guadagnate entrambi {m}.',
      'inicio_vacio': 'Non ci sono ancora altre case di produzione da visitare.', 'mis_aplausos': 'La tua casa di produzione ha {n} applausi ({h} oggi).',
      'err.aplauso_ya': 'Hai già applaudito questa casa di produzione oggi. Torna domani.', 'err.aplauso_propio': 'Non puoi applaudire te stesso.',
      'err.limite': 'Troppe visite di fila. Aspetta un momento.', 'err.red': 'Nessuna connessione. Controlla internet e riprova.',
    },
    'ru': {
      'titulo': 'Визиты', 'visitar': 'В гости', 'visita_de': 'В гостях у {nombre}', 'volver': 'Назад', 'cargando': 'Подъезжаем к студии…',
      'error': 'Не удалось открыть визит.', 'reintentar': 'Повторить', 'sin_sesion': 'Войдите в аккаунт, чтобы ходить в гости к другим студиям.',
      'cerrada': 'Эта студия сейчас не принимает гостей.', 'no_existe': 'Такой студии нет.', 'sin_partida': 'Эта студия ещё не сохранила игру в облаке.',
      'aplaudir': 'Похлопать 👏', 'ya_hoy': 'Сегодня вы уже хлопали 👏', 'aplausos': 'Аплодисменты: {n}', 'hoy': 'сегодня: {n}',
      'premio_nota': 'Вы оба получаете {m} (до {n} наград в день).', 'aplaudido': 'Аплодисменты отправлены! +{m} вам и {nombre}.',
      'aplaudido_tope': 'Аплодисменты отправлены! Сегодня вы уже получили максимум наград за аплодисменты.', 'mensaje': 'Написать сообщение',
      'fama': 'Слава {n}', 'dia': 'День {n}', 'sede': 'Официальная база, уровень {n}',
      'numeros': 'Их цифры', 'st_eventos': 'События', 'st_cinco': 'На 5 звёзд', 'st_intl': 'Международные', 'st_duelos': 'Победы в дуэлях',
      'st_personal': 'Персонал', 'st_equipos': 'Оборудование', 'st_logros': 'Достижения',
      'trofeos': 'Полка с трофеями', 'trofeos_vacio': 'Пока без трофеев.', 'tr_campeon': 'Чемпион', 'tr_subcampeon': 'Серебро', 'tr_top10': 'Топ-10',
      'tr_duelo': 'Дуэли: {n}-е место', 'tr_historia': 'История пройдена', 'tr_temporada': 'Особая дата',
      'mejores': 'Лучшие события', 'mejores_vacio': 'Событий пока нет.', 'veces': '{n}× на 4-5 ⭐',
      'equipo': 'Лучший персонал', 'estrellas': 'Звёздный персонал', 'flota': 'Автопарк', 'flota_vacia': 'Своих машин нет.',
      'propia': 'Так вашу студию видят другие.', 'mi_vitrina': 'Моя витрина',
      'privacidad': 'Разрешить визиты в мою студию', 'privacidad_det': 'Если выключить, никто не сможет увидеть вашу базу и похлопать вам.',
      'guardado_on': 'Готово: другие игроки могут заходить к вам.', 'guardado_off': 'Готово: никто больше не может зайти в вашу студию.',
      'inicio_t': 'Загляните к другим студиям', 'inicio_det': 'Посмотрите, как работают другие игроки вашего сервера, и похлопайте им: вы оба получите {m}.',
      'inicio_vacio': 'Пока нет других студий для визита.', 'mis_aplausos': 'У вашей студии {n} аплодисментов (сегодня {h}).',
      'err.aplauso_ya': 'Вы уже хлопали этой студии сегодня. Приходите завтра.', 'err.aplauso_propio': 'Нельзя хлопать самому себе.',
      'err.limite': 'Слишком много визитов подряд. Подождите немного.', 'err.red': 'Нет соединения. Проверьте интернет и повторите.',
    },
    'tr': {
      'titulo': 'Ziyaretler', 'visitar': 'Ziyaret et', 'visita_de': '{nombre} ziyareti', 'volver': 'Geri', 'cargando': 'Yapım şirketine varılıyor…',
      'error': 'Ziyaret açılamadı.', 'reintentar': 'Tekrar dene', 'sin_sesion': 'Diğer şirketleri ziyaret etmek için hesabına gir.',
      'cerrada': 'Bu şirket şu an ziyaretçi kabul etmiyor.', 'no_existe': 'Böyle bir şirket yok.', 'sin_partida': 'Bu şirket oyununu henüz buluta kaydetmedi.',
      'aplaudir': 'Alkış bırak 👏', 'ya_hoy': 'Bugün zaten alkışladın 👏', 'aplausos': '{n} alkış', 'hoy': 'bugün {n}',
      'premio_nota': 'İkiniz de {m} kazanırsınız (günde en fazla {n} ödül).', 'aplaudido': 'Alkış gönderildi! Sana ve {nombre} için +{m}.',
      'aplaudido_tope': 'Alkış gönderildi! Bugünkü en fazla alkış ödülünü zaten aldın.', 'mensaje': 'Mesaj gönder',
      'fama': 'Ün {n}', 'dia': 'Gün {n}', 'sede': 'Resmî merkez seviye {n}',
      'numeros': 'Rakamları', 'st_eventos': 'Etkinlikler', 'st_cinco': '5 yıldızlı', 'st_intl': 'Uluslararası', 'st_duelos': 'Kazanılan düellolar',
      'st_personal': 'Personel', 'st_equipos': 'Ekipman', 'st_logros': 'Başarımlar',
      'trofeos': 'Kupa rafı', 'trofeos_vacio': 'Henüz kupa yok.', 'tr_campeon': 'Şampiyon', 'tr_subcampeon': 'İkinci', 'tr_top10': 'İlk 10',
      'tr_duelo': 'Düellolar: {n}. sıra', 'tr_historia': 'Hikâye tamamlandı', 'tr_temporada': 'Özel gün',
      'mejores': 'En iyi etkinlikler', 'mejores_vacio': 'Henüz etkinlik yok.', 'veces': '4-5 ⭐ ile {n}×',
      'equipo': 'Öne çıkan personel', 'estrellas': 'Yıldız personel', 'flota': 'Filo', 'flota_vacia': 'Kendi aracı yok.',
      'propia': 'Diğerleri şirketini böyle görüyor.', 'mi_vitrina': 'Vitrinimi gör',
      'privacidad': 'Şirketime ziyaretlere izin ver', 'privacidad_det': 'Kapatırsan kimse merkezini göremez ve sana alkış bırakamaz.',
      'guardado_on': 'Tamam: diğer oyuncular seni ziyaret edebilir.', 'guardado_off': 'Tamam: artık kimse şirketini ziyaret edemez.',
      'inicio_t': 'Diğer şirketleri ziyaret et', 'inicio_det': 'Sunucundaki diğer oyuncuların nasıl çalıştığına bak ve alkış bırak: ikiniz de {m} kazanırsınız.',
      'inicio_vacio': 'Henüz ziyaret edilecek başka şirket yok.', 'mis_aplausos': 'Şirketinin {n} alkışı var (bugün {h}).',
      'err.aplauso_ya': 'Bu şirketi bugün zaten alkışladın. Yarın tekrar gel.', 'err.aplauso_propio': 'Kendini alkışlayamazsın.',
      'err.limite': 'Arka arkaya çok fazla ziyaret. Biraz bekle.', 'err.red': 'Bağlantı yok. İnternetini kontrol edip tekrar dene.',
    },
    'id': {
      'titulo': 'Kunjungan', 'visitar': 'Kunjungi', 'visita_de': 'Berkunjung ke {nombre}', 'volver': 'Kembali', 'cargando': 'Tiba di rumah produksi…',
      'error': 'Kunjungan tidak bisa dibuka.', 'reintentar': 'Coba lagi', 'sin_sesion': 'Masuk ke akunmu untuk mengunjungi rumah produksi lain.',
      'cerrada': 'Rumah produksi ini sedang tidak menerima kunjungan.', 'no_existe': 'Rumah produksi itu tidak ada.', 'sin_partida': 'Rumah produksi ini belum menyimpan permainannya di cloud.',
      'aplaudir': 'Beri tepuk tangan 👏', 'ya_hoy': 'Kamu sudah bertepuk tangan hari ini 👏', 'aplausos': '{n} tepuk tangan', 'hoy': '{n} hari ini',
      'premio_nota': 'Kalian berdua dapat {m} (maksimal {n} hadiah per hari).', 'aplaudido': 'Tepuk tangan terkirim! +{m} untukmu dan untuk {nombre}.',
      'aplaudido_tope': 'Tepuk tangan terkirim! Hari ini kamu sudah mendapat hadiah tepuk tangan maksimal.', 'mensaje': 'Kirim pesan',
      'fama': 'Ketenaran {n}', 'dia': 'Hari {n}', 'sede': 'Markas resmi level {n}',
      'numeros': 'Angka mereka', 'st_eventos': 'Acara', 'st_cinco': 'Bintang 5', 'st_intl': 'Internasional', 'st_duelos': 'Duel dimenangkan',
      'st_personal': 'Kru', 'st_equipos': 'Peralatan', 'st_logros': 'Pencapaian',
      'trofeos': 'Rak trofi', 'trofeos_vacio': 'Belum ada trofi.', 'tr_campeon': 'Juara', 'tr_subcampeon': 'Runner-up', 'tr_top10': '10 Besar',
      'tr_duelo': 'Duel: peringkat {n}', 'tr_historia': 'Cerita selesai', 'tr_temporada': 'Tanggal spesial',
      'mejores': 'Acara terbaik', 'mejores_vacio': 'Belum ada acara.', 'veces': '{n}× dengan 4-5 ⭐',
      'equipo': 'Kru unggulan', 'estrellas': 'Kru bintang', 'flota': 'Armada', 'flota_vacia': 'Tidak punya kendaraan sendiri.',
      'propia': 'Begini orang lain melihat rumah produksimu.', 'mi_vitrina': 'Lihat etalaseku',
      'privacidad': 'Izinkan kunjungan ke rumah produksiku', 'privacidad_det': 'Jika dimatikan, tidak ada yang bisa melihat markasmu atau memberimu tepuk tangan.',
      'guardado_on': 'Beres: pemain lain bisa mengunjungimu.', 'guardado_off': 'Beres: tidak ada lagi yang bisa mengunjungi rumah produksimu.',
      'inicio_t': 'Kunjungi rumah produksi lain', 'inicio_det': 'Lihat cara kerja pemain lain di servermu dan beri tepuk tangan: kalian berdua dapat {m}.',
      'inicio_vacio': 'Belum ada rumah produksi lain untuk dikunjungi.', 'mis_aplausos': 'Rumah produksimu punya {n} tepuk tangan ({h} hari ini).',
      'err.aplauso_ya': 'Kamu sudah bertepuk tangan untuk rumah produksi ini hari ini. Kembali besok.', 'err.aplauso_propio': 'Kamu tidak bisa bertepuk tangan untuk dirimu sendiri.',
      'err.limite': 'Terlalu banyak kunjungan beruntun. Tunggu sebentar.', 'err.red': 'Tidak ada koneksi. Periksa internetmu dan coba lagi.',
    },
    'zh-CN': {
      'titulo': '拜访', 'visitar': '拜访', 'visita_de': '正在拜访 {nombre}', 'volver': '返回', 'cargando': '正在前往制作公司…',
      'error': '无法打开拜访。', 'reintentar': '重试', 'sin_sesion': '登录账号后才能拜访其他制作公司。',
      'cerrada': '这家制作公司暂时不接受拜访。', 'no_existe': '这家制作公司不存在。', 'sin_partida': '这家制作公司还没有把存档保存到云端。',
      'aplaudir': '送上掌声 👏', 'ya_hoy': '今天已经鼓过掌了 👏', 'aplausos': '{n} 次掌声', 'hoy': '今天 {n}',
      'premio_nota': '你们双方各得 {m}（每天最多 {n} 次奖励）。', 'aplaudido': '掌声已送出！你和 {nombre} 各得 +{m}。',
      'aplaudido_tope': '掌声已送出！今天的掌声奖励你已领满。', 'mensaje': '发送消息',
      'fama': '名气 {n}', 'dia': '第 {n} 天', 'sede': '官方总部 {n} 级',
      'numeros': '他们的数据', 'st_eventos': '活动', 'st_cinco': '5 星活动', 'st_intl': '国际活动', 'st_duelos': '对决胜场',
      'st_personal': '员工', 'st_equipos': '设备', 'st_logros': '成就',
      'trofeos': '奖杯陈列架', 'trofeos_vacio': '还没有奖杯。', 'tr_campeon': '冠军', 'tr_subcampeon': '亚军', 'tr_top10': '前 10',
      'tr_duelo': '对决：第 {n} 名', 'tr_historia': '剧情通关', 'tr_temporada': '特别节日',
      'mejores': '最佳活动', 'mejores_vacio': '还没有活动。', 'veces': '4-5 ⭐ {n} 次',
      'equipo': '明星员工', 'estrellas': '星级员工', 'flota': '车队', 'flota_vacia': '没有自有车辆。',
      'propia': '别人眼中的你的制作公司就是这样。', 'mi_vitrina': '查看我的展示',
      'privacidad': '允许别人拜访我的制作公司', 'privacidad_det': '关闭后，别人无法看到你的总部，也无法为你鼓掌。',
      'guardado_on': '完成：其他玩家可以拜访你了。', 'guardado_off': '完成：其他人无法再拜访你的制作公司。',
      'inicio_t': '拜访其他制作公司', 'inicio_det': '看看同服务器的其他玩家怎么工作，并为他们鼓掌：你们双方各得 {m}。',
      'inicio_vacio': '还没有其他制作公司可以拜访。', 'mis_aplausos': '你的制作公司获得了 {n} 次掌声（今天 {h} 次）。',
      'err.aplauso_ya': '今天你已经为这家制作公司鼓过掌了，明天再来吧。', 'err.aplauso_propio': '不能为自己鼓掌。',
      'err.limite': '连续拜访太多次，请稍等。', 'err.red': '没有网络连接，请检查后重试。',
    },
  };
  const DINERO = 50;
  const ERRORES = { visitas_cerradas: 'cerrada', productora_no_existe: 'no_existe', aplauso_ya: 'err.aplauso_ya', aplauso_propio: 'err.aplauso_propio', limite_intentos: 'err.limite', sesion_requerida: 'sin_sesion' };

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { return 'es'; } };
  function T(k, p) {
    const d = TRAD[idioma()] || {};
    let s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : Object.prototype.hasOwnProperty.call(ES, k) ? ES[k] : k;
    if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] != null ? String(p[x]) : m));
    return s;
  }
  const TL = (t) => { try { return root.I18N ? root.I18N.TL(t) : t; } catch (e) { return t; } };
  const G = () => root.Game || null;
  const A = () => root.Art || null;
  const num = (n) => { try { return root.I18N && root.I18N.num ? root.I18N.num(n) : String(n); } catch (e) { return String(n); } };
  const dinero = (m) => { try { if (st.ctx && typeof st.ctx.M === 'function') return st.ctx.M(m); if (root.I18N && root.I18N.money) return root.I18N.money(m); } catch (e) { /* abajo */ } return '$' + m; };
  // Título de la fila plegable de Inicio (js/ui.js PL_INFO.visitas → 'inicio.pl.visitas'): la clave se agrega aquí al diccionario cargado
  function claveInicio() {
    try {
      const L = root.I18N_LANG;
      if (!L) return;
      Object.keys(L).forEach((c) => { if (L[c] && typeof L[c] === 'object' && L[c]['inicio.pl.visitas'] === undefined) L[c]['inicio.pl.visitas'] = (TRAD[c] || ES).inicio_t || ES.inicio_t; });
    } catch (e) { /* nada */ }
  }

  const st = { ctx: null, sug: null, sugEn: 0, cargandoSug: false, actual: null, cargando: false, error: '', id: null, enviando: false };

  /* ---------- Servidor ---------- */
  async function pedir(method, ruta, body) {
    const h = { 'Content-Type': 'application/json', 'X-Envivo': '1' };
    try { if (root.I18N && root.I18N.idioma) h['Accept-Language'] = root.I18N.idioma; } catch (e) { /* nada */ }
    let r;
    try { r = await fetch(ruta, { method, headers: h, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) }); } catch (e) { const x = new Error(T('err.red')); x.codigo = 'red'; throw x; }
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || j.ok === false) {
      const c = j && j.codigo;
      let t = c && ERRORES[c] ? T(ERRORES[c]) : '';
      if (!t && c) { try { if (root.I18N && root.I18N.T.has('error.' + c)) t = root.I18N.T('error.' + c, j); } catch (e) { /* nada */ } }
      const x = new Error(t || (j && j.error ? TL(j.error) : T('error')));
      x.codigo = c || null; x.status = r.status;
      throw x;
    }
    return j;
  }
  const yo = () => { try { const E = root.Api && root.Api.estado; return E && E.logueado && E.jugador ? Number(E.jugador.id) : null; } catch (e) { return null; } };
  const logueado = () => { try { return !!(root.Api && root.Api.disponible !== false && root.Api.logueado && root.Api.logueado()); } catch (e) { return false; } };
  const toast = (t) => { try { if (st.ctx && st.ctx.toast) return st.ctx.toast(t); } catch (e) { /* abajo */ } const el = document.getElementById('vis-aviso'); if (el) { el.textContent = t; el.hidden = false; } };
  const snd = (n) => { try { if (st.ctx && st.ctx.snd && st.ctx.snd.play) st.ctx.snd.play(n); } catch (e) { /* nada */ } };

  /* ---------- Su sede con el arte de verdad ----------
     Una partida "de mentira" con lo justo para que Art.hq y Decoracion.capa dibujen SU local: el tamaño (personas +
     equipos propios) da la misma etapa que mandó el servidor; las cámaras/especiales, su decoración, cosméticos y nombre. */
  const UMBRAL = [0, 15, 23, 31];
  function estadoVisita(v) {
    v = v || {};
    const g = G();
    const etapa = Math.max(0, Math.min(3, Number(v.etapa) || 0));
    const conocidos = (Array.isArray(v.equipo_hq) ? v.equipo_hq : []).filter((t) => typeof t === 'string' && g && g.CATALOG && g.CATALOG[t]).slice(0, 11);
    const equip = conocidos.map((t, i) => ({ id: 90000 + i, type: t, condition: 90 }));
    const personal = Math.max(1, Number(v.personal) || 1);
    const n = etapa === 0 ? Math.max(1, Math.min(personal, 14 - equip.length)) : Math.max(1, UMBRAL[etapa] - equip.length);
    const staff = Array.from({ length: n }, (_, i) => ({ id: 1 + i, name: '', role: 'camarografo', tier: 'junior', skill: 1, morale: 100, events: 0, owner: i === 0 }));
    const tTemp = (Array.isArray(v.trofeos) ? v.trofeos : []).filter((t) => t && t.tipo === 'temporada').map((t) => ({ key: t.key, anio: t.anio }));
    const s = (v.stats && typeof v.stats === 'object') ? v.stats : {};
    return {
      v: 3, visita: true, day: Math.max(1, Number(v.dia) || 1), chapter: Number(v.capitulo) || 0, storyDone: !!v.historia_completa, rep: Number(v.fama) || 0,
      productora: v.productora || v.alias || '', staff, equip, stock: {}, contracts: [], candidates: [], log: [], pending: [], avisos: [],
      decor: { items: (v.decor && Array.isArray(v.decor.items) ? v.decor.items : []).map((x) => Object.assign({}, x)), gastado: 0, proxVisita: 0, visitas: 0 },
      temporada: { prog: {}, trofeos: tTemp, cosmeticos: Array.isArray(v.cosmeticos) ? v.cosmeticos.slice() : [] },
      stats: { events: Number(s.eventos) || 0, fiveStars: Number(s.cinco_estrellas) || 0, earned: 0, best: {}, good: {}, duels: { won: Number(s.duelos_ganados) || 0, lost: 0 }, intl: Number(s.internacionales) || 0 },
    };
  }
  function dibujoSede(v) {
    const a = A();
    if (!a || typeof a.hq !== 'function') return '';
    try { return a.hq(estadoVisita(v)); } catch (e) { return ''; }
  }

  /* ---------- Pantalla ---------- */
  function css() {
    if (document.getElementById('visitas-css')) return;
    const s = document.createElement('style');
    s.id = 'visitas-css';
    s.textContent = `
      #vis-panel{position:fixed;inset:0;z-index:26;background:var(--bg,#0d0f14);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
      #vis-panel[hidden]{display:none}
      .vis-top{display:flex;align-items:center;gap:8px;padding:10px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line,#2a3242)}
      .vis-top b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px}
      .vis-top .btn{margin:0;flex:none;width:auto}
      .vis-cuerpo{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:12px}
      .vis-cuerpo>*{flex-shrink:0;margin-top:0;margin-bottom:0}
      .vis-hq{border-radius:12px;overflow:hidden;border:1px solid var(--line,#2a3242);background:#10131a}
      .vis-hq svg{display:block;width:100%;height:auto}
      .vis-nom{display:flex;gap:10px;align-items:flex-start;min-width:0}
      .vis-nom .g{flex:1;min-width:0}
      .vis-nom h2{margin:0;font-size:20px;line-height:1.15;overflow-wrap:anywhere}
      .vis-tags{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:6px}
      .vis-tag{font-size:12px;border:1px solid var(--line,#2a3242);border-radius:999px;padding:2px 8px;color:var(--muted,#8b95a8);white-space:nowrap}
      .vis-tag.as{font-weight:700}
      .vis-ap{display:flex;flex-direction:column;gap:6px}
      .vis-ap .btn{margin:0}
      .vis-ap .cnt{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--muted,#8b95a8)}
      .vis-ap .cnt b{color:var(--text,#e9edf5);font-size:15px}
      .vis-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
      .vis-st{background:var(--panel2,#161b26);border:1px solid var(--line,#2a3242);border-radius:10px;padding:8px;min-width:0}
      .vis-st b{display:block;font-size:18px;font-family:"JetBrains Mono",ui-monospace,monospace}
      .vis-st small{color:var(--muted,#8b95a8);font-size:11px;display:block;overflow-wrap:anywhere}
      .vis-estante{display:flex;flex-wrap:wrap;gap:8px;padding:10px 8px 0;border-bottom:6px solid #6b4a2a;border-radius:4px;background:linear-gradient(#0000 70%,#2a1d12)}
      .vis-tr{width:76px;text-align:center;font-size:11px;line-height:1.2;color:var(--muted,#8b95a8);padding-bottom:6px;overflow-wrap:anywhere}
      .vis-tr svg{display:block;margin:0 auto 2px}
      .vis-tr b{display:block;color:var(--text,#e9edf5);font-size:11px}
      .vis-fila{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line,#2a3242);font-size:14px;min-width:0}
      .vis-fila:last-child{border-bottom:0}
      .vis-fila span:first-child{min-width:0;overflow-wrap:anywhere}
      .vis-fila .d{flex:none;color:var(--muted,#8b95a8);font-size:12px;text-align:end}
      .vis-card h3{margin:0 0 6px;font-size:15px}
      .vis-priv{display:flex;align-items:center;gap:10px;cursor:pointer}
      .vis-priv input{width:22px;height:22px;flex:none;accent-color:var(--red,#ff3b3b)}
      .vis-priv span{min-width:0}
      .vis-sug{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line,#2a3242);min-width:0}
      .vis-sug:last-child{border-bottom:0}
      .vis-sug .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .vis-sug .btn{margin:0;flex:none;width:auto}
      .btn.vis-btn{width:auto;display:inline-flex;align-items:center;gap:4px}
      #vis-aviso{font-size:13px;color:var(--amber,#ffd27a)}`;
    document.head.appendChild(s);
  }
  function panel() {
    let p = document.getElementById('vis-panel');
    if (p) return p;
    css();
    p = document.createElement('div');
    p.id = 'vis-panel'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true');
    p.innerHTML = `<div class="vis-top"><button class="btn sm" data-vis="cerrar">← ${esc(T('volver'))}</button><b id="vis-titulo">${esc(T('titulo'))}</b></div><div class="vis-cuerpo" id="vis-cuerpo"></div>`;
    document.body.appendChild(p);
    p.addEventListener('click', clicPanel);
    p.addEventListener('change', (e) => { const x = e.target.closest('[data-vis="privacidad"]'); if (x) cambiarPrivacidad(x); });
    return p;
  }
  function trofeoSvg(color, sz) {
    const c = color || '#ffd27a';
    return `<svg width="${sz || 40}" height="${sz || 40}" viewBox="0 0 40 40" aria-hidden="true"><path d="M12 6h16v8a8 8 0 01-16 0z" fill="${c}"/><path d="M12 9H7a5 5 0 005 7M28 9h5a5 5 0 01-5 7" fill="none" stroke="${c}" stroke-width="2"/><rect x="18" y="21" width="4" height="7" fill="${c}"/><rect x="12" y="28" width="16" height="5" rx="1.5" fill="#6b4a2a"/><path d="M15 8h3v6h-3z" fill="#fff" opacity=".35"/></svg>`;
  }
  function trofeosHtml(v) {
    const L = Array.isArray(v.trofeos) ? v.trofeos : [];
    if (!L.length) return `<p class="small muted" style="margin:0">${esc(T('trofeos_vacio'))}</p>`;
    const g = G();
    const temp = (k) => { try { const t = g && g.tx ? g.tx('temp.' + k + '.trofeo') : ''; return t && t !== 'temp.' + k + '.trofeo' ? TL(t) : T('tr_temporada'); } catch (e) { return T('tr_temporada'); } };
    return `<div class="vis-estante">${L.slice(0, 16).map((t) => {
      if (t.tipo === 'copa') { const col = t.clave === 'campeon' ? '#ffd27a' : t.clave === 'subcampeon' ? '#c5ccd6' : '#d9905a'; return `<div class="vis-tr" data-trofeo="copa">${trofeoSvg(col)}<b>${esc(T('tr_' + t.clave))}</b>${esc(t.nombre || '')}</div>`; }
      if (t.tipo === 'duelo') return `<div class="vis-tr" data-trofeo="duelo">${trofeoSvg(t.puesto === 1 ? '#ffd27a' : t.puesto <= 3 ? '#c5ccd6' : '#7fb3ff')}<b>${esc(T('tr_duelo', { n: t.puesto }))}</b>${esc(t.temporada || '')}</div>`;
      if (t.tipo === 'temporada') return `<div class="vis-tr" data-trofeo="temporada">${trofeoSvg('#ff8fb1')}<b>${esc(temp(t.key))}</b>${t.anio ? esc(t.anio) : ''}</div>`;
      if (t.tipo === 'historia') return `<div class="vis-tr" data-trofeo="historia">${trofeoSvg('#7dff9a')}<b>${esc(T('tr_historia'))}</b></div>`;
      return '';
    }).join('')}</div>`;
  }
  const nombreEvento = (k) => { try { const e = G() && G().EVENT_TYPES[k]; return e && e.name ? TL(e.name) : k; } catch (e) { return k; } };
  const nombreRol = (k) => { try { const r = G() && G().ROLES[k]; return r && r.name ? TL(r.name) : k; } catch (e) { return k; } };
  const nombreItem = (k) => { try { const it = G() && G().CATALOG[k]; return it && it.name ? TL(it.name) : k; } catch (e) { return k; } };
  const nombreNivel = (k) => { try { const t = G() && G().TIERS[k]; return t && t.name ? TL(t.name) : ''; } catch (e) { return ''; } };

  function pintar() {
    const p = panel();
    const el = p.querySelector('#vis-cuerpo');
    const tit = p.querySelector('#vis-titulo');
    if (st.cargando) { el.innerHTML = `<p class="small muted" style="text-align:center;margin:30px 0">${esc(T('cargando'))}</p>`; return; }
    if (st.error) {
      el.innerHTML = `<div class="card"><p style="margin:0 0 10px">${esc(st.error)}</p>${st.errorCodigo === 'visitas_cerradas' || st.errorCodigo === 'productora_no_existe' ? '' : `<button class="btn" data-vis="reintentar">${esc(T('reintentar'))}</button>`}</div>`;
      return;
    }
    const d = st.actual;
    if (!d) { el.innerHTML = ''; return; }
    const v = d.vitrina || {};
    const nombre = v.productora || v.alias || '';
    tit.textContent = d.propio ? T('mi_vitrina') : T('visita_de', { nombre });
    const ap = d.aplausos || { total: 0, hoy: 0, ya_hoy: false };
    const as = v.asociacion;
    const color = as && /^#[0-9a-f]{6}$/i.test(as.color || '') ? as.color : 'var(--amber,#ffd27a)';
    const s = v.stats || {};
    const stat = (n, k) => `<div class="vis-st"><b>${esc(num(Number(n) || 0))}</b><small>${esc(T(k))}</small></div>`;
    const dm = !d.propio && root.Chat && (typeof root.Chat.abrirPrivado === 'function' || typeof root.Chat.abrirDM === 'function');
    const mejores = (v.mejores || []).map((m) => `<div class="vis-fila"><span>${esc(nombreEvento(m.tipo))}</span><span class="d">${'⭐'.repeat(Math.max(0, Math.min(5, m.estrellas)))}${m.veces ? '<br>' + esc(T('veces', { n: m.veces })) : ''}</span></div>`).join('');
    const dest = (v.destacados || []).map((x) => `<div class="vis-fila"><span>${esc(x.nombre || nombreRol(x.rol))}</span><span class="d">${esc(nombreRol(x.rol))}${x.nivel && nombreNivel(x.nivel) ? ' · ' + esc(nombreNivel(x.nivel)) : ''} · ${'★'.repeat(Math.max(1, Math.min(10, x.habilidad || 1)))}</span></div>`).join('');
    const est = (v.estrellas || []).map((x) => `<div class="vis-fila"><span>🌟 ${esc(x.nombre)}</span><span class="d">${esc(nombreRol(x.rol))}</span></div>`).join('');
    const flota = (v.flota || []).map((x) => `<div class="vis-fila"><span>${esc(nombreItem(x.tipo))}</span><span class="d">× ${esc(x.n)}</span></div>`).join('');
    el.innerHTML = `
      <div class="vis-hq" data-vis-hq="${esc(v.etapa)}">${dibujoSede(v)}</div>
      <div class="card vis-nom"><div class="g"><h2>${esc(nombre)}</h2>
        ${v.productora && v.alias && v.productora !== v.alias ? `<div class="small muted">${esc(v.alias)}</div>` : ''}
        <div class="vis-tags">${as ? `<span class="vis-tag as" style="color:${color};border-color:${color}">[${esc(as.siglas)}] ${esc(as.nombre)}</span>` : ''}
          <span class="vis-tag">${esc(T('fama', { n: v.fama_publica != null ? v.fama_publica : v.fama }))}</span><span class="vis-tag">${esc(T('dia', { n: num(v.dia || 1) }))}</span>
          ${v.sede_nivel ? `<span class="vis-tag">${esc(T('sede', { n: v.sede_nivel }))}</span>` : ''}</div>
        ${v.sin_partida ? `<p class="small muted" style="margin:8px 0 0">${esc(T('sin_partida'))}</p>` : ''}
        ${d.propio ? `<p class="small muted" style="margin:8px 0 0">${esc(T('propia'))}</p>` : ''}</div></div>
      <div class="card vis-ap">
        <div class="cnt"><span>👏 <b data-vis-total>${esc(T('aplausos', { n: num(ap.total) }))}</b></span><span data-vis-hoy>${esc(T('hoy', { n: num(ap.hoy) }))}</span></div>
        ${d.propio ? privacidadHtml(d.permitir !== false) : `<button class="btn main" data-vis="aplaudir"${d.puede_aplaudir && !st.enviando ? '' : ' disabled'}>${esc(d.puede_aplaudir ? T('aplaudir') : T('ya_hoy'))}</button>
        <div class="small muted">${esc(T('premio_nota', { m: dinero((d.premio && d.premio.dinero) || DINERO), n: (d.premio && d.premio.tope_dia) || 10 }))}</div>`}
        ${dm ? `<button class="btn" data-vis="mensaje">💬 ${esc(T('mensaje'))}</button>` : ''}
        <div id="vis-aviso" hidden></div></div>
      <div class="card vis-card"><h3>${esc(T('trofeos'))}</h3>${trofeosHtml(v)}</div>
      <div class="card vis-card"><h3>${esc(T('numeros'))}</h3><div class="vis-grid">${stat(s.eventos, 'st_eventos')}${stat(s.cinco_estrellas, 'st_cinco')}${stat(s.internacionales, 'st_intl')}${stat(s.duelos_ganados, 'st_duelos')}${stat(v.personal, 'st_personal')}${stat(v.equipos, 'st_equipos')}${v.logros != null ? stat(v.logros, 'st_logros') : ''}</div></div>
      <div class="card vis-card"><h3>${esc(T('mejores'))}</h3>${mejores || `<p class="small muted" style="margin:0">${esc(T('mejores_vacio'))}</p>`}</div>
      ${dest || est ? `<div class="card vis-card">${dest ? `<h3>${esc(T('equipo'))}</h3>${dest}` : ''}${est ? `<h3 style="margin-top:${dest ? 10 : 0}px">${esc(T('estrellas'))}</h3>${est}` : ''}</div>` : ''}
      <div class="card vis-card"><h3>${esc(T('flota'))}</h3>${flota || `<p class="small muted" style="margin:0">${esc(T('flota_vacia'))}</p>`}</div>`;
  }
  function privacidadHtml(on) {
    return `<label class="vis-priv"><input type="checkbox" data-vis="privacidad"${on ? ' checked' : ''}><span><b>${esc(T('privacidad'))}</b><br><small class="muted">${esc(T('privacidad_det'))}</small></span></label>`;
  }

  async function cargar(id) {
    st.cargando = true; st.error = ''; st.errorCodigo = null; pintar();
    try {
      const d = await pedir('GET', '/api/visitas/vitrina?jugador_id=' + encodeURIComponent(id));
      if (d.propio) { try { const a = await pedir('GET', '/api/visitas/ajustes'); d.permitir = a.permitir; } catch (e) { d.permitir = true; } }
      if (st.id !== id) return;
      st.actual = d;
    } catch (e) {
      if (st.id !== id) return;
      st.error = e.message || T('error'); st.errorCodigo = e.codigo || null; st.actual = null;
    } finally {
      if (st.id === id) { st.cargando = false; pintar(); }
    }
  }
  function abrir(id) {
    id = Number(id);
    if (!Number.isFinite(id) || id < 1) return;
    const p = panel();
    p.hidden = false;
    if (!logueado()) { st.cargando = false; st.actual = null; st.error = T('sin_sesion'); st.errorCodigo = 'sesion_requerida'; pintar(); return; }
    st.id = id; st.actual = null;
    snd('tap');
    cargar(id);
  }
  function cerrar() { const p = document.getElementById('vis-panel'); if (p) p.hidden = true; st.id = null; }

  async function aplaudir() {
    const d = st.actual;
    if (!d || d.propio || !d.puede_aplaudir || st.enviando) return;
    st.enviando = true; pintar();
    try {
      const r = await pedir('POST', '/api/visitas/aplaudir', { jugador_id: d.vitrina.jugador_id });
      d.aplausos = r.aplausos; d.puede_aplaudir = false;
      snd('stars');
      const nombre = d.vitrina.productora || d.vitrina.alias || '';
      st.enviando = false; pintar();
      toast(r.premio && r.premio.dinero ? T('aplaudido', { m: dinero(r.premio.dinero), nombre }) : T('aplaudido_tope'));
      // El dinero llega como entrega del servidor: el juego la aplica al refrescar el estado
      try { if (st.ctx && typeof st.ctx.sincronizar === 'function') st.ctx.sincronizar(); } catch (e) { /* la próxima vez */ }
      st.sugEn = 0;
    } catch (e) {
      st.enviando = false;
      if (e.codigo === 'aplauso_ya') d.puede_aplaudir = false;
      pintar(); toast(e.message);
    }
  }
  async function cambiarPrivacidad(input) {
    const on = !!input.checked;
    input.disabled = true;
    try {
      const r = await pedir('POST', '/api/visitas/ajustes', { permitir: on });
      if (st.actual && st.actual.propio) st.actual.permitir = r.permitir;
      if (st.sug) st.sug.permitir = r.permitir;
      document.querySelectorAll('[data-vis="privacidad"]').forEach((x) => { x.checked = !!r.permitir; });
      toast(r.permitir ? T('guardado_on') : T('guardado_off'));
    } catch (e) { input.checked = !on; toast(e.message); } finally { input.disabled = false; }
  }
  function clicPanel(e) {
    const b = e.target.closest('[data-vis]');
    if (!b || b.disabled) return;
    const a = b.dataset.vis;
    if (a === 'cerrar') { snd('tap'); cerrar(); }
    else if (a === 'reintentar' && st.id) cargar(st.id);
    else if (a === 'aplaudir') aplaudir();
    else if (a === 'mensaje' && st.actual) {
      const v = st.actual.vitrina, C = root.Chat;
      try { (C.abrirPrivado || C.abrirDM).call(C, v.jugador_id, v.alias); cerrar(); } catch (err) { /* sin chat privado */ }
    }
  }

  /* ---------- Botón "Visitar" para cualquier lista de jugadores (chat, asociación, Copa, duelos) ---------- */
  function boton(id, cls) {
    const n = Number(id);
    if (!Number.isFinite(n) || n < 1 || !logueado() || n === yo()) return '';
    return `<button type="button" class="btn sm vis-btn ${cls || ''}" data-visitar="${n}" aria-label="${esc(T('visitar'))}">🏠 ${esc(T('visitar'))}</button>`;
  }
  function ajusteCuenta() {
    if (!logueado()) return '';
    css();
    const on = st.sug ? st.sug.permitir !== false : true;
    if (!st.sug && !st.cargandoSug) cargarSug();
    return `<div class="vis-cuenta" style="margin:8px 0">${privacidadHtml(on)}</div>`;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('[data-visitar]') : null;
      if (!b || b.disabled) return;
      e.preventDefault(); e.stopPropagation();
      abrir(b.dataset.visitar);
    }, true);
    // El interruptor de privacidad fuera del panel (tarjeta de la cuenta, Inicio)
    document.addEventListener('change', (e) => {
      const x = e.target && e.target.closest ? e.target.closest('[data-vis="privacidad"]') : null;
      if (x && !x.closest('#vis-panel')) cambiarPrivacidad(x);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const p = document.getElementById('vis-panel'); if (p && !p.hidden) cerrar(); } });
  }

  /* ---------- Inicio: productoras para visitar ---------- */
  function cargarSug(ctx) {
    st.cargandoSug = true;
    return pedir('GET', '/api/visitas/sugeridas').then((r) => { st.sug = r; st.sugEn = Date.now(); if (ctx && ctx.render) ctx.render(); })
      .catch(() => { st.sugEn = Date.now(); }).finally(() => { st.cargandoSug = false; });
  }
  const inicio = {
    id: 'visitas', orden: 62,
    tarjeta(ctx) {
      st.ctx = ctx || st.ctx;
      claveInicio();
      if (!logueado()) return '';
      css();
      if ((!st.sug || Date.now() - st.sugEn > 5 * 60e3) && !st.cargandoSug && Date.now() - st.sugEn > 30e3) cargarSug(ctx);
      const d = st.sug;
      if (!d) return '';
      const L = (d.productoras || []).slice(0, 5);
      const mis = d.mis_aplausos || { total: 0, hoy: 0 };
      return `<div class="card vis-card" data-visitas-inicio>
        <h3>🏠 ${esc(T('inicio_t'))}</h3>
        <p class="small muted" style="margin:0 0 8px">${esc(T('inicio_det', { m: dinero(DINERO) }))}</p>
        ${L.length ? L.map((p) => `<div class="vis-sug"><span class="n">${p.siglas ? '<b>[' + esc(p.siglas) + ']</b> ' : ''}${esc(p.alias)}</span><span class="small muted">👏 ${esc(num(p.aplausos || 0))}</span>${boton(p.jugador_id)}</div>`).join('')
          : `<p class="small muted" style="margin:0">${esc(T('inicio_vacio'))}</p>`}
        <p class="small" style="margin:10px 0 6px">👏 ${esc(T('mis_aplausos', { n: num(mis.total), h: num(mis.hoy) }))}</p>
        <button class="btn sm" data-ext="visitas" data-acc="mia">${esc(T('mi_vitrina'))}</button></div>`;
    },
    clic(ctx, accion) { st.ctx = ctx || st.ctx; if (accion === 'mia') { const id = yo(); if (id) abrir(id); } },
  };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === 'visitas')) root.EnVivoInicio.push(inicio);
  try { if (root.I18N && root.I18N.onChange) root.I18N.onChange(() => { claveInicio(); const p = document.getElementById('vis-panel'); if (p && !p.hidden) pintar(); }); } catch (e) { /* nada */ }
  claveInicio();

  root.Visitas = { abrir, cerrar, boton, ajusteCuenta, estadoVisita, dibujoSede, inicio, T, ES, TRAD, _st: st, usarContexto(ctx) { st.ctx = ctx; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Visitas;
})(typeof window !== 'undefined' ? window : globalThis);
