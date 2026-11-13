-- Mejoras del Pase de Temporada (server/src/Pase.php, server/INTEGRAR_PASE.md "Mejoras"). Seguro de correr otra vez.

-- Mini Pase Semanal (producto pase_semanal): una fila por compra aprobada. Cubre los niveles (nivel_desde, nivel_desde + 8]
-- que el jugador alcance antes de "hasta" (fin de la semana del pase).
CREATE TABLE IF NOT EXISTS pase_mini (
    compra_id INTEGER PRIMARY KEY,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    temporada INTEGER NOT NULL,
    semana INTEGER NOT NULL,
    nivel_desde INTEGER NOT NULL,
    desde INTEGER NOT NULL,
    hasta INTEGER NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('aplicada', 'duplicada', 'revertida')),
    creado INTEGER NOT NULL,
    revertida_en INTEGER
);
CREATE INDEX IF NOT EXISTS pase_mini_jugador ON pase_mini (jugador_id, temporada, semana, estado);

-- Premios premium reclamados gracias a un Mini Pase (para revertirlos si se revierte esa compra).
CREATE TABLE IF NOT EXISTS pase_mini_usos (
    temporada INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    nivel INTEGER NOT NULL,
    compra_id INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (temporada, jugador_id, nivel)
);

-- Banco de premios después del nivel 40: un cofre fijo cada 2.000 XP (n = 1, 2, ...). premium = se abrió con el premium.
CREATE TABLE IF NOT EXISTS pase_banco (
    temporada INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    n INTEGER NOT NULL,
    premium INTEGER NOT NULL DEFAULT 0,
    revisar INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    PRIMARY KEY (temporada, jugador_id, n)
);
