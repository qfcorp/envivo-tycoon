/* =========================================================
   EN VIVO Tycoon — Liga Semanal de Productoras (pantalla)
   Contrato: server/INTEGRAR_LIGA.md (GET /api/liga, POST /api/liga/tomar · abandonar · descartar ·
   intento · completar, GET/POST /api/liga/tienda). El servidor decide todo; esta pantalla muestra y pide.
   Uso desde ui.js:  Liga.render(elemento, ctx)
     ctx = { A (Art), estado() (partida), guardar(), toast(msg), ask(html, boton, fn),
             jugarIntento(intento) -> Promise<{decisiones, resultado}>   (juega el evento con la semilla
               del servidor; ver server/validador/README.md "Lado del juego"),
             equipoIntento(s)? (equipo a registrar; si no, todo el personal y los equipos),
             abrirAsociaciones()? (abre el chat en "Asociación"; "Crear asociación" lo usa para ir directo al formulario),
             alUnirse(r)? / alCanjear(r)? (refrescar /api/estado después de unirse o canjear),
             abrirModo(k)? (ir a otro modo en línea; si falta, window.EnVivoAbrirOnline) }
   Sin asociación: lista para unirse en un toque (GET /api/liga → asociaciones, o GET /api/asociaciones en servidores
   viejos; POST /api/asociaciones/unirse), cuánto falta para crear una ($ de la partida) y los modos que no la piden.
   Liga.progresoLocal(s, tarea) -> avance del encargo contando lo jugado que todavía no llegó al servidor.
   Textos: usa I18N si existe (claves liga.*) y si no, el español de aquí.
   ========================================================= */
