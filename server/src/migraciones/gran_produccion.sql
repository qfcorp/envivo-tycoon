-- Gran Producción de Asociación: evento de equipo semanal (server/src/GranProduccion.php, server/INTEGRAR_GRAN_PRODUCCION.md).
-- Se aplica sola (Db::migrarModulos) y se puede correr otra vez sin cambiar nada. Tiempos en segundos Unix (UTC).
-- El id de cada producción es la fecha (America/Guayaquil) en que empieza: AAAA-MM-DD.

-- Cada Gran Producción (una por semana). estado: en_curso → cerrada (con premios) | cancelada (sin premios); pausada = reloj detenido
CREATE TABLE IF NOT EXISTS gp_producciones (
    id TEXT PRIMARY KEY,
    tema TEXT NOT NULL,
    inicio INTEGER NOT NULL,
    fin INTEGER NOT NULL,                       -- se corre hacia adelante lo que dure una pausa
    horas INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'pausada', 'cancelada', 'cerrada')),
    pausada_en INTEGER,
    pausa_total INTEGER NOT NULL DEFAULT 0,     -- segundos que estuvo en pausa (no cuentan para los turnos)
    push_inicio INTEGER NOT NULL DEFAULT 0,
    push_2h INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    cerrado INTEGER,
    nota TEXT
);
CREATE INDEX IF NOT EXISTS gp_producciones_inicio ON gp_producciones (inicio);

-- Cada asociación en una producción: meta (fija desde que entra, según sus miembros activos) y lo que lleva.
-- Su servidor se lee de asociaciones.servidor_id (así una fusión de servidores no necesita una regla para esta tabla).
CREATE TABLE IF NOT EXISTS gp_asociaciones (
    produccion_id TEXT NOT NULL REFERENCES gp_producciones(id) ON DELETE CASCADE,
    asociacion_id INTEGER NOT NULL REFERENCES asociaciones(id) ON DELETE CASCADE,
    activos INTEGER NOT NULL,
    meta_personal INTEGER NOT NULL,
    meta_equipos INTEGER NOT NULL,
    meta_transmision INTEGER NOT NULL,
    personal INTEGER NOT NULL DEFAULT 0,
    equipos INTEGER NOT NULL DEFAULT 0,
    transmision INTEGER NOT NULL DEFAULT 0,
    progreso INTEGER NOT NULL DEFAULT 0,        -- % (0 a 200), cada frente cuenta hasta el doble de su meta
    alcanzado INTEGER,                          -- cuándo llegó a su progreso actual (desempate de la tabla)
    nivel TEXT,                                 -- al cerrar: bronce | plata | oro | leyenda | null
    puesto INTEGER,                             -- al cerrar: puesto en la tabla de su servidor
    creado INTEGER NOT NULL,
    PRIMARY KEY (produccion_id, asociacion_id)
);
CREATE INDEX IF NOT EXISTS gp_asociaciones_tabla ON gp_asociaciones (produccion_id, progreso DESC, alcanzado);

-- Cada productora en una producción (una sola asociación por producción): lo que aportó y el contador de eventos de su partida
CREATE TABLE IF NOT EXISTS gp_miembros (
    produccion_id TEXT NOT NULL REFERENCES gp_producciones(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    asociacion_id INTEGER NOT NULL,
    personal INTEGER NOT NULL DEFAULT 0,
    equipos INTEGER NOT NULL DEFAULT 0,
    transmision INTEGER NOT NULL DEFAULT 0,
    ultimo_eventos INTEGER,                     -- stats.events de su partida en la nube la última vez que se miró
    actualizado INTEGER NOT NULL,
    PRIMARY KEY (produccion_id, jugador_id)
);
CREATE INDEX IF NOT EXISTS gp_miembros_asoc ON gp_miembros (produccion_id, asociacion_id);

-- Cada aporte (auditoría)
CREATE TABLE IF NOT EXISTS gp_aportes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produccion_id TEXT NOT NULL,
    asociacion_id INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    frente TEXT NOT NULL CHECK (frente IN ('personal', 'equipos', 'transmision')),
    cantidad INTEGER NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gp_aportes_prod ON gp_aportes (produccion_id, asociacion_id, id);

-- Premios entregados (uno por productora y producción: nunca se paga dos veces)
CREATE TABLE IF NOT EXISTS gp_premios (
    produccion_id TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    asociacion_id INTEGER NOT NULL,
    nivel TEXT NOT NULL,
    puesto INTEGER,
    adjuntos_json TEXT NOT NULL,
    buzon_id INTEGER,
    creado INTEGER NOT NULL,
    PRIMARY KEY (produccion_id, jugador_id)
);

-- Avisos del juego en el chat con su texto en los 10 idiomas ({"es": "...", "en": "...", ...}): Chat::mensajeJson muestra el
-- del idioma de quien lee (Accept-Language) y, si falta, la columna texto (español). Lo usa GranProduccion::chatAsoc.
ALTER TABLE chat_mensajes ADD COLUMN textos_json TEXT;
