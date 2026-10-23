<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Facturación electrónica SRI (Ecuador). Desde el 1 de enero de 2026 cada comprobante se transmite y autoriza de inmediato
 * (resolución NAC-DGERCGC25-00000017). El juego NO firma ni manda XML al SRI: lo hace el ERP del dueño (sistema aparte, con
 * su sincronizador del SRI). Aquí queda el puente, del lado del juego:
 *  - Cada compra aprobada (Pago Plux o Google Play) crea una FACTURA "pendiente" con los datos del comprador que eligió en la
 *    página de pago (titular, otro nombre/RUC o consumidor final), el producto, subtotal, IVA 15 % y total (gancho
 *    compra_aprobada de Ganchos.php; Compras.php no cambia). Google Play no trae datos: consumidor final con el correo de la cuenta.
 *  - Cada reembolso o contracargo crea una NOTA DE CRÉDITO pendiente (gancho compra_revertida) que el ERP recibe cuando la
 *    factura ya está autorizada (necesita su número). A consumidor final no se emite nota de crédito (SRI, 2026): queda "no_aplica".
 *  - El ERP las toma con la API firmada con HMAC (FacturacionApi.php: GET /api/facturacion/pendientes, POST /confirmar) y,
 *    si hay FACTURACION_WEBHOOK_URL, el juego además se las avisa firmadas (con reintentos y espera creciente).
 *  - bin/facturacion.php (cron cada 5 minutos): reintenta los avisos y avisa si algo lleva más de 1 hora sin autorizar.
 * Contrato completo para el programador del ERP: docs/FACTURACION_SRI.md. Integración: server/INTEGRAR_FACTURACION.md.
 */
final class Facturacion
{
    public const ESTADOS = ['pendiente', 'en_proceso', 'autorizada', 'fallida', 'no_aplica'];
    /** Estados que puede mandar el ERP en /confirmar (y sinónimos). */
    public const ESTADOS_ERP = ['autorizada' => 'autorizada', 'autorizado' => 'autorizada', 'en_proceso' => 'en_proceso', 'recibida' => 'en_proceso',
        'rechazada' => 'rechazada', 'no_autorizada' => 'rechazada', 'devuelta' => 'rechazada', 'error' => 'error', 'no_aplica' => 'no_aplica'];
    public const TIPOS_ID = ['04' => 'ruc', '05' => 'cedula', '06' => 'pasaporte', '07' => 'consumidor_final'];
    public const CONSUMIDOR_FINAL_ID = '9999999999999';
    public const IVA_CODIGO = '4';               // SRI, tabla 17: código de porcentaje del IVA 15 %
    public const ATRASO_SEG = 3600;              // más de 1 hora sin autorizar = atrasada (alerta)
    public const MAX_ERRORES = 8;                // errores seguidos del ERP antes de pasar a "fallida"
    public const VENTANA_FIRMA = 300;            // segundos de diferencia de reloj aceptados en la firma
    public const NONCE_VIDA = 900;
    public const WEBHOOK_ESPERAS = [60, 300, 900, 3600, 10800, 21600];   // espera tras cada aviso fallido
    public const WEBHOOK_MAX = 10;

    /** Reloj inyectable (solo pruebas). */
    public static ?\Closure $reloj = null;
    /** Avisar al ERP al terminar la petición (después de responder). Las pruebas lo apagan. */
    public static bool $empujarAlTerminar = true;
    /** @var list<int> */
    private static array $porEmpujar = [];
    private static bool $apagadoRegistrado = false;

    public static function ahora(): int { return self::$reloj !== null ? (int) (self::$reloj)() : time(); }

    // ============================================================================================ configuración
    public static function activa(): bool { return Config::get('FACTURACION_ACTIVA', '1') !== '0'; }
    public static function facturaGoogle(): bool { return Config::get('FACTURACION_GOOGLE', '1') !== '0'; }
    public static function clave(): string { return Config::get('FACTURACION_CLAVE'); }
    public static function claveLista(): bool { return strlen(self::clave()) >= 32; }
    public static function webhookUrl(): string
    {
        $u = trim(Config::get('FACTURACION_WEBHOOK_URL'));
        if ($u === '' || !preg_match('~^https?://[^\s/?#]+(/\S*)?$~', $u)) return '';
        $h = strtolower((string) parse_url($u, PHP_URL_HOST));
        // https obligatorio (salvo la misma máquina: el ERP en el mismo servidor o las pruebas)
        if (str_starts_with($u, 'http://') && !in_array($h, ['127.0.0.1', 'localhost', '::1', '[::1]'], true)) return '';
        return $u;
    }
    /** Tope de una factura a consumidor final (SRI: USD 50). Por encima hay que identificar al comprador. */
    public static function topeConsumidorFinal(): float
    {
        $v = (float) str_replace(',', '.', Config::get('FACTURACION_TOPE_CF', '50'));
        return $v > 0 ? $v : 50.0;
    }

    /** Gancho de cada módulo (arranque.php). Registrar dos veces no duplica. */
    public static function registrar(): void
    {
        Ganchos::en('compra_aprobada', static fn(array $d) => self::alAprobar($d), 'facturacion');
        Ganchos::en('compra_revertida', static fn(array $d) => self::alRevertir($d), 'facturacion');
    }

    // ============================================================================================ identificación (SRI)
    /** Cédula ecuatoriana: 10 dígitos, provincia 01–24 o 30, tercer dígito < 6 y dígito verificador (módulo 10). */
    public static function cedulaValida(string $c): bool
    {
        if (!preg_match('/^\d{10}$/', $c)) return false;
        $prov = (int) substr($c, 0, 2);
        if (!(($prov >= 1 && $prov <= 24) || $prov === 30) || (int) $c[2] >= 6) return false;
        $s = 0;
        for ($i = 0; $i < 9; $i++) {
            $x = (int) $c[$i] * ($i % 2 === 0 ? 2 : 1);
            $s += $x > 9 ? $x - 9 : $x;
        }
        return (10 - $s % 10) % 10 === (int) $c[9];
    }

    /**
     * RUC: 13 dígitos, provincia válida, termina en un establecimiento distinto de 000. Persona natural (tercer dígito 0–5):
     * los 10 primeros son una cédula válida. Sociedades (9) y sector público (6): solo la estructura (el SRI ha emitido RUC
     * que no cumplen el módulo 11, así que no se rechazan por eso; el SRI los valida al autorizar).
     */
    public static function rucValido(string $r): bool
    {
        if (!preg_match('/^\d{13}$/', $r) || substr($r, 10) === '000') return false;
        $prov = (int) substr($r, 0, 2);
        if (!(($prov >= 1 && $prov <= 24) || $prov === 30)) return false;
        $t = (int) $r[2];
        if ($t < 6) return self::cedulaValida(substr($r, 0, 10));
        return $t === 6 || $t === 9;
    }

