<?php
declare(strict_types=1);

namespace EnVivo;

/** Cuentas de jugador: registrarse, entrar y el "estado" que recibe el juego (GET /api/estado). */
final class Cuentas
{
    public const CLAVE_MIN = 8;

    public static function porId(int $id): ?array { return Db::fila('SELECT * FROM jugadores WHERE id = ?', [$id]); }
    public static function porEmail(string $email): ?array { return Db::fila('SELECT * FROM jugadores WHERE email = ?', [self::normalizarEmail($email)]); }

    public static function normalizarEmail(string $e): string { return mb_strtolower(trim($e)); }

    /** Estados de cuenta: activo · suspendido (no compra, no vende, no chatea, no transfiere) · baneado (no entra). */
    public static function estadoCuenta(int $jugador): string { return (string) (Db::valor('SELECT estado FROM jugadores WHERE id = ?', [$jugador]) ?? 'activo'); }

    /** Lanza Fallo 403 si la cuenta está suspendida o baneada. */
    public static function exigirActiva(int $jugador): void
    {
        $e = self::estadoCuenta($jugador);
        if ($e === 'activo') return;
        if ($e === 'borrado') throw new Fallo('Esta cuenta fue borrada.', 403, ['codigo' => 'cuenta_borrada']);
        throw new Fallo(self::aviso($e) ?? 'Tu cuenta no está activa.', 403, ['codigo' => $e === 'baneado' ? 'cuenta_baneada' : 'cuenta_suspendida']);
    }

    public static function aviso(string $estado): ?string
    {
        return match ($estado) {
            'suspendido' => 'Tu cuenta está suspendida mientras revisamos un reembolso o contracargo de una compra. Puedes seguir jugando, pero no comprar, vender ni usar el chat. Escríbenos desde "Ayuda y soporte"'
                . (Config::get('SOPORTE_CORREO') !== '' ? ' o a ' . Config::get('SOPORTE_CORREO') : '') . '.',
            'baneado' => 'Tu cuenta fue bloqueada por incumplir los términos del juego (por ejemplo, contracargos o reembolsos repetidos de compras que sí recibiste). Si crees que es un error, escríbenos'
                . (Config::get('SOPORTE_CORREO') !== '' ? ' a ' . Config::get('SOPORTE_CORREO') : ' al correo de soporte') . '.',
            default => null,
        };
    }

    /**
     * Borrar la cuenta (derecho de eliminación, LOPDP; Google Play también lo exige). Pide la clave actual.
     * Se borran o anonimizan los datos personales; se CONSERVAN las compras con los datos de factura (el SRI exige
     * guardarlas) y el libro de créditos (sin datos personales). El correo queda libre para registrarse otra vez.
     */
    public static function borrar(int $jugador, string $clave): void
    {
        $j = self::porId($jugador);
        Fallo::si(!$j, 'La cuenta no existe.', 404);
        if (Limite::contar('borrar:' . $jugador, 5)) throw new Fallo('Demasiados intentos. Espera 10 minutos.', 429, ['codigo' => 'limite_intentos']);
        Fallo::si(!password_verify($clave, (string) $j['clave_hash']), 'La clave no es correcta.', 401, ['codigo' => 'clave_incorrecta']);
        Db::tx(function () use ($jugador, $j) {
            $t = Transferencias::abierta($jugador);
            if ($t) Transferencias::cancelar((int) $t['id'], 'jugador (borró su cuenta)', $jugador);
            Mercado::retirarTodas($jugador, 'retirada');
            if (Social::miembro($jugador)) Social::salir($jugador);
            Db::q('DELETE FROM inventario WHERE jugador_id = ?', [$jugador]);
            $s = Monedero::saldo($jugador);   // el saldo se da de baja en el libro (así el libro siempre cuadra)
            if ($s !== 0) Monedero::mover($jugador, -$s, 'cuenta_borrada', 'borrado', true);
            Db::q("UPDATE mercado_retenciones SET estado = 'recuperado', cerrado = ? WHERE jugador_id = ? AND estado = 'retenido'", [time(), $jugador]);
            foreach (['partidas', 'sesiones', 'entregas', 'bonos_vip', 'tarjeta_reclamos', 'asociacion_solicitudes', 'chat_bloqueos', 'chat_reportes' => 'reportante_id', 'chat_mensajes', 'soporte_casos', 'actividad'] as $k => $v) {
                [$tabla, $col] = is_string($k) ? [$k, $v] : [$v, 'jugador_id'];
                Db::q("DELETE FROM $tabla WHERE $col = ?", [$jugador]);
            }
            Db::q('DELETE FROM chat_bloqueos WHERE bloqueado_id = ?', [$jugador]);
            Db::q("UPDATE jugadores SET email = ?, nombre = 'Cuenta borrada', alias = NULL, alias_clave = NULL, clave_hash = '!', estado = 'borrado',
                     estado_motivo = 'Borrada por el jugador', estado_desde = ?, creditos = 0, deuda = 0, vip_hasta = NULL, tarjeta_hasta = NULL, fama_publica = 0, riesgo_motivo = NULL WHERE id = ?",
                ['borrado-' . $jugador . '@invalid', time(), $jugador]);
            Db::q('UPDATE auditoria SET ip = NULL WHERE jugador_id = ?', [$jugador]);
            Auditoria::anotar('jugador', 'cuenta_borrada', 'El jugador borró su cuenta (correo anterior: ' . substr(hash('sha256', (string) $j['email']), 0, 12) . '…). Se conservan sus compras para el SRI.', $jugador);
        });
    }

