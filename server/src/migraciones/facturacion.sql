-- Facturación electrónica SRI (server/src/Facturacion.php, docs/FACTURACION_SRI.md, server/INTEGRAR_FACTURACION.md).
-- Desde el 1 de enero de 2026 el SRI exige autorizar cada comprobante de inmediato: el juego deja aquí cada factura y
-- nota de crédito "pendiente" y el ERP del dueño (sistema aparte, con su sincronizador del SRI) las toma por la API
-- firmada (GET /api/facturacion/pendientes) o por el aviso (webhook) y confirma la autorización (POST /api/facturacion/confirmar).
-- Seguro de correr otra vez (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('factura', 'nota_credito')),
    compra_id INTEGER NOT NULL,
    factura_id INTEGER REFERENCES facturas(id),          -- nota de crédito: la factura que modifica
    jugador_id INTEGER,
    canal TEXT NOT NULL DEFAULT 'web_plux',
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_proceso', 'autorizada', 'fallida', 'no_aplica')),
    -- Comprador (tabla 6 del SRI: 04 RUC, 05 cédula, 06 pasaporte, 07 consumidor final)
    comprador_tipo_id TEXT NOT NULL,
    comprador_identificacion TEXT NOT NULL,
    comprador_razon_social TEXT NOT NULL,
    comprador_email TEXT,
    comprador_telefono TEXT,
    comprador_direccion TEXT,
    -- Valores (USD, IVA incluido en el precio del catálogo; Catalogo::desglose)
    subtotal REAL NOT NULL,
    iva REAL NOT NULL,
    total REAL NOT NULL,
    iva_pct REAL NOT NULL DEFAULT 15,
    items_json TEXT NOT NULL,
    forma_pago TEXT NOT NULL DEFAULT '19',
    motivo TEXT,                                          -- nota de crédito: por qué (reembolso / contracargo)
    advertencia TEXT,                                     -- algo que el dueño debe revisar (no detiene el envío)
    fecha_venta INTEGER NOT NULL,                         -- cuándo se pagó (o se revirtió, en la nota de crédito)
    creado INTEGER NOT NULL,
    actualizado INTEGER NOT NULL,
    -- Entrega al ERP y reintentos
    entregada_en INTEGER,                                 -- primera vez que el ERP la recibió (pendientes o webhook)
    intentos INTEGER NOT NULL DEFAULT 0,                  -- errores que reportó el ERP (con espera creciente)
    proximo_intento INTEGER NOT NULL DEFAULT 0,
    ultimo_error TEXT,
    -- Resultado del SRI (lo manda el ERP)
    numero_autorizacion TEXT,
    clave_acceso TEXT,
    numero_comprobante TEXT,                              -- 001-001-000000123
    autorizada_en INTEGER,
    -- Aviso (webhook) opcional al ERP
    webhook_estado TEXT NOT NULL DEFAULT 'no_configurado',
    webhook_intentos INTEGER NOT NULL DEFAULT 0,
    webhook_proximo INTEGER NOT NULL DEFAULT 0,
    webhook_error TEXT,
    UNIQUE (tipo, compra_id)
);
CREATE INDEX IF NOT EXISTS facturas_estado ON facturas (estado, proximo_intento);
CREATE INDEX IF NOT EXISTS facturas_compra ON facturas (compra_id);
CREATE INDEX IF NOT EXISTS facturas_webhook ON facturas (webhook_estado, webhook_proximo);
CREATE UNIQUE INDEX IF NOT EXISTS facturas_clave_acceso ON facturas (clave_acceso) WHERE clave_acceso IS NOT NULL;

-- Datos de la factura que el comprador eligió en la página de pago (antes de cobrar; nunca datos de tarjeta)
CREATE TABLE IF NOT EXISTS facturacion_datos_compra (
    compra_id INTEGER PRIMARY KEY,
    datos_json TEXT NOT NULL,
    creado INTEGER NOT NULL
);

-- Firmas ya usadas (contra repetición de peticiones del ERP): se borran a los 15 minutos
CREATE TABLE IF NOT EXISTS facturacion_nonces (
    nonce TEXT PRIMARY KEY,
    creado INTEGER NOT NULL
);

-- Historial de cada comprobante (lo que pasó y quién)
CREATE TABLE IF NOT EXISTS facturacion_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER NOT NULL,
    evento TEXT NOT NULL,
    detalle TEXT,
    quien TEXT NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS facturacion_eventos_factura ON facturacion_eventos (factura_id, id);
