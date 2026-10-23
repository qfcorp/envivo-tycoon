<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Regalos de asociación (server/INTEGRAR_VIP.md). Cuando una compra con dinero real se aprueba, CADA miembro de la
 * asociación del comprador (también él) recibe un cofre "Regalo de <alias>" con contenido FIJO y pequeño según el monto:
 * dinero del juego y repuestos (entregas). NUNCA créditos ni nada que valga dinero real.
 * - El comprador puede elegir que salga anónimo (POST /api/vip/ajustes {anonimo: true}).
 * - Se reclama dentro de 7 días (ajuste `vip_regalo_dias`); después vence.
 * - Tope por miembro: máximo N cofres nuevos por día (ajuste `vip_regalos_dia`, 5 por defecto). Lo que pase del tope
 *   no se crea (la compra igual cuenta para el VIP del comprador): una ballena no puede inundar a su asociación.
 * - Si la compra se revierte (reembolso / contracargo), los cofres de esa compra que nadie reclamó se cancelan.
 * Idempotente: un cofre por compra y por miembro (UNIQUE), aunque el gancho llegue dos veces.
 */
final class Regalos
{
    public const DIAS = 7;
    public const TOPE_DIA = 5;

    /** Tamaño del cofre según el monto de la compra (USD con IVA): [desde, contenido]. */
    public const COFRES = [
        1 => ['desde' => 0, 'contenido' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 250], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 1]]],
        2 => ['desde' => 2, 'contenido' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 500], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2]]],
        3 => ['desde' => 5, 'contenido' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 900], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 2], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 2]]],
        4 => ['desde' => 10, 'contenido' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1500], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3]]],
        5 => ['desde' => 20, 'contenido' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2500], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5]]],
    ];
    /** Tipos de entrega permitidos en un cofre (nada con valor de dinero real). */
    public const TIPOS = ['dinero', 'consumible', 'reparar_todo'];

    public static function topeDia(): int
    {
        $v = trim(Ajustes::get('vip_regalos_dia', (string) self::TOPE_DIA));
        return preg_match('/^\d{1,3}$/', $v) ? max(0, (int) $v) : self::TOPE_DIA;
    }

    public static function dias(): int
    {
        $v = trim(Ajustes::get('vip_regalo_dias', (string) self::DIAS));
        return preg_match('/^\d{1,2}$/', $v) && (int) $v > 0 ? (int) $v : self::DIAS;
    }

    public static function cofrePara(float $usd): int
    {
        $n = 1;
        foreach (self::COFRES as $k => $c) if ($usd + 0.0001 >= $c['desde']) $n = $k;
        return $n;
    }

    // ------------------------------------------------------------------ ganchos
    /** compra_aprobada: un cofre para cada miembro de la asociación del comprador. Devuelve [creados, saltados_por_tope]. */
    public static function alAprobar(array $d): array
    {
        $cid = (int) ($d['compra_id'] ?? 0);
        $c = $cid > 0 ? Compras::porId($cid) : null;
        if (!$c || $c['estado'] !== 'pagado' || (int) $c['jugador_id'] !== (int) ($d['jugador_id'] ?? 0) || !Vip::cuenta((string) $c['producto'])) return [0, 0];
        $j = (int) $c['jugador_id'];
        $m = Social::miembro($j);
        if (!$m) return [0, 0];
        $asoc = (int) $m['asociacion_id'];
        $usd = isset($d['monto_usd']) && is_numeric($d['monto_usd']) ? (float) $d['monto_usd'] : (float) $c['total'];
        $nivel = self::cofrePara($usd);
        $contenido = json_encode(self::COFRES[$nivel]['contenido']);
        $anonimo = Vip::preferencias($j)['anonimo'];
        $comprador = Db::fila('SELECT alias, nombre FROM jugadores WHERE id = ?', [$j]);
        $nombre = $anonimo ? null : Social::nombrePublico($comprador['alias'] ?? null, $comprador['nombre'] ?? null);
        $t = Vip::ahora();
        $dia = date('Y-m-d', $t);
        $tope = self::topeDia();
        $creados = 0; $saltados = 0;
        Db::tx(function () use ($cid, $j, $asoc, $nivel, $contenido, $nombre, $t, $dia, $tope, &$creados, &$saltados): void {
            $miembros = Db::todas("SELECT am.jugador_id FROM asociacion_miembros am JOIN jugadores x ON x.id = am.jugador_id
                                   WHERE am.asociacion_id = ? AND x.estado NOT IN ('baneado', 'borrado') ORDER BY am.jugador_id", [$asoc]);
            foreach ($miembros as $mm) {
                $r = (int) $mm['jugador_id'];
                if (Db::valor('SELECT 1 FROM vip_regalos WHERE compra_id = ? AND receptor_id = ?', [$cid, $r])) continue;
                $hoy = (int) Db::valor("SELECT COUNT(*) FROM vip_regalos WHERE receptor_id = ? AND dia = ? AND estado <> 'cancelado'", [$r, $dia]);
                if ($hoy >= $tope) { $saltados++; continue; }
                Db::q('INSERT INTO vip_regalos (compra_id, comprador_id, receptor_id, asociacion_id, nivel, contenido_json, de_nombre, estado, dia, creado, vence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$cid, $j, $r, $asoc, $nivel, $contenido, $nombre, 'pendiente', $dia, $t, $t + self::dias() * 86400]);
                $creados++;
            }
            if ($creados > 0) {
                Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, creado) VALUES (?, NULL, ?, ?)', ['asociacion:' . $asoc,
                    '🎁 ' . ($nombre === null ? 'Una productora anónima' : $nombre) . ' apoyó al juego: ¡hay un cofre de regalo para la asociación! Reclámalo en Inicio (vence en ' . self::dias() . ' días).', $t]);
            }
        });
        return [$creados, $saltados];
    }

    /** compra_revertida: se cancelan los cofres de esa compra que nadie reclamó. Devuelve cuántos. */
    public static function alRevertir(array $d): int
    {
        $cid = (int) ($d['compra_id'] ?? 0);
        if ($cid <= 0) return 0;
        return Db::q("UPDATE vip_regalos SET estado = 'cancelado' WHERE compra_id = ? AND estado = 'pendiente'", [$cid])->rowCount();
    }

    // ------------------------------------------------------------------ jugador
    private static function vencer(int $jugador): void
    {
        Db::q("UPDATE vip_regalos SET estado = 'vencido' WHERE receptor_id = ? AND estado = 'pendiente' AND vence <= ?", [$jugador, Vip::ahora()]);
    }

    private static function json(array $f): array
    {
        return ['id' => (int) $f['id'], 'de' => $f['de_nombre'], 'anonimo' => $f['de_nombre'] === null, 'nivel' => (int) $f['nivel'],
                'contenido' => json_decode((string) $f['contenido_json'], true) ?: [], 'creado' => Db::iso((int) $f['creado']), 'vence' => Db::iso((int) $f['vence']),
                'mio' => (int) $f['comprador_id'] === (int) $f['receptor_id']];
    }

    /** Cofres por reclamar (los vencidos se marcan antes). */
    public static function pendientes(int $jugador): array
    {
        self::vencer($jugador);
        return array_map([self::class, 'json'], Db::todas("SELECT * FROM vip_regalos WHERE receptor_id = ? AND estado = 'pendiente' ORDER BY vence, id LIMIT 50", [$jugador]));
    }

    /** Cuántos cofres por reclamar (para /api/estado). */
    public static function cuantos(int $jugador): int
    {
        return (int) Db::valor("SELECT COUNT(*) FROM vip_regalos WHERE receptor_id = ? AND estado = 'pendiente' AND vence > ?", [$jugador, Vip::ahora()]);
    }

    /** POST /api/vip/regalo/reclamar {id}: entrega el contenido una sola vez. */
    public static function reclamar(int $jugador, int $id): array
    {
        return Db::tx(function () use ($jugador, $id): array {
            $f = Db::fila('SELECT * FROM vip_regalos WHERE id = ? AND receptor_id = ?', [$id, $jugador]);
            Fallo::si(!$f, 'Ese regalo no existe.', 404, ['codigo' => 'regalo_no_existe']);
            Fallo::si($f['estado'] === 'reclamado', 'Ya abriste ese regalo.', 409, ['codigo' => 'ya_reclamado']);
            Fallo::si($f['estado'] === 'cancelado', 'Ese regalo se canceló (la compra se devolvió).', 410, ['codigo' => 'regalo_cancelado']);
            Fallo::si($f['estado'] === 'vencido' || (int) $f['vence'] <= Vip::ahora(), 'Ese regalo venció: se reclaman dentro de ' . self::dias() . ' días.', 410, ['codigo' => 'regalo_vencido']);
            $ok = Db::q("UPDATE vip_regalos SET estado = 'reclamado', reclamado_en = ? WHERE id = ? AND estado = 'pendiente'", [Vip::ahora(), $id])->rowCount();
            Fallo::si($ok !== 1, 'Ya abriste ese regalo.', 409, ['codigo' => 'ya_reclamado']);
            $entregas = [];
            foreach (json_decode((string) $f['contenido_json'], true) ?: [] as $e) {
                if (!is_array($e) || !in_array($e['tipo'] ?? '', self::TIPOS, true)) continue;   // nunca créditos ni equipos
                $entregas[] = Monedero::entregarDef($jugador, $e, 'regalo:' . $id);
            }
            return ['ok' => true, 'regalo' => self::json(['estado' => 'reclamado'] + $f), 'entregas' => $entregas, 'pendientes' => self::cuantos($jugador)];
        });
    }
}