    /** Marca de riesgo para el Centro de Control (no bloquea nada por sí sola). */
    public static function marcarRiesgo(int $jugador, string $motivo): void
    {
        Db::q('UPDATE jugadores SET riesgo_motivo = ?, riesgo_desde = COALESCE(riesgo_desde, ?) WHERE id = ?', [mb_substr($motivo, 0, 300), time(), $jugador]);
    }

    /** Suspende la cuenta (reembolso / contracargo / decisión del administrador). */
    public static function suspender(int $jugador, string $motivo, string $quien): void
    {
        Db::q("UPDATE jugadores SET estado = 'suspendido', estado_motivo = ?, estado_desde = ? WHERE id = ? AND estado <> 'baneado'", [mb_substr($motivo, 0, 300), time(), $jugador]);
        Mercado::retirarTodas($jugador, 'congelada');
    }

    /** Cambia el estado de la cuenta (Centro de Control). Banear cierra todas sus sesiones. */
    public static function cambiarEstado(int $jugador, string $estado, string $motivo, string $quien): void
    {
        if (!in_array($estado, ['activo', 'suspendido', 'baneado'], true)) throw new Fallo('Estado no válido.', 400);
        Db::tx(function () use ($jugador, $estado, $motivo, $quien) {
            Db::q('UPDATE jugadores SET estado = ?, estado_motivo = ?, estado_desde = ? WHERE id = ?', [$estado, $estado === 'activo' ? null : mb_substr($motivo, 0, 300), time(), $jugador]);
            if ($estado === 'baneado') { Db::q('DELETE FROM sesiones WHERE jugador_id = ?', [$jugador]); Mercado::retirarTodas($jugador, 'congelada'); }
            if ($estado === 'activo') Mercado::descongelarDe($jugador);
            Auditoria::anotar($quien, 'cuenta_' . $estado, 'Cuenta ' . $estado . ($motivo !== '' ? ': ' . $motivo : ''), $jugador);
        });
    }

