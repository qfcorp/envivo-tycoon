/* =========================================================
   EN VIVO Tycoon — Copa de Servidores (pantalla)
   Contrato: server/COPAS.md §2. Tu servidor contra los otros servidores del universo, cada semana:
     lunes→viernes  preparacion  (sumas puntos jugando eventos validados por el servidor)
     sábado 00→20   batalla      (3 cruces: 5 partidos cada uno, el servidor juega todo)
     sábado 20→dom  cerrada      (resultados y premios)
   API: GET /api/copa · POST /api/copa/equipo {staff, equip} · POST /api/copa/intento/iniciar {} ·
        POST /api/copa/intento/enviar {intento_id, decisiones, resultado:{calidad, estrellas}}
   Uso desde ui.js (ver docs/INTEGRAR_COPAS_PANTALLA.md):
     Copas.render(elemento, ctx)
       ctx = { Api?, A (Art), estado() (partida), guardar?(), toast?(t), ask?(html, boton, fn), snd?(n), vip?,
               jugarIntento(intento) -> Promise<{decisiones, resultado:{quality|calidad, stars|estrellas}} | null>,
               equipo?(datos) -> {staff, equip}, pedir?(method, ruta, body), sincronizar?() }
     Copas.detener()  → para el contador
   Inicio: se agrega a window.EnVivoInicio (orden 30) mientras haya copa en preparación o batalla.
   Textos: ES aquí mismo + TRAD[código] (I18N.idioma); lo que falte sale en español.
   ========================================================= */
