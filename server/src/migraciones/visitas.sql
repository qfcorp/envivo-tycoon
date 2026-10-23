-- Visitas a otras productoras (server/src/Visitas.php, server/INTEGRAR_VISITAS.md). Todo IF NOT EXISTS: se puede aplicar las veces que sea.

-- Privacidad: si otros jugadores pueden visitar tu productora (sin fila = sí, permitido).
CREATE TABLE IF NOT EXISTS visitas_ajustes (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    permitir INTEGER NOT NULL DEFAULT 1 CHECK (permitir IN (0, 1)),
    actualizado INTEGER NOT NULL
);

-- Vitrina pública ya armada (cache): se rehace si la partida en la nube cambió o pasó el tiempo de cache.
-- datos = JSON SOLO con lo público (nunca correo, compras, créditos ni dinero).
CREATE TABLE IF NOT EXISTS visitas_vitrinas (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    partida_act INTEGER NOT NULL DEFAULT 0,      -- partidas.actualizado con el que se armó (0 = sin partida)
    datos TEXT NOT NULL,
    creado INTEGER NOT NULL
);

-- Aplausos: uno por visitante, por productora visitada y por día (hora de Ecuador). premio = 1 si se pagó el premio a cada lado.
CREATE TABLE IF NOT EXISTS visitas_aplausos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitante_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    visitado_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    dia TEXT NOT NULL,                           -- 'YYYY-MM-DD'
    premio_visitante INTEGER NOT NULL DEFAULT 0,
    premio_visitado INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    UNIQUE (visitante_id, visitado_id, dia)
);
CREATE INDEX IF NOT EXISTS visitas_aplausos_visitado ON visitas_aplausos (visitado_id, dia);
CREATE INDEX IF NOT EXISTS visitas_aplausos_visitante ON visitas_aplausos (visitante_id, dia);
