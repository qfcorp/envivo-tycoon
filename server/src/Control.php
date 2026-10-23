<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Centro de Control (/control/): las acciones del administrador, encima de las clases y tablas del servidor (nada en
 * paralelo). Ver docs/INTEGRAR_CONTROL.md.
 *  - Auditoría: Auditoria::anotar (tabla auditoria). Los métodos del servidor que ya auditan (Compras::revertir,
 *    Cuentas::cambiarEstado, Mercado::moderar, Soporte*, Transferencias::cancelar) no se auditan dos veces.
 *  - Precios y ofertas: tablas productos_ajustes y ofertas (las que lee Catalogo::producto()).
 *  - Mantenimiento y anuncio: Ajustes (tabla ajustes).
 *  - Reembolso / contracargo: Compras::revertir. Estado de la cuenta: Cuentas::cambiarEstado. Sesiones: Sesiones::revocarTodas.
 *  - Soporte: Soporte::responderSoporte / cambiarEstado (respuestas rápidas: tabla soporte_respuestas). Google: Google.
 *  - Lo único propio: control_sesiones (las sesiones del panel), en src/migraciones/control.sql.
 *  - Seguridad del panel (A-04 de docs/AUDITORIA_SEGURIDAD.md): TOTP (ENVIVO_ADMIN_TOTP), lista de IPs (ENVIVO_CONTROL_IPS)
 *    y tope diario de créditos a mano (ENVIVO_CONTROL_TOPE_CREDITOS, por defecto 20.000; más de 5.000 de una vez pide confirmar).
 * Los errores para el administrador se lanzan como Fallo (texto + código HTTP).
 */
final class Control
{
    public const CONFIRMAR_DESDE = 5000;       // créditos a mano: desde aquí hay que marcar "confirmo"
    public const TOPE_DIA = 20000;             // suma de |créditos a mano| por día (se cambia con ENVIVO_CONTROL_TOPE_CREDITOS)
    public const MAX_CREDITOS = 100000;        // por operación (igual que admin.php)

    private static bool $listo = false;
    /** @var array<string, array<string, true>|null> */
    private static array $columnas = [];

    // ------------------------------------------------------------------ esquema
    /** Crea control_sesiones si falta (una vez por petición). */
    public static function preparar(): void
    {
        if (self::$listo) return;
        if (!self::tabla('control_sesiones')) { Migraciones::aplicar('control.sql'); self::$columnas = []; }
        self::$listo = true;
    }

    /** ¿Existe la tabla? (para que cada pestaña funcione aunque falte una tabla opcional) */
    public static function tabla(string $t): bool { return self::cols($t) !== null; }
    public static function tablas(string ...$t): bool { foreach ($t as $x) if (!self::tabla($x)) return false; return true; }
    public static function columna(string $t, string $c): bool { return isset(self::cols($t)[strtolower($c)]); }

    private static function cols(string $t): ?array
    {
        if (!array_key_exists($t, self::$columnas)) self::$columnas[$t] = Migraciones::columnas($t);
        return self::$columnas[$t];
    }

    /** "control:<usuario>" (así queda en la auditoría). */
    public static function quien(string $usuario): string { return 'control:' . mb_substr($usuario, 0, 40); }

    private static function motivo(mixed $m, string $que = 'el motivo'): string
    {
        $m = trim(preg_replace('/\s+/u', ' ', is_string($m) ? $m : '') ?? '');
        Fallo::si($m === '', 'Escribe ' . $que . '.', 400);
        Fallo::si(mb_strlen($m) > 300, 'El motivo tiene máximo 300 caracteres.', 400);
        return $m;
    }

    private static function jugador(int $id): array
    {
        $j = Cuentas::porId($id);
        Fallo::si(!$j, 'Ese jugador no existe.', 404);
        return $j;
    }

    // ------------------------------------------------------------------ seguridad del panel
    /** Tope diario de créditos a mano (suma de valores absolutos). 0 = sin tope. */
    public static function topeDia(): int
    {
        $v = Config::get('ENVIVO_CONTROL_TOPE_CREDITOS');
        return $v !== '' && ctype_digit($v) ? (int) $v : self::TOPE_DIA;
    }

