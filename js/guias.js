/* =========================================================
   EN VIVO Tycoon — Guías cortas de cada sección ("toca aquí")
   La primera vez que el jugador abre una sección sale un recorrido de 2 a 4 toques con el mismo aspecto que la
   guía del primer evento (js/guia.js): mano que señala, foco, burbuja de Don Ramiro y "Saltar guía".
   Cada recorrido se recuerda aparte en este celular (localStorage 'envivo_guias_v1_<id>').

   Recorridos:  bodega · personal · prep (semáforo del personal, desde el 2.º evento) · sede (Inicio → ventana de la sede)
                tienda · online (Liga, Duelos, Desafío, Copa) · flota (tarjeta "Llévame" al preparar, si hay js/movilizacion.js)
   Reglas: solo el elemento señalado se puede tocar (tocarlo pasa al siguiente; en "sede" el primer toque abre la ventana
   de verdad), nunca encima de otra ventana ni durante un evento ni mientras corre la guía del primer evento, se rehace
   sola si la pantalla se vuelve a pintar, nunca se queda pegada (si el elemento no aparece se salta ese paso; si se
   va de la sección se cierra) y respeta prefers-reduced-motion.
   En pruebas automáticas (navigator.webdriver) NO sale, salvo window.__ENVIVO_GUIAS = true o ?guias=1.
   En Inicio → Ayuda agrega el botón "Ver guías otra vez" (borra las marcas).

   API: Guias.estado() → { activa, id, paso, i, n, x, y, visible } · Guias.olvidar() · Guias.terminar()
        Guias.visto(id) · Guias.IDS · Guias.TEXTOS · Guias.PREF
   No necesita contexto de js/ui.js: lee window.__game.state, <main section.on>, #overlay.on, window.Art y
   window.I18N.idioma. Usa el CSS y la mano de js/guia.js (Guia.CSS / Guia.MANO): este archivo va DESPUÉS de guia.js.
   ========================================================= */
