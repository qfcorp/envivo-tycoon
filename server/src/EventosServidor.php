<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Eventos de TODO el servidor (calendario anual) y calendario de adviento. Contrato: server/INTEGRAR_EVENTOS_SERVIDOR.md.
 * Tablas: migraciones/eventos_servidor.sql. Rutas: EventosServidorApi.php. Panel: public/control/lib/eventos_servidor.php.
 *
 *  - Calendario (self::CALENDARIO, fechas en hora de Ecuador): cada temporada (Halloween, Navidad, Fin de año y Pase del
 *    Niño, Carnaval, San Valentín, Semana Santa) y las nuevas (Día de la Madre, Semana de Finales, Copa Global Femenina
 *    2027, Final Continental de Clubes, Gran Final Nacional) son un evento del servidor con:
 *      · tienda de temporada que solo existe esas semanas: se paga con FICHAS DE EVENTO que se ganan jugando (nunca con
 *        dinero, nada al azar, cada artículo dice exactamente qué trae y cuántas veces se puede comprar);
 *      · objetivo común del servidor del jugador (suma de lo que juegan todos) con barra y premio para todos (mitad y meta);
 *      · una oferta especial = un producto que YA existe en Catalogo::PRODUCTOS (el juego lo muestra con su precio de
 *        siempre: en la app solo si Google Play lo tiene).
 *    "Viernes Negro" (tipo 'ofertas') solo aparece en el calendario y muestra las ofertas que ya hay: NO duplica la promo
 *    de Black Friday (BlackFriday.php), de donde toma sus fechas.
 *  - Fichas: 5 al día por pasar a saludar (botón), 2 por cada evento jugado en la partida (+1 con 4 o 5 estrellas; hasta
 *    12 eventos por día) y 3 por cada intento en línea validado (Liga, Festival, Copa, Duelos, Desafío: se leen del libro
 *    de XP del Pase, pase_xp; hasta 5 por día). Las fichas valen solo en su evento.
 *    Validación modesta (a propósito, igual que Misiones): el servidor no ve la partida local; topes por día y por evento,
 *    UNIQUE por ref. Los premios son chicos y nunca dinero real.
 *  - Adviento (1 al 25 de diciembre): un regalo fijo por día; el que se perdió se puede recuperar al día siguiente (solo
 *    el de ayer, nunca frustrante). El 26 de diciembre todavía se recupera el 25.
 *  - Centro de Control: encender/apagar todo, cada evento y el adviento; cambiar las fechas y la meta de cada edición;
 *    ver el avance del objetivo común por servidor y una vista previa del calendario en cualquier fecha.
 *  - Pruebas: fijarReloj($t) (también lo pone ENVIVO_PRUEBA_AHORA con server/tests/reloj_prueba.php) y cambiar las fechas
 *    de una edición desde el panel (como la ventana de Black Friday).
 */
final class EventosServidor
{
    public const ZONA = 'America/Guayaquil';
    public const FICHAS_DIARIO = 5;
    public const FICHAS_EVENTO = 2;
    public const FICHAS_EVENTO_BUENO = 1;      // extra con 4 o 5 estrellas
    public const FICHAS_EN_LINEA = 3;
    public const TOPE_EVENTOS_DIA = 12;
    public const TOPE_EN_LINEA_DIA = 5;
    public const APORTE_EVENTO = 1;            // al objetivo común
    public const APORTE_EN_LINEA = 2;
    public const DIAS_RECLAMO_META = 7;        // después de terminar, el premio común se reclama todavía 7 días
    public const META_FACTOR = 1.2;            // meta = jugadores activos (7 días) × días del evento × factor
    public const META_MIN = 40;
    public const META_MAX = 100000;
    public const MAX_POR_PEDIDO = 20;          // eventos que se informan en un POST /api/eventos_servidor/jugar
    public const FUENTES_EN_LINEA = ['liga', 'festival', 'copa', 'duelo', 'desafio'];

    /**
     * Calendario. regla: ['fijo', 'MM-DD', 'MM-DD'] (si termina antes de empezar, cruza el año) · ['pascua', desde, hasta]
     * (días desde el Domingo de Pascua) · ['domingo', mes, n, desde, hasta] (n-ésimo domingo del mes) · ['viernes_negro'].
     * anios: [primer año, último año o null]. tipo 'evento' = tienda + objetivo + oferta; 'ofertas' = solo calendario.
     * oferta: producto que ya existe en Catalogo::PRODUCTOS. deco: decoración de sede exclusiva (self::COSMETICOS).
     */
    public const CALENDARIO = [
        'carnaval'            => ['icono' => '🎭', 'tipo' => 'evento', 'regla' => ['pascua', -56, -46], 'anios' => [2027, null], 'oferta' => 'tarjeta_semanal', 'deco' => 'evs_mascaras', 'futbol' => false],
        'san_valentin'        => ['icono' => '💘', 'tipo' => 'evento', 'regla' => ['fijo', '02-07', '02-14'], 'anios' => [2027, null], 'oferta' => 'creditos_700', 'deco' => 'evs_globos', 'futbol' => false],
        'pascua'              => ['icono' => '🕊️', 'tipo' => 'evento', 'regla' => ['pascua', -7, 0], 'anios' => [2027, null], 'oferta' => 'pack_obra_s', 'deco' => 'evs_palmas', 'futbol' => false],
        'dia_madre'           => ['icono' => '💐', 'tipo' => 'evento', 'regla' => ['domingo', 5, 2, -6, 0], 'anios' => [2027, null], 'oferta' => 'creditos_700', 'deco' => 'evs_rosas', 'futbol' => false],
        'semana_finales'      => ['icono' => '🏆', 'tipo' => 'evento', 'regla' => ['fijo', '05-24', '06-06'], 'anios' => [2027, null], 'oferta' => 'pase_premium', 'deco' => 'evs_pantalla', 'futbol' => true],
        'copa_femenina'       => ['icono' => '⚽', 'tipo' => 'evento', 'regla' => ['fijo', '06-24', '07-25'], 'anios' => [2027, 2027], 'oferta' => 'vip30', 'deco' => 'evs_trofeo_fem', 'futbol' => true],
        'halloween'           => ['icono' => '🎃', 'tipo' => 'evento', 'regla' => ['fijo', '10-24', '10-31'], 'anios' => [2027, null], 'oferta' => 'creditos_250', 'deco' => 'evs_murcielagos', 'futbol' => false],
        'final_continental'   => ['icono' => '🌎', 'tipo' => 'evento', 'regla' => ['fijo', '11-13', '11-22'], 'anios' => [2027, null], 'oferta' => 'pase_copa', 'deco' => 'evs_bufandas', 'futbol' => true],
        'viernes_negro'       => ['icono' => '🏷️', 'tipo' => 'ofertas', 'regla' => ['viernes_negro'], 'anios' => [2026, null], 'oferta' => null, 'deco' => null, 'futbol' => false],
        'navidad'             => ['icono' => '🎄', 'tipo' => 'evento', 'regla' => ['fijo', '12-01', '12-25'], 'anios' => [2026, null], 'oferta' => 'pack_obra_m', 'deco' => 'evs_reno', 'futbol' => false],
        'gran_final_nacional' => ['icono' => '🏟️', 'tipo' => 'evento', 'regla' => ['fijo', '12-04', '12-13'], 'anios' => [2026, null], 'oferta' => 'pack_obra_l', 'deco' => 'evs_balon', 'futbol' => true],
        'fin_anio'            => ['icono' => '🎆', 'tipo' => 'evento', 'regla' => ['fijo', '12-26', '01-06'], 'anios' => [2026, null], 'oferta' => 'tarjeta_mensual', 'deco' => 'evs_reloj', 'futbol' => false],
    ];

