-- PayPal en la tienda web (server/src/PayPal.php, docs/PAYPAL.md). Se puede aplicar las veces que se quiera.
-- La compra (tabla compras) lleva canal 'web_paypal': Db::ampliarCanales() agrega ese valor a la regla del canal.

-- Cada orden de PayPal es de UNA compra (una compra puede tener varias órdenes si el comprador volvió a intentar,
-- pero solo una se captura: PayPal::capturar no captura si la compra ya está pagada).
CREATE TABLE IF NOT EXISTS paypal_ordenes (
    order_id TEXT PRIMARY KEY,
    compra_id INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'creada',        -- creada, cancelada, pendiente, capturada, rechazada, no_coincide, sin_capturar
    valor REAL NOT NULL,
    capture_id TEXT,
    respuesta TEXT,                               -- lo que respondió PayPal al capturar (sin datos del comprador)
    creado INTEGER NOT NULL,
    actualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS paypal_ordenes_compra ON paypal_ordenes (compra_id, creado);
-- Una captura (el cobro) se aplica a UNA sola orden
CREATE UNIQUE INDEX IF NOT EXISTS paypal_ordenes_captura ON paypal_ordenes (capture_id) WHERE capture_id IS NOT NULL;

-- Avisos (webhook) recibidos: cada evento de PayPal se atiende UNA vez (PayPal reintenta los que no respondimos 2xx)
CREATE TABLE IF NOT EXISTS paypal_eventos (
    evento_id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    recurso_id TEXT,
    compra_id INTEGER,
    resultado TEXT NOT NULL,
    detalle TEXT,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS paypal_eventos_creado ON paypal_eventos (creado);
CREATE INDEX IF NOT EXISTS paypal_eventos_compra ON paypal_eventos (compra_id);
