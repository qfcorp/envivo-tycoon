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

    /** Crea la cuenta. Devuelve el id o lanza \InvalidArgumentException con el texto para el jugador (código en getCode). */
    public static function registrar(string $email, string $nombre, string $clave): int
    {
        $email = self::normalizarEmail($email);
        $nombre = trim(preg_replace('/\s+/u', ' ', $nombre) ?? '');
        if ($email === '' || strlen($email) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new \InvalidArgumentException('Escribe un correo válido.', 400);
        if ($nombre === '' || mb_strlen($nombre) > 40) throw new \InvalidArgumentException('Escribe tu nombre (máximo 40 letras).', 400);
        if (strlen($clave) < self::CLAVE_MIN) throw new \InvalidArgumentException('La clave debe tener al menos ' . self::CLAVE_MIN . ' caracteres.', 400);
        if (strlen($clave) > 200) throw new \InvalidArgumentException('La clave es demasiado larga.', 400);
        if (self::porEmail($email)) throw new \InvalidArgumentException('Ya existe una cuenta con ese correo. Entra con tu clave.', 409);
        try {
            Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado) VALUES (?, ?, ?, ?)', [$email, $nombre, password_hash($clave, PASSWORD_BCRYPT), time()]);
        } catch (\PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE')) throw new \InvalidArgumentException('Ya existe una cuenta con ese correo. Entra con tu clave.', 409);
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
        if (password_needs_rehash($j['clave_hash'], PASSWORD_BCRYPT)) Db::q('UPDATE jugadores SET clave_hash = ? WHERE id = ?', [password_hash($clave, PASSWORD_BCRYPT), $j['id']]);
        return (int) $j['id'];
    }

    /** El JSON de GET /api/estado (con o sin sesión). */
    public static function estado(?int $jugador): array
    {
        $j = $jugador ? self::porId($jugador) : null;
        $plux = ['disponible' => Plux::configurado(), 'ambiente' => Plux::ambiente()];
        if (!$j) {
            return ['ok' => true, 'logueado' => false, 'jugador' => null, 'creditos' => 0, 'vip_hasta' => null, 'vip_activo' => false, 'vip_bono_hoy' => false,
                    'inicio_comprado' => false, 'entregas' => [], 'tienda' => Catalogo::tienda(), 'plux' => $plux];
        }
        $id = (int) $j['id'];
        $vip = $j['vip_hasta'] !== null ? (int) $j['vip_hasta'] : null;
        return [
            'ok' => true,
            'logueado' => true,
            'jugador' => ['id' => $id, 'email' => $j['email'], 'nombre' => $j['nombre']],
            'creditos' => (int) $j['creditos'],
            'vip_hasta' => Db::iso($vip),
            'vip_activo' => $vip !== null && $vip > time(),
            'vip_bono_hoy' => Monedero::bonoReclamadoHoy($id),
            'inicio_comprado' => Compras::inicioComprado($id),
            'entregas' => Monedero::entregas($id),
            'tienda' => Catalogo::tienda(),
            'plux' => $plux,
        ];
    }
}