    /**
     * Tipo de identificación del SRI para un documento ya limpio: '05' cédula, '04' RUC, '06' pasaporte, '07' consumidor
     * final, o null si son 10 o 13 dígitos que no pasan la validación (casi siempre un error al escribir).
     */
    public static function tipoIdentificacion(string $id): ?string
    {
        if ($id === self::CONSUMIDOR_FINAL_ID) return '07';
        if (preg_match('/^\d{10}$/', $id)) return self::cedulaValida($id) ? '05' : null;
        if (preg_match('/^\d{13}$/', $id)) return self::rucValido($id) ? '04' : null;
        return preg_match('/^[0-9A-Z]{5,20}$/', $id) ? '06' : null;
    }

    private static function texto(mixed $v, int $n): string
    {
        $t = is_scalar($v) ? (string) $v : '';
        $t = preg_replace('/[\x00-\x1F\x7F<>]+/u', ' ', $t) ?? '';
        return mb_substr(trim(preg_replace('/\s+/u', ' ', $t) ?? ''), 0, $n);
    }

    // ============================================================================================ página de pago
    /**
     * Datos de la factura que manda la página de pago (campo "factura": {modo, identificacion, razon_social, email, direccion}).
     * modo: 'titular' (los datos del titular de la tarjeta, por defecto), 'otro' (otro nombre, cédula o RUC) o
     * 'consumidor_final' (solo hasta FACTURACION_TOPE_CF, USD 50). Lanza Fallo (422) con el texto para el comprador y un código.
     * Se llama ANTES de cobrar (api_plux_pago), así un dato malo nunca deja un cobro sin factura posible.
     */
    public static function datosDePago(array $in, array $comprador, array $compra, ?array $jugador = null): array
    {
        $f = is_array($in['factura'] ?? null) ? $in['factura'] : [];
        $modo = in_array($f['modo'] ?? null, ['titular', 'otro', 'consumidor_final'], true) ? $f['modo'] : 'titular';
        $dir = self::texto($f['direccion'] ?? '', 300);
        $email = self::texto($f['email'] ?? '', 120);
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $email = (string) ($comprador['email'] ?? ($jugador['email'] ?? ''));
        $tel = (string) ($comprador['telefono'] ?? '');
        $total = round((float) $compra['total'], 2);
        $tope = self::topeConsumidorFinal();
        if ($modo === 'otro') {
            $id = Plux::limpiarCedula((string) ($f['identificacion'] ?? ''));
            if ($id === self::CONSUMIDOR_FINAL_ID) $modo = 'consumidor_final';
        }
        if ($modo === 'consumidor_final') {
            if ($total > $tope) throw new Fallo('Para compras de más de ' . Http::dinero($tope) . ' el SRI pide identificar al comprador: elige «A nombre del titular» o «A otro nombre o RUC».', 422, ['codigo' => 'factura_consumidor_final_tope']);
            return ['modo' => 'consumidor_final', 'tipo_id' => '07', 'identificacion' => self::CONSUMIDOR_FINAL_ID, 'razon_social' => 'CONSUMIDOR FINAL',
                'email' => $email, 'telefono' => $tel, 'direccion' => $dir];
        }
        if ($modo === 'otro') {
            $razon = self::texto($f['razon_social'] ?? '', 300);
            if ($id === '' || mb_strlen($razon) < 3) throw new Fallo('Para la factura escribe la cédula, RUC o pasaporte y el nombre o razón social.', 422, ['codigo' => 'factura_datos_incompletos']);
            $tipo = self::tipoIdentificacion($id);
            if ($tipo === null) {
                throw new Fallo(strlen($id) === 13 ? 'El RUC ' . $id . ' no es válido. Revísalo (13 números) o elige otra opción de factura.'
                    : 'La cédula ' . $id . ' no es válida. Revísala o elige otra opción de factura.', 422, ['codigo' => strlen($id) === 13 ? 'factura_ruc_invalido' : 'factura_cedula_invalida']);
            }
            return ['modo' => 'otro', 'tipo_id' => $tipo, 'identificacion' => $id, 'razon_social' => mb_strtoupper($razon), 'email' => $email, 'telefono' => $tel, 'direccion' => $dir];
        }
        $id = (string) ($comprador['cedula'] ?? '');
        $tipo = self::tipoIdentificacion($id);
        if ($tipo === null) throw new Fallo('La cédula del titular (' . $id . ') no es válida para la factura. Revísala o elige «Consumidor final».', 422, ['codigo' => 'factura_cedula_invalida']);
        $razon = mb_strtoupper(self::texto($comprador['nombre'] ?? trim(($comprador['nombres'] ?? '') . ' ' . ($comprador['apellidos'] ?? '')), 300));
        return ['modo' => 'titular', 'tipo_id' => $tipo, 'identificacion' => $id, 'razon_social' => $razon, 'email' => $email, 'telefono' => $tel, 'direccion' => $dir];
    }

    /** Guarda lo que eligió el comprador (se usa al aprobar la compra). Nunca datos de tarjeta. */
    public static function anotarDatos(int $compra, ?array $datos): void
    {
        if ($datos === null) return;
        Db::q('INSERT INTO facturacion_datos_compra (compra_id, datos_json, creado) VALUES (?, ?, ?)
               ON CONFLICT (compra_id) DO UPDATE SET datos_json = excluded.datos_json, creado = excluded.creado',
            [$compra, json_encode($datos, JSON_UNESCAPED_UNICODE), self::ahora()]);
    }

    /** Bloque "Datos para tu factura" de pago.php (sin estilos ni scripts en línea: la CSP solo permite 'self'). */
    public static function htmlPago(array $compra, array $jugador): string
    {
        $e = [Http::class, 'e'];
        $total = round((float) $compra['total'], 2);
        $tope = self::topeConsumidorFinal();
        $cf = $total <= $tope;
        return '<link rel="stylesheet" href="/pago-assets/factura.css?v=1">'
            . '<fieldset class="factura" id="fact-caja" data-tope="' . $e(number_format($tope, 2, '.', '')) . '" data-total="' . $e(number_format($total, 2, '.', '')) . '">'
            . '<legend>Datos para tu factura electrónica</legend>'
            . '<label class="casilla"><input type="radio" name="fact-modo" value="titular" checked> <span>A nombre del titular de la tarjeta (con la cédula de arriba)</span></label>'
            . '<label class="casilla"><input type="radio" name="fact-modo" value="otro"> <span>A otro nombre o con RUC</span></label>'
            . '<label class="casilla"><input type="radio" name="fact-modo" value="consumidor_final"' . ($cf ? '' : ' disabled') . '> <span>Consumidor final (sin datos)'
            . ($cf ? '' : ' — solo para compras de hasta ' . $e(Http::dinero($tope))) . '</span></label>'
            . '<div class="campos" id="fact-otro" hidden>'
            . '<label class="ancho">Cédula, RUC o pasaporte<input id="fact-identificacion" maxlength="20" inputmode="text" autocomplete="off" placeholder="1790012345001"></label>'
            . '<label class="ancho">Nombre o razón social<input id="fact-razon" maxlength="300" autocomplete="organization"></label>'
            . '<label class="ancho">Correo para la factura<input id="fact-email" type="email" maxlength="120" autocomplete="email" value="' . $e((string) ($jugador['email'] ?? '')) . '"></label>'
            . '</div>'
            . '<div class="campos" id="fact-dir"><label class="ancho">Dirección (opcional)<input id="fact-direccion" maxlength="300" autocomplete="street-address"></label></div>'
            . '<p class="tenue">Te enviamos la factura autorizada por el SRI a tu correo. Con «Consumidor final» la factura no lleva tus datos y después no se puede cambiar.</p>'
            . '</fieldset>';
    }

