-- Impulsos (server/src/Impulsos.php, server/INTEGRAR_MONETIZACION2.md): equipo de obra extra, Fondo de crecimiento y
-- Tarjeta semanal. Se aplica sola (Db::migrarModulos) y se puede correr otra vez sin cambiar nada. Tiempos en segundos Unix.

-- Una fila por compra de equipo_obra_2 / fondo_crecimiento / tarjeta_semanal (entregada una sola vez; revertido = reembolso)
CREATE TABLE IF NOT EXISTS impulsos_compras (
    compra_id INTEGER PRIMARY KEY,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    producto TEXT NOT NULL,
    entregado INTEGER,                                                -- NULL = se revirtió antes de entregarse
    revertido INTEGER
);
CREATE INDEX IF NOT EXISTS impulsos_compras_jugador ON impulsos_compras (jugador_id, producto);

-- Equipo de obra extra por tiempo: alquilado con dinero del juego (origen 'alquiler') o de premio (origen 'premio', ref única)
CREATE TABLE IF NOT EXISTS impulsos_obra_alquiler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    inicio INTEGER NOT NULL,
    fin INTEGER NOT NULL,
    precio INTEGER NOT NULL DEFAULT 0,                                -- dinero del juego que pagó (0 en premios)
    origen TEXT NOT NULL CHECK (origen IN ('alquiler', 'premio')),
    ref TEXT UNIQUE,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS impulsos_obra_alquiler_jugador ON impulsos_obra_alquiler (jugador_id, fin);

-- Premios reclamados del Fondo de crecimiento (uno por hito y compra)
CREATE TABLE IF NOT EXISTS impulsos_fondo (
    compra_id INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    nivel INTEGER NOT NULL,
    creditos INTEGER NOT NULL,
    mat_json TEXT NOT NULL,
    reclamado INTEGER NOT NULL,
    revertido INTEGER,
    PRIMARY KEY (compra_id, nivel)
);

-- Tarjeta semanal: hasta cuándo está activa y un reclamo por día de Guayaquil
CREATE TABLE IF NOT EXISTS impulsos_tarjeta (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    hasta INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS impulsos_tarjeta_reclamos (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    dia TEXT NOT NULL,
    creditos INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (jugador_id, dia)
);
