/* =========================================================
   EN VIVO Tycoon — Buzón y códigos de regalo (server/INTEGRAR_BUZON.md, API /api/buzon*)
   - Sobre ✉ con número en el encabezado (junto a sonido / música / idioma), solo con cuenta. Se agrega solo al cargar.
   - Ventana del buzón: lista, mensaje, "Reclamar", "Reclamar todo", borrar y "Canjear código".
   - Aviso en Inicio cuando hay regalos por reclamar (registro window.EnVivoInicio, id "buzon").
   - Buzon.botonCanjear(ctx) → botón "Canjear código" para la Tienda → Cuenta (data-ext="buzon" data-acc="canjear").
   - También lo usa /canjear.html (solo los textos: Buzon.t, Buzon.idioma, Buzon.error).
   Textos en 10 idiomas aquí mismo (TEXTOS). Los títulos y mensajes los escribe el equipo en español.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'buzon';

  /* ---------- Textos ---------- */
  const TEXTOS = {
    es: {
      titulo: 'Buzón', abrir: 'Abrir el buzón', abrir_n: 'Buzón: {n} nuevos', cerrar: 'Cerrar', volver: 'Volver', cargando: 'Abriendo el buzón…',
      vacio_t: 'Tu buzón está vacío', vacio: 'Aquí llegan los avisos y los regalos del juego.',
      de: 'De {r}', vence: 'Vence en {t}', dias: '{n} d', horas: '{n} h', minutos: '{n} min', hoy: 'Hoy', ayer: 'Ayer',
      reclamar: 'Reclamar', reclamar_todo: 'Reclamar todo ({n})', reclamado: 'Reclamado', regalo: 'Regalo', nuevo: 'Nuevo',
      borrar: 'Borrar', borrado: 'Mensaje borrado', recibiste: '¡Recibiste {x}!', ya: 'Este regalo ya estaba reclamado.',
      canjear_t: 'Canjear código', canjear_info: 'Códigos de eventos, redes e influencers. Uno por cuenta.', canjear_ph: 'Escribe el código',
      canjear_btn: 'Canjear', canjear_ok: '¡Código canjeado! Tu regalo llegó al buzón.', canjear_web: 'También puedes canjear en {sitio}',
      entra: 'Entra a tu cuenta para usar el buzón y canjear códigos.', entra_btn: 'Entrar o crear cuenta',
      inicio_tag: 'Buzón', inicio_1: 'Tienes 1 regalo por reclamar', inicio_n: 'Tienes {n} regalos por reclamar', inicio_btn: 'Abrir el buzón',
      error_carga: 'No se pudo abrir el buzón. Revisa tu internet.',
      t_aviso: 'Aviso', t_compensacion: 'Compensación', t_evento: 'Evento', t_regalo: 'Regalo', t_codigo: 'Código', t_sistema: 'Sistema',
      a_creditos: '{n} créditos', a_cable: '{n} × cables de repuesto', a_battery: '{n} × baterías de repuesto', a_reparar: 'Reparar todos tus equipos',
      e_codigo_invalido: 'Ese código no existe o ya no está activo. Revisa que esté bien escrito.', e_codigo_ya_usado: 'Ya canjeaste este código en tu cuenta.',
      e_codigo_agotado: 'Este código ya se usó todas las veces posibles.', e_codigo_vencido: 'Este código ya venció.', e_codigo_pronto: 'Este código todavía no se puede usar.',
      e_codigo_lote_usado: 'Ya canjeaste otro código de esta misma campaña: es uno por cuenta.', e_limite_intentos: 'Demasiados intentos. Espera 10 minutos e intenta de nuevo.',
      e_mensaje_vencido: 'Este regalo ya venció.', e_credenciales_invalidas: 'Correo o clave incorrectos.', e_red: 'No hay conexión con el servidor. Intenta de nuevo.',
      w_titulo: 'Canjear un código de regalo', w_intro: 'Entra con la misma cuenta del juego. El regalo llega al buzón del juego.', w_cargando: 'Conectando…',
      w_correo: 'Correo', w_clave: 'Clave', w_entrar: 'Entrar', w_sin_cuenta: '¿No tienes cuenta? Créala gratis dentro del juego (Tienda → Cuenta).',
      w_codigo: 'Código', w_no_soy: 'No soy yo', w_conectado: 'Cuenta: {n}', w_listo: '¡Listo!', w_listo_txt: 'Tu regalo está en el buzón del juego. Abre EN VIVO Tycoon y toca el sobre para reclamarlo.',
      w_abrir: 'Abrir el juego', w_otro: 'Canjear otro código', w_pie: 'Los códigos son gratis: nadie te los vende. Nunca te pediremos tu tarjeta para canjear un código.',
      w_terminos: 'Términos', w_privacidad: 'Privacidad',
    },
    en: {
      titulo: 'Mailbox', abrir: 'Open mailbox', abrir_n: 'Mailbox: {n} new', cerrar: 'Close', volver: 'Back', cargando: 'Opening your mailbox…',
      vacio_t: 'Your mailbox is empty', vacio: 'Game news and gifts arrive here.',
      de: 'From {r}', vence: 'Expires in {t}', dias: '{n} d', horas: '{n} h', minutos: '{n} min', hoy: 'Today', ayer: 'Yesterday',
      reclamar: 'Claim', reclamar_todo: 'Claim all ({n})', reclamado: 'Claimed', regalo: 'Gift', nuevo: 'New',
      borrar: 'Delete', borrado: 'Message deleted', recibiste: 'You got {x}!', ya: 'This gift was already claimed.',
      canjear_t: 'Redeem code', canjear_info: 'Codes from events, social media and creators. One per account.', canjear_ph: 'Type the code',
      canjear_btn: 'Redeem', canjear_ok: 'Code redeemed! Your gift is in your mailbox.', canjear_web: 'You can also redeem at {sitio}',
      entra: 'Sign in to use the mailbox and redeem codes.', entra_btn: 'Sign in or create account',
      inicio_tag: 'Mailbox', inicio_1: 'You have 1 gift to claim', inicio_n: 'You have {n} gifts to claim', inicio_btn: 'Open mailbox',
      error_carga: "Couldn't open the mailbox. Check your internet.",
      t_aviso: 'Notice', t_compensacion: 'Compensation', t_evento: 'Event', t_regalo: 'Gift', t_codigo: 'Code', t_sistema: 'System',
      a_creditos: '{n} credits', a_cable: '{n} × spare cables', a_battery: '{n} × spare batteries', a_reparar: 'Repair all your gear',
      e_codigo_invalido: "That code doesn't exist or is no longer active. Check the spelling.", e_codigo_ya_usado: 'You already redeemed this code on your account.',
      e_codigo_agotado: 'This code has been used up.', e_codigo_vencido: 'This code has expired.', e_codigo_pronto: "This code can't be used yet.",
      e_codigo_lote_usado: 'You already redeemed another code from this campaign: one per account.', e_limite_intentos: 'Too many attempts. Wait 10 minutes and try again.',
      e_mensaje_vencido: 'This gift has expired.', e_credenciales_invalidas: 'Wrong email or password.', e_red: "Can't reach the server. Try again.",
      w_titulo: 'Redeem a gift code', w_intro: 'Sign in with your game account. The gift goes to your in-game mailbox.', w_cargando: 'Connecting…',
      w_correo: 'Email', w_clave: 'Password', w_entrar: 'Sign in', w_sin_cuenta: "No account? Create one for free in the game (Shop → Account).",
      w_codigo: 'Code', w_no_soy: "That's not me", w_conectado: 'Account: {n}', w_listo: 'Done!', w_listo_txt: 'Your gift is in the game mailbox. Open EN VIVO Tycoon and tap the envelope to claim it.',
      w_abrir: 'Open the game', w_otro: 'Redeem another code', w_pie: "Codes are free: nobody sells them. We'll never ask for your card to redeem a code.",
      w_terminos: 'Terms', w_privacidad: 'Privacy',
    },
    'pt-BR': {
      titulo: 'Caixa de correio', abrir: 'Abrir a caixa de correio', abrir_n: 'Correio: {n} novas', cerrar: 'Fechar', volver: 'Voltar', cargando: 'Abrindo o correio…',
      vacio_t: 'Sua caixa está vazia', vacio: 'Aqui chegam os avisos e presentes do jogo.',
      de: 'De {r}', vence: 'Vence em {t}', dias: '{n} d', horas: '{n} h', minutos: '{n} min', hoy: 'Hoje', ayer: 'Ontem',
      reclamar: 'Resgatar', reclamar_todo: 'Resgatar tudo ({n})', reclamado: 'Resgatado', regalo: 'Presente', nuevo: 'Novo',
      borrar: 'Apagar', borrado: 'Mensagem apagada', recibiste: 'Você recebeu {x}!', ya: 'Este presente já foi resgatado.',
      canjear_t: 'Resgatar código', canjear_info: 'Códigos de eventos, redes e influenciadores. Um por conta.', canjear_ph: 'Digite o código',
      canjear_btn: 'Resgatar', canjear_ok: 'Código resgatado! Seu presente chegou ao correio.', canjear_web: 'Você também pode resgatar em {sitio}',
      entra: 'Entre na sua conta para usar o correio e resgatar códigos.', entra_btn: 'Entrar ou criar conta',
      inicio_tag: 'Correio', inicio_1: 'Você tem 1 presente para resgatar', inicio_n: 'Você tem {n} presentes para resgatar', inicio_btn: 'Abrir o correio',
      error_carga: 'Não foi possível abrir o correio. Verifique sua internet.',
      t_aviso: 'Aviso', t_compensacion: 'Compensação', t_evento: 'Evento', t_regalo: 'Presente', t_codigo: 'Código', t_sistema: 'Sistema',
      a_creditos: '{n} créditos', a_cable: '{n} × cabos reserva', a_battery: '{n} × baterias reserva', a_reparar: 'Consertar todo o seu equipamento',
      e_codigo_invalido: 'Esse código não existe ou não está mais ativo. Confira se está bem escrito.', e_codigo_ya_usado: 'Você já resgatou este código na sua conta.',
      e_codigo_agotado: 'Este código já foi usado todas as vezes possíveis.', e_codigo_vencido: 'Este código já venceu.', e_codigo_pronto: 'Este código ainda não pode ser usado.',
      e_codigo_lote_usado: 'Você já resgatou outro código desta campanha: é um por conta.', e_limite_intentos: 'Tentativas demais. Espere 10 minutos e tente de novo.',
      e_mensaje_vencido: 'Este presente já venceu.', e_credenciales_invalidas: 'E-mail ou senha incorretos.', e_red: 'Sem conexão com o servidor. Tente de novo.',
      w_titulo: 'Resgatar um código de presente', w_intro: 'Entre com a mesma conta do jogo. O presente chega ao correio do jogo.', w_cargando: 'Conectando…',
      w_correo: 'E-mail', w_clave: 'Senha', w_entrar: 'Entrar', w_sin_cuenta: 'Não tem conta? Crie grátis dentro do jogo (Loja → Conta).',
      w_codigo: 'Código', w_no_soy: 'Não sou eu', w_conectado: 'Conta: {n}', w_listo: 'Pronto!', w_listo_txt: 'Seu presente está no correio do jogo. Abra o EN VIVO Tycoon e toque no envelope para resgatar.',
      w_abrir: 'Abrir o jogo', w_otro: 'Resgatar outro código', w_pie: 'Os códigos são grátis: ninguém os vende. Nunca pediremos seu cartão para resgatar um código.',
      w_terminos: 'Termos', w_privacidad: 'Privacidade',
    },
    fr: {
      titulo: 'Boîte aux lettres', abrir: 'Ouvrir la boîte aux lettres', abrir_n: 'Courrier : {n} nouveaux', cerrar: 'Fermer', volver: 'Retour', cargando: 'Ouverture du courrier…',
      vacio_t: 'Ta boîte est vide', vacio: 'Les annonces et les cadeaux du jeu arrivent ici.',
      de: 'De {r}', vence: 'Expire dans {t}', dias: '{n} j', horas: '{n} h', minutos: '{n} min', hoy: "Aujourd'hui", ayer: 'Hier',
      reclamar: 'Récupérer', reclamar_todo: 'Tout récupérer ({n})', reclamado: 'Récupéré', regalo: 'Cadeau', nuevo: 'Nouveau',
      borrar: 'Supprimer', borrado: 'Message supprimé', recibiste: 'Tu as reçu {x} !', ya: 'Ce cadeau a déjà été récupéré.',
      canjear_t: 'Utiliser un code', canjear_info: "Codes d'événements, réseaux et créateurs. Un par compte.", canjear_ph: 'Écris le code',
      canjear_btn: 'Valider', canjear_ok: 'Code validé ! Ton cadeau est dans ta boîte aux lettres.', canjear_web: 'Tu peux aussi le valider sur {sitio}',
      entra: 'Connecte-toi pour utiliser le courrier et les codes.', entra_btn: 'Se connecter ou créer un compte',
      inicio_tag: 'Courrier', inicio_1: 'Tu as 1 cadeau à récupérer', inicio_n: 'Tu as {n} cadeaux à récupérer', inicio_btn: 'Ouvrir le courrier',
      error_carga: "Impossible d'ouvrir le courrier. Vérifie ta connexion.",
      t_aviso: 'Annonce', t_compensacion: 'Compensation', t_evento: 'Événement', t_regalo: 'Cadeau', t_codigo: 'Code', t_sistema: 'Système',
      a_creditos: '{n} crédits', a_cable: '{n} × câbles de rechange', a_battery: '{n} × batteries de rechange', a_reparar: 'Réparer tout ton matériel',
      e_codigo_invalido: "Ce code n'existe pas ou n'est plus actif. Vérifie l'orthographe.", e_codigo_ya_usado: 'Tu as déjà utilisé ce code sur ton compte.',
      e_codigo_agotado: 'Ce code a été utilisé le nombre maximal de fois.', e_codigo_vencido: 'Ce code a expiré.', e_codigo_pronto: 'Ce code ne peut pas encore être utilisé.',
      e_codigo_lote_usado: 'Tu as déjà utilisé un autre code de cette campagne : un par compte.', e_limite_intentos: 'Trop de tentatives. Attends 10 minutes et réessaie.',
      e_mensaje_vencido: 'Ce cadeau a expiré.', e_credenciales_invalidas: 'E-mail ou mot de passe incorrect.', e_red: 'Pas de connexion au serveur. Réessaie.',
      w_titulo: 'Utiliser un code cadeau', w_intro: 'Connecte-toi avec ton compte du jeu. Le cadeau arrive dans le courrier du jeu.', w_cargando: 'Connexion…',
      w_correo: 'E-mail', w_clave: 'Mot de passe', w_entrar: 'Se connecter', w_sin_cuenta: "Pas de compte ? Crée-le gratuitement dans le jeu (Boutique → Compte).",
      w_codigo: 'Code', w_no_soy: "Ce n'est pas moi", w_conectado: 'Compte : {n}', w_listo: "C'est fait !", w_listo_txt: "Ton cadeau est dans le courrier du jeu. Ouvre EN VIVO Tycoon et touche l'enveloppe pour le récupérer.",
      w_abrir: 'Ouvrir le jeu', w_otro: 'Utiliser un autre code', w_pie: "Les codes sont gratuits : personne ne les vend. Nous ne te demanderons jamais ta carte pour un code.",
      w_terminos: 'Conditions', w_privacidad: 'Confidentialité',
    },
    de: {
      titulo: 'Postfach', abrir: 'Postfach öffnen', abrir_n: 'Postfach: {n} neu', cerrar: 'Schließen', volver: 'Zurück', cargando: 'Postfach wird geöffnet…',
      vacio_t: 'Dein Postfach ist leer', vacio: 'Hier kommen Nachrichten und Geschenke des Spiels an.',
      de: 'Von {r}', vence: 'Läuft ab in {t}', dias: '{n} T', horas: '{n} Std', minutos: '{n} Min', hoy: 'Heute', ayer: 'Gestern',
      reclamar: 'Abholen', reclamar_todo: 'Alles abholen ({n})', reclamado: 'Abgeholt', regalo: 'Geschenk', nuevo: 'Neu',
      borrar: 'Löschen', borrado: 'Nachricht gelöscht', recibiste: 'Du hast {x} erhalten!', ya: 'Dieses Geschenk wurde schon abgeholt.',
      canjear_t: 'Code einlösen', canjear_info: 'Codes von Events, sozialen Netzwerken und Creators. Einer pro Konto.', canjear_ph: 'Code eingeben',
      canjear_btn: 'Einlösen', canjear_ok: 'Code eingelöst! Dein Geschenk ist im Postfach.', canjear_web: 'Du kannst auch auf {sitio} einlösen',
      entra: 'Melde dich an, um das Postfach und Codes zu nutzen.', entra_btn: 'Anmelden oder Konto erstellen',
      inicio_tag: 'Postfach', inicio_1: 'Du hast 1 Geschenk zum Abholen', inicio_n: 'Du hast {n} Geschenke zum Abholen', inicio_btn: 'Postfach öffnen',
      error_carga: 'Postfach konnte nicht geöffnet werden. Prüfe dein Internet.',
      t_aviso: 'Hinweis', t_compensacion: 'Entschädigung', t_evento: 'Event', t_regalo: 'Geschenk', t_codigo: 'Code', t_sistema: 'System',
      a_creditos: '{n} Credits', a_cable: '{n} × Ersatzkabel', a_battery: '{n} × Ersatzakkus', a_reparar: 'Ganze Ausrüstung reparieren',
      e_codigo_invalido: 'Diesen Code gibt es nicht oder er ist nicht mehr aktiv. Prüfe die Schreibweise.', e_codigo_ya_usado: 'Du hast diesen Code schon mit deinem Konto eingelöst.',
      e_codigo_agotado: 'Dieser Code ist aufgebraucht.', e_codigo_vencido: 'Dieser Code ist abgelaufen.', e_codigo_pronto: 'Dieser Code kann noch nicht benutzt werden.',
      e_codigo_lote_usado: 'Du hast schon einen anderen Code dieser Aktion eingelöst: einer pro Konto.', e_limite_intentos: 'Zu viele Versuche. Warte 10 Minuten und versuche es erneut.',
      e_mensaje_vencido: 'Dieses Geschenk ist abgelaufen.', e_credenciales_invalidas: 'E-Mail oder Passwort falsch.', e_red: 'Keine Verbindung zum Server. Versuche es erneut.',
      w_titulo: 'Geschenkcode einlösen', w_intro: 'Melde dich mit deinem Spielkonto an. Das Geschenk kommt ins Postfach im Spiel.', w_cargando: 'Verbinde…',
      w_correo: 'E-Mail', w_clave: 'Passwort', w_entrar: 'Anmelden', w_sin_cuenta: 'Kein Konto? Erstelle es kostenlos im Spiel (Shop → Konto).',
      w_codigo: 'Code', w_no_soy: 'Das bin nicht ich', w_conectado: 'Konto: {n}', w_listo: 'Fertig!', w_listo_txt: 'Dein Geschenk ist im Postfach des Spiels. Öffne EN VIVO Tycoon und tippe auf den Umschlag.',
      w_abrir: 'Spiel öffnen', w_otro: 'Weiteren Code einlösen', w_pie: 'Codes sind kostenlos: niemand verkauft sie. Wir fragen nie nach deiner Karte, um einen Code einzulösen.',
      w_terminos: 'Bedingungen', w_privacidad: 'Datenschutz',
    },
    it: {
      titulo: 'Posta', abrir: 'Apri la posta', abrir_n: 'Posta: {n} nuovi', cerrar: 'Chiudi', volver: 'Indietro', cargando: 'Apertura della posta…',
      vacio_t: 'La tua posta è vuota', vacio: 'Qui arrivano gli avvisi e i regali del gioco.',
      de: 'Da {r}', vence: 'Scade tra {t}', dias: '{n} g', horas: '{n} h', minutos: '{n} min', hoy: 'Oggi', ayer: 'Ieri',
      reclamar: 'Riscatta', reclamar_todo: 'Riscatta tutto ({n})', reclamado: 'Riscattato', regalo: 'Regalo', nuevo: 'Nuovo',
      borrar: 'Elimina', borrado: 'Messaggio eliminato', recibiste: 'Hai ricevuto {x}!', ya: 'Questo regalo era già stato riscattato.',
      canjear_t: 'Riscatta codice', canjear_info: 'Codici di eventi, social e creator. Uno per account.', canjear_ph: 'Scrivi il codice',
      canjear_btn: 'Riscatta', canjear_ok: 'Codice riscattato! Il regalo è nella tua posta.', canjear_web: 'Puoi riscattarlo anche su {sitio}',
      entra: 'Accedi per usare la posta e riscattare codici.', entra_btn: 'Accedi o crea un account',
      inicio_tag: 'Posta', inicio_1: 'Hai 1 regalo da riscattare', inicio_n: 'Hai {n} regali da riscattare', inicio_btn: 'Apri la posta',
      error_carga: 'Impossibile aprire la posta. Controlla la connessione.',
      t_aviso: 'Avviso', t_compensacion: 'Compensazione', t_evento: 'Evento', t_regalo: 'Regalo', t_codigo: 'Codice', t_sistema: 'Sistema',
      a_creditos: '{n} crediti', a_cable: '{n} × cavi di ricambio', a_battery: '{n} × batterie di ricambio', a_reparar: 'Ripara tutta la tua attrezzatura',
      e_codigo_invalido: 'Questo codice non esiste o non è più attivo. Controlla che sia scritto bene.', e_codigo_ya_usado: 'Hai già riscattato questo codice con il tuo account.',
      e_codigo_agotado: 'Questo codice è esaurito.', e_codigo_vencido: 'Questo codice è scaduto.', e_codigo_pronto: 'Questo codice non si può ancora usare.',
      e_codigo_lote_usado: 'Hai già riscattato un altro codice di questa campagna: uno per account.', e_limite_intentos: 'Troppi tentativi. Aspetta 10 minuti e riprova.',
      e_mensaje_vencido: 'Questo regalo è scaduto.', e_credenciales_invalidas: 'E-mail o password errati.', e_red: 'Nessuna connessione al server. Riprova.',
      w_titulo: 'Riscatta un codice regalo', w_intro: "Accedi con lo stesso account del gioco. Il regalo arriva nella posta del gioco.", w_cargando: 'Connessione…',
      w_correo: 'E-mail', w_clave: 'Password', w_entrar: 'Accedi', w_sin_cuenta: 'Non hai un account? Crealo gratis nel gioco (Negozio → Account).',
      w_codigo: 'Codice', w_no_soy: 'Non sono io', w_conectado: 'Account: {n}', w_listo: 'Fatto!', w_listo_txt: 'Il regalo è nella posta del gioco. Apri EN VIVO Tycoon e tocca la busta per riscattarlo.',
      w_abrir: 'Apri il gioco', w_otro: 'Riscatta un altro codice', w_pie: 'I codici sono gratis: nessuno li vende. Non ti chiederemo mai la carta per un codice.',
      w_terminos: 'Termini', w_privacidad: 'Privacy',
    },
    ru: {
      titulo: 'Почта', abrir: 'Открыть почту', abrir_n: 'Почта: {n} новых', cerrar: 'Закрыть', volver: 'Назад', cargando: 'Открываем почту…',
      vacio_t: 'Почта пуста', vacio: 'Сюда приходят новости и подарки игры.',
      de: 'От: {r}', vence: 'Истекает через {t}', dias: '{n} дн.', horas: '{n} ч', minutos: '{n} мин', hoy: 'Сегодня', ayer: 'Вчера',
      reclamar: 'Забрать', reclamar_todo: 'Забрать всё ({n})', reclamado: 'Получено', regalo: 'Подарок', nuevo: 'Новое',
      borrar: 'Удалить', borrado: 'Сообщение удалено', recibiste: 'Ты получил: {x}!', ya: 'Этот подарок уже получен.',
      canjear_t: 'Ввести код', canjear_info: 'Коды с событий, из соцсетей и от блогеров. Один на аккаунт.', canjear_ph: 'Введи код',
      canjear_btn: 'Активировать', canjear_ok: 'Код активирован! Подарок в почте.', canjear_web: 'Код можно ввести и на {sitio}',
      entra: 'Войди в аккаунт, чтобы пользоваться почтой и кодами.', entra_btn: 'Войти или создать аккаунт',
      inicio_tag: 'Почта', inicio_1: 'У тебя 1 подарок в почте', inicio_n: 'Подарков в почте: {n}', inicio_btn: 'Открыть почту',
      error_carga: 'Не удалось открыть почту. Проверь интернет.',
      t_aviso: 'Новость', t_compensacion: 'Компенсация', t_evento: 'Событие', t_regalo: 'Подарок', t_codigo: 'Код', t_sistema: 'Система',
      a_creditos: 'Кредиты: {n}', a_cable: 'Запасные кабели × {n}', a_battery: 'Запасные батареи × {n}', a_reparar: 'Починить всё оборудование',
      e_codigo_invalido: 'Такого кода нет или он уже не активен. Проверь написание.', e_codigo_ya_usado: 'Ты уже активировал этот код на своём аккаунте.',
      e_codigo_agotado: 'Этот код больше нельзя использовать.', e_codigo_vencido: 'Срок действия кода истёк.', e_codigo_pronto: 'Этот код пока нельзя использовать.',
      e_codigo_lote_usado: 'Ты уже активировал другой код этой акции: один на аккаунт.', e_limite_intentos: 'Слишком много попыток. Подожди 10 минут.',
      e_mensaje_vencido: 'Срок подарка истёк.', e_credenciales_invalidas: 'Неверная почта или пароль.', e_red: 'Нет связи с сервером. Попробуй ещё раз.',
      w_titulo: 'Активировать подарочный код', w_intro: 'Войди в тот же аккаунт, что и в игре. Подарок придёт в игровую почту.', w_cargando: 'Подключение…',
      w_correo: 'Почта', w_clave: 'Пароль', w_entrar: 'Войти', w_sin_cuenta: 'Нет аккаунта? Создай его бесплатно в игре (Магазин → Аккаунт).',
      w_codigo: 'Код', w_no_soy: 'Это не я', w_conectado: 'Аккаунт: {n}', w_listo: 'Готово!', w_listo_txt: 'Подарок в игровой почте. Открой EN VIVO Tycoon и нажми на конверт.',
      w_abrir: 'Открыть игру', w_otro: 'Ввести другой код', w_pie: 'Коды бесплатны: их никто не продаёт. Мы никогда не попросим карту для активации кода.',
      w_terminos: 'Условия', w_privacidad: 'Конфиденциальность',
    },
    tr: {
      titulo: 'Posta kutusu', abrir: 'Posta kutusunu aç', abrir_n: 'Posta: {n} yeni', cerrar: 'Kapat', volver: 'Geri', cargando: 'Posta kutusu açılıyor…',
      vacio_t: 'Posta kutun boş', vacio: 'Oyunun duyuruları ve hediyeleri buraya gelir.',
      de: 'Gönderen: {r}', vence: '{t} içinde sona erer', dias: '{n} g', horas: '{n} sa', minutos: '{n} dk', hoy: 'Bugün', ayer: 'Dün',
      reclamar: 'Al', reclamar_todo: 'Hepsini al ({n})', reclamado: 'Alındı', regalo: 'Hediye', nuevo: 'Yeni',
      borrar: 'Sil', borrado: 'Mesaj silindi', recibiste: '{x} kazandın!', ya: 'Bu hediye zaten alınmış.',
      canjear_t: 'Kod kullan', canjear_info: 'Etkinlik, sosyal medya ve içerik üreticisi kodları. Hesap başına bir tane.', canjear_ph: 'Kodu yaz',
      canjear_btn: 'Kullan', canjear_ok: 'Kod kullanıldı! Hediyen posta kutunda.', canjear_web: 'Kodu {sitio} adresinde de kullanabilirsin',
      entra: 'Posta kutusu ve kodlar için hesabına giriş yap.', entra_btn: 'Giriş yap veya hesap aç',
      inicio_tag: 'Posta', inicio_1: 'Alınacak 1 hediyen var', inicio_n: 'Alınacak {n} hediyen var', inicio_btn: 'Posta kutusunu aç',
      error_carga: 'Posta kutusu açılamadı. İnternetini kontrol et.',
      t_aviso: 'Duyuru', t_compensacion: 'Telafi', t_evento: 'Etkinlik', t_regalo: 'Hediye', t_codigo: 'Kod', t_sistema: 'Sistem',
      a_creditos: '{n} kredi', a_cable: '{n} × yedek kablo', a_battery: '{n} × yedek batarya', a_reparar: 'Tüm ekipmanını onar',
      e_codigo_invalido: 'Bu kod yok ya da artık geçerli değil. Doğru yazdığından emin ol.', e_codigo_ya_usado: 'Bu kodu hesabında zaten kullandın.',
      e_codigo_agotado: 'Bu kodun kullanım hakkı bitti.', e_codigo_vencido: 'Bu kodun süresi doldu.', e_codigo_pronto: 'Bu kod henüz kullanılamaz.',
      e_codigo_lote_usado: 'Bu kampanyadan başka bir kod zaten kullandın: hesap başına bir tane.', e_limite_intentos: 'Çok fazla deneme. 10 dakika bekleyip tekrar dene.',
      e_mensaje_vencido: 'Bu hediyenin süresi doldu.', e_credenciales_invalidas: 'E-posta veya şifre yanlış.', e_red: 'Sunucuya bağlanılamadı. Tekrar dene.',
      w_titulo: 'Hediye kodu kullan', w_intro: 'Oyundaki hesabınla giriş yap. Hediye oyundaki posta kutusuna gelir.', w_cargando: 'Bağlanıyor…',
      w_correo: 'E-posta', w_clave: 'Şifre', w_entrar: 'Giriş yap', w_sin_cuenta: 'Hesabın yok mu? Oyunda ücretsiz oluştur (Mağaza → Hesap).',
      w_codigo: 'Kod', w_no_soy: 'Bu ben değilim', w_conectado: 'Hesap: {n}', w_listo: 'Tamam!', w_listo_txt: 'Hediyen oyunun posta kutusunda. EN VIVO Tycoon’u aç ve zarfa dokun.',
      w_abrir: 'Oyunu aç', w_otro: 'Başka kod kullan', w_pie: 'Kodlar ücretsizdir: kimse satmaz. Kod için asla kartını istemeyiz.',
      w_terminos: 'Koşullar', w_privacidad: 'Gizlilik',
    },
    id: {
      titulo: 'Kotak surat', abrir: 'Buka kotak surat', abrir_n: 'Surat: {n} baru', cerrar: 'Tutup', volver: 'Kembali', cargando: 'Membuka kotak surat…',
      vacio_t: 'Kotak suratmu kosong', vacio: 'Pengumuman dan hadiah dari game datang ke sini.',
      de: 'Dari {r}', vence: 'Berakhir dalam {t}', dias: '{n} h', horas: '{n} j', minutos: '{n} mnt', hoy: 'Hari ini', ayer: 'Kemarin',
      reclamar: 'Ambil', reclamar_todo: 'Ambil semua ({n})', reclamado: 'Sudah diambil', regalo: 'Hadiah', nuevo: 'Baru',
      borrar: 'Hapus', borrado: 'Pesan dihapus', recibiste: 'Kamu dapat {x}!', ya: 'Hadiah ini sudah diambil.',
      canjear_t: 'Tukar kode', canjear_info: 'Kode dari event, media sosial, dan kreator. Satu per akun.', canjear_ph: 'Tulis kodenya',
      canjear_btn: 'Tukar', canjear_ok: 'Kode berhasil ditukar! Hadiahmu ada di kotak surat.', canjear_web: 'Kamu juga bisa menukar di {sitio}',
      entra: 'Masuk ke akunmu untuk memakai kotak surat dan kode.', entra_btn: 'Masuk atau buat akun',
      inicio_tag: 'Kotak surat', inicio_1: 'Ada 1 hadiah untuk diambil', inicio_n: 'Ada {n} hadiah untuk diambil', inicio_btn: 'Buka kotak surat',
      error_carga: 'Kotak surat tidak bisa dibuka. Cek internetmu.',
      t_aviso: 'Pengumuman', t_compensacion: 'Kompensasi', t_evento: 'Event', t_regalo: 'Hadiah', t_codigo: 'Kode', t_sistema: 'Sistem',
      a_creditos: '{n} kredit', a_cable: '{n} × kabel cadangan', a_battery: '{n} × baterai cadangan', a_reparar: 'Perbaiki semua peralatanmu',
      e_codigo_invalido: 'Kode itu tidak ada atau sudah tidak aktif. Cek penulisannya.', e_codigo_ya_usado: 'Kamu sudah menukar kode ini di akunmu.',
      e_codigo_agotado: 'Kode ini sudah habis dipakai.', e_codigo_vencido: 'Kode ini sudah kedaluwarsa.', e_codigo_pronto: 'Kode ini belum bisa dipakai.',
      e_codigo_lote_usado: 'Kamu sudah menukar kode lain dari kampanye ini: satu per akun.', e_limite_intentos: 'Terlalu banyak percobaan. Tunggu 10 menit lalu coba lagi.',
      e_mensaje_vencido: 'Hadiah ini sudah kedaluwarsa.', e_credenciales_invalidas: 'Email atau kata sandi salah.', e_red: 'Tidak ada koneksi ke server. Coba lagi.',
      w_titulo: 'Tukar kode hadiah', w_intro: 'Masuk dengan akun game yang sama. Hadiah masuk ke kotak surat di game.', w_cargando: 'Menghubungkan…',
      w_correo: 'Email', w_clave: 'Kata sandi', w_entrar: 'Masuk', w_sin_cuenta: 'Belum punya akun? Buat gratis di dalam game (Toko → Akun).',
      w_codigo: 'Kode', w_no_soy: 'Bukan saya', w_conectado: 'Akun: {n}', w_listo: 'Selesai!', w_listo_txt: 'Hadiahmu ada di kotak surat game. Buka EN VIVO Tycoon dan ketuk amplopnya.',
      w_abrir: 'Buka game', w_otro: 'Tukar kode lain', w_pie: 'Kode itu gratis: tidak ada yang menjualnya. Kami tidak akan pernah meminta kartumu untuk menukar kode.',
      w_terminos: 'Ketentuan', w_privacidad: 'Privasi',
    },
    'zh-CN': {
      titulo: '邮箱', abrir: '打开邮箱', abrir_n: '邮箱：{n} 封新邮件', cerrar: '关闭', volver: '返回', cargando: '正在打开邮箱…',
      vacio_t: '邮箱是空的', vacio: '游戏公告和礼物会送到这里。',
      de: '来自 {r}', vence: '{t}后过期', dias: '{n}天', horas: '{n}小时', minutos: '{n}分钟', hoy: '今天', ayer: '昨天',
      reclamar: '领取', reclamar_todo: '全部领取（{n}）', reclamado: '已领取', regalo: '礼物', nuevo: '新',
      borrar: '删除', borrado: '邮件已删除', recibiste: '你获得了 {x}！', ya: '这个礼物已经领取过了。',
      canjear_t: '兑换码', canjear_info: '来自活动、社交平台和主播的兑换码。每个账号限一次。', canjear_ph: '输入兑换码',
      canjear_btn: '兑换', canjear_ok: '兑换成功！礼物已送到邮箱。', canjear_web: '也可以在 {sitio} 兑换',
      entra: '登录账号后才能使用邮箱和兑换码。', entra_btn: '登录或注册',
      inicio_tag: '邮箱', inicio_1: '你有 1 个礼物待领取', inicio_n: '你有 {n} 个礼物待领取', inicio_btn: '打开邮箱',
      error_carga: '无法打开邮箱，请检查网络。',
      t_aviso: '公告', t_compensacion: '补偿', t_evento: '活动', t_regalo: '礼物', t_codigo: '兑换码', t_sistema: '系统',
      a_creditos: '{n} 点数', a_cable: '备用线缆 × {n}', a_battery: '备用电池 × {n}', a_reparar: '修好你的全部设备',
      e_codigo_invalido: '兑换码不存在或已失效，请检查拼写。', e_codigo_ya_usado: '你的账号已经兑换过这个码。',
      e_codigo_agotado: '这个兑换码的次数已用完。', e_codigo_vencido: '这个兑换码已过期。', e_codigo_pronto: '这个兑换码还不能使用。',
      e_codigo_lote_usado: '你已兑换过这次活动的其他兑换码：每个账号限一次。', e_limite_intentos: '尝试次数过多，请 10 分钟后再试。',
      e_mensaje_vencido: '这个礼物已过期。', e_credenciales_invalidas: '邮箱或密码错误。', e_red: '无法连接服务器，请重试。',
      w_titulo: '兑换礼物码', w_intro: '用游戏里的同一个账号登录。礼物会送到游戏邮箱。', w_cargando: '正在连接…',
      w_correo: '邮箱', w_clave: '密码', w_entrar: '登录', w_sin_cuenta: '没有账号？在游戏里免费注册（商店 → 账号）。',
      w_codigo: '兑换码', w_no_soy: '不是我', w_conectado: '账号：{n}', w_listo: '完成！', w_listo_txt: '礼物已在游戏邮箱里。打开 EN VIVO Tycoon，点信封即可领取。',
      w_abrir: '打开游戏', w_otro: '再兑换一个', w_pie: '兑换码是免费的，没有人出售。兑换时我们绝不会要求你的银行卡。',
      w_terminos: '条款', w_privacidad: '隐私',
    },
  };

  /* ---------- Idioma ---------- */
  function idioma() {
    let c = null;
    try { c = root.I18N && root.I18N.idioma; } catch (e) { c = null; }
    if (!c) { try { c = root.localStorage && root.localStorage.getItem('envivo_lang'); } catch (e) { c = null; } }
    if (!c) {
      try {
        const n = String((root.navigator && (root.navigator.language || '')) || '').toLowerCase();
        c = n.startsWith('pt') ? 'pt-BR' : n.startsWith('zh') ? 'zh-CN' : n.split('-')[0];
      } catch (e) { c = 'es'; }
    }
    return TEXTOS[c] ? c : 'es';
  }
  function t(k, p) {
    const s = (TEXTOS[idioma()] || TEXTOS.es)[k] || TEXTOS.es[k] || k;
    return p ? s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined && p[x] !== null ? String(p[x]) : m)) : s;
  }
  /** Texto de un error del servidor por su codigo (si lo conocemos), si no el texto del servidor. */
  function textoError(e) {
    const c = e && e.codigo;
    if (c && (TEXTOS.es['e_' + c])) return t('e_' + c);
    if (c && /^cuenta_/.test(c) && e.message) return e.message;
    return (e && e.message) || t('e_red');
  }
  const escH = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Servidor ---------- */
  async function pedir(method, ruta, body) {
    let r, j = null;
    try {
      r = await fetch(ruta, { method, credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': idioma() },
        body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { const er = new Error(t('e_red')); er.codigo = 'red'; throw er; }
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) {
      const er = new Error((j && j.error) || t('e_red'));
      er.codigo = (j && j.codigo) || null; er.status = r.status;
      throw er;
    }
    return j;
  }

  /* ---------- Estado ---------- */
  const st = { datos: null, cargando: null, cargadoEn: 0, errorEn: 0, jugador: null, ctx: null, vista: 'lista', abierto: null, ocupado: false, montado: false };
  const Api = () => root.Api || null;
  const logueado = () => { const a = Api(); return !!(a && a.estado && a.estado.logueado); };
  const jugadorId = () => { const a = Api(); return a && a.estado && a.estado.jugador ? a.estado.jugador.id : null; };
  /** Mensajes "nuevos" para el sobre: sin leer o con regalo por reclamar. */
  const nuevos = () => (st.datos && Array.isArray(st.datos.mensajes) ? st.datos.mensajes.filter((m) => m.estado === 'sin_leer' || m.reclamable).length : 0);
  const porReclamar = () => (st.datos && Array.isArray(st.datos.mensajes) ? st.datos.mensajes.filter((m) => m.reclamable).length : 0);

  async function cargar() {
    if (!logueado()) { st.datos = null; pintarBoton(); return null; }
    if (st.cargando) return st.cargando;
    const antes = nuevos();
    st.cargando = (async () => {
      try {
        const j = await pedir('GET', '/api/buzon');
        st.datos = j; st.cargadoEn = Date.now(); st.jugador = jugadorId();
        return j;
      } catch (e) { st.errorEn = Date.now(); throw e; } finally { st.cargando = null; pintarBoton(); }
    })();
    const r = await st.cargando;
    // el aviso de Inicio cambia: se vuelve a pintar (solo si cambió, sin bucles)
    if (nuevos() !== antes && st.ctx && typeof st.ctx.render === 'function' && !estaAbierto()) { try { st.ctx.render(); } catch (e) { /* nada */ } }
    return r;
  }
  function revisarCuenta() {
    // otra cuenta (o salió): se olvida lo que había
    const id = logueado() ? jugadorId() : null;
    if (id !== st.jugador) { st.datos = null; st.jugador = id; st.cargadoEn = 0; if (id) cargar().catch(() => {}); else pintarBoton(); }
  }

  /* ---------- Estilos ---------- */
  function estilos() {
    if (typeof document === 'undefined' || document.getElementById('buzon-css')) return;
    const s = document.createElement('style');
    s.id = 'buzon-css';
    s.textContent = `
      .mailbtn{position:relative;margin-inline-start:auto}
      .mailbtn[hidden] + .iconbtn{margin-inline-start:auto}
      .mailbtn svg{width:18px;height:18px;display:block}
      .mailbtn .mailbadge{position:absolute;top:-6px;inset-inline-end:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:var(--red,#ff3b47);color:#fff;
        font:800 10.5px/17px var(--f-body,system-ui);text-align:center;box-shadow:0 0 0 2px var(--bg,#0d0f14);letter-spacing:0}
      .mailbtn .mailbadge:empty{display:none}
      .bz-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .bz-head h2{margin:0;display:flex;align-items:center;gap:8px}
      .bz-list{display:flex;flex-direction:column;gap:8px;margin:6px 0 10px}
      .bz-item{display:flex;align-items:center;gap:10px;width:100%;text-align:start;background:var(--panel2,#1a1e27);border:1px solid var(--line,#2a2f3a);border-radius:12px;padding:10px 12px;color:inherit;font:inherit;cursor:pointer}
      .bz-item.nuevo{border-color:rgba(255,176,32,.55)}
      .bz-item .bz-ico{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.06);font-size:18px}
      .bz-item.regalo .bz-ico{background:rgba(57,217,138,.16)}
      .bz-item .bz-txt{flex:1;min-width:0}
      .bz-item .bz-tt{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .bz-item.nuevo .bz-tt::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--amber,#ffb020);margin-inline-end:6px;vertical-align:middle}
      .bz-item .bz-sub{font-size:12px;color:var(--muted,#9aa3b2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .bz-tag{flex:none;font-size:11px;font-weight:800;padding:3px 7px;border-radius:999px;background:rgba(57,217,138,.16);color:var(--green,#39d98a)}
      .bz-tag.hecho{background:rgba(255,255,255,.06);color:var(--muted,#9aa3b2)}
      .bz-body{white-space:normal;overflow-wrap:anywhere;line-height:1.45;margin:8px 0}
      .bz-adj{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px}
      .bz-adj span{background:rgba(255,176,32,.12);border:1px solid rgba(255,176,32,.35);border-radius:999px;padding:4px 10px;font-size:13px;font-weight:700}
      .bz-canje{display:flex;gap:8px;margin-top:6px}
      .bz-canje input{flex:1;min-width:0;font:inherit;font-size:16px;color:var(--text,#eef1f6);background:var(--panel2,#1a1e27);border:1px solid var(--line,#2a2f3a);border-radius:10px;padding:11px 12px;
        text-transform:uppercase;letter-spacing:.08em;font-weight:800}
      .bz-canje input::placeholder{text-transform:none;letter-spacing:0;font-weight:500;color:var(--muted,#9aa3b2)}
      .bz-canje input:focus-visible{outline:2px solid var(--amber,#ffb020);outline-offset:1px}
      .bz-canje .btn{width:auto;flex:none;margin:0}
      .bz-sep{border:0;border-top:1px solid var(--line,#2a2f3a);margin:14px 0 10px}
      .bz-err{color:var(--red,#ff3b47);min-height:1.2em;margin:6px 0 0}
      .bz-card .row{gap:10px}
      @media (max-width:430px){
        .brand.con-buzon{font-size:18px;gap:6px}
        .brand.con-buzon .iconbtn{width:32px}
        .brand.con-buzon .iconbtn + .iconbtn:not(.langbtn){margin-inline-start:4px}
        .brand.con-buzon .langbtn{margin-inline-start:4px;padding:0 6px;width:auto}
        .brand.con-buzon:has(.vipbadge:not([hidden])){font-size:16px}
      }
      @media (max-width:380px){
        .brand.con-buzon{font-size:16px;gap:5px}
        .brand.con-buzon .iconbtn{width:30px}
        .brand.con-buzon .langbtn{width:auto}
        .brand.con-buzon:has(.vipbadge:not([hidden])){font-size:14px}
      }
    `;
    document.head.appendChild(s);
  }
  const SOBRE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>';

  /* ---------- Sobre del encabezado ---------- */
  function montarBoton() {
    if (st.montado || typeof document === 'undefined') return;
    const mute = document.getElementById('muteBtn');
    if (!mute || !mute.parentElement) return;   // fuera del juego (por ejemplo /canjear.html)
    estilos();
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'buzonBtn';
    b.className = 'iconbtn mailbtn';
    b.dataset.ext = ID; b.dataset.acc = 'abrir';
    b.hidden = true;
    b.innerHTML = SOBRE + '<b class="mailbadge" id="buzonBadge"></b>';
    mute.parentElement.insertBefore(b, mute);
    st.montado = true;
    pintarBoton();
  }
  function pintarBoton() {
    const b = typeof document !== 'undefined' && document.getElementById('buzonBtn');
    if (!b) return;
    const a = Api();
    b.hidden = !(a && a.disponible && logueado());
    if (b.parentElement) b.parentElement.classList.toggle('con-buzon', !b.hidden);
    const n = nuevos();
    const bd = document.getElementById('buzonBadge');
    if (bd) bd.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
    const l = n > 0 ? t('abrir_n', { n }) : t('abrir');
    b.setAttribute('aria-label', l); b.title = l;
  }

  /* ---------- Textos de premios y fechas ---------- */
  function nombreAdjunto(a, ctx) {
    const n = Number(a.cantidad) || 1;
    const N = ctx && ctx.N ? ctx.N : (x) => { try { return Number(x).toLocaleString(idioma() === 'es' ? 'es-EC' : idioma()); } catch (e) { return String(x); } };
    const TL = ctx && ctx.TL ? ctx.TL : (x) => x;
    const G = ctx && ctx.G;
    switch (a.tipo) {
      case 'creditos': return t('a_creditos', { n: N(n) });
      case 'dinero': return ctx && ctx.M ? ctx.M(n) : '$' + N(n);
      case 'consumible': return a.item === 'cable' || a.item === 'battery' ? t('a_' + a.item, { n: N(n) }) : TL(a.nombre || a.item);
      case 'reparar_todo': return t('a_reparar');
      case 'item': {
        const it = G && G.CATALOG && G.CATALOG[a.item];
        const nm = it ? TL(it.name) : TL(a.nombre || a.item);
        return (n > 1 ? n + ' × ' : '') + nm;
      }
      default: return TL(a.nombre || a.item);
    }
  }
  function tiempo(seg) {
    const s = Math.max(0, Number(seg) || 0);
    if (s >= 86400) return t('dias', { n: Math.round(s / 86400) });
    if (s >= 3600) return t('horas', { n: Math.floor(s / 3600) });
    return t('minutos', { n: Math.max(1, Math.floor(s / 60)) });
  }
  function fecha(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const hoy = new Date(); const ay = new Date(Date.now() - 86400000);
    const igual = (x, y) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
    if (igual(d, hoy)) return t('hoy');
    if (igual(d, ay)) return t('ayer');
    try {
      const L = root.I18N && root.I18N.idiomas && root.I18N.idiomas.find((x) => x.code === idioma());
      return d.toLocaleDateString((L && L.locale) || (idioma() === 'es' ? 'es-EC' : idioma()), { day: 'numeric', month: 'short' });
    } catch (e) { return d.toISOString().slice(0, 10); }
  }
  const ICONO = { aviso: '📢', compensacion: '🛠️', evento: '🎉', regalo: '🎁', codigo: '🎟️', sistema: '⚙️' };

  /* ---------- Ventana ---------- */
  const estaAbierto = () => { try { const o = document.getElementById('overlay'); return !!(o && o.classList.contains('on') && document.querySelector('#modal [data-buzon]')); } catch (e) { return false; } };
  function cabeza(ctx, titulo, atras) {
    const esc = ctx.esc || escH;
    return `<div class="bz-head"><h2>${atras ? `<button class="btn sm" data-ext="buzon" data-acc="volver" aria-label="${esc(t('volver'))}" style="width:auto;margin:0">‹</button>` : `<span class="mailbtn" style="margin:0;display:inline-grid">${SOBRE}</span>`}${esc(titulo)}</h2>
      <button class="btn sm" data-act="close" aria-label="${esc(t('cerrar'))}" style="width:auto;margin:0">${ctx.I ? ctx.I('close', 'sm') : '✕'}</button></div>`;
  }
  function formCanje(ctx) {
    const esc = ctx.esc || escH;
    return `<div class="bz-canjear"><h3 style="margin:0 0 2px">🎟️ ${esc(t('canjear_t'))}</h3><p class="small muted" style="margin:0">${esc(t('canjear_info'))}</p>
      <div class="bz-canje"><input id="bz-codigo" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="${esc(t('canjear_ph'))}" placeholder="${esc(t('canjear_ph'))}">
      <button class="btn main" data-ext="buzon" data-acc="canjear-enviar" id="bz-canjear-btn">${esc(t('canjear_btn'))}</button></div>
      <p class="small bz-err" id="bz-error" aria-live="polite"></p></div>`;
  }
  function htmlLista(ctx) {
    const esc = ctx.esc || escH;
    const d = st.datos;
    if (!d) return `<div data-buzon="lista">${cabeza(ctx, t('titulo'))}<p class="small muted">${esc(st.errorEn > st.cargadoEn ? t('error_carga') : t('cargando'))}</p><hr class="bz-sep">${formCanje(ctx)}</div>`;
    const ms = d.mensajes || [];
    const pr = porReclamar();
    const lista = ms.length ? `<div class="bz-list">${ms.map((m) => {
      const regalo = m.adjuntos && m.adjuntos.length;
      const sub = (regalo ? m.adjuntos.map((a) => nombreAdjunto(a, ctx)).join(' · ') : (m.cuerpo || '').split('\n')[0]) || t('t_' + m.tipo);
      const tag = m.reclamable ? `<span class="bz-tag">🎁 ${esc(t('regalo'))}</span>` : m.estado === 'reclamado' ? `<span class="bz-tag hecho">✓ ${esc(t('reclamado'))}</span>` : '';
      return `<button class="bz-item${m.estado === 'sin_leer' || m.reclamable ? ' nuevo' : ''}${regalo ? ' regalo' : ''}" data-ext="buzon" data-acc="ver" data-id="${m.id}">
        <span class="bz-ico" aria-hidden="true">${ICONO[m.tipo] || '✉️'}</span>
        <span class="bz-txt"><span class="bz-tt" style="display:block">${esc(m.titulo)}</span><span class="bz-sub" style="display:block">${esc(fecha(m.creado))} · ${esc(sub)}</span></span>${tag}</button>`;
    }).join('')}</div>` : `<div class="card" style="text-align:center"><div style="font-size:34px">📭</div><h3 style="margin:4px 0">${esc(t('vacio_t'))}</h3><p class="small muted" style="margin:0">${esc(t('vacio'))}</p></div>`;
    return `<div data-buzon="lista">${cabeza(ctx, t('titulo'))}
      ${pr > 1 ? `<button class="btn green" data-ext="buzon" data-acc="todo">🎁 ${esc(t('reclamar_todo', { n: pr }))}</button>` : ''}
      ${lista}<hr class="bz-sep">${formCanje(ctx)}</div>`;
  }
  function htmlMensaje(ctx, m) {
    const esc = ctx.esc || escH;
    const adj = m.adjuntos && m.adjuntos.length ? `<div class="bz-adj">${m.adjuntos.map((a) => `<span>${esc(nombreAdjunto(a, ctx))}</span>`).join('')}</div>` : '';
    const accion = m.reclamable
      ? `<button class="btn green main" data-ext="buzon" data-acc="reclamar" data-id="${m.id}">🎁 ${esc(t('reclamar'))}</button>
         ${m.vence_seg !== null && m.vence_seg !== undefined ? `<p class="small" style="color:var(--amber);margin:6px 0 0">${esc(t('vence', { t: tiempo(m.vence_seg) }))}</p>` : ''}`
      : (m.adjuntos && m.adjuntos.length && m.estado === 'reclamado' ? `<p class="small" style="color:var(--green)">✓ ${esc(t('reclamado'))}</p>` : '');
    return `<div data-buzon="mensaje" data-id="${m.id}">${cabeza(ctx, t('t_' + m.tipo) || t('titulo'), true)}
      <p class="small muted" style="margin:0">${esc(t('de', { r: m.remitente }))} · ${esc(fecha(m.creado))}</p>
      <h3 style="margin:8px 0 0">${esc(m.titulo)}</h3>
      ${m.cuerpo ? `<div class="bz-body">${esc(m.cuerpo).replace(/\n/g, '<br>')}</div>` : ''}
      ${adj}${accion}
      ${m.reclamable ? '' : `<button class="btn sm" data-ext="buzon" data-acc="borrar" data-id="${m.id}" style="margin-top:10px">${ctx.I ? ctx.I('close', 'sm') : ''}${esc(t('borrar'))}</button>`}</div>`;
  }
  function htmlCanje(ctx) {
    return `<div data-buzon="canjear">${cabeza(ctx, t('canjear_t'), !!st.datos)}${formCanje(ctx).replace(/<h3[^>]*>.*?<\/h3>/, '')}
      <p class="small muted">${(ctx.esc || escH)(t('canjear_web', { sitio: (root.location && root.location.host ? root.location.host : 'juego.tukanec.com') + '/canjear.html' }))}</p></div>`;
  }
  function pintar(ctx) {
    if (!ctx || typeof ctx.openModal !== 'function') return;
    let h;
    if (st.vista === 'mensaje') {
      const m = st.datos && (st.datos.mensajes || []).find((x) => x.id === st.abierto);
      h = m ? htmlMensaje(ctx, m) : htmlLista(ctx);
    } else if (st.vista === 'canjear') h = htmlCanje(ctx);
    else h = htmlLista(ctx);
    const yaAbierto = estaAbierto();
    const prev = yaAbierto ? document.getElementById('bz-codigo') : null;
    const val = prev ? prev.value : '';
    ctx.openModal(h);
    const inp = document.getElementById('bz-codigo');
    if (inp && val) inp.value = val;
    if (inp && st.vista === 'canjear') { try { inp.focus(); } catch (e) { /* nada */ } }
  }

  function abrir(ctx, vista) {
    st.ctx = ctx || st.ctx;
    if (!logueado()) {
      const esc = ctx.esc || escH;
      ctx.openModal(`<div data-buzon="entra">${cabeza(ctx, t('titulo'))}<p>${esc(t('entra'))}</p><button class="btn main" data-act="cuenta" data-modo="entrar">${esc(t('entra_btn'))}</button></div>`);
      return;
    }
    st.vista = vista || 'lista'; st.abierto = null;
    pintar(ctx);
    if (st.vista !== 'canjear' || !st.datos) cargar().then(() => { if (estaAbierto() && st.vista === (vista || 'lista')) pintar(ctx); }).catch(() => { if (estaAbierto()) pintar(ctx); });
  }

  // Después de reclamar: los créditos y las entregas se aplican en la partida (ctx.alReclamar = sincronizar con /api/estado)
  async function sincronizar(ctx) {
    try { if (ctx && typeof ctx.alReclamar === 'function') await ctx.alReclamar(); else if (ctx && typeof ctx.sincronizar === 'function') await ctx.sincronizar(); } catch (e) { /* se aplica la próxima vez */ }
  }
  function reemplazar(m) {
    if (!st.datos || !m) return;
    const i = (st.datos.mensajes || []).findIndex((x) => x.id === m.id);
    if (i >= 0) st.datos.mensajes[i] = m; else st.datos.mensajes.unshift(m);
  }
  function aviso(ctx, txt) { try { if (ctx.toast) ctx.toast(txt); } catch (e) { /* nada */ } }
  function sonido(ctx, s) { try { if (ctx.snd && ctx.snd.play) ctx.snd.play(s); } catch (e) { /* nada */ } }

  async function accion(ctx, acc, el) {
    st.ctx = ctx;
    const id = el && el.dataset && el.dataset.id ? Number(el.dataset.id) : null;
    switch (acc) {
      case 'abrir': abrir(ctx, 'lista'); return;
      case 'canjear': abrir(ctx, 'canjear'); return;
      case 'volver': st.vista = 'lista'; st.abierto = null; pintar(ctx); return;
      case 'ver': {
        st.vista = 'mensaje'; st.abierto = id; pintar(ctx);
        const m = st.datos && st.datos.mensajes.find((x) => x.id === id);
        if (m && m.estado === 'sin_leer') {
          m.estado = 'leido'; pintarBoton();
          try { const r = await pedir('POST', '/api/buzon/leer', { id }); reemplazar(r.mensaje); pintarBoton(); } catch (e) { /* se marca la próxima vez */ }
        }
        return;
      }
      case 'reclamar': case 'todo': {
        if (st.ocupado) return;
        st.ocupado = true; if (el) el.disabled = true;
        try {
          const r = acc === 'todo' ? await pedir('POST', '/api/buzon/reclamar_todo', {}) : await pedir('POST', '/api/buzon/reclamar', { id });
          if (r.mensaje) reemplazar(r.mensaje);
          if (acc === 'todo') { (r.reclamados || []).forEach((x) => { const m = st.datos && st.datos.mensajes.find((y) => y.id === x); if (m) { m.estado = 'reclamado'; m.reclamable = false; } }); }
          const nombres = [];
          if (r.creditos_recibidos) nombres.push(t('a_creditos', { n: ctx.N ? ctx.N(r.creditos_recibidos) : r.creditos_recibidos }));
          (r.entregas || []).forEach((en) => nombres.push(nombreAdjunto(en, ctx)));
          (r.equipos || []).forEach((eq) => nombres.push(nombreAdjunto({ tipo: 'item', item: eq.item, cantidad: 1, nombre: eq.nombre }, ctx)));
          if (r.ya_reclamado) aviso(ctx, t('ya'));
          else if (nombres.length) { aviso(ctx, t('recibiste', { x: nombres.slice(0, 3).join(', ') + (nombres.length > 3 ? '…' : '') })); sonido(ctx, 'chapter'); }
          await sincronizar(ctx);
          await cargar().catch(() => {});
        } catch (e) {
          aviso(ctx, textoError(e)); sonido(ctx, 'error');
          await cargar().catch(() => {});
        } finally { st.ocupado = false; }
        if (estaAbierto()) pintar(ctx);
        return;
      }
      case 'borrar': {
        try { await pedir('POST', '/api/buzon/borrar', { id }); if (st.datos) st.datos.mensajes = st.datos.mensajes.filter((x) => x.id !== id); aviso(ctx, t('borrado')); }
        catch (e) { aviso(ctx, textoError(e)); }
        st.vista = 'lista'; pintarBoton(); pintar(ctx);
        return;
      }
      case 'canjear-enviar': {
        const inp = document.getElementById('bz-codigo');
        const er = document.getElementById('bz-error');
        const cod = inp ? inp.value.trim() : '';
        if (!cod) { if (inp) inp.focus(); return; }
        if (st.ocupado) return;
        st.ocupado = true; if (el) el.disabled = true; if (er) er.textContent = '';
        try {
          const r = await pedir('POST', '/api/buzon/canjear', { codigo: cod });
          sonido(ctx, 'chapter');
          aviso(ctx, t('canjear_ok'));
          if (r.mensaje) { if (!st.datos) st.datos = { mensajes: [] }; reemplazar(r.mensaje); st.vista = 'mensaje'; st.abierto = r.mensaje.id; }
          pintarBoton();
          cargar().catch(() => {});
          st.ocupado = false;
          pintar(ctx);
        } catch (e) {
          st.ocupado = false;
          sonido(ctx, 'error');
          if (el) el.disabled = false;
          const er2 = document.getElementById('bz-error');
          if (er2) er2.textContent = textoError(e); else aviso(ctx, textoError(e));
        }
        return;
      }
    }
  }

  /* ---------- Inicio y Tienda ---------- */
  function tarjeta(ctx) {
    st.ctx = ctx;
    montarBoton();
    if (!logueado()) return '';
    if ((!st.datos || Date.now() - st.cargadoEn > 120000) && !st.cargando && Date.now() - st.errorEn > 60000) cargar().catch(() => {});
    const n = porReclamar();
    if (!n) return '';
    const esc = ctx.esc || escH;
    const regalos = st.datos.mensajes.filter((m) => m.reclamable).slice(0, 3).map((m) => `<li>${esc(m.titulo)}</li>`).join('');
    return `<div class="card bz-card" data-buzon-inicio="1">
      <ul style="margin:0 0 10px;padding-inline-start:18px">${regalos}</ul>
      <button class="btn green" data-ext="buzon" data-acc="abrir">✉️ ${esc(t('inicio_btn'))}</button></div>`;
  }
  /** Cómo se ve la fila plegable de Inicio (ui.js: fila(m.id, html, m.fila(ctx))). */
  function fila() {
    const n = porReclamar();
    return { titulo: t('inicio_tag'), icono: 'gift', abierta: true, tono: 'amber', resumen: n === 1 ? t('inicio_1') : t('inicio_n', { n }) };
  }
  function clic(ctx, acc, el) { accion(ctx, acc, el); }
  /** Botón "Canjear código" (para la Tienda → Cuenta). */
  function botonCanjear() {
    return `<button class="btn sm" data-ext="buzon" data-acc="canjear">🎟️ ${escH(t('canjear_t'))}</button>`;
  }

  /* ---------- Arranque ---------- */
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: 1, tarjeta, clic, fila });
  if (typeof document !== 'undefined') {
    const iniciar = () => {
      montarBoton();
      if (!st.montado) return;   // no es el juego
      // Enter en el campo del código = Canjear
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target && e.target.id === 'bz-codigo') { e.preventDefault(); const b = document.getElementById('bz-canjear-btn'); if (b) b.click(); }
      });
      setInterval(revisarCuenta, 2000);
      setInterval(() => { if (logueado() && document.visibilityState !== 'hidden' && Date.now() - st.cargadoEn > 240000) cargar().catch(() => {}); }, 30000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && logueado() && Date.now() - st.cargadoEn > 60000) cargar().catch(() => {}); });
      try { if (root.I18N && root.I18N.onChange) root.I18N.onChange(() => pintarBoton()); } catch (e) { /* nada */ }
      revisarCuenta();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  }

  root.Buzon = { TEXTOS, t, idioma, error: textoError, cargar, abrir: (ctx, v) => abrir(ctx || st.ctx, v), botonCanjear, nombreAdjunto, estado: () => st.datos, nuevos, porReclamar, pedir };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Buzon;
})(typeof window !== 'undefined' ? window : globalThis);
