/* =========================================================
   EN VIVO Tycoon — Movilización: cómo llegan el personal y los equipos al evento
   Reglas en js/logic.js (Game.planTransporte, Game.flota): este archivo solo dibuja.

     Movilizacion.seccionPrep(ctx, contrato, staffIds, equipIds) → HTML de la sección "Movilización" de la preparación:
         qué llevas (personas y bultos), tu flota y, si hace falta, la tarjeta de la aplicación "Llévame" con 2-3 opciones
         (precio, capacidad y tiempo de llegada; la más barata ya viene elegida). Tocar una opción guarda contrato.movil.
     Movilizacion.resumenPrep(S, contrato, staffIds, equipIds) → " · Movilización $5" (para la línea de sueldos)
     Movilizacion.animar(ctx, listo)  → escena de ~3,6 s al salir al aire (el equipo carga el vehículo con el nombre de la
         productora y sale al lugar del evento). Se salta tocando; con prefers-reduced-motion es una imagen fija de 1 s.
         Llama a listo() una sola vez al terminar.
     Movilizacion.filaResultado(r, M) → <tr> de la movilización en la tabla del resultado ('' si no hubo)
     Movilizacion.tarjetaFlota(ctx)  → tarjeta "Flota" (vehículos, capacidad, mantenimiento, estado, taller)
         También se registra sola en window.EnVivoInicio (id 'flota').
     Movilizacion.t(clave, params)   → textos de este módulo en el idioma actual (10 idiomas)

   ctx: el de los módulos de ui.js (ctxInicio): S(), G, A, M, esc, save(), render(), toast(), nombreProductora().
   ========================================================= */
