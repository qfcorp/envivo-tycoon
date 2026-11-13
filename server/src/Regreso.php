<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Avisos por etapa del jugador y regreso ("¡Volviste!"). Guía: server/INTEGRAR_REGRESO.md. Tablas: migraciones/regreso.sql.
 *
 * 1) Notificaciones push por etapa (con Push::encolar; las vacía bin/push_enviar.php como todas):
 *    día 1 (20 h después de crear la cuenta), día 2 (premio diario), día 3 (el rival MegaVisión), Liga y Duelos a 2 h del
 *    cierre (con el puesto) y 3 / 7 / 14 días sin entrar. Reglas (además de las de Push): máximo Push::TOPE_REGRESO (2) al
 *    día, nunca de noche EN LA HORA DEL JUGADOR (zona que manda el juego; sin zona, la del juego) — se pospone a la mañana —,
 *    al menos ENTRE_AVISOS horas entre dos avisos de este módulo (salvo Liga/Duelos), nunca el mismo aviso dos veces
 *    (UNIQUE jugador+clave) y nada de "compra ahora": los textos hablan de la partida del jugador.
 * 2) Un solo correo a los 7 días sin entrar ("Tu productora te extraña: regalo de créditos"), una vez por ausencia, solo
 *    a cuentas con correo válido que no pidieron la baja; trae un enlace para no recibir más correos de este tipo.
 * 3) "¡Volviste!": al volver tras 7+ días el SERVIDOR entrega un regalo que crece con los días fuera (7, 14, 30), una vez
 *    por ausencia (UPDATE ... WHERE reclamado IS NULL), activa 3 días de ventaja (los aplica js/regreso.js en la lógica:
 *    eventos que pagan +PAGO_PCT % y doble experiencia del personal; nunca en los intentos en línea) y abre una oferta de
 *    regreso de una sola vez ajustada a lo que compraba antes (barata si nunca pagó), válida OFERTA_HORAS horas.
 * 4) Centro de Control (pestaña Notificaciones): cuántos avisos y correos salieron, cuántos volvieron, y un interruptor por tipo.
 * Nada es al azar y los créditos nunca se convierten en dinero.
 */
final class Regreso
{
    /** Tipos con su nombre para el Centro de Control. Todos se pueden apagar (Ajustes "regreso_<tipo>" = '0'). */
    public const TIPOS = [
        'dia1' => 'Día 1: clientes nuevos (20 h después de crear la cuenta)',
        'dia2' => 'Día 2: premio diario listo',
        'dia3' => 'Día 3: el rival MegaVisión',
        'liga2h' => 'Liga: faltan 2 h para el cierre',
        'duelo2h' => 'Duelos: faltan 2 h para cerrar la temporada',
        'regreso3' => '3 días sin entrar',
        'regreso7' => '7 días sin entrar (regalo de regreso)',
        'regreso14' => '14 días sin entrar (el regalo creció)',
        'correo7' => 'Correo a los 7 días sin entrar',
        'volviste' => 'Pantalla «¡Volviste!» (regalo y 3 días de ventaja)',
        'oferta' => 'Oferta de regreso (una sola vez)',
    ];
    /** Categoría de Push de cada aviso (Push::ALIAS: etapa y regreso obedecen al interruptor "premio"; cierre al de "duelo"). */
    public const CATEGORIA = ['dia1' => 'etapa', 'dia2' => 'etapa', 'dia3' => 'etapa', 'liga2h' => 'cierre', 'duelo2h' => 'cierre',
        'regreso3' => 'regreso', 'regreso7' => 'regreso', 'regreso14' => 'regreso'];
    /** Horas después de crear la cuenta en que sale cada aviso de etapa ([desde, hasta]). */
    public const ETAPAS = ['dia1' => [20, 30], 'dia2' => [44, 54], 'dia3' => [68, 78]];
    public const ESCALONES = [3 => 'regreso3', 7 => 'regreso7', 14 => 'regreso14'];
    public const AUSENCIA_DIAS = 7;
    public const PARAR_DIAS = 30;            // como Push::INACTIVO_PARAR: después de 30 días no se insiste por push
    public const CORREO_MAX_DIAS = 60;       // el correo de los 7 días ya no sale si pasaron más de 60
    public const ENTRE_AVISOS = 20;          // horas mínimas entre dos avisos de este módulo (no cuenta Liga/Duelos)
    public const VENTANA_CIERRE = [9000, 7200];   // Liga/Duelos: se avisa entre 2 h 30 y 2 h antes del cierre
    public const VENTAJA_DIAS = 3;
    public const PAGO_PCT = 25;              // los eventos pagan +25 % durante la ventaja
    public const XP_MULT = 2;                // doble experiencia del personal
    public const OFERTA_HORAS = 72;
    public const RECLAMAR_DIAS = 7;          // después de volver, el regalo se puede recibir durante 7 días
    public const ESCANEO_SEG = 300;          // cada cuánto se revisan todas las cuentas
    public const CORREOS_POR_CORRIDA = 100;
    public const DESDE_HORA = 8;             // horario permitido en la hora del jugador (igual que Push: nada de 22:00 a 08:00)
    public const HASTA_HORA = 22;

