-- Ayudas de la asociación, Investigación (donaciones) y Tienda de fichas (server/src/AyudaAsoc.php, server/INTEGRAR_AYUDA_ASOC.md).
-- Se aplica sola (Db::migrarModulos) y se puede correr otra vez sin cambiar nada. Tiempos en segundos Unix (UTC);
-- "dia" = fecha de America/Guayaquil (AAAA-MM-DD), la misma de SedeOficial::dia().
-- Las ayudas en sí siguen en sede_ayudas / sede_obras (SedeOficial): aquí solo los pedidos, las fichas y lo de la asociación.

-- "Pedir ayuda": una obra de la sede oficial que su dueño mostró a su asociación (una vez por obra)
CREATE TABLE IF NOT EXISTS ayuda_asoc_pedidos (
    obra_id INTEGER PRIMARY KEY REFERENCES sede_obras(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    asociacion_id INTEGER NOT NULL REFERENCES asociaciones(id) ON DELETE CASCADE,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ayuda_asoc_pedidos_asoc ON ayuda_asoc_pedidos (asociacion_id, creado);

-- Fichas de asociación: saldo por jugador (no se pierden al cambiar de asociación) y libro de cada cambio
CREATE TABLE IF NOT EXISTS ayuda_asoc_fichas (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    saldo INTEGER NOT NULL DEFAULT 0 CHECK (saldo >= 0),
    ganadas INTEGER NOT NULL DEFAULT 0,
    actualizado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ayuda_asoc_libro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    cambio INTEGER NOT NULL,
    motivo TEXT NOT NULL CHECK (motivo IN ('ayuda', 'donacion', 'tienda', 'ajuste')),
    ref TEXT,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ayuda_asoc_libro_dia ON ayuda_asoc_libro (jugador_id, motivo, dia);

-- Investigación de cada asociación: nivel y progreso (puntos donados hacia el próximo nivel)
CREATE TABLE IF NOT EXISTS ayuda_asoc_investigacion (
    asociacion_id INTEGER NOT NULL REFERENCES asociaciones(id) ON DELETE CASCADE,
    tech TEXT NOT NULL,
    nivel INTEGER NOT NULL DEFAULT 0 CHECK (nivel >= 0),
    progreso INTEGER NOT NULL DEFAULT 0 CHECK (progreso >= 0),
    actualizado INTEGER NOT NULL,
    PRIMARY KEY (asociacion_id, tech)
);

-- Puntos totales de la asociación (suben su nivel: 1 a 6)
CREATE TABLE IF NOT EXISTS ayuda_asoc_puntos (
    asociacion_id INTEGER PRIMARY KEY REFERENCES asociaciones(id) ON DELETE CASCADE,
    puntos INTEGER NOT NULL DEFAULT 0 CHECK (puntos >= 0),
    actualizado INTEGER NOT NULL
);

-- Cada donación (auditoría y topes del día)
CREATE TABLE IF NOT EXISTS ayuda_asoc_donaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asociacion_id INTEGER NOT NULL REFERENCES asociaciones(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    tech TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('dinero', 'material')),
    material TEXT,
    cantidad INTEGER NOT NULL,
    puntos INTEGER NOT NULL,
    fichas INTEGER NOT NULL,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ayuda_asoc_donaciones_dia ON ayuda_asoc_donaciones (jugador_id, dia, tipo);
CREATE INDEX IF NOT EXISTS ayuda_asoc_donaciones_asoc ON ayuda_asoc_donaciones (asociacion_id, id);

-- Compras en la Tienda de la asociación (con fichas; topes por día)
CREATE TABLE IF NOT EXISTS ayuda_asoc_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    fichas INTEGER NOT NULL,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ayuda_asoc_compras_dia ON ayuda_asoc_compras (jugador_id, item, dia);

-- Insignias cosméticas de la tienda (para mostrarlas en el chat / perfil)
CREATE TABLE IF NOT EXISTS ayuda_asoc_insignias (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    insignia TEXT NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (jugador_id, insignia)
);
