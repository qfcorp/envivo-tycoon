-- "Tus primeros 7 días": ruta de novato (server/src/RutaNovato.php, contrato en server/API.md "Tus primeros 7 días").
-- Seguro de correr otra vez.
-- novato_jugadores: el día en que empezó la ruta de esa cuenta (si no hay fila, cuenta jugadores.creado). La fila la crea
--   POST /api/novato/empezar cuando la partida empezó antes que la cuenta (como mucho 3 días antes de crearla).
-- novato_reclamos: un premio por cuenta (d1..d7 y final). UNIQUE = una sola vez aunque lleguen dos peticiones a la vez.
--   ya_local = 1 cuando el juego ya había dado la parte de la partida sin cuenta (el servidor solo pone los créditos).
CREATE TABLE IF NOT EXISTS novato_jugadores (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    inicio INTEGER NOT NULL,
    creado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS novato_reclamos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    clave TEXT NOT NULL,
    creditos INTEGER NOT NULL DEFAULT 0,
    ya_local INTEGER NOT NULL DEFAULT 0,
    dia_real INTEGER NOT NULL DEFAULT 1,
    creado INTEGER NOT NULL,
    UNIQUE (jugador_id, clave)
);
CREATE INDEX IF NOT EXISTS novato_reclamos_clave ON novato_reclamos (clave, creado);
