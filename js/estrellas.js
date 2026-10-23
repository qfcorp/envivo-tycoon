/* =========================================================
   EN VIVO Tycoon — Personal estrella y Pase de Copa (pantalla)
   Contrato: server/MONETIZACION.md · conexión: server/INTEGRAR_ESTRELLAS.md
   Figuras internacionales (parodias) que juegan en tu equipo de Copa y de Duelos: cuentan como nivel Internacional,
   habilidad 5, por N partidos. Se contratan con créditos o gratis con fichas de estrella. 1 estrella por equipo.
   Pase de Copa: +5 eventos de preparación por día durante la copa de esta semana (créditos o dinero real por la tienda).
   API: GET /api/estrellas · POST /api/estrellas/contratar {clave, modo, partidos, peticion} ·
        POST /api/estrellas/asignar {clave, equipo, quitar?} · POST /api/pase_copa/comprar {modo:'credito'}
   Uso desde ui.js:
     Estrellas.render(elemento, ctx)
       ctx = { Api?, A (Art), toast?(t), ask?(html, boton, fn), snd?, pedir?(method, ruta, body), comprar?(producto) }
   Inicio: se agrega a window.EnVivoInicio (orden 35) mientras haya copa en preparación o batalla (con sesión).
   Textos: ES aquí mismo + TRAD[código] (I18N.idioma); lo que falte sale en español.
   ========================================================= */