(function (root) {
  'use strict';
  const PREF = 'envivo_guias_v1_';
  const ID = 'guias';
  // Orden de prioridad si dos podrían salir a la vez (los de la ventana de preparación primero)
  const ORDEN = ['prep', 'flota', 'bodega', 'personal', 'sede', 'tienda', 'online'];

  /* ---------- Textos (máximo 8 palabras por burbuja) ---------- */
  const TEXTOS = {
    es: { b_reparar: 'Tus equipos se gastan: repara aquí', b_categorias: 'Compra equipos por categoría aquí', b_exclusiva: 'Edición Exclusiva: equipos únicos y mejores',
      p_buscar: 'Busca personal nuevo aquí', p_contratar: 'Contrata: cobra por cada evento',
      e_personal: 'Aquí ves quién va al evento', e_semaforo: 'Verde listo, naranja riesgo, rojo falta', e_marcar: 'Toca personas para llevarlas o no',
      s_abrir: 'Toca aquí para mejorar tu sede', s_mejora: 'Mejora cada parte para subir de nivel', s_mats: 'Materiales: llegan gratis cada día', s_obra: 'Tu equipo de obra construye por días',
      t_creditos: 'Créditos: canjéalos por exclusivos y ayudas', t_cuenta: 'Crea tu cuenta gratis y guarda todo', t_exclusivos: 'Exclusivos: equipos únicos, sin azar',
      o_liga: 'Liga: encargos con tu asociación cada semana', o_duelos: 'Duelos: reta a otra productora', o_desafio: 'Desafío: el mismo reto, una vez al día', o_copa: 'Copa: tu servidor contra los demás',
      f_mov: 'Así llevas a tu gente y equipos', f_app: 'Sin vehículo: pide un auto en Llévame',
      saltar: 'Saltar guía', otra: 'Ver guías otra vez', otra_ok: 'Listo: verás las guías otra vez' },
    en: { b_reparar: 'Your gear wears out: repair here', b_categorias: 'Buy gear by category here', b_exclusiva: 'Exclusive Edition: unique, better gear',
      p_buscar: 'Look for new staff here', p_contratar: 'Hire: they charge per event',
      e_personal: 'Here you see who goes', e_semaforo: 'Green ready, orange risky, red missing', e_marcar: 'Tap people to take them or not',
      s_abrir: 'Tap here to upgrade your HQ', s_mejora: 'Upgrade each part to level up', s_mats: 'Materials: free delivery every day', s_obra: 'Your build crew works for days',
      t_creditos: 'Credits: trade them for exclusives and help', t_cuenta: 'Create a free account, save everything', t_exclusivos: 'Exclusives: unique gear, no gambling',
      o_liga: 'League: jobs with your association weekly', o_duelos: 'Duels: challenge another company', o_desafio: 'Challenge: same task for all, daily', o_copa: 'Cup: your server against the rest',
      f_mov: 'How your people and gear travel', f_app: 'No vehicle? Book a car on Llévame',
      saltar: 'Skip guide', otra: 'See guides again', otra_ok: 'Done: you’ll see the guides again' },
    'pt-BR': { b_reparar: 'Seus equipamentos se gastam: conserte aqui', b_categorias: 'Compre equipamentos por categoria aqui', b_exclusiva: 'Edição Exclusiva: equipamentos únicos e melhores',
      p_buscar: 'Procure pessoal novo aqui', p_contratar: 'Contrate: cobra por cada evento',
      e_personal: 'Aqui você vê quem vai', e_semaforo: 'Verde pronto, laranja risco, vermelho falta', e_marcar: 'Toque nas pessoas para levar ou não',
      s_abrir: 'Toque aqui para melhorar sua sede', s_mejora: 'Melhore cada parte para subir de nível', s_mats: 'Materiais: chegam grátis todo dia', s_obra: 'Sua equipe de obra constrói por dias',
      t_creditos: 'Créditos: troque por exclusivos e ajudas', t_cuenta: 'Crie sua conta grátis e salve tudo', t_exclusivos: 'Exclusivos: equipamentos únicos, sem sorteio',
      o_liga: 'Liga: tarefas com sua associação toda semana', o_duelos: 'Duelos: desafie outra produtora', o_desafio: 'Desafio: o mesmo para todos, diário', o_copa: 'Copa: seu servidor contra os outros',
      f_mov: 'Assim viajam sua equipe e equipamentos', f_app: 'Sem veículo? Peça um carro no Llévame',
      saltar: 'Pular guia', otra: 'Ver guias de novo', otra_ok: 'Pronto: você verá as guias de novo' },
    fr: { b_reparar: 'Ton matériel s’use : répare ici', b_categorias: 'Achète du matériel par catégorie ici', b_exclusiva: 'Édition Exclusive : matériel unique et meilleur',
      p_buscar: 'Cherche du personnel ici', p_contratar: 'Embauche : payé à chaque événement',
      e_personal: 'Ici tu vois qui vient', e_semaforo: 'Vert prêt, orange risqué, rouge manque', e_marcar: 'Touche les gens pour les emmener',
      s_abrir: 'Touche ici pour améliorer ton QG', s_mejora: 'Améliore chaque partie pour monter de niveau', s_mats: 'Matériaux : livraison gratuite chaque jour', s_obra: 'Ton équipe de chantier construit en jours',
      t_creditos: 'Crédits : échange-les contre exclusivités et aides', t_cuenta: 'Crée ton compte gratuit, garde tout', t_exclusivos: 'Exclusivités : matériel unique, sans hasard',
      o_liga: 'Ligue : missions avec ton association chaque semaine', o_duelos: 'Duels : défie une autre société', o_desafio: 'Défi : le même pour tous, chaque jour', o_copa: 'Coupe : ton serveur contre les autres',
      f_mov: 'Comment voyagent ton équipe et ton matériel', f_app: 'Pas de véhicule ? Commande sur Llévame',
      saltar: 'Passer le guide', otra: 'Revoir les guides', otra_ok: 'C’est fait : tu reverras les guides' },
    de: { b_reparar: 'Ausrüstung nutzt sich ab: hier reparieren', b_categorias: 'Kaufe Ausrüstung hier nach Kategorie', b_exclusiva: 'Exklusiv-Edition: einzigartige, bessere Ausrüstung',
      p_buscar: 'Suche hier neues Personal', p_contratar: 'Einstellen: Bezahlung pro Event',
      e_personal: 'Hier siehst du, wer mitkommt', e_semaforo: 'Grün bereit, Orange Risiko, Rot fehlt', e_marcar: 'Tippe Leute an, um sie mitzunehmen',
      s_abrir: 'Tippe hier, um deine Zentrale auszubauen', s_mejora: 'Baue jeden Teil aus für die nächste Stufe', s_mats: 'Material: jeden Tag gratis Lieferung', s_obra: 'Dein Bautrupp baut mehrere Tage',
      t_creditos: 'Credits: tausche sie gegen Exklusives und Hilfen', t_cuenta: 'Erstelle ein Gratiskonto und sichere alles', t_exclusivos: 'Exklusives: einzigartige Ausrüstung, kein Glücksspiel',
      o_liga: 'Liga: Aufträge mit deinem Verband, wöchentlich', o_duelos: 'Duelle: fordere eine andere Firma heraus', o_desafio: 'Challenge: gleiche Aufgabe für alle, täglich', o_copa: 'Pokal: dein Server gegen die anderen',
      f_mov: 'So reisen deine Leute und Ausrüstung', f_app: 'Kein Fahrzeug? Bestell ein Auto bei Llévame',
      saltar: 'Anleitung überspringen', otra: 'Anleitungen erneut zeigen', otra_ok: 'Fertig: du siehst die Anleitungen wieder' },
    it: { b_reparar: 'L’attrezzatura si consuma: ripara qui', b_categorias: 'Compra attrezzatura per categoria qui', b_exclusiva: 'Edizione Esclusiva: attrezzatura unica e migliore',
      p_buscar: 'Cerca nuovo personale qui', p_contratar: 'Assumi: si paga a ogni evento',
      e_personal: 'Qui vedi chi viene all’evento', e_semaforo: 'Verde pronto, arancione rischio, rosso manca', e_marcar: 'Tocca le persone per portarle o no',
      s_abrir: 'Tocca qui per migliorare la sede', s_mejora: 'Migliora ogni parte per salire di livello', s_mats: 'Materiali: consegna gratis ogni giorno', s_obra: 'La squadra di cantiere lavora per giorni',
      t_creditos: 'Crediti: scambiali con esclusivi e aiuti', t_cuenta: 'Crea un account gratis e salva tutto', t_exclusivos: 'Esclusivi: attrezzatura unica, senza fortuna',
      o_liga: 'Lega: incarichi con l’associazione ogni settimana', o_duelos: 'Duelli: sfida un’altra produzione', o_desafio: 'Sfida: la stessa per tutti, ogni giorno', o_copa: 'Coppa: il tuo server contro gli altri',
      f_mov: 'Così viaggiano persone e attrezzatura', f_app: 'Senza veicolo? Prenota un’auto su Llévame',
      saltar: 'Salta la guida', otra: 'Rivedi le guide', otra_ok: 'Fatto: rivedrai le guide' },
    ru: { b_reparar: 'Техника изнашивается: чини здесь', b_categorias: 'Покупай технику по категориям здесь', b_exclusiva: 'Эксклюзивное издание: уникальная лучшая техника',
      p_buscar: 'Ищи новый персонал здесь', p_contratar: 'Нанимай: оплата за каждое событие',
      e_personal: 'Здесь видно, кто едет', e_semaforo: 'Зелёный готово, оранжевый риск, красный нехватка', e_marcar: 'Нажимай на людей, чтобы брать их',
      s_abrir: 'Нажми здесь, чтобы улучшить штаб', s_mejora: 'Улучшай каждую часть для нового уровня', s_mats: 'Материалы: бесплатная доставка каждый день', s_obra: 'Бригада строит несколько дней',
      t_creditos: 'Кредиты: меняй на эксклюзивы и помощь', t_cuenta: 'Создай бесплатный аккаунт и сохрани всё', t_exclusivos: 'Эксклюзивы: уникальная техника, без лотерей',
      o_liga: 'Лига: заказы с ассоциацией каждую неделю', o_duelos: 'Дуэли: брось вызов другой компании', o_desafio: 'Задание дня: одно для всех', o_copa: 'Кубок: твой сервер против других',
      f_mov: 'Как едут твои люди и техника', f_app: 'Нет машины? Закажи в Llévame',
      saltar: 'Пропустить обучение', otra: 'Показать подсказки снова', otra_ok: 'Готово: подсказки покажутся снова' },
    tr: { b_reparar: 'Ekipmanın yıpranır: burada tamir et', b_categorias: 'Ekipmanı kategoriye göre buradan al', b_exclusiva: 'Özel Sürüm: eşsiz ve daha iyi ekipman',
      p_buscar: 'Yeni personeli burada ara', p_contratar: 'İşe al: her etkinlik için ücret alır',
      e_personal: 'Kimin gittiğini burada görürsün', e_semaforo: 'Yeşil hazır, turuncu riskli, kırmızı eksik', e_marcar: 'Götürmek için kişilere dokun',
      s_abrir: 'Merkezini geliştirmek için buraya dokun', s_mejora: 'Seviye için her bölümü geliştir', s_mats: 'Malzeme: her gün ücretsiz teslimat', s_obra: 'İnşaat ekibin günlerce çalışır',
      t_creditos: 'Kredi: özel ürünler ve yardımlarla değiştir', t_cuenta: 'Ücretsiz hesap aç, her şeyi kaydet', t_exclusivos: 'Özel ürünler: eşsiz ekipman, şans yok',
      o_liga: 'Lig: derneğinle her hafta görevler', o_duelos: 'Düello: başka bir yapımcıya meydan oku', o_desafio: 'Günün Görevi: herkese aynı, günde bir', o_copa: 'Kupa: sunucun diğerlerine karşı',
      f_mov: 'Ekibin ve ekipmanın böyle gider', f_app: 'Araç yok mu? Llévame’dan araba çağır',
      saltar: 'Rehberi geç', otra: 'Rehberleri tekrar gör', otra_ok: 'Tamam: rehberleri tekrar göreceksin' },
    id: { b_reparar: 'Peralatanmu aus: perbaiki di sini', b_categorias: 'Beli peralatan per kategori di sini', b_exclusiva: 'Edisi Eksklusif: peralatan unik dan lebih baik',
      p_buscar: 'Cari staf baru di sini', p_contratar: 'Rekrut: dibayar tiap acara',
      e_personal: 'Di sini terlihat siapa yang ikut', e_semaforo: 'Hijau siap, oranye berisiko, merah kurang', e_marcar: 'Ketuk orang untuk membawa atau tidak',
      s_abrir: 'Ketuk di sini untuk tingkatkan markasmu', s_mejora: 'Tingkatkan tiap bagian untuk naik level', s_mats: 'Material: kiriman gratis setiap hari', s_obra: 'Tim bangunanmu bekerja beberapa hari',
      t_creditos: 'Kredit: tukar dengan barang eksklusif dan bantuan', t_cuenta: 'Buat akun gratis, simpan semuanya', t_exclusivos: 'Eksklusif: peralatan unik, tanpa undian',
      o_liga: 'Liga: tugas bersama asosiasimu tiap minggu', o_duelos: 'Duel: tantang rumah produksi lain', o_desafio: 'Tantangan: sama untuk semua, sekali sehari', o_copa: 'Piala: servermu melawan yang lain',
      f_mov: 'Begini orang dan peralatanmu berangkat', f_app: 'Tak punya kendaraan? Pesan mobil di Llévame',
      saltar: 'Lewati panduan', otra: 'Lihat panduan lagi', otra_ok: 'Beres: kamu akan lihat panduan lagi' },
    'zh-CN': { b_reparar: '设备会磨损：在这里修理', b_categorias: '在这里按类别买设备', b_exclusiva: '独家版：独特又更好的设备',
      p_buscar: '在这里找新员工', p_contratar: '雇用：每场活动付工资',
      e_personal: '这里看谁去这场活动', e_semaforo: '绿=够，橙=有风险，红=缺人', e_marcar: '点人员选择带不带',
      s_abrir: '点这里升级总部', s_mejora: '升级每个部分来提升等级', s_mats: '材料：每天免费送达', s_obra: '施工队要建好几天',
      t_creditos: '积分：换独家物品和帮助', t_cuenta: '免费注册，保存一切', t_exclusivos: '独家：独特设备，不靠抽奖',
      o_liga: '联赛：每周和协会接任务', o_duelos: '对决：挑战另一家公司', o_desafio: '挑战：大家同一题，每天一次', o_copa: '杯赛：你的服务器对抗其他',
      f_mov: '你的人员和设备这样出发', f_app: '没车？在 Llévame 叫车',
      saltar: '跳过引导', otra: '再看一次引导', otra_ok: '好了：会再显示引导' },
  };

  /* ---------- Utilidades ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const lsGet = (k) => { try { return root.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { root.localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const lsDel = (k) => { try { root.localStorage.removeItem(k); } catch (e) { /* nada */ } };
  const reduce = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const usable = (n) => { if (!n || !n.isConnected || !n.getClientRects().length) return false; const r = n.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const estadoJuego = () => { try { return root.__game ? root.__game.state : null; } catch (e) { return null; } };
  const ov = () => $('#overlay.on');
  function tabActual() { const s = $('main section.on'); return s ? s.id.replace(/^tab-/, '') : ''; }
  function idioma() {
    let c = null;
    try { c = root.I18N ? root.I18N.idioma : null; } catch (e) { c = null; }
    c = String(c || 'es');
    if (TEXTOS[c]) return c;
    const base = c.toLowerCase().split('-')[0];
    return Object.keys(TEXTOS).find((k) => k.toLowerCase().split('-')[0] === base) || 'es';
  }
  const tx = (k) => (TEXTOS[idioma()] || TEXTOS.es)[k] || TEXTOS.es[k] || '';
  // Primer elemento visible que calza con el selector (dentro de r) y con el filtro
  function q(sel, r, filtro) {
    if (!r) return null;
    const xs = r.querySelectorAll(sel);
    for (let i = 0; i < xs.length; i++) { const n = filtro ? filtro(xs[i]) : xs[i]; if (usable(n)) return n; }
    return null;
  }
  // En una pestaña (sin ventana encima) / dentro de la ventana abierta
  const enTab = (t, sel, f) => (ov() || tabActual() !== t ? null : q(sel, $('#tab-' + t), f));
  const enModal = (sel, f) => { const o = ov(); return o ? q(sel, o.querySelector('#modal') || o, f) : null; };

  /* ---------- Recorridos ----------
     tab: pestaña donde sale · modal: selector que debe estar en la ventana abierta (recorrido dentro de una ventana)
     modalOk: ventana propia permitida encima de la pestaña · cuando(S): condición extra · requiere(): módulo presente
     pasos: { k: texto, el: () → elemento a señalar, tocar: true si el toque llega al juego (si no, solo pasa al siguiente) } */
  const R = {
    bodega: { tab: 'bodega', pasos: [
      { k: 'b_reparar', el: () => enTab('bodega', '[data-act="repair"]') },
      { k: 'b_categorias', el: () => enTab('bodega', '.catrow') || enTab('bodega', '#tiendaEq') },
      { k: 'b_exclusiva', el: () => enTab('bodega', '.card.exq') },
    ] },
    personal: { tab: 'personal', pasos: [
      { k: 'p_buscar', el: () => enTab('personal', '[data-act="search-staff"]') || enTab('personal', '.card.buscar') },
      { k: 'p_contratar', el: () => enTab('personal', '[data-act="hire"]') },
    ] },
    // Preparar un evento (desde el segundo: el primero lo lleva js/guia.js)
    prep: { modal: '[data-act="go-live"]', cuando: (s) => s.stats.events >= 1, pasos: [
      { k: 'e_personal', el: () => enModal('.pe-crew .pe-box') || enModal('.pe-crew') },
      { k: 'e_semaforo', el: () => enModal('.pe-crew .pe-row') },
      { k: 'e_marcar', el: () => enModal('label.pick', (n) => (n.querySelector('[data-act="tog-staff"]') ? n : null)) },
    ] },
    flota: { modal: '[data-act="go-live"]', cuando: (s) => s.stats.events >= 1, requiere: () => !!root.Movilizacion, pasos: [
      { k: 'f_mov', el: () => enModal('#movSec .mov-hd') || enModal('#movSec') },
      { k: 'f_app', el: () => enModal('.mov-app') },
    ] },
    // Fila "Sede" de Inicio (abierta) → ventana de mejoras
    sede: { tab: 'inicio', modalOk: '.sd-modal', pasos: [
      { k: 's_abrir', tocar: true, el: () => enTab('inicio', '.pl[data-pl="sede"].abierta .sd-card') },
      { k: 's_mejora', el: () => enModal('.sd-modal .sd-item') },
      { k: 's_mats', el: () => enModal('.sd-modal .sd-mats') },
      { k: 's_obra', el: () => enModal('.sd-modal .sd-obra') },
    ] },
    tienda: { tab: 'tienda', pasos: [
      { k: 't_creditos', el: () => enTab('tienda', '.wallet') || enTab('tienda', '#tv-creditos .tv-cgrid') || enTab('tienda', '#tv-creditos') || enTab('tienda', '.card.r-exclusivo') },
      { k: 't_cuenta', el: () => enTab('tienda', '[data-act="cuenta"][data-modo="registro"]') },
      { k: 't_exclusivos', el: () => enTab('tienda', '#tv-exclusivos .ggrid > .card') || enTab('tienda', '#tv-exclusivos') || enTab('tienda', '.ggrid > .card') },
    ] },
    online: { tab: 'online', pasos: ['liga', 'duelos', 'desafio', 'copa'].map((k) => ({ k: 'o_' + k, el: () => enTab('online', `.onl-tile[data-k="${k}"]`) })) },
  };
  const visto = (id) => !!lsGet(PREF + id);

  /* ---------- Estilos: los de js/guia.js con #guias, más el toque sobre el hueco ---------- */
  const CSS_EXTRA = `
#guias .g-ring{transition:none}   /* sigue al elemento sin retraso al desplazarse */
#guias .g-hit{position:fixed;pointer-events:auto;background:transparent;border:0;padding:0;margin:0;border-radius:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#guias .g-hit:focus-visible{outline:2px solid var(--amber,#ffb020);outline-offset:3px}
#guias .g-bub .g-tx{flex:1;min-width:0}
#guias .g-bub .g-n{flex:none;align-self:flex-end;font:600 11px/1 var(--f-mono,monospace);color:var(--muted,#8b95a8);margin-inline-start:4px}
`;
  const HAND_H = 72, TIP = { x: 20, y: 2 };

  /* ---------- Estado ---------- */
  let el = null, act = null, tip = null, visible = false, obs = null, raf = 0, prog = null, cand = null, intervalo = null;

  function montar() {
    if (!$('#guias-css')) {
      const st = document.createElement('style');
      st.id = 'guias-css';
      st.textContent = String(root.Guia.CSS).replace(/#guia(?![\w-])/g, '#guias') + CSS_EXTRA;
      document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.id = ID;
    el.innerHTML = `<div class="g-blk" data-b="t"></div><div class="g-blk" data-b="b"></div><div class="g-blk" data-b="l"></div><div class="g-blk" data-b="r"></div>
      <button type="button" class="g-hit" hidden></button>
      <div class="g-ring" hidden></div><div class="g-hand" hidden>${root.Guia.MANO || ''}</div>
      <div class="g-bub" role="status" aria-live="polite" hidden><span class="g-por"></span><span class="g-tx"></span><span class="g-n"></span></div>
      <button type="button" class="g-skip" data-guias="saltar"></button>`;
    document.body.appendChild(el);
    try { if (root.Art && root.Art.portrait) el.querySelector('.g-por').innerHTML = root.Art.portrait('ramiro', 42); else el.querySelector('.g-por').hidden = true; } catch (e) { el.querySelector('.g-por').hidden = true; }
    el.querySelector('.g-skip').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cerrar(); });
    el.querySelector('.g-hit').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); siguiente(); });
    el.querySelectorAll('.g-blk').forEach((b) => b.addEventListener('click', (e) => {
      // Tocar fuera no hace nada (solo un aviso en el anillo)
      e.preventDefault(); e.stopPropagation();
      const r = el && el.querySelector('.g-ring');
      if (r && !reduce()) { r.classList.remove('nudge'); void r.offsetWidth; r.classList.add('nudge'); }
    }));
  }
  function blk(k, x, y, w, h) {
    const b = el.querySelector(`.g-blk[data-b="${k}"]`);
    b.hidden = !(w > 0 && h > 0);
    Object.assign(b.style, { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' });
  }
  function ocultar() {
    if (!el) return;
    ['.g-ring', '.g-hand', '.g-bub', '.g-hit'].forEach((s) => { el.querySelector(s).hidden = true; });
    el.querySelectorAll('.g-blk').forEach((b) => { b.hidden = true; });
    el.querySelector('.g-skip').hidden = true;
    tip = null; visible = false;
  }
  function textos(p) {
    const t = el.querySelector('.g-tx');
    if (t.textContent !== tx(p.k)) t.textContent = tx(p.k);
    const n = el.querySelector('.g-n');
    const pos = act.r.pasos.indexOf(p) + 1, tot = act.r.pasos.length;
    const nt = tot > 1 ? pos + '/' + tot : '';
    if (n.textContent !== nt) n.textContent = nt;
    const sk = el.querySelector('.g-skip');
    const st = tx('saltar') + ' ✕';
    if (sk.textContent !== st) sk.textContent = st;
    sk.hidden = false;
    const h = el.querySelector('.g-hit');
    if (h.getAttribute('aria-label') !== tx(p.k)) h.setAttribute('aria-label', tx(p.k));
  }
  // Zona libre para el objetivo: la cabecera fija tapa arriba; abajo la barra de pestañas o el pie fijo de la ventana
  function zona(n) {
    const vh = root.innerHeight;
    const h = $('header');
    const top = h ? Math.max(0, h.getBoundingClientRect().bottom) : 0;
    if (n.closest('#modal')) {
      const pie = $('#modal .preview');
      return { top, bottom: pie && !pie.contains(n) ? pie.getBoundingClientRect().top : vh };
    }
    const nv = $('nav');
    return { top, bottom: nv ? nv.getBoundingClientRect().top : vh };
  }
  function layout(n, p) {
    const vw = root.innerWidth, vh = root.innerHeight;
    let r = n.getBoundingClientRect();
    const z = zona(n);
    if (act.desplazado !== act.i && (r.top < z.top + 4 || r.bottom > z.bottom - 4)) {
      try { n.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); } catch (e) { n.scrollIntoView(); }
      r = n.getBoundingClientRect();
    }
    act.desplazado = act.i;
    const pad = 5;
    const x0 = Math.max(0, r.left - pad), y0 = Math.max(0, r.top - pad);
    const x1 = Math.min(vw, r.right + pad), y1 = Math.min(vh, r.bottom + pad);
    blk('t', 0, 0, vw, y0); blk('b', 0, y1, vw, vh - y1); blk('l', 0, y0, x0, y1 - y0); blk('r', x1, y0, vw - x1, y1 - y0);
    // Paso informativo: el hueco lo cubre un botón transparente (tocar pasa al siguiente, no toca el juego)
    const hit = el.querySelector('.g-hit');
    hit.hidden = !!p.tocar;
    if (!p.tocar) Object.assign(hit.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
    const ring = el.querySelector('.g-ring');
    ring.hidden = false;
    Object.assign(ring.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
    // Punta del dedo dentro del objetivo (en la parte que se ve); si no cabe debajo, la mano viene de arriba
    const vy0 = Math.max(y0, z.top), vy1 = Math.min(y1, z.bottom);
    const cx = Math.round(Math.max(x0 + 4, Math.min(x1 - 4, (r.left + r.right) / 2)));
    const cy = Math.round(vy1 - vy0 > 12 ? Math.max(vy0 + 2, Math.min(vy1 - 2, Math.min(r.top + r.height * 0.6, vy0 + (vy1 - vy0) * 0.6)))
      : Math.max(y0 + 2, Math.min(y1 - 2, r.top + r.height * 0.6)));
    const flip = cy + HAND_H + 6 > vh;
    const hand = el.querySelector('.g-hand');
    hand.hidden = false;
    hand.classList.toggle('flip', flip);
    hand.style.left = (cx - TIP.x) + 'px';
    hand.style.top = (cy - TIP.y) + 'px';
    tip = { x: cx, y: cy };
    // Burbuja: del lado de la mano, sin tapar el objetivo si se puede
    const bub = el.querySelector('.g-bub');
    const nuevo = bub.hidden;
    bub.hidden = false;
    if (nuevo && !reduce()) { bub.classList.remove('in'); void bub.offsetWidth; bub.classList.add('in'); }
    const bw = bub.offsetWidth, bh = bub.offsetHeight;
    const arribaMin = 48;   // debajo de "Saltar guía"
    let top;
    if (!flip) {
      top = Math.max(y1, cy + HAND_H - 8) + 8;
      if (top + bh > vh - 8) top = y0 - bh - 10;
    } else {
      top = Math.min(y0, cy - HAND_H + 8) - bh - 8;
      if (top < arribaMin) top = y1 + 10;
    }
    top = Math.max(arribaMin, Math.min(vh - bh - 8, top));
    const left = Math.max(12, Math.min(vw - bw - 12, cx - bw / 2));
    bub.style.left = Math.round(left) + 'px';
    bub.style.top = Math.round(top) + 'px';
    visible = true;
  }

  /* ---------- ¿Se puede mostrar algo ahora? ---------- */
  function libre() {
    const s = estadoJuego();
    if (!s || !s.stats || s.currentEvent || s.gameOver) return false;
    try { if (root.Guia && root.Guia.activa && root.Guia.activa()) return false; } catch (e) { /* nada */ }
    if ($('.ay-velo')) return false;   // explicación "?" abierta encima
    return true;
  }
  function contexto(r) {
    const o = ov();
    if (r.modal) return !!(o && o.querySelector(r.modal));
    if (tabActual() !== r.tab) return false;
    return !o || !!(r.modalOk && o.querySelector(r.modalOk));
  }
  function primero(r, desde) {
    for (let j = desde; j < r.pasos.length; j++) { try { if (r.pasos[j].el()) return j; } catch (e) { /* sigue */ } }
    return -1;
  }
  function elegible() {
    if (!libre()) return null;
    const s = estadoJuego();
    for (let i = 0; i < ORDEN.length; i++) {
      const id = ORDEN[i], r = R[id];
      if (visto(id)) continue;
      if (r.requiere && !r.requiere()) continue;
      if (r.cuando && !r.cuando(s)) continue;
      if (!contexto(r)) continue;
      if (primero(r, 0) < 0) continue;
      return id;
    }
    return null;
  }

  /* ---------- Ciclo ---------- */
  function empezar(id) {
    const r = R[id];
    const i = primero(r, 0);
    if (i < 0) return;
    lsSet(PREF + id, '1');   // primera vez: aunque se corte, no vuelve a salir (salvo "Ver guías otra vez")
    act = { id, r, i, inicio: Date.now(), perdido: 0, desplazado: null };
    montar();
    el.setAttribute('data-guia', id);
    el.setAttribute('data-paso', r.pasos[i].k);
    root.addEventListener('scroll', alMover, true);
    root.addEventListener('resize', alMover);
    tick();
    repasar();
  }
  function irA(j) {
    act.i = j; act.perdido = 0; act.desplazado = null;
    el.setAttribute('data-paso', act.r.pasos[j].k);
    const bub = el.querySelector('.g-bub'); if (bub) bub.hidden = true;   // vuelve a entrar con su animación
    tick();
    repasar();
  }
  function siguiente() {
    if (!act) return;
    const j = primero(act.r, act.i + 1);
    if (j < 0) cerrar(); else irA(j);
  }
  function tick() {
    if (!act || !el) return;
    try {
      if (Date.now() - act.inicio > 4 * 60 * 1000) { cerrar(); return; }   // por si acaso: nunca queda pegada
      const r = act.r;
      if (!libre()) { ocultar(); const s = estadoJuego(); if (s && s.currentEvent) cerrar(); return; }
      if (!contexto(r)) {
        // Se fue de la sección o se cerró su ventana: se termina. Otra ventana encima: se espera escondida.
        if (r.modal || tabActual() !== r.tab) { cerrar(); return; }
        ocultar(); return;
      }
      const p = r.pasos[act.i];
      if (p.tocar) { const j = primero(r, act.i + 1); if (j > act.i) { irA(j); return; } }   // ya se tocó: llegó lo siguiente
      let n = null;
      try { n = p.el(); } catch (e) { n = null; }
      if (!n) {
        // Pantalla rehaciéndose: se espera un momento; si no aparece, se salta ese paso
        if (!act.perdido) act.perdido = Date.now();
        if (Date.now() - act.perdido > 250) ocultar();
        if (Date.now() - act.perdido > 1200) { const j = primero(r, act.i + 1); if (j < 0) cerrar(); else irA(j); }
        else programar(300);
        return;
      }
      act.perdido = 0;
      textos(p);
      layout(n, p);
    } catch (e) { aviso(e); cerrar(); }
  }
  const alMover = () => { if (act && el) tick(); };
  // Las ventanas y tarjetas entran con animación: unas lecturas más mientras se acomodan
  let reps = [];
  function repasar() {
    reps.forEach(clearTimeout);
    reps = [120, 300, 600].map((ms) => setTimeout(() => { if (act && el) tick(); }, ms));
  }
  function cerrar() {
    try { root.removeEventListener('scroll', alMover, true); root.removeEventListener('resize', alMover); } catch (e) { /* nada */ }
    if (el && el.parentNode) el.parentNode.removeChild(el);
    reps.forEach(clearTimeout); reps = [];
    el = null; act = null; tip = null; visible = false;
  }
  function aviso(e) { try { if (root.console) console.warn('[guias]', e); } catch (x) { /* nada */ } }

  /* ---------- Vigilante: ve cuándo se abre una sección por primera vez ---------- */
  function vigilar() {
    try {
      botonAyuda();
      if (act) { tick(); repasar(); return; }
      const id = elegible();
      if (!id) { cand = null; return; }
      // Que la pantalla se asiente un momento antes de empezar
      if (!cand || cand.id !== id) { cand = { id, t: Date.now() }; programar(320); return; }
      if (Date.now() - cand.t >= 300) { cand = null; empezar(id); } else programar(320);
    } catch (e) { aviso(e); cerrar(); }
  }
  function programar(ms) { clearTimeout(prog); prog = setTimeout(vigilar, ms); }
  function pedir() {
    if (raf) return;
    raf = (root.requestAnimationFrame || ((f) => setTimeout(f, 16)))(() => { raf = 0; vigilar(); });
  }

  /* ---------- Inicio → Ayuda: "Ver guías otra vez" ---------- */
  let okHasta = 0;
  function botonAyuda() {
    const c = $('.pl[data-pl="ayuda"] .pl-cuerpo');
    if (!c) return;
    let b = c.querySelector('[data-guias="reset"]');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'btn sm'; b.setAttribute('data-guias', 'reset'); b.style.marginTop = '8px';
      c.appendChild(b);
    }
    const t = Date.now() < okHasta ? '✓ ' + tx('otra_ok') : '↺ ' + tx('otra');
    if (b.textContent !== t) b.textContent = t;
  }
  function olvidar() { Object.keys(R).forEach((id) => lsDel(PREF + id)); cand = null; }
  function alClic(e) {
    const b = e.target && e.target.closest && e.target.closest('[data-guias="reset"]');
    if (!b) return;
    e.preventDefault();
    olvidar();
    okHasta = Date.now() + 2500;
    botonAyuda();
    setTimeout(botonAyuda, 2600);
  }

  function permitido() {
    if (root.__ENVIVO_DEMO) return false;
    try { if (/[?&]demo=/.test(location.search || '')) return false; } catch (e) { /* nada */ }
    let forzar = !!root.__ENVIVO_GUIAS;
    try { forzar = forzar || /[?&]guias=1\b/.test(location.search || ''); } catch (e) { /* nada */ }
    try { if (root.navigator && root.navigator.webdriver && !forzar) return false; } catch (e) { /* nada */ }
    return true;
  }
  function arrancar() {
    if (intervalo || !document.body || !root.Guia || !root.Guia.CSS || !permitido()) return;
    obs = new MutationObserver((muts) => {
      for (let i = 0; i < muts.length; i++) { if (!el || !el.contains(muts[i].target)) { pedir(); return; } }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
    document.addEventListener('click', alClic);
    intervalo = setInterval(vigilar, 800);
    vigilar();
  }

  root.Guias = {
    estado: () => {
      const p = act ? act.r.pasos[act.i] : null;
      return { activa: !!act, id: act ? act.id : null, paso: p ? p.k : null, i: act ? act.i : null, n: act ? act.r.pasos.length : 0,
        tocar: !!(p && p.tocar), x: tip ? tip.x : null, y: tip ? tip.y : null, visible };
    },
    terminar: () => cerrar(),
    olvidar,
    visto,
    IDS: Object.keys(R),
    PASOS: Object.keys(R).reduce((o, id) => { o[id] = R[id].pasos.map((p) => p.k); return o; }, {}),
    TEXTOS,
    PREF,
  };
  try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar(); } catch (e) { /* nada */ }
})(typeof window !== 'undefined' ? window : globalThis);
