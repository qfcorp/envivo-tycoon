<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Conector del Panel Tukán Central (Protocolo Tukán v1, tukan-central docs/PROTOCOLO.md): /tukan_central.php
 *  - accion=estado: las cifras del juego para la tarjeta del Panel (jugadores, ventas del mes, extra).
 *  - accion=sso:    entra al Centro de Control como el administrador del juego (sin pedir clave ni código: el Panel ya
 *                   pidió los dos pasos) y deja constancia en la auditoría.
 * Usa el mismo ID y secreto que las ventas (TUKAN_CENTRAL_ID / TUKAN_CENTRAL_SECRET, deploy/conectar_central.sh).
 * Sin ID o con un secreto de menos de 32 caracteres el conector está apagado (404), como en todos los programas.
 */
final class ConectorCentral
{
    public const MAX_POR_MINUTO = 30;   // pedidos por IP y minuto (§3.6)

    public static function activo(): bool
    {
        return preg_match('/^[a-z0-9][a-z0-9_-]{1,39}$/', Config::get('TUKAN_CENTRAL_ID')) === 1 && strlen(Config::get('TUKAN_CENTRAL_SECRET')) >= 32;
    }

    public static function b64(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
    public static function unb64(string $s): string|false { return base64_decode(strtr($s, '-_', '+/'), true); }

    /** Firma un payload (lo usan las pruebas y es el ejemplo de referencia del protocolo). */
    public static function firmar(array $p, string $secreto): string
    {
        $a = self::b64(json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return $a . '.' . self::b64(hash_hmac('sha256', $a, $secreto, true));
    }

    /**
     * Valida un token v1 en el orden del protocolo. Devuelve el payload o lanza \RuntimeException con el código
     * (firma, version, tipo, inst, vencido, futuro, invalido, repetido, email).
     */
    public static function validar(string $token, string $accion, ?int $ahora = null): array
    {
        $ahora ??= time();
        $partes = explode('.', $token);
        if (count($partes) !== 2) throw new \RuntimeException('firma');
        [$a, $f] = $partes;
        $esperada = self::b64(hash_hmac('sha256', $a, Config::get('TUKAN_CENTRAL_SECRET'), true));
        if (!hash_equals($esperada, $f)) throw new \RuntimeException('firma');
        $json = self::unb64($a);
        $p = $json === false ? null : json_decode($json, true);
        if (!is_array($p)) throw new \RuntimeException('firma');
        if (($p['v'] ?? null) !== 1) throw new \RuntimeException('version');
        if (($p['tipo'] ?? '') !== $accion) throw new \RuntimeException('tipo');
        if (!hash_equals(Config::get('TUKAN_CENTRAL_ID'), (string) ($p['inst'] ?? ''))) throw new \RuntimeException('inst');
        $iat = $p['iat'] ?? null; $exp = $p['exp'] ?? null;
        if (!is_int($iat) || !is_int($exp) || $exp < $iat || $exp - $iat > 60) throw new \RuntimeException('invalido');
        if ($ahora > $exp + 30) throw new \RuntimeException('vencido');
        if ($iat > $ahora + 30) throw new \RuntimeException('futuro');
        $nonce = (string) ($p['nonce'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/', $nonce)) throw new \RuntimeException('invalido');
        if (!filter_var((string) ($p['email'] ?? ''), FILTER_VALIDATE_EMAIL)) throw new \RuntimeException('email');
        // Un token sirve una sola vez
        Db::q('DELETE FROM tukan_central_nonces WHERE exp < ?', [$ahora - 120]);
        try {
            Db::q('INSERT INTO tukan_central_nonces (nonce, exp) VALUES (?, ?)', [$nonce, $exp]);
        } catch (\PDOException) {
            throw new \RuntimeException('repetido');
        }
        return $p;
    }

    /** Texto para la persona (sso) y para el Panel (estado). */
    public static function mensaje(string $codigo): string
    {
        return match ($codigo) {
            'firma' => 'Firma no válida.',
            'version' => 'Versión del protocolo no válida.',
            'tipo' => 'El enlace no es para esta acción.',
            'inst' => 'El enlace es para otro programa.',
            'vencido' => 'El enlace venció. Vuelve a entrar desde el Panel Tukán.',
            'futuro' => 'El reloj del Panel y el del juego no coinciden.',
            'repetido' => 'Ese enlace ya se usó. Vuelve a entrar desde el Panel Tukán.',
            'email' => 'Correo no válido.',
            default => 'Pedido no válido.',
        };
    }

    /** Commit corto del código (archivo .git/HEAD), o «sin version». */
    public static function version(?string $raiz = null): string
    {
        $raiz ??= dirname(__DIR__, 2);
        $head = @file_get_contents($raiz . '/.git/HEAD');
        if (!is_string($head)) return 'sin version';
        $head = trim($head);
        if (str_starts_with($head, 'ref: ')) {
            $ref = substr($head, 5);
            $h = @file_get_contents($raiz . '/.git/' . $ref);
            if (!is_string($h)) {
                $packed = (string) @file_get_contents($raiz . '/.git/packed-refs');
                $h = preg_match('/^([0-9a-f]{40}) ' . preg_quote($ref, '/') . '$/m', $packed, $m) ? $m[1] : '';
            }
            $head = trim((string) $h);
        }
        return preg_match('/^[0-9a-f]{7,40}$/', $head) ? substr($head, 0, 7) : 'sin version';
    }

    /** Ventas aprobadas (sin las de prueba) entre dos fechas: [cantidad, total sin IVA]. */
    private static function ventas(int $desde, int $hasta): array
    {
        $n = 0; $suma = 0.0;
        foreach (Db::todas("SELECT * FROM compras WHERE estado = 'pagado' AND pagado_en >= ? AND pagado_en < ?", [$desde, $hasta]) as $c) {
            if (class_exists(PanelVentas::class) && PanelVentas::esPrueba($c)) continue;
            $n++; $suma += (float) $c['subtotal'];
        }
        return [$n, round($suma, 2)];
    }

    /** Las cifras para la tarjeta del Panel (protocolo §5). Juego de una sola empresa: negocios = null y «extra». */
    public static function estado(?int $ahora = null): array
    {
        $ahora ??= time();
        $inicioMes = (int) strtotime(date('Y-m-01 00:00:00', $ahora));
        $inicioAnterior = (int) strtotime('-1 month', $inicioMes);
        [$nMes, $mes] = self::ventas($inicioMes, $ahora + 1);
        [, $anterior] = self::ventas($inicioAnterior, $inicioMes);
        $jug = (int) Db::valor('SELECT COUNT(*) FROM jugadores');
        $nuevos = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE creado >= ?', [$ahora - 30 * 86400]);
        $hoy = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE ultimo_ingreso >= ?', [$ahora - 86400]);
        $vip = (int) Db::valor('SELECT COUNT(*) FROM jugadores WHERE vip_hasta > ?', [$ahora]);
        $extra = ['Jugadores' => $jug, 'Jugaron en 24 h' => $hoy, 'VIP activos' => $vip, 'Ventas del mes' => $nMes];
        if (Control::tabla('panel_ventas')) {
            $pend = (int) Db::valor("SELECT COUNT(*) FROM panel_ventas WHERE estado IN ('pendiente', 'error')");
            $rech = (int) Db::valor("SELECT COUNT(*) FROM panel_ventas WHERE estado = 'rechazado'");
            $extra['Ventas por mandar al Panel'] = $pend;
            if ($rech > 0) $extra['Ventas rechazadas por el Panel'] = $rech;
        }
        if (Control::tabla('soporte_casos') && Control::columna('soporte_casos', 'estado')) {
            $extra['Casos de soporte abiertos'] = (int) Db::valor("SELECT COUNT(*) FROM soporte_casos WHERE estado = 'abierto'");
        }
        return [
            'ok' => true,
            'protocolo' => 1,
            'producto' => 'envivo',
            'nombre' => 'EN VIVO Tycoon',
            'version' => self::version(),
            'generado' => date('c', $ahora),
            'negocios' => null,
            'cliente' => 'EN VIVO Tycoon',
            'nuevos_30d' => $nuevos,
            'ingresos_mes' => $mes,
            'ingresos_mes_anterior' => $anterior,
            'pruebas_vencen_7d' => [],
            'pagos_vencidos' => [],
            'extra' => array_slice($extra, 0, 8, true),
        ];
    }
}