(function (root) {
  'use strict';

  const ES = {
    'titulo': 'Copa de Servidores', 'cargando': 'Abriendo la copa…', 'reintentar': 'Intentar de nuevo',
    'error': 'No se pudo abrir la copa.', 'codigo': 'Código: {c}', 'sin_internet': 'Sin conexión. Revisa tu internet e intenta de nuevo.',
    'sin_sesion_t': 'Entra con tu cuenta', 'sin_sesion': 'La Copa de Servidores se juega en línea: tu servidor contra los otros servidores del universo. Entra o crea tu cuenta para sumar puntos.',
    'sin_copa_t': 'Todavía no hay copa esta semana', 'sin_copa': 'La próxima copa arranca el lunes a las 00:00. Mientras tanto, prepara a tu mejor personal y equipos.',
    'fase.preparacion': 'Preparación', 'fase.batalla': 'Batalla', 'fase.cerrada': 'Final', 'en_vivo': 'EN VIVO',
    'cuenta.preparacion': 'La batalla empieza en', 'cuenta.batalla': 'La batalla termina en', 'cuenta.cerrada': 'Nueva copa en', 'cuenta.cruce': 'Próximo cruce en',
    'marcador': 'Marcador', 'tu_servidor': 'TU SERVIDOR', 'rival': 'RIVAL', 'pos': 'Pos', 'servidor': 'Servidor', 'pts': 'Pts', 'gep': 'G-E-P', 'prep': 'Prep.',
    'va': 'Tu servidor va {n}°', 'lider': '¡Tu servidor va primero!',
    'preparacion_t': 'Preparación de cada servidor', 'preparacion_det': 'Cada evento validado suma puntos de preparación. El bono llega hasta +15 en cada cruce.',
    'bono': 'bono +{n}',
    'tu_aporte': 'Tu aporte', 'puntos': '{n} pts', 'puesto_srv': 'Vas {n}° en tu servidor', 'sin_puesto': 'Todavía no sumas puntos para tu servidor.',
    'equipo_ok': 'Equipo de copa registrado', 'equipo_no': 'Aún no registras tu equipo de copa',
    'equipo_det': 'Se lleva tu mejor personal y equipos. Los 5 mejores equipos del servidor forman el plantel del sábado.',
    'registrar': 'Registrar equipo de copa', 'actualizar': 'Actualizar equipo de copa',
    'registrado': '¡Listo! Tu equipo de copa quedó registrado ({p} personas, {e} equipos).', 'sin_partida': 'No hay partida cargada para elegir tu equipo.',
    'sumar': 'Sumar puntos', 'seguir': 'Seguir mi evento', 'sumar_det': 'Juega un evento con la semilla del servidor: lo que saques suma para tu servidor.',
    'solo_prep': 'Los puntos se suman de lunes a viernes, durante la preparación.',
    'preparando': 'Preparando tu evento…', 'validando': 'El servidor está revisando tu transmisión…',
    'resultado': 'Calidad {calidad} · +{puntos} pts para tu servidor', 'invalido': 'Ese evento no se pudo validar. No sumó puntos.',
    'pausado': 'Tu evento sigue abierto. Puedes terminarlo en los próximos minutos.', 'sin_juego': 'Actualiza el juego para jugar eventos de la copa.',
    'reanudado': 'Seguimos con tu evento abierto.',
    'cruces': 'Cruces del sábado', 'cruces_det': 'Cada cruce son 5 partidos con el mismo contrato: gana la mayor calidad.',
    'ronda': 'Cruce {n}', 'pendiente': 'Por jugarse', 'jugado': 'Terminado', 'empate': 'Empate', 'gana': 'Gana {n}',
    'por_jugar': 'Sábado {h}', 'sin_cruces': 'Los cruces se arman el sábado con los planteles registrados.',
    'top': 'Top aportantes', 'top_vacio': 'Nadie ha sumado todavía. ¡Sé el primero!',
    'historial': 'Campeones de semanas pasadas', 'historial_vacio': 'Esta es la primera copa del universo.',
    'premios': 'Premios', 'premio.campeon': 'Servidor campeón', 'premio.campeon_det': 'Todos los que aportaron: dinero del juego, fama, trofeo de copa y materiales de sede.',
    'premio.top10': 'Top 10 del campeón', 'premio.top10_det': 'Premio extra para los 10 que más aportaron.',
    'premio.resto': 'Los demás servidores', 'premio.resto_det': 'Premio de participación según tu aporte.', 'premio.nota': 'Sin dinero real: todo es del juego.',
    'fama': '+{n} fama', 'trofeo': 'Trofeo: {n}', 'reparar': 'Taller (todo al 100 %)',
    'como': '¿Cómo funciona?', 'como_texto': 'De lunes a viernes sumas puntos de preparación jugando eventos. El sábado los 5 mejores equipos de cada servidor se enfrentan en cruces transmitidos en vivo. Ganar un cruce da 3 puntos; empatar, 1.',
    'ver': 'Ver la copa', 'inicio_prep': 'Tu servidor va {n}° en la preparación', 'inicio_bat': 'Tu servidor va {n}° en la tabla',
    'campeon': '¡{n} es campeón!', 'tu_campeon': '¡Tu servidor es campeón!', 'tu': 'Tú',
    'err.sin_sesion': 'Tu sesión se cerró. Vuelve a entrar.', 'err.fase': 'Eso no se puede hacer en esta fase de la copa.',
    'err.sin_equipo': 'Primero registra tu equipo de copa.', 'err.equipo_invalido': 'Tu equipo no pasó la revisión del servidor.',
    'err.limite': 'Vas muy rápido. Espera un momento.', 'err.vencido': 'El evento se venció. Empieza otro.', 'err.sin_copa': 'No hay copa abierta ahora.',
    'torneo.planeta': 'Copa Planeta de Balompié', 'torneo.libertadores': 'Copa de los Libertadores del Sur', 'torneo.estelar': 'Liga Estelar de Clubes',
    'torneo.aro': 'Mundial de Aro y Tablero', 'torneo.continentes': 'Juegos de los Cinco Continentes', 'torneo.formula': 'Gran Premio Fórmula Veloz',
    'torneo.pelea': 'La Pelea del Siglo', 'torneo.tazon': 'El Gran Tazón',
  };

  const TRAD = {
    en: {
      'titulo': 'Server Cup', 'cargando': 'Opening the cup…', 'reintentar': 'Try again', 'error': "Couldn't open the cup.", 'codigo': 'Code: {c}',
      'sin_internet': 'No connection. Check your internet and try again.', 'sin_sesion_t': 'Sign in to your account',
      'sin_sesion': 'The Server Cup is played online: your server against the other servers in the universe. Sign in or create your account to score points.',
      'sin_copa_t': 'No cup this week yet', 'sin_copa': 'The next cup starts Monday at 00:00. Meanwhile, get your best crew and gear ready.',
      'fase.preparacion': 'Warm-up', 'fase.batalla': 'Battle', 'fase.cerrada': 'Final', 'en_vivo': 'LIVE',
      'cuenta.preparacion': 'Battle starts in', 'cuenta.batalla': 'Battle ends in', 'cuenta.cerrada': 'New cup in', 'cuenta.cruce': 'Next match-up in',
      'marcador': 'Scoreboard', 'tu_servidor': 'YOUR SERVER', 'rival': 'RIVAL', 'pos': 'Pos', 'servidor': 'Server', 'pts': 'Pts', 'gep': 'W-D-L', 'prep': 'Prep',
      'va': 'Your server is {n}', 'lider': 'Your server is in first place!',
      'preparacion_t': 'Warm-up by server', 'preparacion_det': 'Every validated event adds warm-up points. The bonus goes up to +15 in each match-up.', 'bono': 'bonus +{n}',
      'tu_aporte': 'Your contribution', 'puntos': '{n} pts', 'puesto_srv': "You're #{n} on your server", 'sin_puesto': "You haven't scored for your server yet.",
      'equipo_ok': 'Cup team registered', 'equipo_no': "You haven't registered your cup team yet",
      'equipo_det': 'Takes your best crew and gear. The server’s top 5 teams make up Saturday’s squad.',
      'registrar': 'Register cup team', 'actualizar': 'Update cup team', 'registrado': 'Done! Your cup team is registered ({p} people, {e} items).',
      'sin_partida': 'No save loaded to pick your team.', 'sumar': 'Score points', 'seguir': 'Resume my event',
      'sumar_det': 'Play an event with the server’s seed: whatever you get counts for your server.', 'solo_prep': 'Points are scored Monday to Friday, during the warm-up.',
      'preparando': 'Getting your event ready…', 'validando': 'The server is reviewing your broadcast…', 'resultado': 'Quality {calidad} · +{puntos} pts for your server',
      'invalido': "That event couldn't be validated. No points.", 'pausado': 'Your event is still open. You can finish it in the next few minutes.',
      'sin_juego': 'Update the game to play cup events.', 'reanudado': 'Picking up your open event.',
      'cruces': 'Saturday match-ups', 'cruces_det': 'Each match-up is 5 games with the same contract: highest quality wins.',
      'ronda': 'Match-up {n}', 'pendiente': 'Upcoming', 'jugado': 'Finished', 'empate': 'Draw', 'gana': '{n} wins', 'por_jugar': 'Saturday {h}',
      'sin_cruces': 'Match-ups are set on Saturday with the registered squads.', 'top': 'Top contributors', 'top_vacio': 'Nobody has scored yet. Be the first!',
      'historial': 'Past champions', 'historial_vacio': 'This is the universe’s first cup.', 'premios': 'Rewards', 'premio.campeon': 'Champion server',
      'premio.campeon_det': 'Everyone who contributed: in-game cash, fame, a cup trophy and HQ materials.', 'premio.top10': "Champion's top 10",
      'premio.top10_det': 'Extra reward for the 10 biggest contributors.', 'premio.resto': 'Other servers', 'premio.resto_det': 'Participation reward based on your contribution.',
      'premio.nota': 'No real money: everything is in-game.', 'fama': '+{n} fame', 'trofeo': 'Trophy: {n}', 'reparar': 'Workshop (everything to 100%)',
      'como': 'How does it work?', 'como_texto': 'Monday to Friday you score warm-up points by playing events. On Saturday each server’s top 5 teams face off in match-ups broadcast live. Winning a match-up gives 3 points; a draw, 1.',
      'ver': 'View the cup', 'inicio_prep': 'Your server is #{n} in the warm-up', 'inicio_bat': 'Your server is #{n} in the table',
      'campeon': '{n} is the champion!', 'tu_campeon': 'Your server is the champion!', 'tu': 'You',
      'err.sin_sesion': 'Your session ended. Sign in again.', 'err.fase': "That can't be done in this phase of the cup.", 'err.sin_equipo': 'Register your cup team first.',
      'err.equipo_invalido': "Your team didn't pass the server check.", 'err.limite': "You're going too fast. Wait a moment.", 'err.vencido': 'The event expired. Start another one.',
      'err.sin_copa': 'There’s no open cup right now.',
      'torneo.planeta': 'Planet Footy Cup', 'torneo.libertadores': 'Southern Liberators Cup', 'torneo.estelar': 'Stellar Club League', 'torneo.aro': 'Hoop & Board World Cup',
      'torneo.continentes': 'Five Continents Games', 'torneo.formula': 'Fast Formula Grand Prix', 'torneo.pelea': 'The Fight of the Century', 'torneo.tazon': 'The Big Bowl',
    },
    'pt-BR': {
      'titulo': 'Copa de Servidores', 'cargando': 'Abrindo a copa…', 'reintentar': 'Tentar de novo', 'error': 'Não deu para abrir a copa.', 'codigo': 'Código: {c}',
      'sin_internet': 'Sem conexão. Confira sua internet e tente de novo.', 'sin_sesion_t': 'Entre na sua conta',
      'sin_sesion': 'A Copa de Servidores é jogada online: seu servidor contra os outros servidores do universo. Entre ou crie sua conta para somar pontos.',
      'sin_copa_t': 'Ainda não tem copa nesta semana', 'sin_copa': 'A próxima copa começa na segunda às 00:00. Enquanto isso, prepare sua melhor equipe e equipamentos.',
      'fase.preparacion': 'Preparação', 'fase.batalla': 'Batalha', 'fase.cerrada': 'Final', 'en_vivo': 'AO VIVO',
      'cuenta.preparacion': 'A batalha começa em', 'cuenta.batalla': 'A batalha termina em', 'cuenta.cerrada': 'Nova copa em', 'cuenta.cruce': 'Próximo confronto em',
      'marcador': 'Placar', 'tu_servidor': 'SEU SERVIDOR', 'rival': 'RIVAL', 'pos': 'Pos', 'servidor': 'Servidor', 'pts': 'Pts', 'gep': 'V-E-D', 'prep': 'Prep.',
      'va': 'Seu servidor está em {n}º', 'lider': 'Seu servidor está em primeiro!',
      'preparacion_t': 'Preparação de cada servidor', 'preparacion_det': 'Cada evento validado soma pontos de preparação. O bônus vai até +15 em cada confronto.', 'bono': 'bônus +{n}',
      'tu_aporte': 'Sua contribuição', 'puntos': '{n} pts', 'puesto_srv': 'Você está em {n}º no seu servidor', 'sin_puesto': 'Você ainda não somou pontos para o seu servidor.',
      'equipo_ok': 'Time da copa registrado', 'equipo_no': 'Você ainda não registrou seu time da copa',
      'equipo_det': 'Leva sua melhor equipe e equipamentos. Os 5 melhores times do servidor formam o elenco de sábado.',
      'registrar': 'Registrar time da copa', 'actualizar': 'Atualizar time da copa', 'registrado': 'Pronto! Seu time da copa foi registrado ({p} pessoas, {e} equipamentos).',
      'sin_partida': 'Não há partida carregada para escolher seu time.', 'sumar': 'Somar pontos', 'seguir': 'Continuar meu evento',
      'sumar_det': 'Jogue um evento com a semente do servidor: o que você tirar soma para o seu servidor.', 'solo_prep': 'Os pontos são somados de segunda a sexta, durante a preparação.',
      'preparando': 'Preparando seu evento…', 'validando': 'O servidor está revisando sua transmissão…', 'resultado': 'Qualidade {calidad} · +{puntos} pts para seu servidor',
      'invalido': 'Esse evento não pôde ser validado. Não somou pontos.', 'pausado': 'Seu evento continua aberto. Você pode terminá-lo nos próximos minutos.',
      'sin_juego': 'Atualize o jogo para jogar eventos da copa.', 'reanudado': 'Continuando seu evento aberto.',
      'cruces': 'Confrontos de sábado', 'cruces_det': 'Cada confronto tem 5 partidas com o mesmo contrato: vence a maior qualidade.',
      'ronda': 'Confronto {n}', 'pendiente': 'A jogar', 'jugado': 'Encerrado', 'empate': 'Empate', 'gana': '{n} vence', 'por_jugar': 'Sábado {h}',
      'sin_cruces': 'Os confrontos são montados no sábado com os elencos registrados.', 'top': 'Maiores contribuidores', 'top_vacio': 'Ninguém somou ainda. Seja o primeiro!',
      'historial': 'Campeões das semanas passadas', 'historial_vacio': 'Esta é a primeira copa do universo.', 'premios': 'Prêmios', 'premio.campeon': 'Servidor campeão',
      'premio.campeon_det': 'Todos que contribuíram: dinheiro do jogo, fama, troféu da copa e materiais da sede.', 'premio.top10': 'Top 10 do campeão',
      'premio.top10_det': 'Prêmio extra para os 10 que mais contribuíram.', 'premio.resto': 'Os outros servidores', 'premio.resto_det': 'Prêmio de participação conforme sua contribuição.',
      'premio.nota': 'Sem dinheiro real: tudo é do jogo.', 'fama': '+{n} fama', 'trofeo': 'Troféu: {n}', 'reparar': 'Oficina (tudo a 100%)',
      'como': 'Como funciona?', 'como_texto': 'De segunda a sexta você soma pontos de preparação jogando eventos. No sábado os 5 melhores times de cada servidor se enfrentam em confrontos transmitidos ao vivo. Vencer um confronto dá 3 pontos; empatar, 1.',
      'ver': 'Ver a copa', 'inicio_prep': 'Seu servidor está em {n}º na preparação', 'inicio_bat': 'Seu servidor está em {n}º na tabela',
      'campeon': '{n} é campeão!', 'tu_campeon': 'Seu servidor é campeão!', 'tu': 'Você',
      'err.sin_sesion': 'Sua sessão terminou. Entre de novo.', 'err.fase': 'Isso não pode ser feito nesta fase da copa.', 'err.sin_equipo': 'Primeiro registre seu time da copa.',
      'err.equipo_invalido': 'Seu time não passou na revisão do servidor.', 'err.limite': 'Você está indo rápido demais. Espere um pouco.', 'err.vencido': 'O evento venceu. Comece outro.',
      'err.sin_copa': 'Não há copa aberta agora.',
      'torneo.planeta': 'Copa Planeta de Bola', 'torneo.libertadores': 'Copa dos Libertadores do Sul', 'torneo.estelar': 'Liga Estelar de Clubes', 'torneo.aro': 'Mundial de Aro e Tabela',
      'torneo.continentes': 'Jogos dos Cinco Continentes', 'torneo.formula': 'Grande Prêmio Fórmula Veloz', 'torneo.pelea': 'A Luta do Século', 'torneo.tazon': 'A Grande Tigela',
    },
    fr: {
      'titulo': 'Coupe des Serveurs', 'cargando': 'Ouverture de la coupe…', 'reintentar': 'Réessayer', 'error': "Impossible d'ouvrir la coupe.", 'codigo': 'Code : {c}',
      'sin_internet': 'Pas de connexion. Vérifie ton internet et réessaie.', 'sin_sesion_t': 'Connecte-toi à ton compte',
      'sin_sesion': 'La Coupe des Serveurs se joue en ligne : ton serveur contre les autres serveurs de l’univers. Connecte-toi ou crée ton compte pour marquer des points.',
      'sin_copa_t': 'Pas encore de coupe cette semaine', 'sin_copa': 'La prochaine coupe commence lundi à 00:00. En attendant, prépare ta meilleure équipe et ton meilleur matériel.',
      'fase.preparacion': 'Préparation', 'fase.batalla': 'Bataille', 'fase.cerrada': 'Finale', 'en_vivo': 'EN DIRECT',
      'cuenta.preparacion': 'La bataille commence dans', 'cuenta.batalla': 'La bataille se termine dans', 'cuenta.cerrada': 'Nouvelle coupe dans', 'cuenta.cruce': 'Prochain duel dans',
      'marcador': 'Tableau de score', 'tu_servidor': 'TON SERVEUR', 'rival': 'RIVAL', 'pos': 'Pos', 'servidor': 'Serveur', 'pts': 'Pts', 'gep': 'V-N-D', 'prep': 'Prép.',
      'va': 'Ton serveur est {n}e', 'lider': 'Ton serveur est premier !',
      'preparacion_t': 'Préparation par serveur', 'preparacion_det': 'Chaque événement validé ajoute des points de préparation. Le bonus va jusqu’à +15 par duel.', 'bono': 'bonus +{n}',
      'tu_aporte': 'Ta contribution', 'puntos': '{n} pts', 'puesto_srv': 'Tu es {n}e sur ton serveur', 'sin_puesto': "Tu n'as pas encore marqué pour ton serveur.",
      'equipo_ok': 'Équipe de coupe inscrite', 'equipo_no': "Tu n'as pas encore inscrit ton équipe de coupe",
      'equipo_det': 'Prend ta meilleure équipe et ton meilleur matériel. Les 5 meilleures équipes du serveur forment l’effectif du samedi.',
      'registrar': "Inscrire l'équipe de coupe", 'actualizar': "Mettre à jour l'équipe", 'registrado': 'C’est fait ! Ton équipe de coupe est inscrite ({p} personnes, {e} équipements).',
      'sin_partida': 'Aucune partie chargée pour choisir ton équipe.', 'sumar': 'Marquer des points', 'seguir': 'Reprendre mon événement',
      'sumar_det': 'Joue un événement avec la graine du serveur : ton résultat compte pour ton serveur.', 'solo_prep': 'Les points se marquent du lundi au vendredi, pendant la préparation.',
      'preparando': 'Préparation de ton événement…', 'validando': 'Le serveur vérifie ta diffusion…', 'resultado': 'Qualité {calidad} · +{puntos} pts pour ton serveur',
      'invalido': "Cet événement n'a pas pu être validé. Aucun point.", 'pausado': 'Ton événement est toujours ouvert. Tu peux le finir dans les prochaines minutes.',
      'sin_juego': 'Mets le jeu à jour pour jouer les événements de la coupe.', 'reanudado': 'On reprend ton événement ouvert.',
      'cruces': 'Duels du samedi', 'cruces_det': 'Chaque duel compte 5 matchs avec le même contrat : la meilleure qualité gagne.',
      'ronda': 'Duel {n}', 'pendiente': 'À jouer', 'jugado': 'Terminé', 'empate': 'Nul', 'gana': '{n} gagne', 'por_jugar': 'Samedi {h}',
      'sin_cruces': 'Les duels se forment le samedi avec les effectifs inscrits.', 'top': 'Meilleurs contributeurs', 'top_vacio': "Personne n'a encore marqué. Sois le premier !",
      'historial': 'Champions des semaines passées', 'historial_vacio': 'C’est la première coupe de l’univers.', 'premios': 'Récompenses', 'premio.campeon': 'Serveur champion',
      'premio.campeon_det': 'Tous ceux qui ont contribué : argent du jeu, renommée, trophée de coupe et matériaux de siège.', 'premio.top10': 'Top 10 du champion',
      'premio.top10_det': 'Récompense en plus pour les 10 plus gros contributeurs.', 'premio.resto': 'Les autres serveurs', 'premio.resto_det': 'Récompense de participation selon ta contribution.',
      'premio.nota': 'Pas d’argent réel : tout est dans le jeu.', 'fama': '+{n} renommée', 'trofeo': 'Trophée : {n}', 'reparar': 'Atelier (tout à 100 %)',
      'como': 'Comment ça marche ?', 'como_texto': 'Du lundi au vendredi, tu marques des points de préparation en jouant des événements. Le samedi, les 5 meilleures équipes de chaque serveur s’affrontent en duels diffusés en direct. Gagner un duel rapporte 3 points ; un nul, 1.',
      'ver': 'Voir la coupe', 'inicio_prep': 'Ton serveur est {n}e en préparation', 'inicio_bat': 'Ton serveur est {n}e au classement',
      'campeon': '{n} est champion !', 'tu_campeon': 'Ton serveur est champion !', 'tu': 'Toi',
      'err.sin_sesion': 'Ta session est terminée. Reconnecte-toi.', 'err.fase': 'Impossible pendant cette phase de la coupe.', 'err.sin_equipo': "Inscris d'abord ton équipe de coupe.",
      'err.equipo_invalido': "Ton équipe n'a pas passé le contrôle du serveur.", 'err.limite': 'Tu vas trop vite. Attends un instant.', 'err.vencido': "L'événement a expiré. Lance-en un autre.",
      'err.sin_copa': "Il n'y a pas de coupe ouverte en ce moment.",
      'torneo.planeta': 'Coupe Planète du Ballon', 'torneo.libertadores': 'Coupe des Libérateurs du Sud', 'torneo.estelar': 'Ligue Stellaire des Clubs', 'torneo.aro': 'Mondial Cerceau et Panneau',
      'torneo.continentes': 'Jeux des Cinq Continents', 'torneo.formula': 'Grand Prix Formule Rapide', 'torneo.pelea': 'Le Combat du Siècle', 'torneo.tazon': 'Le Grand Bol',
    },
    de: {
      'titulo': 'Server-Pokal', 'cargando': 'Pokal wird geöffnet…', 'reintentar': 'Nochmal versuchen', 'error': 'Der Pokal konnte nicht geöffnet werden.', 'codigo': 'Code: {c}',
      'sin_internet': 'Keine Verbindung. Prüf dein Internet und versuch es nochmal.', 'sin_sesion_t': 'Melde dich an',
      'sin_sesion': 'Der Server-Pokal wird online gespielt: dein Server gegen die anderen Server des Universums. Melde dich an oder erstelle ein Konto, um Punkte zu holen.',
      'sin_copa_t': 'Diese Woche noch kein Pokal', 'sin_copa': 'Der nächste Pokal startet Montag um 00:00. Bis dahin: Bring dein bestes Team und Equipment in Form.',
      'fase.preparacion': 'Vorbereitung', 'fase.batalla': 'Kampf', 'fase.cerrada': 'Finale', 'en_vivo': 'LIVE',
      'cuenta.preparacion': 'Kampf beginnt in', 'cuenta.batalla': 'Kampf endet in', 'cuenta.cerrada': 'Neuer Pokal in', 'cuenta.cruce': 'Nächstes Duell in',
      'marcador': 'Anzeigetafel', 'tu_servidor': 'DEIN SERVER', 'rival': 'GEGNER', 'pos': 'Pl.', 'servidor': 'Server', 'pts': 'Pkt', 'gep': 'S-U-N', 'prep': 'Vorb.',
      'va': 'Dein Server ist {n}.', 'lider': 'Dein Server ist Erster!',
      'preparacion_t': 'Vorbereitung pro Server', 'preparacion_det': 'Jedes bestätigte Event bringt Vorbereitungspunkte. Der Bonus reicht bis +15 pro Duell.', 'bono': 'Bonus +{n}',
      'tu_aporte': 'Dein Beitrag', 'puntos': '{n} Pkt', 'puesto_srv': 'Du bist {n}. auf deinem Server', 'sin_puesto': 'Du hast noch keine Punkte für deinen Server.',
      'equipo_ok': 'Pokalteam angemeldet', 'equipo_no': 'Du hast dein Pokalteam noch nicht angemeldet',
      'equipo_det': 'Nimmt dein bestes Personal und Equipment. Die 5 besten Teams des Servers bilden den Kader am Samstag.',
      'registrar': 'Pokalteam anmelden', 'actualizar': 'Pokalteam aktualisieren', 'registrado': 'Fertig! Dein Pokalteam ist angemeldet ({p} Leute, {e} Geräte).',
      'sin_partida': 'Kein Spielstand geladen, um dein Team zu wählen.', 'sumar': 'Punkte holen', 'seguir': 'Mein Event fortsetzen',
      'sumar_det': 'Spiel ein Event mit dem Seed des Servers: Was du holst, zählt für deinen Server.', 'solo_prep': 'Punkte gibt es Montag bis Freitag, während der Vorbereitung.',
      'preparando': 'Dein Event wird vorbereitet…', 'validando': 'Der Server prüft deine Übertragung…', 'resultado': 'Qualität {calidad} · +{puntos} Pkt für deinen Server',
      'invalido': 'Das Event konnte nicht bestätigt werden. Keine Punkte.', 'pausado': 'Dein Event ist noch offen. Du kannst es in den nächsten Minuten beenden.',
      'sin_juego': 'Aktualisiere das Spiel, um Pokal-Events zu spielen.', 'reanudado': 'Weiter mit deinem offenen Event.',
      'cruces': 'Duelle am Samstag', 'cruces_det': 'Jedes Duell hat 5 Spiele mit demselben Auftrag: Die höhere Qualität gewinnt.',
      'ronda': 'Duell {n}', 'pendiente': 'Steht noch an', 'jugado': 'Beendet', 'empate': 'Unentschieden', 'gana': '{n} gewinnt', 'por_jugar': 'Samstag {h}',
      'sin_cruces': 'Die Duelle werden am Samstag mit den angemeldeten Kadern gebildet.', 'top': 'Top-Beitragende', 'top_vacio': 'Noch hat niemand gepunktet. Sei der Erste!',
      'historial': 'Meister der letzten Wochen', 'historial_vacio': 'Das ist der erste Pokal des Universums.', 'premios': 'Belohnungen', 'premio.campeon': 'Meister-Server',
      'premio.campeon_det': 'Alle, die beigetragen haben: Spielgeld, Ruhm, Pokaltrophäe und Material für die Zentrale.', 'premio.top10': 'Top 10 des Meisters',
      'premio.top10_det': 'Extra-Belohnung für die 10 größten Beitragenden.', 'premio.resto': 'Die anderen Server', 'premio.resto_det': 'Teilnahmebelohnung je nach deinem Beitrag.',
      'premio.nota': 'Kein echtes Geld: alles im Spiel.', 'fama': '+{n} Ruhm', 'trofeo': 'Trophäe: {n}', 'reparar': 'Werkstatt (alles auf 100 %)',
      'como': 'Wie funktioniert das?', 'como_texto': 'Von Montag bis Freitag holst du Vorbereitungspunkte mit Events. Am Samstag treten die 5 besten Teams jedes Servers in live übertragenen Duellen an. Ein Sieg bringt 3 Punkte, ein Unentschieden 1.',
      'ver': 'Zum Pokal', 'inicio_prep': 'Dein Server ist {n}. in der Vorbereitung', 'inicio_bat': 'Dein Server ist {n}. in der Tabelle',
      'campeon': '{n} ist Meister!', 'tu_campeon': 'Dein Server ist Meister!', 'tu': 'Du',
      'err.sin_sesion': 'Deine Sitzung ist abgelaufen. Melde dich neu an.', 'err.fase': 'Das geht in dieser Pokalphase nicht.', 'err.sin_equipo': 'Melde zuerst dein Pokalteam an.',
      'err.equipo_invalido': 'Dein Team hat die Serverprüfung nicht bestanden.', 'err.limite': 'Du bist zu schnell. Warte kurz.', 'err.vencido': 'Das Event ist abgelaufen. Starte ein neues.',
      'err.sin_copa': 'Gerade ist kein Pokal offen.',
      'torneo.planeta': 'Planet-Kicker-Pokal', 'torneo.libertadores': 'Pokal der Befreier des Südens', 'torneo.estelar': 'Sternen-Klubliga', 'torneo.aro': 'Korb-und-Brett-WM',
      'torneo.continentes': 'Spiele der Fünf Kontinente', 'torneo.formula': 'Großer Preis Formel Flink', 'torneo.pelea': 'Der Kampf des Jahrhunderts', 'torneo.tazon': 'Die Große Schüssel',
    },
    it: {
      'titulo': 'Coppa dei Server', 'cargando': 'Apertura della coppa…', 'reintentar': 'Riprova', 'error': 'Impossibile aprire la coppa.', 'codigo': 'Codice: {c}',
      'sin_internet': 'Nessuna connessione. Controlla internet e riprova.', 'sin_sesion_t': 'Entra nel tuo account',
      'sin_sesion': 'La Coppa dei Server si gioca online: il tuo server contro gli altri server dell’universo. Entra o crea un account per fare punti.',
      'sin_copa_t': 'Ancora nessuna coppa questa settimana', 'sin_copa': 'La prossima coppa parte lunedì alle 00:00. Nel frattempo prepara il tuo miglior staff e la tua migliore attrezzatura.',
      'fase.preparacion': 'Preparazione', 'fase.batalla': 'Battaglia', 'fase.cerrada': 'Finale', 'en_vivo': 'IN DIRETTA',
      'cuenta.preparacion': 'La battaglia inizia tra', 'cuenta.batalla': 'La battaglia finisce tra', 'cuenta.cerrada': 'Nuova coppa tra', 'cuenta.cruce': 'Prossimo scontro tra',
      'marcador': 'Tabellone', 'tu_servidor': 'IL TUO SERVER', 'rival': 'RIVALE', 'pos': 'Pos', 'servidor': 'Server', 'pts': 'Pt', 'gep': 'V-N-P', 'prep': 'Prep.',
      'va': 'Il tuo server è {n}°', 'lider': 'Il tuo server è primo!',
      'preparacion_t': 'Preparazione per server', 'preparacion_det': 'Ogni evento convalidato aggiunge punti di preparazione. Il bonus arriva fino a +15 per scontro.', 'bono': 'bonus +{n}',
      'tu_aporte': 'Il tuo contributo', 'puntos': '{n} pt', 'puesto_srv': 'Sei {n}° nel tuo server', 'sin_puesto': 'Non hai ancora fatto punti per il tuo server.',
      'equipo_ok': 'Squadra di coppa registrata', 'equipo_no': 'Non hai ancora registrato la tua squadra di coppa',
      'equipo_det': 'Porta il tuo miglior staff e la migliore attrezzatura. Le 5 migliori squadre del server formano la rosa del sabato.',
      'registrar': 'Registra squadra di coppa', 'actualizar': 'Aggiorna squadra di coppa', 'registrado': 'Fatto! La tua squadra di coppa è registrata ({p} persone, {e} attrezzi).',
      'sin_partida': 'Nessuna partita caricata per scegliere la squadra.', 'sumar': 'Fai punti', 'seguir': 'Riprendi il mio evento',
      'sumar_det': 'Gioca un evento con il seme del server: quello che ottieni conta per il tuo server.', 'solo_prep': 'I punti si fanno dal lunedì al venerdì, durante la preparazione.',
      'preparando': 'Preparo il tuo evento…', 'validando': 'Il server sta controllando la tua trasmissione…', 'resultado': 'Qualità {calidad} · +{puntos} pt per il tuo server',
      'invalido': 'Questo evento non è stato convalidato. Nessun punto.', 'pausado': 'Il tuo evento è ancora aperto. Puoi finirlo nei prossimi minuti.',
      'sin_juego': 'Aggiorna il gioco per giocare gli eventi di coppa.', 'reanudado': 'Riprendiamo il tuo evento aperto.',
      'cruces': 'Scontri del sabato', 'cruces_det': 'Ogni scontro sono 5 partite con lo stesso contratto: vince la qualità più alta.',
      'ronda': 'Scontro {n}', 'pendiente': 'Da giocare', 'jugado': 'Finito', 'empate': 'Pareggio', 'gana': 'Vince {n}', 'por_jugar': 'Sabato {h}',
      'sin_cruces': 'Gli scontri si formano sabato con le rose registrate.', 'top': 'Migliori contributori', 'top_vacio': 'Nessuno ha ancora fatto punti. Sii il primo!',
      'historial': 'Campioni delle settimane passate', 'historial_vacio': 'Questa è la prima coppa dell’universo.', 'premios': 'Premi', 'premio.campeon': 'Server campione',
      'premio.campeon_det': 'Tutti quelli che hanno contribuito: soldi del gioco, fama, trofeo della coppa e materiali per la sede.', 'premio.top10': 'Top 10 del campione',
      'premio.top10_det': 'Premio extra per i 10 che hanno contribuito di più.', 'premio.resto': 'Gli altri server', 'premio.resto_det': 'Premio di partecipazione in base al tuo contributo.',
      'premio.nota': 'Niente soldi veri: è tutto del gioco.', 'fama': '+{n} fama', 'trofeo': 'Trofeo: {n}', 'reparar': 'Officina (tutto al 100%)',
      'como': 'Come funziona?', 'como_texto': 'Dal lunedì al venerdì fai punti di preparazione giocando eventi. Il sabato le 5 migliori squadre di ogni server si sfidano in scontri trasmessi in diretta. Vincere uno scontro vale 3 punti; pareggiare, 1.',
      'ver': 'Vedi la coppa', 'inicio_prep': 'Il tuo server è {n}° nella preparazione', 'inicio_bat': 'Il tuo server è {n}° in classifica',
      'campeon': '{n} è campione!', 'tu_campeon': 'Il tuo server è campione!', 'tu': 'Tu',
      'err.sin_sesion': 'La tua sessione è scaduta. Rientra.', 'err.fase': 'Non si può fare in questa fase della coppa.', 'err.sin_equipo': 'Prima registra la tua squadra di coppa.',
      'err.equipo_invalido': 'La tua squadra non ha superato il controllo del server.', 'err.limite': 'Vai troppo veloce. Aspetta un attimo.', 'err.vencido': "L'evento è scaduto. Iniziane un altro.",
      'err.sin_copa': 'Non c’è nessuna coppa aperta ora.',
      'torneo.planeta': 'Coppa Pianeta del Pallone', 'torneo.libertadores': 'Coppa dei Liberatori del Sud', 'torneo.estelar': 'Lega Stellare dei Club', 'torneo.aro': 'Mondiale di Canestro e Tabellone',
      'torneo.continentes': 'Giochi dei Cinque Continenti', 'torneo.formula': 'Gran Premio Formula Veloce', 'torneo.pelea': "L'Incontro del Secolo", 'torneo.tazon': 'La Grande Coppa Ovale',
    },
    ru: {
      'titulo': 'Кубок серверов', 'cargando': 'Открываем кубок…', 'reintentar': 'Попробовать снова', 'error': 'Не удалось открыть кубок.', 'codigo': 'Код: {c}',
      'sin_internet': 'Нет связи. Проверь интернет и попробуй снова.', 'sin_sesion_t': 'Войди в аккаунт',
      'sin_sesion': 'Кубок серверов играется онлайн: твой сервер против других серверов вселенной. Войди или создай аккаунт, чтобы набирать очки.',
      'sin_copa_t': 'На этой неделе кубка ещё нет', 'sin_copa': 'Следующий кубок стартует в понедельник в 00:00. А пока подготовь лучшую команду и технику.',
      'fase.preparacion': 'Подготовка', 'fase.batalla': 'Битва', 'fase.cerrada': 'Финал', 'en_vivo': 'В ЭФИРЕ',
      'cuenta.preparacion': 'Битва начнётся через', 'cuenta.batalla': 'Битва закончится через', 'cuenta.cerrada': 'Новый кубок через', 'cuenta.cruce': 'Следующий матч через',
      'marcador': 'Табло', 'tu_servidor': 'ТВОЙ СЕРВЕР', 'rival': 'СОПЕРНИК', 'pos': 'М', 'servidor': 'Сервер', 'pts': 'Очк', 'gep': 'В-Н-П', 'prep': 'Подг.',
      'va': 'Твой сервер на {n}-м месте', 'lider': 'Твой сервер на первом месте!',
      'preparacion_t': 'Подготовка серверов', 'preparacion_det': 'Каждое подтверждённое событие даёт очки подготовки. Бонус — до +15 в каждом матче.', 'bono': 'бонус +{n}',
      'tu_aporte': 'Твой вклад', 'puntos': '{n} очк', 'puesto_srv': 'Ты {n}-й на своём сервере', 'sin_puesto': 'Ты пока не набрал очков для своего сервера.',
      'equipo_ok': 'Команда кубка зарегистрирована', 'equipo_no': 'Ты ещё не зарегистрировал команду кубка',
      'equipo_det': 'Берёт твой лучший персонал и технику. 5 лучших команд сервера составят состав на субботу.',
      'registrar': 'Зарегистрировать команду', 'actualizar': 'Обновить команду кубка', 'registrado': 'Готово! Команда кубка зарегистрирована ({p} чел., {e} ед. техники).',
      'sin_partida': 'Нет загруженной игры, чтобы выбрать команду.', 'sumar': 'Набрать очки', 'seguir': 'Продолжить событие',
      'sumar_det': 'Сыграй событие с сидом сервера: твой результат идёт в зачёт сервера.', 'solo_prep': 'Очки набираются с понедельника по пятницу, во время подготовки.',
      'preparando': 'Готовим твоё событие…', 'validando': 'Сервер проверяет твою трансляцию…', 'resultado': 'Качество {calidad} · +{puntos} очк твоему серверу',
      'invalido': 'Это событие не прошло проверку. Очков нет.', 'pausado': 'Твоё событие ещё открыто. Можешь закончить его в ближайшие минуты.',
      'sin_juego': 'Обнови игру, чтобы играть события кубка.', 'reanudado': 'Продолжаем твоё открытое событие.',
      'cruces': 'Матчи субботы', 'cruces_det': 'В каждом матче 5 игр с одним контрактом: побеждает более высокое качество.',
      'ronda': 'Матч {n}', 'pendiente': 'Впереди', 'jugado': 'Завершён', 'empate': 'Ничья', 'gana': 'Побеждает {n}', 'por_jugar': 'Суббота {h}',
      'sin_cruces': 'Матчи формируются в субботу из зарегистрированных составов.', 'top': 'Лучшие участники', 'top_vacio': 'Пока никто не набрал очков. Будь первым!',
      'historial': 'Чемпионы прошлых недель', 'historial_vacio': 'Это первый кубок вселенной.', 'premios': 'Награды', 'premio.campeon': 'Сервер-чемпион',
      'premio.campeon_det': 'Всем, кто внёс вклад: игровые деньги, слава, кубковый трофей и материалы для базы.', 'premio.top10': 'Топ-10 чемпиона',
      'premio.top10_det': 'Дополнительная награда 10 самым активным.', 'premio.resto': 'Остальные серверы', 'premio.resto_det': 'Награда за участие по твоему вкладу.',
      'premio.nota': 'Никаких реальных денег: всё внутри игры.', 'fama': '+{n} славы', 'trofeo': 'Трофей: {n}', 'reparar': 'Мастерская (всё на 100%)',
      'como': 'Как это работает?', 'como_texto': 'С понедельника по пятницу ты набираешь очки подготовки, играя события. В субботу 5 лучших команд каждого сервера сходятся в матчах в прямом эфире. Победа в матче — 3 очка, ничья — 1.',
      'ver': 'Открыть кубок', 'inicio_prep': 'Твой сервер {n}-й в подготовке', 'inicio_bat': 'Твой сервер {n}-й в таблице',
      'campeon': '{n} — чемпион!', 'tu_campeon': 'Твой сервер — чемпион!', 'tu': 'Ты',
      'err.sin_sesion': 'Сессия закончилась. Войди снова.', 'err.fase': 'Сейчас, на этом этапе кубка, так нельзя.', 'err.sin_equipo': 'Сначала зарегистрируй команду кубка.',
      'err.equipo_invalido': 'Твоя команда не прошла проверку сервера.', 'err.limite': 'Слишком быстро. Подожди немного.', 'err.vencido': 'Время события вышло. Начни новое.',
      'err.sin_copa': 'Сейчас нет открытого кубка.',
      'torneo.planeta': 'Кубок Планеты Мяча', 'torneo.libertadores': 'Кубок Освободителей Юга', 'torneo.estelar': 'Звёздная лига клубов', 'torneo.aro': 'Чемпионат мира по кольцу и щиту',
      'torneo.continentes': 'Игры пяти континентов', 'torneo.formula': 'Гран-при Формула Скорость', 'torneo.pelea': 'Бой века', 'torneo.tazon': 'Большая Чаша',
    },
    tr: {
      'titulo': 'Sunucular Kupası', 'cargando': 'Kupa açılıyor…', 'reintentar': 'Tekrar dene', 'error': 'Kupa açılamadı.', 'codigo': 'Kod: {c}',
      'sin_internet': 'Bağlantı yok. İnternetini kontrol edip tekrar dene.', 'sin_sesion_t': 'Hesabına giriş yap',
      'sin_sesion': 'Sunucular Kupası çevrim içi oynanır: senin sunucun evrendeki diğer sunuculara karşı. Puan toplamak için giriş yap ya da hesap aç.',
      'sin_copa_t': 'Bu hafta henüz kupa yok', 'sin_copa': 'Sıradaki kupa pazartesi 00:00’da başlıyor. O zamana kadar en iyi ekibini ve ekipmanını hazırla.',
      'fase.preparacion': 'Hazırlık', 'fase.batalla': 'Savaş', 'fase.cerrada': 'Final', 'en_vivo': 'CANLI',
      'cuenta.preparacion': 'Savaşın başlamasına', 'cuenta.batalla': 'Savaşın bitmesine', 'cuenta.cerrada': 'Yeni kupaya', 'cuenta.cruce': 'Sıradaki eşleşmeye',
      'marcador': 'Skor tabelası', 'tu_servidor': 'SENİN SUNUCUN', 'rival': 'RAKİP', 'pos': 'Sıra', 'servidor': 'Sunucu', 'pts': 'P', 'gep': 'G-B-M', 'prep': 'Haz.',
      'va': 'Sunucun {n}. sırada', 'lider': 'Sunucun birinci sırada!',
      'preparacion_t': 'Sunuculara göre hazırlık', 'preparacion_det': 'Onaylanan her etkinlik hazırlık puanı kazandırır. Bonus her eşleşmede +15’e kadar çıkar.', 'bono': 'bonus +{n}',
      'tu_aporte': 'Katkın', 'puntos': '{n} P', 'puesto_srv': 'Sunucunda {n}. sıradasın', 'sin_puesto': 'Sunucun için henüz puan toplamadın.',
      'equipo_ok': 'Kupa ekibi kayıtlı', 'equipo_no': 'Kupa ekibini henüz kaydetmedin',
      'equipo_det': 'En iyi personelini ve ekipmanını alır. Sunucunun en iyi 5 ekibi cumartesi kadrosunu oluşturur.',
      'registrar': 'Kupa ekibini kaydet', 'actualizar': 'Kupa ekibini güncelle', 'registrado': 'Tamam! Kupa ekibin kaydedildi ({p} kişi, {e} ekipman).',
      'sin_partida': 'Ekibini seçmek için yüklü oyun yok.', 'sumar': 'Puan topla', 'seguir': 'Etkinliğime devam et',
      'sumar_det': 'Sunucunun tohumuyla bir etkinlik oyna: ne alırsan sunucuna sayılır.', 'solo_prep': 'Puanlar pazartesiden cumaya, hazırlık sırasında toplanır.',
      'preparando': 'Etkinliğin hazırlanıyor…', 'validando': 'Sunucu yayınını inceliyor…', 'resultado': 'Kalite {calidad} · sunucuna +{puntos} P',
      'invalido': 'Bu etkinlik onaylanamadı. Puan yok.', 'pausado': 'Etkinliğin hâlâ açık. Önümüzdeki dakikalarda bitirebilirsin.',
      'sin_juego': 'Kupa etkinliklerini oynamak için oyunu güncelle.', 'reanudado': 'Açık etkinliğine devam ediyoruz.',
      'cruces': 'Cumartesi eşleşmeleri', 'cruces_det': 'Her eşleşme aynı sözleşmeyle 5 maçtır: yüksek kalite kazanır.',
      'ronda': 'Eşleşme {n}', 'pendiente': 'Oynanacak', 'jugado': 'Bitti', 'empate': 'Beraberlik', 'gana': '{n} kazanır', 'por_jugar': 'Cumartesi {h}',
      'sin_cruces': 'Eşleşmeler cumartesi kayıtlı kadrolarla kurulur.', 'top': 'En çok katkı verenler', 'top_vacio': 'Henüz kimse puan toplamadı. İlk sen ol!',
      'historial': 'Geçmiş haftaların şampiyonları', 'historial_vacio': 'Bu, evrenin ilk kupası.', 'premios': 'Ödüller', 'premio.campeon': 'Şampiyon sunucu',
      'premio.campeon_det': 'Katkı veren herkese: oyun parası, şöhret, kupa ödülü ve merkez malzemeleri.', 'premio.top10': 'Şampiyonun ilk 10’u',
      'premio.top10_det': 'En çok katkı veren 10 kişiye ekstra ödül.', 'premio.resto': 'Diğer sunucular', 'premio.resto_det': 'Katkına göre katılım ödülü.',
      'premio.nota': 'Gerçek para yok: her şey oyun içi.', 'fama': '+{n} şöhret', 'trofeo': 'Kupa: {n}', 'reparar': 'Atölye (her şey %100)',
      'como': 'Nasıl çalışır?', 'como_texto': 'Pazartesiden cumaya etkinlik oynayarak hazırlık puanı toplarsın. Cumartesi her sunucunun en iyi 5 ekibi canlı yayınlanan eşleşmelerde karşılaşır. Eşleşme kazanmak 3 puan, beraberlik 1 puan.',
      'ver': 'Kupayı gör', 'inicio_prep': 'Sunucun hazırlıkta {n}. sırada', 'inicio_bat': 'Sunucun tabloda {n}. sırada',
      'campeon': '{n} şampiyon!', 'tu_campeon': 'Sunucun şampiyon!', 'tu': 'Sen',
      'err.sin_sesion': 'Oturumun kapandı. Tekrar giriş yap.', 'err.fase': 'Kupanın bu aşamasında bu yapılamaz.', 'err.sin_equipo': 'Önce kupa ekibini kaydet.',
      'err.equipo_invalido': 'Ekibin sunucu kontrolünden geçmedi.', 'err.limite': 'Çok hızlısın. Biraz bekle.', 'err.vencido': 'Etkinliğin süresi doldu. Yenisini başlat.',
      'err.sin_copa': 'Şu anda açık kupa yok.',
      'torneo.planeta': 'Gezegen Top Kupası', 'torneo.libertadores': 'Güneyin Kurtarıcıları Kupası', 'torneo.estelar': 'Yıldız Kulüpler Ligi', 'torneo.aro': 'Çember ve Pano Dünya Kupası',
      'torneo.continentes': 'Beş Kıta Oyunları', 'torneo.formula': 'Hızlı Formül Grand Prix', 'torneo.pelea': 'Asrın Dövüşü', 'torneo.tazon': 'Büyük Kase',
    },
    id: {
      'titulo': 'Piala Server', 'cargando': 'Membuka piala…', 'reintentar': 'Coba lagi', 'error': 'Piala tidak bisa dibuka.', 'codigo': 'Kode: {c}',
      'sin_internet': 'Tidak ada koneksi. Cek internetmu lalu coba lagi.', 'sin_sesion_t': 'Masuk ke akunmu',
      'sin_sesion': 'Piala Server dimainkan online: server-mu melawan server lain di semesta ini. Masuk atau buat akun untuk mengumpulkan poin.',
      'sin_copa_t': 'Belum ada piala minggu ini', 'sin_copa': 'Piala berikutnya mulai Senin pukul 00:00. Sementara itu, siapkan kru dan peralatan terbaikmu.',
      'fase.preparacion': 'Persiapan', 'fase.batalla': 'Pertarungan', 'fase.cerrada': 'Final', 'en_vivo': 'LANGSUNG',
      'cuenta.preparacion': 'Pertarungan mulai dalam', 'cuenta.batalla': 'Pertarungan berakhir dalam', 'cuenta.cerrada': 'Piala baru dalam', 'cuenta.cruce': 'Laga berikutnya dalam',
      'marcador': 'Papan skor', 'tu_servidor': 'SERVER-MU', 'rival': 'LAWAN', 'pos': 'Pos', 'servidor': 'Server', 'pts': 'Poin', 'gep': 'M-S-K', 'prep': 'Pers.',
      'va': 'Server-mu di posisi {n}', 'lider': 'Server-mu di posisi pertama!',
      'preparacion_t': 'Persiapan tiap server', 'preparacion_det': 'Setiap acara yang tervalidasi menambah poin persiapan. Bonusnya sampai +15 di tiap laga.', 'bono': 'bonus +{n}',
      'tu_aporte': 'Kontribusimu', 'puntos': '{n} poin', 'puesto_srv': 'Kamu di posisi {n} di server-mu', 'sin_puesto': 'Kamu belum menyumbang poin untuk server-mu.',
      'equipo_ok': 'Tim piala terdaftar', 'equipo_no': 'Kamu belum mendaftarkan tim piala',
      'equipo_det': 'Membawa kru dan peralatan terbaikmu. 5 tim terbaik server menjadi skuad hari Sabtu.',
      'registrar': 'Daftarkan tim piala', 'actualizar': 'Perbarui tim piala', 'registrado': 'Beres! Tim piala-mu sudah terdaftar ({p} orang, {e} peralatan).',
      'sin_partida': 'Tidak ada permainan yang dimuat untuk memilih tim.', 'sumar': 'Kumpulkan poin', 'seguir': 'Lanjutkan acaraku',
      'sumar_det': 'Mainkan acara dengan seed dari server: hasilmu dihitung untuk server-mu.', 'solo_prep': 'Poin dikumpulkan Senin sampai Jumat, selama persiapan.',
      'preparando': 'Menyiapkan acaramu…', 'validando': 'Server sedang memeriksa siaranmu…', 'resultado': 'Kualitas {calidad} · +{puntos} poin untuk server-mu',
      'invalido': 'Acara itu tidak bisa divalidasi. Tidak ada poin.', 'pausado': 'Acaramu masih terbuka. Kamu bisa menyelesaikannya dalam beberapa menit.',
      'sin_juego': 'Perbarui game untuk memainkan acara piala.', 'reanudado': 'Melanjutkan acaramu yang terbuka.',
      'cruces': 'Laga hari Sabtu', 'cruces_det': 'Tiap laga berisi 5 pertandingan dengan kontrak yang sama: kualitas tertinggi menang.',
      'ronda': 'Laga {n}', 'pendiente': 'Akan dimainkan', 'jugado': 'Selesai', 'empate': 'Seri', 'gana': '{n} menang', 'por_jugar': 'Sabtu {h}',
      'sin_cruces': 'Laga disusun hari Sabtu dengan skuad yang terdaftar.', 'top': 'Penyumbang teratas', 'top_vacio': 'Belum ada yang menyumbang poin. Jadilah yang pertama!',
      'historial': 'Juara minggu-minggu lalu', 'historial_vacio': 'Ini piala pertama di semesta ini.', 'premios': 'Hadiah', 'premio.campeon': 'Server juara',
      'premio.campeon_det': 'Semua yang menyumbang: uang game, ketenaran, trofi piala, dan bahan markas.', 'premio.top10': '10 besar juara',
      'premio.top10_det': 'Hadiah tambahan untuk 10 penyumbang terbesar.', 'premio.resto': 'Server lainnya', 'premio.resto_det': 'Hadiah partisipasi sesuai kontribusimu.',
      'premio.nota': 'Tanpa uang sungguhan: semuanya di dalam game.', 'fama': '+{n} ketenaran', 'trofeo': 'Trofi: {n}', 'reparar': 'Bengkel (semua 100%)',
      'como': 'Bagaimana cara kerjanya?', 'como_texto': 'Senin sampai Jumat kamu mengumpulkan poin persiapan dengan memainkan acara. Hari Sabtu 5 tim terbaik tiap server berhadapan dalam laga yang disiarkan langsung. Menang laga dapat 3 poin; seri, 1.',
      'ver': 'Lihat piala', 'inicio_prep': 'Server-mu di posisi {n} dalam persiapan', 'inicio_bat': 'Server-mu di posisi {n} di klasemen',
      'campeon': '{n} juara!', 'tu_campeon': 'Server-mu juara!', 'tu': 'Kamu',
      'err.sin_sesion': 'Sesimu berakhir. Masuk lagi.', 'err.fase': 'Itu tidak bisa dilakukan di fase piala ini.', 'err.sin_equipo': 'Daftarkan dulu tim piala-mu.',
      'err.equipo_invalido': 'Timmu tidak lolos pemeriksaan server.', 'err.limite': 'Kamu terlalu cepat. Tunggu sebentar.', 'err.vencido': 'Acara sudah kedaluwarsa. Mulai yang baru.',
      'err.sin_copa': 'Sedang tidak ada piala yang terbuka.',
      'torneo.planeta': 'Piala Planet Bola', 'torneo.libertadores': 'Piala Pembebas Selatan', 'torneo.estelar': 'Liga Bintang Klub', 'torneo.aro': 'Piala Dunia Ring dan Papan',
      'torneo.continentes': 'Pesta Lima Benua', 'torneo.formula': 'Grand Prix Formula Kilat', 'torneo.pelea': 'Duel Abad Ini', 'torneo.tazon': 'Mangkuk Raksasa',
    },
    'zh-CN': {
      'titulo': '服务器杯', 'cargando': '正在打开杯赛…', 'reintentar': '再试一次', 'error': '无法打开杯赛。', 'codigo': '代码：{c}',
      'sin_internet': '没有网络。检查一下网络再试。', 'sin_sesion_t': '登录你的账号',
      'sin_sesion': '服务器杯在线进行：你的服务器对战本宇宙的其他服务器。登录或注册账号就能为服务器拿分。',
      'sin_copa_t': '本周还没有杯赛', 'sin_copa': '下一届杯赛周一 00:00 开始。在那之前，准备好你最强的团队和设备。',
      'fase.preparacion': '备战', 'fase.batalla': '决战', 'fase.cerrada': '终局', 'en_vivo': '直播中',
      'cuenta.preparacion': '决战倒计时', 'cuenta.batalla': '决战结束倒计时', 'cuenta.cerrada': '新杯赛倒计时', 'cuenta.cruce': '下一场对决倒计时',
      'marcador': '记分牌', 'tu_servidor': '你的服务器', 'rival': '对手', 'pos': '名次', 'servidor': '服务器', 'pts': '积分', 'gep': '胜-平-负', 'prep': '备战',
      'va': '你的服务器排第 {n}', 'lider': '你的服务器排第一！',
      'preparacion_t': '各服务器备战进度', 'preparacion_det': '每个通过验证的活动都会增加备战分。每场对决的加成最高 +15。', 'bono': '加成 +{n}',
      'tu_aporte': '你的贡献', 'puntos': '{n} 分', 'puesto_srv': '你在本服务器排第 {n}', 'sin_puesto': '你还没为服务器拿到分。',
      'equipo_ok': '杯赛阵容已登记', 'equipo_no': '你还没登记杯赛阵容',
      'equipo_det': '带上你最强的人员和设备。服务器前 5 强阵容组成周六的出战名单。',
      'registrar': '登记杯赛阵容', 'actualizar': '更新杯赛阵容', 'registrado': '搞定！你的杯赛阵容已登记（{p} 人，{e} 件设备）。',
      'sin_partida': '没有载入存档，无法选择阵容。', 'sumar': '去拿分', 'seguir': '继续我的活动',
      'sumar_det': '用服务器给的种子打一场活动：你的成绩计入你的服务器。', 'solo_prep': '周一到周五的备战期才能拿分。',
      'preparando': '正在准备你的活动…', 'validando': '服务器正在审核你的转播…', 'resultado': '质量 {calidad} · 为你的服务器 +{puntos} 分',
      'invalido': '这场活动没能通过验证，不计分。', 'pausado': '你的活动还开着，几分钟内可以继续完成。',
      'sin_juego': '请更新游戏后再玩杯赛活动。', 'reanudado': '继续你未完成的活动。',
      'cruces': '周六对决', 'cruces_det': '每场对决 5 局，合约相同：质量高者胜。',
      'ronda': '对决 {n}', 'pendiente': '待开赛', 'jugado': '已结束', 'empate': '平局', 'gana': '{n} 获胜', 'por_jugar': '周六 {h}',
      'sin_cruces': '对决将在周六根据已登记的阵容排定。', 'top': '贡献榜', 'top_vacio': '还没人拿分，快来当第一个！',
      'historial': '往届冠军', 'historial_vacio': '这是本宇宙的第一届杯赛。', 'premios': '奖励', 'premio.campeon': '冠军服务器',
      'premio.campeon_det': '所有贡献者：游戏币、名气、杯赛奖杯和基地材料。', 'premio.top10': '冠军前 10 名',
      'premio.top10_det': '贡献最多的 10 人额外奖励。', 'premio.resto': '其他服务器', 'premio.resto_det': '按你的贡献发放参与奖。',
      'premio.nota': '不涉及真钱：全部是游戏内奖励。', 'fama': '+{n} 名气', 'trofeo': '奖杯：{n}', 'reparar': '维修站（全部恢复 100%）',
      'como': '怎么玩？', 'como_texto': '周一到周五打活动攒备战分。周六每个服务器的前 5 强阵容在直播对决中交锋。赢一场对决得 3 分，平局得 1 分。',
      'ver': '查看杯赛', 'inicio_prep': '你的服务器备战排第 {n}', 'inicio_bat': '你的服务器积分榜排第 {n}',
      'campeon': '{n} 夺冠！', 'tu_campeon': '你的服务器夺冠了！', 'tu': '你',
      'err.sin_sesion': '登录已过期，请重新登录。', 'err.fase': '杯赛当前阶段不能这样做。', 'err.sin_equipo': '请先登记杯赛阵容。',
      'err.equipo_invalido': '你的阵容没通过服务器审核。', 'err.limite': '操作太快了，稍等一下。', 'err.vencido': '活动已过期，再开一场吧。',
      'err.sin_copa': '现在没有进行中的杯赛。',
      'torneo.planeta': '星球足球杯', 'torneo.libertadores': '南方解放者杯', 'torneo.estelar': '星辰俱乐部联赛', 'torneo.aro': '篮框与篮板世界杯',
      'torneo.continentes': '五大洲运动会', 'torneo.formula': '极速方程式大奖赛', 'torneo.pelea': '世纪之战', 'torneo.tazon': '超级大碗',
    },
  };

  /* Torneos parodia (COPAS.md §2): clave → color e ícono del deporte */
  const TORNEOS = [
    { k: 'planeta', re: /planeta|balomp/i, color: '#2ecc71', icono: 'ligapro' },
    { k: 'libertadores', re: /libertador/i, color: '#ffb020', icono: 'final' },
    { k: 'estelar', re: /estelar/i, color: '#4da3ff', icono: 'star' },
    { k: 'aro', re: /aro|tablero/i, color: '#ff8a3b', icono: 'target' },
    { k: 'continentes', re: /continente/i, color: '#b07bff', icono: 'globe' },
    { k: 'formula', re: /f[oó]rmula|veloz/i, color: '#ff3b3b', icono: 'lanzamiento_autos' },
    { k: 'pelea', re: /pelea|siglo/i, color: '#e74c3c', icono: 'boxeo' },
    { k: 'tazon', re: /taz[oó]n/i, color: '#c58b5a', icono: 'shield' },
  ];
  const COLORES = ['#ff3b3b', '#4da3ff', '#2ecc71', '#ffb020', '#b07bff', '#ff7ac6', '#3be0d0', '#c58b5a'];

  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { return 'es'; } };
  const locale = () => { try { return (root.I18N && root.I18N.locale) || (idioma() === 'es' ? 'es-EC' : idioma()); } catch (e) { return 'es-EC'; } };
  function T(k, p) {
    const d = TRAD[idioma()] || {};
    const s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : Object.prototype.hasOwnProperty.call(ES, k) ? ES[k] : k;
    return String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  }
  const esc = (t) => String(t === undefined || t === null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => { try { return Number(n || 0).toLocaleString(locale()); } catch (e) { return String(Number(n || 0)); } };
  const dec1 = (n) => { const v = Math.round(Number(n || 0) * 10) / 10; try { return v.toLocaleString(locale(), { maximumFractionDigits: 1 }); } catch (e) { return String(v); } };
  const ordinal = (n) => (idioma() === 'en' ? (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th') : String(n));

  const st = { el: null, ctx: null, datos: null, error: '', codigo: '', cargando: false, ocupado: false, trabajo: '', ultimo: null, timer: null, desfase: 0, cargadoEn: 0, intentoInicio: 0 };

  /* ---------- estilos ---------- */
  function css() {
    if (typeof document === 'undefined' || document.getElementById('copas-css')) return;
    const s = document.createElement('style');
    s.id = 'copas-css';
    s.textContent = `
      .cp{display:flex;flex-direction:column;gap:12px;min-width:0}
      .cp .card{margin:0;min-width:0}
      .cp-mono{font-family:"JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
      .cp-head{position:relative;overflow:hidden;padding:0;border-color:#2c3550;background:#070a12}
      .cp-head>svg{position:absolute;inset:0;width:100%;height:100%;display:block}
      .cp-head .in{position:relative;padding:14px 14px 12px}
      .cp-kicker{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#c9d3e6}
      .cp-kicker .ico{width:15px;height:15px;flex:none}
      .cp-kicker span{flex:1;min-width:0}
      .cp-head h2{margin:6px 0 0;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:27px;line-height:1.02;text-transform:uppercase;letter-spacing:.5px;color:#fff;text-shadow:0 2px 12px #000;overflow-wrap:anywhere}
      .cp-fase{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:4px;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:800;font-size:13px;letter-spacing:1px;text-transform:uppercase;background:#ffffff14;border:1px solid #ffffff33;color:#fff}
      .cp-fase.batalla{background:#ff3b3b;border-color:#ff3b3b}
      .cp-fase.cerrada{background:#ffb020;border-color:#ffb020;color:#1a1205}
      .cp-dot{width:8px;height:8px;border-radius:50%;background:#fff;animation:cpPulso 1.1s infinite}
      @keyframes cpPulso{0%,100%{opacity:1}50%{opacity:.25}}
      @media (prefers-reduced-motion:reduce){.cp-dot,.cp-live i{animation:none}}
      .cp-reloj{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap}
      .cp-reloj span{font-size:11px;color:#aab4c8;text-transform:uppercase;letter-spacing:.6px;display:block}
      .cp-reloj b{display:inline-block;margin-top:3px;font-size:24px;letter-spacing:1px;color:#ffd36b;background:#000a;border:1px solid #ffffff22;border-radius:6px;padding:2px 8px;text-shadow:0 0 10px #ffb02088}
      .cp-va{font-size:12px;font-weight:700;color:#fff;background:#ff3b3b22;border:1px solid #ff3b3b77;border-radius:999px;padding:4px 10px;white-space:nowrap}
      .cp-board{padding:0;overflow:hidden;background:#0a0d14;border-color:#2c3550}
      .cp-board-top{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:linear-gradient(90deg,#1a2133,#0f1420);border-bottom:2px solid #ffb020;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;color:#c9d3e6}
      .cp-vs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px;padding:12px 10px 10px}
      .cp-lado{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;min-width:0}
      .cp-lado small{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:12px;letter-spacing:1.2px;color:#aab4c8;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cp-lado.yo small{color:#ff6b6b;font-weight:800}
      .cp-lado b{font-size:14px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cp-led{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:34px;font-weight:700;line-height:1;color:#ffd36b;background:#000;border:1px solid #2a3242;border-radius:6px;padding:4px 10px;min-width:64px;text-align:center;text-shadow:0 0 12px #ffb020aa;font-variant-numeric:tabular-nums}
      .cp-led.yo{color:#ff6b6b;text-shadow:0 0 12px #ff3b3baa}
      .cp-vsx{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:800;font-size:20px;color:#5b6476;letter-spacing:1px}
      .cp-tabla{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
      .cp-tabla th{font-weight:600;font-size:11px;color:#8b95a8;text-transform:uppercase;letter-spacing:.5px;padding:6px 4px;border-bottom:1px solid #222a3a;text-align:center}
      .cp-tabla th.nom{text-align:start}
      .cp-tabla td{padding:9px 4px;border-bottom:1px solid #1a2130;text-align:center;vertical-align:middle}
      .cp-tabla tr:last-child td{border-bottom:0}
      .cp-tabla .p{width:34px;font-weight:800;font-family:"JetBrains Mono",ui-monospace,monospace;color:#8b95a8}
      .cp-tabla tr.l1 .p{color:#ffd36b}
      .cp-tabla .nom{text-align:start;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cp-tabla .nom span{vertical-align:middle}
      .cp-tabla .nom svg{vertical-align:middle;margin-inline-end:6px}
      .cp-tabla .gep{width:62px;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;color:#aab4c8}
      .cp-tabla .pr{width:52px;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;color:#aab4c8}
      .cp-tabla .pt{width:44px;font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:800;font-size:16px;color:#ffd36b}
      .cp-tabla tr.yo td{background:#ff3b3b14}
      .cp-tabla tr.yo td:first-child{box-shadow:inset 3px 0 0 #ff3b3b}
      .cp-tag{display:inline-block;margin-inline-start:6px;font-size:9.5px;font-weight:800;letter-spacing:.6px;padding:1px 5px;border-radius:3px;background:#ff3b3b;color:#fff;vertical-align:middle}
      .cp-prep{display:flex;flex-direction:column;gap:10px;margin-top:10px}
      .cp-prep .fila{min-width:0}
      .cp-prep .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;min-width:0}
      .cp-prep .top .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .cp-prep .top .v{flex:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;color:var(--muted)}
      .cp-prep .top .v b{color:var(--text)}
      .cp-prep .barra{height:12px;border-radius:3px;background:#0d0f14;border:1px solid var(--line);overflow:hidden;margin-top:4px;position:relative}
      .cp-prep .barra i{display:block;height:100%;border-radius:2px;background-image:repeating-linear-gradient(90deg,transparent 0 9px,#0006 9px 11px)}
      .cp-prep .fila.yo .top .n{color:#ff6b6b;font-weight:700}
      .cp-yo{border-color:#ff3b3b66;background:linear-gradient(160deg,#2a1a1f,var(--panel) 65%)}
      .cp-yo-num{display:flex;gap:10px;margin-top:8px}
      .cp-yo-num div{flex:1;min-width:0;background:#0d0f14aa;border:1px solid var(--line);border-radius:10px;padding:8px 10px}
      .cp-yo-num b{display:block;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:30px;line-height:1;font-weight:800}
      .cp-yo-num small{font-size:11px;color:var(--muted);display:block;margin-top:2px}
      .cp-eq{display:flex;align-items:flex-start;gap:8px;margin-top:10px;font-size:13px}
      .cp-eq .ico{width:18px;height:18px;flex:none;margin-top:1px}
      .cp-eq.ok{color:var(--green)}
      .cp-eq.no{color:var(--amber)}
      .cp-acc{display:flex;flex-direction:column;gap:0;margin-top:4px}
      .cp-acc .btn{display:flex;align-items:center;justify-content:center;gap:6px}
      .cp-acc .btn .ico{width:18px;height:18px}
      .cp-cruce{padding:0;overflow:hidden;background:#0a0d14;border-color:#2c3550}
      .cp-cruce.vivo{border-color:#ff3b3b88;box-shadow:0 0 0 1px #ff3b3b33}
      .cp-cruce-top{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;background:#121828;font-size:12px;color:#aab4c8;border-bottom:1px solid #222a3a}
      .cp-cruce-top b{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#fff}
      .cp-live{display:inline-flex;align-items:center;gap:5px;font-weight:800;color:#fff;background:#ff3b3b;padding:2px 7px;border-radius:3px;font-size:11px;letter-spacing:.8px}
      .cp-live i{width:7px;height:7px;border-radius:50%;background:#fff;animation:cpPulso 1.1s infinite}
      .cp-bug{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px;padding:10px}
      .cp-bug .eq{display:flex;align-items:center;gap:6px;min-width:0;font-weight:700;font-size:13px}
      .cp-bug .eq span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .cp-bug .eq.b{flex-direction:row-reverse;text-align:end}
      .cp-bug .eq.yo span{color:#ff6b6b}
      .cp-bug .sc{display:flex;align-items:center;gap:4px}
      .cp-bug .sc b{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:22px;line-height:1;color:#ffd36b;background:#000;border:1px solid #2a3242;border-radius:5px;padding:4px 7px;min-width:38px;text-align:center}
      .cp-bug .sc i{color:#5b6476;font-style:normal;font-weight:800}
      .cp-partidos{display:flex;flex-direction:column;gap:6px;padding:2px 10px 10px}
      .cp-pt{display:grid;grid-template-columns:20px 22px 30px minmax(0,1fr) 30px;align-items:center;gap:6px;font-size:12px}
      .cp-pt .n{font-family:"JetBrains Mono",ui-monospace,monospace;color:#5b6476;font-weight:700;text-align:center}
      .cp-pt .t{color:#8b95a8;display:grid;place-items:center}
      .cp-pt .t .ico{width:17px;height:17px}
      .cp-pt .q{font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:700;text-align:center;color:#8b95a8;border-radius:4px;padding:2px 0}
      .cp-pt .q.win{color:#0a0d14;background:#ffd36b}
      .cp-pt .q.win.yo{background:#ff6b6b}
      .cp-pt .duo{display:flex;height:9px;gap:2px;min-width:0}
      .cp-pt .duo span{flex:1;background:#151b28;border-radius:2px;overflow:hidden;display:flex}
      .cp-pt .duo span:first-child{justify-content:flex-end}
      .cp-pt .duo i{display:block;height:100%;border-radius:2px}
      .cp-pt.espera .duo span{background:repeating-linear-gradient(90deg,#151b28 0 6px,#0e131d 6px 12px)}
      .cp-gana{padding:0 10px 10px;font-size:12px;color:#aab4c8;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
      .cp-gana b{color:#ffd36b}
      .cp-rank{display:flex;flex-direction:column;gap:6px;margin-top:8px}
      .cp-rank div{display:flex;align-items:center;gap:8px;font-size:14px;min-width:0}
      .cp-rank .p{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--panel2);font-size:12px;font-weight:700;flex:none}
      .cp-rank .p1{background:#ffb020;color:#1a1205}.cp-rank .p2{background:#c5ccd6;color:#111}.cp-rank .p3{background:#b0703a;color:#fff}
      .cp-rank .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cp-rank .s{flex:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10.5px;font-weight:700;padding:1px 5px;border-radius:4px;background:var(--panel2);border:1px solid var(--line);color:var(--muted)}
      .cp-rank .v{flex:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;color:var(--muted)}
      .cp-rank .yo .n{color:var(--amber);font-weight:700}
      .cp-hist{display:flex;flex-direction:column;gap:8px;margin-top:8px}
      .cp-hist div{display:flex;align-items:center;gap:10px;font-size:13px;min-width:0}
      .cp-hist .g{flex:1;min-width:0}
      .cp-hist .g b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cp-hist .g small{color:var(--muted);font-size:11.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cp-hist .w{flex:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;color:var(--muted)}
      .cp-prem{display:flex;flex-direction:column;gap:8px;margin-top:8px}
      .cp-prem div{display:flex;gap:10px;align-items:flex-start;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:9px 10px;min-width:0}
      .cp-prem div.c{border-color:#ffb02077;background:linear-gradient(160deg,#ffb02018,var(--panel2) 60%)}
      .cp-prem .tx{min-width:0;font-size:13px}
      .cp-prem .tx small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
      .cp-res{border-color:var(--green)}.cp-res.mal{border-color:var(--red)}
      .cp-campeon{display:flex;align-items:center;gap:12px;border-color:#ffb02099;background:linear-gradient(160deg,#3a2a0d,var(--panel) 70%)}
      .cp-campeon b{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:22px;line-height:1.1;text-transform:uppercase}
      .cp .neg{color:var(--red)}
      .cp-ini{position:relative;overflow:hidden;border-color:#2c3550;background:linear-gradient(120deg,#0b1222,#161a22 70%)}
      .cp-ini .row1{display:flex;align-items:center;gap:10px;min-width:0}
      .cp-ini .row1 .g{flex:1;min-width:0}
      .cp-ini .row1 b{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:19px;text-transform:uppercase;line-height:1.05;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
      .cp-ini .row1 small{display:block;color:var(--muted);font-size:12px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cp-ini .cta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap}
      .cp-ini .cta b{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:17px;color:#ffd36b}
      .cp-ini .btn.sm{margin:0}
    `;
    document.head.appendChild(s);
  }

  /* ---------- servidor ---------- */
  function apiCtx() { return (st.ctx && st.ctx.Api) || root.Api || null; }
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

  function aviso(t) { try { if (st.ctx && st.ctx.toast) st.ctx.toast(t); } catch (e) { /* nada */ } }
  function sonido(n) { try { if (st.ctx && st.ctx.snd) { if (typeof st.ctx.snd === 'function') st.ctx.snd(n); else if (st.ctx.snd.play) st.ctx.snd.play(n); } } catch (e) { /* nada */ } }
  function icon(n, cls, size) { const A = (st.ctx && st.ctx.A) || root.Art; try { return A.icon(n, cls === undefined ? 'sm' : cls, size); } catch (e) { return ''; } }

  function sinSesion() {
    const A = apiCtx();
    try { return !!(A && typeof A.logueado === 'function' && A.disponible !== false && !A.logueado()); } catch (e) { return false; }
  }

  async function cargar(silencio) {
    if (st.cargando) return;
    st.cargando = true;
    try {
      usar(await pedir('GET', '/api/copa'));
      st.error = ''; st.codigo = '';
    } catch (e) {
      if (!silencio || !st.datos) { st.error = e.message || String(e); st.codigo = e.codigo || (e.status ? 'http_' + e.status : ''); }
    }
    st.cargando = false;
    pintar();
  }
  function usar(d) {
    if (!d || typeof d !== 'object') return;
    st.datos = d; st.cargadoEn = Date.now();
    const t = Date.parse(d.copa && d.copa.ahora);
    if (Number.isFinite(t)) st.desfase = t - Date.now();
  }

  /* ---------- datos derivados ---------- */
  const HORA = 3600e3, DIA = 24 * HORA;
  function torneo(c) {
    const k = String((c && c.torneo_key) || '').toLowerCase();
    return TORNEOS.find((t) => k === t.k || (k && k.indexOf(t.k) >= 0)) || TORNEOS.find((t) => t.re.test((c && c.nombre) || '')) || null;
  }
  function nombreTorneo(c) {
    const t = torneo(c);
    if (t && idioma() !== 'es') { const d = TRAD[idioma()] || {}; if (d['torneo.' + t.k]) return d['torneo.' + t.k]; }
    return (c && c.nombre) || (t ? T('torneo.' + t.k) : T('titulo'));
  }
  // Cuándo termina la fase actual: lo dice el servidor (fin_fase) o sale del calendario (lunes 00:00 + …)
  function finFase(c) {
    if (!c) return null;
    if (c.fin_fase) return Date.parse(c.fin_fase);
    const ini = Date.parse(c.inicio);
    if (c.fase === 'preparacion' && Number.isFinite(ini)) return ini + 5 * DIA;
    if (c.fase === 'batalla' && Number.isFinite(ini)) return ini + 5 * DIA + 20 * HORA;
    const fin = Date.parse(c.fin);
    if (Number.isFinite(fin)) return fin;
    return Number.isFinite(ini) ? ini + 7 * DIA : null;
  }
  function servidores(d) {
    const l = (d.servidores || []).slice();
    const porId = l.slice().sort((a, b) => a.id - b.id);
    l.forEach((s) => { s._color = s.color || COLORES[porId.indexOf(s) % COLORES.length]; });
    return l.sort((a, b) => (a.posicion || 99) - (b.posicion || 99) || (b.puntos_tabla || 0) - (a.puntos_tabla || 0) || (b.puntos_prep || 0) - (a.puntos_prep || 0));
  }
  const miServidor = (d) => (d.servidores || []).find((s) => s.yo) || null;
  function srv(d, x) {
    if (x && typeof x === 'object') return (d.servidores || []).find((s) => s.id === x.id) || x;
    return (d.servidores || []).find((s) => s.id === x || String(s.id) === String(x)) || { id: x, nombre: String(x || '?') };
  }
  const corto = (n) => { const p = String(n || '').split('·'); return (p.length > 1 ? p[p.length - 1] : p[0]).trim(); };
  const numSrv = (s) => { const m = /(\d+)/.exec(String((s && s.nombre) || '')); return m ? m[1] : String((s && s.id) || '?'); };
  function bono(d, s) {
    const max = Math.max(0, ...(d.servidores || []).map((x) => Number(x.puntos_prep) || 0));
    return max > 0 ? Math.min(15, (15 * (Number(s.puntos_prep) || 0)) / max) : 0;
  }
  function horaTxt(h) {
    if (!h) return '';
    if (/^\d{1,2}:\d{2}/.test(String(h))) return String(h).slice(0, 5);
    const t = Date.parse(h);
    if (!Number.isFinite(t)) return String(h);
    try { return new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Guayaquil' }); } catch (e) { return new Date(t).toISOString().slice(11, 16); }
  }
  const estadoCruce = (c) => { const e = String((c && c.estado) || ''); return /vivo|jugando|curso/.test(e) ? 'vivo' : /jugad|termin|cerrad|final/.test(e) ? 'jugado' : 'pendiente'; };
  function ladoGanador(c, p) {
    const g = p.ganador;
    if (g === 'a' || g === c.a || (c.a && typeof c.a === 'object' && g === c.a.id)) return 'a';
    if (g === 'b' || g === c.b || (c.b && typeof c.b === 'object' && g === c.b.id)) return 'b';
    if (g === null || g === undefined) { if (p.calidad_a === undefined || p.calidad_a === null) return null; return p.calidad_a > p.calidad_b ? 'a' : p.calidad_b > p.calidad_a ? 'b' : 'x'; }
    return 'x';
  }

  /* ---------- contador ---------- */
  function restante(ms) { return Number.isFinite(ms) ? Math.max(0, ms - (Date.now() + st.desfase)) : 0; }
  function hms(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h >= 24 ? Math.floor(h / 24) + 'd ' + String(h % 24).padStart(2, '0') : String(h).padStart(2, '0')) + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  }
  function tic() {
    if (typeof document === 'undefined') return;
    const nodos = document.querySelectorAll('[data-copa-cuenta]');
    let vencio = false;
    nodos.forEach((n) => { const ms = restante(Number(n.getAttribute('data-copa-cuenta'))); n.textContent = hms(ms); if (ms <= 0) vencio = true; });
    const enPantalla = st.el && st.el.isConnected;
    if (!nodos.length && !enPantalla) { detener(); return; }
    if (enPantalla && !st.cargando && !st.ocupado && ((vencio && Date.now() - st.cargadoEn > 5000) || Date.now() - st.cargadoEn > 60000)) cargar(true);
  }
  function arrancar() { if (!st.timer) st.timer = setInterval(tic, 1000); }
  function detener() { if (st.timer) clearInterval(st.timer); st.timer = null; }

  /* ---------- elegir personal y equipos (como festival.js: lo mejor que tienes, dentro de los topes) ---------- */
  const MAX_CAT = { cam: 4, lens: 4, support: 4, wireless: 4, mics: 4, cable: 2, power: 2, rain: 2 };
  const SRV_CAT = { dron4k: 'cam', grua: 'cam', vip_cam8k: 'cam', unidad_movil: 'switcher', vip_switcher: 'switcher', generador: 'power', vip_satelital: 'internet' };
  const SERVIDOR = Object.keys(SRV_CAT);
  const itemDe = (t) => { const G = root.Game; return (G && G.CATALOG && G.CATALOG[t]) || null; };
  const catDe = (t) => SRV_CAT[t] || (itemDe(t) || {}).cat;
  const maxTipo = (t) => (SRV_CAT[t] ? 9 : itemDe(t) ? (MAX_CAT[itemDe(t).cat] || 1) : 0);
  function elegirEquipo() {
    const d = st.datos || {};
    if (st.ctx && typeof st.ctx.equipo === 'function') return st.ctx.equipo(d);
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    if (!s) return null;
    const topes = (d.yo && d.yo.topes) || { habilidad_max: 5, personas_max: 8, equipos_max: 12 };
    const vip = !!(st.ctx.vip || (d.yo && d.yo.vip));
    const fama = Number(topes.fama !== undefined ? topes.fama : (s.rep || 0)) || 0;
    const staff = (s.staff || []).filter((p) => p && p.role && (p.premium || (p.skill || 1) <= topes.habilidad_max))
      .sort((a, b) => (b.owner ? 1 : 0) - (a.owner ? 1 : 0) || (b.skill || 1) - (a.skill || 1)).slice(0, topes.personas_max)
      .map((p) => { const o = { role: p.role, skill: Math.max(1, Math.min(5, p.skill | 0 || 1)) }; if (p.owner) o.owner = true; if (p.name) o.name = String(p.name).slice(0, 40); return o; });
    const q = (t) => ((itemDe(t) && itemDe(t).q) || 1);
    const cuenta = {};
    const equip = [];
    (s.equip || []).filter((e) => e && maxTipo(e.type) && (SRV_CAT[e.type] || ((itemDe(e.type) || {}).minRep || 0) <= fama) && (e.condition === undefined || e.condition >= 40)
        && (!SERVIDOR.includes(e.type) || e.srvId !== undefined) && (vip || !/^vip_/.test(e.type)))
      .sort((a, b) => (catDe(a.type) === 'cam' ? 0 : 1) - (catDe(b.type) === 'cam' ? 0 : 1) || q(b.type) - q(a.type))
      .forEach((e) => {
        if (equip.length >= topes.equipos_max) return;
        cuenta[e.type] = (cuenta[e.type] || 0) + 1;
        if (cuenta[e.type] > maxTipo(e.type)) return;
        if (['switcher', 'audio', 'internet', 'power', 'encoder', 'rain'].includes(catDe(e.type)) && equip.some((x) => catDe(x.type) === catDe(e.type))) return;
        equip.push({ type: e.type });
      });
    return { staff, equip };
  }

  /* ---------- acciones ---------- */
  async function registrar() {
    if (st.ocupado) return;
    const eq = elegirEquipo();
    if (!eq || !Array.isArray(eq.staff) || !eq.staff.length) { aviso(T('sin_partida')); return; }
    st.ocupado = true; pintar();
    try {
      const r = await pedir('POST', '/api/copa/equipo', { staff: eq.staff, equip: eq.equip || [] });
      if (r && r.copa && typeof r.copa === 'object' && 'servidores' in r.copa) usar(r.copa);
      else if (st.datos && st.datos.yo) st.datos.yo.equipo_registrado = true;
      sonido('hire');
      aviso(T('registrado', { p: eq.staff.length, e: (eq.equip || []).length }));
    } catch (e) {
      aviso(e.message || String(e)); sonido('error');
      if (e.status === 409 || e.status === 404 || e.status === 401) await cargar(true);
    }
    st.ocupado = false;
    pintar();
  }

  async function sumar() {
    if (st.ocupado) return;
    const ctx = st.ctx || {};
    if (typeof ctx.jugarIntento !== 'function') { aviso(T('sin_juego')); return; }
    const d = st.datos || {};
    st.ocupado = true; st.trabajo = T('preparando'); pintar();
    try {
      let it = d.yo && d.yo.intento_abierto && typeof d.yo.intento_abierto === 'object' && d.yo.intento_abierto.seed !== undefined ? d.yo.intento_abierto : null;
      if (it) aviso(T('reanudado'));
      else {
        try {
          const r = await pedir('POST', '/api/copa/intento/iniciar', {});
          it = r && r.intento ? r.intento : r;
        } catch (e) {
          const abierto = e.datos && (e.datos.intento || (e.datos.yo && e.datos.yo.intento_abierto));
          if (e.codigo === 'intento_abierto' && abierto && abierto.seed !== undefined) { it = abierto; aviso(T('reanudado')); } else throw e;
        }
      }
      sonido('click');
      const out = await ctx.jugarIntento(it);
      if (!out || !Array.isArray(out.decisiones)) { aviso(T('pausado')); st.ocupado = false; st.trabajo = ''; await cargar(true); return; }
      const res = out.resultado || {};
      const calidad = res.calidad !== undefined ? res.calidad : res.quality;
      const estrellas = res.estrellas !== undefined ? res.estrellas : res.stars;
      const cuerpo = { intento_id: it.id, decisiones: out.decisiones, resultado: { calidad: Math.round(Number(calidad) || 0), estrellas: Math.round(Number(estrellas) || 1) } };
      st.trabajo = T('validando'); pintar();
      const r = await pedir('POST', '/api/copa/intento/enviar', cuerpo);
      st.ultimo = r.resultado || null;
      if (r.copa && typeof r.copa === 'object' && 'servidores' in r.copa) usar(r.copa); else { st.ocupado = false; await cargar(true); }
      const x = st.ultimo || {};
      if (x.valido === false && !x.puntos) { aviso(T('invalido')); sonido('error'); } else { aviso(T('resultado', { calidad: x.calidad, puntos: num(x.puntos) })); sonido(x.estrellas >= 4 ? 'stars' : 'cash'); }
      try { if (ctx.sincronizar) ctx.sincronizar(); } catch (e) { /* nada */ }
    } catch (e) {
      aviso(e.message || String(e)); sonido('error');
      if (e.status && e.status !== 0) { st.ocupado = false; await cargar(true); }
    } finally {
      st.ocupado = false; st.trabajo = '';
      pintar();
    }
  }

  /* ---------- dibujos (SVG propio) ---------- */
  function estadio(color) {
    const c = color || '#4da3ff';
    const gente = Array.from({ length: 90 }, (_, i) => {
      const x = (i * 37) % 360, fila = Math.floor(i / 30), y = 104 + fila * 9 + ((i * 7) % 4);
      return `<circle cx="${x + 4}" cy="${y}" r="1.7" fill="${['#ff3b3b', '#ffd36b', '#4da3ff', '#e9edf5', c][i % 5]}" opacity="${0.35 + (i % 3) * 0.12}"/>`;
    }).join('');
    const torre = (x, flip) => `<g transform="translate(${x} 0)${flip ? ' scale(-1 1)' : ''}">
        <path d="M0 0L-150 170H150z" fill="url(#cp-cono)" opacity=".55"/>
        <rect x="-3" y="10" width="6" height="96" fill="#1a2030"/>
        <rect x="-16" y="2" width="32" height="13" rx="2" fill="#262e40"/>
        ${[-11, -4, 3, 10].map((dx) => `<circle cx="${dx}" cy="8.5" r="2.6" fill="#fff8d6"/>`).join('')}</g>`;
    return `<svg viewBox="0 0 360 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="cp-cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050812"/><stop offset=".55" stop-color="#0d1530"/><stop offset="1" stop-color="#0a0f1c"/></linearGradient>
        <radialGradient id="cp-cono" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#fff6c8" stop-opacity=".55"/><stop offset=".6" stop-color="#fff6c8" stop-opacity=".06"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>
        <linearGradient id="cp-velo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#070a12" stop-opacity=".92"/><stop offset=".7" stop-color="#070a12" stop-opacity=".7"/><stop offset="1" stop-color="#070a12" stop-opacity=".35"/></linearGradient></defs>
      <rect width="360" height="170" fill="url(#cp-cielo)"/>
      ${torre(36, false)}${torre(324, true)}
      <path d="M0 100Q180 74 360 100V170H0z" fill="#121a2c"/>
      ${gente}
      <path d="M0 132Q180 116 360 132V170H0z" fill="#123a24"/>
      <path d="M0 140Q180 125 360 140" stroke="#ffffff" stroke-opacity=".25" stroke-width="1.2" fill="none"/>
      <ellipse cx="180" cy="160" rx="54" ry="10" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="1.2"/>
      <rect x="0" y="94" width="360" height="5" fill="${c}" opacity=".75"/>
      <rect width="360" height="170" fill="url(#cp-velo)"/>
    </svg>`;
  }
  function escudo(s, size) {
    const c = (s && s._color) || '#5b6476', z = size || 26, n = numSrv(s);
    return `<svg width="${z}" height="${z}" viewBox="0 0 26 26" aria-hidden="true" style="flex:none"><path d="M13 1.5l10 3.2v7.6c0 6.2-4.2 10.3-10 12.2C7.2 22.6 3 18.5 3 12.3V4.7z" fill="${c}2b" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
      <text x="13" y="17" text-anchor="middle" font-size="${n.length > 1 ? 9 : 11}" font-weight="800" font-family="Barlow Condensed,Arial Narrow,sans-serif" fill="#fff">S${esc(n)}</text></svg>`;
  }
  function trofeo(size, color) {
    const c = color || '#ffb020', z = size || 36;
    return `<svg width="${z}" height="${z}" viewBox="0 0 40 40" aria-hidden="true" style="flex:none"><path d="M12 6h16v8c0 5-3.6 9-8 9s-8-4-8-9z" fill="${c}" stroke="#7a5310" stroke-width="1.2"/>
      <path d="M12 9H6c0 5 2.5 8 6.5 8.5M28 9h6c0 5-2.5 8-6.5 8.5" fill="none" stroke="${c}" stroke-width="2.2"/>
      <rect x="18" y="23" width="4" height="6" fill="${c}"/><path d="M13 34h14l-2-5H15z" fill="${c}" stroke="#7a5310" stroke-width="1"/>
      <path d="M16 9.5c0 4 1.4 7 3 8" stroke="#fff6c8" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".8"/></svg>`;
  }

  /* ---------- tarjetas ---------- */
  function cabecera(d) {
    const c = d.copa, t = torneo(c), yo = miServidor(d);
    const fin = finFase(c);
    const fase = c.fase === 'batalla' ? 'batalla' : c.fase === 'cerrada' ? 'cerrada' : 'preparacion';
    const va = yo && yo.posicion && fase !== 'cerrada' ? (yo.posicion === 1 && fase !== 'preparacion' ? T('lider') : T('va', { n: ordinal(yo.posicion) })) : '';
    return `<div class="card cp-head" data-copa="cabecera">${estadio(t && t.color)}
      <div class="in">
        <div class="cp-kicker">${icon(t ? t.icono : 'shield')}<span>${esc(T('titulo'))}${d.universo && d.universo.nombre ? ' · ' + esc(d.universo.nombre) : ''}</span></div>
        <h2>${esc(nombreTorneo(c))}</h2>
        <div style="margin-top:8px"><span class="cp-fase ${fase}" data-copa-fase="${fase}">${fase === 'batalla' ? '<i class="cp-dot"></i>' + esc(T('en_vivo')) + ' · ' : ''}${esc(T('fase.' + fase))}</span></div>
        <div class="cp-reloj"><div><span>${esc(T('cuenta.' + fase))}</span><b class="cp-mono" data-copa-cuenta="${fin}">${hms(restante(fin))}</b></div>${va ? `<span class="cp-va">${esc(va)}</span>` : ''}</div>
      </div></div>`;
  }

  function marcador(d) {
    const l = servidores(d);
    if (!l.length) return '';
    const yo = l.find((s) => s.yo) || l[0];
    const rival = l.find((s) => s !== yo) || null;
    const prep = d.copa.fase === 'preparacion';
    const valor = (s) => (prep ? num(s.puntos_prep) : num(s.puntos_tabla));
    const lado = (s, esYo) => (s ? `<div class="cp-lado ${esYo ? 'yo' : ''}"><small>${esc(esYo ? T('tu_servidor') : T('rival'))}</small>${escudo(s, 34)}<b>${esc(corto(s.nombre))}</b>
        <span class="cp-led ${esYo ? 'yo' : ''}">${valor(s)}</span></div>` : '<div></div>');
    const filas = l.map((s, i) => `<tr class="${s.yo ? 'yo' : ''} l${s.posicion || i + 1}" data-srv="${esc(s.id)}">
        <td class="p">${s.posicion || i + 1}</td>
        <td class="nom">${escudo(s, 20)}<span>${esc(corto(s.nombre))}</span>${s.yo ? `<span class="cp-tag">${esc(T('tu'))}</span>` : ''}</td>
        <td class="gep">${s.g || 0}-${s.e || 0}-${s.p || 0}</td>
        <td class="pr">${num(s.puntos_prep)}</td>
        <td class="pt">${num(s.puntos_tabla)}</td></tr>`).join('');
    return `<div class="card cp-board" data-copa="marcador">
      <div class="cp-board-top"><span>${esc(T('marcador'))}</span><span class="cp-mono" style="font-size:12px">${esc(prep ? T('prep') : T('pts'))}</span></div>
      <div class="cp-vs">${lado(yo, true)}<span class="cp-vsx">VS</span>${lado(rival, false)}</div>
      <table class="cp-tabla"><thead><tr><th class="p">${esc(T('pos'))}</th><th class="nom">${esc(T('servidor'))}</th><th class="gep">${esc(T('gep'))}</th><th class="pr">${esc(T('prep'))}</th><th class="pt">${esc(T('pts'))}</th></tr></thead>
        <tbody>${filas}</tbody></table></div>`;
  }

  function preparacion(d) {
    const l = (d.servidores || []).slice();
    if (!l.length) return '';
    servidores(d);
    const max = Math.max(1, ...l.map((s) => Number(s.puntos_prep) || 0));
    const filas = l.sort((a, b) => (b.puntos_prep || 0) - (a.puntos_prep || 0)).map((s) => `<div class="fila ${s.yo ? 'yo' : ''}" data-prep="${esc(s.id)}">
        <div class="top"><span class="n">${esc(corto(s.nombre))}${s.yo ? ` · ${esc(T('tu'))}` : ''}</span><span class="v"><b>${num(s.puntos_prep)}</b> · ${esc(T('bono', { n: dec1(bono(d, s)) }))}</span></div>
        <div class="barra"><i style="width:${Math.max(2, Math.round((100 * (Number(s.puntos_prep) || 0)) / max))}%;background-color:${esc(s._color)}"></i></div></div>`).join('');
    return `<div class="card" data-copa="preparacion"><h3>${esc(T('preparacion_t'))}</h3>
      <p class="small muted" style="margin:4px 0 0">${esc(T('preparacion_det'))}</p><div class="cp-prep">${filas}</div></div>`;
  }

  function tarjetaYo(d) {
    const y = d.yo || {};
    const prep = d.copa.fase === 'preparacion';
    const abierto = y.intento_abierto && typeof y.intento_abierto === 'object';
    const eqOk = !!y.equipo_registrado;
    const puedeJugar = prep && !st.ocupado && !!(st.ctx && st.ctx.jugarIntento);
    return `<div class="card cp-yo" data-copa="yo">
      <div class="row between"><h3>${esc(T('tu_aporte'))}</h3>${y.posicion_en_servidor ? `<span class="small" style="color:var(--amber)">${esc(T('puesto_srv', { n: ordinal(y.posicion_en_servidor) }))}</span>` : ''}</div>
      <div class="cp-yo-num"><div><b data-copa-aporte>${num(y.aporte)}</b><small>${esc(T('pts'))}</small></div><div><b>${y.posicion_en_servidor ? '#' + y.posicion_en_servidor : '—'}</b><small>${esc(T('servidor'))}</small></div></div>
      ${!y.aporte ? `<p class="small muted" style="margin:8px 0 0">${esc(T('sin_puesto'))}</p>` : ''}
      <div class="cp-eq ${eqOk ? 'ok' : 'no'}" data-copa-equipo="${eqOk ? 'si' : 'no'}">${icon(eqOk ? 'check' : 'people', '')}<div><b>${esc(T(eqOk ? 'equipo_ok' : 'equipo_no'))}</b><div class="small muted" style="margin-top:2px">${esc(T('equipo_det'))}</div></div></div>
      <div class="cp-acc">
        <button class="btn ${eqOk ? '' : 'main'}" data-copa="registrar" ${prep && !st.ocupado ? '' : 'disabled'}>${icon(eqOk ? 'refresh' : 'shield', '')} ${esc(T(eqOk ? 'actualizar' : 'registrar'))}</button>
        <button class="btn ${eqOk ? 'main' : ''}" data-copa="sumar" ${puedeJugar ? '' : 'disabled'}>${icon(abierto ? 'play' : 'rec', '')} ${esc(T(abierto ? 'seguir' : 'sumar'))}</button>
      </div>
      <p class="small muted" style="margin:8px 0 0">${esc(prep ? T('sumar_det') : T('solo_prep'))}</p>
    </div>`;
  }

  function tarjetaCruce(d, c, i) {
    const A = srv(d, c.a), B = srv(d, c.b);
    servidores(d);
    const e = estadoCruce(c);
    const ps = (c.partidos || []).slice().sort((x, y) => (x.n || 0) - (y.n || 0));
    const filas = Array.from({ length: 5 }, (_, k) => {
      const p = ps.find((x) => x.n === k + 1) || ps[k];
      if (!p || p.calidad_a === undefined || p.calidad_a === null) {
        return `<div class="cp-pt espera"><span class="n">${k + 1}</span><span class="t">${icon((p && p.tipo) || 'clock', '')}</span><span class="q">–</span><div class="duo"><span></span><span></span></div><span class="q">–</span></div>`;
      }
      const g = ladoGanador(c, p);
      const qa = Math.max(0, Math.min(100, Number(p.calidad_a) || 0)), qb = Math.max(0, Math.min(100, Number(p.calidad_b) || 0));
      return `<div class="cp-pt" data-partido="${k + 1}" data-ganador="${g || ''}"><span class="n">${k + 1}</span><span class="t" title="${esc(p.tipo || '')}">${icon(p.tipo || 'stream', '')}</span>
        <span class="q ${g === 'a' ? 'win' : ''} ${A.yo ? 'yo' : ''}">${qa}</span>
        <div class="duo"><span><i style="width:${qa}%;background:${esc(A._color || '#4da3ff')}${g === 'a' ? '' : '88'}"></i></span><span><i style="width:${qb}%;background:${esc(B._color || '#ff3b3b')}${g === 'b' ? '' : '88'}"></i></span></div>
        <span class="q ${g === 'b' ? 'win' : ''} ${B.yo ? 'yo' : ''}">${qb}</span></div>`;
    }).join('');
    const ga = ps.filter((p) => ladoGanador(c, p) === 'a').length, gb = ps.filter((p) => ladoGanador(c, p) === 'b').length;
    const sc = (v) => (e === 'pendiente' && !v ? '–' : num(v));
    const pa = c.puntos_a !== undefined && c.puntos_a !== null ? c.puntos_a : (e === 'pendiente' ? 0 : ga);
    const pb = c.puntos_b !== undefined && c.puntos_b !== null ? c.puntos_b : (e === 'pendiente' ? 0 : gb);
    let pie = '';
    if (e === 'jugado') pie = `<div class="cp-gana"><span>${ga}–${gb}</span><b>${esc(pa === pb ? T('empate') : T('gana', { n: corto((pa > pb ? A : B).nombre) }))}</b></div>`;
    const estado = e === 'vivo' ? `<span class="cp-live"><i></i>${esc(T('en_vivo'))}</span>` : e === 'jugado' ? `<span>${icon('check')} ${esc(T('jugado'))}</span>`
      : `<span>${icon('clock')} ${esc(T('pendiente'))}</span>`;
    const lado = (s, cls) => `<div class="eq ${cls} ${s.yo ? 'yo' : ''}">${escudo(s, 24)}<span>${esc(corto(s.nombre))}</span></div>`;
    return `<div class="card cp-cruce ${e === 'vivo' ? 'vivo' : ''}" data-cruce="${esc(c.id)}" data-estado="${e}">
      <div class="cp-cruce-top"><b>${esc(T('ronda', { n: c.ronda || i + 1 }))} · ${esc(T('por_jugar', { h: horaTxt(c.hora) }))}</b>${estado}</div>
      <div class="cp-bug">${lado(A, 'a')}<div class="sc"><b>${sc(pa)}</b><i>:</i><b>${sc(pb)}</b></div>${lado(B, 'b')}</div>
      <div class="cp-partidos">${filas}</div>${pie}</div>`;
  }

  function tarjetaCruces(d) {
    const cr = (d.cruces || []).slice().sort((a, b) => (a.ronda || 0) - (b.ronda || 0));
    const prox = cr.find((c) => estadoCruce(c) === 'pendiente' && Number.isFinite(Date.parse(c.hora)));
    const cab = `<div class="sectitle">${esc(T('cruces'))}</div>
      <p class="small muted" style="margin:-4px 0 0">${esc(T('cruces_det'))}${prox && d.copa.fase === 'batalla' ? ` · ${esc(T('cuenta.cruce'))} <b class="cp-mono" style="color:var(--amber)" data-copa-cuenta="${Date.parse(prox.hora)}">${hms(restante(Date.parse(prox.hora)))}</b>` : ''}</p>`;
    if (!cr.length) return `${cab}<div class="card"><p class="small muted" style="margin:0">${icon('calendar')} ${esc(T('sin_cruces'))}</p></div>`;
    return cab + cr.map((c, i) => tarjetaCruce(d, c, i)).join('');
  }

  function tarjetaTop(d) {
    const l = (d.top_aportantes || []).slice(0, 10);
    const filas = l.map((r, i) => `<div class="${r.yo ? 'yo' : ''}"><span class="p p${i + 1}">${i + 1}</span>${r.siglas ? `<span class="s">${esc(r.siglas)}</span>` : ''}<span class="n">${esc(r.alias)}${r.yo ? ' (' + esc(T('tu')) + ')' : ''}</span><span class="v">${esc(T('puntos', { n: num(r.puntos) }))}</span>${!r.yo && r.jugador_id && window.Visitas ? window.Visitas.boton(r.jugador_id) : ''}</div>`).join('');
    return `<div class="card" data-copa="top"><h3>${esc(T('top'))}</h3><div class="cp-rank">${filas || `<p class="small muted" style="margin:0">${esc(T('top_vacio'))}</p>`}</div></div>`;
  }

  function tarjetaHistorial(d) {
    const l = (d.historial || []).slice(0, 6);
    const filas = l.map((h) => `<div>${trofeo(26)}<span class="g"><b>${esc(typeof h.campeon === 'object' && h.campeon ? h.campeon.nombre : h.campeon)}</b><small>${esc(nombreTorneo(h))}</small></span><span class="w">${esc(h.semana || '')}</span></div>`).join('');
    return `<div class="card" data-copa="historial"><h3>${esc(T('historial'))}</h3><div class="cp-hist">${filas || `<p class="small muted" style="margin:0">${esc(T('historial_vacio'))}</p>`}</div></div>`;
  }

  function entregaTxt(e) {
    if (!e || typeof e !== 'object') return '';
    if (e.tipo === 'dinero') return '$' + num(e.cantidad);
    if (e.tipo === 'fama') return T('fama', { n: num(e.cantidad) });
    if (e.tipo === 'trofeo') return T('trofeo', { n: e.nombre || e.clave || '' });
    if (e.tipo === 'reparar_todo') return T('reparar');
    if (e.tipo === 'materiales') { const m = e.materiales || e.cantidad || {}; return typeof m === 'object' ? Object.keys(m).map((k) => m[k] + ' × ' + k).join(', ') : String(m); }
    if (e.tipo === 'consumible') return (e.cantidad || 1) + ' × ' + (e.item || '');
    return e.nombre || e.item || e.tipo || '';
  }
  function tarjetaPremios(d) {
    let filas;
    if (Array.isArray(d.premios) && d.premios.length) {
      filas = d.premios.map((p, i) => `<div class="${i === 0 ? 'c' : ''}">${i === 0 ? trofeo(30) : icon('gift', '', 22)}<span class="tx"><b>${esc(p.nombre || p.titulo || p.clave || '')}</b>
        <small>${esc(p.detalle || (p.entregas || []).map(entregaTxt).filter(Boolean).join(' · '))}</small></span></div>`).join('');
    } else {
      filas = `<div class="c">${trofeo(30)}<span class="tx"><b>${esc(T('premio.campeon'))}</b><small>${esc(T('premio.campeon_det'))}</small></span></div>
        <div>${icon('crown', '', 22)}<span class="tx"><b>${esc(T('premio.top10'))}</b><small>${esc(T('premio.top10_det'))}</small></span></div>
        <div>${icon('gift', '', 22)}<span class="tx"><b>${esc(T('premio.resto'))}</b><small>${esc(T('premio.resto_det'))}</small></span></div>`;
    }
    return `<div class="card" data-copa="premios"><h3>${esc(T('premios'))}</h3><div class="cp-prem">${filas}</div><p class="small muted" style="margin:8px 0 0">${esc(T('premio.nota'))}</p></div>`;
  }

  function tarjetaCampeon(d) {
    if (d.copa.fase !== 'cerrada') return '';
    const l = servidores(d);
    const c = l.find((s) => s.posicion === 1) || l[0];
    if (!c) return '';
    return `<div class="card cp-campeon" data-copa="campeon">${trofeo(54)}<div><b>${esc(c.yo ? T('tu_campeon') : T('campeon', { n: corto(c.nombre) }))}</b>
      <div class="small muted" style="margin-top:2px">${esc(nombreTorneo(d.copa))} · ${num(c.puntos_tabla)} ${esc(T('pts'))}</div></div></div>`;
  }

  function tarjetaUltimo() {
    const x = st.ultimo;
    if (!x) return '';
    const ok = !(x.valido === false && !x.puntos);
    const est = ok && x.estrellas ? ' ' + '★'.repeat(Math.min(5, x.estrellas)) + '☆'.repeat(Math.max(0, 5 - x.estrellas)) : '';
    return `<div class="card cp-res ${ok ? '' : 'mal'}" data-copa="ultimo"><b>${esc(ok ? T('resultado', { calidad: x.calidad, puntos: num(x.puntos) }) : T('invalido'))}</b><span style="color:var(--amber)">${est}</span></div>`;
  }

  const como = () => `<div class="card"><h3>${esc(T('como'))}</h3><p class="small muted" style="margin:4px 0 0">${esc(T('como_texto'))}</p></div>`;

  function pintar() {
    const el = st.el;
    if (!el) return;
    css();
    if (sinSesion()) {
      el.innerHTML = `<div class="cp" data-copa-estado="sin_sesion"><div class="card cp-head">${estadio()}<div class="in"><div class="cp-kicker">${icon('shield')}<span>${esc(T('titulo'))}</span></div>
        <h2>${esc(T('sin_sesion_t'))}</h2><p class="small" style="color:#c9d3e6;margin:8px 0 0">${esc(T('sin_sesion'))}</p></div></div>${tarjetaPremiosVacia()}${como()}</div>`;
      return;
    }
    if (!st.datos && st.error) {
      const sesion = st.codigo === 'sin_sesion';
      el.innerHTML = `<div class="cp" data-copa-estado="${sesion ? 'sin_sesion' : 'error'}"><div class="card"><h3>${esc(sesion ? T('sin_sesion_t') : T('error'))}</h3>
        <p class="small neg" style="margin:6px 0 0">${esc(st.error)}</p>${st.codigo ? `<p class="small muted cp-mono" style="margin:4px 0 0" data-copa-codigo>${esc(T('codigo', { c: st.codigo }))}</p>` : ''}
        <button class="btn sm" style="margin-top:10px" data-copa="recargar">${icon('refresh')} ${esc(T('reintentar'))}</button></div></div>`;
      return;
    }
    if (!st.datos) { el.innerHTML = `<div class="cp" data-copa-estado="cargando"><div class="card muted">${esc(T('cargando'))}</div></div>`; return; }
    const d = st.datos;
    if (!d.copa) {
      el.innerHTML = `<div class="cp" data-copa-estado="sin_copa"><div class="card cp-head">${estadio()}<div class="in"><div class="cp-kicker">${icon('shield')}<span>${esc(T('titulo'))}${d.universo && d.universo.nombre ? ' · ' + esc(d.universo.nombre) : ''}</span></div>
        <h2>${esc(T('sin_copa_t'))}</h2><p class="small" style="color:#c9d3e6;margin:8px 0 0">${esc(T('sin_copa'))}</p></div></div>
        ${tarjetaHistorial(d)}${tarjetaPremios(d)}${como()}</div>`;
      return;
    }
    const fase = d.copa.fase;
    const cruces = tarjetaCruces(d);
    el.innerHTML = `<div class="cp" data-copa-estado="${esc(fase)}">${cabecera(d)}
      ${st.error ? `<div class="card" style="border-color:var(--red)"><p class="small neg" style="margin:0">${esc(st.error)}${st.codigo ? ' · ' + esc(T('codigo', { c: st.codigo })) : ''}</p></div>` : ''}
      ${st.trabajo ? `<div class="card" data-copa="trabajando"><p class="small" style="margin:0">${icon('clock')} ${esc(st.trabajo)}</p></div>` : ''}
      ${tarjetaUltimo()}${tarjetaCampeon(d)}
      ${marcador(d)}
      ${fase === 'preparacion' ? preparacion(d) + tarjetaYo(d) + cruces : cruces + tarjetaYo(d) + preparacion(d)}
      ${tarjetaTop(d)}${tarjetaHistorial(d)}${tarjetaPremios(d)}${como()}</div>`;
  }
  function tarjetaPremiosVacia() { return tarjetaPremios({}); }

  function alTocar(ev) {
    const t = ev.target.closest('[data-copa]');
    if (!t || !st.el || !st.el.contains(t) || t.disabled) return;
    const a = t.getAttribute('data-copa');
    if (a === 'registrar') registrar();
    else if (a === 'sumar') sumar();
    else if (a === 'recargar') { st.error = ''; st.codigo = ''; pintar(); cargar(); }
  }

  function render(el, ctx) {
    if (st.el && st.el !== el) st.el.removeEventListener('click', alTocar);
    if (st.el !== el) el.addEventListener('click', alTocar);
    st.el = el; st.ctx = ctx || {};
    st.ultimo = null;
    arrancar();
    pintar();
    if (sinSesion()) return Promise.resolve();
    return cargar();
  }

  /* ---------- tarjeta en Inicio (window.EnVivoInicio, orden 30) ---------- */
  function abrirPantalla() {
    if (typeof root.EnVivoAbrirOnline === 'function') { root.EnVivoAbrirOnline('copa'); return; }
    if (typeof document === 'undefined') return;
    // Sin ayuda de ui.js: botón de la barra "En línea" y luego el mismo data-act que usan las fichas del hub
    const nav = document.querySelector('nav button[data-tab="online"]');
    if (nav) nav.click();
    const b = document.createElement('button');
    b.setAttribute('data-act', 'online'); b.setAttribute('data-k', 'copa'); b.hidden = true;
    document.body.appendChild(b);
    b.click();
    b.remove();
  }
  const inicio = {
    id: 'copa', orden: 30,
    tarjeta(ctx) {
      const A = root.Api;
      let logueado = false;
      try { logueado = !!(A && A.disponible !== false && A.logueado && A.logueado()); } catch (e) { logueado = false; }
      if (!logueado) return '';
      const d = st.datos;
      if ((!d || Date.now() - st.cargadoEn > 5 * 60e3) && !st.cargando && Date.now() - st.intentoInicio > 5 * 60e3) {
        st.intentoInicio = Date.now();
        pedir('GET', '/api/copa').then((x) => { const antes = !!(st.datos && st.datos.copa); usar(x); const ahora = !!(x && x.copa); if (ctx && ctx.render && (antes || ahora)) ctx.render(); pintar(); }).catch(() => {});
      }
      if (!d || !d.copa || !(d.copa.fase === 'preparacion' || d.copa.fase === 'batalla')) return '';
      css(); arrancar();
      const c = d.copa, t = torneo(c), yo = miServidor(d), fin = finFase(c), bat = c.fase === 'batalla';
      const pos = yo && yo.posicion;
      return `<div class="card cp-ini" data-copa-inicio="${esc(c.fase)}">
        <div class="row1">${trofeo(40, t && t.color)}<div class="g"><b>${esc(nombreTorneo(c))}</b><small>${bat ? '● ' + esc(T('en_vivo')) + ' · ' : ''}${esc(T('titulo'))} · ${esc(T('fase.' + c.fase))}</small></div></div>
        ${pos ? `<p class="small" style="margin:8px 0 0"><b style="color:#ff6b6b">${esc(T(bat ? 'inicio_bat' : 'inicio_prep', { n: ordinal(pos) }))}</b></p>` : ''}
        <div class="cta"><span class="small muted">${esc(T('cuenta.' + c.fase))} <b data-copa-cuenta="${fin}">${hms(restante(fin))}</b></span>
          <button class="btn sm main" data-ext="copa" data-acc="abrir">${esc(T('ver'))}</button></div></div>`;
    },
    clic(ctx, accion) { if (accion === 'abrir') abrirPantalla(); },
  };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === 'copa')) root.EnVivoInicio.push(inicio);

  root.Copas = {
    render, detener, recargar: () => cargar(), invalidar() { st.datos = null; st.error = ''; st.codigo = ''; st.ultimo = null; },
    elegirEquipo: () => elegirEquipo(), T, TRAD, ES, inicio, _st: st,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Copas;
})(typeof window !== 'undefined' ? window : globalThis);
