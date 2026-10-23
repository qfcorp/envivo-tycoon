/* Arma las piezas de tienda y redes de EN VIVO Tycoon a partir de HTML/SVG propio,
   los dibujos del juego (js/art.js) y las capturas en crudo de capturar.js.
   Uso:  NODE_PATH=/opt/npm-tools/node_modules node assets/promo/src/componer.js [solo]
     solo = feature | screens | social | icon  (sin argumento: todo)
   Opcional: GAME_ROOT=<carpeta del juego> (de donde salen js/art.js e icons/icon.svg). */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const sharp = require('sharp');

const PROMO = path.resolve(__dirname, '..');
const ROOT = path.resolve(process.env.GAME_ROOT || path.join(PROMO, '..', '..'));
const RAW = path.resolve(process.env.RAW_DIR || path.join(__dirname, 'raw'));
// Capturas en crudo de cada idioma (capturar.js): raw/<idioma>/*.png + rects.json
const rawDir = (lang) => path.join(RAW, lang);
const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];
const LANGS = (process.env.PROMO_LANGS ? process.env.PROMO_LANGS.split(',') : IDIOMAS).map((x) => x.trim()).filter(Boolean);
const BUILD = path.join(require('os').tmpdir(), 'envivo-promo-build'); // HTML intermedio (no se guarda en el repo)
fs.mkdirSync(BUILD, { recursive: true });
const ONLY = process.argv[2] || '';

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;0,900;1,800&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Roboto+Condensed:wght@700;800&display=swap" rel="stylesheet">';
const SCRIPTS = ['js/datos.js', 'js/logic.js', 'js/art.js', 'js/premium.js'].map((f) => `<script src="file://${path.join(ROOT, f)}"></script>`).join('');
const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

const BASE_CSS = `
  :root{--bg:#0d0f14;--panel:#161a22;--line:#2a3242;--text:#e9edf5;--muted:#9aa4b8;--red:#ff3b3b;--amber:#ffb020;--blue:#4da3ff;--green:#2ecc71}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--text)}
  .D{font-family:"Barlow Condensed","Roboto Condensed","Noto Sans CJK SC","Arial Narrow",sans-serif}
  .B{font-family:"IBM Plex Sans","Noto Sans CJK SC",system-ui,sans-serif}
  .M{font-family:"JetBrains Mono",ui-monospace,monospace}
  .art svg{display:block;width:100%;height:100%;overflow:visible}
  .blink,.twinkle,.rays,.hover,.spin,.pulse,.flicker,.puff,.cloud,.jib,.fx-rain,.crowd,.beam,.bulb{animation:none!important}
  /* letrero al aire */
  .onair{display:inline-flex;align-items:center;background:linear-gradient(#ff5050,#e32626);color:#fff;border-radius:.16em;
    box-shadow:0 0 0 .045em #ff8a8a55 inset,0 .05em 0 #ffffff40 inset,0 0 .55em #ff3b3b88,0 0 1.6em #ff3b3b44;font-weight:800;letter-spacing:.04em;line-height:1}
  .onair i{display:block;width:.42em;height:.42em;border-radius:50%;background:#fff;box-shadow:0 0 .3em #fff;margin-right:.32em}
  .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,#ffffff06 0 1px,transparent 1px 4px)}
`;

/* Dibujo de equipo del juego sin el halo de rareza (para usarlo como objeto en escena) */
const ITEM_JS = `function itemSolo(type, size, opts) {
  return Art.item(type, size, Object.assign({ rarity: 'comun' }, opts || {}))
    .replace(/<circle cx="60" cy="58" r="58" fill="url\\(#am-glow-[a-z]+\\)"\\/>/, '')
    .replace(/<ellipse cx="60" cy="10\\d"[^>]*fill="url\\(#am-sh\\)"\\/>/, '');
}`;

async function render(page, html, file, w, h) {
  const tmp = path.join(BUILD, path.basename(file, '.png') + '.html');
  fs.writeFileSync(tmp, html);
  await page.setViewportSize({ width: w, height: h });
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { if (window.__fit) window.__fit(); });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  // PNG de 24 bits sin transparencia (lo que piden las tiendas para gráficos y capturas)
  await sharp(buf).flatten({ background: '#0d0f14' }).removeAlpha().png({ compressionLevel: 9 }).toFile(file);
  console.log('ok', path.relative(PROMO, file));
}

/* =========================================================
   Escena de estadio de noche (fondo compartido)
   ========================================================= */