    /** Créditos a mano ya movidos hoy (día local), en valor absoluto. */
    public static function creditosManualesHoy(): int
    {
        return (int) Db::valor("SELECT COALESCE(SUM(ABS(cambio)), 0) FROM movimientos_creditos WHERE motivo = 'manual' AND creado >= ?", [strtotime('today')]);
    }

    /** ¿La IP puede usar el panel? Lista ENVIVO_CONTROL_IPS (IPs o rangos CIDR separados por comas; vacía = todas). */
    public static function ipPermitida(string $ip, ?string $lista = null): bool
    {
        $lista ??= Config::get('ENVIVO_CONTROL_IPS');
        if (trim($lista) === '') return true;
        $bin = @inet_pton($ip);
        if ($bin === false) return false;
        foreach (preg_split('/[\s,]+/', trim($lista)) ?: [] as $r) {
            [$red, $bits] = array_pad(explode('/', $r, 2), 2, null);
            $rb = @inet_pton((string) $red);
            if ($rb === false || strlen($rb) !== strlen($bin)) continue;
            if ($bits !== null && !ctype_digit($bits)) continue;
            $n = $bits === null ? strlen($rb) * 8 : (int) $bits;
            if ($n > strlen($rb) * 8) continue;
            $bytes = intdiv($n, 8); $resto = $n % 8;
            if (substr($bin, 0, $bytes) !== substr($rb, 0, $bytes)) continue;
            if ($resto === 0) return true;
            $m = chr((0xFF << (8 - $resto)) & 0xFF);
            if (($bin[$bytes] & $m) === ($rb[$bytes] & $m)) return true;
        }
        return false;
    }

    /** Secreto TOTP del panel (base32) o '' si no se usa. */
    public static function totpSecreto(): string { return strtoupper(str_replace([' ', '='], '', Config::get('ENVIVO_ADMIN_TOTP'))); }

    public static function base32(string $s): string
    {
        $alf = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $s = strtoupper(str_replace([' ', '='], '', $s));
        $bits = '';
        for ($i = 0; $i < strlen($s); $i++) {
            $p = strpos($alf, $s[$i]);
            if ($p === false) return '';
            $bits .= str_pad(decbin($p), 5, '0', STR_PAD_LEFT);
        }
        $o = '';
        for ($i = 0; $i + 8 <= strlen($bits); $i += 8) $o .= chr(bindec(substr($bits, $i, 8)));
        return $o;
    }

