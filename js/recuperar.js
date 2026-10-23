/* =====================================================================
   EN VIVO Tycoon — "¿Olvidaste tu contraseña?" (server/INTEGRAR_CORREO.md)
   - window.Recuperar.enlace() → html del botón que va debajo del formulario de "Entrar" (js/ui.js abrirCuenta).
   - Al tocarlo, la misma ventana cambia a "Recuperar contraseña": se escribe el correo y el servidor manda un enlace
     de un solo uso (POST /api/cuenta/recuperar). La respuesta es la misma exista o no la cuenta.
   - El enlace abre /recuperar.html (server/public/recuperar.html), donde se elige la contraseña nueva.
   - Textos en los 10 idiomas aquí mismo; idioma = window.I18N.idioma (respaldo: español).
   ===================================================================== */
(function (root) {
  'use strict';
  const D = {
    es: { enlace: '¿Olvidaste tu contraseña?', titulo: 'Recuperar contraseña', texto: 'Escribe el correo de tu cuenta y te enviamos un enlace para elegir una contraseña nueva.', correo: 'Correo', boton: 'Enviarme el enlace', enviado: 'Si ese correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Revisa tu bandeja de entrada y la carpeta de spam. El enlace vence en {min} minutos.', ayuda: '¿No te llega en unos minutos? Escríbenos desde Ayuda y soporte.', volver: 'Volver a entrar', e_correo: 'Escribe un correo válido.', e_limite: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.', e_limite_correo: 'Ya te enviamos varios enlaces a ese correo. Revisa tu bandeja de entrada y el spam, o espera una hora para pedir otro.', e_red: 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.' },
    en: { enlace: 'Forgot your password?', titulo: 'Reset password', texto: 'Enter your account email and we\'ll send you a link to choose a new password.', correo: 'Email', boton: 'Send me the link', enviado: 'If that email has an account, we sent you a link to choose a new password. Check your inbox and spam folder. The link expires in {min} minutes.', ayuda: 'Not arriving after a few minutes? Write to us from Help & support.', volver: 'Back to sign in', e_correo: 'Enter a valid email.', e_limite: 'Too many attempts. Wait a few minutes and try again.', e_limite_correo: 'We already sent several links to that email. Check your inbox and spam, or wait an hour to ask for another.', e_red: 'No connection to the server. Check your internet and try again.' },
    'pt-BR': { enlace: 'Esqueceu a senha?', titulo: 'Recuperar senha', texto: 'Digite o e-mail da sua conta e enviamos um link para escolher uma nova senha.', correo: 'E-mail', boton: 'Enviar o link', enviado: 'Se esse e-mail tem uma conta, enviamos um link para escolher uma nova senha. Veja sua caixa de entrada e o spam. O link vence em {min} minutos.', ayuda: 'Não chegou em alguns minutos? Escreva para nós em Ajuda e suporte.', volver: 'Voltar para entrar', e_correo: 'Digite um e-mail válido.', e_limite: 'Tentativas demais. Espere alguns minutos e tente de novo.', e_limite_correo: 'Já enviamos vários links para esse e-mail. Veja a caixa de entrada e o spam, ou espere uma hora para pedir outro.', e_red: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.' },
    fr: { enlace: 'Mot de passe oublié ?', titulo: 'Réinitialiser le mot de passe', texto: 'Écris l\'e-mail de ton compte et nous t\'enverrons un lien pour choisir un nouveau mot de passe.', correo: 'E-mail', boton: 'M\'envoyer le lien', enviado: 'Si cet e-mail a un compte, nous t\'avons envoyé un lien pour choisir un nouveau mot de passe. Regarde ta boîte de réception et les spams. Le lien expire dans {min} minutes.', ayuda: 'Rien après quelques minutes ? Écris-nous depuis Aide et support.', volver: 'Retour à la connexion', e_correo: 'Écris un e-mail valide.', e_limite: 'Trop de tentatives. Attends quelques minutes et réessaie.', e_limite_correo: 'Nous avons déjà envoyé plusieurs liens à cet e-mail. Regarde ta boîte et les spams, ou attends une heure pour en demander un autre.', e_red: 'Pas de connexion au serveur. Vérifie ton internet et réessaie.' },
    de: { enlace: 'Passwort vergessen?', titulo: 'Passwort zurücksetzen', texto: 'Gib die E-Mail deines Kontos ein und wir schicken dir einen Link für ein neues Passwort.', correo: 'E-Mail', boton: 'Link schicken', enviado: 'Wenn diese E-Mail ein Konto hat, haben wir dir einen Link für ein neues Passwort geschickt. Schau in deinen Posteingang und den Spam-Ordner. Der Link läuft in {min} Minuten ab.', ayuda: 'Nach ein paar Minuten nichts da? Schreib uns über Hilfe & Support.', volver: 'Zurück zur Anmeldung', e_correo: 'Gib eine gültige E-Mail ein.', e_limite: 'Zu viele Versuche. Warte ein paar Minuten und versuche es erneut.', e_limite_correo: 'Wir haben schon mehrere Links an diese E-Mail geschickt. Schau in Posteingang und Spam oder warte eine Stunde.', e_red: 'Keine Verbindung zum Server. Prüfe dein Internet und versuche es erneut.' },
    it: { enlace: 'Password dimenticata?', titulo: 'Recupera password', texto: 'Scrivi l\'e-mail del tuo account e ti mandiamo un link per scegliere una nuova password.', correo: 'E-mail', boton: 'Mandami il link', enviado: 'Se quell\'e-mail ha un account, ti abbiamo mandato un link per scegliere una nuova password. Controlla la posta in arrivo e lo spam. Il link scade tra {min} minuti.', ayuda: 'Non arriva dopo qualche minuto? Scrivici da Aiuto e supporto.', volver: 'Torna ad accedere', e_correo: 'Scrivi un\'e-mail valida.', e_limite: 'Troppi tentativi. Aspetta qualche minuto e riprova.', e_limite_correo: 'Abbiamo già mandato vari link a quell\'e-mail. Controlla posta e spam, o aspetta un\'ora per chiederne un altro.', e_red: 'Nessuna connessione al server. Controlla internet e riprova.' },
    ru: { enlace: 'Забыл пароль?', titulo: 'Восстановление пароля', texto: 'Укажи почту аккаунта, и мы пришлём ссылку для нового пароля.', correo: 'Почта', boton: 'Прислать ссылку', enviado: 'Если на эту почту есть аккаунт, мы отправили ссылку для нового пароля. Проверь входящие и папку «Спам». Ссылка действует {min} минут.', ayuda: 'Письмо не пришло за несколько минут? Напиши нам через «Помощь и поддержка».', volver: 'Назад ко входу', e_correo: 'Укажи правильную почту.', e_limite: 'Слишком много попыток. Подожди несколько минут и попробуй снова.', e_limite_correo: 'Мы уже отправили несколько ссылок на эту почту. Проверь входящие и спам или подожди час.', e_red: 'Нет связи с сервером. Проверь интернет и попробуй снова.' },
    tr: { enlace: 'Şifreni mi unuttun?', titulo: 'Şifre sıfırlama', texto: 'Hesabının e-postasını yaz, yeni şifre seçmen için bir bağlantı gönderelim.', correo: 'E-posta', boton: 'Bağlantıyı gönder', enviado: 'Bu e-postanın bir hesabı varsa yeni şifre seçmen için bir bağlantı gönderdik. Gelen kutunu ve spam klasörünü kontrol et. Bağlantı {min} dakika içinde geçersiz olur.', ayuda: 'Birkaç dakikada gelmedi mi? Yardım ve destek bölümünden bize yaz.', volver: 'Girişe dön', e_correo: 'Geçerli bir e-posta yaz.', e_limite: 'Çok fazla deneme. Birkaç dakika bekleyip tekrar dene.', e_limite_correo: 'Bu e-postaya zaten birkaç bağlantı gönderdik. Gelen kutunu ve spam\'i kontrol et ya da bir saat bekle.', e_red: 'Sunucuya bağlantı yok. İnternetini kontrol edip tekrar dene.' },
    id: { enlace: 'Lupa kata sandi?', titulo: 'Pulihkan kata sandi', texto: 'Tulis email akunmu dan kami kirim tautan untuk memilih kata sandi baru.', correo: 'Email', boton: 'Kirim tautannya', enviado: 'Kalau email itu punya akun, kami sudah mengirim tautan untuk memilih kata sandi baru. Cek kotak masuk dan folder spam. Tautan berlaku {min} menit.', ayuda: 'Belum sampai setelah beberapa menit? Tulis ke kami lewat Bantuan & dukungan.', volver: 'Kembali ke masuk', e_correo: 'Tulis email yang valid.', e_limite: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.', e_limite_correo: 'Kami sudah mengirim beberapa tautan ke email itu. Cek kotak masuk dan spam, atau tunggu satu jam.', e_red: 'Tidak ada koneksi ke server. Cek internetmu lalu coba lagi.' },
    'zh-CN': { enlace: '忘记密码？', titulo: '找回密码', texto: '输入你的账号邮箱，我们会发送一个设置新密码的链接。', correo: '邮箱', boton: '发送链接', enviado: '如果这个邮箱有账号，我们已发送设置新密码的链接。请查看收件箱和垃圾邮件。链接 {min} 分钟后失效。', ayuda: '几分钟后还没收到？请通过“帮助与支持”联系我们。', volver: '返回登录', e_correo: '请输入有效的邮箱。', e_limite: '尝试次数过多。请等几分钟再试。', e_limite_correo: '我们已向这个邮箱发送了多个链接。请查看收件箱和垃圾邮件，或一小时后再申请。', e_red: '无法连接服务器。请检查网络后重试。' },
  };
  const idioma = () => { try { const i = root.I18N && root.I18N.idioma; return D[i] ? i : 'es'; } catch (e) { return 'es'; } };
  function t(k, d) {
    const s = (D[idioma()] && D[idioma()][k]) || D.es[k] || k;
    return s.replace(/\{(\w+)\}/g, (m, x) => (d && d[x] !== undefined ? String(d[x]) : m));
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Botón para debajo del formulario de Entrar. */
  function enlace() {
    return `<button type="button" class="btn rc-olvido" data-recuperar="1">${esc(t('enlace'))}</button>`;
  }

  function errorDe(e) {
    const c = e && e.codigo;
    if (c === 'email_invalido') return t('e_correo');
    if (c === 'recuperar_limite') return t('e_limite_correo');
    if (c === 'limite_intentos' || (e && e.status === 429)) return t('e_limite');
    if (idioma() === 'es' && e && e.texto) return e.texto;
    return t('e_red');
  }

  async function pedir(email) {
    let r, j = null;
    try {
      r = await fetch('/api/cuenta/recuperar', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': idioma() }, body: JSON.stringify({ email, idioma: idioma() }) });
      try { j = await r.json(); } catch (x) { j = null; }
    } catch (x) { throw { status: 0 }; }
    if (!r.ok || !j || j.ok === false) throw { status: r.status, codigo: j && j.codigo, texto: j && j.error };
    return j;
  }

  /** Cambia la ventana abierta (la de Entrar) a "Recuperar contraseña". */
  function abrir(email) {
    const m = document.getElementById('modal');
    if (!m) return;
    // El mismo botón de cerrar que tenía la ventana de Entrar (icono y texto del juego)
    const x = m.querySelector('[data-act="close"]');
    const cerrar = x ? x.outerHTML : '<button class="btn sm" data-act="close" aria-label="×">×</button>';
    m.innerHTML = `<div class="row between"><h2>${esc(t('titulo'))}</h2>${cerrar}</div>
      <p class="small muted">${esc(t('texto'))}</p>
      <form id="formRecuperar" novalidate>
        <label class="field">${esc(t('correo'))}<input id="rc-email" type="email" autocomplete="email" maxlength="120" required value="${esc(email || '')}"></label>
        <p class="small neg" id="rc-error" aria-live="polite"></p>
        <button class="btn main" type="submit" id="rc-btn">${esc(t('boton'))}</button>
      </form>
      <div id="rc-ok" class="rc-ok" role="status" aria-live="polite" hidden></div>
      <button class="btn" data-act="cuenta" data-modo="entrar">${esc(t('volver'))}</button>
      <p class="small muted">${esc(t('ayuda'))}</p>`;
    const ov = document.getElementById('overlay');
    if (ov) ov.classList.add('on');
    m.scrollTop = 0;
    const f = document.getElementById('formRecuperar');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const inp = document.getElementById('rc-email'), err = document.getElementById('rc-error'), btn = document.getElementById('rc-btn');
      const v = inp.value.trim();
      err.textContent = '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { err.textContent = t('e_correo'); inp.focus(); return; }
      btn.disabled = true;
      try {
        const j = await pedir(v);
        f.hidden = true;
        const ok = document.getElementById('rc-ok');
        ok.textContent = t('enviado', { min: j.minutos || 30 });
        ok.hidden = false;
      } catch (e) {
        err.textContent = errorDe(e); btn.disabled = false;
      }
    });
    try { document.getElementById('rc-email').focus(); } catch (e) { /* nada */ }
  }

  let estilo = false;
  function ponerEstilo() {
    if (estilo || typeof document === 'undefined' || !document.head) return;
    estilo = true;
    const st = document.createElement('style');
    st.textContent = `.btn.rc-olvido{display:block;width:100%;margin-top:6px;padding:10px;font-size:14px;text-align:center;background:transparent;border:0;color:var(--amber,#ffb020);text-decoration:underline;min-height:40px}
.rc-ok{background:#123222;border:1px solid var(--green,#2ecc71);border-radius:12px;padding:12px;margin:8px 0 10px;font-size:14px;line-height:1.45}`;
    document.head.appendChild(st);
  }

  if (typeof document !== 'undefined') {
    ponerEstilo();
    document.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-recuperar]') : null;
      if (!el) return;
      e.stopPropagation(); e.preventDefault();
      const em = document.getElementById('cu-email');
      abrir(em ? em.value.trim() : '');
    }, true);
  }

  root.Recuperar = { enlace, abrir, _D: D };
})(typeof window !== 'undefined' ? window : globalThis);
