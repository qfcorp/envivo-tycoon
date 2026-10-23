/* =========================================================
   EN VIVO Tycoon — Compartir, calificar y novedades (window.Compartir)
   Integración: server/INTEGRAR_COMPARTIR.md. Sin dependencias; CSS y textos (10 idiomas) van aquí.

   1. Calificar: después de un evento de 5⭐ (ya con 3 eventos o más, nunca en la guía ni en eventos en línea),
      como mucho una vez cada 30 días y 3 veces en todo el juego. Política de Google Play
      (developer.android.com/guide/playcore/in-app-review): no se pregunta "¿te gusta?" antes de la tienda. La ventana
      ofrece lo mismo a todos y al mismo nivel: "Opinar en Google Play" / "Enviar una sugerencia" / "Ahora no".
      Como el juego es una TWA (no hay API nativa de reseñas), se abre la página de la tienda (lo que la guía pide
      cuando hay un botón).
   2. Compartir: WhatsApp (wa.me; en la app de Android, intent con wa.me de respaldo) en el resultado (≥4⭐) y en
      Inicio, con https://juego.tukanec.com/?ref=<código> si hay cuenta. Con Web Share: imagen PNG (canvas) con la
      productora, el evento, las estrellas y la sede.
   3. Novedades: NOVEDADES (abajo, la más nueva primero). Sale sola una vez por versión al cargar (nunca encima de otra
      ventana ni de la guía; a una partida nueva no se le muestra) y siempre desde Inicio → Ayuda.

   Uso desde ui.js:
     Compartir.resultado(r, fresh, ctx) → html del bloque "compartir" (solo ≥4⭐) y anota si fue un 5⭐ nuevo
     Compartir.trasResultado(ctx)       → al cerrar el resultado: pide la calificación cuando la pantalla esté libre
     Compartir.inicio(ctx)              → botones de Inicio (WhatsApp + imagen)
     Compartir.ayuda()                  → botón "Novedades" para la fila Ayuda de Inicio
   Los botones llevan data-ext="compartir" data-acc="…" (los reparte ui.js a window.EnVivoInicio).
   En pruebas automáticas (navigator.webdriver) no sale nada solo, salvo window.__ENVIVO_COMPARTIR = true.
   ========================================================= */
