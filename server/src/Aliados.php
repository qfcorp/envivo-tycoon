<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * "Productores Aliados" (idea 8 de propuestas): programa de creadores con código propio (PRODUCTOR-JUAN).
 * Tablas en migraciones/invitar_creadores.sql; integración en server/INTEGRAR_INVITAR.md.
 *  - Los códigos se crean en el Centro de Control (pestaña "Invitar y aliados"): nombre, redes, nivel, cuenta del creador
 *    en el juego, porcentaje y créditos mensuales (vacío = por defecto).
 *  - Quien escribe el código (en "Canjear código" del buzón, en canjear.html, al crear la cuenta o con el enlace
 *    ?ref=PRODUCTOR-JUAN) recibe un regalo PEQUEÑO del juego (nunca un descuento) y queda asociado a ese creador (uno por
 *    cuenta, el primero). Regalo: uno por aparato y pocos por conexión al día; un creador no puede usar su propio código.
 *  - El creador: insignia "Productor Aliado" en su vitrina y créditos mensuales para SU cuenta (llegan al buzón la primera
 *    vez que abre el juego cada mes).
 *  - Pago al creador: aparte, en DINERO, como publicidad. El sistema solo CALCULA (compras pagadas de sus jugadores después
 *    de usar el código, Plux / PayPal / Google en dólares, por mes, × porcentaje; 10 % por defecto) y deja anotar "pagado".
 *    Jamás convierte créditos en dinero ni mueve créditos por esto.
 *  - Postulaciones desde /aliados.html: POST /api/aliados/postular (sin cuenta) → tabla + correo a soporte.
 */
