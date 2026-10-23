<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas del nivel VIP 1–10, regalos de asociación y Mecenas (api.php las llama con UNA línea; ver server/INTEGRAR_VIP.md).
 * Todas con sesión. POST con cabecera X-Envivo: 1 (api.php ya lo revisa; aquí otra vez por si acaso).
 *   GET  /api/vip                     nivel, avance, tabla de ventajas, regalo mensual, cofres por reclamar, ofertas, ajustes
 *   POST /api/vip/regalo/reclamar     {id}
 *   POST /api/vip/mensual             —
 *   GET  /api/mecenas                 ranking de la semana y de siempre del servidor (solo nombres, nunca montos)
 *   POST /api/vip/ajustes             {anonimo?: bool, ocultar_mecenas?: bool}
 * (/api/vip/bono es el bono diario del Pase VIP de 30 días: sigue en api.php, no es de aquí.)
 */
final class VipApi
{
    public const RUTAS = ['/vip', '/vip/regalo/reclamar', '/vip/mensual', '/mecenas', '/vip/ajustes'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    /** Campos que se suman a GET /api/estado: vip_nivel (0..10) y regalos_pendientes (cofres por reclamar). */
    public static function estado(?int $jugador): array
    {
        if (!$jugador) return ['vip_nivel' => 0, 'regalos_pendientes' => 0];
        try {
            return ['vip_nivel' => Vip::nivel($jugador), 'regalos_pendientes' => Regalos::cuantos($jugador)];
        } catch (\Throwable) {
            return ['vip_nivel' => 0, 'regalos_pendientes' => 0];   // nunca rompe /api/estado
        }
    }

    public static function responder(string $ruta, string $metodo, int $jugador): never
    {
        if ($metodo === 'POST' && ($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $get = function () use ($metodo): void { if ($metodo !== 'GET') Http::error(405, 'Usa GET.'); };
        $post = function () use ($metodo, $jugador): array {
            if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
            if (Limite::contar('vip:' . $jugador, 60)) Http::error(429, 'Demasiadas acciones seguidas. Espera un momento.');
            return Http::entrada(16 * 1024);
        };
        switch ($ruta) {
            case '/vip':
                $get();
                Http::json(200, Vip::estado($jugador));
            case '/mecenas':
                $get();
                Http::json(200, Vip::mecenas($jugador));
            case '/vip/regalo/reclamar':
                $in = $post();
                $id = $in['id'] ?? null;
                if (is_string($id) && preg_match('/^[1-9]\d{0,12}$/', $id)) $id = (int) $id;
                if (!is_int($id) || $id <= 0) throw new Fallo('Falta "id".', 400, ['codigo' => 'datos_invalidos']);
                Http::json(200, Regalos::reclamar($jugador, $id));
            case '/vip/mensual':
                $post();
                Http::json(200, Vip::reclamarMensual($jugador));
            case '/vip/ajustes':
                $in = $post();
                Http::json(200, Vip::guardarPreferencias($jugador, $in));
        }
        Http::error(404, 'No encontrado.');
    }
}
