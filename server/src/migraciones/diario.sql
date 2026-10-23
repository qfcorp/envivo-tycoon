-- Premio diario (calendario de 7 días) — server/src/Diario.php, contrato en server/INTEGRAR_DIARIO.md. Seguro de correr otra vez.
-- Día = fecha de America/Guayaquil (texto AAAA-MM-DD) según el reloj del SERVIDOR (nunca la fecha del celular).
-- Faltar un día no reinicia nada: el avance se pausa y sigue en el mismo día del ciclo.

-- Avance de cada jugador: cuántos días del ciclo actual ya reclamó (0..6), ciclo, total y último día reclamado.
CREATE TABLE IF NOT EXISTS diario_jugador (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    paso INTEGER NOT NULL DEFAULT 0 CHECK (paso BETWEEN 0 AND 6),
    ciclo INTEGER NOT NULL DEFAULT 1,
    total INTEGER NOT NULL DEFAULT 0,
    racha INTEGER NOT NULL DEFAULT 0,          -- días seguidos (solo informativo: faltar no quita premios)
    ultimo_dia TEXT,
    creado INTEGER NOT NULL,
    actualizado INTEGER NOT NULL
);

-- Un reclamo por jugador y día (UNIQUE: dos peticiones a la vez nunca cobran dos veces).
CREATE TABLE IF NOT EXISTS diario_reclamos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    dia TEXT NOT NULL,
    ciclo INTEGER NOT NULL,
    paso INTEGER NOT NULL CHECK (paso BETWEEN 1 AND 7),
    dinero INTEGER NOT NULL DEFAULT 0,
    creditos INTEGER NOT NULL DEFAULT 0,
    vip INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    UNIQUE (jugador_id, dia)
);
CREATE INDEX IF NOT EXISTS diario_reclamos_dia ON diario_reclamos (dia);
