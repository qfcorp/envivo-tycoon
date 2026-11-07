-- Ventas que se mandan al Panel Tukán Central para anotarlas y facturarlas con TuFactura (src/PanelVentas.php).
-- Una fila por compra y acción; se reintenta hasta que el Panel la recibe. Se puede correr muchas veces.
CREATE TABLE IF NOT EXISTS panel_ventas (
    id INTEGER PRIMARY KEY,
    compra_id INTEGER NOT NULL,
    accion TEXT NOT NULL CHECK (accion IN ('registrar', 'revertir')),
    motivo TEXT,
    prueba INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'error', 'rechazado')),
    intentos INTEGER NOT NULL DEFAULT 0,
    cobro_id INTEGER,
    factura TEXT,
    respuesta TEXT,
    creado INTEGER NOT NULL,
    enviado INTEGER,
    UNIQUE (compra_id, accion)
);
CREATE INDEX IF NOT EXISTS panel_ventas_estado ON panel_ventas (estado);
