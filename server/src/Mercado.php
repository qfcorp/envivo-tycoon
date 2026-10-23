<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Mercado entre jugadores (ver server/MERCADO.md).
 * - Acceso: solo quien tiene al menos una compra pagada con dinero real. Los demás lo ven en modo lectura.
 * - Precio entero de 10 a 100.000 créditos; máximo 10 publicaciones activas por jugador; vencen a los 7 días y el
 *   equipo vuelve solo al dueño (al leer el mercado o el estado, y con la tarea diaria bin/tareas.php).
 * - Comprar va en UNA transacción (BEGIN IMMEDIATE): si dos compran a la vez, solo uno gana.
 * - El vendedor recibe floor(precio * 0,95); la comisión desaparece (queda anotada en la publicación).
 */
final class Mercado
{
    public const PRECIO_MIN = 10;
    public const PRECIO_MAX = 100000;
    public const MAX_ACTIVAS = 10;
    public const DIAS = 7;
    public const POR_PAGINA = 100;

    /** [puede, motivo] */
    public static function acceso(?int $jugador): array
    {
        if ($jugador === null) return [false, 'Entra a tu cuenta para usar el mercado.'];
        $est = Cuentas::estadoCuenta($jugador);
        if ($est !== 'activo') return [false, 'Tu cuenta está ' . $est . ': no puedes comprar ni vender en el mercado.'];
        $pagada = Db::valor("SELECT 1 FROM compras WHERE jugador_id = ? AND estado = 'pagado' LIMIT 1", [$jugador]);
        if (!$pagada) return [false, 'El mercado se abre cuando haces tu primera compra en la tienda. Mientras tanto puedes mirar los precios.'];
        return [true, ''];
    }

    public static function resumen(?int $jugador): array
    {
        [$puede, $motivo] = self::acceso($jugador);
        $o = ['puede' => $puede, 'motivo' => $motivo, 'comision' => Catalogo::MERCADO_COMISION];
        $b = $jugador !== null ? self::bloqueoVenta($jugador) : null;
        if ($b !== null) $o['vender_desde'] = Db::iso($b);   // cuenta recién transferida: no puede vender hasta esa fecha
        return $o;
    }

    /** Fin del bloqueo de ventas (7 días después de una transferencia de cuenta), o null. */
    public static function bloqueoVenta(int $jugador): ?int
    {
        $b = Db::valor('SELECT bloqueo_hasta FROM jugadores WHERE id = ?', [$jugador]);
        return $b !== null && (int) $b > time() ? (int) $b : null;
    }

    /**
     * Saca del mercado todas las publicaciones activas de un jugador. $como:
     *  'retirada'  -> el equipo vuelve a su bodega (transferencia de cuenta);
     *  'congelada' -> nadie las puede comprar mientras la cuenta esté suspendida/baneada (el equipo sigue fuera de la bodega).
     */
    public static function retirarTodas(int $jugador, string $como): int
    {
        return Db::tx(function () use ($jugador, $como): int {
            $t = time();
            if ($como === 'retirada') {
                Db::q("UPDATE inventario SET estado = 'bodega', actualizado = ? WHERE id IN (SELECT inventario_id FROM mercado_publicaciones WHERE vendedor_id = ? AND estado IN ('activa', 'congelada'))", [$t, $jugador]);
                return Db::q("UPDATE mercado_publicaciones SET estado = 'retirada', cerrado = ? WHERE vendedor_id = ? AND estado IN ('activa', 'congelada')", [$t, $jugador])->rowCount();
            }
            return Db::q("UPDATE mercado_publicaciones SET estado = 'congelada' WHERE vendedor_id = ? AND estado = 'activa'", [$jugador])->rowCount();
        });
    }

