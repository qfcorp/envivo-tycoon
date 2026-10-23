-- Tablas del bot de Discord (server/src/Discord.php). Se aplican solas desde Discord::preparar() si falta alguna
-- (todas con CREATE ... IF NOT EXISTS: correr esto otra vez no hace nada ni borra datos).
-- Fechas: segundos Unix, como el resto de la base. Aquí NUNCA se guardan tokens ni claves de Discord.

-- Vínculo jugador <-> usuario de Discord (uno a uno).
CREATE TABLE IF NOT EXISTS discord_vinculos (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    discord_user_id TEXT NOT NULL UNIQUE,      -- id (snowflake) del usuario de Discord
    discord_nombre TEXT,                       -- nombre de usuario de Discord (solo para el panel)
    roles_json TEXT NOT NULL DEFAULT '[]',     -- nombres de los roles que el bot le dejó puestos en la última sincronización
    creado INTEGER NOT NULL,
    sincronizado INTEGER,                      -- última vez que se revisaron sus roles en Discord
    sync_error TEXT                            -- último problema (ej. no_en_servidor, sin_permiso); NULL si salió bien
);
CREATE INDEX IF NOT EXISTS discord_vinculos_sync ON discord_vinculos (sincronizado);

-- Códigos de un solo uso para vincular (el juego los pide con POST /api/discord/codigo). Solo se guarda el sha256.
CREATE TABLE IF NOT EXISTS discord_codigos (
    codigo_hash TEXT PRIMARY KEY,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    creado INTEGER NOT NULL,
    expira INTEGER NOT NULL,
    usado INTEGER                              -- cuándo se usó (NULL = sin usar)
);
CREATE INDEX IF NOT EXISTS discord_codigos_jugador ON discord_codigos (jugador_id);

-- Datos internos del bot (ej. la lista de roles del servidor de Discord: nombre -> id, guardada 1 hora).
CREATE TABLE IF NOT EXISTS discord_ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    actualizado INTEGER NOT NULL
);
