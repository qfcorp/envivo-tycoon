-- VIP 1–10 por apoyo acumulado, regalos de asociación, Mecenas del servidor y ofertas escalonadas
-- (server/MONETIZACION.md, server/INTEGRAR_VIP.md). Todo IF NOT EXISTS: se puede aplicar las veces que sea.
-- Fechas: segundos Unix. Mes: 'YYYY-MM' y día: 'YYYY-MM-DD' (hora de Ecuador).
-- El nivel NO se guarda como verdad: sale de las compras pagadas (compras.estado = 'pagado'); aquí queda el máximo
-- alcanzado (nunca baja, salvo que se revierta una compra) y las preferencias del jugador.

CREATE TABLE IF NOT EXISTS vip_jugadores (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    nivel INTEGER NOT NULL DEFAULT 0 CHECK (nivel BETWEEN 0 AND 10),
    revisado INTEGER NOT NULL DEFAULT 0,          -- cuántas compras revertidas ya se tomaron en cuenta
    anonimo INTEGER NOT NULL DEFAULT 0,           -- regalos de asociación sin su nombre
    ocultar_mecenas INTEGER NOT NULL DEFAULT 0,   -- no sale en el ranking de Mecenas
    subio_en INTEGER,
    actualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vip_jugadores_nivel ON vip_jugadores (nivel);

-- Regalo mensual del nivel VIP: uno por jugador y mes.
CREATE TABLE IF NOT EXISTS vip_mensual (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    mes TEXT NOT NULL,
    nivel INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (jugador_id, mes)
);

-- Cofres de regalo para los miembros de la asociación del comprador ("Regalo de <alias>").
-- Contenido fijo (dinero del juego y repuestos; NUNCA créditos) según el monto de la compra.
CREATE TABLE IF NOT EXISTS vip_regalos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id INTEGER NOT NULL,
    comprador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    receptor_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    asociacion_id INTEGER,
    nivel INTEGER NOT NULL,                       -- 1..5 (tamaño del cofre según el monto)
    contenido_json TEXT NOT NULL,                 -- lista de entregas [{tipo, item, cantidad}]
    de_nombre TEXT,                               -- nombre público del comprador al crearlo (NULL si es anónimo)
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'reclamado', 'cancelado', 'vencido')),
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL,
    vence INTEGER NOT NULL,
    reclamado_en INTEGER,
    UNIQUE (compra_id, receptor_id)
);
CREATE INDEX IF NOT EXISTS vip_regalos_receptor ON vip_regalos (receptor_id, estado, vence);
CREATE INDEX IF NOT EXISTS vip_regalos_dia ON vip_regalos (receptor_id, dia);

-- Ofertas escalonadas de una sola vez que se desbloquean con un hito (subir de nivel VIP, primera Copa, Sede 5/10).
CREATE TABLE IF NOT EXISTS vip_ofertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    clave TEXT NOT NULL,                          -- nivel_s | nivel_m | nivel_l | campeon | sede_5 | sede_10
    producto TEXT NOT NULL,                       -- id del producto del catálogo (Vip::PRODUCTOS_OFERTA)
    hito TEXT NOT NULL,                           -- 'vip:4', 'copa', 'sede:5'... (una oferta por hito)
    tope INTEGER NOT NULL DEFAULT 1,
    compradas INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    vence INTEGER NOT NULL,
    UNIQUE (jugador_id, hito)
);
CREATE INDEX IF NOT EXISTS vip_ofertas_jugador ON vip_ofertas (jugador_id, producto, vence);

-- Compras ya contadas en una oferta (así una compra nunca suma dos veces aunque el gancho llegue repetido).
CREATE TABLE IF NOT EXISTS vip_ofertas_compras (
    compra_id INTEGER PRIMARY KEY,
    oferta_id INTEGER NOT NULL,
    creado INTEGER NOT NULL
);

-- Para el ranking de Mecenas (semana y siempre) por servidor.
CREATE INDEX IF NOT EXISTS compras_vip_pagadas ON compras (estado, pagado_en, jugador_id);
