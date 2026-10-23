-- Sede oficial (server/src/SedeOficial.php): la copia del servidor de la sede (js/sede.js) que cuenta en competencia.
-- Se aplica sola (Db::migrarModulos) y se puede correr otra vez sin cambiar nada.
-- Tiempos en segundos Unix (UTC); el "día" de la entrega diaria es la fecha de America/Guayaquil (texto AAAA-MM-DD).

CREATE TABLE IF NOT EXISTS sede_oficial (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    nivel INTEGER NOT NULL DEFAULT 1 CHECK (nivel BETWEEN 1 AND 30),
    cables INTEGER NOT NULL DEFAULT 0 CHECK (cables >= 0),
    placas INTEGER NOT NULL DEFAULT 0 CHECK (placas >= 0),
    paneles INTEGER NOT NULL DEFAULT 0 CHECK (paneles >= 0),
    credenciales INTEGER NOT NULL DEFAULT 0 CHECK (credenciales >= 0),
    planos INTEGER NOT NULL DEFAULT 0 CHECK (planos >= 0),
    chips INTEGER NOT NULL DEFAULT 0 CHECK (chips >= 0),
    acelera_min INTEGER NOT NULL DEFAULT 0 CHECK (acelera_min >= 0),   -- aceleradores (minutos) de packs y regalos
    ultimo_cofre TEXT,                                                -- día (Guayaquil) de la última entrega diaria
    migrado INTEGER NOT NULL DEFAULT 0,                               -- 1 = ya se trajo (o se descartó) la sede local
    migrado_en INTEGER,
    migrado_json TEXT,                                                -- lo que pidió y lo que se aceptó (para soporte)
    creado INTEGER NOT NULL,
    actualizado INTEGER NOT NULL
);

-- Mejoras chicas terminadas ("<nivel>.<edificio>" del juego)
CREATE TABLE IF NOT EXISTS sede_mejoras (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    nivel INTEGER NOT NULL,
    ed TEXT NOT NULL,
    terminado INTEGER NOT NULL,
    origen TEXT NOT NULL DEFAULT 'obra',                              -- obra | migracion
    PRIMARY KEY (jugador_id, nivel, ed)
);

-- Obras con reloj real: fin = cuándo termina (se acorta con ayudas, aceleradores o créditos)
CREATE TABLE IF NOT EXISTS sede_obras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('mejora', 'nivel')),
    ed TEXT NOT NULL,
    nivel INTEGER NOT NULL,
    inicio INTEGER NOT NULL,
    duracion INTEGER NOT NULL,
    fin INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'terminada')),
    ayudas INTEGER NOT NULL DEFAULT 0,
    creditos INTEGER NOT NULL DEFAULT 0,                              -- créditos gastados en acelerarla
    acelerada_min INTEGER NOT NULL DEFAULT 0,                         -- minutos de aceleradores usados
    terminada INTEGER
);
CREATE INDEX IF NOT EXISTS sede_obras_activas ON sede_obras (jugador_id, estado, fin);

-- Ayudas de la asociación (una por ayudante y obra)
CREATE TABLE IF NOT EXISTS sede_ayudas (
    obra_id INTEGER NOT NULL REFERENCES sede_obras(id) ON DELETE CASCADE,
    ayudante_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    segundos INTEGER NOT NULL,
    premio TEXT,                                                      -- material que recibió el ayudante (o NULL si ya pasó su tope del día)
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (obra_id, ayudante_id)
);
CREATE INDEX IF NOT EXISTS sede_ayudas_dia ON sede_ayudas (ayudante_id, dia);

-- Libro de materiales: cada cambio (material o 'acelera_min'), con motivo y referencia
CREATE TABLE IF NOT EXISTS sede_libro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    material TEXT NOT NULL,
    cambio INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    ref TEXT,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sede_libro_jugador ON sede_libro (jugador_id, motivo, dia);

-- Llaves para no dar dos veces lo mismo: intentos en línea ('intento'), entregas absorbidas ('entrega')
CREATE TABLE IF NOT EXISTS sede_fuentes (
    fuente TEXT NOT NULL,
    ref TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    creado INTEGER NOT NULL,
    PRIMARY KEY (fuente, ref)
);

-- Packs de obra comprados con dinero real (pack_obra_s/m/l): una entrega por compra; revertido si hubo reembolso
CREATE TABLE IF NOT EXISTS sede_packs (
    compra_id INTEGER PRIMARY KEY,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    producto TEXT NOT NULL,
    entregado INTEGER,
    revertido INTEGER
);
