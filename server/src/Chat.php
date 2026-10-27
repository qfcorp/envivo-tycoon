<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Chat del juego (ver server/SOCIAL.md).
 * Canales: servidor:<id> (todos los del servidor), asociacion:<id> (solo miembros), coalicion:<id> (asociaciones de la
 * coalición, solo durante el evento) y sistema:<jugador> (avisos del juego para un jugador; nadie escribe ahí).
 * - 1 mensaje cada 3 s por jugador (se revisa y se anota en un solo UPDATE: dos mensajes a la vez -> solo uno pasa).
 * - Filtro de groserías (lista editable en el panel) y nada de enlaces, correos ni teléfonos.
 * - Reportar (3 reportes de personas distintas ocultan el mensaje hasta que lo revise el administrador), bloquear,
 *   y sanciones del administrador: silencio 1 h / 24 h / 7 días o expulsión del chat.
 * - Los mensajes se borran a los 30 días (tarea diaria bin/tareas.php).
 */
final class Chat
{
    public const MAX_TEXTO = 300;
    public const ESPERA_MS = 3000;
    public const POR_PEDIDO = 50;
    public const DIAS = 30;
    public const REPORTES_OCULTAN = 3;

    /** Mensajes rápidos (lista fija). */
    public const RAPIDOS = [
        'hola' => '¡Hola, productoras! 👋',
        'vamos_festival' => '¡Vamos al festival! 🎪',
        'buen_evento' => '¡Buen evento! 🎬',
        'gracias' => '¡Gracias! 🙌',
        'felicitaciones' => '¡Felicitaciones! 🏆',
        'listo' => '¡Listo, ya estoy! ✅',
        'ayuda' => '¿Alguien me ayuda con el próximo evento? 🙏',
        'necesito_camaras' => 'Necesito camarógrafos para un evento grande 🎥',
        'en_vivo' => '¡Estamos EN VIVO! 🔴',
        'buenas_noches' => 'Buenas noches, equipo 🌙',
    ];

    public const MOTIVOS_REPORTE = ['groseria' => 'Groserías', 'acoso' => 'Acoso o insultos', 'spam' => 'Spam', 'datos_personales' => 'Pide o da datos personales', 'otro' => 'Otro'];

    /** Sanción vigente: ['tipo' => silencio|expulsion, 'hasta' => ISO|null, 'motivo'] o null. */
    public static function sancion(int $jugador): ?array
    {
        $s = Db::fila('SELECT * FROM chat_sanciones WHERE jugador_id = ? AND levantada = 0 AND (hasta IS NULL OR hasta > ?) ORDER BY (hasta IS NULL) DESC, hasta DESC LIMIT 1', [$jugador, time()]);
        return $s ? ['tipo' => $s['tipo'], 'hasta' => $s['hasta'] === null ? null : Db::iso((int) $s['hasta']), 'motivo' => $s['motivo']] : null;
    }

