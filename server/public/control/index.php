<?php
declare(strict_types=1);

// Centro de Control de EN VIVO Tycoon: /control/ (reemplaza a /admin.php). Usuario y clave: los mismos del panel
// (ENVIVO_ADMIN_USUARIO y ENVIVO_ADMIN_CLAVE_HASH en /etc/envivo/config.env) y, si está ENVIVO_ADMIN_TOTP, el código de
// 6 dígitos de la app de autenticación (segundo factor). ENVIVO_CONTROL_IPS (opcional): solo esas IPs ven el panel.
//  - Entrada con formulario y galleta de sesión propia (envivo_control: HttpOnly, SameSite=Strict, Secure con https,
//    solo para /control/), bloqueo tras varios intentos fallidos, código CSRF en TODO formulario y auditoría de cada cambio
//    (tabla auditoria, con quien = "control:<usuario>").
//  - Pestañas: ?t=resumen|jugadores|compras|productos|mercado|chat|soporte|ajustes. Las acciones van por POST a /control/
//    y vuelven con una redirección (POST -> 303 -> GET) a la página donde estaba el administrador.
//  - Lee y escribe SOLO con las clases y tablas del servidor (Control.php encima de Compras, Cuentas, Catalogo, Ajustes,
//    Auditoria, Mercado, Chat, Soporte, Transferencias, Google). Integración: docs/INTEGRAR_CONTROL.md

const ENVIVO_CONTROL = true;
require dirname(__DIR__, 2) . '/src/arranque.php';
require __DIR__ . '/lib/base.php';
foreach (['resumen', 'jugadores', 'compras', 'productos', 'mercado', 'chat', 'soporte', 'ajustes', 'servidores', 'push'] as $f) require __DIR__ . '/lib/' . $f . '.php';

use EnVivo\{Auditoria, Config, Control, Db, Fallo, Http, Limite};

try {
    // Lista de IPs (antes que nada: desde otra IP el panel "no existe")
    if (!Control::ipPermitida(Http::ip())) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        echo "404\n";
        exit;
    }
    Db::pdo();
    Control::preparar();
    if (Config::get('ENVIVO_ADMIN_USUARIO') === '' || Config::get('ENVIVO_ADMIN_CLAVE_HASH') === '') {
        cc_pagina_simple(503, 'Centro de Control sin configurar', 'Falta ENVIVO_ADMIN_USUARIO o ENVIVO_ADMIN_CLAVE_HASH en /etc/envivo/config.env.');
    }
    if (Config::get('ENVIVO_ADMIN_TOTP') !== '' && Control::base32(Control::totpSecreto()) === '') {
        cc_pagina_simple(503, 'Centro de Control mal configurado', 'ENVIVO_ADMIN_TOTP no es un secreto base32 válido. Créalo con: php server/bin/control_totp.php');
    }
    $metodo = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($metodo, ['GET', 'POST'], true)) { http_response_code(405); exit; }

    if (!cc_sesion()) {
        if ($metodo === 'POST' && cc_post('accion') === 'entrar') cc_entrar();
        if ($metodo === 'POST') cc_redirigir(CC_RUTA);   // sesión vencida: vuelve a la entrada
        cc_formulario_entrada();
    }

    if ($metodo === 'POST') cc_post_accion();

    $t = cc_get('t') ?: 'resumen';
    if (!isset(CC_PESTANAS[$t])) $t = 'resumen';
    if ($t === 'compras' && cc_get('csv') === '1') cc_compras_csv();
    $cuerpo = match ($t) {
        'resumen' => cc_t_resumen(),
        'jugadores' => cc_t_jugadores(),
        'compras' => cc_t_compras(),
        'productos' => cc_t_productos(),
        'mercado' => cc_t_mercado(),
        'chat' => cc_t_chat(),
        'soporte' => cc_t_soporte(),
        'ajustes' => cc_t_ajustes(),
        'servidores' => cc_t_servidores(),
        'push' => cc_t_push(),
    };
    cc_pagina(CC_PESTANAS[$t], $t, $cuerpo);
} catch (\Throwable $e) {
    error_log('EN VIVO control: ' . get_class($e) . ' ' . basename($e->getFile()) . ':' . $e->getLine() . ' ' . mb_substr($e->getMessage(), 0, 300));
    if (!headers_sent()) {
        http_response_code(500);
        Http::cabecerasPagina();
    }
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Error</title>'
       . '<link rel="stylesheet" href="' . CC_RUTA . 'assets/control.css?v=2"><main class="contenido"><section class="panel"><h1>Error en el Centro de Control</h1>'
       . '<p>Ocurrió un error. Revisa el registro de PHP.</p><p><a class="btn" href="' . CC_RUTA . '">Volver</a></p></section></main>';
    exit;
}