    // ============================================================================================ ganchos
    /** compra_aprobada {compra_id, jugador_id, producto, monto_usd, canal}: crea la factura pendiente (una sola vez). */
    public static function alAprobar(array $d): void
    {
        if (!self::activa() || !is_int($d['compra_id'] ?? null)) return;
        $c = Compras::porId($d['compra_id']);
        if (!$c || $c['estado'] !== 'pagado') return;
        if (($c['canal'] ?? '') === 'google_play' && !self::facturaGoogle()) return;
        self::crearFactura($c);
    }

    /** compra_revertida {compra_id, jugador_id, motivo: reembolso|contracargo, detalle}: nota de crédito pendiente. */
    public static function alRevertir(array $d): void
    {
        if (!self::activa() || !is_int($d['compra_id'] ?? null)) return;
        self::crearNotaCredito((int) $d['compra_id'], (string) ($d['motivo'] ?? 'reembolso'), (string) ($d['detalle'] ?? ''));
    }

    /** Comprador de una compra: lo que eligió en la página de pago; si no, el titular; Google Play: consumidor final. */
    public static function compradorDe(array $c): array
    {
        $j = Db::fila('SELECT email FROM jugadores WHERE id = ?', [$c['jugador_id']]);
        $correo = (string) ($j['email'] ?? '');
        $cf = fn(string $email) => ['tipo_id' => '07', 'identificacion' => self::CONSUMIDOR_FINAL_ID, 'razon_social' => 'CONSUMIDOR FINAL', 'email' => $email,
            'telefono' => (string) ($c['comprador_telefono'] ?? ''), 'direccion' => '', 'modo' => 'consumidor_final'];
        $guardado = Db::valor('SELECT datos_json FROM facturacion_datos_compra WHERE compra_id = ?', [$c['id']]);
        $g = is_string($guardado) ? json_decode($guardado, true) : null;
        if (is_array($g) && isset(self::TIPOS_ID[$g['tipo_id'] ?? ''])) return $g + ['advertencia' => null];
        if (($c['canal'] ?? '') === 'google_play') return $cf($correo) + ['advertencia' => null];
        $ced = (string) ($c['comprador_cedula'] ?? '');
        if ($ced !== '') {
            $tipo = self::tipoIdentificacion($ced);
            return ['tipo_id' => $tipo ?? '06', 'identificacion' => $ced, 'razon_social' => mb_strtoupper((string) ($c['comprador_nombre'] ?? '')) ?: 'SIN NOMBRE',
                'email' => (string) ($c['comprador_email'] ?? '') ?: $correo, 'telefono' => (string) ($c['comprador_telefono'] ?? ''), 'direccion' => '', 'modo' => 'titular',
                'advertencia' => $tipo === null ? 'La identificación del titular (' . $ced . ') no pasa la validación del SRI: revisar antes de emitir.' : null];
        }
        return $cf($correo) + ['advertencia' => 'La compra no trae datos del comprador: va a consumidor final con el correo de la cuenta.'];
    }

    /** Ítems del comprobante (un producto por compra). */
    private static function items(array $c, float $sub, float $iva, float $total): array
    {
        $p = Catalogo::productoCompra((string) $c['producto']);
        return [['codigo' => (string) $c['producto'], 'descripcion' => (string) ($p['nombre'] ?? $c['producto']), 'cantidad' => 1,
            'precio_unitario' => $sub, 'descuento' => 0.0, 'subtotal' => $sub, 'iva_codigo' => self::IVA_CODIGO, 'iva_tarifa' => Catalogo::IVA * 100,
            'iva' => $iva, 'total' => $total]];
    }

    /** Crea la factura pendiente de una compra pagada. Idempotente (una por compra). Devuelve el id o null si ya existía. */
    public static function crearFactura(array $c): ?int
    {
        if (Db::valor("SELECT id FROM facturas WHERE tipo = 'factura' AND compra_id = ?", [$c['id']])) return null;
        $total = round((float) $c['total'], 2);
        $sub = round((float) $c['subtotal'], 2);
        $iva = round((float) $c['iva'], 2);
        if (abs($sub + $iva - $total) > 0.001) [$sub, $iva] = Catalogo::desglose($total);   // compras viejas: se recalcula
        $q = self::compradorDe($c);
        $adv = $q['advertencia'];
        if ($q['tipo_id'] === '07' && $total > self::topeConsumidorFinal()) {
            $adv = trim(($adv ?? '') . ' Consumidor final por más de ' . Http::dinero(self::topeConsumidorFinal()) . ': el SRI pide identificar al comprador.');
        }
        $ahora = self::ahora();
        $google = ($c['canal'] ?? '') === 'google_play';
        Db::q("INSERT OR IGNORE INTO facturas (tipo, compra_id, jugador_id, canal, estado, comprador_tipo_id, comprador_identificacion, comprador_razon_social,
                 comprador_email, comprador_telefono, comprador_direccion, subtotal, iva, total, iva_pct, items_json, forma_pago, advertencia, fecha_venta,
                 creado, actualizado, webhook_estado, webhook_proximo)
               VALUES ('factura', ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [$c['id'], $c['jugador_id'], $c['canal'] ?? 'web_plux', $q['tipo_id'], $q['identificacion'], mb_substr($q['razon_social'], 0, 300),
             $q['email'] ?: null, $q['telefono'] ?: null, $q['direccion'] ?: null, $sub, $iva, $total, Catalogo::IVA * 100,
             json_encode(self::items($c, $sub, $iva, $total), JSON_UNESCAPED_UNICODE), $google ? '20' : '19', $adv,
             (int) ($c['pagado_en'] ?? $ahora), $ahora, $ahora, self::webhookUrl() !== '' ? 'pendiente' : 'no_configurado', $ahora]);
        $id = (int) Db::valor("SELECT id FROM facturas WHERE tipo = 'factura' AND compra_id = ?", [$c['id']]);
        self::evento($id, 'creada', 'Compra N° ' . $c['id'] . ' (' . ($c['canal'] ?? 'web_plux') . ', ' . Http::dinero($total) . ')' . ($adv ? ' · ' . $adv : ''), 'juego');
        self::empujarLuego($id);
        return $id;
    }

