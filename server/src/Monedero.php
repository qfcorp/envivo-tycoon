<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Monedero de créditos, entregas y VIP.
 * - El saldo vive en jugadores.creditos y CADA cambio queda anotado en movimientos_creditos (cambio, saldo después,
 *   motivo y referencia). La suma de los movimientos de un jugador siempre es igual a su saldo.
 * - Una "entrega" es algo que el juego debe aplicar UNA vez (equipo, repuestos, personal, dinero del juego, reparar).
 *   El juego guarda los ids que ya aplicó.
 * Todo lo que cambia saldo o crea entregas corre dentro de Db::tx() (todo o nada).
 */
final class Monedero
{
    /**
     * Suma (o resta, con número negativo) créditos y lo anota. Lanza \RuntimeException si el saldo quedaría negativo,
     * salvo con $permitirNegativo (solo al revertir una compra reembolsada o con contracargo): entonces lo que falta
     * queda como deuda (jugadores.deuda) y se descuenta de los próximos créditos que reciba.
     * El saldo "de verdad" es creditos - deuda (puede ser negativo); es lo que se anota en el libro.
     */
    public static function mover(int $jugador, int $cambio, string $motivo, ?string $ref = null, bool $permitirNegativo = false): int
    {
        return Db::tx(function () use ($jugador, $cambio, $motivo, $ref, $permitirNegativo): int {
            $f = Db::fila('SELECT creditos, deuda FROM jugadores WHERE id = ?', [$jugador]);
            if ($f === null) throw new \RuntimeException('Jugador no encontrado.');
            $nuevo = (int) $f['creditos'] - (int) $f['deuda'] + $cambio;
            if ($nuevo < 0 && $cambio < 0 && !$permitirNegativo) throw new \RuntimeException('No tienes créditos suficientes.');
            Db::q('UPDATE jugadores SET creditos = ?, deuda = ? WHERE id = ?', [max(0, $nuevo), max(0, -$nuevo), $jugador]);
            Db::q('INSERT INTO movimientos_creditos (jugador_id, cambio, saldo, motivo, ref, creado) VALUES (?, ?, ?, ?, ?, ?)',
                [$jugador, $cambio, $nuevo, $motivo, $ref === null ? null : mb_substr($ref, 0, 200), time()]);
            if ($cambio < 0 && !$permitirNegativo && !in_array($motivo, self::NO_ES_GASTO, true)) self::avisarGasto($jugador, -$cambio, $motivo, $ref);
            return $nuevo;
        });
    }

    /** Débitos que NO son un gasto del jugador (reversiones, ajustes del Centro de Control, cuenta borrada): no avisan a los módulos. */
    public const NO_ES_GASTO = ['reversion', 'pase_reversion', 'manual', 'cuenta_borrada'];

    /**
     * Gancho creditos_gastados {jugador_id, cantidad, motivo, ref} (server/MONETIZACION.md §2). Corre dentro de la misma
     * transacción del gasto (cada oyente en su SAVEPOINT): un oyente que falla nunca deshace el gasto. Sin Ganchos no hace nada.
     */
    private static function avisarGasto(int $jugador, int $cantidad, string $motivo, ?string $ref): void
    {
        try {
            if (class_exists(Ganchos::class) && method_exists(Ganchos::class, 'emitir'))
                Ganchos::emitir('creditos_gastados', ['jugador_id' => $jugador, 'cantidad' => $cantidad, 'motivo' => $motivo, 'ref' => $ref]);
        } catch (\Throwable $e) {
            error_log('EN VIVO monedero: gancho creditos_gastados ' . mb_substr($e->getMessage(), 0, 200));
        }
    }

    /** Saldo de verdad (créditos menos deuda; negativo si se revirtió una compra ya gastada). */
    public static function saldo(int $jugador): int { return (int) Db::valor('SELECT creditos - deuda FROM jugadores WHERE id = ?', [$jugador]); }

    /** Créditos a mano: máximo por operación y tope diario por defecto (ENVIVO_CONTROL_TOPE_CREDITOS; 0 = sin tope). */
    public const MANUAL_MAX = 100000;
    public const MANUAL_TOPE_DIA = 20000;

