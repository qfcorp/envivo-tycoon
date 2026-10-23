/* =========================================================
   EN VIVO Tycoon — Nivel VIP 1–10, regalos de asociación y Mecenas del servidor (pantalla)
   Contrato: server/MONETIZACION.md y server/INTEGRAR_VIP.md. Es aparte del Pase VIP de 30 días (ese sigue en la Tienda).
     GET  /api/vip  → { nivel, insignia, progreso:{puntos, siguiente, siguiente_puntos, faltan, pct}, intentos_extra, slots_obra,
                       niveles:[{nivel, puntos, insignia, color, brillo, titulo, intentos_extra, intento_nuevo, slots_obra, slot_nuevo, mensual}],
                       mensual:{disponible, reclamado, contenido, proximo}, regalos:[{id, de, anonimo, nivel, contenido, vence}],
                       ofertas:[{id, producto, nombre, detalle, precio, creditos, entregas, quedan, vence}], ajustes:{anonimo, ocultar_mecenas} }
     POST /api/vip/regalo/reclamar {id} · POST /api/vip/mensual → { entregas }
     GET  /api/mecenas → { lista_semana, lista_siempre, yo:{semana, siempre}, oculto }   (solo nombres, nunca montos)
     POST /api/vip/ajustes {anonimo, ocultar_mecenas}
     /api/estado.vip_nivel y .regalos_pendientes (para la tarjeta sin esperar a /api/vip).
   Tarjeta de Inicio (window.EnVivoInicio, orden 3) solo con sesión: insignia del nivel, avance y cofres por abrir.
   Ventana: avance, cofres, regalo del mes, ofertas, tabla de niveles y Mecenas (con tus preferencias).
   Las ofertas se compran con el botón de la tienda (data-act="comprar", lo maneja ui.js: Pago Plux o Google Play).
   Textos: ES y TRAD[código] aquí mismo, elegido por I18N.idioma (respaldo: español).
   API para otros módulos y pruebas: window.Vip = { tarjeta, clic, abrir, recargar, invalidar, insignia(nivel), color(nivel), T, ES, TRAD }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'vip';
  const VIGENCIA_MS = 5 * 60 * 1000;
  const REINTENTO_MS = 60 * 1000;
  const COLORES = ['#8b95a8', '#c58a4e', '#c9d1dc', '#f2c14e', '#3fd0a4', '#4da3ff', '#a77bff', '#ff5c8a', '#ff8a3d', '#7cf0ff', '#ffd84d'];

  /* ---------- Textos ---------- */
  const ES = {
    tu_vip: 'Tu nivel VIP', vip_n: 'VIP {n}', cargando: 'Cargando tu VIP…',
    sin_nivel: 'Aún sin nivel VIP', sin_nivel_txt: 'Cualquier compra en la tienda te da VIP 1 para siempre. Los regalos de tu asociación son gratis.',
    ver: 'Ventajas', puntos: '{a} / {b} puntos', faltan: 'Te faltan {n} puntos para VIP {s}', maximo: '¡Llegaste al nivel máximo!',
    regalo_de: 'Regalo de {a}', regalo_anonimo: 'Regalo de una productora anónima', regalo_tuyo: 'Tu regalo para la asociación',
    abrir: 'Abrir', abriendo: 'Abriendo…', mas_regalos: '+{n} regalos más', vence: 'Vence el {f}',
    mensual_listo: 'Tu regalo VIP del mes está listo', reclamar: 'Reclamar', oferta_nueva: 'Oferta para ti: {o}',
    'modal.titulo': 'Nivel VIP', 'modal.pase': 'El Pase VIP de 30 días es aparte. Tu nivel VIP es para siempre.',
    'modal.puntos': '$1 en la tienda = 10 puntos VIP',
    'tab.niveles': 'Niveles', 'tab.mecenas': 'Mecenas',
    'sec.regalos': 'Regalos de tu asociación', 'sec.mensual': 'Regalo del mes', 'sec.ofertas': 'Ofertas para ti', 'sec.tabla': 'Ventajas por nivel',
    'regalos.vacio': 'Cuando alguien de tu asociación compra en la tienda, te llega un cofre gratis. Ábrelo dentro de 7 días.',
    'mensual.ya': 'Ya reclamaste el de este mes. El próximo llega el {f}.', 'mensual.sin': 'Desde VIP 1 recibes un regalo gratis cada mes.',
    'oferta.quedan': 'Te quedan {n}', 'oferta.comprar': 'Comprar {p}',
    'perk.insignia': 'Insignia {i} en el chat', 'perk.marco': 'Marco de color para tu productora', 'perk.intento': '+1 intento diario de preparación',
    'perk.obra': '2.º espacio de obra en la Sede', 'perk.mensual': 'Regalo mensual', 'perk.titulo': 'Título: {t}', 'nivel.actual': 'Tu nivel',
    'mec.semana': 'Esta semana', 'mec.siempre': 'Siempre', 'mec.intro': 'Las productoras que más apoyan al juego en tu servidor. Solo se ven nombres, nunca montos.',
    'mec.vacio': 'Todavía nadie en esta lista. ¡Puedes ser la primera!', 'mec.tu_puesto': 'Tu puesto: {n}', 'mec.oculto': 'Elegiste no salir en Mecenas.',
    'aj.titulo': 'Tus preferencias', 'aj.mostrar': 'Salir en el ranking de Mecenas', 'aj.anonimo': 'Mandar mis regalos de asociación sin mi nombre', 'aj.guardado': 'Listo, guardado.',
    'cofre.titulo': '¡Abriste el regalo!', 'cofre.mensual': '¡Tu regalo del mes!', 'cofre.ok': '¡Genial!',
    'item.dinero': '{m} para tu productora', 'item.cable': '{n} × cable', 'item.battery': '{n} × batería', 'item.reparar': 'Todo tu equipo al 100 %', 'item.creditos': '{n} créditos',
    error: 'No se pudo completar. Intenta de nuevo.', cerrar: 'Cerrar', tu: 'Tú',
    'insignia.1': 'Bronce', 'insignia.2': 'Plata', 'insignia.3': 'Oro', 'insignia.4': 'Jade', 'insignia.5': 'Zafiro',
    'insignia.6': 'Amatista', 'insignia.7': 'Rubí', 'insignia.8': 'Fuego', 'insignia.9': 'Diamante', 'insignia.10': 'Leyenda',
    'titulo.1': 'Patrocinador', 'titulo.2': 'Aliado del directo', 'titulo.3': 'Productor asociado', 'titulo.4': 'Productor ejecutivo', 'titulo.5': 'Socio de oro',
    'titulo.6': 'Magnate del directo', 'titulo.7': 'Leyenda de cabina', 'titulo.8': 'Dueño del estudio', 'titulo.9': 'Ícono de la industria', 'titulo.10': 'Mecenas legendario',
  };
  const TRAD = {
    en: {
      tu_vip: 'Your VIP level', vip_n: 'VIP {n}', cargando: 'Loading your VIP…',
      sin_nivel: 'No VIP level yet', sin_nivel_txt: 'Any purchase in the shop gives you VIP 1 forever. Gifts from your association are free.',
      ver: 'Perks', puntos: '{a} / {b} points', faltan: 'You need {n} more points for VIP {s}', maximo: 'You reached the top level!',
      regalo_de: 'Gift from {a}', regalo_anonimo: 'Gift from an anonymous company', regalo_tuyo: 'Your gift to the association',
      abrir: 'Open', abriendo: 'Opening…', mas_regalos: '+{n} more gifts', vence: 'Expires {f}',
      mensual_listo: 'Your monthly VIP gift is ready', reclamar: 'Claim', oferta_nueva: 'Offer for you: {o}',
      'modal.titulo': 'VIP level', 'modal.pase': 'The 30-day VIP Pass is separate. Your VIP level is forever.',
      'modal.puntos': '$1 in the shop = 10 VIP points',
      'tab.niveles': 'Levels', 'tab.mecenas': 'Patrons',
      'sec.regalos': 'Gifts from your association', 'sec.mensual': 'Monthly gift', 'sec.ofertas': 'Offers for you', 'sec.tabla': 'Perks by level',
      'regalos.vacio': 'When someone in your association buys in the shop, you get a free chest. Open it within 7 days.',
      'mensual.ya': 'You already claimed this month’s. The next one arrives on {f}.', 'mensual.sin': 'From VIP 1 you get a free gift every month.',
      'oferta.quedan': '{n} left', 'oferta.comprar': 'Buy {p}',
      'perk.insignia': '{i} badge in chat', 'perk.marco': 'Colored frame for your company', 'perk.intento': '+1 daily prep attempt',
      'perk.obra': '2nd build slot at HQ', 'perk.mensual': 'Monthly gift', 'perk.titulo': 'Title: {t}', 'nivel.actual': 'Your level',
      'mec.semana': 'This week', 'mec.siempre': 'All time', 'mec.intro': 'The companies that support the game the most on your server. Only names are shown, never amounts.',
      'mec.vacio': 'Nobody on this list yet. You could be the first!', 'mec.tu_puesto': 'Your rank: {n}', 'mec.oculto': 'You chose not to appear in Patrons.',
      'aj.titulo': 'Your preferences', 'aj.mostrar': 'Appear in the Patrons ranking', 'aj.anonimo': 'Send my association gifts without my name', 'aj.guardado': 'Done, saved.',
      'cofre.titulo': 'You opened the gift!', 'cofre.mensual': 'Your monthly gift!', 'cofre.ok': 'Awesome!',
      'item.dinero': '{m} for your company', 'item.cable': '{n} × cable', 'item.battery': '{n} × battery', 'item.reparar': 'All your gear at 100%', 'item.creditos': '{n} credits',
      error: 'Couldn’t complete that. Try again.', cerrar: 'Close', tu: 'You',
      'insignia.1': 'Bronze', 'insignia.2': 'Silver', 'insignia.3': 'Gold', 'insignia.4': 'Jade', 'insignia.5': 'Sapphire',
      'insignia.6': 'Amethyst', 'insignia.7': 'Ruby', 'insignia.8': 'Fire', 'insignia.9': 'Diamond', 'insignia.10': 'Legend',
      'titulo.1': 'Sponsor', 'titulo.2': 'Live Ally', 'titulo.3': 'Associate Producer', 'titulo.4': 'Executive Producer', 'titulo.5': 'Gold Partner',
      'titulo.6': 'Broadcast Tycoon', 'titulo.7': 'Control Room Legend', 'titulo.8': 'Studio Owner', 'titulo.9': 'Industry Icon', 'titulo.10': 'Legendary Patron',
    },
    'pt-BR': {
      tu_vip: 'Seu nível VIP', vip_n: 'VIP {n}', cargando: 'Carregando seu VIP…',
      sin_nivel: 'Ainda sem nível VIP', sin_nivel_txt: 'Qualquer compra na loja te dá VIP 1 para sempre. Os presentes da sua associação são grátis.',
      ver: 'Vantagens', puntos: '{a} / {b} pontos', faltan: 'Faltam {n} pontos para o VIP {s}', maximo: 'Você chegou ao nível máximo!',
      regalo_de: 'Presente de {a}', regalo_anonimo: 'Presente de uma produtora anônima', regalo_tuyo: 'Seu presente para a associação',
      abrir: 'Abrir', abriendo: 'Abrindo…', mas_regalos: '+{n} presentes', vence: 'Vence em {f}',
      mensual_listo: 'Seu presente VIP do mês está pronto', reclamar: 'Resgatar', oferta_nueva: 'Oferta para você: {o}',
      'modal.titulo': 'Nível VIP', 'modal.pase': 'O Passe VIP de 30 dias é separado. Seu nível VIP é para sempre.',
      'modal.puntos': 'US$ 1 na loja = 10 pontos VIP',
      'tab.niveles': 'Níveis', 'tab.mecenas': 'Mecenas',
      'sec.regalos': 'Presentes da sua associação', 'sec.mensual': 'Presente do mês', 'sec.ofertas': 'Ofertas para você', 'sec.tabla': 'Vantagens por nível',
      'regalos.vacio': 'Quando alguém da sua associação compra na loja, você ganha um baú grátis. Abra em até 7 dias.',
      'mensual.ya': 'Você já resgatou o deste mês. O próximo chega em {f}.', 'mensual.sin': 'A partir do VIP 1 você ganha um presente grátis todo mês.',
      'oferta.quedan': 'Restam {n}', 'oferta.comprar': 'Comprar {p}',
      'perk.insignia': 'Insígnia {i} no chat', 'perk.marco': 'Moldura colorida para sua produtora', 'perk.intento': '+1 tentativa diária de preparação',
      'perk.obra': '2º espaço de obra na Sede', 'perk.mensual': 'Presente mensal', 'perk.titulo': 'Título: {t}', 'nivel.actual': 'Seu nível',
      'mec.semana': 'Esta semana', 'mec.siempre': 'Sempre', 'mec.intro': 'As produtoras que mais apoiam o jogo no seu servidor. Só aparecem nomes, nunca valores.',
      'mec.vacio': 'Ninguém nesta lista ainda. Você pode ser a primeira!', 'mec.tu_puesto': 'Sua posição: {n}', 'mec.oculto': 'Você escolheu não aparecer em Mecenas.',
      'aj.titulo': 'Suas preferências', 'aj.mostrar': 'Aparecer no ranking de Mecenas', 'aj.anonimo': 'Enviar meus presentes de associação sem meu nome', 'aj.guardado': 'Pronto, salvo.',
      'cofre.titulo': 'Você abriu o presente!', 'cofre.mensual': 'Seu presente do mês!', 'cofre.ok': 'Demais!',
      'item.dinero': '{m} para sua produtora', 'item.cable': '{n} × cabo', 'item.battery': '{n} × bateria', 'item.reparar': 'Todo o seu equipamento a 100%', 'item.creditos': '{n} créditos',
      error: 'Não deu para concluir. Tente de novo.', cerrar: 'Fechar', tu: 'Você',
      'insignia.1': 'Bronze', 'insignia.2': 'Prata', 'insignia.3': 'Ouro', 'insignia.4': 'Jade', 'insignia.5': 'Safira',
      'insignia.6': 'Ametista', 'insignia.7': 'Rubi', 'insignia.8': 'Fogo', 'insignia.9': 'Diamante', 'insignia.10': 'Lenda',
      'titulo.1': 'Patrocinador', 'titulo.2': 'Aliado do ao vivo', 'titulo.3': 'Produtor associado', 'titulo.4': 'Produtor executivo', 'titulo.5': 'Sócio de ouro',
      'titulo.6': 'Magnata do ao vivo', 'titulo.7': 'Lenda da cabine', 'titulo.8': 'Dono do estúdio', 'titulo.9': 'Ícone da indústria', 'titulo.10': 'Mecenas lendário',
    },
    fr: {
      tu_vip: 'Ton niveau VIP', vip_n: 'VIP {n}', cargando: 'Chargement de ton VIP…',
      sin_nivel: 'Pas encore de niveau VIP', sin_nivel_txt: 'N’importe quel achat en boutique te donne le VIP 1 pour toujours. Les cadeaux de ton association sont gratuits.',
      ver: 'Avantages', puntos: '{a} / {b} points', faltan: 'Il te manque {n} points pour le VIP {s}', maximo: 'Tu as atteint le niveau maximum !',
      regalo_de: 'Cadeau de {a}', regalo_anonimo: 'Cadeau d’une boîte de prod anonyme', regalo_tuyo: 'Ton cadeau pour l’association',
      abrir: 'Ouvrir', abriendo: 'Ouverture…', mas_regalos: '+{n} cadeaux', vence: 'Expire le {f}',
      mensual_listo: 'Ton cadeau VIP du mois est prêt', reclamar: 'Récupérer', oferta_nueva: 'Offre pour toi : {o}',
      'modal.titulo': 'Niveau VIP', 'modal.pase': 'Le Pass VIP de 30 jours est à part. Ton niveau VIP est pour toujours.',
      'modal.puntos': '1 $ en boutique = 10 points VIP',
      'tab.niveles': 'Niveaux', 'tab.mecenas': 'Mécènes',
      'sec.regalos': 'Cadeaux de ton association', 'sec.mensual': 'Cadeau du mois', 'sec.ofertas': 'Offres pour toi', 'sec.tabla': 'Avantages par niveau',
      'regalos.vacio': 'Quand quelqu’un de ton association achète en boutique, tu reçois un coffre gratuit. Ouvre-le sous 7 jours.',
      'mensual.ya': 'Tu as déjà récupéré celui de ce mois. Le prochain arrive le {f}.', 'mensual.sin': 'Dès le VIP 1, tu reçois un cadeau gratuit chaque mois.',
      'oferta.quedan': 'Il en reste {n}', 'oferta.comprar': 'Acheter {p}',
      'perk.insignia': 'Badge {i} dans le chat', 'perk.marco': 'Cadre coloré pour ta boîte de prod', 'perk.intento': '+1 essai de préparation par jour',
      'perk.obra': '2e emplacement de chantier au Siège', 'perk.mensual': 'Cadeau mensuel', 'perk.titulo': 'Titre : {t}', 'nivel.actual': 'Ton niveau',
      'mec.semana': 'Cette semaine', 'mec.siempre': 'Depuis toujours', 'mec.intro': 'Les boîtes de prod qui soutiennent le plus le jeu sur ton serveur. Seuls les noms s’affichent, jamais les montants.',
      'mec.vacio': 'Personne dans cette liste pour l’instant. Tu peux être la première !', 'mec.tu_puesto': 'Ta place : {n}', 'mec.oculto': 'Tu as choisi de ne pas apparaître dans les Mécènes.',
      'aj.titulo': 'Tes préférences', 'aj.mostrar': 'Apparaître dans le classement des Mécènes', 'aj.anonimo': 'Envoyer mes cadeaux d’association sans mon nom', 'aj.guardado': 'C’est enregistré.',
      'cofre.titulo': 'Tu as ouvert le cadeau !', 'cofre.mensual': 'Ton cadeau du mois !', 'cofre.ok': 'Génial !',
      'item.dinero': '{m} pour ta boîte de prod', 'item.cable': '{n} × câble', 'item.battery': '{n} × batterie', 'item.reparar': 'Tout ton matériel à 100 %', 'item.creditos': '{n} crédits',
      error: 'Impossible de terminer. Réessaie.', cerrar: 'Fermer', tu: 'Toi',
      'insignia.1': 'Bronze', 'insignia.2': 'Argent', 'insignia.3': 'Or', 'insignia.4': 'Jade', 'insignia.5': 'Saphir',
      'insignia.6': 'Améthyste', 'insignia.7': 'Rubis', 'insignia.8': 'Feu', 'insignia.9': 'Diamant', 'insignia.10': 'Légende',
      'titulo.1': 'Sponsor', 'titulo.2': 'Allié du direct', 'titulo.3': 'Producteur associé', 'titulo.4': 'Producteur exécutif', 'titulo.5': 'Partenaire or',
      'titulo.6': 'Magnat du direct', 'titulo.7': 'Légende de la régie', 'titulo.8': 'Patron du studio', 'titulo.9': 'Icône de l’industrie', 'titulo.10': 'Mécène légendaire',
    },
    de: {
      tu_vip: 'Dein VIP-Level', vip_n: 'VIP {n}', cargando: 'Dein VIP wird geladen…',
      sin_nivel: 'Noch kein VIP-Level', sin_nivel_txt: 'Jeder Kauf im Shop gibt dir VIP 1 für immer. Geschenke deiner Vereinigung sind gratis.',
      ver: 'Vorteile', puntos: '{a} / {b} Punkte', faltan: 'Dir fehlen {n} Punkte bis VIP {s}', maximo: 'Du hast das höchste Level erreicht!',
      regalo_de: 'Geschenk von {a}', regalo_anonimo: 'Geschenk einer anonymen Produktionsfirma', regalo_tuyo: 'Dein Geschenk für die Vereinigung',
      abrir: 'Öffnen', abriendo: 'Wird geöffnet…', mas_regalos: '+{n} weitere Geschenke', vence: 'Läuft ab am {f}',
      mensual_listo: 'Dein VIP-Geschenk des Monats ist bereit', reclamar: 'Abholen', oferta_nueva: 'Angebot für dich: {o}',
      'modal.titulo': 'VIP-Level', 'modal.pase': 'Der 30-Tage-VIP-Pass ist etwas anderes. Dein VIP-Level bleibt für immer.',
      'modal.puntos': '1 $ im Shop = 10 VIP-Punkte',
      'tab.niveles': 'Level', 'tab.mecenas': 'Mäzene',
      'sec.regalos': 'Geschenke deiner Vereinigung', 'sec.mensual': 'Geschenk des Monats', 'sec.ofertas': 'Angebote für dich', 'sec.tabla': 'Vorteile pro Level',
      'regalos.vacio': 'Wenn jemand aus deiner Vereinigung im Shop kauft, bekommst du eine Gratis-Truhe. Öffne sie innerhalb von 7 Tagen.',
      'mensual.ya': 'Du hast das von diesem Monat schon abgeholt. Das nächste kommt am {f}.', 'mensual.sin': 'Ab VIP 1 bekommst du jeden Monat ein Gratis-Geschenk.',
      'oferta.quedan': 'Noch {n}', 'oferta.comprar': 'Kaufen {p}',
      'perk.insignia': 'Abzeichen {i} im Chat', 'perk.marco': 'Farbiger Rahmen für deine Firma', 'perk.intento': '+1 täglicher Vorbereitungsversuch',
      'perk.obra': '2. Bauplatz im Hauptsitz', 'perk.mensual': 'Monatsgeschenk', 'perk.titulo': 'Titel: {t}', 'nivel.actual': 'Dein Level',
      'mec.semana': 'Diese Woche', 'mec.siempre': 'Gesamt', 'mec.intro': 'Die Firmen, die das Spiel auf deinem Server am meisten unterstützen. Nur Namen, nie Beträge.',
      'mec.vacio': 'Noch niemand auf dieser Liste. Du kannst die Erste sein!', 'mec.tu_puesto': 'Dein Platz: {n}', 'mec.oculto': 'Du erscheinst nicht bei den Mäzenen.',
      'aj.titulo': 'Deine Einstellungen', 'aj.mostrar': 'In der Mäzene-Rangliste erscheinen', 'aj.anonimo': 'Meine Vereinigungsgeschenke ohne meinen Namen senden', 'aj.guardado': 'Fertig, gespeichert.',
      'cofre.titulo': 'Du hast das Geschenk geöffnet!', 'cofre.mensual': 'Dein Geschenk des Monats!', 'cofre.ok': 'Super!',
      'item.dinero': '{m} für deine Firma', 'item.cable': '{n} × Kabel', 'item.battery': '{n} × Akku', 'item.reparar': 'Deine ganze Ausrüstung auf 100 %', 'item.creditos': '{n} Credits',
      error: 'Das hat nicht geklappt. Versuch es nochmal.', cerrar: 'Schließen', tu: 'Du',
      'insignia.1': 'Bronze', 'insignia.2': 'Silber', 'insignia.3': 'Gold', 'insignia.4': 'Jade', 'insignia.5': 'Saphir',
      'insignia.6': 'Amethyst', 'insignia.7': 'Rubin', 'insignia.8': 'Feuer', 'insignia.9': 'Diamant', 'insignia.10': 'Legende',
      'titulo.1': 'Sponsor', 'titulo.2': 'Live-Verbündeter', 'titulo.3': 'Co-Produzent', 'titulo.4': 'Ausführender Produzent', 'titulo.5': 'Gold-Partner',
      'titulo.6': 'Live-Magnat', 'titulo.7': 'Regie-Legende', 'titulo.8': 'Studiobesitzer', 'titulo.9': 'Branchen-Ikone', 'titulo.10': 'Legendärer Mäzen',
    },
    it: {
      tu_vip: 'Il tuo livello VIP', vip_n: 'VIP {n}', cargando: 'Caricamento del tuo VIP…',
      sin_nivel: 'Ancora nessun livello VIP', sin_nivel_txt: 'Qualsiasi acquisto nel negozio ti dà il VIP 1 per sempre. I regali della tua associazione sono gratis.',
      ver: 'Vantaggi', puntos: '{a} / {b} punti', faltan: 'Ti mancano {n} punti per il VIP {s}', maximo: 'Hai raggiunto il livello massimo!',
      regalo_de: 'Regalo da {a}', regalo_anonimo: 'Regalo da una casa di produzione anonima', regalo_tuyo: 'Il tuo regalo per l’associazione',
      abrir: 'Apri', abriendo: 'Apertura…', mas_regalos: '+{n} regali', vence: 'Scade il {f}',
      mensual_listo: 'Il tuo regalo VIP del mese è pronto', reclamar: 'Riscatta', oferta_nueva: 'Offerta per te: {o}',
      'modal.titulo': 'Livello VIP', 'modal.pase': 'Il Pass VIP di 30 giorni è a parte. Il tuo livello VIP è per sempre.',
      'modal.puntos': '1 $ nel negozio = 10 punti VIP',
      'tab.niveles': 'Livelli', 'tab.mecenas': 'Mecenati',
      'sec.regalos': 'Regali della tua associazione', 'sec.mensual': 'Regalo del mese', 'sec.ofertas': 'Offerte per te', 'sec.tabla': 'Vantaggi per livello',
      'regalos.vacio': 'Quando qualcuno della tua associazione compra nel negozio, ricevi un forziere gratis. Aprilo entro 7 giorni.',
      'mensual.ya': 'Hai già riscattato quello di questo mese. Il prossimo arriva il {f}.', 'mensual.sin': 'Dal VIP 1 ricevi un regalo gratis ogni mese.',
      'oferta.quedan': 'Ne restano {n}', 'oferta.comprar': 'Compra {p}',
      'perk.insignia': 'Distintivo {i} in chat', 'perk.marco': 'Cornice colorata per la tua casa di produzione', 'perk.intento': '+1 tentativo di preparazione al giorno',
      'perk.obra': '2° spazio cantiere nella Sede', 'perk.mensual': 'Regalo mensile', 'perk.titulo': 'Titolo: {t}', 'nivel.actual': 'Il tuo livello',
      'mec.semana': 'Questa settimana', 'mec.siempre': 'Sempre', 'mec.intro': 'Le case di produzione che sostengono di più il gioco sul tuo server. Si vedono solo i nomi, mai gli importi.',
      'mec.vacio': 'Ancora nessuno in questa lista. Puoi essere la prima!', 'mec.tu_puesto': 'La tua posizione: {n}', 'mec.oculto': 'Hai scelto di non comparire tra i Mecenati.',
      'aj.titulo': 'Le tue preferenze', 'aj.mostrar': 'Comparire nella classifica dei Mecenati', 'aj.anonimo': 'Inviare i miei regali di associazione senza il mio nome', 'aj.guardado': 'Fatto, salvato.',
      'cofre.titulo': 'Hai aperto il regalo!', 'cofre.mensual': 'Il tuo regalo del mese!', 'cofre.ok': 'Fantastico!',
      'item.dinero': '{m} per la tua casa di produzione', 'item.cable': '{n} × cavo', 'item.battery': '{n} × batteria', 'item.reparar': 'Tutta la tua attrezzatura al 100%', 'item.creditos': '{n} crediti',
      error: 'Non è stato possibile completare. Riprova.', cerrar: 'Chiudi', tu: 'Tu',
      'insignia.1': 'Bronzo', 'insignia.2': 'Argento', 'insignia.3': 'Oro', 'insignia.4': 'Giada', 'insignia.5': 'Zaffiro',
      'insignia.6': 'Ametista', 'insignia.7': 'Rubino', 'insignia.8': 'Fuoco', 'insignia.9': 'Diamante', 'insignia.10': 'Leggenda',
      'titulo.1': 'Sponsor', 'titulo.2': 'Alleato della diretta', 'titulo.3': 'Produttore associato', 'titulo.4': 'Produttore esecutivo', 'titulo.5': 'Socio d’oro',
      'titulo.6': 'Magnate della diretta', 'titulo.7': 'Leggenda della regia', 'titulo.8': 'Padrone dello studio', 'titulo.9': 'Icona del settore', 'titulo.10': 'Mecenate leggendario',
    },
    ru: {
      tu_vip: 'Твой VIP-уровень', vip_n: 'VIP {n}', cargando: 'Загружаем твой VIP…',
      sin_nivel: 'Пока без VIP-уровня', sin_nivel_txt: 'Любая покупка в магазине навсегда даёт тебе VIP 1. Подарки от твоей ассоциации бесплатные.',
      ver: 'Бонусы', puntos: '{a} / {b} очков', faltan: 'До VIP {s} осталось {n} очков', maximo: 'Ты достиг максимального уровня!',
      regalo_de: 'Подарок от {a}', regalo_anonimo: 'Подарок от анонимной продакшн-компании', regalo_tuyo: 'Твой подарок для ассоциации',
      abrir: 'Открыть', abriendo: 'Открываем…', mas_regalos: 'Ещё подарков: {n}', vence: 'Истекает {f}',
      mensual_listo: 'Твой VIP-подарок месяца готов', reclamar: 'Забрать', oferta_nueva: 'Предложение для тебя: {o}',
      'modal.titulo': 'VIP-уровень', 'modal.pase': 'VIP-пропуск на 30 дней — это отдельно. Твой VIP-уровень остаётся навсегда.',
      'modal.puntos': '1 $ в магазине = 10 VIP-очков',
      'tab.niveles': 'Уровни', 'tab.mecenas': 'Меценаты',
      'sec.regalos': 'Подарки от твоей ассоциации', 'sec.mensual': 'Подарок месяца', 'sec.ofertas': 'Предложения для тебя', 'sec.tabla': 'Бонусы по уровням',
      'regalos.vacio': 'Когда кто-то из твоей ассоциации покупает в магазине, ты получаешь бесплатный сундук. Открой его в течение 7 дней.',
      'mensual.ya': 'Ты уже забрал подарок этого месяца. Следующий будет {f}.', 'mensual.sin': 'С VIP 1 ты получаешь бесплатный подарок каждый месяц.',
      'oferta.quedan': 'Осталось: {n}', 'oferta.comprar': 'Купить {p}',
      'perk.insignia': 'Значок «{i}» в чате', 'perk.marco': 'Цветная рамка для твоей компании', 'perk.intento': '+1 попытка подготовки в день',
      'perk.obra': '2-е место для стройки в Штабе', 'perk.mensual': 'Ежемесячный подарок', 'perk.titulo': 'Титул: {t}', 'nivel.actual': 'Твой уровень',
      'mec.semana': 'На этой неделе', 'mec.siempre': 'За всё время', 'mec.intro': 'Компании, которые больше всех поддерживают игру на твоём сервере. Видны только имена, никаких сумм.',
      'mec.vacio': 'В этом списке пока никого. Ты можешь стать первым!', 'mec.tu_puesto': 'Твоё место: {n}', 'mec.oculto': 'Ты решил не показываться среди меценатов.',
      'aj.titulo': 'Твои настройки', 'aj.mostrar': 'Показывать меня в рейтинге меценатов', 'aj.anonimo': 'Отправлять мои подарки ассоциации без имени', 'aj.guardado': 'Готово, сохранено.',
      'cofre.titulo': 'Ты открыл подарок!', 'cofre.mensual': 'Твой подарок месяца!', 'cofre.ok': 'Супер!',
      'item.dinero': '{m} для твоей компании', 'item.cable': '{n} × кабель', 'item.battery': '{n} × аккумулятор', 'item.reparar': 'Всё твоё оборудование на 100 %', 'item.creditos': '{n} кредитов',
      error: 'Не получилось. Попробуй ещё раз.', cerrar: 'Закрыть', tu: 'Ты',
      'insignia.1': 'Бронза', 'insignia.2': 'Серебро', 'insignia.3': 'Золото', 'insignia.4': 'Нефрит', 'insignia.5': 'Сапфир',
      'insignia.6': 'Аметист', 'insignia.7': 'Рубин', 'insignia.8': 'Огонь', 'insignia.9': 'Бриллиант', 'insignia.10': 'Легенда',
      'titulo.1': 'Спонсор', 'titulo.2': 'Союзник эфира', 'titulo.3': 'Ассоциированный продюсер', 'titulo.4': 'Исполнительный продюсер', 'titulo.5': 'Золотой партнёр',
      'titulo.6': 'Магнат прямого эфира', 'titulo.7': 'Легенда аппаратной', 'titulo.8': 'Владелец студии', 'titulo.9': 'Икона индустрии', 'titulo.10': 'Легендарный меценат',
    },
    tr: {
      tu_vip: 'VIP seviyen', vip_n: 'VIP {n}', cargando: 'VIP bilgilerin yükleniyor…',
      sin_nivel: 'Henüz VIP seviyen yok', sin_nivel_txt: 'Mağazadaki herhangi bir satın alma sana sonsuza kadar VIP 1 verir. Derneğinden gelen hediyeler ücretsiz.',
      ver: 'Avantajlar', puntos: '{a} / {b} puan', faltan: 'VIP {s} için {n} puan kaldı', maximo: 'En yüksek seviyeye ulaştın!',
      regalo_de: '{a} gönderdi', regalo_anonimo: 'Anonim bir yapım şirketinden hediye', regalo_tuyo: 'Derneğe hediyen',
      abrir: 'Aç', abriendo: 'Açılıyor…', mas_regalos: '+{n} hediye daha', vence: 'Son gün: {f}',
      mensual_listo: 'Bu ayın VIP hediyen hazır', reclamar: 'Al', oferta_nueva: 'Sana özel teklif: {o}',
      'modal.titulo': 'VIP seviyesi', 'modal.pase': '30 günlük VIP Pass ayrı bir şey. VIP seviyen sonsuza kadar senin.',
      'modal.puntos': 'Mağazada 1 $ = 10 VIP puanı',
      'tab.niveles': 'Seviyeler', 'tab.mecenas': 'Hamiler',
      'sec.regalos': 'Derneğinden hediyeler', 'sec.mensual': 'Ayın hediyesi', 'sec.ofertas': 'Sana özel teklifler', 'sec.tabla': 'Seviyelere göre avantajlar',
      'regalos.vacio': 'Derneğinden biri mağazadan alışveriş yaptığında sana ücretsiz bir sandık gelir. 7 gün içinde aç.',
      'mensual.ya': 'Bu ayınkini zaten aldın. Sonraki {f} tarihinde gelir.', 'mensual.sin': 'VIP 1’den itibaren her ay ücretsiz bir hediye alırsın.',
      'oferta.quedan': '{n} kaldı', 'oferta.comprar': 'Satın al {p}',
      'perk.insignia': 'Sohbette {i} rozeti', 'perk.marco': 'Şirketin için renkli çerçeve', 'perk.intento': 'Günde +1 hazırlık denemesi',
      'perk.obra': 'Merkezde 2. inşaat alanı', 'perk.mensual': 'Aylık hediye', 'perk.titulo': 'Unvan: {t}', 'nivel.actual': 'Seviyen',
      'mec.semana': 'Bu hafta', 'mec.siempre': 'Tüm zamanlar', 'mec.intro': 'Sunucunda oyunu en çok destekleyen yapım şirketleri. Sadece isimler görünür, asla tutarlar.',
      'mec.vacio': 'Bu listede henüz kimse yok. İlk sen olabilirsin!', 'mec.tu_puesto': 'Sıran: {n}', 'mec.oculto': 'Hamiler listesinde görünmemeyi seçtin.',
      'aj.titulo': 'Tercihlerin', 'aj.mostrar': 'Hamiler sıralamasında görün', 'aj.anonimo': 'Dernek hediyelerimi adım olmadan gönder', 'aj.guardado': 'Tamam, kaydedildi.',
      'cofre.titulo': 'Hediyeyi açtın!', 'cofre.mensual': 'Ayın hediyen!', 'cofre.ok': 'Harika!',
      'item.dinero': 'Şirketin için {m}', 'item.cable': '{n} × kablo', 'item.battery': '{n} × batarya', 'item.reparar': 'Tüm ekipmanın %100', 'item.creditos': '{n} kredi',
      error: 'Tamamlanamadı. Tekrar dene.', cerrar: 'Kapat', tu: 'Sen',
      'insignia.1': 'Bronz', 'insignia.2': 'Gümüş', 'insignia.3': 'Altın', 'insignia.4': 'Yeşim', 'insignia.5': 'Safir',
      'insignia.6': 'Ametist', 'insignia.7': 'Yakut', 'insignia.8': 'Ateş', 'insignia.9': 'Elmas', 'insignia.10': 'Efsane',
      'titulo.1': 'Sponsor', 'titulo.2': 'Canlı yayın dostu', 'titulo.3': 'Ortak yapımcı', 'titulo.4': 'Baş yapımcı', 'titulo.5': 'Altın ortak',
      'titulo.6': 'Canlı yayın patronu', 'titulo.7': 'Reji efsanesi', 'titulo.8': 'Stüdyo sahibi', 'titulo.9': 'Sektör ikonu', 'titulo.10': 'Efsanevi hami',
    },
    id: {
      tu_vip: 'Level VIP kamu', vip_n: 'VIP {n}', cargando: 'Memuat VIP kamu…',
      sin_nivel: 'Belum punya level VIP', sin_nivel_txt: 'Pembelian apa pun di toko memberimu VIP 1 selamanya. Hadiah dari asosiasimu gratis.',
      ver: 'Keuntungan', puntos: '{a} / {b} poin', faltan: 'Butuh {n} poin lagi untuk VIP {s}', maximo: 'Kamu sudah di level tertinggi!',
      regalo_de: 'Hadiah dari {a}', regalo_anonimo: 'Hadiah dari rumah produksi anonim', regalo_tuyo: 'Hadiahmu untuk asosiasi',
      abrir: 'Buka', abriendo: 'Membuka…', mas_regalos: '+{n} hadiah lagi', vence: 'Berakhir {f}',
      mensual_listo: 'Hadiah VIP bulan ini sudah siap', reclamar: 'Ambil', oferta_nueva: 'Penawaran untukmu: {o}',
      'modal.titulo': 'Level VIP', 'modal.pase': 'VIP Pass 30 hari itu terpisah. Level VIP kamu berlaku selamanya.',
      'modal.puntos': '$1 di toko = 10 poin VIP',
      'tab.niveles': 'Level', 'tab.mecenas': 'Donatur',
      'sec.regalos': 'Hadiah dari asosiasimu', 'sec.mensual': 'Hadiah bulan ini', 'sec.ofertas': 'Penawaran untukmu', 'sec.tabla': 'Keuntungan per level',
      'regalos.vacio': 'Saat anggota asosiasimu membeli di toko, kamu dapat peti gratis. Buka dalam 7 hari.',
      'mensual.ya': 'Kamu sudah mengambil hadiah bulan ini. Berikutnya datang {f}.', 'mensual.sin': 'Mulai VIP 1 kamu dapat hadiah gratis tiap bulan.',
      'oferta.quedan': 'Sisa {n}', 'oferta.comprar': 'Beli {p}',
      'perk.insignia': 'Lencana {i} di chat', 'perk.marco': 'Bingkai warna untuk rumah produksimu', 'perk.intento': '+1 percobaan persiapan per hari',
      'perk.obra': 'Slot pembangunan ke-2 di Markas', 'perk.mensual': 'Hadiah bulanan', 'perk.titulo': 'Gelar: {t}', 'nivel.actual': 'Level kamu',
      'mec.semana': 'Minggu ini', 'mec.siempre': 'Sepanjang masa', 'mec.intro': 'Rumah produksi yang paling mendukung game di servermu. Hanya nama yang tampil, tidak pernah jumlahnya.',
      'mec.vacio': 'Belum ada siapa pun di daftar ini. Kamu bisa jadi yang pertama!', 'mec.tu_puesto': 'Peringkatmu: {n}', 'mec.oculto': 'Kamu memilih tidak tampil di Donatur.',
      'aj.titulo': 'Preferensimu', 'aj.mostrar': 'Tampil di peringkat Donatur', 'aj.anonimo': 'Kirim hadiah asosiasiku tanpa namaku', 'aj.guardado': 'Beres, tersimpan.',
      'cofre.titulo': 'Kamu membuka hadiah!', 'cofre.mensual': 'Hadiah bulananmu!', 'cofre.ok': 'Mantap!',
      'item.dinero': '{m} untuk rumah produksimu', 'item.cable': '{n} × kabel', 'item.battery': '{n} × baterai', 'item.reparar': 'Semua peralatanmu 100%', 'item.creditos': '{n} kredit',
      error: 'Tidak bisa diselesaikan. Coba lagi.', cerrar: 'Tutup', tu: 'Kamu',
      'insignia.1': 'Perunggu', 'insignia.2': 'Perak', 'insignia.3': 'Emas', 'insignia.4': 'Giok', 'insignia.5': 'Safir',
      'insignia.6': 'Ametis', 'insignia.7': 'Rubi', 'insignia.8': 'Api', 'insignia.9': 'Berlian', 'insignia.10': 'Legenda',
      'titulo.1': 'Sponsor', 'titulo.2': 'Sekutu siaran langsung', 'titulo.3': 'Produser rekanan', 'titulo.4': 'Produser eksekutif', 'titulo.5': 'Mitra emas',
      'titulo.6': 'Raja siaran langsung', 'titulo.7': 'Legenda ruang kontrol', 'titulo.8': 'Pemilik studio', 'titulo.9': 'Ikon industri', 'titulo.10': 'Donatur legendaris',
    },
    'zh-CN': {
      tu_vip: '你的 VIP 等级', vip_n: 'VIP {n}', cargando: '正在加载你的 VIP…',
      sin_nivel: '还没有 VIP 等级', sin_nivel_txt: '在商店任意消费一次，就能永久获得 VIP 1。来自协会的礼物都是免费的。',
      ver: '特权', puntos: '{a} / {b} 点', faltan: '再获得 {n} 点即可升到 VIP {s}', maximo: '你已达到最高等级！',
      regalo_de: '来自 {a} 的礼物', regalo_anonimo: '来自匿名制作公司的礼物', regalo_tuyo: '你送给协会的礼物',
      abrir: '打开', abriendo: '正在打开…', mas_regalos: '还有 {n} 份礼物', vence: '{f} 到期',
      mensual_listo: '本月的 VIP 礼物已就绪', reclamar: '领取', oferta_nueva: '你的专属优惠：{o}',
      'modal.titulo': 'VIP 等级', 'modal.pase': '30 天 VIP 通行证是另外的。你的 VIP 等级永久有效。',
      'modal.puntos': '商店消费 1 美元 = 10 VIP 点',
      'tab.niveles': '等级', 'tab.mecenas': '赞助榜',
      'sec.regalos': '协会礼物', 'sec.mensual': '本月礼物', 'sec.ofertas': '你的专属优惠', 'sec.tabla': '各等级特权',
      'regalos.vacio': '协会里有人在商店消费时，你会收到一个免费宝箱。请在 7 天内打开。',
      'mensual.ya': '本月的礼物你已经领取了。下一份将在 {f} 送达。', 'mensual.sin': '从 VIP 1 起，你每个月都能领一份免费礼物。',
      'oferta.quedan': '剩余 {n} 次', 'oferta.comprar': '购买 {p}',
      'perk.insignia': '聊天中的{i}徽章', 'perk.marco': '你的制作公司专属彩色边框', 'perk.intento': '每天 +1 次备赛机会',
      'perk.obra': '总部第 2 个施工位', 'perk.mensual': '每月礼物', 'perk.titulo': '称号：{t}', 'nivel.actual': '你的等级',
      'mec.semana': '本周', 'mec.siempre': '总榜', 'mec.intro': '你所在服务器中最支持游戏的制作公司。只显示名字，从不显示金额。',
      'mec.vacio': '这个榜单还没有人。你可以成为第一个！', 'mec.tu_puesto': '你的排名：{n}', 'mec.oculto': '你选择了不在赞助榜上显示。',
      'aj.titulo': '你的偏好', 'aj.mostrar': '在赞助榜上显示我', 'aj.anonimo': '匿名发送我的协会礼物', 'aj.guardado': '好了，已保存。',
      'cofre.titulo': '你打开了礼物！', 'cofre.mensual': '你的本月礼物！', 'cofre.ok': '太棒了！',
      'item.dinero': '给你的制作公司 {m}', 'item.cable': '{n} × 线缆', 'item.battery': '{n} × 电池', 'item.reparar': '所有设备恢复到 100%', 'item.creditos': '{n} 积分',
      error: '没能完成，请再试一次。', cerrar: '关闭', tu: '你',
      'insignia.1': '青铜', 'insignia.2': '白银', 'insignia.3': '黄金', 'insignia.4': '翡翠', 'insignia.5': '蓝宝石',
      'insignia.6': '紫水晶', 'insignia.7': '红宝石', 'insignia.8': '烈焰', 'insignia.9': '钻石', 'insignia.10': '传奇',
      'titulo.1': '赞助人', 'titulo.2': '直播盟友', 'titulo.3': '联合制片人', 'titulo.4': '执行制片人', 'titulo.5': '黄金合伙人',
      'titulo.6': '直播大亨', 'titulo.7': '导播间传奇', 'titulo.8': '演播室老板', 'titulo.9': '行业偶像', 'titulo.10': '传奇赞助人',
    },
  };

  const LOCALES = { es: 'es-EC', en: 'en-US', 'pt-BR': 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', 'zh-CN': 'zh-CN' };
  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { return 'es'; } };
  function T(k, p) {
    const d = TRAD[idioma()] || ES;
    const t = d[k] !== undefined ? d[k] : (ES[k] !== undefined ? ES[k] : k);
    return String(t).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined && p[x] !== null ? p[x] : m));
  }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const loc = () => LOCALES[idioma()] || 'es-EC';
  const num = (n) => { try { return Number(n || 0).toLocaleString(loc()); } catch (e) { return String(n || 0); } };
  const precio = (v) => { try { return '$' + Number(v || 0).toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return '$' + Number(v || 0).toFixed(2); } };
  const TL = (t) => { try { return root.I18N && root.I18N.TL ? root.I18N.TL(t) : t; } catch (e) { return t; } };
  /** Ofertas que se pueden comprar en este canal, cada una con su precio real (`valor`). */
  const ofertasVendibles = (d) => ((d && d.ofertas) || []).map((o) => Object.assign({}, o, { valor: precioDe(o.producto, o.precio) })).filter((o) => o.valor);
  /** Precio REAL de un producto: el que da ui.js (ctx.precio → Google Play dentro de la app, Pago Plux en la web).
      null = no se vende en este canal (la oferta no sale). Sin ctx.precio: solo fuera de la app, con el precio del servidor. */
  function precioDe(id, usd) {
    const c = st.ctx;
    try { if (c && typeof c.precio === 'function') { const v = c.precio(id, usd); return v ? String(v) : null; } } catch (e) { return null; }
    try { if (root.GooglePlay && root.GooglePlay.enApp && root.GooglePlay.enApp()) return null; } catch (e) { return null; }
    return usd !== undefined && usd !== null && isFinite(Number(usd)) ? precio(usd) : null;
  }
  function fecha(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    try { return d.toLocaleDateString(loc(), { day: 'numeric', month: 'long' }); } catch (e) { return d.toISOString().slice(0, 10); }
  }
  const color = (n) => COLORES[Math.max(0, Math.min(10, Number(n) || 0))];

  /* ---------- Estado ---------- */
  const st = { ctx: null, datos: null, pedidoEn: 0, cargando: false, error: false, ocupado: false, vista: 'niveles', mecTab: 'semana', mec: null, mecCargando: false, conteo: null };
  const Api = () => root.Api || null;
  const logueado = () => { try { const a = Api(); return !!(a && a.disponible !== false && a.logueado && a.logueado()); } catch (e) { return false; } };
  const estadoApi = () => { try { return (Api() && Api().estado) || null; } catch (e) { return null; } };

  async function pedir(method, ruta, body) {
    const h = { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': idioma() };
    const r = await fetch(ruta, { method, headers: h, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || typeof j !== 'object') throw new Error(T('error'));
    if (!r.ok || j.ok === false) {
      let msg = j.error ? TL(j.error) : T('error');
      try { if (j.codigo && root.I18N && root.I18N.T && root.I18N.T.has && root.I18N.T.has('error.' + j.codigo)) { const t = root.I18N.T('error.' + j.codigo, j); if (!/\{\w+\}/.test(t)) msg = t; } } catch (e) { /* español */ }
      const err = new Error(msg); err.codigo = j.codigo || null; err.status = r.status; throw err;
    }
    return j;
  }
  function repintar() { try { if (st.ctx && st.ctx.render) st.ctx.render(); } catch (e) { /* nada */ } }
  function modalAbierto() { try { const m = root.document.querySelector('#overlay.on [data-vip="modal"]'); return !!m; } catch (e) { return false; } }

  async function recargar() {
    if (st.cargando || !logueado()) return st.datos;
    st.cargando = true;
    try {
      st.datos = await pedir('GET', '/api/vip');
      st.error = false;
    } catch (e) {
      st.error = true;
    } finally {
      st.cargando = false;
      st.pedidoEn = Date.now();
      const e = estadoApi();
      st.conteo = e ? e.regalos_pendientes : null;
    }
    repintar();
    if (modalAbierto() && st.ctx) abrirModal(st.ctx);
    return st.datos;
  }
  function invalidar() { st.datos = null; st.pedidoEn = 0; st.error = false; st.mec = null; }
  function hayQuePedir() {
    if (st.cargando) return false;
    if (!st.pedidoEn) return true;
    const e = estadoApi();
    if (e && typeof e.regalos_pendientes === 'number' && st.conteo !== null && e.regalos_pendientes !== st.conteo) return true;   // llegó un cofre nuevo
    const edad = Date.now() - st.pedidoEn;
    return st.error ? edad > REINTENTO_MS : edad > VIGENCIA_MS;
  }

  /* ---------- Piezas ---------- */
  const svg = (body, cls, s) => `<svg class="${cls || 'vip-ico'}" width="${s || 18}" height="${s || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const icoCorona = (s) => svg('<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/>', 'vip-ico', s || 18);
  const icoCofre = (s) => svg('<rect x="3" y="10" width="18" height="10" rx="2"/><path d="M3 10a9 5 0 0 1 18 0"/><path d="M12 12v4"/><path d="M3 14h18"/>', 'vip-ico', s || 18);
  const icoRegalo = (s) => svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8c-2-4-6-3-5 0M12 8c2-4 6-3 5 0"/>', 'vip-ico', s || 18);
  const icoOk = () => svg('<path d="M5 12.5l4 4L19 7"/>', 'vip-ico xs', 14);

  /** Insignia del nivel (también para el chat y otras listas): <span class="vip-ins">V3</span>. Vacía sin nivel. */
  function insignia(n, grande) {
    n = Number(n) || 0;
    if (n < 1) return '';
    css();
    return `<span class="vip-ins${grande ? ' g' : ''}${n >= 7 ? ' brillo' : ''}" style="--vc:${color(n)}" title="${esc(T('vip_n', { n }) + ' · ' + T('insignia.' + n))}">${icoCorona(grande ? 16 : 11)}<b>${n}</b></span>`;
  }
  function nombreItem(e) {
    const n = Number(e.cantidad) || 1;
    const M = (st.ctx && (st.ctx.M || st.ctx.money)) || ((x) => '$' + num(x));
    switch (e.tipo) {
      case 'dinero': return T('item.dinero', { m: M(n) });
      case 'consumible': return T(e.item === 'battery' ? 'item.battery' : 'item.cable', { n: num(n) });
      case 'reparar_todo': return T('item.reparar');
      default: return e.item || e.tipo;
    }
  }
  const listaItems = (lista, cls) => `<ul class="vip-items ${cls || ''}">${(lista || []).map((e, i) => `<li style="--i:${i}">${icoOk()}<span>${esc(nombreItem(e))}</span></li>`).join('')}</ul>`;
  const tituloRegalo = (g) => (g.mio ? T('regalo_tuyo') : g.anonimo || !g.de ? T('regalo_anonimo') : T('regalo_de', { a: g.de }));
  function barra(d) {
    const p = d.progreso || {};
    if (d.nivel >= 10 || p.siguiente == null) return `<div class="vip-barra"><i style="width:100%"></i></div><p class="vip-sub">${esc(T('maximo'))}</p>`;
    return `<div class="vip-barra" role="progressbar" aria-valuenow="${Number(p.pct) || 0}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(3, Number(p.pct) || 0)}%"></i></div>
      <p class="vip-sub"><span>${esc(T('puntos', { a: num(p.puntos), b: num(p.siguiente_puntos) }))}</span><span>${esc(T('faltan', { n: num(p.faltan), s: p.siguiente }))}</span></p>`;
  }

  /* ---------- Estilos ---------- */
  function css() {
    if (typeof document === 'undefined' || document.getElementById('vip-css')) return;
    const s = document.createElement('style');
    s.id = 'vip-css';
    s.textContent = `
      .vip-ico{flex:none;vertical-align:-3px}
      .vip-ins{display:inline-flex;align-items:center;gap:2px;font-size:10.5px;line-height:1;font-weight:800;color:#14161c;background:var(--vc);border-radius:999px;padding:2px 6px 2px 4px;vertical-align:1px;white-space:nowrap}
      .vip-ins .vip-ico{width:11px;height:11px;stroke-width:2.4}
      .vip-ins.g{font-size:15px;padding:5px 10px 5px 8px;gap:4px}
      .vip-ins.g .vip-ico{width:16px;height:16px}
      .vip-ins.brillo{box-shadow:0 0 0 1px #fff6, 0 0 10px var(--vc)}
      .vip-card{padding:12px 14px;border-color:color-mix(in srgb, var(--vc) 45%, var(--line))}
      .vip-top{display:flex;align-items:center;gap:10px;min-width:0}
      .vip-medalla{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:var(--vc);border:2px solid var(--vc);background:color-mix(in srgb, var(--vc) 14%, transparent);position:relative}
      .vip-medalla b{position:absolute;right:-4px;bottom:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--vc);color:#14161c;font-size:12px;display:grid;place-items:center;padding:0 4px}
      .vip-top .grow{flex:1 1 auto;min-width:0}
      .vip-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px}
      .vip-nom{font-weight:700;font-size:15px;line-height:1.25;overflow-wrap:anywhere}
      .vip-tit{display:block;font-weight:400;font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
      .vip-card .btn.sm{flex:none}
      .vip-barra{height:8px;border-radius:6px;background:var(--panel2);border:1px solid var(--line);overflow:hidden;margin:10px 0 4px}
      .vip-barra i{display:block;height:100%;background:linear-gradient(90deg, var(--vc), color-mix(in srgb, var(--vc) 60%, #fff));border-radius:6px}
      .vip-sub{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 10px;font-size:12px;color:var(--muted);margin:0}
      .vip-sub span{overflow-wrap:anywhere}
      .vip-txt{font-size:13px;margin:8px 0 0;color:var(--muted);overflow-wrap:anywhere}
      .vip-regalo{display:flex;align-items:center;gap:10px;margin:10px 0 0;padding:9px 10px;border-radius:12px;background:linear-gradient(135deg,#ffb02018,#ff3b3b10);border:1px solid #ffb02055;min-width:0}
      .vip-regalo .vip-ico{color:var(--amber)}
      .vip-regalo .grow{flex:1 1 auto;min-width:0}
      .vip-regalo b{display:block;font-size:13.5px;overflow-wrap:anywhere}
      .vip-regalo small{display:block;font-size:11.5px;color:var(--muted);overflow-wrap:anywhere}
      .vip-regalo .btn{flex:none}
      .vip-mas{font-size:12px;color:var(--muted);margin:6px 0 0;text-align:right}
      .vip-mas button{background:none;border:0;color:var(--blue);font:inherit;padding:0;cursor:pointer;text-decoration:underline}
      .vip-modal h2{overflow-wrap:anywhere;margin:0}
      .vip-modal p{overflow-wrap:anywhere}
      .vip-hero{display:flex;align-items:center;gap:12px;margin:10px 0 2px;min-width:0}
      .vip-hero .grow{flex:1 1 auto;min-width:0}
      .vip-sec{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:16px 0 6px}
      .vip-tabs{display:flex;gap:6px;margin:12px 0 2px}
      .vip-tabs .btn{flex:1;min-width:0}
      .vip-items{list-style:none;margin:6px 0 0;padding:0}
      .vip-items li{display:flex;gap:6px;align-items:flex-start;font-size:13.5px;margin:4px 0;overflow-wrap:anywhere;min-width:0}
      .vip-items li .vip-ico{color:var(--green);margin-top:2px}
      .vip-items.mini li{font-size:12px;margin:2px 0}
      .vip-caja{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px;min-width:0}
      .vip-caja .btn{margin-top:8px}
      .vip-oferta{border-color:#ffb02066;background:linear-gradient(135deg,#ffb02012,transparent)}
      .vip-oferta b{overflow-wrap:anywhere}
      .vip-niv{display:flex;gap:10px;align-items:flex-start;padding:9px 8px;border-radius:12px;border:1px solid transparent;min-width:0}
      .vip-niv + .vip-niv{border-top-color:var(--line);border-top-left-radius:0;border-top-right-radius:0}
      .vip-niv.yo{border-color:var(--vc);background:color-mix(in srgb, var(--vc) 9%, transparent);border-radius:12px}
      .vip-niv .grow{flex:1 1 auto;min-width:0}
      .vip-niv .pts{flex:none;font-size:11.5px;color:var(--muted);white-space:nowrap}
      .vip-niv b{font-size:13.5px;overflow-wrap:anywhere}
      .vip-perks{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
      .vip-perk{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--line);color:var(--muted);overflow-wrap:anywhere;max-width:100%}
      .vip-perk.nuevo{color:var(--green);border-color:#2ecc7155}
      .vip-marco{display:inline-block;width:12px;height:12px;border-radius:4px;border:2px solid var(--vc);vertical-align:-1px}
      .vip-mec{list-style:none;margin:6px 0 0;padding:0}
      .vip-mec li{display:flex;gap:10px;align-items:center;padding:8px 6px;border-bottom:1px solid var(--line);min-width:0}
      .vip-mec li.yo{background:#4da3ff14;border-radius:10px}
      .vip-mec .pos{flex:none;width:26px;text-align:center;font-weight:800;color:var(--muted)}
      .vip-mec li:nth-child(1) .pos{color:#ffd84d}.vip-mec li:nth-child(2) .pos{color:#c9d1dc}.vip-mec li:nth-child(3) .pos{color:#c58a4e}
      .vip-mec .nom{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;font-size:14px;padding:2px 8px;border-left:3px solid var(--vc);border-radius:3px}
      .vip-sw{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px;color:inherit;font:inherit;font-size:13.5px;margin:6px 0;cursor:pointer}
      .vip-sw span{min-width:0;overflow-wrap:anywhere}
      .vip-sw i{flex:none;width:38px;height:22px;border-radius:11px;background:#2a3242;position:relative;transition:background .2s}
      .vip-sw i::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#e9edf5;transition:transform .2s}
      .vip-sw[aria-pressed="true"] i{background:var(--green)}
      .vip-sw[aria-pressed="true"] i::after{transform:translateX(16px)}
      .vip-nota{font-size:12px;color:var(--muted);margin:12px 0 0}
      /* Cofre que se abre */
      .vip-cofre-zona{position:relative;overflow:hidden;height:150px;display:grid;place-items:end center;margin:6px 0 4px}
      .vip-cofre{position:relative;width:120px;height:104px}
      .vip-cofre .luz{position:absolute;left:50%;bottom:56px;width:24px;height:24px;margin-left:-12px;border-radius:50%;background:radial-gradient(circle,#fff7cc 0%,#ffd84d 35%,#ffd84d00 70%);transform:scale(0);opacity:0;animation:vipLuz 1s .55s ease-out forwards}
      .vip-cofre .rayos{position:absolute;left:50%;bottom:40px;width:150px;height:150px;margin-left:-75px;border-radius:50%;background:repeating-conic-gradient(#ffd84d33 0 10deg,transparent 10deg 30deg);opacity:0;transform:scale(.4);animation:vipRayos 1.4s .6s ease-out forwards}
      .vip-cofre .base{position:absolute;left:10px;bottom:0;width:100px;height:56px;border-radius:6px 6px 12px 12px;background:linear-gradient(180deg,#b9692b,#86461a);border:3px solid #f2c14e;box-shadow:inset 0 -8px 0 #0002}
      .vip-cofre .base::before{content:"";position:absolute;left:-3px;right:-3px;top:18px;height:6px;background:#f2c14e}
      .vip-cofre .tapa{position:absolute;left:6px;bottom:50px;width:108px;height:36px;border-radius:44px 44px 6px 6px;background:linear-gradient(180deg,#d9853a,#a5571f);border:3px solid #f2c14e;transform-origin:12% 100%;animation:vipTapa .75s .35s cubic-bezier(.3,1.5,.5,1) forwards}
      .vip-cofre .cerrojo{position:absolute;left:50%;bottom:40px;width:18px;height:22px;margin-left:-9px;border-radius:4px;background:#f2c14e;border:2px solid #8a5a12;z-index:2}
      .vip-cofre.sacude{animation:vipSacude .35s ease-in-out}
      .vip-cofre-items li{opacity:0;transform:translateY(6px);animation:vipItem .35s forwards;animation-delay:calc(1s + var(--i) * .14s)}
      .vip-cofre-fin h2{text-align:center}
      @keyframes vipSacude{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
      @keyframes vipTapa{0%{transform:rotate(0)}100%{transform:translate(-4px,-20px) rotate(-32deg)}}
      @keyframes vipLuz{0%{transform:scale(0);opacity:0}40%{opacity:1}100%{transform:scale(5);opacity:.85}}
      @keyframes vipRayos{0%{opacity:0;transform:scale(.4) rotate(0)}100%{opacity:1;transform:scale(1) rotate(40deg)}}
      @keyframes vipItem{to{opacity:1;transform:none}}
      @media (prefers-reduced-motion: reduce){
        .vip-cofre .tapa{animation:none;transform:translate(-4px,-20px) rotate(-32deg)}
        .vip-cofre .luz{animation:none;transform:scale(5);opacity:.85}
        .vip-cofre .rayos{animation:none;opacity:1;transform:none}
        .vip-cofre.sacude{animation:none}
        .vip-cofre-items li{animation:none;opacity:1;transform:none}
      }`;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- Tarjeta de Inicio ---------- */
  function tarjeta(ctx) {
    if (!logueado()) return '';
    st.ctx = ctx;
    css();
    if (hayQuePedir()) setTimeout(recargar, 0);
    const e = estadoApi() || {};
    const d = st.datos;
    const nivel = d ? d.nivel : (Number(e.vip_nivel) || 0);
    const regalos = d ? d.regalos || [] : [];
    const pendientes = d ? regalos.length : (Number(e.regalos_pendientes) || 0);
    if (!d && st.cargando && !pendientes && !nivel) return `<div class="card vip-card" data-vip="tarjeta" style="--vc:${color(0)}"><p class="small muted" style="margin:0">${esc(T('cargando'))}</p></div>`;
    const cab = `<div class="vip-top"><div class="vip-medalla">${icoCorona(22)}${nivel ? `<b>${nivel}</b>` : ''}</div>
        <div class="grow"><div class="vip-lbl">${esc(T('tu_vip'))}</div>
          <div class="vip-nom">${nivel ? esc(T('vip_n', { n: nivel }) + ' · ' + T('insignia.' + nivel)) : esc(T('sin_nivel'))}${nivel ? `<span class="vip-tit">${esc(T('titulo.' + nivel))}</span>` : ''}</div></div>
        <button class="btn sm" data-ext="${ID}" data-acc="abrir">${esc(T('ver'))}</button></div>`;
    let cuerpo = '';
    if (d && nivel) cuerpo += barra(d);
    else if (!nivel) cuerpo += `<p class="vip-txt">${esc(T('sin_nivel_txt'))}</p>`;
    regalos.slice(0, 2).forEach((g) => {
      cuerpo += `<div class="vip-regalo" data-vip="regalo" data-id="${g.id}">${icoCofre(26)}<div class="grow"><b>${esc(tituloRegalo(g))}</b><small>${esc(T('vence', { f: fecha(g.vence) }))}</small></div>
        <button class="btn sm main" data-ext="${ID}" data-acc="reclamar" data-id="${g.id}">${esc(T('abrir'))}</button></div>`;
    });
    if (!d && pendientes) cuerpo += `<div class="vip-regalo">${icoCofre(26)}<div class="grow"><b>${esc(T('mas_regalos', { n: pendientes }))}</b></div></div>`;
    if (regalos.length > 2) cuerpo += `<p class="vip-mas"><button data-ext="${ID}" data-acc="abrir">${esc(T('mas_regalos', { n: regalos.length - 2 }))}</button></p>`;
    if (d && d.mensual && d.mensual.disponible) {
      cuerpo += `<div class="vip-regalo" data-vip="mensual-tarjeta">${icoRegalo(24)}<div class="grow"><b>${esc(T('mensual_listo'))}</b></div>
        <button class="btn sm main" data-ext="${ID}" data-acc="mensual">${esc(T('reclamar'))}</button></div>`;
    }
    const ofv = ofertasVendibles(d);
    if (ofv.length) cuerpo += `<p class="vip-txt" style="color:var(--amber)">${icoRegalo(14)} ${esc(T('oferta_nueva', { o: TL(ofv[0].nombre) }))}</p>`;
    return `<div class="card vip-card" data-vip="tarjeta" data-nivel="${nivel}" style="--vc:${color(nivel)}">${cab}${cuerpo}</div>`;
  }

  /* ---------- Ventana ---------- */
  function cerrarIco(ctx) { try { if (ctx && ctx.I) return ctx.I('close', 'sm'); } catch (e) { /* abajo */ } return svg('<path d="M6 6l12 12M18 6L6 18"/>', 'vip-ico', 18); }
  function vistaNiveles(d) {
    let h = '';
    const regalos = d.regalos || [];
    h += `<div class="vip-sec">${esc(T('sec.regalos'))}</div>`;
    h += regalos.length ? regalos.map((g) => `<div class="vip-regalo" data-vip="regalo" data-id="${g.id}">${icoCofre(26)}<div class="grow"><b>${esc(tituloRegalo(g))}</b>
        <small>${esc((g.contenido || []).map(nombreItem).join(' · '))}</small><small>${esc(T('vence', { f: fecha(g.vence) }))}</small></div>
        <button class="btn sm main" data-ext="${ID}" data-acc="reclamar" data-id="${g.id}">${esc(T('abrir'))}</button></div>`).join('')
      : `<p class="small muted" style="margin:0">${esc(T('regalos.vacio'))}</p>`;
    const m = d.mensual || {};
    h += `<div class="vip-sec">${esc(T('sec.mensual'))}</div><div class="vip-caja" data-vip="mensual">`;
    if (d.nivel < 1) h += `<p class="small muted" style="margin:0">${esc(T('mensual.sin'))}</p>${listaItems(m.contenido, 'mini')}`;
    else {
      h += listaItems(m.contenido);
      h += m.disponible ? `<button class="btn main" data-ext="${ID}" data-acc="mensual">${icoRegalo(16)} ${esc(T('reclamar'))}</button>`
        : `<p class="small muted" style="margin:6px 0 0">${esc(T('mensual.ya', { f: fecha(m.proximo) }))}</p>`;
    }
    h += '</div>';
    const ofertas = ofertasVendibles(d);
    if (ofertas.length) {
      h += `<div class="vip-sec">${esc(T('sec.ofertas'))}</div>`;
      h += ofertas.map((o) => `<div class="vip-caja vip-oferta" data-vip="oferta" data-producto="${esc(o.producto)}" style="margin-bottom:8px">
          <b>${esc(TL(o.nombre))}</b>
          ${listaItems([...(o.creditos ? [{ tipo: 'creditos', cantidad: o.creditos }] : []), ...(o.entregas || [])].map((x) => x.tipo === 'creditos' ? { tipo: 'x', item: T('item.creditos', { n: num(x.cantidad) }) } : x))}
          <p class="small muted" style="margin:4px 0 0">${esc(T('vence', { f: fecha(o.vence) }))} · ${esc(T('oferta.quedan', { n: o.quedan }))}</p>
          <button class="btn main" data-act="comprar" data-k="${esc(o.producto)}">${esc(T('oferta.comprar', { p: o.valor }))}</button></div>`).join('');
    }
    h += `<div class="vip-sec">${esc(T('sec.tabla'))}</div>`;
    h += (d.niveles || []).map((n) => {
      const perks = [`<span class="vip-perk">${esc(T('perk.insignia', { i: T('insignia.' + n.nivel) }))}</span>`,
        `<span class="vip-perk"><span class="vip-marco"></span> ${esc(T('perk.marco'))}</span>`,
        `<span class="vip-perk">${esc(T('perk.titulo', { t: T('titulo.' + n.nivel) }))}</span>`,
        `<span class="vip-perk">${esc(T('perk.mensual'))}</span>`];
      if (n.intento_nuevo) perks.push(`<span class="vip-perk nuevo">${esc(T('perk.intento'))}</span>`);
      if (n.slot_nuevo) perks.push(`<span class="vip-perk nuevo">${esc(T('perk.obra'))}</span>`);
      return `<div class="vip-niv ${n.nivel === d.nivel ? 'yo' : ''}" data-vip="nivel" data-n="${n.nivel}" style="--vc:${n.color || color(n.nivel)}">${insignia(n.nivel)}
        <div class="grow"><b>${esc(T('insignia.' + n.nivel))}${n.nivel === d.nivel ? ` · ${esc(T('nivel.actual'))}` : ''}</b><div class="vip-perks">${perks.join('')}</div>
          ${listaItems(n.mensual, 'mini')}</div><span class="pts">${esc(num(n.puntos))}</span></div>`;
    }).join('');
    return h;
  }
  function vistaMecenas(d) {
    const m = st.mec;
    if (!m) { if (!st.mecCargando) setTimeout(cargarMecenas, 0); return `<p class="small muted">${esc(T('cargando'))}</p>`; }
    const lista = st.mecTab === 'siempre' ? m.lista_siempre || [] : m.lista_semana || [];
    const yo = m.yo ? m.yo[st.mecTab] : null;
    const aj = (d && d.ajustes) || {};
    let h = `<p class="small muted" style="margin:10px 0 0">${esc(T('mec.intro'))}</p>
      <div class="vip-tabs"><button class="btn sm ${st.mecTab === 'semana' ? 'main' : ''}" data-ext="${ID}" data-acc="mec" data-k="semana">${esc(T('mec.semana'))}</button>
        <button class="btn sm ${st.mecTab === 'siempre' ? 'main' : ''}" data-ext="${ID}" data-acc="mec" data-k="siempre">${esc(T('mec.siempre'))}</button></div>`;
    h += lista.length ? `<ul class="vip-mec" data-vip="mecenas">${lista.map((x) => `<li class="${x.yo ? 'yo' : ''}"><span class="pos">${x.posicion}</span>
        <span class="nom" style="--vc:${color(x.nivel)}">${esc(x.nombre)}${x.yo ? ` · ${esc(T('tu'))}` : ''}</span>${insignia(x.nivel)}</li>`).join('')}</ul>`
      : `<p class="small muted">${esc(T('mec.vacio'))}</p>`;
    h += `<p class="small" style="margin:8px 0 0">${m.oculto ? esc(T('mec.oculto')) : yo ? esc(T('mec.tu_puesto', { n: yo })) : ''}</p>`;
    h += `<div class="vip-sec">${esc(T('aj.titulo'))}</div>
      <button class="vip-sw" data-ext="${ID}" data-acc="aj" data-k="ocultar_mecenas" aria-pressed="${aj.ocultar_mecenas ? 'false' : 'true'}"><span>${esc(T('aj.mostrar'))}</span><i></i></button>
      <button class="vip-sw" data-ext="${ID}" data-acc="aj" data-k="anonimo" aria-pressed="${aj.anonimo ? 'true' : 'false'}"><span>${esc(T('aj.anonimo'))}</span><i></i></button>`;
    return h;
  }
  function abrirModal(ctx) {
    st.ctx = ctx;
    css();
    const d = st.datos;
    if (!d) {
      ctx.openModal(`<div class="vip-modal" data-vip="modal"><div class="row between"><h2>${esc(T('modal.titulo'))}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('cerrar'))}">${cerrarIco(ctx)}</button></div><p class="small muted">${esc(T(st.error ? 'error' : 'cargando'))}</p></div>`);
      if (!st.cargando) recargar();
      return;
    }
    const n = d.nivel;
    const cuerpo = st.vista === 'mecenas' ? vistaMecenas(d) : vistaNiveles(d);
    ctx.openModal(`<div class="vip-modal" data-vip="modal" style="--vc:${color(n)}">
      <div class="row between"><h2>${esc(T('modal.titulo'))}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('cerrar'))}">${cerrarIco(ctx)}</button></div>
      <div class="vip-hero"><div class="vip-medalla">${icoCorona(22)}${n ? `<b>${n}</b>` : ''}</div><div class="grow">
        <div class="vip-nom">${n ? esc(T('vip_n', { n }) + ' · ' + T('insignia.' + n)) : esc(T('sin_nivel'))}${n ? `<span class="vip-tit">${esc(T('titulo.' + n))}</span>` : ''}</div></div></div>
      ${barra(d)}
      <p class="vip-sub" style="margin-top:4px"><span>${esc(T('modal.puntos'))}</span></p>
      <div class="vip-tabs"><button class="btn sm ${st.vista === 'niveles' ? 'main' : ''}" data-ext="${ID}" data-acc="vista" data-k="niveles">${esc(T('tab.niveles'))}</button>
        <button class="btn sm ${st.vista === 'mecenas' ? 'main' : ''}" data-ext="${ID}" data-acc="vista" data-k="mecenas">${esc(T('tab.mecenas'))}</button></div>
      ${cuerpo}
      <p class="vip-nota">${esc(T('modal.pase'))}</p></div>`);
  }
  async function cargarMecenas() {
    if (st.mecCargando) return;
    st.mecCargando = true;
    try { st.mec = await pedir('GET', '/api/mecenas'); } catch (e) { st.mec = { lista_semana: [], lista_siempre: [], yo: {}, oculto: false, error: true }; }
    st.mecCargando = false;
    if (modalAbierto() && st.ctx && st.vista === 'mecenas') abrirModal(st.ctx);
  }

  /* ---------- Abrir cofres ---------- */
  function aplicar(ctx, entregas) {
    try {
      const S = ctx.S ? ctx.S() : ctx.estado;
      if (S && root.Premium && root.Premium.aplicarEntregas) root.Premium.aplicarEntregas(S, entregas || []);
      if (ctx.save) ctx.save();
    } catch (e) { /* se aplican con el próximo /api/estado */ }
  }
  function mostrarCofre(ctx, titulo, sub, entregas) {
    ctx.openModal(`<div class="vip-modal vip-cofre-fin" data-vip="cofre">
      <div class="vip-cofre-zona"><div class="vip-cofre sacude"><div class="rayos"></div><div class="luz"></div><div class="base"></div><div class="tapa"></div><div class="cerrojo"></div></div></div>
      <h2>${esc(titulo)}</h2>${sub ? `<p class="small muted" style="text-align:center;margin:4px 0 0">${esc(sub)}</p>` : ''}
      ${listaItems(entregas, 'vip-cofre-items')}
      <button class="btn main" data-ext="${ID}" data-acc="volver" style="margin-top:12px">${esc(T('cofre.ok'))}</button></div>`);
    try { if (ctx.snd && ctx.snd.play) ctx.snd.play('chapter'); } catch (e) { /* sin sonido */ }
  }
  async function reclamar(ctx, id, el) {
    if (st.ocupado) return;
    st.ocupado = true;
    if (el) { el.disabled = true; el.textContent = T('abriendo'); }
    const g = ((st.datos && st.datos.regalos) || []).find((x) => String(x.id) === String(id));
    try {
      const r = await pedir('POST', '/api/vip/regalo/reclamar', { id: Number(id) });
      aplicar(ctx, r.entregas);
      if (st.datos) st.datos.regalos = (st.datos.regalos || []).filter((x) => String(x.id) !== String(id));
      st.conteo = typeof r.pendientes === 'number' ? r.pendientes : st.conteo;
      st.volverA = modalAbierto() ? 'modal' : null;
      mostrarCofre(ctx, T('cofre.titulo'), g ? tituloRegalo(g) : '', r.entregas);
      refrescarEstado(ctx);
    } catch (e) {
      ctx.toast((e && e.message) || T('error'));
      if (e && (e.codigo === 'ya_reclamado' || e.codigo === 'regalo_vencido' || e.codigo === 'regalo_cancelado')) { invalidar(); recargar(); }
      else repintar();
    } finally { st.ocupado = false; }
  }
  async function mensual(ctx, el) {
    if (st.ocupado) return;
    st.ocupado = true;
    if (el) { el.disabled = true; el.textContent = T('abriendo'); }
    try {
      const r = await pedir('POST', '/api/vip/mensual', {});
      aplicar(ctx, r.entregas);
      if (st.datos && r.mensual) st.datos.mensual = r.mensual;
      st.volverA = modalAbierto() ? 'modal' : null;
      mostrarCofre(ctx, T('cofre.mensual'), st.datos && st.datos.nivel ? T('vip_n', { n: st.datos.nivel }) + ' · ' + T('insignia.' + st.datos.nivel) : '', r.entregas);
      refrescarEstado(ctx);
    } catch (e) {
      ctx.toast((e && e.message) || T('error'));
      if (e && e.codigo === 'ya_reclamado') { invalidar(); recargar(); } else repintar();
    } finally { st.ocupado = false; }
  }
  function refrescarEstado(ctx) {
    try { const a = Api(); if (a && a.refrescar) a.refrescar().then(() => { st.conteo = (estadoApi() || {}).regalos_pendientes; repintar(); }).catch(() => {}); } catch (e) { /* luego */ }
  }
  async function guardarAjuste(ctx, clave, el) {
    const d = st.datos;
    if (!d || st.ocupado) return;
    const aj = Object.assign({}, d.ajustes || {});
    aj[clave] = !aj[clave];
    st.ocupado = true;
    if (el) el.disabled = true;
    try {
      const r = await pedir('POST', '/api/vip/ajustes', { [clave]: aj[clave] });
      d.ajustes = r.ajustes || aj;
      if (clave === 'ocultar_mecenas') st.mec = null;   // el ranking cambia
      ctx.toast(T('aj.guardado'));
    } catch (e) { ctx.toast((e && e.message) || T('error')); }
    st.ocupado = false;
    abrirModal(ctx);
  }

  function clic(ctx, acc, el) {
    st.ctx = ctx;
    const k = el && el.dataset ? el.dataset.k : null;
    switch (acc) {
      case 'abrir': st.vista = 'niveles'; abrirModal(ctx); if (hayQuePedir()) recargar(); break;
      case 'vista': st.vista = k === 'mecenas' ? 'mecenas' : 'niveles'; abrirModal(ctx); break;
      case 'mec': st.mecTab = k === 'siempre' ? 'siempre' : 'semana'; abrirModal(ctx); break;
      case 'reclamar': reclamar(ctx, el && el.dataset ? el.dataset.id : null, el); break;
      case 'mensual': mensual(ctx, el); break;
      case 'aj': guardarAjuste(ctx, k === 'anonimo' ? 'anonimo' : 'ocultar_mecenas', el); break;
      case 'volver': if (st.volverA === 'modal') abrirModal(ctx); else { ctx.closeModal(); repintar(); } break;
      default: break;
    }
  }
  function abrir(ctx) { clic(ctx || st.ctx, 'abrir', null); }

  /* Ficha corta para la pestaña Tienda (ui.js la pone con una línea; ver INTEGRAR_VIP.md). */
  function fichaTienda() {
    if (!logueado()) return '';
    css();
    const e = estadoApi() || {};
    const n = st.datos ? st.datos.nivel : (Number(e.vip_nivel) || 0);
    const ofv = ofertasVendibles(st.datos);
    const of = ofv.length;
    return `<div class="card vip-card" data-vip="ficha" style="--vc:${color(n)}"><div class="vip-top"><div class="vip-medalla">${icoCorona(20)}${n ? `<b>${n}</b>` : ''}</div>
      <div class="grow"><div class="vip-lbl">${esc(T('tu_vip'))}</div><div class="vip-nom">${n ? esc(T('vip_n', { n }) + ' · ' + T('insignia.' + n)) : esc(T('sin_nivel'))}</div>
      ${of ? `<span class="vip-tit" style="color:var(--amber)">${esc(T('oferta_nueva', { o: TL(ofv[0].nombre) }))}</span>` : `<span class="vip-tit">${esc(T('modal.puntos'))}</span>`}</div>
      <button class="btn sm" data-ext="${ID}" data-acc="abrir">${esc(T('ver'))}</button></div></div>`;
  }

  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: 3, tarjeta, clic });
  root.Vip = { tarjeta, clic, abrir, recargar, invalidar, insignia, color, fichaTienda, T, ES, TRAD, get datos() { return st.datos; } };
  if (typeof document !== 'undefined') { try { css(); } catch (e) { /* sin DOM */ } }
})(typeof window !== 'undefined' ? window : globalThis);