    /** Traduce el canal que pide el juego al canal real y revisa que el jugador pueda leerlo/escribir. */
    public static function canal(int $jugador, string $canal, ?int $coalicion = null): string
    {
        switch ($canal) {
            case 'servidor':
                return 'servidor:' . (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$jugador]);
            case 'asociacion':
                $m = Social::miembro($jugador);
                Fallo::si(!$m, 'No estás en ninguna asociación.', 403, ['codigo' => 'sin_asociacion']);
                return 'asociacion:' . $m['asociacion_id'];
            case 'coalicion':
                $c = Social::coalicionActiva($jugador, $coalicion);
                Fallo::si(!$c, 'Tu asociación no tiene una coalición activa ahora.', 403, ['codigo' => 'sin_coalicion']);
                return 'coalicion:' . $c['id'];
            case 'sistema':
                return 'sistema:' . $jugador;
        }
        throw new Fallo('Canal no válido.', 400);
    }

    /**
     * Insignia VIP 1–10 en el chat (INTEGRAR_VIP.md §8): columna y LEFT JOIN de vip_jugadores, solo si esa tabla existe
     * (sin el módulo VIP, vip_nivel sale 0).
     */
    private static function vipSql(): array
    {
        static $hay = null;
        $hay ??= Migraciones::columnas('vip_jugadores') !== null;
        return $hay ? [', ' . (class_exists(Vip::class) ? Vip::sqlNivel('vj') : 'COALESCE(vj.nivel, 0)') . ' AS vip_nivel', ' LEFT JOIN vip_jugadores vj ON vj.jugador_id = m.jugador_id'] : ['', ''];
    }

    private static function mensajeJson(array $m, int $yo): array
    {
        $vip = $m['vip_hasta'] !== null && (int) $m['vip_hasta'] > time();
        return ['id' => (int) $m['id'], 'jugador_id' => $m['jugador_id'] === null ? null : (int) $m['jugador_id'],
                'alias' => $m['jugador_id'] === null ? 'EN VIVO' : Social::nombrePublico($m['alias'], $m['nombre']),
                'siglas' => $m['siglas'], 'color' => $m['color'], 'cargo' => $m['cargo'], 'vip' => $vip, 'vip_nivel' => (int) ($m['vip_nivel'] ?? 0), 'texto' => $m['texto'], 'rapido' => $m['rapido'],
                'creado' => Db::iso((int) $m['creado']), 'mio' => $m['jugador_id'] !== null && (int) $m['jugador_id'] === $yo];
    }

    /** GET /api/chat?canal=&desde= -> mensajes más nuevos que "desde" (máx. 50; con desde=0, los últimos 50). */
    public static function leer(int $jugador, string $canal, int $desde, ?int $coalicion = null): array
    {
        $c = self::canal($jugador, $canal, $coalicion);
        [$vipCol, $vipJoin] = self::vipSql();
        $base = 'SELECT m.*, j.alias, j.nombre, j.vip_hasta, a.siglas, a.color, am.cargo' . $vipCol . ' FROM chat_mensajes m
                 LEFT JOIN jugadores j ON j.id = m.jugador_id' . $vipJoin . '
                 LEFT JOIN asociacion_miembros am ON am.jugador_id = m.jugador_id
                 LEFT JOIN asociaciones a ON a.id = am.asociacion_id
                 WHERE m.canal = ? AND m.oculto = 0 AND m.creado >= ?
                   AND (m.jugador_id IS NULL OR m.jugador_id NOT IN (SELECT bloqueado_id FROM chat_bloqueos WHERE jugador_id = ?))';
        $p = [$c, time() - self::DIAS * 86400, $jugador];
        if ($desde > 0) {
            $filas = Db::todas($base . ' AND m.id > ? ORDER BY m.id ASC LIMIT ' . self::POR_PEDIDO, [...$p, $desde]);
        } else {
            $filas = array_reverse(Db::todas($base . ' ORDER BY m.id DESC LIMIT ' . self::POR_PEDIDO, $p));
        }
        $ultimo = (int) (Db::valor('SELECT MAX(id) FROM chat_mensajes WHERE canal = ?', [$c]) ?? 0);
        // Mensajes que el administrador ocultó hace poco (para quitarlos de la pantalla si ya se mostraron)
        $ocultos = array_map('intval', array_column(Db::todas('SELECT id FROM chat_mensajes WHERE canal = ? AND oculto = 1 AND creado >= ? ORDER BY id DESC LIMIT 100', [$c, time() - 86400]), 'id'));
        return ['ok' => true, 'canal' => $canal, 'mensajes' => array_map(fn($m) => self::mensajeJson($m, $jugador), $filas),
                'ultimo_id' => max($desde, $filas ? (int) end($filas)['id'] : 0, $desde > 0 ? 0 : $ultimo), 'hay_mas' => $desde > 0 && count($filas) === self::POR_PEDIDO,
                'ocultos' => $ocultos, 'sancion' => self::sancion($jugador), 'espera_ms' => self::ESPERA_MS];
    }

    /** Texto limpio y revisado (o Fallo). */
    public static function prepararTexto(mixed $texto): string
    {
        $t = Social::limpiarTexto($texto);
        Fallo::si($t === '', 'Escribe un mensaje.', 400, ['codigo' => 'vacio']);
        Fallo::si(mb_strlen($t) > self::MAX_TEXTO, 'El mensaje tiene máximo ' . self::MAX_TEXTO . ' caracteres.', 400, ['codigo' => 'largo']);
        Filtro::revisar($t);
        return $t;
    }

    /** POST /api/chat {canal, texto | rapido} */
    public static function escribir(int $jugador, array $in): array
    {
        Cuentas::exigirActiva($jugador);
        $s = self::sancion($jugador);
        if ($s) {
            $txt = $s['tipo'] === 'expulsion' && $s['hasta'] === null ? 'No puedes escribir en el chat: fuiste expulsado del chat.'
                 : 'No puedes escribir en el chat hasta el ' . date('d/m/Y H:i', strtotime((string) $s['hasta'])) . '.';
            throw new Fallo($txt, 403, ['codigo' => 'sancion', 'sancion' => $s]);
        }
        $canalPedido = is_string($in['canal'] ?? null) ? $in['canal'] : '';
        Fallo::si($canalPedido === 'sistema', 'En el canal del sistema no se puede escribir.', 403);
        $coal = isset($in['coalicion']) && is_int($in['coalicion']) ? $in['coalicion'] : null;
        $canal = self::canal($jugador, $canalPedido, $coal);
        $rapido = null;
        if (isset($in['rapido'])) {
            $rapido = is_string($in['rapido']) ? $in['rapido'] : '';
            Fallo::si(!isset(self::RAPIDOS[$rapido]), 'Ese mensaje rápido no existe.', 400, ['codigo' => 'rapido']);
            $texto = self::RAPIDOS[$rapido];
        } else {
            $texto = self::prepararTexto($in['texto'] ?? '');
        }
        $ahora = (int) floor(microtime(true) * 1000);
        return Db::tx(function () use ($jugador, $canal, $texto, $rapido, $ahora, $canalPedido): array {
            $ok = Db::q('UPDATE jugadores SET chat_ultimo_ms = ? WHERE id = ? AND (chat_ultimo_ms IS NULL OR chat_ultimo_ms <= ?)', [$ahora, $jugador, $ahora - self::ESPERA_MS])->rowCount();
            if ($ok !== 1) {
                $ult = (int) Db::valor('SELECT chat_ultimo_ms FROM jugadores WHERE id = ?', [$jugador]);
                throw new Fallo('Espera un momento antes de mandar otro mensaje.', 429, ['codigo' => 'muy_rapido', 'espera_ms' => max(0, $ult + self::ESPERA_MS - $ahora)]);
            }
            Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, rapido, creado) VALUES (?, ?, ?, ?, ?)', [$canal, $jugador, $texto, $rapido, time()]);
            $id = Db::ultimoId();
            if (random_int(1, 200) === 1) self::limpiarViejos();
            [$vipCol, $vipJoin] = self::vipSql();
            $m = Db::fila('SELECT m.*, j.alias, j.nombre, j.vip_hasta, a.siglas, a.color, am.cargo' . $vipCol . ' FROM chat_mensajes m LEFT JOIN jugadores j ON j.id = m.jugador_id' . $vipJoin . '
                           LEFT JOIN asociacion_miembros am ON am.jugador_id = m.jugador_id LEFT JOIN asociaciones a ON a.id = am.asociacion_id WHERE m.id = ?', [$id]);
            return ['ok' => true, 'canal' => $canalPedido, 'mensaje' => self::mensajeJson($m, $jugador)];
        });
    }

    /** Aviso del juego para un jugador (canal sistema:<id>). */
    public static function sistema(int $jugador, string $texto): void
    {
        Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, creado) VALUES (?, NULL, ?, ?)', ['sistema:' . $jugador, mb_substr($texto, 0, self::MAX_TEXTO), time()]);
    }

    /** ¿Puede este jugador ver el mensaje? (para reportar) */
    private static function puedeVer(int $jugador, array $m): bool
    {
        [$tipo, $id] = array_pad(explode(':', (string) $m['canal'], 2), 2, '');
        return match ($tipo) {
            'servidor' => (int) $id === (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$jugador]),
            'asociacion' => ($x = Social::miembro($jugador)) !== null && (int) $x['asociacion_id'] === (int) $id,
            'coalicion' => Social::coalicionActiva($jugador, (int) $id) !== null || (bool) Db::valor('SELECT 1 FROM coalicion_miembros cm JOIN asociacion_miembros am ON am.asociacion_id = cm.asociacion_id WHERE cm.coalicion_id = ? AND am.jugador_id = ?', [(int) $id, $jugador]),
            default => false,
        };
    }

    /** POST /api/chat/reportar {mensaje_id, motivo} */
    public static function reportar(int $jugador, int $mensaje, string $motivo): array
    {
        $motivo = Social::limpiarTexto($motivo);
        Fallo::si($motivo === '' || mb_strlen($motivo) > 200, 'Elige o escribe el motivo del reporte (máximo 200 caracteres).', 400);
        if (Limite::contar('reporte:' . $jugador, 30, 60)) throw new Fallo('Hiciste muchos reportes seguidos. Espera un rato.', 429);
        return Db::tx(function () use ($jugador, $mensaje, $motivo): array {
            $m = Db::fila('SELECT * FROM chat_mensajes WHERE id = ?', [$mensaje]);
            Fallo::si(!$m || $m['jugador_id'] === null || !self::puedeVer($jugador, $m), 'Ese mensaje no existe.', 404);
            Fallo::si((int) $m['jugador_id'] === $jugador, 'No puedes reportar tu propio mensaje.', 400);
            $nuevo = Db::q('INSERT OR IGNORE INTO chat_reportes (mensaje_id, reportante_id, motivo, creado) VALUES (?, ?, ?, ?)', [$mensaje, $jugador, $motivo, time()])->rowCount() === 1;
            $n = (int) Db::valor("SELECT COUNT(*) FROM chat_reportes WHERE mensaje_id = ? AND estado = 'pendiente'", [$mensaje]);
            $oculto = false;
            if ($n >= self::REPORTES_OCULTAN && !(int) $m['oculto']) { Db::q('UPDATE chat_mensajes SET oculto = 1 WHERE id = ?', [$mensaje]); $oculto = true; }
            return ['ok' => true, 'nuevo' => $nuevo, 'oculto' => $oculto || (bool) (int) $m['oculto']];
        });
    }

    /** POST /api/chat/bloquear {jugador_id, desbloquear?} */
    public static function bloquear(int $jugador, int $otro, bool $desbloquear): array
    {
        Fallo::si($otro === $jugador, 'No te puedes bloquear a ti mismo.', 400);
        Fallo::si(!Db::valor('SELECT 1 FROM jugadores WHERE id = ?', [$otro]), 'Ese jugador no existe.', 404);
        if ($desbloquear) Db::q('DELETE FROM chat_bloqueos WHERE jugador_id = ? AND bloqueado_id = ?', [$jugador, $otro]);
        else {
            Fallo::si((int) Db::valor('SELECT COUNT(*) FROM chat_bloqueos WHERE jugador_id = ?', [$jugador]) >= 500, 'Ya bloqueaste a demasiadas personas.', 409);
            Db::q('INSERT OR IGNORE INTO chat_bloqueos (jugador_id, bloqueado_id, creado) VALUES (?, ?, ?)', [$jugador, $otro, time()]);
        }
        return ['ok' => true, 'bloqueados' => self::bloqueados($jugador)];
    }

    public static function bloqueados(int $jugador): array
    {
        return array_map(fn($f) => ['jugador_id' => (int) $f['bloqueado_id'], 'nombre' => Social::nombrePublico($f['alias'], $f['nombre'])],
            Db::todas('SELECT b.bloqueado_id, j.alias, j.nombre FROM chat_bloqueos b JOIN jugadores j ON j.id = b.bloqueado_id WHERE b.jugador_id = ? ORDER BY b.creado', [$jugador]));
    }

    /** Borra los mensajes de más de 30 días (con sus reportes). Devuelve cuántos borró. */
    public static function limpiarViejos(): int
    {
        return Db::q('DELETE FROM chat_mensajes WHERE creado < ?', [time() - self::DIAS * 86400])->rowCount();
    }

    // ------------------------------------------------------------------ panel de administración
    /** Silencio ($segundos) o expulsión ($tipo 'expulsion', $segundos null). Con $quien, queda en la auditoría. */
    public static function sancionar(int $jugador, string $tipo, ?int $segundos, string $motivo, ?string $quien = null): void
    {
        Fallo::si(!in_array($tipo, ['silencio', 'expulsion'], true) || ($tipo === 'silencio' && ($segundos === null || $segundos < 60)), 'Sanción no válida.', 400, ['codigo' => 'sancion_invalida']);
        if ($quien !== null) Auditoria::anotar($quien, $tipo === 'expulsion' ? 'chat_expulsar' : 'chat_silenciar', ($tipo === 'silencio' ? $segundos . ' s: ' : '') . $motivo, $jugador);
        Db::q('INSERT INTO chat_sanciones (jugador_id, tipo, hasta, motivo, creado) VALUES (?, ?, ?, ?, ?)',
            [$jugador, $tipo, $segundos === null ? null : time() + $segundos, mb_substr($motivo, 0, 200), time()]);
        self::sistema($jugador, $tipo === 'expulsion' ? 'Fuiste expulsado del chat por: ' . $motivo
            : 'No podrás escribir en el chat por ' . ($segundos >= 86400 ? intdiv($segundos, 86400) . ' día(s)' : intdiv($segundos, 3600) . ' hora(s)') . '. Motivo: ' . $motivo);
    }

    public static function levantar(int $jugador, ?string $quien = null): int
    {
        $n = Db::q('UPDATE chat_sanciones SET levantada = 1 WHERE jugador_id = ? AND levantada = 0', [$jugador])->rowCount();
        if ($quien !== null) Auditoria::anotar($quien, 'chat_levantar', "$n sanciones levantadas", $jugador);
        return $n;
    }

    /** ocultar | mostrar | resolver | descartar un mensaje (y cierra sus reportes pendientes). Audita. */
    public static function moderarMensaje(int $mensajeId, string $accion, string $quien): void
    {
        Fallo::si(!in_array($accion, ['ocultar', 'mostrar', 'resolver', 'descartar'], true), 'Acción no válida.', 400, ['codigo' => 'accion_invalida']);
        Db::tx(function () use ($mensajeId, $accion, $quien): void {
            $m = Db::fila('SELECT * FROM chat_mensajes WHERE id = ?', [$mensajeId]);
            Fallo::si(!$m, 'Ese mensaje ya no existe (se borran a los ' . self::DIAS . ' días).', 404, ['codigo' => 'mensaje_no_existe']);
            if ($accion === 'ocultar') Db::q('UPDATE chat_mensajes SET oculto = 1 WHERE id = ?', [$mensajeId]);
            if ($accion === 'mostrar') Db::q('UPDATE chat_mensajes SET oculto = 0 WHERE id = ?', [$mensajeId]);
            $estado = in_array($accion, ['ocultar', 'resolver'], true) ? 'resuelto' : 'descartado';
            Db::q("UPDATE chat_reportes SET estado = ?, resuelto_en = ? WHERE mensaje_id = ? AND estado = 'pendiente'", [$estado, time(), $mensajeId]);
            Auditoria::anotar($quien, 'chat_' . $accion, 'Mensaje N° ' . $mensajeId . ': ' . mb_substr((string) $m['texto'], 0, 200), $m['jugador_id'] === null ? null : (int) $m['jugador_id']);
        });
    }

    /** Agrega (true) o quita (false) una palabra prohibida. Audita. Devuelve la palabra limpia. */
    public static function palabra(string $palabra, bool $agregar, string $quien): string
    {
        $w = Filtro::limpiarPalabra($palabra);
        Fallo::si($w === '' || mb_strlen($w) < 2 || mb_strlen($w) > 40, 'Escribe una palabra (2 a 40 letras, sin números).', 400, ['codigo' => 'palabra_invalida']);
        if ($agregar) {
            $n = Db::q('INSERT OR IGNORE INTO chat_palabras (palabra, creado) VALUES (?, ?)', [$w, time()])->rowCount();
            Fallo::si($n === 0, '"' . $w . '" ya estaba en la lista.', 409, ['codigo' => 'palabra_repetida']);
        } else {
            $n = Db::q('DELETE FROM chat_palabras WHERE palabra = ?', [$w])->rowCount();
            Fallo::si($n === 0, '"' . $w . '" no estaba en la lista.', 404, ['codigo' => 'palabra_no_existe']);
        }
        Filtro::olvidarLista();
        Auditoria::anotar($quien, $agregar ? 'palabra_agregar' : 'palabra_quitar', $w);
        return $w;
    }
}