final class Aliados
{
    public const PCT_DEFECTO = 10.0;
    public const NIVELES = [
        1 => ['nombre' => 'Nivel 1 · Inicial', 'desde' => '500+ seguidores en videos cortos o 100+ suscriptores en su canal', 'creditos' => 100],
        2 => ['nombre' => 'Nivel 2 · En ascenso', 'desde' => '2.000+ seguidores o 1.000+ suscriptores', 'creditos' => 200],
        3 => ['nombre' => 'Nivel 3 · Destacado', 'desde' => '5.000+ seguidores o 3.000+ suscriptores', 'creditos' => 350],
        4 => ['nombre' => 'Nivel 4 · Estrella', 'desde' => '10.000+ seguidores o suscriptores', 'creditos' => 500],
        5 => ['nombre' => 'Nivel 5 · Leyenda', 'desde' => '50.000+ seguidores o suscriptores', 'creditos' => 800],
    ];
    /** Regalo pequeño para quien usa el código (del juego; nunca un descuento). */
    public const REGALO = [
        ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2000],
        ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2],
        ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2],
    ];
    public const IP_MAX_REGALO = 5;        // regalos por conexión en 24 horas
    public const MAX_CREDITOS_MES = 5000;  // tope de un adjunto de créditos del buzón
    public const POSTULAR_IP = 3;          // postulaciones por conexión cada 10 minutos
    public const CANALES = ['codigo' => 'Canjear código (juego)', 'web' => 'canjear.html', 'registro' => 'al crear la cuenta', 'enlace' => 'enlace ?ref='];

    private static ?int $reloj = null;

    public static function fijarReloj(?int $t): void { self::$reloj = $t; }
    public static function ahora(): int { return self::$reloj ?? time(); }
    public static function preparar(): void { Invitaciones::preparar(); }

    public static function pctDefecto(): float
    {
        $v = Ajustes::get('aliados_pct', '');
        return is_numeric($v) && (float) $v >= 0 && (float) $v <= 100 ? (float) $v : self::PCT_DEFECTO;
    }

    public static function porCodigo(string $normalizado): ?array
    {
        self::preparar();
        return $normalizado === '' ? null : Db::fila('SELECT * FROM aliados WHERE codigo = ?', [$normalizado]);
    }

    /** ¿Es el código (ya normalizado con Buzon::normalizarCodigo) de un creador activo? */
    public static function esCodigo(string $normalizado): bool
    {
        if (!preg_match('/^[A-Z0-9]{4,32}$/', $normalizado)) return false;
        $a = self::porCodigo($normalizado);
        return $a !== null && (int) $a['activo'] === 1;
    }

    public static function creditosDe(array $a): int
    {
        return $a['creditos_mes'] !== null ? (int) $a['creditos_mes'] : self::NIVELES[(int) $a['nivel']]['creditos'];
    }

    public static function pctDe(array $a): float { return $a['porcentaje'] !== null ? (float) $a['porcentaje'] : self::pctDefecto(); }

    // ------------------------------------------------------------------------------------------ usar el código
    /**
     * Asocia al jugador con el creador y le manda el regalo (si corresponde). $canal: codigo | web | registro | enlace.
     * Errores (Fallo con codigo): aliado_codigo, aliado_ya, aliado_propio, cuenta_*. Devuelve {ok, aliado:{nombre, codigo}, regalo, mensaje_id}.
     */
    public static function usar(int $jugador, string $texto, string $canal = 'codigo', mixed $instalacion = null): array
    {
        self::preparar();
        Cuentas::exigirActiva($jugador);
        $cod = Buzon::normalizarCodigo(mb_substr($texto, 0, 60));
        $a = self::esCodigo($cod) ? self::porCodigo($cod) : null;
        Fallo::si(!$a, 'Ese código de creador no existe o ya no está activo.', 404, ['codigo' => 'aliado_codigo']);
        Fallo::si($a['jugador_id'] !== null && (int) $a['jugador_id'] === $jugador, 'No puedes usar tu propio código de creador.', 409, ['codigo' => 'aliado_propio']);
        $canal = isset(self::CANALES[$canal]) ? $canal : 'codigo';
        $inst = Invitaciones::instalacion($instalacion);
        $ip = Http::ip();
        return Db::tx(function () use ($jugador, $a, $canal, $inst, $ip): array {
            $t = self::ahora();
            $ya = Db::fila('SELECT u.*, a.codigo_ver FROM aliados_usos u JOIN aliados a ON a.id = u.aliado_id WHERE u.jugador_id = ?', [$jugador]);
            if ($ya) throw new Fallo('Ya usaste un código de creador en esta cuenta (' . $ya['codigo_ver'] . '). Es uno por cuenta.', 409, ['codigo' => 'aliado_ya']);
            $motivo = null;
            if ($inst !== null && Db::valor('SELECT 1 FROM aliados_usos WHERE instalacion = ? AND regalo = 1', [$inst])) $motivo = 'aparato_repetido';
            elseif ($ip !== '' && (int) Db::valor('SELECT COUNT(*) FROM aliados_usos WHERE ip = ? AND regalo = 1 AND creado >= ?', [$ip, $t - 86400]) >= self::IP_MAX_REGALO) $motivo = 'misma_conexion';
            $regalo = $motivo === null;
            Db::q('INSERT INTO aliados_usos (jugador_id, aliado_id, canal, instalacion, ip, regalo, motivo, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$jugador, (int) $a['id'], $canal, $inst, $ip !== '' ? $ip : null, $regalo ? 1 : 0, $motivo, $t]);
            $clave = $regalo ? 'aliado_regalo' : 'aliado_sin_regalo';
            $mid = Buzon::enviarPlantilla($jugador, $clave . '_t', $clave . '_c', ['nombre' => (string) $a['nombre'], 'codigo' => (string) $a['codigo_ver']],
                $regalo ? self::REGALO : [], ['tipo' => 'codigo', 'ref' => 'aliado:uso']);
            Auditoria::anotar('juego', 'aliado_codigo_uso', 'Código de creador ' . $a['codigo_ver'] . ' (' . self::CANALES[$canal] . ')' . ($regalo ? ' con regalo' : ' sin regalo: ' . $motivo), $jugador);
            return ['ok' => true, 'aliado' => ['nombre' => (string) $a['nombre'], 'codigo' => (string) $a['codigo_ver']], 'regalo' => $regalo, 'motivo' => $motivo, 'mensaje_id' => $mid];
        });
    }

    /** Canje desde el buzón (Buzon::canjear): lo mismo que un código del buzón + "aliado". */
    public static function canjearCodigo(int $jugador, string $cod, string $canal = 'juego', mixed $instalacion = null): array
    {
        $r = self::usar($jugador, $cod, in_array($canal, ['web'], true) ? $canal : 'codigo', $instalacion);   // juego → canal codigo
        $o = ['ok' => true, 'codigo' => $r['aliado']['codigo'], 'aliado' => $r['aliado'], 'regalo' => $r['regalo']];
        $mid = $r['mensaje_id'] ?: (int) Db::valor('SELECT id FROM buzon WHERE jugador_id = ? AND ref = ?', [$jugador, 'aliado:uso']);
        if ($mid) { $m = Db::fila('SELECT * FROM buzon WHERE id = ?', [$mid]); if ($m) $o['mensaje'] = Buzon::json($m); }
        return $o + Buzon::resumen($jugador);
    }

    // ------------------------------------------------------------------------------------------ el creador en el juego
    /** {nivel} si el jugador es un creador activo con la cuenta vinculada; si no, null. */
    public static function insignia(int $jugador): ?array
    {
        self::preparar();
        $a = Db::fila('SELECT nivel FROM aliados WHERE jugador_id = ? AND activo = 1', [$jugador]);
        return $a ? ['nivel' => (int) $a['nivel']] : null;
    }

    /** Créditos del mes para la cuenta del creador (una vez por mes, al buzón). Devuelve los créditos entregados ahora (0 = nada). */
    public static function entregarCreditosMes(int $jugador): int
    {
        self::preparar();
        $a = Db::fila('SELECT * FROM aliados WHERE jugador_id = ? AND activo = 1', [$jugador]);
        if (!$a) return 0;
        $cr = min(self::MAX_CREDITOS_MES, self::creditosDe($a));
        if ($cr <= 0) return 0;
        $mes = date('Y-m', self::ahora());
        return Db::tx(function () use ($a, $jugador, $cr, $mes): int {
            if (Db::q('INSERT OR IGNORE INTO aliados_creditos (aliado_id, mes, jugador_id, creditos, creado) VALUES (?, ?, ?, ?, ?)', [(int) $a['id'], $mes, $jugador, $cr, self::ahora()])->rowCount() !== 1) return 0;
            Buzon::enviarPlantilla($jugador, 'aliado_creditos_t', 'aliado_creditos_c', ['mes' => $mes],
                [['tipo' => 'creditos', 'item' => '-', 'cantidad' => $cr]], ['tipo' => 'regalo', 'ref' => 'aliado:creditos:' . $mes, 'dias' => 60]);
            Auditoria::anotar('juego', 'aliado_creditos_mes', 'Productor Aliado ' . $a['codigo_ver'] . ': ' . $cr . ' créditos de ' . $mes . ' (para jugar, no se cambian por dinero)', $jugador);
            return $cr;
        });
    }

    /** Parte de GET /api/invitar: el creador que apoyas y, si eres creador, tu código y cuántos lo usaron. Sin montos de dinero. */
    public static function estadoJugador(int $jugador): array
    {
        self::preparar();
        $u = Db::fila('SELECT a.nombre, a.codigo_ver FROM aliados_usos u JOIN aliados a ON a.id = u.aliado_id WHERE u.jugador_id = ?', [$jugador]);
        $a = Db::fila('SELECT * FROM aliados WHERE jugador_id = ? AND activo = 1', [$jugador]);
        $soy = null;
        if ($a) {
            $soy = ['codigo' => (string) $a['codigo_ver'], 'nivel' => (int) $a['nivel'], 'nivel_nombre' => self::NIVELES[(int) $a['nivel']]['nombre'],
                'jugadores' => (int) Db::valor('SELECT COUNT(*) FROM aliados_usos WHERE aliado_id = ?', [(int) $a['id']]),
                'creditos_mes' => min(self::MAX_CREDITOS_MES, self::creditosDe($a)),
                'enlace' => rtrim(Http::urlBase(), '/') . '/?ref=' . rawurlencode((string) $a['codigo_ver'])];
        }
        return ['creador' => $u ? ['nombre' => (string) $u['nombre'], 'codigo' => (string) $u['codigo_ver']] : null, 'aliado' => $soy];
    }

    // ------------------------------------------------------------------------------------------ Centro de Control
    /**
     * Crea ($id null) o cambia un creador. $d: codigo, nombre, redes, nivel, cuenta (N° o correo, vacío = sin cuenta),
     * porcentaje (vacío = por defecto), creditos_mes (vacío = por nivel), activo, notas. Audita. Devuelve la fila.
     */
    public static function guardar(array $d, ?int $id, string $quien): array
    {
        self::preparar();
        $ver = strtoupper(trim((string) ($d['codigo'] ?? '')));
        Fallo::si(!preg_match('/^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/', $ver), 'El código va de 4 a 32 letras o números, con guiones en medio si quieres (ej. PRODUCTOR-JUAN).', 400, ['codigo' => 'codigo_formato']);
        $cod = Buzon::normalizarCodigo($ver);
        Fallo::si(!preg_match('/^[A-Z0-9]{4,32}$/', $cod), 'El código debe tener al menos 4 letras o números.', 400, ['codigo' => 'codigo_formato']);
        $nombre = Buzon::limpiarLinea((string) ($d['nombre'] ?? ''), 60);
        Fallo::si($nombre === '', 'Escribe el nombre del creador.', 400, ['codigo' => 'aliado_nombre']);
        $redes = Buzon::limpiarTexto((string) ($d['redes'] ?? ''), 500);
        $nivel = (int) ($d['nivel'] ?? 1);
        Fallo::si(!isset(self::NIVELES[$nivel]), 'El nivel va de 1 a 5.', 400, ['codigo' => 'aliado_nivel']);
        $pct = trim(str_replace(',', '.', (string) ($d['porcentaje'] ?? '')));
        Fallo::si($pct !== '' && (!is_numeric($pct) || (float) $pct < 0 || (float) $pct > 50), 'El porcentaje va de 0 a 50 (vacío = el de todos).', 400, ['codigo' => 'aliado_porcentaje']);
        $cr = trim((string) ($d['creditos_mes'] ?? ''));
        Fallo::si($cr !== '' && (!preg_match('/^\d{1,5}$/', $cr) || (int) $cr > self::MAX_CREDITOS_MES), 'Créditos al mes: de 0 a ' . self::MAX_CREDITOS_MES . ' (vacío = los del nivel).', 400, ['codigo' => 'aliado_creditos']);
        $cuenta = trim((string) ($d['cuenta'] ?? ''));
        $jug = null;
        if ($cuenta !== '') {
            $j = preg_match('/^\d{1,10}$/', $cuenta) ? Cuentas::porId((int) $cuenta) : Cuentas::porEmail($cuenta);
            Fallo::si(!$j || ($j['estado'] ?? 'activo') === 'borrado', 'No hay ninguna cuenta con ese número o correo.', 404, ['codigo' => 'jugador_no_existe']);
            $jug = (int) $j['id'];
        }
        $activo = !empty($d['activo']);
        $notas = Buzon::limpiarTexto((string) ($d['notas'] ?? ''), 1000);
        return Db::tx(function () use ($id, $ver, $cod, $nombre, $redes, $nivel, $pct, $cr, $jug, $activo, $notas, $quien): array {
            $t = self::ahora();
            $antes = $id !== null ? Db::fila('SELECT * FROM aliados WHERE id = ?', [$id]) : null;
            Fallo::si($id !== null && !$antes, 'Ese creador no existe.', 404, ['codigo' => 'aliado_no_existe']);
            Fallo::si((bool) Db::valor('SELECT 1 FROM aliados WHERE codigo = ? AND id <> ?', [$cod, $id ?? 0]), 'Ya hay otro creador con el código ' . $ver . '.', 409, ['codigo' => 'codigo_repetido']);
            Buzon::preparar();
            Fallo::si((bool) Db::valor('SELECT 1 FROM buzon_codigos WHERE codigo = ?', [$cod]), 'Ya existe un código de regalo ' . $cod . ' en el buzón: elige otro.', 409, ['codigo' => 'codigo_repetido']);
            Fallo::si(class_exists(BlackFriday::class) && BlackFriday::esCodigo($cod), 'Esa palabra es la de la promoción de Black Friday: elige otra.', 409, ['codigo' => 'codigo_repetido']);
            Fallo::si(Invitaciones::jugadorDeCodigo($cod) !== null, 'Ese código se confunde con el código de invitación de un jugador (P + hasta 6 letras o números): elige uno más largo.', 409, ['codigo' => 'codigo_formato']);
            if ($jug !== null) Fallo::si((bool) Db::valor('SELECT 1 FROM aliados WHERE jugador_id = ? AND id <> ?', [$jug, $id ?? 0]), 'Esa cuenta ya es de otro creador.', 409, ['codigo' => 'aliado_cuenta_usada']);
            $v = [$cod, $ver, $nombre, $redes, $nivel, $jug, $pct === '' ? null : round((float) $pct, 2), $cr === '' ? null : (int) $cr, $activo ? 1 : 0, $notas, $t];
            if ($antes) {
                Db::q('UPDATE aliados SET codigo = ?, codigo_ver = ?, nombre = ?, redes = ?, nivel = ?, jugador_id = ?, porcentaje = ?, creditos_mes = ?, activo = ?, notas = ?, actualizado = ? WHERE id = ?', array_merge($v, [$id]));
            } else {
                Db::q('INSERT INTO aliados (codigo, codigo_ver, nombre, redes, nivel, jugador_id, porcentaje, creditos_mes, activo, notas, actualizado, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', array_merge($v, [$t]));
                $id = Db::ultimoId();
            }
            if ($jug !== null) { try { Visitas::alSubirPartida($jug); } catch (\Throwable) { /* la vitrina se arma otra vez sola */ } }
            Auditoria::anotar($quien, $antes ? 'aliado_cambiar' : 'aliado_crear', 'Productor Aliado ' . $ver . ' (' . $nombre . '), nivel ' . $nivel . ', ' . ($activo ? 'activo' : 'inactivo')
                . ', cuenta ' . ($jug !== null ? 'N° ' . $jug : '—') . ', ' . ($pct === '' ? 'porcentaje por defecto' : $pct . ' %') . ', ' . ($cr === '' ? 'créditos del nivel' : $cr . ' créditos/mes'), $jug);
            return Db::fila('SELECT * FROM aliados WHERE id = ?', [$id]);
        });
    }

    public static function guardarPctDefecto(string $v, string $quien): float
    {
        $v = trim(str_replace(',', '.', $v));
        Fallo::si(!is_numeric($v) || (float) $v < 0 || (float) $v > 50, 'El porcentaje va de 0 a 50.', 400, ['codigo' => 'aliado_porcentaje']);
        Ajustes::guardar(['aliados_pct' => (string) round((float) $v, 2)], $quien, 'aliados_ajuste');
        return self::pctDefecto();
    }

    public static function porId(int $id): ?array { self::preparar(); return Db::fila('SELECT * FROM aliados WHERE id = ?', [$id]); }

    /** Compras pagadas de los jugadores del creador después de usar su código: [{id, total, canal, t, jugador_id}]. */
    private static function compras(int $aliado): array
    {
        return Db::todas("SELECT k.id, k.total, k.canal, COALESCE(k.pagado_en, k.creado) AS t, k.jugador_id FROM compras k JOIN aliados_usos u ON u.jugador_id = k.jugador_id
                          WHERE u.aliado_id = ? AND k.estado = 'pagado' AND COALESCE(k.pagado_en, k.creado) >= u.creado ORDER BY t", [$aliado]);
    }

    public static function canal(string $c): string { return match ($c) { 'google_play' => 'google', 'web_paypal' => 'paypal', default => 'plux' }; }

    /**
     * Ventas por mes de un creador (lo más nuevo primero): [{mes, compras, compradores, ventas, plux, paypal, google, porcentaje,
     * monto, pagado: null | {pagado_en, pagado_por, monto_usd, nota}, cerrado}]. El mes en curso sale con cerrado = false.
     */
    public static function meses(int $aliado): array
    {
        self::preparar();
        $a = self::porId($aliado);
        if (!$a) return [];
        $pct = self::pctDe($a);
        $o = [];
        foreach (self::compras($aliado) as $c) {
            $m = date('Y-m', (int) $c['t']);
            $o[$m] ??= ['mes' => $m, 'compras' => 0, 'compradores' => [], 'ventas' => 0.0, 'plux' => 0.0, 'paypal' => 0.0, 'google' => 0.0];
            $o[$m]['compras']++;
            $o[$m]['compradores'][(int) $c['jugador_id']] = true;
            $o[$m]['ventas'] += (float) $c['total'];
            $o[$m][self::canal((string) $c['canal'])] += (float) $c['total'];
        }
        $pagos = [];
        foreach (Db::todas('SELECT * FROM aliados_pagos WHERE aliado_id = ?', [$aliado]) as $p) {
            $pagos[$p['mes']] = $p;
            $o[$p['mes']] ??= ['mes' => $p['mes'], 'compras' => 0, 'compradores' => [], 'ventas' => 0.0, 'plux' => 0.0, 'paypal' => 0.0, 'google' => 0.0];
        }
        $actual = date('Y-m', self::ahora());
        foreach ($o as $m => &$f) {
            $f['compradores'] = count($f['compradores']);
            foreach (['ventas', 'plux', 'paypal', 'google'] as $k) $f[$k] = round($f[$k], 2);
            $f['porcentaje'] = $pct;
            $f['monto'] = round($f['ventas'] * $pct / 100, 2);
            $f['cerrado'] = $m < $actual;
            $p = $pagos[$m] ?? null;
            $f['pagado'] = $p ? ['pagado_en' => (int) $p['pagado_en'], 'pagado_por' => (string) $p['pagado_por'], 'monto_usd' => (float) $p['monto_usd'], 'ventas_usd' => (float) $p['ventas_usd'],
                'porcentaje' => (float) $p['porcentaje'], 'nota' => (string) $p['nota']] : null;
        }
        unset($f);
        krsort($o);
        return array_values($o);
    }

    /** Lista del panel: cada creador con jugadores, compradores, ventas totales, a pagar (meses cerrados sin pagar) y ya pagado. */
    public static function lista(): array
    {
        self::preparar();
        $o = [];
        foreach (Db::todas('SELECT a.*, j.nombre AS cuenta_nombre, j.email AS cuenta_email FROM aliados a LEFT JOIN jugadores j ON j.id = a.jugador_id ORDER BY a.activo DESC, a.nombre COLLATE NOCASE') as $a) {
            $id = (int) $a['id'];
            $meses = self::meses($id);
            $ventas = 0.0; $pendiente = 0.0; $pagado = 0.0; $porCanal = ['plux' => 0.0, 'paypal' => 0.0, 'google' => 0.0]; $comp = 0;
            foreach ($meses as $m) {
                $ventas += $m['ventas']; $comp += $m['compras'];
                foreach ($porCanal as $k => $_) $porCanal[$k] += $m[$k];
                if ($m['pagado']) $pagado += $m['pagado']['monto_usd'];
                elseif ($m['cerrado']) $pendiente += $m['monto'];
            }
            $a['jugadores'] = (int) Db::valor('SELECT COUNT(*) FROM aliados_usos WHERE aliado_id = ?', [$id]);
            $a['compradores'] = (int) Db::valor("SELECT COUNT(DISTINCT k.jugador_id) FROM compras k JOIN aliados_usos u ON u.jugador_id = k.jugador_id
                                                WHERE u.aliado_id = ? AND k.estado = 'pagado' AND COALESCE(k.pagado_en, k.creado) >= u.creado", [$id]);
            $a['compras'] = $comp;
            $a['ventas'] = round($ventas, 2);
            $a['por_canal'] = array_map(fn($v) => round($v, 2), $porCanal);
            $a['pct'] = self::pctDe($a);
            $a['pendiente'] = round($pendiente, 2);
            $a['pagado'] = round($pagado, 2);
            $mesAct = $meses && $meses[0]['mes'] === date('Y-m', self::ahora()) ? $meses[0] : null;
            $a['mes_actual'] = $mesAct ? $mesAct['monto'] : 0.0;
            $a['creditos'] = min(self::MAX_CREDITOS_MES, self::creditosDe($a));
            $a['creditos_mes_entregado'] = (bool) Db::valor('SELECT 1 FROM aliados_creditos WHERE aliado_id = ? AND mes = ?', [$id, date('Y-m', self::ahora())]);
            $o[] = $a;
        }
        return $o;
    }

    /**
     * Anota que el mes $mes ya se le pagó al creador (en dinero, fuera del juego). Guarda lo calculado en ese momento.
     * Solo meses cerrados y una vez. No toca créditos ni nada del juego.
     */
    public static function marcarPagado(int $aliado, string $mes, string $nota, string $quien): array
    {
        self::preparar();
        $a = self::porId($aliado);
        Fallo::si(!$a, 'Ese creador no existe.', 404, ['codigo' => 'aliado_no_existe']);
        Fallo::si(!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $mes), 'Mes no válido (AAAA-MM).', 400, ['codigo' => 'fecha_invalida']);
        Fallo::si($mes >= date('Y-m', self::ahora()), 'Solo se marcan como pagados los meses que ya terminaron.', 409, ['codigo' => 'aliado_mes_abierto']);
        $f = null;
        foreach (self::meses($aliado) as $m) if ($m['mes'] === $mes) $f = $m;
        $f ??= ['compras' => 0, 'ventas' => 0.0, 'porcentaje' => self::pctDe($a), 'monto' => 0.0];
        $nota = Buzon::limpiarLinea($nota, 200);
        return Db::tx(function () use ($aliado, $mes, $f, $nota, $quien, $a): array {
            Fallo::si((bool) Db::valor('SELECT 1 FROM aliados_pagos WHERE aliado_id = ? AND mes = ?', [$aliado, $mes]), 'Ese mes ya está marcado como pagado.', 409, ['codigo' => 'aliado_ya_pagado']);
            Db::q('INSERT INTO aliados_pagos (aliado_id, mes, compras, ventas_usd, porcentaje, monto_usd, nota, pagado_en, pagado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$aliado, $mes, (int) $f['compras'], (float) $f['ventas'], (float) $f['porcentaje'], (float) $f['monto'], $nota, self::ahora(), mb_substr($quien, 0, 80)]);
            Auditoria::anotar($quien, 'aliado_pagado', 'Productor Aliado ' . $a['codigo_ver'] . ', ' . $mes . ': pagado ' . Http::dinero((float) $f['monto']) . ' (' . $f['porcentaje'] . ' % de ' . Http::dinero((float) $f['ventas'])
                . ', publicidad aparte del juego)' . ($nota !== '' ? ' · ' . $nota : ''));
            return Db::fila('SELECT * FROM aliados_pagos WHERE aliado_id = ? AND mes = ?', [$aliado, $mes]);
        });
    }

    /** Quita la marca de pagado (si se anotó por error). Audita. */
    public static function anularPago(int $aliado, string $mes, string $quien): void
    {
        self::preparar();
        $a = self::porId($aliado);
        Fallo::si(!$a, 'Ese creador no existe.', 404, ['codigo' => 'aliado_no_existe']);
        $n = Db::q('DELETE FROM aliados_pagos WHERE aliado_id = ? AND mes = ?', [$aliado, $mes])->rowCount();
        Fallo::si($n !== 1, 'Ese mes no estaba marcado como pagado.', 404, ['codigo' => 'aliado_sin_pago']);
        Auditoria::anotar($quien, 'aliado_pago_anulado', 'Productor Aliado ' . $a['codigo_ver'] . ', ' . $mes . ': se quitó la marca de pagado');
    }

    /** Jugadores que usaron el código (para el detalle del panel). */
    public static function usos(int $aliado, int $max = 200): array
    {
        self::preparar();
        return Db::todas('SELECT u.*, j.nombre, j.email FROM aliados_usos u LEFT JOIN jugadores j ON j.id = u.jugador_id WHERE u.aliado_id = ? ORDER BY u.creado DESC LIMIT ' . max(1, min($max, 5000)), [$aliado]);
    }

    // ------------------------------------------------------------------------------------------ postulaciones (/aliados.html)
    /** POST /api/aliados/postular {nombre, correo, redes, pais?, mensaje?, sitio (trampa: debe ir vacío)}. Sin cuenta. */
    public static function postular(array $in, ?int $jugador = null): array
    {
        self::preparar();
        if (Limite::contar('aliados:postular:' . Http::ip(), self::POSTULAR_IP)) throw new Fallo('Ya enviaste tu postulación. Espera unos minutos si quieres enviar otra.', 429, ['codigo' => 'limite_intentos']);
        // Trampa para robots: un campo escondido que una persona nunca llena. Se responde "ok" sin guardar nada.
        if (is_string($in['sitio'] ?? null) && trim($in['sitio']) !== '') return ['ok' => true];
        $nombre = Buzon::limpiarLinea((string) ($in['nombre'] ?? ''), 60);
        Fallo::si(mb_strlen($nombre) < 2, 'Escribe tu nombre o el de tu canal.', 400, ['codigo' => 'aliado_nombre']);
        $correo = Cuentas::normalizarEmail((string) ($in['correo'] ?? ''));
        Fallo::si(strlen($correo) > 120 || !filter_var($correo, FILTER_VALIDATE_EMAIL), 'Escribe un correo válido para responderte.', 400, ['codigo' => 'email_invalido']);
        $redes = Buzon::limpiarTexto((string) ($in['redes'] ?? ''), 500);
        Fallo::si(mb_strlen($redes) < 4, 'Escribe el enlace o el usuario de tus redes.', 400, ['codigo' => 'aliado_redes']);
        $pais = Buzon::limpiarLinea((string) ($in['pais'] ?? ''), 40);
        $msg = Buzon::limpiarTexto((string) ($in['mensaje'] ?? ''), 1000);
        $ip = Http::ip();
        Db::q('INSERT INTO aliados_postulaciones (nombre, correo, redes, pais, mensaje, jugador_id, ip, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$nombre, $correo, $redes, $pais, $msg, $jugador, $ip !== '' ? $ip : null, self::ahora()]);
        $id = Db::ultimoId();
        $para = Config::get('SOPORTE_CORREO');
        if ($para !== '') {
            $texto = "Nueva postulación a Productores Aliados (N° $id)\n\nNombre: $nombre\nCorreo: $correo\nRedes: $redes\nPaís: $pais\n" . ($jugador ? "Cuenta del juego: N° $jugador\n" : '') . "\n$msg\n\nRevísala en el Centro de Control → Invitar y aliados.";
            $html = '<p>' . nl2br(Http::e($texto)) . '</p>';
            try { Correo::despues(fn() => Correo::enviar($para, 'Postulación Productor Aliado: ' . $nombre, $html, $texto)); } catch (\Throwable $e) { error_log('EN VIVO aliados: correo ' . mb_substr($e->getMessage(), 0, 200)); }
        }
        return ['ok' => true, 'id' => $id];
    }

    public static function postulaciones(int $max = 100): array
    {
        self::preparar();
        return Db::todas("SELECT * FROM aliados_postulaciones ORDER BY estado = 'revisada', creado DESC LIMIT " . max(1, min($max, 1000)));
    }

    public static function revisarPostulacion(int $id, string $quien): void
    {
        self::preparar();
        $n = Db::q("UPDATE aliados_postulaciones SET estado = 'revisada' WHERE id = ? AND estado = 'nueva'", [$id])->rowCount();
        Fallo::si($n !== 1, 'Esa postulación no existe o ya estaba revisada.', 404, ['codigo' => 'postulacion_no_existe']);
        Auditoria::anotar($quien, 'aliado_postulacion_revisada', 'Postulación N° ' . $id . ' revisada');
    }
}