(function (root) {
  'use strict';

  const ES = {
    'titulo': 'Personal estrella', 'sub': 'Figuras internacionales para tu equipo de Copa y de Duelos',
    'cargando': 'Llamando a la agencia…', 'error': 'No se pudo abrir la agencia de estrellas.', 'reintentar': 'Intentar de nuevo', 'codigo': 'Código: {c}',
    'sin_internet': 'Sin conexión. Revisa tu internet e intenta de nuevo.',
    'sin_sesion_t': 'Entra con tu cuenta', 'sin_sesion': 'El personal estrella juega en la Copa de Servidores y en los Duelos. Entra o crea tu cuenta para contratarlo.',
    'creditos': 'Créditos', 'fichas': 'Fichas', 'reglas': '1 estrella por equipo · cuenta como Internacional, habilidad {h}',
    'tus_equipos': 'Tus equipos', 'equipo.copa': 'Copa', 'equipo.duelo': 'Duelos', 'vacio': 'Sin estrella', 'vacio_det': 'Elige una de la agencia',
    'partidos': '{n} partidos', 'partido1': '1 partido', 'sin_partidos': 'Sin partidos', 'vence': 'vence el {f}',
    'agencia': 'La agencia', 'todos': 'Todos',
    'rol.director': 'Director', 'rol.camarografo': 'Camarógrafo', 'rol.operador_repeticion': 'Operador de repeticiones', 'rol.sonidista': 'Ingeniero de audio', 'rol.tecnico_transmision': 'Técnico de transmisión',
    'nivel': 'Internacional · habilidad {h}', 'ventaja': 'En el equipo +{e} · bono +{b}',
    'contratar': 'Contratar', 'cerrar': 'Cerrar', 'con_creditos': 'Con créditos', 'con_fichas': 'Gratis con fichas', 'fichas_n': '{n} fichas · 1 partido', 'te_faltan': 'Te faltan {n} fichas',
    'poner': 'A {e}',
    'confirmar': '¿Contratar a <b>{nombre}</b> por {p} con <b>{c}</b> créditos?', 'confirmar_fichas': '¿Contratar a <b>{nombre}</b> por 1 partido con <b>{c}</b> fichas?',
    'contratado': '¡{nombre} se une a tu productora por {p}!', 'asignado': '{nombre} va en tu equipo de {e}.', 'quitado': '{nombre} salió de tu equipo de {e}.',
    'pase_t': 'Pase de Copa', 'pase_sub': '+{n} eventos de preparación por día', 'pase_det': 'Solo para la copa de esta semana ({s}). Con el pase juegas hasta {max} eventos por día.',
    'pase_activo': 'Activo esta semana', 'pase_hoy': 'Hoy puedes jugar hasta {max} eventos', 'pase_fuera': 'Se compra de lunes a viernes, durante la preparación.',
    'pase_creditos': '{n} créditos', 'pase_ok': '¡Pase de Copa activo! Hoy juegas hasta {max} eventos.', 'pase_tope': 'Tope con VIP: {t} por día',
    'pase_confirmar': '¿Comprar el Pase de Copa de esta semana con <b>{n}</b> créditos?', 'comprar': 'Comprar',
    'fichas_t': 'Fichas de estrella', 'fichas_det': 'Las ganas jugando: +1 por cada evento de Copa validado, +3 por el Desafío del día y +4 al cerrar la copa (hasta {d} por día).',
    'fichas_hoy': 'Hoy ganaste {n} de {d}',
    'justo': 'Juego limpio: lo pagado tiene tope. La estrella y los bonos nunca dan más del 25 % de ventaja.',
    'ver': 'Ver estrellas', 'inicio_copa': 'En tu equipo de copa: {n}', 'inicio_sin': 'Tu equipo de copa no tiene estrella', 'inicio_pase': 'Pase de Copa activo · hasta {max} eventos hoy', 'inicio_pase_no': 'Pase de Copa: +{n} eventos por día',
    'err.sin_creditos': 'No te alcanzan los créditos.', 'err.sin_fichas': 'Te faltan fichas de estrella.', 'err.sin_partidos': 'Esa estrella no tiene partidos. Contrátala primero.',
    'err.fase': 'El Pase de Copa se compra de lunes a viernes, durante la preparación.', 'err.ya_tienes': 'Ya tienes el Pase de Copa de esta semana.',
    'err.limite': 'Vas muy rápido. Espera un momento.', 'err.sin_sesion': 'Tu sesión se cerró. Vuelve a entrar.', 'err.sesion_requerida': 'Tu sesión se cerró. Vuelve a entrar.',
    'err.estrella_desconocida': 'Esa estrella ya no está en la agencia.', 'err.equipo_invalido': 'Esa opción no es válida.', 'err.partidos_invalidos': 'Esa opción no es válida.',
    'err.modo_invalido': 'Esa opción no es válida.', 'err.usa_tienda': 'Cómpralo desde la tienda.',
    'tag.varela': 'Tres finales mundiales en su currículum', 'tag.solberg': 'Nunca corta tarde a un gol', 'tag.lupe': 'El plano imposible es su especialidad',
    'tag.tano': 'Pulso de cirujano con la cámara al hombro', 'tag.camara_lenta': 'Tiene la repetición antes que el árbitro', 'tag.rewind': 'Diez ángulos en diez segundos',
    'tag.decibel': 'Hace que un estadio suene a disco', 'tag.oido_de_oro': 'Escucha un micrófono suelto a 100 metros', 'tag.cero_ping': 'Su señal no se cae ni con tormenta',
    'tag.satelite': 'Sube la señal desde cualquier cancha',
  };

  const TRAD = {
    en: {
      'titulo': 'Star crew', 'sub': 'International pros for your Cup and Duel teams', 'cargando': 'Calling the agency…', 'error': "Couldn't open the star agency.", 'reintentar': 'Try again', 'codigo': 'Code: {c}',
      'sin_internet': 'No connection. Check your internet and try again.', 'sin_sesion_t': 'Sign in', 'sin_sesion': 'Star crew plays in the Server Cup and in Duels. Sign in or create your account to hire them.',
      'creditos': 'Credits', 'fichas': 'Tokens', 'reglas': '1 star per team · counts as International, skill {h}', 'tus_equipos': 'Your teams', 'equipo.copa': 'Cup', 'equipo.duelo': 'Duels',
      'vacio': 'No star', 'vacio_det': 'Pick one from the agency', 'partidos': '{n} matches', 'partido1': '1 match', 'sin_partidos': 'No matches', 'vence': 'expires {f}', 'agencia': 'The agency', 'todos': 'All',
      'rol.director': 'Director', 'rol.camarografo': 'Camera operator', 'rol.operador_repeticion': 'Replay operator', 'rol.sonidista': 'Audio engineer', 'rol.tecnico_transmision': 'Broadcast tech',
      'nivel': 'International · skill {h}', 'ventaja': 'In team +{e} · bonus +{b}', 'contratar': 'Hire', 'cerrar': 'Close', 'con_creditos': 'With credits', 'con_fichas': 'Free with tokens',
      'fichas_n': '{n} tokens · 1 match', 'te_faltan': 'You need {n} more tokens', 'poner': 'To {e}',
      'confirmar': 'Hire <b>{nombre}</b> for {p} with <b>{c}</b> credits?', 'confirmar_fichas': 'Hire <b>{nombre}</b> for 1 match with <b>{c}</b> tokens?',
      'contratado': '{nombre} joins your company for {p}!', 'asignado': '{nombre} is on your {e} team.', 'quitado': '{nombre} left your {e} team.',
      'pase_t': 'Cup Pass', 'pase_sub': '+{n} prep events per day', 'pase_det': "Only for this week's cup ({s}). With the pass you play up to {max} events a day.",
      'pase_activo': 'Active this week', 'pase_hoy': 'Today you can play up to {max} events', 'pase_fuera': 'On sale Monday to Friday, during prep.', 'pase_creditos': '{n} credits',
      'pase_ok': 'Cup Pass active! Today you play up to {max} events.', 'pase_tope': 'Cap with VIP: {t} a day', 'pase_confirmar': "Buy this week's Cup Pass for <b>{n}</b> credits?", 'comprar': 'Buy',
      'fichas_t': 'Star tokens', 'fichas_det': 'Earn them by playing: +1 per validated Cup event, +3 for the Daily Challenge and +4 when the cup closes (up to {d} a day).', 'fichas_hoy': 'Today: {n} of {d}',
      'justo': 'Fair play: paid perks are capped. Stars and bonuses never give more than a 25% edge.',
      'ver': 'See stars', 'inicio_copa': 'On your cup team: {n}', 'inicio_sin': 'Your cup team has no star', 'inicio_pase': 'Cup Pass active · up to {max} events today', 'inicio_pase_no': 'Cup Pass: +{n} events a day',
      'err.sin_creditos': "You don't have enough credits.", 'err.sin_fichas': "You don't have enough star tokens.", 'err.sin_partidos': 'That star has no matches left. Hire them first.',
      'err.fase': 'The Cup Pass is on sale Monday to Friday, during prep.', 'err.ya_tienes': "You already have this week's Cup Pass.", 'err.limite': "You're going too fast. Wait a moment.",
      'err.sin_sesion': 'Your session ended. Sign in again.', 'err.sesion_requerida': 'Your session ended. Sign in again.', 'err.estrella_desconocida': 'That star left the agency.',
      'err.equipo_invalido': "That option isn't valid.", 'err.partidos_invalidos': "That option isn't valid.", 'err.modo_invalido': "That option isn't valid.", 'err.usa_tienda': 'Buy it from the store.',
      'tag.varela': 'Three world finals on his résumé', 'tag.solberg': 'Never cuts late to a goal', 'tag.lupe': 'The impossible shot is her thing', 'tag.tano': "A surgeon's hand on a shoulder rig",
      'tag.camara_lenta': 'Has the replay before the referee', 'tag.rewind': 'Ten angles in ten seconds', 'tag.decibel': 'Makes a stadium sound like a record', 'tag.oido_de_oro': 'Hears a loose mic 100 meters away',
      'tag.cero_ping': 'Her signal holds even in a storm', 'tag.satelite': 'Gets the signal out of any pitch',
    },
    'pt-BR': {
      'titulo': 'Equipe estrela', 'sub': 'Profissionais internacionais para seus times da Copa e dos Duelos', 'cargando': 'Ligando para a agência…', 'error': 'Não deu para abrir a agência de estrelas.', 'reintentar': 'Tentar de novo', 'codigo': 'Código: {c}',
      'sin_internet': 'Sem conexão. Confira sua internet e tente de novo.', 'sin_sesion_t': 'Entre na sua conta', 'sin_sesion': 'A equipe estrela joga na Copa de Servidores e nos Duelos. Entre ou crie sua conta para contratar.',
      'creditos': 'Créditos', 'fichas': 'Fichas', 'reglas': '1 estrela por time · conta como Internacional, habilidade {h}', 'tus_equipos': 'Seus times', 'equipo.copa': 'Copa', 'equipo.duelo': 'Duelos',
      'vacio': 'Sem estrela', 'vacio_det': 'Escolha uma na agência', 'partidos': '{n} partidas', 'partido1': '1 partida', 'sin_partidos': 'Sem partidas', 'vence': 'vence em {f}', 'agencia': 'A agência', 'todos': 'Todos',
      'rol.director': 'Diretor', 'rol.camarografo': 'Cinegrafista', 'rol.operador_repeticion': 'Operador de replay', 'rol.sonidista': 'Engenheiro de áudio', 'rol.tecnico_transmision': 'Técnico de transmissão',
      'nivel': 'Internacional · habilidade {h}', 'ventaja': 'No time +{e} · bônus +{b}', 'contratar': 'Contratar', 'cerrar': 'Fechar', 'con_creditos': 'Com créditos', 'con_fichas': 'Grátis com fichas',
      'fichas_n': '{n} fichas · 1 partida', 'te_faltan': 'Faltam {n} fichas', 'poner': 'Para {e}',
      'confirmar': 'Contratar <b>{nombre}</b> por {p} com <b>{c}</b> créditos?', 'confirmar_fichas': 'Contratar <b>{nombre}</b> por 1 partida com <b>{c}</b> fichas?',
      'contratado': '{nombre} entra na sua produtora por {p}!', 'asignado': '{nombre} está no seu time de {e}.', 'quitado': '{nombre} saiu do seu time de {e}.',
      'pase_t': 'Passe da Copa', 'pase_sub': '+{n} eventos de preparação por dia', 'pase_det': 'Só para a copa desta semana ({s}). Com o passe você joga até {max} eventos por dia.',
      'pase_activo': 'Ativo nesta semana', 'pase_hoy': 'Hoje você joga até {max} eventos', 'pase_fuera': 'À venda de segunda a sexta, na preparação.', 'pase_creditos': '{n} créditos',
      'pase_ok': 'Passe da Copa ativo! Hoje você joga até {max} eventos.', 'pase_tope': 'Limite com VIP: {t} por dia', 'pase_confirmar': 'Comprar o Passe da Copa desta semana por <b>{n}</b> créditos?', 'comprar': 'Comprar',
      'fichas_t': 'Fichas de estrela', 'fichas_det': 'Você ganha jogando: +1 por evento da Copa validado, +3 pelo Desafio do dia e +4 quando a copa fecha (até {d} por dia).', 'fichas_hoy': 'Hoje: {n} de {d}',
      'justo': 'Jogo limpo: o que é pago tem limite. Estrela e bônus nunca dão mais de 25% de vantagem.',
      'ver': 'Ver estrelas', 'inicio_copa': 'No seu time da copa: {n}', 'inicio_sin': 'Seu time da copa não tem estrela', 'inicio_pase': 'Passe da Copa ativo · até {max} eventos hoje', 'inicio_pase_no': 'Passe da Copa: +{n} eventos por dia',
      'err.sin_creditos': 'Seus créditos não dão.', 'err.sin_fichas': 'Faltam fichas de estrela.', 'err.sin_partidos': 'Essa estrela não tem partidas. Contrate primeiro.',
      'err.fase': 'O Passe da Copa é vendido de segunda a sexta, na preparação.', 'err.ya_tienes': 'Você já tem o Passe da Copa desta semana.', 'err.limite': 'Calma! Espere um pouco.',
      'err.sin_sesion': 'Sua sessão terminou. Entre de novo.', 'err.sesion_requerida': 'Sua sessão terminou. Entre de novo.', 'err.estrella_desconocida': 'Essa estrela saiu da agência.',
      'err.equipo_invalido': 'Essa opção não vale.', 'err.partidos_invalidos': 'Essa opção não vale.', 'err.modo_invalido': 'Essa opção não vale.', 'err.usa_tienda': 'Compre pela loja.',
      'tag.varela': 'Três finais mundiais no currículo', 'tag.solberg': 'Nunca corta atrasado para um gol', 'tag.lupe': 'O plano impossível é a especialidade dela', 'tag.tano': 'Mão de cirurgião com a câmera no ombro',
      'tag.camara_lenta': 'Tem o replay antes do juiz', 'tag.rewind': 'Dez ângulos em dez segundos', 'tag.decibel': 'Faz um estádio soar como disco', 'tag.oido_de_oro': 'Ouve um microfone solto a 100 metros',
      'tag.cero_ping': 'O sinal dela não cai nem com tempestade', 'tag.satelite': 'Tira o sinal de qualquer campo',
    },
    fr: {
      'titulo': 'Équipe vedette', 'sub': 'Des pros internationaux pour tes équipes de Coupe et de Duels', 'cargando': "Appel à l'agence…", 'error': "Impossible d'ouvrir l'agence des vedettes.", 'reintentar': 'Réessayer', 'codigo': 'Code : {c}',
      'sin_internet': 'Pas de connexion. Vérifie ton internet et réessaie.', 'sin_sesion_t': 'Connecte-toi', 'sin_sesion': "L'équipe vedette joue dans la Coupe des Serveurs et les Duels. Connecte-toi ou crée ton compte pour l'engager.",
      'creditos': 'Crédits', 'fichas': 'Jetons', 'reglas': '1 vedette par équipe · compte comme Internationale, compétence {h}', 'tus_equipos': 'Tes équipes', 'equipo.copa': 'Coupe', 'equipo.duelo': 'Duels',
      'vacio': 'Sans vedette', 'vacio_det': "Choisis-en une à l'agence", 'partidos': '{n} matchs', 'partido1': '1 match', 'sin_partidos': 'Plus de matchs', 'vence': 'expire le {f}', 'agencia': "L'agence", 'todos': 'Tous',
      'rol.director': 'Réalisateur', 'rol.camarografo': 'Cadreur', 'rol.operador_repeticion': 'Opérateur ralentis', 'rol.sonidista': 'Ingénieur du son', 'rol.tecnico_transmision': 'Technicien de diffusion',
      'nivel': 'Internationale · compétence {h}', 'ventaja': "Dans l'équipe +{e} · bonus +{b}", 'contratar': 'Engager', 'cerrar': 'Fermer', 'con_creditos': 'Avec des crédits', 'con_fichas': 'Gratuit avec des jetons',
      'fichas_n': '{n} jetons · 1 match', 'te_faltan': 'Il te manque {n} jetons', 'poner': 'Vers {e}',
      'confirmar': 'Engager <b>{nombre}</b> pour {p} contre <b>{c}</b> crédits ?', 'confirmar_fichas': 'Engager <b>{nombre}</b> pour 1 match contre <b>{c}</b> jetons ?',
      'contratado': '{nombre} rejoint ta boîte de prod pour {p} !', 'asignado': '{nombre} est dans ton équipe {e}.', 'quitado': '{nombre} a quitté ton équipe {e}.',
      'pase_t': 'Pass de Coupe', 'pase_sub': '+{n} événements de préparation par jour', 'pase_det': 'Seulement pour la coupe de cette semaine ({s}). Avec le pass tu joues jusqu’à {max} événements par jour.',
      'pase_activo': 'Actif cette semaine', 'pase_hoy': "Aujourd'hui tu peux jouer jusqu'à {max} événements", 'pase_fuera': 'En vente du lundi au vendredi, pendant la préparation.', 'pase_creditos': '{n} crédits',
      'pase_ok': "Pass de Coupe actif ! Aujourd'hui tu joues jusqu'à {max} événements.", 'pase_tope': 'Plafond avec VIP : {t} par jour', 'pase_confirmar': 'Acheter le Pass de Coupe de cette semaine pour <b>{n}</b> crédits ?', 'comprar': 'Acheter',
      'fichas_t': 'Jetons de vedette', 'fichas_det': 'Tu les gagnes en jouant : +1 par événement de Coupe validé, +3 pour le Défi du jour et +4 à la clôture de la coupe (jusqu’à {d} par jour).', 'fichas_hoy': "Aujourd'hui : {n} sur {d}",
      'justo': 'Fair-play : le payant est plafonné. Vedette et bonus ne donnent jamais plus de 25 % d’avantage.',
      'ver': 'Voir les vedettes', 'inicio_copa': 'Dans ton équipe de coupe : {n}', 'inicio_sin': "Ton équipe de coupe n'a pas de vedette", 'inicio_pase': "Pass de Coupe actif · jusqu'à {max} événements aujourd'hui", 'inicio_pase_no': 'Pass de Coupe : +{n} événements par jour',
      'err.sin_creditos': "Tu n'as pas assez de crédits.", 'err.sin_fichas': 'Il te manque des jetons de vedette.', 'err.sin_partidos': "Cette vedette n'a plus de matchs. Engage-la d'abord.",
      'err.fase': 'Le Pass de Coupe est en vente du lundi au vendredi, pendant la préparation.', 'err.ya_tienes': 'Tu as déjà le Pass de Coupe de cette semaine.', 'err.limite': 'Tu vas trop vite. Attends un instant.',
      'err.sin_sesion': 'Ta session est terminée. Reconnecte-toi.', 'err.sesion_requerida': 'Ta session est terminée. Reconnecte-toi.', 'err.estrella_desconocida': "Cette vedette a quitté l'agence.",
      'err.equipo_invalido': "Cette option n'est pas valable.", 'err.partidos_invalidos': "Cette option n'est pas valable.", 'err.modo_invalido': "Cette option n'est pas valable.", 'err.usa_tienda': 'Achète-le dans la boutique.',
      'tag.varela': 'Trois finales mondiales à son actif', 'tag.solberg': 'Ne coupe jamais en retard sur un but', 'tag.lupe': 'Le plan impossible, c’est sa spécialité', 'tag.tano': 'Une main de chirurgien caméra à l’épaule',
      'tag.camara_lenta': "A le ralenti avant l'arbitre", 'tag.rewind': 'Dix angles en dix secondes', 'tag.decibel': 'Fait sonner un stade comme un disque', 'tag.oido_de_oro': 'Entend un micro débranché à 100 mètres',
      'tag.cero_ping': 'Son signal tient même sous l’orage', 'tag.satelite': "Envoie le signal depuis n'importe quel terrain",
    },
    de: {
      'titulo': 'Star-Crew', 'sub': 'Internationale Profis für dein Cup- und Duell-Team', 'cargando': 'Agentur wird angerufen…', 'error': 'Die Star-Agentur konnte nicht geöffnet werden.', 'reintentar': 'Nochmal versuchen', 'codigo': 'Code: {c}',
      'sin_internet': 'Keine Verbindung. Prüf dein Internet und versuch es nochmal.', 'sin_sesion_t': 'Melde dich an', 'sin_sesion': 'Die Star-Crew spielt im Server-Cup und in Duellen. Melde dich an oder erstelle ein Konto, um sie zu verpflichten.',
      'creditos': 'Credits', 'fichas': 'Marken', 'reglas': '1 Star pro Team · zählt als International, Können {h}', 'tus_equipos': 'Deine Teams', 'equipo.copa': 'Cup', 'equipo.duelo': 'Duelle',
      'vacio': 'Kein Star', 'vacio_det': 'Wähl einen aus der Agentur', 'partidos': '{n} Spiele', 'partido1': '1 Spiel', 'sin_partidos': 'Keine Spiele', 'vence': 'läuft ab am {f}', 'agencia': 'Die Agentur', 'todos': 'Alle',
      'rol.director': 'Regisseur', 'rol.camarografo': 'Kameramann', 'rol.operador_repeticion': 'Replay-Operator', 'rol.sonidista': 'Toningenieur', 'rol.tecnico_transmision': 'Übertragungstechniker',
      'nivel': 'International · Können {h}', 'ventaja': 'Im Team +{e} · Bonus +{b}', 'contratar': 'Verpflichten', 'cerrar': 'Schließen', 'con_creditos': 'Mit Credits', 'con_fichas': 'Gratis mit Marken',
      'fichas_n': '{n} Marken · 1 Spiel', 'te_faltan': 'Dir fehlen {n} Marken', 'poner': 'Zu {e}',
      'confirmar': '<b>{nombre}</b> für {p} mit <b>{c}</b> Credits verpflichten?', 'confirmar_fichas': '<b>{nombre}</b> für 1 Spiel mit <b>{c}</b> Marken verpflichten?',
      'contratado': '{nombre} kommt für {p} zu deiner Produktionsfirma!', 'asignado': '{nombre} ist in deinem {e}-Team.', 'quitado': '{nombre} hat dein {e}-Team verlassen.',
      'pase_t': 'Cup-Pass', 'pase_sub': '+{n} Vorbereitungs-Events pro Tag', 'pase_det': 'Nur für den Cup dieser Woche ({s}). Mit dem Pass spielst du bis zu {max} Events pro Tag.',
      'pase_activo': 'Diese Woche aktiv', 'pase_hoy': 'Heute kannst du bis zu {max} Events spielen', 'pase_fuera': 'Erhältlich Montag bis Freitag, in der Vorbereitung.', 'pase_creditos': '{n} Credits',
      'pase_ok': 'Cup-Pass aktiv! Heute spielst du bis zu {max} Events.', 'pase_tope': 'Obergrenze mit VIP: {t} pro Tag', 'pase_confirmar': 'Cup-Pass dieser Woche für <b>{n}</b> Credits kaufen?', 'comprar': 'Kaufen',
      'fichas_t': 'Star-Marken', 'fichas_det': 'Du verdienst sie beim Spielen: +1 pro bestätigtem Cup-Event, +3 für die Tages-Challenge und +4 zum Cup-Abschluss (bis zu {d} pro Tag).', 'fichas_hoy': 'Heute: {n} von {d}',
      'justo': 'Fair Play: Bezahltes ist gedeckelt. Star und Boni bringen nie mehr als 25 % Vorteil.',
      'ver': 'Stars ansehen', 'inicio_copa': 'In deinem Cup-Team: {n}', 'inicio_sin': 'Dein Cup-Team hat keinen Star', 'inicio_pase': 'Cup-Pass aktiv · bis zu {max} Events heute', 'inicio_pase_no': 'Cup-Pass: +{n} Events pro Tag',
      'err.sin_creditos': 'Deine Credits reichen nicht.', 'err.sin_fichas': 'Dir fehlen Star-Marken.', 'err.sin_partidos': 'Dieser Star hat keine Spiele mehr. Verpflichte ihn zuerst.',
      'err.fase': 'Den Cup-Pass gibt es Montag bis Freitag, in der Vorbereitung.', 'err.ya_tienes': 'Du hast den Cup-Pass dieser Woche schon.', 'err.limite': 'Zu schnell. Warte kurz.',
      'err.sin_sesion': 'Deine Sitzung ist abgelaufen. Melde dich neu an.', 'err.sesion_requerida': 'Deine Sitzung ist abgelaufen. Melde dich neu an.', 'err.estrella_desconocida': 'Dieser Star hat die Agentur verlassen.',
      'err.equipo_invalido': 'Diese Option ist ungültig.', 'err.partidos_invalidos': 'Diese Option ist ungültig.', 'err.modo_invalido': 'Diese Option ist ungültig.', 'err.usa_tienda': 'Kauf ihn im Shop.',
      'tag.varela': 'Drei WM-Finals im Lebenslauf', 'tag.solberg': 'Schneidet nie zu spät auf ein Tor', 'tag.lupe': 'Die unmögliche Einstellung ist ihr Ding', 'tag.tano': 'Chirurgenhand mit Schulterkamera',
      'tag.camara_lenta': 'Hat die Wiederholung vor dem Schiri', 'tag.rewind': 'Zehn Winkel in zehn Sekunden', 'tag.decibel': 'Lässt ein Stadion wie eine Platte klingen', 'tag.oido_de_oro': 'Hört ein loses Mikro auf 100 Meter',
      'tag.cero_ping': 'Ihr Signal hält sogar im Sturm', 'tag.satelite': 'Holt das Signal von jedem Platz',
    },
    it: {
      'titulo': 'Squadra stellare', 'sub': 'Professionisti internazionali per le tue squadre di Coppa e Duelli', 'cargando': "Chiamo l'agenzia…", 'error': "Impossibile aprire l'agenzia delle stelle.", 'reintentar': 'Riprova', 'codigo': 'Codice: {c}',
      'sin_internet': 'Nessuna connessione. Controlla internet e riprova.', 'sin_sesion_t': 'Accedi', 'sin_sesion': 'La squadra stellare gioca nella Coppa dei Server e nei Duelli. Accedi o crea il tuo account per ingaggiarla.',
      'creditos': 'Crediti', 'fichas': 'Gettoni', 'reglas': '1 stella per squadra · conta come Internazionale, abilità {h}', 'tus_equipos': 'Le tue squadre', 'equipo.copa': 'Coppa', 'equipo.duelo': 'Duelli',
      'vacio': 'Senza stella', 'vacio_det': "Scegline una dall'agenzia", 'partidos': '{n} partite', 'partido1': '1 partita', 'sin_partidos': 'Nessuna partita', 'vence': 'scade il {f}', 'agencia': "L'agenzia", 'todos': 'Tutti',
      'rol.director': 'Regista', 'rol.camarografo': 'Operatore di ripresa', 'rol.operador_repeticion': 'Operatore replay', 'rol.sonidista': 'Ingegnere del suono', 'rol.tecnico_transmision': 'Tecnico di trasmissione',
      'nivel': 'Internazionale · abilità {h}', 'ventaja': 'In squadra +{e} · bonus +{b}', 'contratar': 'Ingaggia', 'cerrar': 'Chiudi', 'con_creditos': 'Con crediti', 'con_fichas': 'Gratis con gettoni',
      'fichas_n': '{n} gettoni · 1 partita', 'te_faltan': 'Ti mancano {n} gettoni', 'poner': 'In {e}',
      'confirmar': 'Ingaggiare <b>{nombre}</b> per {p} con <b>{c}</b> crediti?', 'confirmar_fichas': 'Ingaggiare <b>{nombre}</b> per 1 partita con <b>{c}</b> gettoni?',
      'contratado': '{nombre} entra nella tua casa di produzione per {p}!', 'asignado': '{nombre} è nella tua squadra di {e}.', 'quitado': '{nombre} ha lasciato la tua squadra di {e}.',
      'pase_t': 'Pass Coppa', 'pase_sub': '+{n} eventi di preparazione al giorno', 'pase_det': 'Solo per la coppa di questa settimana ({s}). Con il pass giochi fino a {max} eventi al giorno.',
      'pase_activo': 'Attivo questa settimana', 'pase_hoy': 'Oggi puoi giocare fino a {max} eventi', 'pase_fuera': 'In vendita dal lunedì al venerdì, durante la preparazione.', 'pase_creditos': '{n} crediti',
      'pase_ok': 'Pass Coppa attivo! Oggi giochi fino a {max} eventi.', 'pase_tope': 'Tetto con VIP: {t} al giorno', 'pase_confirmar': 'Comprare il Pass Coppa di questa settimana per <b>{n}</b> crediti?', 'comprar': 'Compra',
      'fichas_t': 'Gettoni stella', 'fichas_det': "Li guadagni giocando: +1 per evento di Coppa convalidato, +3 per la Sfida del giorno e +4 alla chiusura della coppa (fino a {d} al giorno).", 'fichas_hoy': 'Oggi: {n} su {d}',
      'justo': 'Fair play: ciò che si paga ha un tetto. Stella e bonus non danno mai più del 25% di vantaggio.',
      'ver': 'Vedi le stelle', 'inicio_copa': 'Nella tua squadra di coppa: {n}', 'inicio_sin': 'La tua squadra di coppa non ha stelle', 'inicio_pase': 'Pass Coppa attivo · fino a {max} eventi oggi', 'inicio_pase_no': 'Pass Coppa: +{n} eventi al giorno',
      'err.sin_creditos': 'Non hai abbastanza crediti.', 'err.sin_fichas': 'Ti mancano gettoni stella.', 'err.sin_partidos': 'Quella stella non ha partite. Prima ingaggiala.',
      'err.fase': 'Il Pass Coppa si compra dal lunedì al venerdì, durante la preparazione.', 'err.ya_tienes': 'Hai già il Pass Coppa di questa settimana.', 'err.limite': 'Vai troppo veloce. Aspetta un attimo.',
      'err.sin_sesion': 'La sessione è scaduta. Accedi di nuovo.', 'err.sesion_requerida': 'La sessione è scaduta. Accedi di nuovo.', 'err.estrella_desconocida': "Quella stella ha lasciato l'agenzia.",
      'err.equipo_invalido': 'Opzione non valida.', 'err.partidos_invalidos': 'Opzione non valida.', 'err.modo_invalido': 'Opzione non valida.', 'err.usa_tienda': 'Compralo dal negozio.',
      'tag.varela': 'Tre finali mondiali nel curriculum', 'tag.solberg': 'Non stacca mai in ritardo su un gol', 'tag.lupe': "L'inquadratura impossibile è la sua specialità", 'tag.tano': 'Mano da chirurgo con la camera in spalla',
      'tag.camara_lenta': "Ha il replay prima dell'arbitro", 'tag.rewind': 'Dieci angolazioni in dieci secondi', 'tag.decibel': 'Fa suonare uno stadio come un disco', 'tag.oido_de_oro': 'Sente un microfono staccato a 100 metri',
      'tag.cero_ping': 'Il suo segnale regge anche col temporale', 'tag.satelite': 'Fa uscire il segnale da qualsiasi campo',
    },
    ru: {
      'titulo': 'Звёздная команда', 'sub': 'Международные профи для твоих команд Кубка и Дуэлей', 'cargando': 'Звоним в агентство…', 'error': 'Не удалось открыть агентство звёзд.', 'reintentar': 'Попробовать снова', 'codigo': 'Код: {c}',
      'sin_internet': 'Нет связи. Проверь интернет и попробуй снова.', 'sin_sesion_t': 'Войди в аккаунт', 'sin_sesion': 'Звёзды играют в Кубке серверов и в Дуэлях. Войди или создай аккаунт, чтобы нанять их.',
      'creditos': 'Кредиты', 'fichas': 'Жетоны', 'reglas': '1 звезда на команду · считается как Международный, навык {h}', 'tus_equipos': 'Твои команды', 'equipo.copa': 'Кубок', 'equipo.duelo': 'Дуэли',
      'vacio': 'Без звезды', 'vacio_det': 'Выбери в агентстве', 'partidos': 'матчей: {n}', 'partido1': '1 матч', 'sin_partidos': 'Нет матчей', 'vence': 'до {f}', 'agencia': 'Агентство', 'todos': 'Все',
      'rol.director': 'Режиссёр', 'rol.camarografo': 'Оператор', 'rol.operador_repeticion': 'Оператор повторов', 'rol.sonidista': 'Звукоинженер', 'rol.tecnico_transmision': 'Техник трансляции',
      'nivel': 'Международный · навык {h}', 'ventaja': 'В команде +{e} · бонус +{b}', 'contratar': 'Нанять', 'cerrar': 'Закрыть', 'con_creditos': 'За кредиты', 'con_fichas': 'Бесплатно за жетоны',
      'fichas_n': '{n} жетонов · 1 матч', 'te_faltan': 'Не хватает жетонов: {n}', 'poner': 'В «{e}»',
      'confirmar': 'Нанять <b>{nombre}</b> ({p}) за <b>{c}</b> кредитов?', 'confirmar_fichas': 'Нанять <b>{nombre}</b> на 1 матч за <b>{c}</b> жетонов?',
      'contratado': '{nombre} в твоей студии ({p})!', 'asignado': '{nombre} теперь в команде «{e}».', 'quitado': '{nombre} покинул(а) команду «{e}».',
      'pase_t': 'Пропуск Кубка', 'pase_sub': '+{n} событий подготовки в день', 'pase_det': 'Только для кубка этой недели ({s}). С пропуском — до {max} событий в день.',
      'pase_activo': 'Активен на этой неделе', 'pase_hoy': 'Сегодня можно сыграть до {max} событий', 'pase_fuera': 'Продаётся с понедельника по пятницу, во время подготовки.', 'pase_creditos': '{n} кредитов',
      'pase_ok': 'Пропуск Кубка активен! Сегодня до {max} событий.', 'pase_tope': 'Лимит с VIP: {t} в день', 'pase_confirmar': 'Купить Пропуск Кубка этой недели за <b>{n}</b> кредитов?', 'comprar': 'Купить',
      'fichas_t': 'Звёздные жетоны', 'fichas_det': 'Зарабатываются игрой: +1 за подтверждённое событие Кубка, +3 за Испытание дня и +4 при закрытии кубка (до {d} в день).', 'fichas_hoy': 'Сегодня: {n} из {d}',
      'justo': 'Честная игра: у платного есть предел. Звезда и бонусы никогда не дают больше 25 % преимущества.',
      'ver': 'Звёзды', 'inicio_copa': 'В команде кубка: {n}', 'inicio_sin': 'В команде кубка нет звезды', 'inicio_pase': 'Пропуск Кубка активен · до {max} событий сегодня', 'inicio_pase_no': 'Пропуск Кубка: +{n} событий в день',
      'err.sin_creditos': 'Не хватает кредитов.', 'err.sin_fichas': 'Не хватает звёздных жетонов.', 'err.sin_partidos': 'У этой звезды нет матчей. Сначала найми её.',
      'err.fase': 'Пропуск Кубка продаётся с понедельника по пятницу, во время подготовки.', 'err.ya_tienes': 'У тебя уже есть Пропуск Кубка на эту неделю.', 'err.limite': 'Слишком быстро. Подожди немного.',
      'err.sin_sesion': 'Сессия закончилась. Войди снова.', 'err.sesion_requerida': 'Сессия закончилась. Войди снова.', 'err.estrella_desconocida': 'Эта звезда ушла из агентства.',
      'err.equipo_invalido': 'Недопустимый вариант.', 'err.partidos_invalidos': 'Недопустимый вариант.', 'err.modo_invalido': 'Недопустимый вариант.', 'err.usa_tienda': 'Купи в магазине.',
      'tag.varela': 'Три финала мира в резюме', 'tag.solberg': 'Никогда не опаздывает к голу', 'tag.lupe': 'Невозможный кадр — её конёк', 'tag.tano': 'Рука хирурга с камерой на плече',
      'tag.camara_lenta': 'Повтор готов раньше судьи', 'tag.rewind': 'Десять ракурсов за десять секунд', 'tag.decibel': 'Стадион звучит как пластинка', 'tag.oido_de_oro': 'Слышит отошедший микрофон за 100 метров',
      'tag.cero_ping': 'Её сигнал держится даже в грозу', 'tag.satelite': 'Выведет сигнал с любого поля',
    },
    tr: {
      'titulo': 'Yıldız ekip', 'sub': 'Kupa ve Düello takımların için uluslararası profesyoneller', 'cargando': 'Ajans aranıyor…', 'error': 'Yıldız ajansı açılamadı.', 'reintentar': 'Tekrar dene', 'codigo': 'Kod: {c}',
      'sin_internet': 'Bağlantı yok. İnternetini kontrol edip tekrar dene.', 'sin_sesion_t': 'Giriş yap', 'sin_sesion': 'Yıldız ekip Sunucu Kupası ve Düellolarda oynar. Onları işe almak için giriş yap ya da hesap oluştur.',
      'creditos': 'Kredi', 'fichas': 'Jeton', 'reglas': 'Takım başına 1 yıldız · Uluslararası, beceri {h} sayılır', 'tus_equipos': 'Takımların', 'equipo.copa': 'Kupa', 'equipo.duelo': 'Düello',
      'vacio': 'Yıldız yok', 'vacio_det': 'Ajanstan birini seç', 'partidos': '{n} maç', 'partido1': '1 maç', 'sin_partidos': 'Maç yok', 'vence': '{f} tarihinde biter', 'agencia': 'Ajans', 'todos': 'Hepsi',
      'rol.director': 'Yönetmen', 'rol.camarografo': 'Kameraman', 'rol.operador_repeticion': 'Tekrar operatörü', 'rol.sonidista': 'Ses mühendisi', 'rol.tecnico_transmision': 'Yayın teknisyeni',
      'nivel': 'Uluslararası · beceri {h}', 'ventaja': 'Takımda +{e} · bonus +{b}', 'contratar': 'İşe al', 'cerrar': 'Kapat', 'con_creditos': 'Krediyle', 'con_fichas': 'Jetonla ücretsiz',
      'fichas_n': '{n} jeton · 1 maç', 'te_faltan': '{n} jeton eksik', 'poner': '{e} takımına',
      'confirmar': '<b>{nombre}</b> {p} için <b>{c}</b> krediye işe alınsın mı?', 'confirmar_fichas': '<b>{nombre}</b> 1 maç için <b>{c}</b> jetona işe alınsın mı?',
      'contratado': '{nombre} {p} için yapım şirketine katıldı!', 'asignado': '{nombre} artık {e} takımında.', 'quitado': '{nombre} {e} takımından ayrıldı.',
      'pase_t': 'Kupa Pasosu', 'pase_sub': 'Günde +{n} hazırlık etkinliği', 'pase_det': 'Sadece bu haftanın kupası için ({s}). Pasoyla günde {max} etkinliğe kadar oynarsın.',
      'pase_activo': 'Bu hafta aktif', 'pase_hoy': 'Bugün {max} etkinliğe kadar oynayabilirsin', 'pase_fuera': 'Pazartesiden cumaya, hazırlık sırasında satılır.', 'pase_creditos': '{n} kredi',
      'pase_ok': 'Kupa Pasosu aktif! Bugün {max} etkinliğe kadar oynarsın.', 'pase_tope': 'VIP ile sınır: günde {t}', 'pase_confirmar': 'Bu haftanın Kupa Pasosu <b>{n}</b> krediye alınsın mı?', 'comprar': 'Satın al',
      'fichas_t': 'Yıldız jetonları', 'fichas_det': 'Oynayarak kazanırsın: onaylanan her Kupa etkinliği +1, Günün Meydan Okuması +3, kupa kapanınca +4 (günde en fazla {d}).', 'fichas_hoy': 'Bugün: {n} / {d}',
      'justo': 'Adil oyun: ücretli avantajların sınırı var. Yıldız ve bonuslar asla %25’ten fazla avantaj vermez.',
      'ver': 'Yıldızları gör', 'inicio_copa': 'Kupa takımında: {n}', 'inicio_sin': 'Kupa takımında yıldız yok', 'inicio_pase': 'Kupa Pasosu aktif · bugün {max} etkinliğe kadar', 'inicio_pase_no': 'Kupa Pasosu: günde +{n} etkinlik',
      'err.sin_creditos': 'Kredin yetmiyor.', 'err.sin_fichas': 'Yıldız jetonun eksik.', 'err.sin_partidos': 'Bu yıldızın maçı kalmadı. Önce işe al.',
      'err.fase': 'Kupa Pasosu pazartesiden cumaya, hazırlık sırasında satılır.', 'err.ya_tienes': 'Bu haftanın Kupa Pasosu zaten sende.', 'err.limite': 'Çok hızlısın. Biraz bekle.',
      'err.sin_sesion': 'Oturumun kapandı. Tekrar giriş yap.', 'err.sesion_requerida': 'Oturumun kapandı. Tekrar giriş yap.', 'err.estrella_desconocida': 'Bu yıldız ajanstan ayrıldı.',
      'err.equipo_invalido': 'Bu seçenek geçerli değil.', 'err.partidos_invalidos': 'Bu seçenek geçerli değil.', 'err.modo_invalido': 'Bu seçenek geçerli değil.', 'err.usa_tienda': 'Mağazadan satın al.',
      'tag.varela': 'Özgeçmişinde üç dünya finali', 'tag.solberg': 'Gole asla geç kesmez', 'tag.lupe': 'İmkânsız plan onun uzmanlığı', 'tag.tano': 'Omuz kamerasında cerrah eli',
      'tag.camara_lenta': 'Tekrarı hakemden önce hazırlar', 'tag.rewind': 'On saniyede on açı', 'tag.decibel': 'Stadyumu plak gibi çaldırır', 'tag.oido_de_oro': '100 metreden gevşek mikrofonu duyar',
      'tag.cero_ping': 'Sinyali fırtınada bile düşmez', 'tag.satelite': 'Her sahadan sinyali çıkarır',
    },
    id: {
      'titulo': 'Kru bintang', 'sub': 'Profesional internasional untuk tim Piala dan Duelmu', 'cargando': 'Menghubungi agensi…', 'error': 'Agensi bintang tidak bisa dibuka.', 'reintentar': 'Coba lagi', 'codigo': 'Kode: {c}',
      'sin_internet': 'Tidak ada koneksi. Cek internetmu dan coba lagi.', 'sin_sesion_t': 'Masuk ke akunmu', 'sin_sesion': 'Kru bintang bermain di Piala Server dan Duel. Masuk atau buat akun untuk merekrut mereka.',
      'creditos': 'Kredit', 'fichas': 'Token', 'reglas': '1 bintang per tim · dihitung Internasional, keahlian {h}', 'tus_equipos': 'Timmu', 'equipo.copa': 'Piala', 'equipo.duelo': 'Duel',
      'vacio': 'Tanpa bintang', 'vacio_det': 'Pilih satu dari agensi', 'partidos': '{n} pertandingan', 'partido1': '1 pertandingan', 'sin_partidos': 'Tidak ada pertandingan', 'vence': 'berakhir {f}', 'agencia': 'Agensi', 'todos': 'Semua',
      'rol.director': 'Sutradara', 'rol.camarografo': 'Juru kamera', 'rol.operador_repeticion': 'Operator tayangan ulang', 'rol.sonidista': 'Teknisi audio', 'rol.tecnico_transmision': 'Teknisi siaran',
      'nivel': 'Internasional · keahlian {h}', 'ventaja': 'Di tim +{e} · bonus +{b}', 'contratar': 'Rekrut', 'cerrar': 'Tutup', 'con_creditos': 'Dengan kredit', 'con_fichas': 'Gratis dengan token',
      'fichas_n': '{n} token · 1 pertandingan', 'te_faltan': 'Kurang {n} token', 'poner': 'Ke {e}',
      'confirmar': 'Rekrut <b>{nombre}</b> untuk {p} dengan <b>{c}</b> kredit?', 'confirmar_fichas': 'Rekrut <b>{nombre}</b> untuk 1 pertandingan dengan <b>{c}</b> token?',
      'contratado': '{nombre} bergabung dengan rumah produksimu untuk {p}!', 'asignado': '{nombre} masuk tim {e}-mu.', 'quitado': '{nombre} keluar dari tim {e}-mu.',
      'pase_t': 'Tiket Piala', 'pase_sub': '+{n} acara persiapan per hari', 'pase_det': 'Hanya untuk piala minggu ini ({s}). Dengan tiket kamu main sampai {max} acara per hari.',
      'pase_activo': 'Aktif minggu ini', 'pase_hoy': 'Hari ini kamu bisa main sampai {max} acara', 'pase_fuera': 'Dijual Senin sampai Jumat, selama persiapan.', 'pase_creditos': '{n} kredit',
      'pase_ok': 'Tiket Piala aktif! Hari ini kamu main sampai {max} acara.', 'pase_tope': 'Batas dengan VIP: {t} per hari', 'pase_confirmar': 'Beli Tiket Piala minggu ini seharga <b>{n}</b> kredit?', 'comprar': 'Beli',
      'fichas_t': 'Token bintang', 'fichas_det': 'Didapat dengan bermain: +1 per acara Piala yang tervalidasi, +3 dari Tantangan Harian dan +4 saat piala ditutup (maks. {d} per hari).', 'fichas_hoy': 'Hari ini: {n} dari {d}',
      'justo': 'Main adil: yang berbayar ada batasnya. Bintang dan bonus tidak pernah memberi keunggulan lebih dari 25%.',
      'ver': 'Lihat bintang', 'inicio_copa': 'Di tim pialamu: {n}', 'inicio_sin': 'Tim pialamu belum punya bintang', 'inicio_pase': 'Tiket Piala aktif · sampai {max} acara hari ini', 'inicio_pase_no': 'Tiket Piala: +{n} acara per hari',
      'err.sin_creditos': 'Kreditmu tidak cukup.', 'err.sin_fichas': 'Token bintangmu kurang.', 'err.sin_partidos': 'Bintang itu tidak punya pertandingan. Rekrut dulu.',
      'err.fase': 'Tiket Piala dijual Senin sampai Jumat, selama persiapan.', 'err.ya_tienes': 'Kamu sudah punya Tiket Piala minggu ini.', 'err.limite': 'Terlalu cepat. Tunggu sebentar.',
      'err.sin_sesion': 'Sesimu berakhir. Masuk lagi.', 'err.sesion_requerida': 'Sesimu berakhir. Masuk lagi.', 'err.estrella_desconocida': 'Bintang itu sudah keluar dari agensi.',
      'err.equipo_invalido': 'Pilihan itu tidak valid.', 'err.partidos_invalidos': 'Pilihan itu tidak valid.', 'err.modo_invalido': 'Pilihan itu tidak valid.', 'err.usa_tienda': 'Beli lewat toko.',
      'tag.varela': 'Tiga final dunia di riwayatnya', 'tag.solberg': 'Tidak pernah telat memotong ke gol', 'tag.lupe': 'Gambar mustahil adalah keahliannya', 'tag.tano': 'Tangan ahli bedah dengan kamera di bahu',
      'tag.camara_lenta': 'Tayangan ulangnya siap sebelum wasit', 'tag.rewind': 'Sepuluh sudut dalam sepuluh detik', 'tag.decibel': 'Membuat stadion terdengar seperti piringan hitam', 'tag.oido_de_oro': 'Mendengar mik lepas dari 100 meter',
      'tag.cero_ping': 'Sinyalnya tetap kuat bahkan saat badai', 'tag.satelite': 'Mengirim sinyal dari lapangan mana pun',
    },
    'zh-CN': {
      'titulo': '明星团队', 'sub': '为你的杯赛和对决队伍请来国际专业人士', 'cargando': '正在联系经纪公司…', 'error': '无法打开明星经纪公司。', 'reintentar': '重试', 'codigo': '代码：{c}',
      'sin_internet': '没有网络连接。检查网络后再试。', 'sin_sesion_t': '登录你的账号', 'sin_sesion': '明星团队在服务器杯和对决中出场。登录或创建账号来签下他们。',
      'creditos': '点数', 'fichas': '代币', 'reglas': '每队 1 位明星 · 按国际级、技能 {h} 计算', 'tus_equipos': '你的队伍', 'equipo.copa': '杯赛', 'equipo.duelo': '对决',
      'vacio': '没有明星', 'vacio_det': '去经纪公司挑一位', 'partidos': '{n} 场', 'partido1': '1 场', 'sin_partidos': '没有场次', 'vence': '{f} 到期', 'agencia': '经纪公司', 'todos': '全部',
      'rol.director': '导播', 'rol.camarografo': '摄像师', 'rol.operador_repeticion': '回放操作员', 'rol.sonidista': '音频工程师', 'rol.tecnico_transmision': '转播技术员',
      'nivel': '国际级 · 技能 {h}', 'ventaja': '队内 +{e} · 加成 +{b}', 'contratar': '签约', 'cerrar': '关闭', 'con_creditos': '用点数', 'con_fichas': '用代币免费',
      'fichas_n': '{n} 代币 · 1 场', 'te_faltan': '还差 {n} 代币', 'poner': '加入{e}',
      'confirmar': '用 <b>{c}</b> 点数签下 <b>{nombre}</b>（{p}）？', 'confirmar_fichas': '用 <b>{c}</b> 代币签下 <b>{nombre}</b> 1 场？',
      'contratado': '{nombre} 加入你的制作公司（{p}）！', 'asignado': '{nombre} 已进入你的{e}队伍。', 'quitado': '{nombre} 已离开你的{e}队伍。',
      'pase_t': '杯赛通行证', 'pase_sub': '每天 +{n} 场准备活动', 'pase_det': '仅限本周杯赛（{s}）。有通行证每天最多玩 {max} 场。',
      'pase_activo': '本周已激活', 'pase_hoy': '今天最多可玩 {max} 场', 'pase_fuera': '周一至周五准备阶段发售。', 'pase_creditos': '{n} 点数',
      'pase_ok': '杯赛通行证已激活！今天最多玩 {max} 场。', 'pase_tope': 'VIP 上限：每天 {t} 场', 'pase_confirmar': '用 <b>{n}</b> 点数购买本周杯赛通行证？', 'comprar': '购买',
      'fichas_t': '明星代币', 'fichas_det': '玩游戏就能获得：每场通过验证的杯赛活动 +1，每日挑战 +3，杯赛结束 +4（每天最多 {d}）。', 'fichas_hoy': '今天：{n} / {d}',
      'justo': '公平竞技：付费优势有上限。明星和加成带来的优势永远不超过 25%。',
      'ver': '查看明星', 'inicio_copa': '你的杯赛队伍：{n}', 'inicio_sin': '你的杯赛队伍还没有明星', 'inicio_pase': '杯赛通行证已激活 · 今天最多 {max} 场', 'inicio_pase_no': '杯赛通行证：每天 +{n} 场',
      'err.sin_creditos': '点数不够。', 'err.sin_fichas': '明星代币不够。', 'err.sin_partidos': '这位明星没有场次了。先签约吧。',
      'err.fase': '杯赛通行证在周一至周五准备阶段发售。', 'err.ya_tienes': '你已经有本周的杯赛通行证了。', 'err.limite': '太快了，请稍等。',
      'err.sin_sesion': '登录已过期，请重新登录。', 'err.sesion_requerida': '登录已过期，请重新登录。', 'err.estrella_desconocida': '这位明星已离开经纪公司。',
      'err.equipo_invalido': '这个选项无效。', 'err.partidos_invalidos': '这个选项无效。', 'err.modo_invalido': '这个选项无效。', 'err.usa_tienda': '请在商店购买。',
      'tag.varela': '履历上有三场世界决赛', 'tag.solberg': '进球镜头从不慢切', 'tag.lupe': '专拍不可能的镜头', 'tag.tano': '肩扛摄像机也稳如外科医生',
      'tag.camara_lenta': '裁判还没看，回放已就绪', 'tag.rewind': '十秒十个角度', 'tag.decibel': '让体育场听起来像唱片', 'tag.oido_de_oro': '百米外听出松掉的麦克风',
      'tag.cero_ping': '暴风雨里信号也不掉', 'tag.satelite': '任何球场都能把信号送出去',
    },
  };

  const ROLES = ['director', 'camarografo', 'operador_repeticion', 'sonidista', 'tecnico_transmision'];
  const FEM = ['solberg', 'lupe', 'decibel', 'cero_ping'];
  const PREFIJO_FEM = { solberg: 'Sofía', lupe: 'Lucía', decibel: 'María', cero_ping: 'Valeria' };
  const MODOS = ['copa', 'duelo'];

  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { return 'es'; } };
  const locale = () => { try { return (root.I18N && root.I18N.locale) || (idioma() === 'es' ? 'es-EC' : idioma()); } catch (e) { return 'es-EC'; } };
  function T(k, p) {
    const d = TRAD[idioma()] || {};
    const s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : Object.prototype.hasOwnProperty.call(ES, k) ? ES[k] : k;
    return String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  }
  const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => { try { return Number(n || 0).toLocaleString(locale()); } catch (e) { return String(Number(n || 0)); } };
  const fecha = (iso) => { try { return new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }); } catch (e) { return String(iso || '').slice(0, 10); } };
  const corto = (n) => String(n || '').replace(/\s*'[^']*'\s*/g, ' ').trim();   // "Ricardo 'El Maestro' Varela" → "Ricardo Varela"
  const partidosTxt = (n) => (n === 1 ? T('partido1') : T('partidos', { n: num(n) }));
  const dinero = (usd) => { try { return Number(usd).toLocaleString(locale(), { style: 'currency', currency: 'USD' }); } catch (e) { return '$' + Number(usd).toFixed(2); } };
  /** Precio REAL del producto: el que da ui.js (ctx.precio → Google Play dentro de la app, Pago Plux en la web).
      null = no se vende en este canal (el botón no sale). Sin ctx.precio: solo fuera de la app, con el precio del servidor. */
  function precioDe(id, usd) {
    const c = st.ctx;
    try { if (c && typeof c.precio === 'function') { const v = c.precio(id, usd); return v ? String(v) : null; } } catch (e) { return null; }
    try { if (root.GooglePlay && root.GooglePlay.enApp && root.GooglePlay.enApp()) return null; } catch (e) { return null; }
    return usd ? dinero(usd) : null;
  }

  const st = { el: null, ctx: null, datos: null, error: '', codigo: '', cargando: false, ocupado: '', abierto: null, filtro: 'todos', cargadoEn: 0, intentoInicio: 0 };

  /* ---------- estilos ---------- */
  function css() {
    if (typeof document === 'undefined' || document.getElementById('estrellas-css')) return;
    const s = document.createElement('style');
    s.id = 'estrellas-css';
    s.textContent = `
      .pe{display:flex;flex-direction:column;gap:12px;min-width:0;--oro:#f0b829;--oro2:#ffe08a}
      .pe .card{margin:0;min-width:0}
      .pe-mono{font-family:var(--f-mono);font-variant-numeric:tabular-nums}
      .pe-head{position:relative;overflow:hidden;border-color:#5a4512;background:radial-gradient(120% 90% at 85% 0%,#3a2a08 0%,#161a22 55%)}
      .pe-head svg.fondo{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
      .pe-head .in{position:relative}
      .pe-kick{display:flex;align-items:center;gap:6px;font-family:var(--f-head);font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:var(--oro2)}
      .pe-head h2{margin:4px 0 2px;font-size:30px;line-height:1;text-transform:uppercase;letter-spacing:.6px;color:#fff;text-shadow:0 2px 14px #000}
      .pe-head p{margin:0;color:#c9d3e6;font-size:13px;overflow-wrap:anywhere}
      .pe-saldos{display:flex;gap:8px;margin-top:12px}
      .pe-saldos .chip{background:#0007;border-color:#ffffff22;min-width:0}
      .pe-saldos .chip b{color:#fff}
      .pe-saldos .chip.oro b{color:var(--oro2)}
      .pe-regla{display:flex;gap:6px;align-items:flex-start;margin-top:10px;font-size:12px;color:#d9c48a}
      .pe-regla .ico{flex:none;width:14px;height:14px;margin-top:1px}
      .pe-h3{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px;font-family:var(--f-head);font-size:18px;text-transform:uppercase;letter-spacing:.8px}
      .pe-equipos{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
      .pe-slot{display:flex;align-items:center;gap:8px;min-width:0;padding:8px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)}
      .pe-slot.lleno{border-color:#f0b82966;background:linear-gradient(150deg,#2b2209,var(--panel2) 70%)}
      .pe-slot .g{min-width:0;flex:1}
      .pe-slot small{display:block;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
      .pe-slot b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13px;line-height:1.15;overflow:hidden;overflow-wrap:anywhere}
      .pe-slot span{display:block;font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pe-hueco{width:44px;height:44px;flex:none;border-radius:50%;border:2px dashed #3a4356;display:grid;place-items:center;color:#5b6476}
      .pe-filtros{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
      .pe-filtros button{border:1px solid var(--line);background:var(--panel2);color:var(--muted);border-radius:999px;padding:6px 11px;font-size:12.5px;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pe-filtros button[aria-pressed="true"]{background:var(--oro);border-color:var(--oro);color:#1a1205}
      .pe-lista{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
      @media (min-width:620px){.pe-lista{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
      .pe-star{position:relative;padding:12px;border-radius:14px;background:linear-gradient(165deg,#1d1a12,#161a22 60%);border:1px solid #3b3320;min-width:0}
      .pe-star.mia{border-color:#f0b829aa;box-shadow:0 0 0 1px #f0b82933 inset}
      .pe-top{display:flex;gap:12px;align-items:flex-start;min-width:0}
      .pe-foto{position:relative;flex:none;width:72px;height:72px}
      .pe-foto svg.avatar{width:72px;height:72px;display:block}
      .pe-foto .nv{position:absolute;inset-inline-end:-4px;bottom:-4px;background:var(--oro);color:#1a1205;font-family:var(--f-mono);font-size:11px;font-weight:700;border-radius:999px;padding:1px 6px;border:2px solid #161a22}
      .pe-info{min-width:0;flex:1}
      .pe-info h4{margin:0;font-family:var(--f-head);font-size:19px;line-height:1.05;letter-spacing:.3px;color:#fff;overflow-wrap:anywhere}
      .pe-rol{display:flex;align-items:center;gap:5px;margin-top:4px;font-size:12px;color:var(--oro2);min-width:0}
      .pe-rol .ico{flex:none;width:14px;height:14px}
      .pe-rol span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pe-tag{margin:4px 0 0;font-size:12.5px;color:#c9d3e6;font-style:italic;overflow-wrap:anywhere}
      .pe-datos{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
      .pe-datos span{font-size:11px;padding:2px 7px;border-radius:999px;background:#ffffff0d;border:1px solid #ffffff1a;color:#c9d3e6;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pe-datos span.pt{background:#f0b8291f;border-color:#f0b82955;color:var(--oro2);font-weight:700}
      .pe-datos span.no{color:var(--muted)}
      .pe-acc{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr);gap:6px;margin-top:10px}
      .pe-acc .btn{margin:0;padding:9px 6px;font-size:12.5px;width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pe-acc .btn.oro{background:var(--oro);border-color:var(--oro);color:#1a1205}
      .pe-acc .btn[aria-pressed="true"]{background:#2ecc7122;border-color:#2ecc71;color:#8ff0b6}
      .pe-panel{margin-top:10px;padding:10px;border-radius:12px;background:#0b0d12;border:1px solid #2c3550}
      .pe-panel small{display:block;font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
      .pe-paq{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .pe-paq button{border:1px solid #3b3320;background:#1d1a12;color:var(--text);border-radius:10px;padding:8px 4px;min-width:0;text-align:center}
      .pe-paq button b{display:block;font-size:13px}
      .pe-paq button span{display:block;font-family:var(--f-mono);font-size:12px;color:var(--oro2);margin-top:2px}
      .pe-paq button:disabled{opacity:.4}
      .pe-gratis{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap}
      .pe-gratis span{font-size:12.5px;color:#c9d3e6;min-width:0}
      .pe-gratis .btn{margin:0}
      .pe-pase{position:relative;overflow:hidden;border-color:#2f4d7a;background:linear-gradient(120deg,#13233d,#161a22 70%)}
      .pe-pase::before,.pe-pase::after{content:"";position:absolute;top:50%;width:20px;height:20px;margin-top:-10px;border-radius:50%;background:var(--bg);border:1px solid #2f4d7a}
      .pe-pase::before{left:-11px}.pe-pase::after{right:-11px}
      .pe-pase .grande{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
      .pe-pase .grande b{font-family:var(--f-mono);font-size:34px;color:#9ec5ff;line-height:1}
      .pe-pase .grande span{font-size:14px;font-weight:700;color:#fff;min-width:0}
      .pe-pase p{margin:6px 0 0;font-size:12.5px;color:#c9d3e6;overflow-wrap:anywhere}
      .pe-pase .barra{display:flex;gap:3px;margin-top:10px}
      .pe-pase .barra i{flex:1;height:8px;border-radius:2px;background:#24324a}
      .pe-pase .barra i.base{background:#4da3ff99}
      .pe-pase .barra i.extra{background:#9ec5ff}
      .pe-pase .barra i.vip{background:#f0b82999}
      .pe-pase .botones{display:flex;gap:8px;margin-top:10px}
      .pe-pase .botones .btn{margin:0;flex:1;min-width:0}
      .pe-ok{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 10px;border-radius:999px;background:#2ecc7122;border:1px solid #2ecc71;color:#8ff0b6;font-weight:700;font-size:13px}
      .pe-fichas .medidor{height:10px;border-radius:999px;background:#0d0f14;border:1px solid var(--line);overflow:hidden;margin-top:8px}
      .pe-fichas .medidor i{display:block;height:100%;background:linear-gradient(90deg,#b07bff,#f0b829)}
      .pe-fichas p{margin:8px 0 0;font-size:12.5px;color:#c9d3e6}
      .pe-justo{font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:flex-start}
      .pe-justo .ico{flex:none;width:14px;height:14px;margin-top:1px}
      .pe-msg{text-align:center}
      .pe-ini{border-color:#5a4512;background:linear-gradient(150deg,#2b2209,var(--panel) 65%)}
      .pe-ini .row1{display:flex;align-items:center;gap:10px;min-width:0}
      .pe-ini .row1 .g{min-width:0;flex:1}
      .pe-ini .row1 b{display:block;font-family:var(--f-head);font-size:17px;text-transform:uppercase;letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pe-ini .row1 small{display:block;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pe-ini .cta{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px}
      .pe-ini .cta span{min-width:0;font-size:12px;color:#c9d3e6}
      .pe-ini svg.avatar{width:44px;height:44px;flex:none}
    `;
    document.head.appendChild(s);
  }

  /* ---------- servidor ---------- */
  async function pedir(method, ruta, body) {
    if (st.ctx && typeof st.ctx.pedir === 'function') return st.ctx.pedir(method, ruta, body);
    const h = { 'Content-Type': 'application/json', 'X-Envivo': '1' };
    try { if (root.I18N && root.I18N.idioma) h['X-Envivo-Idioma'] = root.I18N.idioma; } catch (e) { /* nada */ }
    let r;
    try {
      r = await fetch(ruta, { method, headers: h, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { const err = new Error(T('sin_internet')); err.red = true; err.codigo = 'sin_internet'; throw err; }
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) {
      const codigo = (j && j.codigo) || (r.status === 401 ? 'sin_sesion' : '');
      const propio = codigo && Object.prototype.hasOwnProperty.call(ES, 'err.' + codigo);
      const err = new Error(propio ? T('err.' + codigo) : ((j && j.error) || T('error')));
      err.status = r.status; err.codigo = codigo; err.datos = j || {};
      throw err;
    }
    return j;
  }

  const apiCtx = () => (st.ctx && st.ctx.Api) || root.Api;
  function sinSesion() {
    const A = apiCtx();
    try { return !!(A && A.disponible !== false && typeof A.logueado === 'function' && !A.logueado()); } catch (e) { return false; }
  }
  const art = () => (st.ctx && st.ctx.A) || root.Art;
  function icon(n, cls, size) { try { return art().icon(n, cls === undefined ? 'sm' : cls, size); } catch (e) { return ''; } }
  function aviso(t) { try { if (st.ctx && st.ctx.toast) st.ctx.toast(t); } catch (e) { /* nada */ } }
  function sonido(n) { try { const s = st.ctx && st.ctx.snd; if (typeof s === 'function') s(n); else if (s && s.play) s.play(n); } catch (e) { /* nada */ } }

  /* Retrato: Art.avatar con anillo dorado; sin Art, un círculo con las iniciales */
  function retrato(e, size) {
    const n = e.nombre || e.clave;
    try {
      const A = art();
      if (A && typeof A.avatar === 'function') {
        const semilla = (FEM.includes(e.clave) ? PREFIJO_FEM[e.clave] + ' ' : '') + n;
        const svg = A.avatar(semilla, e.rol, size, { premium: true });
        if (svg) return svg.replace(/aria-label="[^"]*"/, 'aria-label="' + esc(n) + '"');
      }
    } catch (x) { /* sigue */ }
    const ini = String(n).replace(/'[^']*'/g, ' ').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${esc(n)}"><circle cx="50" cy="50" r="46" fill="#2b2209" stroke="#f0b829" stroke-width="5"/><text x="50" y="60" text-anchor="middle" font-size="30" font-weight="700" fill="#ffe08a" font-family="sans-serif">${esc(ini)}</text></svg>`;
  }

  async function cargar() {
    if (sinSesion()) { pintar(); return; }
    st.cargando = true; pintar();
    try { usar(await pedir('GET', '/api/estrellas')); st.error = ''; st.codigo = ''; } catch (e) { st.error = e.message; st.codigo = e.codigo || ''; }
    st.cargando = false;
    pintar();
  }
  function usar(d) { if (d && d.catalogo) { st.datos = d; st.cargadoEn = Date.now(); } }

  /* ---------- acciones ---------- */
  const estrella = (k) => ((st.datos && st.datos.catalogo) || []).find((e) => e.clave === k);
  const peticion = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  function confirmar(html, boton, fn) {
    if (st.ctx && typeof st.ctx.ask === 'function') { try { st.ctx.ask(html, boton, fn); return; } catch (e) { /* sigue */ } }
    fn();
  }
  async function hacer(tipo, fn) {
    if (st.ocupado) return;
    st.ocupado = tipo; pintar();
    try { await fn(); } catch (e) {
      aviso(e.message || T('error'));
      if (e.codigo === 'sin_sesion' || e.codigo === 'sesion_requerida') { st.datos = null; }
    }
    st.ocupado = ''; pintar();
  }
  function contratar(k, modo, partidos) {
    const e = estrella(k); if (!e) return;
    const p = (e.precios || []).find((x) => x.partidos === partidos) || { creditos: 0 };
    const html = modo === 'fichas' ? T('confirmar_fichas', { nombre: esc(e.nombre), c: num(e.fichas) }) : T('confirmar', { nombre: esc(e.nombre), p: esc(partidosTxt(partidos)), c: num(p.creditos) });
    const id = peticion();
    confirmar(html, T('contratar'), () => hacer('contratar:' + k, async () => {
      const r = await pedir('POST', '/api/estrellas/contratar', { clave: k, modo, partidos, peticion: id });
      usar(r.estrellas); st.abierto = null;
      sonido('cash');
      aviso(T('contratado', { nombre: e.nombre, p: partidosTxt(partidos) }));
    }));
  }
  function asignar(k, modo, quitar) {
    const e = estrella(k); if (!e) return;
    hacer('asignar:' + k + ':' + modo, async () => {
      const r = await pedir('POST', '/api/estrellas/asignar', quitar ? { clave: k, equipo: modo, quitar: true } : { clave: k, equipo: modo });
      usar(r.estrellas);
      aviso(T(quitar ? 'quitado' : 'asignado', { nombre: e.nombre, e: T('equipo.' + modo) }));
    });
  }
  function comprarPase() {
    const pc = st.datos && st.datos.pase_copa; if (!pc) return;
    confirmar(T('pase_confirmar', { n: num(pc.precio_creditos) }), T('comprar'), () => hacer('pase', async () => {
      const r = await pedir('POST', '/api/pase_copa/comprar', { modo: 'credito' });
      usar(r.estrellas);
      sonido('cash');
      aviso(T('pase_ok', { max: num((r.pase_copa || pc).intentos_max) }));
      try { if (root.Copas && root.Copas.invalidar) root.Copas.invalidar(); } catch (e) { /* nada */ }
    }));
  }
  function comprarPaseDinero() {
    const pc = st.datos && st.datos.pase_copa;
    try { if (st.ctx && typeof st.ctx.comprar === 'function') st.ctx.comprar((pc && pc.producto) || 'pase_copa'); } catch (e) { aviso(T('error')); }
  }

  function alTocar(ev) {
    const t = ev.target.closest('[data-est]');
    if (!t || !st.el || !st.el.contains(t) || t.disabled) return;
    const a = t.getAttribute('data-est'), k = t.getAttribute('data-clave'), m = t.getAttribute('data-equipo');
    if (a === 'abrir') { st.abierto = st.abierto === k ? null : k; pintar(); }
    else if (a === 'contratar') contratar(k, t.getAttribute('data-modo') || 'credito', Number(t.getAttribute('data-partidos') || 1));
    else if (a === 'asignar') asignar(k, m, t.getAttribute('aria-pressed') === 'true');
    else if (a === 'filtro') { st.filtro = t.getAttribute('data-rol') || 'todos'; pintar(); }
    else if (a === 'pase') comprarPase();
    else if (a === 'pase_dinero') comprarPaseDinero();
    else if (a === 'recargar') { st.error = ''; st.codigo = ''; cargar(); }
  }

  /* ---------- pintar ---------- */
  function cabecera(d) {
    const h = (d && d.reglas && d.reglas.habilidad) || 5;
    const estrellitas = Array.from({ length: 14 }, (_, i) => { const x = (i * 37) % 100, y = (i * 53) % 100, r = 0.6 + (i % 3) * 0.5; return `<circle cx="${x}%" cy="${y}%" r="${r}" fill="#ffe08a" opacity="${0.15 + (i % 4) * 0.1}"/>`; }).join('');
    return `<div class="card pe-head" data-est-zona="cabecera">
      <svg class="fondo" aria-hidden="true">${estrellitas}<line x1="0" y1="100%" x2="100%" y2="55%" stroke="#f0b82918" stroke-width="40"/></svg>
      <div class="in">
        <div class="pe-kick">${icon('star', 'sm', 15)}<span>${esc(T('agencia'))}</span></div>
        <h2>${esc(T('titulo'))}</h2>
        <p>${esc(T('sub'))}</p>
        ${d ? `<div class="pe-saldos">
          <div class="chip"><small>${icon('gem', '', 12)}${esc(T('creditos'))}</small><b data-est-creditos>${num(d.creditos)}</b></div>
          <div class="chip oro"><small>${icon('star', '', 12)}${esc(T('fichas'))}</small><b data-est-fichas>${num(d.fichas)}</b></div>
        </div>
        <div class="pe-regla">${icon('shield', '', 14)}<span>${esc(T('reglas', { h }))}</span></div>` : ''}
      </div></div>`;
  }

  function equipos(d) {
    const slot = (m) => {
      const k = (d.asignadas && d.asignadas[m] && d.asignadas[m][0]) || null;
      const e = k && estrella(k);
      if (!e) return `<div class="pe-slot" data-slot="${m}"><div class="pe-hueco">${icon(m === 'copa' ? 'final' : 'target', '', 18)}</div><div class="g"><small>${esc(T('equipo.' + m))}</small><b>${esc(T('vacio'))}</b><span>${esc(T('vacio_det'))}</span></div></div>`;
      return `<div class="pe-slot lleno" data-slot="${m}" data-clave="${esc(k)}">${retrato(e, 44)}<div class="g"><small>${esc(T('equipo.' + m))}</small><b>${esc(corto(e.nombre))}</b><span>${esc(partidosTxt(e.restantes))}</span></div></div>`;
    };
    return `<div class="card" data-est-zona="equipos"><h3 class="pe-h3">${esc(T('tus_equipos'))}</h3><div class="pe-equipos">${slot('copa')}${slot('duelo')}</div></div>`;
  }

  function tarjeta(e, d) {
    const mia = e.restantes > 0;
    const abierto = st.abierto === e.clave;
    const ocupado = !!st.ocupado;
    const pide = (m) => !!(e.asignada && e.asignada[m]);
    const faltan = Math.max(0, e.fichas - (d.fichas || 0));
    const botonEq = (m) => `<button class="btn" data-est="asignar" data-clave="${esc(e.clave)}" data-equipo="${m}" aria-pressed="${pide(m)}" ${!mia || ocupado ? 'disabled' : ''}>${esc(pide(m) ? '✓ ' + T('equipo.' + m) : T('poner', { e: T('equipo.' + m) }))}</button>`;
    return `<article class="pe-star${mia ? ' mia' : ''}" data-estrella="${esc(e.clave)}" data-rol="${esc(e.rol)}">
      <div class="pe-top">
        <div class="pe-foto">${retrato(e, 72)}<span class="nv">★${esc(e.habilidad || 5)}</span></div>
        <div class="pe-info">
          <h4>${esc(e.nombre)}</h4>
          <div class="pe-rol">${icon('role_' + e.rol, '', 14)}<span>${esc(T('rol.' + e.rol))} · ${esc(e.ciudad || '')}</span></div>
          <p class="pe-tag">“${esc(T('tag.' + e.clave))}”</p>
        </div>
      </div>
      <div class="pe-datos">
        <span>${esc(T('nivel', { h: e.habilidad || 5 }))}</span>
        <span>${esc(T('ventaja', { e: e.puntos_equipo, b: e.bono }))}</span>
        ${mia ? `<span class="pt" data-restantes="${e.restantes}">${esc(partidosTxt(e.restantes))}</span>${e.vence ? `<span>${esc(T('vence', { f: fecha(e.vence) }))}</span>` : ''}` : `<span class="no">${esc(T('sin_partidos'))}</span>`}
      </div>
      <div class="pe-acc">
        <button class="btn oro" data-est="abrir" data-clave="${esc(e.clave)}" aria-expanded="${abierto}" ${ocupado ? 'disabled' : ''}>${esc(abierto ? T('cerrar') : T('contratar'))}</button>
        ${botonEq('copa')}${botonEq('duelo')}
      </div>
      ${abierto ? `<div class="pe-panel" data-panel="${esc(e.clave)}">
        <small>${esc(T('con_creditos'))}</small>
        <div class="pe-paq">${(e.precios || []).map((p) => `<button data-est="contratar" data-clave="${esc(e.clave)}" data-modo="credito" data-partidos="${p.partidos}" ${ocupado || p.creditos > (d.creditos || 0) ? 'disabled' : ''}><b>${esc(partidosTxt(p.partidos))}</b><span>${icon('gem', '', 11)} ${num(p.creditos)}</span></button>`).join('')}</div>
        <div class="pe-gratis"><span>${icon('star', '', 13)} <b>${esc(T('con_fichas'))}</b> · ${esc(T('fichas_n', { n: num(e.fichas) }))}${faltan ? ` · <span class="muted">${esc(T('te_faltan', { n: num(faltan) }))}</span>` : ''}</span>
          <button class="btn sm" data-est="contratar" data-clave="${esc(e.clave)}" data-modo="fichas" data-partidos="1" ${ocupado || faltan ? 'disabled' : ''}>${esc(T('contratar'))}</button></div>
      </div>` : ''}
    </article>`;
  }

  function agencia(d) {
    const f = st.filtro;
    const lista = (d.catalogo || []).filter((e) => f === 'todos' || e.rol === f);
    lista.sort((a, b) => (b.restantes > 0) - (a.restantes > 0));
    const chip = (r) => `<button data-est="filtro" data-rol="${r}" aria-pressed="${f === r}">${esc(r === 'todos' ? T('todos') : T('rol.' + r))}</button>`;
    return `<div class="card" data-est-zona="agencia"><h3 class="pe-h3">${esc(T('agencia'))}</h3>
      <div class="pe-filtros">${['todos'].concat(ROLES).map(chip).join('')}</div>
      <div class="pe-lista">${lista.map((e) => tarjeta(e, d)).join('')}</div></div>`;
  }

  function pase(d) {
    const pc = d.pase_copa; if (!pc) return '';
    const base = pc.intentos_base || 10, extra = pc.extra || 5, tope = pc.tope || 18, max = pc.intentos_max || base;
    const vip = pc.vip_extra || 0;
    const barra = Array.from({ length: tope }, (_, i) => `<i class="${i < base ? 'base' : i < base + (pc.activo ? extra : 0) ? 'extra' : i < max ? 'vip' : ''}"></i>`).join('');
    const valor = st.ctx && typeof st.ctx.comprar === 'function' ? precioDe(pc.producto || 'pase_copa', pc.precio_usd) : null;
    let pie;
    if (pc.activo) pie = `<div class="pe-ok" data-pase="activo">${icon('star', '', 14)}${esc(T('pase_activo'))} · ${esc(T('pase_hoy', { max: num(max) }))}</div>`;
    else if (!pc.puede_comprar) pie = `<p data-pase="fuera">${esc(T('pase_fuera'))}</p>`;
    else pie = `<div class="botones" data-pase="comprar"><button class="btn main" data-est="pase" ${st.ocupado ? 'disabled' : ''}>${icon('gem', '', 14)}${esc(T('pase_creditos', { n: num(pc.precio_creditos) }))}</button>
      ${valor ? `<button class="btn" data-est="pase_dinero" ${st.ocupado ? 'disabled' : ''}>${esc(valor)}</button>` : ''}</div>`;
    return `<div class="card pe-pase" data-est-zona="pase">
      <h3 class="pe-h3"><span>${esc(T('pase_t'))}</span><small class="muted pe-mono">${esc(pc.semana || '')}</small></h3>
      <div class="grande"><b>+${num(extra)}</b><span>${esc(T('pase_sub', { n: num(extra) }))}</span></div>
      <p>${esc(T('pase_det', { s: pc.semana || '', max: num(Math.min(tope, base + extra + vip)) }))}</p>
      <div class="barra" aria-hidden="true">${barra}</div>
      <p class="small muted">${esc(T('pase_tope', { t: num(tope) }))}</p>
      ${pie}</div>`;
  }

  function fichas(d) {
    const dia = d.fichas_dia || 12, hoy = d.fichas_hoy || 0;
    const barato = Math.min.apply(null, (d.catalogo || [{ fichas: 8 }]).map((e) => e.fichas || 8));
    const pct = Math.max(0, Math.min(100, Math.round(100 * (d.fichas || 0) / barato)));
    return `<div class="card pe-fichas" data-est-zona="fichas"><h3 class="pe-h3"><span>${esc(T('fichas_t'))}</span><b class="pe-mono" style="color:#ffe08a">${num(d.fichas)}</b></h3>
      <div class="medidor" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <p>${esc(T('fichas_det', { d: num(dia) }))}</p>
      <p class="small muted">${esc(T('fichas_hoy', { n: num(hoy), d: num(dia) }))}</p></div>`;
  }

  function pintar() {
    if (!st.el) return;
    css();
    const d = st.datos;
    let html;
    if (sinSesion()) html = `${cabecera(null)}<div class="card pe-msg" data-est-estado="sin_sesion"><h3>${esc(T('sin_sesion_t'))}</h3><p class="small muted">${esc(T('sin_sesion'))}</p></div>`;
    else if (!d && st.error) html = `${cabecera(null)}<div class="card pe-msg" data-est-estado="error"><p>${esc(st.error)}</p>${st.codigo ? `<p class="small muted">${esc(T('codigo', { c: st.codigo }))}</p>` : ''}<button class="btn" data-est="recargar">${esc(T('reintentar'))}</button></div>`;
    else if (!d) html = `${cabecera(null)}<div class="card pe-msg" data-est-estado="cargando"><p class="muted">${esc(T('cargando'))}</p></div>`;
    else html = `${cabecera(d)}${equipos(d)}${pase(d)}${agencia(d)}${fichas(d)}<p class="pe-justo">${icon('shield', '', 14)}<span>${esc(T('justo'))}</span></p>`;
    st.el.innerHTML = `<div class="pe" data-est-estado="${esc(d ? 'listo' : sinSesion() ? 'sin_sesion' : st.error ? 'error' : 'cargando')}"${st.ocupado ? ' aria-busy="true"' : ''}>${html}</div>`;
  }

  function render(el, ctx) {
    if (st.el && st.el !== el) st.el.removeEventListener('click', alTocar);
    if (st.el !== el) el.addEventListener('click', alTocar);
    st.el = el; st.ctx = ctx || {};
    pintar();
    return cargar();
  }

  /* ---------- tarjeta en Inicio (window.EnVivoInicio, orden 35) ---------- */
  function abrirPantalla() {
    if (typeof root.EnVivoAbrirOnline === 'function') { root.EnVivoAbrirOnline('estrellas'); return; }
    if (typeof document === 'undefined') return;
    const nav = document.querySelector('nav button[data-tab="online"]');
    if (nav) nav.click();
    const b = document.createElement('button');
    b.setAttribute('data-act', 'online'); b.setAttribute('data-k', 'estrellas'); b.hidden = true;
    document.body.appendChild(b); b.click(); b.remove();
  }
  const inicio = {
    id: 'estrellas', orden: 35,
    tarjeta(ctx) {
      const A = root.Api;
      let logueado = false;
      try { logueado = !!(A && A.disponible !== false && A.logueado && A.logueado()); } catch (e) { logueado = false; }
      if (!logueado) return '';
      if ((!st.datos || Date.now() - st.cargadoEn > 5 * 60e3) && !st.cargando && Date.now() - st.intentoInicio > 5 * 60e3) {
        st.intentoInicio = Date.now();
        const antes = !!st.datos;
        (st.ctx && st.ctx.pedir ? st.ctx.pedir('GET', '/api/estrellas') : pedir('GET', '/api/estrellas')).then((x) => { usar(x); if (ctx && ctx.render && (antes || (x && x.copa && x.copa.activa))) ctx.render(); pintar(); }).catch(() => {});
      }
      const d = st.datos;
      if (!d || !d.copa || !d.copa.activa) return '';
      css();
      const k = d.asignadas && d.asignadas.copa && d.asignadas.copa[0];
      const e = k && (d.catalogo || []).find((x) => x.clave === k);
      const pc = d.pase_copa || {};
      return `<div class="card pe-ini" data-est-inicio="${esc(d.copa.fase)}">
        <div class="row1">${e ? retrato(e, 44) : `<div class="pe-hueco" style="width:44px;height:44px;border-radius:50%;border:2px dashed #5a4512;display:grid;place-items:center;color:#f0b829">${icon('star', '', 18)}</div>`}
          <div class="g"><b>${esc(T('titulo'))}</b><small>${esc(e ? T('inicio_copa', { n: corto(e.nombre) }) + ' · ' + partidosTxt(e.restantes) : T('inicio_sin'))}</small></div></div>
        <div class="cta"><span>${esc(pc.activo ? T('inicio_pase', { max: num(pc.intentos_max) }) : T('inicio_pase_no', { n: num(pc.extra || 5) }))}</span>
          <button class="btn sm main" data-ext="estrellas" data-acc="abrir">${esc(T('ver'))}</button></div></div>`;
    },
    clic(ctx, accion) { if (accion === 'abrir') abrirPantalla(); },
  };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === 'estrellas')) root.EnVivoInicio.push(inicio);

  root.Estrellas = { render, recargar: () => cargar(), invalidar() { st.datos = null; st.error = ''; st.codigo = ''; }, T, TRAD, ES, inicio, _st: st };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Estrellas;
})(typeof window !== 'undefined' ? window : globalThis);
