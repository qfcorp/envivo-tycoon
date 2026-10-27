-- Nivel VIP forzado desde el Centro de Control (Jugadores -> ficha -> "VIP (pruebas)"): SOLO para probar los niveles sin
-- inventar compras (los ingresos y las facturas del SRI quedan limpios). NULL = se usa el nivel real (el de las compras).
-- Vip::nivel devuelve el forzado si lo hay; Vip::sincronizar sigue llevando el nivel real en vip_jugadores.nivel.
ALTER TABLE vip_jugadores ADD COLUMN nivel_forzado INTEGER CHECK (nivel_forzado IS NULL OR nivel_forzado BETWEEN 1 AND 10);
