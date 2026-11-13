<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas de "Invita a tu equipo" y "Productores Aliados" (Invitaciones.php, Aliados.php; api.php las llama con UNA línea,
 * después de la revisión de X-Envivo; contrato en server/INTEGRAR_INVITAR.md):
 *   GET  /api/invitar             con sesión: código, enlace, amigos y su avance, metas, quién te invitó, distintivos,
 *                                 el creador que apoyas y (si eres creador) tu código. Revisa etapas y entrega premios.
 *   POST /api/invitar/vincular    {ref, instalacion?} con sesión: une una cuenta NUEVA (hasta 3 días) con quien la invitó.
 *   POST /api/aliados/codigo      {codigo, instalacion?} con sesión: usar un código de creador (lo mismo que "Canjear código").
 *   POST /api/aliados/postular    {nombre, correo, redes, pais?, mensaje?} sin cuenta: postulación desde /aliados.html.
 */
final class InvitarApi
{
    public const RUTAS = ['/invitar', '/invitar/vincular', '/aliados/codigo', '/aliados/postular'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo, ?int $jugador): never
    {
        if ($ruta === '/invitar') {
            if ($metodo !== 'GET') Http::error(405, 'Usa GET.');
            if (!$jugador) Http::error(401, 'Entra a tu cuenta para continuar.', [], 'sesion_requerida');
            header('Cache-Control: private, no-store');
            Http::json(200, Invitaciones::estado($jugador));
        }
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $in = Http::entrada(8 * 1024);
        if ($ruta === '/aliados/postular') Http::json(200, Aliados::postular($in, $jugador ?: null));
        if (!$jugador) Http::error(401, 'Entra a tu cuenta para continuar.', [], 'sesion_requerida');
        if ($ruta === '/invitar/vincular') {
            $ref = is_string($in['ref'] ?? null) ? mb_substr(trim($in['ref']), 0, 40) : '';
            Http::json(200, Invitaciones::vincular($jugador, $ref, $in['instalacion'] ?? null, 'vincular') + ['estado_invitar' => Invitaciones::estado($jugador)]);
        }
        $cod = is_string($in['codigo'] ?? null) ? $in['codigo'] : '';
        Http::json(200, Aliados::canjearCodigo($jugador, $cod, 'juego', $in['instalacion'] ?? null));
    }
}
