<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Rutas /api/cuenta/recuperar* (las llama api.php con UNA línea; ver server/INTEGRAR_CORREO.md). Sin sesión.
 * Todas POST con cabecera X-Envivo: 1 (el código del enlace va en el cuerpo, nunca en la dirección).
 *   POST /api/cuenta/recuperar          {email, idioma?}  -> {ok, mensaje, minutos}   (igual exista o no la cuenta)
 *   POST /api/cuenta/recuperar/revisar  {token}           -> {ok, email: "d•••@gmail.com", vence, clave_min} | 410
 *   POST /api/cuenta/recuperar/cambiar  {token, clave}    -> {ok, mensaje} y abre sesión en este navegador | 410 / 400
 */
final class RecuperarApi
{
    public const RUTAS = ['/cuenta/recuperar', '/cuenta/recuperar/revisar', '/cuenta/recuperar/cambiar'];

    public static function esRuta(string $ruta): bool { return in_array($ruta, self::RUTAS, true); }

    public static function responder(string $ruta, string $metodo): never
    {
        if ($metodo !== 'POST') Http::error(405, 'Usa POST.');
        if (($_SERVER['HTTP_X_ENVIVO'] ?? '') !== '1') Http::error(403, 'Petición no permitida.', [], 'cabecera_requerida');
        $in = Http::entrada(10000);
        $txt = fn(string $k): string => is_string($in[$k] ?? null) ? $in[$k] : '';
        switch ($ruta) {
            case '/cuenta/recuperar':
                $idioma = $txt('idioma') !== '' ? $txt('idioma') : CorreoPlantillas::idiomaDeCabecera((string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''));
                Http::json(200, Recuperar::solicitar($txt('email'), $idioma));
            case '/cuenta/recuperar/revisar':
                Http::json(200, Recuperar::revisar($txt('token')));
            case '/cuenta/recuperar/cambiar':
                $id = Recuperar::cambiar($txt('token'), $txt('clave'));
                Sesiones::abrir($id);
                Http::json(200, ['ok' => true, 'mensaje' => 'Listo: tu contraseña cambió. Cerramos tu sesión en los otros dispositivos.']);
        }
        Http::error(404, 'No encontrado.');
    }
}
