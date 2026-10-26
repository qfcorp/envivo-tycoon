/* =========================================================
   EN VIVO Tycoon — Misiones del día y de la semana (las generales; las del Pase de Temporada son otras: js/pase.js)
   Contrato: server/INTEGRAR_MISIONES.md (GET /api/misiones, POST /api/misiones/reclamar; server/src/Misiones.php).
   - Siguen el DÍA REAL del celular (para volver cada día): 5 misiones del día y 5 de la semana (lunes a domingo).
     La primera es fija ("Haz 3 eventos" / "Haz 15 eventos") y las otras 4 salen de un hash de la fecha (FNV-1a),
     nunca de Math.random: el servidor elige las mismas (tests/test_misiones.js lo revisa).
   - El avance se cuenta en la partida (s.misiones):
       · logic.js: G.registrarExtension (alTerminarEvento → eventos, 4★, 5★, dinero ganado; alNuevoDia → sede),
       · acciones del juego: se envuelven G.hire / G.repair / G.buy / G.buyConsumable / G.marketing (cuentan si ok),
       · eventos en línea: se envuelve EnVivoVivo.terminar (liga, festival, copa, duelos, desafío),
       · sede: se mira el estado (mejoras terminadas y la entrega del día, local u oficial) al pintar y cada día,
       · Misiones.marcar(clave, n) para lo que el integrador quiera contar a mano (ver INTEGRAR_MISIONES.md).
     Los intentos en línea (s.intento) nunca cuentan como partida: las extensiones no corren ahí y los envoltorios los saltan.
   - Premios FIJOS y visibles: dinero del juego, repuestos, materiales de la sede y un cofre de actividad del día a los
     20/40/60/80/100 puntos (20 por misión del día reclamada). Créditos solo en los cofres de 60 y 100 y solo con cuenta
     (los da el servidor, con tope por día). Sin cuenta todo se aplica en la partida (los materiales a la sede local).
   - Premios por constancia (para los F2P; MISMA tabla que Misiones.php, economía en server/MONETIZACION.md §6):
     un "día activo" = abriste el cofre de 60 puntos ese día (s.misiones.h). Con 5 de 7 días de la semana se abre el cofre
     de constancia (con cuenta trae créditos y el premio de la semana: obra extra 24 h / personal estrella 2 partidos /
     Pase VIP 1 día) y la ruta del mes da premios a los 7, 14 y 21 días (el de 21: un equipo de Edición Exclusiva
     permanente, con cuenta). Sin cuenta se dan el dinero y los materiales en la partida. Textos solo en español (TX).
   - Tarjeta de Inicio: window.EnVivoInicio (id "misiones", orden 3). Botones data-ext="misiones" data-acc="…".
   - Textos: español + 9 idiomas aquí mismo (TRAD), registro "tú". Sin I18N, español.
   API: window.Misiones = { tarjeta, clic, marcar, observar, asegurar, elegir, fnv, reclamar, reclamarTodo, puntos,
        DIA, SEMANA, COFRES, TRAD, fechaHoy, lunes, titulo, EXT, recargar }.
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------- Tabla fija (la MISMA que server/src/Misiones.php) ---------- */
  const DIA = {
    eventos: { k: 'evento', n: 3, premio: { dinero: 250 } },
    estrellas4: { k: 'estrellas4', n: 1, premio: { dinero: 200, cons: { cable: 1 } } },
    cinco: { k: 'estrellas5', n: 1, premio: { dinero: 350 } },
    ganar: { k: 'ganar', n: 800, premio: { dinero: 150, cons: { battery: 1 } } },
    reparar: { k: 'reparar', n: 1, premio: { dinero: 200 } },
    contratar: { k: 'contratar', n: 1, premio: { dinero: 200 } },
    repuesto: { k: 'repuesto', n: 1, premio: { dinero: 100, cons: { battery: 1 } } },
    equipo: { k: 'equipo', n: 1, premio: { dinero: 250 } },
    publicidad: { k: 'publicidad', n: 1, premio: { dinero: 150 } },
    en_linea: { k: 'en_linea', n: 1, en_linea: true, premio: { dinero: 300, cons: { cable: 1 } } },
    entrega: { k: 'entrega', n: 1, premio: { dinero: 150, cons: { cable: 1 } } },
  };
  const SEMANA = {
    eventos_s: { k: 'evento', n: 15, premio: { dinero: 1200, mat: { cables: 8 } } },
    estrellas4_s: { k: 'estrellas4', n: 6, premio: { dinero: 1000, mat: { placas: 6 } } },
    cinco_s: { k: 'estrellas5', n: 3, premio: { dinero: 1500, mat: { paneles: 8 } } },
    ganar_s: { k: 'ganar', n: 6000, premio: { dinero: 900, mat: { paneles: 5 } } },
    reparar_s: { k: 'reparar', n: 5, premio: { dinero: 800, cons: { cable: 4 } } },
    contratar_s: { k: 'contratar', n: 2, premio: { dinero: 800, mat: { planos: 4 } } },
    en_linea_s: { k: 'en_linea', n: 5, en_linea: true, premio: { dinero: 1200, mat: { credenciales: 6 } } },
    obra_s: { k: 'obra', n: 2, premio: { dinero: 1000, mat: { placas: 8 } } },
    entrega_s: { k: 'entrega', n: 5, premio: { dinero: 800, mat: { chips: 1 } } },
  };
  const COFRES = {
    20: { dinero: 150, cons: { cable: 1 } },
    40: { dinero: 250, cons: { battery: 1 } },
    60: { dinero: 350, mat: { cables: 6 }, creditos: 3 },
    80: { dinero: 500, cons: { cable: 2 }, mat: { placas: 5 } },
    100: { dinero: 800, mat: { paneles: 5, planos: 3 }, creditos: 5 },
  };
  const HITOS = [20, 40, 60, 80, 100];
  const POR = 5, PUNTOS = 20;
  const XP_PASE = { d: 15, s: 40 };
  const MATS = ['cables', 'placas', 'paneles', 'credenciales', 'planos', 'chips'];
  /* Premios por constancia (los MISMOS que server/src/Misiones.php) */
  const DIA_ACTIVO = 'cofre60';
  const CONSTANCIA = { meta: 5, premio: { dinero: 2000, mat: { cables: 10, placas: 10, paneles: 10, chips: 1 }, creditos: 25 } };
  const PREMIOS_SEMANA = { obra: { horas: 24 }, estrella: { partidos: 2 }, vip: { dias: 1 } };
  const MES = {
    7: { dinero: 1500, mat: { planos: 8, credenciales: 8 }, creditos: 20 },
    14: { dinero: 2500, mat: { paneles: 12, chips: 2 }, creditos: 30 },
    21: { dinero: 3000, exclusivo: 1 },
  };
  const HITOS_MES = [7, 14, 21];
  const EXCLUSIVOS_MES = ['ex_lluvia', 'ex_maletas', 'ex_cable', 'ex_mics', 'ex_monitor', 'ex_wireless'];
  const CREDITOS_SEMANA = 120;
  const CLAVES = ['evento', 'estrellas4', 'estrellas5', 'ganar', 'reparar', 'contratar', 'repuesto', 'equipo', 'publicidad', 'en_linea', 'entrega', 'obra'];

  /* ---------- Textos ---------- */
  const TRAD = {};
  TRAD.es = {
    tag: 'Misiones', titulo: 'Misiones del día', semana: 'Misiones de la semana', actividad: 'Actividad', pts: '{n} pts',
    cofre: 'Cofre {n}', toca: 'Toca un cofre para ver qué trae.', cofre_n: 'Cofre de {n} puntos', faltan: 'Te faltan {n} puntos.',
    reclamar: 'Reclamar', reclamar_todo: 'Reclamar todo ({n})', listo: 'Listo', mas_pts: '+{n} pts', xp: '+{n} XP del pase',
    renuevan: 'Nuevas en {t}', fijo: 'Premios fijos y a la vista: sin cajas sorpresa.', con_cuenta: 'Con tu cuenta, los cofres de 60 y 100 también dan créditos.',
    solo_cuenta: '{n} créditos con cuenta', ok: '¡Listo! {lista}', todo_ok: '¡Reclamaste {n} premios!', ya: 'Ese premio ya lo reclamaste.', no_listo: 'Todavía no completas esa misión.',
    creditos: '{n} créditos', tope: 'Hoy ya llegaste al tope de créditos de las misiones.', espera: 'Un momento…',
    't.d': '{n} d', 't.h': '{n} h', 't.m': '{n} min',
    'c.cable': 'cables de repuesto', 'c.battery': 'baterías',
    'mat.cables': 'cables', 'mat.placas': 'placas', 'mat.paneles': 'paneles LED', 'mat.credenciales': 'credenciales', 'mat.planos': 'planos', 'mat.chips': 'chips 4K',
    'm.eventos': 'Haz {n} eventos', 'm.estrellas4': 'Saca 4★ o más en un evento', 'm.cinco': 'Saca 5★ en un evento', 'm.ganar': 'Gana {m} en eventos',
    'm.reparar': 'Repara un equipo', 'm.contratar': 'Contrata a alguien', 'm.repuesto': 'Compra un repuesto', 'm.equipo': 'Compra un equipo',
    'm.publicidad': 'Haz publicidad', 'm.en_linea': 'Juega un evento en línea', 'm.entrega': 'Reclama la entrega del día de la sede',
    'm.eventos_s': 'Haz {n} eventos', 'm.estrellas4_s': 'Saca 4★ o más en {n} eventos', 'm.cinco_s': 'Saca 5★ en {n} eventos', 'm.ganar_s': 'Gana {m} en eventos',
    'm.reparar_s': 'Repara {n} equipos', 'm.contratar_s': 'Contrata a {n} personas', 'm.en_linea_s': 'Juega {n} eventos en línea',
    'm.obra_s': 'Termina {n} mejoras de la sede', 'm.entrega_s': 'Reclama la entrega del día de la sede {n} veces',
    'err.red': 'Sin conexión. Intenta de nuevo.', 'err.misiones_vencidas': 'Esas misiones ya vencieron. Mira las de hoy.', 'err.mision_invalida': 'Esa misión ya no está disponible.',
    'err.limite_intentos': 'Demasiadas acciones seguidas. Espera un momento.', 'err.error': 'No se pudo reclamar. Intenta de nuevo.',
  };
  TRAD.en = {
    tag: 'Missions', titulo: 'Daily missions', semana: 'Weekly missions', actividad: 'Activity', pts: '{n} pts',
    cofre: 'Chest {n}', toca: 'Tap a chest to see what’s inside.', cofre_n: '{n}-point chest', faltan: 'You need {n} more points.',
    reclamar: 'Claim', reclamar_todo: 'Claim all ({n})', listo: 'Done', mas_pts: '+{n} pts', xp: '+{n} pass XP',
    renuevan: 'New ones in {t}', fijo: 'Fixed rewards, shown up front: no loot boxes.', con_cuenta: 'With an account, the 60 and 100 chests also give credits.',
    solo_cuenta: '{n} credits with an account', ok: 'Done! {lista}', todo_ok: 'You claimed {n} rewards!', ya: 'You already claimed that reward.', no_listo: 'You haven’t finished that mission yet.',
    creditos: '{n} credits', tope: 'You reached today’s mission credit limit.', espera: 'One moment…',
    't.d': '{n}d', 't.h': '{n}h', 't.m': '{n} min',
    'c.cable': 'spare cables', 'c.battery': 'batteries',
    'mat.cables': 'cables', 'mat.placas': 'boards', 'mat.paneles': 'LED panels', 'mat.credenciales': 'press passes', 'mat.planos': 'blueprints', 'mat.chips': '4K chips',
    'm.eventos': 'Do {n} events', 'm.estrellas4': 'Get 4★ or more in an event', 'm.cinco': 'Get 5★ in an event', 'm.ganar': 'Earn {m} from events',
    'm.reparar': 'Repair a piece of gear', 'm.contratar': 'Hire someone', 'm.repuesto': 'Buy a spare part', 'm.equipo': 'Buy a piece of gear',
    'm.publicidad': 'Do some advertising', 'm.en_linea': 'Play an online event', 'm.entrega': 'Claim the HQ daily delivery',
    'm.eventos_s': 'Do {n} events', 'm.estrellas4_s': 'Get 4★ or more in {n} events', 'm.cinco_s': 'Get 5★ in {n} events', 'm.ganar_s': 'Earn {m} from events',
    'm.reparar_s': 'Repair {n} pieces of gear', 'm.contratar_s': 'Hire {n} people', 'm.en_linea_s': 'Play {n} online events',
    'm.obra_s': 'Finish {n} HQ upgrades', 'm.entrega_s': 'Claim the HQ daily delivery {n} times',
    'err.red': 'No connection. Try again.', 'err.misiones_vencidas': 'Those missions have expired. Check today’s.', 'err.mision_invalida': 'That mission is no longer available.',
    'err.limite_intentos': 'Too many actions in a row. Wait a moment.', 'err.error': 'Couldn’t claim it. Try again.',
  };
  TRAD['pt-BR'] = {
    tag: 'Missões', titulo: 'Missões do dia', semana: 'Missões da semana', actividad: 'Atividade', pts: '{n} pts',
    cofre: 'Baú {n}', toca: 'Toque num baú para ver o que ele traz.', cofre_n: 'Baú de {n} pontos', faltan: 'Faltam {n} pontos.',
    reclamar: 'Resgatar', reclamar_todo: 'Resgatar tudo ({n})', listo: 'Feito', mas_pts: '+{n} pts', xp: '+{n} XP do passe',
    renuevan: 'Novas em {t}', fijo: 'Prêmios fixos e à vista: sem caixas surpresa.', con_cuenta: 'Com sua conta, os baús de 60 e 100 também dão créditos.',
    solo_cuenta: '{n} créditos com conta', ok: 'Pronto! {lista}', todo_ok: 'Você resgatou {n} prêmios!', ya: 'Você já resgatou esse prêmio.', no_listo: 'Você ainda não completou essa missão.',
    creditos: '{n} créditos', tope: 'Hoje você já chegou ao limite de créditos das missões.', espera: 'Um momento…',
    't.d': '{n} d', 't.h': '{n} h', 't.m': '{n} min',
    'c.cable': 'cabos reserva', 'c.battery': 'baterias',
    'mat.cables': 'cabos', 'mat.placas': 'placas', 'mat.paneles': 'painéis LED', 'mat.credenciales': 'credenciais', 'mat.planos': 'plantas', 'mat.chips': 'chips 4K',
    'm.eventos': 'Faça {n} eventos', 'm.estrellas4': 'Tire 4★ ou mais num evento', 'm.cinco': 'Tire 5★ num evento', 'm.ganar': 'Ganhe {m} em eventos',
    'm.reparar': 'Conserte um equipamento', 'm.contratar': 'Contrate alguém', 'm.repuesto': 'Compre uma peça de reposição', 'm.equipo': 'Compre um equipamento',
    'm.publicidad': 'Faça publicidade', 'm.en_linea': 'Jogue um evento online', 'm.entrega': 'Resgate a entrega do dia da sede',
    'm.eventos_s': 'Faça {n} eventos', 'm.estrellas4_s': 'Tire 4★ ou mais em {n} eventos', 'm.cinco_s': 'Tire 5★ em {n} eventos', 'm.ganar_s': 'Ganhe {m} em eventos',
    'm.reparar_s': 'Conserte {n} equipamentos', 'm.contratar_s': 'Contrate {n} pessoas', 'm.en_linea_s': 'Jogue {n} eventos online',
    'm.obra_s': 'Termine {n} melhorias da sede', 'm.entrega_s': 'Resgate a entrega do dia da sede {n} vezes',
    'err.red': 'Sem conexão. Tente de novo.', 'err.misiones_vencidas': 'Essas missões já venceram. Veja as de hoje.', 'err.mision_invalida': 'Essa missão não está mais disponível.',
    'err.limite_intentos': 'Muitas ações seguidas. Espere um momento.', 'err.error': 'Não deu para resgatar. Tente de novo.',
  };
  TRAD.fr = {
    tag: 'Missions', titulo: 'Missions du jour', semana: 'Missions de la semaine', actividad: 'Activité', pts: '{n} pts',
    cofre: 'Coffre {n}', toca: 'Touche un coffre pour voir ce qu’il contient.', cofre_n: 'Coffre de {n} points', faltan: 'Il te manque {n} points.',
    reclamar: 'Récupérer', reclamar_todo: 'Tout récupérer ({n})', listo: 'Fait', mas_pts: '+{n} pts', xp: '+{n} XP du pass',
    renuevan: 'Nouvelles dans {t}', fijo: 'Récompenses fixes et visibles : pas de boîtes surprises.', con_cuenta: 'Avec un compte, les coffres de 60 et 100 donnent aussi des crédits.',
    solo_cuenta: '{n} crédits avec un compte', ok: 'C’est fait ! {lista}', todo_ok: 'Tu as récupéré {n} récompenses !', ya: 'Tu as déjà récupéré cette récompense.', no_listo: 'Tu n’as pas encore fini cette mission.',
    creditos: '{n} crédits', tope: 'Tu as atteint la limite de crédits des missions pour aujourd’hui.', espera: 'Un instant…',
    't.d': '{n} j', 't.h': '{n} h', 't.m': '{n} min',
    'c.cable': 'câbles de rechange', 'c.battery': 'batteries',
    'mat.cables': 'câbles', 'mat.placas': 'cartes', 'mat.paneles': 'panneaux LED', 'mat.credenciales': 'accréditations', 'mat.planos': 'plans', 'mat.chips': 'puces 4K',
    'm.eventos': 'Fais {n} événements', 'm.estrellas4': 'Obtiens 4★ ou plus sur un événement', 'm.cinco': 'Obtiens 5★ sur un événement', 'm.ganar': 'Gagne {m} avec des événements',
    'm.reparar': 'Répare un équipement', 'm.contratar': 'Embauche quelqu’un', 'm.repuesto': 'Achète une pièce de rechange', 'm.equipo': 'Achète un équipement',
    'm.publicidad': 'Fais de la publicité', 'm.en_linea': 'Joue un événement en ligne', 'm.entrega': 'Récupère la livraison du jour du QG',
    'm.eventos_s': 'Fais {n} événements', 'm.estrellas4_s': 'Obtiens 4★ ou plus sur {n} événements', 'm.cinco_s': 'Obtiens 5★ sur {n} événements', 'm.ganar_s': 'Gagne {m} avec des événements',
    'm.reparar_s': 'Répare {n} équipements', 'm.contratar_s': 'Embauche {n} personnes', 'm.en_linea_s': 'Joue {n} événements en ligne',
    'm.obra_s': 'Termine {n} améliorations du QG', 'm.entrega_s': 'Récupère la livraison du jour du QG {n} fois',
    'err.red': 'Pas de connexion. Réessaie.', 'err.misiones_vencidas': 'Ces missions ont expiré. Regarde celles du jour.', 'err.mision_invalida': 'Cette mission n’est plus disponible.',
    'err.limite_intentos': 'Trop d’actions d’affilée. Attends un moment.', 'err.error': 'Impossible de récupérer. Réessaie.',
  };
  TRAD.de = {
    tag: 'Missionen', titulo: 'Tagesmissionen', semana: 'Wochenmissionen', actividad: 'Aktivität', pts: '{n} Pkt.',
    cofre: 'Truhe {n}', toca: 'Tippe auf eine Truhe, um den Inhalt zu sehen.', cofre_n: 'Truhe für {n} Punkte', faltan: 'Dir fehlen {n} Punkte.',
    reclamar: 'Abholen', reclamar_todo: 'Alles abholen ({n})', listo: 'Erledigt', mas_pts: '+{n} Pkt.', xp: '+{n} Pass-XP',
    renuevan: 'Neue in {t}', fijo: 'Feste Belohnungen, offen sichtbar: keine Lootboxen.', con_cuenta: 'Mit Konto geben die Truhen für 60 und 100 auch Credits.',
    solo_cuenta: '{n} Credits mit Konto', ok: 'Erledigt! {lista}', todo_ok: 'Du hast {n} Belohnungen abgeholt!', ya: 'Diese Belohnung hast du schon abgeholt.', no_listo: 'Diese Mission hast du noch nicht geschafft.',
    creditos: '{n} Credits', tope: 'Du hast heute das Credit-Limit der Missionen erreicht.', espera: 'Einen Moment…',
    't.d': '{n} T', 't.h': '{n} Std', 't.m': '{n} Min',
    'c.cable': 'Ersatzkabel', 'c.battery': 'Akkus',
    'mat.cables': 'Kabel', 'mat.placas': 'Platinen', 'mat.paneles': 'LED-Panels', 'mat.credenciales': 'Presseausweise', 'mat.planos': 'Baupläne', 'mat.chips': '4K-Chips',
    'm.eventos': 'Mach {n} Events', 'm.estrellas4': 'Hol 4★ oder mehr bei einem Event', 'm.cinco': 'Hol 5★ bei einem Event', 'm.ganar': 'Verdiene {m} mit Events',
    'm.reparar': 'Repariere ein Gerät', 'm.contratar': 'Stell jemanden ein', 'm.repuesto': 'Kauf ein Ersatzteil', 'm.equipo': 'Kauf ein Gerät',
    'm.publicidad': 'Mach Werbung', 'm.en_linea': 'Spiel ein Online-Event', 'm.entrega': 'Hol die Tageslieferung des Hauptquartiers ab',
    'm.eventos_s': 'Mach {n} Events', 'm.estrellas4_s': 'Hol 4★ oder mehr bei {n} Events', 'm.cinco_s': 'Hol 5★ bei {n} Events', 'm.ganar_s': 'Verdiene {m} mit Events',
    'm.reparar_s': 'Repariere {n} Geräte', 'm.contratar_s': 'Stell {n} Leute ein', 'm.en_linea_s': 'Spiel {n} Online-Events',
    'm.obra_s': 'Schließ {n} Ausbauten des Hauptquartiers ab', 'm.entrega_s': 'Hol die Tageslieferung des Hauptquartiers {n}-mal ab',
    'err.red': 'Keine Verbindung. Versuch es nochmal.', 'err.misiones_vencidas': 'Diese Missionen sind abgelaufen. Schau dir die von heute an.', 'err.mision_invalida': 'Diese Mission gibt es nicht mehr.',
    'err.limite_intentos': 'Zu viele Aktionen hintereinander. Warte kurz.', 'err.error': 'Abholen hat nicht geklappt. Versuch es nochmal.',
  };
  TRAD.it = {
    tag: 'Missioni', titulo: 'Missioni del giorno', semana: 'Missioni della settimana', actividad: 'Attività', pts: '{n} pt',
    cofre: 'Forziere {n}', toca: 'Tocca un forziere per vedere cosa contiene.', cofre_n: 'Forziere da {n} punti', faltan: 'Ti mancano {n} punti.',
    reclamar: 'Riscatta', reclamar_todo: 'Riscatta tutto ({n})', listo: 'Fatto', mas_pts: '+{n} pt', xp: '+{n} XP del pass',
    renuevan: 'Nuove tra {t}', fijo: 'Premi fissi e visibili: niente casse a sorpresa.', con_cuenta: 'Con un account, i forzieri da 60 e 100 danno anche crediti.',
    solo_cuenta: '{n} crediti con un account', ok: 'Fatto! {lista}', todo_ok: 'Hai riscattato {n} premi!', ya: 'Hai già riscattato questo premio.', no_listo: 'Non hai ancora completato questa missione.',
    creditos: '{n} crediti', tope: 'Oggi hai raggiunto il limite di crediti delle missioni.', espera: 'Un momento…',
    't.d': '{n} g', 't.h': '{n} h', 't.m': '{n} min',
    'c.cable': 'cavi di ricambio', 'c.battery': 'batterie',
    'mat.cables': 'cavi', 'mat.placas': 'schede', 'mat.paneles': 'pannelli LED', 'mat.credenciales': 'accrediti', 'mat.planos': 'progetti', 'mat.chips': 'chip 4K',
    'm.eventos': 'Fai {n} eventi', 'm.estrellas4': 'Ottieni 4★ o più in un evento', 'm.cinco': 'Ottieni 5★ in un evento', 'm.ganar': 'Guadagna {m} con gli eventi',
    'm.reparar': 'Ripara un’attrezzatura', 'm.contratar': 'Assumi qualcuno', 'm.repuesto': 'Compra un ricambio', 'm.equipo': 'Compra un’attrezzatura',
    'm.publicidad': 'Fai pubblicità', 'm.en_linea': 'Gioca un evento online', 'm.entrega': 'Riscatta la consegna del giorno della sede',
    'm.eventos_s': 'Fai {n} eventi', 'm.estrellas4_s': 'Ottieni 4★ o più in {n} eventi', 'm.cinco_s': 'Ottieni 5★ in {n} eventi', 'm.ganar_s': 'Guadagna {m} con gli eventi',
    'm.reparar_s': 'Ripara {n} attrezzature', 'm.contratar_s': 'Assumi {n} persone', 'm.en_linea_s': 'Gioca {n} eventi online',
    'm.obra_s': 'Termina {n} migliorie della sede', 'm.entrega_s': 'Riscatta la consegna del giorno della sede {n} volte',
    'err.red': 'Nessuna connessione. Riprova.', 'err.misiones_vencidas': 'Quelle missioni sono scadute. Guarda quelle di oggi.', 'err.mision_invalida': 'Questa missione non è più disponibile.',
    'err.limite_intentos': 'Troppe azioni di fila. Aspetta un momento.', 'err.error': 'Non è stato possibile riscattare. Riprova.',
  };
  TRAD.ru = {
    tag: 'Задания', titulo: 'Задания дня', semana: 'Задания недели', actividad: 'Активность', pts: '{n} очк.',
    cofre: 'Сундук {n}', toca: 'Нажми на сундук, чтобы увидеть, что в нём.', cofre_n: 'Сундук за {n} очков', faltan: 'Не хватает {n} очков.',
    reclamar: 'Забрать', reclamar_todo: 'Забрать всё ({n})', listo: 'Готово', mas_pts: '+{n} очк.', xp: '+{n} XP пропуска',
    renuevan: 'Новые через {t}', fijo: 'Награды фиксированы и видны заранее: никаких лутбоксов.', con_cuenta: 'С аккаунтом сундуки за 60 и 100 дают ещё и кредиты.',
    solo_cuenta: '{n} кредитов с аккаунтом', ok: 'Готово! {lista}', todo_ok: 'Ты забрал наград: {n}!', ya: 'Эту награду ты уже забрал.', no_listo: 'Это задание ещё не выполнено.',
    creditos: '{n} кредитов', tope: 'Сегодня ты уже получил максимум кредитов за задания.', espera: 'Минутку…',
    't.d': '{n} д', 't.h': '{n} ч', 't.m': '{n} мин',
    'c.cable': 'запасные кабели', 'c.battery': 'батареи',
    'mat.cables': 'кабели', 'mat.placas': 'платы', 'mat.paneles': 'LED-панели', 'mat.credenciales': 'пропуска', 'mat.planos': 'чертежи', 'mat.chips': 'чипы 4K',
    'm.eventos': 'Проведи {n} мероприятия', 'm.estrellas4': 'Получи 4★ или больше за мероприятие', 'm.cinco': 'Получи 5★ за мероприятие', 'm.ganar': 'Заработай {m} на мероприятиях',
    'm.reparar': 'Почини оборудование', 'm.contratar': 'Найми кого-нибудь', 'm.repuesto': 'Купи запчасть', 'm.equipo': 'Купи оборудование',
    'm.publicidad': 'Сделай рекламу', 'm.en_linea': 'Сыграй онлайн-мероприятие', 'm.entrega': 'Забери дневную поставку штаба',
    'm.eventos_s': 'Проведи {n} мероприятий', 'm.estrellas4_s': 'Получи 4★ или больше за {n} мероприятий', 'm.cinco_s': 'Получи 5★ за {n} мероприятия', 'm.ganar_s': 'Заработай {m} на мероприятиях',
    'm.reparar_s': 'Почини оборудование {n} раз', 'm.contratar_s': 'Найми {n} человек', 'm.en_linea_s': 'Сыграй {n} онлайн-мероприятий',
    'm.obra_s': 'Заверши {n} улучшения штаба', 'm.entrega_s': 'Забери дневную поставку штаба {n} раз',
    'err.red': 'Нет связи. Попробуй ещё раз.', 'err.misiones_vencidas': 'Эти задания уже истекли. Посмотри сегодняшние.', 'err.mision_invalida': 'Это задание больше недоступно.',
    'err.limite_intentos': 'Слишком много действий подряд. Подожди немного.', 'err.error': 'Не удалось забрать. Попробуй ещё раз.',
  };
  TRAD.tr = {
    tag: 'Görevler', titulo: 'Günün görevleri', semana: 'Haftanın görevleri', actividad: 'Etkinlik', pts: '{n} puan',
    cofre: 'Sandık {n}', toca: 'İçinde ne olduğunu görmek için bir sandığa dokun.', cofre_n: '{n} puanlık sandık', faltan: '{n} puan daha lazım.',
    reclamar: 'Al', reclamar_todo: 'Hepsini al ({n})', listo: 'Tamam', mas_pts: '+{n} puan', xp: '+{n} sezon XP',
    renuevan: 'Yenileri {t} sonra', fijo: 'Ödüller sabit ve önceden görünür: sürpriz kutu yok.', con_cuenta: 'Hesabınla 60 ve 100 sandıkları kredi de verir.',
    solo_cuenta: 'Hesapla {n} kredi', ok: 'Tamam! {lista}', todo_ok: '{n} ödül aldın!', ya: 'Bu ödülü zaten aldın.', no_listo: 'Bu görevi henüz bitirmedin.',
    creditos: '{n} kredi', tope: 'Bugünkü görev kredisi sınırına ulaştın.', espera: 'Bir saniye…',
    't.d': '{n} g', 't.h': '{n} sa', 't.m': '{n} dk',
    'c.cable': 'yedek kablo', 'c.battery': 'pil',
    'mat.cables': 'kablo', 'mat.placas': 'kart', 'mat.paneles': 'LED panel', 'mat.credenciales': 'akreditasyon', 'mat.planos': 'plan', 'mat.chips': '4K çip',
    'm.eventos': '{n} etkinlik yap', 'm.estrellas4': 'Bir etkinlikte 4★ veya fazlası al', 'm.cinco': 'Bir etkinlikte 5★ al', 'm.ganar': 'Etkinliklerden {m} kazan',
    'm.reparar': 'Bir ekipman onar', 'm.contratar': 'Birini işe al', 'm.repuesto': 'Bir yedek parça al', 'm.equipo': 'Bir ekipman satın al',
    'm.publicidad': 'Reklam yap', 'm.en_linea': 'Bir çevrim içi etkinlik oyna', 'm.entrega': 'Merkezin günlük teslimatını al',
    'm.eventos_s': '{n} etkinlik yap', 'm.estrellas4_s': '{n} etkinlikte 4★ veya fazlası al', 'm.cinco_s': '{n} etkinlikte 5★ al', 'm.ganar_s': 'Etkinliklerden {m} kazan',
    'm.reparar_s': '{n} ekipman onar', 'm.contratar_s': '{n} kişiyi işe al', 'm.en_linea_s': '{n} çevrim içi etkinlik oyna',
    'm.obra_s': 'Merkezin {n} geliştirmesini bitir', 'm.entrega_s': 'Merkezin günlük teslimatını {n} kez al',
    'err.red': 'Bağlantı yok. Tekrar dene.', 'err.misiones_vencidas': 'Bu görevlerin süresi doldu. Bugünkülere bak.', 'err.mision_invalida': 'Bu görev artık yok.',
    'err.limite_intentos': 'Arka arkaya çok fazla işlem. Biraz bekle.', 'err.error': 'Alınamadı. Tekrar dene.',
  };
  TRAD.id = {
    tag: 'Misi', titulo: 'Misi harian', semana: 'Misi mingguan', actividad: 'Aktivitas', pts: '{n} poin',
    cofre: 'Peti {n}', toca: 'Ketuk peti untuk melihat isinya.', cofre_n: 'Peti {n} poin', faltan: 'Kurang {n} poin lagi.',
    reclamar: 'Klaim', reclamar_todo: 'Klaim semua ({n})', listo: 'Selesai', mas_pts: '+{n} poin', xp: '+{n} XP pass',
    renuevan: 'Misi baru dalam {t}', fijo: 'Hadiah tetap dan terlihat: tanpa kotak acak.', con_cuenta: 'Dengan akun, peti 60 dan 100 juga memberi kredit.',
    solo_cuenta: '{n} kredit dengan akun', ok: 'Beres! {lista}', todo_ok: 'Kamu mengklaim {n} hadiah!', ya: 'Kamu sudah mengklaim hadiah itu.', no_listo: 'Misi itu belum selesai.',
    creditos: '{n} kredit', tope: 'Hari ini kamu sudah mencapai batas kredit misi.', espera: 'Sebentar…',
    't.d': '{n} hr', 't.h': '{n} jam', 't.m': '{n} mnt',
    'c.cable': 'kabel cadangan', 'c.battery': 'baterai',
    'mat.cables': 'kabel', 'mat.placas': 'papan', 'mat.paneles': 'panel LED', 'mat.credenciales': 'kartu pers', 'mat.planos': 'cetak biru', 'mat.chips': 'cip 4K',
    'm.eventos': 'Jalankan {n} acara', 'm.estrellas4': 'Dapatkan 4★ atau lebih di satu acara', 'm.cinco': 'Dapatkan 5★ di satu acara', 'm.ganar': 'Hasilkan {m} dari acara',
    'm.reparar': 'Perbaiki satu peralatan', 'm.contratar': 'Rekrut seseorang', 'm.repuesto': 'Beli satu suku cadang', 'm.equipo': 'Beli satu peralatan',
    'm.publicidad': 'Pasang iklan', 'm.en_linea': 'Mainkan satu acara online', 'm.entrega': 'Klaim kiriman harian markas',
    'm.eventos_s': 'Jalankan {n} acara', 'm.estrellas4_s': 'Dapatkan 4★ atau lebih di {n} acara', 'm.cinco_s': 'Dapatkan 5★ di {n} acara', 'm.ganar_s': 'Hasilkan {m} dari acara',
    'm.reparar_s': 'Perbaiki {n} peralatan', 'm.contratar_s': 'Rekrut {n} orang', 'm.en_linea_s': 'Mainkan {n} acara online',
    'm.obra_s': 'Selesaikan {n} peningkatan markas', 'm.entrega_s': 'Klaim kiriman harian markas {n} kali',
    'err.red': 'Tidak ada koneksi. Coba lagi.', 'err.misiones_vencidas': 'Misi itu sudah kedaluwarsa. Lihat misi hari ini.', 'err.mision_invalida': 'Misi itu sudah tidak tersedia.',
    'err.limite_intentos': 'Terlalu banyak aksi beruntun. Tunggu sebentar.', 'err.error': 'Gagal mengklaim. Coba lagi.',
  };
  TRAD['zh-CN'] = {
    tag: '任务', titulo: '每日任务', semana: '每周任务', actividad: '活跃度', pts: '{n} 分',
    cofre: '宝箱 {n}', toca: '点一下宝箱，看看里面有什么。', cofre_n: '{n} 分宝箱', faltan: '还差 {n} 分。',
    reclamar: '领取', reclamar_todo: '全部领取（{n}）', listo: '已领取', mas_pts: '+{n} 分', xp: '+{n} 通行证经验',
    renuevan: '{t}后刷新', fijo: '奖励固定且公开：没有盲盒。', con_cuenta: '登录账号后，60 分和 100 分宝箱还送积分。',
    solo_cuenta: '登录可得 {n} 积分', ok: '完成！{lista}', todo_ok: '你领取了 {n} 个奖励！', ya: '这个奖励你已经领过了。', no_listo: '这个任务还没完成。',
    creditos: '{n} 积分', tope: '今天任务积分已达上限。', espera: '请稍等…',
    't.d': '{n} 天', 't.h': '{n} 小时', 't.m': '{n} 分钟',
    'c.cable': '备用线缆', 'c.battery': '电池',
    'mat.cables': '线缆', 'mat.placas': '电路板', 'mat.paneles': 'LED 面板', 'mat.credenciales': '证件', 'mat.planos': '图纸', 'mat.chips': '4K 芯片',
    'm.eventos': '完成 {n} 场活动', 'm.estrellas4': '在一场活动中拿到 4★ 或以上', 'm.cinco': '在一场活动中拿到 5★', 'm.ganar': '通过活动赚 {m}',
    'm.reparar': '修理一件设备', 'm.contratar': '雇用一个人', 'm.repuesto': '购买一个备件', 'm.equipo': '购买一件设备',
    'm.publicidad': '做一次宣传', 'm.en_linea': '玩一场在线活动', 'm.entrega': '领取基地每日补给',
    'm.eventos_s': '完成 {n} 场活动', 'm.estrellas4_s': '在 {n} 场活动中拿到 4★ 或以上', 'm.cinco_s': '在 {n} 场活动中拿到 5★', 'm.ganar_s': '通过活动赚 {m}',
    'm.reparar_s': '修理 {n} 件设备', 'm.contratar_s': '雇用 {n} 个人', 'm.en_linea_s': '玩 {n} 场在线活动',
    'm.obra_s': '完成 {n} 项基地升级', 'm.entrega_s': '领取基地每日补给 {n} 次',
    'err.red': '没有网络，请再试一次。', 'err.misiones_vencidas': '这些任务已过期，看看今天的吧。', 'err.mision_invalida': '这个任务已经不可用了。',
    'err.limite_intentos': '操作太频繁，请稍等。', 'err.error': '领取失败，请再试一次。',
  };
  /* Textos de los premios por constancia: SOLO español (regla de Dimitry: se traducen al final, con la versión aprobada). */
  const TX = {
    'f.titulo': 'Premios por constancia', 'f.sub': 'Gratis: solo juega tus misiones',
    'f.regla': 'Un día cuenta cuando abres el cofre de 60 puntos (3 misiones del día).',
    'f.semana': 'Cofre de la semana', 'f.semana_meta': 'Juega {n} de los 7 días', 'f.dias': '{n}/{m} días',
    'f.mes': 'Ruta de {mes}', 'f.mes_meta': 'Días activos este mes: {n}', 'f.hito': '{n} días',
    'f.premio_semana': 'Premio de la semana', 'f.exclusivo_mes': 'Equipo exclusivo del mes',
    'f.ps.obra': 'Equipo de obra extra por {n} h', 'f.ps.estrella': 'Personal estrella de la semana ({n} partidos)', 'f.ps.vip': 'Prueba del Pase VIP ({n} día)',
    'f.solo_cuenta': 'con cuenta', 'f.faltan': 'Faltan {n} días', 'f.reclamar': 'Abrir', 'f.listo': 'Abierto',
    'f.ok_semana': '¡Cofre de la semana! {lista}', 'f.ok_mes': '¡Premio de {n} días! {lista}', 'f.no_listo': 'Todavía te faltan días activos para ese premio.',
    'f.pie_cuenta': 'Con tu cuenta también ganas créditos, el premio de la semana y el equipo exclusivo del mes.',
    'f.tope_semana': 'Esta semana ya llegaste al tope de créditos de las misiones.',
    'ex.ex_lluvia': 'Cobertor de lluvia Oro', 'ex.ex_maletas': 'Maletas Oro con ruedas', 'ex.ex_cable': 'Fibra SMPTE Oro 150 m',
    'ex.ex_mics': 'Micrófonos inalámbricos Oro', 'ex.ex_monitor': 'Monitor OLED Oro 24"', 'ex.ex_wireless': 'Video inalámbrico Oro',
    meses: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  };
  const tx = (k, p) => { const v = TX[k] !== undefined ? String(TX[k]) : k; return p ? v.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined && p[x] !== null ? String(p[x]) : m)) : v; };
  const TITULO_PL = { es: 'Misiones', en: 'Missions', 'pt-BR': 'Missões', fr: 'Missions', de: 'Missionen', it: 'Missioni', ru: 'Задания', tr: 'Görevler', id: 'Misi', 'zh-CN': '任务' };

  function idioma() { try { const c = root.I18N && root.I18N.idioma; return c && TRAD[c] ? c : 'es'; } catch (e) { return 'es'; } }
  function t(k, p) {
    const d = TRAD[idioma()] || TRAD.es;
    const s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : (Object.prototype.hasOwnProperty.call(TRAD.es, k) ? TRAD.es[k] : k);
    return p ? String(s).replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined && p[x] !== null ? String(p[x]) : m)) : String(s);
  }
  const tiene = (k) => Object.prototype.hasOwnProperty.call(TRAD.es, k);
  const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (n) => { try { return Number(n).toLocaleString(idioma() === 'zh-CN' ? 'zh-CN' : idioma()); } catch (e) { return String(n); } };

  /* ---------- Fechas (día real del celular) y elección (igual que Misiones.php) ---------- */
  function fnv(s) {
    let h = 0x811C9DC5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xFF; h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function elegir(tipo, fecha, enLinea) {
    const defs = tipo === 's' ? SEMANA : DIA;
    const ids = Object.keys(defs);
    const fija = ids.shift();
    const resto = ids.filter((id) => enLinea !== false || !defs[id].en_linea);
    const h = {};
    resto.forEach((id) => { h[id] = fnv(fecha + ':' + id); });
    resto.sort((a, b) => (h[a] - h[b]) || (a < b ? -1 : a > b ? 1 : 0));
    return [fija].concat(resto.slice(0, POR - 1));
  }
  const pad = (n) => String(n).padStart(2, '0');
  function fechaHoy() {
    try {
      if (typeof root.__ENVIVO_FECHA === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(root.__ENVIVO_FECHA)) return root.__ENVIVO_FECHA;
      const m = root.location && /[?&]fecha=(\d{4}-\d{2}-\d{2})\b/.exec(root.location.search || '');
      if (m) return m[1];
    } catch (e) { /* reloj */ }
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function lunes(fecha) {
    const [y, mo, d] = fecha.split('-').map(Number);
    const x = new Date(Date.UTC(y, mo - 1, d, 12));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate());
  }
  const diaNum = (f) => { const [y, mo, d] = f.split('-').map(Number); return Math.floor(Date.UTC(y, mo - 1, d, 12) / 86400000); };
  const deNum = (n) => { const x = new Date(n * 86400000 + 43200000); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()); };
  const masDias = (f, n) => deNum(diaNum(f) + n);
  /** Premio de la semana del lunes (rota cada lunes: obra → estrella → vip), igual que Misiones::premioSemana. */
  function premioSemana(lun) { const k = Object.keys(PREMIOS_SEMANA); const n = Math.floor((diaNum(lun) - 4) / 7); return k[((n % k.length) + k.length) % k.length]; }
  function exclusivoMes(mes) { const n = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1; return EXCLUSIVOS_MES[n % EXCLUSIVOS_MES.length]; }
  // Segundos hasta la próxima medianoche (dias = 1) o el próximo lunes (dias = días que faltan) del celular
  function hastaMedianoche(dias) {
    const a = new Date();
    const f = new Date(a.getFullYear(), a.getMonth(), a.getDate() + dias);
    return Math.max(60, (f - a) / 1000);
  }
  function tiempo(seg) {
    seg = Math.max(0, Math.floor(seg));
    if (seg >= 86400) return t('t.d', { n: Math.floor(seg / 86400) }) + ' ' + t('t.h', { n: Math.floor((seg % 86400) / 3600) });
    if (seg >= 3600) return t('t.h', { n: Math.floor(seg / 3600) });
    return t('t.m', { n: Math.max(1, Math.floor(seg / 60)) });
  }

  /* ---------- Cuenta y servidor ---------- */
  const logueado = () => { try { const A = root.Api; return !!(A && A.disponible !== false && typeof A.logueado === 'function' && A.logueado()); } catch (e) { return false; } };
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
      const x = new Error(tiene('err.' + cod) ? t('err.' + cod) : ((j && j.error) || t('err.error')));
      x.codigo = cod; x.status = r.status;
      throw x;
    }
    return j;
  }

  /* ---------- Estado en la partida: s.misiones ---------- */
  const st = { ctx: null, sel: null, ocupado: false, srv: null, srvEn: 0, srvErrEn: 0, cargando: null, quien: undefined };
  function nuevoPeriodo(tipo, p, on) { return { p, ids: elegir(tipo, p, on), on: !!on, c: {}, r: {} }; }
  function okPeriodo(x) { return x && typeof x === 'object' && typeof x.p === 'string' && Array.isArray(x.ids) && x.c && typeof x.c === 'object' && x.r && typeof x.r === 'object'; }
  /** Crea/rota s.misiones al día y la semana de hoy. Con cuenta, las misiones son las del servidor (con "en línea"). */
  function asegurar(s) {
    if (!s || typeof s !== 'object') return null;
    const hoy = fechaHoy(), lun = lunes(hoy), on = logueado();
    let m = s.misiones;
    if (!m || typeof m !== 'object' || m.v !== 1) m = s.misiones = { v: 1, d: null, w: null, b: {} };
    if (!m.b || typeof m.b !== 'object') m.b = {};
    // Premios por constancia: días activos (cofre de 60 abierto) y la ruta del mes
    if (!m.h || typeof m.h !== 'object' || Array.isArray(m.h)) m.h = {};
    const mes = hoy.slice(0, 7);
    if (!m.mes || typeof m.mes !== 'object' || m.mes.p !== mes || !m.mes.r || typeof m.mes.r !== 'object') { m.mes = { p: mes, r: {} }; st.cambio = true; }
    if (!okPeriodo(m.d) || m.d.p !== hoy) { m.d = nuevoPeriodo('d', hoy, on); st.cambio = true; }
    if (!okPeriodo(m.w) || m.w.p !== lun) { m.w = nuevoPeriodo('s', lun, on); st.cambio = true; }
    // Entró a su cuenta a mitad del día: las mismas que el servidor (el avance se guarda por contador, no se pierde)
    if (on && !m.d.on) { m.d.ids = elegir('d', m.d.p, true); m.d.on = true; st.cambio = true; }
    if (on && !m.w.on) { m.w.ids = elegir('s', m.w.p, true); m.w.on = true; st.cambio = true; }
    if (m.d.r[DIA_ACTIVO] && !m.h[m.d.p]) { m.h[m.d.p] = 1; st.cambio = true; }
    const viejo = masDias(hoy, -62);
    Object.keys(m.h).forEach((f) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f < viejo) { delete m.h[f]; st.cambio = true; } });
    return m;
  }
  function sumar(m, k, n) {
    if (!m || CLAVES.indexOf(k) < 0) return;
    const v = Math.max(0, Math.round(Number(n) || 0));
    if (!v) return;
    m.d.c[k] = (m.d.c[k] || 0) + v;
    m.w.c[k] = (m.w.c[k] || 0) + v;
  }
  function esIntento(s) { try { const G = root.Game; return !!(s && (s.intento === true || (G && G.esIntento && G.esIntento(s)))); } catch (e) { return false; } }
  function principal() {
    try { if (st.ctx && typeof st.ctx.S === 'function') return st.ctx.S(); } catch (e) { /* abajo */ }
    try { if (st.ctx && st.ctx.estado && typeof st.ctx.estado === 'object') return st.ctx.estado; } catch (e) { /* abajo */ }
    try { return root.__game ? root.__game.state : null; } catch (e) { return null; }
  }
  function guardar() { try { if (st.ctx && typeof st.ctx.save === 'function') st.ctx.save(); } catch (e) { /* nada */ } }
  /** Suma avance a una clave (evento, estrellas4, estrellas5, ganar, reparar, contratar, repuesto, equipo, publicidad,
      en_linea, entrega, obra). s = la partida (por defecto la de Inicio). Devuelve true si contó. */
  function marcar(clave, n, s) {
    const x = s || principal();
    if (!x || esIntento(x) || x.gameOver) return false;
    const m = asegurar(x);
    if (!m || CLAVES.indexOf(clave) < 0) return false;
    sumar(m, clave, n === undefined ? 1 : n);
    return true;
  }
  /** Mira la sede (local u oficial): mejoras terminadas y la entrega del día. Devuelve true si cambió algo. */
  function observar(s) {
    if (!s || esIntento(s)) return false;
    const m = asegurar(s);
    const sd = s.sede;
    if (!m || !sd || typeof sd !== 'object') return false;
    const b = m.b;
    let cambio = false;
    const modo = sd.oficial ? 'of' : 'loc';
    const mej = sd.mejoras && typeof sd.mejoras === 'object' ? Object.keys(sd.mejoras).filter((k) => sd.mejoras[k]).length : 0;
    const n = mej + (Number(sd.nivel) || 1);
    if (b.modo === modo && typeof b.n === 'number' && n > b.n) { sumar(m, 'obra', Math.min(5, n - b.n)); cambio = true; }
    if (b.modo !== modo || b.n !== n) { b.modo = modo; b.n = n; cambio = true; }
    if (modo === 'loc') {
      const uc = sd.ultimoCofre;
      if (b.uc !== undefined && uc !== b.uc && uc === s.day) { sumar(m, 'entrega', 1); cambio = true; }
      if (b.uc !== uc) { b.uc = uc; cambio = true; }
    } else {
      let disp = null;
      try { const E = root.Sede && root.Sede.oficial && root.Sede.oficial.estado; if (E && E.cofre) disp = !!E.cofre.disponible; } catch (e) { disp = null; }
      if (disp !== null) {
        if (b.od === true && disp === false) { sumar(m, 'entrega', 1); cambio = true; }
        if (b.od !== disp) { b.od = disp; cambio = true; }
      }
    }
    return cambio;
  }

  /* ---------- Avance y premios ---------- */
  const defDe = (tipo, id) => (tipo === 's' ? SEMANA[id] : DIA[id]);
  const perDe = (m, tipo) => (tipo === 's' ? m.w : tipo === 'm' ? m.mes : m.d);
  function avance(m, tipo, id) { const d = defDe(tipo, id); const per = perDe(m, tipo); return d ? Math.min(d.n, per.c[d.k] || 0) : 0; }
  function cumplida(m, tipo, id) { const d = defDe(tipo, id); return !!d && avance(m, tipo, id) >= d.n; }
  function puntos(m) { return Math.min(100, Object.keys(m.d.r).filter((k) => DIA[k]).length * PUNTOS); }
  function porReclamar(m) {
    const out = [];
    m.d.ids.forEach((id) => { if (!m.d.r[id] && cumplida(m, 'd', id)) out.push(['d', id]); });
    m.w.ids.forEach((id) => { if (!m.w.r[id] && cumplida(m, 's', id)) out.push(['s', id]); });
    const p = puntos(m) + out.filter((x) => x[0] === 'd').length * PUNTOS;
    HITOS.forEach((h) => { if (!m.d.r['cofre' + h] && p >= h) out.push(['d', 'cofre' + h]); });
    return out;
  }
  /* ---------- Premios por constancia ---------- */
  function activosEntre(m, desde, hasta) { return Object.keys(m.h || {}).filter((f) => f >= desde && f <= hasta).length; }
  const activosSemana = (m) => activosEntre(m, m.w.p, masDias(m.w.p, 6));
  const activosMes = (m) => activosEntre(m, m.mes.p + '-01', m.mes.p + '-31');
  function listoF2p(m, tipo, id) {
    if (tipo === 's' && id === 'constancia') return activosSemana(m) >= CONSTANCIA.meta;
    const h = /^mes(\d+)$/.exec(id);
    return tipo === 'm' && !!h && !!MES[h[1]] && activosMes(m) >= Number(h[1]);
  }
  function M(n) { try { if (st.ctx && typeof st.ctx.M === 'function') return st.ctx.M(n); } catch (e) { /* abajo */ } return '$' + num(n); }
  function iconoMat(m) { try { if (root.Sede && typeof root.Sede.iconoMat === 'function') return root.Sede.iconoMat(m, 16).replace('class="sd-ico"', 'class="sd-ico mis-ico"'); } catch (e) { /* abajo */ } return '🧱'; }
  /** Partes del premio: [{html, txt}] (html con íconos para la tarjeta; txt para avisos). conCuenta: ¿cuentan los créditos? */
  function partes(p, conCuenta, creditosDados) {
    const out = [];
    if (p.dinero) out.push({ html: '💵 ' + esc(M(p.dinero)), txt: M(p.dinero) });
    Object.keys(p.cons || {}).forEach((k) => { const n = p.cons[k]; out.push({ html: (k === 'battery' ? '🔋' : '🔌') + ' ' + esc(num(n) + ' × ' + t('c.' + k)), txt: num(n) + ' × ' + t('c.' + k) }); });
    Object.keys(p.mat || {}).forEach((k) => { const n = p.mat[k]; out.push({ html: iconoMat(k) + ' ' + esc(num(n) + ' × ' + t('mat.' + k)), txt: num(n) + ' × ' + t('mat.' + k) }); });
    if (p.creditos) {
      const c = creditosDados === undefined ? p.creditos : creditosDados;
      if (conCuenta && c > 0) out.push({ html: '💎 ' + esc(t('creditos', { n: num(c) })), txt: t('creditos', { n: num(c) }) });
      else if (!conCuenta) out.push({ html: '<span class="muted">🔒 ' + esc(t('solo_cuenta', { n: num(p.creditos) })) + '</span>', txt: '' });
    }
    return out;
  }
  const textoPremio = (p, conCuenta, dados) => partes(p, conCuenta, dados).map((x) => x.txt).filter(Boolean).join(' · ');
  function texto(tipo, id) {
    const d = defDe(tipo, id);
    return t('m.' + id, { n: num(d.n), m: M(d.n) });
  }
  function sumarMateriales(s, mat) {
    try { if (!s.sede && root.Sede && root.Sede.migrar) root.Sede.migrar(s); } catch (e) { /* sin sede */ }
    const d = s.sede && s.sede.oficial ? s.sedeLocal : s.sede;
    if (!d || typeof d !== 'object') return;
    if (!d.materiales || typeof d.materiales !== 'object') d.materiales = {};
    Object.keys(mat || {}).forEach((k) => { if (MATS.indexOf(k) >= 0) d.materiales[k] = (d.materiales[k] || 0) + mat[k]; });
  }
  /** Aplica en la partida el dinero y los repuestos (y los materiales si no hay cuenta: van a la sede local). */
  function aplicar(s, p, conMateriales) {
    if (p.dinero) s.money = (Number(s.money) || 0) + p.dinero;
    if (p.cons) { s.stock = s.stock && typeof s.stock === 'object' ? s.stock : {}; Object.keys(p.cons).forEach((k) => { s.stock[k] = (s.stock[k] || 0) + p.cons[k]; }); }
    if (conMateriales && p.mat) sumarMateriales(s, p.mat);
  }
  function premioDe(tipo, id) {
    if (tipo === 's' && id === 'constancia') return CONSTANCIA.premio;
    const hm = /^mes(\d+)$/.exec(id);
    if (tipo === 'm') return hm && MES[hm[1]] ? MES[hm[1]] : null;
    const h = /^cofre(\d+)$/.exec(id);
    if (tipo === 'd' && h) return COFRES[h[1]] || null;
    const d = defDe(tipo, id);
    return d ? d.premio : null;
  }
  function aviso(msg) { try { if (st.ctx && typeof st.ctx.toast === 'function' && msg) st.ctx.toast(msg); } catch (e) { /* nada */ } }
  function sonido(n) { try { if (st.ctx && st.ctx.snd && st.ctx.snd.play) st.ctx.snd.play(n); } catch (e) { /* sin sonido */ } }
  function repintar() { try { if (st.ctx && typeof st.ctx.render === 'function') st.ctx.render(); } catch (e) { /* nada */ } }

  /** Reclama una misión ('d' | 's', id) o un cofre ('d', 'cofre60'). Devuelve {ok, premio, ...} o {ok:false, motivo}. */
  /** Texto del premio especial de la semana o del exclusivo del mes. */
  function textoExtra(tipo, id, per) {
    if (tipo === 's' && id === 'constancia') { const k = premioSemana(per.p); const d = PREMIOS_SEMANA[k]; return tx('f.ps.' + k, { n: d.horas || d.partidos || d.dias }); }
    if (tipo === 'm' && premioDe('m', id) && premioDe('m', id).exclusivo) return tx('ex.' + exclusivoMes(per.p));
    return '';
  }
  /** Reclama una misión ('d' | 's', id), un cofre ('d', 'cofre60'), la constancia ('s', 'constancia') o un hito del mes
      ('m', 'mes7'). Devuelve {ok, premio, ...} o {ok:false, motivo}. */
  async function reclamar(tipo, id, opciones) {
    const silencio = opciones && opciones.silencio;
    const s = principal();
    if (!s) return { ok: false, motivo: 'sin_partida' };
    const m = asegurar(s);
    const per = perDe(m, tipo);
    const cofre = /^cofre(\d+)$/.exec(id);
    const f2p = (tipo === 's' && id === 'constancia') || tipo === 'm';
    const premio = premioDe(tipo, id);
    if (!premio || (!cofre && !f2p && per.ids.indexOf(id) < 0)) return { ok: false, motivo: 'no_existe' };
    if (per.r[id]) { if (!silencio) aviso(t('ya')); return { ok: false, motivo: 'ya' }; }
    const listo = f2p ? listoF2p(m, tipo, id) : cofre ? puntos(m) >= Number(cofre[1]) : cumplida(m, tipo, id);
    if (!listo) { if (!silencio) { aviso(f2p ? tx('f.no_listo') : cofre ? t('faltan', { n: Number(cofre[1]) - puntos(m) }) : t('no_listo')); sonido('error'); } return { ok: false, motivo: 'no_listo' }; }
    const okTxt = (lista) => (tipo === 'm' ? tx('f.ok_mes', { n: id.slice(3), lista }) : f2p ? tx('f.ok_semana', { lista }) : t('ok', { lista }));
    if (logueado()) {
      let j;
      try { j = await pedir('POST', '/api/misiones/reclamar', { periodo: tipo + ':' + per.p, clave: id }); }
      catch (e) {
        if (e.codigo === 'ya_reclamado') { per.r[id] = 1; guardar(); if (!silencio) aviso(t('ya')); return { ok: false, motivo: 'ya' }; }
        if (!silencio) { aviso(e.codigo === 'no_disponible' ? tx('f.no_listo') : e.message); sonido('error'); }
        if (e.codigo === 'no_disponible') { st.srvEn = 0; cargarServidor().catch(() => {}); }
        return { ok: false, motivo: e.codigo || 'error', error: e.message };
      }
      const s2 = principal() || s;
      const m2 = asegurar(s2);
      aplicar(s2, premio, false);
      perDe(m2, tipo).r[id] = 1;
      if (id === DIA_ACTIVO && tipo === 'd') m2.h[per.p] = 1;
      try { if (root.Api && root.Api.estado && typeof j.creditos === 'number') root.Api.estado.creditos = j.creditos; } catch (e) { /* nada */ }
      if (st.srv) { st.srv.creditos_hoy = j.creditos_hoy; if (typeof j.creditos_semana === 'number') st.srv.creditos_semana = j.creditos_semana; }
      guardar();
      let txt = textoPremio(premio, true, j.creditos_dados || 0);
      const ex = j.extra && j.extra.dado !== false ? textoExtra(tipo, id, per) : '';
      if (ex) txt += ' · ' + ex;
      if (j.xp_pase) txt += ' · ' + t('xp', { n: j.xp_pase });
      if (!silencio) { aviso(okTxt(txt) + (j.tope_alcanzado ? ' ' + (f2p ? tx('f.tope_semana') : t('tope')) : '')); sonido('buy'); }
      // Los materiales llegan como entregas (la sede oficial los suma), el exclusivo al inventario y el Pase VIP a la cuenta:
      // refrescar /api/estado y aplicar
      const refrescar = (Array.isArray(j.entregas) && j.entregas.length) || (Array.isArray(j.equipos) && j.equipos.length) || !!j.extra;
      if (refrescar && st.ctx && typeof st.ctx.alReclamar === 'function') { try { Promise.resolve(st.ctx.alReclamar(j)).catch(() => {}); } catch (e) { /* luego */ } }
      return { ok: true, premio, txt, servidor: j };
    }
    aplicar(s, premio, true);
    per.r[id] = 1;
    if (id === DIA_ACTIVO && tipo === 'd') m.h[per.p] = 1;
    guardar();
    const txt = textoPremio(premio, false);
    if (!silencio) { aviso(okTxt(txt)); sonido('buy'); }
    return { ok: true, premio, txt };
  }
  async function reclamarTodo() {
    const s = principal();
    if (!s) return 0;
    let n = 0;
    const lista = porReclamar(asegurar(s));
    // Primero las misiones (dan los puntos), después los cofres
    for (const x of lista.filter((y) => !/^cofre/.test(y[1])).concat(lista.filter((y) => /^cofre/.test(y[1])))) {
      const r = await reclamar(x[0], x[1], { silencio: true });
      if (r.ok) n++;
      else if (r.motivo !== 'ya' && r.motivo !== 'no_listo') { aviso(r.error || t('err.error')); break; }
    }
    if (n) { aviso(t('todo_ok', { n })); sonido('buy'); }
    return n;
  }

  /* ---------- Sincronizar con el servidor (otro celular de la misma cuenta) ---------- */
  function mismaCuenta() {
    let id = null;
    try { id = root.Api && root.Api.estado && root.Api.estado.jugador ? root.Api.estado.jugador.id : null; } catch (e) { id = null; }
    if (id !== st.quien) { st.quien = id; st.srv = null; st.srvEn = 0; st.srvErrEn = 0; }
  }
  function fusionar(s, j) {
    const m = asegurar(s);
    let cambio = false;
    const rec = (j && j.reclamados) || {};
    [['d', m.d], ['s', m.w], ['m', m.mes]].forEach(([tipo, per]) => {
      (rec[tipo + ':' + per.p] || []).forEach((k) => { if (!per.r[k]) { per.r[k] = 1; cambio = true; } });
    });
    // Días activos que cuenta el servidor (otro celular de la misma cuenta)
    const dias = j && j.constancia && Array.isArray(j.constancia.dias) ? j.constancia.dias : [];
    dias.forEach((f) => { if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !m.h[f]) { m.h[f] = 1; cambio = true; } });
    return cambio;
  }
  function cargarServidor() {
    if (st.cargando) return st.cargando;
    st.cargando = pedir('GET', '/api/misiones').then((j) => {
      st.srv = j; st.srvEn = Date.now();
      const s = principal();
      if (s && fusionar(s, j)) { guardar(); repintar(); }
      return j;
    }).catch((e) => { st.srvErrEn = Date.now(); throw e; }).finally(() => { st.cargando = null; });
    return st.cargando;
  }
  function recargar(ctx) { if (ctx) st.ctx = ctx; if (!logueado()) return Promise.resolve(null); st.srvEn = 0; return cargarServidor().catch(() => null); }

  /* ---------- Estilos (una vez) ---------- */
  function estilos() {
    if (typeof document === 'undefined' || document.getElementById('mis-css')) return;
    const s = document.createElement('style');
    s.id = 'mis-css';
    s.textContent = `
.mis-card h3{font-size:19px;margin:4px 0 8px;overflow-wrap:anywhere}
.mis-act{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:10px 10px 8px;margin:0 0 10px;min-width:0}
.mis-act-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px}
.mis-bar{height:9px;background:var(--panel);border-radius:9px;overflow:hidden;margin-top:6px}
.mis-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--green),#7dffb0);border-radius:9px}
.mis-bar.sm{height:7px;margin-top:0;flex:1;min-width:30px;background:var(--panel2)}
.mis-cofres{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:8px}
.mis-cofre{appearance:none;font:inherit;color:var(--text);min-width:0;border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:5px 2px 4px;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;position:relative}
.mis-cofre .mis-p{font-size:11px;font-weight:700;color:var(--muted)}
.mis-cofre .mis-i{font-size:22px;line-height:1.15}
.mis-cofre .mis-e{font-size:10px;line-height:1.1;color:var(--muted);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mis-cofre.listo{border-color:var(--green);box-shadow:0 0 0 1px var(--green) inset}
.mis-cofre.listo .mis-e{color:var(--green);font-weight:700}
.mis-cofre.hecho{opacity:.55}
.mis-cofre.bloq .mis-i{filter:grayscale(.8);opacity:.7}
.mis-cofre.sel{outline:2px solid var(--blue);outline-offset:1px}
.mis-det{font-size:12px;margin-top:6px;min-height:16px;overflow-wrap:anywhere;line-height:1.35}
.mis-fila{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line);min-width:0}
.mis-fila:first-child{border-top:0}
.mis-fila .mis-tx{flex:1;min-width:0}
.mis-fila .mis-tx b{display:block;font-size:14px;font-weight:600;line-height:1.25;overflow-wrap:anywhere}
.mis-fila .mis-pr{font-size:12px;color:var(--muted);margin-top:3px;display:flex;flex-wrap:wrap;gap:2px 8px;line-height:1.3}
.mis-fila .mis-av{display:flex;align-items:center;gap:6px;margin-top:5px}
.mis-fila .mis-av .num{font-size:11px;color:var(--muted);flex:none}
.mis-fila .mis-lado{flex:none;display:flex;align-items:center}
.mis-fila .mis-lado .btn{margin:0;min-height:38px;padding:6px 12px;width:auto}
.mis-fila .mis-ok{font-size:12px;color:var(--green);font-weight:700;white-space:nowrap}
.mis-fila.hecha .mis-tx b{color:var(--muted);text-decoration:line-through}
.mis-sub{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:14px 0 2px;font-size:15px}
.mis-sub small{font-weight:400;color:var(--muted);font-size:12px}
.mis-ico{display:inline-block;vertical-align:-3px}
.mis-pie{font-size:12px;margin:10px 0 0}
.mis-todo{margin:0 0 10px}
.mis-f2p{background:linear-gradient(180deg,rgba(255,196,0,.10),transparent 70%),var(--panel2);border:1px solid rgba(255,196,0,.45);border-radius:14px;padding:10px;margin:0 0 10px;min-width:0}
.mis-f2p-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.mis-f2p-top b{font-size:15px}
.mis-f2p-top small{color:var(--muted);font-size:12px}
.mis-f2p-blq{border-top:1px solid var(--line);padding-top:8px;margin-top:8px;min-width:0}
.mis-f2p-fila{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.mis-f2p-fila .mis-tx{flex:1;min-width:0}
.mis-f2p-fila b{font-size:14px;overflow-wrap:anywhere}
.mis-f2p .mis-pr{font-size:12px;color:var(--muted);margin-top:4px;display:flex;flex-wrap:wrap;gap:2px 8px;line-height:1.3}
.mis-f2p .mis-av{display:flex;align-items:center;gap:6px;margin-top:6px}
.mis-f2p .mis-av .num{font-size:11px;color:var(--muted);flex:none}
.mis-f2p .btn{margin:0;min-height:38px;padding:6px 12px;width:auto;flex:none}
.mis-f2p .mis-ok{font-size:12px;color:var(--green);font-weight:700;white-space:nowrap;flex:none}
.mis-f2p .mis-falta{font-size:11px;color:var(--muted);white-space:nowrap;flex:none}
.mis-gold{color:#ffc400;font-weight:600}
.mis-hitos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px}
.mis-hito{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:6px;min-width:0;display:flex;flex-direction:column;gap:3px;font-size:11px;line-height:1.25;overflow-wrap:anywhere}
.mis-hito .mis-hn{font-weight:700;font-size:12px}
.mis-hito.listo{border-color:var(--green);box-shadow:0 0 0 1px var(--green) inset}
.mis-hito.hecho{opacity:.6}
.mis-hito .btn{min-height:32px;padding:4px 8px;font-size:12px;width:100%}
.mis-f2p-pie{font-size:11px;margin:8px 0 0}
`;
    document.head.appendChild(s);
  }

  /* ---------- Tarjeta de Inicio ---------- */
  function filaHtml(m, tipo, id, conCuenta) {
    const d = defDe(tipo, id);
    const per = perDe(m, tipo);
    const a = avance(m, tipo, id);
    const hecha = !!per.r[id];
    const lista = !hecha && a >= d.n;
    const pct = Math.round(100 * a / d.n);
    const prog = d.k === 'ganar' ? esc(M(a)) + '/' + esc(M(d.n)) : num(a) + '/' + num(d.n);
    const pr = partes(d.premio, conCuenta).map((x) => `<span>${x.html}</span>`);
    if (tipo === 'd') pr.push(`<span>⭐ ${esc(t('mas_pts', { n: PUNTOS }))}</span>`);
    if (conCuenta && st.srv && st.srv.xp_pase) pr.push(`<span>🎟️ ${esc(t('xp', { n: XP_PASE[tipo === 's' ? 's' : 'd'] }))}</span>`);
    const lado = hecha ? `<span class="mis-ok">✓ ${esc(t('listo'))}</span>`
      : lista ? `<button class="btn green sm" data-ext="misiones" data-acc="reclamar" data-t="${tipo}" data-k="${esc(id)}" ${st.ocupado ? 'disabled' : ''}>${esc(t('reclamar'))}</button>` : '';
    return `<div class="mis-fila${hecha ? ' hecha' : ''}${lista ? ' lista' : ''}" data-mision="${tipo}:${esc(id)}">
      <div class="mis-tx"><b>${esc(texto(tipo, id))}</b><div class="mis-pr">${pr.join('')}</div>
        ${hecha ? '' : `<div class="mis-av"><div class="mis-bar sm"><i style="width:${pct}%"></i></div><span class="num">${prog}</span></div>`}</div>
      ${lado ? `<div class="mis-lado">${lado}</div>` : ''}</div>`;
  }
  function cofresHtml(m, conCuenta) {
    const p = puntos(m);
    const tiles = HITOS.map((h) => {
      const hecho = !!m.d.r['cofre' + h];
      const listo = !hecho && p >= h;
      const cls = hecho ? 'hecho' : listo ? 'listo' : 'bloq';
      const e = hecho ? '✓' : listo ? t('reclamar') : '🔒';
      return `<button type="button" class="mis-cofre ${cls}${st.sel === h ? ' sel' : ''}" data-ext="misiones" data-acc="cofre" data-k="${h}" aria-label="${esc(t('cofre', { n: h }) + ' · ' + textoPremio(COFRES[h], conCuenta))}">
        <span class="mis-p">${h}</span><span class="mis-i" aria-hidden="true">${hecho ? '📦' : '🎁'}</span><span class="mis-e">${esc(e)}</span></button>`;
    }).join('');
    const det = st.sel ? `<b>${esc(t('cofre_n', { n: st.sel }))}:</b> ${partes(COFRES[st.sel], conCuenta).map((x) => x.html).join(' · ')}${!m.d.r['cofre' + st.sel] && p < st.sel ? `<br><span class="muted">${esc(t('faltan', { n: st.sel - p }))}</span>` : ''}`
      : `<span class="muted">${esc(t('toca'))}</span>`;
    return `<div class="mis-act" data-mis="actividad"><div class="mis-act-top"><b>${esc(t('actividad'))}</b><span class="num">${p}/100</span></div>
      <div class="mis-bar"><i style="width:${p}%"></i></div><div class="mis-cofres">${tiles}</div><div class="mis-det" data-mis="detalle">${det}</div></div>`;
  }
  /** Bloque "Premios por constancia": cofre de la semana (5 de 7 días) y ruta del mes (7, 14, 21 días). */
  function f2pHtml(m, on) {
    const extra = (txt) => `<span class="${on ? 'mis-gold' : 'muted'}">${on ? '⭐' : '🔒'} ${esc(txt)}${on ? '' : ' · ' + esc(tx('f.solo_cuenta'))}</span>`;
    const lado = (tipo, id, listo, faltan) => (perDe(m, tipo).r[id] ? `<span class="mis-ok">✓ ${esc(tx('f.listo'))}</span>`
      : listo ? `<button class="btn green sm" data-ext="misiones" data-acc="${tipo === 'm' ? 'mes' : 'constancia'}" data-k="${esc(id)}" ${st.ocupado ? 'disabled' : ''}>${esc(tx('f.reclamar'))}</button>`
        : `<span class="mis-falta">${esc(tx('f.faltan', { n: faltan }))}</span>`);
    // Semana
    const as = Math.min(CONSTANCIA.meta, activosSemana(m));
    const ks = premioSemana(m.w.p);
    const ds = PREMIOS_SEMANA[ks];
    const prS = partes(CONSTANCIA.premio, on).map((x) => `<span>${x.html}</span>`);
    prS.push(extra(tx('f.premio_semana') + ': ' + tx('f.ps.' + ks, { n: ds.horas || ds.partidos || ds.dias })));
    const semana = `<div class="mis-f2p-blq" data-mis="constancia"><div class="mis-f2p-fila"><div class="mis-tx"><b>🗓️ ${esc(tx('f.semana'))}</b>
        <div class="small muted">${esc(tx('f.semana_meta', { n: CONSTANCIA.meta }))}</div></div>${lado('s', 'constancia', as >= CONSTANCIA.meta, CONSTANCIA.meta - as)}</div>
      <div class="mis-av"><div class="mis-bar sm"><i style="width:${Math.round(100 * as / CONSTANCIA.meta)}%"></i></div><span class="num">${esc(tx('f.dias', { n: as, m: CONSTANCIA.meta }))}</span></div>
      <div class="mis-pr">${prS.join('')}</div></div>`;
    // Mes
    const am = activosMes(m);
    const tope = HITOS_MES[HITOS_MES.length - 1];
    const nomMes = TX.meses[Number(m.mes.p.slice(5, 7)) - 1] || m.mes.p;
    const hitos = HITOS_MES.map((h) => {
      const id = 'mes' + h;
      const hecho = !!m.mes.r[id];
      const listo = !hecho && am >= h;
      const p = MES[h];
      const pr = partes(p, on).map((x) => `<span>${x.html}</span>`);
      if (p.exclusivo) pr.push(extra(tx('f.exclusivo_mes') + ': ' + tx('ex.' + exclusivoMes(m.mes.p))));
      return `<div class="mis-hito${hecho ? ' hecho' : listo ? ' listo' : ''}" data-hito="${h}"><span class="mis-hn">${esc(tx('f.hito', { n: h }))}</span>${pr.join('')}${lado('m', id, listo, h - am)}</div>`;
    }).join('');
    const mes = `<div class="mis-f2p-blq" data-mis="mes"><div class="mis-f2p-fila"><div class="mis-tx"><b>🏁 ${esc(tx('f.mes', { mes: nomMes }))}</b>
        <div class="small muted">${esc(tx('f.mes_meta', { n: am }))}</div></div></div>
      <div class="mis-av"><div class="mis-bar sm"><i style="width:${Math.min(100, Math.round(100 * am / tope))}%"></i></div><span class="num">${esc(tx('f.dias', { n: Math.min(am, tope), m: tope }))}</span></div>
      <div class="mis-hitos">${hitos}</div></div>`;
    return `<div class="mis-f2p" data-mis="f2p"><div class="mis-f2p-top"><b>🎁 ${esc(tx('f.titulo'))}</b><small>${esc(tx('f.sub'))}</small></div>
      ${semana}${mes}<p class="mis-f2p-pie muted">${esc(tx('f.regla'))}${on ? '' : ' ' + esc(tx('f.pie_cuenta'))}</p></div>`;
  }
  function tarjeta(ctx) {
    st.ctx = ctx || st.ctx;
    const s = principal();
    if (!s || esIntento(s)) return '';
    estilos();
    mismaCuenta();
    const on = logueado();
    const m = asegurar(s);
    if (observar(s) || st.cambio) { st.cambio = false; guardar(); }
    if (on && !st.cargando && (!st.srv || Date.now() - st.srvEn > 300000) && Date.now() - st.srvErrEn > 60000) cargarServidor().catch(() => {});
    const n = porReclamar(m).length;
    const todo = n > 1 ? `<button class="btn green mis-todo" data-ext="misiones" data-acc="todo" ${st.ocupado ? 'disabled' : ''}>🎁 ${esc(t('reclamar_todo', { n }))}</button>` : '';
    return `<div class="card mis-card" data-mis="tarjeta">
      <div class="row between"><div class="story-tag">${esc(t('tag'))}</div><span class="small muted">${esc(t('renuevan', { t: tiempo(hastaMedianoche(1)) }))}</span></div>
      <h3>${esc(t('titulo'))}</h3>
      ${todo}
      ${cofresHtml(m, on)}
      ${f2pHtml(m, on)}
      <div class="mis-lista" data-mis="dia">${m.d.ids.map((id) => filaHtml(m, 'd', id, on)).join('')}</div>
      <div class="mis-sub"><b>${esc(t('semana'))}</b><small>${esc(t('renuevan', { t: tiempo(hastaMedianoche(7 - ((new Date().getDay() + 6) % 7))) }))}</small></div>
      <div class="mis-lista" data-mis="semana">${m.w.ids.map((id) => filaHtml(m, 's', id, on)).join('')}</div>
      <p class="mis-pie muted">${esc(t('fijo'))}${on ? '' : ' ' + esc(t('con_cuenta'))}</p></div>`;
  }

  async function clic(ctx, acc, el) {
    st.ctx = ctx || st.ctx;
    const k = el && el.getAttribute ? el.getAttribute('data-k') : null;
    if (acc === 'cofre') {
      const h = Number(k);
      if (!COFRES[h]) return;
      const s = principal(); const m = s && asegurar(s);
      if (m && !m.d.r['cofre' + h] && puntos(m) >= h) { st.sel = h; await accion(() => reclamar('d', 'cofre' + h)); return; }
      st.sel = st.sel === h ? null : h;
      sonido('tap');
      repintar();
      return;
    }
    if (acc === 'reclamar') { const tp = el && el.getAttribute('data-t') === 's' ? 's' : 'd'; await accion(() => reclamar(tp, k)); return; }
    if (acc === 'todo') { await accion(() => reclamarTodo()); return; }
    if (acc === 'constancia') { await accion(() => reclamar('s', 'constancia')); return; }
    if (acc === 'mes' && /^mes\d{1,2}$/.test(String(k))) { await accion(() => reclamar('m', k)); }
  }
  async function accion(fn) {
    if (st.ocupado) return null;
    st.ocupado = true;
    repintar();
    try { return await fn(); } finally { st.ocupado = false; repintar(); }
  }

  /* ---------- Contadores del juego ---------- */
  const EXT = {
    id: 'misiones',
    alTerminarEvento(s, result) {
      if (!result) return;
      marcar('evento', 1, s);
      if (result.stars >= 4) marcar('estrellas4', 1, s);
      if (result.stars >= 5) marcar('estrellas5', 1, s);
      if (result.net > 0) marcar('ganar', result.net, s);
      observar(s);
    },
    alNuevoDia(s) { observar(s); },
  };
  const ENVOLVER = { hire: 'contratar', repair: 'reparar', buy: 'equipo', buyConsumable: 'repuesto', marketing: 'publicidad' };
  let puesto = false, vivoPuesto = false, tarjetaPuesta = false;
  function envolverJuego(G) {
    if (!G || G.__misionesEnvuelto) return;
    Object.keys(ENVOLVER).forEach((fn) => {
      const orig = G[fn];
      if (typeof orig !== 'function') return;
      G[fn] = function (s) {
        const r = orig.apply(this, arguments);
        try { if (r && r.ok && s && typeof s === 'object') marcar(ENVOLVER[fn], 1, s); } catch (e) { /* nunca rompe la acción */ }
        return r;
      };
    });
    try { Object.defineProperty(G, '__misionesEnvuelto', { value: true }); } catch (e) { G.__misionesEnvuelto = true; }
  }
  function envolverVivo() {
    const V = root.EnVivoVivo;
    if (!V || vivoPuesto || V.__misionesEnvuelto || typeof V.terminar !== 'function') return;
    const orig = V.terminar;
    V.terminar = function () {
      const r = orig.apply(this, arguments);
      try { const s = principal(); if (s && marcar('en_linea', 1, s)) guardar(); } catch (e) { /* nada */ }
      return r;
    };
    try { Object.defineProperty(V, '__misionesEnvuelto', { value: true }); } catch (e) { V.__misionesEnvuelto = true; }
    vivoPuesto = true;
  }
  function registrar() {
    const G = root.Game;
    if (G && !puesto && typeof G.registrarExtension === 'function') { G.registrarExtension(EXT); envolverJuego(G); puesto = true; }
    envolverVivo();
    if (!tarjetaPuesta && typeof root.window !== 'undefined') {
      root.EnVivoInicio = root.EnVivoInicio || [];
      if (!root.EnVivoInicio.some((x) => x && x.id === 'misiones')) root.EnVivoInicio.push({ id: 'misiones', orden: 3, tarjeta, clic });
      tarjetaPuesta = true;
    }
    return puesto;
  }
  registrar();
  try { if (root.document) { root.document.addEventListener('DOMContentLoaded', registrar); root.addEventListener('load', registrar); } } catch (e) { /* sin documento */ }

  const Misiones = { tarjeta, clic, marcar, observar, asegurar, elegir, fnv, reclamar, reclamarTodo, porReclamar, puntos, avance, recargar,
    DIA, SEMANA, COFRES, HITOS, PUNTOS, XP_PASE, TRAD, EXT, fechaHoy, lunes, registrar,
    CONSTANCIA, PREMIOS_SEMANA, MES, HITOS_MES, EXCLUSIVOS_MES, CREDITOS_SEMANA, DIA_ACTIVO, TX, premioSemana, exclusivoMes, activosSemana, activosMes, listoF2p,
    titulo: () => TITULO_PL[idioma()] || TITULO_PL.es, TITULO_PL,
    _st: st };
  root.Misiones = Misiones;
  if (typeof module !== 'undefined' && module.exports) module.exports = Misiones;
})(typeof window !== 'undefined' ? window : globalThis);
