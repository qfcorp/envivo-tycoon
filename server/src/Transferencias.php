<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Transferencia OFICIAL de cuenta (decisión del dueño: opción A). Es la única forma permitida de pasar una cuenta a otra persona.
 * El juego nunca maneja dinero entre jugadores: lo que paguen entre ellos fuera del juego no es asunto del juego (términos).
 *
 * 1. El dueño actual (con sesión) pide la transferencia: POST /api/cuenta/transferir/iniciar {email_nuevo}.
 *    Se crea la transferencia "pendiente_pago" y una compra del producto oculto "transferencia_cuenta" ($9,99).
 *    QUIÉN PAGA: el dueño actual, con el mismo pago con tarjeta (Pago Plux) de siempre. Si el comprador quiere pagarla,
 *    lo arreglan entre ellos: el pago se hace desde la cuenta que se transfiere.
 * 2. Al aprobarse el pago, la transferencia queda "pagada" y se genera un CÓDIGO de 8 caracteres que ve solo el dueño actual
 *    (en /api/estado -> transferencia.codigo). El dueño se lo da al nuevo dueño. (Cuando el juego tenga envío de correos,
 *    este código se mandará al correo nuevo.) El código vence a los 14 días.
 * 3. El nuevo dueño confirma: POST /api/cuenta/transferir/confirmar {email, codigo, clave, nombre?} (sin sesión, desde su celular).
 *    El correo nuevo NO debe tener cuenta en el juego (si la tiene, la transferencia no se puede completar: se cancela y se
 *    pide otra con un correo libre); el nuevo dueño "se registra" con ese correo al poner su clave.
 * 4. Al confirmar: cambia el correo y la clave, se cierran TODAS las sesiones del dueño anterior, se retiran sus publicaciones
 *    del mercado (los equipos vuelven a la bodega), y la cuenta queda 7 días sin poder transferirse otra vez ni vender en el mercado.
 * Todo queda en la auditoría. El Centro de Control ve y puede cancelar las transferencias que no se completaron.
 */
final class Transferencias
{
    public const BLOQUEO_DIAS = 7;
    public const CODIGO_DIAS = 14;
    public const PRODUCTO = 'transferencia_cuenta';

    public static function abierta(int $jugador): ?array
    {
        return Db::fila("SELECT * FROM transferencias WHERE jugador_id = ? AND estado IN ('pendiente_pago', 'pagada') ORDER BY id DESC LIMIT 1", [$jugador]);
    }

    /** Lo que ve el dueño actual en /api/estado. */
    public static function resumen(int $jugador): ?array
    {
        $t = self::abierta($jugador);
        if (!$t) {
            $b = Db::valor('SELECT bloqueo_hasta FROM jugadores WHERE id = ?', [$jugador]);
            return $b !== null && (int) $b > time() ? ['estado' => 'bloqueada', 'bloqueo_hasta' => Db::iso((int) $b)] : null;
        }
        $c = $t['compra_id'] ? Compras::porId((int) $t['compra_id']) : null;
        return ['id' => (int) $t['id'], 'estado' => $t['estado'], 'email_nuevo' => $t['email_nuevo'],
                'url_pago' => $t['estado'] === 'pendiente_pago' && $c ? '/pago.php?o=' . $c['token'] : null,
                'codigo' => $t['estado'] === 'pagada' ? $t['codigo'] : null, 'vence' => Db::iso((int) $t['vence']), 'precio' => (float) Catalogo::PRODUCTOS[self::PRODUCTO]['precio']];
    }

