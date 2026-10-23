<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Recuperar la contraseña por correo (server/INTEGRAR_CORREO.md):
 *  1. solicitar(email): SIEMPRE la misma respuesta, exista o no la cuenta (nadie puede averiguar qué correos están
 *     registrados). Si la cuenta existe (activa o suspendida) se manda un enlace de un solo uso que vence en 30 minutos.
 *     El correo sale DESPUÉS de responder (Correo::despues), así la respuesta tarda lo mismo en los dos casos.
 *  2. El enlace es https://juego.tukanec.com/recuperar.html#t=<código>&l=<idioma>: el código va después del "#" (no
 *     llega a los registros de nginx ni a otros sitios). En la base se guarda SOLO su sha256.
 *  3. cambiar(código, clave): pone la clave nueva, gasta el enlace (y los demás de esa cuenta), CIERRA TODAS las sesiones
 *     y avisa por correo que la clave cambió. api deja abierta una sesión nueva solo en este navegador.
 * Límites: 3 pedidos por correo y 20 por conexión cada hora; 30 intentos de cambio por conexión cada 10 minutos.
 */
final class Recuperar
{
    public const MINUTOS = 30;
    public const MAX_POR_CORREO = 3;     // por hora
    public const MAX_POR_IP = 20;        // por hora (en Ecuador muchos celulares comparten la IP de la operadora)
    public const MAX_CAMBIOS_IP = 30;    // cada 10 minutos

    public static function mensaje(): string
    {
        return 'Si ese correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Revisa tu bandeja de entrada y la carpeta de spam. El enlace vence en ' . self::MINUTOS . ' minutos.';
    }

