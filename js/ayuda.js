/* =====================================================================
   EN VIVO Tycoon — Ayuda "?" (explicaciones cortas de las partes difíciles)
   - window.Ayuda.btn(clave) → html de un botón redondo "?" que abre la explicación.
   - Cualquier elemento con data-ayuda="<clave>" abre la explicación al tocarlo (los números de arriba, por ejemplo).
   - La explicación sale en una hoja abajo, encima de todo (también encima de una ventana abierta) y se cierra
     tocando en cualquier parte. El toque del "?" no llega a lo que está debajo (no elige ni cierra nada).
   - Textos en los 10 idiomas aquí mismo; idioma = window.I18N.idioma (respaldo: español).
   ===================================================================== */
(function (root) {
  'use strict';
  const D = {
    es: {
      _titulo: 'Ayuda', _ok: 'Entendido',
      dinero: ['Dinero', 'La plata de tu productora. Ganas con cada evento y pagas sueldos y los gastos de cada día. Si te quedas mucho tiempo en rojo, quiebras.'],
      fama: ['Fama', 'Sube cuando un evento te sale bien (3 estrellas o más) y baja cuando sale mal. Con más fama te llegan clientes más grandes que pagan más.'],
      dia: ["Día", "Cada día tiene 3 turnos (mañana, tarde y noche): puedes hacer hasta 3 eventos. Los eventos grandes y los internacionales ocupan el día entero. Al cerrar el día (con el botón o al usar los 3 turnos) pasas al día siguiente y se cobran los gastos fijos."],
      gastos: ["Gastos del día", "Lo que cuesta mantener tu productora cada día, aunque no trabajes: el local (empiezas en un garaje), una parte del sueldo de tu personal contratado y el seguro de tus equipos. Se cobran una sola vez, al cerrar el día, y se reparten entre los eventos de ese día: con más eventos, a cada uno le toca menos. Con más personas y equipos te mudas a un local más grande y los gastos suben."],
      personal: ['Personal del evento', 'Llevas: cuántas personas de ese puesto van al evento. Mínimo: las que hacen falta sí o sí. Ideal: con cuántas sale perfecto. Semáforo: verde está cubierto, naranja puedes ir pero con riesgo, rojo falta el mínimo. "Riesgo 20%" es la probabilidad de que algo falle por no llevar a esa persona.'],
      calidad: ['Calidad', 'Nota de 0 a 100 de cómo salió la transmisión. Depende de tus equipos, tu personal y lo que decides durante el evento en vivo. Más calidad = más estrellas, más pago y más fama.'],
      ganancia: ["Ganancia", "Lo que te dejó el evento: el pago del cliente menos los sueldos, la movilización y el viaje (si hubo). Los gastos fijos del día van aparte: se cobran al cerrar el día y se reparten entre los eventos de ese día."],
    },
    en: {
      _titulo: 'Help', _ok: 'Got it',
      dinero: ['Money', 'Your company\'s cash. You earn with each event and pay wages and daily costs. If you stay in the red too long, you go bankrupt.'],
      fama: ['Fame', 'Goes up when an event goes well (3 stars or more) and down when it goes badly. More fame brings bigger clients who pay more.'],
      dia: ["Day", "Each day has 3 slots (morning, afternoon and night): you can do up to 3 events. Big events and international ones take the whole day. When you end the day (with the button or by using all 3 slots) you move to the next day and the fixed costs are charged."],
      gastos: ["Daily costs", "What it costs to keep your company running every day, even without work: the venue (you start in a garage), part of your hired staff's wages and the insurance of your gear. They are charged only once, when the day ends, and split among that day's events: the more events, the less each one carries. With more people and gear you move to a bigger place and costs go up."],
      personal: ['Event staff', 'Taking: how many people of that role go. Minimum: the ones you must have. Ideal: how many make it perfect. Light: green is covered, orange you can go but with risk, red is below minimum. "Risk 20%" is the chance something fails because that person is missing.'],
      calidad: ['Quality', 'A 0–100 score of how the broadcast went. It depends on your gear, your staff and what you decide during the live event. More quality = more stars, more pay and more fame.'],
      ganancia: ["Profit", "What the event left you: the client's payment minus wages, transport and travel (if any). The day's fixed costs are separate: they are charged when the day ends and split among that day's events."],
    },
    'pt-BR': {
      _titulo: 'Ajuda', _ok: 'Entendi',
      dinero: ['Dinheiro', 'O caixa da sua produtora. Você ganha com cada evento e paga salários e os gastos de cada dia. Se ficar muito tempo no vermelho, vai à falência.'],
      fama: ['Fama', 'Sobe quando um evento dá certo (3 estrelas ou mais) e cai quando dá errado. Com mais fama chegam clientes maiores que pagam mais.'],
      dia: ["Dia", "Cada dia tem 3 turnos (manhã, tarde e noite): você pode fazer até 3 eventos. Eventos grandes e internacionais ocupam o dia inteiro. Ao encerrar o dia (com o botão ou usando os 3 turnos) você passa para o dia seguinte e os gastos fixos são cobrados."],
      gastos: ["Gastos do dia", "O custo de manter sua produtora todo dia, mesmo sem trabalho: o local (você começa numa garagem), parte do salário da equipe contratada e o seguro dos equipamentos. São cobrados uma única vez, ao encerrar o dia, e divididos entre os eventos daquele dia: com mais eventos, cada um leva menos. Com mais pessoas e equipamentos você muda para um local maior e os gastos sobem."],
      personal: ['Equipe do evento', 'Leva: quantas pessoas desse cargo vão. Mínimo: as que precisam ir de qualquer jeito. Ideal: com quantas fica perfeito. Semáforo: verde coberto, laranja pode ir mas com risco, vermelho falta o mínimo. "Risco 20%" é a chance de algo falhar por faltar essa pessoa.'],
      calidad: ['Qualidade', 'Nota de 0 a 100 de como saiu a transmissão. Depende dos equipamentos, da equipe e do que você decide ao vivo. Mais qualidade = mais estrelas, mais pagamento e mais fama.'],
      ganancia: ["Lucro", "O que o evento deixou: o pagamento do cliente menos salários, transporte e viagem (se houve). Os gastos fixos do dia ficam à parte: são cobrados ao encerrar o dia e divididos entre os eventos daquele dia."],
    },
    fr: {
      _titulo: 'Aide', _ok: 'Compris',
      dinero: ['Argent', 'La trésorerie de ta société. Tu gagnes à chaque événement et tu paies les salaires et les frais de chaque jour. Si tu restes trop longtemps dans le rouge, c\'est la faillite.'],
      fama: ['Renommée', 'Monte quand un événement se passe bien (3 étoiles ou plus) et baisse quand il se passe mal. Plus de renommée attire des clients plus gros qui paient plus.'],
      dia: ["Jour", "Chaque jour a 3 créneaux (matin, après-midi et soir) : tu peux faire jusqu'à 3 événements. Les gros événements et les internationaux prennent toute la journée. Quand tu finis la journée (avec le bouton ou en utilisant les 3 créneaux), tu passes au jour suivant et les frais fixes sont payés."],
      gastos: ["Frais du jour", "Ce que coûte ta société chaque jour, même sans travail : le local (tu commences dans un garage), une partie du salaire de ton équipe et l'assurance de ton matériel. Ils sont payés une seule fois, en fin de journée, et répartis entre les événements du jour : plus il y a d'événements, moins chacun en porte. Avec plus de monde et de matériel, tu déménages dans un local plus grand et les frais montent."],
      personal: ['Équipe de l\'événement', 'Pris : combien de personnes de ce poste viennent. Minimum : celles qu\'il faut absolument. Idéal : combien pour que ce soit parfait. Feu : vert couvert, orange possible mais risqué, rouge minimum non atteint. « Risque 20 % » est la probabilité qu\'un problème arrive sans cette personne.'],
      calidad: ['Qualité', 'Note de 0 à 100 de la diffusion. Elle dépend de ton matériel, de ton équipe et de tes choix en direct. Plus de qualité = plus d\'étoiles, plus de paiement et plus de renommée.'],
      ganancia: ["Bénéfice", "Ce que l'événement t'a rapporté : le paiement du client moins les salaires, le transport et le voyage (s'il y en a). Les frais fixes du jour sont à part : ils sont payés en fin de journée et répartis entre les événements du jour."],
    },
    de: {
      _titulo: 'Hilfe', _ok: 'Verstanden',
      dinero: ['Geld', 'Die Kasse deiner Firma. Du verdienst mit jedem Event und zahlst Löhne und tägliche Kosten. Bleibst du zu lange im Minus, gehst du pleite.'],
      fama: ['Ruhm', 'Steigt, wenn ein Event gut läuft (3 Sterne oder mehr), und sinkt, wenn es schlecht läuft. Mehr Ruhm bringt größere Kunden, die mehr zahlen.'],
      dia: ["Tag", "Jeder Tag hat 3 Termine (Vormittag, Nachmittag und Abend): Du kannst bis zu 3 Events machen. Große und internationale Events dauern den ganzen Tag. Wenn du den Tag beendest (mit dem Button oder wenn alle 3 Termine belegt sind), geht es zum nächsten Tag und die Fixkosten werden bezahlt."],
      gastos: ["Tageskosten", "Was deine Firma jeden Tag kostet, auch ohne Arbeit: der Standort (du startest in einer Garage), ein Teil der Löhne deines Personals und die Versicherung deiner Ausrüstung. Sie werden nur einmal bezahlt, wenn der Tag endet, und auf die Events des Tages aufgeteilt: Je mehr Events, desto weniger trägt jedes. Mit mehr Leuten und Ausrüstung ziehst du in einen größeren Ort und die Kosten steigen."],
      personal: ['Personal beim Event', 'Dabei: wie viele Leute dieser Rolle mitkommen. Minimum: die du unbedingt brauchst. Ideal: mit wie vielen es perfekt wird. Ampel: grün besetzt, orange geht mit Risiko, rot unter Minimum. „Risiko 20 %" ist die Chance, dass etwas schiefgeht, weil diese Person fehlt.'],
      calidad: ['Qualität', 'Note von 0 bis 100 für die Übertragung. Sie hängt von Ausrüstung, Personal und deinen Live-Entscheidungen ab. Mehr Qualität = mehr Sterne, mehr Bezahlung und mehr Ruhm.'],
      ganancia: ["Gewinn", "Was das Event dir gebracht hat: Zahlung des Kunden minus Löhne, Transport und Reise (falls nötig). Die Fixkosten des Tages kommen extra: Sie werden am Ende des Tages bezahlt und auf die Events des Tages aufgeteilt."],
    },
    it: {
      _titulo: 'Aiuto', _ok: 'Capito',
      dinero: ['Soldi', 'La cassa della tua casa di produzione. Guadagni con ogni evento e paghi stipendi e spese di ogni giorno. Se resti troppo a lungo in rosso, fallisci.'],
      fama: ['Fama', 'Sale quando un evento va bene (3 stelle o più) e scende quando va male. Con più fama arrivano clienti più grandi che pagano di più.'],
      dia: ["Giorno", "Ogni giorno ha 3 turni (mattina, pomeriggio e sera): puoi fare fino a 3 eventi. Gli eventi grandi e quelli internazionali occupano tutta la giornata. Quando chiudi la giornata (con il pulsante o usando i 3 turni) passi al giorno dopo e si pagano le spese fisse."],
      gastos: ["Spese del giorno", "Quanto costa mantenere la tua casa di produzione ogni giorno, anche senza lavoro: il locale (inizi in un garage), parte dello stipendio del personale assunto e l'assicurazione dell'attrezzatura. Si pagano una sola volta, alla chiusura della giornata, e si dividono tra gli eventi di quel giorno: più eventi fai, meno tocca a ciascuno. Con più persone e attrezzatura ti trasferisci in un locale più grande e le spese salgono."],
      personal: ['Personale dell\'evento', 'Porti: quante persone di quel ruolo vengono. Minimo: quelle indispensabili. Ideale: con quante viene perfetto. Semaforo: verde coperto, arancione puoi andare ma con rischio, rosso manca il minimo. "Rischio 20%" è la probabilità che qualcosa vada storto senza quella persona.'],
      calidad: ['Qualità', 'Voto da 0 a 100 della trasmissione. Dipende da attrezzatura, personale e dalle scelte in diretta. Più qualità = più stelle, più paga e più fama.'],
      ganancia: ["Guadagno", "Quello che ti ha lasciato l'evento: il pagamento del cliente meno stipendi, trasporto e viaggio (se c'è). Le spese fisse del giorno sono a parte: si pagano alla chiusura della giornata e si dividono tra gli eventi di quel giorno."],
    },
    ru: {
      _titulo: 'Помощь', _ok: 'Понятно',
      dinero: ['Деньги', 'Касса твоей компании. Ты зарабатываешь на каждом событии и платишь зарплаты и ежедневные расходы. Если долго быть в минусе — банкротство.'],
      fama: ['Слава', 'Растёт, когда событие прошло хорошо (3 звезды и больше), и падает, когда плохо. С большей славой приходят крупные клиенты, которые платят больше.'],
      dia: ["День", "В каждом дне 3 слота (утро, день и вечер): можно провести до 3 мероприятий. Крупные и международные мероприятия занимают весь день. Когда заканчиваешь день (кнопкой или заняв все 3 слота), наступает следующий день и списываются постоянные расходы."],
      gastos: ["Расходы за день", "Сколько стоит содержать компанию каждый день, даже без работы: помещение (начинаешь в гараже), часть зарплаты нанятого персонала и страховка оборудования. Они списываются один раз, в конце дня, и делятся между мероприятиями этого дня: чем больше мероприятий, тем меньше на каждое. С ростом людей и техники ты переезжаешь в помещение побольше, и расходы растут."],
      personal: ['Персонал события', 'Берёшь: сколько людей этой роли едет. Минимум: без кого нельзя. Идеал: со сколькими всё будет отлично. Светофор: зелёный — хватает, оранжевый — можно, но с риском, красный — ниже минимума. «Риск 20%» — шанс, что что-то пойдёт не так без этого человека.'],
      calidad: ['Качество', 'Оценка от 0 до 100 того, как прошла трансляция. Зависит от техники, персонала и твоих решений в прямом эфире. Больше качества = больше звёзд, оплаты и славы.'],
      ganancia: ["Прибыль", "Что принесло мероприятие: оплата клиента минус зарплаты, транспорт и поездка (если была). Постоянные расходы за день считаются отдельно: они списываются в конце дня и делятся между мероприятиями этого дня."],
    },
    tr: {
      _titulo: 'Yardım', _ok: 'Anladım',
      dinero: ['Para', 'Şirketinin kasası. Her etkinlikten kazanır, maaşları ve günlük giderleri ödersin. Uzun süre ekside kalırsan iflas edersin.'],
      fama: ['Ün', 'Etkinlik iyi geçince (3 yıldız veya üstü) artar, kötü geçince düşer. Ün arttıkça daha çok ödeyen büyük müşteriler gelir.'],
      dia: ["Gün", "Her günün 3 vardiyası var (sabah, öğleden sonra ve akşam): en fazla 3 etkinlik yapabilirsin. Büyük ve uluslararası etkinlikler bütün günü alır. Günü bitirdiğinde (düğmeyle ya da 3 vardiyayı kullanınca) ertesi güne geçersin ve sabit giderler ödenir."],
      gastos: ["Günlük giderler", "Çalışmasan bile şirketini her gün ayakta tutmanın maliyeti: mekân (garajda başlarsın), işe aldığın personelin maaşının bir kısmı ve ekipman sigortası. Gün bitince yalnızca bir kez ödenir ve o günün etkinliklerine bölünür: etkinlik arttıkça her birine daha az düşer. Kişi ve ekipman arttıkça daha büyük bir yere taşınırsın ve giderler artar."],
      personal: ['Etkinlik personeli', 'Götür: o görevden kaç kişi gidiyor. Asgari: mutlaka gerekenler. İdeal: kaç kişiyle mükemmel olur. Işık: yeşil tamam, turuncu gidebilirsin ama riskli, kırmızı asgari eksik. "Risk %20", o kişi olmadığı için bir şeyin ters gitme ihtimalidir.'],
      calidad: ['Kalite', 'Yayının 0–100 arası notu. Ekipmanına, personeline ve canlı yayındaki kararlarına bağlıdır. Daha çok kalite = daha çok yıldız, ödeme ve ün.'],
      ganancia: ["Kâr", "Etkinliğin sana bıraktığı: müşterinin ödemesi eksi maaşlar, ulaşım ve yol (varsa). Günün sabit giderleri ayrı: gün bitince ödenir ve o günün etkinliklerine bölünür."],
    },
    id: {
      _titulo: 'Bantuan', _ok: 'Mengerti',
      dinero: ['Uang', 'Kas perusahaanmu. Kamu dapat uang dari tiap acara dan membayar gaji serta biaya harian. Jika terlalu lama minus, kamu bangkrut.'],
      fama: ['Ketenaran', 'Naik saat acara berjalan baik (3 bintang atau lebih) dan turun saat buruk. Makin terkenal, makin banyak klien besar yang bayar lebih.'],
      dia: ["Hari", "Tiap hari punya 3 sesi (pagi, siang, dan malam): kamu bisa mengerjakan sampai 3 acara. Acara besar dan internasional memakan seharian. Saat kamu mengakhiri hari (dengan tombol atau setelah 3 sesi terpakai), kamu lanjut ke hari berikutnya dan biaya tetap dibayar."],
      gastos: ["Biaya harian", "Biaya menjalankan perusahaanmu tiap hari, meski tanpa kerja: tempat (mulai dari garasi), sebagian gaji kru yang kamu rekrut, dan asuransi peralatan. Dibayar sekali saja, saat hari diakhiri, dan dibagi ke acara hari itu: makin banyak acara, makin kecil bagian tiap acara. Makin banyak orang dan alat, kamu pindah ke tempat lebih besar dan biaya naik."],
      personal: ['Kru acara', 'Bawa: berapa orang dari peran itu yang ikut. Minimal: yang wajib ada. Ideal: berapa orang agar sempurna. Lampu: hijau cukup, oranye bisa tapi berisiko, merah kurang dari minimal. "Risiko 20%" adalah peluang ada masalah karena orang itu tidak ada.'],
      calidad: ['Kualitas', 'Nilai 0–100 hasil siaran. Tergantung peralatan, kru, dan keputusanmu saat siaran langsung. Kualitas lebih tinggi = lebih banyak bintang, bayaran, dan ketenaran.'],
      ganancia: ["Laba", "Yang kamu dapat dari acara: bayaran klien dikurangi gaji, transportasi, dan perjalanan (jika ada). Biaya tetap hari itu terpisah: dibayar saat hari diakhiri dan dibagi ke acara hari itu."],
    },
    'zh-CN': {
      _titulo: '帮助', _ok: '明白了',
      dinero: ['资金', '你公司的现金。每场活动都能赚钱，同时要付工资和每日开销。长时间处于亏损就会破产。'],
      fama: ['名气', '活动办得好（3 星及以上）会上升，办砸了会下降。名气越高，越会有出价更高的大客户找上门。'],
      dia: ["天数", "每天有 3 个时段（上午、下午、晚上）：最多可以办 3 场活动。大型活动和国际活动会占用一整天。结束当天（按按钮或用完 3 个时段）就进入下一天，并扣除固定开销。"],
      gastos: ["每日开销", "即使不工作，每天维持公司也要花钱：场地（从车库起步）、所雇员工的一部分工资，以及设备保险。只在结束当天时扣一次，并由当天的活动分摊：活动越多，每场分摊越少。人和设备越多，你会搬到更大的场地，开销也会增加。"],
      personal: ['活动人员', '带上：这个岗位去几个人。最少：必须要有的人数。理想：多少人能做到完美。信号灯：绿色已满足，橙色可以去但有风险，红色未达最低。“风险 20%”表示缺了这个人出问题的几率。'],
      calidad: ['质量', '直播效果的 0–100 分。取决于你的设备、人员和直播中的决定。质量越高 = 星级、报酬和名气越高。'],
      ganancia: ["利润", "这场活动给你留下的钱：客户付款减去工资、交通和差旅（如有）。当天的固定开销另算：在结束当天时扣除，由当天的活动分摊。"],
    },
  };
  const lang = () => { try { const l = root.I18N && root.I18N.idioma; return D[l] ? l : 'es'; } catch (e) { return 'es'; } };
  const txt = (k) => { const L = D[lang()]; return (L && L[k]) || D.es[k]; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let estilo = false;
  function ponerEstilo() {
    if (estilo || typeof document === 'undefined') return;
    estilo = true;
    const st = document.createElement('style');
    st.textContent = `
.ay-q{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;min-width:20px;padding:0;margin:0 0 0 6px;border-radius:50%;border:1px solid var(--line,#2a3242);background:var(--panel2,#1e2430);color:var(--amber,#ffb020);font:700 12px/1 inherit;cursor:pointer;vertical-align:middle;position:relative}
.ay-q::after{content:"";position:absolute;inset:-10px}
.ay-q:focus-visible{outline:2px solid var(--amber,#ffb020);outline-offset:2px}
.ay-velo{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}
.ay-hoja{width:100%;max-width:520px;margin:0 8px 10px;background:var(--panel,#161b24);border:1px solid #5a4214;border-radius:16px;padding:14px 16px 12px;color:var(--text,#e9edf5);box-shadow:0 -6px 30px rgba(0,0,0,.5);animation:ay-sube .18s ease-out}
.ay-hoja h3{margin:0 0 6px;font-size:16px;color:var(--amber,#ffb020)}
.ay-hoja p{margin:0 0 10px;font-size:14px;line-height:1.45}
.ay-hoja button{width:100%}
@keyframes ay-sube{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.ay-hoja{animation:none}}
[data-ayuda]:not(.ay-q){cursor:help}`;
    document.head.appendChild(st);
  }

  function btn(k) {
    if (!D.es[k]) return '';
    return `<button type="button" class="ay-q" data-ayuda="${esc(k)}" aria-label="${esc(txt('_titulo') + ': ' + txt(k)[0])}">?</button>`;
  }

  let abierta = null;
  function cerrar() { if (abierta) { abierta.remove(); abierta = null; } }
  function abrir(k) {
    const t = txt(k);
    if (!t || !Array.isArray(t)) return;
    ponerEstilo();
    cerrar();
    const v = document.createElement('div');
    v.className = 'ay-velo';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.innerHTML = `<div class="ay-hoja"><h3>${esc(t[0])}</h3><p>${esc(t[1])}</p><button type="button" class="btn main">${esc(txt('_ok'))}</button></div>`;
    v.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); cerrar(); });
    document.body.appendChild(v);
    abierta = v;
    try { v.querySelector('button').focus(); } catch (e) { /* nada */ }
  }

  if (typeof document !== 'undefined') {
    ponerEstilo();
    // En captura: el toque en un "?" (o en algo con data-ayuda) no llega al juego
    document.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-ayuda]') : null;
      if (!el || (abierta && abierta.contains(el))) return;
      e.stopPropagation(); e.preventDefault();
      abrir(el.getAttribute('data-ayuda'));
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierta) { e.stopPropagation(); cerrar(); } }, true);
  }

  root.Ayuda = { btn, abrir, cerrar, claves: () => Object.keys(D.es).filter((k) => k[0] !== '_'), _D: D };
})(typeof window !== 'undefined' ? window : globalThis);
