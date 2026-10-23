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
        // ---- Módulos de monetización (server/MONETIZACION.md §4). "modulo" = clase que lo entrega (por su gancho compra_aprobada):
        //      mientras esa clase no esté instalada, el producto queda apagado y oculto (no se vende ni en la web ni en Google Play).
        //      Google Play usa los MISMOS ids. El contenido es fijo y a la vista (sin cajas sorpresa).
        // Pase de Temporada (server/INTEGRAR_PASE.md §1): no sale en la lista general de la tienda (tiene su pantalla)
        'pase_premium'      => ['tipo' => 'pase', 'modulo' => 'Pase', 'nombre' => 'Pase de Temporada Premium', 'detalle' => 'Esta temporada: premio premium en los 40 niveles (materiales, aceleradores de obra, marco de productora, adorno de sede, título de chat, hasta 420 créditos y un contrato de personal estrella). Si ya avanzaste, reclamas los premios de los niveles que ya tienes. No se renueva solo', 'precio' => 4.99, 'creditos' => 0, 'una_vez' => false],
        'pase_premium_plus' => ['tipo' => 'pase', 'modulo' => 'Pase', 'nombre' => 'Pase de Temporada Premium Plus', 'detalle' => 'Todo el Pase Premium de esta temporada y 10 niveles ya desbloqueados. No se renueva solo', 'precio' => 9.99, 'creditos' => 0, 'una_vez' => false],
        // Sede oficial (server/INTEGRAR_SEDE_OFICIAL.md): contenido FIJO, lo entrega SedeOficial (gancho compra_aprobada). Igual a SedeOficial::PACKS.
        'pack_obra_s' => ['tipo' => 'pack_obra', 'modulo' => 'SedeOficial', 'nombre' => 'Pack de obra S', 'detalle' => 'Sede oficial: 10 h de aceleradores de obra + 12 cables, 12 placas, 12 paneles LED, 12 credenciales, 12 planos y 1 chip 4K. Contenido fijo.', 'precio' => 1.99, 'creditos' => 0, 'una_vez' => false],
        'pack_obra_m' => ['tipo' => 'pack_obra', 'modulo' => 'SedeOficial', 'nombre' => 'Pack de obra M', 'detalle' => 'Sede oficial: 30 h de aceleradores de obra + 32 cables, 32 placas, 32 paneles LED, 32 credenciales, 32 planos y 3 chips 4K. Contenido fijo.', 'precio' => 4.99, 'creditos' => 0, 'una_vez' => false],
        'pack_obra_l' => ['tipo' => 'pack_obra', 'modulo' => 'SedeOficial', 'nombre' => 'Pack de obra L', 'detalle' => 'Sede oficial: 80 h de aceleradores de obra + 70 cables, 70 placas, 70 paneles LED, 70 credenciales, 70 planos y 8 chips 4K. Contenido fijo.', 'precio' => 9.99, 'creditos' => 0, 'una_vez' => false],
        // Pase de Copa con dinero (server/INTEGRAR_ESTRELLAS.md §3; por créditos lo cobra Estrellas, ajuste pase_copa_creditos = 300).
        // El personal estrella (estrella_copa) es solo por créditos: lo cobra Estrellas::contratar, no lleva fila aquí.
        'pase_copa' => ['tipo' => 'pase_copa', 'modulo' => 'Estrellas', 'nombre' => 'Pase de Copa', 'detalle' => '+5 eventos de preparación por día durante la Copa de Servidores de esta semana', 'precio' => 2.99, 'creditos' => 0, 'una_vez' => false],
        // Impulsos (server/INTEGRAR_MONETIZACION2.md): los entrega Impulsos (gancho compra_aprobada). Contenido fijo = Impulsos::HITOS etc.
        'equipo_obra_2' => ['tipo' => 'equipo_obra', 'modulo' => 'Impulsos', 'nombre' => 'Equipo de obra extra (permanente)', 'detalle' => 'Sede oficial: +1 equipo de obra para siempre (tu segundo equipo; si ya tienes dos por el nivel 5 o el VIP 4, tu tercero). Máximo 3. Gratis: se alquila 2 días con dinero del juego una vez por semana', 'precio' => 2.99, 'creditos' => 0, 'una_vez' => true],
        'fondo_crecimiento' => ['tipo' => 'fondo', 'modulo' => 'Impulsos', 'nombre' => 'Fondo de crecimiento', 'detalle' => 'Una sola vez: créditos y materiales fijos al llegar a los niveles 5, 8, 10, 12, 15, 18, 20, 25 y 30 de tu sede oficial (10.000 créditos, 1.430 materiales comunes y 27 chips 4K en total). Reclamas también los niveles que ya tienes', 'precio' => 19.99, 'creditos' => 0, 'una_vez' => true],
        'tarjeta_semanal' => ['tipo' => 'tarjeta_semanal', 'modulo' => 'Impulsos', 'nombre' => 'Tarjeta semanal', 'detalle' => '7 días: reclama cada día 15 créditos y 3 cables, 3 placas, 3 paneles LED, 3 credenciales y 3 planos para tu sede oficial. No se renueva sola; si compras otra se suman 7 días', 'precio' => 1.99, 'creditos' => 0, 'una_vez' => false, 'dias' => 7, 'creditos_dia' => 15],
        // Ofertas escalonadas del VIP (Vip::PRODUCTOS_OFERTA, contenido fijo con tope): solo en la ficha VIP de quien la desbloqueó
            'oferta_vip_s' => ['tipo' => 'oferta', 'oferta_vip' => true, 'modulo' => 'Vip', 'nombre' => 'Oferta VIP: Primer impulso', 'detalle' => 'Oferta de nivel: 300 créditos, $2.000 del juego y 5 cables', 'precio' => 1.99, 'creditos' => 300, 'una_vez' => false,
                'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 2000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5]]],
            'oferta_vip_m' => ['tipo' => 'oferta', 'oferta_vip' => true, 'modulo' => 'Vip', 'nombre' => 'Oferta VIP: Productora en ascenso', 'detalle' => 'Oferta de nivel: 900 créditos, $5.000 del juego, 5 cables y 5 baterías', 'precio' => 4.99, 'creditos' => 900, 'una_vez' => false,
                'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 5000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5]]],
            'oferta_vip_l' => ['tipo' => 'oferta', 'oferta_vip' => true, 'modulo' => 'Vip', 'nombre' => 'Oferta VIP: Gran producción', 'detalle' => 'Oferta de nivel: 2.000 créditos, $12.000 del juego, 10 cables, 10 baterías y todo tu equipo al 100 %', 'precio' => 9.99, 'creditos' => 2000, 'una_vez' => false,
                'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 12000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 10], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 10], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
            'oferta_campeon' => ['tipo' => 'oferta', 'oferta_vip' => true, 'modulo' => 'Vip', 'nombre' => 'Oferta del campeón', 'detalle' => 'Por tu primera Copa: 1.000 créditos, $8.000 del juego, 5 cables, 5 baterías y todo tu equipo al 100 %', 'precio' => 4.99, 'creditos' => 1000, 'una_vez' => false,
                'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 8000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
            'oferta_sede_5' => ['tipo' => 'oferta', 'oferta_vip' => true, 'modulo' => 'Vip', 'nombre' => 'Oferta Sede nivel 5', 'detalle' => 'Tu sede llegó a nivel 5: 800 créditos, $10.000 del juego, 5 cables y 5 baterías', 'precio' => 4.99, 'creditos' => 800, 'una_vez' => false,
                'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 10000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 5], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 5]]],
            'oferta_sede_10' => ['tipo' => 'oferta', 'oferta_vip' => true, 'modulo' => 'Vip', 'nombre' => 'Oferta Sede nivel 10', 'detalle' => 'Tu sede llegó a nivel 10: 1.800 créditos, $25.000 del juego, 10 cables, 10 baterías y todo tu equipo al 100 %', 'precio' => 9.99, 'creditos' => 1800, 'una_vez' => false,
                'entregas' => [['tipo' => 'dinero', 'item' => '-', 'cantidad' => 25000], ['tipo' => 'consumible', 'item' => 'cable', 'cantidad' => 10], ['tipo' => 'consumible', 'item' => 'battery', 'cantidad' => 10], ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]]],
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
        'generador'      => ['nombre' => 'Kummins 22 kVA diésel insonorizado', 'detalle' => 'Generador silencioso para estadios y conciertos: si se va la luz, tú sigues al aire.', 'creditos' => 250, 'entrega' => ['tipo' => 'item', 'item' => 'generador', 'cantidad' => 1]],
        'kit_reparacion' => ['nombre' => 'Kit de reparación total', 'detalle' => 'Todo tu equipo al 100 %', 'creditos' => 60, 'entrega' => ['tipo' => 'reparar_todo', 'item' => '-', 'cantidad' => 1]],
        'caja_chica'     => ['nombre' => 'Caja chica', 'detalle' => '$1.000 para tu productora', 'creditos' => 120, 'entrega' => ['tipo' => 'dinero', 'item' => '-', 'cantidad' => 1000]],
        'estrella'       => ['nombre' => 'Camarógrafo estrella', 'detalle' => 'Nivel 4, gratis y sin pago inicial', 'creditos' => 300, 'entrega' => ['tipo' => 'personal', 'item' => 'cam', 'cantidad' => 4]],
        'dron4k'         => ['nombre' => 'DGI Inspira 3X Cine (dron) Exclusivo', 'detalle' => 'Dron de cine con cámara 4K de lentes cambiables. Tomas aéreas de calidad 5. Necesita piloto de dron.', 'creditos' => 450, 'entrega' => ['tipo' => 'item', 'item' => 'dron4k', 'cantidad' => 1]],
        'grua'           => ['nombre' => 'Grúa telescópica de 12 m con cabeza remota', 'detalle' => 'Barridos de cine sobre el público. Cámara de calidad 4 para las posiciones de grúa o jib.', 'creditos' => 650, 'entrega' => ['tipo' => 'item', 'item' => 'grua', 'cantidad' => 1]],
        'unidad_movil'   => ['nombre' => 'Sprinto OB equipada (4 a 6 cámaras)', 'detalle' => 'Unidad móvil con switcher, audio e intercom adentro. Cuenta como switcher de calidad 4.', 'creditos' => 900, 'entrega' => ['tipo' => 'item', 'item' => 'unidad_movil', 'cantidad' => 1]],
        // Equipos VIP: se canjean solo con VIP activo; siguen siendo del jugador cuando el VIP vence (el juego los guarda)
        'vip_cam8k'      => ['nombre' => 'Zony HDK-3600 4K HDR Edición VIP (con lente box 107x)', 'detalle' => 'Cadena de cámara de sistema 4K con lente box y fibra incluidos. La mejor imagen del juego (calidad 6). Lleva un shader.', 'creditos' => 800, 'vip' => true, 'entrega' => ['tipo' => 'item', 'item' => 'vip_cam8k', 'cantidad' => 1]],
        'vip_switcher'   => ['nombre' => 'Rozz Carbonita Ultra Edición VIP', 'detalle' => 'Switcher de televisión con panel: repeticiones y gráficos de nivel nacional. Calidad 5.', 'creditos' => 1000, 'vip' => true, 'entrega' => ['tipo' => 'item', 'item' => 'vip_switcher', 'cantidad' => 1]],
        'vip_satelital'  => ['nombre' => 'Enlace satelital portátil (flyaway) Edición VIP', 'detalle' => 'Tu transmisión sale por satélite: el internet nunca te deja mal.', 'creditos' => 700, 'vip' => true, 'entrega' => ['tipo' => 'item', 'item' => 'vip_satelital', 'cantidad' => 1]],
        // Edición Exclusiva: una por categoría (js/datos.js, MONETIZACION.md §5). Misma calidad que el mejor normal; también se compran
        // gratis con dinero del juego (más fama). Se entregan al inventario del servidor (número de serie, mercado). Contenido fijo: 1 equipo.
        'ex_lente_box'   => ['nombre' => 'Fujinox UX125x Oro (box 4K 125x) Edición Exclusiva', 'detalle' => 'Box 4K de 125x para la cámara de sistema, calidad 6. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 900, 'entrega' => ['tipo' => 'item', 'item' => 'ex_lente_box', 'cantidad' => 1]],
        'ex_soporte'     => ['nombre' => 'Vinter Vector 950 Oro + trípode de carbono Edición Exclusiva', 'detalle' => 'Cabezal pesado para cámaras con lente box, calidad 5. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 450, 'entrega' => ['tipo' => 'item', 'item' => 'ex_soporte', 'cantidad' => 1]],
        'ex_repeticion'  => ['nombre' => 'EVX XT-VIA Oro (servidor 4K) Edición Exclusiva', 'detalle' => 'Servidor de repeticiones 4K de las finales, calidad 6. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 950, 'entrega' => ['tipo' => 'item', 'item' => 'ex_repeticion', 'cantidad' => 1]],
        'ex_graficos'    => ['nombre' => 'Vizart Motor 3D AR Oro Edición Exclusiva', 'detalle' => 'Gráficos 3D y realidad aumentada sobre la cancha, calidad 6. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 850, 'entrega' => ['tipo' => 'item', 'item' => 'ex_graficos', 'cantidad' => 1]],
        'ex_monitor'     => ['nombre' => 'Monitor OLED de referencia 24" Oro Edición Exclusiva', 'detalle' => 'Para que el shader iguale el color de todas las cámaras, calidad 5. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 300, 'entrega' => ['tipo' => 'item', 'item' => 'ex_monitor', 'cantidad' => 1]],
        'ex_audio'       => ['nombre' => 'Kalrek Brío 48 Oro (broadcast) Edición Exclusiva', 'detalle' => 'Consola de televisión para narradores y ambiente 5.1, calidad 6. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 600, 'entrega' => ['tipo' => 'item', 'item' => 'ex_audio', 'cantidad' => 1]],
        'ex_mics'        => ['nombre' => 'Shur Axiente doble digital Oro Edición Exclusiva', 'detalle' => 'Dos micrófonos inalámbricos digitales, calidad 3. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 250, 'entrega' => ['tipo' => 'item', 'item' => 'ex_mics', 'cantidad' => 1]],
        'ex_intercom'    => ['nombre' => 'ClearKom FreeHabla Oro (12 petacas) Edición Exclusiva', 'detalle' => 'Intercom inalámbrico de estadio con 12 petacas, calidad 5. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 500, 'entrega' => ['tipo' => 'item', 'item' => 'ex_intercom', 'cantidad' => 1]],
        'ex_encoder'     => ['nombre' => 'LiveYou LU900 Oro (8 módems) Edición Exclusiva', 'detalle' => 'Mochila de 8 módems 5G con señal de canal de TV, calidad 5. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 550, 'entrega' => ['tipo' => 'item', 'item' => 'ex_encoder', 'cantidad' => 1]],
        'ex_internet'    => ['nombre' => 'NetGir M9 Oro (5G doble chip) Edición Exclusiva', 'detalle' => 'Internet de respaldo con chips de dos operadoras a la vez. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 150, 'entrega' => ['tipo' => 'item', 'item' => 'ex_internet', 'cantidad' => 1]],
        'ex_wireless'    => ['nombre' => 'Terradek Rayo 7 Oro 1500 Edición Exclusiva', 'detalle' => 'Video inalámbrico sin retraso hasta 450 m, calidad 4. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 300, 'entrega' => ['tipo' => 'item', 'item' => 'ex_wireless', 'cantidad' => 1]],
        'ex_cable'       => ['nombre' => 'Fibra SMPTE blindada Oro 150 m Edición Exclusiva', 'detalle' => 'Fibra híbrida para la cámara de sistema que aguanta pisadas, calidad 4. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 200, 'entrega' => ['tipo' => 'item', 'item' => 'ex_cable', 'cantidad' => 1]],
        'ex_lluvia'      => ['nombre' => 'Cobertor broadcast Oro ventilado Edición Exclusiva', 'detalle' => 'Cubre cámara, lente box y operador en aguaceros de estadio, calidad 3. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 100, 'entrega' => ['tipo' => 'item', 'item' => 'ex_lluvia', 'cantidad' => 1]],
        'ex_maletas'     => ['nombre' => 'Maletas Pelikano Oro con ruedas Edición Exclusiva', 'detalle' => 'Maletas rígidas: el equipo se gasta menos en los viajes, calidad 2. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.', 'creditos' => 120, 'entrega' => ['tipo' => 'item', 'item' => 'ex_maletas', 'cantidad' => 1]],
        // Refuerzos (ayudas por tiempo limitado). Los aplica el juego (entrega tipo "refuerzo").
        'refuerzo_camarografo_senior' => ['tipo' => 'refuerzo', 'nombre' => 'Camarógrafo senior de refuerzo', 'detalle' => 'Un camarógrafo con experiencia te acompaña en tus próximos 2 eventos', 'creditos' => 120, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'refuerzo_camarografo_senior', 'cantidad' => 1, 'nivel' => 'senior', 'eventos' => 2]],
        'refuerzo_tecnico_internacional' => ['tipo' => 'refuerzo', 'nombre' => 'Técnico de streaming internacional', 'detalle' => 'Un técnico de nivel internacional cuida tu señal en tus próximos 3 eventos', 'creditos' => 240, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'refuerzo_tecnico_internacional', 'cantidad' => 1, 'nivel' => 'internacional', 'eventos' => 3]],
        'alquiler_lente_box' => ['tipo' => 'refuerzo', 'nombre' => 'Alquiler de lente box 100x', 'detalle' => 'Un lente de estadio de 100x para tu próximo evento', 'creditos' => 120, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'alquiler_lente_box', 'cantidad' => 1, 'eventos' => 1]],
        'seguro_evento' => ['tipo' => 'refuerzo', 'nombre' => 'Seguro de evento', 'detalle' => 'En tu próximo evento, si sacas 2 estrellas o menos te devuelven el 50 % del pago', 'creditos' => 100, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'seguro_evento', 'cantidad' => 1, 'eventos' => 1]],
        'equipo_descansado' => ['tipo' => 'refuerzo', 'nombre' => 'Equipo descansado', 'detalle' => 'Todo tu personal recupera la energía ahora mismo', 'creditos' => 100, 'entrega' => ['tipo' => 'refuerzo', 'item' => 'equipo_descansado', 'cantidad' => 1]],
    ];

    /** Nombre de cada equipo que vive en el inventario del servidor (para el mercado y el panel). */
    public const EQUIPOS = [
        'cam_pro' => 'Kanon XA65', 'generador' => 'Kummins 22 kVA diésel insonorizado', 'dron4k' => 'DGI Inspira 3X Cine (dron) Exclusivo', 'grua' => 'Grúa telescópica de 12 m con cabeza remota',
        'unidad_movil' => 'Sprinto OB equipada (4 a 6 cámaras)', 'vip_cam8k' => 'Zony HDK-3600 4K HDR Edición VIP (con lente box 107x)', 'vip_switcher' => 'Rozz Carbonita Ultra Edición VIP',
        'vip_satelital' => 'Enlace satelital portátil (flyaway) Edición VIP',
        // Edición Exclusiva (los mismos nombres que js/datos.js)
        'ex_lente_box' => 'Fujinox UX125x Oro (box 4K 125x) Edición Exclusiva',
        'ex_soporte' => 'Vinter Vector 950 Oro + trípode de carbono Edición Exclusiva',
        'ex_repeticion' => 'EVX XT-VIA Oro (servidor 4K) Edición Exclusiva',
        'ex_graficos' => 'Vizart Motor 3D AR Oro Edición Exclusiva',
        'ex_monitor' => 'Monitor OLED de referencia 24" Oro Edición Exclusiva',
        'ex_audio' => 'Kalrek Brío 48 Oro (broadcast) Edición Exclusiva',
        'ex_mics' => 'Shur Axiente doble digital Oro Edición Exclusiva',
        'ex_intercom' => 'ClearKom FreeHabla Oro (12 petacas) Edición Exclusiva',
        'ex_encoder' => 'LiveYou LU900 Oro (8 módems) Edición Exclusiva',
        'ex_internet' => 'NetGir M9 Oro (5G doble chip) Edición Exclusiva',
        'ex_wireless' => 'Terradek Rayo 7 Oro 1500 Edición Exclusiva',
        'ex_cable' => 'Fibra SMPTE blindada Oro 150 m Edición Exclusiva',
        'ex_lluvia' => 'Cobertor broadcast Oro ventilado Edición Exclusiva',
        'ex_maletas' => 'Maletas Pelikano Oro con ruedas Edición Exclusiva',
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
        // Edición Exclusiva: 3 veces su costo en créditos
        'ex_lente_box' => 2700, 'ex_soporte' => 1350, 'ex_repeticion' => 2850, 'ex_graficos' => 2550, 'ex_monitor' => 900,
        'ex_audio' => 1800, 'ex_mics' => 750, 'ex_intercom' => 1500, 'ex_encoder' => 1650, 'ex_internet' => 450,
        'ex_wireless' => 900, 'ex_cable' => 600, 'ex_lluvia' => 300, 'ex_maletas' => 360,
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
    /** Tipos que no salen en la lista general de la tienda: tienen su propia pantalla (pase de temporada, pase de copa). */
    public const TIPOS_CON_PANTALLA = ['pase', 'pase_copa'];

    /** ¿Está instalado el módulo que entrega este producto? (los productos sin "modulo" siempre lo están) */
    public static function moduloListo(array $p): bool
    {
        if (empty($p['modulo'])) return true;
        try { return class_exists('EnVivo\\' . $p['modulo']); } catch (\Throwable) { return false; }
    }

    /** El contenido fijo lo manda el módulo (así el texto de la tienda nunca difiere de lo que se entrega). */
    private static function contenidoModulo(string $id, array $p): array
    {
        try {
            if (($p['modulo'] ?? '') === 'SedeOficial' && method_exists(SedeOficial::class, 'detallePack')) {
                $d = SedeOficial::detallePack($id);
                if ($d !== '') $p['detalle'] = $d;
            } elseif (($p['modulo'] ?? '') === 'Vip' && isset(Vip::PRODUCTOS_OFERTA[$id])) {
                foreach (['nombre', 'detalle', 'entregas'] as $k) if (isset(Vip::PRODUCTOS_OFERTA[$id][$k])) $p[$k] = Vip::PRODUCTOS_OFERTA[$id][$k];
            }
        } catch (\Throwable) {}
        return $p;
    }

    public static function producto(string $id): ?array
    {
        $p = self::PRODUCTOS[$id] ?? null;
        if ($p === null) return null;
        $listo = self::moduloListo($p);
        if ($listo && !empty($p['modulo'])) $p = self::contenidoModulo($id, $p);
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
        if (!$listo) { $p['activo'] = false; $p['oculto'] = true; $p['sin_modulo'] = true; }   // nunca se vende algo que nadie entrega
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

    /**
     * Exclusivo con créditos con los cambios del Centro de Control (productos_ajustes: "creditos" = lo que cuesta y
     * "activo"; el precio no aplica). Agrega creditos_base y activo. null si no existe.
     */
    public static function premium(string $id): ?array
    {
        $p = self::PREMIUM[$id] ?? null;
        if ($p === null) return null;
        $p['id'] = $id;
        $p['creditos_base'] = $p['creditos'];
        $p['activo'] = true;
        $a = self::ajustes()[$id] ?? null;
        if ($a) {
            if ($a['creditos'] !== null) $p['creditos'] = (int) $a['creditos'];
            if ($a['activo'] !== null) $p['activo'] = (bool) (int) $a['activo'];
        }
        return $p;
    }

    // ------------------------------------------------------------------ escrituras del Centro de Control (auditan)
    /**
     * Guarda en productos_ajustes los cambios de un producto con dinero real (precio con IVA, créditos que da, activo) o
     * de un exclusivo con créditos (créditos que cuesta y activo; $precio se ignora). Audita y limpia la caché.
     */
    public static function guardarAjuste(string $producto, float $precio, int $creditos, bool $activo, string $quien): void
    {
        $real = isset(self::PRODUCTOS[$producto]);
        Fallo::si(!$real && !isset(self::PREMIUM[$producto]), 'Ese producto no existe.', 404, ['codigo' => 'producto_no_existe']);
        if ($real) Fallo::si($precio < 0.5 || $precio > 100 || round($precio, 2) != $precio, 'El precio debe ser de $0,50 a $100 (con IVA incluido), ej. 4.99', 400, ['codigo' => 'precio_invalido']);
        Fallo::si($real ? ($creditos < 0 || $creditos > 1000000) : ($creditos < 1 || $creditos > 100000),
            $real ? 'Los créditos deben ser un número entero de 0 a 1.000.000.' : 'El costo debe ser de 1 a 100.000 créditos.', 400, ['codigo' => 'creditos_invalidos']);
        Db::tx(function () use ($producto, $precio, $creditos, $activo, $quien, $real): void {
            if ($real) {
                $antes = self::producto($producto);
                $credAntes = (int) $antes['creditos'] - (int) ($antes['oferta']['creditos_extra'] ?? 0);
                $det = $producto . ': precio ' . $antes['precio'] . ' -> ' . round($precio, 2) . ', créditos ' . $credAntes . ' -> ' . $creditos;
            } else {
                $antes = self::premium($producto);
                $det = $producto . ' (exclusivo): costo ' . $antes['creditos'] . ' -> ' . $creditos . ' créditos';
            }
            Db::q('INSERT INTO productos_ajustes (producto, precio, creditos, activo, actualizado) VALUES (?, ?, ?, ?, ?) ON CONFLICT (producto) DO UPDATE SET precio = excluded.precio, creditos = excluded.creditos, activo = excluded.activo, actualizado = excluded.actualizado',
                [$producto, $real ? round($precio, 2) : null, $creditos, $activo ? 1 : 0, time()]);
            self::olvidarAjustes();
            Auditoria::anotar($quien, 'producto_editar', $det . ', activo ' . (int) $antes['activo'] . ' -> ' . (int) $activo);
        });
    }

    /** Vuelve a los valores de este archivo (borra el ajuste). true si había uno. */
    public static function restaurarAjuste(string $producto, string $quien): bool
    {
        Fallo::si(!isset(self::PRODUCTOS[$producto]) && !isset(self::PREMIUM[$producto]), 'Ese producto no existe.', 404, ['codigo' => 'producto_no_existe']);
        $n = Db::q('DELETE FROM productos_ajustes WHERE producto = ?', [$producto])->rowCount();
        self::olvidarAjustes();
        if ($n) Auditoria::anotar($quien, 'producto_restaurar', $producto . ' vuelve a los valores de Catalogo.php');
        return $n > 0;
    }

    /** Oferta de % extra de créditos por tiempo limitado (solo productos con dinero real que dan créditos). Devuelve su id. */
    public static function crearOferta(string $producto, int $bonoPct, int $inicio, int $fin, string $quien): int
    {
        $p = self::producto($producto);
        Fallo::si(!$p || !empty($p['oculto']) || (int) $p['creditos'] - (int) ($p['oferta']['creditos_extra'] ?? 0) <= 0, 'Las ofertas de % extra son para productos que dan créditos.', 400, ['codigo' => 'oferta_invalida']);
        Fallo::si($bonoPct < 1 || $bonoPct > 300, 'El bono debe ser de 1 % a 300 %.', 400, ['codigo' => 'bono_invalido']);
        Fallo::si($fin <= $inicio || $fin <= time(), 'Revisa las fechas: el fin debe ser después del inicio y en el futuro.', 400, ['codigo' => 'fechas_invalidas']);
        return Db::tx(function () use ($producto, $bonoPct, $inicio, $fin, $quien): int {
            Db::q('INSERT INTO ofertas (producto, bono_pct, inicio, fin, activa, creado) VALUES (?, ?, ?, ?, 1, ?)', [$producto, $bonoPct, $inicio, $fin, time()]);
            $id = Db::ultimoId();
            self::olvidarAjustes();
            Auditoria::anotar($quien, 'oferta_crear', 'Oferta N° ' . $id . ": $producto +$bonoPct % créditos del " . date('Y-m-d H:i', $inicio) . ' al ' . date('Y-m-d H:i', $fin));
            return $id;
        });
    }

    public static function terminarOferta(int $ofertaId, string $quien): void
    {
        $n = Db::q('UPDATE ofertas SET activa = 0 WHERE id = ? AND activa = 1', [$ofertaId])->rowCount();
        Fallo::si($n === 0, 'Esa oferta no existe o ya terminó.', 404, ['codigo' => 'oferta_no_existe']);
        self::olvidarAjustes();
        Auditoria::anotar($quien, 'oferta_terminar', 'Oferta N° ' . $ofertaId);
    }

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
            if (!$x['activo'] || !empty($x['oculto']) || !empty($x['oferta_vip']) || in_array($x['tipo'], self::TIPOS_CON_PANTALLA, true)) continue;
            $p[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'precio' => $x['precio'], 'creditos' => $x['creditos'], 'una_vez' => $x['una_vez'], 'tipo' => $x['tipo'],
                    'precio_base' => $x['precio_base'], 'creditos_base' => $x['creditos_base'], 'oferta' => $x['oferta']]
                 + (isset($x['dias']) ? ['dias' => $x['dias']] : []) + (isset($x['creditos_dia']) ? ['creditos_dia' => $x['creditos_dia']] : []);
        }
        $m = [];
        foreach (array_keys(self::PREMIUM) as $id) {
            $x = self::premium($id);
            if (!$x['activo']) continue;
            $tipo = $x['tipo'] ?? ($x['entrega']['tipo'] === 'item' ? (!empty($x['vip']) ? 'vip' : 'equipo') : 'consumo');
            $m[] = ['id' => $id, 'nombre' => $x['nombre'], 'detalle' => $x['detalle'], 'creditos' => $x['creditos'], 'vip' => !empty($x['vip']), 'tipo' => $tipo, 'entrega' => $x['entrega']];
        }
        return ['productos' => $p, 'premium' => $m];
    }
}
