/* EN VIVO Tycoon — página /recuperar.html (elegir una contraseña nueva con el enlace del correo).
   Contrato: server/INTEGRAR_CORREO.md. Idioma: #l=... del enlace, si no el que eligió el jugador en el juego
   (localStorage envivo_lang, mismo sitio) o el del celular; respaldo español. */
(function () {
  'use strict';
  var D = {
    es: { titulo: 'Recuperar contraseña', revisando: 'Revisando el enlace…', pedir_texto: 'Escribe el correo de tu cuenta y te enviamos un enlace para elegir una contraseña nueva.', correo: 'Correo', pedir_boton: 'Enviarme el enlace', enviado: 'Si ese correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Revisa tu bandeja de entrada y la carpeta de spam. El enlace vence en {min} minutos.', cuenta: 'Cuenta', nueva: 'Contraseña nueva (mínimo {n} caracteres)', repite: 'Repite la contraseña', ver: 'Mostrar contraseña', guardar: 'Guardar contraseña nueva', nota_sesiones: 'Al guardar, cerramos tu sesión en los otros dispositivos y entras aquí con la contraseña nueva.', invalido: 'Este enlace ya no sirve: venció o ya se usó.', invalido_texto: 'Puedes pedir uno nuevo aquí abajo o desde «¿Olvidaste tu contraseña?» en el juego.', pedir_otro: 'Pedir un enlace nuevo', listo: '¡Listo! Tu contraseña cambió.', listo_texto: 'Ya entraste en este dispositivo. En los demás, entra otra vez con la contraseña nueva.', ir_juego: 'Ir al juego', e_corta: 'La contraseña debe tener al menos {n} caracteres.', e_distintas: 'Las dos contraseñas no son iguales.', e_correo: 'Escribe un correo válido.', e_limite: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.', e_limite_correo: 'Ya te enviamos varios enlaces a ese correo. Revisa tu bandeja de entrada y el spam, o espera una hora para pedir otro.', e_red: 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.', e_larga: 'La contraseña es demasiado larga.' },
    en: { titulo: 'Reset password', revisando: 'Checking the link…', pedir_texto: 'Enter your account email and we\'ll send you a link to choose a new password.', correo: 'Email', pedir_boton: 'Send me the link', enviado: 'If that email has an account, we sent you a link to choose a new password. Check your inbox and spam folder. The link expires in {min} minutes.', cuenta: 'Account', nueva: 'New password ({n} characters minimum)', repite: 'Repeat the password', ver: 'Show password', guardar: 'Save new password', nota_sesiones: 'When you save, we sign you out on your other devices and you\'re signed in here with the new password.', invalido: 'This link no longer works: it expired or was already used.', invalido_texto: 'You can ask for a new one below or from "Forgot your password?" in the game.', pedir_otro: 'Ask for a new link', listo: 'Done! Your password changed.', listo_texto: 'You\'re signed in on this device. On the others, sign in again with the new password.', ir_juego: 'Go to the game', e_corta: 'The password must be at least {n} characters.', e_distintas: 'The two passwords don\'t match.', e_correo: 'Enter a valid email.', e_limite: 'Too many attempts. Wait a few minutes and try again.', e_limite_correo: 'We already sent several links to that email. Check your inbox and spam, or wait an hour to ask for another.', e_red: 'No connection to the server. Check your internet and try again.', e_larga: 'The password is too long.' },
    'pt-BR': { titulo: 'Recuperar senha', revisando: 'Verificando o link…', pedir_texto: 'Digite o e-mail da sua conta e enviamos um link para escolher uma nova senha.', correo: 'E-mail', pedir_boton: 'Enviar o link', enviado: 'Se esse e-mail tem uma conta, enviamos um link para escolher uma nova senha. Veja sua caixa de entrada e o spam. O link vence em {min} minutos.', cuenta: 'Conta', nueva: 'Nova senha (mínimo {n} caracteres)', repite: 'Repita a senha', ver: 'Mostrar senha', guardar: 'Salvar nova senha', nota_sesiones: 'Ao salvar, encerramos sua sessão nos outros aparelhos e você entra aqui com a nova senha.', invalido: 'Este link não serve mais: venceu ou já foi usado.', invalido_texto: 'Você pode pedir um novo aqui embaixo ou em "Esqueceu a senha?" no jogo.', pedir_otro: 'Pedir um link novo', listo: 'Pronto! Sua senha mudou.', listo_texto: 'Você já entrou neste aparelho. Nos outros, entre de novo com a nova senha.', ir_juego: 'Ir para o jogo', e_corta: 'A senha deve ter pelo menos {n} caracteres.', e_distintas: 'As duas senhas não são iguais.', e_correo: 'Digite um e-mail válido.', e_limite: 'Tentativas demais. Espere alguns minutos e tente de novo.', e_limite_correo: 'Já enviamos vários links para esse e-mail. Veja a caixa de entrada e o spam, ou espere uma hora para pedir outro.', e_red: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.', e_larga: 'A senha é longa demais.' },
    fr: { titulo: 'Réinitialiser le mot de passe', revisando: 'Vérification du lien…', pedir_texto: 'Écris l\'e-mail de ton compte et nous t\'enverrons un lien pour choisir un nouveau mot de passe.', correo: 'E-mail', pedir_boton: 'M\'envoyer le lien', enviado: 'Si cet e-mail a un compte, nous t\'avons envoyé un lien pour choisir un nouveau mot de passe. Regarde ta boîte de réception et les spams. Le lien expire dans {min} minutes.', cuenta: 'Compte', nueva: 'Nouveau mot de passe ({n} caractères minimum)', repite: 'Répète le mot de passe', ver: 'Afficher le mot de passe', guardar: 'Enregistrer le nouveau mot de passe', nota_sesiones: 'En enregistrant, nous fermons ta session sur tes autres appareils et tu es connecté ici avec le nouveau mot de passe.', invalido: 'Ce lien ne marche plus : il a expiré ou a déjà servi.', invalido_texto: 'Tu peux en demander un nouveau ci-dessous ou depuis « Mot de passe oublié ? » dans le jeu.', pedir_otro: 'Demander un nouveau lien', listo: 'C\'est fait ! Ton mot de passe a changé.', listo_texto: 'Tu es connecté sur cet appareil. Sur les autres, reconnecte-toi avec le nouveau mot de passe.', ir_juego: 'Aller au jeu', e_corta: 'Le mot de passe doit avoir au moins {n} caractères.', e_distintas: 'Les deux mots de passe ne sont pas identiques.', e_correo: 'Écris un e-mail valide.', e_limite: 'Trop de tentatives. Attends quelques minutes et réessaie.', e_limite_correo: 'Nous avons déjà envoyé plusieurs liens à cet e-mail. Regarde ta boîte et les spams, ou attends une heure pour en demander un autre.', e_red: 'Pas de connexion au serveur. Vérifie ton internet et réessaie.', e_larga: 'Le mot de passe est trop long.' },
    de: { titulo: 'Passwort zurücksetzen', revisando: 'Link wird geprüft…', pedir_texto: 'Gib die E-Mail deines Kontos ein und wir schicken dir einen Link für ein neues Passwort.', correo: 'E-Mail', pedir_boton: 'Link schicken', enviado: 'Wenn diese E-Mail ein Konto hat, haben wir dir einen Link für ein neues Passwort geschickt. Schau in deinen Posteingang und den Spam-Ordner. Der Link läuft in {min} Minuten ab.', cuenta: 'Konto', nueva: 'Neues Passwort (mindestens {n} Zeichen)', repite: 'Passwort wiederholen', ver: 'Passwort anzeigen', guardar: 'Neues Passwort speichern', nota_sesiones: 'Beim Speichern melden wir dich auf deinen anderen Geräten ab und du bist hier mit dem neuen Passwort angemeldet.', invalido: 'Dieser Link geht nicht mehr: abgelaufen oder schon benutzt.', invalido_texto: 'Du kannst unten einen neuen anfordern oder im Spiel über „Passwort vergessen?".', pedir_otro: 'Neuen Link anfordern', listo: 'Fertig! Dein Passwort wurde geändert.', listo_texto: 'Du bist auf diesem Gerät angemeldet. Auf den anderen meldest du dich mit dem neuen Passwort an.', ir_juego: 'Zum Spiel', e_corta: 'Das Passwort braucht mindestens {n} Zeichen.', e_distintas: 'Die beiden Passwörter sind nicht gleich.', e_correo: 'Gib eine gültige E-Mail ein.', e_limite: 'Zu viele Versuche. Warte ein paar Minuten und versuche es erneut.', e_limite_correo: 'Wir haben schon mehrere Links an diese E-Mail geschickt. Schau in Posteingang und Spam oder warte eine Stunde.', e_red: 'Keine Verbindung zum Server. Prüfe dein Internet und versuche es erneut.', e_larga: 'Das Passwort ist zu lang.' },
    it: { titulo: 'Recupera password', revisando: 'Controllo del link…', pedir_texto: 'Scrivi l\'e-mail del tuo account e ti mandiamo un link per scegliere una nuova password.', correo: 'E-mail', pedir_boton: 'Mandami il link', enviado: 'Se quell\'e-mail ha un account, ti abbiamo mandato un link per scegliere una nuova password. Controlla la posta in arrivo e lo spam. Il link scade tra {min} minuti.', cuenta: 'Account', nueva: 'Nuova password (minimo {n} caratteri)', repite: 'Ripeti la password', ver: 'Mostra password', guardar: 'Salva la nuova password', nota_sesiones: 'Salvando, chiudiamo la sessione sugli altri dispositivi ed entri qui con la nuova password.', invalido: 'Questo link non funziona più: è scaduto o è già stato usato.', invalido_texto: 'Puoi chiederne uno nuovo qui sotto o da "Password dimenticata?" nel gioco.', pedir_otro: 'Chiedi un nuovo link', listo: 'Fatto! La tua password è cambiata.', listo_texto: 'Sei entrato su questo dispositivo. Sugli altri, entra di nuovo con la nuova password.', ir_juego: 'Vai al gioco', e_corta: 'La password deve avere almeno {n} caratteri.', e_distintas: 'Le due password non sono uguali.', e_correo: 'Scrivi un\'e-mail valida.', e_limite: 'Troppi tentativi. Aspetta qualche minuto e riprova.', e_limite_correo: 'Abbiamo già mandato vari link a quell\'e-mail. Controlla posta e spam, o aspetta un\'ora per chiederne un altro.', e_red: 'Nessuna connessione al server. Controlla internet e riprova.', e_larga: 'La password è troppo lunga.' },
    ru: { titulo: 'Восстановление пароля', revisando: 'Проверяем ссылку…', pedir_texto: 'Укажи почту аккаунта, и мы пришлём ссылку для нового пароля.', correo: 'Почта', pedir_boton: 'Прислать ссылку', enviado: 'Если на эту почту есть аккаунт, мы отправили ссылку для нового пароля. Проверь входящие и папку «Спам». Ссылка действует {min} минут.', cuenta: 'Аккаунт', nueva: 'Новый пароль (минимум {n} символов)', repite: 'Повтори пароль', ver: 'Показать пароль', guardar: 'Сохранить новый пароль', nota_sesiones: 'После сохранения мы завершим сеансы на других устройствах, а здесь ты войдёшь с новым паролем.', invalido: 'Ссылка больше не работает: срок истёк или её уже использовали.', invalido_texto: 'Можно запросить новую ниже или через «Забыл пароль?» в игре.', pedir_otro: 'Запросить новую ссылку', listo: 'Готово! Пароль изменён.', listo_texto: 'Ты вошёл на этом устройстве. На остальных войди заново с новым паролем.', ir_juego: 'В игру', e_corta: 'Пароль должен быть не короче {n} символов.', e_distintas: 'Пароли не совпадают.', e_correo: 'Укажи правильную почту.', e_limite: 'Слишком много попыток. Подожди несколько минут и попробуй снова.', e_limite_correo: 'Мы уже отправили несколько ссылок на эту почту. Проверь входящие и спам или подожди час.', e_red: 'Нет связи с сервером. Проверь интернет и попробуй снова.', e_larga: 'Пароль слишком длинный.' },
    tr: { titulo: 'Şifre sıfırlama', revisando: 'Bağlantı kontrol ediliyor…', pedir_texto: 'Hesabının e-postasını yaz, yeni şifre seçmen için bir bağlantı gönderelim.', correo: 'E-posta', pedir_boton: 'Bağlantıyı gönder', enviado: 'Bu e-postanın bir hesabı varsa yeni şifre seçmen için bir bağlantı gönderdik. Gelen kutunu ve spam klasörünü kontrol et. Bağlantı {min} dakika içinde geçersiz olur.', cuenta: 'Hesap', nueva: 'Yeni şifre (en az {n} karakter)', repite: 'Şifreyi tekrar yaz', ver: 'Şifreyi göster', guardar: 'Yeni şifreyi kaydet', nota_sesiones: 'Kaydedince diğer cihazlardaki oturumlarını kapatırız ve burada yeni şifreyle giriş yaparsın.', invalido: 'Bu bağlantı artık çalışmıyor: süresi doldu ya da kullanıldı.', invalido_texto: 'Aşağıdan ya da oyundaki "Şifreni mi unuttun?" bölümünden yenisini isteyebilirsin.', pedir_otro: 'Yeni bağlantı iste', listo: 'Tamam! Şifren değişti.', listo_texto: 'Bu cihazda giriş yaptın. Diğerlerinde yeni şifrenle tekrar giriş yap.', ir_juego: 'Oyuna git', e_corta: 'Şifre en az {n} karakter olmalı.', e_distintas: 'İki şifre aynı değil.', e_correo: 'Geçerli bir e-posta yaz.', e_limite: 'Çok fazla deneme. Birkaç dakika bekleyip tekrar dene.', e_limite_correo: 'Bu e-postaya zaten birkaç bağlantı gönderdik. Gelen kutunu ve spam\'i kontrol et ya da bir saat bekle.', e_red: 'Sunucuya bağlantı yok. İnternetini kontrol edip tekrar dene.', e_larga: 'Şifre çok uzun.' },
    id: { titulo: 'Pulihkan kata sandi', revisando: 'Memeriksa tautan…', pedir_texto: 'Tulis email akunmu dan kami kirim tautan untuk memilih kata sandi baru.', correo: 'Email', pedir_boton: 'Kirim tautannya', enviado: 'Kalau email itu punya akun, kami sudah mengirim tautan untuk memilih kata sandi baru. Cek kotak masuk dan folder spam. Tautan berlaku {min} menit.', cuenta: 'Akun', nueva: 'Kata sandi baru (minimal {n} karakter)', repite: 'Ulangi kata sandi', ver: 'Tampilkan kata sandi', guardar: 'Simpan kata sandi baru', nota_sesiones: 'Saat disimpan, kami mengeluarkanmu dari perangkat lain dan kamu masuk di sini dengan kata sandi baru.', invalido: 'Tautan ini tidak berlaku lagi: sudah kedaluwarsa atau sudah dipakai.', invalido_texto: 'Kamu bisa minta yang baru di bawah atau lewat "Lupa kata sandi?" di game.', pedir_otro: 'Minta tautan baru', listo: 'Selesai! Kata sandimu sudah berubah.', listo_texto: 'Kamu sudah masuk di perangkat ini. Di perangkat lain, masuk lagi dengan kata sandi baru.', ir_juego: 'Ke game', e_corta: 'Kata sandi minimal {n} karakter.', e_distintas: 'Kedua kata sandi tidak sama.', e_correo: 'Tulis email yang valid.', e_limite: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.', e_limite_correo: 'Kami sudah mengirim beberapa tautan ke email itu. Cek kotak masuk dan spam, atau tunggu satu jam.', e_red: 'Tidak ada koneksi ke server. Cek internetmu lalu coba lagi.', e_larga: 'Kata sandi terlalu panjang.' },
    'zh-CN': { titulo: '找回密码', revisando: '正在检查链接…', pedir_texto: '输入你的账号邮箱，我们会发送一个设置新密码的链接。', correo: '邮箱', pedir_boton: '发送链接', enviado: '如果这个邮箱有账号，我们已发送设置新密码的链接。请查看收件箱和垃圾邮件。链接 {min} 分钟后失效。', cuenta: '账号', nueva: '新密码（至少 {n} 个字符）', repite: '再次输入密码', ver: '显示密码', guardar: '保存新密码', nota_sesiones: '保存后，我们会让你在其他设备上退出登录，你会用新密码在这里登录。', invalido: '这个链接已失效：已过期或已被使用。', invalido_texto: '你可以在下面重新申请，或在游戏的“忘记密码？”中申请。', pedir_otro: '重新申请链接', listo: '完成！你的密码已修改。', listo_texto: '你已在此设备登录。在其他设备上请用新密码重新登录。', ir_juego: '进入游戏', e_corta: '密码至少需要 {n} 个字符。', e_distintas: '两次输入的密码不一致。', e_correo: '请输入有效的邮箱。', e_limite: '尝试次数过多。请等几分钟再试。', e_limite_correo: '我们已向这个邮箱发送了多个链接。请查看收件箱和垃圾邮件，或一小时后再申请。', e_red: '无法连接服务器。请检查网络后重试。', e_larga: '密码太长了。' }
  };
  var IDIOMAS = Object.keys(D);
  function normal(i) {
    i = String(i || '').trim();
    if (!i) return '';
    for (var k = 0; k < IDIOMAS.length; k++) if (IDIOMAS[k].toLowerCase() === i.toLowerCase()) return IDIOMAS[k];
    var b = i.slice(0, 2).toLowerCase();
    if (b === 'pt') return 'pt-BR';
    if (b === 'zh') return 'zh-CN';
    return D[b] ? b : '';
  }
  var h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  var token = h.get('t') || '';
  var guardado = '';
  try { guardado = localStorage.getItem('envivo_lang') || ''; } catch (e) { /* modo privado */ }
  var L = normal(h.get('l')) || normal(guardado) || normal(navigator.language) || 'es';
  // El código del enlace no se queda en la barra de direcciones ni en el historial
  if (location.hash) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* nada */ } }

  var CLAVE_MIN = 8;
  function t(k, d) {
    var s = (D[L] && D[L][k]) || D.es[k] || k;
    return s.replace(/\{(\w+)\}/g, function (m, x) { return d && d[x] !== undefined ? String(d[x]) : m; });
  }
  function $(id) { return document.getElementById(id); }
  function traducir() {
    document.documentElement.lang = L;
    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-t'), { n: CLAVE_MIN, min: 30 });
    document.title = t('titulo') + ' · EN VIVO Tycoon';
  }
  function ver(cual) {
    ['cargando', 'pedir', 'nueva', 'invalido', 'listo'].forEach(function (v) { $('v-' + v).hidden = v !== cual; });
  }
  function errorDe(j, status) {
    var c = j && j.codigo;
    if (c === 'clave_corta') return t('e_corta', { n: CLAVE_MIN });
    if (c === 'clave_larga') return t('e_larga');
    if (c === 'email_invalido') return t('e_correo');
    if (c === 'recuperar_limite') return t('e_limite_correo');
    if (c === 'limite_intentos' || status === 429) return t('e_limite');
    if (L === 'es' && j && j.error) return j.error;
    return t('e_red');
  }
  function post(ruta, cuerpo) {
    return fetch(ruta, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': L }, body: JSON.stringify(cuerpo) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok || !j || j.ok === false) { var e = new Error('api'); e.j = j; e.status = r.status; throw e; }
          return j;
        });
      });
  }

  traducir();

  $('f-pedir').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = $('p-email').value.trim(), av = $('p-aviso'), btn = $('p-btn');
    av.className = 'aviso';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { av.className = 'aviso aviso-error'; av.textContent = t('e_correo'); return; }
    btn.disabled = true; av.textContent = '';
    post('/api/cuenta/recuperar', { email: email, idioma: L }).then(function (j) {
      av.className = 'aviso aviso-ok'; av.textContent = t('enviado', { min: j.minutos || 30 });
    }).catch(function (e) {
      av.className = 'aviso aviso-error'; av.textContent = errorDe(e.j, e.status); btn.disabled = false;
    });
  });
  $('i-pedir').addEventListener('click', function () { ver('pedir'); try { $('p-email').focus(); } catch (e) { /* nada */ } });
  $('n-ver').addEventListener('change', function () { $('n-clave').type = $('n-clave2').type = this.checked ? 'text' : 'password'; });
  $('f-nueva').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var a = $('n-clave').value, b = $('n-clave2').value, av = $('n-aviso'), btn = $('n-btn');
    av.textContent = '';
    if (a.length < CLAVE_MIN) { av.textContent = t('e_corta', { n: CLAVE_MIN }); return; }
    if (a !== b) { av.textContent = t('e_distintas'); return; }
    btn.disabled = true;
    post('/api/cuenta/recuperar/cambiar', { token: token, clave: a }).then(function () {
      token = ''; ver('listo'); $('ir-juego').className = 'boton grande'; $('ir-juego').style.textAlign = 'center'; $('ir-juego').style.display = 'block';
    }).catch(function (e) {
      if (e.status === 410) { ver('invalido'); return; }
      av.textContent = errorDe(e.j, e.status); btn.disabled = false;
    });
  });

  if (!/^[a-f0-9]{64}$/.test(token)) { ver(token ? 'invalido' : 'pedir'); return; }
  post('/api/cuenta/recuperar/revisar', { token: token }).then(function (j) {
    if (j.clave_min) { CLAVE_MIN = j.clave_min; $('n-l1').textContent = t('nueva', { n: CLAVE_MIN }); }
    $('n-email').textContent = j.email || '';
    ver('nueva');
    try { $('n-clave').focus(); } catch (e) { /* nada */ }
  }).catch(function (e) {
    if (e.status === 410 || e.status === 400) { ver('invalido'); return; }
    ver('invalido'); $('v-invalido').querySelector('.aviso').textContent = errorDe(e.j, e.status);
  });
})();
