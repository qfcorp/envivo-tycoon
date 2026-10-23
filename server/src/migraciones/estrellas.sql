-- Personal estrella y Pase de Copa (server/src/Estrellas.php, server/INTEGRAR_ESTRELLAS.md). Seguro de correr otra vez.

-- Contratos de personal estrella: cada fila suma N partidos de UNA estrella (por créditos, fichas, pase, VIP o regalo).
-- ref es la llave de idempotencia (la misma compra o entrega nunca crea dos contratos).
CREATE TABLE IF NOT EXISTS estrellas_contratos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    clave TEXT NOT NULL,
    partidos INTEGER NOT NULL CHECK (partidos BETWEEN 1 AND 50),
    origen TEXT NOT NULL CHECK (origen IN ('credito', 'fichas', 'pase', 'vip', 'regalo', 'entrega', 'compra', 'control')),
    ref TEXT NOT NULL UNIQUE,
    creditos INTEGER NOT NULL DEFAULT 0,
    fichas INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    vence INTEGER NOT NULL,
    revocado INTEGER
);
CREATE INDEX IF NOT EXISTS estrellas_contratos_jugador ON estrellas_contratos (jugador_id, clave, vence);

-- Partidos jugados con una estrella (uno por estrella, modo y cruce/duelo): UNIQUE = consumir es idempotente.
CREATE TABLE IF NOT EXISTS estrellas_usos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    contrato_id INTEGER NOT NULL REFERENCES estrellas_contratos(id) ON DELETE CASCADE,
    clave TEXT NOT NULL,
    modo TEXT NOT NULL CHECK (modo IN ('copa', 'duelo')),
    ref TEXT NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (jugador_id, modo, ref, clave)
);
CREATE INDEX IF NOT EXISTS estrellas_usos_contrato ON estrellas_usos (contrato_id);

-- Qué estrella va en el equipo de Copa y en el de Duelos de cada jugador.
CREATE TABLE IF NOT EXISTS estrellas_asignadas (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    modo TEXT NOT NULL CHECK (modo IN ('copa', 'duelo')),
    clave TEXT NOT NULL,
    asignado INTEGER NOT NULL,
    PRIMARY KEY (jugador_id, modo, clave)
);

-- Fichas de estrella (ruta gratis): libro con saldo; ref UNIQUE = ganar/gastar una sola vez por motivo.
CREATE TABLE IF NOT EXISTS estrellas_fichas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    cambio INTEGER NOT NULL,
    saldo INTEGER NOT NULL,
    motivo TEXT NOT NULL CHECK (motivo IN ('ganada', 'gasto', 'ajuste')),
    ref TEXT NOT NULL UNIQUE,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS estrellas_fichas_jugador ON estrellas_fichas (jugador_id, dia);

-- Pase de Copa: +5 intentos de preparación por día durante la copa de UNA semana ('YYYY-Www').
CREATE TABLE IF NOT EXISTS pase_copa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    semana TEXT NOT NULL,
    origen TEXT NOT NULL CHECK (origen IN ('credito', 'dinero', 'regalo', 'control')),
    ref TEXT NOT NULL UNIQUE,
    creditos INTEGER NOT NULL DEFAULT 0,
    compra_id INTEGER,
    creado INTEGER NOT NULL,
    revocado INTEGER
);
CREATE INDEX IF NOT EXISTS pase_copa_jugador ON pase_copa (jugador_id, semana);
