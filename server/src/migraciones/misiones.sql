-- Misiones del día y de la semana (server/src/Misiones.php, contrato en server/INTEGRAR_MISIONES.md). Seguro de correr otra vez.
-- Un premio (misión o cofre de actividad) por jugador y periodo: "d:AAAA-MM-DD" (día del celular) o "s:AAAA-MM-DD" (lunes).
-- dia = día del servidor en que se reclamó (para el tope diario de créditos); creado = hora exacta del reclamo.
CREATE TABLE IF NOT EXISTS misiones_reclamos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    periodo TEXT NOT NULL,
    clave TEXT NOT NULL,
    creditos INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (jugador_id, periodo, clave)
);
CREATE INDEX IF NOT EXISTS misiones_reclamos_dia ON misiones_reclamos (jugador_id, dia);
CREATE INDEX IF NOT EXISTS misiones_reclamos_creado ON misiones_reclamos (jugador_id, creado);