(function (root) {
  'use strict';

  const APP = 'Llévame'; // aplicación de transporte del juego (nombre inventado, igual en todos los idiomas)

  /* ---------- Textos (10 idiomas) ---------- */
  const TX = {
    es: {
      titulo: 'Movilización', ida: 'ida y vuelta · {km} km', persona1: '{n} persona', personas: '{n} personas', bulto1: '{n} bulto', bultos: '{n} bultos',
      grande: 'bulto grande', flota_lleva: 'En tu flota', comb: 'combustible {m}', todo_flota: 'Todo entra en tus vehículos: solo pagas combustible.',
      pedir: 'Pedir transporte', a: 'a {lugar}', op_economico: 'Económico', op_xl: 'XL', op_carga: 'Carga',
      auto1: '{n} auto', autos: '{n} autos', flete1: '{n} camioneta con chofer', fletes: '{n} camionetas con chofer', asientos: '{n} asientos', hasta: 'hasta {n} bultos',
      min: '{n} min', no_grande: 'No entra un bulto grande', no_muchos: 'Demasiados autos', barato: 'Más barato', elegido: 'Elegido',
      resto: 'Por la app: {p} · {b}', incluido: 'Incluida en los gastos de viaje', res: 'Movilización', res_flota: 'tu flota',
      cargando: 'Cargando el equipo…', rumbo: 'Rumbo a {lugar} · {km} km', llego: '¡Llegamos! A transmitir', saltar: 'Toca para saltar',
      flota: 'Flota', veh1: '{n} vehículo · {m}/día', vehs: '{n} vehículos · {m}/día', vacia_h: 'Sin vehículos: vas en taxi',
      vacia: 'Para cada evento pides un auto en Llévame (desde ~$5 ida y vuelta). Con vehículo propio solo pagas combustible, pero cada día cuesta su mantenimiento.',
      dia: '{m}/día', estado: 'estado {n}%', taller: 'En el taller', reparar: 'Reparar {m}', tienda: 'Ver vehículos', gasto: 'vehículos {m}',
      anim: 'El equipo carga el vehículo y sale al evento', maneja: 'maneja alguien de tu equipo',
      pct: '{n}% del pago', cubre: 'El cliente cubre {m} de movilización',
    },
    en: {
      titulo: 'Getting there', ida: 'round trip · {km} km', persona1: '{n} person', personas: '{n} people', bulto1: '{n} case', bultos: '{n} cases',
      grande: 'bulky item', flota_lleva: 'In your fleet', comb: 'fuel {m}', todo_flota: 'Everything fits in your vehicles: you only pay for fuel.',
      pedir: 'Book a ride', a: 'to {lugar}', op_economico: 'Economy', op_xl: 'XL', op_carga: 'Cargo',
      auto1: '{n} car', autos: '{n} cars', flete1: '{n} truck with driver', fletes: '{n} trucks with driver', asientos: '{n} seats', hasta: 'up to {n} cases',
      min: '{n} min', no_grande: 'A bulky item won’t fit', no_muchos: 'Too many cars', barato: 'Cheapest', elegido: 'Selected',
      resto: 'By app: {p} · {b}', incluido: 'Included in travel costs', res: 'Transport', res_flota: 'your fleet',
      cargando: 'Loading the gear…', rumbo: 'Heading to {lugar} · {km} km', llego: 'We’re here! Let’s go live', saltar: 'Tap to skip',
      flota: 'Fleet', veh1: '{n} vehicle · {m}/day', vehs: '{n} vehicles · {m}/day', vacia_h: 'No vehicles: you take a cab',
      vacia: 'For every event you book a car on Llévame (from ~$5 round trip). With your own vehicle you only pay for fuel, but upkeep costs every day.',
      dia: '{m}/day', estado: 'condition {n}%', taller: 'In the shop', reparar: 'Repair {m}', tienda: 'See vehicles', gasto: 'vehicles {m}',
      anim: 'The crew loads the vehicle and heads to the event', maneja: 'driven by your crew',
      pct: '{n}% of the pay', cubre: 'The client covers {m} of transport',
    },
    'pt-BR': {
      titulo: 'Deslocamento', ida: 'ida e volta · {km} km', persona1: '{n} pessoa', personas: '{n} pessoas', bulto1: '{n} volume', bultos: '{n} volumes',
      grande: 'volume grande', flota_lleva: 'Na sua frota', comb: 'combustível {m}', todo_flota: 'Tudo cabe nos seus veículos: você só paga o combustível.',
      pedir: 'Pedir transporte', a: 'até {lugar}', op_economico: 'Econômico', op_xl: 'XL', op_carga: 'Carga',
      auto1: '{n} carro', autos: '{n} carros', flete1: '{n} caminhonete com motorista', fletes: '{n} caminhonetes com motorista', asientos: '{n} lugares', hasta: 'até {n} volumes',
      min: '{n} min', no_grande: 'Um volume grande não cabe', no_muchos: 'Carros demais', barato: 'Mais barato', elegido: 'Escolhido',
      resto: 'Pelo app: {p} · {b}', incluido: 'Incluído nos gastos de viagem', res: 'Deslocamento', res_flota: 'sua frota',
      cargando: 'Carregando o equipamento…', rumbo: 'Rumo a {lugar} · {km} km', llego: 'Chegamos! Hora de transmitir', saltar: 'Toque para pular',
      flota: 'Frota', veh1: '{n} veículo · {m}/dia', vehs: '{n} veículos · {m}/dia', vacia_h: 'Sem veículos: você vai de táxi',
      vacia: 'Em cada evento você pede um carro no Llévame (a partir de ~$5 ida e volta). Com veículo próprio você só paga o combustível, mas a manutenção custa todo dia.',
      dia: '{m}/dia', estado: 'estado {n}%', taller: 'Na oficina', reparar: 'Consertar {m}', tienda: 'Ver veículos', gasto: 'veículos {m}',
      anim: 'A equipe carrega o veículo e sai para o evento', maneja: 'alguém da equipe dirige',
      pct: '{n}% do pagamento', cubre: 'O cliente cobre {m} de transporte',
    },
    fr: {
      titulo: 'Déplacement', ida: 'aller-retour · {km} km', persona1: '{n} personne', personas: '{n} personnes', bulto1: '{n} colis', bultos: '{n} colis',
      grande: 'colis volumineux', flota_lleva: 'Dans ta flotte', comb: 'carburant {m}', todo_flota: 'Tout rentre dans tes véhicules : tu ne paies que le carburant.',
      pedir: 'Commander un trajet', a: 'vers {lugar}', op_economico: 'Économique', op_xl: 'XL', op_carga: 'Fret',
      auto1: '{n} voiture', autos: '{n} voitures', flete1: '{n} pick-up avec chauffeur', fletes: '{n} pick-up avec chauffeur', asientos: '{n} places', hasta: 'jusqu’à {n} colis',
      min: '{n} min', no_grande: 'Un colis volumineux ne rentre pas', no_muchos: 'Trop de voitures', barato: 'Le moins cher', elegido: 'Choisi',
      resto: 'Par l’appli : {p} · {b}', incluido: 'Inclus dans les frais de voyage', res: 'Déplacement', res_flota: 'ta flotte',
      cargando: 'Chargement du matériel…', rumbo: 'En route vers {lugar} · {km} km', llego: 'On y est ! À l’antenne', saltar: 'Touche pour passer',
      flota: 'Flotte', veh1: '{n} véhicule · {m}/jour', vehs: '{n} véhicules · {m}/jour', vacia_h: 'Pas de véhicule : tu prends un taxi',
      vacia: 'Pour chaque événement tu commandes une voiture sur Llévame (dès ~5 $ aller-retour). Avec ton propre véhicule tu ne paies que le carburant, mais l’entretien coûte chaque jour.',
      dia: '{m}/jour', estado: 'état {n} %', taller: 'Au garage', reparar: 'Réparer {m}', tienda: 'Voir les véhicules', gasto: 'véhicules {m}',
      anim: 'L’équipe charge le véhicule et part vers l’événement', maneja: 'conduit par ton équipe',
      pct: '{n} % du cachet', cubre: 'Le client prend en charge {m} de transport',
    },
    de: {
      titulo: 'Anfahrt', ida: 'hin und zurück · {km} km', persona1: '{n} Person', personas: '{n} Personen', bulto1: '{n} Gepäckstück', bultos: '{n} Gepäckstücke',
      grande: 'Sperrgut', flota_lleva: 'In deiner Flotte', comb: 'Sprit {m}', todo_flota: 'Alles passt in deine Fahrzeuge: du zahlst nur Sprit.',
      pedir: 'Fahrt bestellen', a: 'nach {lugar}', op_economico: 'Economy', op_xl: 'XL', op_carga: 'Fracht',
      auto1: '{n} Auto', autos: '{n} Autos', flete1: '{n} Pick-up mit Fahrer', fletes: '{n} Pick-ups mit Fahrer', asientos: '{n} Sitze', hasta: 'bis {n} Stück',
      min: '{n} Min.', no_grande: 'Sperrgut passt nicht rein', no_muchos: 'Zu viele Autos', barato: 'Am günstigsten', elegido: 'Gewählt',
      resto: 'Per App: {p} · {b}', incluido: 'In den Reisekosten enthalten', res: 'Anfahrt', res_flota: 'deine Flotte',
      cargando: 'Ausrüstung wird verladen…', rumbo: 'Unterwegs nach {lugar} · {km} km', llego: 'Angekommen! Auf Sendung', saltar: 'Tippen zum Überspringen',
      flota: 'Flotte', veh1: '{n} Fahrzeug · {m}/Tag', vehs: '{n} Fahrzeuge · {m}/Tag', vacia_h: 'Keine Fahrzeuge: du nimmst ein Taxi',
      vacia: 'Für jedes Event bestellst du ein Auto bei Llévame (ab ~5 $ hin und zurück). Mit eigenem Fahrzeug zahlst du nur Sprit, aber der Unterhalt kostet jeden Tag.',
      dia: '{m}/Tag', estado: 'Zustand {n} %', taller: 'In der Werkstatt', reparar: 'Reparieren {m}', tienda: 'Fahrzeuge ansehen', gasto: 'Fahrzeuge {m}',
      anim: 'Das Team belädt das Fahrzeug und fährt zum Event', maneja: 'jemand aus dem Team fährt',
      pct: '{n} % der Gage', cubre: 'Der Kunde übernimmt {m} Transport',
    },
    it: {
      titulo: 'Trasferta', ida: 'andata e ritorno · {km} km', persona1: '{n} persona', personas: '{n} persone', bulto1: '{n} collo', bultos: '{n} colli',
      grande: 'collo ingombrante', flota_lleva: 'Nella tua flotta', comb: 'carburante {m}', todo_flota: 'Tutto entra nei tuoi veicoli: paghi solo il carburante.',
      pedir: 'Prenota una corsa', a: 'verso {lugar}', op_economico: 'Economy', op_xl: 'XL', op_carga: 'Merci',
      auto1: '{n} auto', autos: '{n} auto', flete1: '{n} pick-up con autista', fletes: '{n} pick-up con autista', asientos: '{n} posti', hasta: 'fino a {n} colli',
      min: '{n} min', no_grande: 'Un collo ingombrante non entra', no_muchos: 'Troppe auto', barato: 'Il più economico', elegido: 'Scelto',
      resto: 'Con l’app: {p} · {b}', incluido: 'Incluso nelle spese di viaggio', res: 'Trasferta', res_flota: 'la tua flotta',
      cargando: 'Carico dell’attrezzatura…', rumbo: 'Verso {lugar} · {km} km', llego: 'Arrivati! Si va in onda', saltar: 'Tocca per saltare',
      flota: 'Flotta', veh1: '{n} veicolo · {m}/giorno', vehs: '{n} veicoli · {m}/giorno', vacia_h: 'Nessun veicolo: vai in taxi',
      vacia: 'Per ogni evento prenoti un’auto su Llévame (da ~5 $ andata e ritorno). Con un veicolo tuo paghi solo il carburante, ma la manutenzione costa ogni giorno.',
      dia: '{m}/giorno', estado: 'stato {n}%', taller: 'In officina', reparar: 'Ripara {m}', tienda: 'Vedi i veicoli', gasto: 'veicoli {m}',
      anim: 'La squadra carica il veicolo e parte per l’evento', maneja: 'guida qualcuno della squadra',
      pct: '{n}% del compenso', cubre: 'Il cliente copre {m} di trasporto',
    },
    ru: {
      titulo: 'Дорога', ida: 'туда и обратно · {km} км', persona1: '{n} человек', personas: '{n} чел.', bulto1: '{n} место', bultos: '{n} мест',
      grande: 'крупный груз', flota_lleva: 'В твоём автопарке', comb: 'топливо {m}', todo_flota: 'Всё помещается в твои машины: платишь только за топливо.',
      pedir: 'Заказать поездку', a: 'до: {lugar}', op_economico: 'Эконом', op_xl: 'XL', op_carga: 'Грузовой',
      auto1: '{n} машина', autos: '{n} машины', flete1: '{n} пикап с водителем', fletes: '{n} пикапа с водителем', asientos: '{n} мест', hasta: 'до {n} мест груза',
      min: '{n} мин', no_grande: 'Крупный груз не влезет', no_muchos: 'Слишком много машин', barato: 'Дешевле всего', elegido: 'Выбрано',
      resto: 'Через приложение: {p} · {b}', incluido: 'Входит в расходы на поездку', res: 'Дорога', res_flota: 'твой автопарк',
      cargando: 'Грузим технику…', rumbo: 'Едем: {lugar} · {km} км', llego: 'Приехали! В эфир', saltar: 'Нажми, чтобы пропустить',
      flota: 'Автопарк', veh1: '{n} машина · {m}/день', vehs: '{n} машин · {m}/день', vacia_h: 'Машин нет: ездишь на такси',
      vacia: 'На каждое событие ты заказываешь машину в Llévame (от ~$5 туда и обратно). Со своей машиной платишь только за топливо, но обслуживание стоит денег каждый день.',
      dia: '{m}/день', estado: 'состояние {n}%', taller: 'В ремонте', reparar: 'Починить {m}', tienda: 'Смотреть машины', gasto: 'машины {m}',
      anim: 'Команда грузит машину и едет на событие', maneja: 'за рулём кто-то из команды',
      pct: '{n}% от оплаты', cubre: 'Клиент берёт на себя {m} за транспорт',
    },
    tr: {
      titulo: 'Ulaşım', ida: 'gidiş-dönüş · {km} km', persona1: '{n} kişi', personas: '{n} kişi', bulto1: '{n} koli', bultos: '{n} koli',
      grande: 'büyük parça', flota_lleva: 'Filonda', comb: 'yakıt {m}', todo_flota: 'Her şey araçlarına sığıyor: sadece yakıt ödersin.',
      pedir: 'Araç çağır', a: '{lugar} yönüne', op_economico: 'Ekonomik', op_xl: 'XL', op_carga: 'Yük',
      auto1: '{n} araba', autos: '{n} araba', flete1: '{n} şoförlü kamyonet', fletes: '{n} şoförlü kamyonet', asientos: '{n} koltuk', hasta: 'en fazla {n} koli',
      min: '{n} dk', no_grande: 'Büyük parça sığmaz', no_muchos: 'Çok fazla araba', barato: 'En ucuz', elegido: 'Seçildi',
      resto: 'Uygulamayla: {p} · {b}', incluido: 'Seyahat giderlerine dahil', res: 'Ulaşım', res_flota: 'filon',
      cargando: 'Ekipman yükleniyor…', rumbo: '{lugar} yolunda · {km} km', llego: 'Geldik! Yayına', saltar: 'Geçmek için dokun',
      flota: 'Filo', veh1: '{n} araç · {m}/gün', vehs: '{n} araç · {m}/gün', vacia_h: 'Araç yok: taksiyle gidersin',
      vacia: 'Her etkinlik için Llévame’dan araba çağırırsın (gidiş-dönüş ~5 $’dan başlar). Kendi aracınla sadece yakıt ödersin ama bakımı her gün para tutar.',
      dia: '{m}/gün', estado: 'durum %{n}', taller: 'Serviste', reparar: 'Onar {m}', tienda: 'Araçları gör', gasto: 'araçlar {m}',
      anim: 'Ekip aracı yükleyip etkinliğe yola çıkıyor', maneja: 'ekipten biri sürüyor',
      pct: 'ödemenin %{n}', cubre: 'Ulaşımın {m} kadarını müşteri karşılıyor',
    },
    id: {
      titulo: 'Perjalanan', ida: 'pulang-pergi · {km} km', persona1: '{n} orang', personas: '{n} orang', bulto1: '{n} koli', bultos: '{n} koli',
      grande: 'barang besar', flota_lleva: 'Di armadamu', comb: 'bensin {m}', todo_flota: 'Semua muat di kendaraanmu: kamu hanya bayar bensin.',
      pedir: 'Pesan kendaraan', a: 'ke {lugar}', op_economico: 'Ekonomi', op_xl: 'XL', op_carga: 'Kargo',
      auto1: '{n} mobil', autos: '{n} mobil', flete1: '{n} pikap dengan sopir', fletes: '{n} pikap dengan sopir', asientos: '{n} kursi', hasta: 'sampai {n} koli',
      min: '{n} mnt', no_grande: 'Barang besar tidak muat', no_muchos: 'Terlalu banyak mobil', barato: 'Termurah', elegido: 'Dipilih',
      resto: 'Lewat aplikasi: {p} · {b}', incluido: 'Termasuk biaya perjalanan', res: 'Perjalanan', res_flota: 'armadamu',
      cargando: 'Memuat peralatan…', rumbo: 'Menuju {lugar} · {km} km', llego: 'Sudah sampai! Siaran dimulai', saltar: 'Ketuk untuk lewati',
      flota: 'Armada', veh1: '{n} kendaraan · {m}/hari', vehs: '{n} kendaraan · {m}/hari', vacia_h: 'Tanpa kendaraan: kamu naik taksi',
      vacia: 'Untuk tiap acara kamu memesan mobil di Llévame (mulai ~$5 pulang-pergi). Dengan kendaraan sendiri kamu hanya bayar bensin, tapi perawatannya ada biaya tiap hari.',
      dia: '{m}/hari', estado: 'kondisi {n}%', taller: 'Di bengkel', reparar: 'Perbaiki {m}', tienda: 'Lihat kendaraan', gasto: 'kendaraan {m}',
      anim: 'Kru memuat kendaraan dan berangkat ke acara', maneja: 'dikemudikan krumu',
      pct: '{n}% dari bayaran', cubre: 'Klien menanggung {m} biaya transport',
    },
    'zh-CN': {
      titulo: '出行', ida: '往返 · {km} 公里', persona1: '{n} 人', personas: '{n} 人', bulto1: '{n} 件', bultos: '{n} 件',
      grande: '大件', flota_lleva: '你的车队', comb: '油费 {m}', todo_flota: '全部装进你的车：只付油费。',
      pedir: '叫车', a: '前往 {lugar}', op_economico: '经济型', op_xl: '大空间', op_carga: '货运',
      auto1: '{n} 辆车', autos: '{n} 辆车', flete1: '{n} 辆带司机皮卡', fletes: '{n} 辆带司机皮卡', asientos: '{n} 座', hasta: '最多 {n} 件',
      min: '{n} 分钟', no_grande: '大件装不下', no_muchos: '车太多', barato: '最便宜', elegido: '已选',
      resto: '用应用：{p} · {b}', incluido: '已含在差旅费里', res: '出行', res_flota: '你的车队',
      cargando: '正在装设备…', rumbo: '前往 {lugar} · {km} 公里', llego: '到了！开播', saltar: '点击跳过',
      flota: '车队', veh1: '{n} 辆车 · {m}/天', vehs: '{n} 辆车 · {m}/天', vacia_h: '没有车：你打车去',
      vacia: '每场活动都在 Llévame 叫车（往返约 $5 起）。有自己的车只付油费，但每天都有保养费用。',
      dia: '{m}/天', estado: '状态 {n}%', taller: '在修理厂', reparar: '维修 {m}', tienda: '看车辆', gasto: '车辆 {m}',
      anim: '团队把设备装上车，出发去活动现场', maneja: '由你的团队驾驶',
      pct: '占报酬 {n}%', cubre: '客户承担 {m} 交通费',
    },
  };
  const idioma = () => { try { const c = root.I18N && root.I18N.idioma; return TX[c] ? c : 'es'; } catch (e) { return 'es'; } };
  function t(k, p) {
    const d = TX[idioma()];
    let s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : (TX.es[k] !== undefined ? TX.es[k] : k);
    if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined && p[x] !== null ? String(p[x]) : m));
    return s;
  }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const G = () => root.Game;
  const money = (n) => { const v = Math.round(Number(n) || 0); try { return root.I18N && root.I18N.money ? root.I18N.money(v) : G().money(v); } catch (e) { return '$' + v; } };
  const num = (n) => { try { return root.I18N && root.I18N.num ? root.I18N.num(n) : String(n); } catch (e) { return String(n); } };
  const TL = (s) => { try { return root.I18N && root.I18N.TL ? root.I18N.TL(s) : s; } catch (e) { return s; } };
  const nPers = (n) => t(n === 1 ? 'persona1' : 'personas', { n: num(n) });
  const nBult = (n) => t(n === 1 ? 'bulto1' : 'bultos', { n: num(Math.round(n * 10) / 10) });
  const nAutos = (n) => t(n === 1 ? 'auto1' : 'autos', { n: num(n) });
  const nFletes = (n) => t(n === 1 ? 'flete1' : 'fletes', { n: num(n) });
  const reduceMotion = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const nombreDe = (ctx) => {
    try { const n = ctx && typeof ctx.nombreProductora === 'function' ? ctx.nombreProductora() : ''; if (n && String(n).trim()) return String(n).trim(); } catch (e) { /* abajo */ }
    try { const S = ctx && (typeof ctx.S === 'function' ? ctx.S() : ctx.estado); if (S && typeof S.productora === 'string' && S.productora.trim()) return S.productora.trim(); } catch (e) { /* abajo */ }
    return 'MI PRODUCTORA';
  };
  const estadoDe = (ctx) => { try { return typeof ctx.S === 'function' ? ctx.S() : (typeof ctx.estado === 'function' ? ctx.estado() : ctx.estado); } catch (e) { return null; } };
  const nombreEquipo = (v) => { try { const e = { type: v.type }; return TL(v.nombre || (G().CATALOG[v.type] || {}).name || v.type); } catch (e) { return v.type; } };

  /* ---------- Estilos ---------- */
  const CSS = `
.mov{margin-top:10px;background:var(--panel2,#1e2430);border:1px solid var(--line,#2a3242);border-radius:12px;padding:10px 10px 8px}
.mov-hd{display:flex;align-items:center;gap:8px;min-width:0}
.mov-hd .mov-ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:#0d0f14;border:1px solid var(--line,#2a3242);flex:none}
.mov-ttl{font-family:var(--f-head,sans-serif);text-transform:uppercase;letter-spacing:1px;font-size:15px;line-height:1.1}
.mov-sub{display:block;color:var(--muted,#8b95a8);font-size:11.5px;font-family:var(--f-body,sans-serif);text-transform:none;letter-spacing:0}
.mov-tot{margin-inline-start:auto;font-family:var(--f-mono,monospace);font-weight:700;font-size:16px;color:var(--text,#e9edf5)}
.mov-load{display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap}
.mov-chip{display:inline-flex;align-items:center;gap:4px;background:#0d0f14;border:1px solid var(--line,#2a3242);border-radius:999px;padding:2px 9px;font-size:12px;white-space:nowrap}
.mov-chip.big{border-color:#ffb02066;color:var(--amber,#ffb020)}
.mov-gear{display:flex;gap:2px;margin-top:6px;overflow:hidden;height:26px;align-items:center}
.mov-gear svg{width:26px;height:26px;flex:none}
.mov-gear .mas{font:600 11px var(--f-mono,monospace);color:var(--muted,#8b95a8);padding-inline-start:4px}
.mov-veh{display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 8px;border-radius:10px;background:#0d0f14;border:1px solid var(--line,#2a3242)}
.mov-veh svg{width:70px;height:31px;flex:none}
.mov-veh .tx{min-width:0;flex:1;font-size:12.5px;line-height:1.3}
.mov-veh .tx b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mov-veh .tx small{color:var(--muted,#8b95a8)}
.mov-veh .p{font:600 12px var(--f-mono,monospace);color:var(--muted,#8b95a8);white-space:nowrap}
.mov-ok{margin-top:6px;font-size:12px;color:var(--green,#2ecc71)}
.mov-app{margin-top:8px;background:#0b1015;border:1px solid #1f3a3a;border-radius:14px;overflow:hidden}
.mov-app-hd{display:flex;align-items:center;gap:8px;padding:8px 10px;background:linear-gradient(90deg,#2dd4bf26,#2dd4bf05);border-bottom:1px solid #1d2c30}
.mov-logo{width:24px;height:24px;border-radius:7px;background:#2dd4bf;display:grid;place-items:center;flex:none}
.mov-app-hd b{font-family:var(--f-head,sans-serif);font-size:16px;letter-spacing:.3px;color:#e6fffb}
.mov-app-hd .q{font-size:12px;color:#8fb7b2;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mov-rest{padding:5px 10px 0;font-size:11.5px;color:#8fb7b2}
.mov-op{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;margin:0;background:none;border:0;border-top:1px solid #16222a;color:var(--text,#e9edf5);text-align:start;font:inherit;cursor:pointer;border-radius:0}
.mov-op:first-of-type{border-top:0}
.mov-op svg{width:52px;height:24px;flex:none}
.mov-op .tx{flex:1;min-width:0;line-height:1.25}
.mov-op .tx b{font-size:14px}
.mov-op .tx small{display:block;color:#8fb7b2;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mov-op .pr{text-align:end;line-height:1.2}
.mov-op .pr b{display:block;font:700 15px var(--f-mono,monospace)}
.mov-op .pr small{font-size:11px;color:#8fb7b2}
.mov-op .tag2{display:inline-block;margin-inline-start:6px;font:600 9.5px var(--f-body,sans-serif);text-transform:uppercase;letter-spacing:.5px;color:#0b1015;background:#2dd4bf;border-radius:5px;padding:1px 5px;vertical-align:2px}
.mov-op.sel{background:#2dd4bf14;box-shadow:inset 3px 0 0 #2dd4bf}
.mov-op .rd{width:16px;height:16px;border-radius:50%;border:2px solid #3b5a5a;flex:none;box-sizing:border-box}
.mov-op.sel .rd{border:5px solid #2dd4bf}
.mov-op[disabled]{opacity:.42;cursor:default}
.mov-op[disabled] .tx small{color:var(--amber,#ffb020)}
.mov-incl{margin-top:6px;font-size:12px;color:var(--muted,#8b95a8)}
/* Flota (Inicio) */
.mov-flota h3{font-size:17px}
.mov-flota .vacia{display:flex;gap:10px;align-items:center;margin-top:8px}
.mov-flota .vacia svg{width:92px;height:42px;flex:none}
.mov-fv{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line,#2a3242)}
.mov-fv:first-of-type{border-top:0}
.mov-fv svg{width:84px;height:38px;flex:none}
.mov-fv .tx{flex:1;min-width:0;font-size:12.5px;line-height:1.35}
.mov-fv .tx b{display:block;font-size:13.5px}
.mov-fv .tx small{color:var(--muted,#8b95a8)}
.mov-fv .bar{margin-top:4px}
.mov-fv .taller{color:var(--amber,#ffb020);font-weight:600}
.mov-fv .btn{width:auto;margin:6px 0 0;padding:7px 10px;font-size:12.5px;display:inline-block}
/* Animación al salir al aire */
.mov-anim{position:fixed;inset:0;z-index:45;background:#05070af2;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:10px;opacity:1;transition:opacity .28s;-webkit-tap-highlight-color:transparent;cursor:pointer}
.mov-anim.fin{opacity:0;pointer-events:none}
.mov-anim .mov-esc{width:100%;max-width:560px;border-radius:18px;overflow:hidden;border:1px solid var(--line,#2a3242);box-shadow:0 12px 50px #000c;background:#0b0e14}
.mov-anim .mov-esc svg{display:block;width:100%;height:auto}
.mov-anim .cap{display:grid;min-height:48px;width:100%;max-width:560px;text-align:center;font-family:var(--f-head,sans-serif);font-size:20px;line-height:1.15;letter-spacing:.5px;text-transform:uppercase}
.mov-anim .cap span{grid-area:1/1;opacity:0;overflow-wrap:anywhere}
.mov-anim .cap small{display:block;font:500 12.5px var(--f-body,sans-serif);text-transform:none;letter-spacing:0;color:var(--muted,#8b95a8);margin-top:2px}
.mov-anim .skip{font-size:12px;color:var(--muted,#8b95a8)}
.mov-anim .c1{animation:mvCap1 var(--t2) linear both}
.mov-anim .c2{animation:mvCap2 calc(var(--t3) - var(--t2)) linear var(--t2) both}
.mov-anim .c3{animation:mvIn .3s ease-out var(--t3) both}
.mov-anim .llega{animation:mvLlega var(--t0) cubic-bezier(.2,.7,.3,1) both}
.mov-anim .sale{animation:mvSale calc(var(--t3) - var(--t2)) cubic-bezier(.55,0,.75,.4) var(--t2) both}
.mov-anim .sale2{animation:mvSale calc(var(--t3) - var(--t2)) cubic-bezier(.55,0,.75,.4) calc(var(--t2) + .18s) both}
.mov-anim .rueda{transform-box:fill-box;transform-origin:center;animation:mvGira .35s linear infinite}
.mov-anim .quieta .rueda{animation-play-state:paused}
.mov-anim .per{animation:mvCarga var(--trip,.7s) ease-in-out var(--d) 2 both}
.mov-anim .per .pi{transform-box:fill-box;transform-origin:top center;animation:mvPaso .22s ease-in-out infinite alternate}
.mov-anim .per .pd{transform-box:fill-box;transform-origin:top center;animation:mvPaso .22s ease-in-out infinite alternate-reverse}
.mov-anim .linea{animation:mvRuta .45s linear var(--t2) 4}
.mov-anim .lugar .luz{animation:mvLuz .5s ease-out var(--t3) both}
.mov-anim .lugar .rec{animation:mvRec .8s steps(2) var(--t3) infinite}
.mov-anim .puerta{animation:mvPuerta .5s ease-in-out calc(var(--t2) - .25s) both}
.mov-anim .hq{animation:mvAtras calc(var(--t3) - var(--t2)) ease-in var(--t2) both}
.mov-anim.quieto *{animation:none!important}
.mov-anim.quieto .c1,.mov-anim.quieto .c3{opacity:0}
.mov-anim.quieto .c2{opacity:1}
@keyframes mvCap1{0%,92%{opacity:1}100%{opacity:0}}
@keyframes mvCap2{0%{opacity:0;transform:translateY(6px)}12%,88%{opacity:1;transform:none}100%{opacity:0}}
@keyframes mvIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
@keyframes mvLlega{from{transform:translateX(-260px)}to{transform:none}}
@keyframes mvSale{from{transform:none}to{transform:translateX(150px)}}
@keyframes mvGira{to{transform:rotate(360deg)}}
@keyframes mvCarga{0%{transform:translateX(0);opacity:0}12%{opacity:1}82%{transform:translateX(var(--x));opacity:1}100%{transform:translateX(calc(var(--x) + 8px));opacity:0}}
@keyframes mvPaso{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
@keyframes mvRuta{to{stroke-dashoffset:-26}}
@keyframes mvLuz{from{opacity:.15}to{opacity:1}}
@keyframes mvRec{50%{opacity:.2}}
@keyframes mvPuerta{from{transform:scaleY(1)}to{transform:scaleY(.12)}}
@keyframes mvAtras{to{transform:translateX(-16px);opacity:.8}}
`;
  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('mov-css')) return;
    const st = document.createElement('style');
    st.id = 'mov-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- Dibujos de vehículos (de perfil, mirando a la derecha; caja 100 x 44) ---------- */
  const rueda = (x) => `<g class="rueda"><circle cx="${x}" cy="35" r="7.2" fill="#0a0c10"/><circle cx="${x}" cy="35" r="3.4" fill="#8b95a8"/><path d="M${x - 3.2} 35h6.4M${x} 31.8v6.4" stroke="#3a4252" stroke-width="1.3"/></g>`;
  // Texto que cabe en un ancho (se aprieta si el nombre es largo)
  const rotulo = (txt, x, y, w, size, color, weight) => {
    const s = String(txt || '').toUpperCase().slice(0, 24);
    const ancho = s.length * size * 0.56;
    const fit = ancho > w ? ` textLength="${w}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="'Barlow Condensed','Arial Narrow',sans-serif" font-weight="${weight || 800}" font-size="${size}" fill="${color}"${fit}>${esc(s)}</text>`;
  };
  const LOGO_APP = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k || 1})"><path d="M0 -4.6a3.6 3.6 0 0 1 3.6 3.6c0 2.6-3.6 6.2-3.6 6.2s-3.6-3.6-3.6-6.2A3.6 3.6 0 0 1 0 -4.6z" fill="#0b1015"/><circle cy="-1" r="1.3" fill="#2dd4bf"/></g>`;
  // Letrero de techo de la aplicación
  const techoApp = (x) => `<g><rect x="${x - 12}" y="1.5" width="24" height="6" rx="2" fill="#2dd4bf"/>${rotulo(APP, x, 6.4, 20, 5.4, '#0b1015', 700)}</g>`;
  function sedan(o) {
    const c = o.color || '#3a4458';
    return `<path d="M4 34V25q0-4.5 4.5-5.4L22 18l11-8.6q2-1.5 4.5-1.5H63q3 0 5 1.8L79 18l11.5 1.6Q96 20.6 96 26v8z" fill="${c}"/>
      <path d="M30 18.2l7.6-6.6q1-.8 2.3-.8H49v7.4zM52 18.2v-7.4h10q1.6 0 2.6.9l7.2 6.5z" fill="#9cc3e6" opacity=".7"/>
      <path d="M4 27h92" stroke="#00000033" stroke-width="1"/>${o.franja ? `<path d="M6 29h88" stroke="${o.franja}" stroke-width="2.2"/>` : ''}
      ${o.nombre ? rotulo(o.nombre, 50, 26, 40, 6.6, o.tinta || '#0d0f14') : ''}
      <rect x="90" y="21" width="5" height="3" rx="1" fill="#ffe08a"/><rect x="4" y="22" width="3" height="3" rx="1" fill="#ff5b5b"/>
      ${o.app ? techoApp(50) : ''}${rueda(24)}${rueda(76)}`;
  }
  function minivan(o) {
    const c = o.color || '#4b5568';
    return `<path d="M4 34V14q0-7 7-7h56q3 0 5 1.6L88 19q8 1 8 7v8z" fill="${c}"/>
      <path d="M11 10.5h13v8.5H11zM27 10.5h14v8.5H27zM44 10.5h16v8.5H44zM63 10.5h4q2 0 3.4 1.3l7 7.2H63z" fill="#9cc3e6" opacity=".7"/>
      <path d="M43 20v13" stroke="#00000033"/>${o.franja ? `<path d="M5 27h90" stroke="${o.franja}" stroke-width="2.2"/>` : ''}
      ${o.nombre ? rotulo(o.nombre, 40, 30.5, 54, 7, o.tinta || '#0d0f14') : ''}
      <rect x="90" y="22" width="5" height="3" rx="1" fill="#ffe08a"/>${o.app ? techoApp(36) : ''}${rueda(22)}${rueda(78)}`;
  }
  function pickup(o) {
    const c = o.color || '#c98b2b';
    return `<rect x="3" y="21" width="49" height="13" rx="1.5" fill="${c}"/><path d="M50 34V12q0-4 4-4h15q2.6 0 4.2 2l9 9.5H93q4 0 4 4V34z" fill="${c}"/>
      <path d="M57 11h11q1.4 0 2.3 1l6.4 7H57z" fill="#9cc3e6" opacity=".7"/>
      <rect x="8" y="13" width="15" height="9" rx="1.5" fill="#1b2029" stroke="#ffb020" stroke-width="1"/><rect x="25" y="15" width="12" height="7" rx="1.5" fill="#262d3a" stroke="#ffb020" stroke-width="1"/>
      <rect x="39" y="12" width="9" height="10" rx="1.5" fill="#1b2029" stroke="#8b95a8" stroke-width="1"/>
      ${o.franja ? `<path d="M4 28h92" stroke="${o.franja}" stroke-width="2"/>` : ''}${o.nombre ? rotulo(o.nombre, 74, 27, 34, 6, o.tinta || '#0d0f14') : ''}
      <rect x="91" y="22" width="5" height="3" rx="1" fill="#ffe08a"/>${rueda(22)}${rueda(79)}`;
  }
  function furgon(o) {
    const c = o.color || '#e9edf5';
    return `<rect x="3" y="4" width="71" height="30" rx="3.5" fill="${c}"/><path d="M72 34V13h12q2.4 0 3.8 1.8L96 25v9z" fill="${c}"/>
      <path d="M76 16h7.6q1.2 0 2 1l5 6.6H76z" fill="#9cc3e6" opacity=".75"/>
      ${o.pasajeros ? '<path d="M8 9h12v8H8zM23 9h12v8H23zM38 9h12v8H38zM53 9h13v8H53z" fill="#9cc3e6" opacity=".7"/>' : ''}
      ${o.ob ? '<path d="M24 4l6-6h3l-6 6M27 -2.5a7 3 0 1 0 14 0a7 3 0 1 0 -14 0" fill="#c8ced9" stroke="#8b95a8" stroke-width=".8"/>' : ''}
      ${o.franja ? `<path d="M3 ${o.pasajeros ? 27 : 29}h93" stroke="${o.franja}" stroke-width="3"/>` : ''}
      ${o.nombre ? rotulo(o.nombre, 38.5, o.pasajeros ? 24.5 : 21, 62, o.pasajeros ? 7.6 : 10.5, o.tinta || '#0d0f14') : ''}
      <rect x="91" y="26" width="5" height="3" rx="1" fill="#ffe08a"/>${rueda(19)}${rueda(80)}`;
  }
  // Dibujo de un vehículo: { tipo: 'sedan'|'minivan'|'pickup'|'furgon', app, nombre, ob, pasajeros }
  function dibujo(o, w, h) {
    const f = { sedan, minivan, pickup, furgon }[o.tipo] || sedan;
    return `<svg viewBox="0 -4 100 48" width="${w || 100}" height="${h || 48}" aria-hidden="true" focusable="false">${f(o)}</svg>`;
  }
  // Cómo se dibuja cada vehículo de la flota (por subtipo) y cada opción de la aplicación
  const SUB_DIB = { sedan: 'sedan', camioneta: 'pickup', van_pasajeros: 'furgon', furgon: 'furgon', ob_chica: 'furgon', ob_grande: 'furgon', ob_uhd: 'furgon' };
  function vehPropio(type, nombre) {
    const it = (G() && G().CATALOG[type]) || {};
    const sub = it.subtipo || 'furgon';
    return { tipo: SUB_DIB[sub] || 'furgon', nombre, franja: '#ff3b3b', color: sub === 'camioneta' ? '#e9edf5' : sub === 'sedan' ? '#d9dee7' : '#eef1f6',
      tinta: '#0d0f14', ob: /^ob/.test(sub), pasajeros: sub === 'van_pasajeros' };
  }
  const OP_DIB = { economico: { tipo: 'sedan', app: true, color: '#3a4458' }, xl: { tipo: 'minivan', app: true, color: '#556079' }, carga: { tipo: 'pickup', color: '#c98b2b' } };

  /* ---------- Sección de la preparación ---------- */
  let ultimo = null; // { ctx, cid, staffIds, equipIds } para volver a dibujar al elegir una opción
  // Lo que se cobra (con el tope del pago) y qué parte del pago es
  const cobroDe = (tp) => (tp && typeof tp.cobro === 'number' ? tp.cobro : tp ? tp.total : 0);
  const pctTxt = (tp) => { const p = tp && typeof tp.pctPago === 'number' ? tp.pctPago : 0; return t('pct', { n: num(p >= 1 || p === 0 ? Math.round(p) : Math.round(p * 10) / 10) }); };
  function plan(S, c, staffIds, equipIds) {
    try { return G() && G().planTransporte && S && c ? G().planTransporte(S, c, staffIds || [], equipIds || []) : null; } catch (e) { return null; }
  }
  function opcionHtml(o, tp, cid) {
    const sel = o.key === tp.eleccion;
    const valid = tp.opciones.filter((x) => x.ok);
    const barata = valid.length ? valid.reduce((a, x) => (x.precio < a.precio ? x : a)) : null;
    const det = o.key === 'carga'
      ? [nFletes(o.fletes), o.autos ? nAutos(o.autos) : '', t('hasta', { n: num(o.carga) })].filter(Boolean).join(' · ')
      : [nAutos(o.autos), t('asientos', { n: num(o.asientos) }), t('hasta', { n: num(o.carga) })].join(' · ');
    const motivo = o.ok ? det : t(o.motivo === 'grande' ? 'no_grande' : 'no_muchos');
    return `<button type="button" class="mov-op ${sel ? 'sel' : ''}" data-mov-op="${esc(o.key)}" data-mov-cid="${esc(cid)}" role="radio" aria-checked="${sel}" ${o.ok ? '' : 'disabled'}>
      <span class="rd" aria-hidden="true"></span>${dibujo(OP_DIB[o.key], 52, 24)}
      <span class="tx"><b>${esc(t('op_' + o.key))}</b>${barata && barata.key === o.key && valid.length > 1 ? `<span class="tag2">${esc(t('barato'))}</span>` : ''}<small>${esc(motivo)}</small></span>
      <span class="pr"><b>${esc(money(o.precio))}</b><small>${esc(t('min', { n: num(o.eta) }))}</small></span></button>`;
  }
  function seccionHtml(ctx, c, tp, equipIds) {
    const S = estadoDe(ctx);
    if (!tp) return '';
    const head = (tot, sub) => `<div class="mov-hd"><span class="mov-ic">${dibujo({ tipo: 'sedan', color: '#556079' }, 22, 11)}</span>
      <span class="mov-ttl">${esc(t('titulo'))}<span class="mov-sub">${esc(sub)}</span></span><b class="mov-tot num">${tot}</b></div>`;
    if (tp.incluido) return `<div class="mov" id="movSec">${head('', t('incluido'))}</div>`;
    // Lo que llevas: personas, bultos y los dibujos de los equipos
    const A = ctx && ctx.A;
    const eq = (S && S.equip ? S.equip.filter((e) => (equipIds || []).includes(e.id)) : []).filter((e) => { try { return G().bultosDe(G().CATALOG[e.type]) > 0; } catch (x) { return false; } });
    const gear = A && A.item && eq.length ? `<div class="mov-gear" aria-hidden="true">${eq.slice(0, 11).map((e) => { try { return A.item(e.type, 26); } catch (x) { return ''; } }).join('')}${eq.length > 11 ? `<span class="mas">+${eq.length - 11}</span>` : ''}</div>` : '';
    const load = `<div class="mov-load"><span class="mov-chip">${esc(nPers(tp.personas))}</span><span class="mov-chip">${esc(nBult(tp.bultos))}</span>${tp.grande > 2 ? `<span class="mov-chip big">${esc(t('grande'))}</span>` : ''}</div>`;
    const flota = (tp.vehiculos || []).map((v) => `<div class="mov-veh">${dibujo(vehPropio(v.type, nombreDe(ctx)), 70, 31)}
      <span class="tx"><b>${esc(nombreEquipo(v))}</b><small>${esc(t('asientos', { n: num(v.asientos) }))} · ${esc(t('hasta', { n: num(v.carga) }))} · ${esc(t('maneja'))}</small></span>
      <span class="p">${esc(t('comb', { m: money(v.combustible) }))}</span></div>`).join('');
    let app = '';
    if (tp.opciones && tp.opciones.length) {
      const dest = c && c.client ? TL(c.client) : '';
      const resto = tp.vehiculos.length ? `<div class="mov-rest">${esc(t('resto', { p: nPers(tp.resto.personas), b: nBult(tp.resto.bultos) }))}</div>` : '';
      app = `<div class="mov-app" role="radiogroup" aria-label="${esc(t('pedir'))}">
        <div class="mov-app-hd"><span class="mov-logo">${`<svg viewBox="-6 -6 12 12" width="16" height="16" aria-hidden="true">${LOGO_APP(0, 0, 1)}</svg>`}</span><b>${esc(APP)}</b>
          <span class="q">${esc(t('pedir'))}${dest ? ' · ' + esc(t('a', { lugar: dest })) : ''}</span></div>${resto}
        ${tp.opciones.map((o) => opcionHtml(o, tp, c.id)).join('')}</div>`;
    }
    const soloFlota = tp.soloFlota ? `<div class="mov-ok">${esc(t('todo_flota'))}</div>` : '';
    const cobro = cobroDe(tp);
    const cubre = tp.total > cobro ? `<div class="mov-incl">${esc(t('cubre', { m: money(tp.total - cobro) }))}</div>` : '';
    return `<div class="mov" id="movSec">${head(esc(money(cobro)), t('ida', { km: num(tp.km) }) + ' · ' + pctTxt(tp))}${load}${gear}${flota}${soloFlota}${app}${cubre}</div>`;
  }
  function seccionPrep(ctx, c, staffIds, equipIds) {
    ensureCss();
    const S = estadoDe(ctx);
    const tp = plan(S, c, staffIds, equipIds);
    if (!tp) return '';
    ultimo = { ctx, cid: c.id, staffIds: (staffIds || []).slice(), equipIds: (equipIds || []).slice() };
    return seccionHtml(ctx, c, tp, equipIds);
  }
  function resumenPrep(S, c, staffIds, equipIds) {
    const tp = plan(S, c, staffIds, equipIds);
    if (!tp || tp.incluido) return '';
    return ` · <span id="movRes">${resumenHtml(tp)}</span>`;
  }
  function resumenHtml(tp) {
    return `${esc(t('res'))} <b class="num">${esc(money(cobroDe(tp)))}</b> · ${esc(pctTxt(tp))}`;
  }
  // Tocar una opción de la aplicación: se guarda en el contrato y se vuelve a dibujar solo esta sección
  function alTocar(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-mov-op]');
    if (!b || b.disabled || !ultimo) return;
    e.preventDefault(); e.stopPropagation();
    const ctx = ultimo.ctx, S = estadoDe(ctx);
    const c = S && S.contracts ? S.contracts.find((x) => String(x.id) === b.dataset.movCid) : null;
    if (!c) return;
    c.movil = b.dataset.movOp;
    try { if (ctx.save) ctx.save(); } catch (x) { /* se guarda después */ }
    try { if (ctx.snd) ctx.snd('tap'); } catch (x) { /* sin sonido */ }
    const tp = plan(S, c, ultimo.staffIds, ultimo.equipIds);
    const sec = document.getElementById('movSec');
    if (sec && tp) sec.outerHTML = seccionHtml(ctx, c, tp, ultimo.equipIds);
    const res = document.getElementById('movRes');
    if (res && tp) res.innerHTML = resumenHtml(tp);
  }
  if (typeof document !== 'undefined') document.addEventListener('click', alTocar, true);

  /* ---------- Resultado ---------- */
  function filaResultado(r, M) {
    const x = r && r.transporte;
    if (!x || !(x.total > 0)) return '';
    const fmt = typeof M === 'function' ? M : money;
    const partes = [];
    if (x.vehiculos && x.vehiculos.length) partes.push(t('res_flota'));
    if (x.eleccion && x.app > 0) partes.push(APP + ' ' + t('op_' + x.eleccion));
    const det = [partes.join(' + '), t('ida', { km: num(x.km) })].filter(Boolean).join(' · ');
    return `<tr><td>${esc(t('res'))}<div class="small muted" style="font-size:11.5px">${esc(det)}</div></td><td class="down">-${esc(fmt(x.total))}</td></tr>`;
  }

  /* ---------- Escena al salir al aire ---------- */
  const LUGAR_DE = (type) => {
    try { if (root.PlanEvento && root.PlanEvento.lugar) return root.PlanEvento.lugar(type); } catch (e) { /* abajo */ }
    if (/barrial|ligapro|final|internacional/.test(type)) return 'futbol';
    if (/boxeo|lucha/.test(type)) return 'ring';
    if (/misa|funeral/.test(type)) return 'iglesia';
    if (/concierto/.test(type)) return 'concierto';
    if (/lanzamiento/.test(type)) return 'escenario';
    if (/irl/.test(type)) return 'calle';
    return 'salon';
  };
  function lugarSvg(v) {
    const base = '<rect x="244" y="156" width="116" height="4" fill="#1b2130"/>';
    if (v === 'futbol') return `${base}<path d="M250 156q2-34 52-36q50 2 52 36z" fill="#1c2331"/><path d="M258 156q3-24 44-26q41 2 44 26z" fill="#141a26"/>
      <g class="luz"><path d="M256 156V100M348 156V100" stroke="#2a3242" stroke-width="2.4"/><rect x="249" y="94" width="14" height="7" rx="1.5" fill="#fff6c8"/><rect x="341" y="94" width="14" height="7" rx="1.5" fill="#fff6c8"/>
      <path d="M256 101l26 40h-52zM348 101l-26 40h52z" fill="#fff6c8" opacity=".09"/><path d="M262 150q40-14 80 0" stroke="#2ecc71" stroke-width="3" opacity=".8" fill="none"/></g>`;
    if (v === 'iglesia') return `${base}<path d="M262 156v-46l20-16 20 16v46z" fill="#1c2331"/><path d="M302 156v-30h40v30z" fill="#182030"/><path d="M276 92l6-34 6 34z" fill="#1c2331"/>
      <path d="M282 50v12M277 55h10" stroke="#8b95a8" stroke-width="2"/><g class="luz"><path d="M276 156v-18q6-9 12 0v18z" fill="#ffb020" opacity=".85"/><circle cx="282" cy="112" r="5" fill="#ffd36b"/>
      <rect x="310" y="134" width="8" height="10" rx="4" fill="#ffd36b" opacity=".8"/><rect x="326" y="134" width="8" height="10" rx="4" fill="#ffd36b" opacity=".8"/></g>`;
    if (v === 'ring' || v === 'concierto') return `${base}<path d="M252 156q0-40 50-42q50 2 50 42z" fill="#1c2331"/><path d="M262 156v-20h80v20z" fill="#141a26"/>
      <g class="luz"><path d="M272 120l-14 36h28zM302 116l-12 40h24zM332 120l-14 36h28z" fill="${v === 'ring' ? '#4da3ff' : '#ff3bb0'}" opacity=".16"/>
      <circle cx="272" cy="121" r="2.6" fill="#fff"/><circle cx="302" cy="117" r="2.6" fill="#fff"/><circle cx="332" cy="121" r="2.6" fill="#fff"/>
      <rect x="282" y="140" width="40" height="5" rx="1.5" fill="${v === 'ring' ? '#ff3b3b' : '#ffb020'}"/></g>`;
    if (v === 'escenario') return `${base}<path d="M256 156v-44h92v44z" fill="#1c2331"/><path d="M256 112l46-14 46 14z" fill="#222b3b"/>
      <g class="luz"><rect x="266" y="122" width="72" height="26" rx="2" fill="#4da3ff" opacity=".3"/><path d="M270 112l-6 44M302 108v48M334 112l6 44" stroke="#fff" stroke-opacity=".18" stroke-width="5"/>
      <circle cx="270" cy="113" r="2.4" fill="#fff"/><circle cx="302" cy="109" r="2.4" fill="#fff"/><circle cx="334" cy="113" r="2.4" fill="#fff"/></g>`;
    if (v === 'calle') return `${base}<path d="M250 156v-52h30v52zM284 156v-70h26v70zM314 156v-44h36v44z" fill="#1c2331"/>
      <g class="luz"><path d="M258 112h6v6h-6zM268 112h6v6h-6zM290 94h6v6h-6zM300 108h6v6h-6zM322 120h6v6h-6zM334 120h6v6h-6z" fill="#ffd36b" opacity=".85"/>
      <path d="M346 156v-34q0-4-4-4h-6" stroke="#2a3242" stroke-width="2" fill="none"/><circle cx="335" cy="119" r="2.6" fill="#fff6c8"/></g>`;
    // salón (boda, prensa, graduación)
    return `${base}<path d="M254 156v-46h96v46z" fill="#1c2331"/><path d="M250 110l52-18 52 18z" fill="#222b3b"/>
      <g class="luz"><path d="M290 156v-22q12-14 24 0v22z" fill="#ffb020" opacity=".8"/><path d="M258 116q22 9 44 0q22 9 44 0" stroke="#ffd36b" stroke-dasharray="1.5 4" stroke-width="2.4" fill="none"/>
      <rect x="264" y="128" width="12" height="12" rx="2" fill="#ffd36b" opacity=".7"/><rect x="328" y="128" width="12" height="12" rx="2" fill="#ffd36b" opacity=".7"/></g>`;
  }
  // Persona que camina cargando algo (cosa: 'maleta' | 'camara' | 'tripode')
  function persona(x, d, dx, cosa, polo) {
    const carga = cosa === 'camara'
      ? '<rect x="4" y="-25" width="13" height="8" rx="1.5" fill="#1b2029" stroke="#8b95a8" stroke-width=".8"/><rect x="16" y="-23.5" width="4" height="5" rx="1" fill="#2a3242"/><circle cx="10" cy="-21" r="2" fill="#4da3ff"/>'
      : cosa === 'tripode' ? '<path d="M8 -30l-5 26M8 -30l1 26M8 -30l6 26" stroke="#c8ced9" stroke-width="1.4"/>'
        : '<rect x="3" y="-17" width="15" height="11" rx="2" fill="#151922" stroke="#ffb020" stroke-width="1"/><path d="M8 -17v-2h5v2" stroke="#ffb020" stroke-width="1" fill="none"/>';
    return `<g class="per" style="--d:${d}s;--x:${dx}px"><g transform="translate(${x} 156)">
      <path class="pi" d="M-1 -12v12" stroke="#2a3242" stroke-width="3.2" stroke-linecap="round"/><path class="pd" d="M3 -12v12" stroke="#2a3242" stroke-width="3.2" stroke-linecap="round"/>
      <rect x="-3.5" y="-26" width="10" height="15" rx="3" fill="${polo}"/><circle cx="1.5" cy="-30.5" r="4.2" fill="#d9a77c"/><path d="M-2.6 -32q4-5 8.2 0" fill="#1b1b1b"/>${carga}</g></g>`;
  }
  // Qué vehículo sale en la escena: el más grande de tu flota o el de la aplicación
  function vehiculosEscena(tp, nombre) {
    const out = [];
    const prop = (tp && tp.vehiculos) || [];
    const orden = prop.slice().sort((a, b) => (b.carga + b.asientos) - (a.carga + a.asientos));
    if (orden[0]) out.push(Object.assign(vehPropio(orden[0].type, nombre), { propio: true }));
    if (tp && tp.eleccion && tp.app > 0) out.push(Object.assign({}, OP_DIB[tp.eleccion], { propio: false }));
    if (!out.length) out.push(Object.assign({}, OP_DIB.economico, { propio: false }));
    return out.slice(0, 2);
  }
  function escenaSvg(o) {
    const nombre = o.nombre;
    const vs = o.vehiculos;
    const v0 = vs[0], v1 = vs[1];
    const estrellas = [[20, 14], [64, 30], [118, 10], [170, 26], [212, 12], [262, 34], [300, 16], [340, 28], [146, 44], [88, 52]]
      .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 0.9 : 1.3}" fill="#c8d3e6" opacity="${0.35 + (i % 4) * 0.15}"/>`).join('');
    const quienes = [['maleta', '#ff3b3b'], ['camara', '#4da3ff'], ['tripode', '#2ecc71']].slice(0, Math.max(1, Math.min(3, o.personas || 1)));
    // Cada uno hace 2 viajes del garaje al vehículo (ANIM.viaje s cada uno), uno detrás del otro
    const gente = quienes.map((q, i) => persona(56 + i * 6, o.t0 + ANIM.ini + i * ANIM.entre, 64 - i * 4, q[0], q[1])).join('');
    const veh = (v, x, cls, k) => `<g class="${cls}"><g transform="translate(${x} ${116 - (k - 1) * 40}) scale(${k})">${({ sedan, minivan, pickup, furgon }[v.tipo] || sedan)(v)}</g></g>`;
    const llega = v0.propio ? '' : 'llega';
    return `<svg viewBox="0 0 360 200" role="img" aria-label="${esc(t('anim'))}">
      <defs><linearGradient id="mvCielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090c13"/><stop offset="1" stop-color="#1a2233"/></linearGradient>
        <linearGradient id="mvLuzG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb020" stop-opacity=".95"/><stop offset="1" stop-color="#ff7a1a" stop-opacity=".55"/></linearGradient></defs>
      <rect width="360" height="200" fill="url(#mvCielo)"/>${estrellas}<circle cx="318" cy="34" r="11" fill="#e9edf5" opacity=".85"/><circle cx="313" cy="31" r="11" fill="#141b29"/>
      <path d="M0 160V128h16v-12h14v20h12v-28h18v32h14v-16h20v24h18v-36h16v40h20v-22h14v10h18v-30h20v42h16v-18h22v20h18v-34h14v38h22v-14h12v20z" fill="#121825"/>
      <g class="lugar">${lugarSvg(o.lugar)}<g class="luz"><circle class="rec" cx="350" cy="88" r="3.4" fill="#ff3b3b"/></g></g>
      <g class="hq"><rect x="6" y="84" width="112" height="76" fill="#1f2635"/><path d="M2 86l60-20 60 20z" fill="#2a3242"/>
        <rect x="12" y="68" width="100" height="16" rx="2.5" fill="#0d0f14" stroke="#ff3b3b" stroke-width="1.4"/><circle cx="20" cy="76" r="2.4" fill="#ff3b3b"/>
        ${rotulo(nombre, 64, 80.5, 80, 11, '#e9edf5')}
        <rect x="22" y="102" width="74" height="58" fill="url(#mvLuzG)"/><rect x="28" y="128" width="18" height="12" rx="1.5" fill="#151922"/><rect x="66" y="132" width="22" height="8" rx="1.5" fill="#151922"/>
        <g class="puerta" style="transform-box:fill-box;transform-origin:top"><path d="M22 102h74v18H22z" fill="#384157"/><path d="M22 106h74M22 110h74M22 114h74" stroke="#2a3242"/></g></g>
      <rect x="0" y="160" width="360" height="40" fill="#141821"/><path d="M0 160h360" stroke="#2a3242" stroke-width="2"/>
      <path class="linea" d="M0 182h360" stroke="#3a4252" stroke-width="2.4" stroke-dasharray="14 12"/>
      ${gente}
      ${v1 ? `<g class="${v1.propio ? '' : 'llega'}">${veh(v1, 104, 'sale2', 0.82)}</g>` : ''}
      <g class="${llega}">${veh(v0, 124, 'sale', 1)}</g>
    </svg>`;
  }
  // Tiempos de la escena (s): ~3,3 s con tu vehículo, ~3,7 s si primero llega el auto de la aplicación
  const ANIM = { llega: 0.45, ini: 0.1, entre: 0.22, viaje: 0.7, ruta: 0.95, fin: 0.6 };
  let animando = false;
  function animar(ctx, listo) {
    let hecho = false;
    const fin = () => { if (hecho) return; hecho = true; animando = false; try { listo(); } catch (e) { if (root.console) console.error('[movilizacion] listo', e); } };
    try {
      if (typeof document === 'undefined' || animando) { fin(); return; }
      // En las pruebas automáticas (navegador controlado) no hay escena, salvo que la prueba la pida
      if (root.navigator && root.navigator.webdriver && root.__ENVIVO_ANIM_MOVIL !== true) { fin(); return; }
      const S = estadoDe(ctx);
      const ev = S && S.currentEvent;
      if (!ev) { fin(); return; }
      ensureCss();
      const tp = ev.transporte || null;
      const c = ev.contract || {};
      const nombre = nombreDe(ctx);
      const vehiculos = vehiculosEscena(tp, nombre);
      const quieto = reduceMotion();
      const t0 = vehiculos[0].propio ? 0 : ANIM.llega; // el auto de la aplicación llega primero
      const nGente = Math.max(1, Math.min(3, tp ? tp.personas : 1));
      const t2 = t0 + ANIM.ini + (nGente - 1) * ANIM.entre + 2 * ANIM.viaje + 0.05; // cargado: sale
      const t3 = t2 + ANIM.ruta, total = t3 + ANIM.fin;
      const el = document.createElement('div');
      el.className = 'mov-anim' + (quieto ? ' quieto' : '');
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', t('anim'));
      el.style.setProperty('--t0', t0 + 's'); el.style.setProperty('--trip', ANIM.viaje + 's'); el.style.setProperty('--t2', t2 + 's'); el.style.setProperty('--t3', t3 + 's');
      const lugar = TL(c.client || '');
      el.innerHTML = `<div class="mov-esc">${escenaSvg({ nombre, vehiculos, lugar: LUGAR_DE(c.type || ''), personas: tp ? tp.personas : 1, t0 })}</div>
        <div class="cap"><span class="c1">${esc(t('cargando'))}<small>${esc(vehiculos.map((v) => (v.propio ? nombre : APP + ' ' + t('op_' + (Object.keys(OP_DIB).find((k) => OP_DIB[k].tipo === v.tipo && OP_DIB[k].color === v.color) || 'economico')))).join(' + '))}</small></span>
          <span class="c2">${esc(t('rumbo', { lugar, km: num(tp ? tp.km : 0) }))}${tp && tp.total > 0 ? `<small>${esc(t('res'))} ${esc(money(tp.total))} · ${esc(t('ida', { km: num(tp.km) }))}</small>` : ''}</span>
          <span class="c3" style="color:#ff6b6b">● ${esc(t('llego'))}</span></div>
        <div class="skip">${esc(t('saltar'))}</div>`;
      animando = true;
      document.body.appendChild(el);
      let timer = null;
      const cerrar = () => {
        if (timer) clearTimeout(timer);
        el.removeEventListener('click', cerrar);
        // La pantalla del evento en vivo se dibuja debajo y la escena se desvanece encima
        fin();
        el.classList.add('fin');
        setTimeout(() => { try { el.remove(); } catch (e) { /* ya no está */ } }, quieto ? 0 : 300);
      };
      el.addEventListener('click', cerrar);
      timer = setTimeout(cerrar, (quieto ? 1 : total) * 1000);
    } catch (e) {
      if (root.console) console.error('[movilizacion] animar', e);
      fin();
    }
  }

  /* ---------- Flota (fila de Inicio) ---------- */
  function tarjetaFlota(ctx) {
    ensureCss();
    const S = estadoDe(ctx);
    if (!S || !G() || !G().flota) return '';
    const fl = G().flota(S);
    const nombre = nombreDe(ctx);
    const mantTot = fl.reduce((a, v) => a + (v.mant || 0), 0);
    if (!fl.length) {
      return `<div class="card mov-flota"><h3>${esc(t('vacia_h'))}</h3>
        <div class="vacia">${dibujo(OP_DIB.economico, 92, 42)}<p class="small muted" style="margin:0">${esc(t('vacia'))}</p></div>
        <button class="btn sm" data-ext="flota" data-acc="tienda">${esc(t('tienda'))}</button></div>`;
    }
    const filas = fl.map((v) => {
      const cond = Math.max(0, Math.min(100, Math.round(v.condition)));
      const tono = cond < 40 ? 'red' : cond < 60 ? 'amber' : '';
      return `<div class="mov-fv">${dibujo(vehPropio(v.type, nombre), 84, 38)}
        <div class="tx"><b>${esc(nombreEquipo(v))}</b><small>${esc(t('asientos', { n: num(v.asientos) }))} · ${esc(t('hasta', { n: num(v.carga) }))} · ${esc(t('dia', { m: money(v.mant) }))}</small>
          <div class="bar ${tono}"><i style="width:${cond}%"></i></div>
          <small>${v.enTaller ? `<span class="taller">${esc(t('taller'))}</span> · ` : ''}${esc(t('estado', { n: num(cond) }))}</small>
          ${v.enTaller || cond < 50 ? `<div><button class="btn sm" data-ext="flota" data-acc="reparar" data-id="${v.id}">${esc(t('reparar', { m: money(v.reparar) }))}</button></div>` : ''}</div></div>`;
    }).join('');
    return `<div class="card mov-flota"><h3>${esc(t(fl.length === 1 ? 'veh1' : 'vehs', { n: num(fl.length), m: money(mantTot) }))}</h3>${filas}
      <button class="btn sm" data-ext="flota" data-acc="tienda">${esc(t('tienda'))}</button></div>`;
  }
  function clicFlota(ctx, acc, el) {
    if (acc === 'tienda') {
      const nav = document.querySelector('nav button[data-tab="bodega"]');
      if (nav) nav.click();
      // Abre la categoría de vehículos de la tienda (si la pantalla la tiene)
      setTimeout(() => { const b = document.querySelector('[data-act="cat"][data-k="vehicle"]'); if (b) b.click(); if (b && b.scrollIntoView) try { b.scrollIntoView({ block: 'center' }); } catch (e) { /* nada */ } }, 30);
      return;
    }
    if (acc === 'reparar') {
      const S = estadoDe(ctx);
      const id = Number(el && el.dataset ? el.dataset.id : NaN);
      const r = G().repair(S, id);
      try { if (ctx.toast) ctx.toast(TL(r.msg)); } catch (e) { /* nada */ }
      try { if (ctx.save) ctx.save(); if (ctx.render) ctx.render(); } catch (e) { /* nada */ }
    }
  }
  const INICIO = { id: 'flota', orden: 12, titulo: () => t('flota'), tarjeta: (ctx) => tarjetaFlota(ctx), clic: (ctx, acc, el) => clicFlota(ctx, acc, el) };
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === 'flota')) root.EnVivoInicio.push(INICIO);

  const API = { seccionPrep, resumenPrep, animar, filaResultado, tarjetaFlota, t, dibujo, vehPropio, TX, APP, ensureCss };
  root.Movilizacion = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
