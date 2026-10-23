/* =========================================================
   EN VIVO Tycoon — Decoración del local (para recibir a los clientes que te visitan)
   - Compras plantas, flores, sofá, cafetera, letrero de neón con tu nombre... para el garaje, la oficina,
     el estudio o el centro de producción. Cada local tiene más lugares (3, 5, 7, 9).
   - Imagen del local (0-100) = suma de lo que tienes puesto. Da ofertas un poco mejor pagadas
     (+1 % cada 10 puntos, tope +8 %) y, con imagen 30 o más, un cliente pasa a visitarte cada pocos días
     y deja una oferta. Nunca toca la calidad de los eventos.
   - Realista: las flores frescas duran 5 días; marchitas RESTAN imagen hasta que las cambias o las quitas.
     Cafetera, agua, neón, TV y aire tienen un gasto por día (café, botellones, luz).
   - Extensión de la lógica (Game.registrarExtension): migrar, alNuevoDia, multPago, contratosExtra, gastoFijo.
     Los intentos en línea (s.intento) no aplican extensiones. Todo determinista: solo cuenta s.day.
   - Pantalla: tarjeta de Inicio (window.EnVivoInicio, id 'decoracion') y Decoracion.capa(s, local) para dibujar
     la decoración encima de la sede (Art.hq). Ver server/INTEGRAR_DECORACION.md.
   ========================================================= */