    /** Código TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 dígitos) del paso $paso. */
    public static function totpCodigo(string $secreto, int $paso): string
    {
        $h = hash_hmac('sha1', pack('J', $paso), self::base32($secreto), true);
        $o = ord($h[19]) & 0xF;
        $n = ((ord($h[$o]) & 0x7F) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
        return str_pad((string) ($n % 1000000), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Revisa el código (acepta ±30 s). Un código ya usado no sirve otra vez (se recuerda el último paso usado en el
     * ajuste control_totp_ultimo). Devuelve true si es válido.
     */
    public static function totpVerificar(string $secreto, string $codigo, ?int $ahora = null): bool
    {
        if ($secreto === '' || self::base32($secreto) === '' || !preg_match('/^\d{6}$/', $codigo)) return false;
        $paso = intdiv($ahora ?? time(), 30);
        $ultimo = (int) Ajustes::get('control_totp_ultimo', '0');
        foreach ([0, -1, 1] as $d) {
            if ($paso + $d <= $ultimo) continue;
            if (hash_equals(self::totpCodigo($secreto, $paso + $d), $codigo)) { Ajustes::set('control_totp_ultimo', (string) ($paso + $d)); return true; }
        }
        return false;
    }

    // ------------------------------------------------------------------ jugadores
    /** Da (cambio > 0) o quita créditos a mano (libro con motivo 'manual' y auditoría). Devuelve el saldo nuevo. */
    public static function darCreditos(int $jugador, int $cambio, string $motivo, string $quien, bool $confirmado = false): int
    {
        $motivo = self::motivo($motivo);
        Fallo::si($cambio === 0 || abs($cambio) > self::MAX_CREDITOS, 'La cantidad debe ser distinta de 0 y como máximo ' . number_format(self::MAX_CREDITOS, 0, ',', '.') . '.', 400);
        Fallo::si(abs($cambio) > self::CONFIRMAR_DESDE && !$confirmado, 'Son más de ' . number_format(self::CONFIRMAR_DESDE, 0, ',', '.') . ' créditos: marca "Confirmo la cantidad" para seguir.', 400, ['codigo' => 'confirmar']);
        return Db::tx(function () use ($jugador, $cambio, $motivo, $quien): int {
            self::jugador($jugador);
            $tope = self::topeDia();
            $hoy = self::creditosManualesHoy();
            Fallo::si($tope > 0 && $hoy + abs($cambio) > $tope, 'Tope diario de créditos a mano: ya se movieron ' . number_format($hoy, 0, ',', '.') . ' de ' . number_format($tope, 0, ',', '.') . ' hoy.', 409, ['codigo' => 'tope_dia']);
            $antes = Monedero::saldo($jugador);
            try {
                $saldo = Monedero::mover($jugador, $cambio, 'manual', 'control:' . $motivo);
            } catch (\RuntimeException $e) {
                throw new Fallo('No se pueden quitar ' . abs($cambio) . ' créditos: tiene ' . $antes . '.', 409);
            }
            Auditoria::anotar($quien, $cambio > 0 ? 'creditos_dar' : 'creditos_quitar', abs($cambio) . ' créditos: ' . $motivo . ' (saldo ' . $antes . ' -> ' . $saldo . ')', $jugador);
            return $saldo;
        });
    }

    /** Activo / suspendido / baneado (Cuentas::cambiarEstado audita; banear cierra sus sesiones). */
    public static function cambiarEstado(int $jugador, string $estado, string $motivo, string $quien): void
    {
        self::jugador($jugador);
        Fallo::si(!in_array($estado, ['activo', 'suspendido', 'baneado'], true), 'Estado no válido.', 400);
        if ($estado !== 'activo') $motivo = self::motivo($motivo);
        Cuentas::cambiarEstado($jugador, $estado, trim($motivo), $quien);
    }

    /** Cierra todas las sesiones del jugador. Devuelve cuántas. */
    public static function revocarSesiones(int $jugador, string $quien): int
    {
        self::jugador($jugador);
        $n = Sesiones::revocarTodas($jugador);
        Auditoria::anotar($quien, 'sesiones_cerrar', "$n sesiones cerradas", $jugador);
        return $n;
    }

    // ------------------------------------------------------------------ compras
    /** Lo que dio la compra (solo para mostrar antes de revertir). */
    public static function loDadoPorCompra(array $c): array
    {
        $j = (int) $c['jugador_id'];
        $origen = 'compra:' . (int) $c['id'];
        $p = Catalogo::productoCompra((string) $c['producto']);
        return [
            'creditos' => (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id = ? AND motivo = 'compra' AND ref LIKE ?", [$j, $origen . ':%']),
            'equipos' => self::tabla('inventario') ? Db::todas('SELECT * FROM inventario WHERE ref = ? ORDER BY id', [$origen]) : [],
            'entregas' => Db::todas('SELECT * FROM entregas WHERE jugador_id = ? AND origen = ? ORDER BY id', [$j, $origen]),
            'producto' => $p,
            'vip_dias' => ($p['tipo'] ?? '') === 'vip' ? (int) ($p['dias'] ?? 0) : 0,
            'tarjeta_dias' => ($p['tipo'] ?? '') === 'tarjeta' ? (int) ($p['dias'] ?? 0) : 0,
        ];
    }

    /** Reembolso o contracargo: Compras::revertir (quita lo dado, suspende la cuenta y audita). */
    public static function revertirCompra(int $compra, string $tipo, string $motivo, string $quien): array
    {
        Fallo::si(!in_array($tipo, ['reembolso', 'contracargo'], true), 'Elige reembolso o contracargo.', 400);
        $motivo = self::motivo($motivo);
        $c = Compras::porId($compra);
        Fallo::si(!$c, 'Esa compra no existe.', 404);
        Fallo::si($c['estado'] === 'revertido', 'Esa compra ya fue revertida.', 409);
        $r = Compras::revertir($compra, $tipo, $motivo, $quien);
        Fallo::si($r === null, 'Solo se puede revertir una compra pagada (esta está "' . $c['estado'] . '").', 409);
        return $r;
    }

    // ------------------------------------------------------------------ productos y ofertas (tablas de Catalogo)
    /** Guarda precio (con IVA), créditos y activo de un producto con dinero real en productos_ajustes. */
    public static function guardarProducto(string $id, string $precio, string $creditos, bool $activo, string $quien): void
    {
        $base = Catalogo::PRODUCTOS[$id] ?? null;
        Fallo::si(!$base, 'Ese producto no existe.', 404);
        $precio = str_replace(',', '.', trim($precio));
        Fallo::si(!preg_match('/^\d{1,3}(\.\d{1,2})?$/', $precio) || (float) $precio < 0.5 || (float) $precio > 100, 'El precio debe ser de $0,50 a $100 (con IVA incluido), ej. 4.99', 400);
        $cred = filter_var(trim($creditos), FILTER_VALIDATE_INT);
        Fallo::si($cred === false || $cred < 0 || $cred > 1000000, 'Los créditos deben ser un número entero de 0 a 1.000.000.', 400);
        Db::tx(function () use ($id, $precio, $cred, $activo, $quien): void {
            $antes = Catalogo::producto($id);
            Db::q('INSERT INTO productos_ajustes (producto, precio, creditos, activo, actualizado) VALUES (?, ?, ?, ?, ?) ON CONFLICT (producto) DO UPDATE SET precio = excluded.precio, creditos = excluded.creditos, activo = excluded.activo, actualizado = excluded.actualizado',
                [$id, round((float) $precio, 2), (int) $cred, $activo ? 1 : 0, time()]);
            Catalogo::olvidarAjustes();
            Auditoria::anotar($quien, 'producto_editar', $id . ': precio ' . $antes['precio'] . ' -> ' . round((float) $precio, 2) . ', créditos ' . self::creditosSinOferta($antes) . ' -> ' . $cred . ', activo ' . (int) $antes['activo'] . ' -> ' . (int) $activo);
        });
    }

    /** Vuelve a los valores de Catalogo.php. */
    public static function restaurarProducto(string $id, string $quien): bool
    {
        Fallo::si(!isset(Catalogo::PRODUCTOS[$id]), 'Ese producto no existe.', 404);
        $n = Db::q('DELETE FROM productos_ajustes WHERE producto = ?', [$id])->rowCount();
        Catalogo::olvidarAjustes();
        if ($n) Auditoria::anotar($quien, 'producto_restaurar', $id . ' vuelve a los valores de Catalogo.php');
        return $n > 0;
    }

    /** Oferta de % extra de créditos por tiempo limitado (tabla ofertas). Devuelve su id. */
    public static function crearOferta(string $producto, int $pct, int $inicio, int $fin, string $quien): int
    {
        $p = Catalogo::producto($producto);
        Fallo::si(!$p || !empty($p['oculto']) || self::creditosSinOferta($p) <= 0, 'Las ofertas de % extra son para productos que dan créditos.', 400);
        Fallo::si($pct < 1 || $pct > 300, 'El bono debe ser de 1 % a 300 %.', 400);
        Fallo::si($fin <= $inicio || $fin <= time(), 'Revisa las fechas: el fin debe ser después del inicio y en el futuro.', 400);
        return Db::tx(function () use ($producto, $pct, $inicio, $fin, $quien): int {
            Db::q('INSERT INTO ofertas (producto, bono_pct, inicio, fin, activa, creado) VALUES (?, ?, ?, ?, 1, ?)', [$producto, $pct, $inicio, $fin, time()]);
            $id = Db::ultimoId();
            Catalogo::olvidarAjustes();
            Auditoria::anotar($quien, 'oferta_crear', 'Oferta N° ' . $id . ": $producto +$pct % créditos del " . date('Y-m-d H:i', $inicio) . ' al ' . date('Y-m-d H:i', $fin));
            return $id;
        });
    }

    public static function terminarOferta(int $id, string $quien): void
    {
        $n = Db::q('UPDATE ofertas SET activa = 0 WHERE id = ? AND activa = 1', [$id])->rowCount();
        Fallo::si($n === 0, 'Esa oferta no existe o ya terminó.', 404);
        Catalogo::olvidarAjustes();
        Auditoria::anotar($quien, 'oferta_terminar', 'Oferta N° ' . $id);
    }

    // ------------------------------------------------------------------ ajustes (Ajustes)
    public static function guardarMantenimiento(bool $on, string $mensaje, string $quien): void
    {
        $mensaje = mb_substr(trim($mensaje), 0, 300);
        Ajustes::set('mantenimiento', $on ? '1' : '0');
        Ajustes::set('mantenimiento_mensaje', $mensaje);
        Auditoria::anotar($quien, 'mantenimiento', $on ? 'Tienda EN MANTENIMIENTO: ' . ($mensaje ?: Ajustes::mensajeMantenimiento()) : 'Tienda abierta');
    }

    /** Anuncio del sistema. $hasta: segundos Unix o null (sin fin). Texto vacío = quitar. */
    public static function guardarAnuncio(string $texto, string $tipo, ?int $hasta, string $quien): void
    {
        $texto = mb_substr(trim(preg_replace('/\s+/u', ' ', $texto) ?? ''), 0, 300);
        $tipo = in_array($tipo, ['info', 'aviso', 'evento'], true) ? $tipo : 'info';
        Fallo::si($hasta !== null && $hasta <= time(), 'La fecha "hasta" ya pasó.', 400);
        Ajustes::set('anuncio_texto', $texto);
        Ajustes::set('anuncio_tipo', $tipo);
        Ajustes::set('anuncio_hasta', $hasta === null ? '' : (string) $hasta);
        Auditoria::anotar($quien, 'anuncio', $texto === '' ? 'Anuncio quitado' : "[$tipo] $texto" . ($hasta !== null ? ' (hasta ' . date('Y-m-d H:i', $hasta) . ')' : ''));
    }

    /** Reglas contra el abuso de reembolsos (las usa Compras::revisarAbuso): banear con N reembolsos en D días y/o con un contracargo. */
    public static function guardarAbuso(int $reembolsos, int $dias, bool $contracargoBanea, string $quien): void
    {
        Fallo::si($reembolsos < 1 || $reembolsos > 50, 'Los reembolsos van de 1 a 50.', 400);
        Fallo::si($dias < 1 || $dias > 3650, 'Los días van de 1 a 3.650.', 400);
        $antes = Ajustes::get('abuso_reembolsos', '2') . ' / ' . Ajustes::get('abuso_dias', '180') . ' / ' . Ajustes::get('abuso_contracargo_banea', '1');
        Ajustes::set('abuso_reembolsos', (string) $reembolsos);
        Ajustes::set('abuso_dias', (string) $dias);
        Ajustes::set('abuso_contracargo_banea', $contracargoBanea ? '1' : '0');
        Auditoria::anotar($quien, 'abuso_reglas', 'Banear con reembolsos / días / contracargo: ' . $antes . ' -> ' . $reembolsos . ' / ' . $dias . ' / ' . ($contracargoBanea ? '1' : '0'));
    }

    // ------------------------------------------------------------------ chat (moderación)
    /** ocultar | mostrar | resolver | descartar un mensaje (y sus reportes). */
    public static function moderarMensaje(int $id, string $accion, string $quien): void
    {
        Fallo::si(!in_array($accion, ['ocultar', 'mostrar', 'resolver', 'descartar'], true), 'Acción no válida.', 400);
        Db::tx(function () use ($id, $accion, $quien): void {
            $m = Db::fila('SELECT * FROM chat_mensajes WHERE id = ?', [$id]);
            Fallo::si(!$m, 'Ese mensaje ya no existe (se borran a los 30 días).', 404);
            $t = time();
            if ($accion === 'ocultar' || $accion === 'resolver') {
                if ($accion === 'ocultar') Db::q('UPDATE chat_mensajes SET oculto = 1 WHERE id = ?', [$id]);
                Db::q("UPDATE chat_reportes SET estado = 'resuelto', resuelto_en = ? WHERE mensaje_id = ? AND estado = 'pendiente'", [$t, $id]);
            } else {
                if ($accion === 'mostrar') Db::q('UPDATE chat_mensajes SET oculto = 0 WHERE id = ?', [$id]);
                Db::q("UPDATE chat_reportes SET estado = 'descartado', resuelto_en = ? WHERE mensaje_id = ? AND estado = 'pendiente'", [$t, $id]);
            }
            Auditoria::anotar($quien, 'chat_' . $accion, 'Mensaje N° ' . $id . ': ' . mb_substr((string) $m['texto'], 0, 200), $m['jugador_id'] === null ? null : (int) $m['jugador_id']);
        });
    }

    /** Silencio de 1 h / 24 h / 7 días ('1h'|'24h'|'7d'), o expulsión del chat ($duracion = null). */
    public static function sancionChat(int $jugador, ?string $duracion, string $motivo, string $quien): void
    {
        self::jugador($jugador);
        $motivo = trim($motivo) ?: 'Incumplir las reglas del chat';
        if ($duracion === null) {
            Chat::sancionar($jugador, 'expulsion', null, $motivo);
            Auditoria::anotar($quien, 'chat_expulsar', $motivo, $jugador);
            return;
        }
        $seg = ['1h' => 3600, '24h' => 86400, '7d' => 7 * 86400][$duracion] ?? null;
        Fallo::si($seg === null, 'Elige 1 h, 24 h o 7 días.', 400);
        Chat::sancionar($jugador, 'silencio', $seg, $motivo);
        Auditoria::anotar($quien, 'chat_silenciar', $duracion . ': ' . $motivo, $jugador);
    }

    public static function levantarChat(int $jugador, string $quien): int
    {
        self::jugador($jugador);
        $n = Chat::levantar($jugador);
        Auditoria::anotar($quien, 'chat_levantar', "$n sanciones levantadas", $jugador);
        return $n;
    }

    /** Agrega (true) o quita (false) una palabra prohibida. Devuelve la palabra limpia. */
    public static function palabra(string $palabra, bool $agregar, string $quien): string
    {
        $w = Filtro::limpiarPalabra($palabra);
        Fallo::si($w === '' || mb_strlen($w) < 2 || mb_strlen($w) > 40, 'Escribe una palabra (2 a 40 letras, sin números).', 400);
        if ($agregar) {
            $n = Db::q('INSERT OR IGNORE INTO chat_palabras (palabra, creado) VALUES (?, ?)', [$w, time()])->rowCount();
            Fallo::si($n === 0, '"' . $w . '" ya estaba en la lista.', 409);
        } else {
            $n = Db::q('DELETE FROM chat_palabras WHERE palabra = ?', [$w])->rowCount();
            Fallo::si($n === 0, '"' . $w . '" no estaba en la lista.', 404);
        }
        Filtro::olvidarLista();
        Auditoria::anotar($quien, $agregar ? 'palabra_agregar' : 'palabra_quitar', $w);
        return $w;
    }

    // ------------------------------------------------------------------ soporte (respuestas rápidas)
    public const RAPIDA_TITULO = 60;

    /** Cambia {nombre}, {caso} y {compra} de una respuesta rápida por los datos del caso. */
    public static function plantilla(string $texto, int $caso): string
    {
        if (!str_contains($texto, '{')) return $texto;
        $c = Db::fila('SELECT c.id, c.compra_id, j.nombre FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id WHERE c.id = ?', [$caso]);
        return $c ? strtr($texto, ['{nombre}' => (string) $c['nombre'], '{caso}' => (string) $c['id'], '{compra}' => (string) ($c['compra_id'] ?? '')]) : $texto;
    }

    /** Responde como soporte (Soporte::responderSoporte guarda, cambia el estado y audita). */
    public static function responderCaso(int $caso, string $texto, string $quien, bool $cerrar): void
    {
        $texto = trim($texto);
        Fallo::si($texto === '', 'Escribe la respuesta.', 400);
        Soporte::responderSoporte($caso, self::plantilla($texto, $caso), $quien, $cerrar);
    }

    /** Cierra o reabre (Soporte::cambiarEstado audita). */
    public static function estadoCaso(int $caso, string $estado, string $quien): void
    {
        $actual = Db::valor('SELECT estado FROM soporte_casos WHERE id = ?', [$caso]);
        Fallo::si($actual === null, 'Ese caso no existe.', 404);
        Fallo::si($actual === $estado, $estado === 'cerrado' ? 'Ese caso ya está cerrado.' : 'Ese caso ya está abierto.', 409);
        Soporte::cambiarEstado($caso, $estado, $quien);
    }

    /** Crea ($id null) o edita una respuesta rápida (tabla soporte_respuestas). Devuelve el título. */
    public static function guardarRespuesta(?int $id, string $titulo, string $texto, string $quien): string
    {
        $ti = trim(preg_replace('/\s+/u', ' ', $titulo) ?? '');
        $tx = trim($texto);
        Fallo::si($ti === '' || mb_strlen($ti) > self::RAPIDA_TITULO, 'El título tiene de 1 a ' . self::RAPIDA_TITULO . ' caracteres.', 400);
        Fallo::si($tx === '' || mb_strlen($tx) > Soporte::MAX_TEXTO, 'El texto tiene de 1 a ' . Soporte::MAX_TEXTO . ' caracteres.', 400);
        return Db::tx(function () use ($id, $ti, $tx, $quien): string {
            if ($id === null) {
                Fallo::si((int) Db::valor('SELECT COUNT(*) FROM soporte_respuestas') >= 100, 'Ya hay 100 respuestas rápidas. Borra alguna.', 409);
                Db::q('INSERT INTO soporte_respuestas (titulo, texto, creado) VALUES (?, ?, ?)', [$ti, $tx, time()]);
                Auditoria::anotar($quien, 'soporte_rapida_crear', 'Respuesta rápida N° ' . Db::ultimoId() . ': ' . $ti);
            } else {
                $antes = Db::fila('SELECT * FROM soporte_respuestas WHERE id = ?', [$id]);
                Fallo::si(!$antes, 'Esa respuesta rápida no existe.', 404);
                Db::q('UPDATE soporte_respuestas SET titulo = ?, texto = ? WHERE id = ?', [$ti, $tx, $id]);
                Auditoria::anotar($quien, 'soporte_rapida_editar', 'Respuesta rápida N° ' . $id . ': "' . $antes['titulo'] . '" -> "' . $ti . '"');
            }
            return $ti;
        });
    }

    public static function borrarRespuesta(int $id, string $quien): void
    {
        $r = Db::fila('SELECT * FROM soporte_respuestas WHERE id = ?', [$id]);
        Fallo::si(!$r, 'Esa respuesta rápida no existe.', 404);
        Db::q('DELETE FROM soporte_respuestas WHERE id = ?', [$id]);
        Auditoria::anotar($quien, 'soporte_rapida_borrar', 'Respuesta rápida N° ' . $id . ': ' . $r['titulo']);
    }

    // ------------------------------------------------------------------ Google Play
    /** Revisa ahora las compras anuladas en Google (Google::revisarAnuladas) y lo deja en la auditoría. [revisadas, revertidas] */
    public static function revisarGoogle(string $quien): array
    {
        Fallo::si(!Google::configurado(), 'Google Play no está configurado (GOOGLE_PACKAGE_NAME y GOOGLE_SERVICE_ACCOUNT_JSON).', 409);
        try {
            $r = Google::revisarAnuladas();
        } catch (\RuntimeException $e) {
            throw new Fallo('Google no respondió bien: ' . $e->getMessage(), 502);
        }
        Auditoria::anotar($quien, 'google_anuladas', 'Revisadas ' . $r[0] . ', revertidas ' . $r[1]);
        return $r;
    }

    /** Reintenta ahora los avisos a Google (consume/acknowledge) que faltan (Google::avisosPendientes). Devuelve cuántos salieron. */
    public static function avisarGoogle(string $quien): int
    {
        Fallo::si(!Google::configurado(), 'Google Play no está configurado (GOOGLE_PACKAGE_NAME y GOOGLE_SERVICE_ACCOUNT_JSON).', 409);
        $n = Google::avisosPendientes();
        Auditoria::anotar($quien, 'google_avisos', $n . ' avisos a Google enviados');
        return $n;
    }

    /** Créditos que da hoy el producto SIN la oferta (Catalogo.php + productos_ajustes). */
    public static function creditosSinOferta(array $p): int { return (int) $p['creditos'] - (int) ($p['oferta']['creditos_extra'] ?? 0); }
}
