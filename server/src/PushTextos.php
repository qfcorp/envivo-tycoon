<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Textos de las notificaciones push en los 10 idiomas del juego, con 3 variantes cada uno (Push elige una al azar
 * que no sea la última que recibió ese aparato). Cada variante: [título, cuerpo]. Marcadores: {rival}, {dias}.
 * Para agregar una plantilla: la misma clave en los 10 idiomas (las pruebas lo revisan).
 */
final class PushTextos
{
    /** Palabra de respaldo cuando falta el nombre del rival. */
    public const RIVAL = ['es' => 'una productora rival', 'en' => 'a rival studio', 'pt-BR' => 'uma produtora rival', 'fr' => 'une boîte rivale',
        'de' => 'eine rivalisierende Produktion', 'it' => 'una casa rivale', 'ru' => 'студия-соперник', 'tr' => 'rakip bir yapımcı', 'id' => 'rumah produksi rival', 'zh-CN' => '一家对手公司'];

    public const T = [
        'es' => [
            'obra' => [['¡Obra terminada!', 'Los obreros terminaron en tu sede. Entra a ver cómo quedó.'], ['Tu sede creció', 'La obra ya está lista. Pasa a estrenarla.'], ['Listo en la sede', 'Se terminó la construcción. ¿Empiezas la siguiente?']],
            'copa_inicio' => [['¡Empieza la Copa!', 'Tu servidor ya está en la Copa de Servidores. Inscribe a tu equipo.'], ['Nueva Copa de Servidores', 'Arranca la preparación: cada evento suma puntos para tu servidor.'], ['La Copa ya abrió', 'Tu servidor te necesita esta semana. Entra y suma.']],
            'copa_batalla' => [['¡Empieza la batalla!', 'Tu servidor entra a la batalla de la Copa. Es ahora.'], ['Batalla de servidores', 'Comenzó la fase de batalla. Tu equipo cuenta.'], ['La Copa se define', 'Arrancó la batalla de tu servidor. No te la pierdas.']],
            'premio' => [['Tu premio diario está listo', 'Los créditos de hoy te esperan. Reclámalos antes de medianoche.'], ['Créditos de hoy', 'Ya puedes reclamar tu premio diario.'], ['Hay un regalo esperando', 'Tu premio de hoy está listo en la tienda.']],
            'buzon' => [['Tienes un mensaje', 'Soporte te respondió. Ábrelo en el juego.'], ['Mensaje nuevo en tu buzón', 'Hay una respuesta para ti.'], ['Te escribieron', 'Revisa tu buzón: tienes un mensaje sin leer.']],
            'duelo_ganado' => [['¡Ganaste un duelo!', '{rival} te retó y tu productora ganó.'], ['Defensa perfecta', 'Le ganaste el duelo a {rival}. Sube tu puntaje.'], ['Tu equipo respondió', '{rival} no pudo contigo. Duelo ganado.']],
            'duelo_perdido' => [['Perdiste un duelo', '{rival} te ganó esta vez. ¿Revancha?'], ['Te retaron', '{rival} ganó el duelo contra tu productora.'], ['Resultado del duelo', '{rival} se llevó la victoria. Mejora tu equipo y vuelve.']],
            'duelo_empate' => [['Duelo empatado', 'Tú y {rival} quedaron iguales.'], ['¡Empate!', 'Nadie ganó el duelo con {rival}.'], ['Resultado del duelo', 'Empate con {rival}. La próxima se define.']],
            'recordatorio' => [['Tu productora te extraña', 'Hay contratos nuevos esperando. Vuelve cuando quieras.'], ['El público pregunta por ti', 'Hace días que no sales en vivo. ¿Un evento rápido?'], ['Tu equipo te espera', 'Tu personal está listo para el próximo evento.']],
            'prueba' => [['Prueba de notificaciones', 'Si ves esto, las notificaciones funcionan.'], ['Aviso de prueba', 'Todo bien: este aparato recibe avisos.'], ['Prueba', 'Notificación de prueba del Centro de Control.']],
        ],
        'en' => [
            'obra' => [['Build complete!', 'The crew finished work at your HQ. Come see it.'], ['Your HQ grew', 'The build is ready. Come try it out.'], ['Done at the HQ', 'Construction is finished. Start the next one?']],
            'copa_inicio' => [['The Cup begins!', 'Your server is in the Server Cup. Sign up your team.'], ['New Server Cup', 'Preparation has started: every event earns points for your server.'], ['The Cup is open', 'Your server needs you this week. Jump in.']],
            'copa_batalla' => [['The battle begins!', 'Your server enters the Cup battle. It\'s on now.'], ['Server battle', 'The battle phase has started. Your team counts.'], ['The Cup is on the line', 'Your server\'s battle has begun. Don\'t miss it.']],
            'premio' => [['Your daily reward is ready', 'Today\'s credits are waiting. Claim them before midnight.'], ['Today\'s credits', 'You can claim your daily reward now.'], ['A gift is waiting', 'Your reward for today is ready in the shop.']],
            'buzon' => [['You have a message', 'Support replied to you. Open it in the game.'], ['New message in your inbox', 'There\'s a reply for you.'], ['Someone wrote to you', 'Check your inbox: you have an unread message.']],
            'duelo_ganado' => [['You won a duel!', '{rival} challenged you and your studio won.'], ['Perfect defense', 'You beat {rival} in a duel. Your rating goes up.'], ['Your crew delivered', '{rival} couldn\'t beat you. Duel won.']],
            'duelo_perdido' => [['You lost a duel', '{rival} beat you this time. Rematch?'], ['You were challenged', '{rival} won the duel against your studio.'], ['Duel result', '{rival} took the win. Upgrade your team and come back.']],
            'duelo_empate' => [['Duel tied', 'You and {rival} ended even.'], ['It\'s a tie!', 'Nobody won the duel with {rival}.'], ['Duel result', 'A tie with {rival}. Next time decides it.']],
            'recordatorio' => [['Your studio misses you', 'New contracts are waiting. Come back anytime.'], ['The audience is asking for you', 'You haven\'t gone live in days. A quick event?'], ['Your crew is waiting', 'Your staff is ready for the next event.']],
            'prueba' => [['Notification test', 'If you see this, notifications work.'], ['Test alert', 'All good: this device receives alerts.'], ['Test', 'Test notification from the Control Center.']],
        ],
        'pt-BR' => [
            'obra' => [['Obra concluída!', 'A equipe terminou o trabalho na sua sede. Venha ver.'], ['Sua sede cresceu', 'A obra está pronta. Venha estrear.'], ['Pronto na sede', 'A construção terminou. Começa a próxima?']],
            'copa_inicio' => [['Começa a Copa!', 'Seu servidor está na Copa de Servidores. Inscreva sua equipe.'], ['Nova Copa de Servidores', 'Começou a preparação: cada evento soma pontos para seu servidor.'], ['A Copa abriu', 'Seu servidor precisa de você nesta semana. Entre e some.']],
            'copa_batalla' => [['Começa a batalha!', 'Seu servidor entra na batalha da Copa. É agora.'], ['Batalha de servidores', 'Começou a fase de batalha. Sua equipe conta.'], ['A Copa se decide', 'Começou a batalha do seu servidor. Não perca.']],
            'premio' => [['Seu prêmio diário está pronto', 'Os créditos de hoje esperam por você. Resgate antes da meia-noite.'], ['Créditos de hoje', 'Você já pode resgatar seu prêmio diário.'], ['Tem um presente esperando', 'Seu prêmio de hoje está pronto na loja.']],
            'buzon' => [['Você tem uma mensagem', 'O suporte respondeu. Abra no jogo.'], ['Nova mensagem na caixa', 'Há uma resposta para você.'], ['Escreveram para você', 'Confira sua caixa: há uma mensagem não lida.']],
            'duelo_ganado' => [['Você venceu um duelo!', '{rival} desafiou você e sua produtora venceu.'], ['Defesa perfeita', 'Você venceu {rival} no duelo. Sua pontuação sobe.'], ['Sua equipe respondeu', '{rival} não conseguiu. Duelo vencido.']],
            'duelo_perdido' => [['Você perdeu um duelo', '{rival} venceu desta vez. Revanche?'], ['Você foi desafiado', '{rival} venceu o duelo contra sua produtora.'], ['Resultado do duelo', '{rival} levou a vitória. Melhore sua equipe e volte.']],
            'duelo_empate' => [['Duelo empatado', 'Você e {rival} ficaram iguais.'], ['Empate!', 'Ninguém venceu o duelo com {rival}.'], ['Resultado do duelo', 'Empate com {rival}. A próxima decide.']],
            'recordatorio' => [['Sua produtora sente sua falta', 'Há contratos novos esperando. Volte quando quiser.'], ['O público pergunta por você', 'Faz dias que você não entra ao vivo. Um evento rápido?'], ['Sua equipe espera por você', 'Seu pessoal está pronto para o próximo evento.']],
            'prueba' => [['Teste de notificações', 'Se você vê isto, as notificações funcionam.'], ['Aviso de teste', 'Tudo certo: este aparelho recebe avisos.'], ['Teste', 'Notificação de teste da Central de Controle.']],
        ],
        'fr' => [
            'obra' => [['Chantier terminé !', 'Les ouvriers ont fini à ton siège. Viens voir.'], ['Ton siège s\'agrandit', 'Le chantier est prêt. Viens l\'inaugurer.'], ['C\'est prêt au siège', 'La construction est terminée. On lance la suivante ?']],
            'copa_inicio' => [['La Coupe commence !', 'Ton serveur participe à la Coupe des serveurs. Inscris ton équipe.'], ['Nouvelle Coupe des serveurs', 'La préparation commence : chaque événement rapporte des points à ton serveur.'], ['La Coupe est ouverte', 'Ton serveur a besoin de toi cette semaine. Viens jouer.']],
            'copa_batalla' => [['La bataille commence !', 'Ton serveur entre dans la bataille de la Coupe. C\'est maintenant.'], ['Bataille des serveurs', 'La phase de bataille a commencé. Ton équipe compte.'], ['La Coupe se joue', 'La bataille de ton serveur a commencé. Ne la rate pas.']],
            'premio' => [['Ta récompense du jour est prête', 'Les crédits du jour t\'attendent. Récupère-les avant minuit.'], ['Crédits du jour', 'Tu peux récupérer ta récompense quotidienne.'], ['Un cadeau t\'attend', 'Ta récompense du jour est prête dans la boutique.']],
            'buzon' => [['Tu as un message', 'Le support t\'a répondu. Ouvre-le dans le jeu.'], ['Nouveau message', 'Une réponse t\'attend.'], ['On t\'a écrit', 'Regarde ta boîte : un message non lu.']],
            'duelo_ganado' => [['Duel gagné !', '{rival} t\'a défié et ta boîte a gagné.'], ['Défense parfaite', 'Tu as battu {rival} en duel. Ton score monte.'], ['Ton équipe a assuré', '{rival} n\'a rien pu faire. Duel gagné.']],
            'duelo_perdido' => [['Duel perdu', '{rival} t\'a battu cette fois. Revanche ?'], ['On t\'a défié', '{rival} a gagné le duel contre ta boîte.'], ['Résultat du duel', '{rival} l\'emporte. Améliore ton équipe et reviens.']],
            'duelo_empate' => [['Duel nul', 'Toi et {rival} êtes à égalité.'], ['Égalité !', 'Personne n\'a gagné le duel avec {rival}.'], ['Résultat du duel', 'Égalité avec {rival}. La prochaine fois tranchera.']],
            'recordatorio' => [['Ta boîte de prod te manque', 'De nouveaux contrats t\'attendent. Reviens quand tu veux.'], ['Le public te réclame', 'Ça fait des jours que tu n\'es pas passé en direct. Un événement rapide ?'], ['Ton équipe t\'attend', 'Ton personnel est prêt pour le prochain événement.']],
            'prueba' => [['Test des notifications', 'Si tu vois ceci, les notifications fonctionnent.'], ['Alerte de test', 'Tout va bien : cet appareil reçoit les alertes.'], ['Test', 'Notification de test du Centre de contrôle.']],
        ],
        'de' => [
            'obra' => [['Bau fertig!', 'Die Bauarbeiter sind in deiner Zentrale fertig. Schau es dir an.'], ['Deine Zentrale wächst', 'Der Bau ist fertig. Komm und probier ihn aus.'], ['Fertig in der Zentrale', 'Die Bauarbeiten sind abgeschlossen. Startest du den nächsten?']],
            'copa_inicio' => [['Der Pokal beginnt!', 'Dein Server spielt im Server-Pokal. Melde dein Team an.'], ['Neuer Server-Pokal', 'Die Vorbereitung läuft: Jedes Event bringt deinem Server Punkte.'], ['Der Pokal ist offen', 'Dein Server braucht dich diese Woche. Mach mit.']],
            'copa_batalla' => [['Die Schlacht beginnt!', 'Dein Server zieht in die Pokalschlacht. Jetzt geht\'s los.'], ['Server-Schlacht', 'Die Kampfphase hat begonnen. Dein Team zählt.'], ['Der Pokal wird entschieden', 'Die Schlacht deines Servers hat begonnen. Verpass sie nicht.']],
            'premio' => [['Deine Tagesbelohnung ist bereit', 'Die Credits von heute warten. Hol sie dir vor Mitternacht.'], ['Credits von heute', 'Du kannst deine Tagesbelohnung jetzt abholen.'], ['Ein Geschenk wartet', 'Deine Belohnung für heute liegt im Shop bereit.']],
            'buzon' => [['Du hast eine Nachricht', 'Der Support hat geantwortet. Öffne sie im Spiel.'], ['Neue Nachricht im Postfach', 'Eine Antwort wartet auf dich.'], ['Jemand hat dir geschrieben', 'Schau ins Postfach: eine ungelesene Nachricht.']],
            'duelo_ganado' => [['Duell gewonnen!', '{rival} hat dich herausgefordert und du hast gewonnen.'], ['Perfekte Verteidigung', 'Du hast {rival} im Duell besiegt. Deine Wertung steigt.'], ['Dein Team hat geliefert', '{rival} kam nicht an dir vorbei. Duell gewonnen.']],
            'duelo_perdido' => [['Duell verloren', '{rival} hat dich diesmal geschlagen. Revanche?'], ['Du wurdest herausgefordert', '{rival} hat das Duell gegen dich gewonnen.'], ['Duell-Ergebnis', '{rival} hat gewonnen. Verbessere dein Team und komm zurück.']],
            'duelo_empate' => [['Duell unentschieden', 'Du und {rival} seid gleichauf.'], ['Unentschieden!', 'Niemand hat das Duell mit {rival} gewonnen.'], ['Duell-Ergebnis', 'Unentschieden gegen {rival}. Das nächste Mal entscheidet.']],
            'recordatorio' => [['Deine Produktion vermisst dich', 'Neue Aufträge warten. Komm zurück, wann du willst.'], ['Das Publikum fragt nach dir', 'Du warst seit Tagen nicht live. Ein schnelles Event?'], ['Dein Team wartet', 'Dein Personal ist bereit für das nächste Event.']],
            'prueba' => [['Benachrichtigungstest', 'Wenn du das siehst, funktionieren die Benachrichtigungen.'], ['Testhinweis', 'Alles gut: Dieses Gerät empfängt Hinweise.'], ['Test', 'Testbenachrichtigung aus dem Kontrollzentrum.']],
        ],
        'it' => [
            'obra' => [['Lavori finiti!', 'Gli operai hanno finito nella tua sede. Vieni a vedere.'], ['La tua sede è cresciuta', 'Il cantiere è pronto. Vieni a inaugurarlo.'], ['Pronto in sede', 'La costruzione è terminata. Inizi la prossima?']],
            'copa_inicio' => [['Inizia la Coppa!', 'Il tuo server è nella Coppa dei Server. Iscrivi la tua squadra.'], ['Nuova Coppa dei Server', 'Inizia la preparazione: ogni evento dà punti al tuo server.'], ['La Coppa è aperta', 'Il tuo server ha bisogno di te questa settimana. Entra e gioca.']],
            'copa_batalla' => [['Inizia la battaglia!', 'Il tuo server entra nella battaglia della Coppa. È adesso.'], ['Battaglia dei server', 'È iniziata la fase di battaglia. La tua squadra conta.'], ['La Coppa si decide', 'È iniziata la battaglia del tuo server. Non perdertela.']],
            'premio' => [['Il premio giornaliero è pronto', 'I crediti di oggi ti aspettano. Riscattali prima di mezzanotte.'], ['Crediti di oggi', 'Puoi già riscattare il tuo premio giornaliero.'], ['C\'è un regalo per te', 'Il premio di oggi è pronto nel negozio.']],
            'buzon' => [['Hai un messaggio', 'L\'assistenza ti ha risposto. Aprilo nel gioco.'], ['Nuovo messaggio', 'C\'è una risposta per te.'], ['Ti hanno scritto', 'Controlla la casella: hai un messaggio non letto.']],
            'duelo_ganado' => [['Hai vinto un duello!', '{rival} ti ha sfidato e hai vinto.'], ['Difesa perfetta', 'Hai battuto {rival} in duello. Il tuo punteggio sale.'], ['La tua squadra ha risposto', '{rival} non ce l\'ha fatta. Duello vinto.']],
            'duelo_perdido' => [['Hai perso un duello', '{rival} ti ha battuto stavolta. Rivincita?'], ['Ti hanno sfidato', '{rival} ha vinto il duello contro di te.'], ['Risultato del duello', '{rival} ha vinto. Migliora la squadra e torna.']],
            'duelo_empate' => [['Duello in parità', 'Tu e {rival} siete pari.'], ['Pareggio!', 'Nessuno ha vinto il duello con {rival}.'], ['Risultato del duello', 'Pari con {rival}. La prossima decide.']],
            'recordatorio' => [['La tua casa di produzione ti aspetta', 'Ci sono nuovi contratti. Torna quando vuoi.'], ['Il pubblico chiede di te', 'Sono giorni che non vai in onda. Un evento veloce?'], ['La tua squadra ti aspetta', 'Il personale è pronto per il prossimo evento.']],
            'prueba' => [['Test notifiche', 'Se vedi questo, le notifiche funzionano.'], ['Avviso di prova', 'Tutto ok: questo dispositivo riceve gli avvisi.'], ['Prova', 'Notifica di prova dal Centro di controllo.']],
        ],
        'ru' => [
            'obra' => [['Стройка завершена!', 'Рабочие закончили в твоём офисе. Загляни посмотреть.'], ['Твой офис вырос', 'Стройка готова. Заходи опробовать.'], ['Готово в офисе', 'Строительство закончено. Начнёшь следующее?']],
            'copa_inicio' => [['Кубок начинается!', 'Твой сервер участвует в Кубке серверов. Запиши команду.'], ['Новый Кубок серверов', 'Началась подготовка: каждое событие приносит очки твоему серверу.'], ['Кубок открыт', 'На этой неделе ты нужен своему серверу. Заходи.']],
            'copa_batalla' => [['Битва начинается!', 'Твой сервер вступает в битву Кубка. Прямо сейчас.'], ['Битва серверов', 'Началась фаза битвы. Твоя команда важна.'], ['Кубок решается', 'Битва твоего сервера началась. Не пропусти.']],
            'premio' => [['Ежедневная награда готова', 'Сегодняшние кредиты ждут. Забери их до полуночи.'], ['Кредиты на сегодня', 'Можно забрать ежедневную награду.'], ['Тебя ждёт подарок', 'Награда на сегодня ждёт в магазине.']],
            'buzon' => [['У тебя сообщение', 'Поддержка ответила. Открой в игре.'], ['Новое сообщение', 'Для тебя есть ответ.'], ['Тебе написали', 'Проверь почту: есть непрочитанное сообщение.']],
            'duelo_ganado' => [['Дуэль выиграна!', '{rival} бросил вызов, и ты победил.'], ['Идеальная защита', 'Ты победил {rival} в дуэли. Рейтинг растёт.'], ['Команда не подвела', '{rival} не справился. Дуэль выиграна.']],
            'duelo_perdido' => [['Дуэль проиграна', 'На этот раз победил {rival}. Реванш?'], ['Тебе бросили вызов', '{rival} выиграл дуэль против тебя.'], ['Итог дуэли', 'Победа за {rival}. Усиль команду и возвращайся.']],
            'duelo_empate' => [['Ничья в дуэли', 'Ты и {rival} сыграли вничью.'], ['Ничья!', 'В дуэли с {rival} никто не победил.'], ['Итог дуэли', 'Ничья с {rival}. Всё решит следующий раз.']],
            'recordatorio' => [['Твоя студия скучает', 'Тебя ждут новые контракты. Возвращайся когда угодно.'], ['Зрители спрашивают о тебе', 'Ты давно не выходил в эфир. Быстрое событие?'], ['Команда ждёт тебя', 'Персонал готов к следующему событию.']],
            'prueba' => [['Проверка уведомлений', 'Если ты это видишь, уведомления работают.'], ['Тестовое оповещение', 'Всё в порядке: устройство получает оповещения.'], ['Тест', 'Тестовое уведомление из Центра управления.']],
        ],
        'tr' => [
            'obra' => [['İnşaat bitti!', 'İşçiler merkezinde işi bitirdi. Gel bir bak.'], ['Merkezin büyüdü', 'İnşaat hazır. Gel ve dene.'], ['Merkezde hazır', 'Yapım tamamlandı. Sıradakine başlıyor musun?']],
            'copa_inicio' => [['Kupa başlıyor!', 'Sunucun Sunucu Kupası\'nda. Takımını kaydet.'], ['Yeni Sunucu Kupası', 'Hazırlık başladı: her etkinlik sunucuna puan kazandırır.'], ['Kupa açıldı', 'Sunucunun bu hafta sana ihtiyacı var. Katıl.']],
            'copa_batalla' => [['Savaş başlıyor!', 'Sunucun Kupa savaşına giriyor. Tam şimdi.'], ['Sunucu savaşı', 'Savaş aşaması başladı. Takımın önemli.'], ['Kupa belirleniyor', 'Sunucunun savaşı başladı. Kaçırma.']],
            'premio' => [['Günlük ödülün hazır', 'Bugünün kredileri seni bekliyor. Gece yarısından önce al.'], ['Bugünün kredileri', 'Günlük ödülünü şimdi alabilirsin.'], ['Seni bir hediye bekliyor', 'Bugünkü ödülün mağazada hazır.']],
            'buzon' => [['Bir mesajın var', 'Destek sana cevap verdi. Oyunda aç.'], ['Kutunda yeni mesaj', 'Sana bir cevap var.'], ['Sana yazdılar', 'Kutuna bak: okunmamış bir mesajın var.']],
            'duelo_ganado' => [['Düelloyu kazandın!', '{rival} sana meydan okudu ve sen kazandın.'], ['Kusursuz savunma', 'Düelloda {rival} karşısında kazandın. Puanın yükseliyor.'], ['Ekibin işini yaptı', '{rival} seni geçemedi. Düello kazanıldı.']],
            'duelo_perdido' => [['Düelloyu kaybettin', 'Bu sefer {rival} kazandı. Rövanş?'], ['Sana meydan okundu', '{rival} sana karşı düelloyu kazandı.'], ['Düello sonucu', 'Zafer {rival} tarafında. Ekibini güçlendir ve geri dön.']],
            'duelo_empate' => [['Düello berabere', 'Sen ve {rival} berabere kaldınız.'], ['Berabere!', '{rival} ile düelloyu kimse kazanmadı.'], ['Düello sonucu', '{rival} ile berabere. Bir dahakine belli olur.']],
            'recordatorio' => [['Yapım şirketin seni özledi', 'Yeni sözleşmeler bekliyor. İstediğin zaman dön.'], ['Seyirci seni soruyor', 'Günlerdir canlı yayına çıkmadın. Hızlı bir etkinlik?'], ['Ekibin seni bekliyor', 'Personelin bir sonraki etkinliğe hazır.']],
            'prueba' => [['Bildirim testi', 'Bunu görüyorsan bildirimler çalışıyor.'], ['Test uyarısı', 'Her şey yolunda: bu cihaz uyarı alıyor.'], ['Test', 'Kontrol Merkezi\'nden test bildirimi.']],
        ],
        'id' => [
            'obra' => [['Pembangunan selesai!', 'Para pekerja sudah selesai di markasmu. Ayo lihat.'], ['Markasmu berkembang', 'Bangunannya sudah siap. Ayo coba.'], ['Siap di markas', 'Konstruksi selesai. Mulai yang berikutnya?']],
            'copa_inicio' => [['Piala dimulai!', 'Servermu ikut Piala Server. Daftarkan timmu.'], ['Piala Server baru', 'Persiapan dimulai: setiap acara menambah poin untuk servermu.'], ['Piala sudah dibuka', 'Servermu butuh kamu minggu ini. Ayo ikut.']],
            'copa_batalla' => [['Pertempuran dimulai!', 'Servermu masuk ke pertempuran Piala. Sekarang juga.'], ['Pertempuran server', 'Fase pertempuran sudah dimulai. Timmu berarti.'], ['Piala ditentukan', 'Pertempuran servermu dimulai. Jangan sampai terlewat.']],
            'premio' => [['Hadiah harianmu siap', 'Kredit hari ini menunggu. Klaim sebelum tengah malam.'], ['Kredit hari ini', 'Kamu sudah bisa klaim hadiah harian.'], ['Ada hadiah menunggu', 'Hadiahmu hari ini sudah siap di toko.']],
            'buzon' => [['Kamu punya pesan', 'Tim dukungan membalas. Buka di game.'], ['Pesan baru di kotak masuk', 'Ada balasan untukmu.'], ['Ada yang menulis untukmu', 'Cek kotak masuk: ada pesan yang belum dibaca.']],
            'duelo_ganado' => [['Kamu menang duel!', '{rival} menantangmu dan kamu menang.'], ['Pertahanan sempurna', 'Kamu mengalahkan {rival} dalam duel. Peringkatmu naik.'], ['Timmu berhasil', '{rival} tidak bisa mengalahkanmu. Duel dimenangkan.']],
            'duelo_perdido' => [['Kamu kalah duel', '{rival} menang kali ini. Balas dendam?'], ['Kamu ditantang', '{rival} memenangkan duel melawanmu.'], ['Hasil duel', '{rival} menang. Perkuat timmu dan kembali.']],
            'duelo_empate' => [['Duel seri', 'Kamu dan {rival} imbang.'], ['Seri!', 'Tidak ada yang menang duel dengan {rival}.'], ['Hasil duel', 'Seri dengan {rival}. Lain kali penentuannya.']],
            'recordatorio' => [['Rumah produksimu rindu', 'Kontrak baru menunggu. Kembali kapan saja.'], ['Penonton menanyakanmu', 'Sudah berhari-hari kamu tidak siaran. Acara singkat?'], ['Timmu menunggu', 'Stafmu siap untuk acara berikutnya.']],
            'prueba' => [['Uji notifikasi', 'Jika kamu melihat ini, notifikasi berfungsi.'], ['Peringatan uji', 'Semua beres: perangkat ini menerima pemberitahuan.'], ['Uji', 'Notifikasi uji dari Pusat Kontrol.']],
        ],
        'zh-CN' => [
            'obra' => [['工程完工！', '工人们已在你的总部完工，快来看看。'], ['总部扩建了', '工程已就绪，快来体验。'], ['总部已完成', '建设结束了。要开始下一项吗？']],
            'copa_inicio' => [['杯赛开始了！', '你的服务器已加入服务器杯，快报名你的队伍。'], ['新一届服务器杯', '准备阶段开始：每场活动都为你的服务器加分。'], ['杯赛已开放', '本周你的服务器需要你，快来参战。']],
            'copa_batalla' => [['对决开始了！', '你的服务器进入杯赛对决，就是现在。'], ['服务器对决', '对决阶段已开始，你的队伍很关键。'], ['杯赛决胜时刻', '你的服务器对决已开始，别错过。']],
            'premio' => [['每日奖励已就绪', '今天的点数在等你，午夜前记得领取。'], ['今日点数', '现在可以领取每日奖励了。'], ['有礼物在等你', '今天的奖励已在商店准备好。']],
            'buzon' => [['你有一条消息', '客服回复你了，在游戏中打开查看。'], ['信箱有新消息', '有一条给你的回复。'], ['有人给你留言', '查看信箱：你有一条未读消息。']],
            'duelo_ganado' => [['你赢得了对决！', '{rival}向你挑战，你的公司获胜。'], ['完美防守', '你在对决中击败了{rival}，评分上升。'], ['团队表现出色', '{rival}没能赢你。对决获胜。']],
            'duelo_perdido' => [['你输掉了对决', '这次{rival}赢了。要复仇吗？'], ['有人向你挑战', '{rival}赢得了与你的对决。'], ['对决结果', '{rival}获胜。提升你的队伍再来。']],
            'duelo_empate' => [['对决平局', '你和{rival}打成平手。'], ['平局！', '与{rival}的对决没有赢家。'], ['对决结果', '与{rival}平局，下次见分晓。']],
            'recordatorio' => [['你的公司想你了', '新合同在等你，随时回来。'], ['观众在问你', '你已经好几天没直播了。来一场快速活动？'], ['团队在等你', '你的员工已为下一场活动做好准备。']],
            'prueba' => [['通知测试', '看到这条说明通知正常。'], ['测试提醒', '一切正常：此设备可以接收提醒。'], ['测试', '来自控制中心的测试通知。']],
        ],
    ];