function estadio(id, w, h, opts) {
  const o = Object.assign({ sceneTop: 0, sceneScale: 1, blur: 1.4, bright: 0.62, cones: true, haze: true }, opts || {});
  return `
  <div id="${id}" style="position:absolute;inset:0;overflow:hidden;background:radial-gradient(120% 90% at 70% 10%,#1d2a44 0%,#0e1220 55%,#07080c 100%)">
    <div class="art scene-bg" data-scene="${id}" style="position:absolute;left:50%;top:${o.sceneTop}px;width:${w * o.sceneScale}px;transform:translateX(-50%);filter:blur(${o.blur}px) brightness(${o.bright}) saturate(1.1)"></div>
    ${o.cones ? `
    <div style="position:absolute;inset:0;mix-blend-mode:screen">
      <div style="position:absolute;left:${w * 0.08}px;top:-${h * 0.08}px;width:${w * 0.34}px;height:${h * 1.2}px;transform:rotate(-24deg);transform-origin:50% 0;background:linear-gradient(180deg,#fff3d6aa 0%,#ffe2a033 40%,transparent 85%);clip-path:polygon(44% 0,56% 0,100% 100%,0 100%);filter:blur(8px)"></div>
      <div style="position:absolute;right:${w * 0.02}px;top:-${h * 0.08}px;width:${w * 0.36}px;height:${h * 1.25}px;transform:rotate(22deg);transform-origin:50% 0;background:linear-gradient(180deg,#e6f0ffbb 0%,#bcd8ff33 42%,transparent 85%);clip-path:polygon(44% 0,56% 0,100% 100%,0 100%);filter:blur(8px)"></div>
      <div style="position:absolute;left:${w * 0.42}px;top:-${h * 0.1}px;width:${w * 0.22}px;height:${h * 1.1}px;transform:rotate(6deg);transform-origin:50% 0;background:linear-gradient(180deg,#ff6b6b66 0%,#ff3b3b1f 45%,transparent 80%);clip-path:polygon(45% 0,55% 0,100% 100%,0 100%);filter:blur(10px)"></div>
    </div>` : ''}
    ${o.haze ? `<div style="position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 85%,#2ecc7114 0%,transparent 70%),linear-gradient(180deg,transparent 40%,#07080ccc 100%)"></div>` : ''}
  </div>`;
}
const SCENE_JS = (type, gear, client) => `
  document.querySelectorAll('.scene-bg').forEach((el) => {
    el.innerHTML = Art.scene(${JSON.stringify(type)}, null, 5, true, ${JSON.stringify(gear)}, { client: ${JSON.stringify(client)}, seed: 9 });
  });`;

/* =========================================================
   1) Gráfico destacado de Google Play (1024 x 500)
   ========================================================= */
