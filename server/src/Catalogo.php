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
 *   Los de tipo "item" (equipos) NO se entregan como entrega: se crean en el inventario del servidor (con número de serie)
 *   y se pueden vender en el mercado. Los que llevan 'vip' => true solo se canjean con VIP activo.
 *
 * OJO al cambiar un precio: las compras que ya se hicieron guardan su propio valor (no cambian).
 * Los precios, créditos, productos apagados y ofertas por tiempo limitado también se cambian en el Centro de Control
 * (admin.php > Productos): esos cambios se guardan en la base y mandan sobre los valores de este archivo.
 */
final class Catalogo
{
    public const IVA = 0.15;

    public const PRODUCTOS = [
        'creditos_250'  => ['tipo' => 'creditos', 'nombre' => '250 créditos', 'detalle' => 'Paquete de 250 créditos', 'precio' => 1.99, 'creditos' => 250, 'una_vez' => false],
        'creditos_700'  => ['tipo' => 'creditos', 'nombre' => '700 créditos', 'detalle' => '700 créditos (+40 % extra)', 'precio' => 4.99, 'creditos' => 700, 'una_vez' => false],
        'creditos_1500' => ['tipo' => 'creditos', 'nombre' => '1.500 créditos', 'detalle' => '1.500 créditos (+50 % extra)', 'precio' => 9.99, 'creditos' => 1500, 'una_vez' => false],
        'creditos_3200' => ['tipo' => 'creditos', 'nombre' => '3.200 créditos', 'detalle' => '3.200 créditos (+60 % extra)', 'precio' => 19.99, 'creditos' => 3200, 'una_vez' => false],
        'bienvenida'    => ['tipo' => 'bienvenida', 'nombre' => 'Oferta de bienvenida', 'detalle' => 'Una sola vez: 150 créditos, un camarógrafo senior de refuerzo por 3 eventos y 3 cables', 'precio' => 0.99, 'creditos' => 150, 'una_vez' => true],
        'inicio'        => ['tipo' => 'inicio', 'nombre' => 'Paquete de inicio', 'detalle' => 'Una sola vez: cámara profesional, 5 cables, 3 baterías, técnico de streaming nivel 3 y 200 créditos', 'precio' => 2.99, 'creditos' => 200, 'una_vez' => true],
        'tarjeta_mensual' => ['tipo' => 'tarjeta', 'nombre' => 'Tarjeta mensual', 'detalle' => '30 días: reclama 20 créditos cada día (600 en total). No se renueva sola; si compras otra se suman 30 días', 'precio' => 4.99, 'creditos' => 0, 'una_vez' => false, 'dias' => 30, 'creditos_dia' => 20],
        'vip30'         => ['tipo' => 'vip', 'nombre' => 'Pase VIP 30 días', 'detalle' => 'No se renueva solo: bono diario de $150 + 10 créditos, reparaciones 30 % más baratas, 1 oferta extra al día, distintivo VIP', 'precio' => 9.99, 'creditos' => 0, 'una_vez' => false, 'dias' => 30],
        // No sale en la tienda: lo crea POST /api/cuenta/transferir/iniciar (lo paga el dueño actual de la cuenta)
        'transferencia_cuenta' => ['tipo' => 'transferencia', 'nombre' => 'Transferencia oficial de cuenta', 'detalle' => 'Pasa esta cuenta (con todo lo comprado) a otro correo', 'precio' => 9.99, 'creditos' => 0, 'una_vez' => false, 'oculto' => true],
    ];