    public static function existe(string $plantilla): bool { return isset(self::T['es'][$plantilla]); }

    /** Variantes [título, cuerpo] ya con los marcadores puestos. */
    public static function variantes(string $plantilla, string $idioma, array $vars = []): array
    {
        $L = isset(self::T[$idioma][$plantilla]) ? $idioma : 'es';
        $vars['rival'] = trim((string) ($vars['rival'] ?? '')) !== '' ? (string) $vars['rival'] : self::RIVAL[$L];
        $pon = fn(string $s) => preg_replace_callback('/\{(\w+)\}/', fn($m) => array_key_exists($m[1], $vars) ? (string) $vars[$m[1]] : $m[0], $s);
        return array_map(fn(array $v) => [$pon($v[0]), $pon($v[1])], self::T[$L][$plantilla] ?? []);
    }

    /** Una variante al azar cuyo cuerpo no sea $evitar (el último texto que recibió ese aparato). */
    public static function elegir(string $plantilla, string $idioma, array $vars = [], ?string $evitar = null): array
    {
        $vs = self::variantes($plantilla, $idioma, $vars);
        if (!$vs) return ['EN VIVO Tycoon', ''];
        $ok = array_values(array_filter($vs, fn($v) => $v[1] !== $evitar));
        if (!$ok) $ok = $vs;
        return $ok[random_int(0, count($ok) - 1)];
    }
}
