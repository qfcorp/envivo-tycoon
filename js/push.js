/* =========================================================
   EN VIVO Tycoon — Notificaciones push (contrato: server/INTEGRAR_PUSH.md, rutas /api/push/*)
   - Aviso previo PROPIO y amable, solo después de un momento de éxito: el primer evento de 5 estrellas o al crear la
     cuenta. Nunca al abrir el juego. "Ahora no" = no se vuelve a preguntar en 7 días (máximo 3 veces en total).
   - Ajustes por categoría (obra, copa, premio, buzón, liga/duelos, ofertas apagado) en una ventana propia; el botón
     "Notificaciones" aparece solo en la tarjeta de la cuenta (junto a "Salir").
   - Suscripción por cuenta y por aparato; al salir de la cuenta este aparato se da de baja.
   - No toca ui.js: se engancha a Game.finishEvent y a Api.registro / Api.salir. Si falta algo, no hace nada.
   Textos: 10 idiomas aquí mismo (según window.I18N.idioma).
   ========================================================= */
(function (root) {
  'use strict';
  const CATS = ['obra', 'copa', 'premio', 'buzon', 'duelo', 'ofertas'];
  const TX = {
    es: {
      pre_t_estrellas: '¡5 estrellas! ¿Te avisamos?', pre_t_cuenta: '¡Cuenta lista! ¿Te avisamos?',
      pre_b: 'Un aviso corto cuando pase algo importante en tu productora:', pre_nota: 'Máximo {n} al día y nunca de noche. Lo cambias cuando quieras en Tienda › Tu cuenta.',
      si: 'Sí, avísame', no: 'Ahora no', listo: 'Listo: te avisaremos.',
      bloqueado: 'Las notificaciones están bloqueadas. Actívalas en los ajustes del sitio o de la app y vuelve aquí.',
      no_soportado: 'Este navegador no admite notificaciones.', entrar: 'Entra a tu cuenta para activar las notificaciones.',
      ajustes_t: 'Notificaciones', activar: 'Activar notificaciones', desactivar: 'Desactivar en este aparato',
      activo: 'Activas en este aparato', inactivo: 'Apagadas en este aparato', guardado: 'Guardado', error: 'No se pudo completar. Intenta de nuevo.', cerrar: 'Cerrar',
      nota: 'Máximo {n} avisos al día. Entre las 22:00 y las 08:00 no te molestamos.',
      cat_obra: 'Obra o sede terminada', cat_copa: 'Empieza la Copa o la batalla de tu servidor', cat_premio: 'Premio diario listo',
      cat_buzon: 'Mensaje en el buzón', cat_duelo: 'Resultados de liga y duelos', cat_ofertas: 'Ofertas',
    },
    en: {
      pre_t_estrellas: '5 stars! Want a heads-up?', pre_t_cuenta: 'Account ready! Want a heads-up?',
      pre_b: 'A short alert when something important happens at your studio:', pre_nota: 'Up to {n} a day and never at night. Change it anytime in Shop › Your account.',
      si: 'Yes, notify me', no: 'Not now', listo: 'Done: we\'ll let you know.',
      bloqueado: 'Notifications are blocked. Turn them on in the site or app settings and come back.',
      no_soportado: 'This browser doesn\'t support notifications.', entrar: 'Sign in to turn on notifications.',
      ajustes_t: 'Notifications', activar: 'Turn on notifications', desactivar: 'Turn off on this device',
      activo: 'On for this device', inactivo: 'Off for this device', guardado: 'Saved', error: 'Couldn\'t complete. Try again.', cerrar: 'Close',
      nota: 'Up to {n} alerts a day. We won\'t bother you between 22:00 and 08:00.',
      cat_obra: 'Build or HQ finished', cat_copa: 'Cup or server battle starts', cat_premio: 'Daily reward ready',
      cat_buzon: 'Message in your inbox', cat_duelo: 'League and duel results', cat_ofertas: 'Offers',
    },
    'pt-BR': {
      pre_t_estrellas: '5 estrelas! Quer ser avisado?', pre_t_cuenta: 'Conta pronta! Quer ser avisado?',
      pre_b: 'Um aviso curto quando algo importante acontecer na sua produtora:', pre_nota: 'No máximo {n} por dia e nunca à noite. Mude quando quiser em Loja › Sua conta.',
      si: 'Sim, me avise', no: 'Agora não', listo: 'Pronto: vamos te avisar.',
      bloqueado: 'As notificações estão bloqueadas. Ative-as nas configurações do site ou do app e volte aqui.',
      no_soportado: 'Este navegador não suporta notificações.', entrar: 'Entre na sua conta para ativar as notificações.',
      ajustes_t: 'Notificações', activar: 'Ativar notificações', desactivar: 'Desativar neste aparelho',
      activo: 'Ativas neste aparelho', inactivo: 'Desligadas neste aparelho', guardado: 'Salvo', error: 'Não foi possível concluir. Tente de novo.', cerrar: 'Fechar',
      nota: 'No máximo {n} avisos por dia. Entre 22:00 e 08:00 não incomodamos.',
      cat_obra: 'Obra ou sede concluída', cat_copa: 'Começa a Copa ou a batalha do servidor', cat_premio: 'Prêmio diário pronto',
      cat_buzon: 'Mensagem na caixa', cat_duelo: 'Resultados de liga e duelos', cat_ofertas: 'Ofertas',
    },
    fr: {
      pre_t_estrellas: '5 étoiles ! On te prévient ?', pre_t_cuenta: 'Compte prêt ! On te prévient ?',
      pre_b: 'Une courte alerte quand il se passe quelque chose d\'important dans ta boîte :', pre_nota: '{n} par jour au maximum et jamais la nuit. Modifiable dans Boutique › Ton compte.',
      si: 'Oui, préviens-moi', no: 'Pas maintenant', listo: 'C\'est fait : on te préviendra.',
      bloqueado: 'Les notifications sont bloquées. Active-les dans les réglages du site ou de l\'appli, puis reviens.',
      no_soportado: 'Ce navigateur ne gère pas les notifications.', entrar: 'Connecte-toi pour activer les notifications.',
      ajustes_t: 'Notifications', activar: 'Activer les notifications', desactivar: 'Désactiver sur cet appareil',
      activo: 'Activées sur cet appareil', inactivo: 'Désactivées sur cet appareil', guardado: 'Enregistré', error: 'Impossible de terminer. Réessaie.', cerrar: 'Fermer',
      nota: '{n} alertes par jour au maximum. Rien entre 22:00 et 08:00.',
      cat_obra: 'Chantier ou siège terminé', cat_copa: 'Début de la Coupe ou de la bataille', cat_premio: 'Récompense du jour prête',
      cat_buzon: 'Message dans ta boîte', cat_duelo: 'Résultats de ligue et de duels', cat_ofertas: 'Offres',
    },
    de: {
      pre_t_estrellas: '5 Sterne! Sollen wir dich benachrichtigen?', pre_t_cuenta: 'Konto bereit! Sollen wir dich benachrichtigen?',
      pre_b: 'Ein kurzer Hinweis, wenn in deiner Produktion etwas Wichtiges passiert:', pre_nota: 'Höchstens {n} pro Tag und nie nachts. Jederzeit änderbar unter Shop › Dein Konto.',
      si: 'Ja, benachrichtigen', no: 'Jetzt nicht', listo: 'Erledigt: Wir sagen dir Bescheid.',
      bloqueado: 'Benachrichtigungen sind blockiert. Aktiviere sie in den Website- oder App-Einstellungen und komm zurück.',
      no_soportado: 'Dieser Browser unterstützt keine Benachrichtigungen.', entrar: 'Melde dich an, um Benachrichtigungen zu aktivieren.',
      ajustes_t: 'Benachrichtigungen', activar: 'Benachrichtigungen aktivieren', desactivar: 'Auf diesem Gerät deaktivieren',
      activo: 'Auf diesem Gerät aktiv', inactivo: 'Auf diesem Gerät aus', guardado: 'Gespeichert', error: 'Das hat nicht geklappt. Versuch es noch einmal.', cerrar: 'Schließen',
      nota: 'Höchstens {n} Hinweise pro Tag. Zwischen 22:00 und 08:00 stören wir nicht.',
      cat_obra: 'Bau oder Zentrale fertig', cat_copa: 'Pokal oder Server-Schlacht beginnt', cat_premio: 'Tagesbelohnung bereit',
      cat_buzon: 'Nachricht im Postfach', cat_duelo: 'Liga- und Duellergebnisse', cat_ofertas: 'Angebote',
    },
    it: {
      pre_t_estrellas: '5 stelle! Ti avvisiamo?', pre_t_cuenta: 'Account pronto! Ti avvisiamo?',
      pre_b: 'Un breve avviso quando succede qualcosa di importante nella tua casa di produzione:', pre_nota: 'Al massimo {n} al giorno e mai di notte. Lo cambi quando vuoi in Negozio › Il tuo account.',
      si: 'Sì, avvisami', no: 'Non ora', listo: 'Fatto: ti avviseremo.',
      bloqueado: 'Le notifiche sono bloccate. Attivale nelle impostazioni del sito o dell\'app e torna qui.',
      no_soportado: 'Questo browser non supporta le notifiche.', entrar: 'Accedi per attivare le notifiche.',
      ajustes_t: 'Notifiche', activar: 'Attiva le notifiche', desactivar: 'Disattiva su questo dispositivo',
      activo: 'Attive su questo dispositivo', inactivo: 'Spente su questo dispositivo', guardado: 'Salvato', error: 'Impossibile completare. Riprova.', cerrar: 'Chiudi',
      nota: 'Al massimo {n} avvisi al giorno. Tra le 22:00 e le 08:00 non disturbiamo.',
      cat_obra: 'Lavori o sede finiti', cat_copa: 'Inizia la Coppa o la battaglia del server', cat_premio: 'Premio giornaliero pronto',
      cat_buzon: 'Messaggio nella casella', cat_duelo: 'Risultati di lega e duelli', cat_ofertas: 'Offerte',
    },
    ru: {
      pre_t_estrellas: '5 звёзд! Присылать уведомления?', pre_t_cuenta: 'Аккаунт готов! Присылать уведомления?',
      pre_b: 'Короткое уведомление, когда в твоей студии происходит что-то важное:', pre_nota: 'Не больше {n} в день и никогда ночью. Можно изменить в Магазин › Твой аккаунт.',
      si: 'Да, присылать', no: 'Не сейчас', listo: 'Готово: мы будем сообщать.',
      bloqueado: 'Уведомления заблокированы. Включи их в настройках сайта или приложения и вернись сюда.',
      no_soportado: 'Этот браузер не поддерживает уведомления.', entrar: 'Войди в аккаунт, чтобы включить уведомления.',
      ajustes_t: 'Уведомления', activar: 'Включить уведомления', desactivar: 'Выключить на этом устройстве',
      activo: 'Включены на этом устройстве', inactivo: 'Выключены на этом устройстве', guardado: 'Сохранено', error: 'Не получилось. Попробуй ещё раз.', cerrar: 'Закрыть',
      nota: 'Не больше {n} уведомлений в день. С 22:00 до 08:00 не беспокоим.',
      cat_obra: 'Стройка или офис готовы', cat_copa: 'Начало Кубка или битвы сервера', cat_premio: 'Ежедневная награда готова',
      cat_buzon: 'Сообщение в почте', cat_duelo: 'Итоги лиги и дуэлей', cat_ofertas: 'Предложения',
    },
    tr: {
      pre_t_estrellas: '5 yıldız! Haber verelim mi?', pre_t_cuenta: 'Hesap hazır! Haber verelim mi?',
      pre_b: 'Yapım şirketinde önemli bir şey olduğunda kısa bir bildirim:', pre_nota: 'Günde en fazla {n} ve asla gece değil. İstediğin zaman Mağaza › Hesabın bölümünden değiştir.',
      si: 'Evet, haber ver', no: 'Şimdi değil', listo: 'Tamam: sana haber vereceğiz.',
      bloqueado: 'Bildirimler engellendi. Site veya uygulama ayarlarından aç ve buraya dön.',
      no_soportado: 'Bu tarayıcı bildirimleri desteklemiyor.', entrar: 'Bildirimleri açmak için hesabına gir.',
      ajustes_t: 'Bildirimler', activar: 'Bildirimleri aç', desactivar: 'Bu cihazda kapat',
      activo: 'Bu cihazda açık', inactivo: 'Bu cihazda kapalı', guardado: 'Kaydedildi', error: 'Tamamlanamadı. Tekrar dene.', cerrar: 'Kapat',
      nota: 'Günde en fazla {n} bildirim. 22:00 ile 08:00 arasında rahatsız etmeyiz.',
      cat_obra: 'İnşaat veya merkez bitti', cat_copa: 'Kupa veya sunucu savaşı başlıyor', cat_premio: 'Günlük ödül hazır',
      cat_buzon: 'Kutunda mesaj', cat_duelo: 'Lig ve düello sonuçları', cat_ofertas: 'Teklifler',
    },
    id: {
      pre_t_estrellas: '5 bintang! Mau kami kabari?', pre_t_cuenta: 'Akun siap! Mau kami kabari?',
      pre_b: 'Pemberitahuan singkat saat ada hal penting di rumah produksimu:', pre_nota: 'Maksimal {n} sehari dan tidak pernah malam hari. Ubah kapan saja di Toko › Akunmu.',
      si: 'Ya, kabari aku', no: 'Nanti saja', listo: 'Beres: kami akan mengabarimu.',
      bloqueado: 'Notifikasi diblokir. Aktifkan di pengaturan situs atau aplikasi lalu kembali ke sini.',
      no_soportado: 'Browser ini tidak mendukung notifikasi.', entrar: 'Masuk ke akunmu untuk mengaktifkan notifikasi.',
      ajustes_t: 'Notifikasi', activar: 'Aktifkan notifikasi', desactivar: 'Matikan di perangkat ini',
      activo: 'Aktif di perangkat ini', inactivo: 'Mati di perangkat ini', guardado: 'Tersimpan', error: 'Tidak bisa diselesaikan. Coba lagi.', cerrar: 'Tutup',
      nota: 'Maksimal {n} pemberitahuan sehari. Antara 22:00 dan 08:00 kami tidak mengganggu.',
      cat_obra: 'Bangunan atau markas selesai', cat_copa: 'Piala atau pertempuran server dimulai', cat_premio: 'Hadiah harian siap',
      cat_buzon: 'Pesan di kotak masuk', cat_duelo: 'Hasil liga dan duel', cat_ofertas: 'Penawaran',
    },
    'zh-CN': {
      pre_t_estrellas: '5星！需要通知你吗？', pre_t_cuenta: '账号已就绪！需要通知你吗？',
      pre_b: '你的公司发生重要事情时，发一条简短通知：', pre_nota: '每天最多{n}条，夜间绝不打扰。可随时在 商店 › 你的账号 中修改。',
      si: '好的，通知我', no: '以后再说', listo: '完成：我们会通知你。',
      bloqueado: '通知已被阻止。请在网站或应用设置中开启后再回来。',
      no_soportado: '此浏览器不支持通知。', entrar: '登录账号即可开启通知。',
      ajustes_t: '通知', activar: '开启通知', desactivar: '在此设备上关闭',
      activo: '此设备已开启', inactivo: '此设备已关闭', guardado: '已保存', error: '无法完成，请重试。', cerrar: '关闭',
      nota: '每天最多{n}条通知。22:00至08:00之间不打扰。',
      cat_obra: '工程或总部完工', cat_copa: '杯赛或服务器对决开始', cat_premio: '每日奖励已就绪',
      cat_buzon: '信箱新消息', cat_duelo: '联赛与对决结果', cat_ofertas: '优惠',
    },
  };
  const idioma = () => {
    let i = 'es';
    try { i = (root.I18N && root.I18N.idioma) || 'es'; } catch (e) { /* español */ }
    if (TX[i]) return i;
    const b = String(i).split('-')[0];
    return Object.keys(TX).find((k) => k.split('-')[0] === b) || 'es';
  };
  const T = (k, p) => String((TX[idioma()] && TX[idioma()][k]) || TX.es[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
  };
  const K_PREG = 'envivo_push_preguntado';     // {n: veces, t: última vez (ms)}
  const K_DISP = 'envivo_push_dispositivo';
  const K_IDI = 'envivo_push_idioma';
  const ESPERA_NO = 7 * 864e5;
  const MAX_PREGUNTAS = 3;

  const soportado = () => { try { return 'serviceWorker' in navigator && 'PushManager' in root && 'Notification' in root; } catch (e) { return false; } };
  const logueado = () => { try { return !!(root.Api && root.Api.estado && root.Api.estado.logueado); } catch (e) { return false; } };
  const permiso = () => { try { return root.Notification.permission; } catch (e) { return 'denied'; } };
  let est = null;   // última respuesta de /api/push/estado

  async function pedir(ruta, body) {
    const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body || {}) });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) {
      const err = new Error((j && j.error) || T('error'));
      err.codigo = (j && j.codigo) || null;
      throw err;
    }
    return j;
  }
  function dispositivo() {
    let d = LS.get(K_DISP);
    if (!d || !/^[A-Za-z0-9_-]{8,64}$/.test(d)) {
      const a = new Uint8Array(16);
      try { root.crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); }
      d = Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
      LS.set(K_DISP, d);
    }
    return d;
  }
  function bytes(b64u) {
    const s = String(b64u).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
  }
  const igual = (a, b) => { if (!a || !b) return false; const x = new Uint8Array(a), y = new Uint8Array(b); return x.length === y.length && x.every((v, i) => v === y[i]); };
  function registro() {
    return Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sin service worker')), 8000))]);
  }
  async function subActual() { try { return await (await registro()).pushManager.getSubscription(); } catch (e) { return null; } }

  async function refrescar() {
    if (!soportado() || !logueado()) { est = null; return null; }
    const s = await subActual();
    est = await pedir('/api/push/estado', { endpoint: s ? s.endpoint : '' });
    // Ya dio permiso en este aparato: si el servidor no la tiene (o cambió el idioma), se vuelve a registrar sola
    if (s && permiso() === 'granted' && est.disponible && (!est.suscrito || LS.get(K_IDI) !== idioma())) {
      try { await guardarSub(s, est.suscrito ? est.categorias : undefined); } catch (e) { /* la próxima vez */ }
    }
    return est;
  }
  async function guardarSub(s, categorias) {
    est = await pedir('/api/push/suscribir', { suscripcion: s.toJSON(), dispositivo: dispositivo(), idioma: (root.I18N && root.I18N.idioma) || idioma(), categorias });
    LS.set(K_IDI, idioma());
    return est;
  }
  /** Pide el permiso del navegador y suscribe este aparato. Devuelve 'ok' | 'bloqueado' | 'no'. */
  async function activar(categorias) {
    if (!est) await refrescar();
    if (!est || !est.disponible || !est.publica) throw new Error(T('error'));
    const p = permiso() === 'granted' ? 'granted' : await root.Notification.requestPermission();
    if (p !== 'granted') return p === 'denied' ? 'bloqueado' : 'no';
    const reg = await registro();
    let s = await reg.pushManager.getSubscription();
    const key = bytes(est.publica);
    if (s && s.options && s.options.applicationServerKey && !igual(s.options.applicationServerKey, key)) { try { await s.unsubscribe(); } catch (e) { /* nada */ } s = null; }
    if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await guardarSub(s, categorias);
    return 'ok';
  }
  async function desactivar() {
    const s = await subActual();
    if (!s) return;
    try { est = await pedir('/api/push/baja', { endpoint: s.endpoint }); } catch (e) { /* sin servidor: igual se quita aquí */ }
    try { await s.unsubscribe(); } catch (e) { /* nada */ }
  }

  // ---------------------------------------------------------------- ventana propia (hoja inferior)
  function estilos() {
    if (document.getElementById('push-css')) return;
    const st = document.createElement('style');
    st.id = 'push-css';
    st.textContent = `
      .push-velo{position:fixed;inset:0;z-index:60;background:#000a;display:flex;align-items:flex-end;justify-content:center;padding:0 12px}
      .push-hoja{width:100%;max-width:440px;background:var(--panel,#161a22);color:var(--text,#e9edf5);border:1px solid var(--line,#2a3242);border-bottom:0;
        border-radius:var(--radius,14px) var(--radius,14px) 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -10px 30px #0008;animation:push-sube .22s ease-out;max-height:88vh;overflow:auto}
      @keyframes push-sube{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
      @media (prefers-reduced-motion:reduce){.push-hoja{animation:none}}
      .push-hoja h3{margin:6px 0 6px;font-size:18px}
      .push-hoja p{margin:6px 0;line-height:1.4}
      .push-camp{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:color-mix(in srgb,var(--amber,#ffb020) 18%,transparent);color:var(--amber,#ffb020)}
      .push-lista{list-style:none;padding:0;margin:10px 0}
      .push-lista li{display:flex;gap:8px;align-items:center;padding:4px 0}
      .push-lista li::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--green,#2ecc71);flex:none}
      .push-nota{font-size:12.5px;color:var(--muted,#8b95a8)}
      .push-btns{display:flex;flex-direction:column;gap:8px;margin-top:14px}
      .push-btns button,.push-fila{font:inherit}
      .push-b{min-height:46px;border-radius:12px;border:1px solid var(--line,#2a3242);background:var(--panel2,#1e2430);color:inherit;font-weight:600;cursor:pointer}
      .push-b.main{background:var(--amber,#ffb020);border-color:var(--amber,#ffb020);color:#1a1200}
      .push-b:focus-visible,.push-sw input:focus-visible+i{outline:2px solid var(--blue,#4da3ff);outline-offset:2px}
      .push-fila{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line,#2a3242)}
      .push-sw{position:relative;flex:none;width:46px;height:28px}
      .push-sw input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
      .push-sw i{position:absolute;inset:0;border-radius:20px;background:var(--line,#2a3242);transition:background .15s;pointer-events:none}
      .push-sw i::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .15s}
      .push-sw input:checked+i{background:var(--green,#2ecc71)}
      .push-sw input:checked+i::after{transform:translateX(18px)}
      .push-sw input:disabled+i{opacity:.5}
      .push-estado{display:inline-block;font-size:12.5px;padding:3px 9px;border-radius:20px;background:var(--panel2,#1e2430);color:var(--muted,#8b95a8)}
      .push-estado.on{color:var(--green,#2ecc71)}
      .push-msg{min-height:18px;font-size:13px;color:var(--green,#2ecc71)}
      .push-msg.mal{color:var(--red,#ff3b3b)}
      [data-push-ajustes] svg{width:16px;height:16px;vertical-align:-3px;margin-inline-end:6px}`;
    document.head.appendChild(st);
  }
  const CAMPANA = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  let hoja = null;
  function cerrarHoja() { if (hoja) { hoja.remove(); hoja = null; } }
  function abrirHoja(html, id) {
    estilos();
    cerrarHoja();
    hoja = document.createElement('div');
    hoja.className = 'push-velo';
    hoja.id = id;
    hoja.innerHTML = `<div class="push-hoja" role="dialog" aria-modal="true" aria-labelledby="${id}-t">${html}</div>`;
    hoja.addEventListener('click', (e) => { if (e.target === hoja) cerrarHoja(); });
    hoja.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });
    document.body.appendChild(hoja);
    const b = hoja.querySelector('button.main') || hoja.querySelector('button');
    if (b) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }
    return hoja;
  }

  // ---------------------------------------------------------------- aviso previo (solo tras un momento de éxito)
  function preguntas() { try { return JSON.parse(LS.get(K_PREG) || '{}') || {}; } catch (e) { return {}; } }
  function puedePreguntar() {
    if (!soportado() || !logueado() || permiso() !== 'default' || !est || !est.disponible || est.suscrito) return false;
    const p = preguntas();
    if ((p.n || 0) >= MAX_PREGUNTAS) return false;
    return !(p.t && Date.now() - p.t < ESPERA_NO);
  }
  /** Espera a que el jugador cierre la ventana del juego (resultado del evento, cuenta...) antes de preguntar. */
  function esperarCalma(maxMs) {
    const fin = Date.now() + (maxMs || 180000);
    return new Promise((ok) => {
      const mirar = () => {
        const ocupado = document.querySelector('#overlay.on') || hoja || document.hidden;
        if (!ocupado) { ok(true); return; }
        if (Date.now() > fin) { ok(false); return; }
        setTimeout(mirar, 700);
      };
      setTimeout(mirar, 1200);
    });
  }
  let preguntando = false;
  async function momentoExito(motivo) {
    if (preguntando) return;
    preguntando = true;
    try {
      if (!est) await refrescar().catch(() => null);
      if (!puedePreguntar()) return;
      if (!(await esperarCalma())) return;
      if (!puedePreguntar()) return;
      mostrarPrevio(motivo);
    } finally { preguntando = false; }
  }
  function mostrarPrevio(motivo) {
    const n = (est && est.max_dia) || 3;
    const h = abrirHoja(`<div class="push-camp">${CAMPANA}</div>
      <h3 id="push-previo-t">${esc(T(motivo === 'cuenta' ? 'pre_t_cuenta' : 'pre_t_estrellas'))}</h3>
      <p>${esc(T('pre_b'))}</p>
      <ul class="push-lista"><li>${esc(T('cat_obra'))}</li><li>${esc(T('cat_copa'))}</li><li>${esc(T('cat_buzon'))}</li></ul>
      <p class="push-nota">${esc(T('pre_nota', { n }))}</p>
      <div class="push-msg" id="push-previo-msg" role="status"></div>
      <div class="push-btns"><button class="push-b main" data-push="si">${esc(T('si'))}</button><button class="push-b" data-push="no">${esc(T('no'))}</button></div>`, 'push-previo');
    const p = preguntas();
    h.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-push]');
      if (!b) return;
      if (b.dataset.push === 'no') { LS.set(K_PREG, JSON.stringify({ n: (p.n || 0) + 1, t: Date.now() })); cerrarHoja(); return; }
      LS.set(K_PREG, JSON.stringify({ n: MAX_PREGUNTAS, t: Date.now() }));
      b.disabled = true;
      const msg = h.querySelector('#push-previo-msg');
      try {
        const r = await activar();
        msg.className = 'push-msg' + (r === 'ok' ? '' : ' mal');
        msg.textContent = r === 'ok' ? T('listo') : r === 'bloqueado' ? T('bloqueado') : '';
        setTimeout(cerrarHoja, r === 'ok' ? 1400 : r === 'bloqueado' ? 4000 : 0);
      } catch (err) { msg.className = 'push-msg mal'; msg.textContent = T('error'); b.disabled = false; }
    });
  }

  // ---------------------------------------------------------------- ajustes (botón en la tarjeta de la cuenta)
  async function abrirAjustes() {
    estilos();
    if (!soportado()) { abrirHoja(`<h3 id="push-ajustes-t">${esc(T('ajustes_t'))}</h3><p>${esc(T('no_soportado'))}</p><div class="push-btns"><button class="push-b" data-push="cerrar">${esc(T('cerrar'))}</button></div>`, 'push-ajustes'); hoja.addEventListener('click', (e) => { if (e.target.closest('[data-push="cerrar"]')) cerrarHoja(); }); return; }
    if (!logueado()) { abrirHoja(`<h3 id="push-ajustes-t">${esc(T('ajustes_t'))}</h3><p>${esc(T('entrar'))}</p><div class="push-btns"><button class="push-b" data-push="cerrar">${esc(T('cerrar'))}</button></div>`, 'push-ajustes'); hoja.addEventListener('click', (e) => { if (e.target.closest('[data-push="cerrar"]')) cerrarHoja(); }); return; }
    try { await refrescar(); } catch (e) { /* se muestra con lo que haya */ }
    pintarAjustes();
  }
  function pintarAjustes(mensaje, mal) {
    const on = !!(est && est.suscrito) && permiso() === 'granted';
    const cats = (est && est.categorias) || {};
    const bloq = permiso() === 'denied';
    const filas = CATS.map((c) => `<label class="push-fila"><span>${esc(T('cat_' + c))}</span><span class="push-sw"><input type="checkbox" data-cat="${c}" ${cats[c] ? 'checked' : ''} ${on ? '' : 'disabled'} aria-label="${esc(T('cat_' + c))}"><i></i></span></label>`).join('');
    const h = abrirHoja(`<div class="push-camp">${CAMPANA}</div>
      <h3 id="push-ajustes-t">${esc(T('ajustes_t'))}</h3>
      <span class="push-estado ${on ? 'on' : ''}" id="push-estado">${esc(T(on ? 'activo' : 'inactivo'))}</span>
      ${bloq ? `<p class="push-nota">${esc(T('bloqueado'))}</p>` : ''}
      <div style="margin-top:10px">${filas}</div>
      <p class="push-nota">${esc(T('nota', { n: (est && est.max_dia) || 3 }))}</p>
      <div class="push-msg ${mal ? 'mal' : ''}" id="push-ajustes-msg" role="status">${esc(mensaje || '')}</div>
      <div class="push-btns">
        ${on ? `<button class="push-b" data-push="apagar">${esc(T('desactivar'))}</button>` : `<button class="push-b main" data-push="activar" ${bloq || !(est && est.disponible) ? 'disabled' : ''}>${esc(T('activar'))}</button>`}
        <button class="push-b" data-push="cerrar">${esc(T('cerrar'))}</button></div>`, 'push-ajustes');
    h.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-push]');
      if (!b) return;
      if (b.dataset.push === 'cerrar') { cerrarHoja(); return; }
      b.disabled = true;
      try {
        if (b.dataset.push === 'activar') {
          LS.set(K_PREG, JSON.stringify({ n: MAX_PREGUNTAS, t: Date.now() }));
          const r = await activar();
          pintarAjustes(r === 'ok' ? T('listo') : r === 'bloqueado' ? T('bloqueado') : '', r !== 'ok');
        } else {
          await desactivar();
          await refrescar().catch(() => null);
          pintarAjustes();
        }
      } catch (err) { pintarAjustes(T('error'), true); }
    });
    h.addEventListener('change', async (e) => {
      const i = e.target.closest('input[data-cat]');
      if (!i) return;
      const s = await subActual();
      const msg = h.querySelector('#push-ajustes-msg');
      try {
        est = await pedir('/api/push/preferencias', { endpoint: s ? s.endpoint : '', categorias: { [i.dataset.cat]: i.checked } });
        msg.className = 'push-msg'; msg.textContent = T('guardado');
      } catch (err) { i.checked = !i.checked; msg.className = 'push-msg mal'; msg.textContent = T('error'); }
    });
  }

  // Botón "Notificaciones" junto a "Salir" en la tarjeta de la cuenta (sin tocar ui.js)
  function ponerBoton() {
    if (!soportado()) return;
    document.querySelectorAll('[data-act="salir"]').forEach((salir) => {
      const prev = salir.previousElementSibling;
      if (prev && prev.hasAttribute('data-push-ajustes')) return;
      const b = document.createElement('button');
      b.className = 'btn sm';
      b.type = 'button';
      b.setAttribute('data-push-ajustes', '1');
      b.innerHTML = CAMPANA.replace('width="28" height="28"', 'width="16" height="16"') + esc(T('ajustes_t'));
      salir.parentNode.insertBefore(b, salir);
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-push-ajustes]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    abrirAjustes();
  }, true);

  // ---------------------------------------------------------------- ganchos (sin tocar ui.js)
  function enganchar() {
    const G = root.Game;
    if (G && typeof G.finishEvent === 'function' && !G.finishEvent.__push) {
      const orig = G.finishEvent;
      const env = function () {
        const r = orig.apply(this, arguments);
        try { const x = r && (r.result || r); if (r && r.ok !== false && x && x.stars === 5 && !(arguments[0] && arguments[0].intento)) setTimeout(() => momentoExito('estrellas'), 0); } catch (e) { /* nada */ }
        return r;
      };
      env.__push = true;
      G.finishEvent = env;
    }
    const A = root.Api;
    if (A && typeof A.registro === 'function' && !A.registro.__push) {
      const orig = A.registro;
      A.registro = async function () {
        const r = await orig.apply(this, arguments);
        setTimeout(() => { refrescar().catch(() => null).then(() => momentoExito('cuenta')); }, 0);
        return r;
      };
      A.registro.__push = true;
    }
    if (A && typeof A.salir === 'function' && !A.salir.__push) {
      const orig = A.salir;
      A.salir = async function () {
        try { if (est && est.suscrito) await desactivar(); } catch (e) { /* igual sale */ }
        est = null;
        return orig.apply(this, arguments);
      };
      A.salir.__push = true;
    }
    if (A && typeof A.entrar === 'function' && !A.entrar.__push) {
      const orig = A.entrar;
      A.entrar = async function () {
        const r = await orig.apply(this, arguments);
        setTimeout(() => { refrescar().catch(() => null); }, 0);
        return r;
      };
      A.entrar.__push = true;
    }
  }

  function arrancar() {
    enganchar();
    try { new MutationObserver(() => ponerBoton()).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* sin observador */ }
    ponerBoton();
    // Cuando llega el estado de la cuenta: sincroniza este aparato (nunca pregunta aquí: abrir el juego no es un momento de éxito)
    let n = 0;
    const esperar = () => {
      if (logueado()) { refrescar().catch(() => null); return; }
      if (++n < 40) setTimeout(esperar, 500);
    };
    esperar();
  }

  root.Push = { soportado, abrirAjustes, momentoExito, refrescar, activar, desactivar, estado: () => est, textos: TX, categorias: CATS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})(typeof window !== 'undefined' ? window : globalThis);
