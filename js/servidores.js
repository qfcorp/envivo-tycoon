/* =========================================================
   EN VIVO Tycoon — Tu servidor: salud, mudanza voluntaria y aviso de fusión (pantalla)
   Contrato: server/COPAS.md §1 y §3.
     GET  /api/servidor/opciones → { actual:{id, nombre, estado:'sano'|'bajo'|'abandono', activos_7, universo?},
                                     sugerido:{id, nombre, activos_7}|null, puede:bool, motivo|null, proximo_traslado|null,
                                     universo?:{id, nombre} }
     POST /api/servidor/trasladar {destino} → mudanza gratis (1 vez cada 30 días; el servidor decide).
     /api/estado.aviso_fusion {de, a, fecha} → ventana amable una sola vez (se recuerda en localStorage).
   Se registra como tarjeta de Inicio (window.EnVivoInicio, orden 5) y solo se ve con sesión iniciada.
   Textos: diccionario ES y TRAD[código] aquí mismo, elegido por I18N.idioma (respaldo: español).
   API para pruebas: window.Servidores = { tarjeta, clic, recargar, invalidar, T, ES, TRAD }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'servidores';
  const CLAVE_AVISOS = 'envivo_avisos_fusion_vistos';
  const VIGENCIA_MS = 10 * 60 * 1000;   // las opciones se vuelven a pedir cada 10 minutos (o al cambiar de servidor)
  const REINTENTO_MS = 60 * 1000;       // si falló, no se reintenta antes de 1 minuto

  /* ---------- Textos ---------- */
  const ES = {
    tu_servidor: 'Tu servidor', cargando: 'Revisando tu servidor…',
    'estado.sano': 'Sano', 'estado.bajo': 'Poca actividad', 'estado.abandono': 'En abandono',
    txt_bajo: 'Últimamente hay poca gente jugando en tu servidor.',
    txt_abandono: 'Tu servidor se está quedando vacío. Tu productora está a salvo.',
    mudar: 'Mudarte gratis a {s} (más activo)',
    activos: '{a} productoras activas esta semana allá · {b} en el tuyo',
    no_puede: 'Por ahora no puedes mudarte: {m}',
    proximo: 'Podrás mudarte desde el {f}.',
    sin_sugerido: 'Estamos buscando un servidor más activo para ti.',
    'modal.titulo': 'Mudarte a {s}',
    'modal.intro': 'Es gratis y te llevas todo lo tuyo. Puedes mudarte 1 vez cada 30 días.',
    'modal.lleva': 'Se muda contigo',
    'lleva.prod': 'Tu productora: dinero del juego, personal, fama y avance',
    'lleva.equipos': 'Todos tus equipos',
    'lleva.creditos': 'Tus créditos',
    'lleva.vip': 'Tu VIP',
    'modal.cambia': 'Lo que cambia',
    'cambia.asoc': 'Dejas tu asociación. Allá puedes unirte a una o crear la tuya.',
    'cambia.chat': 'El chat, el ranking y la Copa de Servidores pasan a ser los de tu nuevo servidor.',
    'modal.si': 'Sí, mudarme', 'modal.no': 'Ahora no', mudando: 'Mudándote…',
    listo: '¡Listo! Ya estás en {s}.', error: 'No se pudo hacer la mudanza. Intenta de nuevo.',
    'fusion.titulo': '¡Tu servidor se unió con {a}!',
    'fusion.txt': 'El {f}, {de} se unió con {a} para que tengas más productoras con quién jugar.',
    'fusion.txt_sin_fecha': '{de} se unió con {a} para que tengas más productoras con quién jugar.',
    'fusion.salvo': 'Tu productora y todo lo tuyo están a salvo: dinero del juego, equipos, créditos y VIP.',
    'fusion.nombre': 'Si tu nombre o el de tu asociación ya existía allá, le agregamos un pequeño cambio para que no se repita.',
    'fusion.ok': '¡Vamos!', cerrar: 'Cerrar',
  };
  const TRAD = {
    en: {
      tu_servidor: 'Your server', cargando: 'Checking your server…',
      'estado.sano': 'Healthy', 'estado.bajo': 'Low activity', 'estado.abandono': 'Abandoned',
      txt_bajo: 'Not many people have been playing on your server lately.',
      txt_abandono: 'Your server is emptying out. Your production company is safe.',
      mudar: 'Move for free to {s} (more active)',
      activos: '{a} active companies there this week · {b} on yours',
      no_puede: 'You can’t move right now: {m}',
      proximo: 'You can move again from {f}.',
      sin_sugerido: 'We’re looking for a more active server for you.',
      'modal.titulo': 'Move to {s}',
      'modal.intro': 'It’s free and you take everything with you. You can move once every 30 days.',
      'modal.lleva': 'Moves with you',
      'lleva.prod': 'Your company: in-game money, staff, fame and progress',
      'lleva.equipos': 'All your gear', 'lleva.creditos': 'Your credits', 'lleva.vip': 'Your VIP',
      'modal.cambia': 'What changes',
      'cambia.asoc': 'You leave your association. Over there you can join one or start your own.',
      'cambia.chat': 'Chat, rankings and the Server Cup become those of your new server.',
      'modal.si': 'Yes, move me', 'modal.no': 'Not now', mudando: 'Moving you…',
      listo: 'Done! You’re now on {s}.', error: 'The move didn’t go through. Try again.',
      'fusion.titulo': 'Your server joined {a}!',
      'fusion.txt': 'On {f}, {de} joined {a} so you have more companies to play with.',
      'fusion.txt_sin_fecha': '{de} joined {a} so you have more companies to play with.',
      'fusion.salvo': 'Your company and everything you own are safe: in-game money, gear, credits and VIP.',
      'fusion.nombre': 'If your name or your association’s name already existed there, we added a small change so it isn’t repeated.',
      'fusion.ok': 'Let’s go!', cerrar: 'Close',
    },
    'pt-BR': {
      tu_servidor: 'Seu servidor', cargando: 'Verificando seu servidor…',
      'estado.sano': 'Saudável', 'estado.bajo': 'Pouca atividade', 'estado.abandono': 'Abandonado',
      txt_bajo: 'Ultimamente pouca gente tem jogado no seu servidor.',
      txt_abandono: 'Seu servidor está ficando vazio. Sua produtora está segura.',
      mudar: 'Mude-se grátis para {s} (mais ativo)',
      activos: '{a} produtoras ativas lá esta semana · {b} no seu',
      no_puede: 'Você não pode se mudar agora: {m}',
      proximo: 'Você poderá se mudar a partir de {f}.',
      sin_sugerido: 'Estamos procurando um servidor mais ativo para você.',
      'modal.titulo': 'Mudar para {s}',
      'modal.intro': 'É grátis e você leva tudo o que é seu. Dá para se mudar 1 vez a cada 30 dias.',
      'modal.lleva': 'Vai com você',
      'lleva.prod': 'Sua produtora: dinheiro do jogo, equipe, fama e progresso',
      'lleva.equipos': 'Todos os seus equipamentos', 'lleva.creditos': 'Seus créditos', 'lleva.vip': 'Seu VIP',
      'modal.cambia': 'O que muda',
      'cambia.asoc': 'Você sai da sua associação. Lá você pode entrar em uma ou criar a sua.',
      'cambia.chat': 'O chat, o ranking e a Copa de Servidores passam a ser os do novo servidor.',
      'modal.si': 'Sim, me mudar', 'modal.no': 'Agora não', mudando: 'Mudando você…',
      listo: 'Pronto! Agora você está em {s}.', error: 'Não foi possível fazer a mudança. Tente de novo.',
      'fusion.titulo': 'Seu servidor se juntou a {a}!',
      'fusion.txt': 'Em {f}, {de} se juntou a {a} para você ter mais produtoras com quem jogar.',
      'fusion.txt_sin_fecha': '{de} se juntou a {a} para você ter mais produtoras com quem jogar.',
      'fusion.salvo': 'Sua produtora e tudo o que é seu estão seguros: dinheiro do jogo, equipamentos, créditos e VIP.',
      'fusion.nombre': 'Se o seu nome ou o da sua associação já existia lá, fizemos uma pequena mudança para não repetir.',
      'fusion.ok': 'Bora!', cerrar: 'Fechar',
    },
    fr: {
      tu_servidor: 'Ton serveur', cargando: 'Vérification de ton serveur…',
      'estado.sano': 'En forme', 'estado.bajo': 'Peu d’activité', 'estado.abandono': 'Abandonné',
      txt_bajo: 'Ces derniers temps, peu de monde joue sur ton serveur.',
      txt_abandono: 'Ton serveur se vide. Ta boîte de production est en sécurité.',
      mudar: 'Déménage gratuitement sur {s} (plus actif)',
      activos: '{a} boîtes actives là-bas cette semaine · {b} sur le tien',
      no_puede: 'Tu ne peux pas déménager pour l’instant : {m}',
      proximo: 'Tu pourras déménager à partir du {f}.',
      sin_sugerido: 'On te cherche un serveur plus actif.',
      'modal.titulo': 'Déménager sur {s}',
      'modal.intro': 'C’est gratuit et tu emportes tout. Tu peux déménager 1 fois tous les 30 jours.',
      'modal.lleva': 'Ce qui part avec toi',
      'lleva.prod': 'Ta boîte : argent du jeu, équipe, célébrité et progression',
      'lleva.equipos': 'Tout ton matériel', 'lleva.creditos': 'Tes crédits', 'lleva.vip': 'Ton VIP',
      'modal.cambia': 'Ce qui change',
      'cambia.asoc': 'Tu quittes ton association. Là-bas, tu peux en rejoindre une ou créer la tienne.',
      'cambia.chat': 'Le chat, le classement et la Coupe des Serveurs deviennent ceux de ton nouveau serveur.',
      'modal.si': 'Oui, je déménage', 'modal.no': 'Pas maintenant', mudando: 'Déménagement…',
      listo: 'C’est fait ! Tu es maintenant sur {s}.', error: 'Le déménagement n’a pas marché. Réessaie.',
      'fusion.titulo': 'Ton serveur a rejoint {a} !',
      'fusion.txt': 'Le {f}, {de} a rejoint {a} pour que tu aies plus de boîtes avec qui jouer.',
      'fusion.txt_sin_fecha': '{de} a rejoint {a} pour que tu aies plus de boîtes avec qui jouer.',
      'fusion.salvo': 'Ta boîte et tout ce qui est à toi sont en sécurité : argent du jeu, matériel, crédits et VIP.',
      'fusion.nombre': 'Si ton nom ou celui de ton association existait déjà là-bas, on a ajouté un petit changement pour éviter les doublons.',
      'fusion.ok': 'C’est parti !', cerrar: 'Fermer',
    },
    de: {
      tu_servidor: 'Dein Server', cargando: 'Dein Server wird geprüft…',
      'estado.sano': 'Gesund', 'estado.bajo': 'Wenig Aktivität', 'estado.abandono': 'Verlassen',
      txt_bajo: 'Auf deinem Server spielen in letzter Zeit nur wenige.',
      txt_abandono: 'Dein Server leert sich. Deine Produktionsfirma ist sicher.',
      mudar: 'Kostenlos zu {s} umziehen (aktiver)',
      activos: '{a} aktive Firmen dort diese Woche · {b} auf deinem',
      no_puede: 'Du kannst gerade nicht umziehen: {m}',
      proximo: 'Du kannst ab dem {f} wieder umziehen.',
      sin_sugerido: 'Wir suchen einen aktiveren Server für dich.',
      'modal.titulo': 'Zu {s} umziehen',
      'modal.intro': 'Es ist kostenlos und du nimmst alles mit. Du kannst alle 30 Tage 1-mal umziehen.',
      'modal.lleva': 'Zieht mit dir um',
      'lleva.prod': 'Deine Firma: Spielgeld, Personal, Ruhm und Fortschritt',
      'lleva.equipos': 'Deine ganze Ausrüstung', 'lleva.creditos': 'Deine Credits', 'lleva.vip': 'Dein VIP',
      'modal.cambia': 'Was sich ändert',
      'cambia.asoc': 'Du verlässt deine Vereinigung. Dort kannst du einer beitreten oder deine eigene gründen.',
      'cambia.chat': 'Chat, Rangliste und Server-Pokal sind dann die deines neuen Servers.',
      'modal.si': 'Ja, umziehen', 'modal.no': 'Jetzt nicht', mudando: 'Du ziehst um…',
      listo: 'Fertig! Du bist jetzt auf {s}.', error: 'Der Umzug hat nicht geklappt. Versuch es nochmal.',
      'fusion.titulo': 'Dein Server wurde mit {a} vereint!',
      'fusion.txt': 'Am {f} wurde {de} mit {a} vereint, damit du mehr Firmen zum Mitspielen hast.',
      'fusion.txt_sin_fecha': '{de} wurde mit {a} vereint, damit du mehr Firmen zum Mitspielen hast.',
      'fusion.salvo': 'Deine Firma und alles, was dir gehört, sind sicher: Spielgeld, Ausrüstung, Credits und VIP.',
      'fusion.nombre': 'Falls dein Name oder der deiner Vereinigung dort schon existierte, haben wir ihn leicht angepasst.',
      'fusion.ok': 'Los geht’s!', cerrar: 'Schließen',
    },
    it: {
      tu_servidor: 'Il tuo server', cargando: 'Controllo del tuo server…',
      'estado.sano': 'In salute', 'estado.bajo': 'Poca attività', 'estado.abandono': 'Abbandonato',
      txt_bajo: 'Ultimamente poca gente gioca sul tuo server.',
      txt_abandono: 'Il tuo server si sta svuotando. La tua casa di produzione è al sicuro.',
      mudar: 'Trasferisciti gratis su {s} (più attivo)',
      activos: '{a} case attive lì questa settimana · {b} sul tuo',
      no_puede: 'Per ora non puoi trasferirti: {m}',
      proximo: 'Potrai trasferirti dal {f}.',
      sin_sugerido: 'Stiamo cercando un server più attivo per te.',
      'modal.titulo': 'Trasferirti su {s}',
      'modal.intro': 'È gratis e porti tutto con te. Puoi trasferirti 1 volta ogni 30 giorni.',
      'modal.lleva': 'Viene con te',
      'lleva.prod': 'La tua casa: soldi del gioco, staff, fama e progressi',
      'lleva.equipos': 'Tutta la tua attrezzatura', 'lleva.creditos': 'I tuoi crediti', 'lleva.vip': 'Il tuo VIP',
      'modal.cambia': 'Cosa cambia',
      'cambia.asoc': 'Lasci la tua associazione. Lì puoi entrare in una o crearne una tua.',
      'cambia.chat': 'Chat, classifica e Coppa dei Server diventano quelli del nuovo server.',
      'modal.si': 'Sì, trasferiscimi', 'modal.no': 'Non ora', mudando: 'Trasferimento…',
      listo: 'Fatto! Ora sei su {s}.', error: 'Il trasferimento non è riuscito. Riprova.',
      'fusion.titulo': 'Il tuo server si è unito a {a}!',
      'fusion.txt': 'Il {f}, {de} si è unito a {a} così hai più case con cui giocare.',
      'fusion.txt_sin_fecha': '{de} si è unito a {a} così hai più case con cui giocare.',
      'fusion.salvo': 'La tua casa e tutto ciò che è tuo sono al sicuro: soldi del gioco, attrezzatura, crediti e VIP.',
      'fusion.nombre': 'Se il tuo nome o quello della tua associazione esisteva già lì, abbiamo fatto una piccola modifica per non ripeterlo.',
      'fusion.ok': 'Andiamo!', cerrar: 'Chiudi',
    },
    ru: {
      tu_servidor: 'Твой сервер', cargando: 'Проверяем твой сервер…',
      'estado.sano': 'Живой', 'estado.bajo': 'Мало активности', 'estado.abandono': 'Заброшен',
      txt_bajo: 'В последнее время на твоём сервере мало кто играет.',
      txt_abandono: 'Твой сервер пустеет. Твоя продакшн-студия в безопасности.',
      mudar: 'Переехать бесплатно на {s} (активнее)',
      activos: 'Там {a} активных студий на этой неделе · у тебя {b}',
      no_puede: 'Сейчас переехать нельзя: {m}',
      proximo: 'Переехать можно будет с {f}.',
      sin_sugerido: 'Ищем для тебя сервер поактивнее.',
      'modal.titulo': 'Переезд на {s}',
      'modal.intro': 'Это бесплатно, и всё твоё переезжает с тобой. Переезжать можно 1 раз в 30 дней.',
      'modal.lleva': 'Переезжает с тобой',
      'lleva.prod': 'Твоя студия: игровые деньги, персонал, слава и прогресс',
      'lleva.equipos': 'Всё твоё оборудование', 'lleva.creditos': 'Твои кредиты', 'lleva.vip': 'Твой VIP',
      'modal.cambia': 'Что изменится',
      'cambia.asoc': 'Ты выходишь из своей ассоциации. Там можно вступить в другую или создать свою.',
      'cambia.chat': 'Чат, рейтинг и Кубок серверов будут уже нового сервера.',
      'modal.si': 'Да, переехать', 'modal.no': 'Не сейчас', mudando: 'Переезжаем…',
      listo: 'Готово! Теперь ты на {s}.', error: 'Переезд не удался. Попробуй ещё раз.',
      'fusion.titulo': 'Твой сервер объединился с {a}!',
      'fusion.txt': '{f} {de} объединился с {a}, чтобы тебе было с кем играть.',
      'fusion.txt_sin_fecha': '{de} объединился с {a}, чтобы тебе было с кем играть.',
      'fusion.salvo': 'Твоя студия и всё твоё в безопасности: игровые деньги, оборудование, кредиты и VIP.',
      'fusion.nombre': 'Если твоё имя или имя твоей ассоциации там уже было, мы его слегка изменили, чтобы не повторялось.',
      'fusion.ok': 'Поехали!', cerrar: 'Закрыть',
    },
    tr: {
      tu_servidor: 'Sunucun', cargando: 'Sunucun kontrol ediliyor…',
      'estado.sano': 'Sağlıklı', 'estado.bajo': 'Az hareket', 'estado.abandono': 'Terk edilmiş',
      txt_bajo: 'Son zamanlarda sunucunda az kişi oynuyor.',
      txt_abandono: 'Sunucun boşalıyor. Prodüksiyon şirketin güvende.',
      mudar: '{s} sunucusuna ücretsiz taşın (daha aktif)',
      activos: 'Orada bu hafta {a} aktif şirket · seninkinde {b}',
      no_puede: 'Şu an taşınamazsın: {m}',
      proximo: '{f} tarihinden itibaren taşınabilirsin.',
      sin_sugerido: 'Senin için daha aktif bir sunucu arıyoruz.',
      'modal.titulo': '{s} sunucusuna taşın',
      'modal.intro': 'Ücretsiz ve her şeyini yanında götürürsün. 30 günde 1 kez taşınabilirsin.',
      'modal.lleva': 'Seninle taşınanlar',
      'lleva.prod': 'Şirketin: oyun parası, ekip, şöhret ve ilerleme',
      'lleva.equipos': 'Tüm ekipmanın', 'lleva.creditos': 'Kredilerin', 'lleva.vip': 'VIP’in',
      'modal.cambia': 'Neler değişir',
      'cambia.asoc': 'Derneğinden ayrılırsın. Orada birine katılabilir ya da kendininkini kurabilirsin.',
      'cambia.chat': 'Sohbet, sıralama ve Sunucu Kupası yeni sunucununkiler olur.',
      'modal.si': 'Evet, taşın', 'modal.no': 'Şimdi değil', mudando: 'Taşınıyorsun…',
      listo: 'Tamam! Artık {s} sunucusundasın.', error: 'Taşınma olmadı. Tekrar dene.',
      'fusion.titulo': 'Sunucun {a} ile birleşti!',
      'fusion.txt': '{f} tarihinde {de}, {a} ile birleşti; artık oynayacak daha çok şirket var.',
      'fusion.txt_sin_fecha': '{de}, {a} ile birleşti; artık oynayacak daha çok şirket var.',
      'fusion.salvo': 'Şirketin ve senin olan her şey güvende: oyun parası, ekipman, krediler ve VIP.',
      'fusion.nombre': 'Adın ya da derneğinin adı orada zaten varsa, tekrar etmesin diye küçük bir değişiklik yaptık.',
      'fusion.ok': 'Hadi!', cerrar: 'Kapat',
    },
    id: {
      tu_servidor: 'Servermu', cargando: 'Memeriksa servermu…',
      'estado.sano': 'Sehat', 'estado.bajo': 'Sepi', 'estado.abandono': 'Ditinggalkan',
      txt_bajo: 'Belakangan ini sedikit orang yang main di servermu.',
      txt_abandono: 'Servermu makin kosong. Rumah produksimu aman.',
      mudar: 'Pindah gratis ke {s} (lebih ramai)',
      activos: '{a} rumah produksi aktif di sana minggu ini · {b} di servermu',
      no_puede: 'Kamu belum bisa pindah: {m}',
      proximo: 'Kamu bisa pindah mulai {f}.',
      sin_sugerido: 'Kami sedang mencarikan server yang lebih ramai untukmu.',
      'modal.titulo': 'Pindah ke {s}',
      'modal.intro': 'Gratis dan semua milikmu ikut pindah. Kamu bisa pindah 1 kali setiap 30 hari.',
      'modal.lleva': 'Ikut pindah bersamamu',
      'lleva.prod': 'Rumah produksimu: uang game, kru, ketenaran, dan progres',
      'lleva.equipos': 'Semua peralatanmu', 'lleva.creditos': 'Kreditmu', 'lleva.vip': 'VIP-mu',
      'modal.cambia': 'Yang berubah',
      'cambia.asoc': 'Kamu keluar dari asosiasimu. Di sana kamu bisa gabung ke satu atau bikin sendiri.',
      'cambia.chat': 'Chat, peringkat, dan Piala Server jadi milik server barumu.',
      'modal.si': 'Ya, pindahkan', 'modal.no': 'Nanti saja', mudando: 'Memindahkanmu…',
      listo: 'Beres! Sekarang kamu di {s}.', error: 'Gagal pindah. Coba lagi.',
      'fusion.titulo': 'Servermu bergabung dengan {a}!',
      'fusion.txt': 'Pada {f}, {de} bergabung dengan {a} supaya kamu punya lebih banyak teman main.',
      'fusion.txt_sin_fecha': '{de} bergabung dengan {a} supaya kamu punya lebih banyak teman main.',
      'fusion.salvo': 'Rumah produksimu dan semua milikmu aman: uang game, peralatan, kredit, dan VIP.',
      'fusion.nombre': 'Kalau namamu atau nama asosiasimu sudah ada di sana, kami ubah sedikit supaya tidak sama.',
      'fusion.ok': 'Ayo!', cerrar: 'Tutup',
    },
    'zh-CN': {
      tu_servidor: '你的服务器', cargando: '正在查看你的服务器…',
      'estado.sano': '活跃', 'estado.bajo': '不太活跃', 'estado.abandono': '冷清',
      txt_bajo: '最近你的服务器里玩的人不多。',
      txt_abandono: '你的服务器越来越冷清了。你的制作公司很安全。',
      mudar: '免费搬到{s}（更活跃）',
      activos: '那边本周有{a}家活跃公司 · 你这边{b}家',
      no_puede: '你暂时不能搬家：{m}',
      proximo: '{f}起可以搬家。',
      sin_sugerido: '我们正在为你寻找更活跃的服务器。',
      'modal.titulo': '搬到{s}',
      'modal.intro': '免费，而且你的一切都会跟着你走。每30天可以搬1次。',
      'modal.lleva': '跟你一起搬走',
      'lleva.prod': '你的公司：游戏币、员工、名气和进度',
      'lleva.equipos': '你所有的设备', 'lleva.creditos': '你的点数', 'lleva.vip': '你的VIP',
      'modal.cambia': '会有什么变化',
      'cambia.asoc': '你会离开现在的协会。到那边可以加入一个，或者自己创建。',
      'cambia.chat': '聊天、排行榜和服务器杯都换成新服务器的。',
      'modal.si': '好，搬家', 'modal.no': '以后再说', mudando: '正在搬家…',
      listo: '搞定！你现在在{s}。', error: '搬家没有成功，再试一次吧。',
      'fusion.titulo': '你的服务器和{a}合并了！',
      'fusion.txt': '{f}，{de}和{a}合并了，这样你有更多公司可以一起玩。',
      'fusion.txt_sin_fecha': '{de}和{a}合并了，这样你有更多公司可以一起玩。',
      'fusion.salvo': '你的公司和你的一切都很安全：游戏币、设备、点数和VIP。',
      'fusion.nombre': '如果你的名字或协会名在那边已经有人用了，我们做了一点小改动以免重复。',
      'fusion.ok': '出发！', cerrar: '关闭',
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
  const num = (n) => { try { return Number(n || 0).toLocaleString(LOCALES[idioma()] || 'es-EC'); } catch (e) { return String(n || 0); } };
  // Textos que manda el servidor (motivo) vienen en español: si la lógica tiene traducción, se usa
  const TL = (t) => { try { return root.I18N && root.I18N.TL ? root.I18N.TL(t) : t; } catch (e) { return t; } };
  function fecha(v) {
    if (!v) return '';
    let d = null;
    try { d = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? new Date(v + 'T12:00:00') : new Date(v); } catch (e) { d = null; }
    if (!d || isNaN(d.getTime())) return String(v);
    try { return d.toLocaleDateString(LOCALES[idioma()] || 'es-EC', { day: 'numeric', month: 'long' }); } catch (e) { return d.toISOString().slice(0, 10); }
  }
  const nombreDe = (x) => (x && typeof x === 'object' ? (x.nombre || x.id || '') : (x == null ? '' : String(x)));

  /* ---------- Estado de la pantalla ---------- */
  const st = { ctx: null, datos: null, servidorId: null, pedidoEn: 0, cargando: false, error: false, ocupado: false, avisoT: null, avisosSesion: {} };
  const Api = () => root.Api || null;
  const logueado = () => { try { const a = Api(); return !!(a && a.disponible !== false && a.logueado && a.logueado()); } catch (e) { return false; } };
  const estadoApi = () => { try { return (Api() && Api().estado) || null; } catch (e) { return null; } };
  const servidorEstado = () => { const e = estadoApi(); return (e && e.servidor) || null; };

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

  async function recargar() {
    if (st.cargando || !logueado()) return st.datos;
    st.cargando = true;
    const sv = servidorEstado();
    try {
      st.datos = await pedir('GET', '/api/servidor/opciones');
      st.error = false;
    } catch (e) {
      st.error = true;
    } finally {
      st.cargando = false;
      st.pedidoEn = Date.now();
      st.servidorId = sv ? sv.id : (st.datos && st.datos.actual ? st.datos.actual.id : null);
    }
    repintar();
    return st.datos;
  }
  function invalidar() { st.datos = null; st.pedidoEn = 0; st.error = false; st.servidorId = null; }

  function hayQuePedir() {
    if (st.cargando) return false;
    const sv = servidorEstado();
    if (st.datos && sv && sv.id != null && st.servidorId != null && String(sv.id) !== String(st.servidorId)) return true;   // cambió de servidor
    const edad = Date.now() - st.pedidoEn;
    if (!st.pedidoEn) return true;
    return st.error ? edad > REINTENTO_MS : edad > VIGENCIA_MS;
  }

  /* ---------- Aviso de fusión (una sola vez) ---------- */
  const idAviso = (a) => [nombreDe(a.de), nombreDe(a.a), a.fecha || ''].join('|');
  function avisosVistos() {
    try { const v = JSON.parse(root.localStorage.getItem(CLAVE_AVISOS) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function yaVisto(a) { const id = idAviso(a); return !!st.avisosSesion[id] || avisosVistos().indexOf(id) >= 0; }
  function marcarVisto(a) {
    const id = idAviso(a);
    st.avisosSesion[id] = true;
    try { const v = avisosVistos().filter((x) => x !== id); v.push(id); root.localStorage.setItem(CLAVE_AVISOS, JSON.stringify(v.slice(-20))); } catch (e) { /* modo privado: solo en esta sesión */ }
  }
  const avisoPendiente = () => { const e = estadoApi(); const a = e && e.aviso_fusion; return a && typeof a === 'object' && (a.de || a.a) && !yaVisto(a) ? a : null; };
  const ventanaAbierta = () => { try { const o = root.document.getElementById('overlay'); return !!(o && o.classList.contains('on')); } catch (e) { return false; } };
  function programarAviso(intentos) {
    if (st.avisoT || !avisoPendiente()) return;
    st.avisoT = setTimeout(() => {
      st.avisoT = null;
      const a = avisoPendiente();
      if (!a || !st.ctx) return;
      if (ventanaAbierta()) { if ((intentos || 0) < 600) programarAviso((intentos || 0) + 1); return; }   // espera a que se cierre la otra ventana
      mostrarAviso(a);
    }, intentos ? 1000 : 250);
  }
  function mostrarAviso(a) {
    marcarVisto(a);
    const de = esc(nombreDe(a.de)), dest = esc(nombreDe(a.a));
    const txt = a.fecha ? T('fusion.txt', { f: esc(fecha(a.fecha)), de: `<b>${de}</b>`, a: `<b>${dest}</b>` }) : T('fusion.txt_sin_fecha', { de: `<b>${de}</b>`, a: `<b>${dest}</b>` });
    st.ctx.openModal(`<div class="srv-modal srv-fusion" data-srv="aviso-fusion">
      <div class="srv-hero">${icoUnion()}</div>
      <h2>${T('fusion.titulo', { a: dest })}</h2>
      <p>${txt}</p>
      <p class="srv-salvo">${icoEscudo()}<span>${esc(T('fusion.salvo'))}</span></p>
      <p class="small muted">${esc(T('fusion.nombre'))}</p>
      <button class="btn main" data-act="close">${esc(T('fusion.ok'))}</button></div>`);
  }

  /* ---------- Gráficos ---------- */
  const svg = (body, cls, s) => `<svg class="${cls || 'srv-ico'}" width="${s || 20}" height="${s || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const icoServidor = () => svg('<rect x="4" y="3.5" width="16" height="7" rx="2"/><rect x="4" y="13.5" width="16" height="7" rx="2"/><path d="M8 7h.01M8 17h.01M12 7h4M12 17h4"/>', 'srv-ico', 22);
  const icoMudanza = () => svg('<path d="M3 12h13"/><path d="M12 7l5 5-5 5"/><path d="M20 4v16"/>', 'srv-ico sm', 18);
  const icoEscudo = () => svg('<path d="M12 3l8 3v6c0 4.6-3.4 8-8 9-4.6-1-8-4.4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>', 'srv-ico sm', 18);
  const icoOk = () => svg('<path d="M5 12.5l4 4L19 7"/>', 'srv-ico xs', 16);
  const icoCambio = () => svg('<path d="M4 8h12l-3-3M20 16H8l3 3"/>', 'srv-ico xs', 16);
  const icoUnion = () => `<svg width="96" height="56" viewBox="0 0 96 56" aria-hidden="true"><circle cx="34" cy="28" r="20" fill="#4da3ff22" stroke="#4da3ff" stroke-width="2"/><circle cx="62" cy="28" r="20" fill="#2ecc7122" stroke="#2ecc71" stroke-width="2"/><path d="M42 28.5l4.5 4.5 8.5-9" fill="none" stroke="#e9edf5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function css() {
    if (typeof document === 'undefined' || document.getElementById('srv-css')) return;
    const s = document.createElement('style');
    s.id = 'srv-css';
    s.textContent = `
      .srv-card{padding:12px 14px}
      .srv-top{display:flex;align-items:center;gap:10px;min-width:0}
      .srv-top .srv-tile{flex:none;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:var(--panel2);border:1px solid var(--line);color:var(--blue)}
      .srv-top .grow{flex:1 1 auto;min-width:0}
      .srv-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.8px}
      .srv-nom{font-weight:700;font-size:15px;line-height:1.25;overflow-wrap:anywhere}
      .srv-uni{display:block;font-weight:400;font-size:13px;color:var(--muted)}
      .srv-sep{display:none}
      .srv-badge{flex:none;display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;border:1px solid;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
      .srv-badge i{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
      .srv-badge.sano{color:var(--green);border-color:#2ecc7155;background:#2ecc7114}
      .srv-badge.bajo{color:var(--amber);border-color:#ffb02055;background:#ffb02014}
      .srv-badge.abandono{color:var(--red);border-color:#ff3b3b66;background:#ff3b3b14}
      .srv-card.bajo{border-color:#ffb02055}
      .srv-card.abandono{border-color:#ff3b3b66}
      .srv-txt{font-size:13px;margin:10px 0 0;overflow-wrap:anywhere}
      .srv-act{font-size:12px;color:var(--muted);margin:4px 0 0;overflow-wrap:anywhere}
      .srv-card .btn{display:flex;align-items:center;justify-content:center;gap:8px;overflow-wrap:anywhere;line-height:1.25}
      .srv-card .btn .srv-ico{flex:none}
      .srv-no{font-size:12.5px;margin:8px 0 0;padding:8px 10px;border-radius:10px;background:var(--panel2);border:1px dashed var(--line);color:var(--muted);overflow-wrap:anywhere}
      .srv-modal h2{overflow-wrap:anywhere}
      .srv-modal p{overflow-wrap:anywhere}
      .srv-sec{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin:14px 0 6px}
      .srv-li{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin:6px 0;overflow-wrap:anywhere}
      .srv-li .srv-ico{flex:none;margin-top:2px}
      .srv-li.si .srv-ico{color:var(--green)}
      .srv-li.cambia .srv-ico{color:var(--amber)}
      .srv-ruta{display:flex;align-items:center;gap:8px;font-size:13px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:9px 10px;margin:10px 0 4px;min-width:0}
      .srv-ruta b{min-width:0;overflow-wrap:anywhere}
      .srv-ruta .srv-ico{flex:none;color:var(--green)}
      .srv-hero{display:flex;justify-content:center;margin:4px 0 6px}
      .srv-fusion h2{text-align:center}
      .srv-salvo{display:flex;gap:8px;align-items:flex-start;background:#2ecc7114;border:1px solid #2ecc7155;border-radius:12px;padding:10px;font-size:14px}
      .srv-salvo .srv-ico{flex:none;color:var(--green);margin-top:1px}
      .srv-err{color:var(--red);font-size:13px;margin:8px 0 0}`;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- Tarjeta de Inicio ---------- */
  const ESTADOS = ['sano', 'bajo', 'abandono'];
  function universoDe(d) {
    const e = estadoApi() || {};
    const u = (d && d.actual && d.actual.universo) || (d && d.universo) || (e.servidor && e.servidor.universo) || e.universo || null;
    return nombreDe(u);
  }
  function tarjeta(ctx) {
    if (!logueado()) return '';
    st.ctx = ctx;
    css();
    if (hayQuePedir()) setTimeout(recargar, 0);
    programarAviso(0);
    const d = st.datos, sv = servidorEstado();
    const actual = (d && d.actual) || null;
    const nombre = nombreDe(actual) || nombreDe(sv);
    if (!nombre && !d) return st.cargando || !st.pedidoEn ? `<div class="card srv-card" data-srv="tarjeta"><p class="small muted" style="margin:0">${esc(T('cargando'))}</p></div>` : '';
    const universo = universoDe(d);
    const estado = actual && ESTADOS.indexOf(actual.estado) >= 0 ? actual.estado : null;
    const badge = estado ? `<span class="srv-badge ${estado}" data-salud="${estado}"><i></i>${esc(T('estado.' + estado))}</span>` : '';
    let extra = '';
    if (estado === 'bajo' || estado === 'abandono') {
      extra += `<p class="srv-txt">${esc(T(estado === 'bajo' ? 'txt_bajo' : 'txt_abandono'))}</p>`;
      const sug = d.sugerido;
      if (d.puede && sug && sug.id != null) {
        extra += `<button class="btn main" data-ext="${ID}" data-acc="mudar">${icoMudanza()}<span>${esc(T('mudar', { s: nombreDe(sug) }))}</span></button>`;
        if (sug.activos_7 != null) extra += `<p class="srv-act">${esc(T('activos', { a: num(sug.activos_7), b: num(actual.activos_7) }))}</p>`;
      } else if (!d.puede && (d.motivo || d.proximo_traslado)) {
        const partes = [];
        if (d.motivo) partes.push(esc(T('no_puede', { m: TL(d.motivo) })));
        if (d.proximo_traslado) partes.push(esc(T('proximo', { f: fecha(d.proximo_traslado) })));
        extra += `<p class="srv-no" data-srv="no-puede">${partes.join(' ')}</p>`;
      } else {
        extra += `<p class="srv-no">${esc(T('sin_sugerido'))}</p>`;
      }
    }
    return `<div class="card srv-card ${estado || ''}" data-srv="tarjeta">
      <div class="srv-top"><div class="srv-tile">${icoServidor()}</div>
        <div class="grow"><div class="srv-lbl">${esc(T('tu_servidor'))}</div>
          <div class="srv-nom">${esc(nombre)}${universo ? `<span class="srv-uni"><span class="srv-sep"> · </span>${esc(universo)}</span>` : ''}</div></div>
        ${badge}</div>${extra}</div>`;
  }

  const cerrarIco = (ctx) => { try { if (ctx && ctx.I) return ctx.I('close', 'sm'); } catch (e) { /* abajo */ } return svg('<path d="M6 6l12 12M18 6L6 18"/>', 'ico sm', 18); };
  function modalMudanza(ctx, error) {
    const d = st.datos || {}, sug = d.sugerido || {}, act = d.actual || {};
    const s = esc(nombreDe(sug));
    const li = (cls, ico, t) => `<div class="srv-li ${cls}">${ico}<span>${esc(t)}</span></div>`;
    ctx.openModal(`<div class="srv-modal" data-srv="modal-mudanza">
      <div class="row between"><h2>${T('modal.titulo', { s })}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('cerrar'))}">${cerrarIco(ctx)}</button></div>
      <div class="srv-ruta"><b>${esc(nombreDe(act))}</b>${icoMudanza()}<b>${s}</b></div>
      <p class="small muted">${esc(T('modal.intro'))}</p>
      <div class="srv-sec">${esc(T('modal.lleva'))}</div>
      ${li('si', icoOk(), T('lleva.prod'))}${li('si', icoOk(), T('lleva.equipos'))}${li('si', icoOk(), T('lleva.creditos'))}${li('si', icoOk(), T('lleva.vip'))}
      <div class="srv-sec">${esc(T('modal.cambia'))}</div>
      ${li('cambia', icoCambio(), T('cambia.asoc'))}${li('cambia', icoCambio(), T('cambia.chat'))}
      ${error ? `<p class="srv-err" data-srv="error">${esc(error)}</p>` : ''}
      <button class="btn main" data-ext="${ID}" data-acc="confirmar" data-destino="${esc(sug.id)}">${esc(T('modal.si'))}</button>
      <button class="btn" data-act="close">${esc(T('modal.no'))}</button></div>`);
  }

  async function trasladar(ctx, el) {
    if (st.ocupado) return;
    const d = st.datos || {}, sug = d.sugerido;
    if (!sug || sug.id == null) return;
    st.ocupado = true;
    if (el) { el.disabled = true; el.textContent = T('mudando'); }
    try {
      await pedir('POST', '/api/servidor/trasladar', { destino: sug.id });
      const nombre = nombreDe(sug);
      ctx.closeModal();
      ctx.toast(T('listo', { s: nombre }));
      try { if (ctx.snd && ctx.snd.play) ctx.snd.play('chapter'); } catch (e) { /* sin sonido */ }
      invalidar();
      try { const a = Api(); if (a && a.refrescar) await a.refrescar(); } catch (e) { /* se verá al recargar */ }
      st.ocupado = false;
      await recargar();
    } catch (e) {
      st.ocupado = false;
      modalMudanza(ctx, (e && e.message) || T('error'));
    }
  }

  function clic(ctx, acc, el) {
    st.ctx = ctx;
    if (acc === 'mudar') { if (st.datos && st.datos.sugerido) modalMudanza(ctx); return; }
    if (acc === 'confirmar') { trasladar(ctx, el); }
  }

  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: 5, tarjeta, clic });
  root.Servidores = { tarjeta, clic, recargar, invalidar, T, ES, TRAD, get datos() { return st.datos; } };
})(typeof window !== 'undefined' ? window : globalThis);