(function (root) {
  'use strict';
  const G = root.Game || (typeof require === 'function' ? require('./logic.js') : null);
  if (!G || typeof G.registrarExtension !== 'function') return;

  /* ---------- Números para ajustar ---------- */
  const AJUSTE = {
    lugares: [3, 5, 7, 9],        // garaje, oficina, estudio, centro de producción
    puntosPorPct: 10,             // +1 % de pago en las ofertas cada 10 puntos de imagen (redondeado)
    pctMax: 8,                    // tope: +8 %
    visitas: [[60, 4], [30, 6]],  // [imagen mínima, cada cuántos días pasa un cliente a dejar una oferta]
    reventa: 0.3,                 // al quitar algo (menos las flores) te devuelven el 30 %
    marchitas: -4,                // flores marchitas: restan imagen
    trofeosMax: 6,
  };
  /* Catálogo: k, precio (USD), pts de imagen, gasto por día, min = local mínimo (0 garaje … 3 centro),
     max = cuántos puedes tener, dias = cuánto duran frescas (flores) */
  const CATALOGO = [
    { k: 'flores', precio: 30, pts: 9, dias: 5, min: 0 },
    { k: 'planta', precio: 25, pts: 5, min: 0, max: 2 },
    { k: 'sofa', precio: 280, pts: 12, min: 0 },
    { k: 'neon', precio: 180, pts: 10, gasto: 1, min: 0, nota: 'x_nombre' },
    { k: 'cafetera', precio: 120, pts: 8, gasto: 2, min: 0 },
    { k: 'agua', precio: 60, pts: 4, gasto: 1, min: 0 },
    { k: 'alfombra', precio: 45, pts: 4, min: 0 },
    { k: 'cuadros', precio: 60, pts: 4, min: 0, extraMax: 4, nota: 'x_evento' },
    { k: 'trofeos', precio: 90, pts: 3, min: 1, extraMax: 6, nota: 'x_trofeo' },
    { k: 'tv', precio: 380, pts: 11, gasto: 1, min: 1 },
    { k: 'recepcion', precio: 520, pts: 14, min: 2 },
    { k: 'aire', precio: 650, pts: 9, gasto: 3, min: 2 },
  ];
  const DEF = {};
  CATALOGO.forEach((d) => { DEF[d.k] = d; });

  /* ---------- Textos (10 idiomas) ---------- */
  const TRAD = {
    es: {
      tit: 'Decoración', imagen: 'Imagen del local', h_resumen: 'Imagen del local {n}/100 · ofertas +{p}%',
      lugares: 'Lugares {n}/{m}', mant: 'Mantenimiento {m}/día', mant0: 'Sin mantenimiento', decorar: 'Decorar',
      modal_t: 'Decorar el local', efecto: 'Imagen {n}/100 → ofertas +{p}%', visita_cada: 'Un cliente pasa a visitarte cada {n} días',
      visita_no: 'Con imagen 30 o más, los clientes pasan a visitarte', en_local: 'En tu local', tienda: 'Comprar',
      vacio: 'Tu local está vacío: unas flores y un sofá ya reciben mejor a tus clientes.', guardados: 'Guardados sin lugar: {n}',
      guardado: 'Guardado', comprar: 'Comprar', quitar: 'Quitar', cambiar: 'Cambiar flores', pts: '+{n} imagen', pts_neg: '{n} imagen',
      por_dia: '{m}/día', dura: 'Dura {n} días', frescas: 'Frescas · {n} días', frescas1: 'Frescas · último día', marchitas: 'Marchitas',
      desde: 'Desde {lugar}', sin_lugar: 'Sin lugar', tienes: 'Lo tienes', x_evento: '+1 cada 10 eventos', x_trofeo: '+1 por trofeo',
      x_nombre: 'Con tu nombre', ok_compra: 'Compraste: {item}', ok_quitar: 'Quitaste: {item}', ok_quitar_m: 'Quitaste: {item} (+{m})',
      ok_flores: 'Flores nuevas: frescas {n} días', no_dinero: 'No te alcanza: cuesta {m}', no_lugar: 'No hay lugar: tu local tiene {n} lugares',
      no_local: 'Necesitas un local más grande: {lugar}', no_max: 'Ya tienes el máximo de este', no_hay: 'No existe',
      log_compra: 'Decoraste el local: {item} ({m})', log_marchitas: 'Se marchitaron las flores del local: cámbialas o quítalas',
      log_visita: 'Un cliente pasó por tu local y dejó una oferta: {cliente}', nombre_def: 'MI PRODUCTORA', c_decor: 'Decoración {m}',
      'it.flores': 'Flores frescas', 'it.planta': 'Planta en maceta', 'it.sofa': 'Sofá para clientes', 'it.neon': 'Letrero de neón',
      'it.cafetera': 'Cafetera para visitas', 'it.agua': 'Dispensador de agua', 'it.alfombra': 'Alfombra', 'it.cuadros': 'Cuadros de tus eventos',
      'it.trofeos': 'Repisa de trofeos', 'it.tv': 'TV con tu reel', 'it.recepcion': 'Recepción', 'it.aire': 'Aire acondicionado',
    },
    en: {
      tit: 'Decor', imagen: 'Venue image', h_resumen: 'Venue image {n}/100 · offers +{p}%',
      lugares: 'Spots {n}/{m}', mant: 'Upkeep {m}/day', mant0: 'No upkeep', decorar: 'Decorate',
      modal_t: 'Decorate your venue', efecto: 'Image {n}/100 → offers +{p}%', visita_cada: 'A client drops by every {n} days',
      visita_no: 'With image 30 or more, clients drop by to visit', en_local: 'In your venue', tienda: 'Buy',
      vacio: 'Your venue is empty: some flowers and a sofa already make clients feel welcome.', guardados: 'Stored, no spot: {n}',
      guardado: 'Stored', comprar: 'Buy', quitar: 'Remove', cambiar: 'Replace flowers', pts: '+{n} image', pts_neg: '{n} image',
      por_dia: '{m}/day', dura: 'Lasts {n} days', frescas: 'Fresh · {n} days', frescas1: 'Fresh · last day', marchitas: 'Wilted',
      desde: 'From {lugar}', sin_lugar: 'No spot', tienes: 'Owned', x_evento: '+1 per 10 events', x_trofeo: '+1 per trophy',
      x_nombre: 'With your name', ok_compra: 'Bought: {item}', ok_quitar: 'Removed: {item}', ok_quitar_m: 'Removed: {item} (+{m})',
      ok_flores: 'New flowers: fresh for {n} days', no_dinero: 'Not enough money: it costs {m}', no_lugar: 'No room: your venue has {n} spots',
      no_local: 'You need a bigger venue: {lugar}', no_max: 'You already have the maximum of this', no_hay: 'Does not exist',
      log_compra: 'You decorated your venue: {item} ({m})', log_marchitas: 'The flowers in your venue wilted: replace or remove them',
      log_visita: 'A client dropped by your venue and left an offer: {cliente}', nombre_def: 'MY PRODUCTION CO', c_decor: 'Decor {m}',
      'it.flores': 'Fresh flowers', 'it.planta': 'Potted plant', 'it.sofa': 'Client sofa', 'it.neon': 'Neon sign',
      'it.cafetera': 'Coffee machine', 'it.agua': 'Water dispenser', 'it.alfombra': 'Rug', 'it.cuadros': 'Framed event posters',
      'it.trofeos': 'Trophy shelf', 'it.tv': 'TV with your reel', 'it.recepcion': 'Reception desk', 'it.aire': 'Air conditioning',
    },
    'pt-BR': {
      tit: 'Decoração', imagen: 'Imagem do local', h_resumen: 'Imagem do local {n}/100 · ofertas +{p}%',
      lugares: 'Espaços {n}/{m}', mant: 'Manutenção {m}/dia', mant0: 'Sem manutenção', decorar: 'Decorar',
      modal_t: 'Decorar o local', efecto: 'Imagem {n}/100 → ofertas +{p}%', visita_cada: 'Um cliente passa para visitar a cada {n} dias',
      visita_no: 'Com imagem 30 ou mais, os clientes passam para visitar', en_local: 'No seu local', tienda: 'Comprar',
      vacio: 'Seu local está vazio: umas flores e um sofá já recebem melhor seus clientes.', guardados: 'Guardados sem espaço: {n}',
      guardado: 'Guardado', comprar: 'Comprar', quitar: 'Tirar', cambiar: 'Trocar flores', pts: '+{n} imagem', pts_neg: '{n} imagem',
      por_dia: '{m}/dia', dura: 'Dura {n} dias', frescas: 'Frescas · {n} dias', frescas1: 'Frescas · último dia', marchitas: 'Murchas',
      desde: 'A partir de {lugar}', sin_lugar: 'Sem espaço', tienes: 'Você tem', x_evento: '+1 a cada 10 eventos', x_trofeo: '+1 por troféu',
      x_nombre: 'Com o seu nome', ok_compra: 'Você comprou: {item}', ok_quitar: 'Você tirou: {item}', ok_quitar_m: 'Você tirou: {item} (+{m})',
      ok_flores: 'Flores novas: frescas por {n} dias', no_dinero: 'Dinheiro insuficiente: custa {m}', no_lugar: 'Sem espaço: seu local tem {n} espaços',
      no_local: 'Você precisa de um local maior: {lugar}', no_max: 'Você já tem o máximo deste', no_hay: 'Não existe',
      log_compra: 'Você decorou o local: {item} ({m})', log_marchitas: 'As flores do local murcharam: troque ou tire',
      log_visita: 'Um cliente passou no seu local e deixou uma oferta: {cliente}', nombre_def: 'MINHA PRODUTORA', c_decor: 'Decoração {m}',
      'it.flores': 'Flores frescas', 'it.planta': 'Planta no vaso', 'it.sofa': 'Sofá para clientes', 'it.neon': 'Letreiro neon',
      'it.cafetera': 'Cafeteira para visitas', 'it.agua': 'Bebedouro', 'it.alfombra': 'Tapete', 'it.cuadros': 'Quadros dos seus eventos',
      'it.trofeos': 'Prateleira de troféus', 'it.tv': 'TV com seu reel', 'it.recepcion': 'Recepção', 'it.aire': 'Ar-condicionado',
    },
    fr: {
      tit: 'Décoration', imagen: 'Image du local', h_resumen: 'Image du local {n}/100 · offres +{p} %',
      lugares: 'Places {n}/{m}', mant: 'Entretien {m}/jour', mant0: 'Sans entretien', decorar: 'Décorer',
      modal_t: 'Décorer le local', efecto: 'Image {n}/100 → offres +{p} %', visita_cada: 'Un client passe vous voir tous les {n} jours',
      visita_no: 'Avec une image de 30 ou plus, les clients passent vous voir', en_local: 'Dans votre local', tienda: 'Acheter',
      vacio: 'Votre local est vide : quelques fleurs et un canapé accueillent déjà mieux vos clients.', guardados: 'Rangés faute de place : {n}',
      guardado: 'Rangé', comprar: 'Acheter', quitar: 'Retirer', cambiar: 'Changer les fleurs', pts: '+{n} image', pts_neg: '{n} image',
      por_dia: '{m}/jour', dura: 'Dure {n} jours', frescas: 'Fraîches · {n} jours', frescas1: 'Fraîches · dernier jour', marchitas: 'Fanées',
      desde: 'Dès {lugar}', sin_lugar: 'Pas de place', tienes: 'Acquis', x_evento: '+1 tous les 10 événements', x_trofeo: '+1 par trophée',
      x_nombre: 'À votre nom', ok_compra: 'Acheté : {item}', ok_quitar: 'Retiré : {item}', ok_quitar_m: 'Retiré : {item} (+{m})',
      ok_flores: 'Fleurs neuves : fraîches {n} jours', no_dinero: 'Pas assez d’argent : ça coûte {m}', no_lugar: 'Pas de place : votre local a {n} places',
      no_local: 'Il vous faut un local plus grand : {lugar}', no_max: 'Vous avez déjà le maximum', no_hay: 'N’existe pas',
      log_compra: 'Vous avez décoré le local : {item} ({m})', log_marchitas: 'Les fleurs du local ont fané : changez-les ou retirez-les',
      log_visita: 'Un client est passé au local et a laissé une offre : {cliente}', nombre_def: 'MA PRODUCTION', c_decor: 'Déco {m}',
      'it.flores': 'Fleurs fraîches', 'it.planta': 'Plante en pot', 'it.sofa': 'Canapé clients', 'it.neon': 'Enseigne néon',
      'it.cafetera': 'Machine à café', 'it.agua': 'Fontaine à eau', 'it.alfombra': 'Tapis', 'it.cuadros': 'Cadres de vos événements',
      'it.trofeos': 'Étagère à trophées', 'it.tv': 'TV avec votre showreel', 'it.recepcion': 'Comptoir d’accueil', 'it.aire': 'Climatisation',
    },
    de: {
      tit: 'Deko', imagen: 'Image des Standorts', h_resumen: 'Image {n}/100 · Angebote +{p} %',
      lugares: 'Plätze {n}/{m}', mant: 'Unterhalt {m}/Tag', mant0: 'Kein Unterhalt', decorar: 'Einrichten',
      modal_t: 'Standort einrichten', efecto: 'Image {n}/100 → Angebote +{p} %', visita_cada: 'Alle {n} Tage schaut ein Kunde vorbei',
      visita_no: 'Ab Image 30 schauen Kunden vorbei', en_local: 'In deinem Standort', tienda: 'Kaufen',
      vacio: 'Dein Standort ist leer: ein paar Blumen und ein Sofa machen Kunden schon froh.', guardados: 'Eingelagert, kein Platz: {n}',
      guardado: 'Eingelagert', comprar: 'Kaufen', quitar: 'Entfernen', cambiar: 'Blumen tauschen', pts: '+{n} Image', pts_neg: '{n} Image',
      por_dia: '{m}/Tag', dura: 'Hält {n} Tage', frescas: 'Frisch · {n} Tage', frescas1: 'Frisch · letzter Tag', marchitas: 'Verwelkt',
      desde: 'Ab {lugar}', sin_lugar: 'Kein Platz', tienes: 'Vorhanden', x_evento: '+1 je 10 Events', x_trofeo: '+1 je Pokal',
      x_nombre: 'Mit deinem Namen', ok_compra: 'Gekauft: {item}', ok_quitar: 'Entfernt: {item}', ok_quitar_m: 'Entfernt: {item} (+{m})',
      ok_flores: 'Neue Blumen: {n} Tage frisch', no_dinero: 'Nicht genug Geld: kostet {m}', no_lugar: 'Kein Platz: dein Standort hat {n} Plätze',
      no_local: 'Du brauchst einen größeren Standort: {lugar}', no_max: 'Davon hast du schon das Maximum', no_hay: 'Gibt es nicht',
      log_compra: 'Du hast eingerichtet: {item} ({m})', log_marchitas: 'Die Blumen sind verwelkt: tauschen oder entfernen',
      log_visita: 'Ein Kunde war im Standort und hat ein Angebot dagelassen: {cliente}', nombre_def: 'MEINE PRODUKTION', c_decor: 'Deko {m}',
      'it.flores': 'Frische Blumen', 'it.planta': 'Topfpflanze', 'it.sofa': 'Kundensofa', 'it.neon': 'Neonschild',
      'it.cafetera': 'Kaffeemaschine', 'it.agua': 'Wasserspender', 'it.alfombra': 'Teppich', 'it.cuadros': 'Bilder deiner Events',
      'it.trofeos': 'Pokalregal', 'it.tv': 'TV mit deinem Showreel', 'it.recepcion': 'Empfangstresen', 'it.aire': 'Klimaanlage',
    },
    it: {
      tit: 'Arredamento', imagen: 'Immagine della sede', h_resumen: 'Immagine della sede {n}/100 · offerte +{p}%',
      lugares: 'Posti {n}/{m}', mant: 'Manutenzione {m}/giorno', mant0: 'Nessuna manutenzione', decorar: 'Arreda',
      modal_t: 'Arreda la sede', efecto: 'Immagine {n}/100 → offerte +{p}%', visita_cada: 'Un cliente passa a trovarti ogni {n} giorni',
      visita_no: 'Con immagine 30 o più, i clienti passano a trovarti', en_local: 'Nella tua sede', tienda: 'Compra',
      vacio: 'La tua sede è vuota: qualche fiore e un divano accolgono già meglio i clienti.', guardados: 'In magazzino, senza posto: {n}',
      guardado: 'In magazzino', comprar: 'Compra', quitar: 'Togli', cambiar: 'Cambia i fiori', pts: '+{n} immagine', pts_neg: '{n} immagine',
      por_dia: '{m}/giorno', dura: 'Dura {n} giorni', frescas: 'Freschi · {n} giorni', frescas1: 'Freschi · ultimo giorno', marchitas: 'Appassiti',
      desde: 'Da {lugar}', sin_lugar: 'Nessun posto', tienes: 'Ce l’hai', x_evento: '+1 ogni 10 eventi', x_trofeo: '+1 per trofeo',
      x_nombre: 'Col tuo nome', ok_compra: 'Hai comprato: {item}', ok_quitar: 'Hai tolto: {item}', ok_quitar_m: 'Hai tolto: {item} (+{m})',
      ok_flores: 'Fiori nuovi: freschi per {n} giorni', no_dinero: 'Soldi insufficienti: costa {m}', no_lugar: 'Nessun posto: la tua sede ha {n} posti',
      no_local: 'Ti serve una sede più grande: {lugar}', no_max: 'Ne hai già il massimo', no_hay: 'Non esiste',
      log_compra: 'Hai arredato la sede: {item} ({m})', log_marchitas: 'I fiori della sede sono appassiti: cambiali o toglili',
      log_visita: 'Un cliente è passato in sede e ha lasciato un’offerta: {cliente}', nombre_def: 'LA MIA PRODUZIONE', c_decor: 'Arredo {m}',
      'it.flores': 'Fiori freschi', 'it.planta': 'Pianta in vaso', 'it.sofa': 'Divano per clienti', 'it.neon': 'Insegna al neon',
      'it.cafetera': 'Macchina del caffè', 'it.agua': 'Distributore d’acqua', 'it.alfombra': 'Tappeto', 'it.cuadros': 'Quadri dei tuoi eventi',
      'it.trofeos': 'Mensola dei trofei', 'it.tv': 'TV col tuo showreel', 'it.recepcion': 'Reception', 'it.aire': 'Aria condizionata',
    },
    ru: {
      tit: 'Декор', imagen: 'Имидж офиса', h_resumen: 'Имидж офиса {n}/100 · заказы +{p}%',
      lugares: 'Места {n}/{m}', mant: 'Содержание {m}/день', mant0: 'Без расходов', decorar: 'Обставить',
      modal_t: 'Обставить офис', efecto: 'Имидж {n}/100 → заказы +{p}%', visita_cada: 'Клиент заходит раз в {n} дн.',
      visita_no: 'С имиджем от 30 клиенты заходят в гости', en_local: 'В вашем офисе', tienda: 'Купить',
      vacio: 'Офис пустой: цветы и диван уже помогут встретить клиентов.', guardados: 'На складе, нет места: {n}',
      guardado: 'На складе', comprar: 'Купить', quitar: 'Убрать', cambiar: 'Сменить цветы', pts: '+{n} имиджа', pts_neg: '{n} имиджа',
      por_dia: '{m}/день', dura: 'Стоят {n} дн.', frescas: 'Свежие · {n} дн.', frescas1: 'Свежие · последний день', marchitas: 'Завяли',
      desde: 'С уровня: {lugar}', sin_lugar: 'Нет места', tienes: 'Есть', x_evento: '+1 за каждые 10 событий', x_trofeo: '+1 за кубок',
      x_nombre: 'С вашим названием', ok_compra: 'Куплено: {item}', ok_quitar: 'Убрано: {item}', ok_quitar_m: 'Убрано: {item} (+{m})',
      ok_flores: 'Новые цветы: свежие {n} дн.', no_dinero: 'Не хватает денег: стоит {m}', no_lugar: 'Нет места: в офисе {n} мест',
      no_local: 'Нужно помещение побольше: {lugar}', no_max: 'У вас уже максимум', no_hay: 'Не существует',
      log_compra: 'Вы обставили офис: {item} ({m})', log_marchitas: 'Цветы в офисе завяли: смените или уберите их',
      log_visita: 'Клиент зашёл в офис и оставил заказ: {cliente}', nombre_def: 'МОЯ СТУДИЯ', c_decor: 'Декор {m}',
      'it.flores': 'Свежие цветы', 'it.planta': 'Растение в горшке', 'it.sofa': 'Диван для клиентов', 'it.neon': 'Неоновая вывеска',
      'it.cafetera': 'Кофемашина', 'it.agua': 'Кулер для воды', 'it.alfombra': 'Ковёр', 'it.cuadros': 'Фото ваших событий',
      'it.trofeos': 'Полка с кубками', 'it.tv': 'ТВ с вашим шоурилом', 'it.recepcion': 'Ресепшен', 'it.aire': 'Кондиционер',
    },
    tr: {
      tit: 'Dekorasyon', imagen: 'Mekân imajı', h_resumen: 'Mekân imajı {n}/100 · teklifler +%{p}',
      lugares: 'Yer {n}/{m}', mant: 'Bakım {m}/gün', mant0: 'Bakım yok', decorar: 'Dekore et',
      modal_t: 'Mekânı dekore et', efecto: 'İmaj {n}/100 → teklifler +%{p}', visita_cada: 'Her {n} günde bir müşteri uğrar',
      visita_no: 'İmaj 30 ve üzeriyse müşteriler ziyarete gelir', en_local: 'Mekânında', tienda: 'Satın al',
      vacio: 'Mekânın boş: birkaç çiçek ve bir koltuk müşterileri daha iyi karşılar.', guardados: 'Yer yok, depoda: {n}',
      guardado: 'Depoda', comprar: 'Satın al', quitar: 'Kaldır', cambiar: 'Çiçekleri değiştir', pts: '+{n} imaj', pts_neg: '{n} imaj',
      por_dia: '{m}/gün', dura: '{n} gün dayanır', frescas: 'Taze · {n} gün', frescas1: 'Taze · son gün', marchitas: 'Soldu',
      desde: '{lugar} ile', sin_lugar: 'Yer yok', tienes: 'Sende var', x_evento: 'Her 10 etkinlikte +1', x_trofeo: 'Kupa başına +1',
      x_nombre: 'Senin adınla', ok_compra: 'Satın aldın: {item}', ok_quitar: 'Kaldırdın: {item}', ok_quitar_m: 'Kaldırdın: {item} (+{m})',
      ok_flores: 'Yeni çiçekler: {n} gün taze', no_dinero: 'Para yetmiyor: fiyatı {m}', no_lugar: 'Yer yok: mekânında {n} yer var',
      no_local: 'Daha büyük bir mekân gerekiyor: {lugar}', no_max: 'Bundan zaten en fazla sayıda var', no_hay: 'Mevcut değil',
      log_compra: 'Mekânı dekore ettin: {item} ({m})', log_marchitas: 'Mekândaki çiçekler soldu: değiştir ya da kaldır',
      log_visita: 'Bir müşteri mekânına uğradı ve teklif bıraktı: {cliente}', nombre_def: 'PRODÜKSİYONUM', c_decor: 'Dekor {m}',
      'it.flores': 'Taze çiçekler', 'it.planta': 'Saksı bitkisi', 'it.sofa': 'Müşteri koltuğu', 'it.neon': 'Neon tabela',
      'it.cafetera': 'Kahve makinesi', 'it.agua': 'Su sebili', 'it.alfombra': 'Halı', 'it.cuadros': 'Etkinlik çerçeveleri',
      'it.trofeos': 'Kupa rafı', 'it.tv': 'Showreel’li TV', 'it.recepcion': 'Resepsiyon bankosu', 'it.aire': 'Klima',
    },
    id: {
      tit: 'Dekorasi', imagen: 'Citra kantor', h_resumen: 'Citra kantor {n}/100 · tawaran +{p}%',
      lugares: 'Tempat {n}/{m}', mant: 'Perawatan {m}/hari', mant0: 'Tanpa perawatan', decorar: 'Dekorasi',
      modal_t: 'Dekorasi kantor', efecto: 'Citra {n}/100 → tawaran +{p}%', visita_cada: 'Klien mampir setiap {n} hari',
      visita_no: 'Dengan citra 30 ke atas, klien mampir berkunjung', en_local: 'Di kantormu', tienda: 'Beli',
      vacio: 'Kantormu kosong: bunga dan sofa sudah membuat klien merasa disambut.', guardados: 'Disimpan, tak ada tempat: {n}',
      guardado: 'Disimpan', comprar: 'Beli', quitar: 'Lepas', cambiar: 'Ganti bunga', pts: '+{n} citra', pts_neg: '{n} citra',
      por_dia: '{m}/hari', dura: 'Tahan {n} hari', frescas: 'Segar · {n} hari', frescas1: 'Segar · hari terakhir', marchitas: 'Layu',
      desde: 'Mulai {lugar}', sin_lugar: 'Tak ada tempat', tienes: 'Dimiliki', x_evento: '+1 tiap 10 acara', x_trofeo: '+1 per trofi',
      x_nombre: 'Dengan namamu', ok_compra: 'Kamu membeli: {item}', ok_quitar: 'Kamu melepas: {item}', ok_quitar_m: 'Kamu melepas: {item} (+{m})',
      ok_flores: 'Bunga baru: segar {n} hari', no_dinero: 'Uang tidak cukup: harganya {m}', no_lugar: 'Tak ada tempat: kantormu punya {n} tempat',
      no_local: 'Kamu butuh tempat yang lebih besar: {lugar}', no_max: 'Kamu sudah punya jumlah maksimal', no_hay: 'Tidak ada',
      log_compra: 'Kamu mendekorasi kantor: {item} ({m})', log_marchitas: 'Bunga di kantor layu: ganti atau lepas',
      log_visita: 'Seorang klien mampir ke kantormu dan meninggalkan tawaran: {cliente}', nombre_def: 'PRODUKSIKU', c_decor: 'Dekorasi {m}',
      'it.flores': 'Bunga segar', 'it.planta': 'Tanaman pot', 'it.sofa': 'Sofa klien', 'it.neon': 'Papan neon',
      'it.cafetera': 'Mesin kopi', 'it.agua': 'Dispenser air', 'it.alfombra': 'Karpet', 'it.cuadros': 'Bingkai acaramu',
      'it.trofeos': 'Rak trofi', 'it.tv': 'TV dengan showreel-mu', 'it.recepcion': 'Meja resepsionis', 'it.aire': 'AC',
    },
    'zh-CN': {
      tit: '装饰', imagen: '门面形象', h_resumen: '门面形象 {n}/100 · 报价 +{p}%',
      lugares: '位置 {n}/{m}', mant: '维护 {m}/天', mant0: '无维护费', decorar: '装饰',
      modal_t: '装饰你的场地', efecto: '形象 {n}/100 → 报价 +{p}%', visita_cada: '每 {n} 天有客户上门拜访',
      visita_no: '形象达到 30 以上，客户会上门拜访', en_local: '你的场地', tienda: '购买',
      vacio: '你的场地空空的：几束花和一张沙发就能更好地接待客户。', guardados: '没有位置，已收起：{n}',
      guardado: '已收起', comprar: '购买', quitar: '移除', cambiar: '换花', pts: '+{n} 形象', pts_neg: '{n} 形象',
      por_dia: '{m}/天', dura: '可维持 {n} 天', frescas: '新鲜 · {n} 天', frescas1: '新鲜 · 最后一天', marchitas: '已枯萎',
      desde: '需要{lugar}', sin_lugar: '没有位置', tienes: '已拥有', x_evento: '每 10 场活动 +1', x_trofeo: '每座奖杯 +1',
      x_nombre: '带你的公司名', ok_compra: '已购买：{item}', ok_quitar: '已移除：{item}', ok_quitar_m: '已移除：{item}（+{m}）',
      ok_flores: '新鲜花束：可维持 {n} 天', no_dinero: '钱不够：需要 {m}', no_lugar: '没有位置：你的场地有 {n} 个位置',
      no_local: '需要更大的场地：{lugar}', no_max: '这个已经达到上限', no_hay: '不存在',
      log_compra: '你装饰了场地：{item}（{m}）', log_marchitas: '场地里的花枯萎了：请更换或移除',
      log_visita: '一位客户来到你的场地并留下了报价：{cliente}', nombre_def: '我的制作公司', c_decor: '装饰 {m}',
      'it.flores': '鲜花', 'it.planta': '盆栽', 'it.sofa': '客户沙发', 'it.neon': '霓虹招牌',
      'it.cafetera': '咖啡机', 'it.agua': '饮水机', 'it.alfombra': '地毯', 'it.cuadros': '活动照片墙',
      'it.trofeos': '奖杯架', 'it.tv': '播放作品集的电视', 'it.recepcion': '前台', 'it.aire': '空调',
    },
  };
  const PREF = 'decor.';
  function idioma() { try { const c = root.I18N && root.I18N.idioma; return c && TRAD[c] ? c : 'es'; } catch (e) { return 'es'; } }
  function fill(str, p) { return p ? String(str).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined && p[k] !== null ? String(p[k]) : m)) : String(str); }
  function t(key, p) {
    const d = TRAD[idioma()];
    const v = d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : TRAD.es[key];
    return fill(v === undefined ? key : v, p);
  }
  // Para el registro del juego (avisos con { k, p }): español en Game.TEXTOS y los otros idiomas en los diccionarios ya cargados
  function registrarTextos() {
    try { if (G.TEXTOS) Object.keys(TRAD.es).forEach((k) => { if (!(PREF + k in G.TEXTOS)) G.TEXTOS[PREF + k] = TRAD.es[k]; }); } catch (e) { /* sin textos */ }
    try {
      const J = root.I18N_JUEGO;
      if (!J) return;
      Object.keys(TRAD).forEach((code) => {
        if (code === 'es' || !Object.prototype.hasOwnProperty.call(J, code) || !J[code]) return;
        Object.keys(TRAD[code]).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(J[code], PREF + k)) J[code][PREF + k] = TRAD[code][k]; });
      });
    } catch (e) { /* sin diccionarios */ }
  }
  registrarTextos();
  const itP = (k) => ({ k: PREF + 'it.' + k });
  const TLx = (x) => { try { return root.I18N && root.I18N.TL ? root.I18N.TL(x) : x; } catch (e) { return x; } };

  /* ---------- Estado guardado: s.decor ---------- */
  function migrar(s) {
    if (!s || typeof s !== 'object') return s;
    const d = s.decor && typeof s.decor === 'object' && !Array.isArray(s.decor) ? s.decor : (s.decor = {});
    const dia = Number(s.day) || 1;
    const cuenta = {};
    d.items = (Array.isArray(d.items) ? d.items : []).filter((it) => it && typeof it === 'object' && DEF[it.k]).filter((it) => {
      cuenta[it.k] = (cuenta[it.k] || 0) + 1;
      return cuenta[it.k] <= (DEF[it.k].max || 1);
    }).map((it) => {
      const o = { k: it.k, dia: Number.isFinite(it.dia) ? Math.floor(it.dia) : dia };
      if (DEF[it.k].dias) {
        o.hasta = Number.isFinite(it.hasta) ? Math.floor(it.hasta) : o.dia + DEF[it.k].dias;
        if (it.avisado) o.avisado = true;
      }
      return o;
    });
    d.gastado = Number.isFinite(d.gastado) && d.gastado > 0 ? Math.round(d.gastado) : 0;
    d.proxVisita = Number.isFinite(d.proxVisita) && d.proxVisita > 0 ? Math.floor(d.proxVisita) : 0;
    d.visitas = Number.isFinite(d.visitas) && d.visitas > 0 ? Math.floor(d.visitas) : 0;
    return s;
  }
  const est = (s) => { if (!s.decor || !Array.isArray(s.decor.items)) migrar(s); return s.decor; };

  /* ---------- Reglas (puras: no cambian el estado) ---------- */
  function nivelLocal(s) {
    try { const v = G.venue(s); const n = Number(v && v.nivel); return Number.isFinite(n) && n >= 0 ? Math.min(3, n) : 0; } catch (e) { return 0; }
  }
  const lugares = (s) => AJUSTE.lugares[nivelLocal(s)] || AJUSTE.lugares[0];
  function nombreLocal(n) {
    try { const r = G.BALANCE.daily.rent[Math.max(0, Math.min(3, n))]; return TLx(G.tx(r[2])); } catch (e) { return ''; }
  }
  function nTrofeos(s) {
    const temp = s.temporada && Array.isArray(s.temporada.trofeos) ? s.temporada.trofeos.length : 0;
    const cinco = Math.floor(((s.stats && s.stats.fiveStars) || 0) / 5);
    return Math.min(AJUSTE.trofeosMax, temp + cinco + (s.storyDone ? 1 : 0));
  }
  const fresca = (s, it) => !DEF[it.k].dias || (Number(s.day) || 0) < it.hasta;
  function puntosDe(s, it) {
    const d = DEF[it.k];
    if (d.dias && !fresca(s, it)) return AJUSTE.marchitas;
    if (it.k === 'cuadros') return d.pts + Math.min(d.extraMax, Math.floor(((s.stats && s.stats.events) || 0) / 10));
    if (it.k === 'trofeos') return d.pts + Math.min(d.extraMax, nTrofeos(s));
    return d.pts;
  }
  /* Lo que tienes, en orden de compra: activo = está puesto (cabe en tu local); si no, está guardado */
  function lista(s) {
    const d = est(s), nv = nivelLocal(s), cap = lugares(s);
    let usados = 0;
    return d.items.map((it, i) => {
      const def = DEF[it.k];
      let activo = false, motivo = '';
      if (def.min > nv) motivo = 'local';
      else if (usados >= cap) motivo = 'lugar';
      else { activo = true; usados++; }
      const fr = fresca(s, it);
      return { it, i, def, activo, motivo, fresca: fr, quedan: def.dias ? Math.max(0, it.hasta - (Number(s.day) || 0)) : null,
        pts: activo ? puntosDe(s, it) : 0, gasto: activo ? (def.gasto || 0) : 0 };
    });
  }
  function pctDe(puntos) { return Math.max(0, Math.min(AJUSTE.pctMax, Math.round(puntos / AJUSTE.puntosPorPct))); }
  function cadaVisita(puntos) { const v = AJUSTE.visitas.find((x) => puntos >= x[0]); return v ? v[1] : 0; }
  function imagen(s) {
    if (!s) return { puntos: 0, pct: 0, cada: 0, lugares: AJUSTE.lugares[0], usados: 0, gasto: 0, items: [], guardados: 0, marchitas: 0 };
    const L = lista(s);
    const act = L.filter((x) => x.activo);
    const puntos = Math.max(0, Math.min(100, act.reduce((a, x) => a + x.pts, 0)));
    return { puntos, pct: pctDe(puntos), cada: cadaVisita(puntos), lugares: lugares(s), usados: act.length, gasto: act.reduce((a, x) => a + x.gasto, 0),
      items: L, guardados: L.length - act.length, marchitas: act.filter((x) => x.def.dias && !x.fresca).length, nivel: nivelLocal(s) };
  }
  const gastoDiario = (s) => (s && s.decor ? imagen(s).gasto : 0);

  /* ---------- Acciones ---------- */
  const resp = (ok, key, p) => ({ ok, msg: t(key, p) });
  const nombreItem = (k) => t('it.' + k);
  function comprar(s, k) {
    const def = DEF[k];
    if (!s || !def) return resp(false, 'no_hay');
    const d = est(s);
    if (def.min > nivelLocal(s)) return resp(false, 'no_local', { lugar: nombreLocal(def.min) });
    if (d.items.filter((x) => x.k === k).length >= (def.max || 1)) return resp(false, 'no_max');
    if (d.items.length >= lugares(s)) return resp(false, 'no_lugar', { n: lugares(s) });
    if ((s.money || 0) < def.precio) return resp(false, 'no_dinero', { m: G.money(def.precio) });
    s.money -= def.precio;
    const it = { k, dia: Number(s.day) || 1 };
    if (def.dias) it.hasta = it.dia + def.dias;
    d.items.push(it);
    G.log(s, PREF + 'log_compra', { item: itP(k), m: G.money(def.precio) });
    return resp(true, 'ok_compra', { item: nombreItem(k) });
  }
  function devolucion(def) { return def.dias ? 0 : Math.floor(def.precio * AJUSTE.reventa / 5) * 5; }
  function quitar(s, i) {
    const d = est(s);
    const it = d.items[i];
    if (!it) return resp(false, 'no_hay');
    const def = DEF[it.k], m = devolucion(def);
    d.items.splice(i, 1);
    s.money += m;
    return m ? resp(true, 'ok_quitar_m', { item: nombreItem(it.k), m: G.money(m) }) : resp(true, 'ok_quitar', { item: nombreItem(it.k) });
  }
  /* Cambia las flores (las marchitas primero) por un arreglo nuevo: precio completo, frescas otra vez */
  function cambiarFlores(s, i) {
    const d = est(s);
    let idx = Number.isInteger(i) && d.items[i] && DEF[d.items[i].k].dias ? i : -1;
    if (idx < 0) idx = d.items.findIndex((x) => DEF[x.k].dias && !fresca(s, x));
    if (idx < 0) idx = d.items.findIndex((x) => DEF[x.k].dias);
    if (idx < 0) return comprar(s, 'flores');
    const it = d.items[idx], def = DEF[it.k];
    if ((s.money || 0) < def.precio) return resp(false, 'no_dinero', { m: G.money(def.precio) });
    s.money -= def.precio;
    it.dia = Number(s.day) || 1;
    it.hasta = it.dia + def.dias;
    delete it.avisado;
    G.log(s, PREF + 'log_compra', { item: itP(it.k), m: G.money(def.precio) });
    return resp(true, 'ok_flores', { n: def.dias });
  }

  /* ---------- La extensión ---------- */
  // Si logic.js ya suma los gastos fijos de las extensiones (Game.extSuma + gancho gastoFijo: ver INTEGRAR_DECORACION.md),
  // el mantenimiento va en los gastos del día; si no, se descuenta aquí al empezar el día.
  const gastoEnLogica = () => typeof G.extSuma === 'function';
  const EXT = {
    id: 'decoracion',
    migrar,
    gastoFijo(s) { return s && s.decor ? imagen(s).gasto : 0; },
    alNuevoDia(s) {
      if (!s || !s.decor) return;
      const L = lista(s);
      if (!gastoEnLogica()) {
        const g = L.reduce((a, x) => a + x.gasto, 0);
        if (g > 0) { s.money -= g; s.decor.gastado += g; }
      }
      L.forEach((x) => {
        if (x.def.dias && !x.fresca && !x.it.avisado) {
          x.it.avisado = true;
          if (x.activo) G.aviso(s, 'decoracion', PREF + 'log_marchitas');
        }
      });
    },
    // Ofertas un poco mejor pagadas (los clientes del extranjero no conocen tu local)
    multPago(s, c) {
      if (!s || !s.decor || (c && c.internacional)) return 1;
      return 1 + imagen(s).pct / 100;
    },
    // Con buena imagen, un cliente pasa por tu local cada pocos días y deja una oferta
    contratosExtra(s) {
      if (!s || !s.decor || s.gameOver) return;
      const d = s.decor, cada = imagen(s).cada, dia = Number(s.day) || 0;
      if (!cada) { d.proxVisita = 0; return; }
      if (!d.proxVisita || d.proxVisita > dia + cada) { d.proxVisita = dia + cada; return; }
      if (dia < d.proxVisita) return;
      if (((s.stats && s.stats.events) || 0) < (G.BALANCE.tutorialEvents || 0)) return;
      if (s.contracts.length >= G.BALANCE.maxContracts) return; // vuelve mañana
      const c = G.addContract(s, null, 1, { especial: { visita: true } });
      if (!c) return;
      d.proxVisita = dia + cada;
      d.visitas++;
      G.aviso(s, 'decoracion', PREF + 'log_visita', { cliente: c.client });
    },
  };
  G.registrarExtension(EXT);

  /* =========================================================
     Dibujo (mismo estilo del juego: formas planas, paleta oscura)
     Sala de espera en coordenadas 200 × 80 (pared 0-60, piso 60-80). Cada cosa se dibuja en su lugar.
     ========================================================= */
  const FONT = "'Barlow Condensed','Roboto Condensed','Arial Narrow',sans-serif";
  const escX = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function nombreProductora(s, ctx) {
    let n = '';
    try { n = ctx && typeof ctx.nombreProductora === 'function' ? ctx.nombreProductora() : ''; } catch (e) { n = ''; }
    if (!n && s && typeof s.productora === 'string') n = s.productora;
    n = String(n || '').replace(/\s+/g, ' ').trim();
    return (n || t('nombre_def')).toUpperCase().slice(0, 22);
  }
  const BLOOM = ['#ff5a8a', '#ffd27a', '#ffffff', '#ff8fb1', '#f4d0ff', '#ff7a4a'];
  // bbox de cada cosa (para las miniaturas)
  const CAJA = {
    aire: [3, 0, 34, 18], neon: [116, 0, 84, 15], cuadros: [8, 9, 62, 24], tv: [72, 4, 42, 28], trofeos: [126, 11, 50, 20],
    agua: [0, 27, 15, 35], cafetera: [12, 33, 21, 29], sofa: [32, 36, 58, 27], flores: [86, 29, 21, 33], planta: [102, 24, 22, 38],
    recepcion: [130, 31, 64, 31], alfombra: [28, 60, 98, 19],
  };
  const DIBUJO = {
    aire: () => `<rect x="6" y="3" width="28" height="9" rx="2" fill="#d9dee6"/><path d="M8 9.5h24" stroke="#8b95a8" stroke-width=".8"/><path d="M8 11h24" stroke="#8b95a8" stroke-width=".6"/><circle cx="31" cy="5.5" r=".9" fill="#2ecc71"/><path d="M11 14q2 2 0 4M19 14q2 2 0 4M27 14q2 2 0 4" stroke="#bcd8ff" stroke-width=".7" fill="none" opacity=".55"/>`,
    neon: (o) => {
      const nom = escX(o.nombre), len = Math.min(76, Math.max(18, o.nombre.length * 4.6));
      return `<g class="dc-neon"><rect x="${158 - len / 2 - 4}" y="1.5" width="${len + 8}" height="12" rx="2.5" fill="#0d0f14" opacity=".75"/>
        <text x="158" y="10.6" font-size="8" font-family="${FONT}" font-weight="800" text-anchor="middle" textLength="${len}" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#ff3bd1" stroke-width="2.4" opacity=".45">${nom}</text>
        <text x="158" y="10.6" font-size="8" font-family="${FONT}" font-weight="800" text-anchor="middle" textLength="${len}" lengthAdjust="spacingAndGlyphs" fill="#ffd1f4">${nom}</text></g>`;
    },
    cuadros: (o) => {
      const fr = [[12, 14, 18, 13], [34, 10, 14, 18], [52, 15, 15, 11]];
      const art = [
        (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1d3b5e"/><rect x="${x}" y="${y + h * 0.55}" width="${w}" height="${h * 0.45}" fill="#2f8f5b"/><path d="M${x + w / 2} ${y + h * 0.55}v${h * 0.45}" stroke="#fff" stroke-width=".5" opacity=".7"/><circle cx="${x + w * 0.3}" cy="${y + h * 0.3}" r="1.6" fill="#fffbe0"/>`,
        (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2a1a3a"/><path d="M${x + 2} ${y}l${w / 2 - 2} ${h * 0.7}L${x + w - 2} ${y}" fill="#ffd27a" opacity=".45"/><rect x="${x}" y="${y + h * 0.72}" width="${w}" height="${h * 0.28}" fill="#0d0b12"/>`,
        (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e9c6cf"/><circle cx="${x + w * 0.38}" cy="${y + h * 0.5}" r="${h * 0.26}" fill="none" stroke="#c9a25a" stroke-width=".8"/><circle cx="${x + w * 0.6}" cy="${y + h * 0.5}" r="${h * 0.26}" fill="none" stroke="#c9a25a" stroke-width=".8"/>`,
      ];
      return fr.map(([x, y, w, h], i) => `<rect x="${x - 1.2}" y="${y - 1.2}" width="${w + 2.4}" height="${h + 2.4}" fill="#c9a25a"/>${art[i](x, y, w, h)}`).join('');
    },
    tv: () => `<rect x="82" y="10" width="38" height="23" rx="1.5" fill="#0b0d12"/><rect x="84" y="12" width="34" height="19" fill="#1d3b5e"/><rect x="84" y="22" width="34" height="9" fill="#2f8f5b"/>
      <path d="M84 22h34" stroke="#e9edf5" stroke-width=".5" opacity=".6"/><path d="M101 22v9" stroke="#e9edf5" stroke-width=".4" opacity=".5"/>
      ${[[90, 26], [97, 28], [106, 25], [112, 28]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r=".9" fill="${i % 2 ? '#e9edf5' : '#d42a30'}"/>`).join('')}
      <rect x="86" y="13.5" width="11" height="3.6" rx=".8" fill="#ff3b3b"/><circle cx="87.8" cy="15.3" r=".8" fill="#fff" class="blink"/><path d="M89.5 14.6h6M89.5 16h4" stroke="#fff" stroke-width=".5"/>
      <path d="M100 34.5h2" stroke="#3a4150" stroke-width="1.2"/>`,
    trofeos: (o) => {
      const n = o.trofeos;
      const cups = Array.from({ length: n }, (_, i) => {
        const x = 132 + i * 7, col = i % 3 === 2 ? '#c5ccd6' : '#ffd27a';
        return `<path d="M${x - 2.6} 26h5.2v1.6a2.6 2.6 0 01-5.2 0z" fill="${col}"/><path d="M${x - 2.6} 26.8h-1a1.2 1.2 0 001.2 1.6M${x + 2.6} 26.8h1a1.2 1.2 0 01-1.2 1.6" stroke="${col}" stroke-width=".6" fill="none"/><path d="M${x} 30v2.2" stroke="${col}" stroke-width="1"/><rect x="${x - 1.8}" y="32.2" width="3.6" height="1.4" fill="#6b4a2a"/>`;
      }).join('');
      return `<rect x="128" y="33.6" width="46" height="2.2" fill="#6b4a2a"/><path d="M132 35.8l2 3M170 35.8l-2 3" stroke="#4a3a2e" stroke-width="1"/>${cups || '<rect x="146" y="27" width="10" height="6.6" rx="1" fill="#8b95a8"/><path d="M148 30h6" stroke="#2a3242" stroke-width=".6"/>'}`;
    },
    agua: () => `<rect x="4" y="29" width="7" height="11" rx="2.5" fill="#4da3ff" opacity=".6"/><path d="M5.5 31v7" stroke="#fff" stroke-width=".6" opacity=".6"/><rect x="2.5" y="40" width="10" height="20" rx="1" fill="#d9dee6"/><rect x="3.5" y="43" width="8" height="4" fill="#bfc7d3"/><circle cx="5.5" cy="45" r=".8" fill="#ff3b3b"/><circle cx="9.5" cy="45" r=".8" fill="#4da3ff"/><path d="M2.5 52h10" stroke="#bfc7d3" stroke-width=".6"/>`,
    cafetera: () => `<rect x="14" y="48" width="18" height="12" fill="#4a3a2e"/><path d="M14 48h18" stroke="#6b4a2a" stroke-width="1.4"/><path d="M23 50v8" stroke="#3a2c22" stroke-width=".6"/>
      <rect x="16" y="37" width="10" height="11" rx="1" fill="#14171d"/><rect x="17" y="38.5" width="8" height="3" rx=".5" fill="#2a3242"/><circle cx="24" cy="40" r=".7" fill="#ff3b3b"/><path d="M19 42.5h4v1.4h-4z" fill="#5b6476"/>
      <rect x="19.6" y="45" width="2.8" height="3" fill="#e9edf5"/><path d="M21 44q-1-2 0-3.5" stroke="#e9edf5" stroke-width=".5" fill="none" opacity=".5" class="puff"/>
      <rect x="27.5" y="45.5" width="2.4" height="2.5" fill="#e9edf5"/><rect x="27.8" y="44.2" width="1.8" height="1.4" fill="#e9edf5" opacity=".8"/>`,
    sofa: () => `<rect x="38" y="39" width="46" height="13" rx="3" fill="#8a3b46"/><path d="M61 40v11" stroke="#6e2a35" stroke-width=".8"/><rect x="38" y="39" width="46" height="2" rx="1" fill="#fff" opacity=".1"/>
      <rect x="36" y="49" width="50" height="7" rx="2" fill="#9c4552"/><path d="M61 49v7" stroke="#6e2a35" stroke-width=".8"/>
      <rect x="33" y="45" width="6" height="12" rx="2" fill="#7a323d"/><rect x="83" y="45" width="6" height="12" rx="2" fill="#7a323d"/>
      <path d="M37 57v3M85 57v3" stroke="#2a1a14" stroke-width="1.4"/><rect x="42" y="44.5" width="8" height="5" rx="1.5" fill="#ffd27a" opacity=".85" transform="rotate(-8 46 47)"/>`,
    flores: (o) => {
      const mesa = `<ellipse cx="96" cy="50.5" rx="8" ry="1.8" fill="#6b4a2a"/><path d="M96 52v7.5" stroke="#4a3a2e" stroke-width="1.4"/><ellipse cx="96" cy="60" rx="4" ry="1" fill="#2a1a14"/>`;
      const vaso = `<path d="M93.2 41.5h5.6l-.8 9h-4z" fill="#4da3ff" opacity=".55"/><path d="M94 42.5v7" stroke="#fff" stroke-width=".5" opacity=".6"/>`;
      if (!o.fresca) {
        return `${mesa}${[[-5, 2], [-2, -1], [2, -1], [5, 2]].map(([dx, dy]) => `<path d="M96 42q${dx * 0.6} -4 ${dx} ${-3 + dy}q${dx * 0.4} 2 ${dx * 0.6} 5" stroke="#7a6a3a" stroke-width=".7" fill="none"/><circle cx="${96 + dx * 1.6}" cy="${44 + dy}" r="1.5" fill="#8a6a4a"/>`).join('')}${vaso}
          <circle cx="90" cy="50" r=".8" fill="#8a6a4a"/><circle cx="101" cy="59.5" r=".8" fill="#8a6a4a"/><circle cx="104" cy="60" r=".7" fill="#6b5a48"/>`;
      }
      const flor = [[-5, -9], [-2, -12], [2, -11], [5, -8], [0, -7], [-4, -5], [4, -5]];
      return `${mesa}${flor.map(([dx, dy]) => `<path d="M96 42L${96 + dx} ${42 + dy}" stroke="#3b7a2a" stroke-width=".7"/>`).join('')}
        <path d="M94 38q-3-1-4 1M98 37q3-1 4 1" stroke="#3fa86a" stroke-width="1.2" fill="none"/>
        ${flor.map(([dx, dy], i) => `<circle cx="${96 + dx}" cy="${42 + dy}" r="${i === 1 ? 2.2 : 1.8}" fill="${BLOOM[i % BLOOM.length]}"/><circle cx="${96 + dx}" cy="${42 + dy}" r=".6" fill="#ffd27a"/>`).join('')}${vaso}`;
    },
    planta: (o) => {
      const x = o.x;
      const hojas = [[-7, -14, -30], [7, -15, 30], [-4, -20, -12], [4, -21, 14], [0, -24, 0], [-8, -8, -45], [8, -9, 48]];
      return `${hojas.map(([dx, dy, r], i) => `<ellipse cx="${x + dx * 0.55}" cy="${50 + dy * 0.55}" rx="2.6" ry="7" transform="rotate(${r} ${x + dx * 0.55} ${50 + dy * 0.55})" fill="${i % 2 ? '#2f8f5b' : '#3fa86a'}"/>`).join('')}
        <path d="M${x} 50v-12" stroke="#2f6b3a" stroke-width=".8"/>
        <path d="M${x - 5.5} 49h11l-1.6 11h-7.8z" fill="#b5653a"/><rect x="${x - 6.2}" y="48" width="12.4" height="2.4" rx=".8" fill="#c9784a"/>`;
    },
    recepcion: (o) => `<rect x="166" y="33" width="10" height="7" rx=".8" fill="#14171d"/><path d="M171 40v1.5" stroke="#3a4150" stroke-width="1.2"/>
      <circle cx="156" cy="36" r="3.4" fill="#c98a5e"/><path d="M152.6 35.2q.4-4 3.4-4 3 0 3.4 4" fill="#2a1a14"/><path d="M150 42q6-4 12 0" fill="#2f6fb3"/>
      <rect x="132" y="40" width="60" height="3.5" rx="1" fill="#6b4a2a"/><rect x="134" y="43.5" width="56" height="16.5" fill="#c9d1dc"/>
      <rect x="134" y="49" width="56" height="2.2" fill="#ff3b3b"/><circle cx="162" cy="50.1" r="3.6" fill="#0d0f14"/><circle cx="162" cy="50.1" r="1.6" fill="#ff3b3b" class="blink"/>
      <circle cx="140" cy="39.4" r="1.4" fill="#c5ccd6"/>`,
    alfombra: () => `<path d="M38 63h76l7 14H31z" fill="#7a2f3a"/><path d="M41 65h70l5 10H36z" fill="none" stroke="#c9a25a" stroke-width=".8"/><path d="M60 67l16 0 4 6H56z" fill="#9c4552" opacity=".8"/><path d="M31 77h90" stroke="#c9a25a" stroke-dasharray="1 1.4" stroke-width="1"/>`,
  };
  // Ajustes finos de posición (así no se tapan entre sí)
  const DESPL = { tv: [-8, -4], trofeos: [0, -9] };
  function dib(k, o) {
    const h = DIBUJO[k](o), d = DESPL[k];
    return d ? `<g transform="translate(${d[0]} ${d[1]})">${h}</g>` : h;
  }
  const ORDEN = ['aire', 'cuadros', 'tv', 'trofeos', 'neon', 'alfombra', 'agua', 'cafetera', 'sofa', 'recepcion', 'planta', 'flores'];
  const PLANTA_X = [113, 192];
  function opcionesDibujo(s, ctx) {
    return { nombre: nombreProductora(s, ctx), trofeos: s ? nTrofeos(s) : 0, eventos: (s && s.stats && s.stats.events) || 0 };
  }
  /* Las cosas puestas (activas), en orden de dibujo (lo de atrás primero) */
  function piezas(s, ctx) {
    const L = s && s.decor ? lista(s).filter((x) => x.activo) : [];
    const o = opcionesDibujo(s, ctx);
    let np = 0;
    const plantas = L.filter((x) => x.it.k === 'planta').map(() => PLANTA_X[np++] || PLANTA_X[0]);
    return ORDEN.map((k) => {
      if (k === 'planta') return plantas.map((x) => DIBUJO.planta(Object.assign({}, o, { x }))).join('');
      const x = L.find((y) => y.it.k === k);
      return x ? dib(k, Object.assign({}, o, { fresca: x.fresca })) : '';
    }).join('');
  }
  let uidN = 0;
  const uid = () => 'dc' + (++uidN).toString(36);
  function fondoSala(x, y, w, h, piso, noche) {
    // pared con zócalo, dos focos cálidos en el techo y piso de madera oscura
    const alto = piso - y, zo = piso - alto * 0.27;
    const focos = [0.28, 0.72].map((f) => `<path d="M${x + w * f - w * 0.03} ${y}h${w * 0.06}l${w * 0.09} ${alto}h-${w * 0.24}z" fill="#ffd27a" opacity="${noche ? 0.08 : 0.04}"/><rect x="${x + w * f - w * 0.025}" y="${y}" width="${w * 0.05}" height="${Math.max(1, alto * 0.03)}" fill="#ffe9a3" opacity=".8"/>`).join('');
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${noche ? '#363a4a' : '#313848'}"/>
      <rect x="${x}" y="${zo}" width="${w}" height="${piso - zo}" fill="#272d3b"/><path d="M${x} ${zo}h${w}" stroke="#3f475a" stroke-width="${Math.max(0.5, alto * 0.015)}"/>
      ${focos}
      <rect x="${x}" y="${piso}" width="${w}" height="${y + h - piso}" fill="#2e2620"/>
      <path d="M${x} ${piso}h${w}" stroke="#15120f" stroke-width="${Math.max(0.8, alto * 0.03)}"/>`;
  }
  /* Sala de espera completa (tarjeta y ventana): <svg> 200 × 80 */
  function interior(s, ctx, cls) {
    const id = uid();
    const vacia = !(s && s.decor && s.decor.items.length);
    const noche = !!(s && (Number(s.day) || 1) % 2 === 0);
    const bombilla = `<path d="M100 0v5" stroke="#8b95a8" stroke-width=".6"/><circle cx="100" cy="6.5" r="1.8" fill="#ffd27a" class="bulb"/>`;
    return `<svg class="${cls || 'dc-sala'}" viewBox="0 0 200 80" role="img" aria-label="${escX(t('imagen'))}" preserveAspectRatio="xMidYMid slice">
      <defs><clipPath id="${id}"><rect width="200" height="80" rx="4"/></clipPath></defs>
      <g clip-path="url(#${id})">${fondoSala(0, 0, 200, 80, 60, noche)}
      ${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 25 - 10} 80L${i * 24 + 4} 60" stroke="#3a3027" stroke-width=".5"/>`).join('')}
      ${vacia ? bombilla : ''}${piezas(s, ctx)}</g></svg>`;
  }
  /* Miniatura de una cosa del catálogo (tienda) */
  function miniatura(k, s, ctx) {
    const b = CAJA[k];
    if (!b) return '';
    const o = Object.assign(opcionesDibujo(s, ctx), { fresca: true, x: PLANTA_X[0] });
    if (k === 'trofeos') o.trofeos = Math.max(3, o.trofeos);
    const pad = 3, vb = [b[0] - pad, b[1] - pad, b[2] + pad * 2, b[3] + pad * 2];
    return `<svg class="dc-mini" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${dib(k, o)}</svg>`;
  }
  function miniaturaDe(x, s, ctx) {
    const b = CAJA[x.it.k];
    const o = Object.assign(opcionesDibujo(s, ctx), { fresca: x.fresca, x: PLANTA_X[0] });
    const pad = 3, vb = [b[0] - pad, b[1] - pad, b[2] + pad * 2, b[3] + pad * 2];
    return `<svg class="dc-mini" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${dib(x.it.k, o)}</svg>`;
  }

  /* ---------- Capa sobre la sede (Art.hq: viewBox "0 -20 360 170", suelo en y = 140) ----------
     local: 0-3 (etapa de Art.hq) o la clave 'sede.garaje' | 'sede.oficina' | 'sede.estudio' | 'sede.centro'.
     Devuelve un <g> para poner justo después del edificio (antes del techo, las cámaras y la unidad móvil). */
  const LOCALES = ['sede.garaje', 'sede.oficina', 'sede.estudio', 'sede.centro'];
  // vitrina: la sala vista desde la calle (el letrero de neón va adentro: los letreros de la fachada ya llevan tu nombre)
  const FACHADA = [
    { vit: [95, 96, 170, 44], garaje: true },
    { vit: [78, 96, 122, 44] },
    { vit: [60, 100, 120, 40] },
    { vit: [56, 92, 196, 48] },
  ];
  function etapaDe(s, local) {
    if (typeof local === 'number' && local >= 0) return Math.min(3, Math.floor(local));
    if (typeof local === 'string') { const i = LOCALES.indexOf(local); if (i >= 0) return i; }
    return nivelLocal(s);
  }
  function capa(s, local, ctx) {
    try {
      if (!s || !s.decor || !Array.isArray(s.decor.items) || !s.decor.items.length) return '';
      const L = lista(s).filter((x) => x.activo);
      if (!L.length) return '';
      const F = FACHADA[etapaDe(s, local)];
      const noche = (Number(s.day) || 1) % 2 === 0;
      const [x, y, w, h] = F.vit;
      let k = h / 80;
      if (200 * k > w) k = w / 200;
      const tx = x + (w - 200 * k) / 2, ty = y + h - 80 * k;
      const id = uid();
      const piso = ty + 60 * k;
      const lineas = F.garaje ? '' : [1, 2].map((i) => `<path d="M${x + (w * i) / 3} ${y}v${h}" stroke="#4a5568" stroke-width="1.2" opacity=".7"/>`).join('');
      const out = `<g class="dc-vitrina"><defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>
        <g clip-path="url(#${id})">${fondoSala(x, y, w, h, piso, noche)}
          <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})">${piezas(s, ctx)}</g>
          <path d="M${x} ${y}h${w * 0.35}l-${w * 0.22} ${h}H${x}z" fill="#fff" opacity="${noche ? 0.04 : 0.1}"/></g>
        ${lineas}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#4a5568" stroke-width="1.6"/>
        ${F.garaje ? `<rect x="${x}" y="${y - 4}" width="${w}" height="5" fill="#2a2e37"/><path d="M${x} ${y + 1}h${w}" stroke="#ffd27a" stroke-width=".8" opacity=".5"/>` : ''}
        ${noche ? `<ellipse cx="${x + w / 2}" cy="143" rx="${w * 0.45}" ry="3.5" fill="#ffd27a" opacity=".14"/>` : ''}</g>`;
      return `<g class="decor-capa">${out}</g>`;
    } catch (e) { return ''; }
  }

  /* =========================================================
     Pantalla: tarjeta de Inicio + ventana "Decorar el local"
     ========================================================= */
  const CSS = `
  .dc-card .dc-pic{border-radius:10px;overflow:hidden;border:1px solid var(--line);background:#10131a;cursor:pointer}
  .dc-pic svg,.dc-modal .dc-pic svg{display:block;width:100%;height:auto;aspect-ratio:200/80}
  .dc-card h3{font-size:17px;margin:10px 0 0;line-height:1.2}
  .dc-sub{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:4px}
  .dc-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
  .dc-chips .tag{margin:0}
  .dc-chips .tag.dc-mal,.dc-mal{color:#ffb3b3;border-color:#ff3b3b66}
  .dc-up{color:var(--green)}.dc-am{color:var(--amber)}
  .dc-btns{display:flex;gap:8px;margin-top:10px}.dc-btns .btn{margin:0;flex:1}
  .dc-modal .dc-pic{border-radius:10px;overflow:hidden;border:1px solid var(--line);margin:8px 0}
  .dc-ef{font-family:var(--f-head);font-size:20px;font-weight:800}
  .dc-own{display:flex;align-items:center;gap:10px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:6px 8px;margin-bottom:6px}
  .dc-own.dc-off{opacity:.55}
  .dc-own .dc-th{width:52px;height:40px;flex:none}
  .dc-own .grow{min-width:0}.dc-own b{display:block;font-size:14px;line-height:1.2}
  .dc-th{background:#10131a;border-radius:8px;overflow:hidden}.dc-th svg{width:100%;height:100%;display:block}
  .dc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .dc-it{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:3px;min-width:0}
  .dc-it .dc-th{height:56px;margin-bottom:2px}
  .dc-it b{font-size:14px;line-height:1.2}
  .dc-it .btn{margin-top:auto;padding:9px 6px;font-size:13px}
  .dc-it.dc-lock{opacity:.6}
  .dc-tg{display:flex;flex-wrap:wrap;gap:2px 8px;font-size:12px}
  .dc-neon{animation:dcNeon 7s infinite}
  @keyframes dcNeon{0%,90%,100%{opacity:1}92%{opacity:.55}93%{opacity:1}95%{opacity:.7}}
  @media (prefers-reduced-motion:reduce){.dc-neon{animation:none}}`;
  function ponerCss() {
    try {
      const doc = root.document;
      if (!doc || !doc.head || doc.getElementById('decor-css')) return;
      const st = doc.createElement('style'); st.id = 'decor-css'; st.textContent = CSS; doc.head.appendChild(st);
    } catch (e) { /* sin documento */ }
  }
  const Mx = (ctx, n) => (ctx && typeof ctx.M === 'function' ? ctx.M(n) : G.money(n));
  const ic = (ctx, n) => (ctx && typeof ctx.I === 'function' ? ctx.I(n, 'sm') : '');
  const estadoFlores = (x) => (x.fresca ? (x.quedan <= 1 ? t('frescas1') : t('frescas', { n: x.quedan })) : t('marchitas'));

  function tarjeta(ctx) {
    const s = ctx && ctx.S ? ctx.S() : null;
    if (!s) return '';
    ponerCss();
    est(s);
    const im = imagen(s);
    const act = im.items.filter((x) => x.activo);
    const flores = act.find((x) => x.def.dias && (!x.fresca || x.quedan <= 1));
    const chips = act.map((x) => {
      const mal = x.def.dias && !x.fresca;
      return `<span class="tag ${mal ? 'dc-mal' : ''}">${escX(nombreItem(x.it.k))}${x.def.dias ? ` · ${escX(estadoFlores(x))}` : ''}</span>`;
    }).join('');
    return `<div class="card dc-card" data-decor="tarjeta">
      <div class="dc-pic" data-ext="decoracion" data-acc="abrir">${interior(s, ctx)}</div>
      <h3>${escX(t('h_resumen', { n: im.puntos, p: im.pct }))}</h3>
      <div class="bar ${im.marchitas ? 'amber' : ''}"><i style="width:${im.puntos}%"></i></div>
      <div class="dc-sub small muted"><span>${escX(t('lugares', { n: im.usados, m: im.lugares }))}</span><span>${im.gasto ? escX(t('mant', { m: Mx(ctx, im.gasto) })) : escX(t('mant0'))}</span>
        ${im.guardados ? `<span class="dc-am">${escX(t('guardados', { n: im.guardados }))}</span>` : ''}</div>
      ${chips ? `<div class="dc-chips small">${chips}</div>` : `<p class="small muted" style="margin:8px 0 0">${escX(t('vacio'))}</p>`}
      <div class="dc-btns">
        ${flores ? `<button class="btn green" data-ext="decoracion" data-acc="flores" data-i="${flores.i}">${escX(t('cambiar'))} · ${Mx(ctx, DEF.flores.precio)}</button>` : ''}
        <button class="btn main" data-ext="decoracion" data-acc="abrir">${ic(ctx, 'home')} ${escX(t('decorar'))}</button>
      </div></div>`;
  }

  function modalHtml(ctx) {
    const s = ctx.S();
    est(s);
    const im = imagen(s), nv = nivelLocal(s);
    const cerrar = ctx.T ? escX(ctx.T('comun.cerrar')) : 'X';
    const tags = (def, pts) => `<div class="dc-tg"><span class="${pts < 0 ? 'dc-mal' : 'dc-up'}">${escX(t(pts < 0 ? 'pts_neg' : 'pts', { n: pts }))}</span>
      ${def.gasto ? `<span class="dc-am">${escX(t('por_dia', { m: Mx(ctx, def.gasto) }))}</span>` : ''}
      ${def.dias ? `<span class="muted">${escX(t('dura', { n: def.dias }))}</span>` : ''}${def.nota ? `<span class="muted">${escX(t(def.nota))}</span>` : ''}</div>`;
    const propias = im.items.map((x) => {
      const def = x.def, dev = devolucion(def);
      const est2 = x.activo ? (def.dias ? `<span class="small ${x.fresca ? 'dc-up' : 'dc-mal'}">${escX(estadoFlores(x))}</span>` : '')
        : `<span class="small dc-am">${escX(x.motivo === 'local' ? t('desde', { lugar: nombreLocal(def.min) }) : t('guardado'))}</span>`;
      const pts = x.activo ? x.pts : 0;
      const btnFlores = def.dias && (!x.fresca || x.quedan <= 1) ? `<button class="btn sm green" data-ext="decoracion" data-acc="flores" data-i="${x.i}">${escX(t('cambiar'))} ${Mx(ctx, def.precio)}</button>` : '';
      return `<div class="dc-own ${x.activo ? '' : 'dc-off'}"><div class="dc-th">${miniaturaDe(x, s, ctx)}</div>
        <div class="grow"><b>${escX(nombreItem(x.it.k))}</b>${x.activo ? `<span class="small ${pts < 0 ? 'dc-mal' : 'dc-up'}">${escX(t(pts < 0 ? 'pts_neg' : 'pts', { n: pts }))}</span>${est2 ? ' · ' : ''}` : ''}${est2}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${btnFlores}<button class="btn sm" data-ext="decoracion" data-acc="quitar" data-i="${x.i}">${escX(t('quitar'))}${dev ? ` +${Mx(ctx, dev)}` : ''}</button></div></div>`;
    }).join('');
    const total = est(s).items.length;
    const tienda = CATALOGO.map((def) => {
      const tiene = est(s).items.filter((x) => x.k === def.k).length;
      const lleno = tiene >= (def.max || 1);
      const lock = def.min > nv;
      let btn;
      if (lock) btn = `<button class="btn" disabled>${ic(ctx, 'lock')} ${escX(t('desde', { lugar: nombreLocal(def.min) }))}</button>`;
      else if (lleno) btn = `<button class="btn" disabled>${ic(ctx, 'check')} ${escX(t('tienes'))}</button>`;
      else if (total >= im.lugares) btn = `<button class="btn" disabled>${escX(t('sin_lugar'))}</button>`;
      else btn = `<button class="btn ${s.money >= def.precio ? 'green' : ''}" data-ext="decoracion" data-acc="comprar" data-k="${def.k}" ${s.money >= def.precio ? '' : 'disabled'}>${escX(t('comprar'))} ${Mx(ctx, def.precio)}</button>`;
      return `<div class="dc-it ${lock ? 'dc-lock' : ''}" data-item="${def.k}"><div class="dc-th">${miniatura(def.k, s, ctx)}</div>
        <b>${escX(nombreItem(def.k))}</b>${tags(def, def.k === 'cuadros' || def.k === 'trofeos' ? puntosDe(s, { k: def.k }) : def.pts)}${btn}</div>`;
    }).join('');
    return `<div class="dc-modal">
      <div class="row between"><h2>${ic(ctx, 'home')} ${escX(t('modal_t'))}</h2><button class="btn sm" data-act="close" aria-label="${cerrar}">${ic(ctx, 'close') || 'X'}</button></div>
      <div class="dc-pic">${interior(s, ctx)}</div>
      <div class="dc-ef">${escX(t('efecto', { n: im.puntos, p: im.pct }))}</div>
      <div class="bar ${im.marchitas ? 'amber' : ''}"><i style="width:${im.puntos}%"></i></div>
      <p class="small muted" style="margin:6px 0 0">${escX(im.cada ? t('visita_cada', { n: im.cada }) : t('visita_no'))} · ${escX(t('lugares', { n: im.usados, m: im.lugares }))} · ${im.gasto ? escX(t('mant', { m: Mx(ctx, im.gasto) })) : escX(t('mant0'))}</p>
      ${propias ? `<div class="sectitle">${escX(t('en_local'))}</div>${propias}` : ''}
      <div class="sectitle">${escX(t('tienda'))}</div><div class="dc-grid">${tienda}</div></div>`;
  }

  let ultimo = { k: '', t: 0 };
  function clic(ctx, accion, el) {
    const s = ctx && ctx.S ? ctx.S() : null;
    if (!s) return;
    const attr = (n) => (el && el.getAttribute ? el.getAttribute(n) : null);
    const id = accion + ':' + (attr('data-k') || attr('data-i') || '');
    const ahora = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    if (ultimo.k === id && ahora - ultimo.t < 300) return;
    ultimo = { k: id, t: ahora };
    const abierto = () => { try { return !!(root.document && root.document.querySelector('#modal .dc-modal')); } catch (e) { return false; } };
    let r = null;
    if (accion === 'abrir') { ponerCss(); ctx.openModal(modalHtml(ctx)); return; }
    if (accion === 'comprar') r = comprar(s, attr('data-k'));
    else if (accion === 'quitar') r = quitar(s, Number(attr('data-i')));
    else if (accion === 'flores') r = cambiarFlores(s, Number(attr('data-i')));
    else return;
    try { if (r && r.msg && ctx.toast) ctx.toast(r.msg); } catch (e) { /* sin toast */ }
    try { if (ctx.snd && ctx.snd.play) ctx.snd.play(r && r.ok ? (accion === 'quitar' ? 'tap' : 'buy') : 'error'); } catch (e) { /* sin sonido */ }
    if (r && r.ok) { try { if (ctx.save) ctx.save(); } catch (e) { /* sin guardar */ } }
    const seguir = abierto();
    try { if (ctx.render) ctx.render(); } catch (e) { /* nada */ }
    if (seguir) { const m = root.document.getElementById('modal'); const y = m ? m.scrollTop : 0; ctx.openModal(modalHtml(ctx)); if (m) m.scrollTop = y; }
  }

  const TARJETA = { id: 'decoracion', orden: 12, tarjeta, clic };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === 'decoracion')) root.EnVivoInicio.push(TARJETA);
  ponerCss();
  try {
    if (root.document && !(root.document.head)) root.document.addEventListener('DOMContentLoaded', ponerCss);
    if (root.I18N && root.I18N.onChange) root.I18N.onChange(registrarTextos);
  } catch (e) { /* sin documento */ }

  const API = { AJUSTE, CATALOGO, DEF, TRAD, EXT, TARJETA, t, migrar, imagen, lista, lugares, nivelLocal, puntosDe, pctDe, cadaVisita,
    gastoDiario, comprar, quitar, cambiarFlores, devolucion, capa, interior, miniatura, tarjeta, modalHtml, clic, nombreProductora,
    registrarTextos };
  root.Decoracion = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