    /**
     * Nota de crédito de una compra revertida. Si el ERP todavía no había recibido la factura, la factura queda "no_aplica"
     * (no se emitió nada: no hace falta nota de crédito). A consumidor final no se emite (SRI 2026): queda "no_aplica".
     * Idempotente. Devuelve el id de la nota de crédito o null.
     */
    public static function crearNotaCredito(int $compraId, string $tipo, string $detalle = ''): ?int
    {
        $f = Db::fila("SELECT * FROM facturas WHERE tipo = 'factura' AND compra_id = ?", [$compraId]);
        if (!$f) return null;
        if (Db::valor("SELECT id FROM facturas WHERE tipo = 'nota_credito' AND compra_id = ?", [$compraId])) return null;
        $ahora = self::ahora();
        $nombre = $tipo === 'contracargo' ? 'Contracargo' : 'Reembolso';
        $noEntregada = $f['entregada_en'] === null && $f['webhook_estado'] !== 'entregado';
        if (in_array($f['estado'], ['pendiente', 'fallida', 'no_aplica'], true) && ($noEntregada || $f['estado'] !== 'pendiente') && $f['numero_autorizacion'] === null) {
            if ($f['estado'] !== 'no_aplica') {
                Db::q("UPDATE facturas SET estado = 'no_aplica', ultimo_error = ?, actualizado = ? WHERE id = ?", [$nombre . ' antes de emitir la factura: no se emite', $ahora, $f['id']]);
                self::evento((int) $f['id'], 'no_aplica', $nombre . ' de la compra antes de que el ERP emitiera la factura' . ($detalle !== '' ? ': ' . $detalle : ''), 'juego');
            }
            return null;
        }
        $cf = $f['comprador_tipo_id'] === '07';
        $motivo = mb_substr($nombre . ' de la compra N° ' . $compraId . ($detalle !== '' ? ' (' . $detalle . ')' : ''), 0, 300);
        Db::q("INSERT OR IGNORE INTO facturas (tipo, compra_id, factura_id, jugador_id, canal, estado, comprador_tipo_id, comprador_identificacion, comprador_razon_social,
                 comprador_email, comprador_telefono, comprador_direccion, subtotal, iva, total, iva_pct, items_json, forma_pago, motivo, advertencia, fecha_venta,
                 creado, actualizado, ultimo_error, webhook_estado, webhook_proximo)
               VALUES ('nota_credito', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [$compraId, $f['id'], $f['jugador_id'], $f['canal'], $cf ? 'no_aplica' : 'pendiente', $f['comprador_tipo_id'], $f['comprador_identificacion'],
             $f['comprador_razon_social'], $f['comprador_email'], $f['comprador_telefono'], $f['comprador_direccion'], $f['subtotal'], $f['iva'], $f['total'],
             $f['iva_pct'], $f['items_json'], $f['forma_pago'], $motivo, $cf ? 'Factura a consumidor final: desde 2026 el SRI no permite nota de crédito (devolver el dinero sin comprobante o consultar al contador).' : null,
             $ahora, $ahora, $ahora, $cf ? 'Consumidor final: el SRI no permite nota de crédito' : null,
             !$cf && self::webhookUrl() !== '' ? 'pendiente' : 'no_configurado', $ahora]);
        $id = (int) Db::valor("SELECT id FROM facturas WHERE tipo = 'nota_credito' AND compra_id = ?", [$compraId]);
        self::evento($id, $cf ? 'no_aplica' : 'creada', $motivo . ' · modifica la factura ' . self::referencia($f), 'juego');
        if ($cf) Db::aviso('nota_credito_consumidor_final', 'Compra N° ' . $compraId . ': ' . $nombre . ' de una venta facturada a consumidor final (' . self::referencia($f) . '). El SRI no permite nota de crédito: revisar con el contador.', $compraId);
        else self::empujarLuego($id);
        return $id;
    }

    public static function evento(int $factura, string $evento, string $detalle, string $quien): void
    {
        Db::q('INSERT INTO facturacion_eventos (factura_id, evento, detalle, quien, creado) VALUES (?, ?, ?, ?, ?)',
            [$factura, $evento, mb_substr($detalle, 0, 1000), mb_substr($quien, 0, 80), self::ahora()]);
    }

    // ============================================================================================ lo que ve el ERP
    public static function referencia(array $f): string { return ($f['tipo'] === 'nota_credito' ? 'EVN-' : 'EVF-') . str_pad((string) $f['id'], 6, '0', STR_PAD_LEFT); }

    /** El comprobante como lo recibe el ERP (docs/FACTURACION_SRI.md §3). */
    public static function json(array $f): array
    {
        $c = Db::fila('SELECT id, canal, plux_transaccion, google_order_id, pagado_en, producto FROM compras WHERE id = ?', [$f['compra_id']]);
        $mod = null;
        if ($f['factura_id'] !== null) {
            $m = Db::fila('SELECT * FROM facturas WHERE id = ?', [$f['factura_id']]);
            if ($m) $mod = ['id' => (int) $m['id'], 'referencia' => self::referencia($m), 'estado' => $m['estado'], 'numero_autorizacion' => $m['numero_autorizacion'],
                'clave_acceso' => $m['clave_acceso'], 'numero_comprobante' => $m['numero_comprobante'], 'fecha_emision' => $m['autorizada_en'] !== null ? date('Y-m-d', (int) $m['autorizada_en']) : null];
        }
        $google = ($f['canal'] ?? '') === 'google_play';
        return [
            'id' => (int) $f['id'], 'referencia' => self::referencia($f), 'tipo' => $f['tipo'], 'estado' => $f['estado'],
            'intentos' => (int) $f['intentos'], 'ultimo_error' => $f['ultimo_error'],
            'compra' => ['id' => (int) $f['compra_id'], 'canal' => $f['canal'], 'producto' => $c['producto'] ?? null,
                'transaccion' => $c ? ($google ? $c['google_order_id'] : $c['plux_transaccion']) : null,
                'pagado_en' => $c && $c['pagado_en'] !== null ? Db::iso((int) $c['pagado_en']) : null],
            'fecha_venta' => date('Y-m-d', (int) $f['fecha_venta']),
            'comprador' => ['tipo_identificacion' => $f['comprador_tipo_id'], 'tipo_identificacion_nombre' => self::TIPOS_ID[$f['comprador_tipo_id']] ?? 'otro',
                'identificacion' => $f['comprador_identificacion'], 'razon_social' => $f['comprador_razon_social'], 'email' => $f['comprador_email'],
                'telefono' => $f['comprador_telefono'], 'direccion' => $f['comprador_direccion'], 'consumidor_final' => $f['comprador_tipo_id'] === '07'],
            'items' => json_decode((string) $f['items_json'], true) ?: [],
            'subtotal' => round((float) $f['subtotal'], 2), 'iva' => round((float) $f['iva'], 2), 'iva_tarifa' => (float) $f['iva_pct'], 'iva_codigo' => self::IVA_CODIGO,
            'total' => round((float) $f['total'], 2), 'moneda' => 'USD',
            'forma_pago' => ['codigo' => $f['forma_pago'], 'nombre' => $f['forma_pago'] === '20' ? 'Otros con utilización del sistema financiero' : 'Tarjeta de crédito', 'total' => round((float) $f['total'], 2)],
            'motivo' => $f['motivo'], 'factura_modificada' => $mod, 'advertencia' => $f['advertencia'],
            'sri' => ['numero_autorizacion' => $f['numero_autorizacion'], 'clave_acceso' => $f['clave_acceso'], 'numero_comprobante' => $f['numero_comprobante'],
                'autorizada_en' => $f['autorizada_en'] !== null ? Db::iso((int) $f['autorizada_en']) : null],
            'creado' => Db::iso((int) $f['creado']),
        ];
    }

