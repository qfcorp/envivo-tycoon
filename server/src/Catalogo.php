<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Catálogo de la tienda (se puede editar aquí). Ver server/API.md.
 *
 * PRODUCTOS con dinero real: "precio" es el valor FINAL en dólares con IVA 15 % incluido (es lo que se cobra con
 * Pago Plux). Para la factura se guarda aparte: subtotal = precio / 1,15 (redondeado a 2 decimales) e IVA = el resto.
 *   - tipo "creditos": da "creditos" créditos.
 *   - tipo "inicio":   el paquete de inicio (una sola vez por cuenta): las entregas de INICIO_ENTREGAS + "creditos".
 *   - tipo "vip":      suma "dias" días de VIP (no se renueva solo).
 *
 * PREMIUM (exclusivos que se compran con créditos): "creditos" es lo que cuesta y "entrega" lo que recibe el juego.
 *
 * OJO al cambiar un precio: las compras que ya se hicieron guardan su propio valor (no cambian).
 */
final class Catalogo
{
    public const IVA = 0.15;

    public const PRODUCTOS = [
        'creditos_250'  => ['tipo' => 'creditos', 'nombre' => '250 créditos', 'detalle' => 'Paquete de 250 créditos', 'precio' => 1.99, 'creditos' => 250, 'una_vez' => false],
        'creditos_700'  => ['tipo' => 'creditos', 'nombre' => '700 créditos', 'detalle' => '700 créditos (+40 % extra)', 'precio' => 4.99, 'creditos' => 700, 'una_vez' => false],
        'creditos_1500' => ['tipo' => 'creditos', 'nombre' => '1.500 créditos', 'detalle' => '1.500 créditos (+50 % extra)', 'precio' => 9.99, 'creditos' => 1500, 'una_vez' => false],
        'creditos_3200' => ['tipo' => 'creditos', 'nombre' => '3.200 créditos', 'detalle' => '3.200 créditos (+60 % extra)', 'precio' => 19.99, 'creditos' => 3200, 'una_vez' => false],
        'inicio'        => ['tipo' => 'inicio', 'nombre' => 'Paquete de inicio', 'detalle' => 'Una sola vez: cámara profesional, 5 cables, 3 baterías, técnico de streaming nivel 3 y 200 créditos', 'precio' => 2.99, 'creditos' => 200, 'una_vez' => true],
        'vip30'         => ['tipo' => 'vip', 'nombre' => 'Pase VIP 30 días', 'detalle' => 'No se renueva solo: bono diario de $150 + 10 créditos, reparaciones 30 % más baratas, 1 oferta extra al día, distintivo VIP', 'precio' => 4.99, 'creditos' => 0, 'una_vez' => false, 'dias' => 30],
    ];

    /** Lo que trae el paquete de inicio (además de sus 200 créditos). */
    public const INICIO_ENTREGAS = [
        ['tipo' => 'item', 'item' => 'cam_pro', 'cantidad' => 1],
        ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5],
        ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 3],
        ['tipo' => 'personal', 'item' => 'stream', 'cantidad' => 3],
    ];

    public const PREMIUM = [
        'generador'      => ['nombre' => 'Generador diésel', 'detalle' => 'La luz nunca te deja sin señal', 'creditos' => 250, 'entrega' => ['tipo' => 'item', 'item' => 'generador', 'cantidad' => 1]],
        'kit_reparacion' => ['nombre' => 'Kit de reparación total', 'detalle' => 'Todo tu equipo al 100 %', 'creditos' => 60, 'entrega' => ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        'caja_chica'     => ['nombre' => 'Caja chica', 'detalle' => '$1.000 para tu productora', 'creditos' => 120, 'entrega' => ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1000]],
        'estrella'       => ['nombre' => 'Camarógrafo estrella', 'detalle' => 'Nivel 4, gratis y sin pago inicial', 'creditos' => 300, 'entrega' => ['tipo' => 'personal', 'item' => 'cam', 'cantidad' => 4]],
        'dron4k'         => ['nombre' => 'Dron 4K', 'detalle' => 'Cuenta como cámara de calidad 4', 'creditos' => 450, 'entrega' => ['tipo' => 'item', 'item' => 'dron4k', 'cantidad' => 1]],
        'grua'           => ['nombre' => 'Cámara en grúa telescópica', 'detalle' => 'Cámara de calidad 4', 'creditos' => 650, 'entrega' => ['tipo' => 'item', 'item' => 'grua', 'cantidad' => 1]],
        'unidad_movil'   => ['nombre' => 'Unidad móvil de transmisión', 'detalle' => 'Switcher de calidad 3', 'creditos' => 900, 'entrega' => ['tipo' => 'item', 'item' => 'unidad_movil', 'cantidad' => 1]],
    ];

    /** Bono VIP diario: $150 del juego + 10 créditos. */
    public const VIP_BONO_DINERO = 150;
    public const VIP_BONO_CREDITOS = 10;

    public static function producto(string $id): ?array { return self::PRODUCTOS[$id] ?? null; }
    public static function premium(string $id): ?array { return self::PREMIUM[$id] ?? null; }

    /** [subtotal, iva] de un precio final con IVA incluido. */
    public static function desglose(float $total): array
    {
        $sub = round($total / (1 + self::IVA), 2);
        return [$sub, round($total - $sub, 2)];
    }

    /** La tienda como la recibe el juego (GET /api/estado). */
    public static function tienda(): array
    {
        $p = [];
        foreach (self::PRODUCTOS as $id => $x) {
            $p[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'precio' => $x['precio'], 'creditos' => $x['creditos'], 'una_vez' => $x['una_vez'], 'tipo' => $x['tipo']]
                 + (isset($x['dias']) ? ['dias' => $x['dias']] : []);
        }
        $m = [];
        foreach (self::PREMIUM as $id => $x) {
            $m[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'creditos' => $x['creditos'], 'entrega' => $x['entrega']];
        }
        return ['productos' => $p, 'premium' => $m];
    }
}