    /** Paso 1: el dueño actual pide la transferencia. Devuelve {transferencia, url} (la página de pago). */
    public static function iniciar(int $jugador, string $emailNuevo): array
    {
        Cuentas::exigirActiva($jugador);
        $email = Cuentas::normalizarEmail($emailNuevo);
        Fallo::si($email === '' || strlen($email) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL), 'Escribe el correo del nuevo dueño.', 400, ['codigo' => 'email_invalido']);
        return Db::tx(function () use ($jugador, $email): array {
            $j = Cuentas::porId($jugador);
            Fallo::si($email === $j['email'], 'Ese es el correo de esta misma cuenta.', 400, ['codigo' => 'mismo_email']);
            Fallo::si($j['bloqueo_hasta'] !== null && (int) $j['bloqueo_hasta'] > time(), 'Esta cuenta se transfirió hace poco. Podrás transferirla otra vez desde el ' . date('d/m/Y H:i', (int) $j['bloqueo_hasta']) . '.', 403, ['codigo' => 'bloqueo_transferencia']);
            Fallo::si((bool) self::abierta($jugador), 'Ya hay una transferencia en curso. Termínala o cancélala primero.', 409, ['codigo' => 'transferencia_en_curso']);
            Fallo::si((bool) Cuentas::porEmail($email), 'Ese correo ya tiene una cuenta en el juego. El nuevo dueño debe usar un correo que no tenga cuenta.', 409, ['codigo' => 'email_en_uso']);
            $t = time();
            Db::q("INSERT INTO transferencias (jugador_id, email_anterior, email_nuevo, estado, creado, vence) VALUES (?, ?, ?, 'pendiente_pago', ?, ?)",
                [$jugador, $j['email'], $email, $t, $t + self::CODIGO_DIAS * 86400]);
            $tid = Db::ultimoId();
            $c = Compras::crear($jugador, self::PRODUCTO, $tid);
            Db::q('UPDATE transferencias SET compra_id = ? WHERE id = ?', [$c['id'], $tid]);
            Auditoria::anotar('jugador', 'transferencia_iniciada', 'Transferencia N° ' . $tid . ' de ' . $j['email'] . ' a ' . $email . ' (compra N° ' . $c['id'] . ')', $jugador, (int) $c['id']);
            return ['transferencia' => self::resumen($jugador), 'url' => '/pago.php?o=' . $c['token']];
        });
    }

    /** Lo llama Compras al aprobarse el pago (dentro de su transacción). */
    public static function pagada(int $tid, int $compra): void
    {
        $t = Db::fila('SELECT * FROM transferencias WHERE id = ?', [$tid]);
        if (!$t || $t['estado'] !== 'pendiente_pago') { Db::aviso('transferencia_pagada_tarde', 'Se pagó la transferencia N° ' . $tid . ' (compra N° ' . $compra . ') pero ya estaba ' . ($t['estado'] ?? 'borrada') . ': revisar y devolver el dinero.', $compra); return; }
        $alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin 0/O ni 1/I para que no se confundan
        $cod = ''; for ($i = 0; $i < 8; $i++) $cod .= $alfabeto[random_int(0, strlen($alfabeto) - 1)];
        Db::q("UPDATE transferencias SET estado = 'pagada', pagada_en = ?, codigo = ?, vence = ? WHERE id = ?", [time(), $cod, time() + self::CODIGO_DIAS * 86400, $tid]);
        Auditoria::anotar('Pago', 'transferencia_pagada', 'Transferencia N° ' . $tid . ' pagada (compra N° ' . $compra . '); código generado', (int) $t['jugador_id'], $compra);
    }

    /** Paso 3: el nuevo dueño confirma con el correo, el código y su clave nueva. Devuelve el id del jugador (cuenta recibida). */
    public static function confirmar(string $email, string $codigo, string $clave, string $nombre): int
    {
        $email = Cuentas::normalizarEmail($email);
        $codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $codigo) ?? '');
        Fallo::si(strlen($clave) < Cuentas::CLAVE_MIN || strlen($clave) > 200, 'La clave debe tener al menos ' . Cuentas::CLAVE_MIN . ' caracteres.', 400, ['codigo' => 'clave_corta']);
        if (Limite::contar('transfer:' . hash('sha256', $email), 5) || Limite::contar('transferip:' . Http::ip(), 20)) throw new Fallo('Demasiados intentos. Espera 10 minutos.', 429, ['codigo' => 'limite_intentos']);
        return Db::tx(function () use ($email, $codigo, $clave, $nombre): int {
            $t = Db::fila("SELECT * FROM transferencias WHERE email_nuevo = ? AND estado = 'pagada' ORDER BY id DESC LIMIT 1", [$email]);
            Fallo::si(!$t || $t['codigo'] === null || !hash_equals((string) $t['codigo'], $codigo), 'El correo o el código no son correctos.', 400, ['codigo' => 'codigo_invalido']);
            Fallo::si((int) $t['vence'] <= time(), 'El código venció. El dueño anterior debe pedir otra transferencia.', 410, ['codigo' => 'codigo_vencido']);
            Fallo::si((bool) Cuentas::porEmail($email), 'Ese correo ya tiene una cuenta en el juego: no se puede completar. Pide al dueño anterior que la cancele y use otro correo.', 409, ['codigo' => 'email_en_uso']);
            $j = (int) $t['jugador_id'];
            $nombre = trim(preg_replace('/\s+/u', ' ', $nombre) ?? '');
            $n = $nombre !== '' && mb_strlen($nombre) <= 40 ? $nombre : null;
            Db::q('UPDATE jugadores SET email = ?, clave_hash = ?, nombre = COALESCE(?, nombre), bloqueo_hasta = ? WHERE id = ?',
                [$email, password_hash($clave, PASSWORD_BCRYPT), $n, time() + self::BLOQUEO_DIAS * 86400, $j]);
            $ses = Sesiones::revocarTodas($j);
            $pubs = Mercado::retirarTodas($j, 'retirada');
            Db::q('DELETE FROM chat_bloqueos WHERE jugador_id = ?', [$j]);
            Db::q("UPDATE transferencias SET estado = 'completada', completada_en = ?, codigo = NULL WHERE id = ?", [time(), $t['id']]);
            Auditoria::anotar('jugador', 'transferencia_completada', 'Transferencia N° ' . $t['id'] . ': la cuenta pasó de ' . $t['email_anterior'] . ' a ' . $email . " ($ses sesiones cerradas, $pubs publicaciones retiradas, bloqueo de " . self::BLOQUEO_DIAS . ' días)', $j);
            return $j;
        });
    }

    /** El dueño (antes de completar) o el administrador cancela. */
    public static function cancelar(int $tid, string $quien, ?int $jugador = null): void
    {
        Db::tx(function () use ($tid, $quien, $jugador) {
            $t = Db::fila('SELECT * FROM transferencias WHERE id = ?', [$tid]);
            Fallo::si(!$t || ($jugador !== null && (int) $t['jugador_id'] !== $jugador), 'Esa transferencia no existe.', 404);
            Fallo::si(!in_array($t['estado'], ['pendiente_pago', 'pagada'], true), 'Esa transferencia ya está ' . $t['estado'] . '.', 409, ['codigo' => 'transferencia_cerrada']);
            Db::q("UPDATE transferencias SET estado = 'cancelada', cancelada_en = ?, cancelada_por = ?, codigo = NULL WHERE id = ?", [time(), mb_substr($quien, 0, 80), $tid]);
            if ($t['compra_id']) Db::q("UPDATE compras SET estado = 'rechazado', plux_paso = 'cancelado' WHERE id = ? AND estado = 'pendiente'", [$t['compra_id']]);
            if ($t['estado'] === 'pagada') Db::aviso('transferencia_cancelada_pagada', 'Se canceló la transferencia N° ' . $tid . ' que ya estaba pagada (compra N° ' . $t['compra_id'] . '): decidir si se devuelve el dinero.', (int) $t['compra_id']);
            Auditoria::anotar($quien, 'transferencia_cancelada', 'Transferencia N° ' . $tid . ' (' . $t['email_anterior'] . ' -> ' . $t['email_nuevo'] . ', estaba ' . $t['estado'] . ')', (int) $t['jugador_id'], $t['compra_id'] ? (int) $t['compra_id'] : null);
        });
    }
}