    /** Lo que trae la oferta de bienvenida (además de sus 150 créditos). */
    public const BIENVENIDA_ENTREGAS = [
        ['tipo' => 'refuerzo', 'item' => 'camarografo', 'cantidad' => 1, 'nivel' => 'senior', 'eventos' => 3],
        ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 3],
    ];

    /** Refuerzos en Google Play: los mismos ids que en la tienda de créditos, vendidos directo a este precio. */
    public const GOOGLE_PRECIO_REFUERZO = 0.99;

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
        // Equipos VIP: se canjean solo con VIP activo; siguen siendo del jugador cuando el VIP vence (el juego los guarda)
        'vip_cam8k'      => ['nombre' => 'Cámara de cine 8K Edición VIP', 'detalle' => 'Cámara de calidad 5 (funciona con VIP activo)', 'creditos' => 800, 'vip' => true, 'entrega' => ['tipo' => 'item', 'item' => 'vip_cam8k', 'cantidad' => 1]],
        'vip_switcher'   => ['nombre' => 'Switcher de estudio VIP', 'detalle' => 'Switcher de calidad 4 (funciona con VIP activo)', 'creditos' => 1000, 'vip' => true, 'entrega' => ['tipo' => 'item', 'item' => 'vip_switcher', 'cantidad' => 1]],
        'vip_satelital'  => ['nombre' => 'Enlace satelital VIP', 'detalle' => 'Internet que nunca se cae, calidad 3 (funciona con VIP activo)', 'creditos' => 700, 'vip' => true, 'entrega' => ['tipo' => 'item', 'item' => 'vip_satelital', 'cantidad' => 1]],
        // Refuerzos (ayudas por tiempo limitado). Los aplica el juego (entrega tipo "refuerzo").
        'refuerzo_camarografo_senior' => ['tipo' => 'refuerzo', 'nombre' => 'Camarógrafo senior de refuerzo', 'detalle' => 'Un camarógrafo con experiencia te acompaña en tus próximos 2 eventos', 'creditos' => 120, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'refuerzo_camarografo_senior', 'cantidad' => 1, 'nivel' => 'senior', 'eventos' => 2]],
        'refuerzo_tecnico_internacional' => ['tipo' => 'refuerzo', 'nombre' => 'Técnico de streaming internacional', 'detalle' => 'Un técnico de nivel internacional cuida tu señal en tus próximos 3 eventos', 'creditos' => 240, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'refuerzo_tecnico_internacional', 'cantidad' => 1, 'nivel' => 'internacional', 'eventos' => 3]],
        'alquiler_lente_box' => ['tipo' => 'refuerzo', 'nombre' => 'Alquiler de lente box 100x', 'detalle' => 'Un lente de estadio de 100x para tu próximo evento', 'creditos' => 120, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'alquiler_lente_box', 'cantidad' => 1, 'eventos' => 1]],
        'seguro_evento' => ['tipo' => 'refuerzo', 'nombre' => 'Seguro de evento', 'detalle' => 'En tu próximo evento, si sacas 2 estrellas o menos te devuelven el 50 % del pago', 'creditos' => 100, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'seguro_evento', 'cantidad' => 1, 'eventos' => 1]],
        'equipo_descansado' => ['tipo' => 'refuerzo', 'nombre' => 'Equipo descansado', 'detalle' => 'Todo tu personal recupera la energía ahora mismo', 'creditos' => 100, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'equipo_descansado', 'cantidad' => 1]],
    ];

    /** Nombre de cada equipo que vive en el inventario del servidor (para el mercado y el panel). */
    public const EQUIPOS = [
        'cam_pro' => 'Cámara profesional', 'generador' => 'Generador diésel', 'dron4k' => 'Dron 4K', 'grua' => 'Cámara en grúa telescópica',
        'unidad_movil' => 'Unidad móvil de transmisión', 'vip_cam8k' => 'Cámara de cine 8K Edición VIP', 'vip_switcher' => 'Switcher de estudio VIP',
        'vip_satelital' => 'Enlace satelital VIP',
    ];

    /** Comisión del mercado: el vendedor recibe floor(precio * (1 - COMISION)); el resto desaparece. */
    public const MERCADO_COMISION = 0.05;

    /**
     * Precio máximo en el mercado por tipo de equipo (auditoría A-01: contra "lavar" créditos vendiendo algo barato muy caro).
     * Regla: 3 veces lo que cuesta canjearlo en la tienda (la cámara del paquete de inicio: 600). Se puede cambiar aquí.
     */
    public const MERCADO_PRECIO_MAX = [
        'cam_pro' => 600, 'generador' => 750, 'dron4k' => 1350, 'grua' => 1950, 'unidad_movil' => 2700,
        'vip_cam8k' => 2400, 'vip_switcher' => 3000, 'vip_satelital' => 2100,
    ];

    /** Días que quedan retenidos los créditos que gana un vendedor antes de poder gastarlos (auditoría A-01). */
    public const MERCADO_DIAS_RETENCION = 7;

    public static function nombreEquipo(string $item): string { return self::EQUIPOS[$item] ?? $item; }
    public static function esEquipo(string $item): bool { return isset(self::EQUIPOS[$item]); }

    /** Bono VIP diario: $150 del juego + 10 créditos. */
    public const VIP_BONO_DINERO = 150;
    public const VIP_BONO_CREDITOS = 10;

    private static ?array $ajustes = null;
    private static ?array $ofertas = null;

    public static function olvidarAjustes(): void { self::$ajustes = null; self::$ofertas = null; }

    /** Cambios del Centro de Control (precio, créditos, activo) guardados en la base. Mandan sobre este archivo. */
    public static function ajustes(): array
    {
        if (self::$ajustes !== null) return self::$ajustes;
        $o = [];
        try { foreach (Db::todas('SELECT * FROM productos_ajustes') as $f) $o[$f['producto']] = $f; } catch (\Throwable) {}
        return self::$ajustes = $o;
    }

    /** Oferta vigente ahora (bono % de créditos) por producto. */
    public static function ofertas(): array
    {
        if (self::$ofertas !== null) return self::$ofertas;
        $o = [];
        try {
            foreach (Db::todas('SELECT * FROM ofertas WHERE activa = 1 AND inicio <= ? AND fin > ? ORDER BY bono_pct DESC, id', [time(), time()]) as $f) $o[$f['producto']] ??= $f;
        } catch (\Throwable) {}
        return self::$ofertas = $o;
    }

    /** Producto con los cambios del Centro de Control y la oferta vigente: precio, creditos (con bono), activo, oferta. */
    public static function producto(string $id): ?array
    {
        $p = self::PRODUCTOS[$id] ?? null;
        if ($p === null) return null;
        $p['id'] = $id;
        $p['precio_base'] = $p['precio'];
        $p['creditos_base'] = $p['creditos'];
        $p['activo'] = true;
        $a = self::ajustes()[$id] ?? null;
        if ($a) {
            if ($a['precio'] !== null) $p['precio'] = round((float) $a['precio'], 2);
            if ($a['creditos'] !== null) $p['creditos'] = (int) $a['creditos'];
            if ($a['activo'] !== null) $p['activo'] = (bool) (int) $a['activo'];
        }
        $p['bono_pct'] = 0;
        $p['oferta'] = null;
        $of = self::ofertas()[$id] ?? null;
        if ($of && (int) $p['creditos'] > 0) {
            $p['bono_pct'] = (int) $of['bono_pct'];
            $p['oferta'] = ['bono_pct' => (int) $of['bono_pct'], 'fin' => Db::iso((int) $of['fin']), 'creditos_extra' => (int) floor($p['creditos'] * $of['bono_pct'] / 100)];
            $p['creditos'] = (int) $p['creditos'] + $p['oferta']['creditos_extra'];
        }
        return $p;
    }

    public static function premium(string $id): ?array { return self::PREMIUM[$id] ?? null; }

    /** Productos que se venden en Google Play: los de la tienda (menos los ocultos) y los refuerzos, con los mismos ids. */
    public static function productoGoogle(string $id): ?array
    {
        $p = self::producto($id);
        if ($p !== null) return empty($p['oculto']) ? $p : null;
        $r = self::PREMIUM[$id] ?? null;
        if ($r === null || ($r['tipo'] ?? '') !== 'refuerzo') return null;
        return ['id' => $id, 'tipo' => 'refuerzo_directo', 'nombre' => $r['nombre'], 'detalle' => $r['detalle'], 'precio' => self::GOOGLE_PRECIO_REFUERZO,
                'precio_base' => self::GOOGLE_PRECIO_REFUERZO, 'creditos' => 0, 'creditos_base' => 0, 'una_vez' => false, 'activo' => true, 'bono_pct' => 0, 'oferta' => null, 'entrega' => $r['entrega']];
    }

    /** Para entregar o revertir una compra ya hecha (web o Google). */
    public static function productoCompra(string $id): ?array { return self::producto($id) ?? self::productoGoogle($id); }

    /** [subtotal, iva] de un precio final con IVA incluido. */
    public static function desglose(float $total): array
    {
        $sub = round($total / (1 + self::IVA), 2);
        return [$sub, round($total - $sub, 2)];
    }

    /** La tienda como la recibe el juego (GET /api/estado). Los productos apagados en el Centro de Control no salen. */
    public static function tienda(): array
    {
        $p = [];
        foreach (array_keys(self::PRODUCTOS) as $id) {
            $x = self::producto($id);
            if (!$x['activo'] || !empty($x['oculto'])) continue;
            $p[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'precio' => $x['precio'], 'creditos' => $x['creditos'], 'una_vez' => $x['una_vez'], 'tipo' => $x['tipo'],
                    'precio_base' => $x['precio_base'], 'creditos_base' => $x['creditos_base'], 'oferta' => $x['oferta']]
                 + (isset($x['dias']) ? ['dias' => $x['dias']] : []) + (isset($x['creditos_dia']) ? ['creditos_dia' => $x['creditos_dia']] : []);
        }
        $m = [];
        foreach (self::PREMIUM as $id => $x) {
            $tipo = $x['tipo'] ?? ($x['entrega']['tipo'] === 'item' ? (!empty($x['vip']) ? 'vip' : 'equipo') : 'consumo');
            $m[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'creditos' => $x['creditos'], 'vip' => !empty($x['vip']), 'tipo' => $tipo, 'entrega' => $x['entrega']];
        }
        return ['productos' => $p, 'premium' => $m];
    }
}
