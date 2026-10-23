/* =========================================================
   EN VIVO Tycoon — Premio diario (calendario de 7 días)
   Contrato: server/INTEGRAR_DIARIO.md (GET /api/diario, POST /api/diario/reclamar).
   - Con cuenta: el SERVIDOR decide (un reclamo por día de Ecuador, con su reloj). El dinero, los repuestos y los materiales
     llegan como entregas (ctx.alReclamar las aplica) y los créditos al monedero. Si el servidor no tiene la ruta (404),
     se juega como invitado (sin créditos).
   - Invitado (sin cuenta o sin servidor): en este celular, por el día del calendario del celular, un reclamo por día.
     Dinero y repuestos a la partida, materiales a la sede (si está js/sede.js). Nunca créditos.
   - Faltar un día no reinicia nada: el avance se pausa ("Día 3 de 7" sigue en el 3).
   - VIP 3 o más: el dinero sale doble (el servidor lo calcula; como invitado se lee window.Vip / Api.estado.vip_nivel).
   - Tarjeta de Inicio (window.EnVivoInicio, id 'diario', orden 2): 7 casillas, la de hoy brilla, un botón "Reclamar".
   - Aviso automático una vez por día al abrir, solo después de la guía, en Inicio y sin otra ventana abierta
     (nunca durante la guía, un evento en vivo o un evento en línea). En pruebas automáticas no sale salvo
     window.__ENVIVO_DIARIO_AVISO = true. window.__ENVIVO_FECHA = 'AAAA-MM-DD' fija el día del invitado (pruebas).
   - Esta pantalla usa la fecha del celular solo aquí (nunca en las reglas de js/logic.js).
   API: window.Diario = { tarjeta, clic, abrir, avisar, titulo, PREMIOS, TRAD, t, estadoLocal, estadoDe, reclamarLocal, olvidar }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'diario';
  const KEY = 'envivo_diario_v1';
  const DIAS = 7;
  const VIP_DOBLE = 3;

  /* ---------- Premios fijos (la misma tabla que Diario::PREMIOS en server/src/Diario.php) ---------- */
  const PREMIOS = [
    { dinero: 300, consumibles: {}, materiales: {}, creditos: 0, grande: false },
    { dinero: 600, consumibles: { cable: 2 }, materiales: { cables: 4 }, creditos: 5, grande: true },
    { dinero: 350, consumibles: { battery: 1 }, materiales: {}, creditos: 0, grande: false },
    { dinero: 400, consumibles: {}, materiales: { cables: 3, placas: 2 }, creditos: 0, grande: false },
    { dinero: 450, consumibles: { battery: 2 }, materiales: {}, creditos: 0, grande: false },
    { dinero: 500, consumibles: {}, materiales: { paneles: 2, chips: 1 }, creditos: 0, grande: false },
    { dinero: 1000, consumibles: { cable: 2, battery: 2 }, materiales: { cables: 5, placas: 4, paneles: 3, chips: 2 }, creditos: 20, grande: true }
  ];

  /* ---------- Textos (español primero; 9 idiomas más) ---------- */
  const TRAD = {
    es: { titulo: 'Premio diario', dia_de: 'Día {n} de {t}', dia: 'Día {n}', hoy: 'Hoy', grande: '¡Grande!', espera: '¡Tu premio te espera!',
      listo: 'Listo por hoy', reclamar: 'Reclamar', manana: 'Vuelve mañana · {t}', recibes: 'Hoy recibes:', manana_recibes: 'Mañana:',
      pausa: 'Si faltas un día no pierdes nada: sigues donde ibas.', recibiste: '¡Recibiste el premio del día {n}!', genial: '¡Genial!',
      mas_tarde: 'Más tarde', cerrar: 'Cerrar', creditos: '{n} créditos', con_cuenta: 'Con cuenta: +{n} créditos', vip: 'VIP {n}: dinero doble',
      cargando: 'Cargando tu premio…', error: 'Sin conexión. Intenta de nuevo.', reintentar: 'Intentar de nuevo', ya: 'Ya reclamaste hoy. Vuelve mañana.',
      t_h: '{h} h {m} min', t_m: '{m} min', cable: 'Cable de repuesto', battery: 'Batería', 'mat.cables': 'Cables y conectores', 'mat.placas': 'Placas electrónicas',
      'mat.paneles': 'Paneles LED', 'mat.credenciales': 'Credenciales de prensa', 'mat.planos': 'Planos técnicos', 'mat.chips': 'Chips 4K',
      log: 'Premio diario (día {n}): {r}' },
    en: { titulo: 'Daily reward', dia_de: 'Day {n} of {t}', dia: 'Day {n}', hoy: 'Today', grande: 'Big!', espera: 'Your reward is waiting!',
      listo: 'Done for today', reclamar: 'Claim', manana: 'Come back tomorrow · {t}', recibes: 'Today you get:', manana_recibes: 'Tomorrow:',
      pausa: 'Miss a day and you lose nothing: you pick up where you left off.', recibiste: 'You got the day {n} reward!', genial: 'Great!',
      mas_tarde: 'Later', cerrar: 'Close', creditos: '{n} credits', con_cuenta: 'With an account: +{n} credits', vip: 'VIP {n}: double money',
      cargando: 'Loading your reward…', error: 'No connection. Try again.', reintentar: 'Try again', ya: 'Already claimed today. Come back tomorrow.',
      t_h: '{h} h {m} min', t_m: '{m} min', cable: 'Spare cable', battery: 'Battery', 'mat.cables': 'Cables & connectors', 'mat.placas': 'Circuit boards',
      'mat.paneles': 'LED panels', 'mat.credenciales': 'Press passes', 'mat.planos': 'Blueprints', 'mat.chips': '4K chips',
      log: 'Daily reward (day {n}): {r}' },
    'pt-BR': { titulo: 'Prêmio diário', dia_de: 'Dia {n} de {t}', dia: 'Dia {n}', hoy: 'Hoje', grande: 'Grande!', espera: 'Seu prêmio está esperando!',
      listo: 'Feito por hoje', reclamar: 'Resgatar', manana: 'Volte amanhã · {t}', recibes: 'Hoje você ganha:', manana_recibes: 'Amanhã:',
      pausa: 'Se faltar um dia, não perde nada: continua de onde parou.', recibiste: 'Você ganhou o prêmio do dia {n}!', genial: 'Legal!',
      mas_tarde: 'Mais tarde', cerrar: 'Fechar', creditos: '{n} créditos', con_cuenta: 'Com conta: +{n} créditos', vip: 'VIP {n}: dinheiro em dobro',
      cargando: 'Carregando seu prêmio…', error: 'Sem conexão. Tente de novo.', reintentar: 'Tentar de novo', ya: 'Você já resgatou hoje. Volte amanhã.',
      t_h: '{h} h {m} min', t_m: '{m} min', cable: 'Cabo reserva', battery: 'Bateria', 'mat.cables': 'Cabos e conectores', 'mat.placas': 'Placas eletrônicas',
      'mat.paneles': 'Painéis de LED', 'mat.credenciales': 'Credenciais de imprensa', 'mat.planos': 'Plantas técnicas', 'mat.chips': 'Chips 4K',
      log: 'Prêmio diário (dia {n}): {r}' },
    fr: { titulo: 'Cadeau du jour', dia_de: 'Jour {n} sur {t}', dia: 'Jour {n}', hoy: 'Aujourd’hui', grande: 'Gros !', espera: 'Ton cadeau t’attend !',
      listo: 'Fini pour aujourd’hui', reclamar: 'Récupérer', manana: 'Reviens demain · {t}', recibes: 'Aujourd’hui :', manana_recibes: 'Demain :',
      pausa: 'Si tu rates un jour, tu ne perds rien : tu reprends où tu en étais.', recibiste: 'Tu as reçu le cadeau du jour {n} !', genial: 'Super !',
      mas_tarde: 'Plus tard', cerrar: 'Fermer', creditos: '{n} crédits', con_cuenta: 'Avec un compte : +{n} crédits', vip: 'VIP {n} : argent doublé',
      cargando: 'Chargement de ton cadeau…', error: 'Pas de connexion. Réessaie.', reintentar: 'Réessayer', ya: 'Déjà récupéré aujourd’hui. Reviens demain.',
      t_h: '{h} h {m} min', t_m: '{m} min', cable: 'Câble de rechange', battery: 'Batterie', 'mat.cables': 'Câbles et connecteurs', 'mat.placas': 'Cartes électroniques',
      'mat.paneles': 'Panneaux LED', 'mat.credenciales': 'Accréditations presse', 'mat.planos': 'Plans techniques', 'mat.chips': 'Puces 4K',
      log: 'Cadeau du jour (jour {n}) : {r}' },
    de: { titulo: 'Tagesbelohnung', dia_de: 'Tag {n} von {t}', dia: 'Tag {n}', hoy: 'Heute', grande: 'Groß!', espera: 'Deine Belohnung wartet!',
      listo: 'Für heute erledigt', reclamar: 'Abholen', manana: 'Komm morgen wieder · {t}', recibes: 'Heute bekommst du:', manana_recibes: 'Morgen:',
      pausa: 'Verpasst du einen Tag, verlierst du nichts: Es geht dort weiter.', recibiste: 'Du hast die Belohnung von Tag {n}!', genial: 'Super!',
      mas_tarde: 'Später', cerrar: 'Schließen', creditos: '{n} Credits', con_cuenta: 'Mit Konto: +{n} Credits', vip: 'VIP {n}: doppeltes Geld',
      cargando: 'Belohnung wird geladen…', error: 'Keine Verbindung. Versuch es noch mal.', reintentar: 'Nochmal versuchen', ya: 'Heute schon abgeholt. Komm morgen wieder.',
      t_h: '{h} Std. {m} Min.', t_m: '{m} Min.', cable: 'Ersatzkabel', battery: 'Akku', 'mat.cables': 'Kabel & Stecker', 'mat.placas': 'Platinen',
      'mat.paneles': 'LED-Panels', 'mat.credenciales': 'Presseausweise', 'mat.planos': 'Baupläne', 'mat.chips': '4K-Chips',
      log: 'Tagesbelohnung (Tag {n}): {r}' },
    it: { titulo: 'Premio del giorno', dia_de: 'Giorno {n} di {t}', dia: 'Giorno {n}', hoy: 'Oggi', grande: 'Grande!', espera: 'Il tuo premio ti aspetta!',
      listo: 'Fatto per oggi', reclamar: 'Riscatta', manana: 'Torna domani · {t}', recibes: 'Oggi ricevi:', manana_recibes: 'Domani:',
      pausa: 'Se salti un giorno non perdi niente: riparti da dove eri.', recibiste: 'Hai ricevuto il premio del giorno {n}!', genial: 'Ottimo!',
      mas_tarde: 'Più tardi', cerrar: 'Chiudi', creditos: '{n} crediti', con_cuenta: 'Con un account: +{n} crediti', vip: 'VIP {n}: soldi doppi',
      cargando: 'Carico il tuo premio…', error: 'Nessuna connessione. Riprova.', reintentar: 'Riprova', ya: 'Già riscattato oggi. Torna domani.',
      t_h: '{h} h {m} min', t_m: '{m} min', cable: 'Cavo di ricambio', battery: 'Batteria', 'mat.cables': 'Cavi e connettori', 'mat.placas': 'Schede elettroniche',
      'mat.paneles': 'Pannelli LED', 'mat.credenciales': 'Accrediti stampa', 'mat.planos': 'Progetti tecnici', 'mat.chips': 'Chip 4K',
      log: 'Premio del giorno (giorno {n}): {r}' },
    ru: { titulo: 'Ежедневная награда', dia_de: 'День {n} из {t}', dia: 'День {n}', hoy: 'Сегодня', grande: 'Большая!', espera: 'Награда ждёт тебя!',
      listo: 'На сегодня всё', reclamar: 'Забрать', manana: 'Приходи завтра · {t}', recibes: 'Сегодня ты получишь:', manana_recibes: 'Завтра:',
      pausa: 'Пропустил день — ничего не теряешь: продолжишь с того же места.', recibiste: 'Награда дня {n} получена!', genial: 'Отлично!',
      mas_tarde: 'Позже', cerrar: 'Закрыть', creditos: '{n} кредитов', con_cuenta: 'С аккаунтом: +{n} кредитов', vip: 'VIP {n}: двойные деньги',
      cargando: 'Загружаем награду…', error: 'Нет связи. Попробуй ещё раз.', reintentar: 'Ещё раз', ya: 'Сегодня уже забрано. Приходи завтра.',
      t_h: '{h} ч {m} мин', t_m: '{m} мин', cable: 'Запасной кабель', battery: 'Аккумулятор', 'mat.cables': 'Кабели и разъёмы', 'mat.placas': 'Платы',
      'mat.paneles': 'LED-панели', 'mat.credenciales': 'Пресс-карты', 'mat.planos': 'Чертежи', 'mat.chips': 'Чипы 4K',
      log: 'Ежедневная награда (день {n}): {r}' },
    tr: { titulo: 'Günlük ödül', dia_de: 'Gün {n} / {t}', dia: 'Gün {n}', hoy: 'Bugün', grande: 'Büyük!', espera: 'Ödülün seni bekliyor!',
      listo: 'Bugünlük tamam', reclamar: 'Al', manana: 'Yarın gel · {t}', recibes: 'Bugün alacakların:', manana_recibes: 'Yarın:',
      pausa: 'Bir gün kaçırırsan bir şey kaybetmezsin: kaldığın yerden devam.', recibiste: '{n}. gün ödülünü aldın!', genial: 'Harika!',
      mas_tarde: 'Sonra', cerrar: 'Kapat', creditos: '{n} kredi', con_cuenta: 'Hesapla: +{n} kredi', vip: 'VIP {n}: çifte para',
      cargando: 'Ödülün yükleniyor…', error: 'Bağlantı yok. Tekrar dene.', reintentar: 'Tekrar dene', ya: 'Bugün zaten aldın. Yarın gel.',
      t_h: '{h} sa {m} dk', t_m: '{m} dk', cable: 'Yedek kablo', battery: 'Pil', 'mat.cables': 'Kablo ve konektör', 'mat.placas': 'Devre kartı',
      'mat.paneles': 'LED panel', 'mat.credenciales': 'Basın kartı', 'mat.planos': 'Teknik çizim', 'mat.chips': '4K çip',
      log: 'Günlük ödül ({n}. gün): {r}' },
    id: { titulo: 'Hadiah harian', dia_de: 'Hari {n} dari {t}', dia: 'Hari {n}', hoy: 'Hari ini', grande: 'Besar!', espera: 'Hadiahmu menunggu!',
      listo: 'Selesai untuk hari ini', reclamar: 'Ambil', manana: 'Kembali besok · {t}', recibes: 'Hari ini kamu dapat:', manana_recibes: 'Besok:',
      pausa: 'Lewat sehari tidak apa-apa: kamu lanjut dari posisi terakhir.', recibiste: 'Kamu dapat hadiah hari {n}!', genial: 'Mantap!',
      mas_tarde: 'Nanti', cerrar: 'Tutup', creditos: '{n} kredit', con_cuenta: 'Dengan akun: +{n} kredit', vip: 'VIP {n}: uang ganda',
      cargando: 'Memuat hadiahmu…', error: 'Tidak ada koneksi. Coba lagi.', reintentar: 'Coba lagi', ya: 'Sudah diambil hari ini. Kembali besok.',
      t_h: '{h} j {m} mnt', t_m: '{m} mnt', cable: 'Kabel cadangan', battery: 'Baterai', 'mat.cables': 'Kabel & konektor', 'mat.placas': 'Papan sirkuit',
      'mat.paneles': 'Panel LED', 'mat.credenciales': 'Kartu pers', 'mat.planos': 'Cetak biru', 'mat.chips': 'Chip 4K',
      log: 'Hadiah harian (hari {n}): {r}' },
    'zh-CN': { titulo: '每日奖励', dia_de: '第 {n} 天 / 共 {t} 天', dia: '第 {n} 天', hoy: '今天', grande: '大奖！', espera: '你的奖励在等你！',
      listo: '今天已领取', reclamar: '领取', manana: '明天再来 · {t}', recibes: '今天可得：', manana_recibes: '明天：',
      pausa: '漏掉一天也不会损失：从上次的地方继续。', recibiste: '你领到了第 {n} 天的奖励！', genial: '太好了！',
      mas_tarde: '稍后', cerrar: '关闭', creditos: '{n} 点数', con_cuenta: '有账号：+{n} 点数', vip: 'VIP {n}：金钱翻倍',
      cargando: '正在加载奖励…', error: '没有网络，请重试。', reintentar: '重试', ya: '今天已经领过了，明天再来。',
      t_h: '{h} 小时 {m} 分', t_m: '{m} 分', cable: '备用线缆', battery: '电池', 'mat.cables': '线缆和接头', 'mat.placas': '电路板',
      'mat.paneles': 'LED 面板', 'mat.credenciales': '记者证', 'mat.planos': '技术图纸', 'mat.chips': '4K 芯片',
      log: '每日奖励（第 {n} 天）：{r}' }
  };
  const idioma = () => { try { const c = root.I18N && root.I18N.idioma; return c && TRAD[c] ? c : 'es'; } catch (e) { return 'es'; } };
  function t(k, p) {
    const d = TRAD[idioma()];
    let s = d && Object.prototype.hasOwnProperty.call(d, k) ? d[k] : TRAD.es[k];
    if (s === undefined) s = k;
    return p ? String(s).replace(/\{(\w+)\}/g, (m, x) => (p[x] === undefined || p[x] === null ? m : String(p[x]))) : String(s);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Fecha del celular (solo aquí; las reglas nunca la ven) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function hoyLocal() {
    try { if (typeof root.__ENVIVO_FECHA === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(root.__ENVIVO_FECHA)) return root.__ENVIVO_FECHA; } catch (e) { /* nada */ }
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function segHastaMedianoche() {
    const d = new Date(), m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return Math.max(0, Math.round((m - d) / 1000));
  }
  function ayer(dia) {
    const [y, m, d] = dia.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d - 1));
    return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate());
  }

  /* ---------- Almacén del invitado (este celular) ---------- */
  const lsGet = (k) => { try { const v = root.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio o modo privado */ } };
  function limpio(v) {
    const o = v && typeof v === 'object' ? v : {};
    const ent = (x, min, max, def) => { const n = Math.floor(Number(x)); return Number.isFinite(n) && n >= min && n <= max ? n : def; };
    return { paso: ent(o.paso, 0, DIAS - 1, 0), ciclo: ent(o.ciclo, 1, 1e6, 1), total: ent(o.total, 0, 1e7, 0), racha: ent(o.racha, 0, 1e7, 0),
      ultimo: typeof o.ultimo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.ultimo) ? o.ultimo : null,
      aviso: typeof o.aviso === 'string' ? o.aviso : null };
  }
  const estadoLocal = () => limpio(lsGet(KEY));
  const guardarLocal = (st) => lsSet(KEY, st);

  /* ---------- Reglas del calendario (iguales a las del servidor) ---------- */
  function premioDe(paso, vip, op) {
    op = op || {};
    const p = PREMIOS[paso - 1] || PREMIOS[0];
    const doble = (vip || 0) >= VIP_DOBLE;
    return { dia: paso, dinero: p.dinero * (doble ? 2 : 1), dinero_base: p.dinero, consumibles: Object.assign({}, p.consumibles),
      materiales: op.sinMateriales ? {} : Object.assign({}, p.materiales), creditos: p.creditos, grande: p.grande, vip_doble: doble };
  }
  // Mismo formato que GET /api/diario (así la pantalla es una sola para invitado y cuenta)
  function estadoDe(st, hoy, vip, op) {
    st = limpio(st);
    const hecho = !!st.ultimo && st.ultimo >= hoy;   // >= : si el reloj del celular volvió atrás, no se cobra otra vez
    const lleno = hecho && st.paso === 0 && st.total > 0;
    const hechos = lleno ? DIAS : st.paso;
    const dia = hecho ? hechos : st.paso + 1;
    const premios = [];
    for (let d = 1; d <= DIAS; d++) {
      const e = d <= hechos ? 'reclamado' : (!hecho && d === dia ? 'hoy' : (hecho && d === hechos + 1 ? 'siguiente' : 'bloqueado'));
      premios.push(Object.assign(premioDe(d, vip, op), { estado: e }));
    }
    return { ok: true, hoy, reclamado_hoy: hecho, dia, dias: DIAS, ciclo: st.ciclo - (lleno ? 1 : 0), total: st.total, racha: st.racha, ultimo_dia: st.ultimo,
      vip_nivel: vip || 0, vip_doble: (vip || 0) >= VIP_DOBLE, vip_doble_desde: VIP_DOBLE, premios, local: true,
      quedan_seg: segHastaMedianoche() };
  }
  // Avanza el calendario del invitado. Devuelve { st, paso } o null si hoy ya se reclamó.
  function reclamarLocal(st, hoy) {
    st = limpio(st);
    if (st.ultimo && st.ultimo >= hoy) return null;
    const paso = st.paso + 1;
    const racha = st.ultimo === ayer(hoy) ? st.racha + 1 : 1;
    const nuevo = Object.assign({}, st, { paso: paso >= DIAS ? 0 : paso, ciclo: paso >= DIAS ? st.ciclo + 1 : st.ciclo, total: st.total + 1, racha, ultimo: hoy });
    return { st: nuevo, paso };
  }

  /* ---------- Estado de la pantalla ---------- */
  const srv = { datos: null, cargando: false, cargadoEn: 0, error: '', errorEn: 0, noDisponible: false, cuenta: null, reclamando: false };
  let ctxUlt = null, reloj = null, avisoHecho = false;
  let ultimoModal = Date.now();   // el aviso espera unos segundos tranquilos (sin otra ventana) antes de salir
  const CALMA_MS = 3000;
  const ApiDe = (ctx) => (ctx && ctx.Api) || root.Api || null;
  const conCuenta = (ctx) => { try { const A = ApiDe(ctx); return !!(A && A.disponible === true && typeof A.logueado === 'function' && A.logueado()); } catch (e) { return false; } };
  const cuentaId = (ctx) => { try { const j = ApiDe(ctx).estado.jugador; return j && j.id != null ? String(j.id) : '?'; } catch (e) { return '?'; } };
  const modo = (ctx) => (conCuenta(ctx) && !srv.noDisponible ? 'cuenta' : 'local');
  const partida = (ctx) => { try { return typeof ctx.S === 'function' ? ctx.S() : ctx.estado && typeof ctx.estado === 'object' ? ctx.estado : (typeof ctx.estado === 'function' ? ctx.estado() : root.__game && root.__game.state); } catch (e) { return null; } };
  function vipLocal(ctx) {
    if (!conCuenta(ctx)) return 0;
    try {
      const d = root.Vip && root.Vip.datos;
      const n = Number(d && d.nivel != null ? d.nivel : (ApiDe(ctx).estado || {}).vip_nivel);
      return Number.isFinite(n) ? n : 0;
    } catch (e) { return 0; }
  }
  // Invitado: materiales solo si está la sede de este celular (con cuenta van por el servidor)
  const sedeLocal = (ctx) => !!root.Sede && !conCuenta(ctx);
  async function pedir(ctx, metodo, ruta, cuerpo) {
    if (ctx && typeof ctx.pedir === 'function') return ctx.pedir(metodo, ruta, cuerpo);
    const r = await fetch(ruta, { method: metodo, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' },
      body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok || !j || j.ok === false) { const e = new Error((j && j.error) || t('error')); e.status = r.status; e.codigo = j && j.codigo; throw e; }
    return j;
  }
  function mismaCuenta(ctx) {
    const c = conCuenta(ctx) ? cuentaId(ctx) : null;
    if (c !== srv.cuenta) Object.assign(srv, { datos: null, cargando: false, cargadoEn: 0, error: '', errorEn: 0, noDisponible: false, cuenta: c });
  }
  async function cargar(ctx) {
    if (srv.cargando) return srv.datos;
    srv.cargando = true;
    try {
      const r = await pedir(ctx, 'GET', '/api/diario');
      // Respuesta sin la forma esperada (servidor viejo o de pruebas): se juega como invitado, sin romper Inicio
      if (!r || !Array.isArray(r.premios) || !r.premios.length || !Number.isFinite(Number(r.dia))) { srv.noDisponible = true; srv.datos = null; }
      else srv.datos = r;
      srv.cargadoEn = Date.now(); srv.error = '';
    } catch (e) {
      if (e && e.status === 404) srv.noDisponible = true;   // servidor sin el módulo: se juega como invitado
      else { srv.error = t('error'); srv.errorEn = Date.now(); }
    } finally { srv.cargando = false; }
    return srv.datos;
  }
  function refrescarLuego(ctx) {
    cargar(ctx).then(() => { try { if (ctx && typeof ctx.render === 'function') ctx.render(); } catch (e) { /* nada */ } }).catch(() => {});
  }
  // Estado a mostrar ahora (null = cargando con cuenta)
  function datos(ctx) {
    mismaCuenta(ctx);
    if (modo(ctx) === 'local') return estadoDe(estadoLocal(), hoyLocal(), vipLocal(ctx), { sinMateriales: !sedeLocal(ctx) });
    const d = srv.datos;
    const viejo = !d || Date.now() - srv.cargadoEn > 5 * 60000 || (d.quedan_seg != null && Date.now() - srv.cargadoEn > d.quedan_seg * 1000);
    if (viejo && !srv.cargando && Date.now() - srv.errorEn > 30000) refrescarLuego(ctx);
    return d;
  }
  function quedan(d) {
    if (!d) return 0;
    if (d.local) return segHastaMedianoche();
    return Math.max(0, (d.quedan_seg || 0) - Math.round((Date.now() - srv.cargadoEn) / 1000));
  }
  function tiempo(seg) {
    const h = Math.floor(seg / 3600), m = Math.max(1, Math.ceil((seg % 3600) / 60));
    return h > 0 ? t('t_h', { h, m: m === 60 ? 59 : m }) : t('t_m', { m });
  }

  /* ---------- Textos de un premio ---------- */
  const money = (ctx, n) => { try { if (ctx && typeof ctx.M === 'function') return ctx.M(n); } catch (e) { /* nada */ } return '$' + Math.round(n).toLocaleString('es-EC'); };
  const icon = (ctx, n, cls) => { try { const A = (ctx && ctx.A) || root.Art; if (A && A.icon) return A.icon(n, cls || 'sm'); } catch (e) { /* nada */ } return ''; };
  function partes(ctx, p, op) {
    op = op || {};
    const xs = [money(ctx, p.dinero)];
    Object.keys(p.consumibles || {}).forEach((k) => { if (p.consumibles[k] > 0) xs.push(p.consumibles[k] + ' × ' + t(k)); });
    Object.keys(p.materiales || {}).forEach((k) => { if (p.materiales[k] > 0) xs.push(p.materiales[k] + ' × ' + t('mat.' + k)); });
    if (p.creditos > 0 && op.creditos) xs.push(t('creditos', { n: p.creditos }));
    return xs;
  }

  /* ---------- Estilos (una vez) ---------- */
  function estilos() {
    if (!root.document || document.getElementById('diario-css')) return;
    const s = document.createElement('style');
    s.id = 'diario-css';
    s.textContent = `
.dr-card h3{font-size:19px;margin:2px 0 0}
.dr-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 6px;margin:14px 0 8px}
.dr-t{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:78px;padding:7px 3px 6px;border-radius:12px;background:var(--panel2,#1e2430);border:1px solid var(--line,#2a3242);text-align:center;min-width:0}
.dr-t .dr-d{font:700 11px/1 var(--f-head,sans-serif);letter-spacing:.5px;text-transform:uppercase;color:var(--muted,#8b95a8)}
.dr-t .dr-v{font:700 14px/1.1 var(--f-mono,monospace);font-variant-numeric:tabular-nums;white-space:nowrap}
.dr-t .dr-ic{color:var(--green,#2ecc71);line-height:0}
.dr-t .dr-ic .ico{width:22px;height:22px}
.dr-t .dr-x{display:flex;gap:2px;justify-content:center;flex-wrap:wrap;color:var(--blue,#4da3ff);line-height:0;min-height:14px}
.dr-t .dr-x .ico{width:14px;height:14px}
.dr-t .dr-x .gem{color:#7fd4ff}
.dr-t.grande{padding-top:13px;border-color:#ffb02088;background:linear-gradient(180deg,#2a2412,var(--panel2,#1e2430))}
.dr-t.grande .dr-d{color:var(--amber,#ffb020)}
.dr-t.d7{grid-column:span 2;min-height:78px}
.dr-t.d7 .dr-ic .ico{width:28px;height:28px}
.dr-t.d7 .dr-v{font-size:17px}
.dr-t .dr-cinta{position:absolute;z-index:2;top:-9px;inset-inline-end:-3px;background:var(--amber,#ffb020);color:#2a1a00;font:800 10px/1 var(--f-head,sans-serif);padding:3px 6px;border-radius:8px;letter-spacing:.3px;text-transform:uppercase}
.dr-t.reclamado{opacity:.55}
.dr-t.reclamado::after{content:"";position:absolute;inset:0;border-radius:12px;background:#0d0f1466}
.dr-t .dr-ok{position:absolute;z-index:1;top:50%;left:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:var(--green,#2ecc71);color:#06210f;display:grid;place-items:center}
.dr-t .dr-ok .ico{width:18px;height:18px;stroke-width:3}
.dr-t.hoy{border:2px solid var(--amber,#ffb020);box-shadow:0 0 0 2px #ffb02033,0 0 18px 2px #ffb02088;animation:drBrillo 1.6s ease-in-out infinite}
.dr-t.hoy .dr-d{color:var(--amber,#ffb020)}
.dr-t.siguiente{border-style:dashed;border-color:#ffb02099}
@keyframes drBrillo{0%,100%{box-shadow:0 0 0 2px #ffb02033,0 0 10px 0 #ffb02066}50%{box-shadow:0 0 0 3px #ffb02055,0 0 22px 4px #ffb020aa}}
@media (prefers-reduced-motion: reduce){.dr-t.hoy{animation:none}}
.dr-hoy{margin:2px 0 0;font-size:13.5px;line-height:1.4}
.dr-hoy b{color:var(--amber,#ffb020)}
.dr-pausa{margin:6px 0 0}
.dr-vip{display:inline-block;margin-top:6px;font-size:12px;font-weight:700;color:#2a1a00;background:var(--amber,#ffb020);padding:3px 8px;border-radius:999px}
.dr-btn{font-size:17px;padding:15px}
.dr-btn[disabled]{opacity:.75;cursor:default;background:var(--panel2,#1e2430);border-color:var(--line,#2a3242);color:var(--muted,#8b95a8)}
.dr-pop h2{font-size:24px}
.dr-fin{text-align:center;padding:8px 0 4px}
.dr-fin .dr-gran{width:64px;height:64px;margin:4px auto 8px;border-radius:50%;background:var(--green,#2ecc71);color:#06210f;display:grid;place-items:center;animation:drPop .45s ease-out}
.dr-fin .dr-gran .ico{width:36px;height:36px;stroke-width:2.6}
.dr-fin ul{list-style:none;padding:0;margin:10px 0 0;display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.dr-fin li{background:var(--panel2,#1e2430);border:1px solid var(--line,#2a3242);border-radius:999px;padding:5px 10px;font-size:14px;font-weight:700}
@keyframes drPop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion: reduce){.dr-fin .dr-gran{animation:none}}
@media (max-width:359px){.dr-t .dr-v{font-size:12.5px}.dr-t{min-height:72px}}`;
    document.head.appendChild(s);
  }

  /* ---------- Dibujo ---------- */
  function casilla(ctx, p, op) {
    const xs = [];
    Object.keys(p.consumibles).forEach((k) => { if (p.consumibles[k] > 0) xs.push(icon(ctx, k, 'sm')); });
    if (Object.keys(p.materiales).some((k) => p.materiales[k] > 0)) xs.push(icon(ctx, 'box', 'sm'));
    if (p.creditos > 0 && op.creditos) xs.push(`<span class="gem">${icon(ctx, 'gem', 'sm')}</span>`);
    const cls = ['dr-t', p.estado, p.grande ? 'grande' : '', p.dia === DIAS ? 'd7' : ''].filter(Boolean).join(' ');
    const lbl = p.estado === 'hoy' ? t('hoy') : t('dia', { n: p.dia });
    return `<div class="${cls}" data-dia="${p.dia}" aria-label="${esc(t('dia', { n: p.dia }) + ': ' + partes(ctx, p, op).join(', '))}">
      ${p.grande && p.estado !== 'reclamado' ? `<span class="dr-cinta">${esc(t('grande'))}</span>` : ''}
      <span class="dr-d">${esc(lbl)}</span>
      <span class="dr-ic">${icon(ctx, p.dia === DIAS ? 'gift' : 'money', 'sm')}</span>
      <b class="dr-v">${esc(money(ctx, p.dinero))}</b>
      <span class="dr-x">${xs.join('')}</span>
      ${p.estado === 'reclamado' ? `<span class="dr-ok">${icon(ctx, 'check', 'sm')}</span>` : ''}
    </div>`;
  }
  function cuerpo(ctx, d, donde) {
    const op = { creditos: !d.local };
    const p = d.premios[d.dia - 1];
    // Después de reclamar: lo de mañana (tras el día 7, el día 1 del ciclo nuevo)
    const sig = d.reclamado_hoy ? (d.dia >= DIAS ? d.premios[0] : d.premios[d.dia]) : null;
    const lista = d.reclamado_hoy ? partes(ctx, sig, op) : partes(ctx, p, op);
    const extraCuenta = d.local && !d.reclamado_hoy && p.creditos > 0 ? ` <span class="muted">· ${esc(t('con_cuenta', { n: p.creditos }))}</span>` : '';
    const boton = d.reclamado_hoy
      ? `<button class="btn dr-btn" disabled>${icon(ctx, 'clock', 'sm')} ${esc(t('manana', { t: tiempo(quedan(d)) }))}</button>`
      : `<button class="btn main dr-btn" data-ext="${ID}" data-acc="reclamar" data-donde="${donde}"${srv.reclamando ? ' disabled' : ''}>${icon(ctx, 'gift', 'sm')} ${esc(t('reclamar'))}</button>`;
    return `<div class="dr-grid">${d.premios.map((x) => casilla(ctx, x, op)).join('')}</div>
      <p class="dr-hoy"><b>${esc(d.reclamado_hoy ? t('manana_recibes') : t('recibes'))}</b> ${esc(lista.join(' · '))}${extraCuenta}</p>
      ${d.vip_doble ? `<span class="dr-vip">★ ${esc(t('vip', { n: d.vip_nivel }))}</span>` : ''}
      ${boton}
      <p class="small muted dr-pausa">${esc(t('pausa'))}</p>`;
  }
  function tarjeta(ctx) {
    ctxUlt = ctx;
    estilos();
    vigilar();
    const d = datos(ctx);
    if (!d) {
      return `<div class="card dr-card" data-diario="tarjeta"><div class="story-tag">${esc(t('titulo'))}</div>
        <p class="small muted" style="margin:6px 0 0">${esc(srv.error || t('cargando'))}</p>
        ${srv.error ? `<button class="btn sm" data-ext="${ID}" data-acc="recargar">${esc(t('reintentar'))}</button>` : ''}</div>`;
    }
    return `<div class="card dr-card" data-diario="tarjeta">
      <div class="story-tag">${esc(t('titulo'))}</div>
      <h3>${esc(t('dia_de', { n: d.dia, t: DIAS }))} · ${esc(d.reclamado_hoy ? t('listo') : t('espera'))}</h3>
      ${cuerpo(ctx, d, 'tarjeta')}</div>`;
  }
  function ventana(ctx, d) {
    return `<div class="dr-pop" data-diario="aviso">
      <div class="row between"><h2>${esc(t('titulo'))}</h2><button class="btn sm" data-act="close" aria-label="${esc(t('cerrar'))}">${icon(ctx, 'close', 'sm')}</button></div>
      <p class="small" style="margin:4px 0 0;color:var(--amber)">${esc(t('dia_de', { n: d.dia, t: DIAS }))} · ${esc(d.reclamado_hoy ? t('listo') : t('espera'))}</p>
      ${cuerpo(ctx, d, 'aviso')}
      ${d.reclamado_hoy ? '' : `<button class="btn" data-act="close">${esc(t('mas_tarde'))}</button>`}</div>`;
  }
  function final(ctx, p, conCred) {
    return `<div class="dr-pop dr-fin" data-diario="listo">
      <div class="dr-gran">${icon(ctx, 'check', 'sm')}</div>
      <h2>${esc(t('recibiste', { n: p.dia }))}</h2>
      <ul>${partes(ctx, p, { creditos: conCred }).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <button class="btn main dr-btn" data-act="close">${esc(t('genial'))}</button></div>`;
  }

  /* ---------- Reclamar ---------- */
  function sonar(ctx, n) { try { if (ctx && ctx.snd && typeof ctx.snd.play === 'function') ctx.snd.play(n); } catch (e) { /* sin sonido */ } }
  function anotar(S, texto) {
    try { if (S && Array.isArray(S.log)) { S.log.unshift({ day: S.day, text: '🎁 ' + texto }); if (S.log.length > 80) S.log.length = 80; } } catch (e) { /* nada */ }
  }
  // Invitado: aplica el premio a la partida por caminos seguros (dinero, repuestos y materiales de la sede local)
  function aplicarLocal(ctx, S, p) {
    if (!S || typeof S !== 'object') return false;
    S.money = (Number(S.money) || 0) + p.dinero;
    const G = (ctx && ctx.G) || root.Game || null;
    S.stock = S.stock && typeof S.stock === 'object' ? S.stock : {};
    Object.keys(p.consumibles).forEach((k) => {
      if (G && G.CONSUMABLES && !G.CONSUMABLES[k]) return;
      S.stock[k] = (Number(S.stock[k]) || 0) + p.consumibles[k];
    });
    const mats = Object.keys(p.materiales).filter((k) => p.materiales[k] > 0);
    if (mats.length && root.Sede) {
      try {
        if (!S.sede || !S.sede.materiales) root.Sede.migrar(S);
        const MATS = root.Sede.MATS || [];
        mats.forEach((k) => { if (!MATS.length || MATS.includes(k)) S.sede.materiales[k] = (Number(S.sede.materiales[k]) || 0) + p.materiales[k]; });
      } catch (e) { /* sin sede */ }
    }
    anotar(S, t('log', { n: p.dia, r: partes(ctx, p).join(', ') }));
    return true;
  }
  const modalAbierto = () => { try { const o = document.getElementById('overlay'); return !!(o && o.classList.contains('on')); } catch (e) { return false; } };
  const avisoAbierto = () => { try { return modalAbierto() && !!document.querySelector('#modal [data-diario]'); } catch (e) { return false; } };
  function mostrarFin(ctx, p, conCred, donde) {
    if (donde === 'aviso' && avisoAbierto() && typeof ctx.openModal === 'function') ctx.openModal(final(ctx, p, conCred));
    else if (typeof ctx.toast === 'function') ctx.toast(t('recibiste', { n: p.dia }) + ' ' + partes(ctx, p, { creditos: conCred }).join(' · '));
  }
  async function reclamar(ctx, donde) {
    if (srv.reclamando) return;
    if (modo(ctx) === 'local') {
      const S = partida(ctx);
      const hoy = hoyLocal();
      const st = estadoLocal();
      const r = reclamarLocal(st, hoy);
      if (!r || !S) { if (typeof ctx.toast === 'function') ctx.toast(t('ya')); sonar(ctx, 'error'); return; }
      const p = premioDe(r.paso, vipLocal(ctx), { sinMateriales: !sedeLocal(ctx) });
      aplicarLocal(ctx, S, p);
      r.st.aviso = hoy;
      guardarLocal(r.st);
      try { if (typeof ctx.save === 'function') ctx.save(); } catch (e) { /* nada */ }
      sonar(ctx, p.grande ? 'chapter' : 'good');
      mostrarFin(ctx, p, false, donde);
      try { if (typeof ctx.render === 'function') ctx.render(); } catch (e) { /* nada */ }
      return;
    }
    srv.reclamando = true;
    try { if (typeof ctx.render === 'function' && donde !== 'aviso') ctx.render(); } catch (e) { /* nada */ }
    let r = null;
    try {
      r = await pedir(ctx, 'POST', '/api/diario/reclamar', {});
    } catch (e) {
      srv.reclamando = false;
      if (e && e.status === 404) { srv.noDisponible = true; try { ctx.render(); } catch (x) { /* nada */ } return; }
      if (e && e.codigo === 'ya_reclamado') { await cargar(ctx); if (typeof ctx.toast === 'function') ctx.toast(t('ya')); }
      else if (typeof ctx.toast === 'function') ctx.toast((e && e.message) || t('error'));
      sonar(ctx, 'error');
      try { if (avisoAbierto() && srv.datos && typeof ctx.openModal === 'function') ctx.openModal(ventana(ctx, srv.datos)); } catch (x) { /* nada */ }
      try { if (typeof ctx.render === 'function') ctx.render(); } catch (x) { /* nada */ }
      return;
    }
    srv.reclamando = false;
    if (r.diario) { srv.datos = r.diario; srv.cargadoEn = Date.now(); }
    // En este celular también queda hecho el día (no se vuelve a cobrar como invitado hoy)
    try { const st = estadoLocal(); const h = hoyLocal(); if (!st.ultimo || st.ultimo < h) { st.ultimo = h; } st.aviso = h; guardarLocal(st); } catch (e) { /* nada */ }
    try { if (root.Api && r.creditos != null && root.Api.estado) root.Api.estado.creditos = r.creditos; } catch (e) { /* nada */ }
    const p = r.reclamado || premioDe(1, 0);
    sonar(ctx, p.grande ? 'chapter' : 'good');
    mostrarFin(ctx, p, true, donde);
    // Las entregas (dinero, repuestos, materiales) las aplica el juego al refrescar /api/estado
    try { if (typeof ctx.alReclamar === 'function') await ctx.alReclamar(); else if (typeof ctx.render === 'function') ctx.render(); } catch (e) { /* se aplica la próxima vez */ }
  }

  function clic(ctx, acc, el) {
    ctxUlt = ctx;
    if (acc === 'reclamar') { reclamar(ctx, (el && el.dataset && el.dataset.donde) || 'tarjeta'); return; }
    if (acc === 'recargar') { srv.errorEn = 0; srv.error = ''; refrescarLuego(ctx); try { ctx.render(); } catch (e) { /* nada */ } return; }
    if (acc === 'abrir') { abrir(ctx); }
  }

  /* ---------- Ventana (a mano o el aviso del día) ---------- */
  function abrir(ctx) {
    ctx = ctx || ctxUlt;
    if (!ctx || typeof ctx.openModal !== 'function') return false;
    estilos();
    const d = datos(ctx);
    if (!d) return false;
    ctx.openModal(ventana(ctx, d));
    return true;
  }
  // ¿Se puede mostrar el aviso automático ahora? (nada encima, en Inicio, después de la guía, sin evento en vivo)
  function puedeAvisar(ctx) {
    try {
      if (root.navigator && root.navigator.webdriver && root.__ENVIVO_DIARIO_AVISO !== true) return false;
      if (!root.document || document.visibilityState === 'hidden') return false;
      const A = ApiDe(ctx);
      if (A && A.disponible !== true && A.disponible !== false) return false;   // todavía no se sabe si hay cuenta
      if (modalAbierto()) { ultimoModal = Date.now(); return false; }
      if (Date.now() - ultimoModal < CALMA_MS) return false;
      const ini = document.getElementById('tab-inicio');
      if (!ini || !ini.classList.contains('on')) return false;
      if (root.Guia && typeof root.Guia.activa === 'function' && root.Guia.activa()) return false;
      if (document.querySelector('#pase-ov, #chat-panel:not([hidden]), #guia:not([hidden]) .g-ring')) return false;
      const S = partida(ctx);
      if (!S || S.currentEvent || S.gameOver || S.intento) return false;
      let guiaVista = false;
      try { guiaVista = !!root.localStorage.getItem((root.Guia && root.Guia.KEY) || 'envivo_guia_v1'); } catch (e) { guiaVista = false; }
      if (!guiaVista && !((S.stats && S.stats.events > 0) || S.storyDone || (S.chapter || 0) > 0)) return false;   // primero la guía
      return true;
    } catch (e) { return false; }
  }
  function avisar(ctx) {
    ctx = ctx || ctxUlt;
    if (!ctx || avisoHecho) return false;
    const d = datos(ctx);
    if (!d) return false;
    const hoy = d.local ? hoyLocal() : d.hoy;
    const st = estadoLocal();
    if (d.reclamado_hoy || st.aviso === hoy) { avisoHecho = d.reclamado_hoy || st.aviso === hoy; return false; }
    if (!puedeAvisar(ctx)) return false;
    st.aviso = hoy;
    guardarLocal(st);
    avisoHecho = true;
    sonar(ctx, 'tap');
    ctx.openModal(ventana(ctx, d));
    return true;
  }
  // Revisa cada pocos segundos: el aviso del día y el cambio de día (si el juego queda abierto pasada la medianoche)
  let diaVisto = null;
  function vigilar() {
    if (reloj || !root.setInterval) return;
    reloj = root.setInterval(() => {
      const ctx = ctxUlt;
      if (!ctx) return;
      try {
        if (modalAbierto()) ultimoModal = Date.now();
        const d = datos(ctx);
        const hoy = d ? (d.local ? hoyLocal() : d.hoy) : null;
        const cambio = d && d.reclamado_hoy && quedan(d) <= 0;
        if (cambio || (diaVisto && d && d.local && hoy !== diaVisto)) {
          avisoHecho = false;
          if (!d.local) srv.cargadoEn = 0;
          if (!modalAbierto() && typeof ctx.render === 'function') ctx.render();
        }
        diaVisto = hoy;
        avisar(ctx);
      } catch (e) { /* nada */ }
    }, 2500);
  }

  function olvidar() {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* nada */ }
    avisoHecho = false;
    Object.assign(srv, { datos: null, cargando: false, cargadoEn: 0, error: '', errorEn: 0, noDisponible: false, cuenta: null, reclamando: false });
  }

  const Diario = { ID, KEY, DIAS, VIP_DOBLE, PREMIOS, TRAD, t, titulo: () => t('titulo'), tarjeta, clic, abrir, avisar, puedeAvisar,
    estadoLocal, estadoDe, reclamarLocal, premioDe, hoyLocal, olvidar, get servidor() { return srv; } };
  root.Diario = Diario;
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: 2, tarjeta, clic });
  if (typeof module !== 'undefined' && module.exports) module.exports = Diario;
})(typeof window !== 'undefined' ? window : globalThis);