    /** Nombres en español (el panel y los textos del servidor; el juego usa js/lang/es.js evs.ev.<clave>). */
    public const NOMBRES = [
        'carnaval' => 'Carnaval en Vivo', 'san_valentin' => 'San Valentín en Vivo', 'pascua' => 'Semana Santa en Vivo',
        'dia_madre' => 'Día de la Madre', 'semana_finales' => 'Semana de Finales', 'copa_femenina' => 'Copa Global Femenina',
        'halloween' => 'Halloween en Vivo', 'final_continental' => 'Final Continental de Clubes', 'viernes_negro' => 'Viernes Negro',
        'navidad' => 'Navidad en Vivo', 'gran_final_nacional' => 'Gran Final Nacional', 'fin_anio' => 'Fin de Año y Pase del Niño',
    ];

    /** Decoraciones de sede (las dibuja js/art.js cosmeticosSede). */
    public const COSMETICOS = [
        'evs_mascaras' => 'Máscaras de carnaval en la fachada', 'evs_globos' => 'Globos de corazón en el techo', 'evs_palmas' => 'Ramos de palma en la puerta',
        'evs_rosas' => 'Jardín de rosas en la entrada', 'evs_pantalla' => 'Pantalla gigante en la terraza', 'evs_trofeo_fem' => 'Copa dorada de la Copa Global Femenina',
        'evs_murcielagos' => 'Murciélagos de papel en el techo', 'evs_bufandas' => 'Bufandas de hinchada en la fachada', 'evs_reno' => 'Reno luminoso en el techo',
        'evs_balon' => 'Balón dorado gigante en la entrada', 'evs_reloj' => 'Reloj de cuenta regresiva en la fachada', 'evs_estrella' => 'Estrella del adviento en el techo',
    ];