    /** Al reactivar la cuenta, sus publicaciones congeladas vuelven al mercado (o vencen si ya pasó su fecha). */
    public static function descongelarDe(int $jugador): int
    {
        return Db::q("UPDATE mercado_publicaciones SET estado = 'activa' WHERE vendedor_id = ? AND estado = 'congelada' AND inventario_id IN (SELECT id FROM inventario WHERE estado = 'publicado')", [$jugador])->rowCount();
    }

    /** Centro de Control: congelar / descongelar / quitar (el equipo vuelve al vendedor) una publicación. */
    public static function moderar(int $pubId, string $accion, string $quien): string
    {
        return Db::tx(function () use ($pubId, $accion, $quien): string {
            $p = Db::fila('SELECT * FROM mercado_publicaciones WHERE id = ?', [$pubId]);
            if (!$p) throw new Fallo('Esa publicación no existe.', 404);
            $t = time();
            if ($accion === 'congelar' && $p['estado'] === 'activa') Db::q("UPDATE mercado_publicaciones SET estado = 'congelada' WHERE id = ?", [$pubId]);
            elseif ($accion === 'descongelar' && $p['estado'] === 'congelada') Db::q("UPDATE mercado_publicaciones SET estado = 'activa' WHERE id = ?", [$pubId]);
            elseif ($accion === 'quitar' && in_array($p['estado'], ['activa', 'congelada'], true)) {
                Db::q("UPDATE mercado_publicaciones SET estado = 'quitada', cerrado = ? WHERE id = ?", [$t, $pubId]);
                Db::q("UPDATE inventario SET estado = 'bodega', actualizado = ? WHERE id = ? AND estado = 'publicado'", [$t, $p['inventario_id']]);
            } else throw new Fallo('La publicación está "' . $p['estado'] . '": no se puede ' . $accion . '.', 409);
            Auditoria::anotar($quien, 'mercado_' . $accion, 'Publicación N° ' . $pubId . ' (' . $p['item'] . ' #' . $p['serie'] . ', ' . $p['precio'] . ' créditos)', $p['vendedor_id'] === null ? null : (int) $p['vendedor_id']);
            return (string) Db::valor('SELECT estado FROM mercado_publicaciones WHERE id = ?', [$pubId]);
        });
    }

    private static function exigirAcceso(int $jugador): void
    {
        [$puede, $motivo] = self::acceso($jugador);
        Fallo::si(!$puede, $motivo, 403, ['codigo' => 'sin_acceso']);
    }