(function (root) {
  'use strict';
  const ES = {
    'liga.titulo': 'Liga Semanal', 'liga.cargando': 'Abriendo la liga…', 'liga.reintentar': 'Intentar de nuevo',
    'liga.error': 'No se pudo abrir la liga.', 'liga.termina': 'Termina en {t}', 'liga.terminada': 'La semana terminó',
    'liga.fichas': 'fichas', 'liga.fichas_de_liga': 'Fichas de liga', 'liga.puntos': 'puntos', 'liga.pts': 'pts',
    'liga.tab.encargos': 'Encargos', 'liga.tab.grupo': 'Grupo', 'liga.tab.tienda': 'Tienda',
    'liga.sin_asociacion': 'La Liga Semanal se juega en asociación', 'liga.sin_asociacion_txt': 'Únete a una asociación (o crea la tuya) para competir cada semana con otras productoras, subir de liga y ganar fichas.',
    'liga.ir_asociaciones': 'Buscar asociación',
    'liga.mi_encargo': 'Tu encargo', 'liga.sin_encargo': 'No tienes encargo. Toma uno del tablero.', 'liga.usados': 'Usaste {n} de {max} encargos esta semana',
    'liga.jugar': 'Jugar el encargo', 'liga.abandonar': 'Abandonar', 'liga.enviar': 'Enviar {n} resultado(s)',
    'liga.abandonar_pregunta': '¿Abandonar <b>{t}</b>? Vuelve al tablero con el avance en 0 y el encargo usado no se devuelve.',
    'liga.vence': 'Quedan {t}', 'liga.por_enviar': '+{n} por enviar', 'liga.listo': '¡Listo para entregar!',
    'liga.tablero': 'Tablero de la asociación', 'liga.tomar': 'Tomar', 'liga.descartar': 'Descartar',
    'liga.descartar_pregunta': '¿Descartar <b>{t}</b>? En 10 minutos aparece otro encargo.',
    'liga.lo_hace': 'Lo hace {n}', 'liga.tuyo': 'Tu encargo', 'liga.nuevo_en': 'Nuevo encargo en {t}', 'liga.horas': '{n} h',
    'liga.hechas': 'Hechos esta semana', 'liga.hecho_por': '{n} · +{p} pts',
    'liga.banderas': 'Banderas', 'liga.bandera_n': 'Bandera {n}: {p} pts · {f} fichas',
    'liga.grupo': 'Grupo {n}', 'liga.grupo_txt': 'Suben los primeros y bajan los últimos (y los que no sumen puntos).',
    'liga.sube': 'Sube', 'liga.baja': 'Baja', 'liga.tu_asociacion': 'Tu asociación',
    'liga.ultima': 'Semana pasada: puesto {p} · {r} · ganaste {f} fichas', 'liga.r.sube': 'subieron a la {l}', 'liga.r.baja': 'bajaron a la {l}', 'liga.r.queda': 'siguen en la {l}',
    'liga.tienda_txt': 'Las fichas se ganan con las banderas y el puesto final. Lo de la tienda no se vende en el mercado.',
    'liga.canjear': 'Canjear', 'liga.canjear_pregunta': '¿Canjear <b>{n}</b> por {f} fichas?', 'liga.canjeado': '¡Listo! {n} llegó a tu productora.',
    'liga.tienes': 'Lo tienes', 'liga.limite': '{c}/{m} esta semana', 'liga.te_faltan': 'Te faltan {n} fichas',
    'liga.tomado': 'Encargo tomado. ¡A trabajar!', 'liga.descartado': 'Encargo descartado.', 'liga.abandonado': 'Encargo devuelto al tablero.',
    'liga.cuenta': '¡Cuenta para el encargo! ({a}/{m})', 'liga.no_cuenta': 'Ese evento no cumplió el encargo.', 'liga.completado': '¡Encargo completado! +{p} puntos para la asociación',
    'liga.pendiente': 'Resultado guardado: el servidor lo revisa en un momento.', 'liga.sin_juego': 'Actualiza el juego para jugar encargos de la liga.',
    'liga.sin_internet': 'Sin conexión. Tu resultado quedó guardado y se enviará después.',
    // Pantalla para quien todavía no tiene asociación (liga.n.*: traducciones en TRAD, abajo)
    'liga.n.titulo': 'Juega la liga en equipo', 'liga.n.txt': 'Únete gratis a una asociación: cada semana hacen encargos juntos, suben de liga y ganan fichas.',
    'liga.n.buscar': 'Buscar asociación', 'liga.n.buscando': 'Buscando asociaciones…', 'liga.n.miembros': '{n}/{max} miembros',
    'liga.n.pts_semana': '{p} pts esta semana', 'liga.n.activa': 'Más activa', 'liga.n.libre': 'Entrada libre', 'liga.n.con_solicitud': 'Con solicitud',
    'liga.n.unirme': 'Unirme', 'liga.n.pedir': 'Pedir entrar', 'liga.n.pedida': 'Pedida', 'liga.n.ver_mas': 'Ver {n} más',
    'liga.n.unido': '¡Ya eres parte de {n}! Toma tu primer encargo.', 'liga.n.solicitud': 'Solicitud enviada a {n}. Te avisan cuando te acepten.',
    'liga.n.llena': 'Esa asociación se llenó. Prueba con otra.', 'liga.n.error_lista': 'No se pudo cargar la lista de asociaciones.',
    'liga.n.crear_t': 'Crea tu propia asociación', 'liga.n.crear_txt': 'Cuesta {c} del juego y tú serás el presidente.', 'liga.n.crear_gratis': 'Gratis con tu Pase VIP: tú serás el presidente.',
    'liga.n.tienes': 'Tienes {m} de {c}', 'liga.n.faltan': 'Te faltan {m}', 'liga.n.faltan_txt': 'Gánalos haciendo eventos con tu productora.',
    'liga.n.crear': 'Crear asociación', 'liga.n.vacio_t': 'Todavía no hay asociaciones aquí',
    'liga.n.vacio_txt': '¡Sé la primera productora en crear una! Mientras tanto, estos modos no necesitan asociación:',
    'liga.n.otros': 'Sin asociación también puedes jugar',
    // Nombres de los otros modos: los da I18N (js/lang); esto es por si falta
    'online.duelos': 'Duelo de Productoras', 'online.duelos_det': 'Reta a otra productora: mismo contrato, misma suerte.',
    'online.desafio': 'Desafío del Día', 'online.desafio_det': 'El mismo reto para todos, una vez al día.',
    'online.copa': 'Copa de Servidores', 'online.copa_det': 'Tu servidor contra los demás, cada semana.',
  };
  /* Textos nuevos que todavía no están en js/lang/*: aquí, por idioma (I18N.idioma). Lo que falte sale en español. */
  const TRAD = {
    en: {
      'liga.n.titulo': 'Play the league as a team', 'liga.n.txt': 'Join an association for free: every week you do tasks together, move up leagues and earn tokens.',
      'liga.n.buscar': 'Find an association', 'liga.n.buscando': 'Looking for associations…', 'liga.n.miembros': '{n}/{max} members',
      'liga.n.pts_semana': '{p} pts this week', 'liga.n.activa': 'Most active', 'liga.n.libre': 'Open to all', 'liga.n.con_solicitud': 'By request',
      'liga.n.unirme': 'Join', 'liga.n.pedir': 'Ask to join', 'liga.n.pedida': 'Requested', 'liga.n.ver_mas': 'Show {n} more',
      'liga.n.unido': "You're now part of {n}! Take your first task.", 'liga.n.solicitud': "Request sent to {n}. You'll be notified when they accept you.",
      'liga.n.llena': 'That association just filled up. Try another one.', 'liga.n.error_lista': "Couldn't load the list of associations.",
      'liga.n.crear_t': 'Create your own association', 'liga.n.crear_txt': "It costs {c} of in-game money and you'll be the president.", 'liga.n.crear_gratis': "Free with your VIP Pass: you'll be the president.",
      'liga.n.tienes': 'You have {m} of {c}', 'liga.n.faltan': 'You need {m} more', 'liga.n.faltan_txt': 'Earn it by running events with your company.',
      'liga.n.crear': 'Create association', 'liga.n.vacio_t': 'No associations here yet',
      'liga.n.vacio_txt': 'Be the first company to create one! Meanwhile, these modes need no association:', 'liga.n.otros': 'Without an association you can also play',
    },
    'pt-BR': {
      'liga.n.titulo': 'Jogue a liga em equipe', 'liga.n.txt': 'Entre de graça numa associação: toda semana vocês fazem encomendas juntos, sobem de liga e ganham fichas.',
      'liga.n.buscar': 'Buscar associação', 'liga.n.buscando': 'Buscando associações…', 'liga.n.miembros': '{n}/{max} membros',
      'liga.n.pts_semana': '{p} pts nesta semana', 'liga.n.activa': 'Mais ativa', 'liga.n.libre': 'Entrada livre', 'liga.n.con_solicitud': 'Com pedido',
      'liga.n.unirme': 'Entrar', 'liga.n.pedir': 'Pedir para entrar', 'liga.n.pedida': 'Pedido feito', 'liga.n.ver_mas': 'Ver mais {n}',
      'liga.n.unido': 'Agora você faz parte de {n}! Pegue sua primeira encomenda.', 'liga.n.solicitud': 'Pedido enviado para {n}. Você será avisado quando aceitarem.',
      'liga.n.llena': 'Essa associação lotou. Tente outra.', 'liga.n.error_lista': 'Não deu para carregar a lista de associações.',
      'liga.n.crear_t': 'Crie sua própria associação', 'liga.n.crear_txt': 'Custa {c} do jogo e você será o presidente.', 'liga.n.crear_gratis': 'Grátis com seu Passe VIP: você será o presidente.',
      'liga.n.tienes': 'Você tem {m} de {c}', 'liga.n.faltan': 'Faltam {m}', 'liga.n.faltan_txt': 'Ganhe fazendo eventos com sua produtora.',
      'liga.n.crear': 'Criar associação', 'liga.n.vacio_t': 'Ainda não há associações aqui',
      'liga.n.vacio_txt': 'Seja a primeira produtora a criar uma! Enquanto isso, estes modos não precisam de associação:', 'liga.n.otros': 'Sem associação você também pode jogar',
    },
    fr: {
      'liga.n.titulo': 'Jouez la ligue en équipe', 'liga.n.txt': 'Rejoignez gratuitement une association : chaque semaine, vous faites des missions ensemble, montez de ligue et gagnez des jetons.',
      'liga.n.buscar': 'Trouver une association', 'liga.n.buscando': 'Recherche d’associations…', 'liga.n.miembros': '{n}/{max} membres',
      'liga.n.pts_semana': '{p} pts cette semaine', 'liga.n.activa': 'La plus active', 'liga.n.libre': 'Entrée libre', 'liga.n.con_solicitud': 'Sur demande',
      'liga.n.unirme': 'Rejoindre', 'liga.n.pedir': 'Demander', 'liga.n.pedida': 'Demandé', 'liga.n.ver_mas': 'Voir {n} de plus',
      'liga.n.unido': 'Vous faites partie de {n} ! Prenez votre première mission.', 'liga.n.solicitud': 'Demande envoyée à {n}. Vous serez prévenu quand ils vous accepteront.',
      'liga.n.llena': 'Cette association vient d’être complète. Essayez-en une autre.', 'liga.n.error_lista': 'Impossible de charger la liste des associations.',
      'liga.n.crear_t': 'Créez votre propre association', 'liga.n.crear_txt': 'Elle coûte {c} du jeu et vous en serez le président.', 'liga.n.crear_gratis': 'Gratuit avec votre Pass VIP : vous en serez le président.',
      'liga.n.tienes': 'Vous avez {m} sur {c}', 'liga.n.faltan': 'Il vous manque {m}', 'liga.n.faltan_txt': 'Gagnez-les en faisant des événements avec votre société.',
      'liga.n.crear': 'Créer l’association', 'liga.n.vacio_t': 'Pas encore d’association ici',
      'liga.n.vacio_txt': 'Soyez la première société à en créer une ! En attendant, ces modes ne demandent pas d’association :', 'liga.n.otros': 'Sans association, vous pouvez aussi jouer',
    },
    de: {
      'liga.n.titulo': 'Spiel die Liga im Team', 'liga.n.txt': 'Tritt kostenlos einem Verband bei: Jede Woche erledigt ihr gemeinsam Aufträge, steigt auf und verdient Marken.',
      'liga.n.buscar': 'Verband suchen', 'liga.n.buscando': 'Suche Verbände…', 'liga.n.miembros': '{n}/{max} Mitglieder',
      'liga.n.pts_semana': '{p} Pkt. diese Woche', 'liga.n.activa': 'Am aktivsten', 'liga.n.libre': 'Freier Beitritt', 'liga.n.con_solicitud': 'Auf Anfrage',
      'liga.n.unirme': 'Beitreten', 'liga.n.pedir': 'Anfragen', 'liga.n.pedida': 'Angefragt', 'liga.n.ver_mas': '{n} weitere zeigen',
      'liga.n.unido': 'Du gehörst jetzt zu {n}! Nimm deinen ersten Auftrag.', 'liga.n.solicitud': 'Anfrage an {n} gesendet. Du erfährst es, sobald sie dich aufnehmen.',
      'liga.n.llena': 'Dieser Verband ist gerade voll. Versuch einen anderen.', 'liga.n.error_lista': 'Die Liste der Verbände konnte nicht geladen werden.',
      'liga.n.crear_t': 'Gründe deinen eigenen Verband', 'liga.n.crear_txt': 'Kostet {c} Spielgeld und du wirst Präsident.', 'liga.n.crear_gratis': 'Gratis mit deinem VIP-Pass: Du wirst Präsident.',
      'liga.n.tienes': 'Du hast {m} von {c}', 'liga.n.faltan': 'Dir fehlen {m}', 'liga.n.faltan_txt': 'Verdiene es mit Events deiner Produktionsfirma.',
      'liga.n.crear': 'Verband gründen', 'liga.n.vacio_t': 'Hier gibt es noch keine Verbände',
      'liga.n.vacio_txt': 'Sei die erste Firma, die einen gründet! Diese Modi brauchen keinen Verband:', 'liga.n.otros': 'Ohne Verband kannst du auch spielen',
    },
    it: {
      'liga.n.titulo': 'Gioca la lega in squadra', 'liga.n.txt': 'Entra gratis in un’associazione: ogni settimana fate incarichi insieme, salite di lega e guadagnate gettoni.',
      'liga.n.buscar': 'Cerca un’associazione', 'liga.n.buscando': 'Cerco associazioni…', 'liga.n.miembros': '{n}/{max} membri',
      'liga.n.pts_semana': '{p} pt questa settimana', 'liga.n.activa': 'La più attiva', 'liga.n.libre': 'Ingresso libero', 'liga.n.con_solicitud': 'Su richiesta',
      'liga.n.unirme': 'Entra', 'liga.n.pedir': 'Chiedi di entrare', 'liga.n.pedida': 'Richiesta inviata', 'liga.n.ver_mas': 'Mostra altre {n}',
      'liga.n.unido': 'Ora fai parte di {n}! Prendi il tuo primo incarico.', 'liga.n.solicitud': 'Richiesta inviata a {n}. Ti avviseranno quando ti accettano.',
      'liga.n.llena': 'Quell’associazione si è appena riempita. Provane un’altra.', 'liga.n.error_lista': 'Impossibile caricare l’elenco delle associazioni.',
      'liga.n.crear_t': 'Crea la tua associazione', 'liga.n.crear_txt': 'Costa {c} del gioco e sarai tu il presidente.', 'liga.n.crear_gratis': 'Gratis con il tuo Pass VIP: sarai tu il presidente.',
      'liga.n.tienes': 'Hai {m} su {c}', 'liga.n.faltan': 'Ti mancano {m}', 'liga.n.faltan_txt': 'Guadagnali facendo eventi con la tua casa di produzione.',
      'liga.n.crear': 'Crea associazione', 'liga.n.vacio_t': 'Ancora nessuna associazione qui',
      'liga.n.vacio_txt': 'Sii la prima casa di produzione a crearne una! Intanto, queste modalità non richiedono un’associazione:', 'liga.n.otros': 'Anche senza associazione puoi giocare',
    },
    ru: {
      'liga.n.titulo': 'Играй в лиге командой', 'liga.n.txt': 'Вступи в ассоциацию бесплатно: каждую неделю вы вместе выполняете заказы, поднимаетесь в лигах и получаете фишки.',
      'liga.n.buscar': 'Найти ассоциацию', 'liga.n.buscando': 'Ищем ассоциации…', 'liga.n.miembros': '{n}/{max} участников',
      'liga.n.pts_semana': '{p} очк. за неделю', 'liga.n.activa': 'Самая активная', 'liga.n.libre': 'Вход свободный', 'liga.n.con_solicitud': 'По заявке',
      'liga.n.unirme': 'Вступить', 'liga.n.pedir': 'Подать заявку', 'liga.n.pedida': 'Заявка подана', 'liga.n.ver_mas': 'Показать ещё {n}',
      'liga.n.unido': 'Теперь ты в {n}! Возьми свой первый заказ.', 'liga.n.solicitud': 'Заявка отправлена в {n}. Тебе сообщат, когда примут.',
      'liga.n.llena': 'Эта ассоциация уже заполнена. Попробуй другую.', 'liga.n.error_lista': 'Не удалось загрузить список ассоциаций.',
      'liga.n.crear_t': 'Создай свою ассоциацию', 'liga.n.crear_txt': 'Стоит {c} игровых денег, и ты станешь президентом.', 'liga.n.crear_gratis': 'Бесплатно с VIP-пропуском: ты станешь президентом.',
      'liga.n.tienes': 'У тебя {m} из {c}', 'liga.n.faltan': 'Не хватает {m}', 'liga.n.faltan_txt': 'Заработай их на мероприятиях своей студии.',
      'liga.n.crear': 'Создать ассоциацию', 'liga.n.vacio_t': 'Здесь пока нет ассоциаций',
      'liga.n.vacio_txt': 'Создай первую! А пока в эти режимы можно играть без ассоциации:', 'liga.n.otros': 'Без ассоциации тоже можно играть',
    },
    tr: {
      'liga.n.titulo': 'Ligi takımla oyna', 'liga.n.txt': 'Bir birliğe ücretsiz katıl: her hafta birlikte görev yapar, lig atlar ve jeton kazanırsınız.',
      'liga.n.buscar': 'Birlik bul', 'liga.n.buscando': 'Birlikler aranıyor…', 'liga.n.miembros': '{n}/{max} üye',
      'liga.n.pts_semana': 'Bu hafta {p} puan', 'liga.n.activa': 'En aktif', 'liga.n.libre': 'Serbest giriş', 'liga.n.con_solicitud': 'Başvuruyla',
      'liga.n.unirme': 'Katıl', 'liga.n.pedir': 'Başvur', 'liga.n.pedida': 'Başvuruldu', 'liga.n.ver_mas': '{n} tane daha göster',
      'liga.n.unido': 'Artık {n} üyesisin! İlk görevini al.', 'liga.n.solicitud': '{n} birliğine başvuru gönderildi. Kabul edilince haber verilecek.',
      'liga.n.llena': 'Bu birlik az önce doldu. Başka birini dene.', 'liga.n.error_lista': 'Birlik listesi yüklenemedi.',
      'liga.n.crear_t': 'Kendi birliğini kur', 'liga.n.crear_txt': 'Oyun parasıyla {c} tutar ve başkan sen olursun.', 'liga.n.crear_gratis': 'VIP Pasınla ücretsiz: başkan sen olursun.',
      'liga.n.tienes': '{c} tutarın {m} kadarı sende', 'liga.n.faltan': '{m} eksik', 'liga.n.faltan_txt': 'Yapım şirketinle etkinlik yaparak kazan.',
      'liga.n.crear': 'Birlik kur', 'liga.n.vacio_t': 'Burada henüz birlik yok',
      'liga.n.vacio_txt': 'İlk birliği kuran sen ol! Bu arada şu modlar birlik gerektirmez:', 'liga.n.otros': 'Birlik olmadan da oynayabilirsin',
    },
    id: {
      'liga.n.titulo': 'Main liga bersama tim', 'liga.n.txt': 'Gabung asosiasi gratis: tiap minggu kalian mengerjakan tugas bersama, naik liga, dan dapat token.',
      'liga.n.buscar': 'Cari asosiasi', 'liga.n.buscando': 'Mencari asosiasi…', 'liga.n.miembros': '{n}/{max} anggota',
      'liga.n.pts_semana': '{p} poin minggu ini', 'liga.n.activa': 'Paling aktif', 'liga.n.libre': 'Bebas masuk', 'liga.n.con_solicitud': 'Lewat permintaan',
      'liga.n.unirme': 'Gabung', 'liga.n.pedir': 'Minta gabung', 'liga.n.pedida': 'Sudah diminta', 'liga.n.ver_mas': 'Lihat {n} lagi',
      'liga.n.unido': 'Kamu sekarang bagian dari {n}! Ambil tugas pertamamu.', 'liga.n.solicitud': 'Permintaan dikirim ke {n}. Kamu akan diberi tahu saat diterima.',
      'liga.n.llena': 'Asosiasi itu baru saja penuh. Coba yang lain.', 'liga.n.error_lista': 'Daftar asosiasi tidak bisa dimuat.',
      'liga.n.crear_t': 'Buat asosiasimu sendiri', 'liga.n.crear_txt': 'Biayanya {c} uang game dan kamu jadi ketuanya.', 'liga.n.crear_gratis': 'Gratis dengan VIP Pass: kamu jadi ketuanya.',
      'liga.n.tienes': 'Kamu punya {m} dari {c}', 'liga.n.faltan': 'Kurang {m}', 'liga.n.faltan_txt': 'Dapatkan dengan mengadakan acara bersama rumah produksimu.',
      'liga.n.crear': 'Buat asosiasi', 'liga.n.vacio_t': 'Belum ada asosiasi di sini',
      'liga.n.vacio_txt': 'Jadilah rumah produksi pertama yang membuatnya! Sementara itu, mode ini tidak butuh asosiasi:', 'liga.n.otros': 'Tanpa asosiasi kamu juga bisa main',
    },
    'zh-CN': {
      'liga.n.titulo': '组队参加联赛', 'liga.n.txt': '免费加入一个协会：每周一起完成委托、升级联赛并赢取筹码。',
      'liga.n.buscar': '寻找协会', 'liga.n.buscando': '正在寻找协会…', 'liga.n.miembros': '{n}/{max} 名成员',
      'liga.n.pts_semana': '本周 {p} 分', 'liga.n.activa': '最活跃', 'liga.n.libre': '自由加入', 'liga.n.con_solicitud': '需申请',
      'liga.n.unirme': '加入', 'liga.n.pedir': '申请加入', 'liga.n.pedida': '已申请', 'liga.n.ver_mas': '再看 {n} 个',
      'liga.n.unido': '你已加入 {n}！去接第一个委托吧。', 'liga.n.solicitud': '已向 {n} 发送申请，通过后会通知你。',
      'liga.n.llena': '这个协会刚刚满员了，换一个试试。', 'liga.n.error_lista': '无法加载协会列表。',
      'liga.n.crear_t': '创建你自己的协会', 'liga.n.crear_txt': '需要 {c} 游戏币，你将担任会长。', 'liga.n.crear_gratis': 'VIP 通行证免费：你将担任会长。',
      'liga.n.tienes': '你有 {m} / {c}', 'liga.n.faltan': '还差 {m}', 'liga.n.faltan_txt': '用你的制作公司办活动来赚吧。',
      'liga.n.crear': '创建协会', 'liga.n.vacio_t': '这里还没有协会',
      'liga.n.vacio_txt': '成为第一个创建协会的制作公司！在此期间，这些模式不需要协会：', 'liga.n.otros': '没有协会也可以玩',
    },
  };
  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { return 'es'; } };
  const T = (k, p) => {
    try { if (root.I18N && root.I18N.T && (!root.I18N.T.has || root.I18N.T.has(k))) return root.I18N.T(k, p); } catch (e) { /* español */ }
    const d = TRAD[idioma()] || {};
    const s = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : ES[k] || k;
    return String(s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  };
  const dinero = (n) => { try { if (root.I18N && root.I18N.money) return root.I18N.money(n); } catch (e) { /* nada */ } return '$' + num(n); };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('es-EC');
  const CORTES = ['internet', 'luz', 'senal', 'cable', 'bateria', 'falla'];
  const ESTRELLAS = [85, 70, 55, 40];

  const st = { ctx: null, el: null, datos: null, tienda: null, vista: 'encargos', cargando: false, error: '', reloj: null, base: 0, ocupado: false, cargadoEn: 0,
    asocs: null, verTodas: false };   // asocs: lista de GET /api/asociaciones si /api/liga no la trae (servidor viejo)

  /* ---------- Gráficos propios ---------- */
  const icon = (n, cls, size) => {
    const A = (st.ctx && st.ctx.A) || root.Art;
    try { return A.icon(n, cls, size); } catch (e) { return ''; }
  };
  const ficha = (size) => `<svg class="lg-ficha" width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#3a2a0d" stroke="#ffb020" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#ffb020" stroke-width="1.5" stroke-dasharray="2 2"/><path d="M12 8.6l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#ffcf6e"/></svg>`;
  const bandera = (on, size) => `<svg width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V3.5" stroke="${on ? '#ffb020' : '#56607a'}" stroke-width="2" stroke-linecap="round"/><path d="M6 4h11l-2.5 4L17 12H6z" fill="${on ? '#ffb020' : 'none'}" stroke="${on ? '#ffb020' : '#56607a'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const LIGA_ICONO = ['barrial', 'trend', 'star', 'stream', 'crown'];
  function escudo(liga, size) {
    const c = (liga && liga.color) || '#c58b5a', i = liga ? liga.indice : 0, s = size || 52;
    return `<svg class="lg-escudo" width="${s}" height="${s}" viewBox="0 0 52 52" aria-hidden="true">
      <path d="M26 3l19 6v15c0 12-8 20-19 25C15 44 7 36 7 24V9z" fill="${c}22" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M26 8.5l14 4.4V24c0 9-5.7 15.3-14 19.4C17.7 39.3 12 33 12 24V12.9z" fill="${c}33"/>
      <g transform="translate(14 13)" color="${c}">${icon(LIGA_ICONO[i] || 'star', '', 24)}</g>
      ${Array.from({ length: i + 1 }, (_, k) => `<circle cx="${26 + (k - i / 2) * 5}" cy="44" r="1.6" fill="${c}"/>`).join('')}</svg>`;
  }

  function css() {
    if (typeof document === 'undefined' || document.getElementById('liga-css')) return;
    const s = document.createElement('style');
    s.id = 'liga-css';
    s.textContent = `
      .lg{min-width:0}
      .lg-head{display:flex;gap:12px;align-items:center}
      .lg-head .grow{min-width:0}
      .lg-liga{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:24px;font-weight:700;line-height:1;text-transform:uppercase;letter-spacing:.5px}
      .lg-asoc{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:13px;min-width:0}
      .lg-asoc span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-sig{flex:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;color:#0d0f14}
      .lg-reloj{display:inline-flex;align-items:center;gap:5px;margin-top:6px;font-size:12px;color:var(--muted)}
      .lg-reloj .ico{width:14px;height:14px}
      .lg-chip{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:6px 10px}
      .lg-chip b{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:16px;display:flex;align-items:center;gap:4px}
      .lg-chip small{font-size:10px;color:var(--muted)}
      .lg-score{margin-top:14px}
      .lg-score .row{font-size:13px}
      .lg-pista{position:relative;height:12px;margin:22px 4px 6px;background:var(--panel2);border-radius:8px;border:1px solid var(--line)}
      .lg-pista i{position:absolute;left:0;top:0;bottom:0;border-radius:8px;background:linear-gradient(90deg,#ff3b3b,#ffb020)}
      .lg-flag{position:absolute;top:-21px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center}
      .lg-flag::after{content:"";width:2px;height:6px;background:var(--line)}
      .lg-flag.on::after{background:#ffb020}
      .lg-flags-lbl{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);font-family:"JetBrains Mono",ui-monospace,monospace;margin:0 0 2px}
      .lg-tabs{display:flex;gap:6px;margin:4px 0 12px}
      .lg-tabs button{flex:1;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px 4px;font-weight:600;font-size:14px}
      .lg-tabs button.on{border-color:var(--red);background:#2a1a1f;color:#fff}
      .lg-mia{border-color:var(--red);background:linear-gradient(160deg,#2a1a1f,var(--panel) 60%)}
      .lg-mia h3{font-size:19px;margin:2px 0 4px;overflow-wrap:anywhere}
      .lg-et{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--amber)}
      .lg-barra{height:9px;background:var(--panel2);border-radius:9px;overflow:hidden;margin-top:8px;display:flex}
      .lg-barra i{display:block;height:100%;background:var(--green)}
      .lg-barra i.pend{background:repeating-linear-gradient(45deg,#ffb020,#ffb020 4px,#c98a12 4px,#c98a12 8px)}
      .lg-acc{display:flex;gap:8px;margin-top:12px}
      .lg-acc .btn{margin:0}
      .lg-acc .btn.main{flex:1}
      .lg-acc .btn.sm{flex:none;padding:12px 14px;font-size:13px}
      .lg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .lg-t{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:11px;display:flex;flex-direction:column;gap:6px;min-width:0;min-height:154px}
      .lg-t.tomada{background:var(--panel)}
      .lg-t.mia{border-color:var(--red);box-shadow:inset 0 0 0 1px #ff3b3b55}
      .lg-t.espera{border-style:dashed;align-items:center;justify-content:center;text-align:center;color:var(--muted);font-size:12px}
      .lg-t .tile{width:38px;height:38px;border-radius:10px}
      .lg-t .tile .ico{width:20px;height:20px}
      .lg-t-top{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
      .lg-pts{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;font-weight:700;color:var(--amber);background:#3a2a0d;border:1px solid #5a4214;border-radius:8px;padding:2px 6px;white-space:nowrap}
      .lg-t h4{margin:0;font-size:13.5px;line-height:1.25;font-weight:600;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .lg-t .meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);margin-top:auto;gap:4px}
      .lg-t .meta span{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
      .lg-t .meta .ico{width:12px;height:12px}
      .lg-t .btn.sm{width:100%;padding:8px 6px}
      .lg-t .quien{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);min-width:0}
      .lg-t .quien b{flex:none;width:20px;height:20px;border-radius:50%;background:var(--panel2);border:1px solid var(--line);display:grid;place-items:center;font-size:9px;color:var(--text)}
      .lg-t .quien span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-t-acc{display:flex;gap:6px}
      .lg-t-acc .btn.sm{flex:1;min-width:0}
      .lg-x{flex:none;width:36px;display:grid;place-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:12px;color:var(--muted);padding:0}
      .lg-x .ico{width:16px;height:16px}
      .lg-hecha{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px;min-width:0}
      .lg-hecha:last-child{border-bottom:0}
      .lg-hecha .grow{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-hecha .small{flex:0 1 auto;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-rank{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
      .lg-rank td{padding:9px 4px;border-bottom:1px solid var(--line);vertical-align:middle}
      .lg-rank td:last-child{text-align:right;font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:700}
      .lg-rank tr.sube td:first-child{box-shadow:inset 3px 0 0 var(--green)}
      .lg-rank tr.baja td:first-child{box-shadow:inset 3px 0 0 var(--red)}
      .lg-rank tr.mia td{background:#2a1a1f}
      .lg-rank .pos{width:34px;text-align:center;font-family:"JetBrains Mono",ui-monospace,monospace;color:var(--muted)}
      .lg-rank .nom{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-rank .nom small{display:block;color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis}
      .lg-rank .fl{width:58px;white-space:nowrap}
      .lg-rank .fl svg{margin-right:-3px}
      .lg-rank .pt{width:70px}
      .lg-escalera{display:flex;gap:4px;margin-top:10px}
      .lg-escalera span{flex:1;min-width:0;text-align:center;font-size:10px;padding:5px 2px;border-radius:8px;border:1px solid var(--line);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-escalera span.on{color:#0d0f14;font-weight:700}
      .lg-art{display:flex;gap:10px;align-items:center}
      .lg-art .grow{min-width:0}
      .lg-art h4{margin:0;font-size:14px}
      .lg-art p{margin:2px 0 0;font-size:12px;color:var(--muted)}
      .lg-precio{display:inline-flex;align-items:center;gap:4px;font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:700;color:var(--amber)}
      .lg-art .btn.sm{flex:none;min-width:86px}
      .lg-art .motivo{font-size:11px;color:var(--muted);text-align:right;max-width:96px}
      .lg-vacio{text-align:center;color:var(--muted);font-size:13px}
      .lg-intro{display:flex;gap:12px;align-items:flex-start}
      .lg-intro .grow{min-width:0}
      .lg-intro h3{margin:0 0 4px;font-size:18px}
      .lg-intro p{margin:0;font-size:13.5px;line-height:1.4;color:var(--muted)}
      .lg-lista{padding:2px 12px}
      .lg-a{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);min-width:0}
      .lg-a:last-child{border-bottom:0}
      .lg-a .lg-av{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;font-weight:700;color:#0d0f14}
      .lg-a .grow{flex:1 1 0;min-width:0}
      .lg-a .nom{font-weight:600;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-a .det{font-size:12px;line-height:1.35;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
      .lg-a .det b{color:var(--amber);font-weight:600}
      .lg-a .lg-top{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#0d0f14;background:var(--amber);border-radius:6px;padding:1px 5px;margin-inline-end:5px;vertical-align:1px}
      .lg .lg-a .btn.sm{flex:none;width:auto;min-width:78px;max-width:40%;padding:11px 10px;font-size:14px;margin:0}
      .lg .lg-mas{margin:0;border:0;background:none;color:var(--muted);font-size:13px;padding:10px 0 8px;text-decoration:underline}
      .lg-crear .lg-barra{height:12px;margin-top:10px}
      .lg-crear .lg-barra i{background:linear-gradient(90deg,#ffb020,#2ecc71)}
      .lg-crear .cifras{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;margin-top:6px}
      .lg-crear .cifras b{color:var(--amber)}
      .lg-sinasoc{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:18px 14px 14px}
      .lg-sinasoc .ei{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:#0f2440;border:1px dashed #1c3d66;color:#8cc4ff}
      .lg-sinasoc .ei .ico{width:28px;height:28px}
      .lg-sinasoc h3{margin:4px 0 0;font-size:18px}
      .lg-sinasoc p{margin:0;font-size:13.5px;line-height:1.4;color:var(--muted)}
      .lg-modos{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:8px}
      .lg .lg-modo{display:flex;align-items:center;gap:10px;width:100%;margin:0;padding:10px 12px;text-align:start;background:var(--panel2);border:1px solid var(--line);border-radius:12px;font-weight:600;color:var(--text)}
      .lg-modo .tile{width:36px;height:36px;border-radius:10px}
      .lg-modo .tile .ico{width:18px;height:18px;margin:0}
      .lg-modo .grow{flex:1 1 0;min-width:0}
      .lg-modo small{display:block;font-weight:400;font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-modo .flecha{flex:none;color:var(--muted);font-size:18px}`;
    document.head.appendChild(s);
  }

  /* ---------- Servidor ---------- */
  async function pedir(method, ruta, body) {
    const h = { 'Content-Type': 'application/json', 'X-Envivo': '1' };
    try { if (root.I18N && root.I18N.idioma) h['X-Envivo-Idioma'] = root.I18N.idioma; } catch (e) { /* nada */ }
    let r;
    try {
      r = await fetch(ruta, { method, headers: h, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { const err = new Error(T('liga.sin_internet')); err.red = true; throw err; }
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) {
      const err = new Error((j && j.error) || T('liga.error'));
      err.status = r.status; err.codigo = j && j.codigo;
      throw err;
    }
    j._http = r.status;
    return j;
  }

  /* ---------- Reglas compartidas con el servidor (Liga::cumple de server/src/Liga.php) ---------- */
  function cumple(c, contrato, res, equipo) {
    c = c || {}; contrato = contrato || {}; res = res || {};
    const est = res.estrellas !== undefined ? res.estrellas : res.stars;
    const duelo = res.duelo !== undefined ? res.duelo : res.duel;
    if ((est || 0) < Math.max(1, c.min_estrellas || 1)) return false;
    if (c.evento && c.evento.length && !c.evento.includes(contrato.type)) return false;
    if (c.stream && !contrato.stream) return false;
    if (c.outdoor && !contrato.outdoor) return false;
    if (c.min_diff && (contrato.diff || 0) < c.min_diff) return false;
    if (c.duelo === 'won' && duelo !== 'won') return false;
    if (c.sin_cortes) {
      if (!contrato.stream) return false;
      if ((res.incidentes || []).some((x) => CORTES.includes(x.clave) && x.q < 0)) return false;
    }
    if (c.senior && !((equipo && equipo.staff) || []).some((p) => p.tier === 'senior' || p.tier === 'internacional' || (p.skill || 0) >= 4)) return false;
    return true;
  }

  function memoria(s) {
    if (!s || typeof s !== 'object') return null;
    if (!s.liga || typeof s.liga !== 'object') s.liga = {};
    if (!Array.isArray(s.liga.pendientes)) s.liga.pendientes = [];
    if (!Array.isArray(s.liga.registro)) s.liga.registro = [];
    return s.liga;
  }

  /* Avance del encargo: lo que ya contó el servidor + lo jugado aquí que todavía no se envió (y que cumple). */
  function progresoLocal(s, tarea) {
    const meta = Math.max(1, (tarea && tarea.meta) || 1);
    const servidor = Math.min(meta, (tarea && tarea.avance) || 0);
    const L = s && s.liga && typeof s.liga === 'object' ? s.liga : {};
    const mias = (Array.isArray(L.pendientes) ? L.pendientes : []).filter((p) => tarea && p.tarea_id === tarea.id);
    const buenas = mias.filter((p) => cumple(tarea.criterio, p.contrato, p.resultado, p.equipo)).length;
    const jugados = (Array.isArray(L.registro) ? L.registro : []).filter((r) => tarea && r.tarea_id === tarea.id).length;
    const hecho = Math.min(meta, servidor + buenas);
    return { servidor, pendientes: buenas, por_enviar: mias.length, jugados, hecho, meta, pct: Math.round((hecho / meta) * 100), listo: hecho >= meta };
  }

  /* Equipo que se registra en el servidor para el intento: todo el personal y los equipos que funcionan. */
  function equipoDe(s) {
    const ent = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
    let dueno = false;
    const staff = ((s && s.staff) || []).slice(0, 12).map((p) => {
      const o = { role: String(p.role), skill: ent(p.skill, 1, 5, 1), morale: ent(p.morale, 0, 100, 80) };
      if (p.owner && !dueno) { o.owner = true; dueno = true; }
      if (p.name) o.name = String(p.name).slice(0, 40);
      if (p.tier) o.tier = String(p.tier);
      return o;
    });
    const equip = ((s && s.equip) || []).filter((e) => e && e.type && e.condition >= 1).slice(0, 40).map((e) => ({ type: String(e.type), condition: ent(e.condition, 1, 100, 1) }));
    return { staff, equip };
  }

  /* ---------- Tiempo ---------- */
  function tiempo(seg) {
    seg = Math.max(0, Math.floor(seg));
    const d = Math.floor(seg / 86400), h = Math.floor(seg / 3600) % 24, m = Math.floor(seg / 60) % 60, x = seg % 60;
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
    return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
  }
  const pasado = () => (Date.now() - st.base) / 1000;
  const quedan = (seg) => (seg == null ? null : seg - pasado());

  function tic() {
    if (!st.el || !st.el.isConnected) { clearInterval(st.reloj); st.reloj = null; return; }
    let recargar = false;
    st.el.querySelectorAll('[data-cuenta]').forEach((n) => {
      const q = quedan(Number(n.dataset.cuenta));
      if (q <= 0 && n.dataset.recargar) recargar = true;
      n.textContent = T(n.dataset.texto, { t: tiempo(q) });
    });
    // Sin asociación se mira más seguido: así, si la crea desde el chat, la liga aparece enseguida
    const cada = st.datos && st.datos.sin_asociacion ? 15000 : 60000;
    if ((recargar || Date.now() - st.cargadoEn > cada) && !st.cargando && !st.ocupado) cargar();
  }

  /* ---------- Pintar ---------- */
  function cabecera(d) {
    const L = d.liga || (d.ligas || [])[0];
    const a = d.asociacion;
    const max = d.banderas && d.banderas.length ? d.banderas[d.banderas.length - 1].puntos : 1;
    const pct = Math.min(100, ((a ? a.puntos : 0) / max) * 100);
    return `<div class="card">
      <div class="lg-head">${escudo(L, 54)}
        <div class="grow"><div class="lg-liga" style="color:${esc(L.color)}">${esc(L.nombre)}</div>
          ${a ? `<div class="lg-asoc"><span class="lg-sig" style="background:${esc(a.color)}">${esc(a.siglas)}</span><span>${esc(a.nombre)}</span></div>` : ''}
          <div class="lg-reloj">${icon('clock')}<span data-cuenta="${d.semana.quedan_seg}" data-texto="liga.termina" data-recargar="1">${esc(T('liga.termina', { t: tiempo(d.semana.quedan_seg) }))}</span></div></div>
        <div class="lg-chip"><b>${ficha(16)}<span class="num" id="liga-fichas">${num(d.fichas)}</span></b><small>${esc(T('liga.fichas'))}</small></div></div>
      ${a ? `<div class="lg-score"><div class="row between"><span class="muted">${esc(T('liga.banderas'))}</span><b class="num">${num(a.puntos)} <span class="muted small">${esc(T('liga.pts'))}</span></b></div>
        <div class="lg-pista" role="img" aria-label="${esc(num(a.puntos) + ' ' + T('liga.puntos'))}"><i style="width:${pct}%"></i>
          ${d.banderas.map((b) => `<span class="lg-flag ${b.alcanzada ? 'on' : ''}" style="left:${(b.puntos / max) * 100}%" title="${esc(T('liga.bandera_n', { n: b.n, p: num(b.puntos), f: b.fichas }))}">${bandera(b.alcanzada, 15)}</span>`).join('')}</div>
        <div class="lg-flags-lbl"><span>0</span>${d.banderas.map((b) => `<span>${num(b.puntos)}</span>`).join('')}</div></div>` : ''}
    </div>`;
  }

  function pestanas(d) {
    const v = ['encargos', 'grupo', 'tienda'];
    return `<div class="lg-tabs" role="tablist">${v.map((k) => `<button role="tab" data-liga="vista" data-v="${k}" class="${st.vista === k ? 'on' : ''}" aria-selected="${st.vista === k}">${esc(T('liga.tab.' + k))}</button>`).join('')}</div>`;
  }

  function iniciales(n) { return esc(String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()); }

  function tarjeta(t, d) {
    if (t.estado === 'espera') {
      return `<div class="lg-t espera" data-tarea="${t.id}">${icon('clock', 'lg')}<span data-cuenta="${t.aparece_seg}" data-texto="liga.nuevo_en" data-recargar="1">${esc(T('liga.nuevo_en', { t: tiempo(t.aparece_seg) }))}</span></div>`;
    }
    const mia = !!t.mia, tomada = t.estado === 'tomada';
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    const pr = mia ? progresoLocal(s, t) : { hecho: t.avance, meta: t.meta, pct: Math.round((t.avance / t.meta) * 100) };
    const puedoTomar = !d.mi_tarea && d.mis_tareas && d.mis_tareas.usadas < d.mis_tareas.max;
    const tono = mia ? 't-red' : tomada ? '' : 't-amber';
    return `<div class="lg-t ${tomada ? 'tomada' : ''} ${mia ? 'mia' : ''}" data-tarea="${t.id}">
      <div class="lg-t-top"><div class="tile ${tono}">${icon(t.icono)}</div><span class="lg-pts">+${num(t.puntos)}</span></div>
      <h4>${esc(t.titulo)}</h4>
      ${tomada ? `<div class="quien"><b>${iniciales(t.jugador && t.jugador.nombre)}</b><span>${esc(mia ? T('liga.tuyo') : T('liga.lo_hace', { n: (t.jugador && t.jugador.nombre) || '?' }))}</span></div>
          <div class="lg-barra" style="margin-top:0"><i style="width:${pr.pct}%"></i></div>` : ''}
      <div class="meta"><span>${icon('check')}${pr.hecho}/${t.meta}</span><span>${icon('clock')}${esc(T('liga.horas', { n: t.horas }))}</span></div>
      ${!tomada ? `<div class="lg-t-acc"><button class="btn sm ${puedoTomar ? 'main' : ''}" data-liga="tomar" data-id="${t.id}" ${puedoTomar ? '' : 'disabled'}>${esc(T('liga.tomar'))}</button>
        ${d.asociacion && d.asociacion.puede_descartar ? `<button class="lg-x" data-liga="descartar" data-id="${t.id}" title="${esc(T('liga.descartar'))}" aria-label="${esc(T('liga.descartar') + ': ' + t.titulo)}">${icon('close')}</button>` : ''}</div>` : ''}
    </div>`;
  }

  function miEncargo(d) {
    const t = d.mi_tarea;
    const m = d.mis_tareas || { usadas: 0, max: 9 };
    const usados = `<p class="small muted" style="margin:8px 0 0">${esc(T('liga.usados', { n: m.usadas, max: m.max }))}</p>`;
    if (!t) return `<div class="card"><div class="lg-et">${esc(T('liga.mi_encargo'))}</div><p class="small" style="margin:6px 0 0">${esc(T('liga.sin_encargo'))}</p>${usados}</div>`;
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    const pr = progresoLocal(s, t);
    const pSrv = Math.round((pr.servidor / pr.meta) * 100), pPen = pr.pct - pSrv;
    const puedeJugar = !!(st.ctx && st.ctx.jugarIntento);
    return `<div class="card lg-mia">
      <div class="row between"><span class="lg-et">${esc(T('liga.mi_encargo'))}</span><span class="lg-pts">+${num(t.puntos)} ${esc(T('liga.pts'))}</span></div>
      <div class="row" style="margin-top:8px"><div class="tile t-red">${icon(t.icono)}</div><div class="grow"><h3>${esc(t.titulo)}</h3>
        <div class="small muted"><span data-cuenta="${t.vence_seg}" data-texto="liga.vence">${esc(T('liga.vence', { t: tiempo(t.vence_seg) }))}</span></div></div></div>
      <div class="row between small" style="margin-top:10px"><span><b class="num">${pr.hecho}/${pr.meta}</b>${pr.pendientes ? ` <span style="color:var(--amber)">${esc(T('liga.por_enviar', { n: pr.pendientes }))}</span>` : ''}</span>
        ${pr.listo ? `<span class="up">${esc(T('liga.listo'))}</span>` : ''}</div>
      <div class="lg-barra"><i style="width:${pSrv}%"></i>${pPen > 0 ? `<i class="pend" style="width:${pPen}%"></i>` : ''}</div>
      <div class="lg-acc">
        ${pr.por_enviar ? `<button class="btn main" data-liga="enviar">${icon('cloud')}${esc(T('liga.enviar', { n: pr.por_enviar }))}</button>`
          : `<button class="btn main" data-liga="jugar" ${puedeJugar && !pr.listo ? '' : 'disabled'}>${icon('play')}${esc(T('liga.jugar'))}</button>`}
        <button class="btn sm" data-liga="abandonar">${esc(T('liga.abandonar'))}</button></div>
      ${usados}</div>`;
  }

  function vistaEncargos(d) {
    const hechas = d.hechas || [];
    return `${miEncargo(d)}
      <div class="sectitle">${esc(T('liga.tablero'))}</div>
      <div class="lg-grid">${(d.tablero || []).map((t) => tarjeta(t, d)).join('')}</div>
      ${hechas.length ? `<div class="sectitle">${esc(T('liga.hechas'))} (${hechas.length})</div><div class="card" style="padding:4px 14px">
        ${hechas.map((h) => `<div class="lg-hecha">${icon(h.icono, 'sm')}<span class="grow">${esc(h.titulo)}</span><span class="small muted">${esc((h.jugador && h.jugador.nombre) || '?')}</span><span class="lg-pts" style="flex:none">+${num(h.puntos)}</span></div>`).join('')}</div>` : ''}`;
  }

  function vistaGrupo(d) {
    const g = d.grupo;
    if (!g) return '';
    const u = d.ultima_semana;
    const ligas = d.ligas || [];
    return `${u ? `<div class="card small">${icon(u.resultado === 'sube' ? 'trend' : u.resultado === 'baja' ? 'refresh' : 'check', 'sm')} ${esc(T('liga.ultima', { p: u.posicion, f: num(u.fichas_ganadas), r: T('liga.r.' + u.resultado, { l: u.liga_nueva ? u.liga_nueva.nombre : '' }) }))}</div>` : ''}
      <div class="card" style="padding:10px 12px">
        <div class="row between"><h3>${esc(T('liga.grupo', { n: g.numero }))}</h3><span class="small" style="color:${esc(g.liga.color)}">${esc(g.liga.nombre)}</span></div>
        <table class="lg-rank" style="margin-top:6px"><tbody>
        ${g.ranking.map((r) => `<tr class="${r.zona || ''} ${r.mia ? 'mia' : ''}">
          <td class="pos">${r.posicion}</td>
          <td class="nom"><span class="lg-sig" style="background:${esc(r.color)}">${esc(r.siglas)}</span> ${esc(r.nombre)}<small>${r.mia ? esc(T('liga.tu_asociacion')) + ' · ' : ''}${r.zona === 'sube' ? `<span class="up">${esc(T('liga.sube'))}</span>` : r.zona === 'baja' ? `<span class="down">${esc(T('liga.baja'))}</span>` : esc(r.servidor || '')}</small></td>
          <td class="fl">${Array.from({ length: 4 }, (_, k) => bandera(k < r.banderas, 13)).join('')}</td>
          <td class="pt">${num(r.puntos)}</td></tr>`).join('')}
        </tbody></table>
        <p class="small muted" style="margin:10px 0 0">${esc(T('liga.grupo_txt'))}</p>
        <div class="lg-escalera">${ligas.map((l) => `<span class="${d.liga && l.indice === d.liga.indice ? 'on' : ''}" style="${d.liga && l.indice === d.liga.indice ? `background:${esc(l.color)};border-color:${esc(l.color)}` : `border-color:${esc(l.color)}55`}">${esc(l.nombre.replace(/^Liga /, ''))}</span>`).join('')}</div>
      </div>`;
  }

  function vistaTienda() {
    const t = st.tienda;
    if (!t) return `<div class="card lg-vacio">${esc(T('liga.cargando'))}</div>`;
    return `<div class="card"><div class="row between"><b>${esc(T('liga.fichas_de_liga'))}</b><span class="lg-precio" style="font-size:18px">${ficha(20)} ${num(t.fichas)}</span></div>
        <p class="small muted" style="margin:6px 0 0">${esc(T('liga.tienda_txt'))}</p></div>
      ${(t.articulos || []).map((a) => {
        const falta = a.fichas - t.fichas;
        const extra = a.motivo === 'Ya lo tienes' ? T('liga.tienes') : a.motivo || (!a.alcanza ? T('liga.te_faltan', { n: num(falta) }) : a.max_semana ? T('liga.limite', { c: a.compradas_semana, m: a.max_semana }) : '');
        return `<div class="card lg-art"><div class="tile ${a.tipo === 'cosmetico' ? 't-blue' : 't-amber'}">${icon(a.icono)}</div>
          <div class="grow"><h4>${esc(a.nombre)}</h4><p>${esc(a.detalle)}</p><span class="lg-precio small">${ficha(14)} ${num(a.fichas)}</span></div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><button class="btn sm ${a.disponible && a.alcanza ? 'main' : ''}" data-liga="canjear" data-id="${esc(a.id)}" ${a.disponible && a.alcanza ? '' : 'disabled'}>${esc(T('liga.canjear'))}</button>
          ${extra ? `<span class="motivo">${esc(extra)}</span>` : ''}</div></div>`;
      }).join('')}`;
  }

  /* ---------- Sin asociación: unirse en un toque, crear una o jugar otros modos ---------- */
  const MODOS_LIBRES = [['duelos', 'rival', 't-red'], ['desafio', 'target', 't-green'], ['copa', 'crown', 't-amber']];   // no piden asociación (el Festival sí)
  const VISIBLES = 5;
  const colorOk = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8b95a8');
  const irModo = () => (st.ctx && typeof st.ctx.abrirModo === 'function' ? st.ctx.abrirModo : typeof root.EnVivoAbrirOnline === 'function' ? root.EnVivoAbrirOnline : null);

  /* Lista para unirse: la que trae GET /api/liga (asociaciones) o, si es un servidor viejo, GET /api/asociaciones.
     Sin las llenas; primero las de entrada libre y, entre ellas, las más activas (puntos y encargos de la semana, miembros). */
  function listaAsoc(d) {
    const l = Array.isArray(d.asociaciones) ? d.asociaciones : st.asocs && Array.isArray(st.asocs.lista) ? st.asocs.lista : null;
    if (!l) return null;
    const act = (a) => [Number(a.puntos_semana) || 0, Number(a.tareas_semana) || 0, Number(a.miembros) || 0, Number(a.fama) || 0];
    return l.filter((a) => a && (Number(a.miembros) || 0) < (Number(a.max_miembros) || 20)).map((a, i) => ({ a, i })).sort((x, y) => {
      const lx = x.a.ingreso === 'solicitud' ? 1 : 0, ly = y.a.ingreso === 'solicitud' ? 1 : 0;
      if (lx !== ly) return lx - ly;
      const ax = act(x.a), ay = act(y.a);
      for (let k = 0; k < ax.length; k++) if (ax[k] !== ay[k]) return ay[k] - ax[k];
      return x.i - y.i;
    }).map((x) => x.a);
  }
  function datosCrear(d) {
    const c = d.crear || (st.asocs && st.asocs.crear) || {};
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    const costo = Math.max(1, Number(c.costo) || 5000);
    const tengo = Math.max(0, Math.floor(Number(s && s.money) || 0));
    return { costo, tengo, gratis: !!c.gratis, alcanza: !!c.gratis || tengo >= costo, pct: Math.min(100, Math.round((tengo / costo) * 100)) };
  }

  function filaAsoc(a, primera) {
    const libre = a.ingreso !== 'solicitud';
    const pts = Number(a.puntos_semana) || 0;
    const det = [T('liga.n.miembros', { n: Number(a.miembros) || 0, max: Number(a.max_miembros) || 20 }),
      pts > 0 ? `<b>${esc(T('liga.n.pts_semana', { p: num(pts) }))}</b>` : a.liga && a.liga.nombre ? esc(a.liga.nombre) : '',
      libre ? '' : esc(T('liga.n.con_solicitud'))].filter(Boolean);
    const btn = a.solicitud_enviada ? `<button class="btn sm" disabled>${esc(T('liga.n.pedida'))}</button>`
      : `<button class="btn sm ${libre ? 'main' : ''}" data-liga="unirme" data-id="${Number(a.id)}" ${st.ocupado ? 'disabled' : ''} aria-label="${esc(T(libre ? 'liga.n.unirme' : 'liga.n.pedir') + ': ' + a.nombre)}">${esc(T(libre ? 'liga.n.unirme' : 'liga.n.pedir'))}</button>`;
    return `<div class="lg-a" data-asoc="${Number(a.id)}"><span class="lg-av" style="background:${colorOk(a.color)}">${esc(a.siglas)}</span>
      <div class="grow"><div class="nom">${esc(a.nombre)}</div>
        <div class="det">${primera && pts > 0 ? `<span class="lg-top">${esc(T('liga.n.activa'))}</span>` : ''}${det.map((x, i) => (i === 0 ? esc(x) : x)).join(' · ')}</div></div>${btn}</div>`;
  }

  function botonesModos() {
    if (!irModo()) return '';
    return `<div class="lg-modos">${MODOS_LIBRES.map(([k, ic, tono]) => `<button class="lg-modo" data-liga="modo" data-k="${k}">
      <span class="tile ${tono}">${icon(ic)}</span><span class="grow">${esc(T('online.' + k))}<small>${esc(T('online.' + k + '_det'))}</small></span><span class="flecha" aria-hidden="true">›</span></button>`).join('')}</div>`;
  }

  function tarjetaCrear(d, hayLista) {
    const c = datosCrear(d);
    const puede = c.alcanza && !!(st.ctx && st.ctx.abrirAsociaciones);
    return `<div class="card lg-crear">
      <div class="lg-intro"><div class="tile t-amber">${icon('flag')}</div><div class="grow"><h3>${esc(T('liga.n.crear_t'))}</h3>
        <p>${esc(c.gratis ? T('liga.n.crear_gratis') : T('liga.n.crear_txt', { c: dinero(c.costo) }))}</p></div></div>
      ${c.gratis ? '' : `<div class="lg-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${c.costo}" aria-valuenow="${Math.min(c.tengo, c.costo)}" aria-label="${esc(T('liga.n.tienes', { m: dinero(c.tengo), c: dinero(c.costo) }))}"><i style="width:${c.pct}%"></i></div>
        <div class="cifras"><span>${esc(T('liga.n.tienes', { m: dinero(Math.min(c.tengo, c.costo)), c: dinero(c.costo) }))}</span>${c.alcanza ? `<span class="up">${icon('check', 'sm')}</span>` : `<b>${esc(T('liga.n.faltan', { m: dinero(c.costo - c.tengo) }))}</b>`}</div>
        ${c.alcanza ? '' : `<p class="small muted" style="margin:6px 0 0">${esc(T('liga.n.faltan_txt'))}</p>`}`}
      <button class="btn ${puede ? (hayLista ? '' : 'main') : ''}" data-liga="crear" ${puede ? '' : 'disabled'}>${icon('flag')}${esc(T('liga.n.crear'))}</button></div>`;
  }

  function vistaSinAsociacion(d) {
    const lista = listaAsoc(d);
    const intro = `<div class="card"><div class="lg-intro"><div class="tile t-blue">${icon('people')}</div><div class="grow">
      <h3>${esc(T('liga.n.titulo'))}</h3><p>${esc(T('liga.n.txt'))}</p></div></div></div>`;
    if (!lista) {
      const err = st.asocs && st.asocs.error;
      return `${intro}<div class="sectitle">${esc(T('liga.n.buscar'))}</div>
        <div class="card ${err ? '' : 'lg-vacio'}" data-liga-lista="${err ? 'error' : 'cargando'}">${err ? `<p class="small neg" style="margin:0">${esc(T('liga.n.error_lista'))}</p>
          <button class="btn sm" data-liga="recargar" style="margin-top:10px">${esc(T('liga.reintentar'))}</button>
          ${st.ctx && st.ctx.abrirAsociaciones ? `<button class="btn" data-liga="asociaciones">${icon('people')}${esc(T('liga.ir_asociaciones'))}</button>` : ''}` : esc(T('liga.n.buscando'))}</div>
        ${tarjetaCrear(d, false)}`;
    }
    if (!lista.length) {
      return `${intro}<div class="card lg-sinasoc" data-liga-lista="vacia"><div class="ei">${icon('people')}</div>
          <h3>${esc(T('liga.n.vacio_t'))}</h3><p>${esc(T('liga.n.vacio_txt'))}</p>${botonesModos()}</div>
        ${tarjetaCrear(d, false)}`;
    }
    const ver = st.verTodas ? lista : lista.slice(0, VISIBLES);
    const resto = lista.length - ver.length;
    const modos = botonesModos();
    return `${intro}<div class="sectitle">${esc(T('liga.n.buscar'))} (${lista.length})</div>
      <div class="card lg-lista" data-liga-lista="llena">${ver.map((a, i) => filaAsoc(a, i === 0)).join('')}
        ${resto > 0 ? `<button class="btn lg-mas" data-liga="ver_mas">${esc(T('liga.n.ver_mas', { n: resto }))}</button>` : ''}</div>
      ${tarjetaCrear(d, true)}
      ${modos ? `<div class="sectitle">${esc(T('liga.n.otros'))}</div>${modos}` : ''}`;
  }

  function pintar() {
    const el = st.el;
    if (!el) return;
    const d = st.datos;
    if (!d) {
      el.innerHTML = st.error ? `<div class="card"><p class="small neg">${esc(st.error)}</p><button class="btn sm" data-liga="recargar">${esc(T('liga.reintentar'))}</button></div>`
        : `<div class="card lg-vacio">${esc(T('liga.cargando'))}</div>`;
      return;
    }
    if (d.sin_asociacion) {
      el.innerHTML = `<div class="lg">${cabecera(d)}${vistaSinAsociacion(d)}
        ${st.vista === 'tienda' ? vistaTienda() : `<button class="btn" data-liga="vista" data-v="tienda">${ficha(16)} ${esc(T('liga.tab.tienda'))}</button>`}</div>`;
      return;
    }
    el.innerHTML = `<div class="lg">${cabecera(d)}${pestanas(d)}
      <div data-vista="${st.vista}">${st.vista === 'grupo' ? vistaGrupo(d) : st.vista === 'tienda' ? vistaTienda() : vistaEncargos(d)}</div></div>`;
  }

  async function cargar() {
    if (st.cargando) return;
    st.cargando = true;
    try {
      st.datos = await pedir('GET', '/api/liga');
      st.base = Date.now(); st.cargadoEn = Date.now(); st.error = '';
      if (st.datos && st.datos.sin_asociacion && !Array.isArray(st.datos.asociaciones)) await cargarAsociaciones();
      if (st.vista === 'tienda') await cargarTienda(true);
    } catch (e) { st.error = e.message; if (!st.datos) st.datos = null; }
    st.cargando = false;
    pintar();
  }
  async function cargarAsociaciones() {
    try {
      const r = await pedir('GET', '/api/asociaciones?buscar=');
      st.asocs = { lista: Array.isArray(r.asociaciones) ? r.asociaciones : [], crear: { costo: r.costo_crear, gratis: !!(r.puede_crear && r.puede_crear.gratis) } };
    } catch (e) { st.asocs = { error: e.message }; }
  }
  async function cargarTienda(sinPintar) {
    try { st.tienda = await pedir('GET', '/api/liga/tienda'); } catch (e) { toast(e.message); }
    if (!sinPintar) pintar();
  }

  function toast(m) { if (st.ctx && st.ctx.toast) st.ctx.toast(m); }
  function preguntar(html, boton, fn) { if (st.ctx && st.ctx.ask) st.ctx.ask(html, boton, fn); else fn(); }
  function guardar() { try { if (st.ctx && st.ctx.guardar) st.ctx.guardar(); } catch (e) { /* nada */ } }
  function usar(j) { if (j && j.liga) { st.datos = j.liga; st.base = Date.now(); st.cargadoEn = Date.now(); } }

  async function accion(fn) {
    if (st.ocupado) return;
    st.ocupado = true;
    try { await fn(); } catch (e) { toast(e.message); if (e.status === 409 || e.status === 404) await cargar(); } finally { st.ocupado = false; pintar(); }
  }

  /* Manda un resultado guardado. Lo saca de la lista salvo que no haya internet (se reintenta después). */
  async function enviarUno(s, p) {
    try {
      const r = await pedir('POST', '/api/liga/completar', { intento_id: p.intento_id, firma: p.firma, decisiones: p.decisiones, resultado: p.resultado });
      quitarPendiente(s, p);
      const reg = memoria(s);
      if (reg) { const x = reg.registro.find((y) => y.intento_id === p.intento_id); if (x) x.cuenta = !!(r.intento && r.intento.cuenta); }
      usar(r);
      if (r.tarea_completada) toast(T('liga.completado', { p: num(r.puntos) }));
      else if (r.intento && r.intento.estado === 'pendiente') toast(T('liga.pendiente'));
      else if (r.intento && r.intento.cuenta) { const t = st.datos && st.datos.mi_tarea; toast(T('liga.cuenta', { a: t ? t.avance : '?', m: t ? t.meta : '?' })); }
      else toast(T('liga.no_cuenta'));
      return true;
    } catch (e) {
      if (!e.red) quitarPendiente(s, p);   // el servidor lo rechazó: no sirve reintentar
      throw e;
    }
  }
  function quitarPendiente(s, p) { const L = memoria(s); if (L) L.pendientes = L.pendientes.filter((x) => x.intento_id !== p.intento_id); guardar(); }

  async function jugar() {
    const ctx = st.ctx;
    if (!ctx || !ctx.jugarIntento) { toast(T('liga.sin_juego')); return; }
    const s = ctx.estado ? ctx.estado() : null;
    const equipo = ctx.equipoIntento ? ctx.equipoIntento(s) : equipoDe(s);
    const r = await pedir('POST', '/api/liga/intento', { equipo });
    const it = r.intento;
    const jugado = await ctx.jugarIntento(it);
    if (!jugado || !Array.isArray(jugado.decisiones)) return;   // lo cerró sin terminar: el intento se vence solo
    const res = jugado.resultado || {};
    const p = { intento_id: it.id, tarea_id: it.tarea_id, firma: it.firma, contrato: it.contrato, equipo: it.equipo, decisiones: jugado.decisiones,
      resultado: { calidad: res.calidad !== undefined ? res.calidad : res.quality, estrellas: res.estrellas !== undefined ? res.estrellas : res.stars,
        duelo: res.duelo !== undefined ? res.duelo : (res.duel || null), incidentes: res.incidentes || [] } };
    const L = memoria(s);
    if (L) {
      L.pendientes.push(p);
      L.registro.unshift({ intento_id: it.id, tarea_id: it.tarea_id, tipo: it.contrato.type, calidad: p.resultado.calidad, estrellas: p.resultado.estrellas, cuenta: null, fecha: new Date().toISOString() });
      L.registro.length = Math.min(L.registro.length, 30);
      guardar();
    }
    await enviarUno(s, p);
  }

  async function enviarPendientes() {
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    const L = memoria(s);
    for (const p of (L ? L.pendientes.slice() : [])) await enviarUno(s, p);
  }

  /* Unirse en un toque (POST /api/asociaciones/unirse). Con "solicitud" queda pedida; si entra, se abre su liga. */
  async function unirme(id) {
    const lista = listaAsoc(st.datos || {}) || [];
    const a = lista.find((x) => Number(x.id) === id) || { id, nombre: '' };
    let r;
    try { r = await pedir('POST', '/api/asociaciones/unirse', { id }); } catch (e) {
      if (e.codigo === 'llena') { const err = new Error(T('liga.n.llena')); err.status = 409; throw err; }
      throw e;
    }
    if (r.estado === 'solicitud') { a.solicitud_enviada = true; toast(T('liga.n.solicitud', { n: a.nombre })); return; }
    toast(T('liga.n.unido', { n: (r.asociacion && r.asociacion.nombre) || a.nombre }));
    const f = st.ctx && (st.ctx.alUnirse || st.ctx.alCanjear);   // ui.js: refresca /api/estado (chat, festival… ya ven la asociación)
    try { if (f) f(r); } catch (e) { /* nada */ }
    st.vista = 'encargos'; st.asocs = null; st.verTodas = false;
    for (let n = 0; st.cargando && n < 50; n++) await new Promise((ok) => setTimeout(ok, 100));   // una recarga en curso traería la liga de antes
    await cargar();
  }
  /* Crear: el formulario y el cobro están en el chat (js/chat.js); se abre directo en "Crear asociación". */
  function abrirCrear() {
    if (!st.ctx || !st.ctx.abrirAsociaciones) return;
    st.ctx.abrirAsociaciones();
    if (typeof document === 'undefined') return;
    let n = 0;
    const t = setInterval(() => {
      const b = document.querySelector('#chat-panel [data-chat="crear"]');
      if (b) { clearInterval(t); b.click(); } else if (++n > 40) clearInterval(t);
    }, 75);
  }

  function clic(b) {
    const acc = b.dataset.liga, id = Number(b.dataset.id);
    const d = st.datos || {};
    const tarea = (d.tablero || []).find((t) => t.id === id);
    if (acc === 'recargar') { st.error = ''; pintar(); cargar(); return; }
    if (acc === 'vista') { st.vista = b.dataset.v; pintar(); if (st.vista === 'tienda') cargarTienda(); return; }
    if (acc === 'asociaciones') { st.ctx.abrirAsociaciones(); return; }
    if (acc === 'unirme') { accion(() => unirme(id)); return; }
    if (acc === 'crear') { abrirCrear(); return; }
    if (acc === 'ver_mas') { st.verTodas = true; pintar(); return; }
    if (acc === 'modo') { const f = irModo(); if (f) f(b.dataset.k); return; }
    if (acc === 'tomar') { accion(async () => { usar(await pedir('POST', '/api/liga/tomar', { tarea_id: id })); toast(T('liga.tomado')); }); return; }
    if (acc === 'descartar' && tarea) {
      preguntar(T('liga.descartar_pregunta', { t: esc(tarea.titulo) }), T('liga.descartar'), () => accion(async () => { usar(await pedir('POST', '/api/liga/descartar', { tarea_id: id })); toast(T('liga.descartado')); }));
      return;
    }
    if (acc === 'abandonar' && d.mi_tarea) {
      preguntar(T('liga.abandonar_pregunta', { t: esc(d.mi_tarea.titulo) }), T('liga.abandonar'), () => accion(async () => { usar(await pedir('POST', '/api/liga/abandonar', {})); toast(T('liga.abandonado')); }));
      return;
    }
    if (acc === 'jugar') { accion(jugar); return; }
    if (acc === 'enviar') { accion(enviarPendientes); return; }
    if (acc === 'canjear') {
      const a = st.tienda && (st.tienda.articulos || []).find((x) => x.id === b.dataset.id);
      if (!a) return;
      preguntar(T('liga.canjear_pregunta', { n: esc(a.nombre), f: num(a.fichas) }), T('liga.canjear'), () => accion(async () => {
        const r = await pedir('POST', '/api/liga/tienda', { articulo: a.id });
        st.tienda = r.tienda || st.tienda;
        if (st.datos) st.datos.fichas = r.fichas;
        toast(T('liga.canjeado', { n: a.nombre }));
        if (st.ctx && st.ctx.alCanjear) st.ctx.alCanjear(r);   // ui.js: refrescar /api/estado y aplicar la entrega
      }));
    }
  }

  root.Liga = {
    render(el, ctx) {
      css();
      st.el = el; st.ctx = ctx || {};
      pintar();
      cargar();
      el.onclick = (ev) => { const b = ev.target.closest('[data-liga]'); if (b && !b.disabled && el.contains(b)) clic(b); };
      if (!st.reloj) st.reloj = setInterval(tic, 1000);
    },
    recargar: () => cargar(),
    invalidar() { st.datos = null; st.tienda = null; st.error = ''; st.asocs = null; st.verTodas = false; },
    progresoLocal, cumple, equipoDe, tiempo,
    enviarPendientes: () => enviarPendientes().catch(() => false),
    _estado: st,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Liga;
})(typeof window !== 'undefined' ? window : globalThis);