(function (root) {
  'use strict';
  const PLAY_ID = 'com.tukanec.envivo';
  const PLAY_URL = 'https://play.google.com/store/apps/details?id=' + PLAY_ID;
  const JUEGO_URL = 'https://juego.tukanec.com/';
  const K_CAL = 'envivo_calificar_v1';     // { veces, ultimo (ms), hecho }
  const K_NOV = 'envivo_novedades_visto';  // id de la última novedad vista
  const K_REF = 'envivo_ref_origen';       // { code, t } si el juego se abrió con ?ref=
  const CAL = { dias: 30, max: 3, minEventos: 3 };
  const DIA_MS = 86400000;

  /* ---------- Textos (10 idiomas) ---------- */
  const TX = {
    es: {
      cal_t: 'Tu opinión nos ayuda', cal_x: 'Si tienes un minuto, deja tu reseña en Google Play o mándanos una idea para mejorar el juego.',
      cal_play: 'Opinar en Google Play', cal_sug: 'Enviar una sugerencia', cal_no: 'Ahora no', gracias: '¡Gracias!',
      sug_red: 'Las sugerencias necesitan internet. Intenta más tarde.',
      cmp_t: '¡Presume tu transmisión!', wa: 'Compartir por WhatsApp', img: 'Compartir imagen', copiado: 'Enlace copiado',
      msg_ev: '¡Mi productora {p} hizo «{e}» con {n}⭐ en EN VIVO Tycoon! ¿Puedes superarme?',
      msg_ini: 'Estoy armando mi productora {p} en EN VIVO Tycoon: transmisiones en vivo, cámaras y clientes. ¡Juega gratis!',
      img_juega: 'Juega gratis', img_dia: 'Día {d} · Fama {f}', img_cal: 'Calidad {q}/100', img_prod: 'Mi productora',
      nov_t: 'Lo nuevo en EN VIVO', nov_ok: '¡Genial!', nov_btn: 'Novedades',
    },
    en: {
      cal_t: 'Your feedback helps us', cal_x: 'If you have a minute, leave a review on Google Play or send us an idea to improve the game.',
      cal_play: 'Review on Google Play', cal_sug: 'Send a suggestion', cal_no: 'Not now', gracias: 'Thank you!',
      sug_red: 'Suggestions need internet. Try again later.',
      cmp_t: 'Show off your broadcast!', wa: 'Share on WhatsApp', img: 'Share image', copiado: 'Link copied',
      msg_ev: 'My production company {p} pulled off “{e}” with {n}⭐ in EN VIVO Tycoon! Can you beat me?',
      msg_ini: "I'm building my production company {p} in EN VIVO Tycoon: live broadcasts, cameras and clients. Play for free!",
      img_juega: 'Play for free', img_dia: 'Day {d} · Fame {f}', img_cal: 'Quality {q}/100', img_prod: 'My production company',
      nov_t: "What's new in EN VIVO", nov_ok: 'Great!', nov_btn: "What's new",
    },
    'pt-BR': {
      cal_t: 'Sua opinião nos ajuda', cal_x: 'Se tiver um minuto, deixe sua avaliação no Google Play ou mande uma ideia para melhorar o jogo.',
      cal_play: 'Avaliar no Google Play', cal_sug: 'Enviar uma sugestão', cal_no: 'Agora não', gracias: 'Obrigado!',
      sug_red: 'As sugestões precisam de internet. Tente mais tarde.',
      cmp_t: 'Mostre sua transmissão!', wa: 'Compartilhar no WhatsApp', img: 'Compartilhar imagem', copiado: 'Link copiado',
      msg_ev: 'Minha produtora {p} fez “{e}” com {n}⭐ no EN VIVO Tycoon! Consegue me superar?',
      msg_ini: 'Estou montando minha produtora {p} no EN VIVO Tycoon: transmissões ao vivo, câmeras e clientes. Jogue grátis!',
      img_juega: 'Jogue grátis', img_dia: 'Dia {d} · Fama {f}', img_cal: 'Qualidade {q}/100', img_prod: 'Minha produtora',
      nov_t: 'Novidades do EN VIVO', nov_ok: 'Legal!', nov_btn: 'Novidades',
    },
    fr: {
      cal_t: 'Votre avis nous aide', cal_x: 'Si vous avez une minute, laissez un avis sur Google Play ou envoyez-nous une idée pour améliorer le jeu.',
      cal_play: 'Donner mon avis sur Google Play', cal_sug: 'Envoyer une suggestion', cal_no: 'Plus tard', gracias: 'Merci !',
      sug_red: 'Les suggestions nécessitent internet. Réessayez plus tard.',
      cmp_t: 'Montrez votre diffusion !', wa: 'Partager sur WhatsApp', img: "Partager l'image", copiado: 'Lien copié',
      msg_ev: 'Ma boîte de production {p} a réussi « {e} » avec {n}⭐ dans EN VIVO Tycoon ! Tu peux faire mieux ?',
      msg_ini: 'Je monte ma boîte de production {p} dans EN VIVO Tycoon : directs, caméras et clients. Joue gratuitement !',
      img_juega: 'Jouez gratuitement', img_dia: 'Jour {d} · Renommée {f}', img_cal: 'Qualité {q}/100', img_prod: 'Ma boîte de production',
      nov_t: 'Nouveautés EN VIVO', nov_ok: 'Super !', nov_btn: 'Nouveautés',
    },
    de: {
      cal_t: 'Deine Meinung hilft uns', cal_x: 'Wenn du eine Minute hast, schreib eine Bewertung bei Google Play oder schick uns eine Idee für das Spiel.',
      cal_play: 'Bei Google Play bewerten', cal_sug: 'Vorschlag senden', cal_no: 'Jetzt nicht', gracias: 'Danke!',
      sug_red: 'Vorschläge brauchen Internet. Versuch es später.',
      cmp_t: 'Zeig deine Übertragung!', wa: 'Per WhatsApp teilen', img: 'Bild teilen', copiado: 'Link kopiert',
      msg_ev: 'Meine Produktionsfirma {p} hat „{e}“ mit {n}⭐ in EN VIVO Tycoon geschafft! Schaffst du mehr?',
      msg_ini: 'Ich baue meine Produktionsfirma {p} in EN VIVO Tycoon auf: Live-Übertragungen, Kameras und Kunden. Kostenlos spielen!',
      img_juega: 'Kostenlos spielen', img_dia: 'Tag {d} · Ruhm {f}', img_cal: 'Qualität {q}/100', img_prod: 'Meine Produktionsfirma',
      nov_t: 'Neu in EN VIVO', nov_ok: 'Super!', nov_btn: 'Neuigkeiten',
    },
    it: {
      cal_t: 'La tua opinione ci aiuta', cal_x: 'Se hai un minuto, lascia una recensione su Google Play o mandaci un’idea per migliorare il gioco.',
      cal_play: 'Recensisci su Google Play', cal_sug: 'Invia un suggerimento', cal_no: 'Non ora', gracias: 'Grazie!',
      sug_red: 'I suggerimenti richiedono internet. Riprova più tardi.',
      cmp_t: 'Mostra la tua diretta!', wa: 'Condividi su WhatsApp', img: 'Condividi immagine', copiado: 'Link copiato',
      msg_ev: 'La mia casa di produzione {p} ha fatto «{e}» con {n}⭐ in EN VIVO Tycoon! Riesci a battermi?',
      msg_ini: 'Sto costruendo la mia casa di produzione {p} in EN VIVO Tycoon: dirette, telecamere e clienti. Gioca gratis!',
      img_juega: 'Gioca gratis', img_dia: 'Giorno {d} · Fama {f}', img_cal: 'Qualità {q}/100', img_prod: 'La mia casa di produzione',
      nov_t: 'Novità di EN VIVO', nov_ok: 'Ottimo!', nov_btn: 'Novità',
    },
    ru: {
      cal_t: 'Ваше мнение помогает нам', cal_x: 'Если есть минута, оставьте отзыв в Google Play или пришлите идею, как улучшить игру.',
      cal_play: 'Отзыв в Google Play', cal_sug: 'Отправить идею', cal_no: 'Не сейчас', gracias: 'Спасибо!',
      sug_red: 'Для идей нужен интернет. Попробуйте позже.',
      cmp_t: 'Похвастайтесь эфиром!', wa: 'Поделиться в WhatsApp', img: 'Поделиться картинкой', copiado: 'Ссылка скопирована',
      msg_ev: 'Моя продакшн-студия {p} провела «{e}» на {n}⭐ в EN VIVO Tycoon! Сможешь лучше?',
      msg_ini: 'Я развиваю свою продакшн-студию {p} в EN VIVO Tycoon: прямые эфиры, камеры и клиенты. Играй бесплатно!',
      img_juega: 'Играй бесплатно', img_dia: 'День {d} · Слава {f}', img_cal: 'Качество {q}/100', img_prod: 'Моя студия',
      nov_t: 'Новое в EN VIVO', nov_ok: 'Отлично!', nov_btn: 'Что нового',
    },
    tr: {
      cal_t: 'Görüşün bize yardım ediyor', cal_x: 'Bir dakikan varsa Google Play’de yorum bırak ya da oyunu geliştirmek için bize bir fikir gönder.',
      cal_play: 'Google Play’de değerlendir', cal_sug: 'Öneri gönder', cal_no: 'Şimdi değil', gracias: 'Teşekkürler!',
      sug_red: 'Öneriler için internet gerekli. Sonra tekrar dene.',
      cmp_t: 'Yayınını göster!', wa: 'WhatsApp’ta paylaş', img: 'Görseli paylaş', copiado: 'Bağlantı kopyalandı',
      msg_ev: 'Yapım şirketim {p} EN VIVO Tycoon’da “{e}” yayınını {n}⭐ ile yaptı! Beni geçebilir misin?',
      msg_ini: 'EN VIVO Tycoon’da yapım şirketimi {p} kuruyorum: canlı yayınlar, kameralar ve müşteriler. Ücretsiz oyna!',
      img_juega: 'Ücretsiz oyna', img_dia: 'Gün {d} · Şöhret {f}', img_cal: 'Kalite {q}/100', img_prod: 'Yapım şirketim',
      nov_t: 'EN VIVO’da yenilikler', nov_ok: 'Harika!', nov_btn: 'Yenilikler',
    },
    id: {
      cal_t: 'Pendapatmu membantu kami', cal_x: 'Kalau ada waktu sebentar, beri ulasan di Google Play atau kirim ide untuk membuat game ini lebih baik.',
      cal_play: 'Ulas di Google Play', cal_sug: 'Kirim saran', cal_no: 'Nanti saja', gracias: 'Terima kasih!',
      sug_red: 'Saran butuh internet. Coba lagi nanti.',
      cmp_t: 'Pamerkan siaranmu!', wa: 'Bagikan via WhatsApp', img: 'Bagikan gambar', copiado: 'Tautan disalin',
      msg_ev: 'Rumah produksiku {p} sukses “{e}” dengan {n}⭐ di EN VIVO Tycoon! Bisa mengalahkanku?',
      msg_ini: 'Aku sedang membangun rumah produksi {p} di EN VIVO Tycoon: siaran langsung, kamera, dan klien. Main gratis!',
      img_juega: 'Main gratis', img_dia: 'Hari {d} · Ketenaran {f}', img_cal: 'Kualitas {q}/100', img_prod: 'Rumah produksiku',
      nov_t: 'Yang baru di EN VIVO', nov_ok: 'Keren!', nov_btn: 'Yang baru',
    },
    'zh-CN': {
      cal_t: '你的意见对我们很重要', cal_x: '如果有一分钟，请在 Google Play 留下评价，或告诉我们改进游戏的想法。',
      cal_play: '在 Google Play 评价', cal_sug: '提交建议', cal_no: '以后再说', gracias: '谢谢！',
      sug_red: '提交建议需要联网，请稍后再试。',
      cmp_t: '炫耀你的直播！', wa: '分享到 WhatsApp', img: '分享图片', copiado: '链接已复制',
      msg_ev: '我的制作公司 {p} 在 EN VIVO Tycoon 里完成了「{e}」，获得 {n}⭐！你能超过我吗？',
      msg_ini: '我在 EN VIVO Tycoon 里经营制作公司 {p}：直播、摄像机和客户。免费玩！',
      img_juega: '免费玩', img_dia: '第 {d} 天 · 声望 {f}', img_cal: '质量 {q}/100', img_prod: '我的制作公司',
      nov_t: 'EN VIVO 新内容', nov_ok: '太棒了！', nov_btn: '新内容',
    },
  };

  /* ---------- Novedades (la más nueva primero). Al agregar una: id nuevo (sale sola una vez) y textos en los 10 idiomas
     (si falta un idioma se usa el español). Del PLAN.md, bitácora 2026-10-23. ---------- */
  const NOVEDADES = [
    { id: '2026-10-23', fecha: '2026-10-23', items: [
      { ico: 'tip', t: {
        es: 'Guía "toca aquí" en tu primer evento, con Don Ramiro.', en: '"Tap here" guide for your first event, with Don Ramiro.',
        'pt-BR': 'Guia "toque aqui" no seu primeiro evento, com Don Ramiro.', fr: 'Guide « touchez ici » pour votre premier événement, avec Don Ramiro.',
        de: '„Hier tippen“-Anleitung für dein erstes Event, mit Don Ramiro.', it: 'Guida "tocca qui" per il tuo primo evento, con Don Ramiro.',
        ru: 'Подсказки «нажми сюда» в первом мероприятии вместе с Доном Рамиро.', tr: 'İlk etkinliğinde Don Ramiro ile "buraya dokun" rehberi.',
        id: 'Panduan "ketuk di sini" di acara pertamamu, bersama Don Ramiro.', 'zh-CN': '首场活动有 Don Ramiro 的“点这里”引导。' } },
      { ico: 'sparkle', t: {
        es: 'Botones "?" que explican dinero, fama, gastos y calidad.', en: '"?" buttons that explain money, fame, costs and quality.',
        'pt-BR': 'Botões "?" que explicam dinheiro, fama, gastos e qualidade.', fr: 'Boutons « ? » qui expliquent argent, renommée, dépenses et qualité.',
        de: '„?“-Knöpfe erklären Geld, Ruhm, Kosten und Qualität.', it: 'Pulsanti "?" che spiegano soldi, fama, spese e qualità.',
        ru: 'Кнопки «?» объясняют деньги, славу, расходы и качество.', tr: 'Para, şöhret, gider ve kaliteyi anlatan "?" düğmeleri.',
        id: 'Tombol "?" yang menjelaskan uang, ketenaran, biaya, dan kualitas.', 'zh-CN': '新增“?”按钮，解释金钱、声望、开销和质量。' } },
      { ico: 'cloud', t: {
        es: 'Aviso de cuenta: guarda tu partida en la nube.', en: 'Account reminder: save your game in the cloud.',
        'pt-BR': 'Aviso de conta: salve seu jogo na nuvem.', fr: 'Rappel de compte : sauvegardez votre partie dans le cloud.',
        de: 'Konto-Hinweis: Speichere deinen Spielstand in der Cloud.', it: 'Avviso account: salva la partita nel cloud.',
        ru: 'Напоминание об аккаунте: сохраняйте игру в облаке.', tr: 'Hesap uyarısı: oyununu bulutta sakla.',
        id: 'Pengingat akun: simpan permainanmu di cloud.', 'zh-CN': '账号提醒：把存档保存到云端。' } },
      { ico: 'home', t: {
        es: 'Inicio plegable y el nombre de tu productora en el letrero.', en: 'Collapsible Home and your company name on the sign.',
        'pt-BR': 'Início recolhível e o nome da sua produtora no letreiro.', fr: 'Accueil repliable et le nom de votre boîte sur l’enseigne.',
        de: 'Einklappbarer Start und dein Firmenname auf dem Schild.', it: 'Home richiudibile e il nome della tua casa sull’insegna.',
        ru: 'Сворачиваемый главный экран и название студии на вывеске.', tr: 'Katlanabilir ana sayfa ve tabelada şirketinin adı.',
        id: 'Beranda yang bisa dilipat dan nama rumah produksimu di papan.', 'zh-CN': '首页可折叠，招牌上显示你的公司名。' } },
      { ico: 'planta', t: {
        es: 'Decora tu local y recibe mejores clientes.', en: 'Decorate your place and attract better clients.',
        'pt-BR': 'Decore seu espaço e receba clientes melhores.', fr: 'Décorez vos locaux et attirez de meilleurs clients.',
        de: 'Dekoriere deinen Laden und gewinne bessere Kunden.', it: 'Arreda la tua sede e ricevi clienti migliori.',
        ru: 'Украшайте помещение и привлекайте клиентов получше.', tr: 'Mekânını süsle, daha iyi müşteriler gelsin.',
        id: 'Hias tempatmu dan dapatkan klien yang lebih baik.', 'zh-CN': '装饰你的场地，吸引更好的客户。' } },
      { ico: 'unidad_movil', t: {
        es: 'Movilización y flota: pide un "Llévame" o compra vehículos.', en: 'Transport and fleet: book a "Llévame" ride or buy vehicles.',
        'pt-BR': 'Transporte e frota: chame um "Llévame" ou compre veículos.', fr: 'Transport et flotte : réservez un « Llévame » ou achetez des véhicules.',
        de: 'Transport und Flotte: buche „Llévame“ oder kaufe Fahrzeuge.', it: 'Trasporti e flotta: chiama un "Llévame" o compra veicoli.',
        ru: 'Транспорт и автопарк: вызовите «Llévame» или купите машины.', tr: 'Ulaşım ve filo: "Llévame" çağır ya da araç satın al.',
        id: 'Transportasi dan armada: pesan "Llévame" atau beli kendaraan.', 'zh-CN': '交通与车队：叫一辆“Llévame”或购买车辆。' } },
      { ico: 'stream', t: {
        es: 'Escena animada del evento en vivo y más vida en tu local.', en: 'Animated live event scene and more life around your place.',
        'pt-BR': 'Cena animada do evento ao vivo e mais vida no seu espaço.', fr: 'Scène animée du direct et plus de vie autour de vos locaux.',
        de: 'Animierte Live-Szene und mehr Leben rund um deinen Laden.', it: 'Scena animata della diretta e più vita intorno alla sede.',
        ru: 'Анимированная сцена эфира и больше жизни вокруг студии.', tr: 'Canlı etkinlikte animasyonlu sahne ve mekânında daha çok hayat.',
        id: 'Adegan acara langsung yang animasi dan tempat yang lebih hidup.', 'zh-CN': '直播活动动画场景，场地周围更热闹。' } },
      { ico: 'gem', t: {
        es: 'Edición Exclusiva de equipos en cada categoría.', en: 'Exclusive Edition gear in every category.',
        'pt-BR': 'Edição Exclusiva de equipamentos em cada categoria.', fr: 'Édition Exclusive de matériel dans chaque catégorie.',
        de: 'Exklusiv-Edition der Ausrüstung in jeder Kategorie.', it: 'Edizione Esclusiva di attrezzature in ogni categoria.',
        ru: 'Эксклюзивное издание техники в каждой категории.', tr: 'Her kategoride Özel Sürüm ekipmanlar.',
        id: 'Peralatan Edisi Eksklusif di setiap kategori.', 'zh-CN': '每个类别都有独家版设备。' } },
      { ico: 'crown', t: {
        es: 'Liga para nuevos: únete de un toque.', en: 'League for newcomers: join with one tap.',
        'pt-BR': 'Liga para novatos: entre com um toque.', fr: 'Ligue pour débutants : rejoignez-la d’un geste.',
        de: 'Liga für Neue: mit einem Tippen beitreten.', it: 'Lega per nuovi: entra con un tocco.',
        ru: 'Лига для новичков: вступайте одним нажатием.', tr: 'Yeniler için lig: tek dokunuşla katıl.',
        id: 'Liga untuk pemula: gabung dengan sekali ketuk.', 'zh-CN': '新手联赛：一键加入。' } },
    ] },
  ];

  /* ---------- Ayudantes ---------- */
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const idioma = () => { try { const c = root.I18N && root.I18N.idioma; return TX[c] ? c : 'es'; } catch (e) { return 'es'; } };
  const t = (k, p) => String((TX[idioma()] || TX.es)[k] || TX.es[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
  const ahora = () => (typeof root.__ENVIVO_AHORA === 'number' ? root.__ENVIVO_AHORA : Date.now());
  const noEmoji = (s) => String(s || '').replace(/^(\p{Extended_Pictographic}|️|‍|\s)+/u, '').trim();
  const icono = (n, cls) => { try { return root.Art ? root.Art.icon(n, cls || 'sm') : ''; } catch (e) { return ''; } };
  const estado = () => { try { return root.__game && root.__game.state; } catch (e) { return null; } };
  // Lo que sale solo (calificar, novedades): nunca en pruebas automáticas, salvo que la prueba lo pida
  const autoOk = () => { try { return !root.navigator.webdriver || root.__ENVIVO_COMPARTIR === true; } catch (e) { return true; } };
  let ctx = null;         // último contexto de ui.js (ctxInicio): openModal, closeModal, toast, render, T, TL...
  let ultimoRes = null;   // { titulo, estrellas, calidad } del último resultado pintado
  let pide5 = false;      // hubo un 5⭐ nuevo y falta ver si toca pedir la calificación

  function enApp() {
    try { if (root.GooglePlay && root.GooglePlay.enApp && root.GooglePlay.enApp()) return true; } catch (e) { /* abajo */ }
    try { return /[?&]origen=android\b/.test(location.search) || sessionStorage.getItem('envivo_origen') === 'android'; } catch (e) { return false; }
  }
  function guiaActiva() {
    try { if (root.Guia && root.Guia.activa && root.Guia.activa()) return true; } catch (e) { /* abajo */ }
    return !!document.getElementById('guia');
  }
  // Pantalla libre: sin ventana abierta, sin guía, sin evento en curso
  function libre() {
    const ov = document.getElementById('overlay');
    const S = estado();
    return !!S && !(ov && ov.classList.contains('on')) && !guiaActiva() && !S.currentEvent;
  }
  function abrirModal(html) {
    if (ctx && ctx.openModal) { ctx.openModal(html); return; }
    const m = document.getElementById('modal'), ov = document.getElementById('overlay');
    if (!m || !ov) return;
    m.innerHTML = html; ov.classList.add('on'); m.scrollTop = 0;
  }
  function cerrarModal() {
    if (ctx && ctx.closeModal) { ctx.closeModal(); try { if (ctx.render) ctx.render(); } catch (e) { /* nada */ } return; }
    const m = document.getElementById('modal'), ov = document.getElementById('overlay');
    if (ov) ov.classList.remove('on'); if (m) m.innerHTML = '';
  }
  const toast = (m) => { try { if (ctx && ctx.toast) ctx.toast(m); } catch (e) { /* nada */ } };
  // Espera a que la pantalla quede libre (dos revisiones seguidas) y entonces llama fn. Una sola espera por tipo.
  const esperas = {};
  function cuandoLibre(tipo, fn, maxMs) {
    if (esperas[tipo]) return;
    const fin = Date.now() + (maxMs || 120000);
    let seguidas = 0;
    esperas[tipo] = setInterval(() => {
      if (Date.now() > fin) { clearInterval(esperas[tipo]); delete esperas[tipo]; return; }
      seguidas = libre() ? seguidas + 1 : 0;
      if (seguidas < 2) return;
      clearInterval(esperas[tipo]); delete esperas[tipo];
      try { fn(); } catch (e) { console.error('[compartir ' + tipo + ']', e); }
    }, 600);
  }

  /* ---------- Código de invitación y enlace ---------- */
  function refCodigo() {
    try {
      const E = root.Api && root.Api.estado;
      if (!E) return '';
      const j = E.jugador || {};
      let c = E.ref_codigo || E.codigo_invitacion || j.ref || j.codigo || '';
      if (!c && E.logueado && Number(j.id) > 0) c = 'p' + Number(j.id).toString(36);
      c = String(c || '');
      return /^[\w-]{1,24}$/.test(c) ? c : '';
    } catch (e) { return ''; }
  }
  const enlace = () => { const c = refCodigo(); return JUEGO_URL + (c ? '?ref=' + encodeURIComponent(c) : ''); };
  // Si el juego se abrió con ?ref=, se guarda (la primera vez) para que el servidor lo pueda leer al crear la cuenta
  (function guardarRef() {
    try {
      const m = /[?&]ref=([\w-]{1,24})\b/.exec(location.search || '');
      if (m && !lsGet(K_REF)) lsSet(K_REF, { code: m[1], t: ahora() });
    } catch (e) { /* nada */ }
  })();

  // Nombre que puso el jugador (S.productora); vacío si no puso ninguno (así no sale "Mi productora Mi productora")
  function nombrePropio() {
    const S = estado();
    return (S && typeof S.productora === 'string' && S.productora.trim()) || '';
  }
  function mensaje(tipo) {
    const p = nombrePropio() ? '«' + nombrePropio() + '»' : '';
    const m = tipo === 'res' && ultimoRes ? t('msg_ev', { p, e: ultimoRes.titulo, n: ultimoRes.estrellas }) : t('msg_ini', { p });
    return m.replace(/\s{2,}/g, ' ').replace(/\s+([,.:!?])/g, '$1');
  }
  // Abre fuera del juego. En la app de Android (TWA) se usa un intent con la página web de respaldo.
  function abrirFuera(url, intent) {
    root.__compartirUltimo = { url, intent: enApp() ? intent || null : null };
    try {
      if (enApp() && intent) { if (!root.__compartirNoNavegar) location.href = intent; return; }
      // Sin 'noopener' en las opciones (con él window.open devuelve null siempre y no se sabría si se bloqueó)
      const w = root.open(url, '_blank');
      if (w) { try { w.opener = null; } catch (e) { /* nada */ } } else if (!root.__compartirNoNavegar) location.href = url;
    } catch (e) { /* nada */ }
  }
  function whatsapp(tipo) {
    const texto = mensaje(tipo) + ' ' + enlace();
    const wa = 'https://wa.me/?text=' + encodeURIComponent(texto);
    abrirFuera(wa, 'intent://send?text=' + encodeURIComponent(texto) + '#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=' + encodeURIComponent(wa) + ';end');
  }
  const puedeShare = () => { try { return typeof navigator.share === 'function'; } catch (e) { return false; } };

  /* ---------- Imagen para compartir (canvas 1080x1350 → PNG) ---------- */
  function cssSede() {
    // Las reglas de la sede (.hq …) para que el dibujo se vea igual fuera de la página
    let out = '';
    try {
      for (const sh of Array.from(document.styleSheets)) {
        let reglas; try { reglas = sh.cssRules; } catch (e) { continue; }
        for (const r of Array.from(reglas || [])) { if (/\.hq\b|hqv-|hq-/.test(r.cssText) && !/@keyframes/.test(r.cssText)) out += r.cssText + '\n'; }
      }
    } catch (e) { /* sin estilos */ }
    return out.replace(/animation[^;}]*;?/g, '');
  }
  function cargarSvg(svg, w, h) {
    return new Promise((res) => {
      try {
        let s = String(svg || '');
        if (!/^\s*<svg/.test(s)) { const i = s.indexOf('<svg'); if (i < 0) return res(null); s = s.slice(i); }
        const fin = s.lastIndexOf('</svg>'); if (fin > 0) s = s.slice(0, fin + 6);
        s = s.replace(/^<svg\b([^>]*)>/, (m, at) => {
          let a = at.replace(/\s(width|height)="[^"]*"/g, '');
          if (!/xmlns=/.test(a)) a += ' xmlns="http://www.w3.org/2000/svg"';
          if (!/xmlns:xlink=/.test(a)) a += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
          return `<svg${a} width="${w}" height="${h}"><style>${cssSede().replace(/<\/?style/g, '')}</style>`;
        });
        const img = new Image();
        const to = setTimeout(() => res(null), 3000);
        img.onload = () => { clearTimeout(to); res(img); };
        img.onerror = () => { clearTimeout(to); res(null); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
      } catch (e) { res(null); }
    });
  }
  function redondo(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function estrella(c, cx, cy, R, relleno) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.45 : R; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = relleno; c.fill();
  }
  function ajustar(c, txt, max, px, peso, fam) {
    let s = px;
    c.font = `${peso} ${s}px ${fam}`;
    while (c.measureText(txt).width > max && s > 24) { s -= 2; c.font = `${peso} ${s}px ${fam}`; }
    let out = txt;
    while (c.measureText(out).width > max && out.length > 4) out = out.slice(0, -2) + '…';
    return out;
  }
  async function imagen(tipo) {
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    if (!c) return null;
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]); } catch (e) { /* nada */ }
    const CAB = '"Barlow Condensed","Roboto Condensed","Arial Narrow",system-ui,sans-serif';
    const CUE = '"IBM Plex Sans","Noto Sans",system-ui,"PingFang SC","Noto Sans CJK SC",sans-serif';
    // Fondo
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d0f14'); g.addColorStop(1, '#1a1030');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const gl = c.createRadialGradient(W / 2, 120, 20, W / 2, 120, 700); gl.addColorStop(0, 'rgba(255,59,59,.28)'); gl.addColorStop(1, 'rgba(255,59,59,0)');
    c.fillStyle = gl; c.fillRect(0, 0, W, H);
    // Cabecera: "● EN VIVO" + nombre del juego
    redondo(c, 60, 56, 232, 64, 32); c.fillStyle = '#ff3b3b'; c.fill();
    c.beginPath(); c.arc(100, 88, 11, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.fillStyle = '#fff'; c.font = `800 40px ${CAB}`; c.textBaseline = 'middle'; c.fillText('EN VIVO', 124, 90);
    c.textAlign = 'right'; c.fillStyle = '#e9edf5'; c.font = `800 52px ${CAB}`; c.fillText('EN VIVO Tycoon', W - 60, 90); c.textAlign = 'left';
    // La sede
    const bx = 60, by = 160, bw = W - 120, bh = 560;
    redondo(c, bx, by, bw, bh, 36); c.fillStyle = '#161a22'; c.fill();
    c.save(); redondo(c, bx, by, bw, bh, 36); c.clip();
    let svg = ''; try { svg = root.Art && root.Art.hq ? root.Art.hq(estado()) : ''; } catch (e) { svg = ''; }
    const img = svg ? await cargarSvg(svg, bw, bh) : null;
    if (img) { try { c.drawImage(img, bx, by, bw, bh); } catch (e) { /* sin dibujo */ } }
    c.restore();
    redondo(c, bx, by, bw, bh, 36); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 3; c.stroke();
    // Textos
    c.textAlign = 'center';
    const propio = nombrePropio();
    if (propio) { c.fillStyle = '#8b95a8'; c.font = `600 34px ${CUE}`; c.fillText(t('img_prod').toUpperCase(), W / 2, 790); }
    c.fillStyle = '#ffffff'; c.fillText(ajustar(c, propio || t('img_prod'), W - 120, propio ? 104 : 96, 800, CAB), W / 2, propio ? 870 : 850);
    const S = estado() || {};
    if (tipo === 'res' && ultimoRes) {
      c.fillStyle = '#c9d2e3'; c.fillText(ajustar(c, ultimoRes.titulo, W - 140, 46, 600, CUE), W / 2, 960);
      for (let i = 0; i < 5; i++) estrella(c, W / 2 + (i - 2) * 118, 1065, 50, i < ultimoRes.estrellas ? '#ffc83d' : '#3a4252');
      c.fillStyle = '#8b95a8'; c.font = `600 36px ${CUE}`; c.fillText(t('img_cal', { q: ultimoRes.calidad }), W / 2, 1150);
    } else {
      c.fillStyle = '#c9d2e3'; c.font = `600 46px ${CUE}`; c.fillText(t('img_dia', { d: S.day || 1, f: Math.floor(S.rep || 0) }), W / 2, 960);
      for (let i = 0; i < 5; i++) estrella(c, W / 2 + (i - 2) * 96, 1060, 36, '#ffc83d');
    }
    // Pie
    redondo(c, 60, H - 140, W - 120, 92, 46); c.fillStyle = '#25d366'; c.fill();
    c.fillStyle = '#06210f'; c.font = `800 46px ${CAB}`; c.fillText(t('img_juega') + ' · juego.tukanec.com', W / 2, H - 92);
    return new Promise((res) => { try { cv.toBlob((b) => res(b), 'image/png'); } catch (e) { res(null); } });
  }
  async function compartirImagen(tipo) {
    const texto = mensaje(tipo), url = enlace();
    try {
      const b = await imagen(tipo);
      const f = b && typeof File === 'function' ? new File([b], 'envivo-tycoon.png', { type: 'image/png' }) : null;
      root.__compartirImagen = b ? b.size : 0;
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: 'EN VIVO Tycoon', text: texto + ' ' + url });
        return;
      }
      if (puedeShare()) { await navigator.share({ title: 'EN VIVO Tycoon', text: texto, url }); return; }
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // el jugador cerró el menú
    }
    whatsapp(tipo);
  }

  /* ---------- Bloques de pantalla ---------- */
  const SVG_WA = '<svg class="ico sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9.2 8.6c.2 2.8 3.4 6 6.2 6.2l1-1.4-1.9-1-1 .8a5 5 0 0 1-2.7-2.7l.8-1-1-1.9z" fill="currentColor" stroke-width="1"/></svg>';
  const SVG_SH = '<svg class="ico sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3"/></svg>';
  function botones(tipo) {
    return `<div class="cmp-fila"><button class="btn cmp-wa" data-ext="compartir" data-acc="wa-${tipo}">${SVG_WA}${esc(t('wa'))}</button>`
      + (puedeShare() ? `<button class="btn cmp-img" data-ext="compartir" data-acc="img-${tipo}" aria-label="${esc(t('img'))}" title="${esc(t('img'))}">${SVG_SH}</button>` : '')
      + '</div>';
  }
  function resultado(r, fresh, c) {
    if (c) ctx = c;
    if (!r) return '';
    let titulo = r.title || '';
    try { if (ctx && ctx.TL) titulo = ctx.TL(titulo); } catch (e) { /* tal cual */ }
    ultimoRes = { titulo: noEmoji(titulo), estrellas: Math.max(1, Math.min(5, Number(r.stars) || 1)), calidad: Math.round(Number(r.quality) || 0) };
    if (fresh && Number(r.stars) === 5) pide5 = true;
    if (!(Number(r.stars) >= 4)) return '';
    return `<div class="cmp-res"><div class="cmp-tit">${icono('social')} ${esc(t('cmp_t'))}</div>${botones('res')}</div>`;
  }
  const inicio = (c) => { if (c) ctx = c; return `<div class="cmp-ini">${botones('ini')}</div>`; };
  const ayuda = () => `<div class="cmp-nov-w"><button class="btn sm cmp-nov-btn" data-ext="compartir" data-acc="nov">${icono('sparkle')} ${esc(t('nov_btn'))}${pendientes().length ? '<span class="cmp-punto" aria-hidden="true"></span>' : ''}</button></div>`;

  /* ---------- Calificar ---------- */
  const calEstado = () => Object.assign({ veces: 0, ultimo: 0, hecho: false }, lsGet(K_CAL) || {});
  function puedeCalificar() {
    const S = estado(), e = calEstado();
    if (!S || !S.stats || e.hecho || e.veces >= CAL.max) return false;
    if (e.ultimo && ahora() - e.ultimo < CAL.dias * DIA_MS) return false;
    if ((S.stats.events || 0) < CAL.minEventos) return false;   // que ya haya jugado lo suficiente
    if (S.intento || guiaActiva()) return false;
    return true;
  }
  function mostrarCalificar() {
    if (!puedeCalificar() || !libre()) return false;
    const e = calEstado();
    lsSet(K_CAL, { veces: e.veces + 1, ultimo: ahora(), hecho: false });
    // Las dos opciones al mismo nivel y para todos (sin preguntar antes si le gusta)
    abrirModal(`<div class="cmp-cal" role="dialog" aria-labelledby="cmp-cal-t">
      <div class="cmp-cal-ico">${icono('star', '')}</div>
      <h2 id="cmp-cal-t">${esc(t('cal_t'))}</h2>
      <p class="small muted">${esc(t('cal_x'))}</p>
      <div class="cmp-cal-op">
        <button class="btn" data-ext="compartir" data-acc="cal-play">${icono('star')}${esc(t('cal_play'))}</button>
        <button class="btn" data-ext="compartir" data-acc="cal-sug">${icono('social')}${esc(t('cal_sug'))}</button>
      </div>
      <button class="btn sm cmp-no" data-act="close">${esc(t('cal_no'))}</button></div>`);
    return true;
  }
  function abrirTienda() {
    abrirFuera(PLAY_URL, 'intent://details?id=' + PLAY_ID + '#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=' + encodeURIComponent(PLAY_URL) + ';end');
  }
  async function sugerencia(c) {
    const Api = root.Api;
    if (!root.Soporte || !Api || Api.disponible !== true) { toast(t('sug_red')); return; }
    const S = estado();
    const cx = { Api, A: root.Art, estado: () => S, toast: (m) => toast(m), snd: (c && c.snd) || { play() {} },
      openModal: (h) => abrirModal(h), closeModal: () => cerrarModal() };
    try {
      await root.Soporte.abrir(cx);
      // Con cuenta: directo al formulario, con "Una sugerencia" elegida
      const b = document.querySelector('#modal [data-sop="nuevo"]');
      if (b) { b.click(); const sel = document.getElementById('sop-cat'); if (sel) sel.value = 'sugerencia'; }
    } catch (e) { toast(t('sug_red')); }
  }

  /* ---------- Novedades ---------- */
  function pendientes() {
    const visto = lsGet(K_NOV);
    const i = NOVEDADES.findIndex((n) => n.id === visto);
    return i < 0 ? NOVEDADES.slice() : NOVEDADES.slice(0, i);
  }
  const marcarVistas = () => { if (NOVEDADES[0]) lsSet(K_NOV, NOVEDADES[0].id); };
  function fechaCorta(f) {
    try { return new Date(f + 'T12:00:00').toLocaleDateString((root.I18N && root.I18N.idioma) || 'es', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return f; }
  }
  function mostrarNovedades(lista) {
    const xs = (lista && lista.length ? lista : NOVEDADES).slice(0, 4);
    const lg = idioma();
    marcarVistas();
    abrirModal(`<div class="cmp-nov">
      <div class="row between"><h2>${icono('sparkle', '')} ${esc(t('nov_t'))}</h2><button class="btn sm" data-act="close" aria-label="${esc(t('nov_ok'))}">${icono('close')}</button></div>
      ${xs.map((n) => `<div class="cmp-nov-v"><div class="small muted">${esc(fechaCorta(n.fecha))}</div><ul>
        ${n.items.map((it) => `<li>${icono(it.ico)}<span>${esc(it.t[lg] || it.t.es)}</span></li>`).join('')}</ul></div>`).join('')}
      <button class="btn main" data-act="close">${esc(t('nov_ok'))}</button></div>`);
  }
  function autoNovedades() {
    const S = estado();
    if (!S) { setTimeout(autoNovedades, 500); return; }
    if (!pendientes().length) return;
    // Partida nueva: no hay nada "nuevo" para quien recién empieza
    if (S.stats && (S.stats.events || 0) === 0 && (S.day || 1) <= 1) { marcarVistas(); return; }
    if (!autoOk()) return;
    setTimeout(() => cuandoLibre('nov', () => { if (pendientes().length) mostrarNovedades(pendientes()); }, 60000), 1200);
  }

  /* ---------- Clics (ui.js los reparte por data-ext="compartir") ---------- */
  function clic(c, acc) {
    if (c) ctx = c;
    switch (acc) {
      case 'wa-res': whatsapp('res'); break;
      case 'wa-ini': whatsapp('ini'); break;
      case 'img-res': compartirImagen('res'); break;
      case 'img-ini': compartirImagen('ini'); break;
      case 'cal-play': { const e = calEstado(); lsSet(K_CAL, Object.assign(e, { hecho: true })); cerrarModal(); abrirTienda(); toast(t('gracias')); break; }
      case 'cal-sug': cerrarModal(); sugerencia(c); break;
      case 'nov': mostrarNovedades(NOVEDADES); break;
      default: break;
    }
  }
  function trasResultado(c) {
    if (c) ctx = c;
    if (!pide5) return;
    pide5 = false;
    if (!autoOk() || !puedeCalificar()) return;
    cuandoLibre('cal', mostrarCalificar, 90000);
  }

  /* ---------- CSS ---------- */
  function css() {
    if (document.getElementById('compartir-css')) return;
    const st = document.createElement('style');
    st.id = 'compartir-css';
    st.textContent = '.cmp-fila{display:flex;gap:8px;align-items:stretch}.cmp-fila .btn{margin:0}'
      + '.cmp-wa{flex:1;background:linear-gradient(180deg,#34e07a,#1fb85a)!important;border-color:#1fb85a!important;color:#06210f!important;font-weight:700}'
      + '.cmp-img{flex:0 0 56px;width:56px;padding-left:0!important;padding-right:0!important;justify-content:center}.cmp-img .ico{width:22px;height:22px;margin:0!important}'
      + '.cmp-res{margin:12px 0 10px;padding:10px;border:1px solid #25d36655;border-radius:12px;background:#25d36612}'
      + '.cmp-tit{font-weight:700;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:6px}'
      + '.cmp-ini{margin:8px 0 0}'
      + '.cmp-cal{text-align:center}.cmp-cal-ico{color:var(--amber,#ffb020);margin:4px auto 6px}.cmp-cal-ico .ico{width:44px;height:44px}'
      + '.cmp-cal p{margin:8px 0 14px}.cmp-cal-op{display:grid;grid-template-columns:1fr;gap:8px}.cmp-cal-op .btn{margin:0}'
      + '.cmp-no{margin-top:10px;background:none!important;border-color:transparent!important;color:var(--muted,#8b95a8)!important}'
      + '.cmp-nov h2{display:flex;align-items:center;gap:6px}.cmp-nov-v{margin:10px 0}.cmp-nov ul{list-style:none;margin:6px 0 0;padding:0}'
      + '.cmp-nov li{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line,#2a3242);font-size:14px;line-height:1.35}'
      + '.cmp-nov li:last-child{border-bottom:0}.cmp-nov li .ico{flex:0 0 auto;color:var(--amber,#ffb020);margin-top:1px}'
      + '.cmp-nov-w{margin-top:12px}.cmp-nov-btn{display:inline-flex;width:auto;margin:0}.cmp-punto{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red,#ff3b3b);margin-left:6px;vertical-align:middle}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------- Arranque ---------- */
  root.EnVivoInicio = root.EnVivoInicio || [];
  // Sin tarjeta propia (tarjeta vacía = sin fila): solo recibe los clics data-ext="compartir"
  root.EnVivoInicio.push({ id: 'compartir', orden: 999, tarjeta: () => '', clic: (c, acc, el) => clic(c, acc, el) });
  root.Compartir = {
    TEXTOS: TX, NOVEDADES, PLAY_URL, JUEGO_URL, REGLAS: CAL,
    resultado, trasResultado, inicio, ayuda, clic,
    enlace, refCodigo, refOrigen: () => lsGet(K_REF),
    imagen, mostrarNovedades, pendientes, puedeCalificar, mostrarCalificar,
  };
  if (typeof document !== 'undefined') {
    css();
    autoNovedades();
  }
})(typeof window !== 'undefined' ? window : globalThis);
