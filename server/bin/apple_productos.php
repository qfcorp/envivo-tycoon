<?php
declare(strict_types=1);

// Lista de productos para crear las compras dentro de la app en App Store Connect (app de iPhone, docs/IPHONE_APP_STORE.md).
// Sale del catálogo (server/src/Catalogo.php PRODUCTOS, también las ofertas del VIP, de regreso y de novato), sin lo oculto
// (transferencia_cuenta, o lo de un módulo que no está instalado). Precios: los de ese archivo (no abre la base: los cambios
// del Centro de Control no salen aquí; en App Store Connect se elige el precio de Apple más parecido).
//   id        «envivo.» + id del catálogo (Product ID en App Store Connect; no se puede cambiar después)
//   nombre    nombre visible (Display Name, máximo 30 letras)        detalle   descripción (Description, máximo 45 letras)
//   tipo      NON_CONSUMABLE si es de una sola vez (una_vez), CONSUMABLE el resto
// Uso:   php server/bin/apple_productos.php            (JSON)
//        php server/bin/apple_productos.php --tabla    (tabla para leer)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Apple, Catalogo};

/** Nombre y descripción cortos (los de la tienda son largos para App Store Connect). Un producto nuevo sin fila aquí se acorta solo. */
const CORTOS = [
    'creditos_250' => ['250 créditos', 'Paquete de 250 créditos'],
    'creditos_700' => ['700 créditos', '700 créditos (+40 % extra)'],
    'creditos_1500' => ['1.500 créditos', '1.500 créditos (+50 % extra)'],
    'creditos_3200' => ['3.200 créditos', '3.200 créditos (+60 % extra)'],
    'bienvenida' => ['Oferta de bienvenida', '150 créditos, camarógrafo senior y 3 cables'],
    'inicio' => ['Paquete de inicio', 'Cámara pro, técnico nivel 3 y 200 créditos'],
    'tarjeta_mensual' => ['Tarjeta mensual', '30 días: reclama 20 créditos cada día'],
    'vip30' => ['Pase VIP 30 días', 'Ventajas VIP por 30 días. No se renueva solo'],
    'pase_premium' => ['Pase de Temporada Premium', 'Premio premium en los 40 niveles del pase'],
    'pase_semanal' => ['Mini Pase Semanal', 'Premio premium de hasta 8 niveles esta semana'],
    'pase_premium_plus' => ['Pase de Temporada Premium Plus', 'Pase Premium y 10 niveles ya desbloqueados'],
    'pack_obra_s' => ['Pack de obra S', '10 h de aceleradores de obra y materiales'],
    'pack_obra_m' => ['Pack de obra M', '30 h de aceleradores de obra y materiales'],
    'pack_obra_l' => ['Pack de obra L', '80 h de aceleradores de obra y materiales'],
    'pase_copa' => ['Pase de Copa', '+5 eventos por día en la Copa de esta semana'],
    'equipo_obra_2' => ['Equipo de obra extra', '+1 equipo de obra para siempre en tu sede'],
    'fondo_crecimiento' => ['Fondo de crecimiento', 'Créditos y materiales al subir tu sede'],
    'tarjeta_semanal' => ['Tarjeta semanal', '7 días: 15 créditos y materiales cada día'],
    'oferta_vip_s' => ['Oferta VIP: Primer impulso', '300 créditos, dinero del juego y 5 cables'],
    'oferta_vip_m' => ['Oferta VIP: En ascenso', '900 créditos, dinero del juego y repuestos'],
    'oferta_vip_l' => ['Oferta VIP: Gran producción', '2.000 créditos, dinero del juego y repuestos'],
    'oferta_campeon' => ['Oferta del campeón', '1.000 créditos, dinero del juego y repuestos'],
    'oferta_sede_5' => ['Oferta Sede nivel 5', '800 créditos, dinero del juego y repuestos'],
    'oferta_sede_10' => ['Oferta Sede nivel 10', '1.800 créditos, dinero del juego y repuestos'],
    'regreso_s' => ['Oferta de regreso', '150 créditos, dinero del juego y repuestos'],
    'regreso_m' => ['Oferta de regreso Plus', '900 créditos, dinero del juego y repuestos'],
    'regreso_l' => ['Gran oferta de regreso', '2.000 créditos, dinero del juego y repuestos'],
    'oferta_novato' => ['Oferta de novato', '200 créditos, dinero del juego y repuestos'],
];

/** Acorta a $max letras cortando en una palabra (sin dejar la frase a medias con «:», «,» o «y» al final). */
function acortar(string $t, int $max): string
{
    $t = trim((string) preg_replace('/\s+/u', ' ', $t));
    if (mb_strlen($t) <= $max) return $t;
    $c = mb_substr($t, 0, $max + 1);
    $c = mb_strrpos($c, ' ') !== false ? mb_substr($c, 0, (int) mb_strrpos($c, ' ')) : mb_substr($t, 0, $max);
    return rtrim((string) preg_replace('/\s+(y|e|de|del|con|a|en|o)$/u', '', rtrim($c, ' ,:;.(')), ' ,:;.(');
}

$lista = [];
foreach (array_keys(Catalogo::PRODUCTOS) as $id) {
    $p = Catalogo::productoBase($id);
    if (!$p || !empty($p['oculto'])) continue;
    [$nombre, $detalle] = CORTOS[$id] ?? [$p['nombre'], $p['detalle']];
    if (!isset(CORTOS[$id])) fwrite(STDERR, "AVISO: $id no tiene nombre corto en bin/apple_productos.php (se acortó solo)\n");
    $lista[] = ['id' => Apple::idApple($id), 'nombre' => acortar($nombre, 30), 'detalle' => acortar($detalle, 45),
                'precio_usd' => round((float) $p['precio'], 2), 'tipo' => Apple::tipo($p)];
}

if (in_array('--tabla', $argv, true)) {
    printf("%-30s %-30s %8s  %-15s %s\n", 'Product ID', 'Nombre', 'USD', 'Tipo', 'Descripción');
    foreach ($lista as $x) printf("%-30s %s %8.2f  %-15s %s\n", $x['id'], $x['nombre'] . str_repeat(' ', max(0, 30 - mb_strlen($x['nombre']))), $x['precio_usd'], $x['tipo'], $x['detalle']);
    echo count($lista) . " productos\n";
    exit(0);
}
echo json_encode($lista, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION) . "\n";