function featureHtml(lang) {
  const t = lang === 'en'
    ? { tag: 'Run your own live broadcast company' }
    : { tag: 'Tu productora de eventos en vivo' };
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    .stage{position:relative;width:1024px;height:500px;overflow:hidden}
    .title{position:absolute;left:104px;top:92px;width:470px}
    .sign{font-size:84px;padding:.13em .3em .1em .26em}
    .tycoon{font-size:136px;font-weight:900;line-height:.8;letter-spacing:.02em;margin-top:18px;color:#fff;text-shadow:0 4px 0 #00000055,0 0 40px #00000080}
    .tag{margin-top:22px;font-size:28px;font-weight:600;color:#e9edf5;text-shadow:0 2px 12px #000;white-space:nowrap}
    .hud{position:absolute;right:34px;top:26px;font-size:15px;letter-spacing:.18em;color:#e9edf5b0;display:flex;gap:10px;align-items:center}
    .hud i{width:10px;height:10px;border-radius:50%;background:#ff3b3b;box-shadow:0 0 10px #ff3b3b}
    .frame{position:absolute;inset:18px;pointer-events:none}
    .frame b{position:absolute;width:26px;height:26px;border-color:#ffffff40;border-style:solid;border-width:0}
  </style></head><body>
  <div class="stage">
    ${estadio('bg', 1024, 500, { sceneTop: -122, sceneScale: 1.42, blur: 1.5, bright: 0.72 })}
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,#07080cf5 0%,#07080ce0 36%,#07080c70 56%,#07080c10 74%)"></div>
    <div class="art" id="van" style="position:absolute;left:812px;top:262px;width:206px;height:206px;filter:brightness(.74) drop-shadow(0 16px 18px #000c)"></div>
    <div style="position:absolute;left:560px;top:90px;width:420px;height:420px;border-radius:50%;background:radial-gradient(closest-side,#ff3b3b30,transparent 70%)"></div>
    <div class="art" id="cam" style="position:absolute;left:604px;top:64px;width:346px;height:346px;filter:drop-shadow(0 24px 24px #000e) drop-shadow(-10px 0 22px #4da3ff26)"></div>
    <div class="scan"></div>
    <div style="position:absolute;inset:0;box-shadow:inset 0 0 120px #000c"></div>
    <div class="frame"><b style="left:0;top:0;border-left-width:3px;border-top-width:3px"></b><b style="right:0;top:0;border-right-width:3px;border-top-width:3px"></b>
      <b style="left:0;bottom:0;border-left-width:3px;border-bottom-width:3px"></b><b style="right:0;bottom:0;border-right-width:3px;border-bottom-width:3px"></b></div>
    <div class="hud M"><i></i>REC&nbsp;&nbsp;CAM 1</div>
    <div class="title">
      <div class="onair sign D"><i></i>EN VIVO</div>
      <div class="tycoon D">TYCOON</div>
      <div class="tag B">${t.tag}</div>
    </div>
  </div>
  ${SCRIPTS}<script>${ITEM_JS}
    ${SCENE_JS('final', ['cam_cine', 'cam_pro', 'cam_pro', 'grua'], 'Federación del Torneo')}
    document.getElementById('cam').innerHTML = itemSolo("cam_cine", 346);
    document.getElementById('van').innerHTML = itemSolo("unidad_movil", 206);
  </script></body></html>`;
}

/* =========================================================
   2) Capturas para la tienda (1080 x 1920)
   ========================================================= */
/* Las 8 capturas, en orden. t[idioma] = [etiqueta, título (con <em> en la parte destacada), subtítulo].
   Los nombres inventados del juego (MegaVisión, Llévame) quedan igual en todos los idiomas. */
const AL_AIRE = { es: 'AL AIRE', en: 'ON AIR', 'pt-BR': 'NO AR', fr: 'À L’ANTENNE', de: 'ON AIR', it: 'IN ONDA', ru: 'В ЭФИРЕ', tr: 'YAYINDA', id: 'ON AIR', 'zh-CN': '直播中' };
const SCREENS = [
  { raw: '01_inicio', accent: '#ffb020', t: {
    es: ['TU PRODUCTORA', 'Tu productora,<br><em>tu nombre</em>', 'Pon tu marca en el letrero y crece de garaje a centro de producción.'],
    en: ['YOUR COMPANY', 'Your company,<br><em>your name</em>', 'Put your brand on the sign and grow from garage to production center.'],
    'pt-BR': ['SUA PRODUTORA', 'Sua produtora,<br><em>seu nome</em>', 'Coloque sua marca no letreiro e cresça da garagem a um centro de produção.'],
    fr: ['TA SOCIÉTÉ', 'Ta boîte, <em>ton nom</em>', 'Affiche ta marque et passe du garage au centre de production.'],
    de: ['DEINE FIRMA', 'Deine Firma,<br><em>dein Name</em>', 'Dein Name am Schild – von der Garage bis zum Produktionszentrum.'],
    it: ['IL TUO STUDIO', 'Il tuo studio,<br><em>il tuo nome</em>', 'Metti il tuo marchio sull’insegna e cresci dal garage a un centro di produzione.'],
    ru: ['ТВОЯ СТУДИЯ', 'Твоя студия,<br><em>твоё имя</em>', 'Повесь свою вывеску и вырасти из гаража в продакшн-центр.'],
    tr: ['ŞİRKETİN', 'Senin şirketin,<br><em>senin adın</em>', 'Tabelaya adını yaz, garajdan yapım merkezine büyü.'],
    id: ['RUMAH PRODUKSIMU', 'Rumah produksimu,<br><em>namamu</em>', 'Pasang namamu di papan dan tumbuh dari garasi ke pusat produksi.'],
    'zh-CN': ['你的公司', '你的公司，<br><em>你的名字</em>', '挂上自己的招牌，从车库成长为专业制作中心。'] } },
  { raw: '02_clientes', accent: '#4da3ff', t: {
    es: ['CLIENTES', 'Elige a tus <em>clientes</em>', 'Bodas, conciertos, boxeo y contratos internacionales. Pelea los disputados con MegaVisión.'],
    en: ['CLIENTS', 'Pick your <em>clients</em>', 'Weddings, concerts, boxing and international deals. Fight MegaVisión for contested jobs.'],
    'pt-BR': ['CLIENTES', 'Escolha seus <em>clientes</em>', 'Casamentos, shows, boxe e contratos internacionais. Dispute com a MegaVisión.'],
    fr: ['CLIENTS', 'Choisis tes <em>clients</em>', 'Mariages, concerts, boxe et contrats internationaux. Affronte MegaVisión.'],
    de: ['KUNDEN', 'Wähle deine <em>Kunden</em>', 'Hochzeiten, Konzerte, Boxen und Auslandsaufträge. Schlag MegaVisión.'],
    it: ['CLIENTI', 'Scegli i tuoi <em>clienti</em>', 'Matrimoni, concerti, boxe e contratti internazionali. Sfida MegaVisión.'],
    ru: ['КЛИЕНТЫ', 'Выбирай <em>клиентов</em>', 'Свадьбы, концерты, бокс и зарубежные контракты. Обойди MegaVisión.'],
    tr: ['MÜŞTERİLER', '<em>Müşterilerini</em> seç', 'Düğünler, konserler, boks ve uluslararası işler. MegaVisión ile yarış.'],
    id: ['KLIEN', 'Pilih <em>klienmu</em>', 'Pernikahan, konser, tinju, dan kontrak internasional. Kalahkan MegaVisión.'],
    'zh-CN': ['客户', '挑选你的<em>客户</em>', '婚礼、演唱会、拳击和国际合同，与 MegaVisión 争夺订单。'] } },
  { raw: '03_preparar', accent: '#2dd4bf', t: {
    es: ['PREPARACIÓN', 'Planifica cada <em>cámara</em>', 'Ubica las cámaras en el plano, arma tu equipo y pide transporte en Llévame.'],
    en: ['PREP', 'Plan every <em>camera</em>', 'Place cameras on the venue map, pick your crew and book a ride on Llévame.'],
    'pt-BR': ['PREPARAÇÃO', 'Planeje cada <em>câmera</em>', 'Posicione as câmeras no mapa, monte a equipe e peça transporte no Llévame.'],
    fr: ['PRÉPARATION', 'Place chaque <em>caméra</em>', 'Positionne les caméras sur le plan, choisis ton équipe et réserve un Llévame.'],
    de: ['VORBEREITUNG', 'Plane jede <em>Kamera</em>', 'Kameras auf den Lageplan, Crew wählen, Transport per Llévame buchen.'],
    it: ['PREPARAZIONE', 'Pianifica ogni <em>camera</em>', 'Posiziona le camere sulla mappa, scegli la troupe e prenota un Llévame.'],
    ru: ['ПОДГОТОВКА', 'Расставь каждую <em>камеру</em>', 'Камеры на схеме площадки, своя команда и транспорт через Llévame.'],
    tr: ['HAZIRLIK', 'Her <em>kamerayı</em> planla', 'Kameraları plana yerleştir, ekibini kur, Llévame ile ulaşımı ayarla.'],
    id: ['PERSIAPAN', 'Atur setiap <em>kamera</em>', 'Tempatkan kamera di denah, pilih kru, dan pesan transport di Llévame.'],
    'zh-CN': ['准备', '规划每一个<em>机位</em>', '在场地图上布置机位，组建团队，用 Llévame 叫车运设备。'] } },
  { raw: '04_en_vivo', accent: '#ff3b3b', t: {
    es: ['EN VIVO', 'Resuelve imprevistos <em>en vivo</em>', 'Lluvia, apagones, cables rotos: tú decides cómo salvar la transmisión.'],
    en: ['LIVE', 'Handle disasters <em>live on air</em>', 'Rain, blackouts, broken cables: you decide how to save the broadcast.'],
    'pt-BR': ['AO VIVO', 'Resolva imprevistos <em>ao vivo</em>', 'Chuva, apagões, cabos rompidos: você decide como salvar a transmissão.'],
    fr: ['EN DIRECT', 'Gère les imprévus <em>en direct</em>', 'Pluie, coupures, câbles cassés : à toi de sauver la diffusion.'],
    de: ['LIVE', 'Pannen <em>live</em> lösen', 'Regen, Stromausfall, Kabelbruch: Du rettest die Übertragung.'],
    it: ['IN DIRETTA', 'Risolvi imprevisti <em>in diretta</em>', 'Pioggia, blackout, cavi rotti: decidi tu come salvare la diretta.'],
    ru: ['ПРЯМОЙ ЭФИР', 'Спасай эфир <em>вживую</em>', 'Дождь, отключения, оборванные кабели — решать тебе.'],
    tr: ['CANLI', 'Sorunları <em>canlı</em> çöz', 'Yağmur, elektrik kesintisi, kopan kablolar: yayını sen kurtar.'],
    id: ['LIVE', 'Atasi masalah <em>secara live</em>', 'Hujan, listrik padam, kabel putus: kamu yang menyelamatkan siaran.'],
    'zh-CN': ['直播', '<em>直播</em>化解突发状况', '下雨、停电、断线：由你决定如何挽救直播。'] } },
  { raw: '05_resultado', accent: '#2ecc71', t: {
    es: ['RESULTADO', 'Gana <em>5&nbsp;estrellas</em>', 'Cobra, sube tu fama, gana el duelo a MegaVisión y comparte tu transmisión.'],
    en: ['RESULTS', 'Earn <em>5&nbsp;stars</em>', 'Get paid, grow your fame, beat MegaVisión and share your broadcast.'],
    'pt-BR': ['RESULTADO', 'Ganhe <em>5&nbsp;estrelas</em>', 'Receba, aumente sua fama, vença a MegaVisión e compartilhe a transmissão.'],
    fr: ['RÉSULTAT', 'Décroche <em>5&nbsp;étoiles</em>', 'Encaisse, gagne en renommée, bats MegaVisión et partage ta diffusion.'],
    de: ['ERGEBNIS', 'Hol dir <em>5&nbsp;Sterne</em>', 'Kassiere, werde berühmt, schlag MegaVisión und teile deine Übertragung.'],
    it: ['RISULTATO', 'Conquista <em>5&nbsp;stelle</em>', 'Incassa, aumenta la fama, batti MegaVisión e condividi la tua diretta.'],
    ru: ['РЕЗУЛЬТАТ', 'Получай <em>5&nbsp;звёзд</em>', 'Зарабатывай, расти в славе, обходи MegaVisión и делись трансляцией.'],
    tr: ['SONUÇ', '<em>5&nbsp;yıldız</em> kazan', 'Ödemeni al, ünün artsın, MegaVisión’ı yen ve yayınını paylaş.'],
    id: ['HASIL', 'Raih <em>5&nbsp;bintang</em>', 'Dapat bayaran, naikkan ketenaran, kalahkan MegaVisión, dan bagikan siaranmu.'],
    'zh-CN': ['结果', '拿下<em>五星</em>好评', '赚取报酬、提升名气，击败 MegaVisión，分享你的直播。'] } },
  { raw: '06_bodega', accent: '#ffcf4d', t: {
    es: ['BODEGA', 'Equipos de <em>Edición Exclusiva</em>', 'Cámaras, lentes, drones y grúas. Las piezas exclusivas llevan su número de serie.'],
    en: ['GEAR', '<em>Exclusive Edition</em> gear', 'Cameras, lenses, drones and jibs. Exclusive pieces carry their own serial number.'],
    'pt-BR': ['EQUIPAMENTOS', 'Equipamentos <em>Edição Exclusiva</em>', 'Câmeras, lentes, drones e gruas. As peças exclusivas têm número de série.'],
    fr: ['MATÉRIEL', 'Matériel <em>Édition Exclusive</em>', 'Caméras, objectifs, drones et grues. Les pièces exclusives sont numérotées.'],
    de: ['AUSRÜSTUNG', 'Technik in <em>Exklusiv-Edition</em>', 'Kameras, Objektive, Drohnen und Kräne. Exklusive Teile haben eine Seriennummer.'],
    it: ['ATTREZZATURA', 'Attrezzatura <em>Edizione Esclusiva</em>', 'Camere, obiettivi, droni e gru. I pezzi esclusivi hanno il numero di serie.'],
    ru: ['ТЕХНИКА', 'Техника <em>эксклюзивной серии</em>', 'Камеры, объективы, дроны и краны. У эксклюзивных вещей свой серийный номер.'],
    tr: ['EKİPMAN', '<em>Özel Seri</em> ekipmanlar', 'Kameralar, lensler, dronlar ve vinçler. Özel parçaların seri numarası var.'],
    id: ['PERALATAN', 'Peralatan <em>Edisi Eksklusif</em>', 'Kamera, lensa, drone, dan crane. Barang eksklusif punya nomor seri sendiri.'],
    'zh-CN': ['设备', '<em>限量版</em>专业设备', '摄像机、镜头、无人机和摇臂，每件限量设备都有独立编号。'] } },
  { raw: '07_copa', accent: '#b57bff', t: {
    es: ['EN LÍNEA', 'Copa de <em>Servidores</em>', 'Tu servidor contra los demás, cada semana. Además liga, festival, duelos y chat.'],
    en: ['ONLINE', 'The <em>Server Cup</em>', 'Your server against the rest, every week. Plus leagues, festivals, duels and chat.'],
    'pt-BR': ['ONLINE', 'Copa de <em>Servidores</em>', 'Seu servidor contra os outros, toda semana. E ainda liga, festival, duelos e chat.'],
    fr: ['EN LIGNE', 'Coupe des <em>Serveurs</em>', 'Ton serveur contre les autres, chaque semaine. Et aussi ligue, festival, duels et chat.'],
    de: ['ONLINE', 'Der <em>Server-Pokal</em>', 'Dein Server gegen die anderen, jede Woche. Dazu Liga, Festival, Duelle und Chat.'],
    it: ['ONLINE', 'Coppa dei <em>Server</em>', 'Il tuo server contro gli altri, ogni settimana. E poi lega, festival, duelli e chat.'],
    ru: ['ОНЛАЙН', 'Кубок <em>серверов</em>', 'Твой сервер против остальных каждую неделю. А ещё лига, фестиваль, дуэли и чат.'],
    tr: ['ÇEVRİMİÇİ', '<em>Sunucular</em> Kupası', 'Her hafta sunucun diğerlerine karşı. Ayrıca lig, festival, düellolar ve sohbet.'],
    id: ['ONLINE', 'Piala <em>Server</em>', 'Server-mu melawan yang lain setiap minggu. Ada juga liga, festival, duel, dan chat.'],
    'zh-CN': ['在线', '<em>服务器杯</em>', '每周与其他服务器一决高下，还有联赛、音乐节、对决和聊天。'] } },
  { raw: '08_decoracion', accent: '#ff8a3d', t: {
    es: ['SEDE', 'Decora tu <em>local</em>', 'Recepción, sofá, neón con tu nombre y trofeos: buena imagen, mejores ofertas.'],
    en: ['HQ', 'Decorate your <em>HQ</em>', 'Reception desk, sofa, a neon sign with your name and trophies: better image, better offers.'],
    'pt-BR': ['SEDE', 'Decore sua <em>sede</em>', 'Recepção, sofá, neon com seu nome e troféus: imagem melhor, ofertas melhores.'],
    fr: ['QG', 'Décore ton <em>QG</em>', 'Accueil, canapé, néon à ton nom et trophées : meilleure image, meilleures offres.'],
    de: ['HQ', 'Gestalte dein <em>Studio</em>', 'Empfang, Sofa, Neonschild mit deinem Namen und Pokale: besseres Image, bessere Angebote.'],
    it: ['SEDE', 'Arreda la tua <em>sede</em>', 'Reception, divano, insegna al neon col tuo nome e trofei: immagine migliore, offerte migliori.'],
    ru: ['ОФИС', 'Обустрой <em>студию</em>', 'Ресепшен, диван, неон с твоим именем и кубки: лучше имидж — лучше заказы.'],
    tr: ['MERKEZ', '<em>Merkezini</em> süsle', 'Resepsiyon, kanepe, adınla neon tabela ve kupalar: daha iyi imaj, daha iyi teklifler.'],
    id: ['MARKAS', 'Hias <em>markasmu</em>', 'Resepsionis, sofa, neon bernama studiomu, dan piala: citra makin baik, tawaran makin bagus.'],
    'zh-CN': ['总部', '装修你的<em>总部</em>', '前台、沙发、印着你名字的霓虹灯和奖杯：形象越好，订单越好。'] } },
];

function screenHtml(sc, lang, idx, rect) {
  const [kick, head, sub] = sc.t[lang] || sc.t.en;
  const shot = dataUri(path.join(rawDir(lang), sc.raw + '.png'));
  // El recuadro ampliado puede salir de otra captura del mismo momento (rect.src: p. ej. la tarjeta de Llévame, más abajo)
  const zoomShot = rect && rect.src ? dataUri(path.join(rawDir(lang), rect.src + '.png')) : shot;
  // Teléfono
  const SW = 690, k = SW / 1080, SH = Math.round(1920 * k), BZ = 16;
  const PW = SW + BZ * 2, PH = SH + BZ * 2, PX = Math.round((1080 - PW) / 2), PY = 610;
  // Recuadro ampliado del elemento clave
  let callout = '';
  if (rect) {
    const inW = rect.w * k, inH = rect.h * k;
    const zoom = Math.min(1.42, 930 / inW, 640 / inH);   // nunca tapa todo el teléfono
    const cw = Math.round(inW * zoom), ch = Math.round(inH * zoom);
    const cxIn = PX + BZ + (rect.x + rect.w / 2) * k, cyIn = PY + BZ + (rect.y + rect.h / 2) * k;
    let cx = Math.round(cxIn - cw / 2);
    cx = Math.max(40, Math.min(1080 - 40 - cw, cx));
    // rect.pos = 'bottom': abajo del teléfono (cuando el recuadro sale de otra captura y no debe tapar lo de arriba)
    let cy = rect.pos === 'bottom' ? 1920 - 70 - ch : Math.round(cyIn - ch / 2);
    cy = Math.max(PY + 40, Math.min(1920 - 60 - ch, cy));
    const s = cw / rect.w;
    callout = `<div style="position:absolute;left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px;border-radius:${Math.round(22 * s * 1.4)}px;overflow:hidden;
        box-shadow:0 0 0 3px ${sc.accent},0 0 0 9px ${sc.accent}26,0 40px 80px #000000e0,0 0 90px ${sc.accent}40">
        <div style="position:absolute;left:${-rect.x * s}px;top:${-rect.y * s}px;width:${1080 * s}px;height:${1920 * s}px;background:url(${zoomShot}) 0 0/100% 100% no-repeat"></div>
      </div>`;
  }
  const num = String(idx + 1).padStart(2, '0');
  const cjk = lang === 'zh-CN';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    .stage{position:relative;width:1080px;height:1920px;overflow:hidden;
      background:radial-gradient(90% 55% at 50% 72%,${sc.accent}22 0%,transparent 65%),radial-gradient(130% 60% at 50% 0%,#1b2130 0%,#0d0f14 60%)}
    .grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff07 1px,transparent 1px),linear-gradient(90deg,#ffffff07 1px,transparent 1px);background-size:60px 60px;
      -webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 45%)}
    .cap{position:absolute;left:84px;right:84px;top:86px}
    .kick{display:flex;align-items:center;gap:18px;font-size:26px;letter-spacing:.28em;color:${sc.accent};font-weight:700}
    .kick .n{color:#0d0f14;background:${sc.accent};padding:4px 12px 3px;border-radius:8px;letter-spacing:.06em}
    .kick .live{display:inline-flex;align-items:center;gap:10px;margin-left:auto;color:#ff3b3b;letter-spacing:.2em;font-size:22px}
    .kick .live i{width:14px;height:14px;border-radius:50%;background:#ff3b3b;box-shadow:0 0 12px #ff3b3b}
    h1{margin:26px 0 0;font-size:${cjk ? 104 : 116}px;line-height:${cjk ? 1.08 : 0.92};font-weight:800;text-transform:uppercase;letter-spacing:.005em;color:#fff}
    h1 em{font-style:normal;color:${sc.accent}}
    p.sub{margin:26px 0 0;font-size:37px;line-height:1.3;color:#b9c1d1;font-weight:500;max-width:880px}
    .phone{position:absolute;left:${PX}px;top:${PY}px;width:${PW}px;height:${PH}px;border-radius:78px;background:linear-gradient(160deg,#2c3446,#0a0c11 40%,#1c2230);padding:${BZ}px;
      box-shadow:0 0 0 2px #3a4458,0 60px 120px #000000d0,0 0 0 1px #000 inset}
    .phone .scr{width:${SW}px;height:${SH}px;border-radius:${78 - BZ}px;overflow:hidden;background:url(${shot}) 0 0/100% 100% no-repeat}
    .phone .cam{position:absolute;left:50%;top:${BZ + 14}px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:#05070a;box-shadow:0 0 0 3px #0d0f14}
    .fade{position:absolute;left:0;right:0;bottom:0;height:120px;background:linear-gradient(180deg,transparent,#0d0f14 92%)}
  </style></head><body>
  <div class="stage">
    <div class="grid"></div>
    <div class="cap">
      <div class="kick M"><span class="n">${num}</span><span class="${cjk ? 'B' : ''}">${kick}</span><span class="live ${cjk ? 'B' : ''}"><i></i>${AL_AIRE[lang] || AL_AIRE.en}</span></div>
      <h1 class="D">${head}</h1>
      <p class="sub B">${sub}</p>
    </div>
    <div class="phone"><div class="scr"></div><div class="cam"></div></div>
    ${callout}
    <div class="fade"></div>
  </div>
  <script>
    // Título en 2 líneas como máximo y subtítulo en 2 líneas (se achica si hace falta)
    window.__fit = () => {
      const fit = (el, lines, lh, min) => {
        let f = parseFloat(getComputedStyle(el).fontSize);
        while (el.getBoundingClientRect().height > lines * f * lh + 4 && f > min) { f -= 2; el.style.fontSize = f + 'px'; }
      };
      fit(document.querySelector('h1'), 2, ${cjk ? 1.08 : 0.92}, 64);
      fit(document.querySelector('p.sub'), 2, 1.3, 28);
    };
  </script></body></html>`;
}

/* =========================================================
   3) Redes: publicación cuadrada y historia
   ========================================================= */
function socialHtml(kind) {
  const story = kind === 'story';
  const W = 1080, H = story ? 1920 : 1080;
  const phoneShot = story ? dataUri(path.join(rawDir('es'), '04_en_vivo.png')) : '';
  const tags = ['Imprevistos en vivo', 'Equipos broadcast', 'Rival: MegaVisión'];
  // Monitor de programa (escena del juego nítida, con el gol)
  const MW = story ? 0 : 744, MH = Math.round(MW * 170 / 360);
  const monitor = story ? '' : `
    <div class="mon" style="left:${(W - MW) / 2 - 14}px;top:404px">
      <div class="mbar M"><span><i></i>PGM</span><span>CAM 2 · GRÚA</span><span>4K · 59.94</span></div>
      <div class="art" id="pgm" style="width:${MW}px;height:${MH}px"></div>
    </div>`;
  const PHW = 500, PHH = Math.round((PHW - 24) * 1920 / 1080) + 24;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
    .stage{position:relative;width:${W}px;height:${H}px;overflow:hidden}
    .center{position:absolute;left:0;right:0;text-align:center}
    .sign{font-size:${story ? 120 : 84}px;padding:.12em .3em .09em .26em}
    .tycoon{font-size:${story ? 220 : 150}px;font-weight:900;line-height:.8;color:#fff;letter-spacing:.02em;text-shadow:0 6px 0 #0006,0 0 60px #000}
    .tag{font-size:${story ? 46 : 34}px;font-weight:600;color:#e9edf5;text-shadow:0 2px 16px #000}
    .soon{display:inline-block;font-size:${story ? 150 : 108}px;font-weight:900;font-style:italic;color:var(--amber);line-height:.9;letter-spacing:.01em;
      text-shadow:0 0 50px #ffb02055,0 6px 0 #0007}
    .plat{display:inline-flex;align-items:center;gap:14px;font-size:${story ? 40 : 32}px;font-weight:600;color:#fff;background:#0d0f14e6;border:2px solid #ffffff26;border-radius:999px;padding:${story ? '18px 40px' : '14px 34px'}}
    .plat b{color:var(--amber)}
    .chips{display:flex;justify-content:center;gap:14px}
    .chips span{font-size:28px;font-weight:600;color:#cdd4e2;border:2px solid #2a3242;background:#161a22e6;border-radius:12px;padding:10px 18px}
    .url{font-size:28px;letter-spacing:.2em;color:#8b95a8}
    .mon{position:absolute;padding:14px;border-radius:22px;background:linear-gradient(170deg,#262d3b,#0b0d12 60%);box-shadow:0 0 0 2px #333d50,0 40px 90px #000000e6,0 0 120px #ff3b3b26}
    .mon .art{border-radius:8px;overflow:hidden;box-shadow:0 0 0 2px #ff3b3b}
    .mbar{display:flex;justify-content:space-between;font-size:17px;letter-spacing:.14em;color:#9aa4b8;padding:0 6px 10px}
    .mbar span:first-child{color:#ff3b3b;display:flex;align-items:center;gap:8px}.mbar i{width:10px;height:10px;border-radius:50%;background:#ff3b3b;box-shadow:0 0 8px #ff3b3b}
    .phone{position:absolute;width:${PHW}px;height:${PHH}px;padding:12px;border-radius:64px;background:linear-gradient(160deg,#2c3446,#0a0c11 40%,#1c2230);
      box-shadow:0 0 0 2px #3a4458,0 60px 120px #000000e0,0 0 140px #ff3b3b30}
    .phone .scr{width:${PHW - 24}px;height:${PHH - 24}px;border-radius:52px;overflow:hidden;background:url(${phoneShot}) 0 0/100% 100% no-repeat}
  </style></head><body>
  <div class="stage">
    ${estadio('bg', W, H, story
      ? { sceneTop: -430, sceneScale: 3.0, blur: 3, bright: 0.5 }
      : { sceneTop: -200, sceneScale: 2.0, blur: 3, bright: 0.48 })}
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,#07080ce6 0%,#07080cb3 ${story ? 34 : 40}%,#07080c80 ${story ? 50 : 55}%,#07080cf0 ${story ? 82 : 86}%)"></div>
    ${story ? `
      <div class="center" style="top:140px"><div class="onair sign D"><i></i>EN VIVO</div></div>
      <div class="center tycoon D" style="top:316px">TYCOON</div>
      <div class="center tag B" style="top:518px">Tu productora de eventos en vivo</div>
      <div class="center" style="top:608px"><div class="chips B">${tags.map((x) => `<span>${x}</span>`).join('')}</div></div>
      <div class="phone" style="left:${(W - PHW) / 2 + 70}px;top:720px"><div class="scr"></div></div>
      <div class="art" id="van" style="position:absolute;left:826px;top:1196px;width:252px;height:252px;filter:brightness(.92) drop-shadow(0 20px 22px #000d)"></div>
      <div class="art" id="cam" style="position:absolute;left:4px;top:1090px;width:372px;height:372px;filter:drop-shadow(0 30px 30px #000e)"></div>
      <div style="position:absolute;left:0;right:0;top:1300px;bottom:0;background:linear-gradient(180deg,#07080c00,#07080cfa 30%)"></div>
      <div class="center" style="top:1500px"><div class="soon D">MUY PRONTO</div></div>
      <div class="center" style="top:1662px"><div class="plat B">Próximamente en <b>Android</b> y <b>web</b></div></div>
      <div class="center url M" style="top:1810px">JUEGO.TUKANEC.COM</div>
    ` : `
      <div class="center" style="top:58px"><div class="onair sign D"><i></i>EN VIVO</div></div>
      <div class="center tycoon D" style="top:182px">TYCOON</div>
      <div class="center tag B" style="top:322px">Tu productora de eventos en vivo</div>
      ${monitor}
      <div class="art" id="cam" style="position:absolute;left:4px;top:600px;width:286px;height:286px;filter:drop-shadow(0 26px 26px #000e)"></div>
      <div class="center" style="top:852px"><div class="soon D">MUY PRONTO</div></div>
      <div class="center" style="top:966px"><div class="plat B">Próximamente en <b>Android</b> y <b>web</b></div></div>
    `}
    <div class="scan"></div>
    <div style="position:absolute;inset:0;box-shadow:inset 0 0 160px #000b"></div>
  </div>
  ${SCRIPTS}<script>${ITEM_JS}
    ${SCENE_JS('final', ['cam_cine', 'cam_pro', 'cam_pro', 'grua'], 'Federación del Torneo')}
    const p = document.getElementById('pgm');
    if (p) {
      p.innerHTML = Art.scene('final', 'epico', 4, false, ['cam_cine', 'vip_cam8k', 'grua', 'unidad_movil', 'dron4k'], { client: 'Federación del Torneo', seed: 2 });
      const tag = p.querySelector('g[transform="translate(10 148)"]'); if (tag) tag.remove(); // ya está el letrero grande
    }
    const c = document.getElementById('cam'); if (c) c.innerHTML = itemSolo('cam_cine', ${story ? 372 : 286});
    const v = document.getElementById('van'); if (v) v.innerHTML = itemSolo('unidad_movil', 252);
  </script></body></html>`;
}

/* =========================================================
   4) Ícono 512 x 512 para Google Play (32 bits, cuadrado completo:
      Play aplica sus propias esquinas redondeadas)
   ========================================================= */
async function icono() {
  const svg = fs.readFileSync(path.join(ROOT, 'icons/icon.svg'), 'utf8')
    .replace('<rect x="0" y="0" width="512" height="512" rx="112" fill="url(#bg)"/>', '<rect x="0" y="0" width="512" height="512" fill="url(#bg)"/>')
    .replace(/<rect x="6" y="6" width="500" height="500" rx="106"[^>]*\/>/, '');
  if (/rx="112"/.test(svg)) throw new Error('No se pudo quitar el redondeo del ícono');
  const out = path.join(PROMO, 'icon_512.png');
  await sharp(Buffer.from(svg), { density: 72 }).resize(512, 512).ensureAlpha().png({ compressionLevel: 9 }).toFile(out);
  console.log('ok', path.relative(PROMO, out));
}

async function main() {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  if (!ONLY || ONLY === 'feature') {
    await render(page, featureHtml('es'), path.join(PROMO, 'feature_graphic.png'), 1024, 500);
    await render(page, featureHtml('en'), path.join(PROMO, 'feature_graphic_en.png'), 1024, 500);
  }
  if (!ONLY || ONLY === 'screens') {
    for (const lang of LANGS) {
      const rects = JSON.parse(fs.readFileSync(path.join(rawDir(lang), 'rects.json'), 'utf8'));
      const dir = path.join(PROMO, 'screens_' + lang);
      fs.mkdirSync(dir, { recursive: true });
      for (let i = 0; i < SCREENS.length; i++) {
        await render(page, screenHtml(SCREENS[i], lang, i, rects[SCREENS[i].raw]), path.join(dir, String(i + 1).padStart(2, '0') + '.png'), 1080, 1920);
      }
    }
  }
  if (!ONLY || ONLY === 'social') {
    await render(page, socialHtml('post'), path.join(PROMO, 'social_post_1080.png'), 1080, 1080);
    await render(page, socialHtml('story'), path.join(PROMO, 'social_story_1080x1920.png'), 1080, 1920);
  }
  if (!ONLY || ONLY === 'icon') await icono();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
