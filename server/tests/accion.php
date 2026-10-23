<?php
declare(strict_types=1);

// SOLO PRUEBAS (server/tests/): hace una acción del Centro de Control llamando a los MISMOS métodos del servidor que usa
// /control/ (la interfaz de /control/ la prueba pruebas_control.php). Lo usan pruebas.php, pruebas_mercado_social.php y
// pruebas_tienda_cuenta.php desde que /admin.php redirige a /control/.
// Uso:  ENVIVO_CONFIG=<config de prueba> php server/tests/accion.php <accion> '<json con los argumentos>'
// Responde una línea JSON: {"ok":true,"r":...} o {"ok":false,"http":409,"codigo":"...","error":"..."}

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Ajustes, Catalogo, Chat, Compras, Cuentas, Db, Fallo, Mercado, Monedero, Sesiones, Soporte, Transferencias};

$accion = (string) ($argv[1] ?? '');
$a = json_decode((string) ($argv[2] ?? '{}'), true) ?: [];
$q = (string) ($a['quien'] ?? 'control:prueba');
$i = fn(string $k) => (int) ($a[$k] ?? 0);
$s = fn(string $k) => (string) ($a[$k] ?? '');

try {
    Db::pdo();
    $r = match ($accion) {
        'creditos' => Monedero::ajusteManual($i('jugador'), $i('cambio'), $s('motivo'), $q),
        'revertir' => (function () use ($i, $s, $q) {
            Fallo::si(trim($s('motivo')) === '', 'Escribe el motivo.', 400, ['codigo' => 'motivo_invalido']);
            $c = Compras::porId($i('compra'));
            Fallo::si(!$c, 'Esa compra no existe.', 404);
            Fallo::si($c['estado'] === 'revertido', 'Esa compra ya fue revertida.', 409, ['codigo' => 'ya_revertida']);
            $x = Compras::revertir($i('compra'), $s('tipo'), $s('motivo'), $q);
            Fallo::si($x === null, 'Solo se puede revertir una compra pagada.', 409, ['codigo' => 'no_pagada']);
            return $x;
        })(),
        'cuenta_estado' => Cuentas::cambiarEstado($i('jugador'), $s('estado'), $s('motivo'), $q),
        'cerrar_sesiones' => Sesiones::revocarTodas($i('jugador')),
        'transferencia_cancelar' => Transferencias::cancelar($i('transferencia'), $q),
        'producto_guardar' => Catalogo::guardarAjuste($s('producto'), (float) $s('precio'), $i('creditos'), !empty($a['activo']), $q),
        'producto_restaurar' => Catalogo::restaurarAjuste($s('producto'), $q),
        'oferta_crear' => Catalogo::crearOferta($s('producto'), $i('bono_pct'), (int) ($a['inicio'] ?? time()), $i('fin'), $q),
        'oferta_terminar' => Catalogo::terminarOferta($i('oferta'), $q),
        'ajustes' => Ajustes::guardar((array) ($a['valores'] ?? []), $q, $s('accion') ?: 'ajustes'),
        'mercado' => Mercado::moderar($i('publicacion'), $s('que'), $q),
        'chat_mensaje' => Chat::moderarMensaje($i('mensaje'), $s('que'), $q),
        'chat_sancion' => Chat::sancionar($i('jugador'), $s('tipo'), isset($a['segundos']) ? (int) $a['segundos'] : null, $s('motivo') ?: 'Incumplir las reglas del chat', $q),
        'chat_levantar' => Chat::levantar($i('jugador'), $q),
        'palabra' => Chat::palabra($s('palabra'), !empty($a['agregar']), $q),
        'soporte_responder' => Soporte::responderSoporte($i('caso'), Soporte::plantilla($s('texto'), $i('caso')), $q, !empty($a['cerrar'])),
        'soporte_estado' => Soporte::cambiarEstado($i('caso'), $s('estado'), $q),
        'respuesta_guardar' => Soporte::guardarRespuesta(isset($a['id']) ? (int) $a['id'] : null, $s('titulo'), $s('texto'), $q),
        'respuesta_borrar' => Soporte::borrarRespuesta($i('id'), $q),
        default => throw new Fallo('Acción de prueba desconocida: ' . $accion, 400, ['codigo' => 'accion_desconocida']),
    };
    echo json_encode(['ok' => true, 'r' => $r], JSON_UNESCAPED_UNICODE), "\n";
} catch (Fallo $e) {
    echo json_encode(['ok' => false, 'http' => $e->getCode(), 'codigo' => $e->extra['codigo'] ?? null, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE), "\n";
} catch (\Throwable $e) {
    echo json_encode(['ok' => false, 'http' => 500, 'codigo' => 'excepcion', 'error' => get_class($e) . ': ' . $e->getMessage()], JSON_UNESCAPED_UNICODE), "\n";
}