    /** Tienda de temporada (la misma en todos los eventos + la decoración exclusiva de cada uno). precio en fichas, max por evento. */
    public const TIENDA = [
        'dinero'      => ['precio' => 15, 'max' => 6, 'premio' => ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2000]],
        'cables'      => ['precio' => 10, 'max' => 5, 'premio' => ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3]],
        'baterias'    => ['precio' => 10, 'max' => 5, 'premio' => ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]],
        'reparar'     => ['precio' => 25, 'max' => 2, 'premio' => ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        'seguro'      => ['precio' => 20, 'max' => 3, 'premio' => ['tipo' => 'refuerzo', 'item' => 'seguro_evento', 'cantidad' => 1]],
        'lente'       => ['precio' => 25, 'max' => 2, 'premio' => ['tipo' => 'refuerzo', 'item' => 'alquiler_lente_box', 'cantidad' => 1]],
        'camarografo' => ['precio' => 35, 'max' => 2, 'premio' => ['tipo' => 'refuerzo', 'item' => 'refuerzo_camarografo_senior', 'cantidad' => 1]],
        'creditos'    => ['precio' => 60, 'max' => 2, 'premio' => ['tipo' => 'creditos', 'item' => '-', 'cantidad' => 10]],
        'deco'        => ['precio' => 80, 'max' => 1, 'premio' => ['tipo' => 'cosmetico', 'item' => '(deco del evento)', 'cantidad' => 1]],
    ];

    /** Premios del objetivo común (para todos los del servidor). en = % de la meta. */
    public const HITOS = [
        'mitad' => ['en' => 50, 'premios' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 3000], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]]],
        'meta'  => ['en' => 100, 'premios' => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 20], ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
    ];

    /** Calendario de adviento: regalo fijo de cada día (1 a 25 de diciembre). Las fichas van al evento de Navidad. */
    public const ADVIENTO = [
        1 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1000]],
        2 => [['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2]],
        3 => [['tipo' => 'fichas', 'item' => '-', 'cantidad' => 10]],
        4 => [['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2]],
        5 => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 5]],
        6 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1500]],
        7 => [['tipo' => 'refuerzo', 'item' => 'seguro_evento', 'cantidad' => 1]],
        8 => [['tipo' => 'fichas', 'item' => '-', 'cantidad' => 15]],
        9 => [['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3]],
        10 => [['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        11 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2000]],
        12 => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 5]],
        13 => [['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]],
        14 => [['tipo' => 'refuerzo', 'item' => 'alquiler_lente_box', 'cantidad' => 1]],
        15 => [['tipo' => 'fichas', 'item' => '-', 'cantidad' => 20]],
        16 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2500]],
        17 => [['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 4]],
        18 => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 10]],
        19 => [['tipo' => 'refuerzo', 'item' => 'refuerzo_camarografo_senior', 'cantidad' => 1]],
        20 => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 3000]],
        21 => [['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 4]],
        22 => [['tipo' => 'fichas', 'item' => '-', 'cantidad' => 20]],
        23 => [['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        24 => [['tipo' => 'creditos', 'item' => '-', 'cantidad' => 15], ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000]],
        25 => [['tipo' => 'cosmetico', 'item' => 'evs_estrella', 'cantidad' => 1], ['tipo' => 'creditos', 'item' => '-', 'cantidad' => 20]],
    ];
    public const DINERO_POR_FICHA = 100;   // adviento sin evento de Navidad: cada ficha llega como $100 del juego

    private static ?int $reloj = null;
    private static bool $listo = false;

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }

    public static function preparar(): void
    {
        if (self::$listo) return;
        Db::pdo();
        $n = (int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('evs_fichas', 'evs_compras', 'evs_metas', 'evs_premios_meta', 'evs_adviento', 'evs_cosmeticos')");
        if ($n < 6) Migraciones::aplicar('eventos_servidor.sql');
        self::$listo = true;
    }

    // ------------------------------------------------------------------------------------------ fechas (hora de Ecuador)
    private static function zona(): \DateTimeZone { return new \DateTimeZone(self::ZONA); }
    private static function fecha(int $y, int $m, int $d): \DateTimeImmutable { return (new \DateTimeImmutable('now', self::zona()))->setDate($y, $m, $d)->setTime(0, 0, 0); }
    public static function dia(?int $t = null): string { return (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->setTimezone(self::zona())->format('Y-m-d'); }
    public static function inicioDia(string $dia): int { return (new \DateTimeImmutable($dia . ' 00:00:00', self::zona()))->getTimestamp(); }
    private static function finDia(\DateTimeImmutable $d): int { return $d->setTime(23, 59, 59)->getTimestamp(); }

    public static function pascua(int $y): \DateTimeImmutable
    {
        $a = $y % 19; $b = intdiv($y, 100); $c = $y % 100; $d = intdiv($b, 4); $e = $b % 4; $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3); $h = (19 * $a + $b - $d - $g + 15) % 30; $i = intdiv($c, 4); $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7; $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $mes = intdiv($h + $l - 7 * $m + 114, 31); $dia = (($h + $l - 7 * $m + 114) % 31) + 1;
        return self::fecha($y, $mes, $dia);
    }

    /** Ventana por defecto de una clave en el año $y: [desde, hasta] en segundos Unix (hasta = 23:59:59), o null. */
    public static function ventanaBase(string $clave, int $y): ?array
    {
        $def = self::CALENDARIO[$clave] ?? null;
        if (!$def) return null;
        [$a1, $a2] = $def['anios'];
        if ($y < $a1 || ($a2 !== null && $y > $a2)) return null;
        $r = $def['regla'];
        switch ($r[0]) {
            case 'fijo':
                [$m1, $d1] = array_map('intval', explode('-', $r[1]));
                [$m2, $d2] = array_map('intval', explode('-', $r[2]));
                $ini = self::fecha($y, $m1, $d1);
                $fin = self::fecha($y, $m2, $d2);
                if ($fin < $ini) $fin = self::fecha($y + 1, $m2, $d2);
                break;
            case 'pascua':
                $p = self::pascua($y);
                $ini = $p->modify(($r[1] >= 0 ? '+' : '') . $r[1] . ' days');
                $fin = $p->modify(($r[2] >= 0 ? '+' : '') . $r[2] . ' days');
                break;
            case 'domingo':
                $prim = self::fecha($y, (int) $r[1], 1);
                $dom = $prim->modify('+' . ((7 - (int) $prim->format('w')) % 7) . ' days')->modify('+' . (7 * ((int) $r[2] - 1)) . ' days');
                $ini = $dom->modify($r[3] . ' days');
                $fin = $dom->modify('+' . $r[4] . ' days');
                break;
            case 'viernes_negro':
                // Viernes después del 4.º jueves de noviembre hasta el lunes siguiente; si la promo de Black Friday es de ese
                // año, se usan sus fechas (el dueño las cambia allá: aquí no se duplica nada)
                if (class_exists(BlackFriday::class)) {
                    $c = BlackFriday::config();
                    if ((int) (new \DateTimeImmutable('@' . $c['desde']))->setTimezone(self::zona())->format('Y') === $y) return [(int) $c['desde'], (int) $c['hasta']];
                }
                $prim = self::fecha($y, 11, 1);
                $jue = $prim->modify('+' . ((4 - (int) $prim->format('w') + 7) % 7) . ' days')->modify('+21 days');
                $ini = $jue->modify('+1 day');
                $fin = $jue->modify('+4 days');
                break;
            default:
                return null;
        }
        return [$ini->getTimestamp(), self::finDia($fin)];
    }

    // ------------------------------------------------------------------------------------------ configuración
    /** {activo, adviento, eventos: {clave: bool}, instancias: {id: {desde?, hasta?, meta?}}} (Ajustes "evs_config"). */
    public static function config(): array
    {
        $c = json_decode(Ajustes::get('evs_config', ''), true);
        $c = is_array($c) ? $c : [];
        $ev = [];
        foreach (self::CALENDARIO as $k => $_) $ev[$k] = !isset($c['eventos'][$k]) || (bool) $c['eventos'][$k];
        $inst = [];
        foreach ((is_array($c['instancias'] ?? null) ? $c['instancias'] : []) as $id => $o) {
            if (!is_string($id) || !preg_match('/^[a-z_]+-\d{4}$/', $id) || !is_array($o)) continue;
            $x = [];
            foreach (['desde', 'hasta', 'meta'] as $k) if (isset($o[$k]) && is_int($o[$k]) && $o[$k] > 0) $x[$k] = $o[$k];
            if ($x) $inst[$id] = $x;
        }
        return ['activo' => !isset($c['activo']) || (bool) $c['activo'], 'adviento' => !isset($c['adviento']) || (bool) $c['adviento'], 'eventos' => $ev, 'instancias' => $inst];
    }

    /**
     * Cambios desde el Centro de Control. $d: {activo?, adviento?, eventos?: {clave: bool}, instancia?: {id, desde?, hasta?, meta?, borrar?}}.
     * Revisa y guarda en un paso (Ajustes::guardar deja la línea de auditoría "eventos_servidor").
     */
    public static function guardar(array $d, string $quien): array
    {
        self::preparar();
        $c = self::config();
        if (array_key_exists('activo', $d)) $c['activo'] = (bool) $d['activo'];
        if (array_key_exists('adviento', $d)) $c['adviento'] = (bool) $d['adviento'];
        foreach ((array) ($d['eventos'] ?? []) as $k => $v) {
            Fallo::si(!isset(self::CALENDARIO[$k]), 'Evento desconocido: ' . mb_substr((string) $k, 0, 30) . '.', 400, ['codigo' => 'evento_desconocido']);
            $c['eventos'][$k] = (bool) $v;
        }
        if (isset($d['instancia']) && is_array($d['instancia'])) {
            $i = $d['instancia'];
            $id = (string) ($i['id'] ?? '');
            [$clave, $anio] = self::partirId($id);
            Fallo::si($clave === null, 'Edición desconocida: ' . mb_substr($id, 0, 40) . '.', 400, ['codigo' => 'evento_desconocido']);
            if (!empty($i['borrar'])) unset($c['instancias'][$id]);
            else {
                $x = $c['instancias'][$id] ?? [];
                foreach (['desde', 'hasta', 'meta'] as $k) if (array_key_exists($k, $i)) { $v = (int) $i[$k]; if ($v > 0) $x[$k] = $v; else unset($x[$k]); }
                $base = self::ventanaBase($clave, $anio);
                $desde = $x['desde'] ?? ($base[0] ?? 0); $hasta = $x['hasta'] ?? ($base[1] ?? 0);
                Fallo::si($desde <= 0 || $hasta <= 0, 'Escribe las dos fechas del evento.', 400, ['codigo' => 'fecha_invalida']);
                Fallo::si($hasta <= $desde, 'La fecha final debe ser después de la inicial.', 400, ['codigo' => 'fecha_invalida']);
                Fallo::si($hasta - $desde > 62 * 86400, 'Un evento dura como máximo 62 días.', 400, ['codigo' => 'fecha_invalida']);
                Fallo::si(isset($x['meta']) && ($x['meta'] < 10 || $x['meta'] > self::META_MAX), 'La meta va de 10 a ' . number_format(self::META_MAX, 0, ',', '.') . '.', 400, ['codigo' => 'meta_invalida']);
                if ($x) $c['instancias'][$id] = $x; else unset($c['instancias'][$id]);
                if (isset($x['meta'])) Db::q('UPDATE evs_metas SET meta = ? WHERE instancia = ?', [$x['meta'], $id]);
            }
        }
        Ajustes::guardar(['evs_config' => json_encode($c, JSON_UNESCAPED_UNICODE)], $quien, 'eventos_servidor');
        return self::config();
    }

    /** "navidad-2026" → ['navidad', 2026] (o [null, 0] si no es una edición del calendario). */
    public static function partirId(string $id): array
    {
        if (!preg_match('/^([a-z_]+)-(\d{4})$/', $id, $m) || !isset(self::CALENDARIO[$m[1]])) return [null, 0];
        return [$m[1], (int) $m[2]];
    }

    // ------------------------------------------------------------------------------------------ ediciones (instancias)
    /** Una edición con sus fechas (las del panel si las cambió), o null si ese año no hay. */
    public static function instancia(string $id, ?array $c = null): ?array
    {
        [$clave, $anio] = self::partirId($id);
        if ($clave === null) return null;
        $base = self::ventanaBase($clave, $anio);
        if (!$base) return null;
        $c ??= self::config();
        $o = $c['instancias'][$id] ?? [];
        $def = self::CALENDARIO[$clave];
        $desde = $o['desde'] ?? $base[0]; $hasta = $o['hasta'] ?? $base[1];
        $t = self::ahora();
        $encendido = $c['activo'] && $c['eventos'][$clave];
        $fase = !$encendido ? 'apagada' : ($t < $desde ? 'pronto' : ($t > $hasta ? 'terminada' : 'activa'));
        return ['id' => $id, 'clave' => $clave, 'anio' => $anio, 'tipo' => $def['tipo'], 'icono' => $def['icono'], 'nombre' => self::NOMBRES[$clave],
                'desde' => $desde, 'hasta' => $hasta, 'fase' => $fase, 'oferta' => $def['oferta'], 'deco' => $def['deco'], 'futbol' => $def['futbol'],
                'cambiada' => isset($o['desde']) || isset($o['hasta']), 'meta_fija' => $o['meta'] ?? null];
    }

    /** Ediciones que tocan [$desde, $hasta] (ordenadas por fecha de inicio). */
    public static function instancias(int $desde, int $hasta, ?array $c = null): array
    {
        $c ??= self::config();
        $y1 = (int) (new \DateTimeImmutable('@' . $desde))->setTimezone(self::zona())->format('Y') - 1;
        $y2 = (int) (new \DateTimeImmutable('@' . $hasta))->setTimezone(self::zona())->format('Y');
        $o = [];
        for ($y = $y1; $y <= $y2; $y++) foreach (self::CALENDARIO as $k => $_) {
            $i = self::instancia($k . '-' . $y, $c);
            if ($i && $i['hasta'] >= $desde && $i['desde'] <= $hasta) $o[] = $i;
        }
        usort($o, fn($a, $b) => [$a['desde'], $a['id']] <=> [$b['desde'], $b['id']]);
        return $o;
    }

    /** Ediciones de tipo 'evento' en curso ahora. */
    public static function activas(?array $c = null): array
    {
        $t = self::ahora();
        return array_values(array_filter(self::instancias($t, $t, $c), fn($i) => $i['fase'] === 'activa' && $i['tipo'] === 'evento'));
    }

    // ------------------------------------------------------------------------------------------ premios
    public static function nombrePremio(array $p): string
    {
        $n = (int) $p['cantidad'];
        $num = number_format($n, 0, ',', '.');
        return match ($p['tipo']) {
            'dinero' => '$' . $num . ' del juego',
            'creditos' => $num . ' créditos',
            'fichas' => $num . ' fichas de evento',
            'consumible' => $num . ' × ' . (Buzon::CONSUMIBLES[$p['item']] ?? $p['item']),
            'reparar_todo' => 'Reparar todos tus equipos',
            'refuerzo' => Catalogo::PREMIUM[$p['item']]['nombre'] ?? $p['item'],
            'cosmetico' => 'Decoración: ' . (self::COSMETICOS[$p['item']] ?? $p['item']),
            default => $num . ' × ' . $p['item'],
        };
    }

    private static function premioJson(array $p): array
    {
        return ['tipo' => $p['tipo'], 'item' => $p['item'], 'cantidad' => (int) $p['cantidad'], 'nombre' => self::nombrePremio($p)];
    }

    /** Artículos de la tienda de una edición (la decoración es la de ese evento). */
    public static function tienda(array $inst): array
    {
        $o = [];
        foreach (self::TIENDA as $id => $a) {
            $p = $a['premio'];
            if ($id === 'deco') { if (!$inst['deco']) continue; $p['item'] = $inst['deco']; }
            $o[$id] = ['precio' => $a['precio'], 'max' => $a['max'], 'premio' => $p];
        }
        return $o;
    }

    /**
     * Entrega una lista de premios (dentro de la transacción de quien llama). Devuelve {entregas, creditos, cosmeticos}.
     * Créditos con Monedero::mover (motivo evento_servidor), decoraciones en evs_cosmeticos, fichas al evento de Navidad
     * (o $100 por ficha si no hay), refuerzos y lo demás como entregas que el juego aplica en la partida.
     */
    private static function entregar(int $j, array $premios, string $origen): array
    {
        $ent = []; $cred = 0; $cos = [];
        foreach ($premios as $p) {
            $n = (int) $p['cantidad'];
            switch ($p['tipo']) {
                case 'creditos': Monedero::mover($j, $n, 'evento_servidor', $origen); $cred += $n; break;
                case 'cosmetico':
                    Db::q('INSERT OR IGNORE INTO evs_cosmeticos (jugador_id, clave, origen, creado) VALUES (?, ?, ?, ?)', [$j, $p['item'], $origen, self::ahora()]);
                    $cos[] = $p['item'];
                    break;
                case 'fichas':
                    $nav = self::instancia('navidad-' . substr(self::dia(), 0, 4));
                    if ($nav && $nav['fase'] === 'activa') self::anotar($j, $nav['id'], 'adviento', $origen, $n, 0);
                    else $ent[] = Monedero::entregar($j, 'dinero', '-', $n * self::DINERO_POR_FICHA, $origen);
                    break;
                case 'refuerzo':
                    $def = Catalogo::PREMIUM[$p['item']]['entrega'] ?? null;
                    if ($def) for ($i = 0; $i < $n; $i++) $ent[] = Monedero::entregarDef($j, $def, $origen);
                    break;
                default: $ent[] = Monedero::entregar($j, (string) $p['tipo'], (string) $p['item'], $n, $origen);
            }
        }
        return ['entregas' => $ent, 'creditos' => $cred, 'cosmeticos' => $cos];
    }

    // ------------------------------------------------------------------------------------------ fichas
    private static function servidorDe(int $j): int { return (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]); }

    /** Anota fichas (INSERT OR IGNORE por ref). true si es nueva. */
    private static function anotar(int $j, string $inst, string $motivo, string $ref, int $fichas, int $aporte): bool
    {
        return Db::q('INSERT OR IGNORE INTO evs_fichas (instancia, jugador_id, servidor_id, motivo, ref, fichas, aporte, dia, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$inst, $j, self::servidorDe($j), $motivo, mb_substr($ref, 0, 120), $fichas, $aporte, self::dia(), self::ahora()])->rowCount() === 1;
    }

    public static function saldo(int $j, string $inst): int
    {
        return (int) Db::valor('SELECT COALESCE(SUM(fichas), 0) FROM evs_fichas WHERE instancia = ? AND jugador_id = ?', [$inst, $j]);
    }

    private static function hoyCuenta(int $j, string $inst, string $motivo): int
    {
        return (int) Db::valor('SELECT COUNT(*) FROM evs_fichas WHERE instancia = ? AND jugador_id = ? AND dia = ? AND motivo = ?', [$inst, $j, self::dia(), $motivo]);
    }

    /** Pasa los intentos en línea validados (libro de XP del Pase) a fichas: 3 cada uno, hasta 5 por día. Idempotente. */
    private static function absorberEnLinea(int $j, array $inst): void
    {
        if (!Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pase_xp'")) return;
        $q = implode(', ', array_fill(0, count(self::FUENTES_EN_LINEA), '?'));
        $filas = Db::todas('SELECT p.id, p.creado FROM pase_xp p WHERE p.jugador_id = ? AND p.creado BETWEEN ? AND ? AND p.fuente IN (' . $q . ')
                            AND NOT EXISTS (SELECT 1 FROM evs_fichas f WHERE f.instancia = ? AND f.jugador_id = p.jugador_id AND f.ref = \'linea:\' || p.id) ORDER BY p.id LIMIT 200',
            array_merge([$j, $inst['desde'], min($inst['hasta'], self::ahora())], self::FUENTES_EN_LINEA, [$inst['id']]));
        foreach ($filas as $f) {
            $dia = self::dia((int) $f['creado']);
            $ya = (int) Db::valor("SELECT COUNT(*) FROM evs_fichas WHERE instancia = ? AND jugador_id = ? AND motivo = 'en_linea' AND dia = ?", [$inst['id'], $j, $dia]);
            $fichas = $ya < self::TOPE_EN_LINEA_DIA ? self::FICHAS_EN_LINEA : 0;
            Db::q('INSERT OR IGNORE INTO evs_fichas (instancia, jugador_id, servidor_id, motivo, ref, fichas, aporte, dia, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$inst['id'], $j, self::servidorDe($j), 'en_linea', 'linea:' . (int) $f['id'], $fichas, $fichas > 0 ? self::APORTE_EN_LINEA : 0, $dia, (int) $f['creado']]);
        }
    }

    // ------------------------------------------------------------------------------------------ objetivo común
    /** Meta del servidor en esa edición: la fija del panel, la ya calculada, o se calcula ahora y queda fija. */
    public static function meta(array $inst, int $sid): int
    {
        if ($inst['meta_fija']) return (int) $inst['meta_fija'];
        $m = Db::valor('SELECT meta FROM evs_metas WHERE instancia = ? AND servidor_id = ?', [$inst['id'], $sid]);
        if ($m !== null) return (int) $m;
        $activos = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE servidor_id = ? AND ultimo_ingreso >= ?', [$sid, self::ahora() - 7 * 86400]);
        $dias = max(1, (int) ceil(($inst['hasta'] - $inst['desde']) / 86400));
        $meta = (int) (round(max(1, $activos) * $dias * self::META_FACTOR / 10) * 10);
        $meta = max(self::META_MIN, min(self::META_MAX, $meta));
        Db::q('INSERT OR IGNORE INTO evs_metas (instancia, servidor_id, meta, creado) VALUES (?, ?, ?, ?)', [$inst['id'], $sid, $meta, self::ahora()]);
        return (int) Db::valor('SELECT meta FROM evs_metas WHERE instancia = ? AND servidor_id = ?', [$inst['id'], $sid]);
    }

    public static function progreso(string $inst, int $sid): int
    {
        return (int) Db::valor('SELECT COALESCE(SUM(aporte), 0) FROM evs_fichas WHERE instancia = ? AND servidor_id = ?', [$inst, $sid]);
    }

    private static function umbral(int $meta, string $hito): int { return (int) ceil($meta * self::HITOS[$hito]['en'] / 100); }

    /** Tabla especial del evento en el servidor: las 10 productoras con más fichas ganadas (+ tu puesto). */
    public static function tabla(string $inst, int $sid, ?int $j = null): array
    {
        $filas = Db::todas("SELECT f.jugador_id, SUM(f.fichas) AS n, j.alias, j.nombre FROM evs_fichas f JOIN jugadores j ON j.id = f.jugador_id
                            WHERE f.instancia = ? AND f.servidor_id = ? AND f.fichas > 0 GROUP BY f.jugador_id HAVING n > 0 ORDER BY n DESC, MIN(f.id) LIMIT 10", [$inst, $sid]);
        $o = ['top' => array_map(fn($f, $i) => ['puesto' => $i + 1, 'nombre' => Social::nombrePublico($f['alias'], $f['nombre']), 'fichas' => (int) $f['n'], 'tu' => $j !== null && (int) $f['jugador_id'] === $j], $filas, array_keys($filas)), 'tu' => null];
        if ($j) {
            $mio = (int) Db::valor('SELECT COALESCE(SUM(fichas), 0) FROM evs_fichas WHERE instancia = ? AND jugador_id = ? AND fichas > 0', [$inst, $j]);
            if ($mio > 0) {
                $antes = (int) Db::valor('SELECT COUNT(*) FROM (SELECT jugador_id, SUM(fichas) AS n FROM evs_fichas WHERE instancia = ? AND servidor_id = ? AND fichas > 0 GROUP BY jugador_id) WHERE n > ?', [$inst, $sid, $mio]);
                $o['tu'] = ['puesto' => $antes + 1, 'fichas' => $mio];
            }
        }
        return $o;
    }

    // ------------------------------------------------------------------------------------------ estado (GET /api/eventos_servidor)
    public static function estado(?int $j = null): array
    {
        self::preparar();
        $c = self::config();
        $t = self::ahora();
        $sid = $j ? self::servidorDe($j) : 0;
        $cal = array_map(fn($i) => ['id' => $i['id'], 'clave' => $i['clave'], 'tipo' => $i['tipo'], 'icono' => $i['icono'], 'desde' => Db::iso($i['desde']), 'hasta' => Db::iso($i['hasta']),
                                    'fase' => $i['fase'], 'futbol' => $i['futbol']],
            array_values(array_filter(self::instancias($t - self::DIAS_RECLAMO_META * 86400, $t + 400 * 86400, $c), fn($i) => $i['fase'] !== 'apagada' && $i['hasta'] >= $t)));
        $eventos = [];
        if ($c['activo']) foreach (self::instancias($t - self::DIAS_RECLAMO_META * 86400, $t, $c) as $i) {
            if ($i['tipo'] !== 'evento' || ($i['fase'] !== 'activa' && $i['fase'] !== 'terminada')) continue;
            if ($i['fase'] === 'terminada' && !$j) continue;
            if ($j && $i['fase'] === 'activa') Db::tx(fn() => self::absorberEnLinea($j, $i));
            $eventos[] = self::estadoEvento($i, $j, $sid);
        }
        // Las terminadas solo se muestran si queda un premio común por reclamar
        $eventos = array_values(array_filter($eventos, fn($e) => $e['fase'] === 'activa' || array_filter($e['meta']['hitos'] ?? [], fn($h) => $h['cumplido'] && !$h['reclamado'])));
        return ['ok' => true, 'ahora' => Db::iso($t), 'hoy' => self::dia(), 'zona' => self::ZONA, 'activo' => $c['activo'], 'calendario' => $cal, 'eventos' => $eventos,
                'adviento' => self::estadoAdviento($j, $c), 'cosmeticos' => $j ? array_map('strval', array_column(Db::todas('SELECT clave FROM evs_cosmeticos WHERE jugador_id = ? ORDER BY creado', [$j]), 'clave')) : [],
                'fichas_por' => ['diario' => self::FICHAS_DIARIO, 'evento' => self::FICHAS_EVENTO, 'evento_bueno' => self::FICHAS_EVENTO_BUENO, 'en_linea' => self::FICHAS_EN_LINEA,
                                 'tope_eventos' => self::TOPE_EVENTOS_DIA, 'tope_en_linea' => self::TOPE_EN_LINEA_DIA]];
    }

    private static function estadoEvento(array $i, ?int $j, int $sid): array
    {
        $t = self::ahora();
        $comprados = $j ? array_column(Db::todas('SELECT articulo, COUNT(*) AS n FROM evs_compras WHERE instancia = ? AND jugador_id = ? GROUP BY articulo', [$i['id'], $j]), 'n', 'articulo') : [];
        $tienda = [];
        foreach (self::tienda($i) as $id => $a) $tienda[] = ['id' => $id, 'precio' => $a['precio'], 'max' => $a['max'], 'comprados' => (int) ($comprados[$id] ?? 0)] + self::premioJson($a['premio']);
        $o = ['id' => $i['id'], 'clave' => $i['clave'], 'icono' => $i['icono'], 'fase' => $i['fase'], 'desde' => Db::iso($i['desde']), 'hasta' => Db::iso($i['hasta']),
              'quedan_dias' => max(0, (int) floor(($i['hasta'] - $t) / 86400)), 'futbol' => $i['futbol'], 'deco' => $i['deco'],
              'oferta' => $i['fase'] === 'activa' ? self::ofertaValida($i['oferta']) : null, 'tienda' => $tienda, 'fichas' => null, 'hoy' => null, 'meta' => null, 'tabla' => null];
        if (!$j) return $o;
        $o['fichas'] = self::saldo($j, $i['id']);
        $o['ganadas'] = (int) Db::valor('SELECT COALESCE(SUM(fichas), 0) FROM evs_fichas WHERE instancia = ? AND jugador_id = ? AND fichas > 0', [$i['id'], $j]);
        $o['hoy'] = ['diario' => (bool) Db::valor('SELECT 1 FROM evs_fichas WHERE instancia = ? AND jugador_id = ? AND ref = ?', [$i['id'], $j, 'diario:' . self::dia()]),
                     'eventos' => self::hoyCuenta($j, $i['id'], 'evento'), 'en_linea' => self::hoyCuenta($j, $i['id'], 'en_linea')];
        if ($sid > 0) {
            $meta = self::meta($i, $sid);
            $prog = self::progreso($i['id'], $sid);
            $recl = array_column(Db::todas('SELECT hito FROM evs_premios_meta WHERE instancia = ? AND jugador_id = ?', [$i['id'], $j]), 'hito');
            $hitos = [];
            foreach (self::HITOS as $h => $d) {
                $u = self::umbral($meta, $h);
                $hitos[] = ['hito' => $h, 'en' => $u, 'pct' => $d['en'], 'cumplido' => $prog >= $u, 'reclamado' => in_array($h, $recl, true), 'premios' => array_map([self::class, 'premioJson'], $d['premios'])];
            }
            if ($prog >= $meta) Db::q('UPDATE evs_metas SET cumplida = ? WHERE instancia = ? AND servidor_id = ? AND cumplida IS NULL', [$t, $i['id'], $sid]);
            $srv = Db::fila('SELECT id, nombre FROM servidores WHERE id = ?', [$sid]);
            $o['meta'] = ['meta' => $meta, 'progreso' => $prog, 'pct' => min(100, (int) floor($prog * 100 / max(1, $meta))), 'hitos' => $hitos,
                          'servidor' => $srv ? ['id' => (int) $srv['id'], 'nombre' => (string) $srv['nombre']] : null];
            $o['tabla'] = self::tabla($i['id'], $sid, $j);
        }
        return $o;
    }

    /** El producto de la oferta si existe y se vende (los de un módulo que no está instalado quedan fuera). */
    private static function ofertaValida(?string $id): ?string
    {
        if ($id === null) return null;
        $p = Catalogo::PRODUCTOS[$id] ?? null;
        if (!$p || !empty($p['oculto'])) return null;
        if (!empty($p['modulo']) && !class_exists(__NAMESPACE__ . '\\' . $p['modulo'])) return null;
        return $id;
    }

    // ------------------------------------------------------------------------------------------ acciones del jugador
    private static function exigirActiva(array $i): void
    {
        Fallo::si($i['fase'] === 'pronto', 'Este evento todavía no empieza.', 409, ['codigo' => 'evento_pronto']);
        Fallo::si($i['fase'] === 'terminada', 'Este evento ya terminó.', 410, ['codigo' => 'evento_terminado']);
        Fallo::si($i['fase'] !== 'activa' || $i['tipo'] !== 'evento', 'Este evento no está disponible.', 409, ['codigo' => 'evento_apagado']);
    }

    private static function instanciaO404(string $id): array
    {
        $i = self::instancia($id);
        Fallo::si($i === null, 'Ese evento no existe.', 404, ['codigo' => 'evento_desconocido']);
        return $i;
    }

    private static function limite(int $j): void
    {
        if (Limite::contar('evs:j:' . $j, 120) || Limite::contar('evs:ip:' . Http::ip(), 600))
            throw new Fallo('Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.', 429, ['codigo' => 'limite_intentos']);
    }

    /** POST /api/eventos_servidor/diario {instancia}: 5 fichas una vez al día (hora de Ecuador). */
    public static function diario(int $j, string $id): array
    {
        self::preparar();
        self::limite($j);
        Cuentas::exigirActiva($j);
        $i = self::instanciaO404($id);
        self::exigirActiva($i);
        $nuevo = Db::tx(fn() => self::anotar($j, $i['id'], 'diario', 'diario:' . self::dia(), self::FICHAS_DIARIO, 0));
        Fallo::si(!$nuevo, 'Ya recibiste tus fichas de hoy. Vuelve mañana.', 409, ['codigo' => 'evento_diario_hecho']);
        return ['ok' => true, 'fichas_recibidas' => self::FICHAS_DIARIO, 'evento' => self::estadoEvento(self::instancia($id), $j, self::servidorDe($j))];
    }

    /**
     * POST /api/eventos_servidor/jugar {eventos: [{ref, estrellas}]}: eventos jugados en la partida. Suman fichas y avance del objetivo
     * en cada evento del servidor en curso (hasta 12 por día y evento). Devuelve {ok, contados, fichas: {instancia: saldo}}.
     */
    public static function jugar(int $j, mixed $lista): array
    {
        self::preparar();
        self::limite($j);
        Cuentas::exigirActiva($j);
        Fallo::si(!is_array($lista) || !array_is_list($lista) || count($lista) > self::MAX_POR_PEDIDO, 'Lista de eventos no válida.', 400, ['codigo' => 'evento_lista']);
        $limpios = [];
        foreach ($lista as $e) {
            $ref = is_array($e) && is_string($e['ref'] ?? null) ? $e['ref'] : '';
            if (!preg_match('/^[A-Za-z0-9:_.-]{4,64}$/', $ref)) continue;
            $est = is_int($e['estrellas'] ?? null) ? max(0, min(5, $e['estrellas'])) : 0;
            $limpios[$ref] = $est;
        }
        $act = self::activas();
        $contados = 0; $fichas = [];
        Db::tx(function () use ($j, $limpios, $act, &$contados, &$fichas): void {
            foreach ($act as $i) {
                foreach ($limpios as $ref => $est) {
                    if (self::hoyCuenta($j, $i['id'], 'evento') >= self::TOPE_EVENTOS_DIA) break;
                    $n = self::FICHAS_EVENTO + ($est >= 4 ? self::FICHAS_EVENTO_BUENO : 0);
                    if (self::anotar($j, $i['id'], 'evento', 'ev:' . $ref, $n, self::APORTE_EVENTO)) $contados++;
                }
                $fichas[$i['id']] = self::saldo($j, $i['id']);
            }
        });
        return ['ok' => true, 'contados' => $contados, 'fichas' => (object) $fichas];
    }

    /** POST /api/eventos_servidor/comprar {instancia, articulo}: cambia fichas por un artículo de la tienda de temporada. */
    public static function comprar(int $j, string $id, string $articulo): array
    {
        self::preparar();
        self::limite($j);
        Cuentas::exigirActiva($j);
        $i = self::instanciaO404($id);
        self::exigirActiva($i);
        $tienda = self::tienda($i);
        Fallo::si(!isset($tienda[$articulo]), 'Ese artículo no está en la tienda de este evento.', 404, ['codigo' => 'evento_articulo']);
        $a = $tienda[$articulo];
        $r = Db::tx(function () use ($j, $i, $articulo, $a): array {
            $n = (int) Db::valor('SELECT COUNT(*) FROM evs_compras WHERE instancia = ? AND jugador_id = ? AND articulo = ?', [$i['id'], $j, $articulo]);
            Fallo::si($n >= $a['max'], 'Ya compraste ' . ($a['max'] === 1 ? 'este artículo' : 'las ' . $a['max'] . ' unidades de este artículo') . ' en este evento.', 409, ['codigo' => 'evento_agotado']);
            if ($a['premio']['tipo'] === 'cosmetico')
                Fallo::si((bool) Db::valor('SELECT 1 FROM evs_cosmeticos WHERE jugador_id = ? AND clave = ?', [$j, $a['premio']['item']]), 'Ya tienes esta decoración.', 409, ['codigo' => 'evento_agotado']);
            $saldo = self::saldo($j, $i['id']);
            Fallo::si($saldo < $a['precio'], 'Te faltan ' . ($a['precio'] - $saldo) . ' fichas. Gánalas jugando eventos.', 409, ['codigo' => 'evento_sin_fichas', 'faltan' => $a['precio'] - $saldo]);
            Fallo::si(!self::anotar($j, $i['id'], 'tienda', 'compra:' . $articulo . ':' . ($n + 1), -$a['precio'], 0), 'Esa compra ya se hizo.', 409, ['codigo' => 'evento_agotado']);
            Db::q('INSERT INTO evs_compras (instancia, jugador_id, articulo, fichas, creado) VALUES (?, ?, ?, ?, ?)', [$i['id'], $j, $articulo, $a['precio'], self::ahora()]);
            return self::entregar($j, [$a['premio']], 'evento:' . $i['id'] . ':' . $articulo);
        });
        Auditoria::anotar('juego', 'evento_servidor_compra', self::NOMBRES[$i['clave']] . ' ' . $i['anio'] . ': ' . self::nombrePremio($a['premio']) . ' por ' . $a['precio'] . ' fichas', $j);
        return ['ok' => true, 'recibido' => self::nombrePremio($a['premio'])] + $r + ['saldo_creditos' => Monedero::saldo($j), 'evento' => self::estadoEvento(self::instancia($id), $j, self::servidorDe($j))];
    }

    /** POST /api/eventos_servidor/meta {instancia, hito}: premio del objetivo común (mitad o meta) para todos los del servidor. */
    public static function reclamarMeta(int $j, string $id, string $hito): array
    {
        self::preparar();
        self::limite($j);
        Cuentas::exigirActiva($j);
        $i = self::instanciaO404($id);
        Fallo::si(!isset(self::HITOS[$hito]), 'Ese premio no existe.', 404, ['codigo' => 'evento_hito']);
        Fallo::si($i['tipo'] !== 'evento' || ($i['fase'] !== 'activa' && $i['fase'] !== 'terminada'), 'Este evento no está disponible.', 409, ['codigo' => 'evento_apagado']);
        Fallo::si($i['fase'] === 'terminada' && self::ahora() > $i['hasta'] + self::DIAS_RECLAMO_META * 86400, 'Ya pasó el plazo para reclamar este premio.', 410, ['codigo' => 'evento_terminado']);
        $sid = self::servidorDe($j);
        $r = Db::tx(function () use ($j, $i, $hito, $sid): array {
            $meta = self::meta($i, $sid);
            $prog = self::progreso($i['id'], $sid);
            Fallo::si($prog < self::umbral($meta, $hito), 'Tu servidor todavía no llega a esta meta: ' . $prog . ' de ' . self::umbral($meta, $hito) . '.', 409, ['codigo' => 'evento_meta_falta']);
            $n = Db::q('INSERT OR IGNORE INTO evs_premios_meta (instancia, jugador_id, hito, creado) VALUES (?, ?, ?, ?)', [$i['id'], $j, $hito, self::ahora()])->rowCount();
            Fallo::si($n !== 1, 'Ya reclamaste este premio.', 409, ['codigo' => 'evento_meta_hecha']);
            return self::entregar($j, self::HITOS[$hito]['premios'], 'evento:' . $i['id'] . ':meta_' . $hito);
        });
        return ['ok' => true, 'recibido' => implode(' · ', array_map([self::class, 'nombrePremio'], self::HITOS[$hito]['premios']))] + $r
             + ['saldo_creditos' => Monedero::saldo($j), 'evento' => self::estadoEvento(self::instancia($id), $j, $sid)];
    }

    // ------------------------------------------------------------------------------------------ adviento
    /** Día de diciembre de hoy (1 a 26) o null. */
    private static function diaDiciembre(): ?int
    {
        $d = self::dia();
        if (substr($d, 5, 2) !== '12') return null;
        $n = (int) substr($d, 8, 2);
        return $n <= 26 ? $n : null;
    }

    public static function estadoAdviento(?int $j, ?array $c = null): ?array
    {
        $c ??= self::config();
        $hoy = self::diaDiciembre();
        if (!$c['adviento'] || $hoy === null) return null;
        $anio = (int) substr(self::dia(), 0, 4);
        $tomados = $j ? array_column(Db::todas('SELECT dia, recuperado FROM evs_adviento WHERE anio = ? AND jugador_id = ?', [$anio, $j]), 'recuperado', 'dia') : [];
        $dias = [];
        foreach (self::ADVIENTO as $d => $premios) {
            $estado = isset($tomados[$d]) ? 'reclamado' : ($d === $hoy ? 'hoy' : ($d === $hoy - 1 ? 'recuperar' : ($d < $hoy ? 'perdido' : 'futuro')));
            $dias[] = ['dia' => $d, 'estado' => $estado, 'premios' => array_map([self::class, 'premioJson'], $premios)];
        }
        return ['anio' => $anio, 'hoy' => $hoy, 'dias' => $dias, 'reclamados' => count($tomados)];
    }

    /** POST /api/eventos_servidor/adviento {dia}: el regalo de hoy, o el de ayer si se perdió (uno por día, siempre fijo). */
    public static function adviento(int $j, int $dia): array
    {
        self::preparar();
        self::limite($j);
        Cuentas::exigirActiva($j);
        $c = self::config();
        $hoy = self::diaDiciembre();
        Fallo::si(!$c['adviento'] || $hoy === null, 'El calendario de adviento es del 1 al 25 de diciembre.', 409, ['codigo' => 'adviento_cerrado']);
        Fallo::si(!isset(self::ADVIENTO[$dia]), 'Ese día no está en el calendario.', 404, ['codigo' => 'adviento_dia']);
        Fallo::si($dia > $hoy, 'Ese regalo todavía no se abre.', 409, ['codigo' => 'adviento_pronto']);
        Fallo::si($dia < $hoy - 1, 'Ese regalo ya pasó: solo se recupera el de ayer.', 410, ['codigo' => 'adviento_perdido']);
        $anio = (int) substr(self::dia(), 0, 4);
        $r = Db::tx(function () use ($j, $dia, $hoy, $anio): array {
            $n = Db::q('INSERT OR IGNORE INTO evs_adviento (anio, jugador_id, dia, recuperado, creado) VALUES (?, ?, ?, ?, ?)', [$anio, $j, $dia, $dia < $hoy ? 1 : 0, self::ahora()])->rowCount();
            Fallo::si($n !== 1, 'Ya abriste el regalo de ese día.', 409, ['codigo' => 'adviento_hecho']);
            return self::entregar($j, self::ADVIENTO[$dia], 'adviento:' . $anio . ':' . $dia);
        });
        return ['ok' => true, 'recibido' => implode(' · ', array_map([self::class, 'nombrePremio'], self::ADVIENTO[$dia])), 'recuperado' => $dia < $hoy] + $r
             + ['saldo_creditos' => Monedero::saldo($j), 'adviento' => self::estadoAdviento($j, $c)];
    }

    // ------------------------------------------------------------------------------------------ Centro de Control
    /** Avance del objetivo común de una edición en cada servidor. */
    public static function resumenServidores(array $i): array
    {
        $o = [];
        foreach (Db::todas('SELECT id, nombre FROM servidores ORDER BY id') as $s) {
            $sid = (int) $s['id'];
            $tiene = (bool) Db::valor('SELECT 1 FROM evs_metas WHERE instancia = ? AND servidor_id = ?', [$i['id'], $sid]) || $i['meta_fija'];
            $prog = self::progreso($i['id'], $sid);
            $meta = $tiene ? self::meta($i, $sid) : null;
            $jug = (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM evs_fichas WHERE instancia = ? AND servidor_id = ?', [$i['id'], $sid]);
            $o[] = ['id' => $sid, 'nombre' => (string) $s['nombre'], 'meta' => $meta, 'progreso' => $prog, 'jugadores' => $jug,
                    'pct' => $meta ? min(100, (int) floor($prog * 100 / $meta)) : null,
                    'premios' => (int) Db::valor('SELECT COUNT(*) FROM evs_premios_meta p JOIN jugadores j ON j.id = p.jugador_id WHERE p.instancia = ? AND j.servidor_id = ?', [$i['id'], $sid])];
        }
        return $o;
    }

    public static function totales(string $inst): array
    {
        $f = Db::fila("SELECT COUNT(DISTINCT jugador_id) AS jugadores, COALESCE(SUM(CASE WHEN fichas > 0 THEN fichas END), 0) AS ganadas, COALESCE(-SUM(CASE WHEN fichas < 0 THEN fichas END), 0) AS gastadas FROM evs_fichas WHERE instancia = ?", [$inst]);
        return ['jugadores' => (int) ($f['jugadores'] ?? 0), 'ganadas' => (int) ($f['ganadas'] ?? 0), 'gastadas' => (int) ($f['gastadas'] ?? 0),
                'compras' => (int) Db::valor('SELECT COUNT(*) FROM evs_compras WHERE instancia = ?', [$inst])];
    }

    public static function totalAdviento(int $anio): array
    {
        return ['regalos' => (int) Db::valor('SELECT COUNT(*) FROM evs_adviento WHERE anio = ?', [$anio]), 'jugadores' => (int) Db::valor('SELECT COUNT(DISTINCT jugador_id) FROM evs_adviento WHERE anio = ?', [$anio]),
                'recuperados' => (int) Db::valor('SELECT COUNT(*) FROM evs_adviento WHERE anio = ? AND recuperado = 1', [$anio])];
    }
}