// ---------------------------------------------------------------------------------------------- entrada
function cc_formulario_entrada(string $error = '', int $http = 200): never
{
    $pre = $_COOKIE[CC_GALLETA_PRE] ?? '';
    if (!is_string($pre) || !preg_match('/^[a-f0-9]{64}$/', $pre)) {
        $pre = bin2hex(random_bytes(32));
        cc_galleta(CC_GALLETA_PRE, $pre, time() + 3600);
    }
    $bloq = cc_bloqueado();
    $totp = Control::totpSecreto() !== '';
    $h = '<section class="panel entrada"><h1>Entrar</h1>';
    if ($bloq) { $error = ($http === 401 ? $error . ' ' : '') . 'Demasiados intentos fallidos: el acceso queda bloqueado ' . CC_MINUTOS_BLOQUEO . ' minutos.'; $http = 429; }
    if ($error !== '') $h .= '<div class="aviso aviso-error" id="error-entrada" role="alert">' . e($error) . '</div>';
    $h .= '<form method="post" action="' . CC_RUTA . '" class="form" id="form-entrar"><input type="hidden" name="accion" value="entrar">'
        . '<input type="hidden" name="csrf" value="' . e($pre) . '">'
        . '<label>Usuario<input name="usuario" autocomplete="username" required maxlength="80" autocapitalize="off" spellcheck="false"></label>'
        . '<label>Clave<input type="password" name="clave" autocomplete="current-password" required maxlength="200"></label>'
        . ($totp ? '<label>Código de la app de autenticación<input name="codigo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6 dígitos"></label>' : '')
        . '<button class="btn btn-grande" type="submit"' . ($bloq ? ' disabled' : '') . '>Entrar</button></form>'
        . '<p class="tenue">Después de ' . CC_INTENTOS_IP . ' intentos equivocados el acceso se bloquea ' . CC_MINUTOS_BLOQUEO . ' minutos. Cada entrada queda en la auditoría.'
        . ($totp ? '' : ' <b>Recomendado:</b> activa el segundo factor (ENVIVO_ADMIN_TOTP).') . '</p></section>';
    cc_pagina('Entrar', '', $h, $http);
}

function cc_entrar(): never
{
    $pre = $_COOKIE[CC_GALLETA_PRE] ?? '';
    if (!cc_mismo_origen() || !is_string($pre) || $pre === '' || !hash_equals($pre, cc_post('csrf'))) {
        cc_formulario_entrada('La página de entrada venció. Escribe tus datos otra vez.', 403);
    }
    if (cc_bloqueado()) cc_formulario_entrada('', 429);
    $u = mb_substr(cc_post('usuario'), 0, 80);
    $c = substr(cc_post('clave'), 0, 200);
    $usuOk = hash_equals(Config::get('ENVIVO_ADMIN_USUARIO'), $u);
    $claveOk = password_verify($c, Config::get('ENVIVO_ADMIN_CLAVE_HASH'));   // siempre se verifica (mismo tiempo con usuario malo)
    $secreto = Control::totpSecreto();
    $codigoOk = $secreto === '' || ($usuOk && $claveOk && Control::totpVerificar($secreto, cc_post('codigo')));
    if (!$usuOk || !$claveOk || !$codigoOk) {
        Limite::sumar('control:ip:' . Http::ip());
        Limite::sumar('control:todos');
        Auditoria::anotar(Control::quien($u === '' ? '?' : $u), 'control_entrar_fallido', ($usuOk && $claveOk ? 'Código de autenticación equivocado' : 'Usuario o clave equivocados') . ' · ' . Http::navegador());
        cc_formulario_entrada($usuOk && $claveOk ? 'El código de la app de autenticación no es válido (o ya se usó).' : 'Usuario o clave incorrectos.', 401);
    }
    cc_abrir_sesion($u);
    Auditoria::anotar(Control::quien($u), 'control_entrar', ($secreto !== '' ? 'Con segundo factor · ' : 'Sin segundo factor · ') . Http::navegador());
    cc_redirigir(CC_RUTA);
}

// ---------------------------------------------------------------------------------------------- acciones (POST)
function cc_post_accion(): never
{
    $volver = cc_volver();
    if (!cc_mismo_origen() || !hash_equals(cc_csrf(), cc_post('csrf'))) {
        Auditoria::anotar(cc_quien(), 'control_csrf_rechazado', 'Acción ' . mb_substr(cc_post('accion'), 0, 40) . ' · origen ' . mb_substr((string) ($_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '-'), 0, 120));
        cc_pagina_simple(403, 'Petición no permitida', 'El formulario no tiene un código válido (o viene de otro sitio). Recarga la página e intenta otra vez.');
    }
    $accion = cc_post('accion');
    $q = cc_quien();
    try {
        $msg = match (true) {
            $accion === 'salir' => cc_salir(),
            str_starts_with($accion, 'jugador_'), str_starts_with($accion, 'transferencia_') => cc_a_jugadores($accion, $q),
            str_starts_with($accion, 'compra_') => cc_a_compras($accion, $q),
            str_starts_with($accion, 'producto_'), str_starts_with($accion, 'oferta_') => cc_a_productos($accion, $q),
            str_starts_with($accion, 'mercado_') => cc_a_mercado($accion, $q),
            str_starts_with($accion, 'chat_'), str_starts_with($accion, 'palabra_') => cc_a_chat($accion, $q),
            str_starts_with($accion, 'soporte_'), str_starts_with($accion, 'rapida_') => cc_a_soporte($accion, $q),
            str_starts_with($accion, 'ajustes_') => cc_a_ajustes($accion, $q),
            str_starts_with($accion, 'servidores_') => cc_a_servidores($accion, $q),
            str_starts_with($accion, 'push_') => cc_a_push($accion, $q),
            default => throw new Fallo('Acción desconocida.', 400),
        };
        cc_avisar('ok', $msg);
    } catch (Fallo $e) {
        cc_avisar('error', $e->getMessage());
    } catch (\RuntimeException $e) {
        cc_avisar('error', 'No se pudo: ' . $e->getMessage());
    }
    cc_redirigir($volver);
}

function cc_salir(): never
{
    Auditoria::anotar(cc_quien(), 'control_salir', 'Cerró la sesión del Centro de Control');
    cc_cerrar_sesion();
    cc_redirigir(CC_RUTA);
}