    /** ¿Se le puede pedir al ERP ahora? (pendiente o en proceso, pasada la espera; una nota de crédito, con su factura autorizada) */
    private const SQL_LISTA = "f.estado IN ('pendiente', 'en_proceso') AND f.proximo_intento <= ?
        AND (f.tipo = 'factura' OR EXISTS (SELECT 1 FROM facturas m WHERE m.id = f.factura_id AND m.estado = 'autorizada'))";

    /** GET /api/facturacion/pendientes: los que el ERP debe emitir, en orden. Marca la primera entrega. */
    public static function pendientes(int $limite = 50, int $desdeId = 0): array
    {
        $limite = max(1, min(200, $limite));
        $ahora = self::ahora();
        $filas = Db::todas('SELECT f.* FROM facturas f WHERE ' . self::SQL_LISTA . ' AND f.id > ? ORDER BY f.id LIMIT ' . ($limite + 1), [$ahora, $desdeId]);
        $hayMas = count($filas) > $limite;
        $filas = array_slice($filas, 0, $limite);
        $nuevas = array_values(array_filter(array_map(fn($f) => $f['entregada_en'] === null ? (int) $f['id'] : 0, $filas)));
        if ($nuevas) Db::q('UPDATE facturas SET entregada_en = ? WHERE entregada_en IS NULL AND id IN (' . implode(',', $nuevas) . ')', [$ahora]);
        Ajustes::set('facturacion_ultimo_erp', (string) $ahora);
        return ['ok' => true, 'ahora' => Db::iso($ahora), 'comprobantes' => array_map(fn($f) => self::json(Db::fila('SELECT * FROM facturas WHERE id = ?', [$f['id']])), $filas),
            'hay_mas' => $hayMas];
    }

    public static function porId(int $id): ?array { return Db::fila('SELECT * FROM facturas WHERE id = ?', [$id]); }

    /**
     * POST /api/facturacion/confirmar {id, estado, numero_autorizacion, clave_acceso, numero_comprobante?, fecha_autorizacion?, mensaje?}.
     * Idempotente: repetir la misma confirmación responde "sin_cambios". Una autorizada no cambia nunca (409 si llega otra
     * clave). "error" = falla pasajera: espera creciente (1, 2, 4... minutos, hasta 6 h) y a los MAX_ERRORES pasa a "fallida".
     * "rechazada" (SRI: devuelta / no autorizada) pasa a "fallida" (se corrige y se reintenta desde el Centro de Control).
     */
    public static function confirmar(array $in, string $quien = 'erp'): array
    {
        $id = filter_var($in['id'] ?? null, FILTER_VALIDATE_INT);
        if (!is_int($id) || $id < 1) throw new Fallo('Falta "id" (número del comprobante).', 400, ['codigo' => 'falta_id']);
        $estado = self::ESTADOS_ERP[strtolower(trim((string) (is_scalar($in['estado'] ?? null) ? $in['estado'] : '')))] ?? null;
        if ($estado === null) throw new Fallo('"estado" debe ser autorizada, en_proceso, rechazada, error o no_aplica.', 422, ['codigo' => 'facturacion_estado_invalido']);
        $clave = preg_replace('/\D/', '', (string) (is_scalar($in['clave_acceso'] ?? null) ? $in['clave_acceso'] : '')) ?? '';
        $aut = preg_replace('/\D/', '', (string) (is_scalar($in['numero_autorizacion'] ?? null) ? $in['numero_autorizacion'] : '')) ?? '';
        $num = trim((string) (is_scalar($in['numero_comprobante'] ?? null) ? $in['numero_comprobante'] : ''));
        $msg = self::texto($in['mensaje'] ?? '', 500);
        if ($estado === 'autorizada') {
            if (!preg_match('/^\d{49}$/', $clave)) throw new Fallo('Para "autorizada" falta "clave_acceso" (49 dígitos).', 422, ['codigo' => 'facturacion_autorizacion_invalida']);
            if ($aut === '') $aut = $clave;
            if (!preg_match('/^\d{10,49}$/', $aut)) throw new Fallo('"numero_autorizacion" no es válido (10 a 49 dígitos).', 422, ['codigo' => 'facturacion_autorizacion_invalida']);
            if ($num !== '' && !preg_match('/^\d{3}-\d{3}-\d{9}$/', $num)) throw new Fallo('"numero_comprobante" debe ser 001-001-000000123.', 422, ['codigo' => 'facturacion_autorizacion_invalida']);
        }
        $fechaAut = null;
        if (is_string($in['fecha_autorizacion'] ?? null) && ($t = strtotime($in['fecha_autorizacion'])) !== false) $fechaAut = $t;
        return Db::tx(function () use ($id, $estado, $clave, $aut, $num, $msg, $fechaAut, $quien): array {
            $f = self::porId($id);
            if (!$f) throw new Fallo('No existe el comprobante ' . $id . '.', 404, ['codigo' => 'facturacion_no_existe']);
            $ahora = self::ahora();
            $r = fn(string $res) => ['ok' => true, 'id' => (int) $f['id'], 'referencia' => self::referencia($f), 'estado' => (string) self::porId($id)['estado'], 'resultado' => $res];
            if ($f['estado'] === 'autorizada') {
                if ($estado === 'autorizada' && $f['clave_acceso'] === $clave) return $r('sin_cambios');
                throw new Fallo('El comprobante ' . self::referencia($f) . ' ya está autorizado' . ($estado === 'autorizada' ? ' con otra clave de acceso' : '') . ': no se cambia.', 409, ['codigo' => 'facturacion_ya_autorizada', 'clave_acceso' => $f['clave_acceso']]);
            }
            if ($f['estado'] === 'no_aplica' && $estado !== 'no_aplica') throw new Fallo('El comprobante ' . self::referencia($f) . ' está marcado "no aplica" (no se emite).', 409, ['codigo' => 'facturacion_estado_final']);
            if ($f['tipo'] === 'nota_credito' && $estado === 'autorizada' && !Db::valor("SELECT 1 FROM facturas WHERE id = ? AND estado = 'autorizada'", [$f['factura_id']])) {
                throw new Fallo('La nota de crédito necesita su factura autorizada primero.', 409, ['codigo' => 'facturacion_factura_sin_autorizar']);
            }
            switch ($estado) {
                case 'autorizada':
                    if (Db::valor('SELECT id FROM facturas WHERE clave_acceso = ? AND id <> ?', [$clave, $id])) throw new Fallo('Esa clave de acceso ya es de otro comprobante.', 409, ['codigo' => 'facturacion_clave_repetida']);
                    Db::q("UPDATE facturas SET estado = 'autorizada', numero_autorizacion = ?, clave_acceso = ?, numero_comprobante = NULLIF(?, ''), autorizada_en = ?,
                             ultimo_error = NULL, entregada_en = COALESCE(entregada_en, ?), actualizado = ? WHERE id = ?",
                        [$aut, $clave, $num, $fechaAut ?? $ahora, $ahora, $ahora, $id]);
                    self::evento($id, 'autorizada', 'Clave ' . $clave . ($num !== '' ? ' · ' . $num : ''), $quien);
                    // Si tiene una nota de crédito esperando, ya se puede avisar al ERP
                    foreach (Db::todas("SELECT id FROM facturas WHERE factura_id = ? AND estado = 'pendiente'", [$id]) as $nc) self::empujarLuego((int) $nc['id']);
                    return $r('actualizado');
                case 'en_proceso':
                    if ($f['estado'] === 'en_proceso') return $r('sin_cambios');
                    Db::q("UPDATE facturas SET estado = 'en_proceso', entregada_en = COALESCE(entregada_en, ?), ultimo_error = NULLIF(?, ''), actualizado = ? WHERE id = ?", [$ahora, $msg, $ahora, $id]);
                    self::evento($id, 'en_proceso', $msg, $quien);
                    return $r('actualizado');
                case 'no_aplica':
                    if ($f['estado'] === 'no_aplica') return $r('sin_cambios');
                    Db::q("UPDATE facturas SET estado = 'no_aplica', ultimo_error = NULLIF(?, ''), actualizado = ? WHERE id = ?", [$msg, $ahora, $id]);
                    self::evento($id, 'no_aplica', $msg, $quien);
                    return $r('actualizado');
                case 'rechazada':
                    if ($f['estado'] === 'fallida' && (string) $f['ultimo_error'] === 'SRI: ' . $msg) return $r('sin_cambios');
                    Db::q("UPDATE facturas SET estado = 'fallida', ultimo_error = ?, entregada_en = COALESCE(entregada_en, ?), actualizado = ? WHERE id = ?", ['SRI: ' . $msg, $ahora, $ahora, $id]);
                    self::evento($id, 'rechazada', $msg, $quien);
                    Db::aviso('factura_rechazada', 'El SRI no autorizó ' . self::referencia($f) . ' (compra N° ' . $f['compra_id'] . '): ' . ($msg !== '' ? $msg : 'sin detalle') . '. Corregir en el ERP y reintentar en Centro de Control > Facturación.', (int) $f['compra_id']);
                    return $r('actualizado');
                default:   // error pasajero: reintento con espera creciente
                    if ($f['estado'] === 'fallida') return $r('sin_cambios');
                    if ((int) $f['proximo_intento'] > $ahora && (string) $f['ultimo_error'] === $msg) return $r('sin_cambios');   // el mismo aviso repetido
                    $n = (int) $f['intentos'] + 1;
                    $falla = $n >= self::MAX_ERRORES;
                    Db::q('UPDATE facturas SET estado = ?, intentos = ?, proximo_intento = ?, ultimo_error = ?, entregada_en = COALESCE(entregada_en, ?), actualizado = ? WHERE id = ?',
                        [$falla ? 'fallida' : 'pendiente', $n, $ahora + self::espera($n), $msg, $ahora, $ahora, $id]);
                    self::evento($id, $falla ? 'fallida' : 'error', 'Intento ' . $n . ': ' . $msg, $quien);
                    if ($falla) Db::aviso('factura_fallida', self::referencia($f) . ' (compra N° ' . $f['compra_id'] . ') falló ' . $n . ' veces en el ERP: ' . $msg, (int) $f['compra_id']);
                    return $r('actualizado');
            }
        });
    }

