-- App Store (app de iPhone, StoreKit 2): server/src/Apple.php, docs/IPHONE_APP_STORE.md. Se puede aplicar las veces que se quiera.
-- La compra (tabla compras) lleva canal 'apple': Db::ampliarCanales() agrega ese valor a la regla del canal.

-- Cada transacción de Apple se entrega UNA vez (transactionId único). originalTransactionId: la misma compra al restaurar.
ALTER TABLE compras ADD COLUMN apple_transaccion TEXT;
ALTER TABLE compras ADD COLUMN apple_original TEXT;
ALTER TABLE compras ADD COLUMN apple_ambiente TEXT;          -- Production o Sandbox (revisión de Apple y TestFlight: PRUEBA)
CREATE UNIQUE INDEX IF NOT EXISTS compras_apple_transaccion ON compras (apple_transaccion) WHERE apple_transaccion IS NOT NULL;
CREATE INDEX IF NOT EXISTS compras_apple_original ON compras (apple_original) WHERE apple_original IS NOT NULL;

-- Avisos de Apple (App Store Server Notifications V2): cada uno se atiende UNA vez (Apple repite los que no respondimos 200)
CREATE TABLE IF NOT EXISTS apple_avisos (
    uuid TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    subtipo TEXT NOT NULL DEFAULT '',
    transaccion TEXT,
    resultado TEXT NOT NULL DEFAULT '',
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS apple_avisos_creado ON apple_avisos (creado);
