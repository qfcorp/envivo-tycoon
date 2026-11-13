<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Gran Producción de Asociación (server/INTEGRAR_GRAN_PRODUCCION.md): una vez por semana cada asociación cubre en conjunto
 * un mega evento inventado (rota entre TEMAS). Por defecto empieza el viernes a las 18:00 (America/Guayaquil) y dura 48 h;
 * día, hora, duración, encendido y el tema de la próxima se cambian en el Centro de Control (Ajustes gp_*).
 *
 * Cómo aporta cada productora, sin tocar su partida (nada se gasta, el personal y los equipos "vuelven" al instante):
 *  - Personal ("Enviar cuadrilla") y Equipos ("Prestar equipos"): un turno al empezar y otro cada 4 h; los turnos se
 *    acumulan (no se pierde nada por entrar tarde) y un toque manda todos los que tengas. Máximo FRENTES[f]['max'].
 *  - Transmisiones: automáticas. Cada evento que cubre en su propia partida durante la producción suma 1 (lo cuenta el
 *    servidor con stats.events de su partida en la nube), máximo FRENTES['transmision']['max'].
 *  Todo lo valida el servidor: turnos por tiempo, topes por productora (así nadie llena la meta solo y todos tienen lugar),
 *  una sola asociación por producción (no se puede saltar de una a otra), 24 h en la asociación (o estar desde antes de
 *  empezar) contra cuentas alternas, cuenta activa, transacción y libro de aportes (gp_aportes).
 *
 * Meta: se fija cuando la asociación entra (al empezar la producción) según sus miembros activos en 7 días (mínimo 1):
 *  FRENTES[f]['meta'] × activos. Así una asociación de 2 llega igual que una de 20. Progreso = Σ min(lo aportado, 2 × meta)
 *  / Σ meta (0 a 200 %). Niveles fijos (NIVELES) con premios fijos y visibles desde antes de empezar; los reciben, por el
 *  buzón, todas las productoras que aportaron algo. Tabla entre asociaciones del mismo servidor por progreso (desempate:
 *  quien llegó primero); los 3 primeros suman PUESTOS. Nada al azar y nada que se cambie por dinero.
 *
 * Reloj perezoso: tick() (lo llaman todas las rutas, el panel, el detector de push y bin/gran_produccion.php) crea la
 * producción al llegar la hora y la cierra al terminar. Pausa (el reloj se detiene y el final se corre) y cancelación
 * (sin premios) desde el Centro de Control. Avisos push de inicio y "faltan 2 h" con Push::encolar (categoría 'liga'),
 * que respeta el tope diario, las horas de silencio y el interruptor del jugador.
 */
final class GranProduccion
{
    public const ZONA_DEF = 'America/Guayaquil';
    public const ANTIGUEDAD_SEG = 86400;
    public const ACTIVO_DIAS = 7;
    public const DIA = 5;          // viernes (ISO 1 = lunes … 7 = domingo)
    public const HORA = '18:00';
    public const HORAS = 48;
    public const HORAS_MIN = 12;
    public const HORAS_MAX = 120;  // nunca se pisa con la de la semana siguiente

    /** Mega eventos (nombres inventados). Rota uno por semana; el panel puede elegir el de la próxima. */
    public const TEMAS = [
        'concierto_estadio' => ['icono' => '🎤', 'nombre' => 'Concierto de 3 noches en el Estadio del Sol'],
        'final_nacional' => ['icono' => '⚽', 'nombre' => 'Gran Final del Torneo Nacional Relámpago'],
        'festival_playa' => ['icono' => '🌊', 'nombre' => 'Festival Olas y Luces en la playa'],
        'gala_estrellas' => ['icono' => '🏆', 'nombre' => 'Gala de las Estrellas del Aire'],
        'maraton_nubes' => ['icono' => '🏃', 'nombre' => 'Maratón Ciudad de las Nubes'],
        'feria_innovacion' => ['icono' => '🚀', 'nombre' => 'Feria de Innovación del Pacífico'],
    ];

    /** Frentes: 'max' por productora, 'meta' por miembro activo, 'cada' = segundos entre turnos (null = automático). */
    public const FRENTES = [
        'personal' => ['max' => 8, 'meta' => 4, 'cada' => 14400],
        'equipos' => ['max' => 8, 'meta' => 4, 'cada' => 14400],
        'transmision' => ['max' => 12, 'meta' => 6, 'cada' => null],
    ];

