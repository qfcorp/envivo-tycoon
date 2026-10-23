-- Recuperar la contraseña por correo (server/src/Recuperar.php, server/INTEGRAR_CORREO.md). Seguro de correr otra vez.
-- Se guarda SOLO el sha256 del código del enlace (si alguien copia la base, no puede usar los enlaces).
CREATE TABLE IF NOT EXISTS recuperaciones (
    token_hash TEXT PRIMARY KEY,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    creado INTEGER NOT NULL,
    expira INTEGER NOT NULL,
    usado INTEGER,
    ip TEXT,
    idioma TEXT
);
CREATE INDEX IF NOT EXISTS recuperaciones_jugador ON recuperaciones (jugador_id);
CREATE INDEX IF NOT EXISTS recuperaciones_expira ON recuperaciones (expira);