    public static function topeManualDia(): int
    {
        $v = trim(Config::get('ENVIVO_CONTROL_TOPE_CREDITOS'));
        return $v !== '' && ctype_digit($v) ? (int) $v : self::MANUAL_TOPE_DIA;
    }

    /** Suma de |créditos a mano| movidos hoy (día local). */
    public static function manualesHoy(): int
    {
        return (int) Db::valor("SELECT COALESCE(SUM(ABS(cambio)), 0) FROM movimientos_creditos WHERE motivo = 'manual' AND creado >= ?", [strtotime('today')]);
    }

    /**
     * Da (cambio > 0) o quita créditos a mano desde el Centro de Control: libro con motivo 'manual', tope diario,
     * auditoría. No deja el saldo en negativo. Devuelve el saldo nuevo.
     */
    public static function ajusteManual(int $jugador, int $cambio, string $motivo, string $quien): int
    {
        $motivo = trim(preg_replace('/\s+/u', ' ', $motivo) ?? '');
        Fallo::si($motivo === '' || mb_strlen($motivo) > 300, 'Escribe el motivo (máximo 300 caracteres).', 400, ['codigo' => 'motivo_invalido']);
        Fallo::si($cambio === 0 || abs($cambio) > self::MANUAL_MAX, 'La cantidad debe ser distinta de 0 y como máximo ' . number_format(self::MANUAL_MAX, 0, ',', '.') . '.', 400, ['codigo' => 'cantidad_invalida']);
        return Db::tx(function () use ($jugador, $cambio, $motivo, $quien): int {
            Fallo::si(!Cuentas::porId($jugador), 'Ese jugador no existe.', 404, ['codigo' => 'jugador_no_existe']);
            $tope = self::topeManualDia();
            $hoy = self::manualesHoy();
            Fallo::si($tope > 0 && $hoy + abs($cambio) > $tope, 'Tope diario de créditos a mano: ya se movieron ' . number_format($hoy, 0, ',', '.') . ' de ' . number_format($tope, 0, ',', '.') . ' hoy.', 409, ['codigo' => 'tope_dia']);
            $antes = self::saldo($jugador);
            Fallo::si($antes + $cambio < 0, 'No se pueden quitar ' . abs($cambio) . ' créditos: tiene ' . $antes . '.', 409, ['codigo' => 'sin_creditos']);
            $saldo = self::mover($jugador, $cambio, 'manual', 'control:' . mb_substr($motivo, 0, 200));
            Auditoria::anotar($quien, $cambio > 0 ? 'creditos_dar' : 'creditos_quitar', abs($cambio) . ' créditos: ' . $motivo . ' (saldo ' . $antes . ' -> ' . $saldo . ')', $jugador);
            return $saldo;
        });
    }