    /** Niveles por progreso (%), de menor a mayor, con sus premios fijos (adjuntos del buzón) para cada productora que aportó. */
    public const NIVELES = [
        'participacion' => ['pct' => 1, 'premios' => [['tipo' => 'dinero', 'cantidad' => 1500], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 1]]],
        'bronce' => ['pct' => 30, 'premios' => [['tipo' => 'dinero', 'cantidad' => 3000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2]]],
        'plata' => ['pct' => 60, 'premios' => [['tipo' => 'dinero', 'cantidad' => 6000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3],
            ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2], ['tipo' => 'creditos', 'cantidad' => 10]]],
        'oro' => ['pct' => 100, 'premios' => [['tipo' => 'dinero', 'cantidad' => 10000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 4],
            ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3], ['tipo' => 'creditos', 'cantidad' => 25]]],
        'leyenda' => ['pct' => 150, 'premios' => [['tipo' => 'dinero', 'cantidad' => 15000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 6],
            ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 4], ['tipo' => 'creditos', 'cantidad' => 40], ['tipo' => 'reparar_todo', 'cantidad' => 1]]],
    ];
    public const NOMBRE_NIVEL = ['participacion' => 'Participación', 'bronce' => 'Bronce', 'plata' => 'Plata', 'oro' => 'Oro', 'leyenda' => 'Leyenda'];

    /**
     * Avisos push y del chat de asociación en los 10 idiomas del juego. El push va en el idioma del aparato del jugador
     * (Push::idiomaJugador); el chat guarda los 10 textos (chat_mensajes.textos_json) y Chat los muestra en el idioma de
     * quien lee (Accept-Language). Marcadores: {tema} y {nivel} (se ponen con TEMA_NOMBRES / NIVEL_NOMBRES del idioma),
     * {horas}, {libres}, {pct}, {puesto}.
     */
    public const TEXTOS = [
        'es' => ['push_inicio_t' => '🎬 ¡Empieza la Gran Producción!', 'push_inicio_c' => 'Tu asociación cubre «{tema}». Entra y envía tu cuadrilla: cada aporte cuenta.',
            'push_2h_t' => '⏰ Faltan 2 h para el cierre', 'push_2h_c' => 'La Gran Producción «{tema}» termina pronto y tienes {libres} aportes listos.',
            'chat_inicio' => '🎬 ¡Empieza la Gran Producción! Tu asociación cubre «{tema}» durante {horas} h. Abre «Gran Producción» y aporta tu cuadrilla.',
            'chat_fin' => '🎬 Terminó «{tema}»: {pct} % · nivel {nivel} · puesto {puesto} del servidor. Los premios llegaron al buzón de quienes aportaron.',
            'chat_cancelada' => '🎬 La Gran Producción de esta semana se canceló. Perdón por las molestias: la próxima llega en la fecha de siempre.',
            'tema_otro' => 'el mega evento'],
        'en' => ['push_inicio_t' => '🎬 The Big Production begins!', 'push_inicio_c' => 'Your alliance is covering “{tema}”. Jump in and send your crew: every contribution counts.',
            'push_2h_t' => '⏰ 2 h left before it closes', 'push_2h_c' => 'The Big Production “{tema}” ends soon and you have {libres} contributions ready.',
            'chat_inicio' => '🎬 The Big Production begins! Your alliance is covering “{tema}” for {horas} h. Open “Big Production” and send your crew.',
            'chat_fin' => '🎬 “{tema}” is over: {pct} % · {nivel} level · place {puesto} on the server. Rewards went to the mailbox of everyone who contributed.',
            'chat_cancelada' => '🎬 This week\'s Big Production was canceled. Sorry for the trouble: the next one arrives on the usual date.',
            'tema_otro' => 'the mega event'],
        'pt-BR' => ['push_inicio_t' => '🎬 Começa a Grande Produção!', 'push_inicio_c' => 'Sua aliança vai cobrir "{tema}". Entre e envie sua equipe: cada contribuição conta.',
            'push_2h_t' => '⏰ Faltam 2 h para o fim', 'push_2h_c' => 'A Grande Produção "{tema}" termina logo e você tem {libres} contribuições prontas.',
            'chat_inicio' => '🎬 Começa a Grande Produção! Sua aliança cobre "{tema}" durante {horas} h. Abra "Grande Produção" e envie sua equipe.',
            'chat_fin' => '🎬 Terminou "{tema}": {pct} % · nível {nivel} · posição {puesto} do servidor. Os prêmios chegaram ao correio de quem contribuiu.',
            'chat_cancelada' => '🎬 A Grande Produção desta semana foi cancelada. Desculpe o transtorno: a próxima chega na data de sempre.',
            'tema_otro' => 'o mega evento'],
        'fr' => ['push_inicio_t' => '🎬 La Grande Production commence !', 'push_inicio_c' => 'Ton alliance couvre « {tema} ». Viens envoyer ton équipe : chaque contribution compte.',
            'push_2h_t' => '⏰ Plus que 2 h avant la fin', 'push_2h_c' => 'La Grande Production « {tema} » se termine bientôt et tu as {libres} contributions prêtes.',
            'chat_inicio' => '🎬 La Grande Production commence ! Votre alliance couvre « {tema} » pendant {horas} h. Ouvrez « Grande Production » et envoyez votre équipe.',
            'chat_fin' => '🎬 « {tema} » est terminé : {pct} % · niveau {nivel} · place {puesto} du serveur. Les récompenses sont arrivées dans le courrier de ceux qui ont contribué.',
            'chat_cancelada' => '🎬 La Grande Production de cette semaine a été annulée. Désolés pour le dérangement : la prochaine arrive à la date habituelle.',
            'tema_otro' => 'le méga événement'],
        'de' => ['push_inicio_t' => '🎬 Die Große Produktion beginnt!', 'push_inicio_c' => 'Deine Allianz übernimmt „{tema}“. Schick dein Team los: Jeder Beitrag zählt.',
            'push_2h_t' => '⏰ Noch 2 h bis zum Schluss', 'push_2h_c' => 'Die Große Produktion „{tema}“ endet bald und du hast {libres} Beiträge bereit.',
            'chat_inicio' => '🎬 Die Große Produktion beginnt! Eure Allianz übernimmt {horas} h lang „{tema}“. Öffnet „Große Produktion“ und schickt euer Team.',
            'chat_fin' => '🎬 „{tema}“ ist vorbei: {pct} % · Stufe {nivel} · Platz {puesto} auf dem Server. Die Belohnungen liegen im Postfach aller, die beigetragen haben.',
            'chat_cancelada' => '🎬 Die Große Produktion dieser Woche wurde abgesagt. Sorry für die Umstände: Die nächste kommt zum gewohnten Termin.',
            'tema_otro' => 'das Mega-Event'],
        'it' => ['push_inicio_t' => '🎬 Inizia la Grande Produzione!', 'push_inicio_c' => 'La tua alleanza copre "{tema}". Entra e manda la tua squadra: ogni contributo conta.',
            'push_2h_t' => '⏰ Mancano 2 h alla chiusura', 'push_2h_c' => 'La Grande Produzione "{tema}" sta per finire e hai {libres} contributi pronti.',
            'chat_inicio' => '🎬 Inizia la Grande Produzione! La vostra alleanza copre "{tema}" per {horas} h. Aprite "Grande Produzione" e mandate la vostra squadra.',
            'chat_fin' => '🎬 "{tema}" è finita: {pct} % · livello {nivel} · posto {puesto} del server. I premi sono arrivati nella posta di chi ha contribuito.',
            'chat_cancelada' => '🎬 La Grande Produzione di questa settimana è stata annullata. Scusate il disagio: la prossima arriva alla solita data.',
            'tema_otro' => 'il mega evento'],
        'ru' => ['push_inicio_t' => '🎬 Большой продакшн начинается!', 'push_inicio_c' => 'Твой альянс снимает «{tema}». Заходи и отправь свою команду: важен каждый вклад.',
            'push_2h_t' => '⏰ До финала 2 ч', 'push_2h_c' => 'Большой продакшн «{tema}» скоро закончится, а у тебя готово вкладов: {libres}.',
            'chat_inicio' => '🎬 Большой продакшн начинается! Альянс снимает «{tema}» в течение {horas} ч. Откройте «Большой продакшн» и отправьте команду.',
            'chat_fin' => '🎬 «{tema}» завершён: {pct} % · уровень «{nivel}» · {puesto}-е место на сервере. Награды пришли на почту всем, кто внёс вклад.',
            'chat_cancelada' => '🎬 Большой продакшн этой недели отменён. Извините за неудобства: следующий будет в обычный день.',
            'tema_otro' => 'мега-событие'],
        'tr' => ['push_inicio_t' => '🎬 Büyük Prodüksiyon başlıyor!', 'push_inicio_c' => 'İttifakın "{tema}" yayınını üstleniyor. Gir ve ekibini gönder: her katkı önemli.',
            'push_2h_t' => '⏰ Kapanışa 2 saat kaldı', 'push_2h_c' => '"{tema}" Büyük Prodüksiyonu yakında bitiyor ve {libres} katkın hazır.',
            'chat_inicio' => '🎬 Büyük Prodüksiyon başlıyor! İttifakımız {horas} saat boyunca "{tema}" yayınını üstleniyor. "Büyük Prodüksiyon"u açın ve ekibinizi gönderin.',
            'chat_fin' => '🎬 "{tema}" bitti: %{pct} · {nivel} seviyesi · sunucuda {puesto}. sıra. Ödüller katkı yapan herkesin posta kutusuna geldi.',
            'chat_cancelada' => '🎬 Bu haftanın Büyük Prodüksiyonu iptal edildi. Kusura bakmayın: bir sonraki her zamanki tarihte geliyor.',
            'tema_otro' => 'mega etkinlik'],
        'id' => ['push_inicio_t' => '🎬 Produksi Akbar dimulai!', 'push_inicio_c' => 'Aliansimu meliput "{tema}". Masuk dan kirim timmu: setiap kontribusi berarti.',
            'push_2h_t' => '⏰ 2 jam lagi ditutup', 'push_2h_c' => 'Produksi Akbar "{tema}" segera berakhir dan kamu punya {libres} kontribusi siap kirim.',
            'chat_inicio' => '🎬 Produksi Akbar dimulai! Aliansi kita meliput "{tema}" selama {horas} jam. Buka "Produksi Akbar" dan kirim timmu.',
            'chat_fin' => '🎬 "{tema}" selesai: {pct} % · level {nivel} · peringkat {puesto} di server. Hadiah sudah masuk ke kotak surat semua yang berkontribusi.',
            'chat_cancelada' => '🎬 Produksi Akbar minggu ini dibatalkan. Maaf atas ketidaknyamanannya: yang berikutnya datang di tanggal biasa.',
            'tema_otro' => 'mega acara'],
        'zh-CN' => ['push_inicio_t' => '🎬 大制作开始了！', 'push_inicio_c' => '你的联盟负责转播“{tema}”。快来派出你的团队：每一份贡献都算数。',
            'push_2h_t' => '⏰ 距离结束还有 2 小时', 'push_2h_c' => '大制作“{tema}”即将结束，你还有 {libres} 次贡献可用。',
            'chat_inicio' => '🎬 大制作开始了！本联盟将在 {horas} 小时内转播“{tema}”。打开“大制作”，派出你的团队吧。',
            'chat_fin' => '🎬 “{tema}”已结束：{pct}% · {nivel}级 · 服务器第 {puesto} 名。奖励已发到所有贡献者的信箱。',
            'chat_cancelada' => '🎬 本周的大制作已取消，抱歉给大家添麻烦了。下一次会在平常的日期到来。',
            'tema_otro' => '超级活动'],
    ];
    /** Nombre de cada tema en los otros idiomas (el español está en TEMAS). */
    public const TEMA_NOMBRES = [
        'en' => ['concierto_estadio' => '3-Night Concert at Sun Stadium', 'final_nacional' => 'Lightning National Tournament Grand Final', 'festival_playa' => 'Waves & Lights Beach Festival',
            'gala_estrellas' => 'Stars of the Airwaves Gala', 'maraton_nubes' => 'City of Clouds Marathon', 'feria_innovacion' => 'Pacific Innovation Fair'],
        'pt-BR' => ['concierto_estadio' => 'Show de 3 noites no Estádio do Sol', 'final_nacional' => 'Grande Final do Torneio Nacional Relâmpago', 'festival_playa' => 'Festival Ondas e Luzes na praia',
            'gala_estrellas' => 'Gala das Estrelas do Ar', 'maraton_nubes' => 'Maratona Cidade das Nuvens', 'feria_innovacion' => 'Feira de Inovação do Pacífico'],
        'fr' => ['concierto_estadio' => 'Concert de 3 soirs au Stade du Soleil', 'final_nacional' => 'Grande finale du Tournoi national Éclair', 'festival_playa' => 'Festival Vagues et Lumières sur la plage',
            'gala_estrellas' => 'Gala des Étoiles des Ondes', 'maraton_nubes' => 'Marathon de la Cité des Nuages', 'feria_innovacion' => 'Salon de l\'innovation du Pacifique'],
        'de' => ['concierto_estadio' => '3-Nächte-Konzert im Sonnenstadion', 'final_nacional' => 'Großes Finale des Nationalen Blitzturniers', 'festival_playa' => 'Strandfestival Wellen & Lichter',
            'gala_estrellas' => 'Gala der Stars auf Sendung', 'maraton_nubes' => 'Marathon Wolkenstadt', 'feria_innovacion' => 'Innovationsmesse Pazifik'],
        'it' => ['concierto_estadio' => 'Concerto di 3 serate allo Stadio del Sole', 'final_nacional' => 'Gran Finale del Torneo Nazionale Lampo', 'festival_playa' => 'Festival Onde e Luci in spiaggia',
            'gala_estrellas' => 'Gala delle Stelle dell\'Etere', 'maraton_nubes' => 'Maratona Città delle Nuvole', 'feria_innovacion' => 'Fiera dell\'Innovazione del Pacifico'],
        'ru' => ['concierto_estadio' => 'Три вечера концертов на стадионе «Солнце»', 'final_nacional' => 'Гранд-финал Национального турнира «Молния»', 'festival_playa' => 'Пляжный фестиваль «Волны и огни»',
            'gala_estrellas' => 'Гала «Звёзды эфира»', 'maraton_nubes' => 'Марафон «Город облаков»', 'feria_innovacion' => 'Тихоокеанская ярмарка инноваций'],
        'tr' => ['concierto_estadio' => 'Güneş Stadyumu\'nda 3 gecelik konser', 'final_nacional' => 'Ulusal Şimşek Turnuvası Büyük Finali', 'festival_playa' => 'Plajda Dalgalar ve Işıklar Festivali',
            'gala_estrellas' => 'Yayın Yıldızları Galası', 'maraton_nubes' => 'Bulutlar Şehri Maratonu', 'feria_innovacion' => 'Pasifik İnovasyon Fuarı'],
        'id' => ['concierto_estadio' => 'Konser 3 malam di Stadion Matahari', 'final_nacional' => 'Grand Final Turnamen Nasional Kilat', 'festival_playa' => 'Festival Ombak dan Cahaya di pantai',
            'gala_estrellas' => 'Gala Bintang Udara', 'maraton_nubes' => 'Maraton Kota Awan', 'feria_innovacion' => 'Pameran Inovasi Pasifik'],
        'zh-CN' => ['concierto_estadio' => '太阳体育场三晚演唱会', 'final_nacional' => '全国闪电杯总决赛', 'festival_playa' => '海滩浪花灯光节',
            'gala_estrellas' => '电波之星盛典', 'maraton_nubes' => '云之城马拉松', 'feria_innovacion' => '太平洋创新博览会'],
    ];
    /** Nombre de cada nivel en los otros idiomas (el español está en NOMBRE_NIVEL). */
    public const NIVEL_NOMBRES = [
        'en' => ['participacion' => 'Participation', 'bronce' => 'Bronze', 'plata' => 'Silver', 'oro' => 'Gold', 'leyenda' => 'Legend'],
        'pt-BR' => ['participacion' => 'Participação', 'bronce' => 'Bronze', 'plata' => 'Prata', 'oro' => 'Ouro', 'leyenda' => 'Lenda'],
        'fr' => ['participacion' => 'Participation', 'bronce' => 'Bronze', 'plata' => 'Argent', 'oro' => 'Or', 'leyenda' => 'Légende'],
        'de' => ['participacion' => 'Teilnahme', 'bronce' => 'Bronze', 'plata' => 'Silber', 'oro' => 'Gold', 'leyenda' => 'Legende'],
        'it' => ['participacion' => 'Partecipazione', 'bronce' => 'Bronzo', 'plata' => 'Argento', 'oro' => 'Oro', 'leyenda' => 'Leggenda'],
        'ru' => ['participacion' => 'Участие', 'bronce' => 'Бронза', 'plata' => 'Серебро', 'oro' => 'Золото', 'leyenda' => 'Легенда'],
        'tr' => ['participacion' => 'Katılım', 'bronce' => 'Bronz', 'plata' => 'Gümüş', 'oro' => 'Altın', 'leyenda' => 'Efsane'],
        'id' => ['participacion' => 'Partisipasi', 'bronce' => 'Perunggu', 'plata' => 'Perak', 'oro' => 'Emas', 'leyenda' => 'Legenda'],
        'zh-CN' => ['participacion' => '参与', 'bronce' => '铜', 'plata' => '银', 'oro' => '金', 'leyenda' => '传奇'],
    ];

    /** Extra por puesto en la tabla del servidor (solo con nivel Bronce o más). */
    public const PUESTOS = [1 => [['tipo' => 'creditos', 'cantidad' => 20]], 2 => [['tipo' => 'creditos', 'cantidad' => 15]], 3 => [['tipo' => 'creditos', 'cantidad' => 10]]];

    public const TABLA_MAX = 20;

    private static ?int $reloj = null;
    private static bool $listo = false;

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    /** Crea las tablas si todavía no están (Db::migrarModulos ya lo hace; esto es por si acaso). */
    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        if (!Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'gp_premios'")) Migraciones::aplicar('gran_produccion.sql');
        self::$listo = true;
    }

    private static function zona(): \DateTimeZone
    {
        try { return new \DateTimeZone(Config::zona() ?: self::ZONA_DEF); } catch (\Throwable) { return new \DateTimeZone(self::ZONA_DEF); }
    }

    // ------------------------------------------------------------------------------------------ ajustes y calendario
    /** {activa, dia (1-7), hora 'HH:MM', horas, tema_proximo ('' = el que toca)}. */
    public static function config(): array
    {
        $dia = (int) Ajustes::get('gp_dia', (string) self::DIA);
        $hora = Ajustes::get('gp_hora', self::HORA);
        $horas = (int) Ajustes::get('gp_horas', (string) self::HORAS);
        $tema = Ajustes::get('gp_tema_proximo', '');
        return [
            'activa' => Ajustes::get('gp_activa', '1') === '1',
            'dia' => $dia >= 1 && $dia <= 7 ? $dia : self::DIA,
            'hora' => preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora) ? $hora : self::HORA,
            'horas' => $horas >= self::HORAS_MIN && $horas <= self::HORAS_MAX ? $horas : self::HORAS,
            'tema_proximo' => isset(self::TEMAS[$tema]) ? $tema : '',
        ];
    }

    /** Cambios desde el Centro de Control (una línea de auditoría "gran_produccion_config"). */
    public static function guardarConfig(array $d, string $quien): array
    {
        $c = self::config();
        $dia = (int) ($d['dia'] ?? $c['dia']);
        $hora = (string) ($d['hora'] ?? $c['hora']);
        $horas = (int) ($d['horas'] ?? $c['horas']);
        $tema = (string) ($d['tema_proximo'] ?? $c['tema_proximo']);
        Fallo::si($dia < 1 || $dia > 7, 'El día va de 1 (lunes) a 7 (domingo).', 400, ['codigo' => 'gp_config']);
        Fallo::si(!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora), 'La hora debe ser HH:MM (24 h).', 400, ['codigo' => 'gp_config']);
        Fallo::si($horas < self::HORAS_MIN || $horas > self::HORAS_MAX, 'La duración va de ' . self::HORAS_MIN . ' a ' . self::HORAS_MAX . ' horas.', 400, ['codigo' => 'gp_config']);
        Fallo::si($tema !== '' && !isset(self::TEMAS[$tema]), 'Ese mega evento no existe.', 400, ['codigo' => 'gp_config']);
        Ajustes::guardar(['gp_activa' => !empty($d['activa'] ?? $c['activa']) ? '1' : '0', 'gp_dia' => (string) $dia, 'gp_hora' => $hora, 'gp_horas' => (string) $horas,
            'gp_tema_proximo' => $tema], $quien, 'gran_produccion_config');
        return self::config();
    }

    /** Inicio (segundos Unix) del turno semanal más reciente que ya empezó en $t (o en ahora()). */
    public static function slot(?int $t = null, ?array $c = null): int
    {
        $c ??= self::config();
        $t ??= self::ahora();
        $local = (new \DateTimeImmutable('@' . $t))->setTimezone(self::zona());
        [$h, $m] = array_map('intval', explode(':', $c['hora']));
        $atras = ((int) $local->format('N') - $c['dia'] + 7) % 7;
        $s = $local->modify('-' . $atras . ' days')->setTime($h, $m);
        if ($s->getTimestamp() > $t) $s = $s->modify('-7 days');
        return $s->getTimestamp();
    }

    public static function idDe(int $inicio): string { return (new \DateTimeImmutable('@' . $inicio))->setTimezone(self::zona())->format('Y-m-d'); }

    /** Tema de la producción que empieza en $inicio: el elegido en el panel o el que toca por la rotación semanal. */
    public static function temaPara(int $inicio, ?array $c = null): string
    {
        $c ??= self::config();
        if ($c['tema_proximo'] !== '') return $c['tema_proximo'];
        $k = array_keys(self::TEMAS);
        return $k[intdiv($inicio, 7 * 86400) % count($k)];
    }

    // ------------------------------------------------------------------------------------------ reloj perezoso
    /** Cierra la producción vencida y crea la que toca. Devuelve la producción en curso o pausada (o null). */
    public static function tick(): ?array
    {
        self::preparar();
        $t = self::ahora();
        foreach (Db::todas("SELECT id FROM gp_producciones WHERE estado = 'en_curso' AND fin <= ?", [$t]) as $f) self::cerrar((string) $f['id']);
        $c = self::config();
        if ($c['activa'] && !Db::valor("SELECT 1 FROM gp_producciones WHERE estado IN ('en_curso', 'pausada')")) {
            $s = self::slot($t, $c);
            if ($t < $s + $c['horas'] * 3600 && !Db::valor('SELECT 1 FROM gp_producciones WHERE id = ?', [self::idDe($s)])) self::crear($s, $c);
        }
        return self::actual();
    }

    public static function actual(): ?array
    {
        self::preparar();
        return Db::fila("SELECT * FROM gp_producciones WHERE estado IN ('en_curso', 'pausada') ORDER BY inicio DESC LIMIT 1") ?: null;
    }

    public static function produccion(string $id): ?array
    {
        self::preparar();
        return Db::fila('SELECT * FROM gp_producciones WHERE id = ?', [$id]) ?: null;
    }

    /** Próxima producción (si está encendida y no hay una en curso): {id, inicio, fin, horas, tema}. */
    public static function proxima(): ?array
    {
        $c = self::config();
        if (!$c['activa'] || self::actual()) return null;
        $t = self::ahora();
        $s = self::slot($t, $c);
        if (!($t < $s + $c['horas'] * 3600 && !Db::valor('SELECT 1 FROM gp_producciones WHERE id = ?', [self::idDe($s)]))) $s = (new \DateTimeImmutable('@' . $s))->setTimezone(self::zona())->modify('+7 days')->getTimestamp();
        return ['id' => self::idDe($s), 'inicio' => $s, 'fin' => $s + $c['horas'] * 3600, 'horas' => $c['horas'], 'tema' => self::temaPara($s, $c)];
    }

    private static function crear(int $inicio, array $c): void
    {
        Db::tx(function () use ($inicio, $c): void {
            if (Db::valor("SELECT 1 FROM gp_producciones WHERE estado IN ('en_curso', 'pausada')")) return;   // otra petición ya la creó
            $id = self::idDe($inicio);
            $t = self::ahora();
            $tema = self::temaPara($inicio, $c);
            $n = Db::q('INSERT OR IGNORE INTO gp_producciones (id, tema, inicio, fin, horas, estado, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$id, $tema, $inicio, $inicio + $c['horas'] * 3600, $c['horas'], 'en_curso', $t])->rowCount();
            if (!$n) return;
            if ($c['tema_proximo'] !== '') Ajustes::set('gp_tema_proximo', '');   // el elegido vale para UNA producción
            // Entran todas las asociaciones con miembros: meta según sus activos, y la foto del contador de eventos de cada miembro
            $asocs = Db::todas('SELECT am.asociacion_id, ' . self::sqlActivos() . ' AS activos FROM asociacion_miembros am
                JOIN asociaciones a ON a.id = am.asociacion_id JOIN jugadores j ON j.id = am.jugador_id LEFT JOIN partidas p ON p.jugador_id = am.jugador_id
                GROUP BY am.asociacion_id', [$t - self::ACTIVO_DIAS * 86400]);
            foreach ($asocs as $a) self::insertarAsoc($id, (int) $a['asociacion_id'], (int) $a['activos']);
            Db::q("INSERT OR IGNORE INTO gp_miembros (produccion_id, jugador_id, asociacion_id, ultimo_eventos, actualizado)
                   SELECT ?, am.jugador_id, am.asociacion_id, CASE WHEN json_valid(p.datos) THEN json_extract(p.datos, '$.stats.events') END, ?
                   FROM asociacion_miembros am LEFT JOIN partidas p ON p.jugador_id = am.jugador_id", [$id, $t]);
            $nom = self::TEMAS[$tema]['nombre'];
            foreach ($asocs as $a) self::chatAsoc((int) $a['asociacion_id'], 'chat_inicio', ['tema' => $tema, 'horas' => $c['horas']]);
            self::auditar('juego', 'gran_produccion_inicio', 'Producción ' . $id . ' «' . $nom . '» (' . $c['horas'] . ' h): ' . count($asocs) . ' asociaciones');
        });
    }

    /** SUM de miembros activos en los últimos ACTIVO_DIAS (necesita j, p y el parámetro "desde"). */
    private static function sqlActivos(): string
    {
        return 'SUM(CASE WHEN MAX(COALESCE(j.ultimo_ingreso, 0), COALESCE(p.actualizado, 0), j.creado) >= CAST(? AS INTEGER) THEN 1 ELSE 0 END)';
    }

    /** El servidor de cada asociación se lee de `asociaciones` (si una fusión la mueve, su fila la sigue sin reglas extra). */
    private static function insertarAsoc(string $prod, int $a, int $activos): void
    {
        $act = max(1, min(Social::MAX_MIEMBROS, $activos));
        Db::q('INSERT OR IGNORE INTO gp_asociaciones (produccion_id, asociacion_id, activos, meta_personal, meta_equipos, meta_transmision, creado)
               VALUES (?, ?, ?, ?, ?, ?, ?)', [$prod, $a, $act, self::FRENTES['personal']['meta'] * $act, self::FRENTES['equipos']['meta'] * $act,
            self::FRENTES['transmision']['meta'] * $act, self::ahora()]);
    }

    /** Fila de la asociación en la producción (la crea si la asociación es nueva). */
    private static function asocFila(string $prod, int $a): array
    {
        $f = Db::fila('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', [$prod, $a]);
        if ($f) return $f;
        $x = Db::fila('SELECT ' . self::sqlActivos() . ' AS activos FROM asociacion_miembros am
            JOIN jugadores j ON j.id = am.jugador_id LEFT JOIN partidas p ON p.jugador_id = am.jugador_id WHERE am.asociacion_id = ? GROUP BY am.asociacion_id',
            [self::ahora() - self::ACTIVO_DIAS * 86400, $a]);
        self::insertarAsoc($prod, $a, $x ? (int) $x['activos'] : 1);
        return Db::fila('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', [$prod, $a]);
    }

    private static function eventosDe(int $j): ?int
    {
        $v = Db::valor("SELECT CASE WHEN json_valid(datos) THEN json_extract(datos, '$.stats.events') END FROM partidas WHERE jugador_id = ?", [$j]);
        return is_numeric($v) ? max(0, (int) $v) : null;
    }

    /** Fila de la productora en la producción (la crea con la foto de su contador de eventos). */
    private static function miembroFila(string $prod, int $j, int $a): array
    {
        $f = Db::fila('SELECT * FROM gp_miembros WHERE produccion_id = ? AND jugador_id = ?', [$prod, $j]);
        if ($f) return $f;
        Db::q('INSERT OR IGNORE INTO gp_miembros (produccion_id, jugador_id, asociacion_id, ultimo_eventos, actualizado) VALUES (?, ?, ?, ?, ?)',
            [$prod, $j, $a, self::eventosDe($j), self::ahora()]);
        return Db::fila('SELECT * FROM gp_miembros WHERE produccion_id = ? AND jugador_id = ?', [$prod, $j]);
    }

    /** Segundos que le faltan para poder aportar (0 = ya puede): 24 h en la asociación o estar desde antes de empezar. */
    public static function espera(array $prod, int $desde): int
    {
        if ($desde <= (int) $prod['inicio']) return 0;
        return max(0, $desde + self::ANTIGUEDAD_SEG - self::ahora());
    }

    /** Segundos de producción que ya corrieron (sin las pausas). */
    private static function transcurrido(array $prod): int
    {
        $t = min(self::ahora(), (int) $prod['fin']);
        $pausa = (int) $prod['pausa_total'] + ($prod['estado'] === 'pausada' && $prod['pausada_en'] !== null ? max(0, self::ahora() - (int) $prod['pausada_en']) : 0);
        return max(0, $t - (int) $prod['inicio'] - $pausa);
    }

    /** Turnos ganados hasta ahora en un frente con 'cada' (el primero al empezar), sin pasar el máximo. */
    public static function turnos(array $prod, string $frente): int
    {
        $F = self::FRENTES[$frente];
        if ($F['cada'] === null) return $F['max'];
        return min($F['max'], 1 + intdiv(self::transcurrido($prod), $F['cada']));
    }

    /** Segundos hasta el próximo turno (null si ya ganó todos). */
    private static function proximoTurno(array $prod, string $frente): ?int
    {
        $F = self::FRENTES[$frente];
        if ($F['cada'] === null || self::turnos($prod, $frente) >= $F['max']) return null;
        return $F['cada'] - self::transcurrido($prod) % $F['cada'];
    }

    // ------------------------------------------------------------------------------------------ aportes
    public static function progresoDe(array $a): int
    {
        $sum = 0; $meta = 0;
        foreach (array_keys(self::FRENTES) as $f) { $m = max(1, (int) $a['meta_' . $f]); $meta += $m; $sum += min((int) $a[$f], 2 * $m); }
        return min(200, intdiv(100 * $sum, max(1, $meta)));
    }

    public static function nivelDe(int $pct): ?string
    {
        $n = null;
        foreach (self::NIVELES as $k => $N) if ($pct >= $N['pct']) $n = $k;
        return $n;
    }

    private static function registrar(string $prod, int $a, int $j, string $frente, int $n): void
    {
        if ($n <= 0) return;
        $t = self::ahora();
        Db::q('INSERT INTO gp_aportes (produccion_id, asociacion_id, jugador_id, frente, cantidad, creado) VALUES (?, ?, ?, ?, ?, ?)', [$prod, $a, $j, $frente, $n, $t]);
        Db::q("UPDATE gp_miembros SET $frente = $frente + ?, actualizado = ? WHERE produccion_id = ? AND jugador_id = ?", [$n, $t, $prod, $j]);
        $fila = self::asocFila($prod, $a);
        Db::q("UPDATE gp_asociaciones SET $frente = $frente + ? WHERE produccion_id = ? AND asociacion_id = ?", [$n, $prod, $a]);
        $fila[$frente] = (int) $fila[$frente] + $n;
        $p = self::progresoDe($fila);
        if ($p > (int) $fila['progreso']) Db::q('UPDATE gp_asociaciones SET progreso = ?, alcanzado = ? WHERE produccion_id = ? AND asociacion_id = ?', [$p, $t, $prod, $a]);
    }

    /**
     * Cuenta las transmisiones nuevas de una productora: los eventos de su partida en la nube desde la última vez (solo si
     * sigue en la misma asociación, ya puede aportar y la producción corre). Devuelve cuántas sumó.
     */
    private static function sincronizar(array $prod, int $j): int
    {
        $m = Social::miembro($j);
        if (!$m) return 0;
        $a = (int) $m['asociacion_id'];
        $f = self::miembroFila($prod['id'], $j, $a);
        if ((int) $f['asociacion_id'] !== $a) return 0;
        $e = self::eventosDe($j);
        if ($e === null) return 0;
        $ult = $f['ultimo_eventos'];
        $suma = 0;
        if ($ult !== null && $e > (int) $ult && $prod['estado'] === 'en_curso' && self::espera($prod, (int) $m['desde']) === 0) {
            $suma = min($e - (int) $ult, self::FRENTES['transmision']['max'] - (int) $f['transmision']);
            if ($suma > 0) self::registrar($prod['id'], $a, $j, 'transmision', $suma);
        }
        if ($ult === null || $e !== (int) $ult) Db::q('UPDATE gp_miembros SET ultimo_eventos = ?, actualizado = ? WHERE produccion_id = ? AND jugador_id = ?', [$e, self::ahora(), $prod['id'], $j]);
        return max(0, $suma);
    }

    /** POST /api/gran/aportar {frente: personal|equipos}: manda todos los turnos que tenga listos de ese frente. */
    public static function aportar(int $j, string $frente): array
    {
        Cuentas::exigirActiva($j);
        Fallo::si(!in_array($frente, ['personal', 'equipos'], true), 'Eso no se puede aportar así.', 400, ['codigo' => 'datos_invalidos']);
        $r = Db::tx(function () use ($j, $frente): array {
            $prod = self::tick();
            Fallo::si(!$prod, 'No hay una Gran Producción en curso.', 409, ['codigo' => 'gp_no_hay']);
            Fallo::si($prod['estado'] === 'pausada', 'La Gran Producción está en pausa. Vuelve en un rato.', 409, ['codigo' => 'gp_pausada']);
            $m = Social::miembro($j);
            Fallo::si(!$m, 'Únete a una asociación primero.', 409, ['codigo' => 'sin_asociacion']);
            $esp = self::espera($prod, (int) $m['desde']);
            Fallo::si($esp > 0, 'Llevas menos de 24 horas en tu asociación: podrás aportar en ' . self::horas($esp) . '.', 409, ['codigo' => 'gp_miembro_nuevo', 'espera' => $esp]);
            $a = (int) $m['asociacion_id'];
            $f = self::miembroFila($prod['id'], $j, $a);
            Fallo::si((int) $f['asociacion_id'] !== $a, 'En esta Gran Producción ya aportaste con otra asociación.', 409, ['codigo' => 'gp_otra_asociacion']);
            $F = self::FRENTES[$frente];
            Fallo::si((int) $f[$frente] >= $F['max'], 'Ya aportaste todo lo que se puede en este frente.', 409, ['codigo' => 'gp_tope', 'max' => $F['max']]);
            $n = self::turnos($prod, $frente) - (int) $f[$frente];
            if ($n <= 0) {
                $s = self::proximoTurno($prod, $frente) ?? 0;
                throw new Fallo('Tu próximo turno llega en ' . self::horas($s) . '.', 409, ['codigo' => 'gp_espera', 'espera' => $s]);
            }
            self::registrar($prod['id'], $a, $j, $frente, $n);
            self::sincronizar($prod, $j);
            return ['aporte' => ['frente' => $frente, 'cantidad' => $n]];
        });
        return $r + self::vista($j);
    }

    private static function horas(int $seg): string
    {
        $h = intdiv($seg, 3600); $m = intdiv($seg % 3600, 60);
        return $h > 0 ? $h . ' h ' . $m . ' min' : max(1, $m) . ' min';
    }

    // ------------------------------------------------------------------------------------------ cierre, pausa y cancelación
    /** Cierra una producción en curso: cuenta las últimas transmisiones, niveles, puestos y premios al buzón. */
    public static function cerrar(string $id): array
    {
        self::preparar();
        return Db::tx(function () use ($id): array {
            $prod = self::produccion($id);
            if (!$prod || $prod['estado'] !== 'en_curso') return ['cerrada' => false];
            foreach (Db::todas('SELECT jugador_id FROM gp_miembros WHERE produccion_id = ?', [$id]) as $mm) self::sincronizar($prod, (int) $mm['jugador_id']);
            $t = self::ahora();
            // Puestos por servidor (solo con progreso)
            $porSrv = [];
            foreach (Db::todas('SELECT g.*, s.servidor_id FROM gp_asociaciones g JOIN asociaciones s ON s.id = g.asociacion_id
                                WHERE g.produccion_id = ? AND g.progreso > 0 ORDER BY s.servidor_id, g.progreso DESC, g.alcanzado, g.asociacion_id', [$id]) as $a) {
                $porSrv[$a['servidor_id']] = ($porSrv[$a['servidor_id']] ?? 0) + 1;
                Db::q('UPDATE gp_asociaciones SET nivel = ?, puesto = ? WHERE produccion_id = ? AND asociacion_id = ?', [self::nivelDe((int) $a['progreso']), $porSrv[$a['servidor_id']], $id, $a['asociacion_id']]);
            }
            $tema = self::TEMAS[$prod['tema']]['nombre'] ?? $prod['tema'];
            $entregados = 0;
            $filas = Db::todas('SELECT m.*, a.nivel, a.puesto, a.progreso FROM gp_miembros m JOIN gp_asociaciones a ON a.produccion_id = m.produccion_id AND a.asociacion_id = m.asociacion_id
                                WHERE m.produccion_id = ? AND (m.personal + m.equipos + m.transmision) > 0 AND a.nivel IS NOT NULL', [$id]);
            foreach ($filas as $f) {
                $prem = Buzon::normalizarAdjuntos(self::premiosPara((string) $f['nivel'], $f['puesto'] === null ? null : (int) $f['puesto']));
                $j = (int) $f['jugador_id'];
                $n = Db::q('INSERT OR IGNORE INTO gp_premios (produccion_id, jugador_id, asociacion_id, nivel, puesto, adjuntos_json, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$id, $j, $f['asociacion_id'], $f['nivel'], $f['puesto'], json_encode($prem, JSON_UNESCAPED_UNICODE), $t])->rowCount();
                if (!$n) continue;
                try {
                    // tema y nivel con los nombres de cada idioma (self::texto con la "clave" '{tema}' devuelve solo el nombre)
                    $mid = Buzon::enviarPlantilla($j, 'gp_premio_t', 'gp_premio_c', [
                        'nivel' => fn(string $L) => self::texto('{nivel}', $L, ['nivel' => $f['nivel']]),
                        'tema' => fn(string $L) => self::texto('{tema}', $L, ['tema' => $prod['tema']]),
                        'pct' => $f['progreso'], 'personal' => $f['personal'], 'equipos' => $f['equipos'], 'transmision' => $f['transmision'],
                        'puesto' => fn(string $L) => (int) $f['puesto'] <= 3 ? TextosSistema::texto('gp_premio_puesto', $L, ['puesto' => $f['puesto']]) : '',
                    ], $prem, ['tipo' => 'evento', 'ref' => 'gp:' . $id, 'dias' => 14]);
                    if ($mid) Db::q('UPDATE gp_premios SET buzon_id = ? WHERE produccion_id = ? AND jugador_id = ?', [$mid, $id, $j]);
                    $entregados++;
                } catch (\Throwable $e) {
                    error_log('EN VIVO gran_produccion premio ' . $id . ' jugador ' . $j . ': ' . mb_substr($e->getMessage(), 0, 200));
                }
            }
            foreach (Db::todas('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND progreso > 0', [$id]) as $a) {
                self::chatAsoc((int) $a['asociacion_id'], 'chat_fin', ['tema' => $prod['tema'], 'pct' => $a['progreso'], 'nivel' => $a['nivel'], 'puesto' => $a['puesto']]);
            }
            Db::q("UPDATE gp_producciones SET estado = 'cerrada', cerrado = ? WHERE id = ?", [$t, $id]);
            self::auditar('juego', 'gran_produccion_cierre', 'Producción ' . $id . ' cerrada: ' . $entregados . ' premios al buzón');
            return ['cerrada' => true, 'premios' => $entregados];
        });
    }

    /** Premios de un nivel + los de su puesto (puesto solo con Bronce o más), sumando los iguales. */
    public static function premiosPara(string $nivel, ?int $puesto): array
    {
        $lista = self::NIVELES[$nivel]['premios'] ?? [];
        if ($puesto !== null && isset(self::PUESTOS[$puesto]) && self::NIVELES[$nivel]['pct'] >= self::NIVELES['bronce']['pct']) $lista = array_merge($lista, self::PUESTOS[$puesto]);
        $o = [];
        foreach ($lista as $p) {
            $k = $p['tipo'] . ':' . ($p['item'] ?? '-');
            if (isset($o[$k])) $o[$k]['cantidad'] += $p['cantidad']; else $o[$k] = ['tipo' => $p['tipo'], 'item' => $p['item'] ?? '-', 'cantidad' => $p['cantidad']];
        }
        return array_values($o);
    }

    public static function pausar(string $quien): array
    {
        return Db::tx(function () use ($quien): array {
            $p = self::tick();
            Fallo::si(!$p || $p['estado'] !== 'en_curso', 'No hay una Gran Producción en curso para pausar.', 409, ['codigo' => 'gp_no_hay']);
            Db::q("UPDATE gp_producciones SET estado = 'pausada', pausada_en = ? WHERE id = ?", [self::ahora(), $p['id']]);
            self::auditar($quien, 'gran_produccion_pausa', 'Producción ' . $p['id'] . ' en pausa');
            return self::produccion($p['id']);
        });
    }

    public static function reanudar(string $quien): array
    {
        return Db::tx(function () use ($quien): array {
            $p = self::actual();
            Fallo::si(!$p || $p['estado'] !== 'pausada', 'No hay una Gran Producción en pausa.', 409, ['codigo' => 'gp_no_hay']);
            $dur = max(0, self::ahora() - (int) $p['pausada_en']);
            Db::q("UPDATE gp_producciones SET estado = 'en_curso', pausada_en = NULL, pausa_total = pausa_total + ?, fin = fin + ? WHERE id = ?", [$dur, $dur, $p['id']]);
            self::auditar($quien, 'gran_produccion_reanudar', 'Producción ' . $p['id'] . ' sigue (pausa de ' . self::horas($dur) . '; termina ' . date('d/m/Y H:i', (int) $p['fin'] + $dur) . ')');
            return self::produccion($p['id']);
        });
    }

    /** Cancela la producción en curso o en pausa: no hay premios; se avisa en el chat de cada asociación. */
    public static function cancelar(string $quien, string $motivo = ''): array
    {
        return Db::tx(function () use ($quien, $motivo): array {
            $p = self::actual();
            Fallo::si(!$p, 'No hay una Gran Producción para cancelar.', 409, ['codigo' => 'gp_no_hay']);
            $motivo = mb_substr(trim($motivo), 0, 200);
            Db::q("UPDATE gp_producciones SET estado = 'cancelada', cerrado = ?, nota = ? WHERE id = ?", [self::ahora(), $motivo !== '' ? $motivo : null, $p['id']]);
            foreach (Db::todas('SELECT asociacion_id FROM gp_asociaciones WHERE produccion_id = ?', [$p['id']]) as $a)
                self::chatAsoc((int) $a['asociacion_id'], 'chat_cancelada');
            self::auditar($quien, 'gran_produccion_cancelar', 'Producción ' . $p['id'] . ' cancelada' . ($motivo !== '' ? ': ' . $motivo : ''));
            return self::produccion($p['id']);
        });
    }

    // ------------------------------------------------------------------------------------------ vistas
    private static function prodJson(array $p): array
    {
        $t = self::ahora();
        return ['id' => $p['id'], 'tema' => $p['tema'], 'icono' => self::TEMAS[$p['tema']]['icono'] ?? '🎬', 'nombre' => self::TEMAS[$p['tema']]['nombre'] ?? $p['tema'],
            'estado' => $p['estado'] ?? 'pronto', 'inicio' => Db::iso((int) $p['inicio']), 'fin' => Db::iso((int) $p['fin']), 'horas' => (int) $p['horas'],
            'empieza_seg' => max(0, (int) $p['inicio'] - $t), 'quedan_seg' => ($p['estado'] ?? '') === 'pausada' ? max(0, (int) $p['fin'] - (int) $p['pausada_en']) : max(0, (int) $p['fin'] - $t)];
    }

    public static function reglas(): array
    {
        $niv = [];
        foreach (self::NIVELES as $k => $N) $niv[] = ['id' => $k, 'pct' => $N['pct'], 'premios' => Buzon::adjuntosJson(Buzon::normalizarAdjuntos($N['premios']))];
        $pue = [];
        foreach (self::PUESTOS as $k => $P) $pue[] = ['puesto' => $k, 'premios' => Buzon::adjuntosJson(Buzon::normalizarAdjuntos($P))];
        $fr = [];
        foreach (self::FRENTES as $k => $F) $fr[] = ['id' => $k, 'max' => $F['max'], 'meta' => $F['meta'], 'cada_seg' => $F['cada']];
        return ['frentes' => $fr, 'niveles' => $niv, 'puestos' => $pue, 'antiguedad_seg' => self::ANTIGUEDAD_SEG, 'tope_progreso' => 200];
    }

    /** Tabla del servidor: los TABLA_MAX primeros (y la mía si quedó afuera). */
    public static function tabla(string $prod, int $servidor, ?int $mia = null): array
    {
        $filas = Db::todas('SELECT g.*, a.nombre, a.siglas, a.color FROM gp_asociaciones g JOIN asociaciones a ON a.id = g.asociacion_id
                            WHERE g.produccion_id = ? AND a.servidor_id = ? AND g.progreso > 0 ORDER BY g.progreso DESC, g.alcanzado, g.asociacion_id', [$prod, $servidor]);
        $o = [];
        foreach ($filas as $i => $f) {
            $es = $mia !== null && (int) $f['asociacion_id'] === $mia;
            if ($i >= self::TABLA_MAX && !$es) continue;
            $o[] = ['posicion' => $i + 1, 'asociacion_id' => (int) $f['asociacion_id'], 'nombre' => $f['nombre'], 'siglas' => $f['siglas'], 'color' => $f['color'],
                'progreso' => (int) $f['progreso'], 'nivel' => self::nivelDe((int) $f['progreso']), 'activos' => (int) $f['activos'], 'mia' => $es];
        }
        return $o;
    }

    /** Resumen de la última producción terminada para una asociación (y mi premio). */
    private static function ultima(?int $a, int $j): ?array
    {
        $p = Db::fila("SELECT * FROM gp_producciones WHERE estado IN ('cerrada', 'cancelada') ORDER BY inicio DESC LIMIT 1");
        if (!$p) return null;
        $o = self::prodJson($p) + ['asociacion' => null, 'premio' => null];
        if ($a !== null && ($g = Db::fila('SELECT * FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', [$p['id'], $a]))) {
            $o['asociacion'] = ['progreso' => (int) $g['progreso'], 'nivel' => $g['nivel'], 'puesto' => $g['puesto'] === null ? null : (int) $g['puesto']];
        }
        if ($pr = Db::fila('SELECT * FROM gp_premios WHERE produccion_id = ? AND jugador_id = ?', [$p['id'], $j])) {
            $o['premio'] = ['nivel' => $pr['nivel'], 'puesto' => $pr['puesto'] === null ? null : (int) $pr['puesto'], 'premios' => Buzon::adjuntosJson(json_decode((string) $pr['adjuntos_json'], true) ?: [])];
        }
        return $o;
    }

    /** GET /api/gran: todo lo de la pantalla. */
    public static function vista(int $j): array
    {
        $prod = self::tick();
        $m = Social::miembro($j);
        $a = $m ? (int) $m['asociacion_id'] : null;
        $o = ['ok' => true, 'ahora' => Db::iso(self::ahora()), 'fase' => $prod ? $prod['estado'] : (self::config()['activa'] ? 'pronto' : 'apagada'),
            'reglas' => self::reglas(), 'produccion' => $prod ? self::prodJson($prod) : null, 'proxima' => null, 'en_asociacion' => $a !== null,
            'asociacion' => null, 'yo' => null, 'miembros' => [], 'tabla' => [], 'ultima' => self::ultima($a, $j)];
        if (!$prod) {
            $px = self::proxima();
            if ($px) $o['proxima'] = self::prodJson($px + ['estado' => 'pronto']);
            return $o;
        }
        if ($a === null) return $o;
        Db::tx(function () use ($prod, $a): void {
            foreach (Db::todas('SELECT jugador_id FROM asociacion_miembros WHERE asociacion_id = ?', [$a]) as $x) self::sincronizar($prod, (int) $x['jugador_id']);
        });
        $g = self::asocFila($prod['id'], $a);
        $info = Db::fila('SELECT nombre, siglas, color FROM asociaciones WHERE id = ?', [$a]) ?: ['nombre' => '', 'siglas' => '', 'color' => ''];
        $pct = (int) $g['progreso'];
        $niv = self::nivelDe($pct);
        $sig = null;
        foreach (self::NIVELES as $k => $N) if ($N['pct'] > $pct) { $sig = ['id' => $k, 'pct' => $N['pct']]; break; }
        $tabla = self::tabla($prod['id'], (int) $m['servidor_id'], $a);
        $mio = array_values(array_filter($tabla, fn($x) => $x['mia']));
        $metas = []; $tot = [];
        foreach (array_keys(self::FRENTES) as $f) { $metas[$f] = (int) $g['meta_' . $f]; $tot[$f] = (int) $g[$f]; }
        $o['asociacion'] = ['id' => $a, 'nombre' => $info['nombre'], 'siglas' => $info['siglas'], 'color' => $info['color'], 'activos' => (int) $g['activos'],
            'metas' => $metas, 'totales' => $tot, 'progreso' => $pct, 'nivel' => $niv, 'siguiente' => $sig, 'puesto' => $mio ? $mio[0]['posicion'] : null];
        $f = Db::fila('SELECT * FROM gp_miembros WHERE produccion_id = ? AND jugador_id = ?', [$prod['id'], $j]);
        $otra = $f && (int) $f['asociacion_id'] !== $a;
        $yo = ['espera' => self::espera($prod, (int) $m['desde']), 'otra_asociacion' => $otra, 'aportes' => [], 'disponibles' => [], 'proximo_seg' => [], 'max' => []];
        foreach (self::FRENTES as $k => $F) {
            $hecho = $f && !$otra ? (int) $f[$k] : 0;
            $yo['aportes'][$k] = $hecho;
            $yo['max'][$k] = $F['max'];
            if ($F['cada'] !== null) {
                $yo['disponibles'][$k] = $otra || $hecho >= $F['max'] ? 0 : max(0, self::turnos($prod, $k) - $hecho);
                $yo['proximo_seg'][$k] = $yo['disponibles'][$k] === 0 && $hecho < $F['max'] ? self::proximoTurno($prod, $k) : null;
            }
        }
        $yo['aporto'] = array_sum($yo['aportes']) > 0;
        $o['yo'] = $yo;
        $mi = Db::todas('SELECT am.jugador_id, am.cargo, j.alias, j.nombre, COALESCE(g.personal, 0) AS personal, COALESCE(g.equipos, 0) AS equipos, COALESCE(g.transmision, 0) AS transmision,
                g.asociacion_id AS g_asoc FROM asociacion_miembros am JOIN jugadores j ON j.id = am.jugador_id
                LEFT JOIN gp_miembros g ON g.produccion_id = ? AND g.jugador_id = am.jugador_id WHERE am.asociacion_id = ?', [$prod['id'], $a]);
        $o['miembros'] = array_map(function ($x) use ($a, $j) {
            $ok = $x['g_asoc'] === null || (int) $x['g_asoc'] === $a;   // lo aportado con otra asociación no cuenta aquí
            $p = $ok ? (int) $x['personal'] : 0; $e = $ok ? (int) $x['equipos'] : 0; $t = $ok ? (int) $x['transmision'] : 0;
            return ['jugador_id' => (int) $x['jugador_id'], 'nombre' => Social::nombrePublico($x['alias'], $x['nombre']), 'cargo' => $x['cargo'],
                'personal' => $p, 'equipos' => $e, 'transmision' => $t, 'total' => $p + $e + $t, 'yo' => (int) $x['jugador_id'] === $j];
        }, $mi);
        usort($o['miembros'], fn($x, $y) => [$y['total'], $x['nombre']] <=> [$x['total'], $y['nombre']]);
        $o['tabla'] = $tabla;
        return $o;
    }

    /** GET /api/gran/resumen: liviano, para la franja de Inicio y el botón del chat. */
    public static function resumen(int $j): array
    {
        $prod = self::tick();
        $o = ['ok' => true, 'fase' => $prod ? $prod['estado'] : (self::config()['activa'] ? 'pronto' : 'apagada'), 'produccion' => $prod ? self::prodJson($prod) : null,
            'en_asociacion' => false, 'progreso' => null, 'disponibles' => 0, 'espera' => 0];
        $m = Social::miembro($j);
        if (!$m) return $o;
        $o['en_asociacion'] = true;
        if (!$prod) return $o;
        $a = (int) $m['asociacion_id'];
        $g = Db::fila('SELECT progreso FROM gp_asociaciones WHERE produccion_id = ? AND asociacion_id = ?', [$prod['id'], $a]);
        $o['progreso'] = $g ? (int) $g['progreso'] : 0;
        $o['espera'] = self::espera($prod, (int) $m['desde']);
        $f = Db::fila('SELECT * FROM gp_miembros WHERE produccion_id = ? AND jugador_id = ?', [$prod['id'], $j]);
        if ($prod['estado'] === 'en_curso' && $o['espera'] === 0 && (!$f || (int) $f['asociacion_id'] === $a)) {
            foreach (self::FRENTES as $k => $F) if ($F['cada'] !== null) $o['disponibles'] += max(0, self::turnos($prod, $k) - ($f ? (int) $f[$k] : 0));
        }
        return $o;
    }

    // ------------------------------------------------------------------------------------------ avisos push
    /** Detector para Push::detectar(): aviso de inicio y "faltan 2 h". Devuelve cuántos avisos encoló. */
    public static function detectarPush(): int
    {
        $p = self::tick();
        if (!$p || $p['estado'] !== 'en_curso') return 0;
        $t = self::ahora();
        $n = 0;
        $suscritos = 'SELECT DISTINCT am.jugador_id, am.asociacion_id, am.desde FROM asociacion_miembros am JOIN push_suscripciones ps ON ps.jugador_id = am.jugador_id';
        if (!(int) $p['push_inicio']) {
            Db::q('UPDATE gp_producciones SET push_inicio = 1 WHERE id = ?', [$p['id']]);
            if ($t < (int) $p['inicio'] + 6 * 3600) {
                foreach (Db::todas($suscritos) as $x) {
                    $L = Push::idiomaJugador((int) $x['jugador_id']);
                    if (Push::encolar((int) $x['jugador_id'], 'liga', self::texto('push_inicio_t', $L), self::texto('push_inicio_c', $L, ['tema' => $p['tema']]),
                        '/?ir=gran', ['clave' => 'gp:' . $p['id'] . ':inicio', 'vence' => (int) $p['inicio'] + 8 * 3600]) !== null) $n++;
                }
            }
        }
        if (!(int) $p['push_2h'] && $t >= (int) $p['fin'] - 2 * 3600 && $t < (int) $p['fin']) {
            Db::q('UPDATE gp_producciones SET push_2h = 1 WHERE id = ?', [$p['id']]);
            foreach (Db::todas($suscritos) as $x) {
                if (self::espera($p, (int) $x['desde']) > 0) continue;
                $f = Db::fila('SELECT * FROM gp_miembros WHERE produccion_id = ? AND jugador_id = ?', [$p['id'], $x['jugador_id']]);
                if ($f && (int) $f['asociacion_id'] !== (int) $x['asociacion_id']) continue;
                $libres = 0;
                foreach (self::FRENTES as $k => $F) if ($F['cada'] !== null) $libres += max(0, self::turnos($p, $k) - ($f ? (int) $f[$k] : 0));
                if ($libres <= 0) continue;   // ya aportó todo lo que podía: no se le molesta
                $L = Push::idiomaJugador((int) $x['jugador_id']);
                if (Push::encolar((int) $x['jugador_id'], 'liga', self::texto('push_2h_t', $L), self::texto('push_2h_c', $L, ['tema' => $p['tema'], 'libres' => $libres]),
                    '/?ir=gran', ['clave' => 'gp:' . $p['id'] . ':2h', 'vence' => (int) $p['fin']]) !== null) $n++;
            }
        }
        return $n;
    }

    // ------------------------------------------------------------------------------------------ Centro de Control
    /** Producción en curso (o la última) con la tabla de cada servidor, y las últimas producciones con sus números. */
    public static function panel(): array
    {
        $prod = self::tick();
        $ver = $prod ?: (Db::fila('SELECT * FROM gp_producciones ORDER BY inicio DESC LIMIT 1') ?: null);
        $tablas = [];
        if ($ver) {
            foreach (Db::todas('SELECT g.*, a.nombre, a.siglas, a.servidor_id, s.nombre AS servidor, (SELECT COUNT(*) FROM gp_miembros m WHERE m.produccion_id = g.produccion_id AND m.asociacion_id = g.asociacion_id
                    AND (m.personal + m.equipos + m.transmision) > 0) AS aportantes FROM gp_asociaciones g JOIN asociaciones a ON a.id = g.asociacion_id
                    LEFT JOIN servidores s ON s.id = a.servidor_id WHERE g.produccion_id = ? ORDER BY a.servidor_id, g.progreso DESC, g.alcanzado, g.asociacion_id LIMIT 500', [$ver['id']]) as $f) {
                $tablas[$f['servidor_id']]['nombre'] = $f['servidor'] ?? ('Servidor ' . $f['servidor_id']);
                $tablas[$f['servidor_id']]['filas'][] = $f;
            }
        }
        $hist = Db::todas('SELECT p.*, (SELECT COUNT(*) FROM gp_asociaciones g WHERE g.produccion_id = p.id AND g.progreso > 0) AS asocs,
                (SELECT COUNT(*) FROM gp_miembros m WHERE m.produccion_id = p.id AND (m.personal + m.equipos + m.transmision) > 0) AS aportantes,
                (SELECT COUNT(*) FROM gp_premios r WHERE r.produccion_id = p.id) AS premios FROM gp_producciones p ORDER BY p.inicio DESC LIMIT 12');
        return ['config' => self::config(), 'actual' => $prod, 'ver' => $ver, 'proxima' => self::proxima(), 'tablas' => $tablas, 'historial' => $hist];
    }

    // ------------------------------------------------------------------------------------------ utilidades
    /**
     * Texto de TEXTOS en un idioma (si falta, español) con los marcadores puestos. {tema} y {nivel} llegan como clave
     * (concierto_estadio, plata...) y se cambian por su nombre en ese idioma.
     */
    public static function texto(string $clave, string $idioma, array $v = []): string
    {
        $L = isset(self::TEXTOS[$idioma]) ? $idioma : 'es';
        if (array_key_exists('tema', $v)) {
            $k = (string) $v['tema'];
            $v['tema'] = isset(self::TEMAS[$k]) ? ($L === 'es' ? self::TEMAS[$k]['nombre'] : (self::TEMA_NOMBRES[$L][$k] ?? self::TEMAS[$k]['nombre'])) : self::TEXTOS[$L]['tema_otro'];
        }
        if (array_key_exists('nivel', $v)) {
            $k = (string) $v['nivel'];
            $v['nivel'] = $L === 'es' ? (self::NOMBRE_NIVEL[$k] ?? $k) : (self::NIVEL_NOMBRES[$L][$k] ?? self::NOMBRE_NIVEL[$k] ?? $k);
        }
        $t = self::TEXTOS[$L][$clave] ?? self::TEXTOS['es'][$clave] ?? $clave;
        return preg_replace_callback('/\{(\w+)\}/', fn($m) => array_key_exists($m[1], $v) ? (string) $v[$m[1]] : $m[0], $t) ?? $t;
    }

    /** Aviso en el chat de una asociación: texto en español y los 10 idiomas en textos_json (Chat elige el de quien lee). */
    private static function chatAsoc(int $a, string $clave, array $v = []): void
    {
        $txt = [];
        foreach (array_keys(self::TEXTOS) as $L) $txt[$L] = mb_substr(self::texto($clave, $L, $v), 0, 300);
        try {
            try {
                Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, textos_json, creado) VALUES (?, NULL, ?, ?, ?)',
                    ['asociacion:' . $a, $txt['es'], json_encode($txt, JSON_UNESCAPED_UNICODE), self::ahora()]);
            } catch (\PDOException $e) {
                if (!str_contains($e->getMessage(), 'textos_json')) throw $e;
                Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, creado) VALUES (?, NULL, ?, ?)', ['asociacion:' . $a, $txt['es'], self::ahora()]);   // base sin la columna todavía
            }
        } catch (\Throwable $e) { error_log('EN VIVO gran_produccion chat: ' . $e->getMessage()); }
    }

    private static function auditar(string $quien, string $accion, string $detalle): void
    {
        try { Auditoria::anotar($quien, $accion, $detalle); } catch (\Throwable $e) { error_log('EN VIVO gran_produccion auditoría: ' . $e->getMessage()); }
    }
}