    /** @return array{ok:true, mensaje:string, minutos:int} */
    public static function solicitar(string $email, string $idioma): array
    {
        $email = Cuentas::normalizarEmail($email);
        if ($email === '' || strlen($email) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new Fallo('Escribe un correo válido.', 400, ['codigo' => 'email_invalido']);
        if (Limite::contar('recuperarip:' . Http::ip(), self::MAX_POR_IP, 60)) throw new Fallo('Demasiados intentos. Espera unos minutos e intenta de nuevo.', 429, ['codigo' => 'limite_intentos']);
        // Cuenta por correo exista o no la cuenta (el aviso es el mismo para todos: no revela nada)
        if (Limite::contar('recuperar:' . hash('sha256', $email), self::MAX_POR_CORREO, 60))
            throw new Fallo('Ya te enviamos varios enlaces a ese correo. Revisa tu bandeja de entrada y el spam, o espera una hora para pedir otro.', 429, ['codigo' => 'recuperar_limite']);
        $idioma = CorreoPlantillas::idioma($idioma);
        $j = Cuentas::porEmail($email);
        if ($j && in_array((string) $j['estado'], ['activo', 'suspendido'], true)) {
            $tok = bin2hex(random_bytes(32));
            $t = time();
            Db::q('INSERT INTO recuperaciones (token_hash, jugador_id, creado, expira, ip, idioma) VALUES (?, ?, ?, ?, ?, ?)',
                [hash('sha256', $tok), (int) $j['id'], $t, $t + self::MINUTOS * 60, Http::ip() ?: null, $idioma]);
            if (random_int(1, 20) === 1) Db::q('DELETE FROM recuperaciones WHERE expira < ?', [$t - 7 * 86400]);
            $enlace = self::enlace($tok, $idioma);
            $para = (string) $j['email'];
            $nombre = (string) $j['nombre'];
            $id = (int) $j['id'];
            Correo::despues(function () use ($para, $nombre, $enlace, $idioma, $id): void {
                $c = CorreoPlantillas::armar('recuperar', $idioma, ['nombre' => $nombre, 'enlace' => $enlace, 'min' => self::MINUTOS]);
                $ok = Correo::enviar($para, $c['asunto'], $c['html'], $c['texto']);
                try { Auditoria::anotar('sistema', 'recuperar_pedido', $ok ? 'Se envió el enlace para recuperar la contraseña (' . Correo::modo() . ').' : 'NO salió el correo para recuperar la contraseña: ' . Correo::$ultimoError, $id); } catch (\Throwable) {}
            });
        }
        return ['ok' => true, 'mensaje' => self::mensaje(), 'minutos' => self::MINUTOS];
    }

    public static function enlace(string $tok, string $idioma): string
    {
        return Http::urlBase() . '/recuperar.html#t=' . $tok . ($idioma !== 'es' ? '&l=' . rawurlencode($idioma) : '');
    }

    /** La fila del enlace si sirve todavía (sin gastarlo), o null. */
    private static function vigente(string $tok): ?array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $tok)) return null;
        $r = Db::fila('SELECT r.*, j.email, j.nombre, j.estado FROM recuperaciones r JOIN jugadores j ON j.id = r.jugador_id WHERE r.token_hash = ?', [hash('sha256', $tok)]);
        if (!$r || $r['usado'] !== null || (int) $r['expira'] < time() || !in_array((string) $r['estado'], ['activo', 'suspendido'], true)) return null;
        return $r;
    }

    private static function limiteCambio(): void
    {
        if (Limite::contar('recuperarcambio:' . Http::ip(), self::MAX_CAMBIOS_IP, 10)) throw new Fallo('Demasiados intentos. Espera unos minutos e intenta de nuevo.', 429, ['codigo' => 'limite_intentos']);
    }

    private static function invalido(): Fallo
    {
        return new Fallo('Este enlace ya no sirve: venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».', 410, ['codigo' => 'recuperar_enlace_invalido']);
    }

    /** Para la página: ¿sirve el enlace? Muestra el correo tapado (d•••@gmail.com) para que el jugador sepa qué cuenta es. */
    public static function revisar(string $tok): array
    {
        self::limiteCambio();
        $r = self::vigente($tok);
        if (!$r) throw self::invalido();
        return ['ok' => true, 'email' => self::tapar((string) $r['email']), 'vence' => Db::iso((int) $r['expira']), 'clave_min' => Cuentas::CLAVE_MIN];
    }

    public static function tapar(string $email): string
    {
        [$u, $d] = array_pad(explode('@', $email, 2), 2, '');
        return mb_substr($u, 0, 1) . '•••@' . $d;
    }

    /** Pone la clave nueva. Devuelve el id del jugador (api.php abre una sesión nueva en este navegador). */
    public static function cambiar(string $tok, string $clave): int
    {
        self::limiteCambio();
        $r = self::vigente($tok);
        if (!$r) throw self::invalido();
        if (strlen($clave) < Cuentas::CLAVE_MIN) throw new Fallo('La clave debe tener al menos ' . Cuentas::CLAVE_MIN . ' caracteres.', 400, ['codigo' => 'clave_corta', 'min' => Cuentas::CLAVE_MIN]);
        if (strlen($clave) > 200) throw new Fallo('La clave es demasiado larga.', 400, ['codigo' => 'clave_larga']);
        $id = (int) $r['jugador_id'];
        $hash = password_hash($clave, PASSWORD_BCRYPT);
        Db::tx(function () use ($tok, $id, $hash): void {
            // Gastar el enlace primero y de forma atómica: si llegan dos cambios a la vez, solo uno pasa
            $n = Db::q('UPDATE recuperaciones SET usado = ? WHERE token_hash = ? AND usado IS NULL AND expira >= ?', [time(), hash('sha256', $tok), time()])->rowCount();
            if ($n !== 1) throw self::invalido();
            Db::q("UPDATE jugadores SET clave_hash = ? WHERE id = ? AND estado IN ('activo', 'suspendido')", [$hash, $id]);
            Db::q('UPDATE recuperaciones SET usado = ? WHERE jugador_id = ? AND usado IS NULL', [time(), $id]);   // los otros enlaces pedidos ya no sirven
            Sesiones::revocarTodas($id);
            Auditoria::anotar('jugador', 'clave_recuperada', 'El jugador cambió su contraseña con el enlace del correo; se cerraron todas sus sesiones.', $id);
        });
        // Las claves equivocadas de antes ya no lo dejan esperando 10 minutos para entrar
        try { Db::q('DELETE FROM intentos WHERE clave = ?', ['entrar:' . hash('sha256', Cuentas::normalizarEmail((string) $r['email']))]); } catch (\Throwable) {}
        $para = (string) $r['email'];
        $nombre = (string) $r['nombre'];
        $idioma = CorreoPlantillas::idioma((string) ($r['idioma'] ?? 'es'));
        Correo::despues(function () use ($para, $nombre, $idioma): void {
            $c = CorreoPlantillas::armar('clave_cambiada', $idioma, ['nombre' => $nombre, 'fecha' => date('Y-m-d H:i') . ' (' . Config::zona() . ')']);
            Correo::enviar($para, $c['asunto'], $c['html'], $c['texto']);
        });
        return $id;
    }
}