    /** Las publicaciones vencidas vuelven a la bodega de su dueño. Devuelve cuántas vencieron. */
    public static function vencer(): int
    {
        $t = time();
        if (!Db::valor("SELECT 1 FROM mercado_publicaciones WHERE estado = 'activa' AND vence <= ? LIMIT 1", [$t])) return 0;
        return Db::tx(function () use ($t): int {
            Db::q("UPDATE inventario SET estado = 'bodega', actualizado = ? WHERE id IN
                     (SELECT inventario_id FROM mercado_publicaciones WHERE estado = 'activa' AND vence <= ?)", [$t, $t]);
            return Db::q("UPDATE mercado_publicaciones SET estado = 'vencida', cerrado = ? WHERE estado = 'activa' AND vence <= ?", [$t, $t])->rowCount();
        });
    }

    /** "Dimitry Fierro" -> "Dimitry F." (nunca el correo). */
    public static function nombreCorto(?string $nombre): string
    {
        $p = preg_split('/\s+/u', trim((string) $nombre)) ?: [];
        $p = array_values(array_filter($p, fn($x) => preg_match('/\p{L}/u', $x) === 1));   // sin números sueltos
        if (!$p) return 'Productora';
        $n = mb_substr($p[0], 0, 20);
        return count($p) > 1 ? $n . ' ' . mb_strtoupper(mb_substr(end($p), 0, 1)) . '.' : $n;
    }

    private static function pubJson(array $f, ?int $jugador): array
    {
        return ['id' => (int) $f['id'], 'item' => $f['item'], 'nombre' => Catalogo::nombreEquipo((string) $f['item']), 'serie' => (int) $f['serie'],
                'precio' => (int) $f['precio'], 'vendedor' => self::nombreCorto($f['vendedor_nombre'] ?? null), 'publicado' => Db::iso((int) $f['publicado']),
                'vence' => Db::iso((int) $f['vence']), 'mia' => $jugador !== null && (int) $f['vendedor_id'] === $jugador, 'inventario_id' => (int) $f['inventario_id'], 'estado' => $f['estado']];
    }

    private const SELECT = 'SELECT p.*, j.nombre AS vendedor_nombre FROM mercado_publicaciones p LEFT JOIN jugadores j ON j.id = p.vendedor_id';

    /** GET /api/mercado */
    public static function listar(int $jugador, string $item, string $orden, int $pagina): array
    {
        self::vencer();
        self::liberar($jugador);
        Fallo::si($item !== '' && !Catalogo::esEquipo($item), 'Ese equipo no existe.', 400);
        $orden = $orden === 'reciente' ? 'p.id DESC' : 'p.precio ASC, p.id ASC';
        $pagina = max(1, min($pagina, 1000));
        $donde = "p.estado = 'activa'" . ($item !== '' ? ' AND p.item = ?' : '');
        $par = $item !== '' ? [$item] : [];
        $filas = Db::todas(self::SELECT . " WHERE $donde ORDER BY $orden LIMIT " . (self::POR_PAGINA + 1) . ' OFFSET ' . (($pagina - 1) * self::POR_PAGINA), $par);
        $hayMas = count($filas) > self::POR_PAGINA;
        $filas = array_slice($filas, 0, self::POR_PAGINA);
        $mias = Db::todas(self::SELECT . " WHERE p.estado IN ('activa', 'congelada') AND p.vendedor_id = ? ORDER BY p.id DESC", [$jugador]);
        $ventas = Db::todas("SELECT p.*, r.estado AS ret_estado, r.libera FROM mercado_publicaciones p LEFT JOIN mercado_retenciones r ON r.publicacion_id = p.id WHERE p.estado = 'vendida' AND p.vendedor_id = ? ORDER BY p.cerrado DESC LIMIT 10", [$jugador]);
        [$ret, $prox] = self::retenido($jugador);
        return self::resumen($jugador) + [
            'ok' => true,
            'publicaciones' => array_map(fn($f) => self::pubJson($f, $jugador), $filas),
            'mis_publicaciones' => array_map(fn($f) => self::pubJson($f, $jugador), $mias),
            'mis_ventas' => array_map(fn($f) => ['id' => (int) $f['id'], 'item' => $f['item'], 'serie' => (int) $f['serie'], 'precio' => (int) $f['precio'],
                'recibido' => (int) $f['pago_vendedor'], 'comision' => (int) $f['comision'], 'vendido' => Db::iso((int) $f['cerrado']),
                'retencion' => $f['ret_estado'] ?? 'liberado', 'disponible' => $f['libera'] !== null ? Db::iso((int) $f['libera']) : null], $ventas),
            'creditos_retenidos' => $ret,
            'retenidos_liberan' => $prox === null ? null : Db::iso($prox),
            'precios' => self::precios(),
            'pagina' => $pagina,
            'hay_mas' => $hayMas,
            'limites' => ['precio_min' => self::PRECIO_MIN, 'precio_max' => self::PRECIO_MAX, 'precio_max_item' => array_map(fn($i) => self::precioMax($i), array_combine(array_keys(Catalogo::EQUIPOS), array_keys(Catalogo::EQUIPOS))),
                          'max_activas' => self::MAX_ACTIVAS, 'dias' => self::DIAS, 'dias_retencion' => Catalogo::MERCADO_DIAS_RETENCION],
        ];
    }

    /** Por tipo de equipo: último precio vendido, el más barato publicado ahora y cuántos se vendieron en 7 días. */
    public static function precios(): array
    {
        $o = [];
        foreach (array_keys(Catalogo::EQUIPOS) as $it) $o[$it] = ['ultimo' => null, 'minimo_publicado' => null, 'vendidos_7d' => 0];
        foreach (Db::todas("SELECT item, MIN(precio) AS m FROM mercado_publicaciones WHERE estado = 'activa' GROUP BY item") as $f) if (isset($o[$f['item']])) $o[$f['item']]['minimo_publicado'] = (int) $f['m'];
        foreach (Db::todas("SELECT item, COUNT(*) AS n FROM mercado_publicaciones WHERE estado = 'vendida' AND cerrado >= ? GROUP BY item", [time() - 7 * 86400]) as $f) if (isset($o[$f['item']])) $o[$f['item']]['vendidos_7d'] = (int) $f['n'];
        foreach (Db::todas("SELECT p.item, p.precio FROM mercado_publicaciones p WHERE p.estado = 'vendida' AND p.id = (SELECT x.id FROM mercado_publicaciones x WHERE x.item = p.item AND x.estado = 'vendida' ORDER BY x.cerrado DESC, x.id DESC LIMIT 1)") as $f) if (isset($o[$f['item']])) $o[$f['item']]['ultimo'] = (int) $f['precio'];
        return $o;
    }

    /** Precio máximo para ese tipo de equipo (nunca más de PRECIO_MAX). */
    public static function precioMax(string $item): int { return min(self::PRECIO_MAX, Catalogo::MERCADO_PRECIO_MAX[$item] ?? self::PRECIO_MAX); }

    /** Valida el precio: entero (o texto de solo dígitos) entre 10 y el máximo de ese equipo (y nunca más de 100.000). */
    public static function precio(mixed $p, string $item = ''): int
    {
        $ok = is_int($p) || (is_string($p) && preg_match('/^\d{1,7}$/', $p)) || (is_float($p) && floor($p) === $p);
        $n = $ok ? (int) $p : 0;
        $max = $item !== '' ? self::precioMax($item) : self::PRECIO_MAX;
        Fallo::si(!$ok || $n < self::PRECIO_MIN || $n > $max, 'El precio debe ser un número entero de ' . self::PRECIO_MIN . ' a ' . number_format($max, 0, ',', '.') . ' créditos' . ($item !== '' && $max < self::PRECIO_MAX ? ' para este equipo' : '') . '.', 400, ['codigo' => 'precio', 'precio_max' => $max]);
        return $n;
    }

    /** Créditos de ventas que todavía están retenidos (no se pueden gastar): [total, próxima fecha en que se liberan]. */
    public static function retenido(int $jugador): array
    {
        $f = Db::fila("SELECT COALESCE(SUM(creditos), 0) AS n, MIN(libera) AS l FROM mercado_retenciones WHERE jugador_id = ? AND estado = 'retenido'", [$jugador]);
        return [(int) $f['n'], $f['l'] === null ? null : (int) $f['l']];
    }

    /** Pasa al saldo los créditos de ventas que ya cumplieron los días de retención (de un jugador o de todos). */
    public static function liberar(?int $jugador = null): int
    {
        $t = time();
        $sql = "SELECT * FROM mercado_retenciones WHERE estado = 'retenido' AND libera <= ?" . ($jugador !== null ? ' AND jugador_id = ?' : '');
        $par = $jugador !== null ? [$t, $jugador] : [$t];
        if (!Db::valor(str_replace('SELECT *', 'SELECT 1', $sql) . ' LIMIT 1', $par)) return 0;
        return Db::tx(function () use ($sql, $par, $t): int {
            $n = 0;
            foreach (Db::todas($sql, $par) as $r) {
                if (Db::q("UPDATE mercado_retenciones SET estado = 'liberado', cerrado = ? WHERE id = ? AND estado = 'retenido'", [$t, $r['id']])->rowCount() !== 1) continue;
                $p = Db::fila('SELECT item, serie, comision FROM mercado_publicaciones WHERE id = ?', [$r['publicacion_id']]);
                Monedero::mover((int) $r['jugador_id'], (int) $r['creditos'], 'mercado_venta', 'mercado:' . $r['publicacion_id'] . ':' . ($p['item'] ?? '') . '#' . ($p['serie'] ?? '') . ':comision=' . ($p['comision'] ?? ''));
                $n++;
            }
            return $n;
        });
    }

    /** POST /api/mercado/publicar */
    public static function publicar(int $jugador, int $inventarioId, mixed $precio): array
    {
        self::exigirAcceso($jugador);
        $b = self::bloqueoVenta($jugador);
        Fallo::si($b !== null, 'Esta cuenta se transfirió hace poco: podrás vender en el mercado desde el ' . date('d/m/Y H:i', (int) $b) . '.', 403, ['codigo' => 'bloqueo_transferencia', 'vender_desde' => Db::iso($b)]);
        $itemPub = (string) (Db::valor('SELECT item FROM inventario WHERE id = ? AND jugador_id = ?', [$inventarioId, $jugador]) ?? '');
        $precio = self::precio($precio, $itemPub);
        self::vencer();
        return Db::tx(function () use ($jugador, $inventarioId, $precio): array {
            $inv = Db::fila('SELECT * FROM inventario WHERE id = ?', [$inventarioId]);
            Fallo::si(!$inv || (int) $inv['jugador_id'] !== $jugador, 'Ese equipo no está en tu bodega.', 404);
            Fallo::si($inv['estado'] !== 'bodega', 'Ese equipo ya está publicado en el mercado.', 409, ['codigo' => 'ya_publicado']);
            $activas = (int) Db::valor("SELECT COUNT(*) FROM mercado_publicaciones WHERE vendedor_id = ? AND estado IN ('activa', 'congelada')", [$jugador]);
            Fallo::si($activas >= self::MAX_ACTIVAS, 'Ya tienes ' . self::MAX_ACTIVAS . ' equipos publicados. Retira uno o espera a que se venda.', 409, ['codigo' => 'maximo']);
            $t = time();
            Db::q("UPDATE inventario SET estado = 'publicado', actualizado = ? WHERE id = ?", [$t, $inventarioId]);
            Db::q("INSERT INTO mercado_publicaciones (inventario_id, vendedor_id, item, serie, precio, estado, publicado, vence) VALUES (?, ?, ?, ?, ?, 'activa', ?, ?)",
                [$inventarioId, $jugador, $inv['item'], $inv['serie'], $precio, $t, $t + self::DIAS * 86400]);
            return self::pubJson(Db::fila(self::SELECT . ' WHERE p.id = ?', [Db::ultimoId()]), $jugador);
        });
    }

    /** Comprador y vendedor desde la misma conexión (IP) -> aviso para el administrador y marca de riesgo en las dos cuentas. */
    private static function revisarMismaIp(int $comprador, int $vendedor, int $pubId): void
    {
        $ip = Http::ip();
        if ($ip === '') return;
        if (!Db::valor('SELECT 1 FROM sesiones WHERE jugador_id = ? AND ip = ? LIMIT 1', [$vendedor, $ip])) return;
        $motivo = 'Mercado: comprador y vendedor desde la misma IP (' . $ip . '), publicación N° ' . $pubId;
        Db::aviso('mercado_misma_ip', $motivo . ' (jugadores ' . $comprador . ' y ' . $vendedor . ')');
        Cuentas::marcarRiesgo($comprador, $motivo);
        Cuentas::marcarRiesgo($vendedor, $motivo);
    }

    /**
     * Al revertir una compra con dinero (reembolso o contracargo): sigue el rastro de los créditos de esa compra que el
     * jugador gastó en el mercado (sus compras en el mercado desde que pagó, de la más vieja a la más nueva, hasta
     * $creditos). Si al vendedor todavía no se le liberó el pago, se recupera (no lo recibe) y el equipo vuelve al vendedor.
     * Si ya se le liberó, queda aviso. En los dos casos se marcan ambas cuentas. Devuelve [recuperados, ya_liberados].
     */
    public static function seguirRastro(int $jugador, int $desde, int $creditos, string $origen): array
    {
        $rec = 0; $lib = 0; $falta = $creditos;
        foreach (Db::todas("SELECT * FROM mercado_publicaciones WHERE comprador_id = ? AND estado = 'vendida' AND cerrado >= ? ORDER BY cerrado, id", [$jugador, $desde]) as $p) {
            if ($falta <= 0) break;
            $falta -= (int) $p['precio'];
            $r = Db::fila('SELECT * FROM mercado_retenciones WHERE publicacion_id = ?', [$p['id']]);
            $vend = $p['vendedor_id'] === null ? null : (int) $p['vendedor_id'];
            $motivo = 'Recibió créditos del mercado pagados con una compra revertida (' . $origen . ', publicación N° ' . $p['id'] . ')';
            if ($r && $r['estado'] === 'retenido') {
                Db::q("UPDATE mercado_retenciones SET estado = 'recuperado', cerrado = ? WHERE id = ?", [time(), $r['id']]);
                $rec += (int) $r['creditos'];
                // El equipo vuelve al vendedor (no cobró) si el comprador todavía lo tiene
                $inv = Db::fila('SELECT * FROM inventario WHERE id = ?', [$p['inventario_id']]);
                if ($inv && (int) $inv['jugador_id'] === $jugador && $vend !== null) {
                    Db::q("UPDATE mercado_publicaciones SET estado = 'quitada', cerrado = ? WHERE inventario_id = ? AND estado IN ('activa', 'congelada')", [time(), $inv['id']]);
                    Db::q("UPDATE inventario SET jugador_id = ?, estado = 'bodega', actualizado = ? WHERE id = ?", [$vend, time(), $inv['id']]);
                }
                Db::aviso('mercado_recuperado', $motivo . ': ' . $r['creditos'] . ' créditos retenidos recuperados al vendedor ' . $vend . '.');
            } else {
                $lib += (int) floor((int) $p['precio'] * (1 - Catalogo::MERCADO_COMISION));
                Db::aviso('mercado_posible_lavado', $motivo . ': el vendedor ' . $vend . ' YA recibió los créditos. Revisar las dos cuentas.');
            }
            if ($vend !== null) Cuentas::marcarRiesgo($vend, $motivo);
            Cuentas::marcarRiesgo($jugador, 'Su compra revertida pagó compras en el mercado (' . $origen . ')');
        }
        return [$rec, $lib];
    }

    /** POST /api/mercado/retirar: el equipo vuelve a la bodega. */
    public static function retirar(int $jugador, int $pubId): array
    {
        self::vencer();
        return Db::tx(function () use ($jugador, $pubId): array {
            $p = Db::fila('SELECT * FROM mercado_publicaciones WHERE id = ?', [$pubId]);
            Fallo::si(!$p || (int) $p['vendedor_id'] !== $jugador, 'Esa publicación no es tuya.', 404);
            Fallo::si($p['estado'] === 'vendida', 'Ese equipo ya se vendió.', 409, ['codigo' => 'vendida']);
            Fallo::si($p['estado'] === 'congelada', 'Esa publicación está en revisión.', 409, ['codigo' => 'congelada']);
            Fallo::si($p['estado'] !== 'activa', 'Esa publicación ya no está activa (el equipo ya volvió a tu bodega).', 409, ['codigo' => $p['estado']]);
            $t = time();
            Db::q("UPDATE mercado_publicaciones SET estado = 'retirada', cerrado = ? WHERE id = ? AND estado = 'activa'", [$t, $pubId]);
            Db::q("UPDATE inventario SET estado = 'bodega', actualizado = ? WHERE id = ?", [$t, $p['inventario_id']]);
            return Inventario::json(Db::fila('SELECT * FROM inventario WHERE id = ?', [$p['inventario_id']]));
        });
    }

    /** POST /api/mercado/comprar. Devuelve [saldo del comprador, fila de inventario]. */
    public static function comprar(int $jugador, int $pubId): array
    {
        self::exigirAcceso($jugador);
        self::vencer();
        return Db::tx(function () use ($jugador, $pubId): array {
            $p = Db::fila('SELECT * FROM mercado_publicaciones WHERE id = ?', [$pubId]);
            Fallo::si(!$p, 'Esa publicación no existe.', 404);
            Fallo::si($p['estado'] === 'vendida', 'Llegaste tarde: ese equipo ya se vendió.', 409, ['codigo' => 'vendida']);
            Fallo::si($p['estado'] === 'vencida' || ($p['estado'] === 'activa' && (int) $p['vence'] <= time()), 'Esa publicación ya venció.', 410, ['codigo' => 'vencida']);
            Fallo::si($p['estado'] === 'congelada', 'Esa publicación está en revisión: no se puede comprar ahora.', 409, ['codigo' => 'congelada']);
            Fallo::si($p['estado'] !== 'activa', 'El vendedor retiró ese equipo del mercado.', 409, ['codigo' => 'retirada']);
            Fallo::si((int) $p['vendedor_id'] === $jugador, 'Ese equipo es tuyo: no lo puedes comprar.', 400, ['codigo' => 'propia']);
            $precio = (int) $p['precio'];
            $saldo = Monedero::saldo($jugador);
            Fallo::si($saldo < $precio, 'No tienes créditos suficientes: cuesta ' . $precio . ' y tienes ' . $saldo . '.', 402, ['codigo' => 'sin_creditos', 'creditos' => $saldo]);
            $pago = (int) floor($precio * (1 - Catalogo::MERCADO_COMISION));
            $comision = $precio - $pago;
            $t = time();
            $ref = 'mercado:' . $pubId;
            $nuevo = Monedero::mover($jugador, -$precio, 'mercado_compra', $ref . ':' . $p['item'] . '#' . $p['serie']);
            // Lo que gana el vendedor queda RETENIDO 7 días (auditoría A-01): si la compra con la que se pagó se revierte
            // (reembolso o contracargo), esos créditos se recuperan y no llegan nunca al vendedor.
            if ($p['vendedor_id'] !== null && $pago > 0) {
                Db::q("INSERT INTO mercado_retenciones (jugador_id, publicacion_id, creditos, libera, estado, creado) VALUES (?, ?, ?, ?, 'retenido', ?)",
                    [$p['vendedor_id'], $pubId, $pago, $t + Catalogo::MERCADO_DIAS_RETENCION * 86400, $t]);
                self::revisarMismaIp($jugador, (int) $p['vendedor_id'], $pubId);
            }
            $n = Db::q("UPDATE mercado_publicaciones SET estado = 'vendida', cerrado = ?, comprador_id = ?, pago_vendedor = ?, comision = ? WHERE id = ? AND estado = 'activa'",
                [$t, $jugador, $pago, $comision, $pubId])->rowCount();
            if ($n !== 1) throw new \RuntimeException('La publicación cambió durante la compra.');   // no debería pasar (BEGIN IMMEDIATE)
            // ref (de dónde salió el equipo: canje o compra) no cambia nunca; sirve para revertir un reembolso
            Db::q("UPDATE inventario SET jugador_id = ?, estado = 'bodega', origen = 'mercado', entrega_id = NULL, actualizado = ? WHERE id = ?", [$jugador, $t, $p['inventario_id']]);
            return [$nuevo, Inventario::json(Db::fila('SELECT * FROM inventario WHERE id = ?', [$p['inventario_id']]))];
        });
    }
}
