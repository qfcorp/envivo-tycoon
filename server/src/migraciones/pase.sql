-- Pase de Temporada (server/src/Pase.php, contrato en server/INTEGRAR_PASE.md). Seguro de correr otra vez.
-- Las temporadas NO se guardan: salen de la fecha (28 días desde un lunes, America/Guayaquil).

-- Estado del jugador en cada temporada: premium (y plus), saltos comprados, créditos ya devueltos por el pase.
CREATE TABLE IF NOT EXISTS pase_jugador (
    temporada INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    premium INTEGER NOT NULL DEFAULT 0,
    plus INTEGER NOT NULL DEFAULT 0,
    premium_desde INTEGER,
    saltos INTEGER NOT NULL DEFAULT 0,
    creditos_dados INTEGER NOT NULL DEFAULT 0,
    revisar INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    actualizado INTEGER NOT NULL,
    PRIMARY KEY (temporada, jugador_id)
);

-- Libro de XP: idempotente por (jugador, ref). xp puede ser 0 (tope diario: igual cuenta para las misiones) o negativo
-- (se revirtió la compra del plus).
CREATE TABLE IF NOT EXISTS pase_xp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    temporada INTEGER NOT NULL,
    fuente TEXT NOT NULL,
    ref TEXT NOT NULL,
    xp INTEGER NOT NULL,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (jugador_id, ref)
);
CREATE INDEX IF NOT EXISTS pase_xp_temporada ON pase_xp (jugador_id, temporada, fuente, dia);

-- Premios reclamados (uno por nivel y pista). revisar = 1: se reclamó con un premium o unos niveles que después se revirtieron.
CREATE TABLE IF NOT EXISTS pase_reclamos (
    temporada INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    nivel INTEGER NOT NULL,
    pista TEXT NOT NULL CHECK (pista IN ('gratis', 'premium')),
    tipo TEXT NOT NULL,
    item TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    creditos INTEGER NOT NULL DEFAULT 0,
    entrega_id INTEGER,
    revisar INTEGER NOT NULL DEFAULT 0,
    creditos_devueltos INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    PRIMARY KEY (temporada, jugador_id, nivel, pista)
);

-- Compras del pase (para revertirlas): una fila por compra aprobada.
CREATE TABLE IF NOT EXISTS pase_compras (
    compra_id INTEGER PRIMARY KEY,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    temporada INTEGER NOT NULL,
    producto TEXT NOT NULL,
    plus INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL CHECK (estado IN ('aplicada', 'duplicada', 'revertida')),
    creado INTEGER NOT NULL,
    revertida_en INTEGER
);
CREATE INDEX IF NOT EXISTS pase_compras_jugador ON pase_compras (jugador_id, temporada, estado);