    /** Crea la cuenta. Devuelve el id o lanza \InvalidArgumentException con el texto para el jugador (código en getCode). */
    public static function registrar(string $email, string $nombre, string $clave): int
    {
        $email = self::normalizarEmail($email);
        $nombre = trim(preg_replace('/\s+/u', ' ', $nombre) ?? '');
        if ($email === '' || strlen($email) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new Fallo('Escribe un correo válido.', 400, ['codigo' => 'email_invalido']);
        if ($nombre === '' || mb_strlen($nombre) > 40) throw new Fallo('Escribe tu nombre (máximo 40 letras).', 400, ['codigo' => 'nombre_invalido']);
        if (strlen($clave) < self::CLAVE_MIN) throw new Fallo('La clave debe tener al menos ' . self::CLAVE_MIN . ' caracteres.', 400, ['codigo' => 'clave_corta']);
        if (strlen($clave) > 200) throw new Fallo('La clave es demasiado larga.', 400, ['codigo' => 'clave_larga']);
        if (self::porEmail($email)) throw new Fallo('Ya existe una cuenta con ese correo. Entra con tu clave.', 409, ['codigo' => 'email_en_uso']);
        try {
            Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id) VALUES (?, ?, ?, ?, ?)', [$email, $nombre, password_hash($clave, PASSWORD_BCRYPT), time(), Social::servidorParaNuevo()]);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE')) throw new Fallo('Ya existe una cuenta con ese correo. Entra con tu clave.', 409, ['codigo' => 'email_en_uso']);
            throw $e;
        }
        return Db::ultimoId();
    }

    /** Revisa correo y clave. Devuelve el id del jugador o null. */
    public static function verificar(string $email, string $clave): ?int
    {
        $j = self::porEmail($email);
        if (!$j) {
            password_verify($clave, '$2y$10$ny2PG/XyzYO0Wr8xoGER2.IFz3eQmURzB7t8gEVz.jNIFI53pYg.K');   // hash de relleno (de nada): tarda lo mismo exista o no la cuenta
            return null;
        }
        if (!password_verify($clave, $j['clave_hash'])) return null;
        if ($j['estado'] === 'baneado') throw new Fallo(self::aviso('baneado'), 403, ['codigo' => 'cuenta_baneada']);
        if (password_needs_rehash($j['clave_hash'], PASSWORD_BCRYPT)) Db::q('UPDATE jugadores SET clave_hash = ? WHERE id = ?', [password_hash($clave, PASSWORD_BCRYPT), $j['id']]);
        return (int) $j['id'];
    }

    /** Lo que va igual con o sin sesión: anuncio del sistema y mantenimiento de la tienda. */
    private static function comun(): array
    {
        return ['anuncio' => Ajustes::anuncio(), 'mantenimiento' => ['activo' => Ajustes::mantenimiento(), 'mensaje' => Ajustes::mantenimiento() ? Ajustes::mensajeMantenimiento() : '']];
    }

    /** El JSON de GET /api/estado (con o sin sesión). */
    public static function estado(?int $jugador): array
    {
        $j = $jugador ? self::porId($jugador) : null;
        $plux = ['disponible' => Plux::configurado(), 'ambiente' => Plux::ambiente()];
        if (!$j) {
            return ['ok' => true, 'logueado' => false, 'jugador' => null, 'creditos' => 0, 'vip_hasta' => null, 'vip_activo' => false, 'vip_bono_hoy' => false,
                    'inicio_comprado' => false, 'entregas' => [], 'tienda' => Catalogo::tienda(), 'plux' => $plux,
                    'inventario' => [], 'mercado' => Mercado::resumen(null), 'servidor' => null, 'asociacion' => null, 'perfil' => null,
                    'tarjeta_hasta' => null, 'tarjeta_activa' => false, 'tarjeta_reclamada_hoy' => false, 'cuenta_estado' => null, 'aviso' => null,
                    'soporte_sin_leer' => 0, 'compras_recientes' => [], 'transferencia' => null, 'creditos_retenidos' => 0] + self::comun();
        }
        $id = (int) $j['id'];
        Mercado::vencer();   // las publicaciones vencidas vuelven a la bodega antes de mostrar el inventario
        Mercado::liberar($id);   // las ventas del mercado que ya cumplieron 7 días pasan al saldo
        $j = self::porId($id);
        $vip = $j['vip_hasta'] !== null ? (int) $j['vip_hasta'] : null;
        return [
            'ok' => true,
            'logueado' => true,
            'jugador' => ['id' => $id, 'email' => $j['email'], 'nombre' => $j['nombre']],
            'creditos' => (int) $j['creditos'] - (int) $j['deuda'],   // negativo si se revirtió una compra ya gastada
            'vip_hasta' => Db::iso($vip),
            'vip_activo' => $vip !== null && $vip > time(),
            'vip_bono_hoy' => Monedero::bonoReclamadoHoy($id),
            'inicio_comprado' => Compras::inicioComprado($id),
            'entregas' => Monedero::entregas($id),
            'tienda' => Catalogo::tienda(),
            'plux' => $plux,
            'inventario' => Inventario::deJugador($id),
            'mercado' => Mercado::resumen($id),
            'servidor' => Social::servidorDe($id),
            'asociacion' => Social::asociacionDe($id),
            'perfil' => Social::perfil($id),
            'tarjeta_hasta' => Db::iso($j['tarjeta_hasta'] !== null ? (int) $j['tarjeta_hasta'] : null),
            'tarjeta_activa' => $j['tarjeta_hasta'] !== null && (int) $j['tarjeta_hasta'] > time(),
            'tarjeta_reclamada_hoy' => Monedero::tarjetaReclamadaHoy($id),
            'cuenta_estado' => $j['estado'],
            'aviso' => self::aviso((string) $j['estado']),
            'soporte_sin_leer' => Soporte::sinLeer($id),
            'compras_recientes' => Compras::recientes($id),
            'transferencia' => Transferencias::resumen($id),
            'creditos_retenidos' => Mercado::retenido($id)[0],
        ] + self::comun();
    }
}
