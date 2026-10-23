/* =====================================================================
   EN VIVO Tycoon — Cuenta: lo que pide Google Play dentro del juego (server/INTEGRAR_CUENTA.md)
   - Registro: casillas "Acepto los Términos y la Política de privacidad" y "Tengo 16 años o más"
     (Cuenta.camposRegistro / faltaRegistro / datosRegistro, las usa abrirCuenta de ui.js).
   - Tienda → Tu cuenta: "Borrar mi cuenta" (Cuenta.botones / abrirBorrar): explica qué se pierde, pide la clave y
     escribir BORRAR, llama POST /api/cuenta/borrar, cierra la sesión y deja la partida de este dispositivo.
   - Cuentas creadas antes (o que cambiaron de dueño): antes del chat, el mercado y los modos en línea se pide UNA vez
     aceptar (POST /api/cuenta/terminos). El servidor no deja escribir en el chat sin aceptar (terminos_pendientes).
   - Textos en los 10 idiomas aquí mismo; idioma = window.I18N.idioma (respaldo: español).
   ===================================================================== */
(function (root) {
  'use strict';
  const EDAD = 16;
  const D = {
    es: {
      acepto: 'Acepto los {t} y la {p}', terminos: 'Términos', privacidad: 'Política de privacidad', edad: 'Tengo {n} años o más',
      falta_terminos: 'Marca «Acepto los Términos y la Política de privacidad» para seguir.', falta_edad: 'Para tener una cuenta debes tener {n} años o más.',
      borrar: 'Borrar mi cuenta', borrar_web: 'Cómo borrar tu cuenta desde la web',
      b_intro: 'Esto no se puede deshacer. Se borra para siempre:',
      b_1: 'Tu cuenta, tu nombre y tu correo.', b_2: 'Tu partida guardada en la nube.',
      b_3: 'Tus créditos ({n}) y todo lo que compraste: equipos exclusivos, VIP, pase y lo demás. No hay devolución.',
      b_4: 'Tu perfil, tu lugar en la asociación, tus mensajes del chat y lo que tengas en el mercado.',
      b_queda: 'Solo se guardan los comprobantes de compra que la ley obliga a guardar, sin tus datos de la cuenta.',
      b_local: 'Tu partida en este dispositivo se queda: puedes seguir jugando sin cuenta.',
      b_clave: 'Tu clave', b_escribe: 'Escribe {w} para confirmar', palabra: 'BORRAR', b_si: 'Borrar mi cuenta para siempre', cancelar: 'Cancelar',
      b_falta_clave: 'Escribe tu clave.', b_falta_palabra: 'Escribe {w} para confirmar.', b_olvido: '¿Olvidaste tu clave? Pide el borrado aquí',
      borrada: 'Tu cuenta fue borrada. Tu partida sigue en este dispositivo.',
      a_t: 'Antes de seguir', a_det: 'Para usar el chat, el mercado y los modos en línea, acepta los Términos y la Política de privacidad. Te lo pedimos una sola vez.',
      a_si: 'Aceptar y seguir', a_no: 'Ahora no', a_ok: 'Listo, gracias.',
      e_clave: 'La clave no es correcta.', e_limite: 'Demasiados intentos. Espera 10 minutos.', e_red: 'No se pudo completar. Revisa tu internet e intenta de nuevo.',
    },
    en: {
      acepto: 'I accept the {t} and the {p}', terminos: 'Terms', privacidad: 'Privacy Policy', edad: 'I am {n} or older',
      falta_terminos: 'Tick "I accept the Terms and the Privacy Policy" to continue.', falta_edad: 'You must be {n} or older to have an account.',
      borrar: 'Delete my account', borrar_web: 'How to delete your account on the web',
      b_intro: 'This cannot be undone. Deleted forever:',
      b_1: 'Your account, your name and your email.', b_2: 'Your game saved in the cloud.',
      b_3: 'Your credits ({n}) and everything you bought: exclusive gear, VIP, pass and the rest. No refunds.',
      b_4: 'Your profile, your place in the association, your chat messages and anything you have on the market.',
      b_queda: 'We only keep the purchase receipts the law requires, without your account details.',
      b_local: 'Your game on this device stays: you can keep playing without an account.',
      b_clave: 'Your password', b_escribe: 'Type {w} to confirm', palabra: 'DELETE', b_si: 'Delete my account forever', cancelar: 'Cancel',
      b_falta_clave: 'Type your password.', b_falta_palabra: 'Type {w} to confirm.', b_olvido: 'Forgot your password? Request deletion here',
      borrada: 'Your account was deleted. Your game stays on this device.',
      a_t: 'Before you continue', a_det: 'To use chat, the market and online modes, accept the Terms and the Privacy Policy. We only ask once.',
      a_si: 'Accept and continue', a_no: 'Not now', a_ok: 'Done, thanks.',
      e_clave: 'The password is not correct.', e_limite: 'Too many attempts. Wait 10 minutes.', e_red: 'Could not complete. Check your internet and try again.',
    },
    'pt-BR': {
      acepto: 'Aceito os {t} e a {p}', terminos: 'Termos', privacidad: 'Política de privacidade', edad: 'Tenho {n} anos ou mais',
      falta_terminos: 'Marque «Aceito os Termos e a Política de privacidade» para continuar.', falta_edad: 'Para ter uma conta você precisa ter {n} anos ou mais.',
      borrar: 'Apagar minha conta', borrar_web: 'Como apagar sua conta pela web',
      b_intro: 'Isto não pode ser desfeito. Será apagado para sempre:',
      b_1: 'Sua conta, seu nome e seu e-mail.', b_2: 'Seu jogo salvo na nuvem.',
      b_3: 'Seus créditos ({n}) e tudo o que você comprou: equipamentos exclusivos, VIP, passe e o resto. Sem reembolso.',
      b_4: 'Seu perfil, seu lugar na associação, suas mensagens do chat e o que você tiver no mercado.',
      b_queda: 'Só guardamos os comprovantes de compra que a lei exige, sem os dados da sua conta.',
      b_local: 'Seu jogo neste dispositivo continua: você pode seguir jogando sem conta.',
      b_clave: 'Sua senha', b_escribe: 'Digite {w} para confirmar', palabra: 'APAGAR', b_si: 'Apagar minha conta para sempre', cancelar: 'Cancelar',
      b_falta_clave: 'Digite sua senha.', b_falta_palabra: 'Digite {w} para confirmar.', b_olvido: 'Esqueceu a senha? Peça para apagar aqui',
      borrada: 'Sua conta foi apagada. Seu jogo continua neste dispositivo.',
      a_t: 'Antes de continuar', a_det: 'Para usar o chat, o mercado e os modos online, aceite os Termos e a Política de privacidade. Pedimos só uma vez.',
      a_si: 'Aceitar e continuar', a_no: 'Agora não', a_ok: 'Pronto, obrigado.',
      e_clave: 'A senha não está correta.', e_limite: 'Tentativas demais. Espere 10 minutos.', e_red: 'Não foi possível concluir. Verifique sua internet e tente de novo.',
    },
    fr: {
      acepto: 'J\'accepte les {t} et la {p}', terminos: 'Conditions', privacidad: 'Politique de confidentialité', edad: 'J\'ai {n} ans ou plus',
      falta_terminos: 'Coche « J\'accepte les Conditions et la Politique de confidentialité » pour continuer.', falta_edad: 'Tu dois avoir {n} ans ou plus pour avoir un compte.',
      borrar: 'Supprimer mon compte', borrar_web: 'Comment supprimer ton compte sur le web',
      b_intro: 'Impossible d\'annuler. Supprimé pour toujours :',
      b_1: 'Ton compte, ton nom et ton e-mail.', b_2: 'Ta partie sauvegardée dans le cloud.',
      b_3: 'Tes crédits ({n}) et tout ce que tu as acheté : matériel exclusif, VIP, pass et le reste. Aucun remboursement.',
      b_4: 'Ton profil, ta place dans l\'association, tes messages du chat et ce que tu as sur le marché.',
      b_queda: 'Nous gardons seulement les reçus d\'achat exigés par la loi, sans les données de ton compte.',
      b_local: 'Ta partie sur cet appareil reste : tu peux continuer à jouer sans compte.',
      b_clave: 'Ton mot de passe', b_escribe: 'Écris {w} pour confirmer', palabra: 'SUPPRIMER', b_si: 'Supprimer mon compte pour toujours', cancelar: 'Annuler',
      b_falta_clave: 'Écris ton mot de passe.', b_falta_palabra: 'Écris {w} pour confirmer.', b_olvido: 'Mot de passe oublié ? Demande la suppression ici',
      borrada: 'Ton compte a été supprimé. Ta partie reste sur cet appareil.',
      a_t: 'Avant de continuer', a_det: 'Pour utiliser le chat, le marché et les modes en ligne, accepte les Conditions et la Politique de confidentialité. On ne le demande qu\'une fois.',
      a_si: 'Accepter et continuer', a_no: 'Pas maintenant', a_ok: 'C\'est fait, merci.',
      e_clave: 'Le mot de passe n\'est pas correct.', e_limite: 'Trop d\'essais. Attends 10 minutes.', e_red: 'Impossible de terminer. Vérifie ta connexion et réessaie.',
    },
    de: {
      acepto: 'Ich akzeptiere die {t} und die {p}', terminos: 'Bedingungen', privacidad: 'Datenschutzerklärung', edad: 'Ich bin {n} Jahre oder älter',
      falta_terminos: 'Hake „Ich akzeptiere die Bedingungen und die Datenschutzerklärung" an, um weiterzumachen.', falta_edad: 'Für ein Konto musst du {n} Jahre oder älter sein.',
      borrar: 'Mein Konto löschen', borrar_web: 'So löschst du dein Konto im Web',
      b_intro: 'Das lässt sich nicht rückgängig machen. Für immer gelöscht:',
      b_1: 'Dein Konto, dein Name und deine E-Mail.', b_2: 'Dein Spielstand in der Cloud.',
      b_3: 'Deine Credits ({n}) und alles, was du gekauft hast: exklusive Ausrüstung, VIP, Pass und der Rest. Keine Erstattung.',
      b_4: 'Dein Profil, dein Platz im Verband, deine Chatnachrichten und alles, was du auf dem Markt hast.',
      b_queda: 'Wir behalten nur die gesetzlich vorgeschriebenen Kaufbelege, ohne deine Kontodaten.',
      b_local: 'Dein Spielstand auf diesem Gerät bleibt: Du kannst ohne Konto weiterspielen.',
      b_clave: 'Dein Passwort', b_escribe: 'Schreibe {w} zum Bestätigen', palabra: 'LÖSCHEN', b_si: 'Mein Konto für immer löschen', cancelar: 'Abbrechen',
      b_falta_clave: 'Schreibe dein Passwort.', b_falta_palabra: 'Schreibe {w} zum Bestätigen.', b_olvido: 'Passwort vergessen? Löschung hier anfordern',
      borrada: 'Dein Konto wurde gelöscht. Dein Spielstand bleibt auf diesem Gerät.',
      a_t: 'Bevor es weitergeht', a_det: 'Um Chat, Markt und Online-Modi zu nutzen, akzeptiere die Bedingungen und die Datenschutzerklärung. Wir fragen nur einmal.',
      a_si: 'Akzeptieren und weiter', a_no: 'Jetzt nicht', a_ok: 'Erledigt, danke.',
      e_clave: 'Das Passwort ist nicht richtig.', e_limite: 'Zu viele Versuche. Warte 10 Minuten.', e_red: 'Konnte nicht abgeschlossen werden. Prüfe dein Internet und versuche es erneut.',
    },
    it: {
      acepto: 'Accetto i {t} e l\'{p}', terminos: 'Termini', privacidad: 'Informativa sulla privacy', edad: 'Ho {n} anni o più',
      falta_terminos: 'Spunta «Accetto i Termini e l\'Informativa sulla privacy» per continuare.', falta_edad: 'Per avere un account devi avere {n} anni o più.',
      borrar: 'Elimina il mio account', borrar_web: 'Come eliminare l\'account dal web',
      b_intro: 'Non si può annullare. Eliminato per sempre:',
      b_1: 'Il tuo account, il tuo nome e la tua email.', b_2: 'La tua partita salvata nel cloud.',
      b_3: 'I tuoi crediti ({n}) e tutto ciò che hai comprato: attrezzatura esclusiva, VIP, pass e il resto. Nessun rimborso.',
      b_4: 'Il tuo profilo, il tuo posto nell\'associazione, i tuoi messaggi in chat e ciò che hai sul mercato.',
      b_queda: 'Teniamo solo le ricevute d\'acquisto richieste dalla legge, senza i dati del tuo account.',
      b_local: 'La partita su questo dispositivo resta: puoi continuare a giocare senza account.',
      b_clave: 'La tua password', b_escribe: 'Scrivi {w} per confermare', palabra: 'ELIMINA', b_si: 'Elimina il mio account per sempre', cancelar: 'Annulla',
      b_falta_clave: 'Scrivi la tua password.', b_falta_palabra: 'Scrivi {w} per confermare.', b_olvido: 'Password dimenticata? Chiedi l\'eliminazione qui',
      borrada: 'Il tuo account è stato eliminato. La partita resta su questo dispositivo.',
      a_t: 'Prima di continuare', a_det: 'Per usare la chat, il mercato e le modalità online, accetta i Termini e l\'Informativa sulla privacy. Lo chiediamo una sola volta.',
      a_si: 'Accetta e continua', a_no: 'Non ora', a_ok: 'Fatto, grazie.',
      e_clave: 'La password non è corretta.', e_limite: 'Troppi tentativi. Aspetta 10 minuti.', e_red: 'Impossibile completare. Controlla la connessione e riprova.',
    },
    ru: {
      acepto: 'Я принимаю {t} и {p}', terminos: 'Условия', privacidad: 'Политику конфиденциальности', edad: 'Мне {n} лет или больше',
      falta_terminos: 'Отметь «Я принимаю Условия и Политику конфиденциальности», чтобы продолжить.', falta_edad: 'Чтобы иметь аккаунт, тебе должно быть {n} лет или больше.',
      borrar: 'Удалить мой аккаунт', borrar_web: 'Как удалить аккаунт через сайт',
      b_intro: 'Это нельзя отменить. Удаляется навсегда:',
      b_1: 'Твой аккаунт, имя и почта.', b_2: 'Твоя игра, сохранённая в облаке.',
      b_3: 'Твои кредиты ({n}) и всё купленное: эксклюзивная техника, VIP, пропуск и остальное. Без возврата денег.',
      b_4: 'Твой профиль, место в ассоциации, сообщения в чате и всё, что выставлено на рынке.',
      b_queda: 'Мы храним только чеки покупок, которые требует закон, без данных аккаунта.',
      b_local: 'Игра на этом устройстве остаётся: можно играть дальше без аккаунта.',
      b_clave: 'Твой пароль', b_escribe: 'Напиши {w} для подтверждения', palabra: 'УДАЛИТЬ', b_si: 'Удалить аккаунт навсегда', cancelar: 'Отмена',
      b_falta_clave: 'Напиши свой пароль.', b_falta_palabra: 'Напиши {w} для подтверждения.', b_olvido: 'Забыл пароль? Запроси удаление здесь',
      borrada: 'Твой аккаунт удалён. Игра остаётся на этом устройстве.',
      a_t: 'Прежде чем продолжить', a_det: 'Чтобы пользоваться чатом, рынком и онлайн-режимами, прими Условия и Политику конфиденциальности. Спрашиваем только один раз.',
      a_si: 'Принять и продолжить', a_no: 'Не сейчас', a_ok: 'Готово, спасибо.',
      e_clave: 'Неверный пароль.', e_limite: 'Слишком много попыток. Подожди 10 минут.', e_red: 'Не удалось. Проверь интернет и попробуй снова.',
    },
    tr: {
      acepto: '{t} ve {p} kabul ediyorum', terminos: 'Şartları', privacidad: 'Gizlilik Politikasını', edad: '{n} yaşında veya daha büyüğüm',
      falta_terminos: 'Devam etmek için «Şartları ve Gizlilik Politikasını kabul ediyorum» kutusunu işaretle.', falta_edad: 'Hesap için {n} yaşında veya daha büyük olmalısın.',
      borrar: 'Hesabımı sil', borrar_web: 'Hesabını web üzerinden nasıl silersin',
      b_intro: 'Bu geri alınamaz. Sonsuza dek silinir:',
      b_1: 'Hesabın, adın ve e-postan.', b_2: 'Bulutta kayıtlı oyunun.',
      b_3: 'Kredilerin ({n}) ve satın aldığın her şey: özel ekipman, VIP, sezon kartı ve diğerleri. İade yok.',
      b_4: 'Profilin, dernekteki yerin, sohbet mesajların ve pazardaki her şeyin.',
      b_queda: 'Yalnızca yasanın istediği satın alma fişlerini, hesap bilgilerin olmadan saklarız.',
      b_local: 'Bu cihazdaki oyunun kalır: hesapsız oynamaya devam edebilirsin.',
      b_clave: 'Şifren', b_escribe: 'Onaylamak için {w} yaz', palabra: 'SİL', b_si: 'Hesabımı sonsuza dek sil', cancelar: 'Vazgeç',
      b_falta_clave: 'Şifreni yaz.', b_falta_palabra: 'Onaylamak için {w} yaz.', b_olvido: 'Şifreni mi unuttun? Silmeyi buradan iste',
      borrada: 'Hesabın silindi. Oyunun bu cihazda kalıyor.',
      a_t: 'Devam etmeden önce', a_det: 'Sohbet, pazar ve çevrim içi modları kullanmak için Şartları ve Gizlilik Politikasını kabul et. Yalnızca bir kez soruyoruz.',
      a_si: 'Kabul et ve devam et', a_no: 'Şimdi değil', a_ok: 'Tamam, teşekkürler.',
      e_clave: 'Şifre doğru değil.', e_limite: 'Çok fazla deneme. 10 dakika bekle.', e_red: 'Tamamlanamadı. İnternetini kontrol edip tekrar dene.',
    },
    id: {
      acepto: 'Saya menerima {t} dan {p}', terminos: 'Ketentuan', privacidad: 'Kebijakan Privasi', edad: 'Saya berusia {n} tahun atau lebih',
      falta_terminos: 'Centang «Saya menerima Ketentuan dan Kebijakan Privasi» untuk lanjut.', falta_edad: 'Untuk punya akun kamu harus berusia {n} tahun atau lebih.',
      borrar: 'Hapus akun saya', borrar_web: 'Cara menghapus akun lewat web',
      b_intro: 'Ini tidak bisa dibatalkan. Terhapus selamanya:',
      b_1: 'Akunmu, namamu, dan email-mu.', b_2: 'Permainanmu yang tersimpan di cloud.',
      b_3: 'Kreditmu ({n}) dan semua yang kamu beli: peralatan eksklusif, VIP, pass, dan lainnya. Tidak ada pengembalian dana.',
      b_4: 'Profilmu, tempatmu di asosiasi, pesan chat-mu, dan apa pun yang kamu punya di pasar.',
      b_queda: 'Kami hanya menyimpan bukti pembelian yang diwajibkan hukum, tanpa data akunmu.',
      b_local: 'Permainan di perangkat ini tetap ada: kamu bisa terus bermain tanpa akun.',
      b_clave: 'Kata sandimu', b_escribe: 'Ketik {w} untuk konfirmasi', palabra: 'HAPUS', b_si: 'Hapus akun saya selamanya', cancelar: 'Batal',
      b_falta_clave: 'Ketik kata sandimu.', b_falta_palabra: 'Ketik {w} untuk konfirmasi.', b_olvido: 'Lupa kata sandi? Minta penghapusan di sini',
      borrada: 'Akunmu sudah dihapus. Permainanmu tetap di perangkat ini.',
      a_t: 'Sebelum lanjut', a_det: 'Untuk memakai chat, pasar, dan mode online, terima Ketentuan dan Kebijakan Privasi. Kami hanya bertanya sekali.',
      a_si: 'Terima dan lanjut', a_no: 'Nanti saja', a_ok: 'Selesai, terima kasih.',
      e_clave: 'Kata sandi salah.', e_limite: 'Terlalu banyak percobaan. Tunggu 10 menit.', e_red: 'Tidak bisa diselesaikan. Periksa internet lalu coba lagi.',
    },
    'zh-CN': {
      acepto: '我接受{t}和{p}', terminos: '条款', privacidad: '隐私政策', edad: '我已年满 {n} 岁',
      falta_terminos: '请勾选「我接受条款和隐私政策」后继续。', falta_edad: '年满 {n} 岁才能拥有账号。',
      borrar: '删除我的账号', borrar_web: '如何在网页上删除账号',
      b_intro: '此操作无法撤销。以下内容将永久删除：',
      b_1: '你的账号、名字和邮箱。', b_2: '你在云端保存的游戏。',
      b_3: '你的积分（{n}）和所有购买的内容：专属器材、VIP、通行证等。不予退款。',
      b_4: '你的资料、在协会中的位置、聊天消息以及你在市场上的物品。',
      b_queda: '我们只保留法律要求的购买凭证，不含你的账号信息。',
      b_local: '这台设备上的游戏会保留：你可以不用账号继续玩。',
      b_clave: '你的密码', b_escribe: '输入 {w} 以确认', palabra: '删除', b_si: '永久删除我的账号', cancelar: '取消',
      b_falta_clave: '请输入你的密码。', b_falta_palabra: '请输入 {w} 以确认。', b_olvido: '忘记密码？在这里申请删除',
      borrada: '你的账号已删除。游戏仍保留在这台设备上。',
      a_t: '继续之前', a_det: '要使用聊天、市场和在线模式，请接受条款和隐私政策。我们只问一次。',
      a_si: '接受并继续', a_no: '暂不', a_ok: '好了，谢谢。',
      e_clave: '密码不正确。', e_limite: '尝试次数太多。请等待 10 分钟。', e_red: '无法完成。请检查网络后重试。',
    },
  };

  const idioma = () => { try { return (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { return 'es'; } };
  function T(k, p, lang) {
    const d = D[lang || idioma()] || D.es;
    let t = d[k] != null ? d[k] : (D.es[k] != null ? D.es[k] : k);
    if (p) t = t.replace(/\{(\w+)\}/g, (m, x) => (p[x] != null ? String(p[x]) : m));
    return t;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = (id) => document.getElementById(id);
  const Api = () => root.Api || null;
  const num = (n) => { try { return root.I18N && root.I18N.num ? root.I18N.num(n) : Number(n || 0).toLocaleString(); } catch (e) { return String(n); } };

  function css() {
    if ($('cuenta-css')) return;
    const s = document.createElement('style');
    s.id = 'cuenta-css';
    s.textContent = `.cu-check{display:flex;gap:10px;align-items:flex-start;margin:10px 0 0;font-size:14px;line-height:1.4;color:var(--text);cursor:pointer}
      .cu-check input{width:22px;height:22px;flex:none;margin:0;accent-color:var(--red)}
      .cu-check a{color:var(--blue);text-decoration:underline}
      .cu-borrar-btn{border-color:#ff3b3b66;color:var(--red)}
      .cu-web{display:block;text-align:center;font-size:12px;color:var(--muted);margin-top:8px}
      .cu-lista{margin:6px 0 10px;padding-inline-start:20px;font-size:14px;line-height:1.45}
      .cu-lista li{margin:3px 0}
      .cu-nota{font-size:13px;color:var(--muted);margin:6px 0}
      .cu-ok{font-size:14px;color:var(--green);margin:8px 0}`;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------- casillas (registro y ventana de aceptar)
  function casillas(pref) {
    css();
    const link = (href, txt) => `<a href="${href}" target="_blank" rel="noopener">${esc(txt)}</a>`;
    return `<label class="cu-check"><input type="checkbox" id="${pref}-terminos"><span>${T('acepto', { t: link('/terminos.html', T('terminos')), p: link('/privacidad.html', T('privacidad')) })}</span></label>
      <label class="cu-check"><input type="checkbox" id="${pref}-edad"><span>${esc(T('edad', { n: EDAD }))}</span></label>`;
  }
  function falta(pref) {
    const t = $(pref + '-terminos'), e = $(pref + '-edad');
    if (!t || !t.checked) return T('falta_terminos');
    if (!e || !e.checked) return T('falta_edad', { n: EDAD });
    return '';
  }

  // ---------------------------------------------------------------- servidor
  async function post(ruta, body) {
    let r, j = null;
    try {
      r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': idioma() },
        credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body || {}) });
    } catch (e) { throw new Error(T('e_red')); }
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || typeof j !== 'object') throw new Error(T('e_red'));
    if (!r.ok || j.ok === false) {
      const propio = { clave_incorrecta: 'e_clave', limite_intentos: 'e_limite', terminos_requeridos: 'falta_terminos', edad_requerida: 'falta_edad' }[j.codigo];
      let msg = propio ? T(propio, { n: EDAD }) : '';
      if (!msg) { try { msg = j.codigo && root.I18N && root.I18N.T.has('error.' + j.codigo) ? root.I18N.T('error.' + j.codigo, j) : ''; } catch (e) { msg = ''; } }
      if (!msg || /\{\w+\}/.test(msg)) { try { msg = j.error ? (root.I18N && root.I18N.TL ? root.I18N.TL(j.error) : j.error) : T('e_red'); } catch (e) { msg = j.error || T('e_red'); } }
      const err = new Error(msg); err.codigo = j.codigo || null; err.status = r.status;
      throw err;
    }
    return j;
  }

  // ---------------------------------------------------------------- ventana propia (usa el #overlay del juego)
  function abrirVentana(html) {
    const m = $('modal'), o = $('overlay');
    if (!m || !o) return false;
    m.innerHTML = html; o.classList.add('on'); m.scrollTop = 0;
    return true;
  }
  function cerrarVentana() { const m = $('modal'), o = $('overlay'); if (o) o.classList.remove('on'); if (m) m.innerHTML = ''; }
  const cruz = () => { try { return root.Art && root.Art.icon ? root.Art.icon('close', 'sm') : '✕'; } catch (e) { return '✕'; } };

  // ---------------------------------------------------------------- aceptar (cuentas sin aceptación)
  function pendiente() {
    const A = Api();
    const E = A && A.estado;
    return !!(A && A.disponible && E && E.logueado && E.terminos && E.terminos.aceptados === false);
  }
  let alAceptar = null;
  function pedirAceptar(cb) {
    alAceptar = typeof cb === 'function' ? cb : null;
    css();
    abrirVentana(`<div class="row between"><h2>${esc(T('a_t'))}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('cancelar'))}">${cruz()}</button></div>
      <p class="small" style="margin:0 0 4px">${esc(T('a_det'))}</p>
      <div id="cuA">${casillas('cuA')}</div>
      <p class="small neg" id="cuA-error" aria-live="polite"></p>
      <button class="btn main" data-cuenta="aceptar" id="cuA-btn">${esc(T('a_si'))}</button>
      <button class="btn" data-act="close">${esc(T('a_no'))}</button>`);
  }
  async function aceptar() {
    const err = $('cuA-error'), btn = $('cuA-btn');
    const f = falta('cuA');
    if (f) { err.textContent = f; return; }
    btn.disabled = true; err.textContent = '';
    try {
      const r = await post('/api/cuenta/terminos', { acepta_terminos: true, edad_16: true });
      const A = Api();
      if (A && A.estado && r.terminos) A.estado.terminos = r.terminos;
      cerrarVentana();
      const cb = alAceptar; alAceptar = null;
      if (cb) cb(); else toast(T('a_ok'));
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
  }
  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.style.display = 'none'; }, 2600);
  }

  // ---------------------------------------------------------------- borrar la cuenta
  let ctxB = null;
  function abrirBorrar(ctx) {
    ctxB = ctx || {};
    css();
    const A = Api();
    const E = (A && A.estado) || {};
    const w = T('palabra');
    const html = `<div class="row between"><h2>${esc(T('borrar'))}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('cancelar'))}">${cruz()}</button></div>
      <p class="small" style="margin:0"><b>${esc(T('b_intro'))}</b></p>
      <ul class="cu-lista"><li>${esc(T('b_1'))}</li><li>${esc(T('b_2'))}</li><li>${esc(T('b_3', { n: num(Math.max(0, Number(E.creditos) || 0)) }))}</li><li>${esc(T('b_4'))}</li></ul>
      <p class="cu-nota">${esc(T('b_queda'))}</p>
      <p class="cu-ok">${esc(T('b_local'))}</p>
      <form id="formBorrarCuenta" autocomplete="off">
        <label class="field">${esc(T('b_clave'))}<input id="cuB-clave" type="password" autocomplete="current-password" maxlength="200"></label>
        <label class="field">${esc(T('b_escribe', { w }))}<input id="cuB-palabra" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="${esc(w)}"></label>
        <p class="small neg" id="cuB-error" aria-live="polite"></p>
        <button class="btn main" type="submit" id="cuB-btn" disabled>${esc(T('b_si'))}</button>
      </form>
      <button class="btn" data-act="close">${esc(T('cancelar'))}</button>
      <a class="cu-web" href="/borrar-cuenta.html" target="_blank" rel="noopener">${esc(T('b_olvido'))}</a>`;
    if (ctxB.openModal) ctxB.openModal(html); else abrirVentana(html);
  }
  function palabraOk() {
    const v = (($('cuB-palabra') || {}).value || '').trim();
    if (!v) return false;
    const up = (s) => { try { return s.toLocaleUpperCase(idioma()); } catch (e) { return s.toUpperCase(); } };
    return up(v) === up(T('palabra')) || v.toUpperCase() === 'BORRAR';
  }
  function revisarBorrar() {
    const b = $('cuB-btn');
    if (b) b.disabled = !(palabraOk() && (($('cuB-clave') || {}).value || '') !== '');
  }
  async function enviarBorrar() {
    const err = $('cuB-error'), btn = $('cuB-btn');
    const clave = ($('cuB-clave') || {}).value || '';
    if (!clave) { err.textContent = T('b_falta_clave'); return; }
    if (!palabraOk()) { err.textContent = T('b_falta_palabra', { w: T('palabra') }); return; }
    btn.disabled = true; err.textContent = '';
    try {
      await post('/api/cuenta/borrar', { clave, confirmar: 'BORRAR' });
    } catch (e) {
      err.textContent = e.message; btn.disabled = false;
      try { if (ctxB && ctxB.snd) ctxB.snd.play('error'); } catch (x) { /* nada */ }
      return;
    }
    const ctx = ctxB || {}; ctxB = null;
    if (ctx.closeModal) ctx.closeModal(); else cerrarVentana();
    const A = Api();
    try { if (A) await A.refrescar(); } catch (e) { if (A && A.estado) A.estado.logueado = false; }
    try { if (ctx.alBorrar) ctx.alBorrar(); } catch (e) { console.error('[cuenta] alBorrar', e); }
    (ctx.toast || toast)(T('borrada'));
  }

  // ---------------------------------------------------------------- eventos
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-cuenta]');
    if (b && !b.disabled && b.dataset.cuenta === 'aceptar') { aceptar(); return; }
    // Antes del chat, el mercado y los modos en línea: aceptar una vez (cuentas creadas antes de pedirlo)
    if (!pendiente()) return;
    const t = e.target.closest && e.target.closest('#chat-btn, [data-act="online"][data-k], [data-act="vista-tienda"][data-k="mercado"]');
    if (!t || t.disabled) return;
    if (t.dataset.act === 'online' && (t.dataset.k === 'hub' || !t.dataset.k)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    pedirAceptar(() => { try { t.click(); } catch (x) { /* nada */ } });
  }, true);
  document.addEventListener('input', (e) => { if (e.target && (e.target.id === 'cuB-clave' || e.target.id === 'cuB-palabra')) revisarBorrar(); });
  document.addEventListener('submit', (e) => { if (e.target && e.target.id === 'formBorrarCuenta') { e.preventDefault(); enviarBorrar(); } });

  // Si el chat responde "terminos_pendientes" (por ejemplo, otra pestaña): se pide aceptar ahí mismo
  function envolverChat() {
    const A = Api();
    if (!A || A.__cuentaChat) return;
    A.__cuentaChat = true;
    ['escribir', 'mensajeRapido'].forEach((k) => {
      const orig = A[k];
      if (typeof orig !== 'function') return;
      A[k] = async function () {
        try { return await orig.apply(this, arguments); } catch (err) {
          if (err && err.codigo === 'terminos_pendientes') {
            if (A.estado && A.estado.terminos) A.estado.terminos.aceptados = false;
            // El panel del chat tapa las ventanas: se cierra, se pide aceptar y, al aceptar, se vuelve a abrir
            const panel = $('chat-panel');
            const abierto = !!(panel && !panel.hidden);
            if (abierto) { const c = panel.querySelector('[data-chat="cerrar"]'); if (c) c.click(); }
            pedirAceptar(abierto ? () => { const b = $('chat-btn'); if (b) b.click(); } : null);
            err.message = T('falta_terminos');
          }
          throw err;
        }
      };
    });
  }
  envolverChat();

  root.Cuenta = {
    EDAD,
    T,
    /** Casillas del formulario de registro (abrirCuenta en ui.js). */
    camposRegistro: () => casillas('cu'),
    /** Texto del error si falta marcar algo, o '' si está bien. */
    faltaRegistro: () => falta('cu'),
    /** Lo que va en POST /api/registro junto con email, nombre y clave. */
    datosRegistro: () => ({ acepta_terminos: !!($('cu-terminos') || {}).checked, edad_16: !!($('cu-edad') || {}).checked }),
    /** Botones de la tarjeta "Tu cuenta" (Tienda), debajo de "Cerrar sesión". */
    botones: () => { css(); return `<button class="btn sm cu-borrar-btn" data-act="cuenta-borrar">${esc(T('borrar'))}</button>
      <a class="cu-web" href="/borrar-cuenta.html" target="_blank" rel="noopener">${esc(T('borrar_web'))}</a>`; },
    /** ctx: { openModal, closeModal, toast, snd, alBorrar } (todo opcional). */
    abrirBorrar,
    pendiente,
    pedirAceptar,
  };
})(typeof window !== 'undefined' ? window : globalThis);
