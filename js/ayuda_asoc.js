/* =========================================================
   EN VIVO Tycoon — Asociación: Ayudas de un toque, Investigación y Tienda de fichas (estilo Kingshot)
   Contrato: server/INTEGRAR_AYUDA_ASOC.md (GET /api/asoc/ayuda · /api/asoc/ayuda/resumen; POST /api/asoc/ayuda/pedir ·
   /api/asoc/ayuda/todos · /api/asoc/investigacion/donar · /api/asoc/tienda/comprar). El servidor decide todo; aquí se
   muestra y se pide. Todo es gratis (fichas que se ganan ayudando y donando; nada con dinero real).
   - Globo flotante 🤝 con el número de pedidos (encima del botón del chat): UN toque = "Ayudar a todos".
   - Panel propio (#aa-panel) con pestañas Ayudas / Investigación / Tienda. Se abre desde la barra de la pestaña
     "Asociación" del chat (Chat llama AyudaAsoc.barra) o con AyudaAsoc.abrir('ayudas' | 'investigacion' | 'tienda').
   - js/sede.js pone el botón "Pedir ayuda" en cada obra oficial con AyudaAsoc.botonPedir(obra).
   - Extensión de logic.js (Game.registrarExtension): multPago = +x % de la investigación "Contratos dorados".
     AyudaAsoc.multReparar() da el factor del "Taller compartido" (ver INTEGRAR para la línea de logic.js).
   - ctx (el del chat, ui.js ctxChat): { Api, A, toast, snd, dinero?(), gastarDinero?(m) }. Sin dinero()/gastarDinero()
     no se ofrece donar dinero del juego (solo materiales de la sede oficial).
   - Textos: español y 9 idiomas aquí mismo (TRAD). API: window.AyudaAsoc = { iniciar, abrir, cerrar, barra, botonPedir,
     refrescar, bonos, multPago, multReparar, TRAD }.
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------- Textos ---------- */
  const TRAD = {};
  TRAD.es = {
    titulo: 'Asociación', tab_ayudas: 'Ayudas', tab_inv: 'Investigación', tab_tienda: 'Tienda', cerrar: 'Cerrar', fichas: '{n} fichas',
    nivel: 'Nivel {n}/{max}', puntos: '{p}/{s} puntos para el nivel {n}', puntos_max: '{p} puntos · nivel máximo', tope: 'Hasta {n} ayudas por obra',
    ayudar_todos: 'Ayudar a todos ({n})', ayuda_info: 'Cada ayuda le quita 1 % o 5 minutos a la obra y te da 1 ficha (hasta {f} por día).',
    hoy_ayudas: 'Hoy: {a}/{am} ayudas · {f}/{fm} fichas', pendientes_t: 'Pedidos de tu asociación', nada_pend: 'Nadie está pidiendo ayuda ahora. ¡Vuelve en un rato!',
    obra_det: '{ed} · faltan {t} · ayudas {n}/{m}', mis_obras_t: 'Tus obras', sin_obras: 'No tienes obras en curso. Empieza una mejora en tu sede oficial.',
    pedir: 'Pedir ayuda', pedida: 'Ayuda pedida', pedir_todas: 'Pedir ayuda en todas', espera: 'Llevas poco tiempo en la asociación: podrás ayudar y donar en {t}.',
    sin_asoc: 'Únete a una asociación para pedir y dar ayudas, investigar y usar la tienda.', sin_sesion: 'Entra a tu cuenta para usar la asociación.',
    cargando: 'Cargando…', error_carga: 'No se pudo cargar.', reintentar: 'Intentar de nuevo',
    ok_todos: 'Ayudaste en {n} obras: −{t} en total · +{f} fichas', ok_tope: 'Llegaste al tope de ayudas de hoy.', ok_pedir: 'Tu asociación ya ve tu pedido ({n}).',
    inv_info: 'Dona a la investigación: todos los socios reciben los bonos y tú ganas fichas.', inv_nivel_info: 'Cada nivel de la asociación da +1 ayuda por obra.',
    'tech.paga_eventos': 'Contratos dorados', 'techd.paga_eventos': '+{e} % de pago en los eventos por nivel',
    'tech.reparacion': 'Taller compartido', 'techd.reparacion': '−{e} % en el costo de reparar por nivel',
    'tech.refuerzos': 'Refuerzos', 'techd.refuerzos': '+{e} ayuda por obra por nivel',
    tech_nivel: 'Nivel {n}/{max} · ahora {total}', tech_max: 'Al máximo', donar_dinero: 'Donar {m}', donar_premio: 'Cada donación: +{p} puntos · +{f} fichas',
    hoy_donar: 'Hoy: {d}/{dm} donaciones · dinero {x}/{xm} · fichas {f}/{fm}', tienes: 'tienes {n}',
    ok_donar: '¡Gracias! +{p} puntos para {tech} · +{f} fichas', ok_subio: '¡{tech} subió al nivel {n}!', ok_subio_asoc: '¡La asociación subió al nivel {n}!',
    falta_dinero: 'Necesitas {m} del juego para donar.', tienda_info: 'Todo con fichas: se ganan ayudando y donando. Sin dinero real ni créditos.',
    'item.caja_materiales': 'Caja de materiales', 'itemd.caja_materiales': '3 de cada material común', 'item.chip': 'Chip 4K', 'itemd.chip': '1 chip de video 4K',
    'item.acel_15': 'Acelerador 15 min', 'itemd.acel_15': '15 minutos para tus obras', 'item.acel_60': 'Acelerador 1 h', 'itemd.acel_60': '60 minutos para tus obras',
    'item.insignia_solidaria': 'Insignia «Solidaria»', 'itemd.insignia_solidaria': 'Cosmética: se ve junto a tu nombre',
    hoy_n: 'Hoy {n}/{m}', una_vez: 'Una sola vez', tuya: 'Ya es tuya', agotado: 'Agotado por hoy', comprar: '{n} fichas', seguro: '¿Seguro? Toca otra vez', ok_comprar: '¡Listo! {item}',
    'mat.cables': 'cables', 'mat.placas': 'placas', 'mat.paneles': 'paneles LED', 'mat.credenciales': 'credenciales', 'mat.planos': 'planos', 'mat.chips': 'chip 4K',
    'ed.control': 'Sala de control', 'ed.bodega': 'Bodega y taller', 'ed.estudio': 'Estudio', 'ed.comercial': 'Oficina comercial', 'ed.movil': 'Unidad móvil',
    'ed.escuela': 'Escuela de personal', 'ed.sede': 'Sede principal', t_d: '{d} d {h} h', t_h: '{h} h {m} min', t_m: '{m} min', globo: 'Ayudar a todos',
    'err.miembro_nuevo': 'Llevas menos de 24 h en tu asociación: todavía no puedes ayudar ni donar.', 'err.sin_pedidos': 'No hay pedidos de ayuda ahora.',
    'err.tope_ayudas_dia': 'Ya diste todas tus ayudas de hoy. Vuelve mañana.', 'err.sin_fichas': 'No te alcanzan las fichas.', 'err.tope_tienda': 'Ya compraste eso las veces de hoy.',
    'err.ya_comprado': 'Ya tienes ese artículo.', 'err.tope_donaciones': 'Ya donaste todo lo de hoy. Vuelve mañana.', 'err.tope_donaciones_dinero': 'Ya donaste dinero todas las veces de hoy: dona materiales.',
    'err.tech_max': 'Esa investigación ya está al máximo.', 'err.faltan_materiales': 'No tienes materiales suficientes.', 'err.sin_asociacion': 'Únete a una asociación primero.',
    'err.ya_pedida': 'Ya pediste ayuda para esa obra.', 'err.sin_obras': 'No tienes obras para pedir ayuda.', 'err.red': 'Sin conexión. Intenta de nuevo.',
  };
  TRAD.en = {
    titulo: 'Association', tab_ayudas: 'Help', tab_inv: 'Research', tab_tienda: 'Shop', cerrar: 'Close', fichas: '{n} tokens',
    nivel: 'Level {n}/{max}', puntos: '{p}/{s} points to level {n}', puntos_max: '{p} points · max level', tope: 'Up to {n} helps per build',
    ayudar_todos: 'Help everyone ({n})', ayuda_info: 'Each help takes 1% or 5 minutes off the build and gives you 1 token (up to {f} a day).',
    hoy_ayudas: 'Today: {a}/{am} helps · {f}/{fm} tokens', pendientes_t: 'Requests from your association', nada_pend: 'Nobody is asking for help right now. Check back soon!',
    obra_det: '{ed} · {t} left · helps {n}/{m}', mis_obras_t: 'Your builds', sin_obras: 'You have no builds in progress. Start an upgrade in your official HQ.',
    pedir: 'Ask for help', pedida: 'Help requested', pedir_todas: 'Ask for help on all', espera: 'You just joined the association: you can help and donate in {t}.',
    sin_asoc: 'Join an association to ask for and give help, research and use the shop.', sin_sesion: 'Log in to use the association.',
    cargando: 'Loading…', error_carga: 'Couldn’t load.', reintentar: 'Try again',
    ok_todos: 'You helped on {n} builds: −{t} in total · +{f} tokens', ok_tope: 'You reached today’s help limit.', ok_pedir: 'Your association can see your request ({n}).',
    inv_info: 'Donate to research: every member gets the bonuses and you earn tokens.', inv_nivel_info: 'Each association level gives +1 help per build.',
    'tech.paga_eventos': 'Golden contracts', 'techd.paga_eventos': '+{e}% event pay per level',
    'tech.reparacion': 'Shared workshop', 'techd.reparacion': '−{e}% repair cost per level',
    'tech.refuerzos': 'Reinforcements', 'techd.refuerzos': '+{e} help per build per level',
    tech_nivel: 'Level {n}/{max} · now {total}', tech_max: 'Maxed out', donar_dinero: 'Donate {m}', donar_premio: 'Each donation: +{p} points · +{f} tokens',
    hoy_donar: 'Today: {d}/{dm} donations · money {x}/{xm} · tokens {f}/{fm}', tienes: 'you have {n}',
    ok_donar: 'Thanks! +{p} points for {tech} · +{f} tokens', ok_subio: '{tech} reached level {n}!', ok_subio_asoc: 'The association reached level {n}!',
    falta_dinero: 'You need {m} in-game to donate.', tienda_info: 'Everything costs tokens: earn them by helping and donating. No real money or credits.',
    'item.caja_materiales': 'Materials crate', 'itemd.caja_materiales': '3 of each common material', 'item.chip': '4K chip', 'itemd.chip': '1 4K video chip',
    'item.acel_15': '15 min speed-up', 'itemd.acel_15': '15 minutes for your builds', 'item.acel_60': '1 h speed-up', 'itemd.acel_60': '60 minutes for your builds',
    'item.insignia_solidaria': '“Team Player” badge', 'itemd.insignia_solidaria': 'Cosmetic: shown next to your name',
    hoy_n: 'Today {n}/{m}', una_vez: 'One time only', tuya: 'Already yours', agotado: 'Sold out today', comprar: '{n} tokens', seguro: 'Sure? Tap again', ok_comprar: 'Done! {item}',
    'mat.cables': 'cables', 'mat.placas': 'boards', 'mat.paneles': 'LED panels', 'mat.credenciales': 'press passes', 'mat.planos': 'blueprints', 'mat.chips': '4K chip',
    'ed.control': 'Control room', 'ed.bodega': 'Warehouse & workshop', 'ed.estudio': 'Studio', 'ed.comercial': 'Sales office', 'ed.movil': 'Mobile unit',
    'ed.escuela': 'Crew school', 'ed.sede': 'Main HQ', t_d: '{d}d {h}h', t_h: '{h}h {m}min', t_m: '{m} min', globo: 'Help everyone',
    'err.miembro_nuevo': 'You’ve been in your association for less than 24 h: you can’t help or donate yet.', 'err.sin_pedidos': 'No help requests right now.',
    'err.tope_ayudas_dia': 'You’ve used all your helps today. Come back tomorrow.', 'err.sin_fichas': 'Not enough tokens.', 'err.tope_tienda': 'You already bought that the maximum times today.',
    'err.ya_comprado': 'You already own that item.', 'err.tope_donaciones': 'You’ve donated everything for today. Come back tomorrow.', 'err.tope_donaciones_dinero': 'No more money donations today: donate materials.',
    'err.tech_max': 'That research is maxed out.', 'err.faltan_materiales': 'Not enough materials.', 'err.sin_asociacion': 'Join an association first.',
    'err.ya_pedida': 'You already asked for help on that build.', 'err.sin_obras': 'You have no builds to ask help for.', 'err.red': 'No connection. Try again.',
  };
  TRAD['pt-BR'] = {
    titulo: 'Associação', tab_ayudas: 'Ajudas', tab_inv: 'Pesquisa', tab_tienda: 'Loja', cerrar: 'Fechar', fichas: '{n} fichas',
    nivel: 'Nível {n}/{max}', puntos: '{p}/{s} pontos para o nível {n}', puntos_max: '{p} pontos · nível máximo', tope: 'Até {n} ajudas por obra',
    ayudar_todos: 'Ajudar todos ({n})', ayuda_info: 'Cada ajuda tira 1% ou 5 minutos da obra e te dá 1 ficha (até {f} por dia).',
    hoy_ayudas: 'Hoje: {a}/{am} ajudas · {f}/{fm} fichas', pendientes_t: 'Pedidos da sua associação', nada_pend: 'Ninguém está pedindo ajuda agora. Volte daqui a pouco!',
    obra_det: '{ed} · faltam {t} · ajudas {n}/{m}', mis_obras_t: 'Suas obras', sin_obras: 'Você não tem obras em andamento. Comece uma melhoria na sua sede oficial.',
    pedir: 'Pedir ajuda', pedida: 'Ajuda pedida', pedir_todas: 'Pedir ajuda em todas', espera: 'Você entrou há pouco na associação: poderá ajudar e doar em {t}.',
    sin_asoc: 'Entre numa associação para pedir e dar ajudas, pesquisar e usar a loja.', sin_sesion: 'Entre na sua conta para usar a associação.',
    cargando: 'Carregando…', error_carga: 'Não foi possível carregar.', reintentar: 'Tentar de novo',
    ok_todos: 'Você ajudou em {n} obras: −{t} no total · +{f} fichas', ok_tope: 'Você chegou ao limite de ajudas de hoje.', ok_pedir: 'Sua associação já vê seu pedido ({n}).',
    inv_info: 'Doe para a pesquisa: todos os sócios recebem os bônus e você ganha fichas.', inv_nivel_info: 'Cada nível da associação dá +1 ajuda por obra.',
    'tech.paga_eventos': 'Contratos dourados', 'techd.paga_eventos': '+{e}% de pagamento nos eventos por nível',
    'tech.reparacion': 'Oficina compartilhada', 'techd.reparacion': '−{e}% no custo de conserto por nível',
    'tech.refuerzos': 'Reforços', 'techd.refuerzos': '+{e} ajuda por obra por nível',
    tech_nivel: 'Nível {n}/{max} · agora {total}', tech_max: 'No máximo', donar_dinero: 'Doar {m}', donar_premio: 'Cada doação: +{p} pontos · +{f} fichas',
    hoy_donar: 'Hoje: {d}/{dm} doações · dinheiro {x}/{xm} · fichas {f}/{fm}', tienes: 'você tem {n}',
    ok_donar: 'Obrigado! +{p} pontos para {tech} · +{f} fichas', ok_subio: '{tech} subiu para o nível {n}!', ok_subio_asoc: 'A associação subiu para o nível {n}!',
    falta_dinero: 'Você precisa de {m} do jogo para doar.', tienda_info: 'Tudo com fichas: ganhe ajudando e doando. Sem dinheiro real nem créditos.',
    'item.caja_materiales': 'Caixa de materiais', 'itemd.caja_materiales': '3 de cada material comum', 'item.chip': 'Chip 4K', 'itemd.chip': '1 chip de vídeo 4K',
    'item.acel_15': 'Acelerador 15 min', 'itemd.acel_15': '15 minutos para suas obras', 'item.acel_60': 'Acelerador 1 h', 'itemd.acel_60': '60 minutos para suas obras',
    'item.insignia_solidaria': 'Insígnia «Solidária»', 'itemd.insignia_solidaria': 'Cosmética: aparece junto ao seu nome',
    hoy_n: 'Hoje {n}/{m}', una_vez: 'Uma vez só', tuya: 'Já é sua', agotado: 'Esgotado hoje', comprar: '{n} fichas', seguro: 'Certeza? Toque de novo', ok_comprar: 'Pronto! {item}',
    'mat.cables': 'cabos', 'mat.placas': 'placas', 'mat.paneles': 'painéis LED', 'mat.credenciales': 'credenciais', 'mat.planos': 'plantas', 'mat.chips': 'chip 4K',
    'ed.control': 'Sala de controle', 'ed.bodega': 'Depósito e oficina', 'ed.estudio': 'Estúdio', 'ed.comercial': 'Escritório comercial', 'ed.movil': 'Unidade móvel',
    'ed.escuela': 'Escola de equipe', 'ed.sede': 'Sede principal', t_d: '{d} d {h} h', t_h: '{h} h {m} min', t_m: '{m} min', globo: 'Ajudar todos',
    'err.miembro_nuevo': 'Você está há menos de 24 h na associação: ainda não pode ajudar nem doar.', 'err.sin_pedidos': 'Não há pedidos de ajuda agora.',
    'err.tope_ayudas_dia': 'Você já deu todas as ajudas de hoje. Volte amanhã.', 'err.sin_fichas': 'Fichas insuficientes.', 'err.tope_tienda': 'Você já comprou isso o máximo de vezes hoje.',
    'err.ya_comprado': 'Você já tem esse item.', 'err.tope_donaciones': 'Você já doou tudo hoje. Volte amanhã.', 'err.tope_donaciones_dinero': 'Chega de doações em dinheiro hoje: doe materiais.',
    'err.tech_max': 'Essa pesquisa já está no máximo.', 'err.faltan_materiales': 'Materiais insuficientes.', 'err.sin_asociacion': 'Entre numa associação primeiro.',
    'err.ya_pedida': 'Você já pediu ajuda para essa obra.', 'err.sin_obras': 'Você não tem obras para pedir ajuda.', 'err.red': 'Sem conexão. Tente de novo.',
  };
  TRAD.fr = {
    titulo: 'Association', tab_ayudas: 'Aides', tab_inv: 'Recherche', tab_tienda: 'Boutique', cerrar: 'Fermer', fichas: '{n} jetons',
    nivel: 'Niveau {n}/{max}', puntos: '{p}/{s} points pour le niveau {n}', puntos_max: '{p} points · niveau max', tope: 'Jusqu’à {n} aides par chantier',
    ayudar_todos: 'Aider tout le monde ({n})', ayuda_info: 'Chaque aide retire 1 % ou 5 minutes au chantier et te donne 1 jeton (jusqu’à {f} par jour).',
    hoy_ayudas: 'Aujourd’hui : {a}/{am} aides · {f}/{fm} jetons', pendientes_t: 'Demandes de ton association', nada_pend: 'Personne ne demande d’aide pour l’instant. Reviens bientôt !',
    obra_det: '{ed} · reste {t} · aides {n}/{m}', mis_obras_t: 'Tes chantiers', sin_obras: 'Aucun chantier en cours. Lance une amélioration dans ton QG officiel.',
    pedir: 'Demander de l’aide', pedida: 'Aide demandée', pedir_todas: 'Demander de l’aide partout', espera: 'Tu viens d’arriver : tu pourras aider et donner dans {t}.',
    sin_asoc: 'Rejoins une association pour demander et donner de l’aide, faire de la recherche et utiliser la boutique.', sin_sesion: 'Connecte-toi pour utiliser l’association.',
    cargando: 'Chargement…', error_carga: 'Impossible de charger.', reintentar: 'Réessayer',
    ok_todos: 'Tu as aidé sur {n} chantiers : −{t} au total · +{f} jetons', ok_tope: 'Tu as atteint la limite d’aides du jour.', ok_pedir: 'Ton association voit ta demande ({n}).',
    inv_info: 'Donne à la recherche : tous les membres reçoivent les bonus et tu gagnes des jetons.', inv_nivel_info: 'Chaque niveau d’association donne +1 aide par chantier.',
    'tech.paga_eventos': 'Contrats en or', 'techd.paga_eventos': '+{e} % de paie des événements par niveau',
    'tech.reparacion': 'Atelier partagé', 'techd.reparacion': '−{e} % sur le coût des réparations par niveau',
    'tech.refuerzos': 'Renforts', 'techd.refuerzos': '+{e} aide par chantier par niveau',
    tech_nivel: 'Niveau {n}/{max} · actuel {total}', tech_max: 'Au maximum', donar_dinero: 'Donner {m}', donar_premio: 'Chaque don : +{p} points · +{f} jetons',
    hoy_donar: 'Aujourd’hui : {d}/{dm} dons · argent {x}/{xm} · jetons {f}/{fm}', tienes: 'tu en as {n}',
    ok_donar: 'Merci ! +{p} points pour {tech} · +{f} jetons', ok_subio: '{tech} passe au niveau {n} !', ok_subio_asoc: 'L’association passe au niveau {n} !',
    falta_dinero: 'Il te faut {m} du jeu pour donner.', tienda_info: 'Tout en jetons : gagne-les en aidant et en donnant. Ni argent réel ni crédits.',
    'item.caja_materiales': 'Caisse de matériaux', 'itemd.caja_materiales': '3 de chaque matériau commun', 'item.chip': 'Puce 4K', 'itemd.chip': '1 puce vidéo 4K',
    'item.acel_15': 'Accélérateur 15 min', 'itemd.acel_15': '15 minutes pour tes chantiers', 'item.acel_60': 'Accélérateur 1 h', 'itemd.acel_60': '60 minutes pour tes chantiers',
    'item.insignia_solidaria': 'Insigne « Solidaire »', 'itemd.insignia_solidaria': 'Cosmétique : affiché à côté de ton nom',
    hoy_n: 'Aujourd’hui {n}/{m}', una_vez: 'Une seule fois', tuya: 'Déjà à toi', agotado: 'Épuisé pour aujourd’hui', comprar: '{n} jetons', seguro: 'Sûr ? Touche encore', ok_comprar: 'C’est fait ! {item}',
    'mat.cables': 'câbles', 'mat.placas': 'cartes', 'mat.paneles': 'panneaux LED', 'mat.credenciales': 'accréditations', 'mat.planos': 'plans', 'mat.chips': 'puce 4K',
    'ed.control': 'Régie', 'ed.bodega': 'Entrepôt et atelier', 'ed.estudio': 'Studio', 'ed.comercial': 'Bureau commercial', 'ed.movil': 'Car régie',
    'ed.escuela': 'École du personnel', 'ed.sede': 'QG principal', t_d: '{d} j {h} h', t_h: '{h} h {m} min', t_m: '{m} min', globo: 'Aider tout le monde',
    'err.miembro_nuevo': 'Tu es dans ton association depuis moins de 24 h : tu ne peux pas encore aider ni donner.', 'err.sin_pedidos': 'Aucune demande d’aide pour l’instant.',
    'err.tope_ayudas_dia': 'Tu as donné toutes tes aides du jour. Reviens demain.', 'err.sin_fichas': 'Pas assez de jetons.', 'err.tope_tienda': 'Tu l’as déjà acheté le maximum de fois aujourd’hui.',
    'err.ya_comprado': 'Tu as déjà cet article.', 'err.tope_donaciones': 'Tu as tout donné pour aujourd’hui. Reviens demain.', 'err.tope_donaciones_dinero': 'Plus de dons d’argent aujourd’hui : donne des matériaux.',
    'err.tech_max': 'Cette recherche est au maximum.', 'err.faltan_materiales': 'Pas assez de matériaux.', 'err.sin_asociacion': 'Rejoins d’abord une association.',
    'err.ya_pedida': 'Tu as déjà demandé de l’aide pour ce chantier.', 'err.sin_obras': 'Tu n’as aucun chantier pour demander de l’aide.', 'err.red': 'Pas de connexion. Réessaie.',
  };
  TRAD.de = {
    titulo: 'Vereinigung', tab_ayudas: 'Hilfen', tab_inv: 'Forschung', tab_tienda: 'Laden', cerrar: 'Schließen', fichas: '{n} Marken',
    nivel: 'Stufe {n}/{max}', puntos: '{p}/{s} Punkte bis Stufe {n}', puntos_max: '{p} Punkte · Höchststufe', tope: 'Bis zu {n} Hilfen pro Bau',
    ayudar_todos: 'Allen helfen ({n})', ayuda_info: 'Jede Hilfe zieht 1 % oder 5 Minuten vom Bau ab und gibt dir 1 Marke (bis {f} pro Tag).',
    hoy_ayudas: 'Heute: {a}/{am} Hilfen · {f}/{fm} Marken', pendientes_t: 'Anfragen deiner Vereinigung', nada_pend: 'Gerade bittet niemand um Hilfe. Schau bald wieder vorbei!',
    obra_det: '{ed} · noch {t} · Hilfen {n}/{m}', mis_obras_t: 'Deine Bauten', sin_obras: 'Du hast keine laufenden Bauten. Starte einen Ausbau in deiner offiziellen Zentrale.',
    pedir: 'Um Hilfe bitten', pedida: 'Hilfe angefragt', pedir_todas: 'Überall um Hilfe bitten', espera: 'Du bist neu in der Vereinigung: helfen und spenden kannst du in {t}.',
    sin_asoc: 'Tritt einer Vereinigung bei, um Hilfe zu bekommen und zu geben, zu forschen und den Laden zu nutzen.', sin_sesion: 'Melde dich an, um die Vereinigung zu nutzen.',
    cargando: 'Lädt…', error_carga: 'Konnte nicht laden.', reintentar: 'Nochmal versuchen',
    ok_todos: 'Du hast bei {n} Bauten geholfen: −{t} insgesamt · +{f} Marken', ok_tope: 'Du hast das Hilfe-Limit für heute erreicht.', ok_pedir: 'Deine Vereinigung sieht deine Anfrage ({n}).',
    inv_info: 'Spende für die Forschung: alle Mitglieder bekommen die Boni und du bekommst Marken.', inv_nivel_info: 'Jede Vereinigungsstufe gibt +1 Hilfe pro Bau.',
    'tech.paga_eventos': 'Goldene Verträge', 'techd.paga_eventos': '+{e} % Gage bei Events pro Stufe',
    'tech.reparacion': 'Gemeinsame Werkstatt', 'techd.reparacion': '−{e} % Reparaturkosten pro Stufe',
    'tech.refuerzos': 'Verstärkung', 'techd.refuerzos': '+{e} Hilfe pro Bau pro Stufe',
    tech_nivel: 'Stufe {n}/{max} · jetzt {total}', tech_max: 'Maximal', donar_dinero: '{m} spenden', donar_premio: 'Jede Spende: +{p} Punkte · +{f} Marken',
    hoy_donar: 'Heute: {d}/{dm} Spenden · Geld {x}/{xm} · Marken {f}/{fm}', tienes: 'du hast {n}',
    ok_donar: 'Danke! +{p} Punkte für {tech} · +{f} Marken', ok_subio: '{tech} ist jetzt Stufe {n}!', ok_subio_asoc: 'Die Vereinigung ist jetzt Stufe {n}!',
    falta_dinero: 'Du brauchst {m} Spielgeld zum Spenden.', tienda_info: 'Alles mit Marken: verdiene sie durch Helfen und Spenden. Kein echtes Geld, keine Credits.',
    'item.caja_materiales': 'Materialkiste', 'itemd.caja_materiales': '3 von jedem normalen Material', 'item.chip': '4K-Chip', 'itemd.chip': '1 4K-Videochip',
    'item.acel_15': 'Beschleuniger 15 Min.', 'itemd.acel_15': '15 Minuten für deine Bauten', 'item.acel_60': 'Beschleuniger 1 Std.', 'itemd.acel_60': '60 Minuten für deine Bauten',
    'item.insignia_solidaria': 'Abzeichen „Teamgeist“', 'itemd.insignia_solidaria': 'Kosmetisch: neben deinem Namen zu sehen',
    hoy_n: 'Heute {n}/{m}', una_vez: 'Nur einmal', tuya: 'Gehört dir', agotado: 'Heute ausverkauft', comprar: '{n} Marken', seguro: 'Sicher? Nochmal tippen', ok_comprar: 'Erledigt! {item}',
    'mat.cables': 'Kabel', 'mat.placas': 'Platinen', 'mat.paneles': 'LED-Panels', 'mat.credenciales': 'Akkreditierungen', 'mat.planos': 'Baupläne', 'mat.chips': '4K-Chip',
    'ed.control': 'Regieraum', 'ed.bodega': 'Lager und Werkstatt', 'ed.estudio': 'Studio', 'ed.comercial': 'Vertriebsbüro', 'ed.movil': 'Ü-Wagen',
    'ed.escuela': 'Personalschule', 'ed.sede': 'Hauptzentrale', t_d: '{d} T {h} Std.', t_h: '{h} Std. {m} Min.', t_m: '{m} Min.', globo: 'Allen helfen',
    'err.miembro_nuevo': 'Du bist seit weniger als 24 Std. in deiner Vereinigung: helfen und spenden geht noch nicht.', 'err.sin_pedidos': 'Gerade keine Hilfe-Anfragen.',
    'err.tope_ayudas_dia': 'Du hast heute schon alle Hilfen gegeben. Komm morgen wieder.', 'err.sin_fichas': 'Zu wenig Marken.', 'err.tope_tienda': 'Das hast du heute schon so oft wie möglich gekauft.',
    'err.ya_comprado': 'Das hast du schon.', 'err.tope_donaciones': 'Du hast heute alles gespendet. Komm morgen wieder.', 'err.tope_donaciones_dinero': 'Heute keine Geldspenden mehr: spende Material.',
    'err.tech_max': 'Diese Forschung ist ausgereizt.', 'err.faltan_materiales': 'Nicht genug Material.', 'err.sin_asociacion': 'Tritt zuerst einer Vereinigung bei.',
    'err.ya_pedida': 'Für diesen Bau hast du schon um Hilfe gebeten.', 'err.sin_obras': 'Du hast keine Bauten, für die du um Hilfe bitten kannst.', 'err.red': 'Keine Verbindung. Versuch es nochmal.',
  };
  TRAD.it = {
    titulo: 'Associazione', tab_ayudas: 'Aiuti', tab_inv: 'Ricerca', tab_tienda: 'Negozio', cerrar: 'Chiudi', fichas: '{n} gettoni',
    nivel: 'Livello {n}/{max}', puntos: '{p}/{s} punti per il livello {n}', puntos_max: '{p} punti · livello massimo', tope: 'Fino a {n} aiuti per cantiere',
    ayudar_todos: 'Aiuta tutti ({n})', ayuda_info: 'Ogni aiuto toglie l’1% o 5 minuti al cantiere e ti dà 1 gettone (fino a {f} al giorno).',
    hoy_ayudas: 'Oggi: {a}/{am} aiuti · {f}/{fm} gettoni', pendientes_t: 'Richieste della tua associazione', nada_pend: 'Nessuno chiede aiuto ora. Torna tra poco!',
    obra_det: '{ed} · mancano {t} · aiuti {n}/{m}', mis_obras_t: 'I tuoi cantieri', sin_obras: 'Non hai cantieri in corso. Avvia un miglioramento nella tua sede ufficiale.',
    pedir: 'Chiedi aiuto', pedida: 'Aiuto chiesto', pedir_todas: 'Chiedi aiuto per tutti', espera: 'Sei appena entrato: potrai aiutare e donare tra {t}.',
    sin_asoc: 'Entra in un’associazione per chiedere e dare aiuti, fare ricerca e usare il negozio.', sin_sesion: 'Accedi per usare l’associazione.',
    cargando: 'Caricamento…', error_carga: 'Impossibile caricare.', reintentar: 'Riprova',
    ok_todos: 'Hai aiutato in {n} cantieri: −{t} in totale · +{f} gettoni', ok_tope: 'Hai raggiunto il limite di aiuti di oggi.', ok_pedir: 'La tua associazione vede la tua richiesta ({n}).',
    inv_info: 'Dona alla ricerca: tutti i soci ricevono i bonus e tu guadagni gettoni.', inv_nivel_info: 'Ogni livello dell’associazione dà +1 aiuto per cantiere.',
    'tech.paga_eventos': 'Contratti d’oro', 'techd.paga_eventos': '+{e}% di paga negli eventi per livello',
    'tech.reparacion': 'Officina condivisa', 'techd.reparacion': '−{e}% sul costo delle riparazioni per livello',
    'tech.refuerzos': 'Rinforzi', 'techd.refuerzos': '+{e} aiuto per cantiere per livello',
    tech_nivel: 'Livello {n}/{max} · ora {total}', tech_max: 'Al massimo', donar_dinero: 'Dona {m}', donar_premio: 'Ogni donazione: +{p} punti · +{f} gettoni',
    hoy_donar: 'Oggi: {d}/{dm} donazioni · denaro {x}/{xm} · gettoni {f}/{fm}', tienes: 'ne hai {n}',
    ok_donar: 'Grazie! +{p} punti per {tech} · +{f} gettoni', ok_subio: '{tech} è salito al livello {n}!', ok_subio_asoc: 'L’associazione è salita al livello {n}!',
    falta_dinero: 'Ti servono {m} del gioco per donare.', tienda_info: 'Tutto con gettoni: si guadagnano aiutando e donando. Niente soldi veri né crediti.',
    'item.caja_materiales': 'Cassa di materiali', 'itemd.caja_materiales': '3 di ogni materiale comune', 'item.chip': 'Chip 4K', 'itemd.chip': '1 chip video 4K',
    'item.acel_15': 'Acceleratore 15 min', 'itemd.acel_15': '15 minuti per i tuoi cantieri', 'item.acel_60': 'Acceleratore 1 h', 'itemd.acel_60': '60 minuti per i tuoi cantieri',
    'item.insignia_solidaria': 'Distintivo «Solidale»', 'itemd.insignia_solidaria': 'Cosmetico: appare accanto al tuo nome',
    hoy_n: 'Oggi {n}/{m}', una_vez: 'Una sola volta', tuya: 'È già tuo', agotado: 'Esaurito per oggi', comprar: '{n} gettoni', seguro: 'Sicuro? Tocca di nuovo', ok_comprar: 'Fatto! {item}',
    'mat.cables': 'cavi', 'mat.placas': 'schede', 'mat.paneles': 'pannelli LED', 'mat.credenciales': 'accrediti', 'mat.planos': 'progetti', 'mat.chips': 'chip 4K',
    'ed.control': 'Regia', 'ed.bodega': 'Magazzino e officina', 'ed.estudio': 'Studio', 'ed.comercial': 'Ufficio commerciale', 'ed.movil': 'Regia mobile',
    'ed.escuela': 'Scuola del personale', 'ed.sede': 'Sede principale', t_d: '{d} g {h} h', t_h: '{h} h {m} min', t_m: '{m} min', globo: 'Aiuta tutti',
    'err.miembro_nuevo': 'Sei nella tua associazione da meno di 24 h: non puoi ancora aiutare né donare.', 'err.sin_pedidos': 'Nessuna richiesta di aiuto ora.',
    'err.tope_ayudas_dia': 'Hai già dato tutti gli aiuti di oggi. Torna domani.', 'err.sin_fichas': 'Gettoni insufficienti.', 'err.tope_tienda': 'L’hai già comprato il massimo di volte oggi.',
    'err.ya_comprado': 'Hai già questo articolo.', 'err.tope_donaciones': 'Hai già donato tutto oggi. Torna domani.', 'err.tope_donaciones_dinero': 'Basta donazioni in denaro oggi: dona materiali.',
    'err.tech_max': 'Questa ricerca è al massimo.', 'err.faltan_materiales': 'Materiali insufficienti.', 'err.sin_asociacion': 'Entra prima in un’associazione.',
    'err.ya_pedida': 'Hai già chiesto aiuto per quel cantiere.', 'err.sin_obras': 'Non hai cantieri per cui chiedere aiuto.', 'err.red': 'Nessuna connessione. Riprova.',
  };
  TRAD.ru = {
    titulo: 'Ассоциация', tab_ayudas: 'Помощь', tab_inv: 'Исследования', tab_tienda: 'Магазин', cerrar: 'Закрыть', fichas: 'Жетоны: {n}',
    nivel: 'Уровень {n}/{max}', puntos: '{p}/{s} очков до уровня {n}', puntos_max: '{p} очков · макс. уровень', tope: 'До {n} помощи на стройку',
    ayudar_todos: 'Помочь всем ({n})', ayuda_info: 'Каждая помощь убирает 1% или 5 минут со стройки и даёт 1 жетон (до {f} в день).',
    hoy_ayudas: 'Сегодня: {a}/{am} помощи · {f}/{fm} жетонов', pendientes_t: 'Просьбы твоей ассоциации', nada_pend: 'Сейчас никто не просит помощи. Загляни позже!',
    obra_det: '{ed} · осталось {t} · помощь {n}/{m}', mis_obras_t: 'Твои стройки', sin_obras: 'Строек нет. Начни улучшение в официальном штабе.',
    pedir: 'Попросить помощь', pedida: 'Помощь запрошена', pedir_todas: 'Попросить помощь везде', espera: 'Ты недавно в ассоциации: помогать и жертвовать можно через {t}.',
    sin_asoc: 'Вступи в ассоциацию, чтобы просить и давать помощь, исследовать и пользоваться магазином.', sin_sesion: 'Войди в аккаунт, чтобы пользоваться ассоциацией.',
    cargando: 'Загрузка…', error_carga: 'Не удалось загрузить.', reintentar: 'Повторить',
    ok_todos: 'Ты помог на {n} стройках: −{t} всего · +{f} жетонов', ok_tope: 'Достигнут дневной лимит помощи.', ok_pedir: 'Ассоциация видит твою просьбу ({n}).',
    inv_info: 'Жертвуй на исследования: бонусы получают все участники, а ты — жетоны.', inv_nivel_info: 'Каждый уровень ассоциации даёт +1 помощь на стройку.',
    'tech.paga_eventos': 'Золотые контракты', 'techd.paga_eventos': '+{e}% к оплате событий за уровень',
    'tech.reparacion': 'Общая мастерская', 'techd.reparacion': '−{e}% к цене ремонта за уровень',
    'tech.refuerzos': 'Подкрепление', 'techd.refuerzos': '+{e} помощь на стройку за уровень',
    tech_nivel: 'Уровень {n}/{max} · сейчас {total}', tech_max: 'Максимум', donar_dinero: 'Пожертвовать {m}', donar_premio: 'За пожертвование: +{p} очков · +{f} жетонов',
    hoy_donar: 'Сегодня: {d}/{dm} пожертвований · деньги {x}/{xm} · жетоны {f}/{fm}', tienes: 'у тебя {n}',
    ok_donar: 'Спасибо! +{p} очков для «{tech}» · +{f} жетонов', ok_subio: '«{tech}» — уровень {n}!', ok_subio_asoc: 'Ассоциация достигла уровня {n}!',
    falta_dinero: 'Нужно {m} игровых денег.', tienda_info: 'Всё за жетоны: их дают за помощь и пожертвования. Без реальных денег и кредитов.',
    'item.caja_materiales': 'Ящик материалов', 'itemd.caja_materiales': 'По 3 каждого обычного материала', 'item.chip': 'Чип 4K', 'itemd.chip': '1 видеочип 4K',
    'item.acel_15': 'Ускоритель 15 мин', 'itemd.acel_15': '15 минут для строек', 'item.acel_60': 'Ускоритель 1 ч', 'itemd.acel_60': '60 минут для строек',
    'item.insignia_solidaria': 'Значок «Командный игрок»', 'itemd.insignia_solidaria': 'Косметика: виден рядом с именем',
    hoy_n: 'Сегодня {n}/{m}', una_vez: 'Только один раз', tuya: 'Уже твой', agotado: 'На сегодня всё', comprar: '{n} жетонов', seguro: 'Точно? Нажми ещё раз', ok_comprar: 'Готово! {item}',
    'mat.cables': 'кабели', 'mat.placas': 'платы', 'mat.paneles': 'LED-панели', 'mat.credenciales': 'пропуска', 'mat.planos': 'чертежи', 'mat.chips': 'чип 4K',
    'ed.control': 'Аппаратная', 'ed.bodega': 'Склад и мастерская', 'ed.estudio': 'Студия', 'ed.comercial': 'Отдел продаж', 'ed.movil': 'ПТС',
    'ed.escuela': 'Школа персонала', 'ed.sede': 'Главный штаб', t_d: '{d} д {h} ч', t_h: '{h} ч {m} мин', t_m: '{m} мин', globo: 'Помочь всем',
    'err.miembro_nuevo': 'Ты в ассоциации меньше 24 ч: помогать и жертвовать пока нельзя.', 'err.sin_pedidos': 'Сейчас нет просьб о помощи.',
    'err.tope_ayudas_dia': 'Ты уже использовал всю помощь на сегодня. Возвращайся завтра.', 'err.sin_fichas': 'Не хватает жетонов.', 'err.tope_tienda': 'Сегодня это уже куплено максимум раз.',
    'err.ya_comprado': 'У тебя это уже есть.', 'err.tope_donaciones': 'На сегодня ты пожертвовал всё. Возвращайся завтра.', 'err.tope_donaciones_dinero': 'Денежные пожертвования на сегодня закончились: жертвуй материалы.',
    'err.tech_max': 'Это исследование на максимуме.', 'err.faltan_materiales': 'Не хватает материалов.', 'err.sin_asociacion': 'Сначала вступи в ассоциацию.',
    'err.ya_pedida': 'Ты уже просил помощь для этой стройки.', 'err.sin_obras': 'Нет строек, для которых можно попросить помощь.', 'err.red': 'Нет связи. Попробуй ещё раз.',
  };
  TRAD.tr = {
    titulo: 'Dernek', tab_ayudas: 'Yardımlar', tab_inv: 'Araştırma', tab_tienda: 'Mağaza', cerrar: 'Kapat', fichas: '{n} jeton',
    nivel: 'Seviye {n}/{max}', puntos: 'Seviye {n} için {p}/{s} puan', puntos_max: '{p} puan · en üst seviye', tope: 'İnşaat başına en çok {n} yardım',
    ayudar_todos: 'Herkese yardım et ({n})', ayuda_info: 'Her yardım inşaattan %1 ya da 5 dakika düşer ve sana 1 jeton verir (günde en çok {f}).',
    hoy_ayudas: 'Bugün: {a}/{am} yardım · {f}/{fm} jeton', pendientes_t: 'Derneğinin istekleri', nada_pend: 'Şu an kimse yardım istemiyor. Birazdan tekrar bak!',
    obra_det: '{ed} · {t} kaldı · yardım {n}/{m}', mis_obras_t: 'İnşaatların', sin_obras: 'Devam eden inşaatın yok. Resmî merkezinde bir geliştirme başlat.',
    pedir: 'Yardım iste', pedida: 'Yardım istendi', pedir_todas: 'Hepsi için yardım iste', espera: 'Derneğe yeni katıldın: {t} sonra yardım edip bağış yapabilirsin.',
    sin_asoc: 'Yardım istemek ve vermek, araştırma yapmak ve mağazayı kullanmak için bir derneğe katıl.', sin_sesion: 'Derneği kullanmak için hesabına gir.',
    cargando: 'Yükleniyor…', error_carga: 'Yüklenemedi.', reintentar: 'Tekrar dene',
    ok_todos: '{n} inşaata yardım ettin: toplam −{t} · +{f} jeton', ok_tope: 'Bugünkü yardım sınırına ulaştın.', ok_pedir: 'Derneğin isteğini görüyor ({n}).',
    inv_info: 'Araştırmaya bağış yap: tüm üyeler bonusları alır, sen de jeton kazanırsın.', inv_nivel_info: 'Derneğin her seviyesi inşaat başına +1 yardım verir.',
    'tech.paga_eventos': 'Altın sözleşmeler', 'techd.paga_eventos': 'Seviye başına etkinliklerde +%{e} ödeme',
    'tech.reparacion': 'Ortak atölye', 'techd.reparacion': 'Seviye başına onarımda −%{e} maliyet',
    'tech.refuerzos': 'Takviye', 'techd.refuerzos': 'Seviye başına inşaat başına +{e} yardım',
    tech_nivel: 'Seviye {n}/{max} · şimdi {total}', tech_max: 'En üstte', donar_dinero: '{m} bağışla', donar_premio: 'Her bağış: +{p} puan · +{f} jeton',
    hoy_donar: 'Bugün: {d}/{dm} bağış · para {x}/{xm} · jeton {f}/{fm}', tienes: 'sende {n}',
    ok_donar: 'Teşekkürler! {tech} için +{p} puan · +{f} jeton', ok_subio: '{tech} seviye {n} oldu!', ok_subio_asoc: 'Dernek seviye {n} oldu!',
    falta_dinero: 'Bağış için {m} oyun parası gerekiyor.', tienda_info: 'Her şey jetonla: yardım ederek ve bağış yaparak kazanılır. Gerçek para ya da kredi yok.',
    'item.caja_materiales': 'Malzeme kutusu', 'itemd.caja_materiales': 'Her yaygın malzemeden 3', 'item.chip': '4K çip', 'itemd.chip': '1 adet 4K video çipi',
    'item.acel_15': '15 dk hızlandırıcı', 'itemd.acel_15': 'İnşaatların için 15 dakika', 'item.acel_60': '1 sa hızlandırıcı', 'itemd.acel_60': 'İnşaatların için 60 dakika',
    'item.insignia_solidaria': '“Takım Oyuncusu” rozeti', 'itemd.insignia_solidaria': 'Kozmetik: adının yanında görünür',
    hoy_n: 'Bugün {n}/{m}', una_vez: 'Yalnızca bir kez', tuya: 'Zaten senin', agotado: 'Bugünlük tükendi', comprar: '{n} jeton', seguro: 'Emin misin? Tekrar dokun', ok_comprar: 'Tamam! {item}',
    'mat.cables': 'kablo', 'mat.placas': 'kart', 'mat.paneles': 'LED panel', 'mat.credenciales': 'akreditasyon', 'mat.planos': 'plan', 'mat.chips': '4K çip',
    'ed.control': 'Reji odası', 'ed.bodega': 'Depo ve atölye', 'ed.estudio': 'Stüdyo', 'ed.comercial': 'Satış ofisi', 'ed.movil': 'Yayın aracı',
    'ed.escuela': 'Personel okulu', 'ed.sede': 'Ana merkez', t_d: '{d} g {h} sa', t_h: '{h} sa {m} dk', t_m: '{m} dk', globo: 'Herkese yardım et',
    'err.miembro_nuevo': 'Derneğinde 24 saatten az süredir varsın: henüz yardım edemez ve bağış yapamazsın.', 'err.sin_pedidos': 'Şu an yardım isteği yok.',
    'err.tope_ayudas_dia': 'Bugünkü tüm yardımlarını verdin. Yarın gel.', 'err.sin_fichas': 'Jetonun yetmiyor.', 'err.tope_tienda': 'Bunu bugün en çok sayıda aldın.',
    'err.ya_comprado': 'Bu ürün zaten sende.', 'err.tope_donaciones': 'Bugünlük her şeyi bağışladın. Yarın gel.', 'err.tope_donaciones_dinero': 'Bugün para bağışı bitti: malzeme bağışla.',
    'err.tech_max': 'Bu araştırma en üst seviyede.', 'err.faltan_materiales': 'Yeterli malzeme yok.', 'err.sin_asociacion': 'Önce bir derneğe katıl.',
    'err.ya_pedida': 'Bu inşaat için zaten yardım istedin.', 'err.sin_obras': 'Yardım isteyecek inşaatın yok.', 'err.red': 'Bağlantı yok. Tekrar dene.',
  };
  TRAD.id = {
    titulo: 'Asosiasi', tab_ayudas: 'Bantuan', tab_inv: 'Riset', tab_tienda: 'Toko', cerrar: 'Tutup', fichas: '{n} token',
    nivel: 'Level {n}/{max}', puntos: '{p}/{s} poin ke level {n}', puntos_max: '{p} poin · level maksimum', tope: 'Sampai {n} bantuan per bangunan',
    ayudar_todos: 'Bantu semua ({n})', ayuda_info: 'Tiap bantuan memotong 1% atau 5 menit dari bangunan dan memberimu 1 token (maks. {f} per hari).',
    hoy_ayudas: 'Hari ini: {a}/{am} bantuan · {f}/{fm} token', pendientes_t: 'Permintaan dari asosiasimu', nada_pend: 'Belum ada yang minta bantuan. Cek lagi nanti!',
    obra_det: '{ed} · sisa {t} · bantuan {n}/{m}', mis_obras_t: 'Bangunanmu', sin_obras: 'Tidak ada bangunan berjalan. Mulai peningkatan di markas resmimu.',
    pedir: 'Minta bantuan', pedida: 'Bantuan diminta', pedir_todas: 'Minta bantuan untuk semua', espera: 'Kamu baru bergabung: bisa membantu dan berdonasi dalam {t}.',
    sin_asoc: 'Gabung ke asosiasi untuk minta dan memberi bantuan, riset, dan memakai toko.', sin_sesion: 'Masuk ke akunmu untuk memakai asosiasi.',
    cargando: 'Memuat…', error_carga: 'Gagal memuat.', reintentar: 'Coba lagi',
    ok_todos: 'Kamu membantu {n} bangunan: total −{t} · +{f} token', ok_tope: 'Kamu mencapai batas bantuan hari ini.', ok_pedir: 'Asosiasimu melihat permintaanmu ({n}).',
    inv_info: 'Donasi untuk riset: semua anggota dapat bonus dan kamu dapat token.', inv_nivel_info: 'Tiap level asosiasi memberi +1 bantuan per bangunan.',
    'tech.paga_eventos': 'Kontrak emas', 'techd.paga_eventos': '+{e}% bayaran acara per level',
    'tech.reparacion': 'Bengkel bersama', 'techd.reparacion': '−{e}% biaya perbaikan per level',
    'tech.refuerzos': 'Bala bantuan', 'techd.refuerzos': '+{e} bantuan per bangunan per level',
    tech_nivel: 'Level {n}/{max} · sekarang {total}', tech_max: 'Maksimum', donar_dinero: 'Donasi {m}', donar_premio: 'Tiap donasi: +{p} poin · +{f} token',
    hoy_donar: 'Hari ini: {d}/{dm} donasi · uang {x}/{xm} · token {f}/{fm}', tienes: 'kamu punya {n}',
    ok_donar: 'Terima kasih! +{p} poin untuk {tech} · +{f} token', ok_subio: '{tech} naik ke level {n}!', ok_subio_asoc: 'Asosiasi naik ke level {n}!',
    falta_dinero: 'Perlu {m} uang game untuk donasi.', tienda_info: 'Semua pakai token: didapat dengan membantu dan berdonasi. Tanpa uang asli atau kredit.',
    'item.caja_materiales': 'Peti bahan', 'itemd.caja_materiales': '3 dari tiap bahan umum', 'item.chip': 'Chip 4K', 'itemd.chip': '1 chip video 4K',
    'item.acel_15': 'Percepat 15 mnt', 'itemd.acel_15': '15 menit untuk bangunanmu', 'item.acel_60': 'Percepat 1 jam', 'itemd.acel_60': '60 menit untuk bangunanmu',
    'item.insignia_solidaria': 'Lencana “Setia Kawan”', 'itemd.insignia_solidaria': 'Kosmetik: tampil di samping namamu',
    hoy_n: 'Hari ini {n}/{m}', una_vez: 'Hanya sekali', tuya: 'Sudah milikmu', agotado: 'Habis hari ini', comprar: '{n} token', seguro: 'Yakin? Ketuk lagi', ok_comprar: 'Beres! {item}',
    'mat.cables': 'kabel', 'mat.placas': 'papan', 'mat.paneles': 'panel LED', 'mat.credenciales': 'kartu pers', 'mat.planos': 'cetak biru', 'mat.chips': 'chip 4K',
    'ed.control': 'Ruang kontrol', 'ed.bodega': 'Gudang & bengkel', 'ed.estudio': 'Studio', 'ed.comercial': 'Kantor penjualan', 'ed.movil': 'Unit siaran',
    'ed.escuela': 'Sekolah kru', 'ed.sede': 'Markas utama', t_d: '{d} h {h} j', t_h: '{h} j {m} mnt', t_m: '{m} mnt', globo: 'Bantu semua',
    'err.miembro_nuevo': 'Kamu di asosiasi kurang dari 24 jam: belum bisa membantu atau berdonasi.', 'err.sin_pedidos': 'Belum ada permintaan bantuan.',
    'err.tope_ayudas_dia': 'Bantuanmu hari ini sudah habis. Kembali besok.', 'err.sin_fichas': 'Token tidak cukup.', 'err.tope_tienda': 'Kamu sudah membeli itu sebanyak batas hari ini.',
    'err.ya_comprado': 'Kamu sudah punya barang itu.', 'err.tope_donaciones': 'Donasimu hari ini sudah habis. Kembali besok.', 'err.tope_donaciones_dinero': 'Donasi uang hari ini sudah habis: donasikan bahan.',
    'err.tech_max': 'Riset itu sudah maksimum.', 'err.faltan_materiales': 'Bahan tidak cukup.', 'err.sin_asociacion': 'Gabung ke asosiasi dulu.',
    'err.ya_pedida': 'Kamu sudah minta bantuan untuk bangunan itu.', 'err.sin_obras': 'Tidak ada bangunan untuk minta bantuan.', 'err.red': 'Tidak ada koneksi. Coba lagi.',
  };
  TRAD['zh-CN'] = {
    titulo: '协会', tab_ayudas: '协助', tab_inv: '研究', tab_tienda: '商店', cerrar: '关闭', fichas: '{n} 枚代币',
    nivel: '等级 {n}/{max}', puntos: '升到 {n} 级：{p}/{s} 点', puntos_max: '{p} 点 · 已满级', tope: '每项施工最多 {n} 次协助',
    ayudar_todos: '全部协助（{n}）', ayuda_info: '每次协助让施工减少 1% 或 5 分钟，并给你 1 枚代币（每天最多 {f} 枚）。',
    hoy_ayudas: '今天：{a}/{am} 次协助 · {f}/{fm} 枚代币', pendientes_t: '协会的求助', nada_pend: '现在没有人求助。过一会儿再来看看！',
    obra_det: '{ed} · 还剩 {t} · 协助 {n}/{m}', mis_obras_t: '你的施工', sin_obras: '你没有进行中的施工。去官方总部开始一项升级吧。',
    pedir: '请求协助', pedida: '已请求协助', pedir_todas: '全部请求协助', espera: '你刚加入协会：{t}后才能协助和捐献。',
    sin_asoc: '加入协会就能请求和提供协助、参与研究并使用商店。', sin_sesion: '登录账号才能使用协会。',
    cargando: '加载中…', error_carga: '加载失败。', reintentar: '重试',
    ok_todos: '你协助了 {n} 项施工：共 −{t} · +{f} 枚代币', ok_tope: '你已达到今天的协助上限。', ok_pedir: '协会已经看到你的求助（{n}）。',
    inv_info: '为研究捐献：所有成员都获得加成，你还能得到代币。', inv_nivel_info: '协会每升一级，每项施工 +1 次协助。',
    'tech.paga_eventos': '黄金合约', 'techd.paga_eventos': '每级活动报酬 +{e}%',
    'tech.reparacion': '共享工坊', 'techd.reparacion': '每级维修费用 −{e}%',
    'tech.refuerzos': '增援', 'techd.refuerzos': '每级每项施工 +{e} 次协助',
    tech_nivel: '等级 {n}/{max} · 当前 {total}', tech_max: '已满级', donar_dinero: '捐献 {m}', donar_premio: '每次捐献：+{p} 点 · +{f} 枚代币',
    hoy_donar: '今天：{d}/{dm} 次捐献 · 金钱 {x}/{xm} · 代币 {f}/{fm}', tienes: '你有 {n}',
    ok_donar: '谢谢！{tech} +{p} 点 · +{f} 枚代币', ok_subio: '{tech} 升到 {n} 级！', ok_subio_asoc: '协会升到 {n} 级！',
    falta_dinero: '捐献需要游戏币 {m}。', tienda_info: '全部用代币购买：通过协助和捐献获得。不用真钱，也不用积分。',
    'item.caja_materiales': '材料箱', 'itemd.caja_materiales': '每种普通材料各 3 个', 'item.chip': '4K 芯片', 'itemd.chip': '1 个 4K 视频芯片',
    'item.acel_15': '15 分钟加速', 'itemd.acel_15': '为施工加速 15 分钟', 'item.acel_60': '1 小时加速', 'itemd.acel_60': '为施工加速 60 分钟',
    'item.insignia_solidaria': '“团队之星”徽章', 'itemd.insignia_solidaria': '装饰：显示在你的名字旁',
    hoy_n: '今天 {n}/{m}', una_vez: '仅限一次', tuya: '已拥有', agotado: '今日已售完', comprar: '{n} 枚代币', seguro: '确定吗？再点一次', ok_comprar: '完成！{item}',
    'mat.cables': '线缆', 'mat.placas': '电路板', 'mat.paneles': 'LED 面板', 'mat.credenciales': '证件', 'mat.planos': '图纸', 'mat.chips': '4K 芯片',
    'ed.control': '导播间', 'ed.bodega': '仓库与工坊', 'ed.estudio': '演播室', 'ed.comercial': '商务办公室', 'ed.movil': '转播车',
    'ed.escuela': '员工学校', 'ed.sede': '总部主楼', t_d: '{d} 天 {h} 小时', t_h: '{h} 小时 {m} 分钟', t_m: '{m} 分钟', globo: '全部协助',
    'err.miembro_nuevo': '你加入协会不到 24 小时：暂时不能协助或捐献。', 'err.sin_pedidos': '现在没有求助。',
    'err.tope_ayudas_dia': '今天的协助次数已用完。明天再来。', 'err.sin_fichas': '代币不够。', 'err.tope_tienda': '今天已达到购买上限。',
    'err.ya_comprado': '你已经拥有这件物品。', 'err.tope_donaciones': '今天的捐献已用完。明天再来。', 'err.tope_donaciones_dinero': '今天不能再捐钱了：请捐材料。',
    'err.tech_max': '这项研究已满级。', 'err.faltan_materiales': '材料不够。', 'err.sin_asociacion': '请先加入协会。',
    'err.ya_pedida': '这项施工已经请求过协助。', 'err.sin_obras': '没有可以请求协助的施工。', 'err.red': '没有网络。请重试。',
  };

  const idioma = () => { const c = (root.I18N && root.I18N.idioma) || 'es'; return TRAD[c] ? c : 'es'; };
  function t(k, p) {
    const d = TRAD[idioma()];
    let s = d[k] !== undefined ? d[k] : TRAD.es[k] !== undefined ? TRAD.es[k] : k;
    if (p) s = String(s).replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined && p[x] !== null ? p[x] : m));
    return s;
  }
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (root.I18N && root.I18N.num ? root.I18N.num(n) : String(n));
  const dinero = (n) => (root.I18N && root.I18N.money ? root.I18N.money(n) : '$' + n);
  function fmt(seg) {
    seg = Math.max(0, Math.round(seg));
    const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600), m = Math.floor((seg % 3600) / 60);
    if (d > 0) return t('t_d', { d, h });
    if (h > 0) return t('t_h', { h, m });
    return t('t_m', { m: Math.max(1, m) });
  }
  const COMUNES = ['cables', 'placas', 'paneles', 'credenciales', 'planos'];

  /* ---------- Estado ---------- */
  const st = { ctx: null, datos: null, resumen: null, tab: 'ayudas', abierto: false, timer: null, ocupado: false, error: '', pedidas: new Set(), armado: null, bonos: null };
  const Api = () => (st.ctx && st.ctx.Api) || root.Api || {};
  const logueado = () => { const E = Api().estado; return !!(Api().disponible && E && E.logueado); };
  const enAsoc = () => { const E = Api().estado; return !!(E && E.asociacion); };
  const jugadorId = () => { const E = Api().estado; return E && E.jugador ? E.jugador.id : null; };
  const toast = (m) => { if (st.ctx && st.ctx.toast) st.ctx.toast(m); };
  const sonido = (n) => { try { if (st.ctx && st.ctx.snd) st.ctx.snd.play(n); } catch (e) { /* nada */ } };

  async function pedir(metodo, ruta, cuerpo) {
    let r, j = null;
    try {
      r = await root.fetch(ruta, { method: metodo, credentials: 'same-origin', cache: 'no-store', body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': (root.I18N && root.I18N.idioma) || 'es' } });
    } catch (e) { const x = new Error(t('err.red')); x.status = 0; throw x; }
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || typeof j !== 'object' || !r.ok || j.ok === false) {
      const c = j && j.codigo;
      let msg = c && TRAD.es['err.' + c] ? t('err.' + c) : null;
      if (!msg && c && root.I18N && root.I18N.T && root.I18N.T.has && root.I18N.T.has('error.' + c)) msg = root.I18N.T('error.' + c, j);
      if (!msg) msg = j && j.error ? (root.I18N && root.I18N.TL ? root.I18N.TL(j.error) : j.error) : t('error_carga');
      if (c === 'miembro_nuevo' && j.espera) msg = t('espera', { t: fmt(j.espera) });
      const x = new Error(msg); x.status = r.status; x.codigo = c || null; x.datos = j || {};
      throw x;
    }
    return j;
  }

  /* ---------- Bonos (extensión de logic.js) ---------- */
  const CLAVE = 'envivo_aa_bonos';
  function guardarBonos(b) {
    if (!b) return;
    st.bonos = b;
    try { root.localStorage.setItem(CLAVE, JSON.stringify({ id: jugadorId(), b, t: Date.now() })); } catch (e) { /* sin almacenamiento */ }
  }
  const CERO = { paga_eventos_pct: 0, reparacion_pct: 0, ayudas_extra: 0 };
  function bonos() {
    const A = Api(), E = A.estado;
    if (A.disponible && E && (!E.logueado || !E.asociacion)) return CERO;   // salió de la cuenta o de la asociación
    if (st.bonos) return st.bonos;
    try {
      const c = JSON.parse(root.localStorage.getItem(CLAVE) || 'null');
      if (c && c.b && Date.now() - c.t < 3 * 86400000 && (jugadorId() === null || c.id === jugadorId())) return c.b;
    } catch (e) { /* nada */ }
    return CERO;
  }
  const multPago = () => 1 + Math.max(0, Math.min(50, Number(bonos().paga_eventos_pct) || 0)) / 100;
  const multReparar = () => 1 - Math.max(0, Math.min(50, Number(bonos().reparacion_pct) || 0)) / 100;
  function registrarExt() {
    const G = root.Game;
    if (st.armado || !G || typeof G.registrarExtension !== 'function') return;
    G.registrarExtension({ id: 'ayuda_asoc', multPago: () => multPago() });
    st.armado = true;
  }

  /* ---------- Estilos ---------- */
  function css() {
    if (document.getElementById('aa-css')) return;
    const s = document.createElement('style');
    s.id = 'aa-css';
    s.textContent = `
      #aa-btn{position:fixed;right:max(14px,env(safe-area-inset-right,0px));bottom:calc(146px + env(safe-area-inset-bottom,0px));z-index:7;width:52px;height:52px;border-radius:50%;
        background:var(--amber);color:#1a1205;border:0;display:grid;place-items:center;box-shadow:0 6px 18px #0008;font-size:24px;animation:aa-lat 2.4s ease-in-out infinite}
      #aa-btn[hidden]{display:none}
      #aa-btn b{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--red);color:#fff;font-size:11px;display:grid;place-items:center;padding:0 5px}
      @keyframes aa-lat{0%,100%{box-shadow:0 6px 18px #0008,0 0 0 0 #ffb020aa}60%{box-shadow:0 6px 18px #0008,0 0 0 10px #ffb02000}}
      @media (prefers-reduced-motion:reduce){#aa-btn{animation:none}}
      #aa-panel{position:fixed;inset:0;z-index:26;background:var(--bg);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
      #aa-panel[hidden]{display:none}
      .aa-top{display:flex;align-items:center;gap:8px;padding:10px max(16px,env(safe-area-inset-right,0px)) 6px max(16px,env(safe-area-inset-left,0px))}
      .aa-top h2{flex:1;min-width:0;margin:0;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .aa-sig{display:inline-block;border-radius:6px;padding:1px 6px;margin-inline-end:6px;color:#fff;font-size:13px}
      .aa-fichas{flex:none;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:5px 10px;font-weight:700;font-size:13px;color:var(--amber)}
      .aa-tabs{display:flex;gap:6px;padding:4px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line)}
      .aa-tabs button{flex:1;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 4px;font-weight:600;font-size:13px;position:relative;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .aa-tabs button.on{border-color:var(--amber);background:#2a2412}
      .aa-tabs button i{font-style:normal;background:var(--red);color:#fff;border-radius:9px;padding:0 6px;margin-inline-start:4px;font-size:11px}
      .aa-cuerpo{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px max(16px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
      .aa-cuerpo .card{margin-bottom:10px}
      .aa-fila{display:flex;align-items:center;gap:10px;min-width:0}
      .aa-fila .grow{flex:1;min-width:0;overflow-wrap:anywhere}
      .aa-fila .btn{flex:none;margin:0}
      .aa-ico{flex:none;width:38px;height:38px;border-radius:10px;background:var(--panel2);display:grid;place-items:center;font-size:20px}
      .aa-big{font-size:17px;padding:15px}
      .aa-big[disabled],.aa-cuerpo .btn[disabled]{opacity:.5}
      .aa-aviso{border-color:var(--amber)!important;background:#221c0e!important}
      .aa-mats{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
      .aa-mats .btn{flex:1 1 96px;min-width:0;margin:0;padding:8px 4px;font-size:12px;line-height:1.25}
      .aa-mats .btn small{display:block;font-weight:400;color:var(--muted);font-size:11px}
      .aa-tienda{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
      .aa-item{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:4px;min-width:0}
      .aa-item .aa-ico{width:44px;height:44px;font-size:24px}
      .aa-item b{overflow-wrap:anywhere}
      .aa-item .btn{margin-top:auto}
      .aa-item.agotado{opacity:.6}
      .aa-barra{display:flex;gap:6px;padding:6px max(16px,env(safe-area-inset-right,0px)) 6px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line)}
      .aa-barra[hidden]{display:none}
      .aa-barra button{flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:7px 4px;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .aa-barra button.hay{border-color:var(--amber);color:var(--amber)}`;
    document.head.appendChild(s);
  }

  /* ---------- Globo flotante ---------- */
  function construir() {
    css();
    if (!document.getElementById('aa-btn')) {
      const b = document.createElement('button');
      b.id = 'aa-btn'; b.hidden = true; b.setAttribute('aria-label', t('globo'));
      b.addEventListener('click', () => ayudarTodos());
      document.body.appendChild(b);
    }
    if (!document.getElementById('aa-panel')) {
      const p = document.createElement('div');
      p.id = 'aa-panel'; p.hidden = true; p.setAttribute('role', 'dialog');
      document.body.appendChild(p);
    }
  }
  function pintarGlobo() {
    const b = document.getElementById('aa-btn');
    if (!b) return;
    const n = st.resumen ? st.resumen.pendientes : 0;
    const espera = st.resumen && st.resumen.espera > 0;
    b.hidden = !(logueado() && enAsoc() && n > 0 && !espera) || st.abierto;
    b.setAttribute('aria-label', t('ayudar_todos', { n }));
    b.innerHTML = '🤝' + (n ? `<b>${n > 99 ? '99+' : n}</b>` : '');
    document.querySelectorAll('.aa-barra [data-aa-tab="ayudas"]').forEach((x) => { x.textContent = '🤝 ' + t('tab_ayudas') + (n ? ' (' + n + ')' : ''); x.classList.toggle('hay', n > 0); });
  }

  async function consultarResumen() {
    if (!logueado() || !enAsoc()) { st.resumen = null; pintarGlobo(); return; }
    try { const r = await pedir('GET', '/api/asoc/ayuda/resumen'); st.resumen = r; if (r.bonos) guardarBonos(r.bonos); } catch (e) { /* se reintenta en el próximo ciclo */ }
    pintarGlobo();
  }
  function ciclo() {
    clearTimeout(st.timer);
    if (document.visibilityState !== 'hidden') consultarResumen();
    st.timer = setTimeout(ciclo, st.abierto ? 15000 : 45000);
  }

  /* ---------- Acciones ---------- */
  function aplicarVista(j) {
    st.datos = j;
    if (j.bonos) guardarBonos(j.bonos);
    (j.mis_obras || []).forEach((o) => { if (o.pedida) st.pedidas.add(o.obra_id); else st.pedidas.delete(o.obra_id); });
    st.resumen = { ok: true, asociacion: j.asociacion ? j.asociacion.id : null, pendientes: (j.pendientes || []).length, fichas: j.fichas, espera: j.asociacion ? j.asociacion.espera : null };
    pintarGlobo();
  }
  async function cargar() {
    st.error = '';
    try { aplicarVista(await pedir('GET', '/api/asoc/ayuda')); } catch (e) { st.error = e.message; }
    if (st.abierto) pintar();
  }
  async function accion(fn) {
    if (st.ocupado) return null;
    st.ocupado = true;
    try { return await fn(); } catch (e) { toast(e.message); sonido('error'); if (e.datos && e.datos.ok === false && e.status === 409) cargar(); return null; } finally { st.ocupado = false; if (st.abierto) pintar(); }
  }
  function ayudarTodos() {
    return accion(async () => {
      const r = await pedir('POST', '/api/asoc/ayuda/todos', {});
      aplicarVista(r);
      toast(t('ok_todos', { n: r.ayudadas, t: fmt(r.segundos), f: r.fichas_ganadas }) + (r.tope_dia ? ' ' + t('ok_tope') : ''));
      sonido('hire');
      return r;
    });
  }
  function pedirAyuda(obraId) {
    return accion(async () => {
      const r = await pedir('POST', '/api/asoc/ayuda/pedir', obraId ? { obra_id: obraId } : {});
      aplicarVista(r);
      document.querySelectorAll('[data-aa="pedir"]').forEach((b) => { if (st.pedidas.has(Number(b.dataset.obra))) { b.disabled = true; b.textContent = '✓ ' + t('pedida'); } });
      toast(t('ok_pedir', { n: r.pedidas })); sonido('click');
      return r;
    });
  }
  function donar(tech, tipo, material) {
    const monto = st.datos && st.datos.reglas ? st.datos.reglas.donar.dinero.monto : 2000;
    if (tipo === 'dinero') {
      const c = st.ctx || {};
      if (typeof c.dinero !== 'function' || typeof c.gastarDinero !== 'function') return null;
      if (c.dinero() < monto) { toast(t('falta_dinero', { m: dinero(monto) })); sonido('error'); return null; }
    }
    return accion(async () => {
      const r = await pedir('POST', '/api/asoc/investigacion/donar', { tech, tipo, material: material || undefined, pagado_en_juego: tipo === 'dinero' });
      if (tipo === 'dinero') st.ctx.gastarDinero(monto);   // el servidor ya la aceptó: ahora sí sale de la partida
      aplicarVista(r);
      const d = r.donacion, nom = t('tech.' + d.tech);
      toast(d.subio_asoc ? t('ok_subio_asoc', { n: d.nivel_asoc }) : d.subio ? t('ok_subio', { tech: nom, n: d.nivel_tech }) : t('ok_donar', { p: d.puntos, tech: nom, f: d.fichas }));
      sonido(d.subio || d.subio_asoc ? 'chapter' : 'cash');
      if (root.Sede && root.Sede.oficial && typeof root.Sede.oficial.cargar === 'function' && tipo === 'material') { try { root.Sede.oficial.cargar(st.ctx, true); } catch (e) { /* nada */ } }
      return r;
    });
  }
  let armadoCompra = null;
  function comprar(item, boton) {
    if (armadoCompra !== item) {   // primer toque: pide confirmar (3 s)
      armadoCompra = item;
      if (boton) { boton.textContent = t('seguro'); boton.classList.add('main'); }
      setTimeout(() => { if (armadoCompra === item) { armadoCompra = null; if (st.abierto) pintar(); } }, 3000);
      return null;
    }
    armadoCompra = null;
    return accion(async () => {
      const r = await pedir('POST', '/api/asoc/tienda/comprar', { item });
      aplicarVista(r);
      toast(t('ok_comprar', { item: t('item.' + item) })); sonido('cash');
      return r;
    });
  }

  /* ---------- Panel ---------- */
  const nombreObra = (o) => (o.tipo === 'nivel' ? t('ed.sede') + ' · ' + t('nivel', { n: o.nivel, max: 30 }) : t('ed.' + o.ed));
  function vistaAyudas(d) {
    const a = d.asociacion, h = d.hoy, n = d.pendientes.length;
    const espera = a.espera > 0;
    const lleno = h.ayudas >= h.ayudas_max;
    let o = '';
    if (espera) o += `<div class="card aa-aviso small">⏳ ${esc(t('espera', { t: fmt(a.espera) }))}</div>`;
    o += `<button class="btn green aa-big" data-aa="todos"${n && !espera && !lleno ? '' : ' disabled'}>🤝 ${esc(t('ayudar_todos', { n }))}</button>
      <p class="small muted" style="margin:8px 0 2px">${esc(t('ayuda_info', { f: h.fichas_ayuda_max }))} ${esc(t('tope', { n: a.tope_ayudas }))}.</p>
      <p class="small" style="margin:0 0 6px">${esc(t('hoy_ayudas', { a: h.ayudas, am: h.ayudas_max, f: h.fichas_ayuda, fm: h.fichas_ayuda_max }))}</p>
      <div class="sectitle">${esc(t('pendientes_t'))}</div>`;
    o += n ? d.pendientes.map((p) => `<div class="card"><div class="aa-fila"><div class="aa-ico">🏗️</div><div class="grow"><b>${esc(p.nombre)}</b>
        <div class="small muted">${esc(t('obra_det', { ed: nombreObra(p), t: fmt(p.restante), n: p.ayudas, m: p.ayudas_max }))}</div></div></div></div>`).join('')
      : `<p class="small muted">${esc(t('nada_pend'))}</p>`;
    o += `<div class="sectitle">${esc(t('mis_obras_t'))}</div>`;
    const mias = d.mis_obras || [];
    if (!mias.length) o += `<p class="small muted">${esc(t('sin_obras'))}</p>`;
    else {
      o += mias.map((m) => `<div class="card"><div class="aa-fila"><div class="aa-ico">🔨</div><div class="grow"><b>${esc(nombreObra(m))}</b>
          <div class="small muted">${esc(t('obra_det', { ed: '', t: fmt(m.restante), n: m.ayudas, m: m.ayudas_max }).replace(/^ · /, ''))}</div></div>
          ${m.pedida ? `<span class="tag">✓ ${esc(t('pedida'))}</span>` : `<button class="btn sm" data-aa="pedir" data-obra="${m.obra_id}"${m.ayudas >= m.ayudas_max ? ' disabled' : ''}>🙋 ${esc(t('pedir'))}</button>`}</div></div>`).join('');
      if (mias.filter((m) => !m.pedida && m.ayudas < m.ayudas_max).length > 1) o += `<button class="btn" data-aa="pedir_todas">🙋 ${esc(t('pedir_todas'))}</button>`;
    }
    return o;
  }
  function vistaInv(d) {
    const a = d.asociacion, h = d.hoy, R = d.reglas.donar, mat = d.materiales || {};
    const espera = a.espera > 0;
    const lleno = h.donaciones >= h.donaciones_max;
    const puedeDinero = st.ctx && typeof st.ctx.dinero === 'function' && typeof st.ctx.gastarDinero === 'function';
    const sig = a.siguiente;
    let o = `<div class="card"><div class="aa-fila"><div class="aa-ico">🏛️</div><div class="grow"><b>${esc(t('nivel', { n: a.nivel, max: a.nivel_max }))}</b>
        <div class="small muted">${esc(sig ? t('puntos', { p: num(a.puntos), s: num(sig), n: a.nivel + 1 }) : t('puntos_max', { p: num(a.puntos) }))}</div></div></div>
        <div class="bar"><i style="width:${sig ? Math.round(100 * Math.min(1, a.puntos / sig)) : 100}%;background:var(--amber)"></i></div>
        <p class="small muted" style="margin:6px 0 0">${esc(t('inv_nivel_info'))} ${esc(t('tope', { n: a.tope_ayudas }))}.</p></div>`;
    if (espera) o += `<div class="card aa-aviso small">⏳ ${esc(t('espera', { t: fmt(a.espera) }))}</div>`;
    o += `<p class="small muted" style="margin:4px 0">${esc(t('inv_info'))}</p>
      <p class="small" style="margin:0 0 8px">${esc(t('hoy_donar', { d: h.donaciones, dm: h.donaciones_max, x: h.donaciones_dinero, xm: h.donaciones_dinero_max, f: h.fichas_donar, fm: h.fichas_donar_max }))}</p>`;
    const ICO = { paga_eventos: '💰', reparacion: '🔧', refuerzos: '🤝' };
    o += a.investigacion.map((x) => {
      const total = x.id === 'refuerzos' ? '+' + x.total : (x.id === 'reparacion' ? '−' : '+') + x.total + ' %';
      const max = x.costo === null;
      const off = espera || lleno || max || st.ocupado;
      const botones = max ? `<span class="tag">✓ ${esc(t('tech_max'))}</span>` : `<div class="aa-mats">
          ${puedeDinero ? `<button class="btn" data-aa="donar" data-tech="${x.id}" data-tipo="dinero"${off || h.donaciones_dinero >= h.donaciones_dinero_max ? ' disabled' : ''}>💵 ${esc(t('donar_dinero', { m: dinero(R.dinero.monto) }))}<small>+${R.dinero.puntos} · +${R.dinero.fichas} 🎟</small></button>` : ''}
          ${COMUNES.concat(['chips']).map((m) => { const c = m === 'chips' ? R.chips.cantidad : R.material.cantidad; const tiene = mat[m] || 0;
            return `<button class="btn" data-aa="donar" data-tech="${x.id}" data-tipo="material" data-mat="${m}"${off || tiene < c ? ' disabled' : ''}>${c} ${esc(t('mat.' + m))}<small>${esc(t('tienes', { n: tiene }))} · +${m === 'chips' ? R.chips.puntos : R.material.puntos}</small></button>`; }).join('')}
        </div>`;
      return `<div class="card"><div class="aa-fila"><div class="aa-ico">${ICO[x.id] || '🔬'}</div><div class="grow"><b>${esc(t('tech.' + x.id))}</b>
          <div class="small muted">${esc(t('techd.' + x.id, { e: x.efecto }))}</div>
          <div class="small">${esc(x.nivel > 0 ? t('tech_nivel', { n: x.nivel, max: x.max, total }) : t('nivel', { n: 0, max: x.max }))}</div></div></div>
          ${max ? '' : `<div class="bar"><i style="width:${Math.round(100 * Math.min(1, x.progreso / x.costo))}%"></i></div><div class="small muted" style="text-align:end">${num(x.progreso)}/${num(x.costo)}</div>`}
          ${botones}</div>`;
    }).join('');
    o += `<p class="small muted">${esc(t('donar_premio', { p: R.material.puntos, f: R.material.fichas }))}</p>`;
    return o;
  }
  function vistaTienda(d) {
    const ICO = { caja_materiales: '📦', chip: '💾', acel_15: '⏩', acel_60: '⏩', insignia_solidaria: '🏅' };
    let o = `<p class="small muted" style="margin:0 0 10px">${esc(t('tienda_info'))}</p><div class="aa-tienda">`;
    o += d.tienda.map((it) => {
      const tuya = it.una_vez && it.agotado;
      const falta = d.fichas < it.fichas;
      const estado = tuya ? t('tuya') : it.agotado ? t('agotado') : it.una_vez ? t('una_vez') : t('hoy_n', { n: it.usadas, m: it.tope });
      return `<div class="aa-item${it.agotado ? ' agotado' : ''}"><div class="aa-ico">${ICO[it.id] || '🎁'}</div><b>${esc(t('item.' + it.id))}</b>
        <div class="small muted">${esc(t('itemd.' + it.id))}</div><div class="small">${esc(estado)}</div>
        <button class="btn ${armadoCompra === it.id ? 'main' : ''}" data-aa="comprar" data-item="${it.id}"${it.agotado || falta ? ' disabled' : ''}>🎟 ${esc(armadoCompra === it.id ? t('seguro') : t('comprar', { n: it.fichas }))}</button></div>`;
    }).join('');
    return o + '</div>';
  }
  function pintar() {
    const p = document.getElementById('aa-panel');
    if (!p || !st.abierto) return;
    const d = st.datos, a = d && d.asociacion;
    const sig = a ? `<span class="aa-sig" style="background:${/^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : 'var(--red)'}">${esc(a.siglas)}</span>` : '';
    const n = d && d.pendientes ? d.pendientes.length : 0;
    const tabs = [['ayudas', '🤝 ' + t('tab_ayudas') + (n ? `<i>${n}</i>` : '')], ['investigacion', '🔬 ' + t('tab_inv')], ['tienda', '🛒 ' + t('tab_tienda')]];
    let cuerpo;
    if (!logueado()) cuerpo = `<p class="small muted">${esc(t('sin_sesion'))}</p>`;
    else if (!d) cuerpo = st.error ? `<p class="small muted">${esc(st.error)}</p><button class="btn" data-aa="recargar">${esc(t('reintentar'))}</button>` : `<p class="small muted">${esc(t('cargando'))}</p>`;
    else if (!a) cuerpo = `<p class="small muted">${esc(t('sin_asoc'))}</p>`;
    else cuerpo = st.tab === 'investigacion' ? vistaInv(d) : st.tab === 'tienda' ? vistaTienda(d) : vistaAyudas(d);
    const scroll = p.querySelector('.aa-cuerpo') ? p.querySelector('.aa-cuerpo').scrollTop : 0;
    p.innerHTML = `<div class="aa-top"><h2>${sig}${esc(a ? a.nombre : t('titulo'))}${a ? ` <span class="small muted">· ${esc(t('nivel', { n: a.nivel, max: a.nivel_max }))}</span>` : ''}</h2>
        ${d ? `<span class="aa-fichas" title="${esc(t('fichas', { n: d.fichas }))}">🎟 ${num(d.fichas)}</span>` : ''}
        <button class="btn sm" data-aa="cerrar" aria-label="${esc(t('cerrar'))}">✕</button></div>
      <div class="aa-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-aa-tab="${k}" class="${st.tab === k ? 'on' : ''}" aria-selected="${st.tab === k}">${l}</button>`).join('')}</div>
      <div class="aa-cuerpo">${cuerpo}</div>`;
    const c = p.querySelector('.aa-cuerpo'); if (c) c.scrollTop = scroll;
  }
  function abrir(tab) {
    construir();
    if (tab) st.tab = tab;
    st.abierto = true;
    document.getElementById('aa-panel').hidden = false;
    pintar(); pintarGlobo(); cargar(); ciclo();
  }
  function cerrar() {
    st.abierto = false;
    const p = document.getElementById('aa-panel'); if (p) p.hidden = true;
    pintarGlobo(); ciclo();
  }

  /* Un solo oyente para todos los botones data-aa (panel, barra del chat y botón de la sede) */
  function alClic(ev) {
    const tb = ev.target.closest('[data-aa-tab]');
    if (tb) { ev.preventDefault(); if (document.getElementById('aa-panel') && !document.getElementById('aa-panel').hidden) { st.tab = tb.dataset.aaTab; armadoCompra = null; pintar(); } else abrir(tb.dataset.aaTab); return; }
    const b = ev.target.closest('[data-aa]');
    if (!b || b.disabled) return;
    ev.preventDefault();
    const k = b.dataset.aa;
    if (k === 'cerrar') cerrar();
    else if (k === 'recargar') cargar();
    else if (k === 'todos') ayudarTodos();
    else if (k === 'pedir') pedirAyuda(Number(b.dataset.obra));
    else if (k === 'pedir_todas') pedirAyuda(null);
    else if (k === 'donar') donar(b.dataset.tech, b.dataset.tipo, b.dataset.mat || null);
    else if (k === 'comprar') comprar(b.dataset.item, b);
  }

  /* ---------- API pública ---------- */
  const AyudaAsoc = {
    TRAD,
    iniciar(ctx) {
      st.ctx = ctx || st.ctx;
      registrarExt();
      if (st.iniciado) { pintarGlobo(); consultarResumen(); return; }
      st.iniciado = true;
      construir();
      document.addEventListener('click', alClic);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciclo(); });
      if (root.I18N && root.I18N.onChange) root.I18N.onChange(() => { pintarGlobo(); if (st.abierto) pintar(); });
      ciclo();
    },
    abrir, cerrar,
    refrescar() { consultarResumen(); if (st.abierto) cargar(); },
    /** Barra de la pestaña "Asociación" del chat: Ayudas (N) / Investigación / Tienda. */
    barra(el) {
      if (!el) return;
      el.className = 'aa-barra';
      const n = st.resumen ? st.resumen.pendientes : 0;
      el.innerHTML = `<button data-aa-tab="ayudas" class="${n ? 'hay' : ''}">🤝 ${esc(t('tab_ayudas'))}${n ? ' (' + n + ')' : ''}</button>
        <button data-aa-tab="investigacion">🔬 ${esc(t('tab_inv'))}</button><button data-aa-tab="tienda">🛒 ${esc(t('tab_tienda'))}</button>`;
    },
    /** Botón "Pedir ayuda" para una obra oficial de js/sede.js (vacío sin sesión o sin asociación). */
    botonPedir(o) {
      if (!o || !logueado() || !enAsoc()) return '';
      if (st.pedidas.has(o.id)) return `<button class="btn sd-btn" disabled>✓ ${esc(t('pedida'))}</button>`;
      return `<button class="btn sd-btn" data-aa="pedir" data-obra="${Number(o.id)}">🙋 ${esc(t('pedir'))}</button>`;
    },
    bonos, multPago, multReparar,
    get estado() { return { datos: st.datos, resumen: st.resumen, tab: st.tab, abierto: st.abierto }; },
  };
  root.AyudaAsoc = AyudaAsoc;
  registrarExt();
  if (root.AyudaAsocCtx) AyudaAsoc.iniciar(root.AyudaAsocCtx);
  if (typeof module !== 'undefined' && module.exports) module.exports = AyudaAsoc;
})(typeof window !== 'undefined' ? window : globalThis);