    /** Espera antes del siguiente intento tras $n errores: 1, 2, 4, 8... minutos, como máximo 6 horas. */
    public static function espera(int $n): int { return (int) min(21600, 60 * 2 ** max(0, $n - 1)); }

    // ============================================================================================ firma HMAC
    /**
     * Texto que se firma: MÉTODO \n RUTA (con ?parámetros, tal como va en la petición) \n FECHA (segundos Unix) \n NONCE \n
     * sha256(cuerpo) en hexadecimal. Firma = HMAC-SHA256(texto, FACTURACION_CLAVE) en hexadecimal.
     */
    public static function textoFirma(string $metodo, string $uri, string $fecha, string $nonce, string $cuerpo): string
    {
        return strtoupper($metodo) . "\n" . $uri . "\n" . $fecha . "\n" . $nonce . "\n" . hash('sha256', $cuerpo);
    }

    /** Cabeceras firmadas (las usa el aviso al ERP y las pruebas; el ERP hace lo mismo, ver docs/FACTURACION_SRI.md §2). */
    public static function firmar(string $metodo, string $uri, string $cuerpo, string $clave, ?int $fecha = null, ?string $nonce = null): array
    {
        $fecha ??= self::ahora();
        $nonce ??= bin2hex(random_bytes(16));
        return ['X-Factura-Fecha' => (string) $fecha, 'X-Factura-Nonce' => $nonce,
            'X-Factura-Firma' => hash_hmac('sha256', self::textoFirma($metodo, $uri, (string) $fecha, $nonce, $cuerpo), $clave)];
    }

    /** Revisa una petición del ERP. Lanza Fallo (503 sin configurar, 403 IP, 429 demasiadas firmas malas, 401 firma). */
    public static function autenticar(string $metodo, string $uri, string $cuerpo, string $fecha, string $nonce, string $firma, string $ip): void
    {
        if (!self::claveLista()) throw new Fallo('La facturación no está configurada (FACTURACION_CLAVE, 32 caracteres o más).', 503, ['codigo' => 'facturacion_no_configurada']);
        if (!Control::ipPermitida($ip, Config::get('FACTURACION_IPS'))) throw new Fallo('IP no permitida.', 403, ['codigo' => 'facturacion_ip_no_permitida']);
        if (Limite::excedido('factmal:' . $ip, 20, 10)) throw new Fallo('Demasiadas firmas equivocadas. Espera unos minutos.', 429, ['codigo' => 'limite_intentos']);
        $mal = function (string $texto, string $codigo) use ($ip): never {
            Limite::sumar('factmal:' . $ip);
            throw new Fallo($texto, 401, ['codigo' => $codigo]);
        };
        if (!preg_match('/^\d{9,11}$/', $fecha) || abs(self::ahora() - (int) $fecha) > self::VENTANA_FIRMA) $mal('X-Factura-Fecha falta o el reloj está desfasado (más de 5 minutos).', 'facturacion_fecha_invalida');
        if (!preg_match('/^[A-Za-z0-9_-]{16,64}$/', $nonce)) $mal('X-Factura-Nonce falta (16 a 64 letras o números).', 'facturacion_firma_invalida');
        $esperada = hash_hmac('sha256', self::textoFirma($metodo, $uri, $fecha, $nonce, $cuerpo), self::clave());
        if (!preg_match('/^[a-f0-9]{64}$/', strtolower($firma)) || !hash_equals($esperada, strtolower($firma))) $mal('Firma equivocada.', 'facturacion_firma_invalida');
        Db::q('DELETE FROM facturacion_nonces WHERE creado < ?', [self::ahora() - self::NONCE_VIDA]);
        if (Db::q('INSERT OR IGNORE INTO facturacion_nonces (nonce, creado) VALUES (?, ?)', [$nonce, self::ahora()])->rowCount() !== 1) {
            $mal('Esa petición ya se recibió (nonce repetido).', 'facturacion_nonce_repetido');
        }
    }