    /** Regalo de "¡Volviste!" según los días fuera (contenido fijo y a la vista). */
    public const REGALOS = [
        7 => ['creditos' => 100, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]]],
        14 => ['creditos' => 150, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
        30 => ['creditos' => 250, 'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 10000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 8], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 8], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
    ];

    /**
     * Oferta de regreso según lo que compraba antes (la compra más grande pagada en los últimos 365 días): "desde" en USD.
     * Productos en Catalogo::PRODUCTOS (oferta_regreso => true: no salen en la tienda general, solo aquí). Si un producto
     * está apagado (o no existe en Google Play dentro de la app), la oferta simplemente no sale.
     */
    public const OFERTAS = ['regreso_s' => 0, 'regreso_m' => 3, 'regreso_l' => 8];

    /** Textos (solo español por ahora; se traducen en la pasada final). Marcadores: {puesto}, {dias}, {creditos}. */
    public const TEXTOS = [
        'dia1' => [['Tu equipo está listo', 'Llegaron contratos nuevos a tu productora. ¿Cubres el siguiente evento? 🎥'],
                   ['Clientes nuevos', 'Hay ofertas nuevas esperando en tu productora. Elige la que más te convenga.']],
        'dia2' => [['Tu premio diario está listo', 'Entra a reclamar el premio de hoy en tu productora.']],
        'dia2_grande' => [['Tu premio del día 2 está listo', 'Hoy toca un premio grande: dinero, cables y créditos para tu productora.']],
        'dia3' => [['MegaVisión anda cerca', 'La productora rival ya busca a tus clientes. Arma tu equipo para cuando te dispute un contrato.'],
                   ['Se viene MegaVisión', 'Tu rival quiere quedarse con los mejores contratos. ¿Le haces frente?']],
        'liga2h' => [['Faltan 2 h para cerrar la Liga', 'Tu asociación va en el puesto {puesto}. Todavía puedes sumar puntos.']],
        'liga2h_sin' => [['Faltan 2 h para cerrar la Liga', 'Todavía puedes sumar puntos para tu asociación esta semana.']],
        'duelo2h' => [['Faltan 2 h para cerrar los Duelos', 'Vas en el puesto {puesto} de tu servidor en la temporada de Duelos.']],
        'regreso3' => [['Tu equipo te espera', 'Hay contratos nuevos en tu productora. Vuelve cuando quieras.'],
                       ['El público pregunta por ti', 'Hace {dias} días que no sales en vivo. ¿Un evento rápido?']],
        'regreso7' => [['Tu productora te extraña', 'Te guardamos un regalo de regreso: {creditos} créditos y más. Entra a recibirlo.']],
        'regreso14' => [['Tu regalo de regreso creció', 'Ya son {creditos} créditos y más para tu productora. Te esperamos.']],
    ];

    private static ?int $reloj = null;
    private static bool $listo = false;
    private static ?array $zonas = null;

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? Push::ahora(); }

    /** Crea las tablas si todavía no están (Db::migrarModulos ya lo hace; esto es por si acaso). */
    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        if ((int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('regreso_jugador', 'regreso_ausencias', 'regreso_avisos', 'regreso_marcas')") < 4) Migraciones::aplicar('regreso.sql');
        self::$listo = true;
    }

    /** Gancho compra_aprobada (arranque.php): la oferta de regreso comprada ya no se vuelve a ofrecer. */
    public static function registrar(): void
    {
        Ganchos::en('compra_aprobada', [self::class, 'alAprobar'], 'regreso');
    }

    // ------------------------------------------------------------------------------------------ interruptores
    public static function activo(string $tipo): bool { return isset(self::TIPOS[$tipo]) && Ajustes::get('regreso_' . $tipo, '1') !== '0'; }

    /** {tipo: bool} */
    public static function interruptores(): array
    {
        $o = [];
        foreach (self::TIPOS as $k => $_) $o[$k] = self::activo($k);
        return $o;
    }

    /** Centro de Control: {tipo: bool} (los que no vienen quedan igual). Una línea de auditoría "regreso_interruptores". */
    public static function guardarInterruptores(array $in, string $quien): array
    {
        $v = [];
        foreach (self::TIPOS as $k => $_) if (array_key_exists($k, $in)) $v['regreso_' . $k] = $in[$k] ? '1' : '0';
        if ($v) Ajustes::guardar($v, $quien, 'regreso_interruptores');
        return self::interruptores();
    }

    /** ¿El detector viejo de Push (recordatorio a los 3/7/14 días) lo cubre este módulo? Así nunca llegan los dos. */
    public static function cubreRecordatorio(int $escalon): bool
    {
        try {
            self::preparar();
            return isset(self::ESCALONES[$escalon]) && self::activo(self::ESCALONES[$escalon]);
        } catch (\Throwable) { return false; }
    }

    // ------------------------------------------------------------------------------------------ hora del jugador
    public static function zonaValida(mixed $z): ?string
    {
        if (!is_string($z) || $z === '' || strlen($z) > 64 || !preg_match('#^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$#', $z)) return null;
        self::$zonas ??= array_flip(\DateTimeZone::listIdentifiers());
        return isset(self::$zonas[$z]) ? $z : null;
    }

    public static function zonaDe(int $j): string
    {
        $z = Db::valor('SELECT zona FROM regreso_jugador WHERE jugador_id = ?', [$j]);
        return self::zonaValida($z) ?? Config::zona();
    }

    /**
     * Para Push::procesarUno (avisos de este módulo): null si en la hora del jugador ya es de día (08:00 a 21:59);
     * si es de noche, el próximo 08:00 de SU zona.
     */
    public static function posponerHasta(int $j, int $t): ?int
    {
        try { $z = new \DateTimeZone(self::zonaDe($j)); } catch (\Throwable) { $z = new \DateTimeZone(Config::zona()); }
        $d = (new \DateTimeImmutable('@' . $t))->setTimezone($z);
        $h = (int) $d->format('G');
        if ($h >= self::DESDE_HORA && $h < self::HASTA_HORA) return null;
        $m = $d->setTime(self::DESDE_HORA, 0);
        if ($m->getTimestamp() <= $t) $m = $m->modify('+1 day');
        return $m->getTimestamp();
    }

    // ------------------------------------------------------------------------------------------ actividad
    private static function hayTabla(string $t): bool { return Migraciones::columnas($t) !== null; }

    /** Última señal de vida (como Push::ultimaActividad, más las llamadas del juego a /api/regreso). */
    public static function actividad(int $j): int
    {
        $a = Push::ultimaActividad($j);
        $v = (int) Db::valor('SELECT COALESCE(visto, 0) FROM regreso_jugador WHERE jugador_id = ?', [$j]);
        return max($a, $v);
    }

    /** Todas las cuentas activas con su última señal de vida (una sola consulta). */
    private static function cuentas(): array
    {
        $sub = self::hayTabla('push_suscripciones') ? 'COALESCE((SELECT MAX(visto) FROM push_suscripciones s WHERE s.jugador_id = j.id), 0)' : '0';
        return Db::todas("SELECT j.id, j.email, j.nombre, j.creado,
                MAX(j.creado, COALESCE(j.ultimo_ingreso, 0), COALESCE((SELECT MAX(actualizado) FROM partidas p WHERE p.jugador_id = j.id), 0), $sub, COALESCE(r.visto, 0)) AS act
            FROM jugadores j LEFT JOIN regreso_jugador r ON r.jugador_id = j.id WHERE COALESCE(j.estado, 'activo') IN ('activo', '')");
    }

    private static function marca(string $k): ?string { $v = Db::valor('SELECT valor FROM regreso_marcas WHERE clave = ?', [$k]); return $v === false || $v === null ? null : (string) $v; }

    private static function marcar(string $k, string $v): void
    {
        Db::q('INSERT INTO regreso_marcas (clave, valor, actualizado) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado', [$k, $v, self::ahora()]);
    }

    // ------------------------------------------------------------------------------------------ tarea (cron de cada minuto)
    /**
     * La llama bin/push_enviar.php ANTES de vaciar la cola de push (también sin llaves VAPID: así salen los correos y se
     * registran las ausencias). Nunca lanza. Devuelve lo que hizo.
     */
    public static function tarea(bool $forzar = false): array
    {
        $r = ['ausencias' => 0, 'volvieron' => 0, 'push' => 0, 'correos' => 0, 'cierres' => 0, 'seguimiento' => 0];
        try {
            self::preparar();
        } catch (\Throwable $e) {
            error_log('EN VIVO regreso: ' . mb_substr($e->getMessage(), 0, 200));
            return $r;
        }
        foreach (['cierres' => fn() => self::detectarCierres(), 'seguimiento' => fn() => self::seguimiento()] as $k => $f) {
            try { $r[$k] += $f(); } catch (\Throwable $e) { error_log('EN VIVO regreso ' . $k . ': ' . mb_substr($e->getMessage(), 0, 300)); }
        }
        $t = self::ahora();
        $ult = self::marca('escaneo');
        if (!$forzar && $ult !== null && (int) $ult > $t - self::ESCANEO_SEG) return $r;
        self::marcar('escaneo', (string) $t);
        try {
            $r = self::escanear($r);
        } catch (\Throwable $e) {
            error_log('EN VIVO regreso escaneo: ' . mb_substr($e->getMessage(), 0, 300));
        }
        return $r;
    }

    /** Revisa cada cuenta: ausencias (abrir / volvió), avisos de etapa, avisos de regreso y el correo de los 7 días. */
    private static function escanear(array $r): array
    {
        $t = self::ahora();
        $correos = 0;
        foreach (self::cuentas() as $c) {
            $j = (int) $c['id'];
            $act = (int) $c['act'];
            $dias = intdiv(max(0, $t - $act), 86400);
            try {
                // Ausencias: la abierta se cierra si hubo actividad después; se abre una nueva al llegar a 7 días
                $ab = Db::fila('SELECT * FROM regreso_ausencias WHERE jugador_id = ? AND volvio IS NULL ORDER BY id DESC LIMIT 1', [$j]);
                if ($ab && $act > (int) $ab['desde'] + 60) {
                    self::marcarVuelta((int) $ab['id'], (int) $ab['desde'], $act);
                    $r['volvieron']++;
                    $ab = null;
                }
                if (!$ab && $dias >= self::AUSENCIA_DIAS) {
                    if (Db::q('INSERT OR IGNORE INTO regreso_ausencias (jugador_id, desde, detectado) VALUES (?, ?, ?)', [$j, $act, $t])->rowCount() === 1) $r['ausencias']++;
                    $ab = Db::fila('SELECT * FROM regreso_ausencias WHERE jugador_id = ? AND desde = ?', [$j, $act]);
                }
                // Push: etapa (cuenta nueva) o regreso (días sin entrar)
                if (self::avisoEtapa($c, $act) || self::avisoRegreso($j, $act, $dias)) $r['push']++;
                // Correo de los 7 días: uno por ausencia
                if ($ab && $ab['correo'] === null && $ab['volvio'] === null && $dias >= self::AUSENCIA_DIAS && $dias < self::CORREO_MAX_DIAS && $correos < self::CORREOS_POR_CORRIDA) {
                    if (self::correo($c, $ab, $dias)) { $correos++; $r['correos']++; }
                }
            } catch (\Throwable $e) {
                error_log('EN VIVO regreso jugador ' . $j . ': ' . mb_substr($e->getMessage(), 0, 200));
            }
        }
        return $r;
    }

    private static function marcarVuelta(int $id, int $desde, int $act): void
    {
        Db::q('UPDATE regreso_ausencias SET volvio = ?, dias = ? WHERE id = ? AND volvio IS NULL', [$act, intdiv(max(0, $act - $desde), 86400), $id]);
    }

    /** Texto elegido sin azar (por jugador y clave): siempre el mismo para el mismo aviso. */
    private static function texto(string $plantilla, int $j, string $clave, array $vars = []): array
    {
        $l = self::TEXTOS[$plantilla];
        $x = $l[hexdec(substr(hash('crc32b', $j . '|' . $clave), 0, 6)) % count($l)];
        $f = fn(string $s) => preg_replace_callback('/\{(\w+)\}/', fn($m) => array_key_exists($m[1], $vars) ? (string) $vars[$m[1]] : $m[0], $s) ?? $s;
        return [$f($x[0]), $f($x[1])];
    }

    /** ¿Hay otro aviso de este módulo esperando en la cola, o salió uno en las últimas ENTRE_AVISOS horas? (Liga/Duelos no cuentan) */
    private static function avisoReciente(int $j): bool
    {
        return (bool) Db::valor("SELECT 1 FROM regreso_avisos WHERE jugador_id = ? AND canal = 'push' AND tipo NOT IN ('liga2h', 'duelo2h') AND (estado = 'cola' OR (estado <> 'descartado' AND creado > ?)) LIMIT 1",
            [$j, self::ahora() - self::ENTRE_AVISOS * 3600]);
    }

    /** Encola un push de este módulo y lo anota. Devuelve true si quedó en la cola. */
    private static function encolar(int $j, string $tipo, string $clave, array $txt, string $url, int $vence, ?int $desde = null): bool
    {
        if (Db::valor('SELECT 1 FROM regreso_avisos WHERE jugador_id = ? AND clave = ?', [$j, $clave])) return false;
        $op = ['clave' => 'rg:' . $clave, 'vence' => $vence];
        if ($desde !== null) $op['enviar_desde'] = $desde;
        $id = Push::encolar($j, self::CATEGORIA[$tipo], $txt[0], $txt[1], $url, $op);
        if ($id === null) return false;
        Db::q('INSERT OR IGNORE INTO regreso_avisos (jugador_id, tipo, clave, canal, cola_id, estado, creado) VALUES (?, ?, ?, ?, ?, ?, ?)', [$j, $tipo, $clave, 'push', $id, 'cola', self::ahora()]);
        return true;
    }

    /** Avisos del día 1, 2 y 3 (según las horas desde que se creó la cuenta). */
    private static function avisoEtapa(array $c, int $act): bool
    {
        $t = self::ahora();
        $j = (int) $c['id'];
        $h = ($t - (int) $c['creado']) / 3600;
        foreach (self::ETAPAS as $tipo => [$desde, $hasta]) {
            if ($h < $desde || $h >= $hasta || !self::activo($tipo)) continue;
            if ($act > $t - 3 * 3600) return false;   // está jugando ahora: no hace falta avisar
            if (self::avisoReciente($j)) return false;
            $pl = $tipo;
            if ($tipo === 'dia2') {
                if (self::hayTabla('diario_reclamos') && Db::valor('SELECT 1 FROM diario_reclamos WHERE jugador_id = ? AND dia = ?', [$j, Push::dia($t)])) continue;   // ya lo reclamó hoy
                $paso = self::hayTabla('diario_jugador') ? (int) Db::valor('SELECT paso FROM diario_jugador WHERE jugador_id = ?', [$j]) : 0;
                if ($paso === 1) $pl = 'dia2_grande';
            }
            $vence = (int) $c['creado'] + ($hasta + 24) * 3600;   // si cae de noche (o ya tuvo 2 hoy) se pospone a la mañana de su zona
            return self::encolar($j, $tipo, 'etapa:' . $tipo, self::texto($pl, $j, $tipo), $tipo === 'dia2' ? '/?ir=diario' : '/', $vence);
        }
        return false;
    }

    /** Aviso a los 3, 7 y 14 días sin entrar (uno por escalón y por ausencia; nunca después de 30 días). */
    private static function avisoRegreso(int $j, int $act, int $dias): bool
    {
        if ($dias < 3 || $dias >= self::PARAR_DIAS) return false;
        $esc = 0;
        foreach (self::ESCALONES as $d => $_) if ($dias >= $d) $esc = $d;
        $tipo = self::ESCALONES[$esc];
        if (!self::activo($tipo) || self::avisoReciente($j)) return false;
        $creditos = self::REGALOS[$esc >= 14 ? 14 : 7]['creditos'];
        if ($esc >= 7 && !self::activo('volviste')) $tipo = 'regreso3';   // sin regalo no se promete regalo
        return self::encolar($j, $tipo, 'regreso:' . Push::dia($act) . ':' . $esc, self::texto($tipo, $j, (string) $esc, ['dias' => $dias, 'creditos' => $creditos]), '/', self::ahora() + 12 * 3600);
    }

    /** Liga (domingo 23:59) y Duelos (fin de mes): aviso entre 2 h 30 y 2 h antes del cierre, con el puesto. */
    public static function detectarCierres(): int
    {
        $t = self::ahora();
        $n = 0;
        [$antes, $despues] = self::VENTANA_CIERRE;
        if (self::activo('liga2h') && self::hayTabla('liga_miembro_semana') && self::hayTabla('liga_participantes')) {
            $fin = Liga::semanaDe($t)['fin'];
            $sem = Liga::semanaDe($t)['id'];
            if ($t >= $fin - $antes && $t < $fin - $despues) {
                $filas = Db::todas('SELECT m.jugador_id, m.asociacion_id, p.grupo_id FROM liga_miembro_semana m LEFT JOIN liga_participantes p ON p.semana = m.semana AND p.asociacion_id = m.asociacion_id WHERE m.semana = ?', [$sem]);
                foreach ($filas as $f) {
                    $j = (int) $f['jugador_id'];
                    $puesto = null;
                    if ($f['grupo_id'] !== null) {
                        $ids = array_map(fn($x) => (int) $x['asociacion_id'], Db::todas('SELECT asociacion_id FROM liga_participantes WHERE semana = ? AND grupo_id = ? ORDER BY puntos DESC, actualizado ASC, asociacion_id', [$sem, $f['grupo_id']]));
                        $i = array_search((int) $f['asociacion_id'], $ids, true);
                        if ($i !== false) $puesto = $i + 1;
                    }
                    $txt = $puesto !== null ? self::texto('liga2h', $j, $sem, ['puesto' => $puesto]) : self::texto('liga2h_sin', $j, $sem);
                    if (self::encolar($j, 'liga2h', 'liga:' . $sem, $txt, '/?ir=liga', $fin)) $n++;
                }
            }
        }
        if (self::activo('duelo2h') && self::hayTabla('duelo_ratings')) {
            $z = new \DateTimeZone(date_default_timezone_get());
            $d = (new \DateTimeImmutable('@' . $t))->setTimezone($z);
            $fin = $d->modify('first day of next month')->setTime(0, 0)->getTimestamp();
            if ($t >= $fin - $antes && $t < $fin - $despues) {
                $temp = Duelos::temporada($t);
                foreach (Db::todas('SELECT jugador_id, servidor_id, rating FROM duelo_ratings WHERE temporada = ? AND ganados + perdidos + empates > 0', [$temp]) as $f) {
                    $j = (int) $f['jugador_id'];
                    $puesto = 1 + (int) Db::valor('SELECT COUNT(*) FROM duelo_ratings WHERE temporada = ? AND servidor_id = ? AND (rating > ? OR (rating = ? AND jugador_id < ?))',
                        [$temp, $f['servidor_id'], $f['rating'], $f['rating'], $j]);
                    if (self::encolar($j, 'duelo2h', 'duelo:' . $temp, self::texto('duelo2h', $j, $temp, ['puesto' => $puesto]), '/?ir=duelos', $fin)) $n++;
                }
            }
        }
        return $n;
    }

    /**
     * Seguimiento de los avisos: estado en la cola de push (enviado / descartado) y si el jugador volvió en las 72 h
     * siguientes al envío (para el Centro de Control).
     */
    public static function seguimiento(): int
    {
        $t = self::ahora();
        $n = 0;
        foreach (Db::todas("SELECT a.id, a.cola_id, c.estado, c.enviado FROM regreso_avisos a LEFT JOIN push_cola c ON c.id = a.cola_id WHERE a.estado = 'cola' AND a.canal = 'push' LIMIT 2000") as $a) {
            if ($a['estado'] === 'enviado') { Db::q("UPDATE regreso_avisos SET estado = 'enviado', enviado = ? WHERE id = ?", [(int) $a['enviado'], $a['id']]); $n++; }
            elseif ($a['estado'] === null || in_array($a['estado'], ['descartado', 'fallido'], true)) { Db::q("UPDATE regreso_avisos SET estado = 'descartado' WHERE id = ?", [$a['id']]); $n++; }
        }
        foreach (Db::todas("SELECT id, jugador_id, enviado FROM regreso_avisos WHERE estado = 'enviado' AND volvio IS NULL AND enviado > ? LIMIT 2000", [$t - 4 * 86400]) as $a) {
            $act = self::actividad((int) $a['jugador_id']);
            if ($act > (int) $a['enviado'] && $act <= (int) $a['enviado'] + 72 * 3600) { Db::q('UPDATE regreso_avisos SET volvio = ? WHERE id = ?', [$act, $a['id']]); $n++; }
        }
        return $n;
    }

    // ------------------------------------------------------------------------------------------ correo de los 7 días
    /** Enlace para darse de baja de los correos de regreso (crea el código la primera vez). */
    public static function enlaceBaja(int $j): string
    {
        $tok = Db::valor('SELECT token_baja FROM regreso_jugador WHERE jugador_id = ?', [$j]);
        if (!is_string($tok) || !preg_match('/^[a-f0-9]{32}$/', $tok)) {
            $tok = bin2hex(random_bytes(16));
            Db::q('INSERT INTO regreso_jugador (jugador_id, token_baja) VALUES (?, ?) ON CONFLICT (jugador_id) DO UPDATE SET token_baja = excluded.token_baja', [$j, $tok]);
        }
        return rtrim(Config::get('ENVIVO_URL', 'https://juego.tukanec.com'), '/') . '/api/regreso/baja?t=' . $tok;
    }

    public static function correoValido(string $e): bool
    {
        return (bool) filter_var($e, FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n<>,;]/', $e) && !preg_match('/\.(invalid|example|test|local)$/i', $e);
    }

    private static function correo(array $c, array $ab, int $dias): bool
    {
        $j = (int) $c['id'];
        if (!self::activo('correo7') || !self::correoValido((string) $c['email'])) return false;
        if (Db::valor('SELECT baja_correo FROM regreso_jugador WHERE jugador_id = ?', [$j])) return false;
        if (self::posponerHasta($j, self::ahora()) !== null) return false;   // de noche en su hora: en otra corrida
        // Se marca ANTES de mandar (dos corridas a la vez no mandan dos correos)
        if (Db::q('UPDATE regreso_ausencias SET correo = ? WHERE id = ? AND correo IS NULL', [self::ahora(), $ab['id']])->rowCount() !== 1) return false;
        $nivel = self::nivel($dias);
        $idioma = self::hayTabla('push_suscripciones') ? (string) (Db::valor('SELECT idioma FROM push_suscripciones WHERE jugador_id = ? ORDER BY visto DESC LIMIT 1', [$j]) ?: 'es') : 'es';
        $m = CorreoPlantillas::armar('regreso', $idioma, ['nombre' => (string) $c['nombre'], 'creditos' => self::REGALOS[$nivel]['creditos'], 'dias' => $dias,
            'enlace' => rtrim(Config::get('ENVIVO_URL', 'https://juego.tukanec.com'), '/') . '/', 'baja' => self::enlaceBaja($j)]);
        $ok = Correo::enviar((string) $c['email'], $m['asunto'], $m['html'], $m['texto']);
        Db::q('INSERT OR IGNORE INTO regreso_avisos (jugador_id, tipo, clave, canal, estado, creado, enviado) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$j, 'correo7', 'correo:' . $ab['id'], 'correo', $ok ? 'enviado' : 'descartado', self::ahora(), $ok ? self::ahora() : null]);
        return $ok;
    }

    /** GET /api/regreso/baja?t=...: datos para la página (null = enlace no válido). */
    public static function porToken(string $tok): ?array
    {
        self::preparar();
        if (!preg_match('/^[a-f0-9]{32}$/', $tok)) return null;
        return Db::fila('SELECT r.jugador_id, r.baja_correo, j.email FROM regreso_jugador r JOIN jugadores j ON j.id = r.jugador_id WHERE r.token_baja = ?', [$tok]);
    }

    /** POST /api/regreso/baja: no más correos de regreso para esa cuenta. Devuelve true si el enlace es válido. */
    public static function darBaja(string $tok): bool
    {
        $f = self::porToken($tok);
        if (!$f) return false;
        if ($f['baja_correo'] === null) {
            Db::q('UPDATE regreso_jugador SET baja_correo = ? WHERE jugador_id = ?', [self::ahora(), $f['jugador_id']]);
            Auditoria::anotar('juego', 'regreso_baja_correo', 'Pidió no recibir más correos de regreso (enlace del correo)', (int) $f['jugador_id']);
        }
        return true;
    }

    // ------------------------------------------------------------------------------------------ ¡Volviste!
    /** 7, 14 o 30 según los días fuera. */
    public static function nivel(int $dias): int { return $dias >= 30 ? 30 : ($dias >= 14 ? 14 : 7); }

    /** Regalo como lo ve el juego: {nivel, creditos, entregas:[{tipo,item,cantidad,nombre}]}. */
    public static function regalo(int $dias): array
    {
        $n = self::nivel($dias);
        $g = self::REGALOS[$n];
        return ['nivel' => $n, 'creditos' => $g['creditos'], 'entregas' => array_map(fn($e) => $e + ['nombre' => Buzon::nombreAdjunto($e)], $g['entregas'])];
    }

    /** Producto de la oferta de regreso para este jugador (según su compra más grande pagada en 365 días). */
    public static function ofertaPara(int $j): ?string
    {
        $max = (float) Db::valor("SELECT COALESCE(MAX(total), 0) FROM compras WHERE jugador_id = ? AND estado = 'pagado' AND (pagado_en > ? OR (pagado_en IS NULL AND creado > ?))", [$j, self::ahora() - 365 * 86400, self::ahora() - 365 * 86400]);
        $elegido = null;
        foreach (self::OFERTAS as $id => $desde) if ($max + 0.0001 >= $desde) $elegido = $id;
        $p = $elegido !== null ? Catalogo::producto($elegido) : null;
        return $p && $p['activo'] ? $elegido : null;
    }

    private static function ofertaJson(array $a): ?array
    {
        if (!$a['oferta_producto'] || $a['oferta_compra_id'] !== null || (int) $a['oferta_vence'] <= self::ahora() || !self::activo('oferta')) return null;
        $p = Catalogo::producto((string) $a['oferta_producto']);
        if (!$p || !$p['activo']) return null;
        return ['producto' => $p['id'], 'nombre' => $p['nombre'], 'detalle' => $p['detalle'], 'precio' => (float) $p['precio'], 'creditos' => (int) $p['creditos'],
                'entregas' => array_map(fn($e) => $e + ['nombre' => Buzon::nombreAdjunto($e)], $p['entregas'] ?? []), 'vence' => Db::iso((int) $a['oferta_vence'])];
    }

    /** Señal de vida antes de esta llamada sin contar lo de los últimos 30 minutos (el juego recién abierto ya guardó). */
    private static function actividadPrevia(int $j, ?int $vistoAntes): int
    {
        $t = self::ahora() - 1800;
        $f = Db::fila('SELECT creado, ultimo_ingreso FROM jugadores WHERE id = ?', [$j]);
        $c = [(int) ($f['creado'] ?? 0), (int) ($f['ultimo_ingreso'] ?? 0), (int) Db::valor('SELECT COALESCE(MAX(actualizado), 0) FROM partidas WHERE jugador_id = ?', [$j]), (int) $vistoAntes];
        if (self::hayTabla('push_suscripciones')) $c[] = (int) Db::valor('SELECT COALESCE(MAX(visto), 0) FROM push_suscripciones WHERE jugador_id = ?', [$j]);
        $c = array_filter($c, fn($x) => $x <= $t);
        return $c ? max($c) : 0;
    }

    /**
     * GET/POST /api/regreso {zona?}: guarda la zona horaria y la señal de vida y responde
     * {ok, ausencia: null | {id, dias, nivel, regalo, ventaja:{dias, pago_pct, xp_mult}, reclamable}, ventaja: null | {hasta, pago_pct, xp_mult},
     *  oferta: null | {producto, nombre, detalle, precio, creditos, entregas, vence}}.
     */
    public static function estado(int $j, mixed $zona = null): array
    {
        self::preparar();
        $t = self::ahora();
        $antes = Db::fila('SELECT * FROM regreso_jugador WHERE jugador_id = ?', [$j]);
        $z = self::zonaValida($zona);
        // Si la tarea del servidor no alcanzó a ver la ausencia (cron parado), se reconoce aquí con lo que había antes
        // (solo si el juego ya había llamado antes: la primera vez no hay con qué comparar y no se inventa una ausencia)
        if ($antes && (int) $antes['visto'] > 0 && !Db::valor('SELECT 1 FROM regreso_ausencias WHERE jugador_id = ? AND (volvio IS NULL OR (reclamado IS NULL AND volvio > ?))', [$j, $t - self::RECLAMAR_DIAS * 86400])) {
            $prev = self::actividadPrevia($j, $antes ? (int) $antes['visto'] : null);
            if ($prev > 0 && $t - $prev >= self::AUSENCIA_DIAS * 86400) Db::q('INSERT OR IGNORE INTO regreso_ausencias (jugador_id, desde, detectado) VALUES (?, ?, ?)', [$j, $prev, $t]);
        }
        Db::q('INSERT INTO regreso_jugador (jugador_id, zona, visto) VALUES (?, ?, ?) ON CONFLICT (jugador_id) DO UPDATE SET zona = COALESCE(excluded.zona, regreso_jugador.zona), visto = excluded.visto', [$j, $z, $t]);
        foreach (Db::todas('SELECT id, desde FROM regreso_ausencias WHERE jugador_id = ? AND volvio IS NULL', [$j]) as $a) self::marcarVuelta((int) $a['id'], (int) $a['desde'], $t);
        $o = ['ok' => true, 'ausencia' => null, 'ventaja' => null, 'oferta' => null];
        $a = Db::fila('SELECT * FROM regreso_ausencias WHERE jugador_id = ? AND reclamado IS NULL AND volvio > ? ORDER BY id DESC LIMIT 1', [$j, $t - self::RECLAMAR_DIAS * 86400]);
        if ($a && self::activo('volviste') && (int) $a['dias'] >= self::AUSENCIA_DIAS) {
            $d = (int) $a['dias'];
            $o['ausencia'] = ['id' => (int) $a['id'], 'dias' => $d, 'nivel' => self::nivel($d), 'regalo' => self::regalo($d),
                'ventaja' => ['dias' => self::VENTAJA_DIAS, 'pago_pct' => self::PAGO_PCT, 'xp_mult' => self::XP_MULT], 'oferta' => self::activo('oferta') && self::ofertaPara($j) !== null, 'reclamable' => true];
        }
        $u = Db::fila('SELECT * FROM regreso_ausencias WHERE jugador_id = ? AND reclamado IS NOT NULL ORDER BY reclamado DESC LIMIT 1', [$j]);
        if ($u) {
            if ((int) $u['ventaja_hasta'] > $t) $o['ventaja'] = ['id' => (int) $u['id'], 'hasta' => Db::iso((int) $u['ventaja_hasta']), 'hasta_ms' => (int) $u['ventaja_hasta'] * 1000, 'pago_pct' => self::PAGO_PCT, 'xp_mult' => self::XP_MULT];
            $o['oferta'] = self::ofertaJson($u);
        }
        return $o;
    }

    /**
     * POST /api/regreso/reclamar {id}: entrega el regalo (créditos al Monedero con motivo 'regreso' y lo demás como entregas
     * que aplica el juego), activa los 3 días de ventaja y abre la oferta de regreso. Una vez por ausencia.
     * Errores: regreso_apagado (409), regreso_no_disponible (404), regreso_ya_reclamado (409), cuenta_*.
     */
    public static function reclamar(int $j, int $id): array
    {
        self::preparar();
        Cuentas::exigirActiva($j);
        Fallo::si(!self::activo('volviste'), 'El regalo de regreso no está disponible ahora.', 409, ['codigo' => 'regreso_apagado']);
        $res = Db::tx(function () use ($j, $id): array {
            $t = self::ahora();
            $a = Db::fila('SELECT * FROM regreso_ausencias WHERE id = ? AND jugador_id = ?', [$id, $j]);
            Fallo::si(!$a || $a['volvio'] === null || (int) $a['dias'] < self::AUSENCIA_DIAS || (int) $a['volvio'] <= $t - self::RECLAMAR_DIAS * 86400,
                'No tienes un regalo de regreso para recibir.', 404, ['codigo' => 'regreso_no_disponible']);
            Fallo::si($a['reclamado'] !== null, 'Ya recibiste tu regalo de regreso.', 409, ['codigo' => 'regreso_ya_reclamado']);
            $g = self::regalo((int) $a['dias']);
            $oferta = self::activo('oferta') ? self::ofertaPara($j) : null;
            $n = Db::q('UPDATE regreso_ausencias SET reclamado = ?, regalo_json = ?, ventaja_hasta = ?, oferta_producto = ?, oferta_vence = ? WHERE id = ? AND reclamado IS NULL',
                [$t, json_encode($g, JSON_UNESCAPED_UNICODE), $t + self::VENTAJA_DIAS * 86400, $oferta, $oferta ? $t + self::OFERTA_HORAS * 3600 : null, $id])->rowCount();
            Fallo::si($n !== 1, 'Ya recibiste tu regalo de regreso.', 409, ['codigo' => 'regreso_ya_reclamado']);
            $origen = 'regreso:' . $id;
            if ($g['creditos'] > 0) Monedero::mover($j, $g['creditos'], 'regreso', $origen);
            $ent = [];
            foreach (self::REGALOS[$g['nivel']]['entregas'] as $e) $ent[] = Monedero::entregarDef($j, $e, $origen);
            Auditoria::anotar('juego', 'regreso_regalo', 'Volvió tras ' . (int) $a['dias'] . ' días: ' . $g['creditos'] . ' créditos y ' . Buzon::textoAdjuntos(self::REGALOS[$g['nivel']]['entregas'])
                . '; ventaja ' . self::VENTAJA_DIAS . ' días' . ($oferta ? '; oferta ' . $oferta : ''), $j);
            return ['entregas' => $ent, 'creditos_recibidos' => $g['creditos'], 'regalo' => $g];
        });
        return self::estado($j) + $res + ['creditos' => Monedero::saldo($j)];
    }

    // ------------------------------------------------------------------------------------------ oferta de regreso
    /** Para Compras::exigirComprable: la oferta de regreso solo se compra si está abierta para ESTE jugador y sin usar. */
    public static function exigirOferta(int $j, array $p): void
    {
        if (empty($p['oferta_regreso'])) return;
        self::preparar();
        $ok = Db::valor('SELECT 1 FROM regreso_ausencias WHERE jugador_id = ? AND oferta_producto = ? AND oferta_vence > ? AND oferta_compra_id IS NULL LIMIT 1', [$j, $p['id'], self::ahora()]);
        Fallo::si(!$ok || !self::activo('oferta'), 'Esa oferta no está disponible para ti (venció o ya la compraste).', 409, ['codigo' => 'oferta_no_disponible']);
    }

    /** compra_aprobada: la oferta de regreso queda usada (una sola vez). */
    public static function alAprobar(array $d): void
    {
        $p = (string) ($d['producto'] ?? '');
        $j = (int) ($d['jugador_id'] ?? 0);
        $cid = (int) ($d['compra_id'] ?? 0);
        if (!isset(self::OFERTAS[$p]) || $j <= 0) return;
        self::preparar();
        $id = Db::valor('SELECT id FROM regreso_ausencias WHERE jugador_id = ? AND oferta_producto = ? AND oferta_compra_id IS NULL ORDER BY id DESC LIMIT 1', [$j, $p]);
        if ($id) Db::q('UPDATE regreso_ausencias SET oferta_compra_id = ? WHERE id = ? AND oferta_compra_id IS NULL', [$cid ?: -1, $id]);
    }

    // ------------------------------------------------------------------------------------------ Centro de Control
    /** Números de los últimos $dias días: por tipo de aviso (enviados, descartados, volvieron) y las ausencias. */
    public static function estadisticas(int $dias = 30): array
    {
        self::preparar();
        $desde = self::ahora() - $dias * 86400;
        $tipos = [];
        foreach (self::TIPOS as $k => $n) $tipos[$k] = ['nombre' => $n, 'activo' => self::activo($k), 'enviados' => 0, 'en_cola' => 0, 'descartados' => 0, 'volvieron' => 0];
        foreach (Db::todas('SELECT tipo, estado, COUNT(*) AS n, SUM(volvio IS NOT NULL) AS v FROM regreso_avisos WHERE creado >= ? GROUP BY tipo, estado', [$desde]) as $f) {
            if (!isset($tipos[$f['tipo']])) continue;
            $k = ['enviado' => 'enviados', 'cola' => 'en_cola', 'descartado' => 'descartados'][$f['estado']] ?? 'descartados';
            $tipos[$f['tipo']][$k] += (int) $f['n'];
            $tipos[$f['tipo']]['volvieron'] += (int) $f['v'];
        }
        $v = fn(string $sql, array $p = []) => (int) Db::valor($sql, $p);
        $aus = [
            'detectadas' => $v('SELECT COUNT(*) FROM regreso_ausencias WHERE detectado >= ?', [$desde]),
            'volvieron' => $v('SELECT COUNT(*) FROM regreso_ausencias WHERE volvio >= ? AND dias >= ?', [$desde, self::AUSENCIA_DIAS]),
            'reclamaron' => $v('SELECT COUNT(*) FROM regreso_ausencias WHERE reclamado >= ?', [$desde]),
            'ofertas' => $v('SELECT COUNT(*) FROM regreso_ausencias WHERE reclamado >= ? AND oferta_producto IS NOT NULL', [$desde]),
            'ofertas_compradas' => $v('SELECT COUNT(*) FROM regreso_ausencias WHERE reclamado >= ? AND oferta_compra_id IS NOT NULL', [$desde]),
            'fuera_ahora' => $v('SELECT COUNT(*) FROM regreso_ausencias WHERE volvio IS NULL'),
            'correos_volvieron' => $v('SELECT COUNT(*) FROM regreso_ausencias WHERE correo >= ? AND volvio IS NOT NULL', [$desde]),
        ];
        // Volvió después del correo = la ausencia se cerró (el correo es uno por ausencia)
        $tipos['correo7']['volvieron'] = $aus['correos_volvieron'];
        $tipos['volviste']['enviados'] = $aus['reclamaron'];
        $tipos['oferta']['enviados'] = $aus['ofertas'];
        $tipos['oferta']['volvieron'] = $aus['ofertas_compradas'];
        return ['dias' => $dias, 'tipos' => $tipos, 'ausencias' => $aus, 'bajas_correo' => $v('SELECT COUNT(*) FROM regreso_jugador WHERE baja_correo IS NOT NULL'),
                'zonas' => $v('SELECT COUNT(*) FROM regreso_jugador WHERE zona IS NOT NULL'),
                'recientes' => Db::todas('SELECT a.*, j.alias, j.nombre FROM regreso_avisos a LEFT JOIN jugadores j ON j.id = a.jugador_id ORDER BY a.id DESC LIMIT 20')];
    }
}
