/* =========================================================
   EN VIVO Tycoon — Pase de Temporada (pantalla)
   Contrato: server/INTEGRAR_PASE.md (GET /api/pase, POST /api/pase/reclamar · reclamar_todo · saltar).
   El servidor decide todo (niveles, XP, premios, misiones); esta pantalla muestra y pide.
   - Tarjeta de Inicio: se registra sola en window.EnVivoInicio (id "pase", orden 7): nivel, barra de XP y
     "N premios por reclamar". Su botón (data-ext="pase" data-acc="abrir") abre la pantalla completa.
   - Pantalla completa propia (#pase-ov, encima de todo): las dos pistas (gratis / premium) en filas que se deslizan de
     lado DENTRO de su tarjeta (la página nunca se desborda), misiones, saltos de nivel y el botón para comprar el premium.
   - ctx (el de ui.js para Inicio) puede traer: onComprar(idProducto) → flujo de compra de la Tienda (lo conecta el
     integrador), alReclamar() → refresca /api/estado y aplica las entregas nuevas, toast(msg), render(), M(dinero).
   - Textos: español y 9 idiomas aquí mismo (TRAD[código]), en registro "tú". Sin I18N, español.
   API pública: window.Pase = { tarjeta, clic, abrir, cerrar, fichaTienda, recargar, TRAD }.
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------- Textos ---------- */
  const TRAD = {};
  TRAD.es = {
    toca: 'Toca un premio para ver qué trae.', titulo: 'Pase de Temporada', tag: 'Pase de Temporada', nivel_de: 'Nivel {n}/{max}', nivel_n: 'Nv {n}', xp: '{a}/{b} XP', xp_max: '¡Nivel máximo!',
    por_reclamar: '{n} premios por reclamar', por_reclamar1: '1 premio por reclamar', nada: 'Juega en línea para subir de nivel',
    esperando: '{n} premios premium te esperan', ver: 'Ver pase', termina: 'Termina en {t}', cerrar: 'Cerrar',
    gratis: 'Gratis', premium: 'Premium', premium_activo: 'Premium activo', plus_activo: 'Premium Plus activo',
    reclamar: 'Reclamar', reclamar_todo: 'Reclamar todo ({n})', reclamado: 'Listo', bloqueado: 'Nv {n}', requiere: 'Premium',
    comprar_premium: 'Pase Premium · {p}', comprar_plus: 'Premium Plus · {p}', plus_det: 'Todo el premium y +{n} niveles ya',
    premium_txt: 'Premios en los 40 niveles, cosméticos exclusivos y hasta {c} créditos de vuelta. Si ya avanzaste, reclamas al instante los premios de los niveles que ya tienes.',
    contenido: 'Todo lo que trae el pase está a la vista: sin cajas sorpresa.',
    como_xp: 'Ganas XP jugando en línea: liga, festival, copa, duelos y el Desafío del Día. Hoy llevas {a} de {b} XP.',
    misiones: 'Misiones', diarias: 'Diarias', semanales: 'Semanales', hecha: '¡Hecha!', renuevan: 'Nuevas en {t}',
    'mis.d_eventos': 'Juega {n} eventos en línea', 'mis.d_desafio': 'Juega el Desafío del Día', 'mis.d_duelo': 'Juega {n} duelo',
    'mis.d_liga': 'Juega {n} intentos de encargos de la liga', 'mis.d_obras': 'Ayuda en {n} obras de tu asociación', 'mis.d_festival': 'Juega {n} turnos del festival',
    'mis.d_copa': 'Suma {n} intentos de preparación de la copa', 'mis.s_eventos': 'Juega {n} eventos en línea', 'mis.s_copa_equipo': 'Registra tu equipo de copa',
    'mis.s_duelos': 'Juega {n} duelos', 'mis.s_desafio': 'Juega el Desafío del Día en {n} días distintos', 'mis.s_obras': 'Ayuda en {n} obras de tu asociación',
    'mis.s_liga': 'Juega {n} intentos de encargos de la liga', 'mis.s_festival': 'Juega {n} turnos del festival',
    saltar: 'Saltar niveles', saltar_txt: '{p} créditos por nivel. Te quedan {q} de {max} saltos esta temporada.', saltar_btn: 'Saltar {n} · {c} créditos',
    saltar_seguro: '¿Saltar {n} nivel(es) por {c} créditos?', confirmar: 'Sí, saltar', cancelar: 'Cancelar', saltar_ok: '¡Subiste al nivel {n}!', saltar_no: 'Ya no puedes saltar más niveles esta temporada.',
    anterior: '{nombre}: te quedan {t} para reclamar {k} premio(s).', creditos_vuelta: 'Créditos de vuelta: {a}/{b}',
    cargando: 'Abriendo el pase…', error: 'No se pudo abrir el pase.', reintentar: 'Intentar de nuevo', sin_sesion: 'Entra a tu cuenta para jugar el Pase de Temporada.',
    proxima: 'El Pase de Temporada empieza en {t}', reclamado_ok: '¡Listo! {r}', reclamados_ok: '¡Reclamaste {n} premios!', sin_tienda: 'La tienda no está disponible ahora.',
    revisar: 'En revisión', tienda_txt: 'Premios en los 40 niveles y hasta {c} créditos de vuelta.',
    't.d': '{n} d', 't.h': '{n} h', 't.m': '{n} min',
    'r.creditos': '{n} créditos', 'r.cable': '{n} cables', 'r.battery': '{n} baterías', 'r.acel': 'Acelerador {t}', 'r.reparar_todo': 'Reparación total',
    'r.estrella': 'Personal estrella · {n} partidos', 'r.marco': 'Marco de productora', 'r.deco': 'Adorno de sede', 'r.titulo': 'Título de chat', 'r.insignia': 'Insignia',
    'mat.cables': 'Cables', 'mat.placas': 'Placas', 'mat.paneles': 'Paneles LED', 'mat.credenciales': 'Credenciales', 'mat.planos': 'Planos', 'mat.chips': 'Chips 4K',
    'tema.halloween': 'Noche de Calaveras', 'tema.navidad': 'Luces de Navidad', 'tema.pase_nino': 'Pase del Niño', 'tema.fin_anio': 'Año Nuevo en vivo',
    'tema.san_valentin': 'Amor en vivo', 'tema.pascua': 'Semana Santa en vivo', 'tema.carnaval': 'Carnaval en vivo', 'tema.estadios': 'Gira de estadios',
    'tema.festivales': 'Verano de festivales', 'tema.estrenos': 'Noches de estreno', 'tema.conciertos': 'Gira de conciertos', temporada: 'Temporada {n} · {tema}',
    'err.ya_reclamado': 'Ya reclamaste ese premio.', 'err.nivel_bloqueado': 'Todavía no llegas a ese nivel. ¡Sigue jugando!', 'err.premium_requerido': 'Ese premio es del Pase Premium.',
    'err.saltos_tope': 'Ya no te quedan saltos esta temporada.', 'err.sin_creditos': 'No te alcanzan los créditos.', 'err.nivel_max': 'Ya casi llegas al máximo: salta menos niveles.',
    'err.gracia_terminada': 'Esos premios ya vencieron.', 'err.sin_temporada': 'El Pase de Temporada todavía no empieza.', 'err.red': 'Sin conexión. Intenta de nuevo.',
    'err.pase_ya_premium': 'Ya tienes el Pase Premium de esta temporada.',
  };
  TRAD.en = {
    toca: 'Tap a reward to see what it is.', titulo: 'Season Pass', tag: 'Season Pass', nivel_de: 'Tier {n}/{max}', nivel_n: 'T{n}', xp: '{a}/{b} XP', xp_max: 'Max tier!',
    por_reclamar: '{n} rewards to claim', por_reclamar1: '1 reward to claim', nada: 'Play online to level up',
    esperando: '{n} premium rewards are waiting for you', ver: 'Open pass', termina: 'Ends in {t}', cerrar: 'Close',
    gratis: 'Free', premium: 'Premium', premium_activo: 'Premium active', plus_activo: 'Premium Plus active',
    reclamar: 'Claim', reclamar_todo: 'Claim all ({n})', reclamado: 'Done', bloqueado: 'T{n}', requiere: 'Premium',
    comprar_premium: 'Premium Pass · {p}', comprar_plus: 'Premium Plus · {p}', plus_det: 'All of premium plus {n} tiers right away',
    premium_txt: 'Rewards on all 40 tiers, exclusive cosmetics and up to {c} credits back. Already leveled up? You instantly claim the rewards for the tiers you have.',
    contenido: 'Everything in the pass is shown up front: no loot boxes.',
    como_xp: 'You earn XP playing online: league, festival, cup, duels and the Daily Challenge. Today: {a} of {b} XP.',
    misiones: 'Missions', diarias: 'Daily', semanales: 'Weekly', hecha: 'Done!', renuevan: 'New ones in {t}',
    'mis.d_eventos': 'Play {n} online events', 'mis.d_desafio': 'Play the Daily Challenge', 'mis.d_duelo': 'Play {n} duel',
    'mis.d_liga': 'Play {n} league job attempts', 'mis.d_obras': 'Help with {n} builds in your association', 'mis.d_festival': 'Play {n} festival turns',
    'mis.d_copa': 'Add {n} cup prep attempts', 'mis.s_eventos': 'Play {n} online events', 'mis.s_copa_equipo': 'Register your cup team',
    'mis.s_duelos': 'Play {n} duels', 'mis.s_desafio': 'Play the Daily Challenge on {n} different days', 'mis.s_obras': 'Help with {n} builds in your association',
    'mis.s_liga': 'Play {n} league job attempts', 'mis.s_festival': 'Play {n} festival turns',
    saltar: 'Skip tiers', saltar_txt: '{p} credits per tier. You have {q} of {max} skips left this season.', saltar_btn: 'Skip {n} · {c} credits',
    saltar_seguro: 'Skip {n} tier(s) for {c} credits?', confirmar: 'Yes, skip', cancelar: 'Cancel', saltar_ok: 'You reached tier {n}!', saltar_no: 'You can’t skip any more tiers this season.',
    anterior: '{nombre}: you have {t} left to claim {k} reward(s).', creditos_vuelta: 'Credits back: {a}/{b}',
    cargando: 'Opening the pass…', error: 'Couldn’t open the pass.', reintentar: 'Try again', sin_sesion: 'Log in to play the Season Pass.',
    proxima: 'The Season Pass starts in {t}', reclamado_ok: 'Done! {r}', reclamados_ok: 'You claimed {n} rewards!', sin_tienda: 'The shop isn’t available right now.',
    revisar: 'Under review', tienda_txt: 'Rewards on all 40 tiers and up to {c} credits back.',
    't.d': '{n}d', 't.h': '{n}h', 't.m': '{n} min',
    'r.creditos': '{n} credits', 'r.cable': '{n} cables', 'r.battery': '{n} batteries', 'r.acel': 'Speed-up {t}', 'r.reparar_todo': 'Full repair',
    'r.estrella': 'Star crew · {n} matches', 'r.marco': 'Studio frame', 'r.deco': 'HQ decoration', 'r.titulo': 'Chat title', 'r.insignia': 'Badge',
    'mat.cables': 'Cables', 'mat.placas': 'Boards', 'mat.paneles': 'LED panels', 'mat.credenciales': 'Press passes', 'mat.planos': 'Blueprints', 'mat.chips': '4K chips',
    'tema.halloween': 'Night of Skulls', 'tema.navidad': 'Christmas Lights', 'tema.pase_nino': 'Child Jesus Parade', 'tema.fin_anio': 'New Year Live',
    'tema.san_valentin': 'Love Live', 'tema.pascua': 'Holy Week Live', 'tema.carnaval': 'Carnival Live', 'tema.estadios': 'Stadium Tour',
    'tema.festivales': 'Festival Summer', 'tema.estrenos': 'Premiere Nights', 'tema.conciertos': 'Concert Tour', temporada: 'Season {n} · {tema}',
    'err.ya_reclamado': 'You already claimed that reward.', 'err.nivel_bloqueado': 'You haven’t reached that tier yet. Keep playing!', 'err.premium_requerido': 'That reward is part of the Premium Pass.',
    'err.saltos_tope': 'You have no skips left this season.', 'err.sin_creditos': 'You don’t have enough credits.', 'err.nivel_max': 'You’re almost at the max: skip fewer tiers.',
    'err.gracia_terminada': 'Those rewards have expired.', 'err.sin_temporada': 'The Season Pass hasn’t started yet.', 'err.red': 'No connection. Try again.',
    'err.pase_ya_premium': 'You already have this season’s Premium Pass.',
  };
  TRAD['pt-BR'] = {
    toca: 'Toque num prêmio para ver o que ele traz.', titulo: 'Passe de Temporada', tag: 'Passe de Temporada', nivel_de: 'Nível {n}/{max}', nivel_n: 'Nv {n}', xp: '{a}/{b} XP', xp_max: 'Nível máximo!',
    por_reclamar: '{n} prêmios para resgatar', por_reclamar1: '1 prêmio para resgatar', nada: 'Jogue online para subir de nível',
    esperando: '{n} prêmios premium esperando por você', ver: 'Ver passe', termina: 'Termina em {t}', cerrar: 'Fechar',
    gratis: 'Grátis', premium: 'Premium', premium_activo: 'Premium ativo', plus_activo: 'Premium Plus ativo',
    reclamar: 'Resgatar', reclamar_todo: 'Resgatar tudo ({n})', reclamado: 'Feito', bloqueado: 'Nv {n}', requiere: 'Premium',
    comprar_premium: 'Passe Premium · {p}', comprar_plus: 'Premium Plus · {p}', plus_det: 'Todo o premium e +{n} níveis na hora',
    premium_txt: 'Prêmios nos 40 níveis, cosméticos exclusivos e até {c} créditos de volta. Se você já avançou, resgata na hora os prêmios dos níveis que já tem.',
    contenido: 'Tudo o que o passe traz está à vista: sem caixas surpresa.',
    como_xp: 'Você ganha XP jogando online: liga, festival, copa, duelos e o Desafio do Dia. Hoje: {a} de {b} XP.',
    misiones: 'Missões', diarias: 'Diárias', semanales: 'Semanais', hecha: 'Feita!', renuevan: 'Novas em {t}',
    'mis.d_eventos': 'Jogue {n} eventos online', 'mis.d_desafio': 'Jogue o Desafio do Dia', 'mis.d_duelo': 'Jogue {n} duelo',
    'mis.d_liga': 'Jogue {n} tentativas de encomendas da liga', 'mis.d_obras': 'Ajude em {n} obras da sua associação', 'mis.d_festival': 'Jogue {n} turnos do festival',
    'mis.d_copa': 'Some {n} tentativas de preparação da copa', 'mis.s_eventos': 'Jogue {n} eventos online', 'mis.s_copa_equipo': 'Registre seu time da copa',
    'mis.s_duelos': 'Jogue {n} duelos', 'mis.s_desafio': 'Jogue o Desafio do Dia em {n} dias diferentes', 'mis.s_obras': 'Ajude em {n} obras da sua associação',
    'mis.s_liga': 'Jogue {n} tentativas de encomendas da liga', 'mis.s_festival': 'Jogue {n} turnos do festival',
    saltar: 'Pular níveis', saltar_txt: '{p} créditos por nível. Restam {q} de {max} pulos nesta temporada.', saltar_btn: 'Pular {n} · {c} créditos',
    saltar_seguro: 'Pular {n} nível(is) por {c} créditos?', confirmar: 'Sim, pular', cancelar: 'Cancelar', saltar_ok: 'Você chegou ao nível {n}!', saltar_no: 'Você não pode pular mais níveis nesta temporada.',
    anterior: '{nombre}: faltam {t} para resgatar {k} prêmio(s).', creditos_vuelta: 'Créditos de volta: {a}/{b}',
    cargando: 'Abrindo o passe…', error: 'Não deu para abrir o passe.', reintentar: 'Tentar de novo', sin_sesion: 'Entre na sua conta para jogar o Passe de Temporada.',
    proxima: 'O Passe de Temporada começa em {t}', reclamado_ok: 'Pronto! {r}', reclamados_ok: 'Você resgatou {n} prêmios!', sin_tienda: 'A loja não está disponível agora.',
    revisar: 'Em revisão', tienda_txt: 'Prêmios nos 40 níveis e até {c} créditos de volta.',
    't.d': '{n} d', 't.h': '{n} h', 't.m': '{n} min',
    'r.creditos': '{n} créditos', 'r.cable': '{n} cabos', 'r.battery': '{n} baterias', 'r.acel': 'Acelerador {t}', 'r.reparar_todo': 'Reparo total',
    'r.estrella': 'Equipe estrela · {n} partidas', 'r.marco': 'Moldura da produtora', 'r.deco': 'Enfeite da sede', 'r.titulo': 'Título no chat', 'r.insignia': 'Insígnia',
    'mat.cables': 'Cabos', 'mat.placas': 'Placas', 'mat.paneles': 'Painéis LED', 'mat.credenciales': 'Credenciais', 'mat.planos': 'Plantas', 'mat.chips': 'Chips 4K',
    'tema.halloween': 'Noite das Caveiras', 'tema.navidad': 'Luzes de Natal', 'tema.pase_nino': 'Desfile do Menino Jesus', 'tema.fin_anio': 'Ano Novo ao vivo',
    'tema.san_valentin': 'Amor ao vivo', 'tema.pascua': 'Semana Santa ao vivo', 'tema.carnaval': 'Carnaval ao vivo', 'tema.estadios': 'Turnê de estádios',
    'tema.festivales': 'Verão de festivais', 'tema.estrenos': 'Noites de estreia', 'tema.conciertos': 'Turnê de shows', temporada: 'Temporada {n} · {tema}',
    'err.ya_reclamado': 'Você já resgatou esse prêmio.', 'err.nivel_bloqueado': 'Você ainda não chegou nesse nível. Continue jogando!', 'err.premium_requerido': 'Esse prêmio é do Passe Premium.',
    'err.saltos_tope': 'Você não tem mais pulos nesta temporada.', 'err.sin_creditos': 'Seus créditos não são suficientes.', 'err.nivel_max': 'Você está quase no máximo: pule menos níveis.',
    'err.gracia_terminada': 'Esses prêmios já venceram.', 'err.sin_temporada': 'O Passe de Temporada ainda não começou.', 'err.red': 'Sem conexão. Tente de novo.',
    'err.pase_ya_premium': 'Você já tem o Passe Premium desta temporada.',
  };
  TRAD.fr = {
    toca: 'Touche une récompense pour voir ce qu’elle contient.', titulo: 'Pass de saison', tag: 'Pass de saison', nivel_de: 'Palier {n}/{max}', nivel_n: 'P{n}', xp: '{a}/{b} XP', xp_max: 'Palier max !',
    por_reclamar: '{n} récompenses à récupérer', por_reclamar1: '1 récompense à récupérer', nada: 'Joue en ligne pour monter de palier',
    esperando: '{n} récompenses premium t’attendent', ver: 'Voir le pass', termina: 'Se termine dans {t}', cerrar: 'Fermer',
    gratis: 'Gratuit', premium: 'Premium', premium_activo: 'Premium actif', plus_activo: 'Premium Plus actif',
    reclamar: 'Récupérer', reclamar_todo: 'Tout récupérer ({n})', reclamado: 'Fait', bloqueado: 'P{n}', requiere: 'Premium',
    comprar_premium: 'Pass Premium · {p}', comprar_plus: 'Premium Plus · {p}', plus_det: 'Tout le premium et +{n} paliers tout de suite',
    premium_txt: 'Des récompenses sur les 40 paliers, des cosmétiques exclusifs et jusqu’à {c} crédits remboursés. Si tu as déjà avancé, tu récupères tout de suite les récompenses de tes paliers.',
    contenido: 'Tout le contenu du pass est visible : pas de boîtes surprises.',
    como_xp: 'Tu gagnes de l’XP en jouant en ligne : ligue, festival, coupe, duels et le Défi du jour. Aujourd’hui : {a} sur {b} XP.',
    misiones: 'Missions', diarias: 'Quotidiennes', semanales: 'Hebdomadaires', hecha: 'Faite !', renuevan: 'Nouvelles dans {t}',
    'mis.d_eventos': 'Joue {n} événements en ligne', 'mis.d_desafio': 'Joue le Défi du jour', 'mis.d_duelo': 'Joue {n} duel',
    'mis.d_liga': 'Joue {n} essais de missions de la ligue', 'mis.d_obras': 'Aide sur {n} chantiers de ton association', 'mis.d_festival': 'Joue {n} tours du festival',
    'mis.d_copa': 'Fais {n} essais de préparation de coupe', 'mis.s_eventos': 'Joue {n} événements en ligne', 'mis.s_copa_equipo': 'Inscris ton équipe de coupe',
    'mis.s_duelos': 'Joue {n} duels', 'mis.s_desafio': 'Joue le Défi du jour {n} jours différents', 'mis.s_obras': 'Aide sur {n} chantiers de ton association',
    'mis.s_liga': 'Joue {n} essais de missions de la ligue', 'mis.s_festival': 'Joue {n} tours du festival',
    saltar: 'Sauter des paliers', saltar_txt: '{p} crédits par palier. Il te reste {q} sauts sur {max} cette saison.', saltar_btn: 'Sauter {n} · {c} crédits',
    saltar_seguro: 'Sauter {n} palier(s) pour {c} crédits ?', confirmar: 'Oui, sauter', cancelar: 'Annuler', saltar_ok: 'Tu es au palier {n} !', saltar_no: 'Tu ne peux plus sauter de paliers cette saison.',
    anterior: '{nombre} : il te reste {t} pour récupérer {k} récompense(s).', creditos_vuelta: 'Crédits remboursés : {a}/{b}',
    cargando: 'Ouverture du pass…', error: 'Impossible d’ouvrir le pass.', reintentar: 'Réessayer', sin_sesion: 'Connecte-toi pour jouer au Pass de saison.',
    proxima: 'Le Pass de saison commence dans {t}', reclamado_ok: 'C’est fait ! {r}', reclamados_ok: 'Tu as récupéré {n} récompenses !', sin_tienda: 'La boutique n’est pas disponible pour le moment.',
    revisar: 'En vérification', tienda_txt: 'Des récompenses sur les 40 paliers et jusqu’à {c} crédits remboursés.',
    't.d': '{n} j', 't.h': '{n} h', 't.m': '{n} min',
    'r.creditos': '{n} crédits', 'r.cable': '{n} câbles', 'r.battery': '{n} batteries', 'r.acel': 'Accélérateur {t}', 'r.reparar_todo': 'Réparation totale',
    'r.estrella': 'Équipe star · {n} matchs', 'r.marco': 'Cadre de société', 'r.deco': 'Déco du QG', 'r.titulo': 'Titre de chat', 'r.insignia': 'Insigne',
    'mat.cables': 'Câbles', 'mat.placas': 'Cartes', 'mat.paneles': 'Panneaux LED', 'mat.credenciales': 'Accréditations', 'mat.planos': 'Plans', 'mat.chips': 'Puces 4K',
    'tema.halloween': 'Nuit des Calaveras', 'tema.navidad': 'Lumières de Noël', 'tema.pase_nino': 'Défilé de l’Enfant', 'tema.fin_anio': 'Nouvel An en direct',
    'tema.san_valentin': 'L’amour en direct', 'tema.pascua': 'Semaine sainte en direct', 'tema.carnaval': 'Carnaval en direct', 'tema.estadios': 'Tournée des stades',
    'tema.festivales': 'Été des festivals', 'tema.estrenos': 'Soirées de première', 'tema.conciertos': 'Tournée de concerts', temporada: 'Saison {n} · {tema}',
    'err.ya_reclamado': 'Tu as déjà récupéré cette récompense.', 'err.nivel_bloqueado': 'Tu n’as pas encore atteint ce palier. Continue !', 'err.premium_requerido': 'Cette récompense fait partie du Pass Premium.',
    'err.saltos_tope': 'Tu n’as plus de sauts cette saison.', 'err.sin_creditos': 'Tu n’as pas assez de crédits.', 'err.nivel_max': 'Tu es presque au max : saute moins de paliers.',
    'err.gracia_terminada': 'Ces récompenses ont expiré.', 'err.sin_temporada': 'Le Pass de saison n’a pas encore commencé.', 'err.red': 'Pas de connexion. Réessaie.',
    'err.pase_ya_premium': 'Tu as déjà le Pass Premium de cette saison.',
  };
  TRAD.de = {
    toca: 'Tippe auf eine Belohnung, um zu sehen, was drin ist.', titulo: 'Saisonpass', tag: 'Saisonpass', nivel_de: 'Stufe {n}/{max}', nivel_n: 'St {n}', xp: '{a}/{b} XP', xp_max: 'Höchste Stufe!',
    por_reclamar: '{n} Belohnungen abholbereit', por_reclamar1: '1 Belohnung abholbereit', nada: 'Spiel online, um aufzusteigen',
    esperando: '{n} Premium-Belohnungen warten auf dich', ver: 'Pass öffnen', termina: 'Endet in {t}', cerrar: 'Schließen',
    gratis: 'Gratis', premium: 'Premium', premium_activo: 'Premium aktiv', plus_activo: 'Premium Plus aktiv',
    reclamar: 'Abholen', reclamar_todo: 'Alles abholen ({n})', reclamado: 'Erledigt', bloqueado: 'St {n}', requiere: 'Premium',
    comprar_premium: 'Premium-Pass · {p}', comprar_plus: 'Premium Plus · {p}', plus_det: 'Alles aus Premium und sofort +{n} Stufen',
    premium_txt: 'Belohnungen auf allen 40 Stufen, exklusive Kosmetik und bis zu {c} Credits zurück. Schon weiter? Dann holst du die Belohnungen deiner Stufen sofort ab.',
    contenido: 'Alles im Pass ist offen sichtbar: keine Lootboxen.',
    como_xp: 'XP bekommst du online: Liga, Festival, Cup, Duelle und die Tages-Challenge. Heute: {a} von {b} XP.',
    misiones: 'Missionen', diarias: 'Täglich', semanales: 'Wöchentlich', hecha: 'Geschafft!', renuevan: 'Neue in {t}',
    'mis.d_eventos': 'Spiel {n} Online-Events', 'mis.d_desafio': 'Spiel die Tages-Challenge', 'mis.d_duelo': 'Spiel {n} Duell',
    'mis.d_liga': 'Spiel {n} Versuche bei Liga-Aufträgen', 'mis.d_obras': 'Hilf bei {n} Bauprojekten deines Verbands', 'mis.d_festival': 'Spiel {n} Festival-Runden',
    'mis.d_copa': 'Mach {n} Cup-Vorbereitungsversuche', 'mis.s_eventos': 'Spiel {n} Online-Events', 'mis.s_copa_equipo': 'Melde dein Cup-Team an',
    'mis.s_duelos': 'Spiel {n} Duelle', 'mis.s_desafio': 'Spiel die Tages-Challenge an {n} verschiedenen Tagen', 'mis.s_obras': 'Hilf bei {n} Bauprojekten deines Verbands',
    'mis.s_liga': 'Spiel {n} Versuche bei Liga-Aufträgen', 'mis.s_festival': 'Spiel {n} Festival-Runden',
    saltar: 'Stufen überspringen', saltar_txt: '{p} Credits pro Stufe. Du hast diese Saison noch {q} von {max} Sprüngen.', saltar_btn: '{n} überspringen · {c} Credits',
    saltar_seguro: '{n} Stufe(n) für {c} Credits überspringen?', confirmar: 'Ja, überspringen', cancelar: 'Abbrechen', saltar_ok: 'Du bist jetzt auf Stufe {n}!', saltar_no: 'Diese Saison kannst du keine Stufen mehr überspringen.',
    anterior: '{nombre}: Du hast noch {t}, um {k} Belohnung(en) abzuholen.', creditos_vuelta: 'Credits zurück: {a}/{b}',
    cargando: 'Pass wird geöffnet…', error: 'Der Pass konnte nicht geöffnet werden.', reintentar: 'Nochmal versuchen', sin_sesion: 'Melde dich an, um den Saisonpass zu spielen.',
    proxima: 'Der Saisonpass startet in {t}', reclamado_ok: 'Erledigt! {r}', reclamados_ok: 'Du hast {n} Belohnungen abgeholt!', sin_tienda: 'Der Shop ist gerade nicht verfügbar.',
    revisar: 'Wird geprüft', tienda_txt: 'Belohnungen auf allen 40 Stufen und bis zu {c} Credits zurück.',
    't.d': '{n} T', 't.h': '{n} Std', 't.m': '{n} Min',
    'r.creditos': '{n} Credits', 'r.cable': '{n} Kabel', 'r.battery': '{n} Akkus', 'r.acel': 'Beschleuniger {t}', 'r.reparar_todo': 'Komplettreparatur',
    'r.estrella': 'Star-Crew · {n} Spiele', 'r.marco': 'Firmenrahmen', 'r.deco': 'Deko fürs Hauptquartier', 'r.titulo': 'Chat-Titel', 'r.insignia': 'Abzeichen',
    'mat.cables': 'Kabel', 'mat.placas': 'Platinen', 'mat.paneles': 'LED-Panels', 'mat.credenciales': 'Presseausweise', 'mat.planos': 'Baupläne', 'mat.chips': '4K-Chips',
    'tema.halloween': 'Nacht der Totenköpfe', 'tema.navidad': 'Weihnachtslichter', 'tema.pase_nino': 'Umzug des Jesuskinds', 'tema.fin_anio': 'Silvester live',
    'tema.san_valentin': 'Liebe live', 'tema.pascua': 'Karwoche live', 'tema.carnaval': 'Karneval live', 'tema.estadios': 'Stadiontour',
    'tema.festivales': 'Festivalsommer', 'tema.estrenos': 'Premierennächte', 'tema.conciertos': 'Konzerttour', temporada: 'Saison {n} · {tema}',
    'err.ya_reclamado': 'Diese Belohnung hast du schon abgeholt.', 'err.nivel_bloqueado': 'Diese Stufe hast du noch nicht erreicht. Spiel weiter!', 'err.premium_requerido': 'Diese Belohnung gehört zum Premium-Pass.',
    'err.saltos_tope': 'Du hast diese Saison keine Sprünge mehr.', 'err.sin_creditos': 'Deine Credits reichen nicht.', 'err.nivel_max': 'Du bist fast am Maximum: spring weniger Stufen.',
    'err.gracia_terminada': 'Diese Belohnungen sind abgelaufen.', 'err.sin_temporada': 'Der Saisonpass hat noch nicht begonnen.', 'err.red': 'Keine Verbindung. Versuch es nochmal.',
    'err.pase_ya_premium': 'Du hast den Premium-Pass dieser Saison schon.',
  };
  TRAD.it = {
    toca: 'Tocca un premio per vedere cosa contiene.', titulo: 'Pass stagionale', tag: 'Pass stagionale', nivel_de: 'Livello {n}/{max}', nivel_n: 'Lv {n}', xp: '{a}/{b} XP', xp_max: 'Livello massimo!',
    por_reclamar: '{n} premi da riscattare', por_reclamar1: '1 premio da riscattare', nada: 'Gioca online per salire di livello',
    esperando: '{n} premi premium ti aspettano', ver: 'Apri il pass', termina: 'Finisce tra {t}', cerrar: 'Chiudi',
    gratis: 'Gratis', premium: 'Premium', premium_activo: 'Premium attivo', plus_activo: 'Premium Plus attivo',
    reclamar: 'Riscatta', reclamar_todo: 'Riscatta tutto ({n})', reclamado: 'Fatto', bloqueado: 'Lv {n}', requiere: 'Premium',
    comprar_premium: 'Pass Premium · {p}', comprar_plus: 'Premium Plus · {p}', plus_det: 'Tutto il premium e subito +{n} livelli',
    premium_txt: 'Premi su tutti i 40 livelli, cosmetici esclusivi e fino a {c} crediti indietro. Se sei già avanti, riscatti subito i premi dei livelli che hai.',
    contenido: 'Tutto quello che c’è nel pass è visibile: niente casse a sorpresa.',
    como_xp: 'Guadagni XP giocando online: lega, festival, coppa, duelli e la Sfida del giorno. Oggi: {a} su {b} XP.',
    misiones: 'Missioni', diarias: 'Giornaliere', semanales: 'Settimanali', hecha: 'Fatta!', renuevan: 'Nuove tra {t}',
    'mis.d_eventos': 'Gioca {n} eventi online', 'mis.d_desafio': 'Gioca la Sfida del giorno', 'mis.d_duelo': 'Gioca {n} duello',
    'mis.d_liga': 'Gioca {n} tentativi di incarichi della lega', 'mis.d_obras': 'Aiuta in {n} cantieri della tua associazione', 'mis.d_festival': 'Gioca {n} turni del festival',
    'mis.d_copa': 'Fai {n} tentativi di preparazione della coppa', 'mis.s_eventos': 'Gioca {n} eventi online', 'mis.s_copa_equipo': 'Iscrivi la tua squadra di coppa',
    'mis.s_duelos': 'Gioca {n} duelli', 'mis.s_desafio': 'Gioca la Sfida del giorno in {n} giorni diversi', 'mis.s_obras': 'Aiuta in {n} cantieri della tua associazione',
    'mis.s_liga': 'Gioca {n} tentativi di incarichi della lega', 'mis.s_festival': 'Gioca {n} turni del festival',
    saltar: 'Salta livelli', saltar_txt: '{p} crediti per livello. Ti restano {q} salti su {max} in questa stagione.', saltar_btn: 'Salta {n} · {c} crediti',
    saltar_seguro: 'Saltare {n} livello/i per {c} crediti?', confirmar: 'Sì, salta', cancelar: 'Annulla', saltar_ok: 'Sei arrivato al livello {n}!', saltar_no: 'In questa stagione non puoi saltare altri livelli.',
    anterior: '{nombre}: ti restano {t} per riscattare {k} premio/i.', creditos_vuelta: 'Crediti indietro: {a}/{b}',
    cargando: 'Apro il pass…', error: 'Non è stato possibile aprire il pass.', reintentar: 'Riprova', sin_sesion: 'Accedi al tuo account per giocare il Pass stagionale.',
    proxima: 'Il Pass stagionale inizia tra {t}', reclamado_ok: 'Fatto! {r}', reclamados_ok: 'Hai riscattato {n} premi!', sin_tienda: 'Il negozio non è disponibile ora.',
    revisar: 'In revisione', tienda_txt: 'Premi su tutti i 40 livelli e fino a {c} crediti indietro.',
    't.d': '{n} g', 't.h': '{n} h', 't.m': '{n} min',
    'r.creditos': '{n} crediti', 'r.cable': '{n} cavi', 'r.battery': '{n} batterie', 'r.acel': 'Acceleratore {t}', 'r.reparar_todo': 'Riparazione totale',
    'r.estrella': 'Staff stella · {n} partite', 'r.marco': 'Cornice della casa di produzione', 'r.deco': 'Decorazione della sede', 'r.titulo': 'Titolo in chat', 'r.insignia': 'Distintivo',
    'mat.cables': 'Cavi', 'mat.placas': 'Schede', 'mat.paneles': 'Pannelli LED', 'mat.credenciales': 'Accrediti', 'mat.planos': 'Progetti', 'mat.chips': 'Chip 4K',
    'tema.halloween': 'Notte dei Teschi', 'tema.navidad': 'Luci di Natale', 'tema.pase_nino': 'Sfilata del Bambinello', 'tema.fin_anio': 'Capodanno in diretta',
    'tema.san_valentin': 'Amore in diretta', 'tema.pascua': 'Settimana Santa in diretta', 'tema.carnaval': 'Carnevale in diretta', 'tema.estadios': 'Tour degli stadi',
    'tema.festivales': 'Estate dei festival', 'tema.estrenos': 'Notti di prima', 'tema.conciertos': 'Tour di concerti', temporada: 'Stagione {n} · {tema}',
    'err.ya_reclamado': 'Hai già riscattato questo premio.', 'err.nivel_bloqueado': 'Non sei ancora a quel livello. Continua a giocare!', 'err.premium_requerido': 'Questo premio fa parte del Pass Premium.',
    'err.saltos_tope': 'Non ti restano salti in questa stagione.', 'err.sin_creditos': 'Non hai abbastanza crediti.', 'err.nivel_max': 'Sei quasi al massimo: salta meno livelli.',
    'err.gracia_terminada': 'Quei premi sono scaduti.', 'err.sin_temporada': 'Il Pass stagionale non è ancora iniziato.', 'err.red': 'Nessuna connessione. Riprova.',
    'err.pase_ya_premium': 'Hai già il Pass Premium di questa stagione.',
  };
  TRAD.ru = {
    toca: 'Нажми на награду, чтобы увидеть, что в ней.', titulo: 'Сезонный пропуск', tag: 'Сезонный пропуск', nivel_de: 'Уровень {n}/{max}', nivel_n: 'Ур. {n}', xp: '{a}/{b} XP', xp_max: 'Максимальный уровень!',
    por_reclamar: 'Наград к получению: {n}', por_reclamar1: '1 награда к получению', nada: 'Играй онлайн, чтобы поднять уровень',
    esperando: 'Тебя ждут премиум-награды: {n}', ver: 'Открыть пропуск', termina: 'Закончится через {t}', cerrar: 'Закрыть',
    gratis: 'Бесплатно', premium: 'Премиум', premium_activo: 'Премиум активен', plus_activo: 'Премиум Плюс активен',
    reclamar: 'Забрать', reclamar_todo: 'Забрать всё ({n})', reclamado: 'Готово', bloqueado: 'Ур. {n}', requiere: 'Премиум',
    comprar_premium: 'Премиум-пропуск · {p}', comprar_plus: 'Премиум Плюс · {p}', plus_det: 'Весь премиум и сразу +{n} уровней',
    premium_txt: 'Награды на всех 40 уровнях, эксклюзивная косметика и до {c} кредитов назад. Если ты уже продвинулся, сразу забираешь награды за свои уровни.',
    contenido: 'Всё содержимое пропуска видно заранее: никаких лутбоксов.',
    como_xp: 'XP даётся за игру онлайн: лига, фестиваль, кубок, дуэли и Испытание дня. Сегодня: {a} из {b} XP.',
    misiones: 'Задания', diarias: 'Ежедневные', semanales: 'Еженедельные', hecha: 'Выполнено!', renuevan: 'Новые через {t}',
    'mis.d_eventos': 'Сыграй онлайн-событий: {n}', 'mis.d_desafio': 'Сыграй Испытание дня', 'mis.d_duelo': 'Сыграй дуэлей: {n}',
    'mis.d_liga': 'Сыграй попыток заказов лиги: {n}', 'mis.d_obras': 'Помоги на стройках своей ассоциации: {n}', 'mis.d_festival': 'Сыграй ходов фестиваля: {n}',
    'mis.d_copa': 'Сделай попыток подготовки к кубку: {n}', 'mis.s_eventos': 'Сыграй онлайн-событий: {n}', 'mis.s_copa_equipo': 'Зарегистрируй свою команду на кубок',
    'mis.s_duelos': 'Сыграй дуэлей: {n}', 'mis.s_desafio': 'Сыграй Испытание дня в разные дни: {n}', 'mis.s_obras': 'Помоги на стройках своей ассоциации: {n}',
    'mis.s_liga': 'Сыграй попыток заказов лиги: {n}', 'mis.s_festival': 'Сыграй ходов фестиваля: {n}',
    saltar: 'Пропуск уровней', saltar_txt: '{p} кредитов за уровень. В этом сезоне осталось прыжков: {q} из {max}.', saltar_btn: 'Пропустить {n} · {c} кредитов',
    saltar_seguro: 'Пропустить уровней: {n} за {c} кредитов?', confirmar: 'Да, пропустить', cancelar: 'Отмена', saltar_ok: 'Ты на уровне {n}!', saltar_no: 'В этом сезоне больше нельзя пропускать уровни.',
    anterior: '{nombre}: осталось {t}, чтобы забрать награды ({k}).', creditos_vuelta: 'Кредиты назад: {a}/{b}',
    cargando: 'Открываем пропуск…', error: 'Не удалось открыть пропуск.', reintentar: 'Попробовать снова', sin_sesion: 'Войди в аккаунт, чтобы играть в сезонный пропуск.',
    proxima: 'Сезонный пропуск начнётся через {t}', reclamado_ok: 'Готово! {r}', reclamados_ok: 'Ты забрал наград: {n}!', sin_tienda: 'Магазин сейчас недоступен.',
    revisar: 'На проверке', tienda_txt: 'Награды на всех 40 уровнях и до {c} кредитов назад.',
    't.d': '{n} д', 't.h': '{n} ч', 't.m': '{n} мин',
    'r.creditos': '{n} кредитов', 'r.cable': 'Кабели: {n}', 'r.battery': 'Аккумуляторы: {n}', 'r.acel': 'Ускоритель {t}', 'r.reparar_todo': 'Полный ремонт',
    'r.estrella': 'Звёздный персонал · матчей: {n}', 'r.marco': 'Рамка студии', 'r.deco': 'Украшение базы', 'r.titulo': 'Титул в чате', 'r.insignia': 'Значок',
    'mat.cables': 'Кабели', 'mat.placas': 'Платы', 'mat.paneles': 'LED-панели', 'mat.credenciales': 'Пропуска прессы', 'mat.planos': 'Чертежи', 'mat.chips': '4K-чипы',
    'tema.halloween': 'Ночь черепов', 'tema.navidad': 'Огни Рождества', 'tema.pase_nino': 'Шествие Младенца', 'tema.fin_anio': 'Новый год в эфире',
    'tema.san_valentin': 'Любовь в эфире', 'tema.pascua': 'Страстная неделя в эфире', 'tema.carnaval': 'Карнавал в эфире', 'tema.estadios': 'Тур по стадионам',
    'tema.festivales': 'Лето фестивалей', 'tema.estrenos': 'Ночи премьер', 'tema.conciertos': 'Концертный тур', temporada: 'Сезон {n} · {tema}',
    'err.ya_reclamado': 'Ты уже забрал эту награду.', 'err.nivel_bloqueado': 'Ты ещё не дошёл до этого уровня. Играй дальше!', 'err.premium_requerido': 'Эта награда из премиум-пропуска.',
    'err.saltos_tope': 'В этом сезоне прыжков больше нет.', 'err.sin_creditos': 'Не хватает кредитов.', 'err.nivel_max': 'Ты почти на максимуме: пропусти меньше уровней.',
    'err.gracia_terminada': 'Срок этих наград истёк.', 'err.sin_temporada': 'Сезонный пропуск ещё не начался.', 'err.red': 'Нет соединения. Попробуй снова.',
    'err.pase_ya_premium': 'У тебя уже есть премиум-пропуск этого сезона.',
  };
  TRAD.tr = {
    toca: 'İçinde ne olduğunu görmek için bir ödüle dokun.', titulo: 'Sezon Kartı', tag: 'Sezon Kartı', nivel_de: 'Seviye {n}/{max}', nivel_n: 'Sv {n}', xp: '{a}/{b} XP', xp_max: 'En yüksek seviye!',
    por_reclamar: 'Alınacak {n} ödül', por_reclamar1: 'Alınacak 1 ödül', nada: 'Seviye atlamak için çevrim içi oyna',
    esperando: '{n} premium ödül seni bekliyor', ver: 'Kartı aç', termina: '{t} sonra bitiyor', cerrar: 'Kapat',
    gratis: 'Ücretsiz', premium: 'Premium', premium_activo: 'Premium aktif', plus_activo: 'Premium Plus aktif',
    reclamar: 'Al', reclamar_todo: 'Hepsini al ({n})', reclamado: 'Alındı', bloqueado: 'Sv {n}', requiere: 'Premium',
    comprar_premium: 'Premium Kart · {p}', comprar_plus: 'Premium Plus · {p}', plus_det: 'Premium’un tamamı ve hemen +{n} seviye',
    premium_txt: '40 seviyenin hepsinde ödül, özel kozmetikler ve {c} krediye kadar geri ödeme. Zaten ilerlediysen, sahip olduğun seviyelerin ödüllerini hemen alırsın.',
    contenido: 'Kartın içindeki her şey açıkça görünür: sürpriz kutu yok.',
    como_xp: 'XP’yi çevrim içi oynayarak kazanırsın: lig, festival, kupa, düellolar ve Günün Mücadelesi. Bugün: {b} XP’nin {a}’sı.',
    misiones: 'Görevler', diarias: 'Günlük', semanales: 'Haftalık', hecha: 'Tamam!', renuevan: 'Yenileri {t} sonra',
    'mis.d_eventos': '{n} çevrim içi etkinlik oyna', 'mis.d_desafio': 'Günün Mücadelesi’ni oyna', 'mis.d_duelo': '{n} düello oyna',
    'mis.d_liga': 'Lig siparişlerinde {n} deneme oyna', 'mis.d_obras': 'Derneğinin {n} inşaatına yardım et', 'mis.d_festival': 'Festivalde {n} tur oyna',
    'mis.d_copa': 'Kupa hazırlığında {n} deneme yap', 'mis.s_eventos': '{n} çevrim içi etkinlik oyna', 'mis.s_copa_equipo': 'Kupa takımını kaydet',
    'mis.s_duelos': '{n} düello oyna', 'mis.s_desafio': 'Günün Mücadelesi’ni {n} farklı günde oyna', 'mis.s_obras': 'Derneğinin {n} inşaatına yardım et',
    'mis.s_liga': 'Lig siparişlerinde {n} deneme oyna', 'mis.s_festival': 'Festivalde {n} tur oyna',
    saltar: 'Seviye atla', saltar_txt: 'Seviye başına {p} kredi. Bu sezon {max} atlamadan {q} tane kaldı.', saltar_btn: '{n} atla · {c} kredi',
    saltar_seguro: '{c} krediye {n} seviye atlansın mı?', confirmar: 'Evet, atla', cancelar: 'Vazgeç', saltar_ok: 'Seviye {n} oldun!', saltar_no: 'Bu sezon artık seviye atlayamazsın.',
    anterior: '{nombre}: {k} ödülü almak için {t} kaldı.', creditos_vuelta: 'Geri dönen kredi: {a}/{b}',
    cargando: 'Kart açılıyor…', error: 'Kart açılamadı.', reintentar: 'Tekrar dene', sin_sesion: 'Sezon Kartı’nı oynamak için hesabına gir.',
    proxima: 'Sezon Kartı {t} sonra başlıyor', reclamado_ok: 'Tamam! {r}', reclamados_ok: '{n} ödül aldın!', sin_tienda: 'Mağaza şu anda kullanılamıyor.',
    revisar: 'İnceleniyor', tienda_txt: '40 seviyenin hepsinde ödül ve {c} krediye kadar geri ödeme.',
    't.d': '{n} g', 't.h': '{n} sa', 't.m': '{n} dk',
    'r.creditos': '{n} kredi', 'r.cable': '{n} kablo', 'r.battery': '{n} batarya', 'r.acel': 'Hızlandırıcı {t}', 'r.reparar_todo': 'Tam onarım',
    'r.estrella': 'Yıldız ekip · {n} maç', 'r.marco': 'Yapımcı çerçevesi', 'r.deco': 'Merkez süsü', 'r.titulo': 'Sohbet unvanı', 'r.insignia': 'Rozet',
    'mat.cables': 'Kablolar', 'mat.placas': 'Kartlar', 'mat.paneles': 'LED paneller', 'mat.credenciales': 'Basın kartları', 'mat.planos': 'Planlar', 'mat.chips': '4K çipler',
    'tema.halloween': 'Kafatası Gecesi', 'tema.navidad': 'Noel Işıkları', 'tema.pase_nino': 'Çocuk İsa Geçidi', 'tema.fin_anio': 'Canlı Yılbaşı',
    'tema.san_valentin': 'Canlı Aşk', 'tema.pascua': 'Canlı Kutsal Hafta', 'tema.carnaval': 'Canlı Karnaval', 'tema.estadios': 'Stadyum Turnesi',
    'tema.festivales': 'Festival Yazı', 'tema.estrenos': 'Gala Geceleri', 'tema.conciertos': 'Konser Turnesi', temporada: 'Sezon {n} · {tema}',
    'err.ya_reclamado': 'Bu ödülü zaten aldın.', 'err.nivel_bloqueado': 'Henüz o seviyeye gelmedin. Oynamaya devam!', 'err.premium_requerido': 'Bu ödül Premium Kart’a ait.',
    'err.saltos_tope': 'Bu sezon atlama hakkın kalmadı.', 'err.sin_creditos': 'Kredin yetmiyor.', 'err.nivel_max': 'Neredeyse zirvedesin: daha az seviye atla.',
    'err.gracia_terminada': 'Bu ödüllerin süresi doldu.', 'err.sin_temporada': 'Sezon Kartı henüz başlamadı.', 'err.red': 'Bağlantı yok. Tekrar dene.',
    'err.pase_ya_premium': 'Bu sezonun Premium Kart’ı zaten sende.',
  };
  TRAD.id = {
    toca: 'Ketuk hadiah untuk melihat isinya.', titulo: 'Season Pass', tag: 'Season Pass', nivel_de: 'Level {n}/{max}', nivel_n: 'Lv {n}', xp: '{a}/{b} XP', xp_max: 'Level maksimal!',
    por_reclamar: '{n} hadiah siap diklaim', por_reclamar1: '1 hadiah siap diklaim', nada: 'Main online untuk naik level',
    esperando: '{n} hadiah premium menunggumu', ver: 'Buka pass', termina: 'Berakhir dalam {t}', cerrar: 'Tutup',
    gratis: 'Gratis', premium: 'Premium', premium_activo: 'Premium aktif', plus_activo: 'Premium Plus aktif',
    reclamar: 'Klaim', reclamar_todo: 'Klaim semua ({n})', reclamado: 'Beres', bloqueado: 'Lv {n}', requiere: 'Premium',
    comprar_premium: 'Pass Premium · {p}', comprar_plus: 'Premium Plus · {p}', plus_det: 'Semua premium dan langsung +{n} level',
    premium_txt: 'Hadiah di semua 40 level, kosmetik eksklusif, dan sampai {c} kredit kembali. Kalau kamu sudah maju, kamu langsung klaim hadiah level yang sudah kamu punya.',
    contenido: 'Semua isi pass terlihat jelas: tanpa kotak acak.',
    como_xp: 'Kamu dapat XP dengan main online: liga, festival, piala, duel, dan Tantangan Harian. Hari ini: {a} dari {b} XP.',
    misiones: 'Misi', diarias: 'Harian', semanales: 'Mingguan', hecha: 'Selesai!', renuevan: 'Misi baru dalam {t}',
    'mis.d_eventos': 'Mainkan {n} acara online', 'mis.d_desafio': 'Mainkan Tantangan Harian', 'mis.d_duelo': 'Mainkan {n} duel',
    'mis.d_liga': 'Mainkan {n} percobaan pesanan liga', 'mis.d_obras': 'Bantu {n} proyek bangunan asosiasimu', 'mis.d_festival': 'Mainkan {n} giliran festival',
    'mis.d_copa': 'Lakukan {n} percobaan persiapan piala', 'mis.s_eventos': 'Mainkan {n} acara online', 'mis.s_copa_equipo': 'Daftarkan tim pialamu',
    'mis.s_duelos': 'Mainkan {n} duel', 'mis.s_desafio': 'Mainkan Tantangan Harian di {n} hari berbeda', 'mis.s_obras': 'Bantu {n} proyek bangunan asosiasimu',
    'mis.s_liga': 'Mainkan {n} percobaan pesanan liga', 'mis.s_festival': 'Mainkan {n} giliran festival',
    saltar: 'Lompati level', saltar_txt: '{p} kredit per level. Sisa {q} dari {max} lompatan musim ini.', saltar_btn: 'Lompati {n} · {c} kredit',
    saltar_seguro: 'Lompati {n} level dengan {c} kredit?', confirmar: 'Ya, lompati', cancelar: 'Batal', saltar_ok: 'Kamu sampai di level {n}!', saltar_no: 'Musim ini kamu tidak bisa melompati level lagi.',
    anterior: '{nombre}: sisa {t} untuk klaim {k} hadiah.', creditos_vuelta: 'Kredit kembali: {a}/{b}',
    cargando: 'Membuka pass…', error: 'Pass tidak bisa dibuka.', reintentar: 'Coba lagi', sin_sesion: 'Masuk ke akunmu untuk main Season Pass.',
    proxima: 'Season Pass mulai dalam {t}', reclamado_ok: 'Beres! {r}', reclamados_ok: 'Kamu klaim {n} hadiah!', sin_tienda: 'Toko sedang tidak tersedia.',
    revisar: 'Sedang ditinjau', tienda_txt: 'Hadiah di semua 40 level dan sampai {c} kredit kembali.',
    't.d': '{n} hr', 't.h': '{n} j', 't.m': '{n} mnt',
    'r.creditos': '{n} kredit', 'r.cable': '{n} kabel', 'r.battery': '{n} baterai', 'r.acel': 'Akselerator {t}', 'r.reparar_todo': 'Perbaikan total',
    'r.estrella': 'Kru bintang · {n} pertandingan', 'r.marco': 'Bingkai rumah produksi', 'r.deco': 'Hiasan markas', 'r.titulo': 'Gelar di chat', 'r.insignia': 'Lencana',
    'mat.cables': 'Kabel', 'mat.placas': 'Papan sirkuit', 'mat.paneles': 'Panel LED', 'mat.credenciales': 'Kartu pers', 'mat.planos': 'Cetak biru', 'mat.chips': 'Chip 4K',
    'tema.halloween': 'Malam Tengkorak', 'tema.navidad': 'Lampu Natal', 'tema.pase_nino': 'Arak-arakan Kanak Yesus', 'tema.fin_anio': 'Tahun Baru Live',
    'tema.san_valentin': 'Cinta Live', 'tema.pascua': 'Pekan Suci Live', 'tema.carnaval': 'Karnaval Live', 'tema.estadios': 'Tur Stadion',
    'tema.festivales': 'Musim Panas Festival', 'tema.estrenos': 'Malam Premiere', 'tema.conciertos': 'Tur Konser', temporada: 'Musim {n} · {tema}',
    'err.ya_reclamado': 'Kamu sudah klaim hadiah itu.', 'err.nivel_bloqueado': 'Kamu belum sampai level itu. Terus main!', 'err.premium_requerido': 'Hadiah itu bagian dari Pass Premium.',
    'err.saltos_tope': 'Lompatanmu musim ini sudah habis.', 'err.sin_creditos': 'Kreditmu tidak cukup.', 'err.nivel_max': 'Kamu hampir maksimal: lompati lebih sedikit level.',
    'err.gracia_terminada': 'Hadiah itu sudah kedaluwarsa.', 'err.sin_temporada': 'Season Pass belum dimulai.', 'err.red': 'Tidak ada koneksi. Coba lagi.',
    'err.pase_ya_premium': 'Kamu sudah punya Pass Premium musim ini.',
  };
  TRAD['zh-CN'] = {
    toca: '点一下奖励，看看里面有什么。', titulo: '赛季通行证', tag: '赛季通行证', nivel_de: '等级 {n}/{max}', nivel_n: '{n}级', xp: '{a}/{b} XP', xp_max: '已满级！',
    por_reclamar: '{n} 个奖励待领取', por_reclamar1: '1 个奖励待领取', nada: '在线游玩来升级',
    esperando: '{n} 个高级奖励在等你', ver: '查看通行证', termina: '{t}后结束', cerrar: '关闭',
    gratis: '免费', premium: '高级', premium_activo: '高级版已开通', plus_activo: '高级 Plus 已开通',
    reclamar: '领取', reclamar_todo: '全部领取（{n}）', reclamado: '已领', bloqueado: '{n}级', requiere: '高级',
    comprar_premium: '高级通行证 · {p}', comprar_plus: '高级 Plus · {p}', plus_det: '全部高级奖励，并立即 +{n} 级',
    premium_txt: '40 个等级全部有奖励，专属装扮，最多返还 {c} 积分。如果你已经升了级，可以立刻领取已达等级的奖励。',
    contenido: '通行证的所有内容一目了然：没有随机宝箱。',
    como_xp: '在线游玩获得 XP：联赛、音乐节、杯赛、对决和每日挑战。今天：{a}/{b} XP。',
    misiones: '任务', diarias: '每日', semanales: '每周', hecha: '完成！', renuevan: '{t}后刷新',
    'mis.d_eventos': '完成 {n} 场在线活动', 'mis.d_desafio': '玩一次每日挑战', 'mis.d_duelo': '进行 {n} 场对决',
    'mis.d_liga': '完成 {n} 次联赛委托尝试', 'mis.d_obras': '帮助你协会的 {n} 项施工', 'mis.d_festival': '完成 {n} 轮音乐节',
    'mis.d_copa': '完成 {n} 次杯赛备战尝试', 'mis.s_eventos': '完成 {n} 场在线活动', 'mis.s_copa_equipo': '登记你的杯赛队伍',
    'mis.s_duelos': '进行 {n} 场对决', 'mis.s_desafio': '在 {n} 个不同的日子玩每日挑战', 'mis.s_obras': '帮助你协会的 {n} 项施工',
    'mis.s_liga': '完成 {n} 次联赛委托尝试', 'mis.s_festival': '完成 {n} 轮音乐节',
    saltar: '跳级', saltar_txt: '每级 {p} 积分。本赛季还剩 {q}/{max} 次跳级。', saltar_btn: '跳 {n} 级 · {c} 积分',
    saltar_seguro: '花 {c} 积分跳 {n} 级？', confirmar: '确定跳级', cancelar: '取消', saltar_ok: '你升到了 {n} 级！', saltar_no: '本赛季不能再跳级了。',
    anterior: '{nombre}：还剩 {t} 领取 {k} 个奖励。', creditos_vuelta: '返还积分：{a}/{b}',
    cargando: '正在打开通行证…', error: '无法打开通行证。', reintentar: '再试一次', sin_sesion: '登录你的账号来玩赛季通行证。',
    proxima: '赛季通行证将在 {t}后开始', reclamado_ok: '领取成功！{r}', reclamados_ok: '你领取了 {n} 个奖励！', sin_tienda: '商店暂时不可用。',
    revisar: '审核中', tienda_txt: '40 个等级全部有奖励，最多返还 {c} 积分。',
    't.d': '{n} 天', 't.h': '{n} 小时', 't.m': '{n} 分钟',
    'r.creditos': '{n} 积分', 'r.cable': '{n} 根线缆', 'r.battery': '{n} 块电池', 'r.acel': '加速器 {t}', 'r.reparar_todo': '全面维修',
    'r.estrella': '明星员工 · {n} 场', 'r.marco': '制作公司头像框', 'r.deco': '总部装饰', 'r.titulo': '聊天称号', 'r.insignia': '徽章',
    'mat.cables': '线缆', 'mat.placas': '电路板', 'mat.paneles': 'LED 面板', 'mat.credenciales': '记者证', 'mat.planos': '图纸', 'mat.chips': '4K 芯片',
    'tema.halloween': '骷髅之夜', 'tema.navidad': '圣诞灯光', 'tema.pase_nino': '圣婴游行', 'tema.fin_anio': '新年直播',
    'tema.san_valentin': '爱的直播', 'tema.pascua': '圣周直播', 'tema.carnaval': '狂欢节直播', 'tema.estadios': '体育场巡回',
    'tema.festivales': '音乐节之夏', 'tema.estrenos': '首映之夜', 'tema.conciertos': '巡回演唱会', temporada: '第 {n} 赛季 · {tema}',
    'err.ya_reclamado': '这个奖励你已经领过了。', 'err.nivel_bloqueado': '你还没到这个等级，继续加油！', 'err.premium_requerido': '这是高级通行证的奖励。',
    'err.saltos_tope': '本赛季的跳级次数用完了。', 'err.sin_creditos': '你的积分不够。', 'err.nivel_max': '你快满级了：少跳几级吧。',
    'err.gracia_terminada': '这些奖励已经过期。', 'err.sin_temporada': '赛季通行证还没开始。', 'err.red': '没有网络，请再试一次。',
    'err.pase_ya_premium': '你已经有本赛季的高级通行证了。',
  };

  function idioma() { try { const c = root.I18N && root.I18N.idioma; return c && TRAD[c] ? c : 'es'; } catch (e) { return 'es'; } }
  function tiene(k) { const d = TRAD[idioma()]; return (d && Object.prototype.hasOwnProperty.call(d, k)) || Object.prototype.hasOwnProperty.call(TRAD.es, k); }
  function t(k, p) {
    const d = TRAD[idioma()];
    const v = d && Object.prototype.hasOwnProperty.call(d, k) ? d[k] : TRAD.es[k];
    const s = v === undefined ? k : String(v);
    return p ? s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined && p[x] !== null ? String(p[x]) : m)) : s;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const locale = () => { try { const L = root.I18N && root.I18N.idiomas && root.I18N.idiomas.find((x) => x.code === idioma()); return (L && L.locale) || (idioma() === 'es' ? 'es-EC' : idioma()); } catch (e) { return 'es-EC'; } };
  const num = (n) => { try { return Number(n || 0).toLocaleString(locale()); } catch (e) { return String(n); } };
  const precio = (p) => { try { return '$' + Number(p).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return '$' + p; } };
  /** Precio REAL de un producto: el que da ui.js (ctx.precio → Google Play dentro de la app, Pago Plux en la web).
      null = no se vende en este canal (el botón no sale). Sin ctx.precio: solo fuera de la app, con el precio del servidor. */
  function precioDe(ctx, id, usd) {
    try { if (ctx && typeof ctx.precio === 'function') { const v = ctx.precio(id, usd); return v ? String(v) : null; } } catch (e) { return null; }
    try { if (root.GooglePlay && root.GooglePlay.enApp && root.GooglePlay.enApp()) return null; } catch (e) { return null; }
    return usd !== undefined && usd !== null && isFinite(Number(usd)) ? precio(usd) : null;
  }
  /** Cuenta regresiva corta: 3 días o más = días; menos = días y horas (redondeando hacia arriba); menos de 1 h = minutos. */
  function tiempo(seg) {
    seg = Math.max(0, Number(seg) || 0);
    if (seg >= 3 * 86400) return t('t.d', { n: Math.floor(seg / 86400) });
    if (seg < 3600) return t('t.m', { n: Math.max(1, Math.ceil(seg / 60)) });
    const h = Math.ceil(seg / 3600);
    if (h < 24) return t('t.h', { n: h });
    return t('t.d', { n: Math.floor(h / 24) }) + (h % 24 ? ' ' + t('t.h', { n: h % 24 }) : '');
  }

  /* ---------- Premios: ícono y nombre ---------- */
  const ICO_MAT = { cables: '🔌', placas: '🧩', paneles: '💡', credenciales: '🪪', planos: '📐', chips: '💾' };
  const ICO_COS = { marco: '🖼️', deco: '🏮', titulo: '🏷️', insignia: '🎖️' };
  function icono(r) {
    switch (r.tipo) {
      case 'dinero': return '💵';
      case 'creditos': return '💎';
      case 'consumible': return r.item === 'battery' ? '🔋' : '🔌';
      case 'materiales': return ICO_MAT[r.item] || '📦';
      case 'acelerador': return '⏩';
      case 'reparar_todo': return '🛠️';
      case 'estrella': return '🌟';
      case 'cosmetico': return ICO_COS[r.clase] || '✨';
      default: return '🎁';
    }
  }
  function horas(min) { return min % 60 === 0 ? t('t.h', { n: min / 60 }) : t('t.m', { n: min }); }
  /** Texto corto para la celda (cantidad) y nombre completo (detalle). */
  function corto(r, ctx) {
    switch (r.tipo) {
      case 'dinero': return money(ctx, r.cantidad);
      case 'creditos': return '+' + num(r.cantidad);
      case 'consumible': case 'materiales': return '×' + num(r.cantidad);
      case 'acelerador': return horas(r.cantidad);
      case 'estrella': return '×' + r.cantidad;
      case 'cosmetico': return t('r.' + (r.clase || 'insignia'));
      case 'reparar_todo': return '100 %';
      default: return '×' + num(r.cantidad);
    }
  }
  function nombre(r, ctx, tema) {
    if (idioma() === 'es' && r.nombre) return r.nombre;   // el servidor ya lo manda en español
    switch (r.tipo) {
      case 'dinero': return money(ctx, r.cantidad);
      case 'creditos': return t('r.creditos', { n: num(r.cantidad) });
      case 'consumible': return t(r.item === 'battery' ? 'r.battery' : 'r.cable', { n: r.cantidad });
      case 'materiales': return r.cantidad + ' × ' + t('mat.' + r.item);
      case 'acelerador': return t('r.acel', { t: horas(r.cantidad) });
      case 'reparar_todo': return t('r.reparar_todo');
      case 'estrella': return t('r.estrella', { n: r.cantidad });
      case 'cosmetico': return t('r.' + (r.clase || 'insignia')) + (tema ? ' «' + t('tema.' + tema) + '»' : '');
      default: return r.nombre || (r.cantidad + ' × ' + r.item);
    }
  }
  function money(ctx, n) { try { if (ctx && typeof ctx.M === 'function') return ctx.M(n); } catch (e) { /* abajo */ } return '$' + num(n); }
  const nombreTemp = (tp) => (tp ? t('temporada', { n: tp.numero, tema: tiene('tema.' + tp.tema) ? t('tema.' + tp.tema) : tp.nombre_tema }) : '');

  /* ---------- Servidor ---------- */
  async function pedir(metodo, ruta, cuerpo) {
    let r;
    try {
      r = await fetch(ruta, { method: metodo, credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': idioma() },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    } catch (e) { const x = new Error(t('err.red')); x.codigo = 'red'; throw x; }
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || j.ok === false) {
      const cod = (j && j.codigo) || 'error';
      const x = new Error(tiene('err.' + cod) ? t('err.' + cod) : ((j && j.error) || t('error')));
      x.codigo = cod; x.status = r.status;
      throw x;
    }
    return j;
  }
  const logueado = () => { try { const A = root.Api; return !!(A && A.disponible !== false && typeof A.logueado === 'function' && A.logueado()); } catch (e) { return false; } };

  const st = { quien: undefined, datos: null, cargadoEn: 0, cargando: null, error: '', errorEn: 0, ctx: null, ov: null, sel: null, saltarN: 1, confirmar: false, ocupado: false, reloj: null };

  function cargar(ctx) {
    if (st.cargando) return st.cargando;
    st.cargando = pedir('GET', '/api/pase').then((j) => {
      st.datos = j; st.cargadoEn = Date.now(); st.error = '';
      return j;
    }).catch((e) => { st.error = e.message || t('error'); st.errorEn = Date.now(); throw e; })
      .finally(() => { st.cargando = null; });
    return st.cargando;
  }
  const quedan = (seg) => Math.max(0, seg - (Date.now() - st.cargadoEn) / 1000);

  /* ---------- Estilos (una vez) ---------- */
  function estilos() {
    if (typeof document === 'undefined' || document.getElementById('pase-css')) return;
    const s = document.createElement('style');
    s.id = 'pase-css';
    s.textContent = `
.pase-card h2{font-size:19px;margin:4px 0 6px;overflow-wrap:anywhere}
.pase-card .pase-niv{display:flex;justify-content:space-between;gap:8px;font-size:13px}
.pase-card .pase-aviso{margin:8px 0 0;font-size:14px}
.pase-bar{height:9px;background:var(--panel2);border-radius:9px;overflow:hidden;margin-top:6px}
.pase-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--amber),#ffd36b);border-radius:9px}
.pase-ov{position:fixed;inset:0;z-index:25;background:rgba(4,6,10,.88);display:flex;justify-content:center;overscroll-behavior:contain}
.pase-hoja{width:100%;max-width:640px;height:100%;display:flex;flex-direction:column;background:var(--bg);min-width:0}
.pase-cab{flex:none;display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);min-width:0}
.pase-cab h2{flex:1;min-width:0;font-size:18px;margin:0;line-height:1.2;overflow-wrap:anywhere}
.pase-cab .pase-x{flex:none;width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--text);font-size:20px;line-height:1}
.pase-cuerpo{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px 16px calc(28px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch;min-width:0}
.pase-cuerpo .card{min-width:0}
.pase-res{display:flex;gap:12px;align-items:center}
.pase-badge{flex:none;width:58px;height:58px;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,#3a2a0d,#1d1608);border:2px solid var(--amber);color:var(--amber);font-family:var(--f-head);line-height:1}
.pase-badge b{font-size:24px}.pase-badge small{font-size:10px;letter-spacing:1px}
.pase-res .info{flex:1;min-width:0}
.pase-chip{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;background:#ffb02026;color:var(--amber);border:1px solid #ffb02066}
.pase-chip.off{background:var(--panel2);color:var(--muted);border-color:var(--line)}
.pase-compra{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.pase-compra .btn{margin:0;min-width:0}
.pase-compra .btn small{display:block;font-weight:400;font-size:11px;opacity:.85;margin-top:2px}
.pase-pistas{margin:0 -14px;padding:0 14px}
.pase-scroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;scroll-padding-left:36px;overscroll-behavior-x:contain;padding:2px 0 8px;scrollbar-width:thin;max-width:100%}
.pase-grid{display:flex;gap:6px;width:max-content}
.pase-lbl{position:sticky;left:0;z-index:2;flex:none;width:30px;display:flex;flex-direction:column;gap:6px;background:var(--panel)}
.pase-lbl div{display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:11px;font-weight:700;writing-mode:vertical-rl;transform:rotate(180deg);letter-spacing:1px;text-transform:uppercase}
.pase-lbl .n{height:22px;writing-mode:horizontal-tb;transform:none}
.pase-lbl.cjk div{transform:none;text-orientation:upright;letter-spacing:2px}
.pase-lbl .g{height:86px;background:var(--panel2);color:var(--text)}
.pase-lbl .p{height:86px;background:#ffb02022;color:var(--amber)}
.pase-col{flex:none;width:74px;display:flex;flex-direction:column;gap:6px;scroll-snap-align:start}
.pase-col .n{height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--muted);border-radius:8px}
.pase-col.hecho .n{color:var(--text)}
.pase-col.actual .n{background:var(--amber);color:#1a1205}
.pase-celda{appearance:none;font:inherit;color:var(--text);width:74px;height:86px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px 3px;position:relative;overflow:hidden;text-align:center;cursor:pointer}
.pase-celda .i{font-size:26px;line-height:1.1}
.pase-celda .c{font-size:11px;font-weight:700;line-height:1.15;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pase-celda .e{font-size:10px;color:var(--muted);line-height:1.1;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pase-celda.p{background:linear-gradient(180deg,#2a2112,var(--panel2))}
.pase-celda.vacia{background:transparent;border-style:dashed;opacity:.35;cursor:default}
.pase-celda.disponible{border-color:var(--green);box-shadow:0 0 0 1px var(--green) inset}
.pase-celda.disponible .e{color:var(--green);font-weight:700}
.pase-celda.reclamado{opacity:.55}
.pase-celda.reclamado::after{content:'✓';position:absolute;top:3px;right:6px;font-size:13px;color:var(--green);font-weight:700}
.pase-celda.bloqueado .i,.pase-celda.requiere_premium .i{filter:grayscale(.7);opacity:.75}
.pase-celda.requiere_premium .e{color:var(--amber)}
.pase-celda.sel{outline:2px solid var(--blue);outline-offset:1px}
.pase-det{min-height:20px;font-size:13px;margin-top:6px;overflow-wrap:anywhere}
.pase-det .muted{font-size:12px}
.pase-mis{display:flex;gap:10px;align-items:center;margin:8px 0}
.pase-mis .tx{flex:1;min-width:0;font-size:14px;overflow-wrap:anywhere}
.pase-mis .xp{flex:none;font-size:12px;font-weight:700;color:var(--amber)}
.pase-mis.hecha .tx{color:var(--muted);text-decoration:line-through}
.pase-salto{display:flex;align-items:center;gap:8px;margin-top:8px}
.pase-salto .paso{flex:none;width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--text);font-size:20px;font-weight:700}
.pase-salto .btn{flex:1;margin:0;min-width:0}
.pase-conf{display:flex;gap:8px;margin-top:8px}.pase-conf .btn{margin:0;min-width:0}
.pase-ant{border-color:var(--amber)}
`;
    document.head.appendChild(s);
  }

  /* ---------- Tarjeta de Inicio ---------- */
  // Otra cuenta en el mismo celular: no mostrar el pase de la anterior
  function mismaCuenta() {
    let id = null;
    try { id = root.Api && root.Api.estado && root.Api.estado.jugador ? root.Api.estado.jugador.id : null; } catch (e) { id = null; }
    if (id !== st.quien) { st.quien = id; st.datos = null; st.cargadoEn = 0; st.errorEn = 0; st.error = ''; }
  }
  function tarjeta(ctx) {
    if (!logueado()) return '';
    estilos();
    mismaCuenta();
    st.ctx = ctx;
    const d = st.datos;
    const viejo = !d || Date.now() - st.cargadoEn > 60000;
    if (viejo && !st.cargando && Date.now() - st.errorEn > 60000) {
      cargar(ctx).then(() => { try { if (ctx && typeof ctx.render === 'function') ctx.render(); } catch (e) { /* nada */ } }).catch(() => {});
    }
    if (!d) return `<div class="card pase-card" data-pase="tarjeta"><div class="story-tag">${esc(t('tag'))}</div><p class="small muted" style="margin:6px 0 0">${esc(st.error || t('cargando'))}</p></div>`;
    if (!d.temporada) {
      const p = d.proxima;
      return `<div class="card pase-card" data-pase="tarjeta"><div class="story-tag">${esc(t('tag'))}</div>
        <p class="small" style="margin:6px 0 0">${esc(p ? p.icono + ' ' : '')}${esc(t('proxima', { t: tiempo(p ? (Date.parse(p.inicio) - Date.now()) / 1000 : 0) }))}</p></div>`;
    }
    const tp = d.temporada, por = d.por_reclamar || {};
    const pct = d.nivel >= d.niveles ? 100 : Math.round(100 * d.xp_nivel / d.xp_por_nivel);
    const ant = d.anterior && d.anterior.por_reclamar ? d.anterior.por_reclamar.total : 0;
    const total = (por.total || 0) + ant;
    const aviso = total > 0
      ? `<p class="pase-aviso"><b style="color:var(--green)">🎁 ${esc(total === 1 ? t('por_reclamar1') : t('por_reclamar', { n: total }))}</b></p>`
      : (!d.premium && por.premium_esperando ? `<p class="pase-aviso small" style="color:var(--amber)">🔒 ${esc(t('esperando', { n: por.premium_esperando }))}</p>` : `<p class="pase-aviso small muted">${esc(t('nada'))}</p>`);
    return `<div class="card pase-card" data-pase="tarjeta">
      <div class="row between"><div class="story-tag">${esc(t('tag'))}</div><span class="small" style="color:var(--amber)">${esc(t('termina', { t: tiempo(quedan(tp.quedan_seg)) }))}</span></div>
      <h2>${esc(tp.icono)} ${esc(nombreTemp(tp))}</h2>
      <div class="pase-niv"><b>${esc(t('nivel_de', { n: d.nivel, max: d.niveles }))}</b>${d.premium ? `<span class="pase-chip">${esc(d.plus ? t('plus_activo') : t('premium_activo'))}</span>` : ''}<span class="num muted">${esc(d.nivel >= d.niveles ? t('xp_max') : t('xp', { a: num(d.xp_nivel), b: num(d.xp_por_nivel) }))}</span></div>
      <div class="pase-bar"><i style="width:${pct}%"></i></div>
      ${aviso}
      <button class="btn main" data-ext="pase" data-acc="abrir">${esc(t('ver'))}</button></div>`;
  }

  function fichaTienda(ctx) {
    if (!logueado()) return '';
    estilos();
    const d = st.datos;
    const tope = d ? d.creditos_tope : 420;
    return `<div class="card pase-card" data-pase="ficha"><div class="story-tag">${esc(t('tag'))}</div>
      ${d && d.temporada ? `<h2>${esc(d.temporada.icono)} ${esc(nombreTemp(d.temporada))}</h2>` : ''}
      <p class="small muted" style="margin:4px 0">${esc(t('tienda_txt', { c: num(tope) }))}</p>
      <button class="btn main" data-ext="pase" data-acc="abrir">${esc(t('ver'))}</button></div>`;
  }

  function clic(ctx, acc) {
    if (acc === 'abrir') abrir(ctx);
  }

  /* ---------- Pantalla completa ---------- */
  function abrir(ctx) {
    if (typeof document === 'undefined') return;
    estilos();
    st.ctx = ctx || st.ctx || {};
    st.sel = null; st.confirmar = false;
    if (!st.ov) {
      const ov = document.createElement('div');
      ov.id = 'pase-ov'; ov.className = 'pase-ov';
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
      ov.addEventListener('click', alClic);
      document.body.appendChild(ov);
      st.ov = ov;
      st.htmlOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.addEventListener('keydown', alTecla);
    }
    pintar(true);
    cargar(st.ctx).then(() => pintar(true)).catch(() => pintar());
    clearInterval(st.reloj);
    st.reloj = setInterval(() => { const el = st.ov && st.ov.querySelector('[data-pase-termina]'); if (el && st.datos && st.datos.temporada) el.textContent = t('termina', { t: tiempo(quedan(st.datos.temporada.quedan_seg)) }); }, 30000);
  }
  function cerrar() {
    if (!st.ov) return;
    st.ov.removeEventListener('click', alClic);
    st.ov.remove(); st.ov = null;
    document.removeEventListener('keydown', alTecla);
    document.documentElement.style.overflow = st.htmlOverflow || '';
    clearInterval(st.reloj);
    try { if (st.ctx && typeof st.ctx.render === 'function') st.ctx.render(); } catch (e) { /* nada */ }
  }
  function alTecla(e) { if (e.key === 'Escape') cerrar(); }
  function aviso(msg) { try { if (st.ctx && typeof st.ctx.toast === 'function') { st.ctx.toast(msg); return; } } catch (e) { /* abajo */ } try { console.log('[pase] ' + msg); } catch (e) { /* nada */ } }
  function sonido(n) { try { if (st.ctx && st.ctx.snd && st.ctx.snd.play) st.ctx.snd.play(n); } catch (e) { /* sin sonido */ } }

  function celda(c, pista, nivel, ctx, tema) {
    if (!c) return `<div class="pase-celda vacia" aria-hidden="true"></div>`;
    const r = c.recompensa;
    const est = c.estado;
    const e = est === 'disponible' ? t('reclamar') : est === 'reclamado' ? (c.revisar ? t('revisar') : t('reclamado')) : est === 'requiere_premium' ? '🔒 ' + t('requiere') : est === 'bloqueado' ? t('bloqueado', { n: nivel }) : '';
    const sel = st.sel && st.sel.nivel === nivel && st.sel.pista === pista ? ' sel' : '';
    return `<button type="button" class="pase-celda ${pista === 'premium' ? 'p' : 'g'} ${est}${sel}" data-pase-celda data-nivel="${nivel}" data-pista="${pista}" title="${esc(nombre(r, ctx, tema))}" aria-label="${esc(t('nivel_n', { n: nivel }) + ' · ' + nombre(r, ctx, tema) + ' · ' + e)}">
      <span class="i" aria-hidden="true">${icono(r)}</span><span class="c">${esc(corto(r, ctx))}</span><span class="e">${esc(e)}</span></button>`;
  }

  function pistasHtml(d, ctx) {
    const porNivel = { gratis: {}, premium: {} };
    d.pistas.gratis.forEach((x) => { porNivel.gratis[x.nivel] = x; });
    d.pistas.premium.forEach((x) => { porNivel.premium[x.nivel] = x; });
    let cols = '';
    for (let n = 1; n <= d.niveles; n++) {
      const cls = n <= d.nivel ? ' hecho' : '';
      const act = n === Math.min(d.niveles, d.nivel + 1) ? ' actual' : '';
      cols += `<div class="pase-col${cls}${act}" data-col="${n}"><div class="n">${n}</div>${celda(porNivel.gratis[n], 'gratis', n, ctx, d.temporada.tema)}${celda(porNivel.premium[n], 'premium', n, ctx, d.temporada.tema)}</div>`;
    }
    const det = st.sel ? detalle(d, ctx) : `<span class="muted">${esc(t('toca'))}</span>`;
    return `<div class="pase-pistas"><div class="pase-scroll" data-pase="pistas"><div class="pase-grid">
      <div class="pase-lbl${/^(zh|ja|ko)/.test(idioma()) ? ' cjk' : ''}"><div class="n"></div><div class="g">${esc(t('gratis'))}</div><div class="p">${esc(t('premium'))}</div></div>${cols}</div></div></div>
      <div class="pase-det" data-pase="detalle">${det}</div>`;
  }
  function detalle(d, ctx) {
    const s = st.sel;
    const c = (d.pistas[s.pista] || []).find((x) => x.nivel === s.nivel);
    if (!c) return '';
    return `<b>${esc(t('nivel_n', { n: s.nivel }))} · ${esc(t(s.pista))}:</b> ${esc(icono(c.recompensa))} ${esc(nombre(c.recompensa, ctx, d.temporada.tema))}`;
  }

  function misionesHtml(d) {
    const m = d.misiones || {};
    const fila = (x) => {
      const pct = Math.round(100 * Math.min(x.avance, x.n) / Math.max(1, x.n));
      const tx = tiene('mis.' + x.id) ? t('mis.' + x.id, { n: x.n }) : x.texto;
      return `<div class="pase-mis${x.hecha ? ' hecha' : ''}" data-mision="${esc(x.id)}"><div class="tx">${x.hecha ? '✅ ' : ''}${esc(tx)}<div class="pase-bar" style="height:6px"><i style="width:${pct}%"></i></div></div>
        <div class="xp">${x.hecha ? esc(t('hecha')) : esc(x.avance + '/' + x.n)}<br><span class="muted">+${num(x.xp)} XP</span></div></div>`;
    };
    const ren = (iso) => (iso ? `<span class="small muted">${esc(t('renuevan', { t: tiempo((Date.parse(iso) - Date.parse(d.ahora)) / 1000 - (Date.now() - st.cargadoEn) / 1000) }))}</span>` : '');
    return `<div class="card" data-pase="misiones"><div class="row between"><b>${esc(t('diarias'))}</b>${ren(m.diarias_fin)}</div>${(m.diarias || []).map(fila).join('')}
      <div class="row between" style="margin-top:12px"><b>${esc(t('semanales'))}</b>${ren(m.semanales_fin)}</div>${(m.semanales || []).map(fila).join('')}
      <p class="small muted" style="margin:10px 0 0">${esc(t('como_xp', { a: num(d.xp_hoy), b: num(d.xp_tope_dia) }))}</p></div>`;
  }

  function saltosHtml(d) {
    const s = d.saltos;
    if (!s) return '';
    if (s.max_ahora <= 0) return `<div class="card" data-pase="saltar"><b>${esc(t('saltar'))}</b><p class="small muted" style="margin:6px 0 0">${esc(d.nivel >= d.niveles ? t('xp_max') : t('saltar_no'))}</p></div>`;
    st.saltarN = Math.max(1, Math.min(st.saltarN, s.max_ahora));
    const costo = st.saltarN * s.precio;
    const conf = st.confirmar
      ? `<p class="small" style="margin:10px 0 0">${esc(t('saltar_seguro', { n: st.saltarN, c: num(costo) }))}</p><div class="pase-conf"><button class="btn main" data-pase-acc="saltar-si">${esc(t('confirmar'))}</button><button class="btn" data-pase-acc="saltar-no">${esc(t('cancelar'))}</button></div>`
      : `<div class="pase-salto"><button class="paso" data-pase-acc="menos" aria-label="-" ${st.saltarN <= 1 ? 'disabled' : ''}>−</button><button class="btn" data-pase-acc="saltar">💎 ${esc(t('saltar_btn', { n: st.saltarN, c: num(costo) }))}</button><button class="paso" data-pase-acc="mas" aria-label="+" ${st.saltarN >= s.max_ahora ? 'disabled' : ''}>+</button></div>`;
    return `<div class="card" data-pase="saltar"><b>${esc(t('saltar'))}</b><p class="small muted" style="margin:4px 0 0">${esc(t('saltar_txt', { p: num(s.precio), q: s.max - s.usados, max: s.max }))}</p>${conf}</div>`;
  }

  function pintar(alActual) {
    if (!st.ov) return;
    const ctx = st.ctx || {};
    const d = st.datos;
    const scrollY = st.ov.querySelector('.pase-cuerpo') ? st.ov.querySelector('.pase-cuerpo').scrollTop : 0;
    const scrollX = st.ov.querySelector('.pase-scroll') ? st.ov.querySelector('.pase-scroll').scrollLeft : null;
    let cuerpo;
    if (!logueado()) cuerpo = `<div class="card"><p>${esc(t('sin_sesion'))}</p></div>`;
    else if (!d && st.error) cuerpo = `<div class="card" data-pase="error"><p>${esc(t('error'))}</p><p class="small muted">${esc(st.error)}</p><button class="btn main" data-pase-acc="reintentar">${esc(t('reintentar'))}</button></div>`;
    else if (!d) cuerpo = `<div class="card"><p class="muted">${esc(t('cargando'))}</p></div>`;
    else if (!d.temporada) cuerpo = `<div class="card"><p>${esc(t('proxima', { t: tiempo(d.proxima ? (Date.parse(d.proxima.inicio) - Date.parse(d.ahora)) / 1000 : 0) }))}</p></div>`;
    else cuerpo = cuerpoHtml(d, ctx);
    const tp = d && d.temporada;
    st.ov.innerHTML = `<div class="pase-hoja"><header class="pase-cab"><h2>${tp ? esc(tp.icono) + ' ' : ''}${esc(tp ? nombreTemp(tp) : t('titulo'))}</h2>
      <button class="pase-x" data-pase-acc="cerrar" aria-label="${esc(t('cerrar'))}">✕</button></header><div class="pase-cuerpo" data-pase="cuerpo">${cuerpo}</div></div>`;
    const cu = st.ov.querySelector('.pase-cuerpo'); if (cu) cu.scrollTop = scrollY;
    const sc = st.ov.querySelector('.pase-scroll');
    if (sc && d && d.temporada) {
      if (alActual || scrollX === null) {
        const col = sc.querySelector('.pase-col.actual') || sc.querySelector('.pase-col');
        const lbl = sc.querySelector('.pase-lbl');
        if (col) sc.scrollLeft = Math.max(0, sc.scrollLeft + col.getBoundingClientRect().left - sc.getBoundingClientRect().left - (lbl ? lbl.offsetWidth : 0) - 6 - 80);
      } else sc.scrollLeft = scrollX;
    }
  }

  function cuerpoHtml(d, ctx) {
    const tp = d.temporada, por = d.por_reclamar || {};
    const ant = d.anterior;
    const totalAnt = ant && ant.por_reclamar ? ant.por_reclamar.total : 0;
    const total = (por.total || 0) + totalAnt;
    const pct = d.nivel >= d.niveles ? 100 : Math.round(100 * d.xp_nivel / d.xp_por_nivel);
    const pp = d.productos || {};
    const pPrem = pp.pase_premium && pp.pase_premium.activo !== false ? precioDe(ctx, 'pase_premium', pp.pase_premium.precio) : null;
    const pPlus = pp.pase_premium_plus && pp.pase_premium_plus.activo !== false ? precioDe(ctx, 'pase_premium_plus', pp.pase_premium_plus.precio) : null;
    const compra = d.premium
      ? `<p class="small muted" style="margin:8px 0 0">${esc(t('creditos_vuelta', { a: num(d.creditos_dados), b: num(d.creditos_tope) }))}</p>`
      : `<p class="small" style="margin:10px 0 0">${esc(t('premium_txt', { c: num(d.creditos_tope) }))}</p>
         <div class="pase-compra">
           ${pPrem ? `<button class="btn main" data-pase-comprar="pase_premium">⭐ ${esc(t('comprar_premium', { p: pPrem }))}</button>` : ''}
           ${pPlus ? `<button class="btn" data-pase-comprar="pase_premium_plus">🚀 ${esc(t('comprar_plus', { p: pPlus }))}<small>${esc(t('plus_det', { n: pp.pase_premium_plus.niveles || 10 }))}</small></button>` : ''}
         </div><p class="small muted" style="margin:6px 0 0">${esc(t('contenido'))}</p>`;
    const antHtml = totalAnt ? `<div class="card pase-ant" data-pase="anterior"><p class="small" style="margin:0">⏳ ${esc(t('anterior', { nombre: nombreTemp(ant.temporada), t: tiempo((Date.parse(ant.gracia_hasta) - Date.parse(d.ahora)) / 1000 - (Date.now() - st.cargadoEn) / 1000), k: totalAnt }))}</p></div>` : '';
    return `<div class="card" data-pase="resumen">
        <div class="pase-res"><div class="pase-badge"><small>${esc(t('nivel_n', { n: '' }).trim())}</small><b>${d.nivel}</b></div>
          <div class="info"><div class="row between" style="gap:6px;flex-wrap:wrap"><span class="small" data-pase-termina style="color:var(--amber)">${esc(t('termina', { t: tiempo(quedan(tp.quedan_seg)) }))}</span>
            <span class="pase-chip${d.premium ? '' : ' off'}">${esc(d.premium ? (d.plus ? t('plus_activo') : t('premium_activo')) : t('gratis'))}</span></div>
            <div class="pase-bar"><i style="width:${pct}%"></i></div>
            <div class="small muted" style="margin-top:4px">${esc(t('nivel_de', { n: d.nivel, max: d.niveles }))} · ${esc(d.nivel >= d.niveles ? t('xp_max') : t('xp', { a: num(d.xp_nivel), b: num(d.xp_por_nivel) }))}</div></div></div>
        ${compra}
      </div>
      ${antHtml}
      ${total > 0 ? `<button class="btn main" data-pase-acc="todo" style="margin:0 0 12px">🎁 ${esc(t('reclamar_todo', { n: total }))}</button>` : ''}
      <div class="card" data-pase="premios">${pistasHtml(d, ctx)}</div>
      <div class="sectitle">${esc(t('misiones'))}</div>
      ${misionesHtml(d)}
      ${saltosHtml(d)}`;
  }

  async function alClic(e) {
    const b = e.target.closest('[data-pase-acc],[data-pase-celda],[data-pase-comprar]');
    if (!b || b.disabled || !st.ov || !st.ov.contains(b)) return;
    e.preventDefault(); e.stopPropagation();
    const ctx = st.ctx || {};
    if (b.hasAttribute('data-pase-comprar')) {
      const id = b.getAttribute('data-pase-comprar');
      sonido('tap');
      if (typeof ctx.onComprar === 'function') { try { await ctx.onComprar(id); } catch (err) { aviso(err && err.message ? err.message : t('sin_tienda')); } } else aviso(t('sin_tienda'));
      return;
    }
    if (b.hasAttribute('data-pase-celda')) {
      const nivel = Number(b.getAttribute('data-nivel')), pista = b.getAttribute('data-pista');
      st.sel = { nivel, pista };
      if (b.classList.contains('disponible')) return reclamar(nivel, pista);
      sonido('tap');
      st.ov.querySelectorAll('.pase-celda.sel').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      const det = st.ov.querySelector('[data-pase="detalle"]'); if (det && st.datos) det.innerHTML = detalle(st.datos, ctx);
      return;
    }
    const acc = b.getAttribute('data-pase-acc');
    if (acc === 'cerrar') return cerrar();
    if (acc === 'reintentar') { st.error = ''; pintar(); cargar(ctx).then(() => pintar(true)).catch(() => pintar()); return; }
    if (acc === 'todo') return reclamarTodo();
    if (acc === 'menos' || acc === 'mas') { st.saltarN += acc === 'mas' ? 1 : -1; sonido('tap'); return pintar(); }
    if (acc === 'saltar') { st.confirmar = true; sonido('tap'); return pintar(); }
    if (acc === 'saltar-no') { st.confirmar = false; return pintar(); }
    if (acc === 'saltar-si') return saltar(st.saltarN);
  }

  async function accion(fn) {
    if (st.ocupado) return null;
    st.ocupado = true;
    try { return await fn(); } catch (err) { aviso(err.message || t('error')); sonido('error'); if (err.codigo !== 'red') { try { await cargar(st.ctx); } catch (x) { /* queda lo de antes */ } pintar(); } return null; } finally { st.ocupado = false; }
  }
  async function despues(j) {
    if (j && j.pase) { st.datos = j.pase; st.cargadoEn = Date.now(); }
    pintar();
    try { if (st.ctx && typeof st.ctx.alReclamar === 'function') await st.ctx.alReclamar(j); } catch (e) { /* se aplica la próxima vez */ }
  }
  function reclamar(nivel, pista) {
    const d = st.datos;
    const temp = d && d.temporada ? d.temporada.numero : undefined;
    return accion(async () => {
      const j = await pedir('POST', '/api/pase/reclamar', { nivel, pista, temporada: temp });
      sonido('buy');
      aviso(t('reclamado_ok', { r: nombre(j.reclamado.recompensa, st.ctx, d.temporada.tema) }));
      await despues(j);
    });
  }
  function reclamarTodo() {
    return accion(async () => {
      const j = await pedir('POST', '/api/pase/reclamar_todo', {});
      sonido('buy');
      aviso(t('reclamados_ok', { n: (j.reclamados || []).length }));
      await despues(j);
    });
  }
  function saltar(n) {
    return accion(async () => {
      const j = await pedir('POST', '/api/pase/saltar', { niveles: n });
      st.confirmar = false; st.saltarN = 1;
      sonido('chapter');
      aviso(t('saltar_ok', { n: j.pase ? j.pase.nivel : '' }));
      try { if (root.Api && root.Api.estado && typeof j.creditos === 'number') root.Api.estado.creditos = j.creditos; } catch (e) { /* nada */ }
      await despues(j);
    });
  }

  /** Vuelve a pedir /api/pase (por ejemplo, al volver de pagar el premium). */
  function recargar(ctx) {
    st.cargadoEn = 0; st.errorEn = 0;
    return cargar(ctx || st.ctx).then((j) => { pintar(); try { const c = ctx || st.ctx; if (c && typeof c.render === 'function') c.render(); } catch (e) { /* nada */ } return j; }).catch(() => { pintar(); return null; });
  }

  const API = { tarjeta, clic, abrir, cerrar, fichaTienda, recargar, TRAD, t, _st: st };
  root.Pase = API;
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === 'pase')) root.EnVivoInicio.push({ id: 'pase', orden: 7, tarjeta, clic });
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