    // ============================================================================================ aviso (webhook) al ERP
    private static function empujarLuego(int $id): void
    {
        if (self::webhookUrl() === '' || !self::$empujarAlTerminar) return;
        self::$porEmpujar[] = $id;
        if (self::$apagadoRegistrado) return;
        self::$apagadoRegistrado = true;
        register_shutdown_function(static function (): void {
            if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();   // el jugador ya tiene su respuesta
            foreach (array_unique(self::$porEmpujar) as $id) {
                try { self::empujar($id); } catch (\Throwable $e) { error_log('EN VIVO facturacion: aviso ' . $id . ' ' . mb_substr($e->getMessage(), 0, 200)); }
            }
            self::$porEmpujar = [];
        });
    }

    /**
     * Manda UN comprobante al ERP (POST FACTURACION_WEBHOOK_URL, firmado). 2xx = entregado; si la respuesta trae
     * {"estado": ...} se aplica como una confirmación. Si falla, espera creciente (WEBHOOK_ESPERAS) y a los WEBHOOK_MAX
     * intentos se deja de avisar ("agotado": el ERP igual lo ve en /pendientes). Devuelve true si se entregó.
     */
    public static function empujar(int $id): bool
    {
        $url = self::webhookUrl();
        $f = self::porId($id);
        if ($url === '' || !$f || in_array($f['webhook_estado'], ['entregado', 'agotado'], true)) return false;
        if (!Db::valor('SELECT 1 FROM facturas f WHERE f.id = ? AND ' . self::SQL_LISTA, [$id, PHP_INT_MAX])) return false;   // no está lista (ej. NC sin factura autorizada)
        $cuerpo = (string) json_encode(['evento' => $f['tipo'] === 'nota_credito' ? 'nota_credito_pendiente' : 'factura_pendiente', 'enviado' => Db::iso(self::ahora()), 'comprobante' => self::json($f)],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $uri = (string) (parse_url($url, PHP_URL_PATH) ?: '/') . (($q = parse_url($url, PHP_URL_QUERY)) ? '?' . $q : '');
        $cab = ['Content-Type: application/json', 'User-Agent: EnVivoTycoon-Facturacion/1', 'X-Factura-Evento: ' . ($f['tipo'] === 'nota_credito' ? 'nota_credito_pendiente' : 'factura_pendiente')];
        foreach (self::firmar('POST', $uri, $cuerpo, self::clave()) as $k => $v) $cab[] = $k . ': ' . $v;
        [$http, $resp, $err] = self::post($url, $cuerpo, $cab);
        $ahora = self::ahora();
        if ($http >= 200 && $http < 300) {
            Db::q("UPDATE facturas SET webhook_estado = 'entregado', webhook_intentos = webhook_intentos + 1, webhook_error = NULL, entregada_en = COALESCE(entregada_en, ?), actualizado = ? WHERE id = ?", [$ahora, $ahora, $id]);
            self::evento($id, 'webhook', 'Aviso entregado al ERP (HTTP ' . $http . ')', 'juego');
            $j = json_decode($resp, true);
            if (is_array($j) && isset($j['estado'])) {
                try { self::confirmar(['id' => $id] + $j, 'erp:webhook'); }
                catch (Fallo $e) { self::evento($id, 'webhook', 'La respuesta del ERP no se pudo aplicar: ' . $e->getMessage(), 'juego'); }
            }
            return true;
        }
        $n = (int) $f['webhook_intentos'] + 1;
        $agotado = $n >= self::WEBHOOK_MAX;
        $error = mb_substr($err !== '' ? $err : 'HTTP ' . $http . ' ' . preg_replace('/\s+/', ' ', mb_substr($resp, 0, 200)), 0, 300);
        Db::q('UPDATE facturas SET webhook_estado = ?, webhook_intentos = ?, webhook_proximo = ?, webhook_error = ?, actualizado = ? WHERE id = ?',
            [$agotado ? 'agotado' : 'pendiente', $n, $ahora + self::WEBHOOK_ESPERAS[min($n - 1, count(self::WEBHOOK_ESPERAS) - 1)], $error, $ahora, $id]);
        self::evento($id, 'webhook', 'Aviso al ERP falló (intento ' . $n . ($agotado ? ', ya no se reintenta: queda en /pendientes' : '') . '): ' . $error, 'juego');
        return false;
    }

    /** @return array{0:int,1:string,2:string} [http, cuerpo, error] */
    private static function post(string $url, string $cuerpo, array $cab): array
    {
        if (!function_exists('curl_init')) return [0, '', 'falta la extensión curl de PHP'];
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $cuerpo, CURLOPT_HTTPHEADER => $cab, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP]);
        $r = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = $r === false ? 'sin respuesta: ' . curl_error($ch) : '';
        curl_close($ch);
        return [$http, is_string($r) ? mb_substr($r, 0, 20000) : '', $err];
    }

    /** Cron: manda los avisos que tocan. Devuelve [entregados, fallidos]. */
    public static function empujarPendientes(int $max = 50): array
    {
        if (self::webhookUrl() === '') return [0, 0];
        $ok = 0; $mal = 0;
        // Las que quedaron "no_configurado" (se creó sin URL y luego se configuró) también se avisan
        $ids = Db::todas("SELECT f.id FROM facturas f WHERE f.webhook_estado IN ('pendiente', 'no_configurado') AND f.webhook_proximo <= ? AND " . self::SQL_LISTA . ' ORDER BY f.id LIMIT ' . max(1, $max),
            [self::ahora(), self::ahora()]);
        foreach ($ids as $r) { if (self::empujar((int) $r['id'])) $ok++; else $mal++; }
        return [$ok, $mal];
    }

    // ============================================================================================ panel y alertas
    /** Conteos para el Centro de Control y la alerta. */
    public static function resumen(): array
    {
        $ahora = self::ahora();
        $hoy = strtotime('today', $ahora);
        $o = ['pendiente' => 0, 'en_proceso' => 0, 'autorizada' => 0, 'fallida' => 0, 'no_aplica' => 0];
        foreach (Db::todas('SELECT estado, COUNT(*) n FROM facturas GROUP BY estado') as $r) $o[$r['estado']] = (int) $r['n'];
        $o['atrasadas'] = (int) Db::valor("SELECT COUNT(*) FROM facturas f WHERE f.estado IN ('pendiente', 'en_proceso') AND f.creado < ?
            AND (f.tipo = 'factura' OR EXISTS (SELECT 1 FROM facturas m WHERE m.id = f.factura_id AND m.estado = 'autorizada'))", [$ahora - self::ATRASO_SEG]);
        $o['mas_antigua'] = Db::valor("SELECT MIN(creado) FROM facturas f WHERE f.estado IN ('pendiente', 'en_proceso')
            AND (f.tipo = 'factura' OR EXISTS (SELECT 1 FROM facturas m WHERE m.id = f.factura_id AND m.estado = 'autorizada'))");
        $o['autorizadas_hoy'] = (int) Db::valor("SELECT COUNT(*) FROM facturas WHERE estado = 'autorizada' AND autorizada_en >= ?", [$hoy]);
        $o['notas_esperando_factura'] = (int) Db::valor("SELECT COUNT(*) FROM facturas f WHERE f.tipo = 'nota_credito' AND f.estado = 'pendiente'
            AND NOT EXISTS (SELECT 1 FROM facturas m WHERE m.id = f.factura_id AND m.estado = 'autorizada')");
        $o['ultimo_erp'] = ($u = Ajustes::get('facturacion_ultimo_erp')) !== '' ? (int) $u : null;
        return $o;
    }

    /**
     * Alerta: comprobantes con más de 1 hora sin autorizar (el SRI pide autorización inmediata) o fallidos. Deja un aviso en
     * el Centro de Control (tipo factura_atrasada) y, si está FACTURACION_ALERTA_CMD (ej. /usr/local/bin/alerta-telegram.sh),
     * lo corre con el mensaje. Como máximo una vez al día, salvo que aparezcan comprobantes atrasados NUEVOS (entonces cada hora).
     * Devuelve el mensaje si avisó, o null.
     */
    public static function revisarAtrasos(): ?string
    {
        $ahora = self::ahora();
        $r = self::resumen();
        if ($r['atrasadas'] + $r['fallida'] === 0) return null;
        $maxId = (int) Db::valor("SELECT COALESCE(MAX(id), 0) FROM facturas WHERE (estado IN ('pendiente', 'en_proceso') AND creado < ?) OR estado = 'fallida'", [$ahora - self::ATRASO_SEG]);
        $ultima = (int) Ajustes::get('facturacion_alerta_en', '0');
        $ultMax = (int) Ajustes::get('facturacion_alerta_max_id', '0');
        $toca = $ahora - $ultima >= 86400 || ($maxId > $ultMax && $ahora - $ultima >= 3600);
        if (!$toca) return null;
        $horas = $r['mas_antigua'] !== null ? max(1, intdiv($ahora - (int) $r['mas_antigua'], 3600)) : 0;
        $msg = 'EN VIVO Tycoon · Facturación SRI: ' . $r['atrasadas'] . ' comprobante(s) con más de 1 hora sin autorizar'
            . ($horas > 0 ? ' (el más antiguo hace ' . $horas . ' h)' : '') . ' y ' . $r['fallida'] . ' fallido(s). '
            . 'El SRI exige autorización inmediata: revisa el ERP y Centro de Control > Facturación.'
            . ($r['ultimo_erp'] !== null ? ' Último contacto del ERP: ' . date('d/m/Y H:i', $r['ultimo_erp']) . '.' : ' El ERP todavía no se ha conectado nunca.');
        Db::aviso('factura_atrasada', $msg);
        Ajustes::set('facturacion_alerta_en', (string) $ahora);
        Ajustes::set('facturacion_alerta_max_id', (string) $maxId);
        $cmd = Config::get('FACTURACION_ALERTA_CMD');
        if ($cmd !== '' && is_file($cmd) && is_executable($cmd)) {
            $o = []; $rc = 0;
            @exec(escapeshellarg($cmd) . ' ' . escapeshellarg($msg) . ' > /dev/null 2>&1', $o, $rc);
            if ($rc !== 0) Db::aviso('factura_atrasada', 'No se pudo mandar la alerta con FACTURACION_ALERTA_CMD (código ' . $rc . ').');
        }
        return $msg;
    }

    /** Centro de Control: vuelve a pedir al ERP un comprobante fallido, "no aplica" o en espera (empieza de cero). */
    public static function reintentar(int $id, string $quien): bool
    {
        return Db::tx(function () use ($id, $quien): bool {
            $f = self::porId($id);
            if (!$f || $f['estado'] === 'autorizada') return false;
            Db::q("UPDATE facturas SET estado = 'pendiente', intentos = 0, proximo_intento = 0, ultimo_error = NULL,
                     webhook_estado = CASE WHEN webhook_estado = 'entregado' OR webhook_estado = 'agotado' THEN 'pendiente' ELSE webhook_estado END,
                     webhook_intentos = 0, webhook_proximo = 0, actualizado = ? WHERE id = ?", [self::ahora(), $id]);
            self::evento($id, 'reintento', 'Desde el estado ' . $f['estado'], $quien);
            self::empujarLuego($id);
            return true;
        });
    }

    /** Centro de Control: marcar que un comprobante no se emite (ej. venta de prueba). */
    public static function marcarNoAplica(int $id, string $motivo, string $quien): bool
    {
        return Db::tx(function () use ($id, $motivo, $quien): bool {
            $f = self::porId($id);
            if (!$f || in_array($f['estado'], ['autorizada', 'no_aplica'], true)) return false;
            Db::q("UPDATE facturas SET estado = 'no_aplica', ultimo_error = ?, actualizado = ? WHERE id = ?", [mb_substr('No aplica: ' . $motivo, 0, 300), self::ahora(), $id]);
            self::evento($id, 'no_aplica', $motivo, $quien);
            return true;
        });
    }

    /**
     * Crea las facturas que falten de compras pagadas desde $desde (para lo vendido antes de instalar este módulo).
     * Idempotente. Devuelve cuántas creó.
     */
    public static function rellenar(int $desde, int $max = 5000): int
    {
        $n = 0;
        $google = self::facturaGoogle() ? '' : " AND COALESCE(c.canal, 'web_plux') <> 'google_play'";
        foreach (Db::todas("SELECT c.* FROM compras c WHERE c.estado IN ('pagado', 'revertido') AND c.pagado_en >= ?" . $google . "
                AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.tipo = 'factura' AND f.compra_id = c.id) ORDER BY c.id LIMIT " . max(1, $max), [$desde]) as $c) {
            Db::tx(function () use ($c, &$n): void {
                if (self::crearFactura($c) !== null) $n++;
                if ($c['estado'] === 'revertido') self::crearNotaCredito((int) $c['id'], (string) ($c['revertida_tipo'] ?? 'reembolso'), (string) ($c['revertida_motivo'] ?? ''));
            });
        }
        return $n;
    }
}