    /** Crea una entrega y la devuelve como la ve el juego. */
    public static function entregar(int $jugador, string $tipo, string $item, int $cantidad, string $origen, ?string $nivel = null, ?int $eventos = null): array
    {
        $t = time();
        Db::q('INSERT INTO entregas (jugador_id, tipo, item, cantidad, origen, creado, nivel, eventos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [$jugador, $tipo, $item, $cantidad, $origen, $t, $nivel, $eventos]);
        return self::entregaJson(Db::fila('SELECT * FROM entregas WHERE id = ?', [Db::ultimoId()]));
    }

    /** Una entrega como la ve el juego. Los refuerzos traen además "nivel" y "eventos". */
    public static function entregaJson(array $e): array
    {
        $o = ['id' => (int) $e['id'], 'tipo' => $e['tipo'], 'item' => $e['item'], 'cantidad' => (int) $e['cantidad'], 'origen' => $e['origen'], 'creado' => Db::iso((int) $e['creado'])];
        if ($e['tipo'] === 'refuerzo') $o += ['nivel' => $e['nivel'], 'eventos' => $e['eventos'] === null ? null : (int) $e['eventos']];
        return $o;
    }

    /** Crea la entrega de un elemento del catálogo (['tipo','item','cantidad','nivel'?,'eventos'?]). */
    public static function entregarDef(int $jugador, array $d, string $origen): array
    {
        return self::entregar($jugador, $d['tipo'], $d['item'], (int) $d['cantidad'], $origen, $d['nivel'] ?? null, isset($d['eventos']) ? (int) $d['eventos'] : null);
    }

    /**
     * TODAS las entregas del jugador (historial), de la más vieja a la más nueva. Las de tipo "item" ya no salen
     * aquí: esos equipos están en el inventario del servidor (con entrega_id para enlazar los que el juego ya aplicó).
     */
    public static function entregas(int $jugador): array
    {
        return array_map([self::class, 'entregaJson'],
            Db::todas("SELECT * FROM entregas WHERE jugador_id = ? AND tipo <> 'item' ORDER BY id", [$jugador]));
    }

    /**
     * Gasta créditos en un exclusivo. Devuelve [saldo, entrega|null, equipo del inventario|null].
     * Los equipos (entrega tipo "item") se crean en el inventario del servidor; lo demás sigue siendo una entrega.
     * Lanza \RuntimeException('...', 402) si no alcanza y ('...', 403) si es VIP y no hay VIP activo (solo para canjearlo: después funciona siempre).
     */
    public static function gastar(int $jugador, string $item): array
    {
        if (str_starts_with($item, 'juego:') || str_starts_with($item, 'personal:')) return self::gastarCombo($jugador, $item);
        $p = Catalogo::premium($item);
        if (!$p) throw new \InvalidArgumentException('Ese artículo no existe en la tienda.', 404);
        if (!$p['activo']) throw new \InvalidArgumentException('Ese artículo no está a la venta por ahora.', 404);
        return Db::tx(function () use ($jugador, $item, $p): array {
            // Los equipos VIP se CANJEAN con el Pase VIP activo; después son tuyos y funcionan siempre (también sin el Pase).
            if (!empty($p['vip']) && !self::vipActivo($jugador)) throw new \RuntimeException('Los equipos VIP se canjean solo con el Pase VIP activo (después son tuyos para siempre).', 403);
            if (self::saldo($jugador) < $p['creditos']) throw new \RuntimeException('No tienes créditos suficientes. Necesitas ' . $p['creditos'] . ' créditos.', 402);
            $saldo = self::mover($jugador, -$p['creditos'], 'gasto', 'premium:' . $item);
            $e = $p['entrega'];
            if ($e['tipo'] === 'item') return [$saldo, null, Inventario::crear($jugador, $e['item'], 'canje', 'creditos:' . $item)];
            $entrega = self::entregarDef($jugador, $e, 'creditos:' . $item);
            return [$saldo, $entrega, null];
        });
    }

    /**
     * Combo con créditos (js/datos.js COMBO_CREDITOS; decisión de Dimitry, oct. 2026): completa un equipo canjeado con créditos.
     *   "juego:<clave>"  una pieza de la tienda del juego que ese equipo necesita (cámara de sistema, lente, fibra...), aunque
     *                    con dinero del juego todavía pida más fama. Precio: CatalogoJuego::EQUIPOS[clave]['creditos'].
     *                    Llega como entrega "equipo" (a la bodega de la partida; vuelve en una partida nueva). No se vende en
     *                    el mercado y en línea sigue la regla de fama de siempre (Festival/Copa revisan la fama pública).
     *   "personal:<rol>" una persona de habilidad COMBO['habilidad'] del rol que maneja ese equipo, solo si con tu fama ese
     *                    rol todavía no aparece entre los candidatos. Precio COMBO['personal'].
     * Solo piezas del combo de un equipo canjeado con créditos que TIENES en tu bodega del servidor (CatalogoJuego::COMBOS),
     * con tope por pieza (maxPorEquipo / maxPorRol). Devuelve [saldo, entrega, null].
     */
    public static function gastarCombo(int $jugador, string $item): array
    {
        [$tipo, $clave] = explode(':', $item, 2);
        $cfg = CatalogoJuego::COMBO;
        if ($tipo === 'juego') {
            $eq = CatalogoJuego::EQUIPOS[$clave] ?? null;
            if ($eq === null || (int) ($eq['creditos'] ?? 0) <= 0) throw new \InvalidArgumentException('Ese equipo no se puede canjear con créditos.', 404);
            $costo = (int) $eq['creditos'];
            $campo = 'equipos';
            $tope = (int) $cfg['maxPorEquipo'];
            $def = ['tipo' => 'equipo', 'item' => $clave, 'cantidad' => 1];
            $nombre = (string) $eq['nombre'];
        } else {
            $clave = CatalogoJuego::ROL_ALIAS[$clave] ?? $clave;
            if (!in_array($clave, CatalogoJuego::ROLES, true)) throw new \InvalidArgumentException('Ese rol no existe.', 404);
            $fama = (int) (Db::valor('SELECT fama_publica FROM jugadores WHERE id = ?', [$jugador]) ?? 0);
            if ($fama >= (int) (CatalogoJuego::ROLES_FAMA[$clave] ?? 0)) throw new \RuntimeException('Con tu fama ya puedes contratar ese rol en Personal (con dinero del juego).', 409);
            $costo = (int) $cfg['personal'];
            $campo = 'roles';
            $tope = (int) $cfg['maxPorRol'];
            // nivel junior: en Duelos el permiso queda como una persona normal (sin ventaja de nivel)
            $def = ['tipo' => 'personal', 'item' => $clave, 'cantidad' => (int) $cfg['habilidad'], 'nivel' => 'junior'];
            $nombre = $clave;
        }
        return Db::tx(function () use ($jugador, $item, $clave, $campo, $costo, $tope, $def, $nombre): array {
            $mios = array_column(Db::todas("SELECT DISTINCT item FROM inventario WHERE jugador_id = ? AND estado = 'bodega'", [$jugador]), 'item');
            $ok = false;
            foreach ($mios as $m) if (in_array($clave, CatalogoJuego::COMBOS[$m][$campo] ?? [], true)) { $ok = true; break; }
            if (!$ok) throw new \RuntimeException('Con créditos solo se completa el combo de un equipo que canjeaste con créditos y que está en tu bodega.', 403);
            $ya = (int) Db::valor('SELECT COUNT(*) FROM entregas WHERE jugador_id = ? AND origen = ?', [$jugador, 'combo:' . $item]);
            if ($ya >= $tope) throw new \RuntimeException('Ya canjeaste ' . $tope . ' de ' . $nombre . ' con créditos (es el tope del combo).', 409);
            if (self::saldo($jugador) < $costo) throw new \RuntimeException('No tienes créditos suficientes. Necesitas ' . $costo . ' créditos.', 402);
            $saldo = self::mover($jugador, -$costo, 'gasto', 'combo:' . $item);
            return [$saldo, self::entregarDef($jugador, $def, 'combo:' . $item), null];
        });
    }

    public static function diaLocal(?int $t = null): string { return date('Y-m-d', $t ?? time()); }

    public static function bonoReclamadoHoy(int $jugador): bool
    {
        return (bool) Db::valor('SELECT 1 FROM bonos_vip WHERE jugador_id = ? AND dia = ?', [$jugador, self::diaLocal()]);
    }

    public static function vipActivo(int $jugador): bool
    {
        $v = Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$jugador]);
        return $v !== null && (int) $v > time();
    }

    /**
     * Bono VIP diario: una vez por día local. Crece con el nivel VIP (Vip::PASE: dinero del juego, créditos, cables, baterías y
     * desde VIP 9 todo el equipo al 100 %). Sin el módulo VIP: $150 + 10 créditos. Devuelve [saldo, entrega del dinero, todas las entregas].
     */
    public static function bonoVip(int $jugador): array
    {
        Cuentas::exigirActiva($jugador);
        return Db::tx(function () use ($jugador): array {
            if (!self::vipActivo($jugador)) throw new \RuntimeException('Necesitas el Pase VIP activo para reclamar el bono diario.', 403);
            $dia = self::diaLocal();
            if (self::bonoReclamadoHoy($jugador)) throw new \RuntimeException('Ya reclamaste el bono VIP de hoy. Vuelve mañana.', 409);
            Db::q('INSERT INTO bonos_vip (jugador_id, dia, creado) VALUES (?, ?, ?)', [$jugador, $dia, time()]);
            $defs = [['tipo' => 'dinero', 'item' => '-', 'cantidad' => Catalogo::VIP_BONO_DINERO]];
            $creditos = Catalogo::VIP_BONO_CREDITOS;
            if (class_exists(Vip::class) && method_exists(Vip::class, 'entregasBono')) {
                $nivel = 0;
                try { $nivel = Vip::nivel($jugador); } catch (\Throwable) { $nivel = 0; }
                $defs = Vip::entregasBono($nivel);
                $creditos = Vip::pase($nivel)['bono']['creditos'];
            }
            $entregas = array_map(fn($e) => self::entregarDef($jugador, $e, 'vip_bono:' . $dia), $defs);
            $saldo = self::mover($jugador, $creditos, 'vip_bono', 'vip_bono:' . $dia);
            return [$saldo, $entregas[0], $entregas];
        });
    }

    /** ¿Tarjeta mensual activa? */
    public static function tarjetaActiva(int $jugador): bool
    {
        $v = Db::valor('SELECT tarjeta_hasta FROM jugadores WHERE id = ?', [$jugador]);
        return $v !== null && (int) $v > time();
    }

    public static function tarjetaReclamadaHoy(int $jugador): bool
    {
        return (bool) Db::valor('SELECT 1 FROM tarjeta_reclamos WHERE jugador_id = ? AND dia = ?', [$jugador, self::diaLocal()]);
    }

    /** Tarjeta mensual: 20 créditos una vez por día local mientras esté activa. Devuelve el saldo. */
    public static function reclamarTarjeta(int $jugador): int
    {
        Cuentas::exigirActiva($jugador);
        return Db::tx(function () use ($jugador): int {
            if (!self::tarjetaActiva($jugador)) throw new Fallo('No tienes la Tarjeta mensual activa.', 403, ['codigo' => 'tarjeta_requerida']);
            if (self::tarjetaReclamadaHoy($jugador)) throw new Fallo('Ya reclamaste los créditos de hoy. Vuelve mañana.', 409, ['codigo' => 'ya_reclamado']);
            $dia = self::diaLocal();
            Db::q('INSERT INTO tarjeta_reclamos (jugador_id, dia, creado) VALUES (?, ?, ?)', [$jugador, $dia, time()]);
            $n = (int) (Catalogo::PRODUCTOS['tarjeta_mensual']['creditos_dia'] ?? 20);
            return self::mover($jugador, $n, 'tarjeta_mensual', 'tarjeta:' . $dia);
        });
    }

    /** Suma días de tarjeta mensual desde lo que sea más tarde: ahora o el vencimiento actual (se acumulan como el VIP). */
    public static function sumarTarjeta(int $jugador, int $dias): int
    {
        return Db::tx(function () use ($jugador, $dias): int {
            $v = Db::valor('SELECT tarjeta_hasta FROM jugadores WHERE id = ?', [$jugador]);
            $nuevo = max(time(), (int) ($v ?? 0)) + $dias * 86400;
            Db::q('UPDATE jugadores SET tarjeta_hasta = ? WHERE id = ?', [$nuevo, $jugador]);
            return $nuevo;
        });
    }

    /** Suma días de VIP desde lo que sea más tarde: ahora o el vencimiento actual. Devuelve el nuevo vencimiento. */
    public static function sumarVip(int $jugador, int $dias): int
    {
        return Db::tx(function () use ($jugador, $dias): int {
            $v = Db::valor('SELECT vip_hasta FROM jugadores WHERE id = ?', [$jugador]);
            $nuevo = max(time(), (int) ($v ?? 0)) + $dias * 86400;
            Db::q('UPDATE jugadores SET vip_hasta = ? WHERE id = ?', [$nuevo, $jugador]);
            return $nuevo;
        });
    }
}
